import { useState, useEffect } from "react";
import { useLocation } from "wouter";
import { useAuth } from "@/lib/auth";
import { useQuery, useMutation } from "@tanstack/react-query";
import { apiRequest, queryClient } from "@/lib/queryClient";
import { useToast } from "@/hooks/use-toast";
import DashboardLayout from "@/components/DashboardLayout";
import ThemeToggle from "@/components/ThemeToggle";
import { Card, CardContent } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { Loader2, Bell, Check, Trash2, ChevronLeft, Info, AlertCircle, CheckCircle } from "lucide-react";

interface Notification {
  id: string;
  userId: string;
  type: string;
  title: string;
  message: string;
  isRead: boolean;
  createdAt: string;
  metadata?: Record<string, any>;
}

export default function AgentNotifications() {
  const [, navigate] = useLocation();
  const { user, isAuthenticated, isLoading: authLoading } = useAuth();
  const { toast } = useToast();

  useEffect(() => {
    if (!authLoading && (!isAuthenticated || user?.role !== "agent")) {
      navigate("/");
    }
  }, [isAuthenticated, authLoading, user, navigate]);

  const { data: notifications = [], isLoading } = useQuery<Notification[]>({
    queryKey: ["/api/notifications", user?.id],
    queryFn: async () => {
      const res = await fetch("/api/notifications?limit=500", { credentials: "include" });
      if (!res.ok) throw new Error("Failed to fetch notifications");
      return res.json();
    },
    enabled: isAuthenticated && user?.role === "agent",
  });

  const markAsReadMutation = useMutation({
    mutationFn: async (id: string) => {
      return apiRequest("PATCH", `/api/notifications/${id}/read`, {});
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["/api/notifications", user?.id] });
    },
  });

  const deleteNotificationMutation = useMutation({
    mutationFn: async (id: string) => {
      return apiRequest("DELETE", `/api/notifications/${id}`, {});
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["/api/notifications", user?.id] });
      toast({
        title: "Notification deleted",
        description: "The notification has been removed",
      });
    },
  });

  const markAllAsReadMutation = useMutation({
    mutationFn: async () => {
      return apiRequest("PATCH", "/api/notifications/mark-all-read", {});
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["/api/notifications", user?.id] });
      toast({
        title: "All marked as read",
        description: "All notifications have been marked as read",
      });
    },
  });

  const handleNotificationClick = (notification: Notification) => {
    if (!notification.isRead) {
      markAsReadMutation.mutate(notification.id);
    }

    const metadata = notification.metadata || {};
    if (metadata.link) {
      navigate(metadata.link);
      return;
    }

    if (metadata.conversationId) {
      navigate(`/agent/tickets?conversationId=${encodeURIComponent(String(metadata.conversationId))}`);
      return;
    }

    if (metadata.orderId) {
      navigate(`/agent/tickets?orderId=${encodeURIComponent(String(metadata.orderId))}`);
      return;
    }

    if (metadata.senderId) {
      navigate(`/agent/messages?userId=${encodeURIComponent(String(metadata.senderId))}`);
      return;
    }
  };

  if (authLoading || !isAuthenticated || user?.role !== "agent") {
    return (
      <div className="min-h-screen bg-background flex items-center justify-center">
        <Loader2 className="h-8 w-8 animate-spin text-primary" data-testid="loader-agent-notifications" />
      </div>
    );
  }

  const unreadNotifications = notifications.filter(n => !n.isRead);
  const readNotifications = notifications.filter(n => n.isRead);

  const getNotificationIcon = (type: string) => {
    switch(type) {
      case "info": return <Info className="h-5 w-5 text-blue-500" />;
      case "warning": return <AlertCircle className="h-5 w-5 text-yellow-500" />;
      case "success": return <CheckCircle className="h-5 w-5 text-green-500" />;
      default: return <Bell className="h-5 w-5 text-primary" />;
    }
  };

  const NotificationCard = ({ notification }: { notification: Notification }) => (
    <Card
      className={`${!notification.isRead ? "border-primary" : ""} cursor-pointer transition-colors hover:border-primary/30 hover:bg-primary/5`}
      data-testid={`notification-${notification.id}`}
      onClick={() => handleNotificationClick(notification)}
    >
      <CardContent className="p-4">
        <div className="flex items-start gap-4">
          <div className="mt-1">
            {getNotificationIcon(notification.type)}
          </div>

          <div className="flex-1 min-w-0">
            <div className="flex items-center gap-2 mb-1">
              <h3 className="font-semibold">{notification.title}</h3>
              {!notification.isRead && (
                <Badge variant="default" className="text-xs">New</Badge>
              )}
            </div>
            <p className="text-sm text-muted-foreground mb-2">{notification.message}</p>
            <p className="text-xs text-muted-foreground">
              {new Date(notification.createdAt).toLocaleString()}
            </p>
          </div>

          <div className="flex items-center gap-2">
            {!notification.isRead && (
              <Button
                variant="ghost"
                size="icon"
                onClick={(e) => {
                  e.stopPropagation();
                  markAsReadMutation.mutate(notification.id);
                }}
                data-testid={`button-mark-read-${notification.id}`}
              >
                <Check className="h-4 w-4" />
              </Button>
            )}
            <Button
              variant="ghost"
              size="icon"
              onClick={(e) => {
                e.stopPropagation();
                deleteNotificationMutation.mutate(notification.id);
              }}
              data-testid={`button-delete-${notification.id}`}
            >
              <Trash2 className="h-4 w-4" />
            </Button>
          </div>
        </div>
      </CardContent>
    </Card>
  );

  return (
    <DashboardLayout role="agent" showBackButton>
      <div className="p-6">
            <Tabs defaultValue="unread" className="space-y-4">
              <TabsList>
                <TabsTrigger value="unread" data-testid="tab-unread">
                  Unread ({unreadNotifications.length})
                </TabsTrigger>
                <TabsTrigger value="read" data-testid="tab-read">
                  Read ({readNotifications.length})
                </TabsTrigger>
                <TabsTrigger value="all" data-testid="tab-all">
                  All ({notifications.length})
                </TabsTrigger>
              </TabsList>

              <TabsContent value="unread" className="space-y-4">
                {isLoading ? (
                  <div className="flex justify-center py-12">
                    <Loader2 className="h-8 w-8 animate-spin text-primary" />
                  </div>
                ) : unreadNotifications.length === 0 ? (
                  <Card>
                    <CardContent className="flex flex-col items-center justify-center py-12">
                      <Bell className="h-12 w-12 text-muted-foreground mb-4" />
                      <p className="text-muted-foreground">No unread notifications</p>
                    </CardContent>
                  </Card>
                ) : (
                  unreadNotifications.map(notification => (
                    <NotificationCard key={notification.id} notification={notification} />
                  ))
                )}
              </TabsContent>

              <TabsContent value="read" className="space-y-4">
                {isLoading ? (
                  <div className="flex justify-center py-12">
                    <Loader2 className="h-8 w-8 animate-spin text-primary" />
                  </div>
                ) : readNotifications.length === 0 ? (
                  <Card>
                    <CardContent className="flex flex-col items-center justify-center py-12">
                      <Bell className="h-12 w-12 text-muted-foreground mb-4" />
                      <p className="text-muted-foreground">No read notifications</p>
                    </CardContent>
                  </Card>
                ) : (
                  readNotifications.map(notification => (
                    <NotificationCard key={notification.id} notification={notification} />
                  ))
                )}
              </TabsContent>

              <TabsContent value="all" className="space-y-4">
                {isLoading ? (
                  <div className="flex justify-center py-12">
                    <Loader2 className="h-8 w-8 animate-spin text-primary" />
                  </div>
                ) : notifications.length === 0 ? (
                  <Card>
                    <CardContent className="flex flex-col items-center justify-center py-12">
                      <Bell className="h-12 w-12 text-muted-foreground mb-4" />
                      <p className="text-muted-foreground">No notifications</p>
                    </CardContent>
                  </Card>
                ) : (
                  notifications.map(notification => (
                    <NotificationCard key={notification.id} notification={notification} />
                  ))
                )}
              </TabsContent>
            </Tabs>
          </div>
    </DashboardLayout>
  );
}
