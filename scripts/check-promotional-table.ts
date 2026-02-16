import dotenv from 'dotenv';
import { Client } from 'pg';

dotenv.config();

async function run(){
  const client = new Client({ connectionString: process.env.DATABASE_URL });
  await client.connect();
  try{
    const res = await client.query(`SELECT EXISTS (SELECT 1 FROM information_schema.tables WHERE table_name = 'promotional_ads') as exists`);
    console.log('promotional_ads exists:', res.rows[0].exists);
  }catch(e:any){
    console.error('error checking table:', e.message || e);
    process.exit(1);
  } finally{ await client.end(); }
}

run().catch(e=>{ console.error(e); process.exit(1); });