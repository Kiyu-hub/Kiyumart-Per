import { useEffect, useMemo, useState } from "react";
import { useQuery, useMutation } from "@tanstack/react-query";
import { useLocation } from "wouter";
import DashboardLayout from "@/components/DashboardLayout";
import { useAuth } from "@/lib/auth";
import { Button } from "@/components/ui/button";
import { Card } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Tabs, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogDescription } from "@/components/ui/dialog";
import { Loader2, Bell, Check, Trash2, ExternalLink, Package, ShoppingCart, User, MessageSquare, AlertCircle, Tag, RefreshCw } from "lucide-react";
import { apiRequest, queryClient } from "@/lib/queryClient";
import { useToast } from "@/hooks/use-toast";
import { formatDistanceToNow } from "date-fns";
import { useSocket } from "@/contexts/NotificationContext";

interface Notification {
  id: string;
  title: string;
  message: string;
  type: string;
  isRead: boolean;
  createdAt: string;
  metadata?: Record<string, any>;
}

export default function AdminNotifications() {
  const { user } = useAuth();
  const { toast } = useToast();
  const [, navigate] = useLocation();
  const socket = useSocket();
  const [selectedNotification, setSelectedNotification] = useState<Notification | null>(null);
  const [dialogOpen, setDialogOpen] = useState(false);
  const [activeTab, setActiveTab] = useState<"all" | "unread" | "read">("all");

  const {
    data: notifications = [],
    isLoading,
    isFetching,
    refetch,
    dataUpdatedAt,
  } = useQuery<Notification[]>({
    queryKey: ["/api/notifications", user?.id],
    queryFn: async () => {
      const res = await fetch("/api/notifications?limit=500", { credentials: "include" });
      if (!res.ok) throw new Error("Failed to fetch notifications");
      return res.json();
    },
    enabled: Boolean(user?.id),
    staleTime: 0,
    refetchOnWindowFocus: true,
    refetchOnMount: "always",
    refetchInterval: 15000,
    refetchIntervalInBackground: true,
  });

  useEffect(() => {
    if (!socket || !user?.id) return;

    const handleIncomingNotification = () => {
      queryClient.invalidateQueries({ queryKey: ["/api/notifications", user.id] });
      queryClient.invalidateQueries({ queryKey: ["/api/notifications/unread-count", user.id] });
    };

    socket.on("notification", handleIncomingNotification);

    return () => {
      socket.off("notification", handleIncomingNotification);
    };
  }, [socket, user?.id]);

  const markAsReadMutation = useMutation({
    mutationFn: async (id: string) => {
      return apiRequest("PATCH", `/api/notifications/${id}/read`);
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["/api/notifications", user?.id] });
      queryClient.invalidateQueries({ queryKey: ["/api/notifications/unread-count", user?.id] });
    },
  });

  const deleteNotificationMutation = useMutation({
    mutationFn: async (id: string) => {
      return apiRequest("DELETE", `/api/notifications/${id}`);
    },
    onSuccess: () => {
      toast({ title: "Notification deleted" });
      queryClient.invalidateQueries({ queryKey: ["/api/notifications", user?.id] });
      queryClient.invalidateQueries({ queryKey: ["/api/notifications/unread-count", user?.id] });
    },
  });

  const markAllAsReadMutation = useMutation({
    mutationFn: async () => {
      return apiRequest("PATCH", "/api/notifications/mark-all-read");
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["/api/notifications", user?.id] });
      queryClient.invalidateQueries({ queryKey: ["/api/notifications/unread-count", user?.id] });
    },
  });

  const getTypeColor = (type: string) => {
    switch (type) {
      case "order": return "bg-blue-500";
      case "user": return "bg-purple-500";
      case "product": return "bg-primary";
      case "payment": return "bg-green-500";
      case "payout": return "bg-emerald-500";
      case "message": return "bg-teal-500";
      case "system": return "bg-orange-500";
      case "alert": return "bg-red-500";
      default: return "bg-gray-500";
    }
  };

  const getIcon = (type: string) => {
    switch (type) {
      case "order": return <ShoppingCart className="h-4 w-4" />;
      case "user": return <User className="h-4 w-4" />;
      case "product": return <Package className="h-4 w-4" />;
      case "review": return <MessageSquare className="h-4 w-4" />;
      case "message": return <MessageSquare className="h-4 w-4" />;
      case "system": return <AlertCircle className="h-4 w-4" />;
      case "payout": return <Tag className="h-4 w-4" />;
      default: return <Bell className="h-4 w-4" />;
    }
  };

  const handleNotificationClick = (notification: Notification) => {
    if (!notification.isRead) {
      markAsReadMutation.mutate(notification.id);
    }
    setSelectedNotification(notification);
    setDialogOpen(true);
  };

  const handleAction = () => {
    if (!selectedNotification) return;
    setDialogOpen(false);

    const { metadata, type } = selectedNotification;

    if (metadata?.link) {
      navigate(metadata.link);
      return;
    }

    switch (type) {
      case "order":
        navigate("/admin/orders");
        break;
      case "user":
        navigate("/admin/users");
        break;
      case "product":
        navigate("/admin/products");
        break;
      case "review":
        if (metadata?.link) {
          navigate(metadata.link);
        } else if (metadata?.productId) {
          navigate(`/product/${metadata.productId}`);
        } else {
          navigate("/admin/products");
        }
        break;
      case "message":
        if (metadata?.conversationId) {
          navigate(`/admin/live-support?conversationId=${metadata.conversationId}`);
        } else if (metadata?.senderId) {
          navigate(`/admin/messages?userId=${metadata.senderId}`);
        } else {
          navigate("/admin/messages");
        }
        break;
      case "payout":
        navigate("/admin/riders-payouts");
        break;
      default:
        break;
    }
  };

  const unreadCount = useMemo(
    () => notifications.filter((notification) => !notification.isRead).length,
    [notifications],
  );

  const readCount = notifications.length - unreadCount;

  const filteredNotifications = useMemo(() => {
    if (activeTab === "unread") {
      return notifications.filter((notification) => !notification.isRead);
    }
    if (activeTab === "read") {
      return notifications.filter((notification) => notification.isRead);
    }
    return notifications;
  }, [activeTab, notifications]);

  const lastSyncedLabel = dataUpdatedAt
    ? formatDistanceToNow(new Date(dataUpdatedAt), { addSuffix: true })
    : "just now";

  return (
    <DashboardLayout role={user?.role as any}>
      <div className="p-6 space-y-6">
        <Card className="border-emerald-500/25 bg-[linear-gradient(105deg,rgba(16,185,129,0.16)_0%,rgba(16,185,129,0.06)_38%,rgba(15,23,42,0.92)_100%)] p-6 shadow-lg shadow-emerald-900/10">
          <div className="flex flex-wrap items-start justify-between gap-4">
            <div>
              <h1 className="text-3xl font-bold" data-testid="text-page-title">Notifications</h1>
              <p className="text-muted-foreground mt-1">Live system alerts and message events synced with database updates.</p>
              <div className="flex flex-wrap items-center gap-2 mt-3">
                <Badge className="bg-emerald-500/20 text-emerald-200 border border-emerald-500/40">
                  Live Feed
                </Badge>
                <Badge variant="secondary">
                  Last sync {lastSyncedLabel}
                </Badge>
              </div>
            </div>
            <div className="flex items-center gap-2">
              <Button
                variant="outline"
                onClick={() => void refetch()}
                data-testid="button-refresh-notifications"
                disabled={isFetching}
              >
                <RefreshCw className={`h-4 w-4 mr-2 ${isFetching ? "animate-spin" : ""}`} />
                Refresh
              </Button>
              {unreadCount > 0 && (
                <Button
                  variant="outline"
                  onClick={() => markAllAsReadMutation.mutate()}
                  data-testid="button-mark-all-read"
                  disabled={markAllAsReadMutation.isPending}
                >
                  <Check className="h-4 w-4 mr-2" />
                  Mark All as Read
                </Button>
              )}
            </div>
          </div>
        </Card>

        <div className="grid grid-cols-1 md:grid-cols-3 gap-3">
          <Card className="p-4 border-emerald-500/20">
            <p className="text-xs uppercase tracking-wide text-muted-foreground">Total</p>
            <p className="text-2xl font-bold mt-1">{notifications.length}</p>
          </Card>
          <Card className="p-4 border-amber-500/20">
            <p className="text-xs uppercase tracking-wide text-muted-foreground">Unread</p>
            <p className="text-2xl font-bold mt-1">{unreadCount}</p>
          </Card>
          <Card className="p-4 border-blue-500/20">
            <p className="text-xs uppercase tracking-wide text-muted-foreground">Read</p>
            <p className="text-2xl font-bold mt-1">{readCount}</p>
          </Card>
        </div>

        <Tabs value={activeTab} onValueChange={(value) => setActiveTab(value as "all" | "unread" | "read")}>
          <TabsList className="grid w-full max-w-md grid-cols-3">
            <TabsTrigger value="all">All ({notifications.length})</TabsTrigger>
            <TabsTrigger value="unread">Unread ({unreadCount})</TabsTrigger>
            <TabsTrigger value="read">Read ({readCount})</TabsTrigger>
          </TabsList>
        </Tabs>

        {isLoading ? (
          <div className="flex justify-center py-12">
            <Loader2 className="h-8 w-8 animate-spin text-primary" />
          </div>
        ) : filteredNotifications.length === 0 ? (
          <Card className="p-12">
            <div className="text-center">
              <Bell className="h-12 w-12 text-muted-foreground mx-auto mb-4" />
              <h3 className="text-lg font-semibold mb-2">No {activeTab} notifications</h3>
              <p className="text-muted-foreground">
                {activeTab === "all" ? "You are all caught up!" : "Try switching tabs or check again in a moment."}
              </p>
            </div>
          </Card>
        ) : (
          <div className="space-y-3">
            {filteredNotifications.map((notification) => (
              <Card
                key={notification.id}
                className={`p-4 cursor-pointer border transition-all hover:shadow-md hover:bg-emerald-500/10 ${
                  !notification.isRead ? "border-emerald-500/30 bg-emerald-500/5" : "border-border/70"
                }`}
                onClick={() => handleNotificationClick(notification)}
                data-testid={`card-notification-${notification.id}`}
              >
                <div className="flex items-start justify-between gap-4">
                  <div className="flex items-start gap-3 flex-1">
                    <div className={`p-2 rounded-full ${getTypeColor(notification.type)} text-white shrink-0`}>
                      {getIcon(notification.type)}
                    </div>
                    <div className="flex-1 min-w-0">
                      <div className="flex items-center gap-2 mb-1 flex-wrap">
                        <h3 className={`font-semibold ${!notification.isRead ? "text-foreground" : "text-muted-foreground"}`}>
                          {notification.title}
                        </h3>
                        {!notification.isRead && (
                          <Badge className="text-xs bg-emerald-500 text-white">New</Badge>
                        )}
                      </div>
                      <p className="text-sm text-muted-foreground mb-2 line-clamp-2">{notification.message}</p>
                      <p className="text-xs text-muted-foreground">
                        {formatDistanceToNow(new Date(notification.createdAt), { addSuffix: true })}
                      </p>
                    </div>
                  </div>
                  <div className="flex gap-1 shrink-0" onClick={(e) => e.stopPropagation()}>
                    {!notification.isRead && (
                      <Button
                        variant="ghost"
                        size="icon"
                        className="h-8 w-8 hover:bg-emerald-500/15 hover:text-emerald-600"
                        onClick={() => markAsReadMutation.mutate(notification.id)}
                        data-testid={`button-mark-read-${notification.id}`}
                        title="Mark as read"
                      >
                        <Check className="h-4 w-4" />
                      </Button>
                    )}
                    <Button
                      variant="ghost"
                      size="icon"
                      className="h-8 w-8 text-destructive hover:text-destructive"
                      onClick={() => deleteNotificationMutation.mutate(notification.id)}
                      data-testid={`button-delete-${notification.id}`}
                      title="Delete"
                    >
                      <Trash2 className="h-4 w-4" />
                    </Button>
                  </div>
                </div>
              </Card>
            ))}
          </div>
        )}
      </div>

      <Dialog open={dialogOpen} onOpenChange={setDialogOpen}>
        <DialogContent className="sm:max-w-md">
          <DialogHeader>
            <DialogTitle className="flex items-center gap-2">
              {selectedNotification && (
                <>
                  <span className={`p-1.5 rounded-full ${getTypeColor(selectedNotification.type)} text-white`}>
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
                  {selectedNotification.message}
                </p>
              </div>

              <div className="flex items-center gap-2 text-xs text-muted-foreground">
                <Badge className={`text-xs text-white ${getTypeColor(selectedNotification.type)}`}>
                  {selectedNotification.type}
                </Badge>
                <span>|</span>
                <span>{formatDistanceToNow(new Date(selectedNotification.createdAt), { addSuffix: true })}</span>
                {selectedNotification.isRead && (
                  <>
                    <span>|</span>
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
                      setDialogOpen(false);
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
                    onClick={() => setDialogOpen(false)}
                  >
                    Close
                  </Button>
                  <Button
                    size="sm"
                    onClick={handleAction}
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
    </DashboardLayout>
  );
}
