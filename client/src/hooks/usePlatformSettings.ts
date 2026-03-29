import { useQuery } from "@tanstack/react-query";
import { fetchApiJson } from "@/lib/queryClient";

export interface PublicPlatformSettings {
  isExternalRiderSystemEnabled: boolean;
  showCheckoutDeliveryMap: boolean;
}

export const publicPlatformSettingsQueryKey = ["/api/public/platform-settings"] as const;

const defaultPublicPlatformSettings: PublicPlatformSettings = {
  isExternalRiderSystemEnabled: false,
  showCheckoutDeliveryMap: true,
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
    : true;

  return {
    ...query,
    settings: query.data ?? defaultPublicPlatformSettings,
    isExternalRiderSystemEnabled,
    showCheckoutDeliveryMap: query.data?.showCheckoutDeliveryMap !== false,
    hasResolvedSettings,
  };
}
