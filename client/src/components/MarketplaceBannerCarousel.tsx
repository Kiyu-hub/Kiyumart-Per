import { useQuery } from "@tanstack/react-query";
import abaya1 from "@assets/stock_images/Elegant_black_abaya_with_gold_embroidery_cc860cad.png";
import abaya2 from "@assets/stock_images/Navy_blue_embroidered_modest_dress_aa08f435.png";
import abaya3 from "@assets/stock_images/Pink_lace_abaya_dress_53759991.png";
import { useEffect } from "react";
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
import { navigateToBannerLink } from "@/lib/bannerNavigation";
import { Badge } from "@/components/ui/badge";
import { useLanguage } from "@/contexts/LanguageContext";

interface MarketplaceBanner {
  id: string;
  collectionId: string | null;
  title: string | null;
  subtitle: string | null;
  imageUrl: string;
  productRef: string | null;
  storeRef: string | null;
  ctaText: string | null;
  ctaUrl: string | null;
  displayOrder: number;
  startAt: string | null;
  endAt: string | null;
  isActive: boolean;
  metadata: Record<string, any>;
}

interface MarketplaceBannerCarouselProps {
  autoplayEnabled?: boolean;
  autoplayDuration?: number;
}

export default function MarketplaceBannerCarousel({
  autoplayEnabled = true,
  autoplayDuration = 5000,
}: MarketplaceBannerCarouselProps) {
  const [, navigate] = useLocation();
  const { formatPrice } = useLanguage();

  const { data: banners = [], isLoading } = useQuery<MarketplaceBanner[]>({
    queryKey: ["/api/homepage/banners"],
  });

  // Fetch platform settings to know whether we are in single-store mode
  const { data: platformSettings } = useQuery<{ isMultiVendor?: boolean } | null>({
    queryKey: ["/api/platform-settings"],
  });

  const isSingleStoreMode = platformSettings?.isMultiVendor !== true;

  // Mandatory Islamic Fashion banners for Single Store Mode (always show these in single-store mode)
  const mandatoryBanners: MarketplaceBanner[] = [
    {
      id: 'mandatory-islamic-1',
      collectionId: null,
      title: 'Islamic Fashion — Elegant Abayas',
      subtitle: 'Timeless styles and modest elegance',
      imageUrl: abaya1,
      productRef: null,
      storeRef: null,
      ctaText: 'Shop Abayas',
      ctaUrl: '/category/abayas',
      displayOrder: 1,
      startAt: null,
      endAt: null,
      isActive: true,
      metadata: {},
    },
    {
      id: 'mandatory-islamic-2',
      collectionId: null,
      title: 'Modest Dresses & Hijabs',
      subtitle: 'Beautifully tailored modest wear',
      imageUrl: abaya2,
      productRef: null,
      storeRef: null,
      ctaText: 'Explore Hijabs',
      ctaUrl: '/category/hijabs',
      displayOrder: 2,
      startAt: null,
      endAt: null,
      isActive: true,
      metadata: {},
    },
  ];

  // Prepare effective banners: if single-store mode, ensure mandatory banners are included
  const effectiveBanners = isSingleStoreMode
    ? [...banners, ...mandatoryBanners].filter((b, i, arr) => arr.findIndex(x => x.id === b.id) === i)
    : banners;

  if (isLoading) {
    return (
      <div className="relative h-[350px] md:h-[450px] w-full bg-gradient-to-r from-primary/20 to-primary/10 rounded-lg animate-pulse" data-testid="skeleton-banner-carousel" />
    );
  }

  if (effectiveBanners.length === 0) {
    return (
      <div className="relative h-[350px] md:h-[450px] w-full bg-gradient-to-r from-primary/20 to-primary/10 rounded-lg flex items-center justify-center" data-testid="empty-banner-carousel">
        <p className="text-muted-foreground">No active banners</p>
      </div>
    );
  }

  const plugins = autoplayEnabled
    ? [
        Autoplay({
          delay: autoplayDuration,
          stopOnInteraction: true,
        }),
      ]
    : [];

  const handleBannerClick = (banner: MarketplaceBanner) => {
    if (banner.ctaUrl) {
      navigateToBannerLink(banner.ctaUrl, navigate);
    } else if (banner.productRef) {
      navigate(`/product/${banner.productRef}`);
    } else if (banner.storeRef) {
      navigate(`/sellers/${banner.storeRef}`);
    }
  };

  return (
    // Make the carousel full-bleed horizontally so banners span the full viewport width
    <Carousel
      opts={{
        align: "start",
        loop: true,
      }}
      plugins={plugins}
      className="w-screen mx-auto"
      data-testid="carousel-marketplace-banners"
    >
      <CarouselContent>
        {effectiveBanners.map((banner) => (
          <CarouselItem key={banner.id}>
            <Card className="overflow-hidden border-0">
              <div className="relative h-[350px] md:h-[450px] w-full group">
                <img
                  src={banner.imageUrl}
                  alt={banner.title || "Banner"}
                  // Use viewport width so banner fills horizontally; keep object-cover for responsive cropping
                  className="w-screen h-full object-cover transition-transform duration-300 group-hover:scale-105"
                  data-testid={`img-banner-${banner.id}`}
                />
                <div className="absolute inset-0 bg-gradient-to-r from-black/70 via-black/40 to-transparent" />
                
                <div className="absolute inset-0 flex items-center">
                  <div className="container max-w-7xl mx-auto px-4 md:px-8">
                    <div className="max-w-2xl text-white">
                      {banner.metadata?.discount && (
                        <Badge 
                          variant="destructive" 
                          className="mb-3 text-sm"
                          data-testid={`badge-discount-${banner.id}`}
                        >
                          {banner.metadata.discount}% OFF
                        </Badge>
                      )}
                      
                      {banner.title && (
                        <h1 
                          className="text-3xl md:text-5xl font-bold mb-3 drop-shadow-lg"
                          data-testid={`text-banner-title-${banner.id}`}
                        >
                          {banner.title}
                        </h1>
                      )}
                      
                      {banner.subtitle && (
                        <p 
                          className="text-base md:text-lg mb-5 text-white/90 drop-shadow-md max-w-xl"
                          data-testid={`text-banner-subtitle-${banner.id}`}
                        >
                          {banner.subtitle}
                        </p>
                      )}
                      
                      {banner.metadata?.price && (
                        <div className="mb-4">
                          <span className="text-2xl md:text-3xl font-bold">
                            {formatPrice(parseFloat(banner.metadata.price))}
                          </span>
                          {banner.metadata?.originalPrice && (
                            <span className="ml-3 text-lg line-through text-white/60">
                              {formatPrice(parseFloat(banner.metadata.originalPrice))}
                            </span>
                          )}
                        </div>
                      )}
                      
                      {banner.ctaText && (
                        <Button
                          size="lg"
                          onClick={() => handleBannerClick(banner)}
                          className="shadow-lg hover:shadow-xl transition-shadow"
                          data-testid={`button-banner-cta-${banner.id}`}
                        >
                          {banner.ctaText}
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
      <CarouselPrevious className="left-4" data-testid="button-carousel-prev" />
      <CarouselNext className="right-4" data-testid="button-carousel-next" />
    </Carousel>
  );
}
