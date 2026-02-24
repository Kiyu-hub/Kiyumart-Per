const CHAT_ATTACHMENT_PREFIX = "__CHAT_ATTACHMENT__:";
const SUPPORT_ATTACHMENT_PREFIX = "__SUPPORT_ATTACHMENT__:";

function attachmentLabelFromKind(kind: string): string {
  switch (kind) {
    case "image":
      return "Sent an image";
    case "video":
      return "Sent a video";
    case "audio":
      return "Sent a voice note";
    case "file":
      return "Sent a file";
    default:
      return "Sent an attachment";
  }
}

export function formatNotificationMessage(raw: string): string {
  const message = String(raw || "").trim();
  if (!message) return "";

  const supportIdx = message.indexOf(SUPPORT_ATTACHMENT_PREFIX);
  const chatIdx = message.indexOf(CHAT_ATTACHMENT_PREFIX);
  const prefixIdx =
    supportIdx >= 0 && chatIdx >= 0 ? Math.min(supportIdx, chatIdx) : supportIdx >= 0 ? supportIdx : chatIdx;

  if (prefixIdx < 0) return message;

  const isSupport = prefixIdx === supportIdx;
  const prefix = isSupport ? SUPPORT_ATTACHMENT_PREFIX : CHAT_ATTACHMENT_PREFIX;
  const payload = message.slice(prefixIdx + prefix.length);
  let label = "Sent an attachment";

  try {
    const parsed = JSON.parse(decodeURIComponent(payload));
    label = attachmentLabelFromKind(String(parsed?.kind || "").toLowerCase());
  } catch {
    label = "Sent an attachment";
  }

  const senderPrefix = message.slice(0, prefixIdx).trim().replace(/:\s*$/, "");
  return senderPrefix ? `${senderPrefix}: ${label}` : label;
}
