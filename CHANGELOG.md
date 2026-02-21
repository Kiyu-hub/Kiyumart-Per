# Changelog

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
