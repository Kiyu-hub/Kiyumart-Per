import AdBanner from "@/components/AdBanner";
import { useQuery } from '@tanstack/react-query';
import type { PlatformSettings } from '@shared/schema';

export default function ProductPageAd() {
  const { data: settings } = useQuery<PlatformSettings>({ queryKey: ["/api/platform-settings"], refetchOnMount: true, refetchOnWindowFocus: true, refetchInterval: 5000 });
  // Be resilient during slow fetches: assume ads enabled by default
  if ((settings && settings.adsEnabled === false) || !(settings?.productPageAdEnabled ?? true)) return null;
  return (
    <div className="mt-6">
      <AdBanner position="product-page" className="h-44 md:h-56 rounded-lg" />
    </div>
  );
}
