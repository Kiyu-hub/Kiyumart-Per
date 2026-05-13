import { useState } from "react";
import { useLocation } from "wouter";
import { useAuth } from "@/lib/auth";
import { useQuery } from "@tanstack/react-query";
import { fetchSameOriginJson } from "@/lib/queryClient";
import { cn } from "@/lib/utils";
import { Button } from "@/components/ui/button";
import ProductCard from "@/components/ProductCard";
import StoreCard from "@/components/StoreCard";
import HeroCarousel from "@/components/HeroCarousel";
import { MobileProductCardSkeleton } from "@/components/mobile/MobileSkeletonCard";
import {
  Search, ChevronRight, Bell, ShoppingBag, Zap, Tag, ArrowRight,
  Store, TrendingUp,
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

function SectionHeader({ title, href, icon: Icon }: { title: string; href: string; icon?: React.ElementType }) {
  const [, navigate] = useLocation();
  return (
    <div className="flex items-center justify-between px-4 mb-3">
      <div className="flex items-center gap-2">
        {Icon && (
          <span className="w-7 h-7 rounded-xl bg-primary/10 flex items-center justify-center">
            <Icon className="w-4 h-4 text-primary" />
          </span>
        )}
        <h2 className="text-[17px] font-bold text-foreground tracking-tight">{title}</h2>
      </div>
      <button
        onClick={() => navigate(href)}
        className="flex items-center gap-0.5 text-primary text-[13px] font-semibold touch-ripple px-2 py-1 rounded-xl active:bg-primary/10"
      >
        See all <ChevronRight className="w-3.5 h-3.5" />
      </button>
    </div>
  );
}

function CategoryPill({ cat, active, onPress }: { cat: Category; active: boolean; onPress: () => void }) {
  return (
    <button
      onClick={onPress}
      className={cn(
        "flex flex-col items-center gap-2 shrink-0 touch-ripple mobile-press transition-all duration-200",
        "min-w-[72px] rounded-2xl py-2.5 px-2",
        active ? "bg-primary text-primary-foreground" : "bg-card border border-border/50 text-foreground",
      )}
    >
      <div className={cn(
        "w-11 h-11 rounded-xl overflow-hidden flex items-center justify-center",
        active ? "bg-white/20" : "bg-muted/50",
      )}>
        {cat.image ? (
          <img src={cat.image} alt={cat.name} className="w-full h-full object-cover" />
        ) : (
          <ShoppingBag className={cn("w-5 h-5", active ? "text-white/80" : "text-muted-foreground")} />
        )}
      </div>
      <span className={cn(
        "text-[11px] font-semibold text-center leading-tight max-w-[60px] line-clamp-2",
        active ? "text-white" : "text-foreground",
      )}>
        {cat.name}
      </span>
    </button>
  );
}

function PromoDealsCard({ onPress }: { onPress: () => void }) {
  return (
    <button
      onClick={onPress}
      className="relative mx-4 rounded-3xl overflow-hidden touch-ripple mobile-press"
      style={{ background: "linear-gradient(135deg, #16a34a 0%, #059669 50%, #0d9488 100%)" }}
    >
      <div className="flex items-center justify-between p-4 pr-3">
        <div className="flex-1">
          <div className="flex items-center gap-1.5 mb-1">
            <Zap className="w-4 h-4 text-yellow-300 fill-yellow-300" />
            <span className="text-yellow-300 text-[12px] font-bold uppercase tracking-wider">Flash Deals</span>
          </div>
          <p className="text-white text-[22px] font-black leading-tight">Up to 60% OFF</p>
          <p className="text-white/75 text-[13px] mt-1">On selected items today only</p>
          <div className="mt-3 flex items-center gap-1.5 bg-white/20 rounded-full px-3 py-1.5 w-fit">
            <span className="text-white text-[13px] font-semibold">Shop Now</span>
            <ArrowRight className="w-3.5 h-3.5 text-white" />
          </div>
        </div>
        <div className="w-28 h-28 relative shrink-0">
          <div className="absolute inset-0 rounded-2xl bg-white/10 flex items-center justify-center">
            <Tag className="w-12 h-12 text-white/40" />
          </div>
          <div className="absolute top-1 right-1 bg-yellow-400 text-yellow-900 text-[11px] font-black px-2 py-0.5 rounded-full">
            TODAY
          </div>
        </div>
      </div>
      {/* Decorative circles */}
      <div className="absolute -bottom-8 -right-8 w-32 h-32 rounded-full bg-white/5 pointer-events-none" />
      <div className="absolute -top-6 -left-6 w-24 h-24 rounded-full bg-white/5 pointer-events-none" />
    </button>
  );
}

function StoreBrowseCard({ onPress }: { onPress: () => void }) {
  return (
    <button
      onClick={onPress}
      className="relative mx-4 rounded-3xl overflow-hidden touch-ripple mobile-press"
      style={{ background: "linear-gradient(135deg, #7c3aed 0%, #6d28d9 100%)" }}
    >
      <div className="flex items-center justify-between p-4">
        <div>
          <div className="flex items-center gap-1.5 mb-1">
            <Store className="w-4 h-4 text-violet-200" />
            <span className="text-violet-200 text-[12px] font-bold uppercase tracking-wider">Stores</span>
          </div>
          <p className="text-white text-[18px] font-black leading-tight">Explore Local Shops</p>
          <p className="text-white/70 text-[13px] mt-0.5">Discover vendors near you</p>
        </div>
        <div className="w-14 h-14 rounded-2xl bg-white/15 flex items-center justify-center shrink-0">
          <Store className="w-7 h-7 text-white/80" />
        </div>
      </div>
      <div className="absolute -bottom-6 -right-6 w-24 h-24 rounded-full bg-white/5 pointer-events-none" />
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
  const { logoLight, logoDark, platformName } = usePlatformSettings();

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
      <header
        className="sticky top-0 z-30 bg-background/95 backdrop-blur-md border-b border-border/20"
        style={{ paddingTop: "env(safe-area-inset-top, 0px)" }}
      >
        {searchOpen ? (
          <div className="flex items-center gap-2 px-4 py-3">
            <div className="flex-1 relative">
              <Search className="absolute left-3.5 top-1/2 -translate-y-1/2 w-4 h-4 text-muted-foreground" />
              <input
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
                className="w-full pl-10 pr-4 h-11 rounded-2xl bg-muted border-0 text-[15px] outline-none placeholder:text-muted-foreground/60"
              />
            </div>
            <button
              onClick={() => { setSearchOpen(false); setSearchQuery(""); }}
              className="text-primary font-semibold text-[15px] shrink-0 px-1"
            >
              Cancel
            </button>
          </div>
        ) : (
          <div className="px-4 py-3">
            {/* Top row: logo + actions */}
            <div className="flex items-center justify-between mb-3">
              <div className="flex items-center gap-2.5">
                <div className="w-8 h-8 rounded-xl overflow-hidden bg-primary/10 flex items-center justify-center">
                  {(logoLight || logoDark) ? (
                    <img
                      src={logoLight || logoDark || ""}
                      alt={platformName || "KiyuMart"}
                      className="w-full h-full object-contain"
                    />
                  ) : (
                    <span className="text-primary font-black text-lg leading-none">K</span>
                  )}
                </div>
                <div>
                  {user ? (
                    <>
                      <p className="text-[11px] text-muted-foreground leading-none">{greeting()},</p>
                      <p className="text-[16px] font-bold text-foreground leading-tight">
                        {user.name.split(" ")[0]} 👋
                      </p>
                    </>
                  ) : (
                    <p className="text-[18px] font-black text-foreground">Discover</p>
                  )}
                </div>
              </div>

              <div className="flex items-center gap-1.5">
                <button
                  className="w-9 h-9 rounded-full bg-muted/70 flex items-center justify-center touch-ripple active:scale-95 relative"
                  onClick={() => navigate("/notifications")}
                  aria-label="Notifications"
                >
                  <Bell className="w-[18px] h-[18px] text-foreground" />
                  {unreadCount > 0 && (
                    <span className="absolute top-1 right-1 w-2.5 h-2.5 rounded-full bg-destructive border-2 border-background mobile-bounce-in" />
                  )}
                </button>
                {user ? (
                  <button
                    onClick={() => navigate("/profile")}
                    className="touch-ripple rounded-full active:scale-95"
                  >
                    <UserAvatar
                      name={user.name}
                      profileImage={user.profileImage}
                      size="sm"
                      className="w-9 h-9 ring-2 ring-primary/20"
                    />
                  </button>
                ) : (
                  <button
                    onClick={() => navigate("/auth")}
                    className="text-[13px] font-semibold text-primary bg-primary/10 px-3 py-1.5 rounded-full touch-ripple"
                  >
                    Sign in
                  </button>
                )}
              </div>
            </div>

            {/* Search pill */}
            <button
              onClick={() => setSearchOpen(true)}
              className="w-full flex items-center gap-2.5 bg-muted/70 rounded-2xl px-4 h-11 touch-ripple active:bg-muted text-muted-foreground/70"
            >
              <Search className="w-4 h-4 shrink-0" />
              <span className="text-[14px]">Search products, stores…</span>
            </button>
          </div>
        )}
      </header>

      {/* ─── Search results overlay ─── */}
      {searchQuery && searchFiltered && (
        <div className="px-4 py-3 bg-background border-b border-border/30">
          <p className="text-[12px] text-muted-foreground mb-3">
            {searchFiltered.length} results for &ldquo;{searchQuery}&rdquo;
          </p>
          {searchFiltered.length === 0 ? (
            <p className="text-center py-8 text-muted-foreground text-[15px]">No products found</p>
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
          <section className="pt-5">
            <SectionHeader title="Categories" href="/products" icon={ShoppingBag} />
            <div className="mobile-pill-scroll px-4 gap-2.5 pb-1">
              <button
                onClick={() => setActiveCategoryId(null)}
                className={cn(
                  "flex flex-col items-center gap-2 shrink-0 touch-ripple transition-all duration-200",
                  "min-w-[72px] rounded-2xl py-2.5 px-2",
                  activeCategoryId === null
                    ? "bg-primary text-primary-foreground"
                    : "bg-card border border-border/50 text-foreground",
                )}
              >
                <div className={cn(
                  "w-11 h-11 rounded-xl flex items-center justify-center",
                  activeCategoryId === null ? "bg-white/20" : "bg-muted/50",
                )}>
                  <ShoppingBag className={cn("w-5 h-5", activeCategoryId === null ? "text-white" : "text-muted-foreground")} />
                </div>
                <span className={cn(
                  "text-[11px] font-semibold",
                  activeCategoryId === null ? "text-white" : "text-foreground",
                )}>
                  All
                </span>
              </button>
              {categories.slice(0, 10).map((cat) => (
                <CategoryPill
                  key={cat.id}
                  cat={cat}
                  active={activeCategoryId === cat.id}
                  onPress={() => setActiveCategoryId(activeCategoryId === cat.id ? null : cat.id)}
                />
              ))}
            </div>
          </section>
        )}

        {/* Flash Deals promo banner */}
        <section className="pt-5">
          <PromoDealsCard onPress={() => navigate("/products?filter=featured")} />
        </section>

        {/* Featured Products */}
        {(isLoading || filteredFeatured.length > 0) && (
          <section className="pt-5">
            <SectionHeader title="Featured" href="/products?filter=featured" icon={Zap} />
            <div className="mobile-hscroll px-4 gap-3 pb-1">
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

        {/* Stores Browse card */}
        {stores.length > 0 && (
          <section className="pt-5">
            <SectionHeader title="Stores Near You" href="/stores" icon={Store} />
            <div className="mobile-hscroll px-4 gap-3 pb-1">
              {stores.slice(0, 8).map((store) => (
                <div key={store.id} className="shrink-0 w-36">
                  <StoreCard store={store} />
                </div>
              ))}
            </div>
            {stores.length > 2 && (
              <div className="pt-3 px-4">
                <StoreBrowseCard onPress={() => navigate("/stores")} />
              </div>
            )}
          </section>
        )}

        {/* New Arrivals */}
        {(isLoading || filteredNew.length > 0) && (
          <section className="pt-5">
            <SectionHeader title="New Arrivals" href="/products?sort=newest" icon={TrendingUp} />
            <div className="grid grid-cols-2 gap-3 px-4">
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
                  className="w-full rounded-2xl h-12 font-semibold border-primary/30 text-primary hover:bg-primary/5"
                  onClick={() => navigate("/products?sort=newest")}
                >
                  View All New Arrivals <ChevronRight className="w-4 h-4 ml-1" />
                </Button>
              </div>
            )}
          </section>
        )}
      </main>
    </div>
  );
}
