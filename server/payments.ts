export async function notifySellerSettlementSuccess(
  storage: any,
  io: any,
  {
    sellerId,
    payoutId,
    sellerAmount,
    orderId,
    orderNumber,
    destinationLabel,
  }: {
    sellerId: string;
    payoutId: string;
    sellerAmount: string;
    orderId: string;
    orderNumber?: string;
    destinationLabel: string;
  },
) {
  await storage.createNotification({
    userId: sellerId,
    type: "payout",
    title: "Seller Settlement Sent",
    message: `A settlement of ${sellerAmount} has been sent to your ${destinationLabel} for order #${orderNumber || orderId}.`,
    metadata: {
      payoutId,
      orderId,
      orderNumber,
    },
  });

  const admins = await storage.getUsersByRole("admin");
  const superAdmins = await storage.getUsersByRole("super_admin");
  await Promise.all(
    [...admins, ...superAdmins].map((admin: any) =>
      storage.createNotification({
        userId: admin.id,
        type: "payout",
        title: "Seller Settlement Sent",
        message: `Seller settlement of ${sellerAmount} was sent for order #${orderNumber || orderId}.`,
        metadata: {
          payoutId,
          orderId,
          orderNumber,
          sellerId,
        },
      })
    )
  );

  if (io) {
    io.to(sellerId).emit("payout_completed", { payoutId, amount: sellerAmount, orderId, orderNumber });
  }
}

export async function processPaystackChargeSuccess(eventData: any, storage: any, io: any) {
  // eventData is expected to be Paystack `data` payload (data.data in webhook)
  try {
    const reference = eventData.reference;
    const metadata = eventData.metadata || {};

    // Idempotency: if transaction already exists and completed, do nothing
    const existingTransaction = await storage.getTransactionByReference(reference);
    if (existingTransaction && existingTransaction.status === 'completed') {
      return { message: 'Transaction already processed', reference };
    }

    const isMultiVendor = !!metadata.isMultiVendor || (Array.isArray(metadata.orderIds) && metadata.orderIds.length > 0);

    let orders: any[] = [];

    if (isMultiVendor) {
      const orderIds: string[] = (metadata.orderIds || []).filter(Boolean);
      if (orderIds.length === 0) throw new Error('No order IDs in multi-vendor webhook metadata');
      // Fetch each order by ID individually to avoid loading the full table
      const fetched = await Promise.all(orderIds.map((id: string) => storage.getOrder(id).catch(() => null)));
      orders = fetched.filter(Boolean);

      if (orders.length === 0) {
        throw new Error('No orders found for multi-vendor webhook');
      }
    } else {
      const orderId = metadata.orderId;
      if (!orderId) throw new Error('Missing orderId in webhook metadata');
      const order = await storage.getOrder(orderId);
      if (!order) throw new Error('Order not found');
      orders = [order];
    }

    const normalizePaymentStatus = (value?: string | null) => String(value || "").toLowerCase().trim();
    const isCompletedPaymentStatus = (value?: string | null) =>
      ["completed", "paid", "success"].includes(normalizePaymentStatus(value));

    if (orders.every((o: any) => isCompletedPaymentStatus(o.paymentStatus))) {
      return { message: 'Order already paid', reference };
    }

    // Calculate primary order reference for transaction record
    const primaryOrder = orders[0];

    const transactionData = {
      orderId: primaryOrder.id,
      userId: metadata.userId || metadata.buyerId,
      amount: (eventData.amount / 100).toString(),
      currency: eventData.currency,
      paymentProvider: 'paystack',
      paymentReference: reference,
      status: eventData.status === 'success' ? 'completed' : 'failed',
      metadata: {
        ...eventData,
        isMultiVendor,
        orderCount: orders.length,
        orderIds: orders.map((o: any) => o.id),
      },
    };

    // Create transaction (storage should handle persistence)
    await storage.createTransaction(transactionData);

    if (eventData.status === 'success') {
      // Update orders atomically: mark completed and processing status
      const updatePromises = orders.map((order: any) => {
        const normalizedStatus = String(order.status || "").toLowerCase().trim();
        const nextStatus = (normalizedStatus === "pending" || normalizedStatus === "created") ? "processing" : order.status;
        return storage.updateOrder(order.id, { paymentStatus: 'completed', status: nextStatus, paymentReference: reference });
      });
      await Promise.all(updatePromises);

      if (typeof storage.clearCart === "function") {
        await storage.clearCart(primaryOrder.buyerId);
      } else if (typeof storage.clearCartThroughCheckoutTime === "function") {
        const checkoutStartedAt = orders.reduce((earliest: Date, order: any) => {
          const createdAt = order?.createdAt ? new Date(order.createdAt) : earliest;
          return createdAt < earliest ? createdAt : earliest;
        }, new Date());
        await storage.clearCartThroughCheckoutTime(primaryOrder.buyerId, checkoutStartedAt);
      }

      // Calculate commission for each order (storage helper)
      // Use allSettled so a failure for one order doesn't block others; log failures
      const commissionResults = await Promise.allSettled(orders.map((order: any) => storage.createCommissionWithEarning(order.id)));
      commissionResults.forEach((r, idx) => {
        if (r.status === 'rejected') {
          console.error(`[PAYMENTS] Commission calc failed for order ${orders[idx].id}:`, (r as any).reason?.message || r);
        }
      });

      // Record automatic seller settlement after the split for every successful seller order.
      for (let i = 0; i < commissionResults.length; i++) {
        const res = commissionResults[i] as PromiseSettledResult<any>;
        if (res.status !== 'fulfilled') continue;
        try {
          const commission = res.value.commission;
          const sellerId = commission.sellerId;
          const sellerAmount = commission.sellerAmount; // string like "12.34"
          const order = orders[i];

          const payout = await storage.ensureAutomaticSellerPayoutForCommission(commission.id);
          const store = await storage.getStoreByPrimarySeller(sellerId);
          if (!payout) continue;

          const destinationLabel = store?.payoutType === 'mobile_money'
            ? `mobile money ${store?.payoutDetails?.mobileNumber || ''}`.trim()
            : store?.payoutDetails?.accountNumber
              ? `bank account ${store.payoutDetails.accountNumber}`
              : 'configured payout account';

          if (String(payout.status || "").toLowerCase() === "completed") {
            await notifySellerSettlementSuccess(storage, io, {
              sellerId,
              payoutId: payout.id,
              sellerAmount,
              orderId: order?.id || commission.orderId,
              orderNumber: order?.orderNumber,
              destinationLabel,
            });
          }
        } catch (e) {
          console.error('[PAYOUT] Error handling commission payout:', (e as any)?.message || e);
        }
      }

      // Notifications
      const buyer = await storage.getUser(primaryOrder.buyerId);
      const orderNumbers = orders.map((o: any) => `#${o.orderNumber}`).join(', ');
      const totalPaid = (eventData.amount / 100).toFixed(2);

      await storage.createNotification({
        userId: primaryOrder.buyerId,
        type: 'order',
        title: 'New Order Placed',
        message:
          orders.length === 1
            ? `Your order ${orderNumbers} has been placed successfully. Payment confirmed: ${eventData.currency} ${totalPaid}.`
            : `Your orders ${orderNumbers} have been placed successfully. Payment confirmed: ${eventData.currency} ${totalPaid}.`,
        metadata: {
          orderIds: orders.map((o: any) => o.id),
          orderNumbers: orders.map((o: any) => o.orderNumber),
          link: "/orders",
          paymentStatus: "completed",
        } as any,
      });

      await Promise.all(
        orders
          .filter((order: any) => Boolean(order?.sellerId))
          .map(async (order: any) => {
            const deliveryMethod = String(order.deliveryMethod || "").toLowerCase().trim();
            const isPickup = deliveryMethod === "pickup" || deliveryMethod === "store_pickup";
            const isExternalDelivery = order.externalDeliveryByBus === true
              || ["bus", "third_party"].includes(String(order.externalDeliveryType || "").toLowerCase().trim());
            const externalLabel = (order.externalDeliveryByBus === true
              || String(order.externalDeliveryType || "").toLowerCase().trim() === "bus")
              ? "VIP Bus Delivery"
              : "Third-Party Delivery";
            const sellerMessage = isPickup
              ? `A new order #${order.orderNumber} has been placed and paid. Package it and mark it ready for pickup when it is prepared.`
              : isExternalDelivery
                ? `A new order #${order.orderNumber} has been placed and paid. Package and mark it ready — admin will arrange ${externalLabel}.`
                : `A new order #${order.orderNumber} has been placed and paid. Start packaging and mark it ready when dispatch preparation is complete.`;
            await storage.createNotification({
              userId: order.sellerId,
              type: "order",
              title: "New Order Placed",
              message: sellerMessage,
              metadata: {
                orderId: order.id,
                orderNumber: order.orderNumber,
                link: "/seller/orders",
                paymentStatus: "completed",
              },
            });
          })
      );

      const admins = await storage.getUsersByRole("admin");
      const superAdmins = await storage.getUsersByRole("super_admin");
      await Promise.all(
        [...admins, ...superAdmins].map((admin: any) =>
          storage.createNotification({
            userId: admin.id,
            type: "order",
            title: "New Paid Order",
            message: `Payment confirmed for ${orders.length} order(s): ${orderNumbers}. Total: ${eventData.currency} ${totalPaid}.`,
            metadata: {
              reference,
              orderIds: orders.map((o: any) => o.id),
              orderNumbers,
              link: "/admin/orders",
            },
          })
        )
      );

      // Notify pickup agents whose station matches any pickup order in this payment
      const pickupOrders = orders.filter((o: any) =>
        String(o.deliveryMethod || "").toLowerCase().trim() === "pickup" && o.deliveryZoneId
      );
      if (pickupOrders.length > 0) {
        try {
          const pickupAgents = await storage.getUsersByRole("pickup_agent");
          for (const order of pickupOrders) {
            const assignedAgents = pickupAgents.filter(
              (a: any) => a.isActive !== false && String(a.deliveryZoneId || "").trim() === String(order.deliveryZoneId).trim()
            );
            await Promise.all(
              assignedAgents.map((agent: any) =>
                storage.createNotification({
                  userId: agent.id,
                  type: "order",
                  title: "New Pickup Order",
                  message: `Order #${order.orderNumber} has been paid and assigned to your pickup station. The seller will prepare it for collection.`,
                  metadata: {
                    orderId: order.id,
                    orderNumber: order.orderNumber,
                    link: "/pickup-agent/verify",
                  } as any,
                })
              )
            );
            assignedAgents.forEach((agent: any) => {
              io.to(agent.id).emit("notification", {
                title: "New Pickup Order",
                message: `Order #${order.orderNumber} is incoming to your station.`,
                type: "default",
              });
            });
          }
        } catch {
          // non-critical
        }
      }

      // Transactional email — payment confirmed (non-blocking, best-effort)
      try {
        const { sendEmail } = await import('./email');
        const platformSettings = await storage.getPlatformSettings().catch(() => null);
        const platformName = platformSettings?.platformName || 'KiyuMart';
        const frontendUrl = process.env.FRONTEND_URL || '';

        if (buyer?.email) {
          const orderList = orders.map((o: any) => `• Order #${o.orderNumber}`).join('\n');
          const subject = `${platformName}: Payment confirmed — ${orderNumbers}`;
          const text = [
            `Hi ${buyer.name || 'there'},`,
            '',
            `Payment of ${eventData.currency} ${totalPaid} has been confirmed for:`,
            orderList,
            '',
            'Your seller(s) have been notified and will begin preparing your order(s).',
            `Track your orders: ${frontendUrl}/orders`,
            '',
            `— ${platformName}`,
          ].join('\n');
          const html = `
            <div style="font-family:Arial,sans-serif;color:#0f172a;line-height:1.6;max-width:560px;">
              <h2 style="color:#10b981;">Payment Confirmed ✓</h2>
              <p>Hi ${buyer.name || 'there'},</p>
              <p>Payment of <strong>${eventData.currency} ${totalPaid}</strong> has been confirmed for:</p>
              <ul>${orders.map((o: any) => `<li>Order <strong>#${o.orderNumber}</strong></li>`).join('')}</ul>
              <p>Your seller(s) have been notified and will begin preparing your order(s).</p>
              <p style="margin:24px 0;">
                <a href="${frontendUrl}/orders" style="background:#10b981;color:#fff;text-decoration:none;padding:12px 18px;border-radius:8px;display:inline-block;">Track Your Orders</a>
              </p>
              <p style="font-size:13px;color:#64748b;">— ${platformName}</p>
            </div>`.trim();
          await sendEmail({ to: buyer.email, subject, text, html });
        }

        // Email to each seller
        for (const order of orders) {
          try {
            const seller = await storage.getUser(order.sellerId);
            if (!seller?.email) continue;
            const subject = `${platformName}: New paid order #${order.orderNumber}`;
            const text = [
              `Hi ${seller.name || 'there'},`,
              '',
              `A new order #${order.orderNumber} has been placed and payment confirmed.`,
              'Please prepare the order and mark it ready for dispatch.',
              `View orders: ${frontendUrl}/seller/orders`,
              '',
              `— ${platformName}`,
            ].join('\n');
            const html = `
              <div style="font-family:Arial,sans-serif;color:#0f172a;line-height:1.6;max-width:560px;">
                <h2>New Paid Order #${order.orderNumber}</h2>
                <p>Hi ${seller.name || 'there'},</p>
                <p>A new order has been placed and payment confirmed. Please prepare and mark it ready for dispatch.</p>
                <p style="margin:24px 0;">
                  <a href="${frontendUrl}/seller/orders" style="background:#10b981;color:#fff;text-decoration:none;padding:12px 18px;border-radius:8px;display:inline-block;">View Orders</a>
                </p>
                <p style="font-size:13px;color:#64748b;">— ${platformName}</p>
              </div>`.trim();
            await sendEmail({ to: seller.email, subject, text, html });
          } catch {
            // non-critical
          }
        }
      } catch {
        // email is best-effort — never block order flow
      }

      // Emit events
      io.to(primaryOrder.buyerId).emit('payment_completed', {
        orderId: primaryOrder.id,
        orderNumber: orderNumbers,
        amount: `${eventData.currency} ${totalPaid}`,
      });

      for (const order of orders) {
        const payload = { orderId: order.id, orderNumber: order.orderNumber, status: 'processing', updatedAt: new Date().toISOString() };
        const recipients = new Set<string>();
        if (order.buyerId) recipients.add(order.buyerId);
        if (order.sellerId) recipients.add(order.sellerId);
        if (order.riderId) recipients.add(order.riderId);
        recipients.forEach((id) => io.to(id).emit('order_status_updated', payload));

        const admins = await storage.getUsersByRole("admin");
        const superAdmins = await storage.getUsersByRole("super_admin");
        [...admins, ...superAdmins].forEach((admin) => {
          io.to(admin.id).emit("order_status_updated", payload);
          io.to(admin.id).emit("admin_order_status_updated", payload);
        });
      }
    } else {
      if (typeof storage.resolveBuyerUnpaidOrders === "function") {
        await storage.resolveBuyerUnpaidOrders(primaryOrder.buyerId, {
          orderIds: orders.map((order: any) => order.id),
          force: true,
        });
      } else {
        await Promise.all(orders.map((order: any) => storage.updateOrder(order.id, { paymentStatus: 'failed' })));
      }
      await storage.createNotification({ userId: primaryOrder.buyerId, type: 'order', title: 'Payment Failed', message: `Payment for ${orders.length} order(s) failed. Please try again.` });
      io.to(primaryOrder.buyerId).emit('payment_failed', { orderId: primaryOrder.id, orderNumber: orders.map(o => o.orderNumber).join(', '), reason: eventData.gateway_response || 'Payment failed' });
    }

    return { success: true };
  } catch (err: any) {
    console.error('[PAYMENTS] processPaystackChargeSuccess error:', err?.message || err);
    throw err;
  }
}

export default processPaystackChargeSuccess;
