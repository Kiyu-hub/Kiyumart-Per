/**
 * BrowseVendors — desktop "See all Local Vendors & Restaurants" page.
 *
 * Mirrors the mobile /mobile/vendors page but laid out for desktop. Shows:
 *   1. Tab filter (All / Local Vendors / Restaurants)
 *   2. Storefront cards
 *   3. Mixed food product grid from the same set of stores
 *
 * The page is route-mounted at /vendors. On mobile screens, App.tsx routes
 * here too — we transparently render the mobile page so the experience stays
 * native-feeling. This is the same pattern used on /product/:id.
 */
import { lazy, Suspense, useMemo, useState } from "react";
import { useLocation } from "wouter";
import { useQuery } from "@tanstack/react-query";
import Header from "@/components/Header";
import Footer from "@/components/Footer";
import ProductCard from "@/components/ProductCard";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Skeleton } from "@/components/ui/skeleton";
import { fetchSameOriginJson } from "@/lib/queryClient";
import { useMobileDevice } from "@/hooks/useMobileDevice";
import { useAuth } from "@/lib/auth";
import {
  getFoodVendorStores,
  getLocalVendors,
  getRestaurants,
  isLocalVendorStore,
  isRestaurantStore,
  splitProductsByFoodStores,
} from "@/lib/foodVendors";
import { Search, UtensilsCrossed, ChevronRight, Star, MapPin } from "lucide-react";

const MobileAllVendors = lazy(() => import("@/pages/mobile/MobileAllVendors"));

type Tab = "all" | "local_vendor" | "restaurant";

interface Store {
  id: string;
  name: string;
  logo?: string | null;
  banner?: string | null;
  location?: string | null;
  averageRating?: string | null;
  totalOrders?: number | null;
  isActive?: boolean;
  isApproved?: boolean;
  verificationStatus?: string | null;
  businessType?: string | null;
  merchantCategory?: string | null;
  storeType?: string | null;
  sellerName?: string | null;
}

export default function BrowseVendors() {
  const { isMobile } = useMobileDevice();
  const [, navigate] = useLocation();
  const { isAuthenticated } = useAuth();
  const [search, setSearch] = useState("");
  const [tab, setTab] = useState<Tab>("all");

  // Mobile users see the native mobile experience for this page.
  if (isMobile) {
    return (
      <Suspense fallback={<div className="p-6">Loading…</div>}>
        <MobileAllVendors />
      </Suspense>
    );
  }

  const { data: stores = [], isLoading: storesLoading } = useQuery<Store[]>({
    queryKey: ["/api/stores", "active-approved", "vendors-page"],
    queryFn: () => fetchSameOriginJson<Store[]>("/api/stores?isActive=true&isApproved=true"),
    staleTime: 60_000,
  });

  const { data: products = [], isLoading: productsLoading } = useQuery<any[]>({
    queryKey: ["/api/products", "active", "vendors-page"],
    queryFn: () => fetchSameOriginJson<any[]>("/api/products?isActive=true"),
    staleTime: 60_000,
  });

  const { data: wishlist = [] } = useQuery<any[]>({
    queryKey: ["/api/wishlist"],
    enabled: isAuthenticated,
    queryFn: () => fetchSameOriginJson<any[]>("/api/wishlist", { cache: "no-store" }),
  });

  // Filter stores by tab. For "all" we use the BROAD isFoodVendorStore check
  // so legacy stores with storeType=food_beverages but no businessType still
  // show up here. Dedupe by id (one store can match multiple predicates).
  const filteredStores = useMemo(() => {
    if (tab === "local_vendor") return getLocalVendors(stores);
    if (tab === "restaurant") return getRestaurants(stores);
    return getFoodVendorStores(stores);
  }, [stores, tab]);

  // Search across stores
  const matchingStores = useMemo(() => {
    const q = search.trim().toLowerCase();
    if (!q) return filteredStores;
    return filteredStores.filter((s) =>
      (s.name || "").toLowerCase().includes(q) ||
      (s.location || "").toLowerCase().includes(q) ||
      (s.sellerName || "").toLowerCase().includes(q),
    );
  }, [filteredStores, search]);

  // Food products from the matching stores
  const { foodVendorProducts } = useMemo(() => splitProductsByFoodStores<any>(products, stores), [products, stores]);
  const filteredFoodProducts = useMemo(() => {
    const matchingStoreIds = new Set(matchingStores.map((s) => String(s.id)));
    let base = foodVendorProducts.filter((p) => p?.storeId && matchingStoreIds.has(String(p.storeId)));
    const q = search.trim().toLowerCase();
    if (q) {
      base = base.filter((p) => String(p.name || "").toLowerCase().includes(q));
    }
    return base;
  }, [foodVendorProducts, matchingStores, search]);

  const wishlistIds = new Set((wishlist as any[]).map((w) => w?.productId).filter(Boolean));

  const isLoading = storesLoading || productsLoading;

  return (
    <div className="min-h-screen flex flex-col bg-background">
      <Header onCartClick={() => navigate("/cart")} />

      <main className="flex-1 max-w-7xl mx-auto w-full px-4 sm:px-6 lg:px-8 py-8">
        {/* Page header */}
        <div className="flex items-center gap-4 mb-6">
          <div className="h-12 w-12 rounded-2xl bg-orange-500/15 text-orange-500 flex items-center justify-center">
            <UtensilsCrossed className="h-6 w-6" />
          </div>
          <div>
            <h1 className="text-3xl font-bold tracking-tight text-foreground">
              Local Vendors &amp; Restaurants
            </h1>
            <p className="text-muted-foreground text-sm mt-1">
              Fresh food &amp; drinks from vendors near you
            </p>
          </div>
        </div>

        {/* Tabs + search */}
        <div className="flex flex-col md:flex-row md:items-center md:justify-between gap-4 mb-8">
          <div className="inline-flex rounded-xl border border-border bg-card p-1 self-start">
            {(["all", "local_vendor", "restaurant"] as const).map((k) => (
              <button
                key={k}
                onClick={() => setTab(k)}
                data-testid={`tab-vendors-${k}`}
                className={`px-4 py-2 text-sm font-semibold rounded-lg transition-colors ${
                  tab === k
                    ? "bg-primary text-primary-foreground"
                    : "text-muted-foreground hover:text-foreground"
                }`}
              >
                {k === "all" ? "All" : k === "local_vendor" ? "Local Vendors" : "Restaurants"}
              </button>
            ))}
          </div>

          <div className="relative w-full md:max-w-sm">
            <Search className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-muted-foreground pointer-events-none" />
            <Input
              type="search"
              placeholder="Search vendors or dishes…"
              value={search}
              onChange={(e) => setSearch(e.target.value)}
              className="pl-9"
              data-testid="input-vendor-search"
            />
          </div>
        </div>

        {/* Stores section */}
        <section className="mb-12">
          <div className="flex items-center justify-between mb-4">
            <h2 className="text-xl font-bold text-foreground">
              {tab === "restaurant" ? "Restaurants" : tab === "local_vendor" ? "Local Vendors" : "Stores"}
              <span className="ml-2 text-sm font-normal text-muted-foreground">
                {matchingStores.length}
              </span>
            </h2>
          </div>

          {isLoading ? (
            <div className="grid grid-cols-2 sm:grid-cols-3 lg:grid-cols-4 gap-4">
              {Array.from({ length: 6 }).map((_, i) => (
                <Skeleton key={i} className="h-44 rounded-2xl" />
              ))}
            </div>
          ) : matchingStores.length === 0 ? (
            <div className="text-center py-12 border border-dashed border-border rounded-2xl text-muted-foreground">
              {search.trim() ? (
                <>No vendors match “{search.trim()}”.</>
              ) : (
                <>No vendors available yet — check back soon.</>
              )}
            </div>
          ) : (
            <div className="grid grid-cols-2 sm:grid-cols-3 lg:grid-cols-4 gap-4">
              {matchingStores.map((store) => {
                const isRestaurant = isRestaurantStore(store);
                const isLocal = isLocalVendorStore(store);
                const badge = isRestaurant ? "Restaurant" : isLocal ? "Local Vendor" : "Food";
                return (
                  <button
                    key={store.id}
                    onClick={() => navigate(`/sellers/${store.id}`)}
                    data-testid={`card-vendor-${store.id}`}
                    className="group text-left rounded-2xl border border-border bg-card overflow-hidden hover:shadow-md transition"
                  >
                    <div className="aspect-[5/3] relative bg-muted overflow-hidden">
                      {store.banner || store.logo ? (
                        <img
                          src={store.banner || store.logo || ""}
                          alt={store.name}
                          className="w-full h-full object-cover group-hover:scale-105 transition-transform duration-300"
                        />
                      ) : (
                        <div className="flex items-center justify-center h-full text-3xl">
                          {isRestaurant ? "🍽️" : "🍛"}
                        </div>
                      )}
                      <span className="absolute top-2 left-2 text-[10px] font-bold uppercase tracking-wide bg-orange-500 text-white rounded-full px-2 py-0.5">
                        {badge}
                      </span>
                    </div>
                    <div className="p-3">
                      <div className="font-semibold text-sm text-foreground line-clamp-1">{store.name}</div>
                      {store.location && (
                        <div className="flex items-center gap-1 text-[11px] text-muted-foreground mt-1">
                          <MapPin className="h-3 w-3" /> <span className="truncate">{store.location}</span>
                        </div>
                      )}
                      <div className="flex items-center gap-2 text-[11px] text-muted-foreground mt-1">
                        <span className="flex items-center gap-1">
                          <Star className="h-3 w-3 text-amber-500 fill-amber-500" />
                          {parseFloat(store.averageRating || "0").toFixed(1)}
                        </span>
                        {store.totalOrders != null && (
                          <span>· {store.totalOrders} orders</span>
                        )}
                      </div>
                    </div>
                  </button>
                );
              })}
            </div>
          )}
        </section>

        {/* Dishes / food products grid */}
        <section>
          <div className="flex items-center justify-between mb-4">
            <h2 className="text-xl font-bold text-foreground">
              {tab === "restaurant" ? "Menu items" : tab === "local_vendor" ? "Available dishes" : "All dishes"}
              <span className="ml-2 text-sm font-normal text-muted-foreground">
                {filteredFoodProducts.length}
              </span>
            </h2>
            {filteredFoodProducts.length > 0 && (
              <Button variant="ghost" size="sm" onClick={() => navigate("/products")}>
                Browse all products <ChevronRight className="h-4 w-4 ml-1" />
              </Button>
            )}
          </div>

          {isLoading ? (
            <div className="grid grid-cols-2 sm:grid-cols-3 lg:grid-cols-4 xl:grid-cols-5 gap-4">
              {Array.from({ length: 10 }).map((_, i) => (
                <Skeleton key={i} className="aspect-square rounded-xl" />
              ))}
            </div>
          ) : filteredFoodProducts.length === 0 ? (
            <div className="text-center py-12 border border-dashed border-border rounded-2xl text-muted-foreground text-sm">
              {search.trim() ? (
                <>No dishes match “{search.trim()}”.</>
              ) : matchingStores.length === 0 ? (
                <>Once vendors add dishes, you’ll see them here.</>
              ) : (
                <>These vendors haven’t added any dishes yet.</>
              )}
            </div>
          ) : (
            <div className="grid grid-cols-2 sm:grid-cols-3 lg:grid-cols-4 xl:grid-cols-5 gap-4">
              {filteredFoodProducts.map((p) => (
                <ProductCard
                  key={p.id}
                  id={p.id}
                  name={p.name}
                  price={p.price}
                  costPrice={p.costPrice || undefined}
                  image={Array.isArray(p.images) ? p.images[0] : ""}
                  discount={p.discount || 0}
                  rating={p.ratings || "0"}
                  reviewCount={p.totalRatings || 0}
                  inStock={(p.stock || 0) > 0}
                  isWishlisted={wishlistIds.has(p.id)}
                />
              ))}
            </div>
          )}
        </section>
      </main>

      <Footer />
    </div>
  );
}
