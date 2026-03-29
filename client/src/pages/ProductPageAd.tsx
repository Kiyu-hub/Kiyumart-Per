import AdBanner from "@/components/AdBanner";
import { useQuery } from '@tanstack/react-query';
import type { PlatformSettings } from '@shared/schema';

export default function ProductPageAd() {
  const { data: settings } = useQuery<PlatformSettings>({ queryKey: ["/api/platform-settings"], refetchOnMount: true, refetchOnWindowFocus: true, refetchInterval: 5000 });
  // Fail closed so product ads only appear after explicit platform settings enable them.
  if ((settings && settings.adsEnabled === false) || !(settings?.productPageAdEnabled ?? false)) return null;

  // If there's no configured ad image AND no platform branding (logo), don't render the placeholder —
  // this prevents a large empty rounded box on product pages when no ad is configured.
  const hasAdImage = Boolean(settings?.productPageAdImage && settings.productPageAdImage.trim());
  const hasBranding = Boolean(settings?.logo && settings.logo.trim());
  if (!hasAdImage && !hasBranding) return null;

  return (
    <div className="mt-6">
      <AdBanner position="product-page" className="h-44 md:h-56 rounded-lg" />
    </div>
  );
}
