import { useLocation } from "wouter";
import { cn } from "@/lib/utils";
import { MobileStatCardSkeleton } from "@/components/mobile/MobileSkeletonCard";
import { useHaptic } from "@/hooks/useHaptic";
import UserAvatar from "@/components/UserAvatar";
import { Button } from "@/components/ui/button";
import {
  Plus, Package, BarChart3, ShoppingCart, Settings, Bell,
  TrendingUp, TrendingDown, Clock, AlertTriangle, ChevronRight, Wallet,
} from "lucide-react";

interface SellerStats {
  todayRevenue?: number;
  totalRevenue?: number;
  pendingOrders?: number;
  totalOrders?: number;
  activeProducts?: number;
  totalProducts?: number;
  pendingPayouts?: number;
}

interface RecentOrder {
  id: string;
  orderNumber?: string;
  status: string;
  totalAmount: string;
  createdAt: string;
  buyerName?: string;
  itemCount?: number;
}

interface MobileSellerDashboardProps {
  user: { name: string; profileImage?: string };
  stats: SellerStats;
  recentOrders: RecentOrder[];
  isLoading: boolean;
  unreadCount?: number;
}

interface StatCardProps {
  label: string;
  value: string;
  sub?: string;
  trend?: "up" | "down" | "neutral";
  accent?: string;
}

function StatCard({ label, value, sub, trend, accent = "bg-card" }: StatCardProps) {
  return (
    <div className={cn("mobile-card p-4 shrink-0 min-w-[148px]", accent)}>
      <p className="mobile-caption text-muted-foreground mb-1">{label}</p>
      <p className="text-2xl font-bold text-foreground leading-none">{value}</p>
      {sub && (
        <div className="flex items-center gap-1 mt-1.5">
          {trend === "up" && <TrendingUp className="w-3 h-3 text-emerald-500" />}
          {trend === "down" && <TrendingDown className="w-3 h-3 text-destructive" />}
          <p className={cn(
            "mobile-caption",
            trend === "up" ? "text-emerald-600" : trend === "down" ? "text-destructive" : "text-muted-foreground",
          )}>
            {sub}
          </p>
        </div>
      )}
    </div>
  );
}

interface QuickActionProps {
  icon: React.ElementType;
  label: string;
  onClick: () => void;
  badge?: number;
  accent?: string;
}

function QuickAction({ icon: Icon, label, onClick, badge, accent = "bg-muted/60" }: QuickActionProps) {
  const { trigger: haptic } = useHaptic();
  return (
    <button
      onClick={() => { haptic("light"); onClick(); }}
      className="flex flex-col items-center gap-2 p-4 rounded-2xl touch-ripple mobile-press transition-all"
      style={{ background: accent === "bg-muted/60" ? undefined : undefined }}
    >
      <div className={cn("w-14 h-14 rounded-2xl flex items-center justify-center relative", accent)}>
        <Icon className="w-6 h-6 text-foreground" />
        {badge !== undefined && badge > 0 && (
          <span className="absolute -top-1 -right-1 min-w-[18px] h-[18px] px-1 bg-destructive text-destructive-foreground text-[10px] font-bold rounded-full flex items-center justify-center mobile-bounce-in">
            {badge > 99 ? "99+" : badge}
          </span>
        )}
      </div>
      <p className="mobile-caption font-medium text-foreground text-center leading-tight max-w-[72px]">{label}</p>
    </button>
  );
}

const ORDER_STATUS_COLORS: Record<string, string> = {
  pending: "bg-amber-500",
  processing: "bg-blue-500",
  packaged: "bg-blue-400",
  ready: "bg-violet-500",
  completed: "bg-emerald-500",
  cancelled: "bg-destructive",
};

export function MobileSellerDashboard({
  user,
  stats,
  recentOrders,
  isLoading,
  unreadCount = 0,
}: MobileSellerDashboardProps) {
  const [, navigate] = useLocation();
  const { trigger: haptic } = useHaptic();

  const greeting = () => {
    const h = new Date().getHours();
    if (h < 12) return "Good morning";
    if (h < 17) return "Good afternoon";
    return "Good evening";
  };

  return (
    <div className="flex flex-col min-h-screen bg-background mobile-page-enter">
      {/* Header */}
      <header
        className="glass border-b border-border/30 px-4 py-3 sticky top-0 z-30"
        style={{ paddingTop: "env(safe-area-inset-top, 0px)" }}
      >
        <div className="flex items-center justify-between">
          <div className="flex items-center gap-3">
            <UserAvatar name={user.name} profileImage={user.profileImage} size="sm" className="w-9 h-9" />
            <div>
              <p className="mobile-caption text-muted-foreground leading-none">{greeting()},</p>
              <p className="mobile-headline truncate max-w-[140px]">{user.name.split(" ")[0]}</p>
            </div>
          </div>
          <div className="flex items-center gap-1">
            <Button
              variant="ghost"
              size="icon"
              className="relative touch-ripple h-9 w-9 rounded-full"
              onClick={() => navigate("/seller/notifications")}
            >
              <Bell className="w-5 h-5" />
              {unreadCount > 0 && (
                <span className="absolute top-1 right-1 w-2 h-2 rounded-full bg-destructive mobile-bounce-in" />
              )}
            </Button>
            <Button
              variant="ghost"
              size="icon"
              className="touch-ripple h-9 w-9 rounded-full"
              onClick={() => navigate("/seller/settings")}
            >
              <Settings className="w-5 h-5" />
            </Button>
          </div>
        </div>
      </header>

      <main className="flex-1 overflow-y-auto pb-4">
        {/* Stats row */}
        <section className="px-4 pt-4 pb-2">
          <div className="mobile-hscroll">
            {isLoading ? (
              <>
                <MobileStatCardSkeleton />
                <MobileStatCardSkeleton />
                <MobileStatCardSkeleton />
                <MobileStatCardSkeleton />
              </>
            ) : (
              <>
                <StatCard
                  label="Today's Revenue"
                  value={`GHS ${(stats.todayRevenue ?? 0).toFixed(2)}`}
                  trend="up"
                  sub="vs yesterday"
                />
                <StatCard
                  label="Pending Orders"
                  value={String(stats.pendingOrders ?? 0)}
                  sub={stats.pendingOrders ? "Need attention" : "All clear"}
                  trend={stats.pendingOrders ? "down" : "up"}
                />
                <StatCard
                  label="Products"
                  value={String(stats.activeProducts ?? 0)}
                  sub={`of ${stats.totalProducts ?? 0} total`}
                />
                <StatCard
                  label="Pending Payouts"
                  value={`GHS ${(stats.pendingPayouts ?? 0).toFixed(2)}`}
                  sub="Awaiting transfer"
                />
              </>
            )}
          </div>
        </section>

        {/* Quick actions */}
        <section className="px-4 pt-2 pb-2">
          <p className="mobile-caption text-muted-foreground uppercase tracking-wide font-medium mb-3">Quick Actions</p>
          <div className="grid grid-cols-4 gap-2">
            <QuickAction
              icon={Plus}
              label="Add Product"
              accent="bg-primary/10"
              onClick={() => navigate("/seller/products?action=add")}
            />
            <QuickAction
              icon={ShoppingCart}
              label="Orders"
              accent="bg-blue-100 dark:bg-blue-900/30"
              badge={stats.pendingOrders}
              onClick={() => navigate("/seller/orders")}
            />
            <QuickAction
              icon={BarChart3}
              label="Analytics"
              accent="bg-violet-100 dark:bg-violet-900/30"
              onClick={() => navigate("/seller/analytics")}
            />
            <QuickAction
              icon={Wallet}
              label="Payouts"
              accent="bg-emerald-100 dark:bg-emerald-900/30"
              onClick={() => navigate("/seller/payout")}
            />
          </div>
        </section>

        {/* Recent orders */}
        <section className="px-4 pt-3">
          <div className="flex items-center justify-between mb-3">
            <p className="mobile-headline">Recent Orders</p>
            <button
              onClick={() => navigate("/seller/orders")}
              className="text-primary text-sm font-medium flex items-center gap-0.5 touch-ripple px-1 py-0.5 rounded-lg"
            >
              See All <ChevronRight className="w-4 h-4" />
            </button>
          </div>

          {isLoading ? (
            <div className="space-y-2">
              {Array.from({ length: 3 }).map((_, i) => (
                <div key={i} className="mobile-card bg-card p-4 flex items-center gap-3">
                  <div className="skeleton-shimmer w-10 h-10 rounded-xl" />
                  <div className="flex-1 space-y-2">
                    <div className="skeleton-shimmer h-3 w-32 rounded" />
                    <div className="skeleton-shimmer h-3 w-20 rounded" />
                  </div>
                  <div className="skeleton-shimmer h-6 w-16 rounded-full" />
                </div>
              ))}
            </div>
          ) : recentOrders.length === 0 ? (
            <div className="mobile-card bg-card p-6 text-center">
              <Clock className="w-8 h-8 text-muted-foreground/40 mx-auto mb-2" />
              <p className="mobile-subhead text-muted-foreground">No recent orders</p>
            </div>
          ) : (
            <div className="space-y-2">
              {recentOrders.slice(0, 5).map((order) => (
                <button
                  key={order.id}
                  onClick={() => { haptic("light"); navigate(`/seller/orders/${order.id}`); }}
                  className="mobile-card bg-card w-full flex items-center gap-3 p-3.5 text-left touch-ripple"
                >
                  <div className={cn(
                    "w-10 h-10 rounded-2xl flex items-center justify-center shrink-0",
                    ORDER_STATUS_COLORS[order.status]
                      ? ORDER_STATUS_COLORS[order.status].replace("bg-", "bg-") + "/15"
                      : "bg-muted",
                  )}>
                    <Package className={cn("w-5 h-5", ORDER_STATUS_COLORS[order.status] ? "text-current" : "text-muted-foreground")} />
                  </div>
                  <div className="flex-1 min-w-0">
                    <p className="text-sm font-semibold truncate">
                      #{order.orderNumber || order.id.slice(0, 8).toUpperCase()}
                    </p>
                    <p className="mobile-caption text-muted-foreground">
                      {order.buyerName && `${order.buyerName} · `}
                      {order.itemCount ? `${order.itemCount} item${order.itemCount !== 1 ? "s" : ""}` : ""}
                    </p>
                  </div>
                  <div className="text-right shrink-0">
                    <p className="text-sm font-bold text-primary">GHS {parseFloat(order.totalAmount).toFixed(2)}</p>
                    <span className={cn(
                      "text-[10px] font-semibold px-2 py-0.5 rounded-full",
                      ORDER_STATUS_COLORS[order.status]
                        ? `${ORDER_STATUS_COLORS[order.status]}/10 text-current`
                        : "bg-muted text-muted-foreground",
                    )}>
                      {order.status}
                    </span>
                  </div>
                </button>
              ))}
            </div>
          )}
        </section>
      </main>
    </div>
  );
}
