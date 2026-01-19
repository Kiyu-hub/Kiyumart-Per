let register: any = null;
let webhookRetries: any = null;
let webhookProcessed: any = null;
let enabled = false;

async function tryInit() {
  if (enabled) return;
  try {
    // Dynamically import prom-client to avoid hard failure when dependency isn't installed
    // (CI or lightweight environments may omit metrics)
    // eslint-disable-next-line @typescript-eslint/no-var-requires
    const client = await import('prom-client');
    register = new client.Registry();
    client.collectDefaultMetrics({ register });

    webhookRetries = new client.Counter({
      name: 'paystack_webhook_retries_total',
      help: 'Total number of Paystack webhook retries observed',
      labelNames: ['reference'],
    });

    webhookProcessed = new client.Counter({
      name: 'paystack_webhook_processed_total',
      help: 'Total number of Paystack webhook processing attempts',
      labelNames: ['status'],
    });

    register.registerMetric(webhookRetries);
    register.registerMetric(webhookProcessed);

    enabled = true;
  } catch (err) {
    // Metrics not available; proceed without failing the app
    enabled = false;
    // Safe logging
    // eslint-disable-next-line no-console
    console.warn('[METRICS] prom-client not available:', (err as any)?.message ?? String(err));
  }
}

export async function getMetrics() {
  await tryInit();
  if (!enabled || !register) return '# metrics disabled';
  return await register.metrics();
}

export async function incrementWebhookRetries(reference: string, by = 1) {
  try {
    await tryInit();
    if (!enabled || !webhookRetries) return;
    webhookRetries.labels(reference || 'unknown').inc(by);
  } catch (err) {
    console.warn('[METRICS] incrementWebhookRetries failed', (err as any)?.message ?? String(err));
  }
}

export async function incrementWebhookProcessed(status: 'success' | 'failure') {
  try {
    await tryInit();
    if (!enabled || !webhookProcessed) return;
    webhookProcessed.labels(status).inc();
  } catch (err) {
    console.warn('[METRICS] incrementWebhookProcessed failed', (err as any)?.message ?? String(err));
  }
}
