import { useQuery } from "@tanstack/react-query";
import { fetchApiJson } from "@/lib/queryClient";

export interface PublicPlatformSettings {
  isExternalRiderSystemEnabled: boolean;
  showCheckoutDeliveryMap: boolean;
  isMultiVendor: boolean;
  allowSellerBankPayouts: boolean;
  allowSellerDirectSupportMessages: boolean;
  contactEmail?: string | null;
}

export const publicPlatformSettingsQueryKey = ["/api/public/platform-settings"] as const;

const defaultPublicPlatformSettings: PublicPlatformSettings = {
  isExternalRiderSystemEnabled: false,
  showCheckoutDeliveryMap: true,
  isMultiVendor: false,
  allowSellerBankPayouts: true,
  allowSellerDirectSupportMessages: true,
  contactEmail: "support@kiyumart.com",
};

export function usePlatformSettings() {
  const query = useQuery<PublicPlatformSettings>({
    queryKey: [...publicPlatformSettingsQueryKey],
    queryFn: () => fetchApiJson<PublicPlatformSettings>("/api/public/platform-settings"),
    staleTime: 60_000,
    gcTime: 10 * 60_000,
    refetchOnMount: true,
    refetchOnWindowFocus: true,
  });

  const hasResolvedSettings = query.isFetched || query.isFetchedAfterMount || query.isError;
  const isExternalRiderSystemEnabled = hasResolvedSettings
    ? query.data?.isExternalRiderSystemEnabled === true
    : defaultPublicPlatformSettings.isExternalRiderSystemEnabled;

  return {
    ...query,
    settings: query.data ?? defaultPublicPlatformSettings,
    isExternalRiderSystemEnabled,
    showCheckoutDeliveryMap: query.data?.showCheckoutDeliveryMap !== false,
    isMultiVendor: query.data?.isMultiVendor === true,
    allowSellerBankPayouts: query.data?.allowSellerBankPayouts !== false,
    allowSellerDirectSupportMessages: query.data?.allowSellerDirectSupportMessages !== false,
    hasResolvedSettings,
  };
}
