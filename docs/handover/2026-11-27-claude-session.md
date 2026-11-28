# KiyuMart — Claude session handover (23–27 Nov 2026)

Work record for the project owner and the Design Director. Keep this file updated;
every change from a session is pushed to GitHub.

## Branch pushed

`fix/unify-mobile-desktop-20261127` (based on `main` 9ece8cb). Merged to `main` on 27 Nov 2026 (owner approved) — `main` deploys to production (Render auto-deploy + Netlify).

## Where to see the work (development preview)

- **Dev preview:** https://preview--kiyumart1.netlify.app — Netlify branch deploy of the `preview` branch.
  Keep `preview` equal to `main` (fast-forward) to see the latest work.
- **Production** (`kiyumart1.netlify.app`): Netlify production deploys are paused while the
  Kiyuhub team is out of build credits; it still shows the 26 Nov build.
- The API (Render) deploys from `main` automatically, so backend fixes go live on push.
- Verified on the dev preview (27 Nov): no "All" circle, burgundy swatch, "Sold by" row,
  "Select a size" with no preselected size, related products.

## What the branch changes

| Area | Change |
|---|---|
| Security | Public store endpoints return an allowlist of public fields (`server/publicStore.ts`). Super Admin / seller data stays on protected endpoints. Test: `server/__tests__/public-store-fields.test.ts`. |
| Phone product page | No preselected size ("Select a size"); real colour swatches; "Sold by" seller row; "You may also like"; desktop-entered size guides shown; man/woman body figure by target wearer. |
| Consistency | `/stores` on phones → storefront tiles; "Sold out" everywhere; category picture fallbacks; no extra "All" circle in Shop by store / category. |
| Desktop (no visual redesign) | Same size rule and size order as phone; measurement guides inside the existing Size Guide dialog; prices follow the checkout rule. |
| Pricing | Displayed price = checkout price `price × (1 − discount%)` on product pages and all product cards. Test: `server/__tests__/pricing-parity.test.ts`. |
| Size-guide pictures | `client/public/measure/body-men.svg` and `body-women.svg` redrawn as distinct figures. Items not worn on the body (bags, shoes, hijabs/scarves) show their own measuring picture (`bag.svg`, `shoes.svg`, `hijab.svg`) and no human figure; clothing shows the garment picture plus the man/woman figure. |

## Verification done (local, sample data)

- TypeScript: 0 errors. Production build: OK.
- Server tests: all pass except `paystack-init` and `paystack-verify-route`, which need a Paystack test key (failing before these changes too).
- Browser checks (phone 390 px, desktop 1440 px) with `tools/local-preview/` — all passed.

## Not verified

Sign-in, cart, checkout and orders on the live site (needs an account and a
non-production checkout environment).

## 28 Nov fixes

| Fix | Detail |
|---|---|
| Keep backend awake | `keep-alive.yml` was auto-disabled by GitHub; replaced by `keep-backend-awake.yml` (new, active workflow, pings every 14 min). |
| Super Admin coupons | Super Admin can list, view, edit and delete every coupon; sellers still only their own. Test: `coupons-super-admin.test.ts`. |
| Admin data access | Ordinary admins never receive sellers' ID documents; payout details only with the view-payouts permission. Super Admin unchanged. Test: `admin-store-data-access.test.ts`. |
| Suspended accounts | Blocked within 30 s on every logged-in route (suspended sellers/riders keep the limited access the role rules allow). Test: `auth-suspended-account.test.ts`. |
| Automatic tests | `ci.yml`: typecheck + all server tests + production build (all green locally: 22/22). Paystack unit tests fixed (fake keys in the current format). `ci-integration.yml` renamed and runs only the optional Paystack integration test. `playwright.yml` unchanged — several browser specs still describe the retired single-store mode and need rewriting. |

## Open decisions for the owner

1. Merge `fix/unify-mobile-desktop-20261127` to `main` (= production deploy).
2. Repository visibility and credential rotation (owner action — see private notes).
3. Staging backend + Paystack test mode for safe checkout testing.
4. Desktop design additions not made (owner said no desktop UI changes): studio-photo switch and Sort & filter on desktop.
5. Live catalogue currently holds demo products only.
6. Making a password change log the user out on all devices (needs a database column — after launch).
7. Rewrite the single-store browser tests (playwright) for the multi-vendor marketplace.

## Local preview tools

`tools/local-preview/` — mock API with sample data (repo stock photos), screenshot and
interaction scripts. They never contact production. See the header of `mock-api.mjs`.
