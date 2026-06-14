import type { Response } from "express";

/**
 * Classifies whether an error represents an infrastructure / database failure
 * (as opposed to a client-side validation error).
 *
 * This exists because the codebase historically used a blanket
 * `catch (e) { res.status(400).json({ error: e.message }) }` pattern, which
 * reported server-side outages (DB paused, connection dropped, DNS failure) as
 * HTTP 400 "Bad Request" — telling the client it sent a bad request when the
 * real problem was the backend. It also leaked internal DB details (host names,
 * tenant refs) straight to the client.
 */
export function isInfraError(err: any): boolean {
  if (!err) return false;
  const code = String(err.code ?? "").toUpperCase();
  const msg = String(err.message ?? "").toLowerCase();

  // Node / DNS / socket level connection failures
  const networkCodes = [
    "ENOTFOUND",
    "ECONNREFUSED",
    "ECONNRESET",
    "ETIMEDOUT",
    "EAI_AGAIN",
    "EPIPE",
    "EHOSTUNREACH",
    "ENETUNREACH",
  ];
  if (networkCodes.includes(code)) return true;

  // PostgreSQL connection-exception class (08xxx), operator-intervention (57Pxx),
  // and internal-error (XX000 — what the Supabase pooler returns for a paused or
  // missing project: "Tenant or user not found").
  if (code.startsWith("08")) return true;
  if (code === "57P01" || code === "57P02" || code === "57P03") return true;
  if (code === "XX000") return true;

  // Message-level fallbacks for drivers that wrap the above without a clean code.
  if (
    msg.includes("tenant or user not found") ||
    msg.includes("tenant/user") ||
    msg.includes("connection terminated") ||
    msg.includes("connection refused") ||
    msg.includes("could not connect") ||
    msg.includes("timed out") ||
    msg.includes("econnrefused") ||
    msg.includes("too many connections") ||
    msg.includes("server closed the connection")
  ) {
    return true;
  }

  return false;
}

/**
 * Sends a JSON error response with a status code that reflects the *kind* of
 * failure:
 *   - infrastructure / DB outages → 503, with the internal message hidden
 *   - everything else             → `fallbackStatus` (default 400), with the
 *                                    error's own message preserved for the client
 *
 * Drop-in replacement for `res.status(400).json({ error: err.message })`.
 */
export function sendApiError(
  res: Response,
  err: any,
  fallbackStatus = 400,
  fallbackMessage = "Request failed",
): void {
  if (isInfraError(err)) {
    res.status(503).json({
      error: "Service temporarily unavailable. Please try again in a moment.",
      code: "SERVICE_UNAVAILABLE",
    });
    return;
  }
  const message = err && err.message ? String(err.message) : fallbackMessage;
  res.status(fallbackStatus).json({ error: message });
}
