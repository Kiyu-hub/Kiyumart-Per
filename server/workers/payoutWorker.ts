import { storage } from '../storage';
import { paystackService } from '../paystack';

const POLL_INTERVAL = parseInt(process.env.PAYOUT_WORKER_INTERVAL_MS || '15000', 10); // 15s

let running = false;

export async function runPayoutWorker(io?: any) {
  if (running) return;
  running = true;
  console.log('[PAYOUT-WORKER] Starting payout worker, interval', POLL_INTERVAL);

  async function processBatch() {
    try {
      const payouts = await storage.getPayoutsByStatus('processing');
      if (!payouts || payouts.length === 0) return;

      for (const payout of payouts) {
        try {
          // Fetch store for payout details
          const store = await storage.getStoreByPrimarySeller(payout.sellerId);
          if (!store) {
            await storage.updatePayoutStatus(payout.id, 'failed', 'system');
            continue;
          }

          const secret = (await storage.getPlatformSettings()).paystackSecretKey;
          if (!secret) {
            console.warn('[PAYOUT-WORKER] PAYSTACK secret missing; cannot process payouts');
            continue;
          }

          // Build recipient
          let recipientCode: string | undefined;
          if (store.payoutType === 'bank_account') {
            const recipientRes = await paystackService.createTransferRecipient({
              type: 'nuban',
              name: store.payoutDetails?.accountName || store.name,
              account_number: store.payoutDetails?.accountNumber,
              bank_code: store.payoutDetails?.bankCode,
              currency: 'GHS',
            }, secret);
            recipientCode = recipientRes.data?.recipient_code || recipientRes.data?.transfer_recipient_code || recipientRes.data?.recipient?.recipient_code;
          } else if (store.payoutType === 'mobile_money') {
            const recipientRes = await paystackService.createTransferRecipient({
              type: 'mobile_money',
              name: store.payoutDetails?.fullName || store.name,
              mobile: store.payoutDetails?.mobileNumber,
              provider: store.payoutDetails?.provider,
              currency: 'GHS',
            }, secret);
            recipientCode = recipientRes.data?.recipient_code || recipientRes.data?.transfer_recipient_code || recipientRes.data?.recipient?.recipient_code;
          }

          if (!recipientCode) {
            console.warn('[PAYOUT-WORKER] Could not determine recipient code for payout', payout.id);
            await storage.updatePayoutStatus(payout.id, 'failed', 'system');
            continue;
          }

          // Initiate transfer
          const amountKobo = Math.round(parseFloat(payout.amount) * 100);
          const transferRes = await paystackService.initiateTransfer({ amountKobo, recipient: recipientCode, reason: payout.notes || 'Seller payout' }, secret);
          const transferStatus = transferRes.status;

          if (transferStatus) {
            // Consider success
            await storage.updatePayoutStatus(payout.id, 'completed', 'system');

            // Notify seller
            await storage.createNotification({
              userId: payout.sellerId,
              type: 'payout',
              title: 'Payout Completed',
              message: `A payout of ${payout.amount} has been transferred to your ${store.payoutType === 'mobile_money' ? 'mobile money' : 'bank account'}.`,
            });

            if (io) {
              io.to(payout.sellerId).emit('payout_completed', { payoutId: payout.id, amount: payout.amount });
            }
          } else {
            await storage.updatePayoutStatus(payout.id, 'failed', 'system');
          }
        } catch (err: any) {
          console.error('[PAYOUT-WORKER] Error processing payout', payout.id, err?.message || err);
          try { await storage.updatePayoutStatus(payout.id, 'failed', 'system'); } catch {}
        }
      }
    } catch (e: any) {
      console.error('[PAYOUT-WORKER] Batch error', e?.message || e);
    }
  }

  // Polling loop
  setInterval(async () => {
    await processBatch();
  }, POLL_INTERVAL);
}
