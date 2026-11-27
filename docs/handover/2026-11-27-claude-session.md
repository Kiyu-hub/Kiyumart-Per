# KiyuMart — Claude session handover (23–27 Nov 2026)

Work record for the project owner and the Design Director. Keep this file updated;
every change from a session is pushed to GitHub.

## Branch pushed

`fix/unify-mobile-desktop-20261127` (based on `main` 9ece8cb). **Not merged yet** —
merging to `main` deploys to production (Render auto-deploy + Netlify).

## What the branch changes

| Area | Change |
|---|---|
| Security | Public store endpoints return an allowlist of public fields (`server/publicStore.ts`). Super Admin / seller data stays on protected endpoints. Test: `server/__tests__/public-store-fields.test.ts`. |
| Phone product page | No preselected size ("Select a size"); real colour swatches; "Sold by" seller row; "You may also like"; desktop-entered size guides shown; man/woman body figure by target wearer. |
| Consistency | `/stores` on phones → storefront tiles; teal login on phones; "Sold out" everywhere; category picture fallbacks; no extra "All" circle in Shop by store / category. |
| Desktop (no visual redesign) | Same size rule and size order as phone; measurement guides inside the existing Size Guide dialog; prices follow the checkout rule. |
| Pricing | Displayed price = checkout price `price × (1 − discount%)` on product pages and all product cards. Test: `server/__tests__/pricing-parity.test.ts`. |
| Size-guide pictures | `client/public/measure/body-men.svg` and `body-women.svg` redrawn as distinct figures. |

## Verification done (local, sample data)

- TypeScript: 0 errors. Production build: OK.
- Server tests: all pass except `paystack-init` and `paystack-verify-route`, which need a Paystack test key (failing before these changes too).
- Browser checks (phone 390 px, desktop 1440 px) with `tools/local-preview/` — all passed.

## Not verified

Sign-in, cart, checkout and orders on the live site (needs an account and a
non-production checkout environment).

## Open decisions for the owner

1. Merge `fix/unify-mobile-desktop-20261127` to `main` (= production deploy).
2. Repository visibility and credential rotation (owner action — see private notes).
3. Staging backend + Paystack test mode for safe checkout testing.
4. Desktop design additions not made (owner said no desktop UI changes): studio-photo switch and Sort & filter on desktop.
5. Live catalogue currently holds demo products only.
6. Admin least-privilege for payout/identity data; Super Admin access to coupon routes; session invalidation after password reset.

## Local preview tools

`tools/local-preview/` — mock API with sample data (repo stock photos), screenshot and
interaction scripts. They never contact production. See the header of `mock-api.mjs`.
