require('dotenv').config();
const { Client } = require('pg');
(async () => {
  const c = new Client({ connectionString: process.env.DATABASE_URL });
  try {
    await c.connect();
    const res = await c.query("SELECT table_schema, table_name FROM information_schema.tables WHERE table_schema NOT IN ('pg_catalog','information_schema') ORDER BY table_schema, table_name LIMIT 500");
    console.log('Found tables:', res.rowCount);
    res.rows.forEach(r => console.log(`${r.table_schema}.${r.table_name}`));
    await c.end();
  } catch (err) {
    console.error(err.stack || err);
    process.exit(1);
  }
})();
