import { useEffect, useState, lazy, Suspense } from "react";
import { useRoute, useLocation } from "wouter";
import { useQuery, useMutation } from "@tanstack/react-query";
import { queryClient } from "@/lib/queryClient";
import { useAuth } from "@/lib/auth";
import { useToast } from "@/hooks/use-toast";
import Header from "@/components/Header";
import Footer from "@/components/Footer";
import ProductCard from "@/components/ProductCard";
import { Skeleton } from "@/components/ui/skeleton";
import { Badge } from "@/components/ui/badge";
import { Avatar, AvatarImage, AvatarFallback } from "@/components/ui/avatar";
import { Store, Package, Star, Instagram, Globe, Facebook } from "lucide-react";
import { FaWhatsapp, FaTiktok } from "react-icons/fa";
import { useMobileDevice } from "@/hooks/useMobileDevice";
import type { Product } from "@shared/schema";
import { isFoodVendorStore } from "@/lib/foodVendors";

// Bolt-style restaurant detail page for mobile food vendors.
const MobileFoodStorePage = lazy(() => import("@/pages/mobile/MobileFoodStorePage"));

const TEAL = '#009688';
const F = '-apple-system,"SF Pro Text","SF Pro",system-ui,sans-serif';

interface StoreData {
  id: string;
  name: string;
  description?: string;
  logo?: string;
  banner?: string;
  sellerProfileImage?: string | null;
  updatedAt?: string | null;
  category?: string;
  primarySellerId?: string;
  isActive?: boolean;
  isApproved?: boolean;
  whatsappNumber?: string | null;
  merchantCategory?: string | null;
  socialLinks?: { instagram?: string; facebook?: string; tiktok?: string; twitter?: string; website?: string } | null;
  brandingConfig?: { primaryColor?: string; accentColor?: string; logoOverride?: string; coverImage?: string; tagline?: string } | null;
}

const withImageVersion = (url?: string | null, version?: string | null): string | undefined => {
  const normalizedUrl = typeof url === "string" ? url.trim() : "";
  if (!normalizedUrl) return undefined;
  const normalizedVersion = typeof version === "string" ? version.trim() : "";
  if (!normalizedVersion) return normalizedUrl;
  const separator = normalizedUrl.includes("?") ? "&" : "?";
  return `${normalizedUrl}${separator}v=${encodeURIComponent(normalizedVersion)}`;
};

export default function SellerStorePage() {
  const [, params] = useRoute("/sellers/:id");
  const [, navigate] = useLocation();
  const storeOrSellerId = params?.id;
  const { isAuthenticated, isLoading: authLoading } = useAuth();
  const { toast } = useToast();
  const { isMobile } = useMobileDevice();

  const [isDark, setIsDark] = useState(() => {
    const s = localStorage.getItem('theme');
    return s ? s === 'dark' : document.documentElement.classList.contains('dark');
  });
  useEffect(() => {
    const read = () => {
      const s = localStorage.getItem('theme');
      setIsDark(s ? s === 'dark' : document.documentElement.classList.contains('dark'));
    };
    const obs = new MutationObserver(read);
    obs.observe(document.documentElement, { attributes: true, attributeFilter: ['class'] });
    return () => obs.disconnect();
  }, []);

  const { data: wishlist = [] } = useQuery<Array<{ id: string; productId: string }>>({
    queryKey: ["/api/wishlist"],
    enabled: isAuthenticated && !authLoading,
    queryFn: () => fetch("/api/wishlist", { credentials: "include", cache: "no-store" }).then(r => r.json()),
    staleTime: 0,
    refetchOnMount: "always",
  });

  const addToWishlistMutation = useMutation({
    mutationFn: (productId: string) =>
      fetch("/api/wishlist", { method: "POST", credentials: "include", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ productId }) }).then(r => r.json()),
    onSuccess: () => queryClient.invalidateQueries({ queryKey: ["/api/wishlist"] }),
    onError: () => toast({ title: "Error", description: "Could not add to wishlist", variant: "destructive" }),
  });

  const removeFromWishlistMutation = useMutation({
    mutationFn: (productId: string) =>
      fetch(`/api/wishlist/${productId}`, { method: "DELETE", credentials: "include" }).then(r => r.json()),
    onSuccess: () => queryClient.invalidateQueries({ queryKey: ["/api/wishlist"] }),
    onError: () => toast({ title: "Error", description: "Could not remove from wishlist", variant: "destructive" }),
  });

  const handleToggleWishlist = (productId: string) => {
    if (!isAuthenticated) { toast({ title: "Sign in required", description: "Please sign in to use wishlist." }); return; }
    wishlist.some((w) => w.productId === productId)
      ? removeFromWishlistMutation.mutate(productId)
      : addToWishlistMutation.mutate(productId);
  };

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
    staleTime: 0,
    refetchOnMount: "always",
    refetchInterval: 15000,
  });

  // Determine the seller ID — either from the store's primarySellerId, or the URL param itself
  const sellerId = store?.primarySellerId || storeOrSellerId;

  // Load seller profile (public endpoint)
  const { data: seller, isLoading: sellerLoading, isFetched: sellerFetched } = useQuery<any>({
    queryKey: ["/api/seller-profile", sellerId],
    queryFn: async () => {
      // Try the public seller profile endpoint first
      const res = await fetch(`/api/stores/by-seller/${sellerId}`);
      if (res.ok) {
        const storeData = await res.json();
        const normalizedStoreLogo =
          storeData.logo && storeData.logo !== storeData.banner
            ? storeData.logo
            : null;
        // Merge store + basic seller info (preserve branding fields for CSS injection)
        return {
          id: sellerId,
          name: storeData.name || "Store",
          storeName: storeData.name,
          storeBanner: storeData.banner,
          storeUpdatedAt: storeData.updatedAt || null,
          storeBio: storeData.description,
          profilePicture: storeData.sellerProfileImage || normalizedStoreLogo,
          ratings: "0",
          whatsappNumber: storeData.whatsappNumber || null,
          socialLinks: storeData.socialLinks || null,
          brandingConfig: storeData.brandingConfig || null,
          merchantCategory: storeData.merchantCategory || null,
        };
      }
      return null;
    },
    enabled: !!sellerId && !storeLoading,
    staleTime: 0,
    refetchOnMount: "always",
    refetchInterval: 15000,
  });

  // Use store data directly if we have it
  const displayData = store ? {
    id: storeOrSellerId,
    name: store.name,
    storeName: store.name,
    storeBanner: store.banner,
    storeUpdatedAt: store.updatedAt || null,
    storeBio: store.description,
    profilePicture:
      seller?.profilePicture ||
      store.sellerProfileImage ||
      (store.logo && store.logo !== store.banner ? store.logo : null),
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

  const s = displayData || {} as any;
  const imageVersion = s.storeUpdatedAt || s.updatedAt || s.id || "";
  const bannerSrc = withImageVersion(s.storeBanner, imageVersion);
  const profileSrc = withImageVersion(s.profilePicture, imageVersion);

  const branding = store?.brandingConfig ?? (seller as any)?.brandingConfig ?? null;
  const primaryColor = branding?.primaryColor || "#16a34a";
  const accentColor = branding?.accentColor || "#0ea5e9";
  const effectiveLogo = branding?.logoOverride || store?.logo || undefined;
  const whatsappNumber = store?.whatsappNumber ?? (seller as any)?.whatsappNumber ?? null;
  const socialLinks = store?.socialLinks ?? (seller as any)?.socialLinks ?? null;

  useEffect(() => {
    const root = document.documentElement;
    root.style.setProperty("--store-brand-primary", primaryColor);
    root.style.setProperty("--store-brand-accent", accentColor);
    return () => {
      root.style.removeProperty("--store-brand-primary");
      root.style.removeProperty("--store-brand-accent");
    };
  }, [primaryColor, accentColor]);

  // ── Mobile theme tokens ──────────────────────────────────────────────────────
  const bg    = isDark ? '#111111' : '#F2F2F7';
  const card  = isDark ? '#1C1C1E' : '#FFFFFF';
  const txt   = isDark ? '#FFFFFF' : '#111111';
  const muted = isDark ? 'rgba(235,235,245,0.45)' : 'rgba(60,60,67,0.5)';
  const bdr   = isDark ? 'rgba(255,255,255,0.07)' : 'rgba(0,0,0,0.07)';
  const skel  = isDark ? '#2C2C2E' : '#E5E5EA';

  if ((storeLoading || sellerLoading) && isMobile) {
    return (
      <div style={{ minHeight: '100dvh', background: bg, fontFamily: F }}>
        <div style={{ height: 220, background: skel }} />
        <div style={{ padding: '44px 16px 16px', display: 'flex', flexDirection: 'column', gap: 10 }}>
          <div style={{ width: '60%', height: 22, borderRadius: 6, background: skel }} />
          <div style={{ width: '40%', height: 14, borderRadius: 4, background: skel }} />
          <div style={{ width: '80%', height: 12, borderRadius: 4, background: skel }} />
        </div>
        <div style={{ padding: '0 12px', display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 12 }}>
          {[1,2,3,4].map(i => <div key={i} style={{ aspectRatio: '1', borderRadius: 10, background: skel }} />)}
        </div>
        <button onClick={() => navigate(-1 as any)} style={{
          position: 'fixed', top: 'max(14px, env(safe-area-inset-top, 14px))', left: 16,
          width: 36, height: 36, borderRadius: 18,
          background: 'rgba(0,0,0,0.45)', border: 'none', cursor: 'pointer',
          display: 'flex', alignItems: 'center', justifyContent: 'center',
        }}>
          <svg width={16} height={16} viewBox="0 0 24 24" fill="none" stroke="#fff" strokeWidth={2.5} strokeLinecap="round" strokeLinejoin="round"><path d="m15 18-6-6 6-6"/></svg>
        </button>
      </div>
    );
  }

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

  // Only show "Store Not Found" once BOTH lookups have definitively
  // resolved without data. sellerFetched guards against a race where
  // sellerLoading transitions through true→false while the seller query
  // re-runs with a derived sellerId.
  if (!displayData && !storeLoading && !sellerLoading && sellerFetched) {
    if (isMobile) {
      return (
        <div style={{ minHeight: '100dvh', background: bg, fontFamily: F, display: 'flex', flexDirection: 'column', alignItems: 'center', justifyContent: 'center', padding: 32 }}>
          <button onClick={() => navigate(-1 as any)} style={{ position: 'fixed', top: 'max(14px, env(safe-area-inset-top, 14px))', left: 16, width: 36, height: 36, borderRadius: 18, background: isDark ? '#2C2C2E' : '#E5E5EA', border: 'none', cursor: 'pointer', display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
            <svg width={16} height={16} viewBox="0 0 24 24" fill="none" stroke={txt} strokeWidth={2.5} strokeLinecap="round" strokeLinejoin="round"><path d="m15 18-6-6 6-6"/></svg>
          </button>
          <p style={{ fontSize: 16, fontWeight: 700, color: txt, marginBottom: 6 }}>Store Not Found</p>
          <p style={{ fontSize: 13, color: muted, textAlign: 'center' }}>The store you're looking for doesn't exist.</p>
        </div>
      );
    }
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

  // ── Mobile layout ─────────────────────────────────────────────────────────────
  // Food vendors and restaurants render the Bolt-style menu page instead.
  if (isMobile && isFoodVendorStore(store as any)) {
    return (
      <Suspense fallback={(
        <div style={{ minHeight: '100dvh', background: bg, fontFamily: F }}>
          <div style={{ width: '100%', aspectRatio: '5 / 3', background: skel }} />
        </div>
      )}>
        <MobileFoodStorePage storeId={params?.id || ''} store={s} products={products as any[]} />
      </Suspense>
    );
  }

  if (isMobile) {
    const storePrimaryColor = branding?.primaryColor || TEAL;

    return (
      <div style={{ minHeight: '100dvh', background: bg, fontFamily: F, paddingBottom: 'env(safe-area-inset-bottom, 0px)' }}>

        {/* ── Banner + back button + avatar ── */}
        <div style={{ position: 'relative', height: 220, overflow: 'hidden', flexShrink: 0 }}>
          {bannerSrc ? (
            <img
              src={bannerSrc}
              alt={s.storeName || s.name}
              style={{ width: '100%', height: '100%', objectFit: 'cover', display: 'block' }}
            />
          ) : (
            <div style={{
              width: '100%', height: '100%',
              background: `linear-gradient(135deg, ${storePrimaryColor}55, ${storePrimaryColor}22)`,
              display: 'flex', alignItems: 'center', justifyContent: 'center',
            }}>
              <svg width={56} height={56} viewBox="0 0 24 24" fill="none" stroke={storePrimaryColor} strokeWidth={1.5} strokeLinecap="round" strokeLinejoin="round" style={{ opacity: 0.5 }}>
                <path d="M3 9l9-7 9 7v11a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2z"/>
                <polyline points="9 22 9 12 15 12 15 22"/>
              </svg>
            </div>
          )}

          {/* Back button */}
          <button
            onClick={() => navigate(-1 as any)}
            style={{
              position: 'absolute',
              top: 'max(14px, env(safe-area-inset-top, 14px))',
              left: 16,
              width: 36, height: 36, borderRadius: 18,
              background: 'rgba(0,0,0,0.45)',
              backdropFilter: 'blur(8px)',
              WebkitBackdropFilter: 'blur(8px)',
              border: 'none', cursor: 'pointer',
              display: 'flex', alignItems: 'center', justifyContent: 'center',
              WebkitTapHighlightColor: 'transparent',
            }}
          >
            <svg width={16} height={16} viewBox="0 0 24 24" fill="none" stroke="#fff" strokeWidth={2.5} strokeLinecap="round" strokeLinejoin="round">
              <path d="m15 18-6-6 6-6"/>
            </svg>
          </button>

          {/* Avatar — hangs below banner */}
          <div style={{ position: 'absolute', bottom: -28, left: 16 }}>
            <div style={{
              width: 60, height: 60, borderRadius: 30,
              border: `3px solid ${bg}`,
              overflow: 'hidden', background: storePrimaryColor,
              display: 'flex', alignItems: 'center', justifyContent: 'center',
              flexShrink: 0,
            }}>
              {(effectiveLogo || profileSrc) ? (
                <img src={effectiveLogo || profileSrc} alt={s.storeName || s.name} style={{ width: '100%', height: '100%', objectFit: 'cover' }} />
              ) : (
                <span style={{ fontSize: 26, fontWeight: 900, color: '#fff' }}>
                  {(s.storeName?.[0] || s.name?.[0] || 'S').toUpperCase()}
                </span>
              )}
            </div>
          </div>
        </div>

        {/* ── Store info ── */}
        <div style={{ padding: '38px 16px 14px', background: card, borderBottom: `1px solid ${bdr}` }}>
          <div style={{ display: 'flex', alignItems: 'flex-start', justifyContent: 'space-between', marginBottom: 6 }}>
            <h1 style={{ fontSize: 20, fontWeight: 800, color: txt, lineHeight: 1.2, flex: 1, marginRight: 10 }}>
              {s.storeName || s.name || 'Store'}
            </h1>
            <span style={{
              fontSize: 11, fontWeight: 700, color: TEAL,
              border: `1px solid ${TEAL}40`, borderRadius: 6,
              padding: '3px 8px', flexShrink: 0,
            }}>Seller</span>
          </div>

          {/* Stats row */}
          <div style={{ display: 'flex', alignItems: 'center', gap: 14, marginBottom: 8 }}>
            {s.ratings && parseFloat(s.ratings) > 0 && (
              <div style={{ display: 'flex', alignItems: 'center', gap: 4 }}>
                <svg width={13} height={13} viewBox="0 0 24 24" fill="#F59E0B" stroke="none">
                  <path d="m12 3 3 6.5 7 .8-5 4.7 1.4 7L12 18.5 5.6 22 7 15l-5-4.7 7-.8z"/>
                </svg>
                <span style={{ fontSize: 13, fontWeight: 700, color: txt }}>{parseFloat(s.ratings).toFixed(1)}</span>
              </div>
            )}
            <div style={{ display: 'flex', alignItems: 'center', gap: 4 }}>
              <svg width={13} height={13} viewBox="0 0 24 24" fill="none" stroke={muted} strokeWidth={2} strokeLinecap="round">
                <path d="M5 7h14l-1 13H6z"/>
              </svg>
              <span style={{ fontSize: 13, color: muted }}>{products.length} Products</span>
            </div>
          </div>

          {/* Bio */}
          {s.storeBio && (
            <p style={{ fontSize: 13, color: muted, lineHeight: 1.5, marginBottom: 8 }}>{s.storeBio}</p>
          )}
          {branding?.tagline && (
            <p style={{ fontSize: 13, fontStyle: 'italic', color: storePrimaryColor, marginBottom: 8 }}>{branding.tagline}</p>
          )}

          {/* Social links */}
          {(whatsappNumber || socialLinks?.instagram || socialLinks?.facebook || socialLinks?.tiktok || socialLinks?.website) && (
            <div style={{ display: 'flex', alignItems: 'center', gap: 14, flexWrap: 'wrap' as const, marginTop: 4 }}>
              {whatsappNumber && (
                <a href={`https://wa.me/${whatsappNumber.replace(/\D/g, '')}`} target="_blank" rel="noopener noreferrer"
                  style={{ display: 'flex', alignItems: 'center', gap: 4, fontSize: 13, fontWeight: 600, color: '#25D366', textDecoration: 'none' }}>
                  <svg width={15} height={15} viewBox="0 0 24 24" fill="#25D366"><path d="M17.472 14.382c-.297-.149-1.758-.867-2.03-.967-.273-.099-.471-.148-.67.15-.197.297-.767.966-.94 1.164-.173.199-.347.223-.644.075-.297-.15-1.255-.463-2.39-1.475-.883-.788-1.48-1.761-1.653-2.059-.173-.297-.018-.458.13-.606.134-.133.298-.347.446-.52.149-.174.198-.298.298-.497.099-.198.05-.371-.025-.52-.075-.149-.669-1.612-.916-2.207-.242-.579-.487-.5-.669-.51-.173-.008-.371-.01-.57-.01-.198 0-.52.074-.792.372-.272.297-1.04 1.016-1.04 2.479 0 1.462 1.065 2.875 1.213 3.074.149.198 2.096 3.2 5.077 4.487.709.306 1.262.489 1.694.625.712.227 1.36.195 1.871.118.571-.085 1.758-.719 2.006-1.413.248-.694.248-1.289.173-1.413-.074-.124-.272-.198-.57-.347z"/><path d="M11.923 2C6.455 2 2.001 6.453 2 11.92c0 1.766.463 3.478 1.345 4.984L2 22l5.254-1.378A9.895 9.895 0 0011.923 22c5.469 0 9.924-4.453 9.924-9.921 0-2.651-1.032-5.143-2.905-7.015A9.88 9.88 0 0011.923 2z"/></svg>
                  Chat
                </a>
              )}
              {socialLinks?.instagram && (
                <a href={socialLinks.instagram} target="_blank" rel="noopener noreferrer" style={{ color: muted, display: 'flex' }}>
                  <svg width={16} height={16} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={2} strokeLinecap="round"><rect x="2" y="2" width="20" height="20" rx="5"/><circle cx="12" cy="12" r="4"/><circle cx="17.5" cy="6.5" r="1" fill="currentColor" stroke="none"/></svg>
                </a>
              )}
              {socialLinks?.facebook && (
                <a href={socialLinks.facebook} target="_blank" rel="noopener noreferrer" style={{ color: muted, display: 'flex' }}>
                  <svg width={16} height={16} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={2} strokeLinecap="round"><path d="M18 2h-3a5 5 0 0 0-5 5v3H7v4h3v8h4v-8h3l1-4h-4V7a1 1 0 0 1 1-1h3z"/></svg>
                </a>
              )}
              {socialLinks?.tiktok && (
                <a href={socialLinks.tiktok} target="_blank" rel="noopener noreferrer" style={{ color: muted, display: 'flex' }}>
                  <svg width={16} height={16} viewBox="0 0 24 24" fill="currentColor"><path d="M19.59 6.69a4.83 4.83 0 0 1-3.77-4.25V2h-3.45v13.67a2.89 2.89 0 0 1-2.88 2.5 2.89 2.89 0 0 1-2.89-2.89 2.89 2.89 0 0 1 2.89-2.89c.28 0 .54.04.79.1V9.01a6.33 6.33 0 0 0-.79-.05 6.34 6.34 0 0 0-6.34 6.34 6.34 6.34 0 0 0 6.34 6.34 6.34 6.34 0 0 0 6.33-6.34V9a8.27 8.27 0 0 0 4.84 1.55V7.1a4.85 4.85 0 0 1-1.07-.41z"/></svg>
                </a>
              )}
              {socialLinks?.website && (
                <a href={socialLinks.website} target="_blank" rel="noopener noreferrer" style={{ color: muted, display: 'flex' }}>
                  <svg width={16} height={16} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={2} strokeLinecap="round"><circle cx="12" cy="12" r="10"/><path d="M2 12h20M12 2a15.3 15.3 0 0 1 4 10 15.3 15.3 0 0 1-4 10 15.3 15.3 0 0 1-4-10 15.3 15.3 0 0 1 4-10z"/></svg>
                </a>
              )}
            </div>
          )}
        </div>

        {/* ── Products ── */}
        <div style={{ padding: '16px 12px 40px' }}>
          <div style={{ display: 'flex', alignItems: 'center', gap: 8, marginBottom: 14 }}>
            <svg width={18} height={18} viewBox="0 0 24 24" fill="none" stroke={TEAL} strokeWidth={2} strokeLinecap="round" strokeLinejoin="round">
              <path d="M5 7h14l-1 13H6z"/>
            </svg>
            <span style={{ fontSize: 16, fontWeight: 700, color: txt }}>Products</span>
            <span style={{ fontSize: 12, color: muted, fontWeight: 500 }}>({products.length})</span>
          </div>

          {productsLoading ? (
            <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 12 }}>
              {[1,2,3,4,5,6].map(i => (
                <div key={i} style={{ aspectRatio: '1', borderRadius: 10, background: skel }} />
              ))}
            </div>
          ) : products.length > 0 ? (
            <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 12 }}>
              {products.map((product) => (
                <ProductCard
                  key={product.id}
                  id={product.id}
                  name={product.name}
                  price={product.price}
                  costPrice={product.costPrice || undefined}
                  image={product.images[0] || ''}
                  discount={product.discount || 0}
                  rating={product.ratings || '0'}
                  reviewCount={product.totalRatings || 0}
                  inStock={(product.stock || 0) > 0}
                  isWishlisted={wishlist.some((w) => w.productId === product.id)}
                  onToggleWishlist={handleToggleWishlist}
                />
              ))}
            </div>
          ) : (
            <div style={{ padding: '60px 0', textAlign: 'center' as const }}>
              <svg width={48} height={48} viewBox="0 0 24 24" fill="none" stroke={muted} strokeWidth={1.5} strokeLinecap="round" style={{ margin: '0 auto 12px', display: 'block' }}>
                <path d="M5 7h14l-1 13H6z"/>
              </svg>
              <p style={{ fontSize: 15, fontWeight: 600, color: txt, marginBottom: 4 }}>No products yet</p>
              <p style={{ fontSize: 13, color: muted }}>This store hasn't listed any products</p>
            </div>
          )}
        </div>
      </div>
    );
  }

  return (
    <div className="min-h-screen flex flex-col bg-background dark:bg-gray-900" style={{ "--brand-color": primaryColor, "--brand-accent": accentColor } as React.CSSProperties}>
      <Header />

      <main className="flex-1">
        <div className="container max-w-7xl mx-auto px-4 py-4 space-y-4">
          <div className="relative">
            {s.storeBanner ? (
              <div className="h-32 md:h-40 rounded-lg overflow-hidden">
                <img
                  src={bannerSrc}
                  alt={s.storeName || s.name}
                  className="w-full h-full object-cover"
                  data-testid="img-store-banner"
                />
              </div>
            ) : (
              <div
                className="h-32 md:h-40 rounded-lg flex items-center justify-center"
                style={{ background: `linear-gradient(135deg, ${primaryColor}33, ${primaryColor}0d)` }}
              >
                <Store className="w-12 h-12 opacity-40" style={{ color: primaryColor }} />
              </div>
            )}

            <div className="absolute -bottom-8 left-4">
              <Avatar className="h-16 w-16 border-4 border-background">
                <AvatarImage src={effectiveLogo || profileSrc} />
                <AvatarFallback className="text-white text-lg" style={{ backgroundColor: primaryColor }}>
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

                {/* Social links & WhatsApp */}
                {(whatsappNumber || socialLinks?.instagram || socialLinks?.facebook || socialLinks?.tiktok || socialLinks?.website) && (
                  <div className="flex flex-wrap items-center gap-3 pt-1">
                    {whatsappNumber && (
                      <a
                        href={`https://wa.me/${whatsappNumber.replace(/\D/g, "")}`}
                        target="_blank"
                        rel="noopener noreferrer"
                        className="flex items-center gap-1 text-sm text-green-600 hover:text-green-700 font-medium"
                      >
                        <FaWhatsapp className="h-4 w-4" />
                        Chat
                      </a>
                    )}
                    {socialLinks?.instagram && (
                      <a href={socialLinks.instagram} target="_blank" rel="noopener noreferrer" className="text-muted-foreground hover:text-foreground">
                        <Instagram className="h-4 w-4" />
                      </a>
                    )}
                    {socialLinks?.facebook && (
                      <a href={socialLinks.facebook} target="_blank" rel="noopener noreferrer" className="text-muted-foreground hover:text-foreground">
                        <Facebook className="h-4 w-4" />
                      </a>
                    )}
                    {socialLinks?.tiktok && (
                      <a href={socialLinks.tiktok} target="_blank" rel="noopener noreferrer" className="text-muted-foreground hover:text-foreground">
                        <FaTiktok className="h-4 w-4" />
                      </a>
                    )}
                    {socialLinks?.website && (
                      <a href={socialLinks.website} target="_blank" rel="noopener noreferrer" className="text-muted-foreground hover:text-foreground">
                        <Globe className="h-4 w-4" />
                      </a>
                    )}
                  </div>
                )}
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
            {branding?.tagline && (
              <p className="text-sm italic max-w-2xl" style={{ color: primaryColor }}>
                {branding.tagline}
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
              <div className="grid grid-cols-2 sm:grid-cols-3 md:grid-cols-4 lg:grid-cols-5 xl:grid-cols-5 gap-x-4 gap-y-6">
                {[...Array(10)].map((_, i) => (
                  <Skeleton key={i} className="aspect-square rounded-lg" data-testid={`skeleton-product-${i}`} />
                ))}
              </div>
            ) : products.length > 0 ? (
              <div className="grid grid-cols-2 sm:grid-cols-3 md:grid-cols-4 lg:grid-cols-5 xl:grid-cols-5 gap-4 gap-y-6" data-testid="grid-products">
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
                    isWishlisted={wishlist.some((w) => w.productId === product.id)}
                    onToggleWishlist={handleToggleWishlist}
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
