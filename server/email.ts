import nodemailer from "nodemailer";
import { storage } from "./storage";
import { decryptField } from "./utils/sensitiveEncrypt";

type EmailPayload = {
  to: string;
  subject: string;
  text: string;
  html?: string;
};

function requireConfigured(value: string | number | boolean | null | undefined, label: string) {
  const trimmed = String(value || "").trim();
  if (!trimmed) {
    throw new Error(`${label} is not configured`);
  }
  return trimmed;
}

type ResolvedSmtpConfig = {
  host: string;
  port: number;
  user: string;
  pass: string;
  secure: boolean;
  fromName: string;
  fromEmail: string;
};

async function resolveSmtpConfig(): Promise<ResolvedSmtpConfig> {
  const settings = await storage.getPlatformSettings().catch(() => null as any);
  const host = String(settings?.smtpHost || process.env.SMTP_HOST || "").trim();
  const portValue = settings?.smtpPort ?? process.env.SMTP_PORT;
  const port = Number(requireConfigured(portValue, "SMTP port"));
  const user = String(settings?.smtpUser || process.env.SMTP_USER || "").trim();
  const pass = decryptField(String(settings?.smtpPass || process.env.SMTP_PASS || "").trim());
  const secureSource =
    settings?.smtpSecure !== undefined && settings?.smtpSecure !== null
      ? settings.smtpSecure
      : process.env.SMTP_SECURE;
  const secureFlag = String(secureSource || "").trim().toLowerCase();
  const secure = secureFlag === "true" || secureSource === true || (Number.isFinite(port) && port === 465);
  const fromName = String(settings?.smtpFromName || process.env.SMTP_FROM_NAME || "KiyuMart").trim();
  const fromEmail = String(settings?.smtpFromEmail || process.env.SMTP_FROM_EMAIL || "").trim();

  return {
    host: requireConfigured(host, "SMTP host"),
    port,
    user: requireConfigured(user, "SMTP user"),
    pass: requireConfigured(pass, "SMTP password"),
    secure,
    fromName,
    fromEmail: requireConfigured(fromEmail, "SMTP from email"),
  };
}

/**
 * Resolve the display name + from-address used by every provider. Falls back to
 * the SMTP_* values so a single Gmail sender identity works everywhere.
 */
function resolveSender(settings: any): { fromName: string; fromEmail: string } {
  const fromName = String(settings?.smtpFromName || process.env.SMTP_FROM_NAME || "KiyuMart").trim() || "KiyuMart";
  const fromEmail = String(
    settings?.smtpFromEmail || process.env.SMTP_FROM_EMAIL || settings?.smtpUser || process.env.SMTP_USER || "",
  ).trim();
  return { fromName, fromEmail };
}

/**
 * Resolves the platform logo URL for email headers. Prefers the light (white)
 * logo since the email header band is dark. Falls back through the other logo
 * fields, then to null (templates render the platform name as text instead).
 */
async function getEmailBranding(): Promise<{ platformName: string; logoUrl: string | null }> {
  const s = await storage.getPlatformSettings().catch(() => null as any);
  const platformName = String(s?.platformName || "KiyuMart").trim() || "KiyuMart";
  const raw = String(s?.logoLight || s?.logo || s?.logoDark || "").trim();
  const logoUrl = /^https?:\/\//i.test(raw) ? raw : null;
  return { platformName, logoUrl };
}

/** Dark branded header band with the logo (or the platform name as fallback). */
function brandedHeader(platformName: string, logoUrl: string | null, subtitle: string): string {
  const brand = logoUrl
    ? `<img src="${logoUrl}" alt="${platformName}" height="40" style="height:40px;max-height:40px;width:auto;border:0;display:inline-block;" />`
    : `<h1 style="margin:0;color:#ffffff;font-size:22px;font-weight:800;letter-spacing:-0.3px;">${platformName}</h1>`;
  return `
        <tr><td style="background:#1A4A3C;padding:32px 40px;text-align:center;">
          ${brand}
          <p style="margin:12px 0 0;color:rgba(255,255,255,0.65);font-size:13px;">${subtitle}</p>
        </td></tr>`;
}

/** fetch() with an abort-based timeout so a dead provider fails fast, never hangs. */
async function fetchWithTimeout(url: string, init: RequestInit, timeoutMs = 12000): Promise<Response> {
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), timeoutMs);
  try {
    return await fetch(url, { ...init, signal: controller.signal });
  } finally {
    clearTimeout(timer);
  }
}

/**
 * Brevo (Sendinblue) transactional email over HTTPS. Works on hosts that block
 * outbound SMTP ports (e.g. Render). Verify a single sender address in Brevo —
 * no custom domain required. Set BREVO_API_KEY to enable.
 */
async function sendViaBrevo(apiKey: string, payload: EmailPayload, fromName: string, fromEmail: string) {
  const res = await fetchWithTimeout("https://api.brevo.com/v3/smtp/email", {
    method: "POST",
    headers: { "api-key": apiKey, "content-type": "application/json", accept: "application/json" },
    body: JSON.stringify({
      sender: { name: fromName, email: fromEmail },
      to: [{ email: payload.to }],
      subject: payload.subject,
      htmlContent: payload.html || undefined,
      textContent: payload.text,
    }),
  });
  if (!res.ok) {
    const body = await res.text().catch(() => "");
    throw new Error(`Brevo email failed (${res.status}): ${body.slice(0, 300)}`);
  }
  return { provider: "brevo", messageId: (await res.json().catch(() => ({})))?.messageId };
}

/**
 * Resend transactional email over HTTPS. Requires a verified domain for custom
 * from-addresses. Set RESEND_API_KEY to enable.
 */
async function sendViaResend(apiKey: string, payload: EmailPayload, fromName: string, fromEmail: string) {
  const res = await fetchWithTimeout("https://api.resend.com/emails", {
    method: "POST",
    headers: { authorization: `Bearer ${apiKey}`, "content-type": "application/json" },
    body: JSON.stringify({
      from: `${fromName} <${fromEmail}>`,
      to: [payload.to],
      subject: payload.subject,
      html: payload.html || undefined,
      text: payload.text,
    }),
  });
  if (!res.ok) {
    const body = await res.text().catch(() => "");
    throw new Error(`Resend email failed (${res.status}): ${body.slice(0, 300)}`);
  }
  return { provider: "resend", messageId: (await res.json().catch(() => ({})))?.id };
}

/** SMTP via nodemailer with fast-fail timeouts (used for local dev or hosts that allow SMTP). */
async function sendViaSmtp(payload: EmailPayload) {
  const config = await resolveSmtpConfig();
  const transporter = nodemailer.createTransport({
    host: config.host,
    port: config.port,
    secure: config.secure,
    auth: { user: config.user, pass: config.pass },
    // Fail fast instead of hanging ~30s when the host blocks outbound SMTP.
    connectionTimeout: 8000,
    greetingTimeout: 8000,
    socketTimeout: 12000,
  });
  const info = await transporter.sendMail({
    from: `${config.fromName} <${config.fromEmail}>`,
    to: payload.to,
    subject: payload.subject,
    text: payload.text,
    html: payload.html,
  });
  return { provider: "smtp", messageId: info.messageId };
}

/**
 * Sends an email via the first configured provider, in priority order:
 *   1. Brevo   (BREVO_API_KEY)   — HTTPS, works behind SMTP-blocked hosts
 *   2. Resend  (RESEND_API_KEY)  — HTTPS, requires verified domain
 *   3. SMTP    (SMTP_* / DB)     — fallback for local dev / SMTP-allowed hosts
 *
 * HTTP providers are preferred because platforms like Render block outbound
 * SMTP ports, which otherwise makes every OTP / reset email time out.
 */
export async function sendEmail(payload: EmailPayload) {
  const settings = await storage.getPlatformSettings().catch(() => null as any);
  const { fromName, fromEmail } = resolveSender(settings);

  const brevoKey = String(process.env.BREVO_API_KEY || "").trim();
  const resendKey = String(process.env.RESEND_API_KEY || "").trim();

  if (brevoKey) {
    if (!fromEmail) throw new Error("Email sender address is not configured (set SMTP_FROM_EMAIL)");
    return sendViaBrevo(brevoKey, payload, fromName, fromEmail);
  }
  if (resendKey) {
    if (!fromEmail) throw new Error("Email sender address is not configured (set SMTP_FROM_EMAIL)");
    return sendViaResend(resendKey, payload, fromName, fromEmail);
  }
  return sendViaSmtp(payload);
}

export async function sendPasswordResetEmail(params: {
  to: string;
  resetLink: string;
  platformName: string;
  supportEmail?: string | null;
}) {
  const { to, resetLink, supportEmail } = params;
  const { logoUrl, platformName: resolvedName } = await getEmailBranding();
  const platformName = resolvedName || params.platformName;
  const subject = `${platformName} Password Reset`;
  const supportLine = supportEmail ? `If you need help, contact ${supportEmail}.` : "If you need help, contact support.";
  const text = [
    `We received a request to reset your ${platformName} password.`,
    "",
    `Reset your password: ${resetLink}`,
    "",
    "If you did not request this, you can ignore this email.",
    supportLine,
  ].join("\n");

  const html = `
<!DOCTYPE html>
<html>
<head><meta charset="UTF-8"><meta name="viewport" content="width=device-width,initial-scale=1"></head>
<body style="margin:0;padding:0;background:#f4f4f5;font-family:-apple-system,BlinkMacSystemFont,'Segoe UI',sans-serif;">
  <table width="100%" cellpadding="0" cellspacing="0" style="background:#f4f4f5;padding:40px 16px;">
    <tr><td align="center">
      <table width="100%" style="max-width:480px;background:#ffffff;border-radius:16px;overflow:hidden;box-shadow:0 4px 24px rgba(0,0,0,0.08);">
        <!-- Header -->${brandedHeader(platformName, logoUrl, "Password Reset")}
        <!-- Body -->
        <tr><td style="padding:40px;">
          <p style="margin:0 0 8px;color:#111827;font-size:15px;font-weight:600;">Reset your password</p>
          <p style="margin:0 0 28px;color:#6b7280;font-size:14px;line-height:1.6;">We received a request to reset your ${platformName} password. Click the button below to choose a new one.</p>
          <div style="text-align:center;margin-bottom:28px;">
            <a href="${resetLink}" style="background:#10b981;color:#ffffff;text-decoration:none;padding:14px 28px;border-radius:10px;display:inline-block;font-weight:700;font-size:15px;">Reset Password</a>
          </div>
          <p style="margin:0 0 6px;color:#9ca3af;font-size:13px;">If the button doesn't work, copy and paste this link:</p>
          <p style="margin:0 0 24px;color:#2563eb;font-size:13px;word-break:break-all;">${resetLink}</p>
          <p style="margin:0;color:#9ca3af;font-size:13px;line-height:1.6;">If you did not request this, you can safely ignore this email. ${supportLine}</p>
        </td></tr>
        <!-- Footer -->
        <tr><td style="background:#f9fafb;padding:20px 40px;border-top:1px solid #f3f4f6;">
          <p style="margin:0;color:#9ca3af;font-size:12px;text-align:center;">&copy; ${new Date().getFullYear()} ${platformName}. All rights reserved.</p>
        </td></tr>
      </table>
    </td></tr>
  </table>
</body>
</html>`.trim();

  return sendEmail({ to, subject, text, html });
}

export async function sendOtpEmail({
  to,
  code,
  platformName,
}: {
  to: string;
  code: string;
  platformName: string;
}) {
  const { logoUrl, platformName: resolvedName } = await getEmailBranding();
  const brand = resolvedName || platformName;
  await sendEmail({
    to,
    subject: `${code} is your ${brand} verification code`,
    text: `Your ${brand} verification code is: ${code}\n\nThis code expires in 10 minutes. Do not share it with anyone.`,
    html: `
<!DOCTYPE html>
<html>
<head><meta charset="UTF-8"><meta name="viewport" content="width=device-width,initial-scale=1"></head>
<body style="margin:0;padding:0;background:#f4f4f5;font-family:-apple-system,BlinkMacSystemFont,'Segoe UI',sans-serif;">
  <table width="100%" cellpadding="0" cellspacing="0" style="background:#f4f4f5;padding:40px 16px;">
    <tr><td align="center">
      <table width="100%" style="max-width:480px;background:#ffffff;border-radius:16px;overflow:hidden;box-shadow:0 4px 24px rgba(0,0,0,0.08);">
        <!-- Header -->${brandedHeader(brand, logoUrl, "Email Verification")}
        <!-- Body -->
        <tr><td style="padding:40px;">
          <p style="margin:0 0 8px;color:#111827;font-size:15px;font-weight:600;">Here is your verification code</p>
          <p style="margin:0 0 32px;color:#6b7280;font-size:14px;line-height:1.6;">Enter this code in the app to verify your email address. It expires in <strong>10 minutes</strong>.</p>
          <!-- OTP box -->
          <div style="background:#f9fafb;border:2px dashed #d1d5db;border-radius:12px;padding:24px;text-align:center;margin-bottom:32px;">
            <span style="font-size:40px;font-weight:900;letter-spacing:10px;color:#1A4A3C;">${code}</span>
          </div>
          <p style="margin:0;color:#9ca3af;font-size:13px;line-height:1.6;">If you did not request this code, you can safely ignore this email. Never share this code with anyone.</p>
        </td></tr>
        <!-- Footer -->
        <tr><td style="background:#f9fafb;padding:20px 40px;border-top:1px solid #f3f4f6;">
          <p style="margin:0;color:#9ca3af;font-size:12px;text-align:center;">&copy; ${new Date().getFullYear()} ${platformName}. All rights reserved.</p>
        </td></tr>
      </table>
    </td></tr>
  </table>
</body>
</html>`,
  });
}
