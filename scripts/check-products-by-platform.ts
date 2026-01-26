import 'dotenv/config';
import { DbStorage } from '../server/storage';

async function run() {
  const storage = new DbStorage();
  const settings = await storage.getPlatformSettings();
  console.log('platform settings: ', { isMultiVendor: settings.isMultiVendor, primaryStoreId: settings.primaryStoreId });
  if (!settings.isMultiVendor && settings.primaryStoreId) {
    const store = await storage.getStore(settings.primaryStoreId);
    console.log('primary store:', store?.id, 'primarySellerId:', store?.primarySellerId);
    const products = await storage.getProducts({ sellerId: store?.primarySellerId || undefined, isActive: true });
    console.log('products count for primary seller:', products.length);
  } else {
    console.log('Platform is multi-vendor or no primaryStore set');
  }
}

run().catch(err => { console.error(err); process.exit(1); });
