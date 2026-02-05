# Changelog

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
