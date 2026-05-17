import { storage } from '../storage';
import {
  isValidGhanaMobileMoneyNumber,
  normalizeGhanaMobileMoneyNumber,
  normalizeGhanaMobileMoneyProvider,
  paystackService,
  resolveGhanaMobileMoneyBankCode,
} from '../paystack';
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
      // Advance pending payouts to processing/completed for sellers who have since verified their setup
      const pendingPayouts = await storage.getPayoutsByStatus('pending');
      for (const pendingPayout of pendingPayouts || []) {
        try {
          // Normalize commissionIds — DB may return a plain UUID string if the column
          // was stored before the text[] type migration was applied.
          let commissionIds: string[];
          if (Array.isArray(pendingPayout.commissionIds)) {
            commissionIds = pendingPayout.commissionIds.filter(Boolean);
          } else if (typeof pendingPayout.commissionIds === 'string' && pendingPayout.commissionIds) {
            const raw = String(pendingPayout.commissionIds).replace(/[{}"]/g, '').trim();
            commissionIds = raw ? raw.split(',').map(s => s.trim()).filter(Boolean) : [];
          } else {
            commissionIds = [];
          }
          for (const commissionId of commissionIds) {
            await storage.ensureAutomaticSellerPayoutForCommission(commissionId);
          }
        } catch (advanceErr: any) {
          console.warn('[PAYOUT-WORKER] Could not advance pending payout', pendingPayout.id, advanceErr?.message || advanceErr);
        }
      }

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
            const normalizedProvider = normalizeGhanaMobileMoneyProvider(store.payoutDetails?.provider);
            const normalizedMobileNumber = normalizeGhanaMobileMoneyNumber(store.payoutDetails?.mobileNumber);
            const bankCode = resolveGhanaMobileMoneyBankCode(normalizedProvider);

            if (!normalizedProvider || !normalizedMobileNumber || !bankCode || !isValidGhanaMobileMoneyNumber(normalizedMobileNumber, normalizedProvider)) {
              console.warn('[PAYOUT-WORKER] Invalid mobile money setup for payout', payout.id, {
                sellerId: payout.sellerId,
                provider: store.payoutDetails?.provider,
                mobileNumber: store.payoutDetails?.mobileNumber,
              });
              await storage.updatePayoutStatus(payout.id, 'pending', 'system');
              await storage.updateSellerPayoutDetails(payout.id, {
                needsAudit: true,
                setupRequired: true,
                auditReason: 'Payout setup is incomplete or the saved mobile money number does not match the selected provider',
                provider: normalizedProvider,
                mobileNumber: normalizedMobileNumber,
              } as any);
              try {
                await storage.createNotification({
                  userId: payout.sellerId,
                  type: 'payout',
                  title: 'Complete Payout Setup To Receive Funds',
                  message: `We could not transfer your seller settlement because your mobile money setup is incomplete or invalid. Update your payout setup so ${payout.amount} can be transferred.`,
                  metadata: {
                    link: '/seller/payment-setup',
                    payoutId: payout.id,
                    sellerId: payout.sellerId,
                    setupRequired: true,
                    reason: 'invalid_mobile_money_setup',
                  },
                } as any);
              } catch (notifyError: any) {
                console.error('[PAYOUT-WORKER] Could not notify seller about invalid payout setup', payout.id, notifyError?.message || notifyError);
              }
              continue;
            }

            const recipientRes = await paystackService.createTransferRecipient({
              type: 'mobile_money',
              name: store.payoutDetails?.fullName || store.name,
              account_number: normalizedMobileNumber,
              bank_code: bankCode,
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
            reference: transferReference || payout.reference || undefined,
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
