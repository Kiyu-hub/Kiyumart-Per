import { useEffect, useMemo } from "react";
import { useQuery } from "@tanstack/react-query";
import { useLocation } from "wouter";
import DashboardLayout from "@/components/DashboardLayout";
import { useAuth } from "@/lib/auth";
import { fetchApiJson } from "@/lib/queryClient";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Loader2, Grid3x3, Package, Tag } from "lucide-react";

type SellerProduct = {
  id: string;
  name: string;
  category?: string | null;
  categoryId?: string | null;
  categoryName?: string | null;
  images?: string[] | null;
};

type SellerCategoryRequest = {
  categoryId: string;
  name: string;
  slug: string;
  image: string | null;
  storeType: string | null;
  requestedAt: string;
  status: "pending" | "approved" | "rejected";
  message: string;
};

type SellerCategorySummary = {
  id: string;
  name: string;
  slug: string;
  image: string | null;
  productCount: number;
};

const normalizeCategoryLabel = (product: SellerProduct) =>
  String(product.categoryName || product.category || "Uncategorized").trim() || "Uncategorized";

export default function SellerCategories() {
  const { user, isAuthenticated, isLoading: authLoading } = useAuth();
  const [location, navigate] = useLocation();

  useEffect(() => {
    if (!authLoading && (!isAuthenticated || user?.role !== "seller")) {
      navigate("/");
    }
  }, [authLoading, isAuthenticated, navigate, user?.role]);

  const focusedCategoryId = useMemo(() => {
    if (typeof window === "undefined") return "";
    return new URLSearchParams(window.location.search).get("categoryId") || "";
  }, [location]);

  const { data: sellerProducts = [], isLoading: productsLoading } = useQuery<SellerProduct[]>({
    queryKey: ["/api/products", user?.id, "seller-categories"],
    queryFn: async () => {
      if (!user?.id) return [];
      const data = await fetchApiJson<SellerProduct[]>(`/api/products?sellerId=${encodeURIComponent(user.id)}`);
      return Array.isArray(data) ? data : [];
    },
    enabled: Boolean(user?.id),
  });

  const { data: categoryRequests = [], isLoading: requestsLoading } = useQuery<SellerCategoryRequest[]>({
    queryKey: ["/api/seller/category-requests"],
    queryFn: async () => {
      const data = await fetchApiJson<SellerCategoryRequest[]>("/api/seller/category-requests");
      return Array.isArray(data) ? data : [];
    },
    enabled: Boolean(user?.id),
  });

  const categoriesWithProducts = useMemo<SellerCategorySummary[]>(() => {
    const grouped = new Map<string, SellerCategorySummary>();

    for (const product of sellerProducts) {
      const categoryId = String(product.categoryId || product.category || product.categoryName || "").trim();
      if (!categoryId) continue;

      const existing = grouped.get(categoryId);
      if (existing) {
        existing.productCount += 1;
        continue;
      }

      grouped.set(categoryId, {
        id: categoryId,
        name: normalizeCategoryLabel(product),
        slug: String(product.category || product.categoryName || "").trim().toLowerCase().replace(/\s+/g, "-"),
        image: Array.isArray(product.images) && product.images.length > 0 ? product.images[0] : null,
        productCount: 1,
      });
    }

    return Array.from(grouped.values()).sort((a, b) => {
      const countDiff = b.productCount - a.productCount;
      if (countDiff !== 0) return countDiff;
      return a.name.localeCompare(b.name);
    });
  }, [sellerProducts]);

  const selectedRequest = useMemo(
    () => categoryRequests.find((request) => request.categoryId === focusedCategoryId) || null,
    [categoryRequests, focusedCategoryId],
  );

  if (authLoading || !isAuthenticated || user?.role !== "seller") {
    return (
      <div className="min-h-screen bg-background flex items-center justify-center">
        <Loader2 className="h-8 w-8 animate-spin text-primary" />
      </div>
    );
  }

  return (
    <DashboardLayout role="seller">
      <div className="p-6 space-y-6">
        <div>
          <h1 className="text-3xl font-bold" data-testid="text-page-title">Categories</h1>
          <p className="text-muted-foreground mt-1">
            Categories attached to your products. Categories without products stay hidden here.
          </p>
        </div>

        {focusedCategoryId && selectedRequest && (
          <Card className="border-primary/30" data-testid={`card-request-${selectedRequest.categoryId}`}>
            <CardHeader>
              <div className="flex items-center justify-between gap-3">
                <div>
                  <CardTitle className="text-xl">{selectedRequest.name}</CardTitle>
                  <p className="text-sm text-muted-foreground mt-1">
                    {selectedRequest.slug ? `/${selectedRequest.slug}` : "Requested category"}
                  </p>
                </div>
                <Badge
                  variant={
                    selectedRequest.status === "approved"
                      ? "default"
                      : selectedRequest.status === "rejected"
                        ? "destructive"
                        : "secondary"
                  }
                >
                  {selectedRequest.status}
                </Badge>
              </div>
            </CardHeader>
            <CardContent className="space-y-3">
              {selectedRequest.image && (
                <img
                  src={selectedRequest.image}
                  alt={selectedRequest.name}
                  className="h-40 w-full max-w-sm rounded-lg object-cover"
                />
              )}
              <p className="text-sm text-muted-foreground">{selectedRequest.message}</p>
              <p className="text-xs text-muted-foreground">
                Requested {new Date(selectedRequest.requestedAt).toLocaleString()}
              </p>
            </CardContent>
          </Card>
        )}

        {productsLoading || requestsLoading ? (
          <div className="flex items-center justify-center py-12">
            <Loader2 className="h-8 w-8 animate-spin text-primary" />
          </div>
        ) : categoriesWithProducts.length === 0 ? (
          <Card className="p-12">
            <div className="text-center">
              <Grid3x3 className="h-12 w-12 text-muted-foreground mx-auto mb-4" />
              <h3 className="text-lg font-semibold mb-2">No categories with products yet</h3>
              <p className="text-muted-foreground">
                Categories will appear here after you assign them to products.
              </p>
              <Button className="mt-4" variant="outline" onClick={() => navigate("/seller/products")}>
                Go to Products
              </Button>
            </div>
          </Card>
        ) : (
          <div className="grid gap-4 md:grid-cols-2 xl:grid-cols-3">
            {categoriesWithProducts.map((category) => (
              <Card
                key={category.id}
                className={focusedCategoryId === category.id ? "ring-2 ring-primary/50" : undefined}
                data-testid={`card-seller-category-${category.id}`}
              >
                <CardContent className="p-5 space-y-4">
                  {category.image ? (
                    <img src={category.image} alt={category.name} className="h-40 w-full rounded-lg object-cover" />
                  ) : (
                    <div className="flex h-40 w-full items-center justify-center rounded-lg bg-muted">
                      <Tag className="h-10 w-10 text-muted-foreground" />
                    </div>
                  )}
                  <div className="flex items-start justify-between gap-3">
                    <div>
                      <h3 className="text-lg font-semibold">{category.name}</h3>
                      <p className="text-sm text-muted-foreground">
                        {category.slug ? `/${category.slug}` : "Category"}
                      </p>
                    </div>
                    <Badge variant="outline">
                      <Package className="mr-1 h-3.5 w-3.5" />
                      {category.productCount}
                    </Badge>
                  </div>
                </CardContent>
              </Card>
            ))}
          </div>
        )}
      </div>
    </DashboardLayout>
  );
}
