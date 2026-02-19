import { Card } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Button } from "@/components/ui/button";
import { ScrollArea } from "@/components/ui/scroll-area";
import { Avatar, AvatarFallback, AvatarImage } from "@/components/ui/avatar";
import { Send, Phone, MoreVertical, Paperclip } from "lucide-react";
import { useState } from "react";
import { MessageStatusTicks } from "./MessageStatusTicks";
import VoiceRecorderControls from "./VoiceRecorderControls";
import MessageAttachmentContent from "./MessageAttachmentContent";

interface Message {
  id: string;
  text: string;
  sender: "user" | "other";
  timestamp: string;
  isRead?: boolean;
  deliveredAt?: string | null;
  readAt?: string | null;
  status?: 'sent' | 'delivered' | 'read';
}

interface ChatInterfaceProps {
  contactName: string;
  contactStatus?: "online" | "offline";
  contactStatusText?: string;
  contactAvatarUrl?: string;
  isContactTyping?: boolean;
  messages: Message[];
  onSendMessage?: (message: string) => void;
  onTypingChange?: (value: string) => void;
  onSendAudio?: (file: File) => Promise<void> | void;
  isSendingAudio?: boolean;
}

export default function ChatInterface({
  contactName,
  contactStatus = "offline",
  contactStatusText,
  contactAvatarUrl,
  isContactTyping = false,
  messages,
  onSendMessage,
  onTypingChange,
  onSendAudio,
  isSendingAudio = false,
}: ChatInterfaceProps) {
  const [newMessage, setNewMessage] = useState("");

  const handleSend = () => {
    if (newMessage.trim()) {
      onSendMessage?.(newMessage);
      setNewMessage("");
    }
  };

  const handleInputChange = (value: string) => {
    setNewMessage(value);
    onTypingChange?.(value);
  };

  return (
    <Card className="flex flex-col h-[600px] overflow-hidden">
      <div className="flex items-center justify-between gap-4 p-4 border-b">
        <div className="flex items-center gap-3">
          <div className="relative">
            <Avatar>
              <AvatarImage src={contactAvatarUrl} alt={contactName} />
              <AvatarFallback>{contactName.charAt(0)}</AvatarFallback>
            </Avatar>
            <div
              className={`absolute bottom-0 right-0 w-3 h-3 rounded-full border-2 border-background ${
                contactStatus === "online" ? "bg-status-online" : "bg-status-offline"
              }`}
            />
          </div>
          <div>
            <p className="font-semibold" data-testid="text-contact-name">
              {contactName}
            </p>
            <p className="text-xs text-muted-foreground capitalize">
              {isContactTyping ? "typing..." : contactStatusText || contactStatus}
            </p>
          </div>
        </div>
        <div className="flex items-center gap-2">
          <Button variant="ghost" size="icon" data-testid="button-call">
            <Phone className="h-5 w-5" />
          </Button>
          <Button variant="ghost" size="icon" data-testid="button-more">
            <MoreVertical className="h-5 w-5" />
          </Button>
        </div>
      </div>

      <ScrollArea className="flex-1 p-4">
        <div className="space-y-4">
          {messages.map((message) => (
            <div
              key={message.id}
              className={`flex ${message.sender === "user" ? "justify-end" : "justify-start"}`}
            >
              <div
                className={`max-w-[70%] rounded-2xl px-4 py-2 ${
                  message.sender === "user"
                    ? "bg-primary text-primary-foreground"
                    : "bg-muted"
                }`}
                data-testid={`message-${message.id}`}
              >
                <MessageAttachmentContent message={message.text} className="text-sm whitespace-pre-wrap" />
                <div className="flex items-center justify-between gap-2 mt-1">
                  <p
                    className={`text-xs ${
                      message.sender === "user"
                        ? "text-primary-foreground/70"
                        : "text-muted-foreground"
                    }`}
                  >
                    {message.timestamp}
                  </p>
                  {message.sender === "user" && (
                    <MessageStatusTicks 
                      isRead={message.isRead || false} 
                      readAt={message.readAt}
                      deliveredAt={message.deliveredAt}
                      status={message.status}
                      variant="primary"
                    />
                  )}
                </div>
              </div>
            </div>
          ))}
        </div>
      </ScrollArea>

      <div className="p-4 border-t">
        <div className="flex items-center gap-2">
          <Button variant="ghost" size="icon" data-testid="button-attach">
            <Paperclip className="h-5 w-5" />
          </Button>
          <Input
            placeholder="Type a message..."
            value={newMessage}
            onChange={(e) => handleInputChange(e.target.value)}
            onKeyPress={(e) => e.key === "Enter" && handleSend()}
            data-testid="input-message"
          />
          {newMessage.trim() ? (
            <Button size="icon" onClick={handleSend} data-testid="button-send">
              <Send className="h-5 w-5" />
            </Button>
          ) : onSendAudio ? (
            <VoiceRecorderControls onSendAudio={onSendAudio} disabled={isSendingAudio} />
          ) : (
            <Button size="icon" onClick={handleSend} data-testid="button-send" disabled>
              <Send className="h-5 w-5" />
            </Button>
          )}
        </div>
      </div>
    </Card>
  );
}
