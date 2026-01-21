import { storage } from '../server/storage';

(async () => {
  try {
    const s = await storage.getPlatformSettings();
    console.log('SETTINGS:', s);
  } catch (err: any) {
    console.error('ERROR calling storage.getPlatformSettings:', err?.stack || err);
    process.exit(1);
  }
})();