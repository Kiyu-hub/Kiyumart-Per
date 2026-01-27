# Test User Credentials for KiyuMart

This document contains test login credentials for all user roles in the KiyuMart platform. Use these credentials to test and verify each role's dashboard functionality.

## Test Accounts

### 1. Super Admin Account
**Email:** `superadmin@kiyumart.com`  
**Password:** (configured via `SUPER_ADMIN_PASSWORD` environment variable)  
**Dashboard URL:** `/admin`

**Access & Features:**
- FULL platform access with elevated permissions
- Manage admins and assign roles
- Edit user passwords
- All admin features plus special permissions
- Platform-wide control

---

### 2. Admin Account
**Email:** `admin@kiyumart.com`  
**Password:** `admin123`  
**Dashboard URL:** `/admin`

**Access & Features:**
- Full platform access
- Product management
- Order management  
- User management
- Rider management
- Delivery zones configuration
- Analytics and reports
- Platform settings
- Messaging center

---

### 3. Seller Account
**Email:** `seller@kiyumart.com`  
**Password:** `seller123`  
**Dashboard URL:** `/seller`

**Access & Features:**
- Manage own products
- View own orders
- Sales analytics
- Product inventory tracking
- Customer messages
- Delivery tracking
- Store settings

**Store Details:**
- Store Name: Test Fashion Store
- Description: Premium Islamic fashion for modern women. Quality abayas, hijabs, and modest wear.

---

### 4. Rider Account (Dispatch)
**Email:** `rider@kiyumart.com`  
**Password:** `rider123`  
**Dashboard URL:** `/rider`

**Access & Features:**
- View assigned deliveries
- Update delivery status
- Active route tracking
- Earnings dashboard
- Customer contact info
- Location tracking

**Vehicle Info:**
- Type: Motorcycle
- Plate Number: GR-1234-20
- License: DL-TEST-001

---

### 5. Agent Account (Support)
**Email:** `agent@kiyumart.com`  
**Password:** `agent123`  
**Dashboard URL:** `/agent`

**Access & Features:**
- Handle customer support tickets
- Manage customer inquiries
- Access messaging center
- View order issues
- Provide customer assistance

---

## How to Use

1. **Login:**
   - Navigate to `/auth` or click the login button
   - Enter the email and password for the role you want to test
   - Click "Sign In"

2. **Access Dashboard:**
   - After login, you'll be redirected based on your role
   - Or manually navigate to the dashboard URL for your role

3. **Test Features:**
   - All accounts are fully activated and approved
   - Sellers can create products, manage inventory
   - Riders can view and manage deliveries
   - Admins have full platform control

## Important Notes

- All test accounts have `isActive: true` and `isApproved: true`
- Passwords are securely hashed using bcrypt
- Each role has proper authentication and authorization checks
- Role-based access control is enforced on both frontend and backend

## Security

⚠️ **These are test credentials for development/testing only!**
- Do not use these in production
- Change or delete these accounts before deploying to production
- Always use strong, unique passwords for production accounts

## Troubleshooting

If you can't log in:
1. Verify you're using the correct email and password
2. Check that the account exists in the database
3. Ensure the app is running (workflow: "Start application")
4. Clear browser cookies and try again

---

Created: November 3, 2025  
Platform: KiyuMart - Islamic Fashion E-commerce Marketplace
