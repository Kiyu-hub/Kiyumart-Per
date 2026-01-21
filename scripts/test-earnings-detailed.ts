import 'dotenv/config';
import { storage } from '../server/storage';

async function run(){
  const rows = await storage.getPlatformEarningsDetailed({ limit: 10, storeId: '51769735-faa4-46b2-af16-263c406213d5' });
  console.log(JSON.stringify(rows, null, 2));
}
run().catch(e=>{console.error(e);process.exit(1)});