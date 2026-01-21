import fs from 'fs';
import path from 'path';
import { Client } from 'pg';
import dotenv from 'dotenv';

dotenv.config();
const DATABASE_URL = process.env.DATABASE_URL;
if (!DATABASE_URL) {
  console.error('No DATABASE_URL set');
  process.exit(1);
}

async function run() {
  const client = new Client({ connectionString: DATABASE_URL });
  await client.connect();
  try {
    console.log('Adding show_social_links if missing...');
    await client.query("ALTER TABLE platform_settings ADD COLUMN IF NOT EXISTS show_social_links boolean DEFAULT true;");

    const sqlPath = path.resolve(process.cwd(), 'migrations/0003_add_social_toggles.sql');
    if (fs.existsSync(sqlPath)) {
      const sql = fs.readFileSync(sqlPath, 'utf8');
      console.log('Running migrations/0003_add_social_toggles.sql');
      await client.query(sql);
    } else {
      console.log('Migration file not found:', sqlPath);
    }
    console.log('Done');
  } catch (err) {
    console.error('Migration error', err);
    process.exit(1);
  } finally {
    await client.end();
  }
}

run();
