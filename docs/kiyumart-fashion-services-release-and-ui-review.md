# KiyuMart Fashion Services — release gates and page-by-page UI review

Updated: 2026-11-15. Development branch: `feature/verified-fashion-services`.

## Product contract

- There is **one normal seller account**. Fashion services are optional, store-scoped capabilities for approved clothing stores, never a separate artisan role or global "Become an Artisan" button.
- A seller's application and portfolio are reviewed independently from ordinary seller approval.
- Only approved, active fashion stores may publish offerings and receive custom requests.
- Requests, quotations, private conversation, delivery/collection progress and service reviews remain attached to the store.
- Existing brand colours: teal `#009688`, `#00897B`, `#00BFA5`; retain current homepage until its design is explicitly reviewed.

## Release status and blockers

The Fashion Services code lives in an unmerged development branch. The feature migration is `migrations/0031_fashion_services.sql`, and must be **tested on staging before production**.

1. **Tests:** latest baseline (2026-11-12, commit `5a14907`) passed typecheck, unit tests and build, but the Playwright workflow had **14 failures and 10 passes**. Do not describe KiyuMart as end-to-end tested until critical journeys are green.
2. **Database:** Supabase project `vpxjggnzttxgpzbogbzg` has `catalog_departments`, but as of 2026-11-15 had none of the service applications, offerings, requests or payments tables. Production migration is not applied.
3. **Payments:** `FASHION_SERVICE_PAYMENTS_ENABLED` is intentionally false by default. Enable only after Paystack test-mode verification, refunds/cancellation policy, outstanding-payment reconciliation and security testing.
4. **Release hygiene:** the branch is also ahead of `main` with earlier redesign changes. Preserve the existing homepage; review and isolate unrelated changes before merging. Do **not** run the staged destructive fashion data reset without an independently verified recovery backup.
5. **Deployment:** verify the backend commit, store visibility, category gating, frontend API proxy, and operational logs in a non-production preview; obtain a review of the current and proposed layouts before changing existing pages.

## Functional acceptance journey

1. Approved clothing seller sees **Fashion Services** in their seller dashboard, applies with headline, bio, portfolio and service types.
2. Super Admin can approve, reject, request changes or suspend the optional capability while ordinary store access remains intact.
3. Approved seller can publish/edit/pause offerings and update availability; public store shows custom services only when eligible.
4. Buyer requests a service, selects appointment preference, attaches references and opens a private discussion.
5. Seller quotes GHS price/deposit and expiry; buyer accepts; server rejects stale quotes and unauthorized status changes.
6. Paystack test mode validates amount, currency, metadata, identity and idempotency; only verified payments advance the paid balance.
7. Seller marks work in progress/ready; buyer completes after the agreed total is paid; buyer can review once.
8. Full regression checks: buyer/guest/seller/admin/rider/agent, mobile/desktop, navigation, image/media upload, product pages, cart/checkout, messages, notification and banners.

## Page-by-page UI approval queue

For **each** page, present the actual current implementation (screenshot or source-grounded description) beside a proposed mock-up. Discuss only that page and record approval before altering existing layouts.

| Review order | Page | Current implementation | Proposed review focus |
|---|---|---|---|
| 1 | Seller Fashion Services | Eligibility banner, application form, offerings, service requests | Mobile card hierarchy, clear verification status, edit/availability controls |
| 2 | Super Admin Fashion Services | Application cards, reviewer-only evidence links, action buttons | Review queue, safer approve/suspend affordances, privacy and feedback |
| 3 | Fashion store detail | Existing storefront plus conditional services panel | Products / Custom Orders / Reviews discoverability; preserve original store identity |
| 4 | Customer request form | Service summary, description, fitting method, reference uploads | Guided three-part form, time/date clarity, accessible mobile form |
| 5 | Request detail / messaging | Chat, quote, payments and status panel | Progress timeline, action clarity, mobile conversation usability |
| 6 | My service requests | Buyer request history | Filters, status cards and empty state |
| 7 | Category/home discovery | Fashion-first catalog under super-admin display mode | Current vs proposed; no unintended homepage replacement |
| 8 | Search and product details | Current customer browsing | Clear search return behavior, consistent cards, add-to-cart and reviews |
| 9 | Cart, checkout and orders | Current Paystack, delivery and receipts | Accessibility, fee transparency, order tracking |
| 10 | Seller, Admin, Rider, Agent dashboards | Existing role-based pages | Navigation, status accuracy, queues, reporting |
| 11 | Account, settings, support and notifications | Existing account-related pages | Mobile consistency, trust/feedback, support and accessibility |

### Acceptance and deployment rule

UI proposal is **not** implementation approval. Changes to the existing homepage and established pages require explicit approval of the page-by-page comparison. Fashion Services functional fixes can remain on the isolated branch pending safe staging tests. No destructive reset, live Paystack enablement, production merge or public launch occurs as part of a UI review alone.
