import { useState } from "react";
import { useQuery, useMutation } from "@tanstack/react-query";
import { useLocation } from "wouter";
import DashboardLayout from "@/components/DashboardLayout";
import { useAuth } from "@/lib/auth";
import { Button } from "@/components/ui/button";
import { Card } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogDescription,
} from "@/components/ui/dialog";
import { Loader2, Bell, Check, Trash2, ExternalLink, Package, ShoppingCart, MessageSquare, AlertCircle, Tag, Truck } from "lucide-react";
import { apiRequest, queryClient } from "@/lib/queryClient";
import { useToast } from "@/hooks/use-toast";
import { formatDistanceToNow } from "date-fns";

interface Notification {
  id: string;
  title: string;
  message: string;
  type: string;
  isRead: boolean;
  createdAt: string;
  metadata?: Record<string, any>;
}

export default function SellerNotifications() {
  const { user } = useAuth();
  const { toast } = useToast();
  const [, navigate] = useLocation();
  const [selectedNotification, setSelectedNotification] = useState<Notification | null>(null);
  const [dialogOpen, setDialogOpen] = useState(false);

  const { data: notifications = [], isLoading } = useQuery<Notification[]>({
    queryKey: ["/api/notifications", user?.id],
    queryFn: async () => {
      const res = await fetch("/api/notifications", { credentials: "include" });
      if (!res.ok) throw new Error("Failed to fetch notifications");
      return res.json();
    },
  });

  const markAsReadMutation = useMutation({
    mutationFn: async (id: string) => {
      return apiRequest("PATCH", `/api/notifications/${id}/read`);
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["/api/notifications", user?.id] });
    },
  });

  const deleteNotificationMutation = useMutation({
    mutationFn: async (id: string) => {
      return apiRequest("DELETE", `/api/notifications/${id}`);
    },
    onSuccess: () => {
      toast({ title: "Notification deleted" });
      queryClient.invalidateQueries({ queryKey: ["/api/notifications", user?.id] });
    },
  });

  const markAllAsReadMutation = useMutation({
    mutationFn: async () => {
      return apiRequest("POST", "/api/notifications/mark-all-read");
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["/api/notifications", user?.id] });
    },
  });

  const getTypeColor = (type: string) => {
    switch (type) {
      case "order": return "bg-blue-500";
      case "product": return "bg-primary";
      case "payment": return "bg-green-500";
      case "payout": return "bg-emerald-500";
      case "delivery": return "bg-purple-500";
      case "message": return "bg-teal-500";
      case "system": return "bg-orange-500";
      case "alert": return "bg-red-500";
      default: return "bg-gray-500";
    }
  };

  const getIcon = (type: string) => {
    switch (type) {
      case "order": return <ShoppingCart className="h-4 w-4" />;
      case "product": return <Package className="h-4 w-4" />;
      case "delivery": return <Truck className="h-4 w-4" />;
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
        navigate("/seller/orders");
        break;
      case "product":
        navigate("/seller/products");
        break;
      case "message":
        navigate("/seller/messages");
        break;
      case "payout":
        navigate("/seller/payouts");
        break;
      default:
        break;
    }
  };

  return (
    <DashboardLayout role="seller">
      <div className="p-6">
        <div className="flex justify-between items-center mb-6">
          <div>
            <h1 className="text-3xl font-bold" data-testid="text-page-title">Notifications</h1>
            <p className="text-muted-foreground">Stay updated with your store activities</p>
          </div>
          {notifications.some(n => !n.isRead) && (
            <Button
              variant="outline"
              onClick={() => markAllAsReadMutation.mutate()}
              data-testid="button-mark-all-read"
            >
              <Check className="h-4 w-4 mr-2" />
              Mark All as Read
            </Button>
          )}
        </div>

        {isLoading ? (
          <div className="flex justify-center py-12">
            <Loader2 className="h-8 w-8 animate-spin text-primary" />
          </div>
        ) : notifications.length === 0 ? (
          <Card className="p-12">
            <div className="text-center">
              <Bell className="h-12 w-12 text-muted-foreground mx-auto mb-4" />
              <h3 className="text-lg font-semibold mb-2">No notifications</h3>
              <p className="text-muted-foreground">You're all caught up!</p>
            </div>
          </Card>
        ) : (
          <div className="space-y-3">
            {notifications.map((notification) => (
              <Card
                key={notification.id}
                className={`p-4 cursor-pointer hover:shadow-md transition-all ${!notification.isRead ? "border-l-4 border-l-primary bg-muted/50" : ""}`}
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
                          <Badge variant="default" className="text-xs">New</Badge>
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
                        className="h-8 w-8"
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

      {/* Notification Detail Dialog */}
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
