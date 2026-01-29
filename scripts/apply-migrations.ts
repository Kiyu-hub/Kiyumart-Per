import fs from 'fs';
import path from 'path';
import { Client } from 'pg';
import dotenv from 'dotenv';

dotenv.config();

async function run() {
  const databaseUrl = process.env.DATABASE_URL;
  if (!databaseUrl) {
    console.error('DATABASE_URL not set in environment (.env)');
    process.exit(1);
  }

  const migrationsDir = path.resolve('./migrations');
  const files = fs.readdirSync(migrationsDir).filter(f => f.endsWith('.sql')).sort();
  if (files.length === 0) {
    console.log('No migrations found');
    return;
  }

  const client = new Client({ connectionString: databaseUrl });
  await client.connect();
  try {
    for (const file of files) {
      const sql = fs.readFileSync(path.join(migrationsDir, file), 'utf8');
      console.log('Applying', file);
      try {
        await client.query(sql);
        console.log(file, 'applied');
      } catch (e: any) {
        console.warn(file, 'warn:', e.message || e);
        // continue to next migration
      }
    }
    console.log('All migrations processed');
  } finally {
    await client.end();
  }
}

run().catch(e => { console.error('Migrations failed', e); process.exit(1); });