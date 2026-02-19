import { parseChatAttachmentMessage } from "@/lib/chatAttachments";

interface MessageAttachmentContentProps {
  message: string;
  className?: string;
}

export default function MessageAttachmentContent({ message, className = "" }: MessageAttachmentContentProps) {
  const attachment = parseChatAttachmentMessage(message);

  if (!attachment) {
    return <p className={className}>{message}</p>;
  }

  if (attachment.kind === "audio") {
    return (
      <div className="space-y-2">
        <audio src={attachment.url} controls className="w-full max-w-xs" />
        <p className="text-xs opacity-80">{attachment.name}</p>
      </div>
    );
  }

  if (attachment.kind === "image") {
    return (
      <div className="space-y-2">
        <img src={attachment.url} alt={attachment.name} className="max-h-56 rounded-md border object-cover" />
        <p className="text-xs opacity-80">{attachment.name}</p>
      </div>
    );
  }

  if (attachment.kind === "video") {
    return (
      <div className="space-y-2">
        <video src={attachment.url} controls className="max-h-64 rounded-md border" />
        <p className="text-xs opacity-80">{attachment.name}</p>
      </div>
    );
  }

  return (
    <a href={attachment.url} target="_blank" rel="noreferrer" className="text-sm underline">
      {attachment.name}
    </a>
  );
}
