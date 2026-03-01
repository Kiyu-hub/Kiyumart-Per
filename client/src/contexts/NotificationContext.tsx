import { createContext, useCallback, useContext, useEffect, useState, ReactNode } from "react";
import { useAuth } from "@/lib/auth";
import { useToast } from "@/hooks/use-toast";
import { queryClient } from "@/lib/queryClient";
import { io, Socket } from "socket.io-client";

interface NotificationContextType {
  socket: Socket | null;
  isConnected: boolean;
}

const NotificationContext = createContext<NotificationContextType | undefined>(undefined);

export function useSocket() {
  const context = useContext(NotificationContext);
  if (!context) {
    throw new Error("useSocket must be used within NotificationProvider");
  }
  return context.socket;
}

export function NotificationProvider({ children }: { children: ReactNode }) {
  const { user } = useAuth();
  const { toast } = useToast();
  const [socket, setSocket] = useState<Socket | null>(null);
  const [isConnected, setIsConnected] = useState(false);
  const showDeviceNotification = useCallback((title: string, message: string, tag?: string) => {
    if (typeof window === "undefined") return;
    if (!("Notification" in window)) return;
    if (Notification.permission !== "granted") return;
    // Avoid duplicate browser alerts while user is actively viewing the app.
    if (document.visibilityState === "visible") return;
    try {
      new Notification(title, {
        body: message,
        tag,
      });
    } catch {
      // Ignore browser notification API errors.
    }
  }, []);

  useEffect(() => {
    if (typeof window === "undefined") return;
    if (!user) return;
    if (!("Notification" in window)) return;
    if (Notification.permission !== "default") return;
    Notification.requestPermission().catch(() => {});
  }, [user]);

  const playNotificationSound = useCallback(() => {
    if (typeof window === "undefined") return;
    const AudioCtx = (window as any).AudioContext || (window as any).webkitAudioContext;
    if (!AudioCtx) return;
    try {
      const ctx = new AudioCtx();
      const now = ctx.currentTime;
      const tone = (startAt: number, frequency: number, gainValue: number, duration: number) => {
        const oscillator = ctx.createOscillator();
        const gain = ctx.createGain();
        oscillator.type = "square";
        oscillator.frequency.value = frequency;
        gain.gain.setValueAtTime(0.0001, startAt);
        gain.gain.exponentialRampToValueAtTime(gainValue, startAt + 0.01);
        gain.gain.exponentialRampToValueAtTime(0.0001, startAt + duration);
        oscillator.connect(gain);
        gain.connect(ctx.destination);
        oscillator.start(startAt);
        oscillator.stop(startAt + duration);
      };
      tone(now, 940, 0.32, 0.16);
      tone(now + 0.18, 1280, 0.38, 0.2);
      setTimeout(() => {
        ctx.close().catch(() => {});
      }, 650);
    } catch {
      // Ignore sound errors from browser/device restrictions
    }
  }, []);

  const invalidateOrderQueries = useCallback(() => {
    queryClient.invalidateQueries({
      predicate: (query) => {
        const key = query.queryKey?.[0];
        if (typeof key !== "string") return false;
        return key.startsWith("/api/orders") || key.startsWith("/api/rider/active-delivery");
      },
    });
  }, []);

  useEffect(() => {
    if (!user) {
      if (socket) {
        socket.disconnect();
        setSocket(null);
        setIsConnected(false);
      }
      return;
    }

    const newSocket = io({
      auth: { userId: user.id }
    });

    newSocket.on("connect", () => {
      console.log("🔔 Notification system connected");
      setIsConnected(true);
      newSocket.emit("register", user.id);
    });

    newSocket.on("disconnect", () => {
      console.log("🔕 Notification system disconnected");
      setIsConnected(false);
    });

    // Order Status Updates
    newSocket.on("order_status_updated", (data: { 
      orderId: string; 
      orderNumber: string; 
      status: string; 
      updatedAt: string 
    }) => {
      console.log("📦 Order status updated:", data);
      
      invalidateOrderQueries();
      
      toast({
        title: "Order Status Updated",
        description: `Order #${data.orderNumber} is now ${data.status}`,
        duration: 5000,
      });

      if (data.status === "delivered") {
        toast({
          title: "🎉 Order Delivered!",
          description: `Order #${data.orderNumber} has been successfully delivered`,
          duration: 7000,
        });
      }
    });

    // Payment Confirmation
    newSocket.on("payment_completed", (data: {
      orderId: string;
      orderNumber: string;
      amount: string;
      paymentMethod: string;
    }) => {
      console.log("💳 Payment completed:", data);
      
      invalidateOrderQueries();
      queryClient.invalidateQueries({ queryKey: ["/api/transactions"] });
      
      toast({
        title: "✅ Payment Successful",
        description: `Payment of ${data.amount} confirmed for Order #${data.orderNumber}`,
        duration: 6000,
      });
    });

    // Payment Failed
    newSocket.on("payment_failed", (data: {
      orderId: string;
      orderNumber: string;
      reason: string;
    }) => {
      console.log("❌ Payment failed:", data);
      
      toast({
        title: "Payment Failed",
        description: `Payment for Order #${data.orderNumber} failed. ${data.reason}`,
        variant: "destructive",
        duration: 8000,
      });
    });

    // Delivery Updates
    newSocket.on("rider_location_updated", (data: {
      orderId: string;
      orderNumber: string;
      latitude: string;
      longitude: string;
      timestamp: string;
    }) => {
      console.log("🚚 Rider location updated:", data);
      
      // Only show notification occasionally, not for every location update
      const lastNotification = localStorage.getItem(`rider_notif_${data.orderId}`);
      const now = Date.now();
      
      if (!lastNotification || now - parseInt(lastNotification) > 300000) { // 5 minutes
        localStorage.setItem(`rider_notif_${data.orderId}`, now.toString());
        
        toast({
          title: "Delivery Update",
          description: `Your delivery for Order #${data.orderNumber} is on the way`,
          duration: 4000,
        });
      }
    });

    // Order Out for Delivery (canonical + legacy event names)
    const handleOrderEnRoute = (data: {
      orderId: string;
      orderNumber: string;
      trackingNumber?: string;
    }) => {
      console.log("📮 Order out for delivery:", data);
      
      invalidateOrderQueries();
      
      toast({
        title: "Order Out for Delivery",
        description: `Order #${data.orderNumber} is out for delivery`,
        duration: 6000,
      });
    };
    newSocket.on("order_en_route", handleOrderEnRoute);
    newSocket.on("order_delivering", handleOrderEnRoute);
    newSocket.on("admin_bus_transport_proof_submitted", (data: { orderId: string; orderNumber: string }) => {
      invalidateOrderQueries();
      if (user.role === "admin" || user.role === "super_admin") {
        toast({
          title: "BUS proof submitted",
          description: `Order #${data.orderNumber} transport proof is ready for verification.`,
          duration: 5000,
        });
      }
    });

    // New Product Available (for wishlist items)
    newSocket.on("product_back_in_stock", (data: {
      productId: string;
      productName: string;
    }) => {
      console.log("📢 Product back in stock:", data);
      
      queryClient.invalidateQueries({ queryKey: ["/api/products"] });
      queryClient.invalidateQueries({ queryKey: ["/api/wishlist"] });
      
      toast({
        title: "Product Available",
        description: `${data.productName} is back in stock!`,
        duration: 7000,
      });
    });

    // General Notifications
    newSocket.on("notification", (data: {
      title: string;
      message: string;
      type?: "default" | "success" | "error" | "warning";
    }) => {
      console.log("📬 General notification:", data);
      queryClient.invalidateQueries({ queryKey: ["/api/notifications"] });
      queryClient.invalidateQueries({ queryKey: ["/api/notifications/unread-count"] });
      
      toast({
        title: data.title,
        description: data.message,
        variant: data.type === "error" ? "destructive" : "default",
        duration: 5000,
      });
      showDeviceNotification(data.title, data.message, `notif-${data.type || "default"}`);
      playNotificationSound();
    });

    // Promotional/Marketing Messages
    newSocket.on("promotion", (data: {
      title: string;
      message: string;
      code?: string;
    }) => {
      console.log("🎁 Promotion:", data);
      
      toast({
        title: data.title,
        description: data.code 
          ? `${data.message} Use code: ${data.code}`
          : data.message,
        duration: 8000,
      });
    });

    // Real-time Chat Messages
    newSocket.on("new_message", (data: {
      id: string;
      senderId: string;
      receiverId: string;
      message: string;
      status: string;
      createdAt: string;
    }) => {
      console.log("💬 New message received:", data);
      
      // Invalidate messages queries to refresh chat UI
      queryClient.invalidateQueries({ queryKey: ["/api/messages"] });
      queryClient.invalidateQueries({ queryKey: ["/api/messages", data.senderId] });

      // Do not notify sender about their own outgoing message
      if (data.senderId === user.id) {
        return;
      }
      
      // Show toast notification for new message
      toast({
        title: "New Message",
        description: data.message.length > 50 
          ? `${data.message.substring(0, 50)}...`
          : data.message,
        duration: 4000,
      });
      showDeviceNotification("New Message", data.message, `message-${data.id}`);
      playNotificationSound();
    });

    // Seller Application Approved (for real-time store updates)
    if (user.role === "seller") {
      const sellerApprovedEvent = `seller-approved:${user.id}`;
      newSocket.on(sellerApprovedEvent, (data: {
        sellerId: string;
        timestamp: string;
      }) => {
        console.log("🎉 Seller application approved:", data);
        
        // Immediately refetch store to show the newly created store
        queryClient.invalidateQueries({ queryKey: ["/api/stores/my-store"] });
        queryClient.refetchQueries({ queryKey: ["/api/stores/my-store"] });
        
        toast({
          title: "🎉 Application Approved!",
          description: "Your seller application has been approved. Your store is now ready!",
          duration: 7000,
        });
      });
    }

    setSocket(newSocket);

    // Heartbeat interval for presence tracking (8 seconds)
    const heartbeatInterval = setInterval(() => {
      if (newSocket.connected) {
        newSocket.emit("heartbeat");
      }
    }, 8000);

    return () => {
      clearInterval(heartbeatInterval);
      newSocket.disconnect();
      setSocket(null);
      setIsConnected(false);
    };
  }, [user?.id, user?.role, toast, playNotificationSound, showDeviceNotification, invalidateOrderQueries]);

  return (
    <NotificationContext.Provider value={{ socket, isConnected }}>
      {children}
    </NotificationContext.Provider>
  );
}

export function useNotifications() {
  const context = useContext(NotificationContext);
  if (context === undefined) {
    throw new Error("useNotifications must be used within a NotificationProvider");
  }
  return context;
}
