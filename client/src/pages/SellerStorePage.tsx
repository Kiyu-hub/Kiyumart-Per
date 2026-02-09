import { useRoute } from "wouter";
import { useQuery } from "@tanstack/react-query";
import Header from "@/components/Header";
import Footer from "@/components/Footer";
import ProductCard from "@/components/ProductCard";
import { Skeleton } from "@/components/ui/skeleton";
import { Badge } from "@/components/ui/badge";
import { Avatar, AvatarImage, AvatarFallback } from "@/components/ui/avatar";
import { Store, Package, Star, MapPin } from "lucide-react";
import type { Product } from "@shared/schema";

interface StoreData {
  id: string;
  name: string;
  description?: string;
  logo?: string;
  banner?: string;
  category?: string;
  primarySellerId?: string;
  isActive?: boolean;
  isApproved?: boolean;
}

export default function SellerStorePage() {
  const [, params] = useRoute("/sellers/:id");
  const storeOrSellerId = params?.id;

  // First try to load as a store (for promoted store links)
  const { data: store, isLoading: storeLoading } = useQuery<StoreData>({
    queryKey: ["/api/stores", storeOrSellerId],
    queryFn: async () => {
      const res = await fetch(`/api/stores/${storeOrSellerId}`);
      if (!res.ok) return null as any;
      return res.json();
    },
    enabled: !!storeOrSellerId,
    retry: false,
  });

  // Determine the seller ID — either from the store's primarySellerId, or the URL param itself
  const sellerId = store?.primarySellerId || storeOrSellerId;

  // Load seller profile (public endpoint)
  const { data: seller, isLoading: sellerLoading } = useQuery<any>({
    queryKey: ["/api/seller-profile", sellerId],
    queryFn: async () => {
      // Try the public seller profile endpoint first
      const res = await fetch(`/api/stores/by-seller/${sellerId}`);
      if (res.ok) {
        const storeData = await res.json();
        // Merge store + basic seller info
        return {
          id: sellerId,
          name: storeData.name || "Store",
          storeName: storeData.name,
          storeBanner: storeData.banner,
          storeBio: storeData.description,
          profilePicture: storeData.logo,
          ratings: "0",
        };
      }
      return null;
    },
    enabled: !!sellerId && !storeLoading,
  });

  // Use store data directly if we have it  
  const displayData = store ? {
    id: storeOrSellerId,
    name: store.name,
    storeName: store.name,
    storeBanner: store.banner,
    storeBio: store.description,
    profilePicture: store.logo,
    ratings: "0",
  } : seller;

  const { data: products = [], isLoading: productsLoading } = useQuery<Product[]>({
    queryKey: ["/api/products", "seller", sellerId],
    queryFn: async () => {
      const res = await fetch(`/api/products?sellerId=${sellerId}`);
      if (!res.ok) return [];
      return res.json();
    },
    enabled: !!sellerId,
  });

  if (storeLoading || sellerLoading) {
    return (
      <div className="min-h-screen flex flex-col bg-background dark:bg-gray-900">
        <Header />
        <main className="flex-1">
          <div className="container max-w-7xl mx-auto px-4 py-6">
            <Skeleton className="h-48 w-full rounded-lg mb-6" />
            <Skeleton className="h-12 w-3/4 mb-4" />
            <Skeleton className="h-6 w-1/2" />
          </div>
        </main>
        <Footer />
      </div>
    );
  }

  if (!displayData && !storeLoading && !sellerLoading) {
    return (
      <div className="min-h-screen flex flex-col bg-background dark:bg-gray-900">
        <Header />
        <main className="flex-1">
          <div className="container max-w-7xl mx-auto px-4 py-16 text-center">
            <Store className="w-20 h-20 mx-auto mb-4 opacity-50 text-muted-foreground" />
            <h2 className="text-2xl font-bold mb-2">Store Not Found</h2>
            <p className="text-muted-foreground">The store you're looking for doesn't exist.</p>
          </div>
        </main>
        <Footer />
      </div>
    );
  }

  const s = displayData || {} as any;

  return (
    <div className="min-h-screen flex flex-col bg-background dark:bg-gray-900">
      <Header />

      <main className="flex-1">
        <div className="container max-w-7xl mx-auto px-4 py-4 space-y-4">
          <div className="relative">
            {s.storeBanner ? (
              <div className="h-32 md:h-40 rounded-lg overflow-hidden">
                <img
                  src={s.storeBanner}
                  alt={s.storeName || s.name}
                  className="w-full h-full object-cover"
                  data-testid="img-store-banner"
                />
              </div>
            ) : (
              <div className="h-32 md:h-40 rounded-lg bg-gradient-to-br from-primary/20 to-primary/5 flex items-center justify-center">
                <Store className="w-12 h-12 text-primary/40" />
              </div>
            )}

            <div className="absolute -bottom-8 left-4">
              <Avatar className="h-16 w-16 border-4 border-background">
                <AvatarImage src={s.profilePicture || undefined} />
                <AvatarFallback className="bg-primary text-white text-lg">
                  {s.storeName?.[0] || s.name?.[0] || "S"}
                </AvatarFallback>
              </Avatar>
            </div>
          </div>

          <div className="pt-10 space-y-3">
            <div className="flex items-start justify-between flex-wrap gap-3">
              <div className="space-y-1.5">
                <h1 className="text-2xl font-bold text-foreground dark:text-white" data-testid="text-store-name">
                  {s.storeName || s.name || "Store"}
                </h1>
                <div className="flex flex-wrap items-center gap-3 text-muted-foreground">
                  {s.ratings && parseFloat(s.ratings) > 0 && (
                    <div className="flex items-center gap-1">
                      <Star className="w-4 h-4 fill-yellow-400 text-yellow-400" />
                      <span className="font-medium">{parseFloat(s.ratings).toFixed(1)}</span>
                    </div>
                  )}
                  <div className="flex items-center gap-1">
                    <Package className="w-4 h-4" />
                    <span>{products.length} Products</span>
                  </div>
                </div>
              </div>

              <Badge variant="outline" className="text-sm" data-testid="badge-seller">
                Seller
              </Badge>
            </div>

            {s.storeBio && (
              <p className="text-sm text-muted-foreground max-w-2xl" data-testid="text-store-bio">
                {s.storeBio}
              </p>
            )}
          </div>

          <div className="space-y-4">
            <div className="flex items-center gap-2">
              <Package className="w-5 h-5 text-primary" />
              <h2 className="text-xl font-bold text-foreground dark:text-white" data-testid="heading-products">
                Products
              </h2>
            </div>

            {productsLoading ? (
              <div className="grid grid-cols-2 sm:grid-cols-3 lg:grid-cols-4 xl:grid-cols-5 gap-4">
                {[...Array(10)].map((_, i) => (
                  <Skeleton key={i} className="aspect-square rounded-lg" data-testid={`skeleton-product-${i}`} />
                ))}
              </div>
            ) : products.length > 0 ? (
              <div className="grid grid-cols-2 sm:grid-cols-3 lg:grid-cols-4 xl:grid-cols-5 gap-4" data-testid="grid-products">
                {products.map((product) => (
                  <ProductCard
                    key={product.id}
                    id={product.id}
                    name={product.name}
                    price={product.price}
                    costPrice={product.costPrice || undefined}
                    image={product.images[0] || ""}
                    discount={product.discount || 0}
                    rating={product.ratings || "0"}
                    reviewCount={product.totalRatings || 0}
                    inStock={(product.stock || 0) > 0}
                  />
                ))}
              </div>
            ) : (
              <div className="text-center py-16 text-muted-foreground" data-testid="empty-products">
                <Package className="w-20 h-20 mx-auto mb-4 opacity-50" />
                <p className="text-lg font-medium">No products yet</p>
                <p className="text-sm">This store hasn't listed any products</p>
              </div>
            )}
          </div>
        </div>
      </main>

      <Footer />
    </div>
  );
}
