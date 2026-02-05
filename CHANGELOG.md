# Changelog

## 2026-02-03 (v1.1.4)

### Multi-Vendor Promotional Ads Parity
- **Feature:** Full promotional ads support in multi-vendor mode
  - Added PromotionalAdsGrid to MultiVendorHome for 2+ promotions
  - Added SinglePromotionSidebar for single promotion display
  - Added hero, sidebar, and footer ad banners to MultiVendorHome
  - Mobile responsive promotional display for single promotions
  - Grid layout with responsive sidebar (lg:col-span-4 / lg:col-span-8)

### Route Fixes
- **Fix:** Corrected all broken store links from `/store/:id` to `/sellers/:id`
  - StoreCard.tsx - Store card click navigation
  - MarketplaceBannerCarousel.tsx - Banner store click
  - AdminPromotions.tsx - CTA URL auto-generation for store promotions
  - AdminStoresList.tsx - View store button in admin table

### Schema Updates (Previous Session)
- **Fix:** Added missing promotional ads fields to TypeScript schema
  - title, description, imageUrl, ctaText, ctaUrl, themeColor

## 2026-02-02 (v1.1.3)

- Enhanced promotional system with title/description on promo cards
- PromotionalAdsGrid redesigned as horizontal scrolling row
- Compact mode for 3+ promotions (smaller cards)
- Admin dashboard improvements

## 2026-01-23

- Fix: Resolved runtime crash in `client/src/App.tsx` by making React namespace import resilient to bundler/runtime issues.
- Change: Disabled external currency conversion. Platform now uses GHS (Ghanaian Cedi) as the single default currency.
  - Simplified server `server/currency.ts` to no-op conversion and removed external API calls.
  - Updated admin UI (`AdminStoreManager`, `AdminSettings`) to only allow `GHS` as the default currency.
- Note: Further verification and comprehensive README feature integration is pending; next steps include running unit/e2e tests and implementing any missing features listed in `README.md`.
