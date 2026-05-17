import { useLocation } from "wouter";
import { cn } from "@/lib/utils";
import { useHaptic } from "@/hooks/useHaptic";
import UserAvatar from "@/components/UserAvatar";
import {
  Plus, Package, BarChart3, ShoppingCart, Settings, Bell,
  TrendingUp, TrendingDown, Clock, ChevronRight, Wallet,
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
  iconBg?: string;
}

function StatCard({ label, value, sub, trend, iconBg = "bg-[#1E1E1E]" }: StatCardProps) {
  return (
    <div className={cn("rounded-2xl p-4 shrink-0 min-w-[148px]", iconBg)}>
      <p className="text-white/40 text-[12px] font-medium mb-1.5">{label}</p>
      <p className="text-white text-[22px] font-black leading-none">{value}</p>
      {sub && (
        <div className="flex items-center gap-1 mt-1.5">
          {trend === "up" && <TrendingUp className="w-3 h-3 text-[#009688]" />}
          {trend === "down" && <TrendingDown className="w-3 h-3 text-red-400" />}
          <p className={cn(
            "text-[11px] font-medium",
            trend === "up" ? "text-[#009688]" : trend === "down" ? "text-red-400" : "text-white/30",
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
  iconBg?: string;
  iconColor?: string;
}

function QuickAction({ icon: Icon, label, onClick, badge, iconBg = "bg-[#1E1E1E]", iconColor = "text-white/70" }: QuickActionProps) {
  const { trigger: haptic } = useHaptic();
  return (
    <button
      onClick={() => { haptic("light"); onClick(); }}
      className="flex flex-col items-center gap-2 p-3 rounded-2xl touch-ripple active:bg-white/[0.04] transition-colors"
    >
      <div className={cn("w-14 h-14 rounded-2xl flex items-center justify-center relative", iconBg)}>
        <Icon className={cn("w-6 h-6", iconColor)} />
        {badge !== undefined && badge > 0 && (
          <span className="absolute -top-1 -right-1 min-w-[18px] h-[18px] px-1 bg-red-500 text-white text-[10px] font-bold rounded-full flex items-center justify-center mobile-bounce-in">
            {badge > 99 ? "99+" : badge}
          </span>
        )}
      </div>
      <p className="text-white/60 text-[11px] font-medium text-center leading-tight max-w-[72px]">{label}</p>
    </button>
  );
}

const ORDER_STATUS_CONFIG: Record<string, { bg: string; text: string; dot: string }> = {
  pending:    { bg: "bg-amber-500/15",    text: "text-amber-400",    dot: "bg-amber-400" },
  processing: { bg: "bg-blue-500/15",     text: "text-blue-400",     dot: "bg-blue-400" },
  packaged:   { bg: "bg-blue-400/15",     text: "text-blue-300",     dot: "bg-blue-300" },
  ready:      { bg: "bg-violet-500/15",   text: "text-violet-400",   dot: "bg-violet-400" },
  completed:  { bg: "bg-[#009688]/15",    text: "text-[#009688]",    dot: "bg-[#009688]" },
  cancelled:  { bg: "bg-red-500/15",      text: "text-red-400",      dot: "bg-red-400" },
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
    <div className="flex flex-col min-h-screen bg-[#0D0D0D] mobile-page-enter">
      {/* Header */}
      <header
        className="px-4 py-3 sticky top-0 z-30 bg-[#0D0D0D]/95 backdrop-blur-md border-b border-white/[0.06]"
        style={{ paddingTop: "max(12px, env(safe-area-inset-top, 0px))" }}
      >
        <div className="flex items-center justify-between">
          <div className="flex items-center gap-3">
            <UserAvatar name={user.name} profileImage={user.profileImage} size="sm" className="w-9 h-9" />
            <div>
              <p className="text-white/40 text-[12px] font-medium leading-none">{greeting()},</p>
              <p className="text-white text-[16px] font-bold truncate max-w-[140px] mt-0.5">
                {user.name.split(" ")[0]}
              </p>
            </div>
          </div>
          <div className="flex items-center gap-1">
            <button
              className="relative w-9 h-9 rounded-full flex items-center justify-center touch-ripple active:bg-white/10"
              onClick={() => navigate("/seller/notifications")}
            >
              <Bell className="w-5 h-5 text-white/70" />
              {unreadCount > 0 && (
                <span className="absolute top-1.5 right-1.5 w-2 h-2 rounded-full bg-red-500 mobile-bounce-in" />
              )}
            </button>
            <button
              className="w-9 h-9 rounded-full flex items-center justify-center touch-ripple active:bg-white/10"
              onClick={() => navigate("/seller/settings")}
            >
              <Settings className="w-5 h-5 text-white/70" />
            </button>
          </div>
        </div>
      </header>

      <main className="flex-1 overflow-y-auto pb-4">
        {/* Stats row */}
        <section className="px-4 pt-4 pb-2">
          <div className="flex gap-3 overflow-x-auto pb-1 mobile-hscroll">
            {isLoading ? (
              <>
                {Array.from({ length: 4 }).map((_, i) => (
                  <div key={i} className="h-[90px] min-w-[148px] bg-[#1A1A1A] rounded-2xl animate-pulse shrink-0" />
                ))}
              </>
            ) : (
              <>
                <StatCard
                  label="Today's Revenue"
                  value={`GHS ${(stats.todayRevenue ?? 0).toFixed(2)}`}
                  trend="up"
                  sub="vs yesterday"
                  iconBg="bg-[#009688]/10"
                />
                <StatCard
                  label="Pending Orders"
                  value={String(stats.pendingOrders ?? 0)}
                  sub={stats.pendingOrders ? "Need attention" : "All clear"}
                  trend={stats.pendingOrders ? "down" : "up"}
                  iconBg="bg-[#1E1E1E]"
                />
                <StatCard
                  label="Products"
                  value={String(stats.activeProducts ?? 0)}
                  sub={`of ${stats.totalProducts ?? 0} total`}
                  iconBg="bg-[#1E1E1E]"
                />
                <StatCard
                  label="Pending Payouts"
                  value={`GHS ${(stats.pendingPayouts ?? 0).toFixed(2)}`}
                  sub="Awaiting transfer"
                  iconBg="bg-[#1E1E1E]"
                />
              </>
            )}
          </div>
        </section>

        {/* Quick actions */}
        <section className="px-4 pt-2 pb-2">
          <p className="text-white/30 text-[11px] uppercase tracking-widest font-semibold mb-3">Quick Actions</p>
          <div className="grid grid-cols-4 gap-1">
            <QuickAction
              icon={Plus}
              label="Add Product"
              iconBg="bg-[#009688]/15"
              iconColor="text-[#009688]"
              onClick={() => navigate("/seller/products?action=add")}
            />
            <QuickAction
              icon={ShoppingCart}
              label="Orders"
              iconBg="bg-blue-500/15"
              iconColor="text-blue-400"
              badge={stats.pendingOrders}
              onClick={() => navigate("/seller/orders")}
            />
            <QuickAction
              icon={BarChart3}
              label="Analytics"
              iconBg="bg-violet-500/15"
              iconColor="text-violet-400"
              onClick={() => navigate("/seller/analytics")}
            />
            <QuickAction
              icon={Wallet}
              label="Payouts"
              iconBg="bg-amber-500/15"
              iconColor="text-amber-400"
              onClick={() => navigate("/seller/payout")}
            />
          </div>
        </section>

        {/* Recent orders */}
        <section className="px-4 pt-3">
          <div className="flex items-center justify-between mb-3">
            <p className="text-white text-[17px] font-bold">Recent Orders</p>
            <button
              onClick={() => navigate("/seller/orders")}
              className="text-[#009688] text-[13px] font-semibold flex items-center gap-0.5 touch-ripple px-1 py-0.5 rounded-2xl active:bg-[#009688]/10"
            >
              See All <ChevronRight className="w-4 h-4" />
            </button>
          </div>

          {isLoading ? (
            <div className="space-y-2">
              {Array.from({ length: 3 }).map((_, i) => (
                <div key={i} className="h-[68px] bg-[#1A1A1A] rounded-2xl animate-pulse" />
              ))}
            </div>
          ) : recentOrders.length === 0 ? (
            <div className="bg-[#1A1A1A] rounded-2xl p-6 text-center">
              <Clock className="w-8 h-8 text-white/20 mx-auto mb-2" />
              <p className="text-white/40 text-[14px] font-medium">No recent orders</p>
            </div>
          ) : (
            <div className="space-y-2">
              {recentOrders.slice(0, 5).map((order) => {
                const cfg = ORDER_STATUS_CONFIG[order.status] || { bg: "bg-white/10", text: "text-white/40", dot: "bg-white/30" };
                return (
                  <button
                    key={order.id}
                    onClick={() => { haptic("light"); navigate(`/seller/orders/${order.id}`); }}
                    className="bg-[#1A1A1A] rounded-2xl w-full flex items-center gap-3 px-4 py-3.5 text-left touch-ripple active:bg-[#222222] transition-colors"
                  >
                    <div className={cn("w-10 h-10 rounded-2xl flex items-center justify-center shrink-0", cfg.bg)}>
                      <Package className={cn("w-5 h-5", cfg.text)} />
                    </div>
                    <div className="flex-1 min-w-0">
                      <p className="text-white text-[13px] font-bold truncate">
                        #{order.orderNumber || order.id.slice(0, 8).toUpperCase()}
                      </p>
                      <p className="text-white/30 text-[12px]">
                        {order.buyerName ? `${order.buyerName} · ` : ""}
                        {order.itemCount ? `${order.itemCount} item${order.itemCount !== 1 ? "s" : ""}` : ""}
                      </p>
                    </div>
                    <div className="text-right shrink-0">
                      <p className="text-[#009688] text-[14px] font-black">GHS {parseFloat(order.totalAmount).toFixed(2)}</p>
                      <span className={cn(
                        "text-[10px] font-bold px-2 py-0.5 rounded-full",
                        cfg.bg, cfg.text,
                      )}>
                        {order.status}
                      </span>
                    </div>
                  </button>
                );
              })}
            </div>
          )}
        </section>
      </main>
    </div>
  );
}
