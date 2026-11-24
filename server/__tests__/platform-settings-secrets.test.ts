// Guards against platform secrets leaking through the settings endpoints,
// which are readable without signing in, and checks that saving the admin
// form with masked values keeps the stored secrets.
process.env.SESSION_SECRET = process.env.SESSION_SECRET || 'testsecret';

import express from 'express';
import cookieParser from 'cookie-parser';
import { registerRoutes } from '../routes';
import * as storageModule from '../storage';
import { generateToken } from '../auth';

const SECRETS = {
  paystackSecretKey: 'sk_test_SECRET_paystack_123',
  cloudinaryApiSecret: 'SECRET_cloudinary_456',
  smtpPass: 'SECRET smtp app pass',
  sentryAuthToken: 'SECRET_sentry_token_789',
  googleCredentialsJson: '{"private_key":"SECRET_google"}',
  renderDeployHookUrl: 'https://api.render.com/deploy/SECRET_hook',
};

async function run() {
  let stored: any = { id: 'ps1', isMultiVendor: true, platformName: 'KiyuMart', paystackPublicKey: 'pk_test_public', ...SECRETS };
  let lastUpdate: any = null;
  storageModule.storage.getPlatformSettings = async () => ({ ...stored } as any);
  storageModule.storage.updatePlatformSettings = async (data: any) => { lastUpdate = { ...data }; stored = { ...stored, ...data }; return { ...stored } as any; };
  storageModule.storage.getUser = async (id: string) => ({ id, email: `${id}@example.com`, name: 'Admin', role: 'super_admin', isActive: true, isApproved: true } as any);

  const app = express();
  app.use(express.json());
  app.use(cookieParser());
  const server = await registerRoutes(app);
  await new Promise<void>((resolve) => server.listen(0, resolve));
  const port = (server.address() as any).port;
  const base = `http://localhost:${port}`;

  const leaks = (body: string) => Object.values(SECRETS).filter((v) => body.includes(v) || body.includes(JSON.stringify(v).slice(1, -1)));

  for (const path of ['/api/platform-settings', '/api/settings', '/api/public/platform-settings']) {
    const res = await fetch(base + path);
    const text = await res.text();
    const found = leaks(text);
    if (found.length) throw new Error(`${path} leaked: ${found.join(', ')}`);
    if (res.status !== 200) throw new Error(`${path} returned ${res.status}`);
  }

  // Admin saves the form unchanged (secret fields still hold the masks).
  const token = generateToken({ id: 'admin1', email: 'admin1@example.com', role: 'super_admin' });
  const current = await (await fetch(base + '/api/settings')).json();
  const patch = await fetch(base + '/api/settings', {
    method: 'PATCH',
    headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${token}` },
    body: JSON.stringify({
      smtpPass: current.smtpPass,
      sentryAuthToken: current.sentryAuthToken,
      googleCredentialsJson: current.googleCredentialsJson,
      renderDeployHookUrl: current.renderDeployHookUrl,
      platformName: 'KiyuMart',
    }),
  });
  const patchText = await patch.text();
  if (patch.status !== 200) throw new Error(`PATCH /api/settings returned ${patch.status}: ${patchText.slice(0, 200)}`);
  const patchLeaks = leaks(patchText);
  if (patchLeaks.length) throw new Error(`PATCH response leaked: ${patchLeaks.join(', ')}`);
  for (const key of ['smtpPass', 'sentryAuthToken', 'googleCredentialsJson', 'renderDeployHookUrl'] as const) {
    if (stored[key] !== SECRETS[key]) throw new Error(`Saving the masked form overwrote ${key} (now ${JSON.stringify(lastUpdate?.[key])})`);
  }

  console.log('✅ platform-settings-secrets.test passed');
  server.close(() => process.exit(0));
}

run().catch((err) => { console.error('❌ platform-settings-secrets.test failed', err); process.exit(1); });
