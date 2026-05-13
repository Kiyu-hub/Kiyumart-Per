import { useLocation } from "wouter";
import { useHaptic } from "@/hooks/useHaptic";
import { cn } from "@/lib/utils";
import { MobilePageHeader } from "@/components/mobile/MobilePageHeader";
import UserAvatar from "@/components/UserAvatar";
import { Badge } from "@/components/ui/badge";
import {
  User, Package, Heart, Settings, Bell, Shield,
  LogOut, ChevronRight, Copy, Star, Store, CreditCard,
  HelpCircle, FileText, Lock, ExternalLink, Truck, Edit3,
} from "lucide-react";
import { useToast } from "@/hooks/use-toast";

interface UserProfile {
  id: string;
  name: string;
  email: string;
  phone?: string;
  role: string;
  profileImage?: string;
  storeName?: string;
  referralCode?: string;
}

interface ProfileStats {
  orders?: number;
  wishlistCount?: number;
  reviewsCount?: number;
  productsCount?: number;
  revenue?: number;
}

interface MobileProfileProps {
  profile: UserProfile | null;
  stats?: ProfileStats;
  onLogout: () => void;
}

interface ListItemProps {
  icon: React.ElementType;
  label: string;
  subtitle?: string;
  onClick?: () => void;
  danger?: boolean;
  value?: string;
  iconColor?: string;
  iconBg?: string;
}

function ListItem({ icon: Icon, label, subtitle, onClick, danger, value, iconColor, iconBg }: ListItemProps) {
  return (
    <button
      onClick={onClick}
      className="mobile-grouped-list-item touch-ripple w-full text-left"
    >
      <span className={cn(
        "w-9 h-9 rounded-xl flex items-center justify-center shrink-0",
        iconBg || "bg-muted",
      )}>
        <Icon className={cn("w-[18px] h-[18px]", iconColor || "text-foreground")} />
      </span>
      <div className="flex-1 min-w-0">
        <p className={cn("text-[15px] font-medium leading-tight", danger && "text-destructive")}>{label}</p>
        {subtitle && <p className="text-[12px] text-muted-foreground mt-0.5">{subtitle}</p>}
      </div>
      {value ? (
        <span className="text-[13px] text-muted-foreground shrink-0 font-medium">{value}</span>
      ) : (
        <ChevronRight className="w-4 h-4 text-muted-foreground/40 shrink-0" />
      )}
    </button>
  );
}

function SectionTitle({ children }: { children: React.ReactNode }) {
  return (
    <p className="text-[12px] text-muted-foreground uppercase tracking-widest font-semibold px-1 pt-6 pb-2">
      {children}
    </p>
  );
}

function StatBox({ value, label, color = "text-foreground" }: { value: string | number; label: string; color?: string }) {
  return (
    <div className="flex-1 text-center py-3 px-1">
      <p className={cn("text-[22px] font-black leading-none", color)}>{value}</p>
      <p className="text-[11px] text-muted-foreground mt-1 font-medium">{label}</p>
    </div>
  );
}

export function MobileProfile({ profile, stats = {}, onLogout }: MobileProfileProps) {
  const [, navigate] = useLocation();
  const { toast } = useToast();
  const { trigger: haptic } = useHaptic();

  const roleLabel: Record<string, string> = {
    buyer: "Buyer",
    seller: "Seller",
    rider: "Rider",
    admin: "Admin",
    super_admin: "Super Admin",
    pickup_agent: "Pickup Agent",
    agent: "Support Agent",
  };

  const roleColorClass: Record<string, string> = {
    buyer: "bg-blue-100 text-blue-700 dark:bg-blue-900/30 dark:text-blue-300",
    seller: "bg-amber-100 text-amber-700 dark:bg-amber-900/30 dark:text-amber-300",
    rider: "bg-cyan-100 text-cyan-700 dark:bg-cyan-900/30 dark:text-cyan-300",
    admin: "bg-violet-100 text-violet-700 dark:bg-violet-900/30 dark:text-violet-300",
    super_admin: "bg-rose-100 text-rose-700 dark:bg-rose-900/30 dark:text-rose-300",
    pickup_agent: "bg-emerald-100 text-emerald-700 dark:bg-emerald-900/30 dark:text-emerald-300",
    agent: "bg-sky-100 text-sky-700 dark:bg-sky-900/30 dark:text-sky-300",
  };

  const copyReferralCode = () => {
    if (!profile?.referralCode) return;
    navigator.clipboard.writeText(profile.referralCode).then(() => {
      haptic("success");
      toast({ title: "Copied!", description: "Referral code copied to clipboard." });
    });
  };

  if (!profile) {
    return (
      <div className="flex flex-col min-h-screen bg-background">
        <MobilePageHeader title="Profile" showBack={false} />
        <div className="flex-1 flex items-center justify-center">
          <p className="text-muted-foreground">Loading profile…</p>
        </div>
      </div>
    );
  }

  const hasStats = stats.orders !== undefined || stats.wishlistCount !== undefined ||
    stats.productsCount !== undefined || stats.reviewsCount !== undefined;

  return (
    <div className="flex flex-col min-h-screen bg-background mobile-page-enter">
      <MobilePageHeader title="Profile" showBack={false} />

      <main className="flex-1 overflow-y-auto pb-6">

        {/* ── Profile hero card ── */}
        <div className="relative mx-4 mt-4 rounded-3xl overflow-hidden bg-card border border-border/30">
          {/* Gradient top band */}
          <div
            className="h-20 w-full"
            style={{ background: "linear-gradient(135deg, hsl(var(--primary)) 0%, hsl(var(--primary) / 0.6) 100%)" }}
          />

          {/* Avatar floats over the band */}
          <div className="px-5 pb-5">
            <div className="flex items-end justify-between -mt-10 mb-3">
              <div className="relative">
                <UserAvatar
                  name={profile.name}
                  profileImage={profile.profileImage}
                  size="lg"
                  className="w-20 h-20 text-xl ring-4 ring-background shadow-lg"
                />
                <button
                  onClick={() => navigate("/profile?edit=true")}
                  className="absolute -bottom-1 -right-1 w-7 h-7 rounded-full bg-primary text-primary-foreground flex items-center justify-center border-2 border-background shadow-md touch-ripple"
                >
                  <Edit3 className="w-3.5 h-3.5" />
                </button>
              </div>
              <Badge
                className={cn(
                  "text-[12px] font-bold rounded-full px-3 py-1 border-0",
                  roleColorClass[profile.role] || "bg-muted text-muted-foreground",
                )}
              >
                {roleLabel[profile.role] || profile.role}
              </Badge>
            </div>

            <h2 className="text-[20px] font-black text-foreground leading-tight">{profile.name}</h2>
            <p className="text-[13px] text-muted-foreground mt-0.5 truncate">{profile.email}</p>
            {profile.phone && (
              <p className="text-[13px] text-muted-foreground">{profile.phone}</p>
            )}
            {profile.storeName && (
              <p className="text-[13px] text-primary font-semibold mt-1 flex items-center gap-1">
                <Store className="w-3.5 h-3.5" /> {profile.storeName}
              </p>
            )}

            {/* Stats row */}
            {hasStats && (
              <div className="flex items-stretch gap-0 mt-4 bg-muted/40 rounded-2xl overflow-hidden border border-border/20">
                {profile.role === "buyer" && stats.orders !== undefined && (
                  <>
                    <StatBox value={stats.orders} label="Orders" color="text-primary" />
                    <div className="w-px bg-border/30" />
                  </>
                )}
                {stats.wishlistCount !== undefined && (
                  <>
                    <StatBox value={stats.wishlistCount} label="Wishlist" color="text-rose-500" />
                    <div className="w-px bg-border/30" />
                  </>
                )}
                {stats.reviewsCount !== undefined && (
                  <StatBox value={stats.reviewsCount} label="Reviews" color="text-amber-500" />
                )}
                {profile.role === "seller" && stats.productsCount !== undefined && (
                  <>
                    <div className="w-px bg-border/30" />
                    <StatBox value={stats.productsCount} label="Products" color="text-emerald-500" />
                  </>
                )}
              </div>
            )}

            {/* Referral code */}
            {profile.referralCode && (
              <button
                onClick={copyReferralCode}
                className="mt-3 w-full flex items-center justify-between bg-primary/5 border border-primary/15 rounded-2xl px-4 py-3 touch-ripple active:bg-primary/10"
              >
                <div>
                  <p className="text-[11px] text-muted-foreground font-medium uppercase tracking-wider">Referral Code</p>
                  <p className="text-[16px] font-black text-primary tracking-widest mt-0.5">{profile.referralCode}</p>
                </div>
                <div className="flex flex-col items-center gap-1">
                  <div className="w-8 h-8 rounded-xl bg-primary/10 flex items-center justify-center">
                    <Copy className="w-4 h-4 text-primary" />
                  </div>
                  <span className="text-[10px] text-primary font-semibold">Copy</span>
                </div>
              </button>
            )}
          </div>
        </div>

        {/* Account section */}
        <div className="px-4">
          <SectionTitle>Account</SectionTitle>
          <div className="mobile-grouped-list">
            <ListItem
              icon={User}
              label="Edit Profile"
              iconBg="bg-blue-100 dark:bg-blue-900/40"
              iconColor="text-blue-600 dark:text-blue-400"
              onClick={() => navigate("/profile")}
            />
            <ListItem
              icon={Lock}
              label="Change Password"
              iconBg="bg-violet-100 dark:bg-violet-900/40"
              iconColor="text-violet-600 dark:text-violet-400"
              onClick={() => navigate("/change-password")}
            />
            {profile.role === "seller" && (
              <ListItem
                icon={Store}
                label="Seller Settings"
                iconBg="bg-amber-100 dark:bg-amber-900/40"
                iconColor="text-amber-600 dark:text-amber-400"
                onClick={() => navigate("/seller/settings")}
              />
            )}
            {profile.role === "rider" && (
              <ListItem
                icon={Truck}
                label="Rider Settings"
                iconBg="bg-cyan-100 dark:bg-cyan-900/40"
                iconColor="text-cyan-600 dark:text-cyan-400"
                onClick={() => navigate("/rider/settings")}
              />
            )}
          </div>

          <SectionTitle>Orders & Activity</SectionTitle>
          <div className="mobile-grouped-list">
            <ListItem
              icon={Package}
              label="My Orders"
              iconBg="bg-emerald-100 dark:bg-emerald-900/40"
              iconColor="text-emerald-600 dark:text-emerald-400"
              onClick={() => navigate("/orders")}
            />
            <ListItem
              icon={Heart}
              label="Wishlist"
              iconBg="bg-rose-100 dark:bg-rose-900/40"
              iconColor="text-rose-600 dark:text-rose-400"
              onClick={() => navigate("/wishlist")}
            />
            {profile.role === "buyer" && (
              <ListItem
                icon={Star}
                label="Referral Programme"
                iconBg="bg-orange-100 dark:bg-orange-900/40"
                iconColor="text-orange-600 dark:text-orange-400"
                onClick={() => navigate("/referral")}
              />
            )}
          </div>

          <SectionTitle>Preferences</SectionTitle>
          <div className="mobile-grouped-list">
            <ListItem
              icon={Bell}
              label="Notifications"
              iconBg="bg-yellow-100 dark:bg-yellow-900/40"
              iconColor="text-yellow-600 dark:text-yellow-400"
              onClick={() => navigate("/notifications")}
            />
            <ListItem
              icon={Settings}
              label="Settings"
              iconBg="bg-muted"
              iconColor="text-muted-foreground"
              onClick={() => navigate("/settings")}
            />
          </div>

          <SectionTitle>Support</SectionTitle>
          <div className="mobile-grouped-list">
            <ListItem
              icon={HelpCircle}
              label="Help & Support"
              iconBg="bg-sky-100 dark:bg-sky-900/40"
              iconColor="text-sky-600 dark:text-sky-400"
              onClick={() => navigate("/support")}
            />
            <ListItem
              icon={Shield}
              label="Terms & Privacy"
              iconBg="bg-muted"
              iconColor="text-muted-foreground"
              onClick={() => navigate("/terms")}
            />
            <ListItem
              icon={ExternalLink}
              label="App Version"
              iconBg="bg-muted"
              iconColor="text-muted-foreground"
              value="1.0.0"
            />
          </div>

          <div className="mt-6 mb-2">
            <button
              onClick={() => { haptic("warning"); onLogout(); }}
              className="w-full flex items-center justify-center gap-2.5 bg-destructive/10 border border-destructive/20 text-destructive rounded-2xl h-12 font-semibold text-[15px] touch-ripple active:bg-destructive/20 transition-colors"
            >
              <LogOut className="w-4.5 h-4.5" style={{ width: 18, height: 18 }} />
              Sign Out
            </button>
          </div>
        </div>
      </main>
    </div>
  );
}
