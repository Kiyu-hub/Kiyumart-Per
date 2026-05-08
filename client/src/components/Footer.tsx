import { Mail, Phone, MapPin, ShieldCheck, Truck, CreditCard, Clock, ArrowUp,
  Heart, Star, Zap, Award, Gift, Shield, Lock, Headphones, Package, Percent, ThumbsUp, CheckCircle, Users, Sparkles, Flame, Gem, Crown, BadgeCheck, Wallet, RefreshCcw, LifeBuoy, Rocket, Timer, Tag, ShoppingBag, ShoppingCart, Home as HomeIcon, Search, Bell, MessageCircle, Wifi, Sun, Moon, BarChart, Key, Fingerprint, Globe as Globe2Icon, Umbrella, Coffee, Music, Camera, Target, Compass, Anchor, Feather, Leaf, Droplets, Wind, DollarSign, type LucideIcon
} from "lucide-react";
import { FaFacebookF, FaInstagram, FaTwitter, FaLinkedin, FaYoutube, FaTiktok, FaPinterest, FaWhatsapp } from 'react-icons/fa';
import { Button } from "@/components/ui/button";
import { useQuery } from "@tanstack/react-query";
import { useRoute, useLocation } from "wouter";
import { useAuth } from "@/lib/auth";
import Logo from "@/components/Logo";
import { usePlatformSettings } from "@/hooks/usePlatformSettings";

interface PlatformSettings {
  platformName: string;
  logo?: string;
  contactPhone: string;
  contactEmail: string;
  contactAddress: string;
  facebookUrl?: string;
  instagramUrl?: string;
  twitterUrl?: string;
  linkedinUrl?: string;
  youtubeUrl?: string;
  tiktokUrl?: string;
  pinterestUrl?: string;
  whatsappPage?: string;
  showSocialLinks?: boolean;
  showFacebook?: boolean;
  showInstagram?: boolean;
  showTwitter?: boolean;
  showLinkedin?: boolean;
  showYoutube?: boolean;
  showTiktok?: boolean;
  showPinterest?: boolean;
  showWhatsapp?: boolean;
  footerDescription: string;
  isMultiVendor?: boolean;
  allowRiderRegistration?: boolean;
}

interface FooterPageItem {
  id: string;
  title: string;
  slug: string;
  content: string | null;
  url: string | null;
  group: string | null;
  storeMode: string | null;
  icon: string | null;
  displayOrder: number | null;
  openInNewTab: boolean | null;
}

interface Store {
  id: string;
  name: string;
  description?: string;
  logo?: string;
  banner?: string;
  primarySellerId: string;
}

export default function Footer() {
  const [match, params] = useRoute("/sellers/:id");
  const [, navigate] = useLocation();
  const sellerId = match ? params?.id : null;
  const { isExternalRiderSystemEnabled } = usePlatformSettings();

  const navigateInternal = (path: string) => {
    scrollToTop();
    navigate(path);
  };

  const renderInternalLink = (path: string, label: React.ReactNode, className = "hover:text-primary transition-colors") => (
    <a
      href={path}
      onClick={(event) => {
        event.preventDefault();
        navigateInternal(path);
      }}
      className={className}
    >
      {label}
    </a>
  );
  
  const { data: settings } = useQuery<PlatformSettings>({
    queryKey: ["/api/platform-settings"],
  });
  
  const { data: sellerStore } = useQuery<Store>({
    queryKey: ["/api/stores/by-seller", sellerId],
    queryFn: async () => {
      const res = await fetch(`/api/stores/by-seller/${sellerId}`);
      if (!res.ok) throw new Error("Failed to fetch store");
      return res.json();
    },
    enabled: !!sellerId,
  });
  
  // Fetch dynamic footer pages
  const { data: allFooterPages = [] } = useQuery<FooterPageItem[]>({
    queryKey: ["/api/footer-pages"],
  });
  
  const { user, isAuthenticated } = useAuth();
  const scrollToTop = () => {
    window.scrollTo({ top: 0, left: 0, behavior: "auto" });
    document
      .querySelectorAll<HTMLElement>("[data-route-scroll-container]")
      .forEach((el) => el.scrollTo({ top: 0, left: 0, behavior: "auto" }));
  };

  // Determine current store mode
  const isMultiVendor = settings?.isMultiVendor ?? false;
  const currentMode = isMultiVendor ? "multivendor" : "single";
  const shouldHideRiderLink = (value?: string | null) => {
    const normalized = String(value || "").toLowerCase().trim();
    if (!normalized) return false;
    const mentionsRider =
      normalized.includes("become-rider") ||
      normalized.includes("become rider") ||
      normalized.includes("rider");
    return mentionsRider && (!settings?.allowRiderRegistration || isExternalRiderSystemEnabled);
  };
  
  // Group all pages first, then apply mode filtering per section:
  // - legal: always show all items regardless of store mode
  // - trust_bar, quick_links, customer_service, general: strict mode filtering
  const allGrouped = allFooterPages.reduce((acc, page) => {
    const group = page.group || 'general';
    if (!acc[group]) acc[group] = [];
    acc[group].push(page);
    return acc;
  }, {} as Record<string, FooterPageItem[]>);

  // Apply mode filtering per group
  const groupedPages: Record<string, FooterPageItem[]> = {};
  for (const [group, pages] of Object.entries(allGrouped)) {
    if (group === 'legal') {
      // Legal pages are shared across all store modes
      groupedPages[group] = pages;
    } else {
      // All other groups: strict mode filtering
      groupedPages[group] = pages.filter(page => {
        const mode = page.storeMode || "both";
        return (mode === "both" || mode === currentMode) && !shouldHideRiderLink(page.url || page.slug || page.title);
      });
    }
  }

  // Sort pages within each group by displayOrder
  Object.values(groupedPages).forEach(pages => {
    pages.sort((a, b) => (a.displayOrder || 0) - (b.displayOrder || 0));
  });

  const openSocialLink = (url?: string) => {
    if (url) window.open(url, '_blank', 'noopener,noreferrer');
  };

  // Use seller store info if viewing a seller store page
  const displayName = sellerStore?.name || settings?.platformName || "KiyuMart";
  const displayLogo = sellerStore?.logo || settings?.logo;
  const displayDescription = sellerStore?.description || settings?.footerDescription || "Your trusted fashion marketplace. Quality products, fast delivery, and excellent service.";

  // Auto-detect URLs in text and convert to clickable links
  const autoLinkify = (text: string) => {
    const urlRegex = /(https?:\/\/[^\s<]+)/g;
    const parts = text.split(urlRegex);
    if (parts.length === 1) return text;
    return parts.map((part, i) =>
      urlRegex.test(part) ? (
        <a key={i} href={part} target="_blank" rel="noopener noreferrer" className="text-primary underline hover:text-primary/80 transition-colors">{part}</a>
      ) : part
    );
  };

  // Icon map for trust bar — maps icon name strings to Lucide components
  const iconMap: Record<string, LucideIcon> = {
    Truck, ShieldCheck, CreditCard, Clock, Heart, Star, Zap, Award, Gift, Shield, Lock,
    Headphones, Phone, MapPin, Package, Percent, ThumbsUp, CheckCircle, Users, Sparkles,
    Flame, Gem, Crown, BadgeCheck, Wallet, RefreshCcw, LifeBuoy, Rocket, Timer, Tag,
    ShoppingBag, ShoppingCart, Home: HomeIcon, Search, Bell, MessageCircle, Wifi, Sun, Moon,
    BarChart, Key, Fingerprint, Globe2: Globe2Icon, Umbrella, Coffee, Music, Camera, Target,
    Compass, Anchor, Feather, Leaf, Droplets, Wind, DollarSign, Mail,
  };
  const fallbackIcons: LucideIcon[] = [Truck, ShieldCheck, CreditCard, Clock];

  // Helper to render a footer page link — uses Wouter <Link> for internal paths to avoid page refresh
  const renderPageLink = (page: FooterPageItem) => {
    const raw = (page.url || `/page/${page.slug}`).trim();
    const isProtocol = /^mailto:|^tel:/i.test(raw);
    const isHttp = /^https?:\/\//i.test(raw) || /^\/\//.test(raw);

    let normalized = raw;
    if (!isHttp && !isProtocol && !raw.startsWith("#")) {
      if (!raw.startsWith("/")) normalized = `/${raw}`;
    }

    const origin = typeof window !== "undefined" ? window.location.origin : "";
    const isInternal = normalized.startsWith("/") || normalized.startsWith("#") || (origin ? normalized.startsWith(origin) : false);

    if (!isInternal || isProtocol || page.openInNewTab) {
      return (
        <a
          href={normalized}
          target={page.openInNewTab || !isInternal ? "_blank" : undefined}
          rel={page.openInNewTab || !isInternal ? "noopener noreferrer" : undefined}
          className="hover:text-primary transition-colors"
        >
          {page.title}
        </a>
      );
    }

    const href = origin && normalized.startsWith(origin) ? normalized.replace(origin, "") : normalized;

    return renderInternalLink(href, page.title);
  };

  // Trust bar items from footer pages (group: trust_bar) OR defaults
  // Prioritize mode-specific items, then fill remaining slots from "both" mode items
  // No limit — display all items, grid will adapt
  const allTrustBarPages = groupedPages['trust_bar'] || [];
  const modeSpecificTrust = allTrustBarPages.filter(p => p.storeMode === currentMode);
  const bothModeTrust = allTrustBarPages.filter(p => (p.storeMode || 'both') === 'both');
  const trustBarPages = [...modeSpecificTrust, ...bothModeTrust];
  const defaultTrustItems = [
    { icon: Truck, title: "Fast Delivery", subtitle: "Nationwide shipping" },
    { icon: ShieldCheck, title: "Secure Shopping", subtitle: "100% protected payments" },
    { icon: CreditCard, title: "Easy Payments", subtitle: "Mobile money & cards" },
    { icon: Clock, title: "24/7 Support", subtitle: "Always here to help" },
  ];

  // Quick Links / Marketplace pages
  const quickLinkPages = groupedPages['quick_links'] || [];
  
  // Customer Service pages
  const customerServicePages = groupedPages['customer_service'] || [];
  
  // Legal pages (bottom bar)
  const legalPages = groupedPages['legal'] || [];

  // General / other pages (fallback)
  const generalPages = groupedPages['general'] || [];

  return (
    <footer className="hidden md:block bg-gradient-to-b from-card to-card/95 border-t mt-16">
      {/* Trust Bar */}
      <div className="border-b bg-muted/30">
        <div className="max-w-7xl mx-auto px-4 py-6">
          {trustBarPages.length > 0 ? (
            <div
              className="grid gap-6 text-center"
              style={{
                gridTemplateColumns: `repeat(${Math.min(trustBarPages.length, 6)}, minmax(0, 1fr))`,
              }}
            >
              {trustBarPages.map((page, i) => {
                const Icon = (page.icon && iconMap[page.icon]) || fallbackIcons[i % fallbackIcons.length];
                return (
                  <div key={page.id} className="flex flex-col items-center gap-2">
                    <div className="w-10 h-10 rounded-full bg-primary/10 flex items-center justify-center">
                      <Icon className="h-5 w-5 text-primary" />
                    </div>
                    <div>
                      <p className="text-sm font-semibold">{page.title}</p>
                      {page.content && <p className="text-xs text-muted-foreground">{autoLinkify(page.content)}</p>}
                    </div>
                  </div>
                );
              })}
            </div>
          ) : (
            <div className="grid grid-cols-2 md:grid-cols-4 gap-6 text-center">
              {defaultTrustItems.map((item, i) => (
                <div key={i} className="flex flex-col items-center gap-2">
                  <div className="w-10 h-10 rounded-full bg-primary/10 flex items-center justify-center">
                    <item.icon className="h-5 w-5 text-primary" />
                  </div>
                  <div>
                    <p className="text-sm font-semibold">{item.title}</p>
                    <p className="text-xs text-muted-foreground">{item.subtitle}</p>
                  </div>
                </div>
              ))}
            </div>
          )}
        </div>
      </div>

      {/* Main Footer Content */}
      <div className="max-w-7xl mx-auto px-4 py-12">
        <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-5 gap-8">
          {/* Brand Column */}
          <div className="sm:col-span-2 lg:col-span-2">
            {displayLogo ? (
              <img 
                src={displayLogo}
                alt={displayName}
                className="h-10 w-auto mb-4"
                data-testid="img-footer-logo"
              />
            ) : (
              <div className="flex items-center mb-4">
                <Logo size="lg" variant="auto" />
              </div>
            )}
            <p className="text-muted-foreground mb-5 max-w-sm leading-relaxed">
              {displayDescription}
            </p>
            
            {/* Social Links */}
            <div className="flex flex-wrap gap-2">
              {settings?.showSocialLinks !== false && settings?.facebookUrl && settings?.showFacebook !== false && (
                <Button variant="outline" size="icon" className="rounded-full h-9 w-9 hover:bg-blue-600 hover:text-white hover:border-blue-600 transition-all" onClick={() => openSocialLink(settings.facebookUrl)} aria-label="Facebook" title="Facebook">
                  <FaFacebookF className="h-4 w-4" />
                </Button>
              )}
              {settings?.showSocialLinks !== false && settings?.instagramUrl && settings?.showInstagram !== false && (
                <Button variant="outline" size="icon" className="rounded-full h-9 w-9 hover:bg-gradient-to-br hover:from-purple-500 hover:to-pink-500 hover:text-white hover:border-pink-500 transition-all" onClick={() => openSocialLink(settings.instagramUrl)} aria-label="Instagram" title="Instagram">
                  <FaInstagram className="h-4 w-4" />
                </Button>
              )}
              {settings?.showSocialLinks !== false && settings?.twitterUrl && settings?.showTwitter !== false && (
                <Button variant="outline" size="icon" className="rounded-full h-9 w-9 hover:bg-sky-500 hover:text-white hover:border-sky-500 transition-all" onClick={() => openSocialLink(settings.twitterUrl)} aria-label="Twitter" title="Twitter">
                  <FaTwitter className="h-4 w-4" />
                </Button>
              )}
              {settings?.showSocialLinks !== false && settings?.linkedinUrl && settings?.showLinkedin !== false && (
                <Button variant="outline" size="icon" className="rounded-full h-9 w-9 hover:bg-blue-700 hover:text-white hover:border-blue-700 transition-all" onClick={() => openSocialLink(settings.linkedinUrl)} aria-label="LinkedIn" title="LinkedIn">
                  <FaLinkedin className="h-4 w-4" />
                </Button>
              )}
              {settings?.showSocialLinks !== false && settings?.youtubeUrl && settings?.showYoutube !== false && (
                <Button variant="outline" size="icon" className="rounded-full h-9 w-9 hover:bg-red-600 hover:text-white hover:border-red-600 transition-all" onClick={() => openSocialLink(settings.youtubeUrl)} aria-label="YouTube" title="YouTube">
                  <FaYoutube className="h-4 w-4" />
                </Button>
              )}
              {settings?.showSocialLinks !== false && settings?.tiktokUrl && settings?.showTiktok !== false && (
                <Button variant="outline" size="icon" className="rounded-full h-9 w-9 hover:bg-black hover:text-white hover:border-black transition-all" onClick={() => openSocialLink(settings.tiktokUrl)} aria-label="TikTok" title="TikTok">
                  <FaTiktok className="h-4 w-4" />
                </Button>
              )}
              {settings?.showSocialLinks !== false && settings?.pinterestUrl && settings?.showPinterest !== false && (
                <Button variant="outline" size="icon" className="rounded-full h-9 w-9 hover:bg-red-500 hover:text-white hover:border-red-500 transition-all" onClick={() => openSocialLink(settings.pinterestUrl)} aria-label="Pinterest" title="Pinterest">
                  <FaPinterest className="h-4 w-4" />
                </Button>
              )}
              {settings?.showSocialLinks !== false && settings?.whatsappPage && settings?.showWhatsapp !== false && (
                <Button variant="outline" size="icon" className="rounded-full h-9 w-9 hover:bg-green-500 hover:text-white hover:border-green-500 transition-all" onClick={() => openSocialLink(settings.whatsappPage)} aria-label="WhatsApp" title="WhatsApp">
                  <FaWhatsapp className="h-4 w-4" />
                </Button>
              )}
            </div>
          </div>

          {/* Quick Links Column — fully dynamic */}
          <div>
            <h4 className="font-bold text-base mb-4 text-foreground">
              {isMultiVendor ? "Marketplace" : "Quick Links"}
            </h4>
            <ul className="space-y-2.5 text-muted-foreground text-sm">
              {quickLinkPages.length > 0 ? (
                /* Render dynamic quick link pages from admin */
                quickLinkPages.map(page => (
                  <li key={page.id}>{renderPageLink(page)}</li>
                ))
              ) : (
                /* Default links when no admin pages exist */
                <>
                  <li>{renderInternalLink("/", "Home")}</li>
                  <li>{renderInternalLink("/products", "All Products")}</li>
                  {isMultiVendor && (
                    <>
                      <li>{renderInternalLink("/stores", "Browse Stores")}</li>
                      {!(isAuthenticated && user?.role === "seller") && (
                        <li>{renderInternalLink("/become-seller", "Become a Seller")}</li>
                      )}
                      {settings?.allowRiderRegistration && !isExternalRiderSystemEnabled && (
                        <li>{renderInternalLink("/become-rider", "Become a Rider")}</li>
                      )}
                    </>
                  )}
                </>
              )}
            </ul>
          </div>

          {/* Customer Service Column — fully dynamic */}
          <div>
            <h4 className="font-bold text-base mb-4 text-foreground">Customer Service</h4>
            <ul className="space-y-2.5 text-muted-foreground text-sm">
              {customerServicePages.length > 0 ? (
                /* Dynamic customer service pages from admin */
                customerServicePages.map(page => (
                  <li key={page.id}>{renderPageLink(page)}</li>
                ))
              ) : (
                /* Default links when no admin pages exist */
                <>
                  <li>{renderInternalLink("/support", "Customer Support")}</li>
                  <li>{renderInternalLink("/orders", "Track My Order")}</li>
                  <li>{renderInternalLink("/wishlist", "My Wishlist")}</li>
                  <li>{renderInternalLink("/profile", "My Account")}</li>
                </>
              )}

              {/* General pages overflow into customer service if present */}
                {generalPages.map(page => (
                <li key={page.id}>{renderPageLink(page)}</li>
              ))}
            </ul>
          </div>

          {/* Contact Column */}
          <div>
            <h4 className="font-bold text-base mb-4 text-foreground">Contact Us</h4>
            <ul className="space-y-3.5 text-muted-foreground text-sm">
              <li className="flex items-start gap-2.5">
                <Phone className="h-4 w-4 mt-0.5 shrink-0 text-primary" />
                <span>{settings?.contactPhone || "+233 XX XXX XXXX"}</span>
              </li>
              <li className="flex items-start gap-2.5">
                <Mail className="h-4 w-4 mt-0.5 shrink-0 text-primary" />
                <span className="break-all">{settings?.contactEmail || "support@kiyumart.com"}</span>
              </li>
              <li className="flex items-start gap-2.5">
                <MapPin className="h-4 w-4 mt-0.5 shrink-0 text-primary" />
                <span>{settings?.contactAddress || "Accra, Ghana"}</span>
              </li>
            </ul>

            <div className="mt-6">
              <h5 className="font-bold text-sm mb-2 text-foreground">Quick Access</h5>
              <div className="flex flex-col gap-2">
                <a
                  href={isMultiVendor ? "/products" : "/"}
                  onClick={(event) => {
                    event.preventDefault();
                    navigateInternal(isMultiVendor ? "/products" : "/");
                  }}
                >
                  <Button variant="outline" size="sm" className="w-full text-xs justify-start">
                    <ShieldCheck className="h-3.5 w-3.5 mr-2" />
                    {isMultiVendor ? "Browse All Products" : "Browse Our Products"}
                  </Button>
                </a>
                {!isAuthenticated && (
                  <a
                    href="/auth"
                    onClick={(event) => {
                      event.preventDefault();
                      navigateInternal("/auth");
                    }}
                  >
                    <Button variant="default" size="sm" className="w-full text-xs">
                      Sign Up / Log In
                    </Button>
                  </a>
                )}
              </div>
            </div>
          </div>
        </div>
      </div>

      {/* Bottom Bar */}
      <div className="border-t bg-muted/20">
        <div className="max-w-7xl mx-auto px-4 py-5">
          <div className="flex flex-col md:flex-row items-center justify-between gap-4">
            <p className="text-xs text-muted-foreground text-center md:text-left">
              &copy; 2024 {settings?.platformName || "KiyuMart"}. All rights reserved.
            </p>
            <div className="flex items-center gap-4 text-xs text-muted-foreground">
              {legalPages.map(page => (
                <span key={page.id}>{renderPageLink(page)}</span>
              ))}
            </div>
            <Button 
              variant="ghost" 
              size="sm" 
              className="text-xs gap-1.5 text-muted-foreground hover:text-primary"
              onClick={() => window.scrollTo({ top: 0, behavior: 'smooth' })}
            >
              <ArrowUp className="h-3.5 w-3.5" />
              Back to top
            </Button>
          </div>
        </div>
      </div>
    </footer>
  );
}
