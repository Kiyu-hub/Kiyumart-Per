import 'dotenv/config';
import { db } from '../db/index';
import { platformSettings } from '@shared/schema';

async function run() {
  const rows = await db.select().from(platformSettings).orderBy(platformSettings.updatedAt);
  console.log('Platform settings rows:', rows.map(r => ({ id: r.id, primaryStoreId: r.primaryStoreId, updatedAt: r.updatedAt })));
}

run().catch(err => { console.error(err); process.exit(1); });
