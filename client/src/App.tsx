import { Switch, Route, useLocation } from "wouter";
import * as React from "react";
import { queryClient } from "./lib/queryClient";
import { QueryClientProvider } from "@tanstack/react-query";
import { Toaster } from "@/components/ui/toaster";
import { TooltipProvider } from "@/components/ui/tooltip";
import { AuthProvider } from "@/lib/auth";
import { LanguageProvider } from "@/contexts/LanguageContext";
import { NotificationProvider } from "@/contexts/NotificationContext";
import { JitsiCallProvider } from "@/contexts/JitsiCallContext";
import { useBranding } from "@/hooks/useBranding";
import LogoLoadingScreen from "@/components/LogoLoadingScreen";

// Eagerly loaded — needed on first paint or used by route guards
import Home from "@/pages/HomeConnected";
import MultiVendorHome from "@/pages/MultiVendorHome";
import AuthPage from "@/pages/AuthPage";
import MaintenancePage from "@/pages/MaintenancePage";
import NotFound from "@/pages/not-found";

// Lazy-loaded — split into separate chunks, loaded on demand
const SocialProductPage = React.lazy(() => import("@/pages/SocialProductPage"));
const CartLinkCheckout = React.lazy(() => import("@/pages/CartLinkCheckout"));
const ProductDetails = React.lazy(() => import("@/pages/ProductDetails"));
const Cart = React.lazy(() => import("@/pages/Cart"));
const ResetPassword = React.lazy(() => import("@/pages/ResetPassword"));
const AdminDashboardConnected = React.lazy(() => import("@/pages/AdminDashboardConnected"));
const SellerDashboard = React.lazy(() => import("@/pages/SellerDashboardConnected"));
const RiderDashboard = React.lazy(() => import("@/pages/RiderDashboard"));
const BuyerDashboard = React.lazy(() => import("@/pages/BuyerDashboard"));
const BuyerOrders = React.lazy(() => import("@/pages/buyer/BuyerOrders"));
const PickupAgentDashboard = React.lazy(() => import("@/pages/PickupAgentDashboard"));
const AgentDashboard = React.lazy(() => import("@/pages/AgentDashboard"));
const AgentTickets = React.lazy(() => import("@/pages/AgentTickets"));
const AgentCustomers = React.lazy(() => import("@/pages/AgentCustomers"));
const AgentDirectMessages = React.lazy(() => import("@/pages/AgentDirectMessages"));
const AgentNotifications = React.lazy(() => import("@/pages/AgentNotifications"));
const ChatPage = React.lazy(() => import("@/pages/ChatPageConnected"));
const OrderTracking = React.lazy(() => import("@/pages/OrderTracking"));
const LiveTracking = React.lazy(() => import("@/pages/LiveTracking"));
const Checkout = React.lazy(() => import("@/pages/CheckoutConnected"));
const PaymentPage = React.lazy(() => import("@/pages/PaymentPage"));
const PaymentVerifyPage = React.lazy(() => import("@/pages/PaymentVerifyPage"));
const PaymentSuccess = React.lazy(() => import("@/pages/PaymentSuccess"));
const PaymentFailure = React.lazy(() => import("@/pages/PaymentFailure"));
const Notifications = React.lazy(() => import("@/pages/Notifications"));
const Profile = React.lazy(() => import("@/pages/Profile"));
const Settings = React.lazy(() => import("@/pages/Settings"));
const ChangePassword = React.lazy(() => import("@/pages/ChangePassword"));
const AdminSettings = React.lazy(() => import("@/pages/AdminSettings"));
const AdminStoreManager = React.lazy(() => import("@/pages/AdminStoreManager"));
const AdminBranding = React.lazy(() => import("@/pages/AdminBranding"));
const AdminDeliveryTracking = React.lazy(() => import("@/pages/AdminDeliveryTracking"));
const AdminDeliveryZones = React.lazy(() => import("@/pages/AdminDeliveryZones"));
const AdminPickupStations = React.lazy(() => import("@/pages/AdminPickupStations"));
const AdminBannerManager = React.lazy(() => import("@/pages/AdminBannerManager"));
const AdminHeroBanners = React.lazy(() => import("@/pages/AdminHeroBanners"));
const AdminPromotions = React.lazy(() => import("@/pages/AdminPromotions"));
const AdminCategoryManager = React.lazy(() => import("@/pages/AdminCategoryManager"));
const AdminFooterPagesManager = React.lazy(() => import("@/pages/AdminFooterPagesManager"));
const AdminPlatformEarnings = React.lazy(() => import("@/pages/AdminPlatformEarnings"));
const AdminSellersPayouts = React.lazy(() => import("@/pages/AdminSellersPayouts"));
const AdminRiderPayouts = React.lazy(() => import("@/pages/AdminRiderPayouts"));
const AdminProducts = React.lazy(() => import("@/pages/AdminProducts"));
const AdminOrders = React.lazy(() => import("@/pages/AdminOrders"));
const AdminOrderActionPage = React.lazy(() => import("@/pages/AdminOrderActionPage"));
const AdminUsers = React.lazy(() => import("@/pages/AdminUsers"));
const AdminSellers = React.lazy(() => import("@/pages/AdminSellers"));
const AdminRiders = React.lazy(() => import("@/pages/AdminRiders"));
const AdminManualRiderAssignment = React.lazy(() => import("@/pages/AdminManualRiderAssignment"));
const AdminAgents = React.lazy(() => import("@/pages/AdminAgents"));
const AdminMessages = React.lazy(() => import("@/pages/AdminMessages"));
const AdminLiveSupportDashboard = React.lazy(() => import("@/pages/AdminLiveSupportDashboard"));
const AdminAnalytics = React.lazy(() => import("@/pages/AdminAnalytics"));
const AdminSystemActivities = React.lazy(() => import("@/pages/AdminSystemActivities"));
const AdminMediaLibrary = React.lazy(() => import("@/pages/AdminMediaLibrary"));
const AdminNotifications = React.lazy(() => import("@/pages/AdminNotifications"));
const SellerMediaLibrary = React.lazy(() => import("@/pages/SellerMediaLibrary"));
const SellerProducts = React.lazy(() => import("@/pages/SellerProducts"));
const SellerCategories = React.lazy(() => import("@/pages/SellerCategories"));
const SellerOrders = React.lazy(() => import("@/pages/SellerOrders"));
const SellerPromotions = React.lazy(() => import("@/pages/SellerPromotions"));
const SellerDeliveries = React.lazy(() => import("@/pages/SellerDeliveries"));
const SellerNotifications = React.lazy(() => import("@/pages/SellerNotifications"));
const SellerMessages = React.lazy(() => import("@/pages/SellerMessages"));
const SellerAnalytics = React.lazy(() => import("@/pages/SellerAnalytics"));
const SellerSettings = React.lazy(() => import("@/pages/SellerSettings"));
const SellerPaymentSetup = React.lazy(() => import("@/pages/SellerPaymentSetup"));
const RiderDeliveries = React.lazy(() => import("@/pages/RiderDeliveries"));
const RiderActiveRoute = React.lazy(() => import("@/pages/RiderActiveRoute"));
const RiderNotifications = React.lazy(() => import("@/pages/RiderNotifications"));
const RiderMessages = React.lazy(() => import("@/pages/RiderMessages"));
const RiderEarnings = React.lazy(() => import("@/pages/RiderEarnings"));
const RiderSettings = React.lazy(() => import("@/pages/RiderSettings"));
const CategoryPage = React.lazy(() => import("@/pages/CategoryPage"));
const Wishlist = React.lazy(() => import("@/pages/Wishlist"));
const Orders = React.lazy(() => import("@/pages/Orders"));
const CustomerSupport = React.lazy(() => import("@/pages/CustomerSupport"));
const AllProducts = React.lazy(() => import("@/pages/AllProducts"));
const BrowseStores = React.lazy(() => import("@/pages/BrowseStores"));
const SellerStorePage = React.lazy(() => import("@/pages/SellerStorePage"));
const BecomeSellerPage = React.lazy(() => import("@/pages/BecomeSellerPage"));
const BecomeRiderPage = React.lazy(() => import("@/pages/BecomeRiderPage"));
const AdminStoresList = React.lazy(() => import("@/pages/AdminStoresList"));
const AdminUserEdit = React.lazy(() => import("@/pages/AdminUserEdit"));
const AdminUserCreate = React.lazy(() => import("@/pages/AdminUserCreate"));
const RiderEdit = React.lazy(() => import("@/pages/RiderEdit"));
const RiderDetailsPage = React.lazy(() => import("@/pages/RiderDetailsPage"));
const SellerDetailsPage = React.lazy(() => import("@/pages/SellerDetailsPage"));
const BuyerDetailsPage = React.lazy(() => import("@/pages/BuyerDetailsPage"));
const StoreDetailsPage = React.lazy(() => import("@/pages/StoreDetailsPage"));
const AdminApplications = React.lazy(() => import("@/pages/AdminApplications"));
const AdminProductEdit = React.lazy(() => import("@/pages/AdminProductEdit"));
const AdminProductCreate = React.lazy(() => import("@/pages/AdminProductCreate"));
const SuperAdminPermissions = React.lazy(() => import("@/pages/SuperAdminPermissions"));
const DynamicPage = React.lazy(() => import("@/pages/DynamicPage"));
const SearchPage = React.lazy(() => import("@/pages/SearchPage"));
const BuyerOrderTracking = React.lazy(() => import("@/pages/BuyerOrderTracking"));
const EReceipt = React.lazy(() => import("@/pages/EReceipt"));
const SellerRatings = React.lazy(() => import("@/pages/SellerRatings"));
const PickupAgentEarnings = React.lazy(() => import("@/pages/PickupAgentEarnings"));
const PickupAgentShift = React.lazy(() => import("@/pages/PickupAgentShift"));
const PickupAgentVerifyPage = React.lazy(() => import("@/pages/PickupAgentVerifyPage"));
const AdminPickupVerifyPage = React.lazy(() => import("@/pages/AdminPickupVerifyPage"));
const AdminPlatformHealth = React.lazy(() => import("@/pages/AdminPlatformHealth"));
const AdminSentryIssues = React.lazy(() => import("@/pages/AdminSentryIssues"));
const AdminPlatformAnalytics = React.lazy(() => import("@/pages/AdminPlatformAnalytics"));
const ReferralPage = React.lazy(() => import("@/pages/ReferralPage"));
const GroupChatPage = React.lazy(() => import("@/pages/GroupChatPage"));
const AdminReportedCases = React.lazy(() => import("@/pages/AdminReportedCases"));
const AdminSuggestions = React.lazy(() => import("@/pages/AdminSuggestions"));
const SuggestionsPage = React.lazy(() => import("@/pages/SuggestionsPage"));
const ReportCasePage = React.lazy(() => import("@/pages/ReportCasePage"));
import { Loader2 } from "lucide-react";
import { usePlatformSettings } from "@/hooks/usePlatformSettings";
import { useQuery } from "@tanstack/react-query";
import { useAuth } from "@/lib/auth";
import PWAInstallPrompt from "@/components/PWAInstallPrompt";
import MobileStorefrontNav from "@/components/MobileStorefrontNav";

function RouteGateLoader() {
  return (
    <div className="min-h-screen bg-background flex items-center justify-center">
      <Loader2 className="h-8 w-8 animate-spin text-primary" />
    </div>
  );
}

// Injects GA4 and Microsoft Clarity scripts from DB settings — no hardcoded IDs needed
function AnalyticsInjector() {
  const { data } = useQuery<{ googleAnalyticsId: string | null; microsoftClarityId: string | null }>({
    queryKey: ["/api/public/analytics-config"],
    staleTime: 5 * 60 * 1000,
    refetchOnWindowFocus: false,
  });

  React.useEffect(() => {
    const gaId = data?.googleAnalyticsId;
    if (gaId && !document.getElementById("ga4-script")) {
      const s1 = document.createElement("script");
      s1.id = "ga4-script";
      s1.async = true;
      s1.src = `https://www.googletagmanager.com/gtag/js?id=${gaId}`;
      document.head.appendChild(s1);
      const s2 = document.createElement("script");
      s2.id = "ga4-inline";
      s2.textContent = `window.dataLayer=window.dataLayer||[];function gtag(){dataLayer.push(arguments);}gtag('js',new Date());gtag('config','${gaId}');`;
      document.head.appendChild(s2);
    }
  }, [data?.googleAnalyticsId]);

  React.useEffect(() => {
    const clarityId = data?.microsoftClarityId;
    if (clarityId && !document.getElementById("clarity-script")) {
      const s = document.createElement("script");
      s.id = "clarity-script";
      s.textContent = `(function(c,l,a,r,i,t,y){c[a]=c[a]||function(){(c[a].q=c[a].q||[]).push(arguments)};t=l.createElement(r);t.async=1;t.src="https://www.clarity.ms/tag/"+i;y=l.getElementsByTagName(r)[0];y.parentNode.insertBefore(t,y)})(window,document,"clarity","script","${clarityId}");`;
      document.head.appendChild(s);
    }
  }, [data?.microsoftClarityId]);

  return null;
}

function FaviconInjector() {
  const { favicon } = usePlatformSettings();

  React.useEffect(() => {
    if (!favicon) return;

    // Browser tab icon
    document.querySelectorAll<HTMLLinkElement>("link[rel~='icon'], link[rel='shortcut icon']").forEach((el) => {
      el.href = favicon;
    });

    // iOS / Android home screen icon (apple-touch-icon)
    document.querySelectorAll<HTMLLinkElement>("link[rel~='apple-touch-icon']").forEach((el) => {
      el.href = favicon;
    });
  }, [favicon]);

  return null;
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

function MaintenanceGuard({ children }: { children: React.ReactNode }) {
  const { user } = useAuth();
  const isAdmin = user?.role === "admin" || user?.role === "super_admin";
  const [forceMaintenance, setForceMaintenance] = React.useState(false);

  // Listen for instant maintenance signal from any API call that receives a 503
  React.useEffect(() => {
    const handler = () => setForceMaintenance(true);
    window.addEventListener("kiyumart:maintenance", handler);
    return () => window.removeEventListener("kiyumart:maintenance", handler);
  }, []);

  const { data: maintenance, refetch } = useQuery<{ isMaintenanceMode: boolean; isAutoMaintenance: boolean; maintenanceMessage: string | null; maintenanceScheduledEnd: string | null }>({
    queryKey: ["/api/maintenance/status"],
    queryFn: async () => {
      const res = await fetch("/api/maintenance/status", { cache: "no-store" });
      if (!res.ok) return { isMaintenanceMode: false, isAutoMaintenance: false, maintenanceMessage: null, maintenanceScheduledEnd: null };
      return res.json();
    },
    refetchInterval: 10000,
    staleTime: 8000,
    retry: false,
  });

  // When the event fires, immediately refetch to get full maintenance status
  React.useEffect(() => {
    if (forceMaintenance) refetch();
  }, [forceMaintenance, refetch]);

  // Clear force flag once server confirms maintenance is off
  React.useEffect(() => {
    if (maintenance && !maintenance.isMaintenanceMode) setForceMaintenance(false);
  }, [maintenance]);

  // Force a full reload when maintenance mode lifts so users see fresh content
  const prevMaintenanceRef = React.useRef<boolean | undefined>(undefined);
  React.useEffect(() => {
    if (prevMaintenanceRef.current === true && maintenance?.isMaintenanceMode === false) {
      window.location.reload();
    }
    prevMaintenanceRef.current = maintenance?.isMaintenanceMode;
  }, [maintenance?.isMaintenanceMode]);

  // While the first status check is in-flight, show nothing — the LogoLoadingScreen
  // is already covering the screen during app init, so there's no visible blank gap.
  // Once the prefetch in App.initializeApp resolves, `maintenance` will be defined
  // immediately and this guard renders in one pass without any flash.
  if (!maintenance && !forceMaintenance) return null;

  if ((forceMaintenance || maintenance?.isMaintenanceMode) && !isAdmin) {
    return <MaintenancePage />;
  }

  return <>{children}</>;
}

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

function HomeRouter() {
  const { isMultiVendor } = usePlatformSettings();
  return isMultiVendor ? <MultiVendorHome /> : <Home />;
}

function Router() {
  // Apply branding colors from database settings
  useBranding();
  
  return (
    <>
      <RouteScrollManager />
      <React.Suspense fallback={<RouteGateLoader />}>
      <Switch>
        <Route path="/" component={HomeRouter} />
      <Route path="/search" component={SearchPage} />
      <Route path="/products" component={AllProducts} />
      <Route path="/stores" component={BrowseStores} />
      <Route path="/sellers/:id" component={SellerStorePage} />
      <Route path="/product/:id" component={ProductDetails} />
      <Route path="/p/:slug" component={SocialProductPage} />
      <Route path="/cart/:token" component={CartLinkCheckout} />
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
      <Route path="/orders/:id" component={OrderTracking} />
      <Route path="/orders" component={Orders} />
      <Route path="/support" component={CustomerSupport} />
      <Route path="/become-seller" component={BecomeSellerPage} />
      <Route path="/become-rider" component={GuardedBecomeRiderPage} />
      <Route path="/admin" component={AdminDashboardConnected} />
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
      <Route path="/admin/pickup-verify" component={AdminPickupVerifyPage} />
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
       <Route path="/admin/live-support" component={AdminLiveSupportDashboard} />
       <Route path="/admin/system-activities" component={AdminSystemActivities} />
       <Route path="/admin/analytics" component={AdminAnalytics} />
       <Route path="/admin/platform-health" component={AdminPlatformHealth} />
       <Route path="/admin/sentry" component={AdminSentryIssues} />
       <Route path="/admin/platform-analytics" component={AdminPlatformAnalytics} />
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
      <Route path="/seller/reviews" component={SellerRatings} />
      <Route path="/seller" component={SellerDashboard} />
      <Route path="/rider" component={GuardedRiderDashboard} />
      <Route path="/rider/deliveries" component={GuardedRiderDeliveries} />
      <Route path="/rider/route" component={GuardedRiderActiveRoute} />
      <Route path="/rider/notifications" component={GuardedRiderNotifications} />
      <Route path="/rider/messages" component={GuardedRiderMessages} />
      <Route path="/rider/earnings" component={GuardedRiderEarnings} />
      <Route path="/rider/settings" component={GuardedRiderSettings} />
      <Route path="/buyer" component={BuyerDashboard} />
      <Route path="/buyer/orders" component={BuyerOrders} />
      <Route path="/buyer/tracking/:orderId" component={BuyerOrderTracking} />
      <Route path="/referral" component={ReferralPage} />
      <Route path="/staff-chat" component={() => <GroupChatPage group="staff" />} />
      <Route path="/seller-chat" component={() => <GroupChatPage group="sellers" />} />
      <Route path="/rider-chat" component={() => <GroupChatPage group="riders" />} />
      <Route path="/reported-cases" component={AdminReportedCases} />
      <Route path="/admin/suggestions" component={AdminSuggestions} />
      <Route path="/suggestions" component={SuggestionsPage} />
      <Route path="/report-case" component={ReportCasePage} />
      <Route path="/pickup-agent" component={PickupAgentDashboard} />
      <Route path="/pickup-agent/verify" component={PickupAgentVerifyPage} />
      <Route path="/pickup-agent/earnings" component={PickupAgentEarnings} />
      <Route path="/pickup-agent/shift" component={PickupAgentShift} />
      <Route path="/pickup-agent/support" component={CustomerSupport} />
      <Route path="/pickup-agent/notifications" component={Notifications} />
      <Route path="/pickup-agent/settings" component={Settings} />
      <Route path="/agent" component={AgentDashboard} />
      <Route path="/agent/tickets" component={AgentTickets} />
      <Route path="/agent/messages" component={CustomerSupport} />
      <Route path="/agent/direct-messages" component={AgentDirectMessages} />
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
      </React.Suspense>
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
        // Maintenance status is fetched first so MaintenanceGuard has data the moment
        // the loading screen lifts — prevents any flash of normal app during maintenance.
        await Promise.allSettled([
          withTimeout(queryClient.prefetchQuery({
            queryKey: ["/api/maintenance/status"],
            queryFn: async () => {
              const res = await fetch("/api/maintenance/status", { cache: "no-store" });
              if (!res.ok) return { isMaintenanceMode: false, isAutoMaintenance: false, maintenanceMessage: null, maintenanceScheduledEnd: null };
              return res.json();
            },
          }), 3000),
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

    const checkBackendHealth = async () => {
      try {
        const response = await fetch("/api/health", {
          credentials: "include",
          cache: "no-store",
        });
        const isHealthy = response.ok;

        if (isHealthy && !backendRecoveredRef.current && isMounted) {
          // Server just came back — invalidate all cached queries so data refreshes
          // without a full page reload, preserving the user's current position.
          backendRecoveredRef.current = true;
          queryClient.invalidateQueries();
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
            <JitsiCallProvider>
            <TooltipProvider>
              <LogoLoadingScreen 
                isLoading={!isAppReady} 
                minDisplayTime={2000}
                message="Preparing your experience"
              />
              <Toaster />
              <MaintenanceGuard>
                <Router />
              </MaintenanceGuard>
              <AnalyticsInjector />
              <FaviconInjector />
              <MobileStorefrontNav />
              <PWAInstallPrompt />
            </TooltipProvider>
            </JitsiCallProvider>
          </NotificationProvider>
        </AuthProvider>
      </LanguageProvider>
    </QueryClientProvider>
  );
}

export default App;
