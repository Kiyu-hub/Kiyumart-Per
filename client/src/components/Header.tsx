import { Search, Menu, User, LayoutDashboard, ShoppingBag, Store as StoreIcon, Truck, Heart } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { useLocation } from "wouter";
import { useLanguage } from "@/contexts/LanguageContext";
import { useQuery } from "@tanstack/react-query";
import { useAuth } from "@/lib/auth";
import UserAvatar from "@/components/UserAvatar";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuTrigger,
  DropdownMenuSeparator,
  DropdownMenuLabel,
} from "@/components/ui/dropdown-menu";
import CartPopover from "@/components/CartPopover";
import NotificationPopover from "@/components/NotificationPopover";
import Logo from "@/components/Logo";
import { getDashboardRoleLabel } from "@/lib/roleLabels";
import { usePlatformSettings } from "@/hooks/usePlatformSettings";

interface HeaderProps {
  cartItemsCount?: number;
  onMenuClick?: () => void;
  onCartClick?: () => void;
  onSearch?: (query: string) => void;
}

export default function Header({ 
  cartItemsCount = 0,
  onMenuClick,
  onCartClick,
  onSearch 
}: HeaderProps) {
  const [location, navigate] = useLocation();
  const { t } = useLanguage();
  const { user, isAuthenticated } = useAuth();
  const { isExternalRiderSystemEnabled } = usePlatformSettings();

  const { data: platformSettings } = useQuery<{ 
    allowSellerRegistration: boolean; 
    allowRiderRegistration: boolean; 
  }>({
    queryKey: ["/api/platform-settings"],
  });
  
  // Show "Become a Seller" only for guests or buyers
  const showBecomeSeller = platformSettings?.allowSellerRegistration && 
    (!isAuthenticated || user?.role === 'buyer');
  
  // Show "Become a Delivery Partner" only for guests or buyers
  const showBecomeRider = platformSettings?.allowRiderRegistration && 
    (!isAuthenticated || user?.role === 'buyer') &&
    !isExternalRiderSystemEnabled;

  const isActive = (path: string) => location === path;

  // Check if user has a dashboard role (super_admin, admin, seller, rider, pickup_agent, buyer, agent)
  const hasDashboard = user && ['super_admin', 'admin', 'seller', 'rider', 'pickup_agent', 'buyer', 'agent'].includes(user.role);
  const isDashboardPage = location.startsWith('/admin') || location.startsWith('/seller') || location.startsWith('/rider') || location.startsWith('/pickup-agent') || location.startsWith('/buyer') || location.startsWith('/agent');
  
  const getDashboardPath = () => {
    if (user?.role === 'super_admin') return '/admin';
    if (user?.role === 'admin') return '/admin';
    if (user?.role === 'seller') return '/seller';
    if (user?.role === 'rider') return '/rider';
    if (user?.role === 'pickup_agent') return '/pickup-agent';
    if (user?.role === 'buyer') return '/buyer';
    if (user?.role === 'agent') return '/agent';
    return '/';
  };
  
  const getDashboardLabel = () => {
    if (user?.role === 'buyer') return 'My Dashboard';
    return getDashboardRoleLabel(user?.role);
  };

  return (
    <header className="sticky top-0 z-50 w-full border-b bg-background">
      <div className="max-w-7xl mx-auto px-4 py-3">
        <div className="flex items-center justify-between gap-4">
          <div className="flex items-center gap-4">
            <Button
              size="icon"
              variant="ghost"
              className="md:hidden"
              onClick={onMenuClick}
              data-testid="button-menu"
            >
              <Menu className="h-5 w-5" />
            </Button>
            
            <div 
              className="cursor-pointer flex items-center" 
              data-testid="logo-container"
              onClick={() => navigate("/")}
            >
              <Logo size="lg" variant="auto" />
            </div>
          </div>

          <div className="hidden md:flex flex-1 max-w-xl mx-8">
            <div className="relative w-full">
              <Search className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-muted-foreground" />
              <Input
                placeholder={t("search")}
                className="pl-10"
                data-testid="input-search"
                onChange={(e) => onSearch?.(e.target.value)}
              />
            </div>
          </div>

          <div className="flex items-center gap-2">
            {showBecomeSeller && (
              <Button 
                variant="outline" 
                size="sm"
                className="hidden md:flex"
                onClick={() => navigate("/become-seller")}
                data-testid="button-become-seller"
              >
                <StoreIcon className="h-4 w-4 mr-2" />
                <span>Become a Seller</span>
              </Button>
            )}

            {showBecomeRider && (
              <Button 
                variant="outline" 
                size="sm"
                className="hidden md:flex"
                onClick={() => navigate("/become-rider")}
                data-testid="button-become-rider"
              >
                <Truck className="h-4 w-4 mr-2" />
                <span>Become a Delivery Partner</span>
              </Button>
            )}

            {isAuthenticated && (
              <>
                <NotificationPopover />
                <Button
                  variant="ghost"
                  size="icon"
                  onClick={() => navigate("/wishlist")}
                  data-testid="button-wishlist"
                  title="Wishlist"
                >
                  <Heart className="h-5 w-5" />
                </Button>
              </>
            )}

            {hasDashboard && (
              <DropdownMenu>
                <DropdownMenuTrigger asChild>
                  <Button 
                    variant={isDashboardPage ? "default" : "ghost"}
                    size="icon"
                    data-testid="button-role-switcher"
                  >
                    <LayoutDashboard className="h-5 w-5" />
                  </Button>
                </DropdownMenuTrigger>
                <DropdownMenuContent align="end">
                  <DropdownMenuLabel>Switch Mode</DropdownMenuLabel>
                  <DropdownMenuSeparator />
                  <DropdownMenuItem 
                    onClick={() => navigate(getDashboardPath())}
                    className="hover:bg-accent hover:text-accent-foreground"
                    data-testid="menu-dashboard"
                  >
                    <LayoutDashboard className="mr-2 h-4 w-4" />
                    <span>{getDashboardLabel()}</span>
                  </DropdownMenuItem>
                  <DropdownMenuItem 
                    onClick={() => navigate("/")}
                    className="hover:bg-accent hover:text-accent-foreground"
                    data-testid="menu-shop"
                  >
                    <ShoppingBag className="mr-2 h-4 w-4" />
                    <span>Shop Mode</span>
                  </DropdownMenuItem>
                </DropdownMenuContent>
              </DropdownMenu>
            )}

            <CartPopover isAuthenticated={isAuthenticated} />

            <Button 
              variant="ghost" 
              size="icon"
              onClick={() => isAuthenticated ? navigate("/profile") : navigate("/auth")}
              data-testid="button-account"
              title={user?.name || "Account"}
            >
              {isAuthenticated && user ? (
                <UserAvatar 
                  profileImage={user.profileImage}
                  name={user.name}
                  email={user.email}
                  size="sm"
                />
              ) : (
                <User className={`h-5 w-5 ${isActive("/profile") ? "text-primary" : ""}`} />
              )}
            </Button>
          </div>
        </div>

        <div className="md:hidden mt-3 space-y-2">
          <div className="relative w-full">
            <Search className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-muted-foreground" />
            <Input
              placeholder="Search products..."
              className="pl-10"
              data-testid="input-search-mobile"
              onChange={(e) => onSearch?.(e.target.value)}
            />
          </div>
          
          {(showBecomeSeller || showBecomeRider) && (
            <div className="flex gap-2">
              {showBecomeSeller && (
                <Button 
                  variant="outline" 
                  size="sm"
                  className="flex-1"
                  onClick={() => navigate("/become-seller")}
                  data-testid="button-become-seller-mobile"
                >
                  <StoreIcon className="h-4 w-4 mr-2" />
                  <span>Become a Seller</span>
                </Button>
              )}
              
              {showBecomeRider && (
                <Button 
                  variant="outline" 
                  size="sm"
                  className="flex-1"
                  onClick={() => navigate("/become-rider")}
                  data-testid="button-become-rider-mobile"
                >
                  <Truck className="h-4 w-4 mr-2" />
                  <span>Become a Delivery Partner</span>
                </Button>
              )}
            </div>
          )}
        </div>
      </div>
    </header>
  );
}
