import { useRef } from "react";
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
    staleTime: 30_000,
    refetchInterval: 60_000,
  });

  const banners = Array.isArray(bannerResponse) ? bannerResponse : [];

  // Convert banner-section promotions to HeroBanner format
  const promoBanners: HeroBanner[] = bannerPromos.map((promo: any) => {
    const target = promo.product || promo.store || null;
    const image = promo.imageUrl || (promo.type === "product" ? target?.images?.[0] : target?.logo) || null;
    const link = promo.ctaUrl || (promo.type === "product" ? (target ? `/product/${target.id}` : "/") : (target ? `/sellers/${target.id}` : "/"));
    return {
      id: `promo-banner-${promo.id}`,
      title: promo.title || target?.name || "Featured",
      subtitle: promo.description || null,
      image: image || "",
      ctaText: promo.ctaText || "Shop Now",
      ctaLink: link,
      storeMode: "both" as const,
      isActive: true,
      displayOrder: 99,
    };
  }).filter((b) => !!b.image);

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
        }
      : null;

  const allBanners = [...banners, ...promoBanners];
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
              <div className="relative h-[400px] md:h-[500px] w-full">
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
