import { useQuery } from "@tanstack/react-query";
import { fetchApiJson } from "@/lib/queryClient";

export interface PublicPlatformSettings {
  isExternalRiderSystemEnabled: boolean;
  showCheckoutDeliveryMap: boolean;
  isMultiVendor: boolean;
  allowSellerBankPayouts: boolean;
  allowSellerDirectSupportMessages: boolean;
  referralEnabled: boolean;
  referralEnabledSingleStore: boolean;
  referralEnabledMultiVendor: boolean;
  suggestionsEnabled: boolean;
  contactEmail?: string | null;
  contactPhone?: string | null;
  platformName?: string | null;
  callerRingtone?: string;
  receiverRingtone?: string;
  notificationSound?: string;
  showRefundButton?: boolean;
  logo?: string | null;
  logoLight?: string | null;
  logoDark?: string | null;
  favicon?: string | null;
  primaryColor?: string | null;
}

export const publicPlatformSettingsQueryKey = ["/api/public/platform-settings"] as const;

const defaultPublicPlatformSettings: PublicPlatformSettings = {
  isExternalRiderSystemEnabled: false,
  showCheckoutDeliveryMap: true,
  isMultiVendor: false,
  allowSellerBankPayouts: true,
  allowSellerDirectSupportMessages: true,
  referralEnabled: false,
  referralEnabledSingleStore: false,
  referralEnabledMultiVendor: false,
  suggestionsEnabled: false,
  contactEmail: "support@kiyumart.com",
  callerRingtone: "default",
  receiverRingtone: "default",
  notificationSound: "default",
  showRefundButton: true,
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
    referralEnabled: query.data?.referralEnabled === true,
    referralEnabledSingleStore: query.data?.referralEnabledSingleStore === true,
    referralEnabledMultiVendor: query.data?.referralEnabledMultiVendor === true,
    suggestionsEnabled: query.data?.suggestionsEnabled === true,
    callerRingtone: query.data?.callerRingtone || "default",
    receiverRingtone: query.data?.receiverRingtone || "default",
    notificationSound: query.data?.notificationSound || "default",
    showRefundButton: query.data?.showRefundButton !== false,
    logo: query.data?.logo || null,
    logoLight: query.data?.logoLight || null,
    logoDark: query.data?.logoDark || null,
    favicon: query.data?.favicon || null,
    primaryColor: query.data?.primaryColor || null,
    contactEmail: query.data?.contactEmail || "support@kiyumart.com",
    contactPhone: query.data?.contactPhone || null,
    platformName: query.data?.platformName || "KiyuMart",
    hasResolvedSettings,
  };
}
