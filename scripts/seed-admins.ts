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
 * - SUPER_ADMIN_PASSWORD (default: SuperAdmin123! - for dev only)
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
      password: process.env.SUPER_ADMIN_PASSWORD || (isDevelopment ? "superadmin123" : ""),
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

      if (existing) {
        console.log(`✓ ${account.role} account already exists: ${account.email}`);
        continue;
      }

      // Hash password
      const hashedPassword = await bcrypt.hash(account.password, 10);

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
      console.error(`✗ Failed to create ${account.role} account:`, error);
    }
  }

  console.log("\n=== Admin Accounts Summary ===");
  for (const account of adminAccounts) {
    console.log(`${account.role}: ${account.email}`);
  }
  if (isDevelopment) {
    console.log("\n📝 Development credentials:");
    console.log("Super Admin: superadmin@kiyumart.com / superadmin123");
    console.log("Admin: admin@kiyumart.com / admin123");
    console.log("\n⚠️  Using default development passwords. Set environment variables for production!");
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
