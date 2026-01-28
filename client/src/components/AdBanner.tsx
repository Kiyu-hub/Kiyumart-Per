import { useQuery } from "@tanstack/react-query";
import { useState } from "react";
import { useLocation } from "wouter";
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
  // branding fields (optional) used as a fallback when ads are missing
  logo?: string;
  platformName?: string;
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

  // Ensure hooks are invoked unconditionally — we need `navigate` available even if not used
  const [, navigate] = useLocation();
  // Declare other hooks early so component doesn't change hook order between renders
  const [imgError, setImgError] = useState(false);

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

  // If an ad image is missing or fails to load, render a branded fallback so the site always looks professional
  const hasImage = ad.image && !imgError;

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
          className={`absolute inset-0 bg-center bg-no-repeat bg-cover ${!hasImage ? 'bg-gradient-to-r from-primary/40 to-black/40' : ''}`}
          style={{
            backgroundImage: hasImage ? `url(${ad.image})` : settings?.logo ? `url(${settings.logo})` : undefined,
            filter: 'blur(14px) saturate(1.05) brightness(0.85)',
            transform: 'scale(1.08)'
          }}
        />
        {/* subtle color blend to make text/overlay pop */}
        <div className="absolute inset-0 bg-gradient-to-b from-transparent to-black/10 mix-blend-multiply" />
      </div>

      {/* Center the actual ad image at its intrinsic size without stretching; fallback to branded placeholder */}
      <div className="relative flex items-center justify-center h-full">
        {hasImage ? (
          <img
            src={ad.image}
            alt={ad.url ? 'Sponsored advertisement' : 'Advertisement'}
            onError={() => setImgError(true)}
            className={`max-h-full object-contain transition-transform duration-300 group-hover:scale-105`}
            style={{ width: 'auto', maxWidth: '90%' }}
            data-testid={`img-ad-${position}`}
          />
        ) : (
          <div className="flex items-center gap-4 p-6">
            {settings?.logo ? (
              <img src={settings.logo} alt={settings.platformName || 'KiyuMart'} className="h-12 w-auto object-contain" />
            ) : (
              <div className="h-12 w-12 rounded-full bg-primary/20 flex items-center justify-center text-primary font-bold">KM</div>
            )}
            <div className="text-left">
              <div className="text-sm font-semibold text-white">Sponsored</div>
              <div className="text-xs text-white/90">{settings?.platformName || 'KiyuMart'}</div>
            </div>
          </div>
        )}
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
    const url = ad.url.trim();
    const isInternal = url.startsWith('/') || url.startsWith('#');
    const isProtocol = url.startsWith('mailto:') || url.startsWith('tel:');
    const isExternal = /^https?:\/\//i.test(url);

    if (isInternal) {
      const handleClick = (e: React.MouseEvent) => {
        e.preventDefault();
        if (url.startsWith('#')) {
          const el = document.querySelector(url);
          if (el) el.scrollIntoView({ behavior: 'smooth' });
        } else {
          // use the top-level navigate hook to avoid rendering hooks conditionally
          navigate(url);
        }
      };

      return (
        <div className={wrapperClasses} data-testid={`ad-banner-${position}`}>
          <a
            href={url}
            onClick={handleClick}
            className={`w-full h-full block relative focus:outline-none focus:ring-2 focus:ring-offset-2 focus:ring-primary`}
            aria-label="Open sponsored content"
            data-testid={`link-ad-${position}`}
          >
            {AdInner}
          </a>
        </div>
      );
    }

    if (isProtocol) {
      return (
        <div className={wrapperClasses} data-testid={`ad-banner-${position}`}>
          <a
            href={url}
            className={`w-full h-full block relative focus:outline-none focus:ring-2 focus:ring-offset-2 focus:ring-primary`}
            aria-label="Open sponsored content"
            data-testid={`link-ad-${position}`}
          >
            {AdInner}
          </a>
        </div>
      );
    }

    // external http(s)
    return (
      <div className={wrapperClasses} data-testid={`ad-banner-${position}`}>
        <a
          href={url}
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
