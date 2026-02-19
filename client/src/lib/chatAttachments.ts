export interface ChatAttachment {
  kind: "image" | "video" | "audio" | "file";
  url: string;
  name: string;
  size: number;
}

export const CHAT_ATTACHMENT_PREFIX = "__CHAT_ATTACHMENT__:";

export function buildChatAttachmentMessage(attachment: ChatAttachment): string {
  return `${CHAT_ATTACHMENT_PREFIX}${encodeURIComponent(JSON.stringify(attachment))}`;
}

export function parseChatAttachmentMessage(rawMessage: string): ChatAttachment | null {
  if (!rawMessage?.startsWith(CHAT_ATTACHMENT_PREFIX)) return null;
  try {
    const payload = rawMessage.slice(CHAT_ATTACHMENT_PREFIX.length);
    const parsed = JSON.parse(decodeURIComponent(payload));
    if (!parsed?.url || !parsed?.kind) return null;
    return parsed as ChatAttachment;
  } catch {
    return null;
  }
}
