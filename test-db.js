import 'dotenv/config';
import { db } from './db/index.ts';
import { sql } from 'drizzle-orm';

console.log('Testing database connection...');
console.log('DATABASE_URL:', process.env.DATABASE_URL ? 'Set' : 'Not set');

try {
  const result = await db.execute(sql`SELECT 1 as test`);
  console.log('✅ Database connection successful');
  console.log('Result:', result);
} catch (error) {
  console.log('❌ Database connection failed:', error.message);
}
