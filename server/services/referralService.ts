import { db } from "../../db/index";
import { users, referrals, referralRewards, platformSettings, notifications, promotionalAds } from "@shared/schema";
import { eq, and, sql, count } from "drizzle-orm";
import crypto from "crypto";

const platformSettingsTable = platformSettings;

function generateReferralCode(): string {
  return crypto.randomBytes(5).toString("base64url").toUpperCase().slice(0, 8);
}

function generateDiscountCode(): string {
  return "REF" + crypto.randomBytes(4).toString("hex").toUpperCase();
}

export async function getOrCreateReferralCode(userId: string): Promise<string> {
  const [user] = await db.select({ referralCode: users.referralCode }).from(users).where(eq(users.id, userId)).limit(1);
  if (!user) throw new Error("User not found");
  if (user.referralCode) return user.referralCode;

  // Generate unique code
  let code = generateReferralCode();
  let attempts = 0;
  while (attempts < 5) {
    const [existing] = await db.select({ id: users.id }).from(users).where(eq(users.referralCode, code)).limit(1);
    if (!existing) break;
    code = generateReferralCode();
    attempts++;
  }

  await db.update(users).set({ referralCode: code }).where(eq(users.id, userId));
  return code;
}

export async function getReferralSettings() {
  const [settings] = await db.select().from(platformSettingsTable).limit(1);
  return {
    referralEnabled: settings?.referralEnabled ?? false,
    referralEnabledSingleStore: settings?.referralEnabledSingleStore ?? true,
    referralEnabledMultiVendor: settings?.referralEnabledMultiVendor ?? true,
    referralCustomerThreshold: settings?.referralCustomerThreshold ?? 5,
    referralSellerThreshold: settings?.referralSellerThreshold ?? 10,
    referralRewardPercent: Number(settings?.referralRewardPercent ?? 10),
    referralSellerPromoHours: settings?.referralSellerPromoHours ?? 24,
    isMultiVendor: settings?.isMultiVendor ?? false,
  };
}

export async function recordReferralSignup(referralCode: string, newUserId: string, io?: any): Promise<void> {
  if (!referralCode || !newUserId) return;

  // Find referrer
  const [referrer] = await db.select({ id: users.id, name: users.name, role: users.role }).from(users).where(eq(users.referralCode, referralCode)).limit(1);
  if (!referrer || referrer.id === newUserId) return;

  // Don't duplicate
  const [existing] = await db.select({ id: referrals.id }).from(referrals).where(eq(referrals.referredUserId, newUserId)).limit(1);
  if (existing) return;

  await db.insert(referrals).values({
    referrerId: referrer.id,
    referredUserId: newUserId,
    status: "signed_up",
  });

  const settings = await getReferralSettings();
  const isSeller = referrer.role === "seller";
  const threshold = isSeller ? settings.referralSellerThreshold : settings.referralCustomerThreshold;

  // Count how many have already signed up via this referrer
  const [{ total: signedUpCount }] = await db
    .select({ total: count() })
    .from(referrals)
    .where(eq(referrals.referrerId, referrer.id));

  // Notify referrer that someone signed up with their link
  try {
    const referrerNotif = {
      type: "system",
      title: "Someone Joined via Your Referral Link",
      message: `A new user signed up using your referral link. They need to make a purchase for it to count. You have ${signedUpCount} referral(s) so far (goal: ${threshold}).`,
    };
    await db.insert(notifications).values({
      userId: referrer.id,
      type: "system" as const,
      title: referrerNotif.title,
      message: referrerNotif.message,
      isRead: false,
      metadata: { kind: "referral_signup" } as any,
    });
    io?.to(referrer.id).emit("notification", referrerNotif);
  } catch {}

  // Notify the new user about the referral discount opportunity and encourage them to share their own link
  try {
    const rewardDesc = isSeller
      ? `your referrer earns a free promotion`
      : `your referrer earns a ${settings.referralRewardPercent}% discount reward`;
    const newUserNotif = {
      type: "system",
      title: "Welcome! You Were Referred",
      message: `You joined via a referral link — great start! When you make your first purchase, ${rewardDesc}. You also have your own referral link in your profile. Share it with friends and earn your own rewards when they shop!`,
    };
    await db.insert(notifications).values({
      userId: newUserId,
      type: "system" as const,
      title: newUserNotif.title,
      message: newUserNotif.message,
      isRead: false,
      metadata: { kind: "referral_welcome" } as any,
    });
    io?.to(newUserId).emit("notification", newUserNotif);
  } catch {}
}

export async function checkAndCompleteReferral(buyerId: string, io?: any): Promise<void> {
  // Find signed_up referral for this buyer
  const [referral] = await db
    .select()
    .from(referrals)
    .where(and(eq(referrals.referredUserId, buyerId), eq(referrals.status, "signed_up")))
    .limit(1);
  if (!referral) return;

  // Mark as completed
  await db.update(referrals).set({ status: "completed", completedAt: new Date() }).where(eq(referrals.id, referral.id));

  // Notify referrer that their referred user made a purchase
  try {
    const settings = await getReferralSettings();
    const [referrer] = await db.select({ id: users.id, role: users.role }).from(users).where(eq(users.id, referral.referrerId)).limit(1);
    if (referrer) {
      const isSeller = referrer.role === "seller";
      const threshold = isSeller ? settings.referralSellerThreshold : settings.referralCustomerThreshold;
      const [{ total: completedCount }] = await db
        .select({ total: count() })
        .from(referrals)
        .where(and(eq(referrals.referrerId, referral.referrerId), eq(referrals.status, "completed")));
      const remaining = Math.max(0, threshold - (completedCount % threshold || threshold));
      const progressMsg = remaining === 0
        ? "You've hit the reward threshold! Claim your reward from your dashboard."
        : `${completedCount} completed so far. ${remaining} more to go before your next reward.`;
      const purchaseNotif = {
        type: "system",
        title: "Your Referral Made a Purchase!",
        message: `Someone you referred just completed their first order. ${progressMsg}`,
      };
      await db.insert(notifications).values({
        userId: referral.referrerId,
        type: "system" as const,
        title: purchaseNotif.title,
        message: purchaseNotif.message,
        isRead: false,
        metadata: { kind: "referral_purchase", referredUserId: buyerId } as any,
      });
      io?.to(referral.referrerId).emit("notification", purchaseNotif);
    }
  } catch {}

  // Check if referrer has now hit the threshold → create reward
  await checkAndCreateReward(referral.referrerId, io);
}

async function checkAndCreateReward(referrerId: string, io?: any): Promise<void> {
  const settings = await getReferralSettings();

  const [referrer] = await db.select({ id: users.id, role: users.role }).from(users).where(eq(users.id, referrerId)).limit(1);
  if (!referrer) return;

  const isSeller = referrer.role === "seller";
  const threshold = isSeller ? settings.referralSellerThreshold : settings.referralCustomerThreshold;

  // Count completed referrals
  const [{ total }] = await db
    .select({ total: count() })
    .from(referrals)
    .where(and(eq(referrals.referrerId, referrerId), eq(referrals.status, "completed")));

  if (total < threshold) return;
  if (total % threshold !== 0) return; // Only reward at each threshold multiple

  // Check if we already issued a reward for this exact batch
  const [{ rewardCount }] = await db
    .select({ rewardCount: count() })
    .from(referralRewards)
    .where(eq(referralRewards.userId, referrerId));

  const expectedRewards = Math.floor(total / threshold);
  if (rewardCount >= expectedRewards) return; // Already rewarded

  const rewardType = isSeller ? "promotion" : "discount";
  const expiresAt = new Date(Date.now() + 30 * 24 * 60 * 60 * 1000); // 30 days to claim

  const [reward] = await db.insert(referralRewards).values({
    userId: referrerId,
    type: rewardType,
    rewardPercent: isSeller ? null : String(settings.referralRewardPercent),
    rewardDurationHours: isSeller ? settings.referralSellerPromoHours : null,
    status: "pending",
    discountCode: rewardType === "discount" ? generateDiscountCode() : null,
    expiresAt,
  }).returning();

  // Send in-app notification
  try {
    const rewardNotif = {
      type: "system",
      title: "Referral Reward Earned!",
      message: isSeller
        ? `You've successfully referred ${threshold} new customers. You've earned ${settings.referralSellerPromoHours} hours of free promotion! Claim it from your dashboard.`
        : `You've referred ${threshold} friends who made purchases! You've earned ${settings.referralRewardPercent}% off your next order. Claim your discount code in your dashboard.`,
    };
    await db.insert(notifications).values({
      userId: referrerId,
      type: "system" as const,
      title: rewardNotif.title,
      message: rewardNotif.message,
      isRead: false,
      metadata: { rewardId: reward.id, type: rewardType } as any,
    });
    io?.to(referrerId).emit("notification", rewardNotif);
  } catch {}
}

export async function claimReward(
  rewardId: string,
  userId: string,
  promoOptions?: { promotionType: "store" | "product"; targetId: string }
): Promise<{ discountCode?: string; message: string }> {
  const [reward] = await db
    .select()
    .from(referralRewards)
    .where(and(eq(referralRewards.id, rewardId), eq(referralRewards.userId, userId)))
    .limit(1);

  if (!reward) throw new Error("Reward not found");
  if (reward.status === "claimed") throw new Error("Reward already claimed");
  if (reward.status === "expired") throw new Error("Reward has expired");
  if (reward.expiresAt && new Date() > reward.expiresAt) {
    await db.update(referralRewards).set({ status: "expired" }).where(eq(referralRewards.id, rewardId));
    throw new Error("Reward has expired");
  }

  if (reward.type === "discount") {
    await db.update(referralRewards).set({ status: "claimed", claimedAt: new Date() }).where(eq(referralRewards.id, rewardId));
    return { discountCode: reward.discountCode!, message: `Discount code ${reward.discountCode} claimed. Use it at checkout.` };
  }

  // Promotion reward — create a promotional ad
  if (!promoOptions) throw new Error("Promotion target required to claim this reward");

  const durationHours = reward.rewardDurationHours ?? 24;
  const startAt = new Date();
  const endAt = new Date(startAt.getTime() + durationHours * 60 * 60 * 1000);

  await db.insert(promotionalAds).values({
    type: promoOptions.promotionType,
    targetId: promoOptions.targetId,
    createdBy: userId,
    startAt,
    endAt,
    isActive: true,
    title: `Referral Reward — ${durationHours}h Promotion`,
  });

  await db.update(referralRewards)
    .set({ status: "claimed", claimedAt: new Date(), promotionType: promoOptions.promotionType, promotionTargetId: promoOptions.targetId })
    .where(eq(referralRewards.id, rewardId));

  return { message: `${durationHours}-hour promotion activated from ${startAt.toLocaleString()} to ${endAt.toLocaleString()}.` };
}

export async function getReferralStats(userId: string) {
  const code = await getOrCreateReferralCode(userId);
  const settings = await getReferralSettings();

  const [user] = await db.select({ role: users.role }).from(users).where(eq(users.id, userId)).limit(1);
  const isSeller = user?.role === "seller";
  const threshold = isSeller ? settings.referralSellerThreshold : settings.referralCustomerThreshold;

  const allReferrals = await db.select().from(referrals).where(eq(referrals.referrerId, userId));
  const completed = allReferrals.filter((r) => r.status === "completed").length;
  const signedUp = allReferrals.filter((r) => r.status === "signed_up").length;

  const rewards = await db.select().from(referralRewards).where(eq(referralRewards.userId, userId));

  return {
    referralCode: code,
    completed,
    signedUp,
    threshold,
    rewardPercent: settings.referralRewardPercent,
    rewardDurationHours: settings.referralSellerPromoHours,
    isSeller,
    rewards: rewards.map((r) => ({
      id: r.id,
      type: r.type,
      status: r.status,
      discountCode: r.discountCode,
      rewardPercent: r.rewardPercent ? Number(r.rewardPercent) : null,
      rewardDurationHours: r.rewardDurationHours,
      claimedAt: r.claimedAt,
      expiresAt: r.expiresAt,
      createdAt: r.createdAt,
    })),
  };
}

export async function getAdminReferralReport() {
  const allReferrals = await db
    .select({
      id: referrals.id,
      referrerId: referrals.referrerId,
      referredUserId: referrals.referredUserId,
      status: referrals.status,
      completedAt: referrals.completedAt,
      createdAt: referrals.createdAt,
      referrerName: users.name,
      referrerEmail: users.email,
      referrerRole: users.role,
    })
    .from(referrals)
    .leftJoin(users, eq(referrals.referrerId, users.id))
    .orderBy(referrals.createdAt);

  const allRewards = await db
    .select({
      id: referralRewards.id,
      userId: referralRewards.userId,
      type: referralRewards.type,
      status: referralRewards.status,
      rewardPercent: referralRewards.rewardPercent,
      rewardDurationHours: referralRewards.rewardDurationHours,
      claimedAt: referralRewards.claimedAt,
      expiresAt: referralRewards.expiresAt,
      discountCode: referralRewards.discountCode,
      createdAt: referralRewards.createdAt,
      userName: users.name,
      userEmail: users.email,
    })
    .from(referralRewards)
    .leftJoin(users, eq(referralRewards.userId, users.id))
    .orderBy(referralRewards.createdAt);

  const totalReferrals = allReferrals.length;
  const totalCompleted = allReferrals.filter((r) => r.status === "completed").length;
  const totalRewards = allRewards.length;
  const totalClaimed = allRewards.filter((r) => r.status === "claimed").length;

  return { totalReferrals, totalCompleted, totalRewards, totalClaimed, referrals: allReferrals, rewards: allRewards };
}

export async function sendReferralReminders(io?: any) {
  try {
    const settings = await getReferralSettings();
    if (!settings.referralEnabled) return;

    const fifteenHoursAgo = new Date(Date.now() - 15 * 60 * 60 * 1000);

    // Get all eligible users (buyers + sellers) where notification is due
    const eligibleUsers = await db
      .select({ id: users.id, name: users.name, role: users.role })
      .from(users)
      .where(
        and(
          eq(users.isActive, true),
          sql`(${users.lastReferralNotificationAt} IS NULL OR ${users.lastReferralNotificationAt} < ${fifteenHoursAgo})`
        )
      );

    for (const user of eligibleUsers) {
      const isSeller = user.role === "seller";

      // Skip roles that don't participate
      if (!["buyer", "seller"].includes(user.role)) continue;

      const threshold = isSeller ? settings.referralSellerThreshold : settings.referralCustomerThreshold;
      const rewardDesc = isSeller
        ? `${settings.referralSellerPromoHours} hours of free store promotion`
        : `${settings.referralRewardPercent}% off your next order`;

      const message = isSeller
        ? `Share your referral link and refer ${threshold} new customers to earn ${rewardDesc} for your store. Every buyer you bring counts!`
        : `Share your referral link and earn ${rewardDesc} when ${threshold} friends sign up and make a purchase!`;

      try {
        await db.insert(notifications).values({
          userId: user.id,
          type: "system",
          title: "Earn a Reward — Share Your Referral Link",
          message,
          isRead: false,
          metadata: { kind: "referral_reminder" },
        });

        // Real-time push via socket
        if (io) {
          io.to(user.id).emit("notification", {
            type: "system",
            title: "Earn a Reward — Share Your Referral Link",
            message,
          });
        }

        // Update last notification time
        await db.update(users).set({ lastReferralNotificationAt: new Date() }).where(eq(users.id, user.id));
      } catch {}
    }

    console.info(`[Referral] Sent reminders to ${eligibleUsers.length} eligible users`);
  } catch (err: any) {
    console.error("[Referral] Reminder job error:", err?.message);
  }
}
