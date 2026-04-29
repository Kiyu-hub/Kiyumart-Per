import { useEffect } from "react";
import { useLocation } from "wouter";
import { useQuery } from "@tanstack/react-query";
import { fetchSameOriginJson } from "@/lib/queryClient";
import { useLanguage } from "@/contexts/LanguageContext";
import Header from "@/components/Header";
import Footer from "@/components/Footer";
import ProductCard from "@/components/ProductCard";
import { Loader2, SearchX, Sparkles } from "lucide-react";

interface Product {
  id: string;
  name: string;
  price: string;
  costPrice?: string;
  images: string[];
  discount: number;
  ratings: string;
  totalRatings: number;
  category?: string | null;
  stock?: number;
  storeId?: string;
}

function ProductGrid({ products, currencySymbol }: { products: Product[]; currencySymbol: string }) {
  return (
    <div className="grid grid-cols-2 sm:grid-cols-3 md:grid-cols-4 lg:grid-cols-5 gap-4">
      {products.map((product) => {
        const sellingPrice = parseFloat(product.price);
        const originalPrice = product.costPrice ? parseFloat(product.costPrice) : null;
        const calculatedDiscount =
          originalPrice && originalPrice > sellingPrice
            ? Math.round(((originalPrice - sellingPrice) / originalPrice) * 100)
            : 0;
        return (
          <ProductCard
            key={product.id}
            id={product.id}
            name={product.name}
            price={sellingPrice}
            costPrice={originalPrice || undefined}
            currency={currencySymbol}
            image={Array.isArray(product.images) && product.images.length > 0 ? product.images[0] : ""}
            discount={calculatedDiscount}
            rating={parseFloat(product.ratings) || 0}
            reviewCount={product.totalRatings}
            inStock={(product.stock || 0) > 0}
          />
        );
      })}
    </div>
  );
}

function YouMayAlsoLike({ currencySymbol }: { currencySymbol: string }) {
  const { data: suggestions = [], isLoading } = useQuery<Product[]>({
    queryKey: ["/api/homepage/featured-products", "search-suggestions"],
    queryFn: async () => {
      const res = await fetch("/api/homepage/featured-products", { credentials: "include" });
      if (!res.ok) return [];
      const data = await res.json();
      return Array.isArray(data) ? data.slice(0, 10) : [];
    },
    staleTime: 5 * 60_000,
  });

  if (isLoading || suggestions.length === 0) return null;

  return (
    <section className="mt-16 border-t pt-10">
      <div className="flex items-center gap-2 mb-6">
        <Sparkles className="h-5 w-5 text-primary" />
        <h2 className="text-xl font-bold">You May Also Like</h2>
      </div>
      <ProductGrid products={suggestions} currencySymbol={currencySymbol} />
    </section>
  );
}

export default function SearchPage() {
  const [location] = useLocation();
  const { currencySymbol } = useLanguage();

  const searchQuery = new URLSearchParams(location.split("?")[1] || "").get("q") || "";

  const { data: products = [], isLoading } = useQuery<Product[]>({
    queryKey: ["/api/products", "search", searchQuery],
    queryFn: async () => {
      if (!searchQuery.trim()) return [];
      const res = await fetch(`/api/products?search=${encodeURIComponent(searchQuery.trim())}&limit=60`, {
        credentials: "include",
      });
      if (!res.ok) return [];
      const data = await res.json();
      return Array.isArray(data) ? data : Array.isArray(data?.products) ? data.products : [];
    },
    enabled: !!searchQuery.trim(),
  });

  if (!searchQuery.trim()) {
    return (
      <div className="min-h-screen flex flex-col">
        <Header />
        <main className="flex-1 max-w-7xl mx-auto px-4 py-10 w-full">
          <div className="flex flex-col items-center justify-center py-24 text-center">
            <SearchX className="h-12 w-12 text-muted-foreground/40 mx-auto mb-4" />
            <p className="text-lg text-muted-foreground">Enter something to search for products.</p>
          </div>
          <YouMayAlsoLike currencySymbol={currencySymbol} />
        </main>
        <Footer />
      </div>
    );
  }

  return (
    <div className="min-h-screen flex flex-col">
      <Header />
      <main className="flex-1 max-w-7xl mx-auto px-4 py-10 w-full">
        <h1 className="text-2xl font-bold mb-1">
          Search results for <span className="text-primary">"{searchQuery}"</span>
        </h1>

        {isLoading ? (
          <div className="flex items-center justify-center py-24 text-muted-foreground">
            <Loader2 className="h-6 w-6 animate-spin text-primary mr-2" />
            <span>Searching…</span>
          </div>
        ) : products.length === 0 ? (
          <>
            <p className="text-sm text-muted-foreground mb-8">No results found.</p>
            <div className="flex flex-col items-center justify-center py-16 text-center">
              <SearchX className="h-14 w-14 text-muted-foreground/30 mb-4" />
              <p className="text-xl font-medium text-foreground mb-2">No products found</p>
              <p className="text-muted-foreground text-sm">
                We couldn't find anything matching "{searchQuery}". Try different keywords.
              </p>
            </div>
            <YouMayAlsoLike currencySymbol={currencySymbol} />
          </>
        ) : (
          <>
            <p className="text-sm text-muted-foreground mb-8">
              {products.length} product{products.length !== 1 ? "s" : ""} found
            </p>
            <ProductGrid products={products} currencySymbol={currencySymbol} />
            <YouMayAlsoLike currencySymbol={currencySymbol} />
          </>
        )}
      </main>
      <Footer />
    </div>
  );
}
