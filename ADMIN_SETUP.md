# Admin Account Setup Guide

This guide explains how to create and manage static admin accounts for KiyuMart.

## Overview

The admin seeding script (`scripts/seed-admins.ts`) creates two permanent admin accounts:
- **Super Administrator** - Full platform control
- **Administrator** - Standard admin access

These accounts persist even after exporting the project to other environments.

## Quick Start (Development)

For local development, simply run:

```bash
tsx scripts/seed-admins.ts
```

This will create default admin accounts with the following credentials:

**Super Admin:**
- Email: `superadmin@kiyumart.com`
- Password: `Smart@3990`

**Admin:**
- Email: `admin@kiyumart.com`
- Password: `admin123`

## Production Setup

### Step 1: Set Environment Variables

For production, you **must** set custom credentials using environment variables:

```bash
# In Replit Secrets or your .env file
SUPER_ADMIN_EMAIL=your-super-admin@yourdomain.com
SUPER_ADMIN_PASSWORD=your-very-strong-password-here
ADMIN_EMAIL=your-admin@yourdomain.com
ADMIN_PASSWORD=another-strong-password-here
```

### Step 2: Run the Seed Script

```bash
NODE_ENV=production tsx scripts/seed-admins.ts
```

The script will:
- ✅ Check if accounts already exist (won't create duplicates)
- ✅ Hash passwords securely with bcrypt
- ✅ Create accounts with proper roles and permissions
- ✅ Display a summary of created accounts

## Important Security Notes

⚠️ **DO NOT** use the default development passwords in production!

⚠️ **DO** use strong, unique passwords for each admin account

⚠️ **DO** store credentials securely (use Replit Secrets for production)

⚠️ **DO** change passwords immediately after first login if needed

## Environment Variables Reference

| Variable | Description | Required | Default (Dev Only) |
|----------|-------------|----------|-------------------|
| `SUPER_ADMIN_EMAIL` | Super admin email address | No | superadmin@kiyumart.com |
| `SUPER_ADMIN_PASSWORD` | Super admin password | Yes (prod) | Smart@3990 |
| `ADMIN_EMAIL` | Admin email address | No | admin@kiyumart.com |
| `ADMIN_PASSWORD` | Admin password | Yes (prod) | admin123 |

## Script Behavior

### First Run
- Creates both admin accounts
- Displays credentials summary
- Marks accounts as active and approved

### Subsequent Runs
- Skips existing accounts (based on email)
- Only creates missing accounts
- Safe to run multiple times

## Verifying Admin Accounts

After seeding, you can verify the accounts by:

1. Navigate to `/login`
2. Enter the admin email and password
3. You should be redirected to the admin dashboard

## Troubleshooting

### "Admin passwords must be set via environment variables"
- **Cause**: Running in production mode without setting password environment variables
- **Solution**: Set `SUPER_ADMIN_PASSWORD` and `ADMIN_PASSWORD` environment variables

### "Account already exists"
- **Cause**: Admin accounts were already created
- **Solution**: This is normal. The script safely skips existing accounts

### "Failed to create account"
- **Cause**: Database connection or validation error
- **Solution**: Check database connection and ensure all required fields are valid

## Exporting to Other Platforms

When exporting your project:

1. Copy the `scripts/seed-admins.ts` file
2. Set up environment variables in the new platform
3. Run the seed script after deploying the database
4. Keep credentials secure using the platform's secret management

## Example: Replit Deployment

1. Go to your Replit project's Secrets
2. Add the four environment variables:
   - `SUPER_ADMIN_EMAIL`
   - `SUPER_ADMIN_PASSWORD`
   - `ADMIN_EMAIL`
   - `ADMIN_PASSWORD`
3. Open the Shell and run:
   ```bash
   tsx scripts/seed-admins.ts
   ```

## Advanced: Customizing Admin Accounts

To add more admin accounts or customize the seed script, edit `scripts/seed-admins.ts` and add new account objects to the `adminAccounts` array:

```typescript
{
  email: process.env.CUSTOM_ADMIN_EMAIL || "custom@example.com",
  password: process.env.CUSTOM_ADMIN_PASSWORD || "",
  name: "Custom Admin Name",
  role: "admin" as const,
  phone: "+233000000003",
}
```

---

**Last Updated**: November 2025
**Maintainer**: KiyuMart Development Team
