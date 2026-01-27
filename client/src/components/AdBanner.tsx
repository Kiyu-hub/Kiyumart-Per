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
      {/* Blurred background based on the ad image for a pleasant, professional backdrop */}
      <div className="absolute inset-0 overflow-hidden pointer-events-none">
        <div
          className="absolute inset-0 bg-center bg-no-repeat bg-cover"
          style={{
            backgroundImage: `url(${ad.image})`,
            filter: 'blur(14px) saturate(1.05) brightness(0.85)',
            transform: 'scale(1.08)'
          }}
        />
        {/* subtle color blend to make text/overlay pop */}
        <div className="absolute inset-0 bg-gradient-to-b from-transparent to-black/10 mix-blend-multiply" />
      </div>

      {/* Center the actual ad image at its intrinsic size without stretching */}
      <div className="relative flex items-center justify-center h-full">
        <img
          src={ad.image}
          alt={ad.url ? 'Sponsored advertisement' : 'Advertisement'}
          className={`max-h-full object-contain transition-transform duration-300 group-hover:scale-105`}
          style={{ width: 'auto', maxWidth: '90%' }}
          data-testid={`img-ad-${position}`}
        />
      </div>

      {/* Sponsored pill (smaller, refined) */}
      <div className="absolute top-2 right-2 bg-black/55 text-white text-xs px-2 py-0.5 rounded-full flex items-center gap-2 backdrop-blur-sm">
        <ExternalLink className="h-3 w-3 opacity-90" />
        <span className="text-[11px]">Sponsored</span>
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
