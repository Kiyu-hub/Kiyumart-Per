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
      const orderIds = metadata.orderIds || [];
      // Fetch all orders and pick matching ones (storage does not provide by-ids helper)
      const allOrders = await storage.getAllOrders();
      orders = allOrders.filter((o: any) => orderIds.includes(o.id));

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

      await storage.createNotification({ userId: primaryOrder.buyerId, type: 'order', title: 'Payment Confirmed', message: `Your payment for ${orders.length} order(s) (${orderNumbers}) was successful. Total: ${eventData.currency} ${totalPaid}` });

      await Promise.all(
        orders
          .filter((order: any) => Boolean(order?.sellerId))
          .map(async (order: any) => {
            const deliveryMethod = String(order.deliveryMethod || "").toLowerCase().trim();
            const isPickup = deliveryMethod === "pickup" || deliveryMethod === "store_pickup";
            const sellerMessage = isPickup
              ? `Order #${order.orderNumber} has been paid. Pack it and mark it ready for pickup when it is prepared.`
              : `Order #${order.orderNumber} has been paid. Start packaging and mark it ready when dispatch preparation is complete.`;
            await storage.createNotification({
              userId: order.sellerId,
              type: "order",
              title: "New Paid Order",
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
      // mark failed
      await Promise.all(orders.map((order: any) => storage.updateOrder(order.id, { paymentStatus: 'failed' })));
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
