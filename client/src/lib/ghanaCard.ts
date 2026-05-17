/**
 * Ghana Card number helpers.
 *
 * Official Ghana Card format (issued by the NIA — National Identification Authority):
 *   GHA-XXXXXXXXX-X
 *   ^^^  ^^^^^^^^^  ^
 *   |    |          └─ 1-digit check digit
 *   |    └──────────── 9-digit serial
 *   └───────────────── 3-letter country prefix (always "GHA")
 *
 * Total: 13 raw characters + 2 hyphens = 15 display characters.
 *
 * formatGhanaCardInput(value)
 *   Idempotent live-typing formatter. Accepts whatever the user has typed
 *   (with or without hyphens, lower- or upper-case) and returns it in the
 *   canonical "GHA-XXXXXXXXX-X" shape, truncated to the maximum length.
 *
 * isValidGhanaCardNumber(value)
 *   Strict format validation. Does NOT validate the check digit against the
 *   NIA's algorithm (that requires a network call); use the NIA endpoint
 *   server-side for true verification.
 */

const PREFIX = "GHA";
const SERIAL_LEN = 9;
const CHECK_LEN = 1;
export const GHANA_CARD_MAX_LENGTH = PREFIX.length + 1 + SERIAL_LEN + 1 + CHECK_LEN; // 15

/** Normalise to upper-case alphanumeric only (strip hyphens / spaces). */
function stripGhanaCard(value: string): string {
  return String(value || "").toUpperCase().replace(/[^A-Z0-9]/g, "");
}

/**
 * Live-typing formatter — apply on every onChange.
 *
 * Examples:
 *   formatGhanaCardInput("g")             → "G"
 *   formatGhanaCardInput("gha")           → "GHA"
 *   formatGhanaCardInput("gha1")          → "GHA-1"
 *   formatGhanaCardInput("gha123456789")  → "GHA-123456789"
 *   formatGhanaCardInput("gha1234567890") → "GHA-123456789-0"
 *   formatGhanaCardInput("GHA-123456789-0-XX") → "GHA-123456789-0" (truncates extras)
 */
export function formatGhanaCardInput(value: string): string {
  const cleaned = stripGhanaCard(value).slice(0, PREFIX.length + SERIAL_LEN + CHECK_LEN);
  if (cleaned.length === 0) return "";

  // Always anchor with GHA prefix once any character is typed. If the user
  // typed something other than letters first, treat it as the start of the
  // serial section so we don't lose digits.
  let head = cleaned.slice(0, PREFIX.length);
  let body = cleaned.slice(PREFIX.length);

  // If the head doesn't match a valid GHA prefix yet (e.g. user typed digits
  // first), accept any leading letters and steal nothing from the digits.
  // Once the user has typed all 3 prefix chars, lock them in. Pre-3-char
  // input is shown as the partial prefix.
  if (cleaned.length <= PREFIX.length) {
    return head;
  }

  // After prefix is complete, lay the remaining digits into serial + check.
  const serial = body.slice(0, SERIAL_LEN);
  const check  = body.slice(SERIAL_LEN, SERIAL_LEN + CHECK_LEN);

  let out = head;
  if (serial.length > 0) out += `-${serial}`;
  if (check.length > 0)  out += `-${check}`;
  return out;
}

const GHANA_CARD_PATTERN = /^GHA-\d{9}-\d$/;

export function isValidGhanaCardNumber(value: string): boolean {
  return GHANA_CARD_PATTERN.test(String(value || "").toUpperCase().trim());
}
