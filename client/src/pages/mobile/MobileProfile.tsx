import { useLocation } from "wouter";
import { useHaptic } from "@/hooks/useHaptic";
import { cn } from "@/lib/utils";
import { MobilePageHeader } from "@/components/mobile/MobilePageHeader";
import UserAvatar from "@/components/UserAvatar";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import {
  User, Package, Heart, Settings, Bell, Shield,
  LogOut, ChevronRight, Copy, Star, Store, CreditCard,
  HelpCircle, FileText, Lock, ExternalLink, Truck,
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
        <Icon className={cn("w-4.5 h-4.5", iconColor || "text-foreground")} style={{ width: 18, height: 18 }} />
      </span>
      <div className="flex-1 min-w-0">
        <p className={cn("text-[15px] font-medium leading-tight", danger && "text-destructive")}>{label}</p>
        {subtitle && <p className="mobile-caption text-muted-foreground mt-0.5">{subtitle}</p>}
      </div>
      {value ? (
        <span className="mobile-caption text-muted-foreground shrink-0">{value}</span>
      ) : (
        <ChevronRight className="w-4 h-4 text-muted-foreground/50 shrink-0" />
      )}
    </button>
  );
}

function SectionTitle({ children }: { children: React.ReactNode }) {
  return (
    <p className="mobile-caption text-muted-foreground uppercase tracking-wide font-medium px-1 pt-5 pb-2">
      {children}
    </p>
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

  return (
    <div className="flex flex-col min-h-screen bg-background mobile-page-enter">
      <MobilePageHeader title="Profile" showBack={false} />

      <main className="flex-1 overflow-y-auto pb-6">
        {/* Profile header card */}
        <div className="px-4 pt-4 pb-2">
          <div className="mobile-card bg-card p-5">
            <div className="flex items-start gap-4">
              <div className="relative shrink-0">
                <UserAvatar
                  name={profile.name}
                  profileImage={profile.profileImage}
                  size="lg"
                  className="w-20 h-20 text-lg"
                />
                <button
                  onClick={() => navigate("/profile?edit=true")}
                  className="absolute -bottom-1 -right-1 w-7 h-7 rounded-full bg-primary text-primary-foreground flex items-center justify-center border-2 border-background touch-ripple"
                >
                  <User className="w-3.5 h-3.5" />
                </button>
              </div>

              <div className="flex-1 min-w-0">
                <h2 className="mobile-title-3 text-foreground truncate">{profile.name}</h2>
                <p className="mobile-caption text-muted-foreground truncate mt-0.5">{profile.email}</p>
                {profile.phone && (
                  <p className="mobile-caption text-muted-foreground">{profile.phone}</p>
                )}
                <Badge variant="secondary" className="mt-2 text-[11px] font-semibold rounded-full px-2.5 py-0.5">
                  {roleLabel[profile.role] || profile.role}
                </Badge>
              </div>
            </div>

            {/* Quick stats */}
            {(stats.orders !== undefined || stats.wishlistCount !== undefined || stats.productsCount !== undefined) && (
              <div className="grid grid-cols-3 gap-3 mt-4 pt-4 border-t border-border/30">
                {profile.role === "buyer" && stats.orders !== undefined && (
                  <div className="text-center">
                    <p className="text-xl font-bold text-foreground">{stats.orders}</p>
                    <p className="mobile-caption text-muted-foreground">Orders</p>
                  </div>
                )}
                {stats.wishlistCount !== undefined && (
                  <div className="text-center">
                    <p className="text-xl font-bold text-foreground">{stats.wishlistCount}</p>
                    <p className="mobile-caption text-muted-foreground">Wishlist</p>
                  </div>
                )}
                {stats.reviewsCount !== undefined && (
                  <div className="text-center">
                    <p className="text-xl font-bold text-foreground">{stats.reviewsCount}</p>
                    <p className="mobile-caption text-muted-foreground">Reviews</p>
                  </div>
                )}
                {profile.role === "seller" && stats.productsCount !== undefined && (
                  <div className="text-center">
                    <p className="text-xl font-bold text-foreground">{stats.productsCount}</p>
                    <p className="mobile-caption text-muted-foreground">Products</p>
                  </div>
                )}
              </div>
            )}

            {/* Referral code */}
            {profile.referralCode && (
              <button
                onClick={copyReferralCode}
                className="mt-3 w-full flex items-center justify-between bg-primary/5 rounded-xl px-3 py-2.5 touch-ripple"
              >
                <div>
                  <p className="mobile-caption text-muted-foreground">Referral Code</p>
                  <p className="text-sm font-bold text-primary tracking-widest">{profile.referralCode}</p>
                </div>
                <Copy className="w-4 h-4 text-primary" />
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

          {/* Orders & Activity */}
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

          {/* Preferences */}
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

          {/* About */}
          <SectionTitle>About</SectionTitle>
          <div className="mobile-grouped-list">
            <ListItem
              icon={HelpCircle}
              label="Support"
              iconBg="bg-sky-100 dark:bg-sky-900/40"
              iconColor="text-sky-600 dark:text-sky-400"
              onClick={() => navigate("/support")}
            />
            <ListItem
              icon={FileText}
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

          {/* Sign out */}
          <SectionTitle>Danger Zone</SectionTitle>
          <div className="mobile-grouped-list">
            <ListItem
              icon={LogOut}
              label="Sign Out"
              danger
              iconBg="bg-destructive/10"
              iconColor="text-destructive"
              onClick={() => { haptic("warning"); onLogout(); }}
            />
          </div>
        </div>
      </main>
    </div>
  );
}
