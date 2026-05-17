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

async function buildTransport(config: ResolvedSmtpConfig) {

  return nodemailer.createTransport({
    host: config.host,
    port: config.port,
    secure: config.secure,
    auth: { user: config.user, pass: config.pass },
  });
}

export async function sendEmail({ to, subject, text, html }: EmailPayload) {
  const smtpConfig = await resolveSmtpConfig();
  const transporter = await buildTransport(smtpConfig);

  const info = await transporter.sendMail({
    from: `${smtpConfig.fromName} <${smtpConfig.fromEmail}>`,
    to,
    subject,
    text,
    html,
  });

  return info;
}

export async function sendPasswordResetEmail(params: {
  to: string;
  resetLink: string;
  platformName: string;
  supportEmail?: string | null;
}) {
  const { to, resetLink, platformName, supportEmail } = params;
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
    <div style="font-family: Arial, sans-serif; color: #0f172a; line-height: 1.6;">
      <h2 style="margin-bottom: 8px;">Reset your ${platformName} password</h2>
      <p>We received a request to reset your ${platformName} password.</p>
      <p style="margin: 24px 0;">
        <a href="${resetLink}" style="background:#10b981;color:#fff;text-decoration:none;padding:12px 18px;border-radius:8px;display:inline-block;">
          Reset Password
        </a>
      </p>
      <p style="font-size: 14px; color:#475569;">If the button doesn't work, copy and paste this link into your browser:</p>
      <p style="font-size: 14px; color:#475569;">${resetLink}</p>
      <p style="font-size: 14px; color:#475569;">If you did not request this, you can ignore this email.</p>
      <p style="font-size: 14px; color:#475569;">${supportLine}</p>
    </div>
  `.trim();

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
  await sendEmail({
    to,
    subject: `${code} is your ${platformName} verification code`,
    text: `Your ${platformName} verification code is: ${code}\n\nThis code expires in 10 minutes. Do not share it with anyone.`,
    html: `
<!DOCTYPE html>
<html>
<head><meta charset="UTF-8"><meta name="viewport" content="width=device-width,initial-scale=1"></head>
<body style="margin:0;padding:0;background:#f4f4f5;font-family:-apple-system,BlinkMacSystemFont,'Segoe UI',sans-serif;">
  <table width="100%" cellpadding="0" cellspacing="0" style="background:#f4f4f5;padding:40px 16px;">
    <tr><td align="center">
      <table width="100%" style="max-width:480px;background:#ffffff;border-radius:16px;overflow:hidden;box-shadow:0 4px 24px rgba(0,0,0,0.08);">
        <!-- Header -->
        <tr><td style="background:#1A4A3C;padding:32px 40px;text-align:center;">
          <h1 style="margin:0;color:#ffffff;font-size:22px;font-weight:800;letter-spacing:-0.3px;">${platformName}</h1>
          <p style="margin:8px 0 0;color:rgba(255,255,255,0.6);font-size:13px;">Email Verification</p>
        </td></tr>
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
