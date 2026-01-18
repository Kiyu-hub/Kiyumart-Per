import { createContext, useContext, useState, useEffect, ReactNode } from "react";

export type Language = "en" | "fr" | "es" | "en-ng" | "fr-tg" | "ar";
export type Currency = "GHS"; // Only GHS currency supported

interface LanguageConfig {
  code: Language;
  name: string;
  country: string;
  flag: string;
  currency: Currency;
  symbol: string;
}

export const languages: Record<Language, LanguageConfig> = {
  en: { code: "en", name: "English", country: "Ghana", flag: "🇬🇭", currency: "GHS", symbol: "GH₵" },
  "en-ng": { code: "en-ng", name: "English", country: "Nigeria", flag: "🇳🇬", currency: "GHS", symbol: "GH₵" },
  fr: { code: "fr", name: "Français", country: "France", flag: "🇫🇷", currency: "GHS", symbol: "GH₵" },
  "fr-tg": { code: "fr-tg", name: "Français", country: "Togo", flag: "🇹🇬", currency: "GHS", symbol: "GH₵" },
  es: { code: "es", name: "Español", country: "Spain", flag: "🇪🇸", currency: "GHS", symbol: "GH₵" },
  ar: { code: "ar", name: "العربية", country: "Saudi Arabia", flag: "🇸🇦", currency: "GHS", symbol: "GH₵" },
};

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
  "en-ng": {
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
  fr: {
    home: "Accueil",
    products: "Produits",
    cart: "Panier",
    profile: "Profil",
    notifications: "Notifications",
    search: "Rechercher des produits...",
    shopByCategory: "Acheter par catégorie",
    featuredProducts: "Produits en vedette",
    viewAll: "Voir tout",
    addToCart: "Ajouter au panier",
    products_count: "Produits",
    newSeasonCollection: "Collection Nouvelle Saison",
    discoverLatest: "Découvrez les dernières tendances de la mode. Achetez une qualité premium à des prix imbattables.",
    shopNow: "Acheter maintenant",
    upTo50Off: "Jusqu'à 50% de réduction",
    limitedOffer: "Offre à durée limitée sur une sélection d'articles. Ne manquez pas!",
    viewDeals: "Voir les offres",
  },
  "fr-tg": {
    home: "Accueil",
    products: "Produits",
    cart: "Panier",
    profile: "Profil",
    notifications: "Notifications",
    search: "Rechercher des produits...",
    shopByCategory: "Acheter par catégorie",
    featuredProducts: "Produits en vedette",
    viewAll: "Voir tout",
    addToCart: "Ajouter au panier",
    products_count: "Produits",
    newSeasonCollection: "Collection Nouvelle Saison",
    discoverLatest: "Découvrez les dernières tendances de la mode. Achetez une qualité premium à des prix imbattables.",
    shopNow: "Acheter maintenant",
    upTo50Off: "Jusqu'à 50% de réduction",
    limitedOffer: "Offre à durée limitée sur une sélection d'articles. Ne manquez pas!",
    viewDeals: "Voir les offres",
  },
  es: {
    home: "Inicio",
    products: "Productos",
    cart: "Carrito",
    profile: "Perfil",
    notifications: "Notificaciones",
    search: "Buscar productos...",
    shopByCategory: "Comprar por categoría",
    featuredProducts: "Productos destacados",
    viewAll: "Ver todo",
    addToCart: "Añadir al carrito",
    products_count: "Productos",
    newSeasonCollection: "Colección de Nueva Temporada",
    discoverLatest: "Descubre las últimas tendencias en moda. Compra calidad premium a precios inmejorables.",
    shopNow: "Comprar ahora",
    upTo50Off: "Hasta 50% de descuento",
    limitedOffer: "Oferta por tiempo limitado en artículos seleccionados. ¡No te lo pierdas!",
    viewDeals: "Ver ofertas",
  },
  ar: {
    home: "الصفحة الرئيسية",
    products: "المنتجات",
    cart: "عربة التسوق",
    profile: "الملف الشخصي",
    notifications: "الإشعارات",
    search: "البحث عن المنتجات...",
    shopByCategory: "تسوق حسب الفئة",
    featuredProducts: "المنتجات المميزة",
    viewAll: "عرض الكل",
    addToCart: "أضف إلى السلة",
    products_count: "منتجات",
    newSeasonCollection: "مجموعة الموسم الجديد",
    discoverLatest: "اكتشف أحدث اتجاهات الموضة. تسوق جودة عالية بأسعار لا تقبل المنافسة.",
    shopNow: "تسوق الآن",
    upTo50Off: "خصم يصل إلى 50%",
    limitedOffer: "عرض لفترة محدودة على منتجات مختارة. لا تفوت الفرصة!",
    viewDeals: "عرض العروض",
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
  const [language, setLanguageState] = useState<Language>(() => {
    const saved = localStorage.getItem("language");
    return (saved as Language) || "en";
  });

  const currency = languages[language].currency;
  const currencySymbol = languages[language].symbol;
  const countryName = languages[language].country;

  const setLanguage = (lang: Language) => {
    setLanguageState(lang);
    localStorage.setItem("language", lang);
  };

  const t = (key: keyof typeof translations.en): string => {
    return translations[language][key] || translations.en[key] || key;
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
    document.documentElement.dir = language === "ar" ? "rtl" : "ltr";
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
