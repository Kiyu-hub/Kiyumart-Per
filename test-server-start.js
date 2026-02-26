import 'dotenv/config';
console.log('DATABASE_URL:', process.env.DATABASE_URL ? 'Set' : 'Not set');

// Test database connection first
import { db } from './db/index.js';
import { sql } from 'drizzle-orm';

try {
  console.log('Testing database connection...');
  await db.execute(sql`SELECT 1 as test`);
  console.log('✅ Database connection successful');
} catch (error) {
  console.log('❌ Database connection failed:', error.message);
  process.exit(1);
}

// Now try to start the server
console.log('Starting server...');
import('./server/index.js').catch(error => {
  console.error('Server startup failed:', error);
  process.exit(1);
});
