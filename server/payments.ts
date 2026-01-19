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
      const commissionPromises = orders.map((order: any) => storage.createCommissionWithEarning(order.id));
      await Promise.allSettled(commissionPromises);

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
