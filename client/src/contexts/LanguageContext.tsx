import { createContext, useContext, useState, useEffect, ReactNode } from "react";

export type Language = "en";
export type Currency = "GHS";

export const translations = {
  en: {
    home: "Home",
    products: "Products",
    cart: "Cart",
    profile: "Profile",
    notifications: "Notifications",
    search: "Search products...",
    shopByCategory: "Shop by Category",
    featuredProducts: "Featured Products",
    viewAll: "View All",
    addToCart: "Add to Cart",
    products_count: "Products",
    newSeasonCollection: "New Season Collection",
    discoverLatest: "Discover the latest trends in fashion. Shop premium quality at unbeatable prices.",
    shopNow: "Shop Now",
    upTo50Off: "Up to 50% Off",
    limitedOffer: "Limited time offer on selected items. Don't miss out!",
    viewDeals: "View Deals",
  },
};

interface LanguageContextType {
  language: Language;
  currency: Currency;
  currencySymbol: string;
  countryName: string;
  setLanguage: (lang: Language) => void;
  t: (key: keyof typeof translations.en) => string;
  formatPrice: (priceInGHS: number) => string;
  convertPrice: (priceInGHS: number) => number;
}

const LanguageContext = createContext<LanguageContextType | undefined>(undefined);

export function LanguageProvider({ children }: { children: ReactNode }) {
  const [language] = useState<Language>("en");
  const currency: Currency = "GHS";
  const currencySymbol = "GH₵";
  const countryName = "Ghana";

  // No-op setter since only English is supported
  const setLanguage = (_lang: Language) => {
    return;
  };

  const t = (key: keyof typeof translations.en): string => {
    return translations.en[key] || key;
  };

  // Convert price - no conversion needed since only GHS is used
  const convertPrice = (priceInGHS: number): number => {
    // Coerce to number and handle invalid inputs
    const numericPrice = Number(priceInGHS);
    if (isNaN(numericPrice) || numericPrice === null || numericPrice === undefined) {
      return 0;
    }
    return numericPrice; // No conversion needed - GHS only
  };

  // Format price with GHS currency symbol
  const formatPrice = (priceInGHS: number): string => {
    // Coerce to number and handle invalid inputs gracefully
    const numericPrice = Number(priceInGHS);
    const validPrice = isNaN(numericPrice) ? 0 : numericPrice;
    
    // Format in GHS
    return `GH₵${validPrice.toFixed(2)}`;
  };

  useEffect(() => {
    document.documentElement.lang = language;
    document.documentElement.dir = "ltr";
  }, [language]);

  return (
    <LanguageContext.Provider value={{ language, currency, currencySymbol, countryName, setLanguage, t, formatPrice, convertPrice }}>
      {children}
    </LanguageContext.Provider>
  );
}

export function useLanguage() {
  const context = useContext(LanguageContext);
  if (!context) {
    throw new Error("useLanguage must be used within LanguageProvider");
  }
  return context;
}
