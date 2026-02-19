import { Check, CheckCheck } from "lucide-react";

interface MessageStatusTicksProps {
  isRead?: boolean;
  readAt?: string | null;
  deliveredAt?: string | null;
  status?: 'sent' | 'delivered' | 'read';
  className?: string;
  variant?: 'primary' | 'default'; // For color styling on different backgrounds
}

/**
 * WhatsApp-style message status indicators
 * ✓ = sent (gray)
 * ✓✓ = delivered (gray)
 * ✓✓ = read (blue)
 */
export function MessageStatusTicks({ 
  isRead, 
  readAt, 
  deliveredAt, 
  status, 
  className = "",
  variant = "default"
}: MessageStatusTicksProps) {
  // Derive status from timestamps and isRead flag
  const getStatus = (): "sent" | "delivered" | "read" => {
    if (isRead || readAt) return "read";
    if (deliveredAt || status === "delivered") return "delivered";
    return "sent";
  };

  const derivedStatus = getStatus();
  
  // Variant-aware colors (primary for light text on colored backgrounds)
  const getSentColor = () => variant === "primary" ? "text-primary-foreground/70" : "text-muted-foreground";
  const getDeliveredColor = () => variant === "primary" ? "text-primary-foreground/70" : "text-muted-foreground";
  const getReadColor = () => variant === "primary" ? "text-sky-300" : "text-sky-500";

  // Sent: single gray check
  if (derivedStatus === "sent") {
    return (
      <Check 
        className={`h-4 w-4 ${getSentColor()} ${className}`}
        data-testid="status-tick-sent"
      />
    );
  }

  // Delivered: double gray check
  if (derivedStatus === "delivered") {
    return (
      <CheckCheck 
        className={`h-4 w-4 ${getDeliveredColor()} ${className}`}
        data-testid="status-tick-delivered"
      />
    );
  }

  // Read: double blue check
  return (
    <CheckCheck 
      className={`h-4 w-4 ${getReadColor()} ${className}`}
      data-testid="status-tick-read"
    />
  );
}
