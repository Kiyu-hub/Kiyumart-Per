-- REVIEW ONLY — DO NOT APPLY TO PRODUCTION UNTIL THE CHECKLIST IS COMPLETE.
-- This file is deliberately outside migrations/ so application deploys cannot
-- inadvertently apply it. Back up and test in a separate staging database first.
--
-- KiyuMart's Express/Drizzle backend currently uses DATABASE_URL via PostgreSQL.
-- These changes block direct Data API access for Supabase anon/authenticated roles.
-- They do NOT remove permissions from the backend's database owner/service role.
-- Before applying, confirm no frontend or Edge Function depends on direct access
-- with the anon or authenticated Supabase roles.
--
-- Phase 1: revoke exposed Data API table access (all public tables).
-- Warning: this intentionally makes direct Supabase client CRUD fail until
-- explicit, narrowly scoped GRANTs + RLS policies are designed and approved.
BEGIN;

REVOKE ALL PRIVILEGES ON ALL TABLES IN SCHEMA public FROM anon, authenticated;
REVOKE ALL PRIVILEGES ON ALL SEQUENCES IN SCHEMA public FROM anon, authenticated;

-- Protect future tables owned by the migration's executing role as well.
ALTER DEFAULT PRIVILEGES IN SCHEMA public
  REVOKE ALL ON TABLES FROM anon, authenticated;
ALTER DEFAULT PRIVILEGES IN SCHEMA public
  REVOKE ALL ON SEQUENCES FROM anon, authenticated;

-- RLS defense in depth for existing public tables. Zero policies means no
-- client role can access rows even if someone grants the role table access.
DO $$
DECLARE t record;
BEGIN
  FOR t IN
    SELECT quote_ident(n.nspname) AS schema_name, quote_ident(c.relname) AS table_name
    FROM pg_class AS c
    JOIN pg_namespace AS n ON n.oid = c.relnamespace
    WHERE n.nspname = 'public' AND c.relkind IN ('r', 'p')
  LOOP
    EXECUTE format('ALTER TABLE %s.%s ENABLE ROW LEVEL SECURITY',
      t.schema_name, t.table_name);
  END LOOP;
END
$$;

COMMIT;

-- Post-deployment verification (read only):
-- SELECT COUNT(*) FILTER (WHERE NOT relrowsecurity)
-- FROM pg_class c JOIN pg_namespace n ON n.oid=c.relnamespace
-- WHERE n.nspname='public' AND c.relkind IN ('r','p');
-- Expected: 0.
-- Verify buyer, seller, rider, admin and super_admin API flows independently.
-- IMPORTANT: Never grant anon/authenticated table-wide CRUD simply to fix a 403.
