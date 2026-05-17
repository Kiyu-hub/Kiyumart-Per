# Changelog

## 2026-05-17 (v1.3.0) — Bolt Food experience

A dedicated food ordering experience now lives alongside the existing
e-commerce flows. Restaurants and local vendors get their own discovery,
detail, cart, and tracking screens modelled on Bolt Food while staying on
KiyuMart's existing stack (Paystack, delivery zones, internal/external rider
modes). KiyuMart brand TEAL (#009688) replaces Bolt's green throughout.

### Database schema changes
- `stores.prep_time_mins` — integer (default 15). Drives Bolt-style live ETA on the food vendors page.
- `stores.min_order_amount` — decimal(10,2) (default 0). Surfaces as the per-store minimum order warning.
- `hero_banners.placement` — text (default `home`). Splits banners between the homepage hero and the dedicated Restaurants & Local Vendors page. Legacy NULL rows count as `home`; food page never shows them.
- `hero_banners.theme_color` — text. Optional brand accent gradient when no banner image is uploaded.
- `categories.product_fields_config` — JSONB. Array of `DynamicField` entries (name, label, type, options, required) so super admin can define per-cuisine fields (Pizza → crust/sauce/toppings, Sushi → rice/fish).
- `platform_settings.enable_3d_ar` — boolean (default true). Global kill-switch for 3D/AR product features. Food vendors are always treated as off regardless.

All columns are self-healed on boot via `ALTER TABLE … ADD COLUMN IF NOT EXISTS`.

### New API endpoints
- `GET /api/stores/quotes?ids=&lat=&lon=&city=&region=` — batched live quote per store. Returns prep / travel minutes, ETA low/high, delivery fee (from `delivery_zones`), minimum order, distance in km, and total units sold (aggregated from completed/delivered `order_items`).
- `POST /api/categories/seed-cuisines` (super_admin only) — idempotent one-click seed for the default cuisines Rice, Local, Pizza, Burger, Grill, Drinks, Pastry, Salad, Fast Food, Noodles. Skips slugs that already exist.
- `GET /api/hero-banners?placement=home|food_vendors` — placement filter on the existing banners endpoint. `placement=home` includes legacy NULL rows; `placement=food_vendors` is exact match.
- `POST/PATCH /api/admin/hero-banners` — now accept `placement` and `themeColor`.
- `GET /api/public/platform-settings` — now exposes `allowSellerRegistration`, `allowRiderRegistration`, and `enable3DAR`.

### Backend
- `server/storage.ts:ensureStoreForSeller` — new `allowPendingPromotion` option lets the seller approval flow create a store before the role gets promoted from `buyer` to `seller` (fixes the "User is not a seller" approval error).
- `server/storage.ts:getHeroBanners(storeMode?, placement?)` — extended with a placement filter.
- `server/routes.ts:/api/upload/public` — `purpose=ghana_card` body flag now controls whether portrait uploads get rotated to landscape. Profile photos, store banners, and product images keep their natural orientation.

### Frontend — buyer / discovery
- **Restaurants & Local Vendors page** (`client/src/pages/mobile/MobileAllVendors.tsx`) — Bolt-style layout: sticky DELIVER TO header that requests geolocation and reverse-geocodes via `/api/public/geocode/reverse`, debounced search, sub-tab pill control (All / Restaurants / Local Vendors), cuisine chip row sourced from food-scoped categories, super-admin-managed banner, "Top picks for you" rail, vertical store cards with rating + ETA + distance + delivery fee + minimum order + total sold. Stores sorted by distance ASC when location is set.
- **Bolt-style restaurant detail** (`client/src/pages/mobile/MobileFoodStorePage.tsx`) — hero image with floating back/share pills, overlapping info card with 4-stat strip (Rating / ETA / Away / Sold), sticky horizontal category tabs (scroll-spy), Bolt-style menu rows (text left + 96×96 thumb with `+` button right). `SellerStorePage.tsx` lazy-renders this for mobile food vendors.
- **Bolt-style food product detail** (`client/src/pages/mobile/MobileFoodDetail.tsx`) — hero, title, description, modifier groups from `product_modifiers` (radio for required single-select, checkboxes for `maxSelections > 1`), special-instructions textarea (240 char limit), pill quantity stepper, sticky `Add to cart · GH₵xx.xx` CTA with live-priced total. Required-group validation toasts the missing groups by name. Sends `modifierSelections` + `notes` + `unitPriceWithModifiers` to `/api/cart`. `App.tsx` routes mobile food-vendor products here automatically.
- **Bolt-style food order tracking** (`client/src/pages/mobile/MobileFoodOrderTracking.tsx`) — top-glow hero with status emoji (🧾 → 🍳 → 🍱 → 🛵 → 🎉), live `Arrives in ~N min` chip, 5-step vertical timeline mapping KiyuMart statuses to Bolt vocabulary, rider card with avatar/vehicle/rating/call/chat, items list with modifier summary lines, delivery-to and payment-summary cards. Subscribes to `order_status_changed` / `order_updated` / `rider_assigned` socket events. `OrderTracking.tsx` branches to this for mobile + food orders only.

### Frontend — super admin
- **AdminHeroBanners** split into two tabs: **Homepage** and **Restaurants & Local Vendors**. Each shows its own count and filtered list; new banners inherit the active tab's placement. A 10-icon food emoji library (🛵 🍕 🍔 🍱 🍜 🥘 🍗 🥤 🥗 🍩) is exposed in the dialog when placement is `food_vendors` — tap to append to the title.
- **AdminCategoryManager** — three tabs for super admin: **Stores** / **Restaurants & Local Vendors** / **Pending**. Categories created from each tab pre-scope `storeTypes` automatically. "Seed default cuisines" button on the food tab calls `POST /api/categories/seed-cuisines`. New **Cuisine-specific fields** builder in the dialog (shown only for food-scoped categories) lets super admin define per-cuisine dynamic fields with a per-row editor (internal key + label + type select + required toggle + options for select/multiselect + placeholder for text).
- **Admin All Products** (`AdminProducts.tsx`) — food/restaurant items filtered out. New "Food products" button in the header with a live badge count links to the dedicated page.
- **New page Admin Food Products** (`client/src/pages/AdminFoodProducts.tsx`, route `/admin/food-products`) — mirrors All Products but lists food/restaurant items only. Search, hide/unhide, edit, three stat cards (Total / Visible / Hidden).
- **AdminSettings** — new "Enable 3D & AR Product Features" toggle. Copy notes food vendors are always excluded regardless. When off, all 3D/AR references hide across every dashboard.
- **StoreDetailsPage** — new "Average prep time (minutes)" and "Minimum order (GH₵)" inputs alongside the Store Persona section.

### Frontend — seller
- **SellerProducts.tsx** — variant section now hidden for both `food_beverages` and `restaurant` store types (was only `food_beverages`). FoodImageGallery preset picker available for restaurants too. When a seller picks a food category for a product, that category's `productFieldsConfig` is fetched and merged with the existing storeType-based dynamic fields (deduped by name). The "Get free 3D rotation & AR" guidance card hides when the global toggle is off OR the store is food/restaurant.

### Cross-cutting hardening
- `MobileProductDetails.tsx` — 3D/AR viewer now cross-references the store record (`isFoodVendorStore`) so legacy products without a `storeType` field on the product row are still correctly identified as food and locked out.
- `HeroCarousel.tsx`, `MobileHome.tsx`, `MultiVendorHome.tsx`, `MobileAllCategories.tsx` — all homepage banner / category consumers now request `placement=home` strictly. Food page never shows homepage banners; homepage never shows food banners.
- `MobileAllCategories.tsx`, `MobileHome.tsx`, `MultiVendorHome.tsx` — food-scoped categories are filtered out of the generic "Shop by Category" surface.
- `AdminUsers.tsx` — super-admin "Delete user" confirmation now requires typing `DELETE` before the action button enables. Warns extra-hard for sellers (whose stores get cascade-deleted in the same transaction).
- `MobileAllVendors.tsx` — natural-language copy throughout ("Tap to share your address", "Share your address to see delivery time"). No technical jargon, no hardcoded fees / ETAs / distances / promo text anywhere on the food surfaces.

### Profile & onboarding
- **MobileProfile.tsx** — "Become a Seller" and "Become a Rider" rows now hide when the platform has registration disabled or when external rider mode is on (matches desktop Header gating). Avatar inside the 60×60 wrapper now fills with `object-fit: cover` instead of leaving a 48px gap.

## 2026-05-08 (v1.2.0)

### Banner Promotion Designer
- **Feature:** Visual drag-and-drop Banner Designer for hero carousel promotions
  - Admin can design fully custom hero banners when approving or editing promotion applications
  - `BannerConfig` JSONB field stored on `promotional_ads` table with background, title, subtitle, CTA, overlay, layout, and element positions
  - **Media Library integration:** Background and overlay image pickers pull from the seller/admin's uploaded media library (`GET /api/media-library`)
  - **Free-position dragging:** Title, subtitle, CTA button, and "Sponsored" label can each be dragged anywhere on the banner canvas in the interactive preview
  - `positions` field in `BannerConfig` stores `{ x, y }` percentages per element; `LAYOUT_DEFAULTS` used as fallback when positions are null
  - `InteractivePreview` component uses `setPointerCapture` + `latestPosRef` anti-stale-closure pattern for smooth drag behaviour
  - `PATCH /api/admin/promotions/:id/banner-config` — update banner design post-approval
  - HeroCarousel renders absolutely-positioned elements when `cfg.positions` is set; falls back to flex layout for backward compat

### Message Delete / Edit
- **Feature:** Chat messages can be deleted (soft delete) or edited by the sender
  - `DELETE /api/messages/:messageId` — soft-deletes message; sets `is_deleted` and `deleted_at`; redacts text to "This message was deleted"
  - `PATCH /api/messages/:messageId/edit` — edits message text; sets `is_edited` and `edited_at`
  - Real-time socket events `message_deleted` and `message_edited` propagate changes to all participants instantly
  - Deleted messages display "This message was deleted" placeholder in all chat UIs
  - Edited messages show an "edited" label alongside the message

### Order Cleanup for Buyers
- **Feature:** Buyers can remove pending/unpaid orders
  - `DELETE /api/orders/:id` — hard-deletes the order record if status is `pending` or `created` (buyer-only)
  - AlertDialog confirmation before removal in the Orders page

### Seller Upgrade — Instant Verify
- **Feature:** Seller premium upgrade no longer waits for webhook
  - `POST /api/seller/upgrade/verify` — verifies Paystack reference directly, upgrades plan, returns full `tier-info` in response
  - SellerUpgradeModal calls this endpoint after payment succeeds and seeds TanStack Query cache immediately
  - `hideForPayment` state in modal hides Radix Dialog while Paystack popup is open so the overlay does not block pointer events

### Seller Promotions Redesign
- **Feature:** SellerPromotions page fully rebuilt with tabs: Pending / Active / History
  - `STATUS_CONFIG` map drives status badges and labels for every promotion state
  - `POST /api/seller/promotions/:applicationId/verify-payment` — re-verifies payment reference if application is stuck in `pending_payment`
  - `DELETE /api/seller/promotions/:applicationId` — removes expired or rejected applications
  - Payment receipts display `CalendarCheck` timestamps per promotion

### AddressMap Confirm/Cancel
- **Feature:** Map location selections now require explicit confirmation
  - Clicking the map sets a `pendingLocation` state instead of immediately committing
  - Confirm/Cancel buttons appear at the bottom of the map panel
  - `hideCurrentLocationButton` prop added

### Audio Upload (Super Admin)
- **Feature:** Super admin can upload custom notification and ringtone audio files
  - `POST /api/upload/audio` with MIME validation and `AUDIO_UPLOAD_MAX_BYTES` env-var limit (default 5 MB)
  - 5 new caller ringtone presets, 5 receiver ring presets, and 5 notification presets added to AdminSettings

### Ghanaian Food Presets
- **Feature:** ~40 Ghanaian food product presets added to SellerProducts quick-add panel
  - Categories: Rice & Grains, Soups & Stews, Staples, Proteins, Snacks & Street Food, Beverages

### Database Schema Changes
- `promotional_ads.banner_config` — JSONB column for `BannerConfig`
- `chat_messages.is_deleted` — boolean (default false)
- `chat_messages.deleted_at` — timestamp
- `chat_messages.is_edited` — boolean (default false)
- `chat_messages.edited_at` — timestamp
- All columns added as startup self-heal migrations (`IF NOT EXISTS` blocks in `server/index.ts`)

### Bug Fixes / UX
- SellerDashboard referral now navigates to `/referral` route instead of inline tracker widget
- Sidebar nav for sellers and buyers now includes a "Referral" link
- PaymentSuccess page shows "Items Ordered" card with product thumbnails, variants (color/size), and `ShoppingBag` icon
- DashboardSidebar includes Referral nav item for both seller and buyer roles
- Server startup DB ping with 8 s timeout — skips self-heal migrations if Neon DB is cold rather than hanging

### API Routes Added
```
POST  /api/seller/upgrade/verify                         Verify upgrade payment & return tier-info
POST  /api/seller/promotions/:appId/verify-payment       Re-verify promo payment reference
DELETE /api/seller/promotions/:appId                     Remove expired/rejected promo application
DELETE /api/orders/:id                                   Remove pending/unpaid order (buyer)
DELETE /api/messages/:messageId                          Soft-delete chat message
PATCH  /api/messages/:messageId/edit                     Edit chat message text
PATCH  /api/admin/promotions/:id/banner-config           Update banner designer config
POST   /api/upload/audio                                 Upload custom audio notification files
```

### Verification
- `npm run typecheck` passed
- `npm run build:frontend` passed

---

## 2026-02-21 (v1.1.8)

### Phase 1 Remediation Progress
- **Security/RBAC:** Added super-admin managed per-admin permission APIs and UI controls
  - `GET /api/admin/permissions`
  - `PUT /api/admin/permissions/:userId`
  - Expanded Super Admin permissions page to cover all roles and per-admin permission flags/limits
- **Authorization Hardening:** Applied `requirePermission(...)` checks to high-risk admin routes
  - user management
  - finance/payout visibility routes
  - settings mutation/import routes
  - categories and dispatch control routes
- **Order Tracking Unification:** Reworked legacy `/orders/:id` tracking page to canonical redirect to `/track?orderId=...`
- **Messaging Reliability:** Integrated `messageDeliveryService.queueMessage` into primary REST/socket send paths
- **Role Features Enforcement:** Added and applied `requireRoleFeature(...)` / `requireRoleFeatureIfRole(...)` so super-admin managed role permissions are enforced for all user types (buyer, agent, seller, rider, admin)
- **Promotion Billing Enforcement:** Seller promotion applications now require successful Paystack reference verification before activation
- **Order State Canonicalization:** Legacy `delivering` alias now normalizes to canonical `en_route` with regression test
- **Order Audit Log Integrity:** QR delivery completion route now transitions through the state machine, guaranteeing `order_status_history` writes
- **Revenue KPI Normalization:** Seller sales analytics now counts revenue from delivered + paid orders only
- **Admin Payout RBAC Hardening:** `/api/admin/payouts/pending` and `/api/admin/payouts/:id` now enforce permission middleware
- **Delivery Status Cleanup:** Operational backend/frontend status handling is now canonicalized to `en_route` (legacy aliases remain input-compatible only)
- **Ops Alerts:** Admin messaging stats now include queue/backlog warning flags using configurable thresholds
- **Phase 2 Documentation:** Added `docs/core-data-logic-normalization-phase2.md` (status spec, revenue spec, permission matrix, compatibility audit)
- **Config Externalization (in progress):**
  - server upload limits now env-backed (`PROFILE_IMAGE_MAX_BYTES`, `AUDIO_UPLOAD_MAX_BYTES`, `SUPPORT_MEDIA_MAX_BYTES`)
  - auto-dispatch threshold now env-backed (`AUTO_DISPATCH_MINUTES`)
  - presence service thresholds now env-backed (`PRESENCE_*`)
- **Pricing Consistency:** Processing fee in server order creation and checkout UI now reads `platform_settings.processing_fee_percent`

### Verification
- `npm run typecheck` passed
- `npm run build:frontend` passed
- `server/__tests__/message-delivery-service.test.ts` passed
- `server/__tests__/auth-permission-if-admin.test.ts` passed

---

## 2026-02-10 (v1.1.7)

### Cart Variant Image Display Fix
- **Fix:** Shopping cart now displays correct variant-specific images instead of default product images
  - Cart items now show the image that was selected when the variant was added to cart
  - Added variant information display (color, size) in cart items
  - Updated CartItem interface to include variant fields (variantId, selectedColor, selectedSize, selectedImageIndex)
  - Fixed image selection logic in Cart.tsx and HomeConnected.tsx to use selectedImageIndex

- **Enhancement:** Improved cart user experience with variant details
  - Cart items now display selected color and size information
  - Better visual distinction between different product variants in cart
  - Consistent image display across cart page and cart sidebar

### Database Schema Updates
- **Migration:** Added delivery_duration column to products table
- **Migration:** Added image column to product_variants table for variant-specific images

---

## 2026-02-05 (v1.1.6)

### Automated Rider Payout Notifications & Dashboard Widget
- **Feature:** Real-time Super Admin payout notifications
  - Automatic notification to all Super Admins when a delivery is completed
  - Notification format: "📦 Payout Action Required - Order #1234 delivered by [Rider]. Amount: GHS [Value]. Status: Delivered & Verified."
  - Socket.IO real-time event `admin_payout_pending` for instant alerts
  - Includes order details, rider info, buyer name, and delivery address

- **Feature:** Pending Payouts Dashboard Widget for Super Admin
  - Prominent widget on Super Admin dashboard showing pending payouts
  - Badge indicator showing count of pending approvals
  - Quick approve/reject actions directly from widget
  - Links to view order details and jump to delivery chat
  - Auto-refreshes every 15 seconds

- **Feature:** Rider payout confirmation notifications
  - Riders receive notification when payment is processed
  - Message: "Payment for Order #1234 has been processed. Amount: GHS [Value]"
  - Real-time socket event `payout_completed` for instant notification
  - Rejection notifications with reason included

- **Security:** Super Admin role required for payout approval/rejection
  - `POST /api/admin/rider-payouts/:id/approve` - Super Admin only
  - `POST /api/admin/rider-payouts/:id/reject` - Super Admin only
  - Full audit trail with admin ID logged in transactions

### Audit & Compliance
- Transaction records include admin ID for accountability
- Rejection reasons logged and sent to riders
- All payout actions create audit trail entries

---

## 2026-02-05 (v1.1.5)

### Rider Payouts System with Admin Approval
- **Feature:** Complete rider payout workflow with super admin approval
  - Added `riderPayouts` table for tracking delivery payment earnings
  - Payouts automatically queued with `pending_approval` status on delivery completion
  - Super admin approval required before funds are released (no automatic payments)
  - Admin can approve or reject individual payouts with reason tracking

### Admin Dashboard Improvements
- **Feature:** Standalone Seller Payouts page at `/admin/sellers-payouts`
- **Feature:** Rider Payouts page at `/admin/riders-payouts`
  - View all riders with payout summary (total paid, pending, payout count)
  - Drill down to individual rider payout history
  - Approve/reject pending payouts with confirmation dialogs
  - Alert banner for pending approvals count
- **Feature:** Added "Seller Payouts" and "Rider Payouts" menu items to admin sidebar
- **Fix:** Navbar active state now correctly highlights "Platform Earnings" menu item
- **Fix:** Styled payout pages to match platform theme (removed colorful gradients)

### API Routes Added
- `GET /api/admin/riders-payouts` - List riders with payout summary
- `GET /api/admin/riders/:id/payouts` - Get rider's payout history
- `GET /api/admin/rider-payouts/pending` - Get payouts awaiting approval
- `POST /api/admin/rider-payouts/:id/approve` - Approve and process payout
- `POST /api/admin/rider-payouts/:id/reject` - Reject payout with reason

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
