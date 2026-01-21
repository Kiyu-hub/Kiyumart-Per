import { db } from "../db/index";
import { sql } from "drizzle-orm";

async function run() {
  try {
    const existing = await db.select().from(sql`users`).where(sql`id = 'system'` as any);
    // We can't use typed query easily here; run raw SQL
    const res = await db.execute(sql`INSERT INTO users (id, email, password, name, role, is_active, is_approved, created_at) VALUES ('system', 'system@local', 'system-password', 'System', 'super_admin', true, true, NOW()) ON CONFLICT (id) DO NOTHING`);
    console.log('Inserted system user');
  } catch (e) {
    console.error('Failed to insert system user', e);
    process.exit(1);
  }
}

run().then(() => process.exit(0));