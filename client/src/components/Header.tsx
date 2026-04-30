import { Search, Menu, User, LayoutDashboard, ShoppingBag, Store as StoreIcon, Truck, Heart, Loader2, SearchX, X } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { useLocation } from "wouter";
import { useState, useRef, useCallback, useEffect } from "react";
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

interface SearchResult {
  id: string;
  name: string;
  price: string;
  images: string[];
  category?: string | null;
}

interface HeaderProps {
  cartItemsCount?: number;
  onMenuClick?: () => void;
  onCartClick?: () => void;
  onSearch?: (query: string) => void;
}

function SearchBox({
  value,
  onChange,
  onSubmit,
  onClear,
  placeholder,
  testId,
  className,
}: {
  value: string;
  onChange: (v: string) => void;
  onSubmit: () => void;
  onClear: () => void;
  placeholder: string;
  testId: string;
  className?: string;
}) {
  const [isFocused, setIsFocused] = useState(false);
  const containerRef = useRef<HTMLDivElement>(null);
  const [, navigate] = useLocation();

  const debouncedQuery = useDebounce(value, 220);
  const showDropdown = isFocused && debouncedQuery.trim().length >= 2;

  const { data: searchResults = [], isLoading } = useQuery<SearchResult[]>({
    queryKey: ["/api/products", "header-search", debouncedQuery],
    queryFn: async () => {
      const q = debouncedQuery.trim();
      if (q.length < 2) return [];
      const res = await fetch(`/api/products?search=${encodeURIComponent(q)}&limit=8`);
      if (!res.ok) return [];
      const data = await res.json();
      return Array.isArray(data) ? data : [];
    },
    enabled: showDropdown,
    staleTime: 30_000,
  });

  useEffect(() => {
    const handleClickOutside = (e: MouseEvent) => {
      if (containerRef.current && !containerRef.current.contains(e.target as Node)) {
        setIsFocused(false);
      }
    };
    document.addEventListener("mousedown", handleClickOutside);
    return () => document.removeEventListener("mousedown", handleClickOutside);
  }, []);

  const handleResultClick = (productId: string) => {
    setIsFocused(false);
    navigate(`/product/${productId}`);
  };

  const handleSeeAll = () => {
    const q = value.trim();
    if (!q) return;
    setIsFocused(false);
    onSubmit();
  };

  return (
    <div ref={containerRef} className={`relative w-full ${className ?? ""}`}>
      <form onSubmit={(e) => { e.preventDefault(); handleSeeAll(); }}>
        <Search className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-muted-foreground z-10 pointer-events-none" />
        <Input
          placeholder={placeholder}
          className={`pl-10 ${value ? "pr-8" : "pr-4"}`}
          data-testid={testId}
          value={value}
          onChange={(e) => onChange(e.target.value)}
          onFocus={() => setIsFocused(true)}
          onKeyDown={(e) => {
            if (e.key === "Enter") { e.preventDefault(); handleSeeAll(); }
            if (e.key === "Escape") setIsFocused(false);
          }}
          autoComplete="off"
        />
        {value && (
          <button
            type="button"
            onClick={onClear}
            className="absolute right-3 top-1/2 -translate-y-1/2 text-muted-foreground hover:text-foreground transition-colors"
            tabIndex={-1}
            aria-label="Clear search"
          >
            <X className="h-4 w-4" />
          </button>
        )}
      </form>

      {showDropdown && (
        <div className="absolute top-full left-0 right-0 mt-1 bg-background border rounded-lg shadow-xl z-[200] overflow-hidden max-h-[420px] overflow-y-auto">
          {isLoading ? (
            <div className="flex items-center justify-center gap-2 py-8 text-muted-foreground">
              <Loader2 className="h-4 w-4 animate-spin" />
              <span className="text-sm">Searching…</span>
            </div>
          ) : searchResults.length === 0 ? (
            <div className="flex flex-col items-center gap-2 py-10 text-muted-foreground">
              <SearchX className="h-9 w-9 opacity-30" />
              <p className="text-sm font-medium">No products found</p>
              <p className="text-xs opacity-70">No results for "{debouncedQuery}"</p>
            </div>
          ) : (
            <>
              {searchResults.map((product) => (
                <button
                  key={product.id}
                  type="button"
                  className="w-full flex items-center gap-3 px-4 py-2.5 hover:bg-accent text-left transition-colors"
                  onClick={() => handleResultClick(product.id)}
                >
                  {product.images?.[0] ? (
                    <img
                      src={product.images[0]}
                      alt={product.name}
                      className="h-10 w-10 rounded object-cover shrink-0 bg-muted"
                    />
                  ) : (
                    <div className="h-10 w-10 rounded bg-muted flex items-center justify-center shrink-0">
                      <ShoppingBag className="h-4 w-4 text-muted-foreground" />
                    </div>
                  )}
                  <div className="flex-1 min-w-0">
                    <p className="text-sm font-medium truncate">{product.name}</p>
                    {product.category && (
                      <p className="text-xs text-muted-foreground truncate">{product.category}</p>
                    )}
                  </div>
                  <span className="text-sm font-semibold text-primary shrink-0">
                    GHS {parseFloat(product.price || "0").toFixed(2)}
                  </span>
                </button>
              ))}
              <button
                type="button"
                className="w-full px-4 py-3 text-sm text-center text-primary font-medium border-t hover:bg-accent transition-colors"
                onClick={handleSeeAll}
              >
                See all results for "{debouncedQuery}"
              </button>
            </>
          )}
        </div>
      )}
    </div>
  );
}

function useDebounce<T>(value: T, delay: number): T {
  const [debounced, setDebounced] = useState(value);
  useEffect(() => {
    const timer = setTimeout(() => setDebounced(value), delay);
    return () => clearTimeout(timer);
  }, [value, delay]);
  return debounced;
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

  const showBecomeSeller = platformSettings?.allowSellerRegistration &&
    (!isAuthenticated || user?.role === 'buyer');

  const showBecomeRider = platformSettings?.allowRiderRegistration &&
    (!isAuthenticated || user?.role === 'buyer') &&
    !isExternalRiderSystemEnabled;

  const isActive = (path: string) => location === path;
  const isHomePage = location === "/" || location === "";
  const isSearchPage = location.startsWith("/search");

  const [localSearchValue, setLocalSearchValue] = useState(() => {
    if (typeof window !== "undefined" && location.startsWith("/search")) {
      return new URLSearchParams(location.split("?")[1] || "").get("q") || "";
    }
    return "";
  });

  const debounceRef = useRef<NodeJS.Timeout | null>(null);

  // Keep header input in sync when navigating to/from search page
  useEffect(() => {
    if (isSearchPage) {
      const q = new URLSearchParams(location.split("?")[1] || "").get("q") || "";
      setLocalSearchValue(q);
    } else if (!isSearchPage && !isHomePage) {
      // Don't reset on non-search, non-home pages (let user keep their typed value)
    }
  }, [location, isSearchPage, isHomePage]);

  const handleSearchChange = useCallback((value: string) => {
    setLocalSearchValue(value);
    if (isHomePage && onSearch) {
      if (debounceRef.current) clearTimeout(debounceRef.current);
      debounceRef.current = setTimeout(() => onSearch(value), 150);
    }
  }, [isHomePage, onSearch]);

  const handleSearchSubmit = useCallback(() => {
    const q = localSearchValue.trim();
    if (!q) return;
    navigate(`/search?q=${encodeURIComponent(q)}`);
  }, [localSearchValue, navigate]);

  const handleClearSearch = useCallback(() => {
    setLocalSearchValue("");
    if (isHomePage && onSearch) onSearch("");
    if (isSearchPage) navigate("/");
  }, [isHomePage, isSearchPage, onSearch, navigate]);

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

  const getApplicationPath = (path: "/become-seller" | "/become-rider") =>
    isAuthenticated ? path : `/auth?redirect=${encodeURIComponent(path)}`;

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
            <SearchBox
              value={localSearchValue}
              onChange={handleSearchChange}
              onSubmit={handleSearchSubmit}
              onClear={handleClearSearch}
              placeholder={t("search")}
              testId="input-search"
            />
          </div>

          <div className="flex items-center gap-2">
            {showBecomeSeller && (
              <Button
                variant="outline"
                size="sm"
                className="hidden md:flex"
                onClick={() => navigate(getApplicationPath("/become-seller"))}
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
                onClick={() => navigate(getApplicationPath("/become-rider"))}
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
          <SearchBox
            value={localSearchValue}
            onChange={handleSearchChange}
            onSubmit={handleSearchSubmit}
            onClear={handleClearSearch}
            placeholder="Search products..."
            testId="input-search-mobile"
          />

          {(showBecomeSeller || showBecomeRider) && (
            <div className="flex gap-2">
              {showBecomeSeller && (
                <Button
                  variant="outline"
                  size="sm"
                  className="flex-1"
                  onClick={() => navigate(getApplicationPath("/become-seller"))}
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
                  onClick={() => navigate(getApplicationPath("/become-rider"))}
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
