import { db } from "../db";
import { and, desc, eq, sql } from "drizzle-orm";
import { notifications, systemActivityLogs, users } from "@shared/schema";

type SystemSeverity = "info" | "warning" | "error" | "critical";
type SystemCategory =
  | "api"
  | "auth"
  | "user"
  | "product"
  | "order"
  | "payment"
  | "payout"
  | "media"
  | "security"
  | "worker"
  | "webhook"
  | "database"
  | "system";

interface LogSystemActivityInput {
  category: SystemCategory | string;
  severity?: SystemSeverity | string;
  title: string;
  message: string;
  humanExplanation?: string | null;
  rootCause?: string | null;
  suggestedFix?: string | null;
  preventiveAction?: string | null;
  source?: string | null;
  entityType?: string | null;
  entityId?: string | null;
  actorId?: string | null;
  actorRole?: string | null;
  fingerprint?: string | null;
  metadata?: Record<string, any> | null;
}

const severityWeight: Record<SystemSeverity, number> = {
  info: 0,
  warning: 1,
  error: 2,
  critical: 3,
};

function normalizeSeverity(severity?: string | null): SystemSeverity {
  const normalized = String(severity || "").toLowerCase().trim();
  if (normalized === "warning" || normalized === "error" || normalized === "critical") {
    return normalized;
  }
  return "info";
}

function cleanText(value?: string | null, fallback = "") {
  return String(value || fallback).trim();
}

function buildFingerprint(input: LogSystemActivityInput) {
  const source = cleanText(input.source, "unknown_source");
  const category = cleanText(input.category, "system");
  const entityType = cleanText(input.entityType, "generic");
  const entityId = cleanText(input.entityId, "none");
  const title = cleanText(input.title, "activity");
  const severity = normalizeSeverity(input.severity);
  return `${category}::${severity}::${source}::${entityType}::${entityId}::${title}`;
}

async function notifyAdminsOfIssue(activityId: string, title: string, message: string, severity: SystemSeverity) {
  if (severity !== "error" && severity !== "critical") return;

  const recipients = await db
    .select({ id: users.id })
    .from(users)
    .where(
      and(
        eq(users.isActive, true),
        sql`${users.role} in ('admin', 'super_admin')`,
      ),
    );

  if (!recipients.length) return;

  const link = `/admin/system-activities?focus=${activityId}`;

  await Promise.all(
    recipients.map((recipient) =>
      db.insert(notifications).values({
        userId: recipient.id,
        type: "system",
        title,
        message,
        metadata: {
          link,
          activityId,
          severity,
          category: "system_activities",
        },
      }),
    ),
  );
}

export async function logSystemActivity(input: LogSystemActivityInput) {
  const severity = normalizeSeverity(input.severity);
  const fingerprint = cleanText(input.fingerprint, buildFingerprint(input));
  const now = new Date();
  const basePayload = {
    category: cleanText(input.category, "system"),
    severity,
    title: cleanText(input.title, "System activity"),
    message: cleanText(input.message, "Activity captured"),
    humanExplanation: cleanText(input.humanExplanation || "", "") || null,
    rootCause: cleanText(input.rootCause || "", "") || null,
    suggestedFix: cleanText(input.suggestedFix || "", "") || null,
    preventiveAction: cleanText(input.preventiveAction || "", "") || null,
    source: cleanText(input.source || "", "") || null,
    entityType: cleanText(input.entityType || "", "") || null,
    entityId: cleanText(input.entityId || "", "") || null,
    actorId: cleanText(input.actorId || "", "") || null,
    actorRole: cleanText(input.actorRole || "", "") || null,
    fingerprint,
    metadata: (input.metadata && typeof input.metadata === "object" ? input.metadata : {}) as Record<string, any>,
  };

  const isIssue = severity !== "info";

  if (isIssue) {
    const [existing] = await db
      .select()
      .from(systemActivityLogs)
      .where(
        and(
          eq(systemActivityLogs.fingerprint, fingerprint),
          eq(systemActivityLogs.isResolved, false),
        ),
      )
      .orderBy(desc(systemActivityLogs.lastSeenAt))
      .limit(1);

    if (existing) {
      const nextSeverity =
        severityWeight[severity] > severityWeight[normalizeSeverity(existing.severity)]
          ? severity
          : normalizeSeverity(existing.severity);

      const [updated] = await db
        .update(systemActivityLogs)
        .set({
          severity: nextSeverity,
          title: basePayload.title,
          message: basePayload.message,
          humanExplanation: basePayload.humanExplanation,
          rootCause: basePayload.rootCause,
          suggestedFix: basePayload.suggestedFix,
          preventiveAction: basePayload.preventiveAction,
          source: basePayload.source,
          entityType: basePayload.entityType,
          entityId: basePayload.entityId,
          actorId: basePayload.actorId,
          actorRole: basePayload.actorRole as any,
          occurrenceCount: Math.max(1, Number(existing.occurrenceCount || 1)) + 1,
          lastSeenAt: now,
          metadata: {
            ...((existing.metadata as Record<string, any> | null) || {}),
            ...basePayload.metadata,
          },
          updatedAt: now,
        })
        .where(eq(systemActivityLogs.id, existing.id))
        .returning();

      return updated;
    }
  }

  const [created] = await db
    .insert(systemActivityLogs)
    .values({
      ...basePayload,
      actorRole: basePayload.actorRole as any,
      occurrenceCount: 1,
      isResolved: !isIssue,
      firstSeenAt: now,
      lastSeenAt: now,
      updatedAt: now,
    })
    .returning();

  await notifyAdminsOfIssue(
    created.id,
    severity === "critical" ? "Critical system issue detected" : "System issue detected",
    `${created.title}: ${created.message}`,
    severity,
  );

  return created;
}

export async function captureApiActivity(input: {
  method: string;
  path: string;
  statusCode: number;
  duration: number;
  actorId?: string | null;
  actorRole?: string | null;
  metadata?: Record<string, any>;
}) {
  const method = cleanText(input.method, "GET").toUpperCase();
  const path = cleanText(input.path, "/api/unknown");
  const statusCode = Number(input.statusCode || 0);
  const duration = Number(input.duration || 0);
  const isError = statusCode >= 500;
  const isWarning = !isError && statusCode >= 400;
  const isSlow = duration >= 3000;
  const isMutation = ["POST", "PUT", "PATCH", "DELETE"].includes(method);

  if (!isError && !isWarning && !isSlow && !isMutation) {
    return null;
  }

  const severity: SystemSeverity = isError ? "error" : isWarning ? "warning" : isSlow ? "warning" : "info";
  const rootCause =
    statusCode === 401 || statusCode === 403
      ? "The request was blocked by authentication or authorization rules."
      : statusCode === 408
        ? "The request timed out before the server could finish processing it."
        : statusCode >= 500
          ? "The server encountered an internal failure while processing the request."
          : isSlow
            ? "The request completed, but slower than the expected threshold."
            : "The request completed normally.";

  return logSystemActivity({
    category: statusCode === 401 || statusCode === 403 ? "security" : "api",
    severity,
    title: `${method} ${path}`,
    message: `Request finished with status ${statusCode} in ${duration}ms`,
    humanExplanation:
      severity === "info"
        ? "A write or other significant API action completed and was recorded for auditing."
        : severity === "warning"
          ? "The API request was rejected, unusually slow, or needs attention."
          : "The API request failed on the server and needs investigation.",
    rootCause,
    suggestedFix:
      statusCode >= 500
        ? "Inspect the related backend handler, database operation, and integration logs for this endpoint."
        : statusCode === 401 || statusCode === 403
          ? "Review the user session, permissions, and route protection for this request."
          : isSlow
            ? "Check query performance, retries, and external dependency latency for this endpoint."
            : "No immediate action required.",
    preventiveAction:
      statusCode >= 500
        ? "Keep backend validation, defensive guards, and integration monitoring enabled for this area."
        : "Continue monitoring similar requests for repeated anomalies.",
    source: path,
    actorId: input.actorId || null,
    actorRole: input.actorRole || null,
    fingerprint: severity === "info" ? null : `${method}::${path}::${statusCode}`,
    metadata: {
      method,
      path,
      statusCode,
      duration,
      ...(input.metadata || {}),
    },
  });
}
