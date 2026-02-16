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
}

export default function HeroCarousel() {
  const [, navigate] = useLocation();
  const { t } = useLanguage();

  // Fetch platform settings to determine store mode
  const { data: platformSettings } = useQuery<PlatformSettings>({
    queryKey: ["/api/settings"],
    refetchOnMount: "always",
    staleTime: 0,
  });

  // Determine which store mode to filter by
  const storeMode = platformSettings?.isMultiVendor ? "multivendor" : "single";

  const { data: banners = [], isLoading } = useQuery<HeroBanner[]>({
    queryKey: ["/api/hero-banners", storeMode],
    queryFn: async () => {
      const res = await fetch(`/api/hero-banners?storeMode=${storeMode}`);
      return res.json();
    },
    enabled: !!platformSettings,
    staleTime: 0,
  });

  if (isLoading || !platformSettings || banners.length === 0) {
    return (
      <div className="relative h-[400px] md:h-[500px] w-full bg-gradient-to-r from-primary/20 to-primary/10 rounded-lg" />
    );
  }

  return (
    <Carousel
      opts={{
        align: "start",
        loop: true,
      }}
      plugins={[
        Autoplay({
          delay: 5000,
          stopOnInteraction: true,
        }),
      ]}
      className="w-full"
    >
      <CarouselContent>
        {banners.map((banner) => (
          <CarouselItem key={banner.id}>
            <Card className="overflow-hidden border-0">
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
                      {banner.ctaText && banner.ctaLink && (
                        <Button
                          size="lg"
                          onClick={() => navigate(banner.ctaLink || "/")}
                          data-testid={`button-hero-cta-${banner.id}`}
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
      <CarouselPrevious className="left-4" />
      <CarouselNext className="right-4" />
    </Carousel>
  );
}
