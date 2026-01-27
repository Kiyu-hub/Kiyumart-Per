import 'dotenv/config';
import { db } from '../db';
import { platformEarnings, commissions, platformSettings } from '../shared/schema';
import { desc, eq } from 'drizzle-orm';

async function run() {
  const rows = await db.select().from(platformEarnings).orderBy(desc(platformEarnings.createdAt)).limit(1);
  console.log('Latest platform earning:', rows[0]);
  if (rows[0]) {
    const comm = await db.select().from(commissions).where(eq(commissions.id, rows[0].commissionId)).limit(1);
    console.log('Commission row:', comm[0]);
  }
  const settings = await db.select().from(platformSettings).limit(1);
  console.log('Current platform settings:', settings[0]);
}

run().catch((e) => { console.error(e); process.exit(1); });