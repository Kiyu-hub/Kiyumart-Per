import { useState } from "react";
import { useLocation } from "wouter";
import { useHaptic } from "@/hooks/useHaptic";
import { cn } from "@/lib/utils";
import { MobilePageHeader } from "@/components/mobile/MobilePageHeader";
import { SwipeableRow } from "@/components/mobile/SwipeableRow";
import { MobileListItemSkeleton } from "@/components/mobile/MobileSkeletonCard";
import { Button } from "@/components/ui/button";
import {
  Bell, Package, CreditCard, MessageCircle, AlertCircle,
  Truck, CheckCircle, Star, Trash2, Check,
} from "lucide-react";

interface Notification {
  id: string;
  type: string;
  title: string;
  message: string;
  isRead: boolean;
  createdAt: string;
  metadata?: { orderId?: string; productId?: string } | null;
}

interface MobileNotificationsProps {
  notifications: Notification[];
  isLoading: boolean;
  onMarkRead: (id: string) => void;
  onMarkAllRead: () => void;
  onDelete: (id: string) => void;
}

function getNotifIcon(type: string) {
  const map: Record<string, { icon: React.ElementType; bg: string; color: string }> = {
    order_placed:    { icon: Package,      bg: "bg-blue-100 dark:bg-blue-900/40",    color: "text-blue-600 dark:text-blue-400" },
    order_update:    { icon: Package,      bg: "bg-blue-100 dark:bg-blue-900/40",    color: "text-blue-600 dark:text-blue-400" },
    payment:         { icon: CreditCard,   bg: "bg-emerald-100 dark:bg-emerald-900/40", color: "text-emerald-600 dark:text-emerald-400" },
    payment_success: { icon: CreditCard,   bg: "bg-emerald-100 dark:bg-emerald-900/40", color: "text-emerald-600 dark:text-emerald-400" },
    delivery:        { icon: Truck,        bg: "bg-violet-100 dark:bg-violet-900/40", color: "text-violet-600 dark:text-violet-400" },
    delivered:       { icon: CheckCircle,  bg: "bg-emerald-100 dark:bg-emerald-900/40", color: "text-emerald-600" },
    message:         { icon: MessageCircle, bg: "bg-sky-100 dark:bg-sky-900/40",     color: "text-sky-600 dark:text-sky-400" },
    review:          { icon: Star,         bg: "bg-amber-100 dark:bg-amber-900/40",  color: "text-amber-600 dark:text-amber-400" },
    alert:           { icon: AlertCircle,  bg: "bg-destructive/10",                  color: "text-destructive" },
  };
  return map[type] || { icon: Bell, bg: "bg-muted", color: "text-muted-foreground" };
}

function groupNotifications(notifications: Notification[]) {
  const today = new Date();
  const yesterday = new Date(today);
  yesterday.setDate(yesterday.getDate() - 1);

  const isToday = (d: Date) => d.toDateString() === today.toDateString();
  const isYesterday = (d: Date) => d.toDateString() === yesterday.toDateString();

  const groups: { label: string; items: Notification[] }[] = [
    { label: "Today", items: [] },
    { label: "Yesterday", items: [] },
    { label: "Earlier", items: [] },
  ];

  for (const notif of notifications) {
    const d = new Date(notif.createdAt);
    if (isToday(d)) groups[0].items.push(notif);
    else if (isYesterday(d)) groups[1].items.push(notif);
    else groups[2].items.push(notif);
  }

  return groups.filter((g) => g.items.length > 0);
}

function formatRelativeTime(dateStr: string): string {
  const d = new Date(dateStr);
  const now = Date.now();
  const diff = now - d.getTime();
  const mins = Math.floor(diff / 60000);
  if (mins < 1) return "just now";
  if (mins < 60) return `${mins}m ago`;
  const hrs = Math.floor(mins / 60);
  if (hrs < 24) return `${hrs}h ago`;
  return d.toLocaleDateString("en-GB", { day: "numeric", month: "short" });
}

export function MobileNotifications({
  notifications,
  isLoading,
  onMarkRead,
  onMarkAllRead,
  onDelete,
}: MobileNotificationsProps) {
  const [, navigate] = useLocation();
  const { trigger: haptic } = useHaptic();
  const unreadCount = notifications.filter((n) => !n.isRead).length;
  const groups = groupNotifications(notifications);

  const handleTap = (notif: Notification) => {
    haptic("light");
    if (!notif.isRead) onMarkRead(notif.id);
    if (notif.metadata?.orderId) navigate(`/orders/${notif.metadata.orderId}`);
  };

  return (
    <div className="flex flex-col min-h-screen bg-background mobile-page-enter">
      <MobilePageHeader
        title="Notifications"
        showBack={false}
        actions={
          unreadCount > 0 ? (
            <Button
              variant="ghost"
              size="sm"
              className="text-primary text-[13px] font-medium h-8 px-3 touch-ripple rounded-xl"
              onClick={() => { haptic("light"); onMarkAllRead(); }}
            >
              Mark all read
            </Button>
          ) : undefined
        }
      />

      <main className="flex-1 overflow-y-auto">
        {isLoading ? (
          <div className="p-4"><MobileListItemSkeleton count={6} /></div>
        ) : notifications.length === 0 ? (
          <div className="flex flex-col items-center justify-center py-20 px-8 text-center">
            <div className="w-20 h-20 rounded-3xl bg-muted/40 flex items-center justify-center mb-4">
              <Bell className="w-9 h-9 text-muted-foreground/50" />
            </div>
            <p className="mobile-title-3 mb-2">All caught up!</p>
            <p className="mobile-subhead text-muted-foreground">No notifications yet.</p>
          </div>
        ) : (
          <div className="pb-4">
            {groups.map((group) => (
              <div key={group.label}>
                <p className="mobile-caption text-muted-foreground uppercase tracking-wide font-medium px-4 py-3">
                  {group.label}
                </p>
                <div className="divide-y divide-border/20">
                  {group.items.map((notif) => {
                    const { icon: Icon, bg, color } = getNotifIcon(notif.type);
                    return (
                      <SwipeableRow
                        key={notif.id}
                        rightAction={{
                          label: "Delete",
                          icon: <Trash2 className="w-5 h-5" />,
                          color: "destructive",
                          onPress: () => { haptic("medium"); onDelete(notif.id); },
                        }}
                        leftAction={
                          !notif.isRead ? {
                            label: "Read",
                            icon: <Check className="w-5 h-5" />,
                            color: "success",
                            onPress: () => { haptic("light"); onMarkRead(notif.id); },
                          } : undefined
                        }
                      >
                        <button
                          onClick={() => handleTap(notif)}
                          className={cn(
                            "w-full flex items-start gap-3 px-4 py-3.5 text-left touch-ripple",
                            !notif.isRead && "bg-primary/[0.03] dark:bg-primary/[0.06]",
                          )}
                        >
                          <div className={cn("w-10 h-10 rounded-2xl flex items-center justify-center shrink-0", bg)}>
                            <Icon className={cn("w-5 h-5", color)} />
                          </div>
                          <div className="flex-1 min-w-0 pt-0.5">
                            <div className="flex items-start justify-between gap-2">
                              <p className={cn(
                                "text-[14px] leading-snug line-clamp-1",
                                !notif.isRead ? "font-semibold text-foreground" : "font-medium text-foreground/80",
                              )}>
                                {notif.title}
                              </p>
                              <span className="mobile-caption text-muted-foreground shrink-0 mt-0.5">
                                {formatRelativeTime(notif.createdAt)}
                              </span>
                            </div>
                            <p className="mobile-caption text-muted-foreground line-clamp-2 mt-0.5">{notif.message}</p>
                          </div>
                          {!notif.isRead && (
                            <span className="w-2 h-2 rounded-full bg-primary shrink-0 mt-2" />
                          )}
                        </button>
                      </SwipeableRow>
                    );
                  })}
                </div>
              </div>
            ))}
          </div>
        )}
      </main>
    </div>
  );
}
