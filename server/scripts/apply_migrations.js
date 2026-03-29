import fs from 'fs';
import path from 'path';
import { Client } from 'pg';
import dotenv from 'dotenv';

dotenv.config();
const DATABASE_URL = process.env.DATABASE_URL;
if (!DATABASE_URL) {
  console.error('No DATABASE_URL set');
  process.exit(1);
}

async function run() {
  const client = new Client({ connectionString: DATABASE_URL });
  await client.connect();
  try {
    console.log('Adding pickup_agent user role if missing...');
    await client.query(`
      DO $$
      BEGIN
        IF NOT EXISTS (
          SELECT 1
          FROM pg_enum
          WHERE enumlabel = 'pickup_agent'
            AND enumtypid = 'user_role'::regtype
        ) THEN
          ALTER TYPE user_role ADD VALUE 'pickup_agent';
        END IF;
      END $$;
    `);
    console.log('Adding show_social_links if missing...');
    await client.query("ALTER TABLE platform_settings ADD COLUMN IF NOT EXISTS show_social_links boolean DEFAULT true;");
    console.log('Adding ads and rider gating columns if missing...');
    await client.query("ALTER TABLE platform_settings ADD COLUMN IF NOT EXISTS ads_enabled boolean DEFAULT false;");
    await client.query("ALTER TABLE platform_settings ADD COLUMN IF NOT EXISTS hero_banner_enabled boolean DEFAULT false;");
    await client.query("ALTER TABLE platform_settings ADD COLUMN IF NOT EXISTS sidebar_ad_enabled boolean DEFAULT false;");
    await client.query("ALTER TABLE platform_settings ADD COLUMN IF NOT EXISTS footer_ad_enabled boolean DEFAULT false;");
    await client.query("ALTER TABLE platform_settings ADD COLUMN IF NOT EXISTS product_page_ad_enabled boolean DEFAULT false;");
    await client.query("ALTER TABLE platform_settings ADD COLUMN IF NOT EXISTS allow_rider_registration boolean DEFAULT false;");
    console.log('Adding is_external_rider_system_enabled if missing...');
    await client.query("ALTER TABLE platform_settings ADD COLUMN IF NOT EXISTS is_external_rider_system_enabled boolean DEFAULT false;");
    console.log('Adding show_checkout_delivery_map if missing...');
    await client.query("ALTER TABLE platform_settings ADD COLUMN IF NOT EXISTS show_checkout_delivery_map boolean DEFAULT true;");
    console.log('Adding allow_pickup_agent_admin_chat if missing...');
    await client.query("ALTER TABLE platform_settings ADD COLUMN IF NOT EXISTS allow_pickup_agent_admin_chat boolean DEFAULT true;");
    console.log('Normalizing platform_settings fail-closed defaults...');
    await client.query("ALTER TABLE platform_settings ALTER COLUMN ads_enabled SET DEFAULT false;");
    await client.query("ALTER TABLE platform_settings ALTER COLUMN hero_banner_enabled SET DEFAULT false;");
    await client.query("ALTER TABLE platform_settings ALTER COLUMN sidebar_ad_enabled SET DEFAULT false;");
    await client.query("ALTER TABLE platform_settings ALTER COLUMN footer_ad_enabled SET DEFAULT false;");
    await client.query("ALTER TABLE platform_settings ALTER COLUMN product_page_ad_enabled SET DEFAULT false;");
    await client.query("ALTER TABLE platform_settings ALTER COLUMN allow_rider_registration SET DEFAULT false;");
    await client.query("UPDATE platform_settings SET ads_enabled = false WHERE ads_enabled IS NULL;");
    await client.query("UPDATE platform_settings SET hero_banner_enabled = false WHERE hero_banner_enabled IS NULL;");
    await client.query("UPDATE platform_settings SET sidebar_ad_enabled = false WHERE sidebar_ad_enabled IS NULL;");
    await client.query("UPDATE platform_settings SET footer_ad_enabled = false WHERE footer_ad_enabled IS NULL;");
    await client.query("UPDATE platform_settings SET product_page_ad_enabled = false WHERE product_page_ad_enabled IS NULL;");
    await client.query("UPDATE platform_settings SET allow_rider_registration = false WHERE allow_rider_registration IS NULL;");
    await client.query("UPDATE platform_settings SET is_external_rider_system_enabled = false WHERE is_external_rider_system_enabled IS NULL;");
    console.log('Adding delivery_zones.entity_kind if missing...');
    await client.query("ALTER TABLE delivery_zones ADD COLUMN IF NOT EXISTS entity_kind text DEFAULT 'delivery_zone';");
    await client.query("UPDATE delivery_zones SET entity_kind = 'delivery_zone' WHERE entity_kind IS NULL;");
    console.log('Adding external_dispatch_arranged order status if missing...');
    await client.query(`
      DO $$
      BEGIN
        IF NOT EXISTS (
          SELECT 1
          FROM pg_enum
          WHERE enumlabel = 'external_dispatch_arranged'
            AND enumtypid = 'order_status'::regtype
        ) THEN
          ALTER TYPE order_status ADD VALUE 'external_dispatch_arranged';
        END IF;
      END $$;
    `);
    console.log('Adding packaged order status if missing...');
    await client.query(`
      DO $$
      BEGIN
        IF NOT EXISTS (
          SELECT 1
          FROM pg_enum
          WHERE enumlabel = 'packaged'
            AND enumtypid = 'order_status'::regtype
        ) THEN
          ALTER TYPE order_status ADD VALUE 'packaged';
        END IF;
      END $$;
    `);
    console.log('Adding external_delivery_by_bus if missing...');
    await client.query("ALTER TABLE orders ADD COLUMN IF NOT EXISTS external_delivery_by_bus boolean DEFAULT false;");
    console.log('Adding external_delivery_type if missing...');
    await client.query("ALTER TABLE orders ADD COLUMN IF NOT EXISTS external_delivery_type varchar(32);");
    console.log('Ensuring promotion_applications exists...');
    await client.query(`
      CREATE TABLE IF NOT EXISTS promotion_applications (
        id varchar PRIMARY KEY DEFAULT gen_random_uuid(),
        seller_id varchar NOT NULL REFERENCES users(id) ON DELETE CASCADE,
        type promo_type NOT NULL,
        target_id varchar NOT NULL,
        target_name text NOT NULL,
        duration_type varchar NOT NULL,
        duration integer NOT NULL,
        unit_price decimal(10, 2) NOT NULL,
        total_price decimal(10, 2) NOT NULL,
        seller_note text,
        customer_service_note text,
        status varchar(40) NOT NULL DEFAULT 'pending_payment',
        payment_confirmed boolean DEFAULT false,
        payment_confirmed_at timestamp,
        payment_confirmed_by varchar REFERENCES users(id) ON DELETE SET NULL,
        approved_at timestamp,
        approved_by varchar REFERENCES users(id) ON DELETE SET NULL,
        rejected_at timestamp,
        rejected_by varchar REFERENCES users(id) ON DELETE SET NULL,
        rejection_reason text,
        created_promotion_id varchar REFERENCES promotional_ads(id) ON DELETE SET NULL,
        created_at timestamp DEFAULT now(),
        updated_at timestamp DEFAULT now()
      );
    `);
    await client.query("CREATE INDEX IF NOT EXISTS promotion_applications_seller_id_idx ON promotion_applications(seller_id);");
    await client.query("CREATE INDEX IF NOT EXISTS promotion_applications_status_idx ON promotion_applications(status);");
    await client.query("CREATE INDEX IF NOT EXISTS promotion_applications_created_promotion_id_idx ON promotion_applications(created_promotion_id);");

    const sqlPath = path.resolve(process.cwd(), 'migrations/0003_add_social_toggles.sql');
    if (fs.existsSync(sqlPath)) {
      const sql = fs.readFileSync(sqlPath, 'utf8');
      console.log('Running migrations/0003_add_social_toggles.sql');
      await client.query(sql);
    } else {
      console.log('Migration file not found:', sqlPath);
    }
    console.log('Done');
  } catch (err) {
    console.error('Migration error', err);
    process.exit(1);
  } finally {
    await client.end();
  }
}

run();
