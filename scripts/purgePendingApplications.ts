import { and, eq, inArray, or } from "drizzle-orm";
import { db } from "../db";
import { cart, chatMessages, notifications, orders, products, stores, users, wishlist } from "../shared/schema";

type Candidate = {
  id: string;
  role: string;
  isApproved: boolean | null;
  requestedRole: string | null;
  applicationStatus: string | null;
};

async function main() {
  const pendingStatuses = ["pending", "interview_scheduled"] as const;
  const roleTargets = ["seller", "rider"] as const;

  const candidates = (await db
    .select({
      id: users.id,
      role: users.role,
      isApproved: users.isApproved,
      requestedRole: users.requestedRole,
      applicationStatus: users.applicationStatus,
    })
    .from(users)
    .where(
      and(
        inArray(users.applicationStatus, pendingStatuses as any),
        or(
          inArray(users.requestedRole, roleTargets as any),
          and(inArray(users.role, roleTargets as any), eq(users.isApproved, false)),
        ),
      ),
    )) as Candidate[];

  if (!candidates.length) {
    console.log("No pending seller/rider applications found.");
    return;
  }

  const toDelete = candidates.filter((u) => !u.isApproved);
  const toClear = candidates.filter((u) => Boolean(u.isApproved));

  console.log(
    `[Purge] Found ${candidates.length} pending applications: ${toDelete.length} deletions, ${toClear.length} state-clears.`,
  );

  if (toClear.length) {
    const clearIds = toClear.map((u) => u.id);
    await db
      .update(users)
      .set({
        requestedRole: null,
        applicationStatus: "approved" as any,
        rejectionReason: null,
        interviewScheduledAt: null,
        interviewScheduledBy: null,
      })
      .where(inArray(users.id, clearIds));
    console.log(`[Purge] Cleared pending state for ${clearIds.length} approved accounts.`);
  }

  if (!toDelete.length) {
    console.log("[Purge] No unapproved application accounts to delete.");
    return;
  }

  await db.transaction(async (tx) => {
    for (const applicant of toDelete) {
      const applicantId = applicant.id;
      await tx.delete(chatMessages).where(or(eq(chatMessages.senderId, applicantId), eq(chatMessages.receiverId, applicantId)));
      await tx.delete(cart).where(eq(cart.userId, applicantId));
      await tx.delete(wishlist).where(eq(wishlist.userId, applicantId));
      await tx.delete(notifications).where(eq(notifications.userId, applicantId));

      if (String(applicant.role || "").toLowerCase() === "seller") {
        const sellerStores = await tx
          .select({ id: stores.id })
          .from(stores)
          .where(eq(stores.primarySellerId, applicantId));
        for (const store of sellerStores) {
          await tx.delete(products).where(eq(products.storeId, store.id));
          await tx.delete(stores).where(eq(stores.id, store.id));
        }
      }

      await tx.delete(orders).where(or(eq(orders.buyerId, applicantId), eq(orders.riderId, applicantId)));
      await tx.delete(users).where(eq(users.id, applicantId));
    }
  });

  console.log(`[Purge] Deleted ${toDelete.length} unapproved pending applicant accounts.`);
}

main()
  .then(() => process.exit(0))
  .catch((error) => {
    console.error("[Purge] Failed:", error);
    process.exit(1);
  });

