import 'dotenv/config';
import { db } from '../db/index';
import { platformSettings } from '../shared/schema';
import { eq, desc } from 'drizzle-orm';

async function run() {
  const existing = await db.select().from(platformSettings).orderBy(desc(platformSettings.updatedAt)).limit(1);
  if (!existing || existing.length === 0) {
    const [inserted] = await db.insert(platformSettings).values({ primaryStoreId: '669f6d44-aba5-4914-b59a-fe594547378c', isMultiVendor: false, defaultCurrency: 'GHS' }).returning();
    console.log('Inserted platform settings:', inserted);
  } else {
    const [updated] = await db.update(platformSettings).set({ primaryStoreId: '669f6d44-aba5-4914-b59a-fe594547378c', isMultiVendor: false, defaultCurrency: 'GHS' }).where(eq(platformSettings.id, existing[0].id)).returning();
    console.log('Updated platform settings:', updated);
  }
}

run().catch(err => { console.error(err); process.exit(1); });
