import { useLocation } from "wouter";
import { Home, Search, ShoppingCart, Heart, User } from "lucide-react";
import { useQuery } from "@tanstack/react-query";
import { useAuth } from "@/lib/auth";

interface CartItem { id: string; quantity: number; }

export default function MobileStorefrontNav() {
  const [location, navigate] = useLocation();
  const { isAuthenticated } = useAuth();

  const { data: cartItems = [] } = useQuery<CartItem[]>({
    queryKey: ["/api/cart"],
    enabled: isAuthenticated,
  });

  const cartCount = cartItems.reduce((sum, item) => sum + (item.quantity || 1), 0);

  // Hide on all dashboard routes — they have their own mobile sidebar
  const isDashboard =
    location.startsWith("/admin") ||
    location.startsWith("/seller") ||
    location.startsWith("/buyer") ||
    location.startsWith("/rider") ||
    location.startsWith("/pickup-agent") ||
    location.startsWith("/agent") ||
    location === "/auth" ||
    location.startsWith("/auth") ||
    location.startsWith("/payment/");

  if (isDashboard) return null;

  const isActive = (path: string) =>
    path === "/" ? location === "/" : location.startsWith(path);

  const navItems = [
    { icon: Home, label: "Home", path: "/" },
    { icon: Search, label: "Search", path: "/products" },
    { icon: ShoppingCart, label: "Cart", path: "/cart", badge: cartCount > 0 ? cartCount : undefined },
    { icon: Heart, label: "Wishlist", path: "/wishlist" },
    { icon: User, label: "Account", path: isAuthenticated ? "/profile" : "/auth" },
  ];

  return (
    <nav
      className="md:hidden fixed bottom-0 left-0 right-0 z-40 bg-card border-t border-border"
      style={{ paddingBottom: "env(safe-area-inset-bottom, 0px)" }}
      aria-label="Mobile navigation"
    >
      <div className="flex items-center justify-around h-14">
        {navItems.map(({ icon: Icon, label, path, badge }) => {
          const active = isActive(path);
          return (
            <button
              key={path}
              onClick={() => navigate(path)}
              className={`flex flex-col items-center justify-center gap-0.5 flex-1 h-full transition-colors ${
                active ? "text-primary" : "text-muted-foreground"
              }`}
              aria-label={label}
            >
              <div className="relative">
                <Icon className={`h-5 w-5 ${active ? "stroke-[2.5]" : "stroke-2"}`} />
                {badge !== undefined && badge > 0 && (
                  <span className="absolute -top-1.5 -right-2 min-w-[16px] h-4 rounded-full bg-primary text-primary-foreground text-[10px] font-bold flex items-center justify-center px-0.5">
                    {badge > 99 ? "99+" : badge}
                  </span>
                )}
              </div>
              <span className={`text-[10px] leading-none ${active ? "font-semibold" : "font-normal"}`}>
                {label}
              </span>
            </button>
          );
        })}
      </div>
    </nav>
  );
}
