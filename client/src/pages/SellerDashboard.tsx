import DashboardLayout from "@/components/DashboardLayout";
import MetricCard from "@/components/MetricCard";
import ProductCard from "@/components/ProductCard";
import ThemeToggle from "@/components/ThemeToggle";
import StoreModeToggle from "@/components/StoreModeToggle";
import { DollarSign, Package, ShoppingBag, TrendingUp, Eye, Plus, Loader2, AlertCircle } from "lucide-react";
import { Button } from "@/components/ui/button";
import { useAuth } from "@/lib/auth";
import { useLocation } from "wouter";
import { useQuery } from "@tanstack/react-query";
import { useLanguage } from "@/contexts/LanguageContext";
import { apiRequest } from "@/lib/queryClient";

interface Store {
  id: string;
  name: string;
  primarySellerId: string;
}

interface PlatformSettings {
  isMultiVendor: boolean;
}

interface Analytics {
  totalOrders: number;
  totalRevenue: number;
}

interface Product {
  id: string;
  name: string;
  price: string;
  images: string[];
  discount?: number | null;
  sellerId: string;
  isActive: boolean;
  rating?: number;
  reviewCount?: number;
}

interface Order {
  id: string;
  status: string;
  sellerId: string;
}

function safeNumber(value: unknown): number {
  const parsed = typeof value === "number" ? value : Number(value);
  return Number.isFinite(parsed) ? parsed : 0;
}

function normalizeOrderStatus(status?: string): string {
  if (!status) return "";
  return String(status).toLowerCase().trim();
}

export default function SellerDashboard() {
  const { user } = useAuth();
  const [, navigate] = useLocation();
  const { formatPrice } = useLanguage();

  // Fetch platform settings to check if multi-vendor mode is enabled
  const { data: platformSettings } = useQuery<PlatformSettings>({
    queryKey: ["/api/platform-settings"],
  });

  // Fetch seller's store information only if approved
  const { data: store, isLoading: storeLoading, error: storeError } = useQuery<Store | null>({
    queryKey: ["/api/stores/my-store"],
    enabled: !!user?.id && user?.role === "seller" && user?.isApproved === true,
    retry: 3, // Retry a few times in case store is being created
    retryDelay: 1000,
    queryFn: async () => {
      const res = await fetch("/api/stores/my-store");
      if (res.status === 404) {
        return null; // No store yet, return null instead of throwing
      }
      if (!res.ok) {
        throw new Error("Failed to fetch store");
      }
      return res.json();
    },
  });

  // Fetch real analytics data instead of using hardcoded values
  const { data: analytics = { totalOrders: 0, totalRevenue: 0 }, isLoading: analyticsLoading } = useQuery<Analytics>({
    queryKey: ["/api/analytics", user?.id, user?.role],
    queryFn: async () => {
      const res = await apiRequest("GET", "/api/analytics");
      const data = await res.json();
      return data && typeof data === "object" ? data : { totalOrders: 0, totalRevenue: 0 };
    },
    enabled: !!user?.id && user?.role === "seller" && user?.isApproved === true,
  });

  // Fetch real products instead of hardcoded mock data
  const { data: products = [], isLoading: productsLoading } = useQuery<Product[]>({
    queryKey: ["/api/products", user?.id],
    queryFn: async () => {
      const res = await apiRequest("GET", `/api/products?sellerId=${user?.id}`);
      const data = await res.json();
      return Array.isArray(data) ? data.slice(0, 4) : []; // Show max 4 products on dashboard
    },
    enabled: !!user?.id && user?.role === "seller" && user?.isApproved === true,
  });

  // Fetch real orders to count pending orders
  const { data: orders = [] } = useQuery<Order[]>({
    queryKey: ["/api/orders"],
    enabled: !!user?.id && user?.role === "seller" && user?.isApproved === true,
  });

  // Show pending approval message if seller is not approved
  if (user?.role === "seller" && !user?.isApproved) {
    return (
      <DashboardLayout role="seller">
        <div className="p-6">
          <div className="max-w-2xl mx-auto mt-12">
            <div className="bg-card border rounded-lg p-8 text-center space-y-4">
              <div className="mx-auto w-16 h-16 bg-yellow-500/10 rounded-full flex items-center justify-center">
                <svg className="w-8 h-8 text-yellow-600" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 8v4l3 3m6-3a9 9 0 11-18 0 9 9 0 0118 0z" />
                </svg>
              </div>
              <h2 className="text-2xl font-bold">Application Under Review</h2>
              <p className="text-muted-foreground">
                Thank you for registering as a seller on our platform! Your application is currently being reviewed by our team.
              </p>
              <p className="text-muted-foreground">
                <strong>We will get back to you within 72 hours</strong> with an update on your application status. You will receive an email notification once your account has been approved.
              </p>
              <p className="text-sm text-muted-foreground mt-4">
                If you have any questions, please contact our support team.
              </p>
            </div>
          </div>
        </div>
      </DashboardLayout>
    );
  }

  const handlePreviewStore = () => {
    if (!store) {
      window.open("/", '_blank'); // Fallback to homepage if no store
      return;
    }
    
    if (platformSettings?.isMultiVendor && store?.id) {
      // In multi-vendor mode, open the specific store page in a new tab
      window.open(`/stores/${store.id}`, '_blank');
    } else {
      // In single-store mode, open the homepage in a new tab to show customer view
      window.open("/", '_blank');
    }
  };

  // Calculate metrics from real data
  const safeProducts = Array.isArray(products) ? products : [];
  const safeOrders = Array.isArray(orders) ? orders : [];
  const safeAnalytics: Analytics = {
    totalOrders: safeNumber((analytics as any)?.totalOrders),
    totalRevenue: safeNumber((analytics as any)?.totalRevenue),
  };

  const pendingOrders = safeOrders.filter((o) =>
    o?.sellerId === user?.id &&
    ["pending", "processing", "ready", "confirmed", "assigned"].includes(normalizeOrderStatus(o?.status))
  ).length;

  const activeProducts = safeProducts.filter((p) => !!p?.isActive).length;

  return (
    <DashboardLayout role="seller">
      <div className="p-6">
        <div className="max-w-7xl mx-auto space-y-6">
          {/* Header with Preview Store button */}
          <div className="flex items-center justify-between mb-6">
            <h1 className="text-2xl font-bold">Seller Dashboard</h1>
            <Button 
              variant="outline" 
              onClick={handlePreviewStore}
              data-testid="button-preview-store"
              disabled={storeLoading}
            >
              <Eye className="h-4 w-4 mr-2" />
              Preview Store
            </Button>
          </div>

          {/* Metrics Grid - with loading state */}
          {analyticsLoading ? (
            <div className="flex justify-center p-8">
              <Loader2 className="h-8 w-8 animate-spin text-primary" />
            </div>
          ) : (
            <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-6">
              <MetricCard
                title="Total Sales"
                value={formatPrice(safeAnalytics.totalRevenue)}
                icon={DollarSign}
              />
              <MetricCard
                title="Total Orders"
                value={safeAnalytics.totalOrders.toString()}
                icon={Package}
              />
              <MetricCard
                title="Pending Orders"
                value={pendingOrders.toString()}
                icon={ShoppingBag}
              />
              <MetricCard
                title="Active Products"
                value={activeProducts.toString()}
                icon={TrendingUp}
              />
            </div>
          )}

          {/* Products Section */}
          <div>
            <div className="flex items-center justify-between mb-4">
              <h2 className="text-xl font-bold">My Products</h2>
              <Button onClick={() => navigate("/seller/products")} data-testid="button-add-product">
                <Plus className="h-4 w-4 mr-2" />
                Add New Product
              </Button>
            </div>

            {productsLoading ? (
              <div className="flex justify-center p-8">
                <Loader2 className="h-8 w-8 animate-spin text-primary" />
              </div>
            ) : safeProducts.length === 0 ? (
              <div className="border border-dashed rounded-lg p-8 text-center">
                <Package className="h-12 w-12 text-muted-foreground mx-auto mb-3 opacity-50" />
                <p className="text-muted-foreground mb-4">No products yet. Start by adding your first product.</p>
                <Button onClick={() => navigate("/seller/products")}>
                  <Plus className="h-4 w-4 mr-2" />
                  Add First Product
                </Button>
              </div>
            ) : (
              <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 xl:grid-cols-4 gap-6">
                {safeProducts.map((product) => (
                  <ProductCard
                    key={product.id}
                    {...product}
                    onToggleWishlist={(id) => navigate(`/seller/products`)}
                  />
                ))}
              </div>
            )}
          </div>
        </div>
      </div>
    </DashboardLayout>
  );
}
