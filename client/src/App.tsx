import { Switch, Route } from "wouter";
import * as React from "react";
import { queryClient } from "./lib/queryClient";
import { QueryClientProvider } from "@tanstack/react-query";
import { Toaster } from "@/components/ui/toaster";
import { TooltipProvider } from "@/components/ui/tooltip";
import { AuthProvider } from "@/lib/auth";
import { LanguageProvider } from "@/contexts/LanguageContext";
import { NotificationProvider } from "@/contexts/NotificationContext";
import { useBranding } from "@/hooks/useBranding";
import LogoLoadingScreen from "@/components/LogoLoadingScreen";

import Home from "@/pages/HomeConnected";
import ProductDetails from "@/pages/ProductDetails";
import Cart from "@/pages/Cart";
import AuthPage from "@/pages/AuthPage";
import AdminDashboard from "@/pages/AdminDashboardRouter";
import SellerDashboard from "@/pages/SellerDashboardConnected";
import RiderDashboard from "@/pages/RiderDashboard";
import BuyerDashboard from "@/pages/BuyerDashboard";
import AgentDashboard from "@/pages/AgentDashboard";
import AgentCustomers from "@/pages/AgentCustomers";
import AgentNotifications from "@/pages/AgentNotifications";
import ChatPage from "@/pages/ChatPageConnected";
import OrderTracking from "@/pages/OrderTracking";
import LiveTracking from "@/pages/LiveTracking";
import Checkout from "@/pages/CheckoutConnected";
import PaymentPage from "@/pages/PaymentPage";
import PaymentVerifyPage from "@/pages/PaymentVerifyPage";
import PaymentSuccess from "@/pages/PaymentSuccess";
import PaymentFailure from "@/pages/PaymentFailure";
import Notifications from "@/pages/Notifications";
import Profile from "@/pages/Profile";
import Settings from "@/pages/Settings";
import ChangePassword from "@/pages/ChangePassword";
import AdminSettings from "@/pages/AdminSettings";
import AdminStoreManager from "@/pages/AdminStoreManager";
import AdminBranding from "@/pages/AdminBranding";
import AdminDeliveryTracking from "@/pages/AdminDeliveryTracking";
import AdminDeliveryZones from "@/pages/AdminDeliveryZones";
import AdminBannerManager from "@/pages/AdminBannerManager";
import AdminHeroBanners from "@/pages/AdminHeroBanners";
import AdminPromotions from "@/pages/AdminPromotions";
import AdminCategoryManager from "@/pages/AdminCategoryManager";
import AdminFooterPagesManager from "@/pages/AdminFooterPagesManager";
import AdminPlatformEarnings from "@/pages/AdminPlatformEarnings";
import AdminSellersPayouts from "@/pages/AdminSellersPayouts";
import AdminRiderPayouts from "@/pages/AdminRiderPayouts";
import AdminProducts from "@/pages/AdminProducts";
import AdminOrders from "@/pages/AdminOrders";
import AdminUsers from "@/pages/AdminUsers";
import AdminSellers from "@/pages/AdminSellers";
import AdminRiders from "@/pages/AdminRiders";
import AdminManualRiderAssignment from "@/pages/AdminManualRiderAssignment";
import AdminAgents from "@/pages/AdminAgents";
import AdminMessages from "@/pages/AdminMessages";
import AdminAnalytics from "@/pages/AdminAnalytics";
import AdminMediaLibrary from "@/pages/AdminMediaLibrary";
import AdminNotifications from "@/pages/AdminNotifications";
import SellerMediaLibrary from "@/pages/SellerMediaLibrary";
import SellerProducts from "@/pages/SellerProducts";
import SellerOrders from "@/pages/SellerOrders";
import SellerCoupons from "@/pages/SellerCoupons";
import SellerDeliveries from "@/pages/SellerDeliveries";
import SellerNotifications from "@/pages/SellerNotifications";
import SellerMessages from "@/pages/SellerMessages";
import SellerAnalytics from "@/pages/SellerAnalytics";
import SellerSettings from "@/pages/SellerSettings";
import SellerPaymentSetup from "@/pages/SellerPaymentSetup";
import RiderDeliveries from "@/pages/RiderDeliveries";
import RiderActiveRoute from "@/pages/RiderActiveRoute";
import RiderNotifications from "@/pages/RiderNotifications";
import RiderMessages from "@/pages/RiderMessages";
import RiderEarnings from "@/pages/RiderEarnings";
import RiderSettings from "@/pages/RiderSettings";
import CategoryPage from "@/pages/CategoryPage";
import Wishlist from "@/pages/Wishlist";
import Orders from "@/pages/Orders";
import CustomerSupport from "@/pages/CustomerSupport";
import NotFound from "@/pages/not-found";
import AllProducts from "@/pages/AllProducts";
import BrowseStores from "@/pages/BrowseStores";
import SellerStorePage from "@/pages/SellerStorePage";
import BecomeSellerPage from "@/pages/BecomeSellerPage";
import BecomeRiderPage from "@/pages/BecomeRiderPage";
import AdminStoresList from "@/pages/AdminStoresList";
import AdminUserEdit from "@/pages/AdminUserEdit";
import AdminUserCreate from "@/pages/AdminUserCreate";
import RiderEdit from "@/pages/RiderEdit";
import RiderDetailsPage from "@/pages/RiderDetailsPage";
import SellerDetailsPage from "@/pages/SellerDetailsPage";
import AdminApplications from "@/pages/AdminApplications";
import AdminProductEdit from "@/pages/AdminProductEdit";
import AdminProductCreate from "@/pages/AdminProductCreate";
import SuperAdminPermissions from "@/pages/SuperAdminPermissions";
import DynamicPage from "@/pages/DynamicPage";
import TrackOrder from "@/pages/TrackOrder";
import EReceipt from "@/pages/EReceipt";

function Router() {
  // Apply branding colors from database settings
  useBranding();
  
  return (
    <Switch>
      <Route path="/" component={Home} />
      <Route path="/products" component={AllProducts} />
      <Route path="/stores" component={BrowseStores} />
      <Route path="/sellers/:id" component={SellerStorePage} />
      <Route path="/product/:id" component={ProductDetails} />
      <Route path="/category/:id" component={CategoryPage} />
      <Route path="/cart" component={Cart} />
      <Route path="/auth" component={AuthPage} />
      <Route path="/checkout" component={Checkout} />
      <Route path="/payment/verify" component={PaymentVerifyPage} />
      <Route path="/payment/success" component={PaymentSuccess} />
      <Route path="/payment/failure" component={PaymentFailure} />
      <Route path="/payment/:orderId" component={PaymentPage} />
      <Route path="/notifications" component={Notifications} />
      <Route path="/profile" component={Profile} />
      <Route path="/settings" component={Settings} />
      <Route path="/change-password" component={ChangePassword} />
      <Route path="/wishlist" component={Wishlist} />
      <Route path="/orders/:id/receipt" component={EReceipt} />
      <Route path="/orders/:id" component={TrackOrder} />
      <Route path="/orders" component={Orders} />
      <Route path="/support" component={CustomerSupport} />
      <Route path="/become-seller" component={BecomeSellerPage} />
      <Route path="/become-rider" component={BecomeRiderPage} />
      <Route path="/admin" component={AdminDashboard} />
      <Route path="/admin/stores" component={AdminStoresList} />
      <Route path="/admin/store" component={AdminStoreManager} />
      <Route path="/admin/settings" component={AdminSettings} />
      <Route path="/admin/sellers-payouts" component={AdminSellersPayouts} />
      <Route path="/admin/riders-payouts" component={AdminRiderPayouts} />
      <Route path="/admin/branding" component={AdminBranding} />
      <Route path="/admin/delivery-tracking" component={AdminDeliveryTracking} />
      <Route path="/admin/zones" component={AdminDeliveryZones} />
      <Route path="/admin/delivery-zones" component={AdminDeliveryZones} />
      <Route path="/admin/banners" component={AdminBannerManager} />
      <Route path="/admin/hero-banners" component={AdminHeroBanners} />
      <Route path="/admin/promotions" component={AdminPromotions} />
      <Route path="/admin/categories" component={AdminCategoryManager} />
      <Route path="/admin/footer-pages" component={AdminFooterPagesManager} />
      <Route path="/admin/platform-earnings" component={AdminPlatformEarnings} />
      <Route path="/admin/media-library" component={AdminMediaLibrary} />
      <Route path="/admin/products/create" component={AdminProductCreate} />
      <Route path="/admin/products/:id/edit" component={AdminProductEdit} />
      <Route path="/admin/products" component={AdminProducts} />
      <Route path="/admin/orders" component={AdminOrders} />
      <Route path="/admin/users/create" component={AdminUserCreate} />
      <Route path="/admin/users/:id/edit" component={AdminUserEdit} />
      <Route path="/admin/users" component={AdminUsers} />
      <Route path="/admin/sellers" component={AdminSellers} />
      <Route path="/admin/riders/:id/edit" component={RiderEdit} />
      <Route path="/admin/riders/:id" component={RiderDetailsPage} />
      <Route path="/admin/riders" component={AdminRiders} />
      <Route path="/admin/sellers/:id" component={SellerDetailsPage} />
      <Route path="/admin/manual-rider-assignment" component={AdminManualRiderAssignment} />
      <Route path="/admin/agents" component={AdminAgents} />
      <Route path="/admin/applications" component={AdminApplications} />
      <Route path="/admin/permissions" component={SuperAdminPermissions} />
      <Route path="/admin/messages" component={AdminMessages} />
      <Route path="/admin/live-support" component={CustomerSupport} />
      <Route path="/admin/analytics" component={AdminAnalytics} />
      <Route path="/admin/notifications" component={AdminNotifications} />
      <Route path="/seller/products" component={SellerProducts} />
      <Route path="/seller/media-library" component={SellerMediaLibrary} />
      <Route path="/seller/orders" component={SellerOrders} />
      <Route path="/seller/coupons" component={SellerCoupons} />
      <Route path="/seller/deliveries" component={SellerDeliveries} />
      <Route path="/seller/notifications" component={SellerNotifications} />
      <Route path="/seller/messages" component={SellerMessages} />
      <Route path="/seller/analytics" component={SellerAnalytics} />
      <Route path="/seller/settings" component={SellerSettings} />
      <Route path="/seller/payment-setup" component={SellerPaymentSetup} />
      <Route path="/seller" component={SellerDashboard} />
      <Route path="/rider" component={RiderDashboard} />
      <Route path="/rider/deliveries" component={RiderDeliveries} />
      <Route path="/rider/route" component={RiderActiveRoute} />
      <Route path="/rider/notifications" component={RiderNotifications} />
      <Route path="/rider/messages" component={RiderMessages} />
      <Route path="/rider/earnings" component={RiderEarnings} />
      <Route path="/rider/settings" component={RiderSettings} />
      <Route path="/buyer" component={BuyerDashboard} />
      <Route path="/agent" component={AgentDashboard} />
      <Route path="/agent/tickets" component={CustomerSupport} />
      <Route path="/agent/messages" component={CustomerSupport} />
      <Route path="/agent/customers" component={AgentCustomers} />
      <Route path="/agent/notifications" component={AgentNotifications} />
      <Route path="/agent/settings" component={Settings} />
      <Route path="/chat" component={ChatPage} />
      <Route path="/track" component={OrderTracking} />
      <Route path="/live-tracking" component={LiveTracking} />
      <Route path="/page/:slug" component={DynamicPage} />
      <Route component={NotFound} />
    </Switch>
  );
}

function App() {
  const [isAppReady, setIsAppReady] = React.useState(false);
  const [appInitError, setAppInitError] = React.useState<string | null>(null);

  React.useEffect(() => {
    // Initialize app - preload critical resources and detect backend availability
    const withTimeout = <T,>(p: Promise<T>, ms = 5000) => {
      const timeout = new Promise<T>((_res, rej) => setTimeout(() => rej(new Error(`Request timed out after ${ms}ms`)), ms));
      return Promise.race([p, timeout]);
    };

    const initializeApp = async () => {
      try {
        // Use prefetch to warm the cache and detect errors early, but don't hang forever
        await withTimeout(queryClient.prefetchQuery({ queryKey: ["/api/platform-settings"] }), 5000);
        await withTimeout(queryClient.prefetchQuery({ queryKey: ["/api/categories"] }), 5000);
      } catch (error: any) {
        console.warn("Preload completed with errors:", error?.message || error);
        // Fire a lightweight client log to the server (development-only). Don't block the UI on this.
        (async () => {
          try {
            await fetch('/api/test/client-log', {
              method: 'POST',
              headers: { 'Content-Type': 'application/json' },
              credentials: 'include',
              body: JSON.stringify({
                type: 'init_timeout',
                message: error?.message || String(error),
                url: window.location.href,
                userAgent: navigator.userAgent,
                timestamp: new Date().toISOString(),
              }),
            });
          } catch (e) {
            // swallow network/logging errors - we don't want to worsen user experience
            console.debug('Client log failed to send:', (e as any)?.message || (e as any));
          }
        })();

        // Surface a helpful message if the API returned HTML, timed out, or was unreachable
        setAppInitError(error?.message || String(error));
      } finally {
        setIsAppReady(true);
      }
    };

    initializeApp();
  }, []);

  // If we detected an initialization error (e.g., backend not reachable), show a helpful full-screen message
  if (appInitError) {
    return (
      <div className="min-h-screen flex items-center justify-center bg-background px-4">
        <div className="max-w-2xl text-center">
          <h1 className="text-2xl font-bold mb-4">Application failed to initialize</h1>
          <p className="text-muted-foreground mb-4">{appInitError}</p>
          <p className="mb-4">Common fixes:</p>
          <ul className="text-left list-disc list-inside text-sm text-muted-foreground">
            <li>Ensure the backend is running locally: <code>SESSION_SECRET=testsecret npx tsx server/index.ts</code> (http://localhost:5000)</li>
            <li>If your frontend is served from another origin (preview), set <code>VITE_API_URL</code> to your backend: <code>VITE_API_URL=http://localhost:5000 npm run dev:frontend</code></li>
            <li>Check the browser devtools console for the full response details.</li>
          </ul>
        </div>
      </div>
    );
  }

  return (
    <QueryClientProvider client={queryClient}>
      <LanguageProvider>
        <AuthProvider>
          <NotificationProvider>
            <TooltipProvider>
              <LogoLoadingScreen 
                isLoading={!isAppReady} 
                minDisplayTime={2000}
                message="Preparing your experience"
              />
              <Toaster />
              <Router />
            </TooltipProvider>
          </NotificationProvider>
        </AuthProvider>
      </LanguageProvider>
    </QueryClientProvider>
  );
}

export default App;
