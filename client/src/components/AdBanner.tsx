import { useQuery } from "@tanstack/react-query";
import { ExternalLink } from "lucide-react";

interface PlatformSettings {
  adsEnabled: boolean;
  heroBannerAdImage?: string;
  heroBannerAdUrl?: string;
  sidebarAdImage?: string;
  sidebarAdUrl?: string;
  footerAdImage?: string;
  footerAdUrl?: string;
  productPageAdImage?: string;
  productPageAdUrl?: string;
}

type AdPosition = "hero" | "sidebar" | "footer" | "product-page";

interface AdBannerProps {
  position: AdPosition;
  className?: string;
  /** When true, render as a full-bleed ad (no rounded corners or card background) */
  fullBleed?: boolean;
}

export default function AdBanner({ position, className = "", fullBleed = false }: AdBannerProps) {
  const { data: settings } = useQuery<PlatformSettings>({
    queryKey: ["/api/settings"],
  });

  if (!settings?.adsEnabled) {
    return null;
  }

  const getAdData = () => {
    switch (position) {
      case "hero":
        return {
          image: settings.heroBannerAdImage,
          url: settings.heroBannerAdUrl,
        };
      case "sidebar":
        return {
          image: settings.sidebarAdImage,
          url: settings.sidebarAdUrl,
        };
      case "footer":
        return {
          image: settings.footerAdImage,
          url: settings.footerAdUrl,
        };
      case "product-page":
        return {
          image: settings.productPageAdImage,
          url: settings.productPageAdUrl,
        };
      default:
        return { image: undefined, url: undefined };
    }
  };

  const ad = getAdData();

  if (!ad.image) {
    return null;
  }

  const isFull = fullBleed || className.includes("rounded-none") || className.includes("border-0");

  const wrapperClasses = [
    "relative",
    "group",
    "overflow-hidden",
    isFull ? "w-full" : "rounded-lg border bg-card",
    "shadow-sm",
    className,
  ].join(" ");

  // Use anchor for proper semantics and keyboard navigation
  const AdInner = (
    <>
      {/* subtle gradient overlay for a polished look */}
      <div className="absolute inset-0 bg-gradient-to-b from-transparent to-black/8 pointer-events-none" />

      <img
        src={ad.image}
        alt={ad.url ? "Sponsored advertisement" : "Advertisement"}
        className={`w-full h-full object-cover transition-transform duration-500 group-hover:scale-105`}
        data-testid={`img-ad-${position}`}
      />

      {/* Sponsored pill */}
      <div className="absolute top-3 right-3 bg-black/50 text-white text-xs px-3 py-1 rounded-full flex items-center gap-2 backdrop-blur-sm">
        <ExternalLink className="h-3 w-3 opacity-90" />
        <span>Sponsored</span>
      </div>

      {/* Decorative subtle separator when full-bleed to give structure */}
      {isFull && <div className="absolute inset-x-0 bottom-0 h-px bg-gradient-to-r from-transparent via-black/8 to-transparent" />}
    </>
  );

  if (ad.url) {
    return (
      <div className={wrapperClasses} data-testid={`ad-banner-${position}`}>
        <a
          href={ad.url}
          target="_blank"
          rel="noopener noreferrer"
          className={`w-full h-full block relative focus:outline-none focus:ring-2 focus:ring-offset-2 focus:ring-primary`}
          aria-label="Open sponsored content"
          data-testid={`link-ad-${position}`}
        >
          {AdInner}
        </a>
      </div>
    );
  }

  return (
    <div className={wrapperClasses} data-testid={`ad-banner-${position}`} role="img" aria-label="Advertisement">
      <div className="w-full h-full relative">
        {AdInner}
      </div>
    </div>
  );
}
