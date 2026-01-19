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
      const updatePromises = orders.map((order: any) => storage.updateOrder(order.id, { paymentStatus: 'completed', status: 'processing' }));
      await Promise.all(updatePromises);

      // Calculate commission for each order (storage helper)
      // Use allSettled so a failure for one order doesn't block others; log failures
      const commissionResults = await Promise.allSettled(orders.map((order: any) => storage.createCommissionWithEarning(order.id)));
      commissionResults.forEach((r, idx) => {
        if (r.status === 'rejected') {
          console.error(`[PAYMENTS] Commission calc failed for order ${orders[idx].id}:`, (r as any).reason?.message || r);
        }
      });

      // Collect commission IDs and mark them processed so sellers don't need to request payouts
      try {
        const commissionIds: string[] = commissionResults
          .filter((r: any) => r.status === 'fulfilled')
          .map((r: any) => (r as any).value?.commission?.id)
          .filter(Boolean);
        if (commissionIds.length > 0) {
          await storage.markCommissionsProcessed(commissionIds);
        }
      } catch (e) {
        console.error('[PAYMENTS] Failed to mark commissions processed:', (e as any)?.message || e);
      }

      // Auto-create payouts for mobile money sellers so they can receive funds
      for (let i = 0; i < commissionResults.length; i++) {
        const res = commissionResults[i] as PromiseSettledResult<any>;
        if (res.status !== 'fulfilled') continue;
        try {
          const commission = res.value.commission;
          const sellerId = commission.sellerId;
          const sellerAmount = commission.sellerAmount; // string like "12.34"

          // Find seller's store to get payout type/details
          const store = await storage.getStoreByPrimarySeller(sellerId);
          if (!store) continue;

          if (store.payoutType === 'mobile_money') {
            // Create a seller payout record for this commission amount
            try {
              const payout = await storage.createSellerPayout({
                sellerId,
                amount: sellerAmount,
                currency: primaryOrder.currency || 'GHS',
                method: 'mobile_money',
                bankDetails: { mobileNumber: store.payoutDetails?.mobileNumber, provider: store.payoutDetails?.provider },
                notes: `Auto payout for order ${commission.orderId}`,
              } as any);

              // Mark payout as processing so admins can track it (actual transfer may be manual or via worker)
              await storage.updatePayoutStatus(payout.id, 'processing', 'system');

              // Notify seller about pending payout
              await storage.createNotification({
                userId: sellerId,
                type: 'payout',
                title: 'Payout Initiated',
                message: `A payout of ${sellerAmount} has been initiated to your mobile money ${store.payoutDetails?.mobileNumber}. It will be processed shortly.`
              });
            } catch (pErr: any) {
              console.error('[PAYOUT] Failed to create auto payout for mobile money seller', pErr?.message || pErr);
            }
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

      // Emit events
      io.to(primaryOrder.buyerId).emit('payment_completed', {
        orderId: primaryOrder.id,
        orderNumber: orderNumbers,
        amount: `${eventData.currency} ${totalPaid}`,
      });

      for (const order of orders) {
        io.to(order.buyerId).emit('order_status_updated', { orderId: order.id, orderNumber: order.orderNumber, status: 'processing', updatedAt: new Date().toISOString() });
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
