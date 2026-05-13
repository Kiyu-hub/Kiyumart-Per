import { type CSSProperties, useRef } from "react";
import { useQuery } from "@tanstack/react-query";
import {
  Carousel,
  CarouselContent,
  CarouselItem,
  CarouselNext,
  CarouselPrevious,
} from "@/components/ui/carousel";
import Autoplay from "embla-carousel-autoplay";
import { Card } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { useLocation } from "wouter";
import { useLanguage } from "@/contexts/LanguageContext";
import { type BannerConfig, TITLE_SIZE_MAP, LAYOUT_DEFAULTS } from "@/components/BannerEditor";

interface HeroBanner {
  id: string;
  title: string;
  subtitle: string | null;
  image: string;
  ctaText: string | null;
  ctaLink: string | null;
  storeMode: "single" | "multivendor" | "both";
  isActive: boolean;
  displayOrder: number;
  bannerConfig?: BannerConfig | null;
}

interface PlatformSettings {
  isMultiVendor: boolean;
  adsEnabled?: boolean;
  heroBannerEnabled?: boolean;
  heroBannerAdImage?: string | null;
  heroBannerAdUrl?: string | null;
}

export default function HeroCarousel() {
  const [, navigate] = useLocation();
  const { t } = useLanguage();
  const autoplayPlugin = useRef(
    Autoplay({ delay: 5000, stopOnInteraction: false })
  );

  // Fetch platform settings to determine store mode
  const { data: platformSettings } = useQuery<PlatformSettings>({
    queryKey: ["/api/platform-settings"],
    refetchOnMount: "always",
    staleTime: 0,
  });

  // Determine which store mode to filter by
  const storeMode = platformSettings?.isMultiVendor ? "multivendor" : "single";

  const { data: bannerResponse = [], isLoading } = useQuery<HeroBanner[]>({
    queryKey: ["/api/hero-banners", storeMode],
    queryFn: async () => {
      const res = await fetch(`/api/hero-banners?storeMode=${storeMode}`);
      if (!res.ok) return [];
      const data = await res.json();
      return Array.isArray(data) ? data : [];
    },
    enabled: !!platformSettings,
    staleTime: 0,
  });

  const { data: bannerPromos = [] } = useQuery<any[]>({
    queryKey: ["/api/homepage/promotional", "banner"],
    queryFn: async () => {
      const res = await fetch("/api/homepage/promotional?section=banner");
      if (!res.ok) return [];
      const data = await res.json();
      return Array.isArray(data) ? data : [];
    },
    staleTime: 0,
    refetchInterval: 10_000,
  });

  const banners = Array.isArray(bannerResponse) ? bannerResponse : [];

  // Client-side guard: drop any banner promo whose endAt has already passed
  const activeBannerPromos = bannerPromos.filter((p: any) => {
    if (!p.endAt) return true;
    return new Date(p.endAt).getTime() > Date.now();
  });

  // Convert banner-section promotions to HeroBanner format
  // Use a placeholder gradient image URL when the target has no image so banner promos are never silently dropped
  const PROMO_FALLBACK_IMAGE = "data:image/svg+xml,%3Csvg xmlns='http://www.w3.org/2000/svg' width='1200' height='500'%3E%3ClinearGradient id='g' x1='0' y1='0' x2='1' y2='1'%3E%3Cstop offset='0' stop-color='%236366f1'/%3E%3Cstop offset='1' stop-color='%2310b981'/%3E%3C/linearGradient%3E%3Crect width='1200' height='500' fill='url(%23g)'/%3E%3C/svg%3E";
  const promoBanners: HeroBanner[] = activeBannerPromos.map((promo: any) => {
    const target = promo.product || promo.store || null;
    const image = promo.imageUrl || (promo.type === "product" ? target?.images?.[0] : target?.logo) || PROMO_FALLBACK_IMAGE;
    const link = promo.ctaUrl || (promo.type === "product" ? (target ? `/product/${target.id}` : "/") : (target ? `/sellers/${target.id}` : "/"));
    return {
      id: `promo-banner-${promo.id}`,
      title: promo.title || target?.name || "Featured",
      subtitle: promo.description || null,
      image,
      ctaText: promo.ctaText || "Shop Now",
      ctaLink: link,
      storeMode: "both" as const,
      isActive: true,
      displayOrder: 99,
      bannerConfig: promo.bannerConfig || null,
    };
  });

  const heroAdFallback =
    platformSettings?.adsEnabled !== false &&
    platformSettings?.heroBannerEnabled === true &&
    String(platformSettings?.heroBannerAdImage || "").trim()
      ? {
          id: "platform-settings-hero-ad",
          title: "",
          subtitle: null,
          image: String(platformSettings.heroBannerAdImage || "").trim(),
          ctaText: null,
          ctaLink: String(platformSettings.heroBannerAdUrl || "").trim() || null,
          storeMode: "both" as const,
          isActive: true,
          displayOrder: 0,
          bannerConfig: null,
        }
      : null;

  const allBanners = [...promoBanners, ...banners];
  const effectiveBanners = allBanners.length > 0 ? allBanners : heroAdFallback ? [heroAdFallback] : [];

  if (!platformSettings) {
    return (
      <div className="relative h-[400px] md:h-[500px] w-full bg-gradient-to-r from-primary/20 to-primary/10" />
    );
  }

  if (isLoading || effectiveBanners.length === 0) {
    return (
      <div className="relative h-[400px] md:h-[500px] w-full bg-gradient-to-r from-primary/20 to-primary/10" />
    );
  }

  return (
    <Carousel
      opts={{
        align: "start",
        loop: true,
      }}
      plugins={[autoplayPlugin.current]}
      className="w-full"
    >
      <CarouselContent>
        {effectiveBanners.map((banner) => (
          <CarouselItem key={banner.id}>
            <Card className="overflow-hidden border-0 rounded-none">
              <div className="relative h-[400px] md:h-[500px] w-full overflow-hidden">
                {banner.bannerConfig ? (
                  /* Designed template banner */
                  (() => {
                    const cfg = banner.bannerConfig!;
                    const bgStyle: CSSProperties =
                      cfg.background.type === "image"
                        ? { backgroundImage: `url(${cfg.background.value})`, backgroundSize: "cover", backgroundPosition: "center" }
                        : { background: cfg.background.value };
                    const flexAlign =
                      cfg.layout === "center"
                        ? "items-center text-center"
                        : cfg.layout === "right"
                        ? "items-end text-right"
                        : "items-start text-left";
                    const overlayPositionStyle = (pos: string, size: number): CSSProperties => {
                      const base: CSSProperties = { position: "absolute", width: `${size}%`, zIndex: 1 };
                      switch (pos) {
                        case "top-left": return { ...base, top: "5%", left: "5%" };
                        case "top-center": return { ...base, top: "5%", left: "50%", transform: "translateX(-50%)" };
                        case "top-right": return { ...base, top: "5%", right: "5%" };
                        case "middle-left": return { ...base, top: "50%", left: "5%", transform: "translateY(-50%)" };
                        case "center": return { ...base, top: "50%", left: "50%", transform: "translate(-50%, -50%)" };
                        case "middle-right": return { ...base, top: "50%", right: "5%", transform: "translateY(-50%)" };
                        case "bottom-right": return { ...base, bottom: "5%", right: "5%" };
                        default: return { ...base, top: "50%", right: "5%", transform: "translateY(-50%)" };
                      }
                    };
                    const hasPositions = !!(cfg.positions && Object.values(cfg.positions).some(Boolean));
                    const layoutDef = LAYOUT_DEFAULTS[cfg.layout] ?? LAYOUT_DEFAULTS.left;
                    const ep = {
                      sponsored: cfg.positions?.sponsored ?? layoutDef.sponsored,
                      title:     cfg.positions?.title     ?? layoutDef.title,
                      subtitle:  cfg.positions?.subtitle  ?? layoutDef.subtitle,
                      cta:       cfg.positions?.cta       ?? layoutDef.cta,
                    };
                    return (
                      <div className="w-full h-full" style={bgStyle}>
                        {cfg.overlay?.imageUrl && (
                          <div style={{ ...overlayPositionStyle(cfg.overlay.position, cfg.overlay.size), opacity: cfg.overlay.opacity / 100 }}>
                            <img src={cfg.overlay.imageUrl} alt="" className="w-full h-auto object-contain" />
                          </div>
                        )}
                        {hasPositions ? (
                          /* Free-positioned elements */
                          <>
                            {cfg.showSponsored && (
                              <div style={{ position: "absolute", left: `${ep.sponsored.x}%`, top: `${ep.sponsored.y}%`, zIndex: 2 }}>
                                <p className="text-xs uppercase tracking-widest opacity-70 whitespace-nowrap" style={{ color: cfg.title.color }}>
                                  Sponsored
                                </p>
                              </div>
                            )}
                            <div style={{ position: "absolute", left: `${ep.title.x}%`, top: `${ep.title.y}%`, zIndex: 2, maxWidth: "85%" }}>
                              <h1
                                className="font-bold leading-tight drop-shadow-lg"
                                style={{ color: cfg.title.color, fontSize: TITLE_SIZE_MAP[cfg.title.size] }}
                              >
                                {cfg.title.text || banner.title}
                              </h1>
                            </div>
                            {(cfg.subtitle.text || banner.subtitle) && (
                              <div style={{ position: "absolute", left: `${ep.subtitle.x}%`, top: `${ep.subtitle.y}%`, zIndex: 2, maxWidth: "85%" }}>
                                <p className="opacity-90 drop-shadow text-lg" style={{ color: cfg.subtitle.color }}>
                                  {cfg.subtitle.text || banner.subtitle}
                                </p>
                              </div>
                            )}
                            {banner.ctaLink && (
                              <div style={{ position: "absolute", left: `${ep.cta.x}%`, top: `${ep.cta.y}%`, zIndex: 2 }}>
                                <Button
                                  size="lg"
                                  style={{ background: cfg.cta.bgColor, color: cfg.cta.textColor }}
                                  className="border-0 shadow-lg font-semibold rounded-full px-8"
                                  onPointerDown={() => { try { autoplayPlugin.current.stop(); } catch {} }}
                                  onPointerUp={() => { try { (autoplayPlugin.current as any).play?.(); } catch {} }}
                                  onPointerLeave={() => { try { (autoplayPlugin.current as any).play?.(); } catch {} }}
                                  onClick={(e) => { e.stopPropagation(); navigate(banner.ctaLink || "/"); }}
                                  data-testid={`button-hero-cta-${banner.id}`}
                                >
                                  {cfg.cta.text || banner.ctaText || t("shopNow")}
                                </Button>
                              </div>
                            )}
                          </>
                        ) : (
                          /* Original flex layout */
                          <div className={`absolute inset-0 flex flex-col justify-center px-8 md:px-16 z-[2] ${flexAlign}`}>
                            {cfg.showSponsored && (
                              <p className="text-xs uppercase tracking-widest mb-1 opacity-70" style={{ color: cfg.title.color }}>
                                Sponsored
                              </p>
                            )}
                            <h1
                              className="font-bold leading-tight drop-shadow-lg"
                              style={{ color: cfg.title.color, fontSize: TITLE_SIZE_MAP[cfg.title.size] }}
                            >
                              {cfg.title.text || banner.title}
                            </h1>
                            {(cfg.subtitle.text || banner.subtitle) && (
                              <p
                                className="mt-3 mb-5 opacity-90 drop-shadow text-lg"
                                style={{ color: cfg.subtitle.color }}
                              >
                                {cfg.subtitle.text || banner.subtitle}
                              </p>
                            )}
                            {banner.ctaLink && (
                              <div>
                                <Button
                                  size="lg"
                                  style={{ background: cfg.cta.bgColor, color: cfg.cta.textColor }}
                                  className="border-0 shadow-lg font-semibold rounded-full px-8"
                                  onPointerDown={() => { try { autoplayPlugin.current.stop(); } catch {} }}
                                  onPointerUp={() => { try { (autoplayPlugin.current as any).play?.(); } catch {} }}
                                  onPointerLeave={() => { try { (autoplayPlugin.current as any).play?.(); } catch {} }}
                                  onClick={(e) => { e.stopPropagation(); navigate(banner.ctaLink || "/"); }}
                                  data-testid={`button-hero-cta-${banner.id}`}
                                >
                                  {cfg.cta.text || banner.ctaText || t("shopNow")}
                                </Button>
                              </div>
                            )}
                          </div>
                        )}
                      </div>
                    );
                  })()
                ) : (
                  /* Original image-based banner */
                  <>
                    <img
                      src={banner.image}
                      alt={banner.title}
                      className="w-full h-full object-cover"
                    />
                    <div className="absolute inset-0 bg-gradient-to-r from-black/70 via-black/50 to-transparent" />
                    <div className="absolute inset-0 flex items-center">
                      <div className="container max-w-7xl mx-auto px-4 md:px-8">
                        <div className="max-w-2xl text-white">
                          <h1 className="text-4xl md:text-6xl font-bold mb-4 drop-shadow-lg">
                            {banner.title}
                          </h1>
                          {banner.subtitle && (
                            <p className="text-lg md:text-xl mb-6 text-white/90 drop-shadow-md">
                              {banner.subtitle}
                            </p>
                          )}
                          {banner.ctaLink && (
                            <Button
                              size="lg"
                              onPointerDown={() => { try { autoplayPlugin.current.stop(); } catch {} }}
                              onPointerUp={() => { try { (autoplayPlugin.current as any).play?.(); } catch {} }}
                              onPointerLeave={() => { try { (autoplayPlugin.current as any).play?.(); } catch {} }}
                              onClick={(e) => { e.stopPropagation(); navigate(banner.ctaLink || "/"); }}
                              data-testid={`button-hero-cta-${banner.id}`}
                            >
                              {banner.ctaText || t("shopNow")}
                            </Button>
                          )}
                        </div>
                      </div>
                    </div>
                  </>
                )}
              </div>
            </Card>
          </CarouselItem>
        ))}
      </CarouselContent>
      <CarouselPrevious className="left-4" />
      <CarouselNext className="right-4" />
    </Carousel>
  );
}
