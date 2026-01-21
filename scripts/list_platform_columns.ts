import { db } from "../db/index";

(async function(){
  try {
    const res = await db.execute("select column_name from information_schema.columns where table_name = 'platform_settings'");
    console.log(res.rows);
  } catch (e) {
    console.error('error', e);
    process.exit(1);
  }
  process.exit(0);
})();