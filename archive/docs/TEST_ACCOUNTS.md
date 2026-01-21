# KiyuMart Test Accounts

All test accounts have been created and are ready for testing.

## Test Credentials (All 6 User Roles)

### 1. Super Admin Account
- **Email**: superadmin@kiyumart.com
- **Password**: Smart@3990
- **Features**: FULL platform access, manage admins, assign roles, edit passwords, all admin features plus special permissions

### 2. Admin Account
- **Email**: admin@kiyumart.com
- **Password**: admin123
- **Features**: Full platform control, manage users, products, orders, settings, analytics

### 3. Seller Account
- **Email**: seller@kiyumart.com
- **Password**: seller123
- **Features**: Manage own products, view orders, handle deliveries, analytics, media library

### 4. Buyer Account
- **Email**: buyer@kiyumart.com
- **Password**: buyer123
- **Features**: Browse products, place deliveries, track deliveries, manage wishlist

### 5. Rider Account
- **Email**: rider@kiyumart.com
- **Password**: rider123
- **Features**: View assigned deliveries, update delivery status, track routes, earnings

### 6. Agent (Support) Account
- **Email**: agent@kiyumart.com
- **Password**: agent123
- **Features**: Handle support tickets, manage customer inquiries, access messages

## How to Test

1. Navigate to `/auth` in your browser
2. Use the credentials above to login with any role
3. Each role will redirect to its respective dashboard with role-specific features

## Creating Additional Test Accounts

To recreate or reset all test accounts, use the seed endpoint:

```bash
curl -X POST http://localhost:5000/api/seed/test-users
```

This will create/verify all 6 test accounts.

---
Last Updated: November 2025
