-- EMERGENCY ROLLBACK ONLY: restores Supabase Data API access from BEFORE
-- the 2026-11-11 security hardening. It intentionally restores insecure grants.
-- Do not use unless a verified outage requires rollback to a known state.
-- All 59 tables had RLS disabled and ALL TABLE privileges granted to anon and
-- authenticated before lockdown; this script reverses ONLY that DDL change.
-- No rows or financial records are changed.
BEGIN;
DO $$
DECLARE item record;
BEGIN
 FOR item IN
   SELECT format('%I.%I',n.nspname,c.relname) AS qualified_name
   FROM pg_class c JOIN pg_namespace n ON n.oid=c.relnamespace
   WHERE n.nspname='public' AND c.relkind IN ('r','p')
 LOOP
   EXECUTE format('ALTER TABLE %s DISABLE ROW LEVEL SECURITY',item.qualified_name);
 END LOOP;
END $$;
GRANT ALL PRIVILEGES ON ALL TABLES IN SCHEMA public TO anon, authenticated;
GRANT ALL PRIVILEGES ON ALL SEQUENCES IN SCHEMA public TO anon, authenticated;
COMMIT;

-- Future default privileges intentionally remain secure; rollback only restores
-- previous grants for existing objects. Validate API flows and plan RLS restoration.
