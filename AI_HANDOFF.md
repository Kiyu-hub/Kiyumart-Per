# KiyuMart — AI Development Handoff (2026-11-15)

> **For the next developer or AI:** This repository is the remote source of code. This document is a handoff and safety map, **not** evidence that unfinished features are deployed. Start by reading this file, the README, the linked draft PRs, and current GitHub Actions results. Preserve the original storefront unless the owner explicitly approves a redesign.

## Repository and branches

- **Private GitHub repo:** https://github.com/Smart3990/Kiyumart-Per
- **Production/default branch:** `main`. Do **not** force-push, merge broad development branches, or assume GitHub branches are live deployments.
- **Recommended Fashion Services development starting point:** `feature/fashion-services-isolated`, PR [#10](https://github.com/Smart3990/Kiyumart-Per/pull/10), **targeting** `feature/fashion-category-gating`, NOT `main`. It contains the extra seller service capability and related seller/admin/buyer screens, API and additive database migration.
- **Fashion categories / department gating:** `feature/fashion-category-gating`, draft PR [#6](https://github.com/Smart3990/Kiyumart-Per/pull/6); includes 27 planned departments with Clothing & Fashion enabled by default, fashion categories, elevated controls, and migration `0030_catalog_departments.sql`.
- **Broad combined development branch:** `feature/verified-fashion-services`, draft PR [#7](https://github.com/Smart3990/Kiyumart-Per/pull/7). Contains more earlier redesign/security code and must **not** be merged wholesale.
- **Focused production category display candidate:** `release/fashion-categories-only-20261112`, PR [#11](https://github.com/Smart3990/Kiyumart-Per/pull/11). Separately review/deploy if authorized; do not conflate with Fashion Services.
- **Other saved branches:** `redesign/mobile-home-fashion`, `security/role-verification-hardening`, `feature/paystack-tests`, `fix/reset-empty-catalog-20261112`, `fix/show-empty-fashion-categories`, `integration/kiyumart-fashion-unified`, `chore/docs-ghana-english`. Inspect existing PRs/commits before redoing work.
- **Haraka design reference only:** https://github.com/Smart3990/Haraka-Mobile-Marketplace. Do not replace KiyuMart with Haraka code or Firebase architecture.

## Owner's requirements to preserve

1. **One seller account.** Buyers become approved sellers through the normal seller application. An approved clothing seller may additionally apply inside the seller dashboard for Fashion Services (tailoring, alterations, bespoke clothing, occasion wear, consultations). No new public “Become an Artisan” button or separate artisan account role.
2. **Independent service verification.** Super Admin can review, request changes, approve, reject or suspend the seller's Fashion Services capability without necessarily disabling the normal store.
3. **Store-based discovery first.** Only approved service stores show “Custom Orders” / request service options. Ordinary stores keep their existing layout. Consider a directory only later.
4. **Service journey.** Portfolio and offerings → customer custom-order request with references/preferences → seller quote and timeline → customer acceptance and test-mode deposit/full payment (Paystack) → progress, pickup/delivery, reviews. Keep service reviews distinguishable from product reviews, and sensitive measurements or ID data private and minimal.
5. **Preserve homepage and branding.** Original storefront/homepage, banners and navigation must remain unchanged unless specifically approved. Existing brand teal palette: `#009688`, `#00897B`, `#00BFA5`. Fashion-first launch; keep future marketplace departments disabled until ready.
6. **No destructive production reset without independent verified backup, restored test and compatible deployment.** The planned reset is separate from Fashion Services. It has **not** been authorized to execute without safeguards. Historical audits mention an internal restricted Supabase snapshot, which is not an offsite backup.

## What was verified in GitHub on 2026-11-15

- The private repo and all named branches listed above are available remotely; the isolated branch is **70 commits ahead of main** at the time of inspection, while the broad branch is **75 commits ahead**. This proves those commits are stored remotely, **not** that there are no unsynced local edits.
- Isolated Fashion Services CI for commit `d49618f5e1d350cb5da53320771a4752f428fc8b` succeeded on 2026-11-12: [run 43232664379](https://github.com/Smart3990/Kiyumart-Per/actions/runs/43232664379) (TypeScript verification, unit tests and build). This is **not** staging E2E.
- Broader `feature/verified-fashion-services` CI succeeded but Playwright E2E **failed** on 2026-11-12: [failed run 43225415082](https://github.com/Smart3990/Kiyumart-Per/actions/runs/43225415082). Diagnose; do not silently treat as a passing test.
- The last documented state was: additive Fashion Services migration `migrations/0031_fashion_services.sql` prepared **for staging**, no verified production migration/feature release, no verified preview URL, and no destructive fashion catalog reset.
- A prior check identified the expected frontend `kiyumartofficial.netlify.app` and API `kiyumart-api.onrender.com`; verify current actual hosts, deployment SHA, branch and environment before modifying anything. Do not assume same Supabase project solely from matching public data.

## Files worth opening first

- `migrations/0030_catalog_departments.sql`, `migrations/0031_fashion_services.sql`
- `server/fashionServicesRoutes.ts`, `shared/fashionServicesSchema.ts`, `shared/fashionServiceRules.ts`, `server/__tests__/fashion-service-rules.test.ts`
- `client/src/pages/SellerFashionServices.tsx`, `client/src/pages/AdminFashionServices.tsx`, `client/src/components/FashionServicesStorePanel.tsx`, `client/src/pages/FashionServiceRequestPage.tsx`, `client/src/pages/FashionServiceRequestDetail.tsx`, `client/src/pages/FashionServiceMyRequests.tsx`
- `.github/workflows/fashion-services-isolated.yml` and draft PR #10 for test and deployment scope.
- `security/review-only/fashion-reset-transaction.sql` is **review-only, destructive**; **never run automatically**.

## Next steps for the next AI/developer

1. Start from remote `feature/fashion-services-isolated` and PR #10; fetch latest changes before editing. Inspect the actual diff against its dependency branch, not just `main`.
2. Check current CI, fix failed E2E cases, run `npm ci`, `npx tsc --noEmit --pretty false`, `node scripts/run-tsx-test-suite-safe.mjs`, `npm run build`, plus appropriate Playwright scenarios. Do not claim complete QA from unit/build alone.
3. Set up **isolated staging** (separate hosting URL, separate database and sandbox Paystack credentials in provider secret settings). No production credentials or writable production database for previews. Test seller verification, permission gates, seller dashboard, customer requests, chat, quotes, payments, progress and reviews.
4. Inspect Render/Netlify and database connections using verified service/deploy identities, not conjecture. Treat roles/authentication and payment flow validation as release gates even though the owner previously deferred them from an earlier discussion.
5. Keep Fashion Services deployment, category-only UI fix, and any destructive reset as **separate changes**, each requiring explicit production release approval. Preserve seven existing banner records/links if still current.
6. Document results, unresolved issues and exact tested commit in GitHub PRs. Update this file when verified facts change.

## Cloud-first development

- [GitHub Codespaces setup](docs/CLOUD_DEVELOPMENT.md) lets future AI/developers work from a remote branch without relying on the Windows machine. This is **configuration only**; no Codespace or staging database is provisioned by this commit.
- The next release milestone is documented in [GitHub issue #13](https://github.com/Smart3990/Kiyumart-Per/issues/13).

## “Everything on GitHub” and safe storage boundaries

- This check accessed GitHub's **remote** repository only. It **cannot inspect the owner's Windows filesystem**, so it cannot certify there are no local-only modified/untracked files or delete anything locally. To verify from any existing clone, check `git status --short`, `git branch -vv`, and `git log --branches --not --remotes`; review all pending changes **and secrets** before pushing selected branches/commits. Do not blindly use `git push --all`.
- **Do not commit** `.env*`, Paystack/Cloudinary/Render/Supabase credentials, identity documents, personal user data or raw production database exports. Use provider secret settings and encrypted, access-controlled independent backups. GitHub source control is not a production database backup.
- After matching remote commit IDs, branch state and a clean status, the owner may choose to remove a local clone. Never delete a local copy as proof of synchronization.

**Handoff outcome:** Source code for existing saved branches is available on GitHub, but staging, production state, local-only files, and independent database backup still require separate verification.
