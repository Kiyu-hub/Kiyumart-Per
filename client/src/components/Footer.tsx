import { Mail, Phone, MapPin, ShieldCheck, Truck, CreditCard, Clock, ArrowUp } from "lucide-react";
import { FaFacebookF, FaInstagram, FaTwitter, FaLinkedin, FaYoutube, FaTiktok, FaPinterest, FaWhatsapp } from 'react-icons/fa';
import { Button } from "@/components/ui/button";
import { useQuery } from "@tanstack/react-query";
import { Link, useRoute, useLocation } from "wouter";
import { useAuth } from "@/lib/auth";
import Logo from "@/components/Logo";

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
}

interface FooterPageItem {
  id: string;
  title: string;
  slug: string;
  content: string | null;
  url: string | null;
  group: string | null;
  storeMode: string | null;
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
  
  const { data: settings } = useQuery<PlatformSettings>({
    queryKey: ["/api/settings"],
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

  // Determine current store mode
  const isMultiVendor = settings?.isMultiVendor ?? false;
  const currentMode = isMultiVendor ? "multivendor" : "single";
  
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
        return mode === "both" || mode === currentMode;
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

  // Helper to render a footer page link — uses Wouter <Link> for internal paths to avoid page refresh
  const renderPageLink = (page: FooterPageItem) => {
    const url = page.url || `/page/${page.slug}`;
    const isExternal = url.startsWith('http://') || url.startsWith('https://');
    
    if (isExternal || page.openInNewTab) {
      return (
        <a 
          href={url}
          target="_blank"
          rel="noopener noreferrer"
          className="hover:text-primary transition-colors"
        >
          {page.title}
        </a>
      );
    }
    return (
      <Link href={url} className="hover:text-primary transition-colors">
        {page.title}
      </Link>
    );
  };

  // Trust bar items from footer pages (group: trust_bar) OR defaults
  const trustBarPages = groupedPages['trust_bar'] || [];
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
    <footer className="bg-gradient-to-b from-card to-card/95 border-t mt-16">
      {/* Trust Bar */}
      <div className="border-b bg-muted/30">
        <div className="max-w-7xl mx-auto px-4 py-6">
          <div className="grid grid-cols-2 md:grid-cols-4 gap-6 text-center">
            {trustBarPages.length > 0 ? (
              trustBarPages.slice(0, 4).map((page, i) => {
                const icons = [Truck, ShieldCheck, CreditCard, Clock];
                const Icon = icons[i % icons.length];
                return (
                  <div key={page.id} className="flex flex-col items-center gap-2">
                    <div className="w-10 h-10 rounded-full bg-primary/10 flex items-center justify-center">
                      <Icon className="h-5 w-5 text-primary" />
                    </div>
                    <div>
                      <p className="text-sm font-semibold">{page.title}</p>
                      {page.content && <p className="text-xs text-muted-foreground">{page.content}</p>}
                    </div>
                  </div>
                );
              })
            ) : (
              defaultTrustItems.map((item, i) => (
                <div key={i} className="flex flex-col items-center gap-2">
                  <div className="w-10 h-10 rounded-full bg-primary/10 flex items-center justify-center">
                    <item.icon className="h-5 w-5 text-primary" />
                  </div>
                  <div>
                    <p className="text-sm font-semibold">{item.title}</p>
                    <p className="text-xs text-muted-foreground">{item.subtitle}</p>
                  </div>
                </div>
              ))
            )}
          </div>
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
            <h4 className="font-semibold mb-4 text-foreground">
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
                  <li><Link href="/" className="hover:text-primary transition-colors">Home</Link></li>
                  <li><Link href="/products" className="hover:text-primary transition-colors">All Products</Link></li>
                  {isMultiVendor && (
                    <>
                      <li><Link href="/stores" className="hover:text-primary transition-colors">Browse Stores</Link></li>
                      <li><Link href="/become-seller" className="hover:text-primary transition-colors">Become a Seller</Link></li>
                      <li><Link href="/become-rider" className="hover:text-primary transition-colors">Become a Rider</Link></li>
                    </>
                  )}
                </>
              )}
            </ul>
          </div>

          {/* Customer Service Column — fully dynamic */}
          <div>
            <h4 className="font-semibold mb-4 text-foreground">Customer Service</h4>
            <ul className="space-y-2.5 text-muted-foreground text-sm">
              {customerServicePages.length > 0 ? (
                /* Dynamic customer service pages from admin */
                customerServicePages.map(page => (
                  <li key={page.id}>{renderPageLink(page)}</li>
                ))
              ) : (
                /* Default links when no admin pages exist */
                <>
                  <li><Link href="/support" className="hover:text-primary transition-colors">Customer Support</Link></li>
                  <li><Link href="/orders" className="hover:text-primary transition-colors">Track My Order</Link></li>
                  <li><Link href="/wishlist" className="hover:text-primary transition-colors">My Wishlist</Link></li>
                  <li><Link href="/profile" className="hover:text-primary transition-colors">My Account</Link></li>
                </>
              )}

              {/* General pages overflow into customer service if present */}
              {generalPages.slice(0, 3).map(page => (
                <li key={page.id}>{renderPageLink(page)}</li>
              ))}
            </ul>
          </div>

          {/* Contact Column */}
          <div>
            <h4 className="font-semibold mb-4 text-foreground">Contact Us</h4>
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
              <h5 className="font-medium text-sm mb-2 text-foreground">Quick Access</h5>
              <div className="flex flex-col gap-2">
                <Link href="/products">
                  <Button variant="outline" size="sm" className="w-full text-xs justify-start">
                    <ShieldCheck className="h-3.5 w-3.5 mr-2" />
                    {isMultiVendor ? "Browse All Products" : "Browse Our Products"}
                  </Button>
                </Link>
                {!isAuthenticated && (
                  <Link href="/auth">
                    <Button variant="default" size="sm" className="w-full text-xs">
                      Sign Up / Log In
                    </Button>
                  </Link>
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
