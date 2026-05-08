# Changelog

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
