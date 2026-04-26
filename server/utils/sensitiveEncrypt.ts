/**
 * AES-256-GCM encryption for sensitive platform settings stored in the database.
 * Requires SETTINGS_ENCRYPTION_KEY env variable (32+ char string).
 * Fields are stored with "ENC:" prefix to distinguish encrypted from plaintext.
 */
import { createCipheriv, createDecipheriv, randomBytes } from "crypto";

const ALGORITHM = "aes-256-gcm";
const ENC_PREFIX = "ENC:";

function getKey(): Buffer | null {
  const raw = process.env.SETTINGS_ENCRYPTION_KEY;
  if (!raw || raw.length < 16) return null;
  // Pad/truncate to exactly 32 bytes
  return Buffer.from(raw.padEnd(32, "0").slice(0, 32));
}

export function isEncrypted(value: unknown): boolean {
  return typeof value === "string" && value.startsWith(ENC_PREFIX);
}

/**
 * Encrypts a plaintext string. Returns the plaintext unchanged if encryption
 * key is not configured, or if the value is already encrypted.
 */
export function encryptField(plaintext: string): string {
  if (!plaintext || isEncrypted(plaintext)) return plaintext;
  const key = getKey();
  if (!key) return plaintext; // No key configured — store plaintext (degraded mode)

  const iv = randomBytes(12);
  const cipher = createCipheriv(ALGORITHM, key, iv);
  const encrypted = Buffer.concat([cipher.update(plaintext, "utf8"), cipher.final()]);
  const tag = cipher.getAuthTag();
  // Layout: 12 bytes IV | 16 bytes GCM tag | ciphertext
  const combined = Buffer.concat([iv, tag, encrypted]);
  return `${ENC_PREFIX}${combined.toString("base64")}`;
}

/**
 * Decrypts an encrypted field. Returns the value unchanged if it is not
 * prefixed with ENC: (plain-text fallback) or if the key is missing.
 */
export function decryptField(value: string): string {
  if (!value || !isEncrypted(value)) return value;
  const key = getKey();
  if (!key) return value; // Cannot decrypt — return raw (will be unusable, but won't crash)

  try {
    const data = Buffer.from(value.slice(ENC_PREFIX.length), "base64");
    const iv = data.subarray(0, 12);
    const tag = data.subarray(12, 28);
    const encrypted = data.subarray(28);
    const decipher = createDecipheriv(ALGORITHM, key, iv);
    decipher.setAuthTag(tag);
    return decipher.update(encrypted).toString("utf8") + decipher.final("utf8");
  } catch {
    console.error("[CRYPTO] Failed to decrypt sensitive field — key mismatch or corrupted value");
    return ""; // Return empty rather than exposing ciphertext
  }
}

/**
 * Returns a masked display value for sensitive fields.
 * Shows last 4 chars of plaintext to help admin identify which credential is configured.
 */
export function maskField(value: string): string {
  if (!value) return "";
  const plain = isEncrypted(value) ? "[encrypted]" : value;
  if (plain === "[encrypted]") return "••••••••";
  if (plain.length <= 4) return "••••";
  return `${"•".repeat(8)}${plain.slice(-4)}`;
}
