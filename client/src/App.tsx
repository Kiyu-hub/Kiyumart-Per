import { Switch, Route, useLocation } from "wouter";
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
import ResetPassword from "@/pages/ResetPassword";
import AdminDashboard from "@/pages/AdminDashboardRouter";
import SellerDashboard from "@/pages/SellerDashboardConnected";
import RiderDashboard from "@/pages/RiderDashboard";
import BuyerDashboard from "@/pages/BuyerDashboard";
import PickupAgentDashboard from "@/pages/PickupAgentDashboard";
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
import AdminPickupStations from "@/pages/AdminPickupStations";
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
import AdminOrderActionPage from "@/pages/AdminOrderActionPage";
import AdminUsers from "@/pages/AdminUsers";
import AdminSellers from "@/pages/AdminSellers";
import AdminRiders from "@/pages/AdminRiders";
import AdminManualRiderAssignment from "@/pages/AdminManualRiderAssignment";
import AdminAgents from "@/pages/AdminAgents";
import AdminMessages from "@/pages/AdminMessages";
import AdminAnalytics from "@/pages/AdminAnalytics";
import AdminSystemActivities from "@/pages/AdminSystemActivities";
import AdminMediaLibrary from "@/pages/AdminMediaLibrary";
import AdminNotifications from "@/pages/AdminNotifications";
import SellerMediaLibrary from "@/pages/SellerMediaLibrary";
import SellerProducts from "@/pages/SellerProducts";
import SellerCategories from "@/pages/SellerCategories";
import SellerOrders from "@/pages/SellerOrders";
import SellerPromotions from "@/pages/SellerPromotions";
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
import BuyerDetailsPage from "@/pages/BuyerDetailsPage";
import StoreDetailsPage from "@/pages/StoreDetailsPage";
import AdminApplications from "@/pages/AdminApplications";
import AdminProductEdit from "@/pages/AdminProductEdit";
import AdminProductCreate from "@/pages/AdminProductCreate";
import SuperAdminPermissions from "@/pages/SuperAdminPermissions";
import DynamicPage from "@/pages/DynamicPage";
import TrackOrder from "@/pages/TrackOrder";
import EReceipt from "@/pages/EReceipt";
import { Loader2 } from "lucide-react";
import { usePlatformSettings } from "@/hooks/usePlatformSettings";

function RouteGateLoader() {
  return (
    <div className="min-h-screen bg-background flex items-center justify-center">
      <Loader2 className="h-8 w-8 animate-spin text-primary" />
    </div>
  );
}

function withExternalRiderRouteGuard(Component: React.ComponentType) {
  return function GuardedExternalRiderRoute() {
    const [, navigate] = useLocation();
    const { isExternalRiderSystemEnabled, hasResolvedSettings } = usePlatformSettings();

    React.useEffect(() => {
      if (hasResolvedSettings && isExternalRiderSystemEnabled) {
        navigate("/");
      }
    }, [hasResolvedSettings, isExternalRiderSystemEnabled, navigate]);

    if (!hasResolvedSettings || isExternalRiderSystemEnabled) {
      return <RouteGateLoader />;
    }

    return <Component />;
  };
}

function withAdminExternalRiderFeatureGuard(Component: React.ComponentType) {
  return function GuardedAdminExternalRiderFeatureRoute() {
    const [, navigate] = useLocation();
    const { isExternalRiderSystemEnabled, hasResolvedSettings } = usePlatformSettings();

    React.useEffect(() => {
      if (hasResolvedSettings && isExternalRiderSystemEnabled) {
        navigate("/admin");
      }
    }, [hasResolvedSettings, isExternalRiderSystemEnabled, navigate]);

    if (!hasResolvedSettings || isExternalRiderSystemEnabled) {
      return <RouteGateLoader />;
    }

    return <Component />;
  };
}

function withSellerFeatureRouteGuard(
  Component: React.ComponentType,
  options: { requireMultiVendor?: boolean; requireInternalRider?: boolean },
) {
  return function GuardedSellerFeatureRoute() {
    const [, navigate] = useLocation();
    const { isExternalRiderSystemEnabled, hasResolvedSettings, isMultiVendor } = usePlatformSettings();
    const { requireMultiVendor = false, requireInternalRider = false } = options;

    const blockedByStoreMode = requireMultiVendor && !isMultiVendor;
    const blockedByRiderMode = requireInternalRider && isExternalRiderSystemEnabled;
    const shouldBlock = hasResolvedSettings && (blockedByStoreMode || blockedByRiderMode);

    React.useEffect(() => {
      if (shouldBlock) {
        navigate("/seller");
      }
    }, [navigate, shouldBlock]);

    if (!hasResolvedSettings || shouldBlock) {
      return <RouteGateLoader />;
    }

    return <Component />;
  };
}

const GuardedRiderDashboard = withExternalRiderRouteGuard(RiderDashboard);
const GuardedRiderDeliveries = withExternalRiderRouteGuard(RiderDeliveries);
const GuardedRiderActiveRoute = withExternalRiderRouteGuard(RiderActiveRoute);
const GuardedRiderNotifications = withExternalRiderRouteGuard(RiderNotifications);
const GuardedRiderMessages = withExternalRiderRouteGuard(RiderMessages);
const GuardedRiderEarnings = withExternalRiderRouteGuard(RiderEarnings);
const GuardedRiderSettings = withExternalRiderRouteGuard(RiderSettings);
const GuardedBecomeRiderPage = withExternalRiderRouteGuard(BecomeRiderPage);
const GuardedAdminRiderPayouts = withAdminExternalRiderFeatureGuard(AdminRiderPayouts);
const GuardedAdminRiders = withAdminExternalRiderFeatureGuard(AdminRiders);
const GuardedRiderEdit = withAdminExternalRiderFeatureGuard(RiderEdit);
const GuardedRiderDetailsPage = withAdminExternalRiderFeatureGuard(RiderDetailsPage);
const GuardedAdminManualRiderAssignment = withAdminExternalRiderFeatureGuard(AdminManualRiderAssignment);
const GuardedAdminDeliveryTracking = withAdminExternalRiderFeatureGuard(AdminDeliveryTracking);
const GuardedAdminDeliveryZones = withAdminExternalRiderFeatureGuard(AdminDeliveryZones);
const GuardedSellerPromotions = withSellerFeatureRouteGuard(SellerPromotions, { requireMultiVendor: true });
const GuardedSellerDeliveries = withSellerFeatureRouteGuard(SellerDeliveries, { requireInternalRider: true });

function RouteScrollManager() {
  const [location] = useLocation();

  React.useEffect(() => {
    const [pathPart, hashPart] = location.split("#");
    const hasHash = Boolean(hashPart && hashPart.trim().length > 0);

    // Always reset top on route/query changes for both window and dashboard scroll containers.
    window.scrollTo({ top: 0, left: 0, behavior: "auto" });
    document
      .querySelectorAll<HTMLElement>("[data-route-scroll-container]")
      .forEach((el) => el.scrollTo({ top: 0, left: 0, behavior: "auto" }));

    // If a hash target exists, scroll to that specific section after render.
    if (hasHash) {
      const targetId = decodeURIComponent(hashPart!);
      requestAnimationFrame(() => {
        const target =
          document.getElementById(targetId) ||
          document.querySelector<HTMLElement>(`[data-scroll-target="${targetId}"]`);
        if (target) {
          target.scrollIntoView({ behavior: "smooth", block: "start" });
        }
      });
    }
  }, [location]);

  return null;
}

function Router() {
  // Apply branding colors from database settings
  useBranding();
  
  return (
    <>
      <RouteScrollManager />
      <Switch>
        <Route path="/" component={Home} />
      <Route path="/products" component={AllProducts} />
      <Route path="/stores" component={BrowseStores} />
      <Route path="/sellers/:id" component={SellerStorePage} />
      <Route path="/product/:id" component={ProductDetails} />
      <Route path="/category/:id" component={CategoryPage} />
      <Route path="/cart" component={Cart} />
      <Route path="/auth" component={AuthPage} />
      <Route path="/reset-password" component={ResetPassword} />
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
      <Route path="/become-rider" component={GuardedBecomeRiderPage} />
      <Route path="/admin" component={AdminDashboard} />
      <Route path="/admin/stores" component={AdminStoresList} />
      <Route path="/admin/stores/:id" component={StoreDetailsPage} />
      <Route path="/admin/store" component={AdminStoreManager} />
      <Route path="/admin/settings" component={AdminSettings} />
      <Route path="/admin/sellers-payouts" component={AdminSellersPayouts} />
      <Route path="/admin/riders-payouts" component={GuardedAdminRiderPayouts} />
      <Route path="/admin/branding" component={AdminBranding} />
      <Route path="/admin/delivery-tracking" component={GuardedAdminDeliveryTracking} />
      <Route path="/admin/zones" component={GuardedAdminDeliveryZones} />
      <Route path="/admin/delivery-zones" component={GuardedAdminDeliveryZones} />
      <Route path="/admin/pickup-stations" component={AdminPickupStations} />
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
      <Route path="/admin/orders/:id/action" component={AdminOrderActionPage} />
      <Route path="/admin/orders" component={AdminOrders} />
      <Route path="/admin/users/create" component={AdminUserCreate} />
      <Route path="/admin/users/:id/edit" component={AdminUserEdit} />
      <Route path="/admin/users/:id" component={BuyerDetailsPage} />
      <Route path="/admin/users" component={AdminUsers} />
      <Route path="/admin/sellers" component={AdminSellers} />
      <Route path="/admin/riders/:id/edit" component={GuardedRiderEdit} />
      <Route path="/admin/riders/:id" component={GuardedRiderDetailsPage} />
      <Route path="/admin/riders" component={GuardedAdminRiders} />
      <Route path="/admin/sellers/:id" component={SellerDetailsPage} />
      <Route path="/admin/manual-rider-assignment" component={GuardedAdminManualRiderAssignment} />
      <Route path="/admin/agents" component={AdminAgents} />
      <Route path="/admin/applications" component={AdminApplications} />
      <Route path="/admin/permissions" component={SuperAdminPermissions} />
       <Route path="/admin/messages" component={AdminMessages} />
       <Route path="/admin/live-support" component={CustomerSupport} />
       <Route path="/admin/system-activities" component={AdminSystemActivities} />
       <Route path="/admin/analytics" component={AdminAnalytics} />
      <Route path="/admin/notifications" component={AdminNotifications} />
      <Route path="/seller/products" component={SellerProducts} />
      <Route path="/seller/categories" component={SellerCategories} />
      <Route path="/seller/media-library" component={SellerMediaLibrary} />
      <Route path="/seller/personal-orders/:id" component={SellerOrders} />
      <Route path="/seller/orders/:id" component={SellerOrders} />
      <Route path="/seller/personal-orders" component={SellerOrders} />
      <Route path="/seller/orders" component={SellerOrders} />
      <Route path="/seller/coupons" component={SellerDashboard} />
      <Route path="/seller/promotions" component={GuardedSellerPromotions} />
      <Route path="/seller/deliveries" component={GuardedSellerDeliveries} />
      <Route path="/seller/notifications" component={SellerNotifications} />
      <Route path="/seller/messages" component={SellerMessages} />
      <Route path="/seller/analytics" component={SellerAnalytics} />
      <Route path="/seller/platform-earnings" component={SellerAnalytics} />
      <Route path="/seller/payout" component={SellerPaymentSetup} />
      <Route path="/seller/payouts" component={SellerPaymentSetup} />
      <Route path="/seller/settings" component={SellerSettings} />
      <Route path="/seller/payment-setup" component={SellerPaymentSetup} />
      <Route path="/seller" component={SellerDashboard} />
      <Route path="/rider" component={GuardedRiderDashboard} />
      <Route path="/rider/deliveries" component={GuardedRiderDeliveries} />
      <Route path="/rider/route" component={GuardedRiderActiveRoute} />
      <Route path="/rider/notifications" component={GuardedRiderNotifications} />
      <Route path="/rider/messages" component={GuardedRiderMessages} />
      <Route path="/rider/earnings" component={GuardedRiderEarnings} />
      <Route path="/rider/settings" component={GuardedRiderSettings} />
      <Route path="/buyer" component={BuyerDashboard} />
      <Route path="/pickup-agent" component={PickupAgentDashboard} />
      <Route path="/pickup-agent/support" component={CustomerSupport} />
      <Route path="/pickup-agent/notifications" component={Notifications} />
      <Route path="/pickup-agent/settings" component={Settings} />
      <Route path="/agent" component={AgentDashboard} />
      <Route path="/agent/tickets" component={CustomerSupport} />
      <Route path="/agent/messages" component={CustomerSupport} />
      <Route path="/agent/customers" component={AgentCustomers} />
      <Route path="/agent/notifications" component={AgentNotifications} />
      <Route path="/agent/settings" component={Settings} />
      <Route path="/chat" component={ChatPage} />
      <Route path="/track/:id" component={OrderTracking} />
      <Route path="/track" component={OrderTracking} />
      <Route path="/live-tracking" component={LiveTracking} />
      <Route path="/page/:slug" component={DynamicPage} />
        <Route component={NotFound} />
      </Switch>
    </>
  );
}

function App() {
  const [isAppReady, setIsAppReady] = React.useState(false);
  const backendRecoveredRef = React.useRef(true);

  React.useEffect(() => {
    // Initialize app - preload critical resources and detect backend availability
    const withTimeout = <T,>(p: Promise<T>, ms = 5000) => {
      const timeout = new Promise<T>((_res, rej) => setTimeout(() => rej(new Error(`Request timed out after ${ms}ms`)), ms));
      return Promise.race([p, timeout]);
    };

    const initializeApp = async () => {
      try {
        // Warm the cache without blocking the whole application if a request is slow.
        await Promise.allSettled([
          withTimeout(queryClient.prefetchQuery({ queryKey: ["/api/platform-settings"] }), 5000),
          withTimeout(queryClient.prefetchQuery({ queryKey: ["/api/public/platform-settings"] }), 5000),
          withTimeout(queryClient.prefetchQuery({ queryKey: ["/api/categories"] }), 5000),
        ]);
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
      } finally {
        setIsAppReady(true);
      }
    };

    initializeApp();
  }, []);

  React.useEffect(() => {
    let isMounted = true;

    const recoverPlatformData = async () => {
      await Promise.allSettled([
        queryClient.invalidateQueries(),
        queryClient.refetchQueries({ type: "active" }),
      ]);
    };

    const checkBackendHealth = async () => {
      try {
        const response = await fetch("/api/health", {
          credentials: "include",
          cache: "no-store",
        });
        const isHealthy = response.ok;

        if (isHealthy && !backendRecoveredRef.current && isMounted) {
          backendRecoveredRef.current = true;
          await recoverPlatformData();
        } else if (!isHealthy) {
          backendRecoveredRef.current = false;
        }
      } catch {
        backendRecoveredRef.current = false;
      }
    };

    checkBackendHealth();
    const intervalId = window.setInterval(checkBackendHealth, 5000);
    window.addEventListener("focus", checkBackendHealth);

    return () => {
      isMounted = false;
      window.clearInterval(intervalId);
      window.removeEventListener("focus", checkBackendHealth);
    };
  }, []);

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
