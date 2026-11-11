# KiyuMart Supabase security rollout — 2026-11-11

Project: KiyuMart Supabase PostgreSQL (connected project).
This is a record of **live database DDL already applied** via the Supabase connector.
Do not execute the statements again as part of app deployment.

## Applied and verified

1. Migration `harden_postgres_public_defaults_no_anonymous_grants_20261111`
   - Future tables, sequences and functions created by PostgreSQL role `postgres` no longer automatically grant access to Supabase `anon` and `authenticated` roles.
   - Existing default privileges for `supabase_admin` were **not changed** because the migration session was `postgres`, not a member of `supabase_admin`.

2. Migration `lock_down_public_tables_anon_authenticated_enable_rls_20261111`
   - Preflight required exactly 59 public tables, 59 with RLS disabled, and no existing policies. It was fulfilled.
   - Revoked all table and sequence privileges from database roles `anon` and `authenticated`.
   - Enabled Row Level Security on the 59 existing `public` tables.
   - No rows were deleted or modified.

## Post-change verification
- Public tables: 59; RLS enabled: 59.
- `anon` read permissions: 0 tables; insert permissions: 0 tables.
- `authenticated` read permissions: 0 tables; update permissions: 0 tables.
- Privileged `postgres` retains SELECT access: 59 tables.
- Supabase advisor: prior RLS-disabled error cleared; informational `rls_enabled_no_policy` notice remains on 59 tables. This is expected with deny-by-default client access.
- Row counts: products 614, categories 26, stores 16, hero banners 7, users 31, orders 8, transactions 0, platform settings 1.

## Remaining deployment verification
- **No database backup was made by this tool.** Only privileges and RLS flags were changed, with a permission rollback documented in `security/review-only/emergency-rollback-public-access.sql`.
- A direct browser/API production smoke test was not completed. Do not claim the customer and Super Admin workflows are verified live.
- Confirm deployed backend `DATABASE_URL` connects with a role that owns tables or is permitted to bypass RLS. The repository uses the server-side `db/index.ts` pool; live environment variables are not visible to this connector.
- Test buyer browsing, seller CRUD, Super Admin settings, payment initialization/verification, rider/agent, and messaging against actual deployment.
- Supabase `supabase_admin` future-object default grants remain broad; review project-managed defaults in a separately permitted/admin context.
- Review dependency audit advisories from GitHub Actions before public launch.
- GitHub PR #5 contains application authentication hardening and still needs review and deployment. No merge to main was performed by the database migrations.

## Emergency rollback (not recommended unless verified breakage)
See `security/review-only/emergency-rollback-public-access.sql`. Restoring former grants reintroduces the original vulnerability. Prefer narrow grants and suitable RLS policies if a client dependency is discovered.
