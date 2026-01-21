import { Client } from 'pg';
import dotenv from 'dotenv';
dotenv.config();

async function run(){
  const client = new Client({ connectionString: process.env.DATABASE_URL });
  await client.connect();
  const res = await client.query(`SELECT column_name, data_type FROM information_schema.columns WHERE table_name = 'platform_settings';`);
  console.log(res.rows);
  await client.end();
}

run().catch(err => { console.error(err); process.exit(1); });