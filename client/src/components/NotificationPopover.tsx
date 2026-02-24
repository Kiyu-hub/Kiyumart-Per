import { useState } from "react";
import { useQuery, useMutation } from "@tanstack/react-query";
import { useAuth } from "@/lib/auth";
import { useLocation } from "wouter";
import { apiRequest, queryClient } from "@/lib/queryClient";
import { useToast } from "@/hooks/use-toast";
import { formatDistanceToNow } from "date-fns";
import {
  Popover,
  PopoverContent,
  PopoverTrigger,
} from "@/components/ui/popover";
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogDescription,
} from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { ScrollArea } from "@/components/ui/scroll-area";
import {
  Bell,
  Check,
  CheckCheck,
  Trash2,
  Package,
  ShoppingCart,
  User,
  MessageSquare,
  Tag,
  AlertCircle,
  ExternalLink,
  Loader2,
} from "lucide-react";
import { cn } from "@/lib/utils";
import { formatNotificationMessage } from "@/lib/notificationMessage";

interface Notification {
  id: string;
  type: "order" | "user" | "product" | "review" | "message" | "payout" | "system";
  title: string;
  message: string;
  isRead: boolean;
  createdAt: string;
  metadata?: Record<string, any>;
}

interface NotificationPopoverProps {
  className?: string;
}

export default function NotificationPopover({ className }: NotificationPopoverProps) {
  const { user, isAuthenticated } = useAuth();
  const [, navigate] = useLocation();
  const { toast } = useToast();
  const [open, setOpen] = useState(false);
  const [selectedNotification, setSelectedNotification] = useState<Notification | null>(null);
  const [detailDialogOpen, setDetailDialogOpen] = useState(false);

  const { data: notifications = [], isLoading } = useQuery<Notification[]>({
    queryKey: ["/api/notifications"],
    enabled: !!user && isAuthenticated,
    refetchInterval: 30000, // Refresh every 30 seconds
  });

  const { data: unreadCount = 0 } = useQuery<number>({
    queryKey: ["/api/notifications/unread-count"],
    queryFn: async () => {
      const res = await fetch("/api/notifications/unread-count", { credentials: "include" });
      if (!res.ok) return 0;
      const data = await res.json();
      return data.count || 0;
    },
    enabled: !!user && isAuthenticated,
    refetchInterval: 30000,
  });

  const markAsReadMutation = useMutation({
    mutationFn: (notificationId: string) =>
      apiRequest("PATCH", `/api/notifications/${notificationId}/read`),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["/api/notifications"] });
      queryClient.invalidateQueries({ queryKey: ["/api/notifications/unread-count"] });
    },
  });

  const markAllAsReadMutation = useMutation({
    mutationFn: () => apiRequest("PATCH", "/api/notifications/mark-all-read"),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["/api/notifications"] });
      queryClient.invalidateQueries({ queryKey: ["/api/notifications/unread-count"] });
      toast({ title: "All notifications marked as read" });
    },
  });

  const deleteNotificationMutation = useMutation({
    mutationFn: (notificationId: string) =>
      apiRequest("DELETE", `/api/notifications/${notificationId}`),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["/api/notifications"] });
      queryClient.invalidateQueries({ queryKey: ["/api/notifications/unread-count"] });
      toast({ title: "Notification deleted" });
    },
  });

  const getIcon = (type: string) => {
    switch (type) {
      case "order":
        return <ShoppingCart className="h-4 w-4" />;
      case "product":
        return <Package className="h-4 w-4" />;
      case "user":
        return <User className="h-4 w-4" />;
      case "review":
        return <Tag className="h-4 w-4" />;
      case "message":
        return <MessageSquare className="h-4 w-4" />;
      case "payout":
        return <Tag className="h-4 w-4" />;
      case "system":
        return <AlertCircle className="h-4 w-4" />;
      default:
        return <Bell className="h-4 w-4" />;
    }
  };

  const getTypeColor = (type: string) => {
    switch (type) {
      case "order":
        return "bg-blue-500 text-white";
      case "product":
        return "bg-primary text-primary-foreground";
      case "user":
        return "bg-purple-500 text-white";
      case "review":
        return "bg-orange-500 text-white";
      case "message":
        return "bg-green-500 text-white";
      case "payout":
        return "bg-emerald-500 text-white";
      case "system":
        return "bg-red-500 text-white";
      default:
        return "bg-gray-500 text-white";
    }
  };

  const handleNotificationClick = (notification: Notification, e: React.MouseEvent) => {
    e.stopPropagation();
    
    // Mark as read if unread
    if (!notification.isRead) {
      markAsReadMutation.mutate(notification.id);
    }

    // Open detail dialog
    setSelectedNotification(notification);
    setDetailDialogOpen(true);
    setOpen(false);
  };

  const handleActionClick = (notification: Notification) => {
    setDetailDialogOpen(false);
    
    // Navigate based on type and metadata
    const { metadata } = notification;
    const isAdmin = user?.role === "admin" || user?.role === "super_admin";
    const isBuyer = user?.role === "buyer";
    const rolePrefix = isAdmin
      ? "/admin" 
      : user?.role === "seller" 
        ? "/seller"
        : user?.role === "rider"
          ? "/rider"
          : "";

    if (metadata?.link) {
      navigate(metadata.link);
      return;
    }

    switch (notification.type) {
      case "order":
        if (isBuyer) {
          navigate(metadata?.orderId ? `/track?orderId=${metadata.orderId}` : "/orders");
        } else {
          navigate(`${rolePrefix}/orders`);
        }
        break;
      case "product":
        if (isBuyer && metadata?.productId) {
          navigate(`/product/${metadata.productId}`);
        } else if (isBuyer) {
          navigate("/products");
        } else {
          navigate(`${rolePrefix}/products`);
        }
        break;
      case "user":
        if (isAdmin) {
          const role = String(metadata?.role || "").toLowerCase();
          if ((role === "seller" || role === "rider") && metadata?.userId) {
            navigate(`/admin/applications?userId=${metadata.userId}&role=${role}`);
          } else {
            navigate("/admin/users");
          }
        }
        break;
      case "message":
        if (metadata?.conversationId) {
          if (isAdmin) {
            navigate(`/admin/live-support?conversationId=${metadata.conversationId}`);
          } else if (user?.role === "agent") {
            navigate(`/agent/tickets?conversationId=${metadata.conversationId}`);
          } else {
            navigate(`/support?conversationId=${metadata.conversationId}`);
          }
        } else if (isBuyer) {
          // Buyers don't have a /buyer/messages route — open notifications page for preview
          navigate("/notifications");
        } else if (metadata?.senderId) {
          navigate(`${rolePrefix}/messages?userId=${metadata.senderId}`);
        } else {
          navigate(`${rolePrefix}/messages`);
        }
        break;
      case "payout":
        if (user?.role === "seller") {
          navigate("/seller/payouts");
        } else if (user?.role === "rider") {
          navigate("/rider/earnings");
        }
        break;
      default:
        break;
    }
  };

  const handleDeleteClick = (notificationId: string, e: React.MouseEvent) => {
    e.stopPropagation();
    deleteNotificationMutation.mutate(notificationId);
  };

  const handleMarkReadClick = (notificationId: string, e: React.MouseEvent) => {
    e.stopPropagation();
    markAsReadMutation.mutate(notificationId);
  };

  const recentNotifications = notifications.slice(0, 10); // Show only 10 most recent
  const hasUnread = notifications.some(n => !n.isRead);

  if (!isAuthenticated) return null;

  return (
    <>
      <Popover open={open} onOpenChange={setOpen}>
        <PopoverTrigger asChild>
          <Button
            variant="ghost"
            size="icon"
            className={cn("relative", className)}
            data-testid="button-notifications"
          >
            <Bell className="h-5 w-5" />
            {unreadCount > 0 && (
              <Badge
                className="absolute -top-1 -right-1 min-w-[20px] h-5 flex items-center justify-center px-1.5 text-[10px] font-semibold bg-destructive text-destructive-foreground rounded-full border-2 border-background"
                data-testid="badge-notification-count"
              >
                {unreadCount > 9 ? "9+" : unreadCount}
              </Badge>
            )}
          </Button>
        </PopoverTrigger>
        <PopoverContent 
          className="w-[380px] p-0" 
          align="end" 
          sideOffset={8}
        >
          {/* Header */}
          <div className="flex items-center justify-between px-4 py-3 border-b bg-muted/50">
            <div className="flex items-center gap-2">
              <Bell className="h-4 w-4 text-primary" />
              <h3 className="font-semibold text-sm">Notifications</h3>
              {unreadCount > 0 && (
                <Badge variant="secondary" className="text-xs">
                  {unreadCount} new
                </Badge>
              )}
            </div>
            {hasUnread && (
              <Button
                variant="ghost"
                size="sm"
                className="h-7 text-xs"
                onClick={() => markAllAsReadMutation.mutate()}
                disabled={markAllAsReadMutation.isPending}
                data-testid="button-mark-all-read"
              >
                <CheckCheck className="h-3 w-3 mr-1" />
                Mark all read
              </Button>
            )}
          </div>

          {/* Notification List */}
          <ScrollArea className="max-h-[400px]">
            {isLoading ? (
              <div className="flex justify-center py-8">
                <Loader2 className="h-6 w-6 animate-spin text-primary" />
              </div>
            ) : recentNotifications.length === 0 ? (
              <div className="flex flex-col items-center justify-center py-12 px-4">
                <Bell className="h-10 w-10 text-muted-foreground mb-3" />
                <p className="text-sm font-medium text-muted-foreground">No notifications yet</p>
                <p className="text-xs text-muted-foreground mt-1">We'll notify you when something happens</p>
              </div>
            ) : (
              <div className="divide-y">
                {recentNotifications.map((notification) => (
                  <div
                    key={notification.id}
                    onClick={(e) => handleNotificationClick(notification, e)}
                    className={cn(
                      "flex items-start gap-3 p-3 hover:bg-accent cursor-pointer transition-colors",
                      !notification.isRead && "bg-primary/5 border-l-2 border-l-primary"
                    )}
                    data-testid={`notification-item-${notification.id}`}
                  >
                    {/* Icon */}
                    <div className={cn("p-2 rounded-full shrink-0", getTypeColor(notification.type))}>
                      {getIcon(notification.type)}
                    </div>

                    {/* Content */}
                    <div className="flex-1 min-w-0">
                      <div className="flex items-start justify-between gap-2">
                        <p className={cn(
                          "text-sm line-clamp-1",
                          !notification.isRead ? "font-semibold" : "font-medium"
                        )}>
                          {notification.title}
                        </p>
                        {!notification.isRead && (
                          <span className="w-2 h-2 rounded-full bg-primary shrink-0 mt-1.5" />
                        )}
                      </div>
                        <p className="text-xs text-muted-foreground line-clamp-2 mt-0.5">
                          {formatNotificationMessage(notification.message)}
                      </p>
                      <p className="text-[10px] text-muted-foreground mt-1">
                        {formatDistanceToNow(new Date(notification.createdAt), { addSuffix: true })}
                      </p>
                    </div>

                    {/* Actions */}
                    <div className="flex flex-col gap-1 shrink-0">
                      {!notification.isRead && (
                        <Button
                          variant="ghost"
                          size="icon"
                          className="h-6 w-6"
                          onClick={(e) => handleMarkReadClick(notification.id, e)}
                          title="Mark as read"
                        >
                          <Check className="h-3 w-3" />
                        </Button>
                      )}
                      <Button
                        variant="ghost"
                        size="icon"
                        className="h-6 w-6 text-destructive hover:text-destructive"
                        onClick={(e) => handleDeleteClick(notification.id, e)}
                        title="Delete"
                      >
                        <Trash2 className="h-3 w-3" />
                      </Button>
                    </div>
                  </div>
                ))}
              </div>
            )}
          </ScrollArea>

          {/* Footer */}
          {notifications.length > 0 && (
            <div className="border-t p-2">
              <Button
                variant="ghost"
                className="w-full text-sm text-primary hover:text-primary"
                onClick={() => {
                  setOpen(false);
                  navigate("/notifications");
                }}
                data-testid="button-view-all-notifications"
              >
                View all notifications
                <ExternalLink className="h-3 w-3 ml-2" />
              </Button>
            </div>
          )}
        </PopoverContent>
      </Popover>

      {/* Detail Dialog */}
      <Dialog open={detailDialogOpen} onOpenChange={setDetailDialogOpen}>
        <DialogContent className="sm:max-w-md">
          <DialogHeader>
            <DialogTitle className="flex items-center gap-2">
              {selectedNotification && (
                <>
                  <span className={cn("p-1.5 rounded-full", getTypeColor(selectedNotification.type))}>
                    {getIcon(selectedNotification.type)}
                  </span>
                  <span className="capitalize">{selectedNotification.type} Notification</span>
                </>
              )}
            </DialogTitle>
            <DialogDescription className="sr-only">
              Notification details
            </DialogDescription>
          </DialogHeader>
          
          {selectedNotification && (
            <div className="space-y-4">
              <div>
                <h4 className="font-semibold text-base">{selectedNotification.title}</h4>
                <p className="text-sm text-muted-foreground mt-2 whitespace-pre-wrap">
                  {formatNotificationMessage(selectedNotification.message)}
                </p>
              </div>

              <div className="flex items-center gap-2 text-xs text-muted-foreground">
                <Badge className={cn("text-xs", getTypeColor(selectedNotification.type))}>
                  {selectedNotification.type}
                </Badge>
                <span>•</span>
                <span>{formatDistanceToNow(new Date(selectedNotification.createdAt), { addSuffix: true })}</span>
                {selectedNotification.isRead && (
                  <>
                    <span>•</span>
                    <span className="flex items-center gap-1">
                      <Check className="h-3 w-3" /> Read
                    </span>
                  </>
                )}
              </div>

              <div className="flex justify-between gap-2 pt-4 border-t">
                <Button
                  variant="destructive"
                  size="sm"
                  onClick={() => {
                    if (selectedNotification) {
                      deleteNotificationMutation.mutate(selectedNotification.id);
                      setDetailDialogOpen(false);
                    }
                  }}
                  data-testid="button-delete-notification"
                >
                  <Trash2 className="h-4 w-4 mr-2" />
                  Delete
                </Button>
                <div className="flex gap-2">
                  <Button
                    variant="outline"
                    size="sm"
                    onClick={() => setDetailDialogOpen(false)}
                  >
                    Close
                  </Button>
                  <Button
                    size="sm"
                    onClick={() => handleActionClick(selectedNotification)}
                    data-testid="button-go-to-action"
                  >
                    View Details
                    <ExternalLink className="h-3 w-3 ml-2" />
                  </Button>
                </div>
              </div>
            </div>
          )}
        </DialogContent>
      </Dialog>
    </>
  );
}
