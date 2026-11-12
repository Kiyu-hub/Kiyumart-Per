-- Fashion services launch schema. ADDITIVE ONLY; no users, products, banner assets,
-- existing categories, orders or Super Admin account are modified.
-- Apply only in staging first, after preflight backup and app compatibility checks.
BEGIN;
CREATE TABLE IF NOT EXISTS public.fashion_service_applications (
  id varchar PRIMARY KEY DEFAULT gen_random_uuid()::text,
  store_id varchar NOT NULL UNIQUE REFERENCES public.stores(id),
  seller_id varchar NOT NULL REFERENCES public.users(id),
  status text NOT NULL DEFAULT 'pending' CHECK (status IN ('pending','changes_requested','approved','rejected','suspended')),
  headline text NOT NULL,
  bio text NOT NULL,
  specialties text[] NOT NULL,
  coverage_areas text[] NOT NULL DEFAULT ARRAY[]::text[],
  languages text[] NOT NULL DEFAULT ARRAY[]::text[],
  portfolio_urls text[] NOT NULL DEFAULT ARRAY[]::text[],
  evidence_urls text[] NOT NULL DEFAULT ARRAY[]::text[],
  experience_years integer CHECK (experience_years BETWEEN 0 AND 70),
  availability jsonb NOT NULL DEFAULT '{"days":[1,2,3,4,5,6],"advanceDays":30,"paused":false}'::jsonb,
  reviewed_by varchar REFERENCES public.users(id),
  reviewed_at timestamp,
  review_note text,
  created_at timestamp NOT NULL DEFAULT now(),
  updated_at timestamp NOT NULL DEFAULT now()
);
CREATE INDEX IF NOT EXISTS fashion_application_seller_idx ON public.fashion_service_applications(seller_id);

CREATE TABLE IF NOT EXISTS public.fashion_service_offerings (
  id varchar PRIMARY KEY DEFAULT gen_random_uuid()::text,
  store_id varchar NOT NULL REFERENCES public.stores(id),
  seller_id varchar NOT NULL REFERENCES public.users(id),
  title text NOT NULL,
  service_type text NOT NULL CHECK(service_type IN ('tailoring','custom_design','occasion_wear','consultation')),
  description text NOT NULL,
  starting_price_pesewas integer NOT NULL CHECK(starting_price_pesewas>=0),
  turnaround_days integer NOT NULL DEFAULT 7 CHECK(turnaround_days BETWEEN 1 AND 365),
  is_active boolean NOT NULL DEFAULT true,
  created_at timestamp NOT NULL DEFAULT now(),
  updated_at timestamp NOT NULL DEFAULT now()
);
CREATE INDEX IF NOT EXISTS fashion_offerings_store_idx ON public.fashion_service_offerings(store_id);

CREATE TABLE IF NOT EXISTS public.fashion_service_requests (
  id varchar PRIMARY KEY DEFAULT gen_random_uuid()::text,
  reference_code text NOT NULL UNIQUE,
  store_id varchar NOT NULL REFERENCES public.stores(id),
  seller_id varchar NOT NULL REFERENCES public.users(id),
  buyer_id varchar NOT NULL REFERENCES public.users(id),
  offering_id varchar REFERENCES public.fashion_service_offerings(id) ON DELETE SET NULL,
  service_title text NOT NULL,
  description text NOT NULL,
  reference_images text[] NOT NULL DEFAULT ARRAY[]::text[],
  preferred_date timestamp,
  fitting_method text NOT NULL DEFAULT 'discuss' CHECK(fitting_method IN ('discuss','in_store','virtual')),
  customer_location text,
  status text NOT NULL DEFAULT 'pending'
    CHECK (status IN ('pending','quoted','accepted','in_progress','ready_for_collection','completed','declined','cancelled')),
  quote_pesewas integer CHECK (quote_pesewas >= 100),
  deposit_percent integer CHECK (deposit_percent IN (50,100)),
  quote_expires_at timestamp,
  paid_pesewas integer NOT NULL DEFAULT 0 CHECK (paid_pesewas >= 0),
  delivery_method text,
  completed_at timestamp,
  created_at timestamp NOT NULL DEFAULT now(),
  updated_at timestamp NOT NULL DEFAULT now()
);
CREATE INDEX IF NOT EXISTS fashion_requests_buyer_idx ON public.fashion_service_requests(buyer_id);
CREATE INDEX IF NOT EXISTS fashion_requests_seller_idx ON public.fashion_service_requests(seller_id);
CREATE INDEX IF NOT EXISTS fashion_requests_store_idx ON public.fashion_service_requests(store_id);

CREATE TABLE IF NOT EXISTS public.fashion_service_messages (
  id varchar PRIMARY KEY DEFAULT gen_random_uuid()::text,
  request_id varchar NOT NULL REFERENCES public.fashion_service_requests(id),
  sender_id varchar NOT NULL REFERENCES public.users(id),
  message text NOT NULL,
  created_at timestamp NOT NULL DEFAULT now()
);
CREATE INDEX IF NOT EXISTS fashion_messages_request_idx ON public.fashion_service_messages(request_id);

CREATE TABLE IF NOT EXISTS public.fashion_service_payments (
  id varchar PRIMARY KEY DEFAULT gen_random_uuid()::text,
  request_id varchar NOT NULL REFERENCES public.fashion_service_requests(id),
  buyer_id varchar NOT NULL REFERENCES public.users(id),
  paystack_reference text NOT NULL UNIQUE,
  amount_pesewas integer NOT NULL CHECK(amount_pesewas > 0),
  status text NOT NULL DEFAULT 'initiated' CHECK(status IN ('initiated','paid','failed')),
  paid_at timestamp,
  created_at timestamp NOT NULL DEFAULT now()
);
CREATE INDEX IF NOT EXISTS fashion_payments_request_idx ON public.fashion_service_payments(request_id);

CREATE TABLE IF NOT EXISTS public.fashion_service_reviews (
  id varchar PRIMARY KEY DEFAULT gen_random_uuid()::text,
  request_id varchar NOT NULL UNIQUE REFERENCES public.fashion_service_requests(id),
  buyer_id varchar NOT NULL REFERENCES public.users(id),
  seller_id varchar NOT NULL REFERENCES public.users(id),
  rating integer NOT NULL CHECK(rating BETWEEN 1 AND 5),
  comment text NOT NULL,
  created_at timestamp NOT NULL DEFAULT now()
);
CREATE INDEX IF NOT EXISTS fashion_reviews_seller_idx ON public.fashion_service_reviews(seller_id);

-- These are backend-managed data. No direct Supabase Data API table access.
DO $$
DECLARE t text;
BEGIN
 FOREACH t IN ARRAY ARRAY[
   'fashion_service_applications','fashion_service_offerings','fashion_service_requests',
   'fashion_service_messages','fashion_service_payments','fashion_service_reviews'
 ] LOOP
   EXECUTE format('ALTER TABLE public.%I ENABLE ROW LEVEL SECURITY',t);
   EXECUTE format('REVOKE ALL PRIVILEGES ON public.%I FROM anon, authenticated',t);
 END LOOP;
END $$;
COMMIT;
