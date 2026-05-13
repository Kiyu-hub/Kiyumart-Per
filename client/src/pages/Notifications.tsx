import { useQuery, useMutation } from "@tanstack/react-query";
import { useAuth } from "@/lib/auth";
import { useLanguage } from "@/contexts/LanguageContext";
import { useLocation } from "wouter";
import { useMobileDevice } from "@/hooks/useMobileDevice";
import { MobileNotifications } from "@/pages/mobile/MobileNotifications";
import Header from "@/components/Header";
import Footer from "@/components/Footer";
import { Card, CardContent } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Dialog, DialogContent, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { Bell, Package, ShoppingCart, Tag, Check, User, MessageSquare, Trash2, Eye } from "lucide-react";
import { formatDistanceToNow } from "date-fns";
import { apiRequest, queryClient } from "@/lib/queryClient";
import { useToast } from "@/hooks/use-toast";
import { formatNotificationMessage } from "@/lib/notificationMessage";
import { useState } from "react";

interface Notification {
  id: string;
  type: "order" | "user" | "product" | "review" | "message" | "system";
  title: string;
  message: string;
  isRead: boolean;
  createdAt: string;
  metadata?: Record<string, any>;
}

export default function Notifications() {
  const { user } = useAuth();
  const { t } = useLanguage();
  const { toast } = useToast();
  const [, navigate] = useLocation();
  const [selectedNotification, setSelectedNotification] = useState<Notification | null>(null);
  const [previewOpen, setPreviewOpen] = useState(false);

  const resolveNotificationTarget = (notification: Notification): string | null => {
    const metadata = notification.metadata || {};
    const isAdmin = user?.role === "admin" || user?.role === "super_admin";
    const isBuyer = user?.role === "buyer";
    const isSeller = user?.role === "seller";
    const isRider = user?.role === "rider";
    const isPickupAgent = user?.role === "pickup_agent";
    const isAgent = user?.role === "agent";
    const rolePrefix = isAdmin ? "/admin" : `/${user?.role}`;

    if (metadata.link) return metadata.link;
    if (metadata.promotionApplicationId && isAdmin) {
      return `/admin/applications?tab=promotions&promotionId=${encodeURIComponent(String(metadata.promotionApplicationId))}`;
    }

    switch (notification.type) {
      case "product":
        if (metadata.productId && isAdmin) return `${rolePrefix}/products/${metadata.productId}/edit`;
        if (metadata.productId && isSeller) return `/seller/products?productId=${encodeURIComponent(String(metadata.productId))}`;
        if (metadata.productId) return `/product/${metadata.productId}`;
        return isBuyer ? "/products" : `${rolePrefix}/products`;
      case "order":
        if (metadata.orderId && isBuyer) return `/track/${encodeURIComponent(String(metadata.orderId))}`;
        if (metadata.orderId && isAdmin) return `/admin/orders/${metadata.orderId}/action`;
        if (metadata.orderId && isSeller) return `/seller/orders/${encodeURIComponent(String(metadata.orderId))}?context=seller`;
        if (metadata.orderId && isRider) return `/rider/deliveries?orderId=${encodeURIComponent(String(metadata.orderId))}`;
        if (metadata.orderId && isPickupAgent) return `/pickup-agent?orderId=${encodeURIComponent(String(metadata.orderId))}`;
        if (metadata.orderId && isAgent) return `/agent/tickets?orderId=${encodeURIComponent(String(metadata.orderId))}`;
        return isBuyer ? "/orders" : `${rolePrefix}/orders`;
      case "user":
        if (metadata.userId && isAdmin) {
          const role = String(metadata.role || "").toLowerCase().trim();
          if (role === "seller" || role === "rider" || role === "pickup_agent") {
            return `/admin/applications?userId=${encodeURIComponent(String(metadata.userId))}&role=${encodeURIComponent(role)}`;
          }
          return `${rolePrefix}/users/${metadata.userId}/edit`;
        }
        return isAdmin ? "/admin/users" : null;
      case "message":
        if (metadata.conversationId) {
          if (isAdmin) return `/admin/live-support?conversationId=${encodeURIComponent(String(metadata.conversationId))}`;
          if (isAgent) return `/agent/tickets?conversationId=${encodeURIComponent(String(metadata.conversationId))}`;
          if (isPickupAgent) return `/pickup-agent/support?conversationId=${encodeURIComponent(String(metadata.conversationId))}`;
          return `/support?conversationId=${encodeURIComponent(String(metadata.conversationId))}`;
        }
        if (!isBuyer && metadata.senderId) {
          if (isPickupAgent) return `/pickup-agent/support?userId=${encodeURIComponent(String(metadata.senderId))}`;
          return `${rolePrefix}/messages?userId=${encodeURIComponent(String(metadata.senderId))}`;
        }
        return isBuyer ? null : `${rolePrefix}/messages`;
      default:
        return null;
    }
  };

  const { data: notifications = [], isLoading } = useQuery<Notification[]>({
    queryKey: ["/api/notifications", user?.id],
    queryFn: async () => {
      const res = await fetch("/api/notifications?limit=500", { credentials: "include" });
      if (!res.ok) throw new Error("Failed to fetch notifications");
      return res.json();
    },
    enabled: !!user,
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
    mutationFn: () => 
      apiRequest("PATCH", "/api/notifications/mark-all-read"),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["/api/notifications"] });
      queryClient.invalidateQueries({ queryKey: ["/api/notifications/unread-count"] });
      toast({
        title: "Success",
        description: "All notifications marked as read",
      });
    },
  });

  const deleteNotificationMutation = useMutation({
    mutationFn: (notificationId: string) =>
      apiRequest("DELETE", `/api/notifications/${notificationId}`),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["/api/notifications"] });
      queryClient.invalidateQueries({ queryKey: ["/api/notifications/unread-count"] });
      toast({
        title: "Deleted",
        description: "Notification deleted successfully",
      });
    },
  });

  const handleNotificationClick = (notification: Notification) => {
    // Mark as read
    if (!notification.isRead) {
      markAsReadMutation.mutate(notification.id);
    }

    const target = resolveNotificationTarget(notification);
    if (target) {
      navigate(target);
      return;
    }

    // Redirect based on notification type and metadata
    const { metadata } = notification;
    // super_admin uses the same /admin routes
    const isAdmin = user?.role === "admin" || user?.role === "super_admin";
    const isBuyer = user?.role === "buyer";
    const rolePrefix = isAdmin ? "/admin" : `/${user?.role}`;

    // Buyers don't have dedicated dashboard sub-pages for messages/products/orders,
    // so we route them to the public-facing pages or open preview dialogs instead.
    if (metadata) {
      if (metadata.link) {
        navigate(metadata.link);
        return;
      }
      switch (notification.type) {
        case "product":
          if (metadata.productId && isAdmin) {
            navigate(`${rolePrefix}/products/${metadata.productId}/edit`);
          } else if (metadata.productId) {
            // Buyers/others: go to public product page
            navigate(`/product/${metadata.productId}`);
          } else {
            navigate(isBuyer ? "/products" : `${rolePrefix}/products`);
          }
          break;
        case "order":
          if (isBuyer) {
            // Buyers track specific orders through the public tracking route
            if (metadata.orderId) {
              navigate(`/track/${encodeURIComponent(String(metadata.orderId))}`);
            } else {
              navigate("/orders");
            }
          } else {
            navigate(`${rolePrefix}/orders`);
          }
          break;
        case "user":
          if (metadata.userId && isAdmin) {
            navigate(`${rolePrefix}/users/${metadata.userId}/edit`);
          } else if (isAdmin) {
            navigate("/admin/sellers");
          } else {
            // Buyers: just show the notification detail
            setSelectedNotification(notification);
            setPreviewOpen(true);
          }
          break;
        case "message":
          if (metadata.conversationId) {
            if (isAdmin) {
              navigate(`/admin/live-support?conversationId=${metadata.conversationId}`);
            } else if (user?.role === "agent") {
              navigate(`/agent/tickets?conversationId=${metadata.conversationId}`);
            } else {
              navigate(`/support?conversationId=${metadata.conversationId}`);
            }
          } else if (isBuyer) {
            // Buyers don't have /buyer/messages — show in preview dialog for direct chats
            setSelectedNotification(notification);
            setPreviewOpen(true);
          } else if (metadata.senderId) {
            navigate(`${rolePrefix}/messages?userId=${metadata.senderId}`);
          } else {
            navigate(`${rolePrefix}/messages`);
          }
          break;
        default:
          setSelectedNotification(notification);
          setPreviewOpen(true);
          break;
      }
    } else {
      // No metadata, just open preview
      setSelectedNotification(notification);
      setPreviewOpen(true);
    }
  };

  const handlePreview = (notification: Notification) => {
    setSelectedNotification(notification);
    setPreviewOpen(true);
    if (!notification.isRead) {
      markAsReadMutation.mutate(notification.id);
    }
  };

  const handleDirectNavigation = (notification: Notification) => {
    if (!notification.isRead) {
      markAsReadMutation.mutate(notification.id);
    }

    const target = resolveNotificationTarget(notification);
    if (target) {
      navigate(target);
      return;
    }

    setSelectedNotification(notification);
    setPreviewOpen(true);
  };

  const handleDelete = (notificationId: string, e?: React.MouseEvent) => {
    e?.stopPropagation();
    deleteNotificationMutation.mutate(notificationId);
  };

  const unreadCount = notifications.filter(n => !n.isRead).length;

  const getIcon = (type: string) => {
    switch (type) {
      case "order":
        return <ShoppingCart className="h-5 w-5" />;
      case "product":
        return <Package className="h-5 w-5" />;
      case "user":
        return <User className="h-5 w-5" />;
      case "review":
        return <Tag className="h-5 w-5" />;
      case "message":
        return <MessageSquare className="h-5 w-5" />;
      default:
        return <Bell className="h-5 w-5" />;
    }
  };

  const getIconColor = (type: string) => {
    switch (type) {
      case "order":
        return "text-blue-500";
      case "product":
        return "text-primary";
      case "user":
        return "text-purple-500";
      case "review":
        return "text-orange-500";
      case "message":
        return "text-green-500";
      default:
        return "text-muted-foreground";
    }
  };

  const { isMobile } = useMobileDevice();
  if (isMobile) {
    return (
      <MobileNotifications
        notifications={notifications as any}
        isLoading={isLoading}
        onMarkRead={(id) => markAsReadMutation.mutate(id)}
        onMarkAllRead={() => markAllAsReadMutation.mutate()}
        onDelete={(id) => deleteNotificationMutation.mutate(id)}
      />
    );
  }

  return (
    <div className="min-h-screen flex flex-col bg-background">
      <Header
        onSearch={(query) => navigate(`/products?search=${encodeURIComponent(query)}`)}
        onCartClick={() => navigate("/cart")}
        data-testid="header-notifications"
      />

      <main className="flex-1">
        <div className="max-w-4xl mx-auto px-4 py-8">
          <div className="flex items-center justify-between mb-6">
            <div>
              <h1 className="text-3xl font-bold" data-testid="text-notifications-title">
                {t("notifications") || "Notifications"}
              </h1>
              {unreadCount > 0 && (
                <p className="text-sm text-muted-foreground mt-1">
                  {unreadCount} unread notification{unreadCount !== 1 ? 's' : ''}
                </p>
              )}
            </div>
            {unreadCount > 0 && (
              <Button
                variant="outline"
                size="sm"
                data-testid="button-mark-all-read"
                onClick={() => markAllAsReadMutation.mutate()}
                disabled={markAllAsReadMutation.isPending}
              >
                <Check className="h-4 w-4 mr-2" />
                {markAllAsReadMutation.isPending ? "Marking..." : "Mark all as read"}
              </Button>
            )}
          </div>

          {isLoading ? (
            <div className="space-y-4">
              {[1, 2, 3].map((i) => (
                <Card key={i} className="animate-pulse">
                  <CardContent className="p-6">
                    <div className="h-4 bg-muted rounded w-3/4 mb-2"></div>
                    <div className="h-3 bg-muted rounded w-1/2"></div>
                  </CardContent>
                </Card>
              ))}
            </div>
          ) : notifications.length === 0 ? (
            <Card>
              <CardContent className="flex flex-col items-center justify-center py-16">
                <Bell className="h-16 w-16 text-muted-foreground mb-4" />
                <h3 className="text-xl font-semibold mb-2" data-testid="text-no-notifications">
                  No notifications yet
                </h3>
                <p className="text-muted-foreground text-center max-w-sm">
                  When you have updates about your orders, deliveries, or promotions, they'll appear here.
                </p>
              </CardContent>
            </Card>
          ) : (
            <div className="space-y-3">
              {notifications.map((notification) => (
                <Card
                  key={notification.id}
                  className={`hover:shadow-md transition-all cursor-pointer ${
                    !notification.isRead ? "border-emerald-500 bg-emerald-500/5" : "border-border hover:bg-emerald-500/10"
                  }`}
                  onClick={() => handleDirectNavigation(notification)}
                  data-testid={`card-notification-${notification.id}`}
                >
                  <CardContent className="p-4">
                    <div className="flex items-start gap-4">
                      <div className={`mt-1 ${getIconColor(notification.type)}`}>
                        {getIcon(notification.type)}
                      </div>
                      <div className="flex-1 min-w-0">
                        <div className="flex items-start justify-between gap-4 mb-1">
                          <h3 className="font-semibold text-sm" data-testid={`text-notification-title-${notification.id}`}>
                            {notification.title}
                          </h3>
                          {!notification.isRead && (
                            <Badge className="shrink-0 text-xs bg-emerald-500 text-white">
                              New
                            </Badge>
                          )}
                        </div>
                        <p className="text-sm text-muted-foreground line-clamp-2 mb-2" data-testid={`text-notification-message-${notification.id}`}>
                          {formatNotificationMessage(notification.message)}
                        </p>
                        <div className="flex items-center gap-2">
                          <p className="text-xs text-muted-foreground">
                            {formatDistanceToNow(new Date(notification.createdAt), { addSuffix: true })}
                          </p>
                        </div>
                      </div>
                      <div className="flex flex-col gap-2">
                        <Button
                          variant="ghost"
                          size="sm"
                          onClick={(e) => {
                            e.stopPropagation();
                            handlePreview(notification);
                          }}
                          data-testid={`button-preview-${notification.id}`}
                        >
                          <Eye className="h-4 w-4" />
                        </Button>
                        {!notification.isRead && (
                          <Button
                            variant="ghost"
                            size="sm"
                            onClick={(e) => {
                              e.stopPropagation();
                              markAsReadMutation.mutate(notification.id);
                            }}
                            data-testid={`button-mark-read-${notification.id}`}
                            className="hover:bg-emerald-500/15 hover:text-emerald-600"
                          >
                            <Check className="h-4 w-4" />
                          </Button>
                        )}
                        <Button
                          variant="ghost"
                          size="sm"
                          onClick={(e) => handleDelete(notification.id, e)}
                          data-testid={`button-delete-${notification.id}`}
                          className="text-destructive hover:text-destructive"
                        >
                          <Trash2 className="h-4 w-4" />
                        </Button>
                      </div>
                    </div>
                  </CardContent>
                </Card>
              ))}
            </div>
          )}
        </div>
      </main>

      {/* Preview Dialog */}
      <Dialog open={previewOpen} onOpenChange={setPreviewOpen}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle className="flex items-center gap-2">
              {selectedNotification && (
                <>
                  <span className={getIconColor(selectedNotification.type)}>
                    {getIcon(selectedNotification.type)}
                  </span>
                  {selectedNotification.title}
                </>
              )}
            </DialogTitle>
          </DialogHeader>
          {selectedNotification && (
            <div className="space-y-4">
              <p className="text-sm text-muted-foreground whitespace-pre-wrap">
                {formatNotificationMessage(selectedNotification.message)}
              </p>
              <p className="text-xs text-muted-foreground">
                {formatDistanceToNow(new Date(selectedNotification.createdAt), { addSuffix: true })}
              </p>
              <div className="flex justify-end gap-2 pt-4">
                <Button
                  variant="outline"
                  onClick={() => setPreviewOpen(false)}
                  data-testid="button-close-preview"
                >
                  Close
                </Button>
                <Button
                  variant="destructive"
                  onClick={() => {
                    handleDelete(selectedNotification.id);
                    setPreviewOpen(false);
                  }}
                  data-testid="button-delete-preview"
                >
                  <Trash2 className="h-4 w-4 mr-2" />
                  Delete
                </Button>
              </div>
            </div>
          )}
        </DialogContent>
      </Dialog>

      <Footer />
    </div>
  );
}
