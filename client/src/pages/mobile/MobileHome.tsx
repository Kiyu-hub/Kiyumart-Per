import { useState } from "react";
import { useLocation } from "wouter";
import { useAuth } from "@/lib/auth";
import { useQuery } from "@tanstack/react-query";
import { fetchApiJson, fetchSameOriginJson } from "@/lib/queryClient";
import { cn } from "@/lib/utils";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import ProductCard from "@/components/ProductCard";
import StoreCard from "@/components/StoreCard";
import HeroCarousel from "@/components/HeroCarousel";
import { MobileProductCardSkeleton } from "@/components/mobile/MobileSkeletonCard";
import {
  Search, ChevronRight, Bell, ShoppingBag, X, SlidersHorizontal,
} from "lucide-react";
import { usePlatformSettings } from "@/hooks/usePlatformSettings";
import UserAvatar from "@/components/UserAvatar";
import type { Product } from "@shared/schema";

type ProductWithMeta = Product & { categoryName?: string | null };

interface Category {
  id: string; name: string; slug: string; image: string;
  displayOrder: number; isActive: boolean;
}

interface WishlistItem { id: string; userId: string; productId: string; }

interface MobileHomeProps {
  featuredProducts: ProductWithMeta[];
  newArrivalProducts: ProductWithMeta[];
  categories: Category[];
  stores: any[];
  wishlist: WishlistItem[];
  isLoading: boolean;
  onToggleWishlist: (id: string) => void;
}

function SectionHeader({ title, href }: { title: string; href: string }) {
  const [, navigate] = useLocation();
  return (
    <div className="mobile-section-header px-4">
      <h2 className="mobile-headline text-foreground">{title}</h2>
      <button
        onClick={() => navigate(href)}
        className="text-primary text-sm font-medium flex items-center gap-0.5 touch-ripple px-1 py-0.5 rounded-lg"
      >
        See All <ChevronRight className="w-4 h-4" />
      </button>
    </div>
  );
}

function CategoryPill({ cat, active, onPress }: { cat: Category; active: boolean; onPress: () => void }) {
  return (
    <button
      onClick={onPress}
      className={cn(
        "flex flex-col items-center gap-1.5 shrink-0 touch-ripple mobile-press rounded-2xl p-2 min-w-[64px] transition-all duration-150",
        active
          ? "bg-primary/10 text-primary"
          : "text-muted-foreground",
      )}
    >
      <div className={cn(
        "w-12 h-12 rounded-2xl overflow-hidden flex items-center justify-center border transition-all",
        active ? "border-primary/30 ring-2 ring-primary/20" : "border-border/50 bg-muted/40",
      )}>
        {cat.image ? (
          <img src={cat.image} alt={cat.name} className="w-full h-full object-cover" />
        ) : (
          <ShoppingBag className="w-5 h-5" />
        )}
      </div>
      <span className={cn("text-[11px] font-medium text-center leading-tight max-w-[56px] line-clamp-2", active && "text-primary")}>
        {cat.name}
      </span>
    </button>
  );
}

export function MobileHome({
  featuredProducts,
  newArrivalProducts,
  categories,
  stores,
  wishlist,
  isLoading,
  onToggleWishlist,
}: MobileHomeProps) {
  const { user } = useAuth();
  const [, navigate] = useLocation();
  const [searchOpen, setSearchOpen] = useState(false);
  const [searchQuery, setSearchQuery] = useState("");
  const [activeCategoryId, setActiveCategoryId] = useState<string | null>(null);
  const { logoLight, logoDark } = usePlatformSettings();

  const { data: notifData } = useQuery<any[]>({
    queryKey: ["/api/notifications", "unread-count"],
    queryFn: () => fetchSameOriginJson("/api/notifications?limit=1&unreadOnly=true"),
    enabled: !!user,
  });
  const unreadCount = Array.isArray(notifData) ? notifData.length : 0;

  const filteredFeatured = activeCategoryId
    ? featuredProducts.filter((p) => (p as any).categoryId === activeCategoryId)
    : featuredProducts;

  const filteredNew = activeCategoryId
    ? newArrivalProducts.filter((p) => (p as any).categoryId === activeCategoryId)
    : newArrivalProducts;

  const searchFiltered = searchQuery
    ? [...featuredProducts, ...newArrivalProducts].filter((p) =>
        p.name.toLowerCase().includes(searchQuery.toLowerCase()),
      )
    : null;

  const greeting = () => {
    const h = new Date().getHours();
    if (h < 12) return "Good morning";
    if (h < 17) return "Good afternoon";
    return "Good evening";
  };

  return (
    <div className="flex flex-col min-h-screen bg-background mobile-page-enter">
      {/* ─── Sticky Header ─── */}
      <header className="sticky top-0 z-30 glass border-b border-border/30"
        style={{ paddingTop: "env(safe-area-inset-top, 0px)" }}>
        {searchOpen ? (
          /* Expanded search bar */
          <div className="flex items-center gap-2 px-4 py-3">
            <div className="flex-1 relative">
              <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-muted-foreground" />
              <Input
                autoFocus
                placeholder="Search products, stores…"
                value={searchQuery}
                onChange={(e) => setSearchQuery(e.target.value)}
                onKeyDown={(e) => {
                  if (e.key === "Enter" && searchQuery.trim()) {
                    navigate(`/search?q=${encodeURIComponent(searchQuery.trim())}`);
                    setSearchOpen(false);
                  }
                }}
                className="pl-9 pr-4 h-10 rounded-full bg-muted border-0 text-[15px] focus-visible:ring-1"
              />
            </div>
            <button
              onClick={() => { setSearchOpen(false); setSearchQuery(""); }}
              className="text-primary font-medium text-[15px] shrink-0 px-1"
            >
              Cancel
            </button>
          </div>
        ) : (
          /* Normal header */
          <div className="flex items-center justify-between px-4 py-3">
            <div className="flex items-center gap-3">
              <div className="w-8 h-8">
                {(logoLight || logoDark) ? (
                  <img
                    src={logoLight || logoDark || ""}
                    alt="KiyuMart"
                    className="w-full h-full object-contain dark:hidden"
                  />
                ) : (
                  <span className="text-primary font-black text-xl leading-none">K</span>
                )}
              </div>
              {user && (
                <div>
                  <p className="text-[11px] text-muted-foreground leading-none">{greeting()},</p>
                  <p className="mobile-headline leading-tight truncate max-w-[120px]">
                    {user.name.split(" ")[0]}
                  </p>
                </div>
              )}
            </div>
            <div className="flex items-center gap-1">
              <Button
                variant="ghost"
                size="icon"
                className="touch-ripple relative h-9 w-9 rounded-full"
                onClick={() => setSearchOpen(true)}
                aria-label="Search"
              >
                <Search className="w-5 h-5" />
              </Button>
              <Button
                variant="ghost"
                size="icon"
                className="touch-ripple relative h-9 w-9 rounded-full"
                onClick={() => navigate("/notifications")}
                aria-label="Notifications"
              >
                <Bell className="w-5 h-5" />
                {unreadCount > 0 && (
                  <span className="absolute top-1 right-1 w-2 h-2 rounded-full bg-destructive mobile-bounce-in" />
                )}
              </Button>
              {user && (
                <button
                  onClick={() => navigate("/profile")}
                  className="ml-1 touch-ripple rounded-full"
                >
                  <UserAvatar
                    name={user.name}
                    profileImage={user.profileImage}
                    size="sm"
                    className="w-8 h-8"
                  />
                </button>
              )}
            </div>
          </div>
        )}
      </header>

      {/* ─── Search results overlay ─── */}
      {searchQuery && searchFiltered && (
        <div className="px-4 py-3 bg-background border-b border-border/40">
          <p className="mobile-caption text-muted-foreground mb-3">
            {searchFiltered.length} results for "{searchQuery}"
          </p>
          {searchFiltered.length === 0 ? (
            <p className="text-center py-8 text-muted-foreground mobile-subhead">No products found</p>
          ) : (
            <div className="grid grid-cols-2 gap-3">
              {searchFiltered.slice(0, 6).map((p) => (
                <ProductCard
                  key={p.id}
                  id={p.id}
                  name={p.name}
                  price={p.price}
                  image={Array.isArray(p.images) ? p.images[0] : p.images}
                  discount={p.discount ?? undefined}
                  rating={p.averageRating ?? undefined}
                  reviewCount={p.totalRatings ?? undefined}
                  isWishlisted={wishlist.some((w) => w.productId === p.id)}
                  onToggleWishlist={onToggleWishlist}
                  category={p.category}
                  inStock={(p.stock ?? 0) > 0}
                />
              ))}
            </div>
          )}
        </div>
      )}

      {/* ─── Main scroll body ─── */}
      <main className="flex-1 overflow-y-auto overscroll-contain pb-4">
        {/* Hero Banner */}
        <div className="w-full">
          <HeroCarousel />
        </div>

        {/* Category Pill Row */}
        {categories.length > 0 && (
          <div className="px-4 pt-4 pb-2">
            <div className="mobile-pill-scroll">
              <button
                onClick={() => setActiveCategoryId(null)}
                className={cn(
                  "shrink-0 px-4 py-2 rounded-full text-sm font-medium border transition-all touch-ripple",
                  activeCategoryId === null
                    ? "bg-primary text-primary-foreground border-primary"
                    : "bg-muted/60 text-muted-foreground border-border/50",
                )}
              >
                All
              </button>
              {categories.slice(0, 12).map((cat) => (
                <button
                  key={cat.id}
                  onClick={() => setActiveCategoryId(activeCategoryId === cat.id ? null : cat.id)}
                  className={cn(
                    "shrink-0 px-4 py-2 rounded-full text-sm font-medium border transition-all touch-ripple whitespace-nowrap",
                    activeCategoryId === cat.id
                      ? "bg-primary text-primary-foreground border-primary"
                      : "bg-muted/60 text-muted-foreground border-border/50",
                  )}
                >
                  {cat.name}
                </button>
              ))}
            </div>
          </div>
        )}

        {/* Featured Products */}
        {(isLoading || filteredFeatured.length > 0) && (
          <section className="pt-4">
            <SectionHeader title="Featured" href="/products?filter=featured" />
            <div className="mobile-hscroll px-4 pt-2 pb-1">
              {isLoading
                ? Array.from({ length: 4 }).map((_, i) => (
                    <div key={i} className="shrink-0 w-40"><MobileProductCardSkeleton /></div>
                  ))
                : filteredFeatured.slice(0, 8).map((p) => (
                    <div key={p.id} className="shrink-0 w-40">
                      <ProductCard
                        id={p.id}
                        name={p.name}
                        price={p.price}
                        image={Array.isArray(p.images) ? p.images[0] : p.images}
                        discount={p.discount ?? undefined}
                        rating={p.averageRating ?? undefined}
                        reviewCount={p.totalRatings ?? undefined}
                        isWishlisted={wishlist.some((w) => w.productId === p.id)}
                        onToggleWishlist={onToggleWishlist}
                        category={p.category}
                        inStock={(p.stock ?? 0) > 0}
                      />
                    </div>
                  ))}
            </div>
          </section>
        )}

        {/* Category Icon Row */}
        {categories.length > 0 && (
          <section className="pt-4 px-4">
            <SectionHeader title="Shop by Category" href="/products" />
            <div className="mobile-pill-scroll pt-2">
              {categories.slice(0, 8).map((cat) => (
                <CategoryPill
                  key={cat.id}
                  cat={cat}
                  active={activeCategoryId === cat.id}
                  onPress={() => {
                    setActiveCategoryId(activeCategoryId === cat.id ? null : cat.id);
                    navigate(`/products?category=${cat.slug}`);
                  }}
                />
              ))}
            </div>
          </section>
        )}

        {/* Stores Row */}
        {stores.length > 0 && (
          <section className="pt-5">
            <SectionHeader title="Stores" href="/stores" />
            <div className="mobile-hscroll px-4 pt-2 pb-1">
              {stores.slice(0, 8).map((store) => (
                <div key={store.id} className="shrink-0 w-36">
                  <StoreCard store={store} />
                </div>
              ))}
            </div>
          </section>
        )}

        {/* New Arrivals */}
        {(isLoading || filteredNew.length > 0) && (
          <section className="pt-5">
            <SectionHeader title="New Arrivals" href="/products?sort=newest" />
            <div className="grid grid-cols-2 gap-3 px-4 pt-2">
              {isLoading
                ? Array.from({ length: 4 }).map((_, i) => <MobileProductCardSkeleton key={i} />)
                : filteredNew.slice(0, 6).map((p) => (
                    <ProductCard
                      key={p.id}
                      id={p.id}
                      name={p.name}
                      price={p.price}
                      image={Array.isArray(p.images) ? p.images[0] : p.images}
                      discount={p.discount ?? undefined}
                      rating={p.averageRating ?? undefined}
                      reviewCount={p.totalRatings ?? undefined}
                      isWishlisted={wishlist.some((w) => w.productId === p.id)}
                      onToggleWishlist={onToggleWishlist}
                      category={p.category}
                      inStock={(p.stock ?? 0) > 0}
                    />
                  ))}
            </div>
            {!isLoading && filteredNew.length > 0 && (
              <div className="px-4 pt-4">
                <Button
                  variant="outline"
                  className="w-full rounded-2xl h-11 font-medium border-primary/30 text-primary hover:bg-primary/5"
                  onClick={() => navigate("/products?sort=newest")}
                >
                  View All New Arrivals
                </Button>
              </div>
            )}
          </section>
        )}
      </main>
    </div>
  );
}
