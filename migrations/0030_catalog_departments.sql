-- Safe, additive catalog department migration. Run before application rollout.
-- No users, products, orders, banners or categories are deleted/edited.
BEGIN;
CREATE TABLE IF NOT EXISTS public.catalog_departments (
  id varchar PRIMARY KEY DEFAULT gen_random_uuid()::text,
  slug text NOT NULL UNIQUE,
  name text NOT NULL,
  description text,
  icon text,
  store_types text[] NOT NULL DEFAULT ARRAY[]::text[],
  is_enabled boolean NOT NULL DEFAULT false,
  launch_ready boolean NOT NULL DEFAULT false,
  display_order integer NOT NULL DEFAULT 0,
  created_at timestamp NOT NULL DEFAULT now(),
  updated_at timestamp NOT NULL DEFAULT now(),
  CONSTRAINT enabled_catalog_must_be_ready CHECK (NOT is_enabled OR launch_ready),
  CONSTRAINT clothing_department_always_enabled CHECK (slug <> 'clothing' OR is_enabled)
);
ALTER TABLE public.catalog_departments ENABLE ROW LEVEL SECURITY;
REVOKE ALL ON public.catalog_departments FROM anon, authenticated;
ALTER TABLE public.categories ADD COLUMN IF NOT EXISTS department_id varchar
  REFERENCES public.catalog_departments(id);
CREATE INDEX IF NOT EXISTS categories_department_id_idx ON public.categories (department_id);
INSERT INTO public.catalog_departments
  (slug,name,description,icon,store_types,is_enabled,launch_ready,display_order)
VALUES
  ('clothing','Clothing & Fashion','Clothing, shoes, hijabs, bags and accessories','👗',ARRAY['clothing']::text[],true,true,0),
  ('electronics','Electronics & Computers','Computers, gadgets, and smart devices','💻',ARRAY['electronics']::text[],false,false,1),
  ('phones','Phones & Mobile','Phones and mobile accessories','📱',ARRAY['electronics']::text[],false,false,2),
  ('home-furniture','Home & Furniture','Furniture and home essentials','🛋️',ARRAY['home_garden']::text[],false,false,3),
  ('appliances','Home Appliances','Kitchen and home appliances','🧺',ARRAY['home_garden']::text[],false,false,4),
  ('beauty','Beauty & Personal Care','Skincare, haircare, makeup and fragrance','🧴',ARRAY['beauty_cosmetics']::text[],false,false,5),
  ('health','Health & Wellness','Health and wellbeing products','💚',ARRAY['health_wellness']::text[],false,false,6),
  ('groceries','Groceries & Food','Groceries and packaged food','🛒',ARRAY['food_beverages']::text[],false,false,7),
  ('restaurants','Restaurants & Prepared Meals','Meals and takeaway services','🍽️',ARRAY['restaurant']::text[],false,false,8),
  ('sports','Sports & Fitness','Sport and fitness products','🏃',ARRAY['sports_fitness']::text[],false,false,9),
  ('automotive','Automotive & Parts','Vehicles and parts','🚗',ARRAY['automotive']::text[],false,false,10),
  ('books','Books & Stationery','Books, media and learning supplies','📚',ARRAY['books_media']::text[],false,false,11),
  ('toys','Toys & Games','Toys and games','🧸',ARRAY['toys_games']::text[],false,false,12),
  ('baby','Baby & Maternity','Baby care and nursery','👶',ARRAY[]::text[],false,false,13),
  ('pets','Pet Supplies','Pet care and food','🐾',ARRAY[]::text[],false,false,14),
  ('garden','Garden & Outdoor','Gardens and outdoor activities','🌿',ARRAY['home_garden']::text[],false,false,15),
  ('hardware','Hardware & Tools','Tools and hardware supplies','🔧',ARRAY[]::text[],false,false,16),
  ('industrial','Industrial & Business','Business and industrial products','🏭',ARRAY[]::text[],false,false,17),
  ('office','Office & School Supplies','Office and school products','✏️',ARRAY[]::text[],false,false,18),
  ('arts','Arts & Crafts','Artworks and crafts','🎨',ARRAY[]::text[],false,false,19),
  ('music','Music & Entertainment','Music equipment and entertainment','🎵',ARRAY[]::text[],false,false,20),
  ('travel','Travel & Luggage','Travel gear','🧳',ARRAY[]::text[],false,false,21),
  ('gifts','Gifts & Celebrations','Gifts and events','🎁',ARRAY[]::text[],false,false,22),
  ('religious','Religious & Cultural Goods','Religious and cultural goods','🕌',ARRAY[]::text[],false,false,23),
  ('agriculture','Agriculture & Farming','Farming inputs','🌾',ARRAY[]::text[],false,false,24),
  ('digital','Digital Products & Software','Software and digital goods','💾',ARRAY[]::text[],false,false,25),
  ('services','Services & Bookings','Bookable professional services','📅',ARRAY[]::text[],false,false,26)
ON CONFLICT (slug) DO NOTHING;
COMMIT;
