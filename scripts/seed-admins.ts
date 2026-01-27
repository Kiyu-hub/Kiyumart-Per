import "dotenv/config";
import { db } from "../db";
import { users } from "../shared/schema";
import bcrypt from "bcryptjs";
import { eq } from "drizzle-orm";

/**
 * Seeds static admin accounts using environment variables
 * 
 * Required Environment Variables:
 * - SUPER_ADMIN_EMAIL (default: superadmin@kiyumart.com)
 * - SUPER_ADMIN_PASSWORD (set this via environment; no default printed to avoid exposure)
 * - ADMIN_EMAIL (default: admin@kiyumart.com)
 * - ADMIN_PASSWORD (default: Admin123! - for dev only)
 * 
 * Usage:
 * Development: npm run seed:admins
 * Production: Set environment variables first, then run the script
 * 
 * IMPORTANT: Always use strong, unique passwords in production!
 */

async function seedAdminAccounts() {
  console.log("Starting admin account seeding...");

  // Read credentials from environment variables with fallbacks for development
  const isDevelopment = process.env.NODE_ENV !== "production";
  
  if (!isDevelopment && (!process.env.SUPER_ADMIN_PASSWORD || !process.env.ADMIN_PASSWORD)) {
    console.error("❌ ERROR: Admin passwords must be set via environment variables in production!");
    console.error("Please set SUPER_ADMIN_PASSWORD and ADMIN_PASSWORD environment variables.");
    process.exit(1);
  }

  const adminAccounts = [
    {
      email: process.env.SUPER_ADMIN_EMAIL || "superadmin@kiyumart.com",
      password: process.env.SUPER_ADMIN_PASSWORD || (isDevelopment ? "" : ""),
      name: "Super Administrator",
      role: "super_admin" as const,
      phone: "+233000000001",
    },
    {
      email: process.env.ADMIN_EMAIL || "admin@kiyumart.com",
      password: process.env.ADMIN_PASSWORD || (isDevelopment ? "admin123" : ""),
      name: "Administrator",
      role: "admin" as const,
      phone: "+233000000002",
    },
  ];

  for (const account of adminAccounts) {
    try {
      // Check if account already exists
      const existing = await db.query.users.findFirst({
        where: eq(users.email, account.email),
      });

      // Hash password up-front so we can create or update consistently
      const hashedPassword = await bcrypt.hash(account.password, 10);

      if (existing) {
        // Update existing account password and ensure it's active + approved
        await db.update(users).set({
          password: hashedPassword,
          isActive: true,
          isApproved: true,
          name: account.name,
          role: account.role,
          phone: account.phone,
        }).where(eq(users.email, account.email));

        console.log(`✓ Updated ${account.role} account password: ${account.email}`);
        continue;
      }

      // Create account
      await db.insert(users).values({
        email: account.email,
        password: hashedPassword,
        name: account.name,
        role: account.role,
        phone: account.phone,
        isActive: true,
        isApproved: true,
      });

      console.log(`✓ Created ${account.role} account: ${account.email}`);
      console.log(`  Password: ${account.password}`);
    } catch (error) {
      console.error(`✗ Failed to create/update ${account.role} account:`, error);
    }
  }

  console.log("\n=== Admin Accounts Summary ===");
  for (const account of adminAccounts) {
    console.log(`${account.role}: ${account.email}`);
  }
  if (isDevelopment) {
    console.log("\n📝 Development credentials:");
    console.log(`Super Admin: ${adminAccounts[0].email} (password configured via SUPER_ADMIN_PASSWORD env var)`);
    console.log(`Admin: ${adminAccounts[1].email} (password configured via ADMIN_PASSWORD env var)`);
    console.log("\n⚠️  Using development passwords. Set environment variables for production!");
  }
  console.log("===============================\n");
}

// Run the seed function
seedAdminAccounts()
  .then(() => {
    console.log("Admin seeding completed successfully");
    process.exit(0);
  })
  .catch((error) => {
    console.error("Admin seeding failed:", error);
    process.exit(1);
  });
