import { storage } from '../storage';
import { paystackService } from '../paystack';
import { notifySellerSettlementSuccess } from '../payments';

const POLL_INTERVAL = parseInt(process.env.PAYOUT_WORKER_INTERVAL_MS || '15000', 10); // 15s

let running = false;
let batchRunning = false;
let intervalHandle: NodeJS.Timeout | null = null;

export async function runPayoutWorker(io?: any) {
  if (running) return;
  running = true;
  console.log('[PAYOUT-WORKER] Starting payout worker, interval', POLL_INTERVAL);

  async function processBatch() {
    if (batchRunning) {
      console.warn('[PAYOUT-WORKER] Previous batch is still running; skipping overlap tick');
      return;
    }

    batchRunning = true;
    try {
      const payouts = await storage.getPayoutsByStatus('processing');
      if (!payouts || payouts.length === 0) return;

      for (const payout of payouts) {
        try {
          const payoutBankDetails = ((payout as any).bankDetails || {}) as Record<string, any>;
          const settlementMode = String(payoutBankDetails.settlementMode || '').toLowerCase().trim();

          if (settlementMode === 'split') {
            const completedPayout = await storage.updatePayoutStatus(payout.id, 'completed', 'system');
            if (completedPayout) {
              const splitStore = await storage.getStoreByPrimarySeller(payout.sellerId);
              const destinationLabel = splitStore?.payoutDetails?.accountNumber
                ? `bank account ${splitStore.payoutDetails.accountNumber}`
                : 'configured payout account';
              await notifySellerSettlementSuccess(storage, io, {
                sellerId: payout.sellerId,
                payoutId: payout.id,
                sellerAmount: String(payout.amount),
                orderId: 'seller-payout',
                destinationLabel,
              });
            }
            continue;
          }

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

          const transferReference = String(payoutBankDetails.transferReference || payout.reference || '').trim();
          if (transferReference) {
            try {
              const verification = await paystackService.verifyTransfer(transferReference, secret);
              const verifiedStatus = String(verification?.data?.status || '').toLowerCase().trim();

              if (verifiedStatus) {
                await storage.updateSellerPayoutDetails(payout.id, {
                  transferReference,
                  transferCode: verification?.data?.transfer_code || payoutBankDetails.transferCode,
                  transferStatus: verifiedStatus,
                  recipientCode: verification?.data?.recipient || payoutBankDetails.recipientCode,
                });

                if (['success', 'successful', 'completed'].includes(verifiedStatus)) {
                  await storage.updatePayoutStatus(payout.id, 'completed', 'system');

                  const destinationLabel = store.payoutType === 'mobile_money'
                    ? `mobile money ${store.payoutDetails?.mobileNumber || ''}`.trim()
                    : store.payoutDetails?.accountNumber
                      ? `bank account ${store.payoutDetails.accountNumber}`
                      : 'configured payout account';
                  await notifySellerSettlementSuccess(storage, io, {
                    sellerId: payout.sellerId,
                    payoutId: payout.id,
                    sellerAmount: String(payout.amount),
                    orderId: 'seller-payout',
                    destinationLabel,
                  });
                  continue;
                }

                if (['failed', 'reversed', 'abandoned', 'rejected', 'cancelled'].includes(verifiedStatus)) {
                  await storage.updatePayoutStatus(payout.id, 'failed', 'system');
                  continue;
                }

                // The transfer already exists and is still processing. Do not initiate another one.
                continue;
              }
            } catch (verifyErr: any) {
              if (verifyErr?.code !== 'TRANSFER_NOT_FOUND') {
                throw verifyErr;
              }
            }
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
          const transferRes = await paystackService.initiateTransfer({
            amountKobo,
            recipient: recipientCode,
            reason: payout.notes || 'Seller payout',
            reference: transferReference || payout.reference,
          }, secret);
          const transferStatus = String(transferRes?.data?.status || '').toLowerCase().trim();

          await storage.updateSellerPayoutDetails(payout.id, {
            transferReference: transferReference || payout.reference,
            transferCode: transferRes?.data?.transfer_code,
            transferStatus: transferStatus || 'requested',
            recipientCode,
          });

          if (['success', 'successful', 'completed'].includes(transferStatus)) {
            await storage.updatePayoutStatus(payout.id, 'completed', 'system');

            const destinationLabel = store.payoutType === 'mobile_money'
              ? `mobile money ${store.payoutDetails?.mobileNumber || ''}`.trim()
              : store.payoutDetails?.accountNumber
                ? `bank account ${store.payoutDetails.accountNumber}`
                : 'configured payout account';
            await notifySellerSettlementSuccess(storage, io, {
              sellerId: payout.sellerId,
              payoutId: payout.id,
              sellerAmount: String(payout.amount),
              orderId: 'seller-payout',
              destinationLabel,
            });
          } else if (['failed', 'reversed', 'abandoned', 'rejected', 'cancelled'].includes(transferStatus)) {
            await storage.updatePayoutStatus(payout.id, 'failed', 'system');
          }
        } catch (err: any) {
          console.error('[PAYOUT-WORKER] Error processing payout', payout.id, err?.message || err);
          try { await storage.updatePayoutStatus(payout.id, 'failed', 'system'); } catch {}
        }
      }
    } catch (e: any) {
      console.error('[PAYOUT-WORKER] Batch error', e?.message || e);
    } finally {
      batchRunning = false;
    }
  }

  // Polling loop
  if (intervalHandle) return;

  intervalHandle = setInterval(async () => {
    await processBatch();
  }, POLL_INTERVAL);
}
