# Test Credentials (Reference)

This file documents test accounts and how to access them safely. **Do not commit or publish real passwords.**

> Purpose: central reference for test emails, roles, and how to obtain access *without exposing secrets*.

---

## Admin & Super Admin

- **Super Admin**
  - Email: `superadmin@kiyumart.com`
  - Password: configured via the environment variable `SUPER_ADMIN_PASSWORD` (do NOT commit this value)
  - How to ensure/set it locally:
    - Export locally: `export SUPER_ADMIN_PASSWORD="<your-strong-password>"`
    - Run the admin seeder: `npm run seed-admins` or `tsx scripts/seed-admins.ts`
  - How to get a JWT for tests (no password needed):
    - POST /api/test/token
      - curl example: `curl -sS -X POST http://localhost:5000/api/test/token -H 'Content-Type: application/json' -d '{"email":"superadmin@kiyumart.com"}'`
      - Response: `{ "token": "<jwt>" }` — use this as a Bearer token or set cookie in browser tests.

- **Admin**
  - Email: `admin@kiyumart.com`
  - Password: configured via `ADMIN_PASSWORD` environment variable (do not commit)
  - Same token endpoint `/api/test/token` can be used for tests.

---

## Other seeded test accounts (development/testing)
These are created by the `POST /api/seed/test-users` (development-only) endpoint and by `scripts/seed-admins.ts`.

- **Seller** — `seller@kiyumart.com` — password: `seller123` (dev/test only)
- **Buyer** — `buyer@kiyumart.com` — password: `buyer123` (dev/test only)
- **Rider** — `rider@kiyumart.com` — password: `rider123` (dev/test only)
- **Agent** — `agent@kiyumart.com` — password: `agent123` (dev/test only)

> Note: Non-admin test passwords are for local/dev testing only. In production, never use these accounts or commit test secrets.

---

## Best practices for tests & CI

- Prefer token-based auth for e2e tests: use `POST /api/test/token` to obtain a JWT for a seeded email and avoid storing plaintext passwords in tests or CI logs.
- Use the helper `e2e/test-utils.ts#getTestToken(request, email)` in Playwright tests to centralize token retrieval.
- For CI, set `SUPER_ADMIN_PASSWORD` and `ADMIN_PASSWORD` as repository secrets (do not store them in source).

---

## How to reset or change admin passwords

- Locally: set `SUPER_ADMIN_PASSWORD` and re-run `tsx scripts/seed-admins.ts` (or run in production with `NODE_ENV=production` and the env var set).
- If no `SUPER_ADMIN_PASSWORD` is provided, the server seed generation will generate a secure random password at runtime for the super admin (this password is not logged or returned).

---

## Security reminders

- Never commit environment files containing secrets. Use `.env` locally and add sensitive files to `.gitignore`.
- For production, store `SUPER_ADMIN_PASSWORD` and `ADMIN_PASSWORD` in your platform's secret manager or CI secrets and **never** check them into version control.

---

If you'd like, I can also:
- Add a small script that prints current test account emails (but never prints passwords), or
- Add a private, gitignored output file (e.g., `.local-secrets`) that contains generated super admin password for local convenience (not committed). Let me know which option you prefer.