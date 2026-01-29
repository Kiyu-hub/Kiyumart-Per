import fs from 'fs';
import { Client } from 'pg';
import dotenv from 'dotenv';

dotenv.config();

const sql = fs.readFileSync('./migrations/0008_create_promotional_ads.sql', 'utf8');

async function run() {
  const databaseUrl = process.env.DATABASE_URL;
  if (!databaseUrl) {
    console.error('DATABASE_URL not set');
    process.exit(1);
  }

  const client = new Client({ connectionString: databaseUrl });
  await client.connect();
  try {
    console.log('Applying promotional migration...');
    await client.query(sql);
    console.log('Migration applied successfully');
  } catch (e: any) {
    console.error('Migration failed:', e.message || e);
    process.exit(1);
  } finally {
    await client.end();
  }
}

run().catch((e) => {
  console.error(e);
  process.exit(1);
});