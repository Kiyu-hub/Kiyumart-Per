import 'dotenv/config';
import { db } from '../db';
import { sql } from 'drizzle-orm';
(async () => {
  try {
    const hash = '$2b$10$MvpCzGdkTUQsU7bc8tIPoeXfvT8PgknZ/T/RhXleyw8FYAlmvRpNC';
    const email = 'admin@kiyumart.com';
    await db.execute(sql`UPDATE users SET password = ${hash} WHERE email = ${email}`);
    console.log('updated admin password');
  } catch (e) {
    console.error(e);
    process.exit(1);
  }
})();