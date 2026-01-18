import DashboardLayout from "@/components/DashboardLayout";
import MetricCard from "@/components/MetricCard";
import ProductCard from "@/components/ProductCard";
import ThemeToggle from "@/components/ThemeToggle";
import StoreModeToggle from "@/components/StoreModeToggle";
import { DollarSign, Package, ShoppingBag, TrendingUp, Eye, Plus } from "lucide-react";
import { Button } from "@/components/ui/button";
import { useAuth } from "@/lib/auth";
import { useLocation } from "wouter";
import { useQuery } from "@tanstack/react-query";

import handbagImage from "@assets/stock_images/Designer_handbag_product_photo_d9f11f99.png";
import sneakersImage from "@assets/stock_images/Men's_sneakers_product_photo_2c87b833.png";
import dressImage from "@assets/stock_images/Summer_dress_product_photo_9f6f8356.png";

interface Store {
  id: string;
  name: string;
  primarySellerId: string;
}

interface PlatformSettings {
  isMultiVendor: boolean;
}

export default function SellerDashboard() {
  const { user } = useAuth();
  const [, navigate] = useLocation();

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

  const myProducts = [
    {
      id: "1",
      name: "Designer Leather Handbag",
      price: 299.99,
      image: handbagImage,
      discount: 15,
      rating: 4.5,
      reviewCount: 128,
    },
    {
      id: "2",
      name: "Men's Casual Sneakers",
      price: 89.99,
      image: sneakersImage,
      rating: 4.8,
      reviewCount: 256,
    },
    {
      id: "3",
      name: "Summer Floral Dress",
      price: 129.99,
      image: dressImage,
      discount: 20,
      rating: 4.6,
      reviewCount: 89,
    },
  ];

  return (
    <DashboardLayout role="seller">
      <div className="p-6">
          <div className="max-w-7xl mx-auto space-y-6">
            <div className="flex items-center justify-between mb-6">
              <h1 className="text-2xl font-bold">Seller Dashboard</h1>
              <Button 
                variant="outline" 
                onClick={handlePreviewStore}
                data-testid="button-preview-store"
              >
                <Eye className="h-4 w-4 mr-2" />
                Preview Store
              </Button>
            </div>

            <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-6">
              <MetricCard
                title="Total Sales"
                value="GHS 12,450"
                icon={DollarSign}
                change={18.2}
              />
              <MetricCard
                title="Products Sold"
                value="234"
                icon={Package}
                change={12.5}
              />
              <MetricCard
                title="Pending Orders"
                value="12"
                icon={ShoppingBag}
              />
              <MetricCard
                title="Conversion Rate"
                value="3.2%"
                icon={TrendingUp}
                change={5.4}
              />
            </div>

            <div>
              <div className="flex items-center justify-between mb-4">
                <h2 className="text-xl font-bold">My Products</h2>
                <Button onClick={() => navigate("/seller/products")} data-testid="button-add-product">
                  <Plus className="h-4 w-4 mr-2" />
                  Add New Product
                </Button>
              </div>
              <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 xl:grid-cols-4 gap-6">
                {myProducts.map((product) => (
                  <ProductCard
                    key={product.id}
                    {...product}
                    onToggleWishlist={(id) => console.log('Delete product:', id)}
                  />
                ))}
              </div>
            </div>
          </div>
        </div>
    </DashboardLayout>
  );
}
