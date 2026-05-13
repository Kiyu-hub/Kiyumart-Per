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
    if (isRead || readAt || status === "read") return "read";
    if (deliveredAt || status === "delivered") return "delivered";
    return "sent";
  };

  const derivedStatus = getStatus();
  
  // primary = inside a colored sender bubble (green bg); default = on a neutral bg
  const getSentColor = () => variant === "primary" ? "text-white/60" : "text-muted-foreground";
  const getDeliveredColor = () => variant === "primary" ? "text-white/60" : "text-muted-foreground";
  // Blue is invisible on green — use light cyan/sky for primary, WhatsApp blue for default
  const getReadColor = () => variant === "primary" ? "text-sky-200" : "text-[#34B7F1]";

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
