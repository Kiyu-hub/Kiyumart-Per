# KiyuMart Testing Guide

## Test User Accounts

All test accounts use simple passwords for development/testing purposes only:

| Role | Email | Password | Purpose |
|------|-------|----------|---------|
| **Admin** | admin@kiyumart.com | admin123 | Full platform administration |
| **Seller** | seller@kiyumart.com | seller123 | Product and order management |
| **Rider** | rider@kiyumart.com | rider123 | Delivery management |
| **Agent** | agent@kiyumart.com | agent123 | Customer support |

### Additional Seller Accounts (from marketplace seed)
- seller1@kiyumart.com (Fatima's Boutique) - seller123
- seller2@kiyumart.com (Aisha's Collection) - seller123
- seller3@kiyumart.com (Zainab's Designs) - seller123

## Database Seeding

### Current Database State
- **Users**: 7 accounts (1 admin, 4 sellers, 1 rider, 1 agent)
- **Products**: 15 products (5 products per seller store)
- **Marketplace Banners**: 2 active promotional banners
- **Multi-Vendor Mode**: Enabled

### Available Seeding Endpoints

#### 1. Complete Marketplace Setup (One-Click Setup)
```bash
POST /api/seed/complete-marketplace
```
**What it creates:**
- 3 seller accounts (Fatima's, Aisha's, Zainab's stores)
- 5 products per seller (15 total products)
- 2 marketplace banners
- 1 banner collection

**Note:** Can only be run once. Returns error if sellers already exist.

#### 2. Test User Accounts
```bash
POST /api/seed/test-users
```
**What it creates:**
- Admin account
- Seller account
- Rider account
- Agent account

#### 3. Seller Product Seeding (⚠️ Development Only)
```bash
POST /api/seed/sample-data
Headers: Authentication required (seller role)
```
**What it creates:**
- 10 Islamic fashion products for the logged-in seller
- Includes: Abayas, Hijabs, Dresses
- Products have realistic pricing, stock, and images

**⚠️ WARNING**: This endpoint should be **removed or disabled** in production. It's for development and testing only.

#### 4. Admin Banner Setup
```bash
POST /api/seed/marketplace-setup
Headers: Authentication required (admin role)
```
**What it creates:**
- 1 banner collection
- 3 marketplace promotional banners

## Multi-Vendor Marketplace Features

### Enable Multi-Vendor Mode
Multi-vendor mode is controlled by the `isMultiVendor` flag in platform settings.

**Current Status**: ENABLED

**To toggle:**
```sql
-- Enable multi-vendor mode
UPDATE platform_settings SET is_multi_vendor = true;

-- Disable multi-vendor mode (back to single-store)
UPDATE platform_settings SET is_multi_vendor = false;
```

### What Changes in Multi-Vendor Mode

**When Enabled (`isMultiVendor: true`):**
- Homepage shows marketplace banner carousel
- Seller category grid with store logos
- Global featured products from all sellers
- "Shop by Store" section

**When Disabled (`isMultiVendor: false`):**
- Traditional single-store homepage
- Original category browsing
- Single hero banner carousel
- All products from all sellers still available

## Product Categories

All seeded products belong to these categories:
- **Abayas**: Elegant Black Abaya, Beige Everyday Abaya, Butterfly Abaya
- **Hijabs**: Premium Silk Hijab, Chiffon Hijab Set, Cotton Jersey Hijab
- **Dresses**: Floral Maxi Dress, Modest Summer Dress

## Testing Workflows

### Test Seller Dashboard
1. Log in as `seller@kiyumart.com` with password `seller123`
2. Navigate to Seller Dashboard
3. You'll see the "Add 10 Sample Products" button (if no products exist)
4. Click to seed products
5. Products will appear in your dashboard

### Test Multi-Vendor Homepage
1. Ensure `isMultiVendor = true` in platform settings
2. Visit the homepage (logged out or logged in)
3. You should see:
   - Marketplace banner carousel (2 banners rotating)
   - Seller category cards (3 stores with images)
   - Featured products grid (from all sellers)

### Test Admin Banner Management
1. Log in as `admin@kiyumart.com` with password `admin123`
2. Navigate to Admin Dashboard
3. Access Banner Manager
4. Create banner collections and marketplace banners
5. Schedule banners with start/end dates

## Important Notes

### Production Readiness Checklist

Before deploying to production, you MUST:

1. **Remove/Disable Development Seeding Endpoints:**
   - [ ] Remove or protect `/api/seed/sample-data` endpoint
   - [ ] Remove or protect `/api/seed/complete-marketplace` endpoint
   - [ ] Remove or protect `/api/seed/test-users` endpoint
   - [ ] Remove or protect `/api/seed/marketplace-setup` endpoint

2. **Security:**
   - [ ] Change all test account passwords
   - [ ] Use strong, unique passwords for real accounts
   - [ ] Enable proper authentication on all admin endpoints
   - [ ] Remove test user accounts

3. **Data:**
   - [ ] Clear test/seed data from database
   - [ ] Set up real seller accounts
   - [ ] Upload real product data
   - [ ] Configure real payment gateway credentials

### File Structure
- Seller product seeding UI: `client/src/pages/SellerDashboardConnected.tsx`
- Seeding API endpoints: `server/routes.ts` (lines 866-1200)
- Multi-vendor components: `client/src/pages/MultiVendorHome.tsx`
- Banner carousel: `client/src/components/MarketplaceBannerCarousel.tsx`
- Seller category cards: `client/src/components/SellerCategoryCard.tsx`

## Quick Reset

To reset the database to clean state:
```sql
-- Remove all products
DELETE FROM products;

-- Remove all sellers (keeps admin, rider, agent)
DELETE FROM users WHERE role = 'seller';

-- Remove all banners
DELETE FROM marketplace_banners;
DELETE FROM banner_collections;

-- Disable multi-vendor mode
UPDATE platform_settings SET is_multi_vendor = false;
```

Then run the seeding endpoints again to repopulate.
