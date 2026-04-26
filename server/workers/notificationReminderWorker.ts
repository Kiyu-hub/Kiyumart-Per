import { db } from "../../db";
import { orders, users, notifications, platformSettings } from "../../shared/schema";
import { and, eq, lt, isNull, or, gte, not } from "drizzle-orm";
import { sql } from "drizzle-orm";
import { sendEmail } from "../email";
import { getIo } from "../socketManager";
import { sendReferralReminders } from "../services/referralService";

const POLL_INTERVAL = 30 * 60 * 1000; // 30 minutes — fine-grained enough for interview reminders
const REFERRAL_INTERVAL = 15 * 60 * 60 * 1000; // 15 hours
let intervalHandle: ReturnType<typeof setInterval> | null = null;
let referralIntervalHandle: ReturnType<typeof setInterval> | null = null;
let batchRunning = false;

// ── helpers ─────────────────────────────────────────────────────────────────

async function getSettings() {
  const [row] = await db.select({ platformName: platformSettings.platformName }).from(platformSettings).limit(1);
  return { platformName: row?.platformName || "KiyuMart" };
}

async function reminderAlreadySent(userId: string, reminderKey: string): Promise<boolean> {
  const rows = await db
    .select({ id: notifications.id })
    .from(notifications)
    .where(
      and(
        eq(notifications.userId, userId),
        sql`${notifications.metadata}->>'reminderKey' = ${reminderKey}`,
      ),
    )
    .limit(1);
  return rows.length > 0;
}

async function createReminderNotification(
  userId: string,
  title: string,
  message: string,
  reminderKey: string,
  extra: Record<string, any> = {},
) {
  await db.insert(notifications).values({
    userId,
    type: "order",
    title,
    message,
    isRead: false,
    metadata: { reminderKey, ...extra },
  } as any);
}

async function trySendEmail(to: string, subject: string, text: string, html: string) {
  try {
    await sendEmail({ to, subject, text, html });
  } catch {
    // SMTP may not be configured — non-fatal
  }
}

// ── 5-hour payment reminder ──────────────────────────────────────────────────

async function sendPaymentReminders() {
  try {
    const { platformName } = await getSettings();

    const fiveHoursAgo = new Date(Date.now() - 5 * 60 * 60 * 1000);
    const twentyFourHoursAgo = new Date(Date.now() - 24 * 60 * 60 * 1000);

    const staleOrders = await db
      .select({
        id: orders.id,
        orderNumber: orders.orderNumber,
        buyerId: orders.buyerId,
        total: orders.total,
        createdAt: orders.createdAt,
      })
      .from(orders)
      .where(
        and(
          lt(orders.createdAt, fiveHoursAgo),
          gte(orders.createdAt, twentyFourHoursAgo), // max 24h old — after that auto-cancel handles it
          or(
            eq(sql`lower(cast(${orders.paymentStatus} as text))`, "pending"),
            isNull(orders.paymentStatus),
          ),
          or(
            eq(sql`lower(cast(${orders.status} as text))`, "pending"),
            eq(sql`lower(cast(${orders.status} as text))`, "created"),
          ),
        ),
      )
      .limit(50);

    for (const order of staleOrders) {
      try {
        const reminderKey = `payment_reminder_5h_${order.id}`;
        const alreadySent = await reminderAlreadySent(order.buyerId, reminderKey);
        if (alreadySent) continue;

        const notifTitle = "Complete your payment now";
        const notifMessage = `You have an unpaid order #${order.orderNumber} (GHS ${order.total}) waiting. Complete your payment now to secure your items before it expires.`;

        await createReminderNotification(
          order.buyerId,
          notifTitle,
          notifMessage,
          reminderKey,
          { orderId: order.id, orderNumber: order.orderNumber, link: "/checkout" },
        );

        // Real-time push for online users
        const io = getIo();
        if (io) {
          io.to(order.buyerId).emit("notification", {
            type: "default",
            title: notifTitle,
            message: notifMessage,
          });
        }

        // Optional email
        const [buyer] = await db.select({ email: users.email, name: users.name }).from(users).where(eq(users.id, order.buyerId)).limit(1);
        if (buyer?.email) {
          const subject = `${platformName}: Complete your payment for order #${order.orderNumber}`;
          const text = `Hi ${buyer.name || "there"},\n\nYour order #${order.orderNumber} (GHS ${order.total}) is still waiting for payment.\n\nPlease complete your payment to avoid cancellation.\n\n— ${platformName}`;
          const html = `
            <div style="font-family:Arial,sans-serif;color:#0f172a;line-height:1.6;max-width:560px;">
              <h2>Complete your payment</h2>
              <p>Hi ${buyer.name || "there"},</p>
              <p>Your order <strong>#${order.orderNumber}</strong> (GHS ${order.total}) is waiting for payment.</p>
              <p>Please complete your payment soon to avoid automatic cancellation.</p>
              <p style="margin:24px 0;">
                <a href="${process.env.FRONTEND_URL || ""}/checkout" style="background:#10b981;color:#fff;text-decoration:none;padding:12px 18px;border-radius:8px;display:inline-block;">Complete Payment</a>
              </p>
              <p style="font-size:13px;color:#64748b;">— ${platformName}</p>
            </div>`.trim();
          await trySendEmail(buyer.email, subject, text, html);
        }

        console.info(`[REMINDER-WORKER] Payment reminder sent for order ${order.orderNumber}`);
      } catch (err: any) {
        console.error(`[REMINDER-WORKER] Payment reminder failed for order ${order.id}:`, err?.message);
      }
    }
  } catch (err: any) {
    console.error("[REMINDER-WORKER] Payment reminder batch error:", err?.message);
  }
}

// ── Interview reminders ──────────────────────────────────────────────────────

async function sendInterviewReminders() {
  try {
    const { platformName } = await getSettings();
    const now = new Date();

    // Three-day window: 68–76 hours from now
    const threeDayMin = new Date(now.getTime() + 68 * 60 * 60 * 1000);
    const threeDayMax = new Date(now.getTime() + 76 * 60 * 60 * 1000);

    // Day-before window: 20–28 hours from now
    const dayBeforeMin = new Date(now.getTime() + 20 * 60 * 60 * 1000);
    const dayBeforeMax = new Date(now.getTime() + 28 * 60 * 60 * 1000);

    // Hour-before window: 45–75 minutes from now
    const hourBeforeMin = new Date(now.getTime() + 45 * 60 * 1000);
    const hourBeforeMax = new Date(now.getTime() + 75 * 60 * 1000);

    // Ten-minute window: 5–15 minutes from now
    const tenMinMin = new Date(now.getTime() + 5 * 60 * 1000);
    const tenMinMax = new Date(now.getTime() + 15 * 60 * 1000);

    const upcoming = await db
      .select({
        id: users.id,
        email: users.email,
        name: users.name,
        interviewScheduledAt: users.interviewScheduledAt,
        requestedRole: users.requestedRole,
      })
      .from(users)
      .where(
        and(
          eq(sql`lower(cast(${users.applicationStatus} as text))`, "interview_scheduled"),
          not(isNull(users.interviewScheduledAt)),
        ),
      )
      .limit(100);

    for (const applicant of upcoming) {
      if (!applicant.interviewScheduledAt) continue;
      const interviewTime = new Date(applicant.interviewScheduledAt);
      const roleLabel = applicant.requestedRole === "rider" ? "Rider" : "Seller";

      const isThreeDayBefore = interviewTime >= threeDayMin && interviewTime <= threeDayMax;
      const isDayBefore = interviewTime >= dayBeforeMin && interviewTime <= dayBeforeMax;
      const isHourBefore = interviewTime >= hourBeforeMin && interviewTime <= hourBeforeMax;
      const isTenMinBefore = interviewTime >= tenMinMin && interviewTime <= tenMinMax;

      if (!isThreeDayBefore && !isDayBefore && !isHourBefore && !isTenMinBefore) continue;

      const reminderType = isThreeDayBefore
        ? "three_days_before"
        : isDayBefore
        ? "day_before"
        : isHourBefore
        ? "hour_before"
        : "ten_min_before";
      const reminderKey = `interview_reminder_${reminderType}_${applicant.id}`;

      const alreadySent = await reminderAlreadySent(applicant.id, reminderKey);
      if (alreadySent) continue;

      const timeLabel = isThreeDayBefore
        ? `in 3 days (${interviewTime.toLocaleDateString("en-GH", { weekday: "long", month: "short", day: "numeric" })} at ${interviewTime.toLocaleTimeString("en-GH", { hour: "2-digit", minute: "2-digit" })})`
        : isDayBefore
        ? `tomorrow at ${interviewTime.toLocaleTimeString("en-GH", { hour: "2-digit", minute: "2-digit" })}`
        : isHourBefore
        ? `in about 1 hour (${interviewTime.toLocaleTimeString("en-GH", { hour: "2-digit", minute: "2-digit" })})`
        : `in about 10 minutes (${interviewTime.toLocaleTimeString("en-GH", { hour: "2-digit", minute: "2-digit" })})`;

      const title = isThreeDayBefore
        ? "Interview in 3 Days"
        : isDayBefore
        ? "Interview Tomorrow"
        : isHourBefore
        ? "Interview in 1 Hour"
        : "Interview Starting Soon";
      const message = `Your ${roleLabel} application interview is scheduled ${timeLabel}. Please be available and have your documents ready.`;

      await createReminderNotification(applicant.id, title, message, reminderKey, {
        interviewScheduledAt: interviewTime.toISOString(),
        link: "/profile",
      });

      // Real-time push for online users
      const io = getIo();
      if (io) {
        io.to(applicant.id).emit("notification", {
          type: "default",
          title,
          message,
        });
      }

      if (applicant.email) {
        const subject = `${platformName}: ${title} — ${roleLabel} Application`;
        const text = `Hi ${applicant.name || "there"},\n\n${message}\n\n— ${platformName}`;
        const html = `
          <div style="font-family:Arial,sans-serif;color:#0f172a;line-height:1.6;max-width:560px;">
            <h2>${title}</h2>
            <p>Hi ${applicant.name || "there"},</p>
            <p>${message}</p>
            <p style="font-size:13px;color:#64748b;">— ${platformName}</p>
          </div>`.trim();
        await trySendEmail(applicant.email, subject, text, html);
      }

      console.info(`[REMINDER-WORKER] Interview ${reminderType} reminder sent to ${applicant.id}`);
    }
  } catch (err: any) {
    console.error("[REMINDER-WORKER] Interview reminder batch error:", err?.message);
  }
}

// ── Worker entry ─────────────────────────────────────────────────────────────

async function runBatch() {
  await Promise.allSettled([sendPaymentReminders(), sendInterviewReminders()]);
}

export function runNotificationReminderWorker(io?: any) {
  if (intervalHandle) return;
  // Fire immediately on startup, then every 30 minutes
  runBatch().catch((e) => console.error("[REMINDER-WORKER] Initial batch error:", e?.message));
  intervalHandle = setInterval(async () => {
    if (batchRunning) return;
    batchRunning = true;
    try {
      await runBatch();
    } finally {
      batchRunning = false;
    }
  }, POLL_INTERVAL);

  // Referral reminders — fire after 1 minute delay then every 15 hours
  setTimeout(() => {
    sendReferralReminders(io).catch(() => {});
    if (!referralIntervalHandle) {
      referralIntervalHandle = setInterval(() => sendReferralReminders(io).catch(() => {}), REFERRAL_INTERVAL);
    }
  }, 60_000);

  console.info("[BOOT] Notification reminder worker started (payment+interview: 30min, referral: 15h)");
}
