import { db } from "../db/index";

(async function(){
  try {
    const res = await db.execute("select * from drizzle_migrations order by created_at desc limit 5");
    console.log(res.rows);
  } catch (e) {
    console.error('error', e);
    process.exit(1);
  }
  process.exit(0);
})();