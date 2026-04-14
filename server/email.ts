import nodemailer from "nodemailer";
import { storage } from "./storage";

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
  const pass = String(settings?.smtpPass || process.env.SMTP_PASS || "").trim();
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
