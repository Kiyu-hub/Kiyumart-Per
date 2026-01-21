import { db } from "../db/index";

(async function(){
  try {
    await db.execute(`ALTER TABLE platform_settings ADD COLUMN IF NOT EXISTS linkedin_url text`);
    await db.execute(`ALTER TABLE platform_settings ADD COLUMN IF NOT EXISTS youtube_url text`);
    await db.execute(`ALTER TABLE platform_settings ADD COLUMN IF NOT EXISTS tiktok_url text`);
    await db.execute(`ALTER TABLE platform_settings ADD COLUMN IF NOT EXISTS pinterest_url text`);
    await db.execute(`ALTER TABLE platform_settings ADD COLUMN IF NOT EXISTS whatsapp_page text`);
    console.log('Added columns');
  } catch (e) {
    console.error('error', e);
    process.exit(1);
  }
  process.exit(0);
})();