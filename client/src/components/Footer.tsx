import { Mail, Phone, MapPin, ShieldCheck, Truck, CreditCard, Clock, ArrowUp } from "lucide-react";
import { FaFacebookF, FaInstagram, FaTwitter, FaLinkedin, FaYoutube, FaTiktok, FaPinterest, FaWhatsapp } from 'react-icons/fa';
import { Button } from "@/components/ui/button";
import { useQuery } from "@tanstack/react-query";
import { Link, useRoute } from "wouter";
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

interface Category {
  id: string;
  name: string;
  slug: string;
}

interface Product {
  id: string;
  category: string;
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
  const sellerId = match ? params?.id : null;
  
  const { data: settings } = useQuery<PlatformSettings>({
    queryKey: ["/api/settings"],
  });
  
  // Fetch seller's store information if viewing a seller store page
  const { data: sellerStore } = useQuery<Store>({
    queryKey: ["/api/stores/by-seller", sellerId],
    queryFn: async () => {
      const res = await fetch(`/api/stores/by-seller/${sellerId}`);
      if (!res.ok) throw new Error("Failed to fetch store");
      return res.json();
    },
    enabled: !!sellerId,
  });
  
  // Fetch products to get categories dynamically (filtered by primary store in single-store mode)
  const { data: products = [] } = useQuery<Product[]>({
    queryKey: ["/api/products"],
  });
  
  // Fetch dynamic footer pages
  const { data: footerPages = [] } = useQuery<Array<{
    id: string;
    title: string;
    slug: string;
    url: string | null;
    group: string | null;
    openInNewTab: boolean | null;
  }>>({
    queryKey: ["/api/footer-pages"],
  });
  
  // Get unique categories from products for single-store mode
  const productCategories = Array.from(new Set(products.map(p => p.category)))
    .filter(Boolean)
    .slice(0, 3);
  
  // Group footer pages by group
  const groupedPages = footerPages.reduce((acc, page) => {
    const group = page.group || 'general';
    if (!acc[group]) acc[group] = [];
    acc[group].push(page);
    return acc;
  }, {} as Record<string, typeof footerPages>);
  
  const { user, isAuthenticated } = useAuth();

  const openSocialLink = (url?: string) => {
    if (url) {
      window.open(url, '_blank', 'noopener,noreferrer');
    }
  };

  const handleCustomerSupportClick = (e: React.MouseEvent) => {
    if (!isAuthenticated) {
      e.preventDefault();
      window.location.href = '/auth';
    }
  };

  // Use seller store info if viewing a seller store page, otherwise use platform settings
  const displayName = sellerStore?.name || settings?.platformName || "KiyuMart";
  const displayLogo = sellerStore?.logo || settings?.logo;
  const displayDescription = sellerStore?.description || settings?.footerDescription || "Your trusted fashion marketplace. Quality products, fast delivery, and excellent service.";

  return (
    <footer className="bg-gradient-to-b from-card to-card/95 border-t mt-16">
      {/* Trust Bar */}
      <div className="border-b bg-muted/30">
        <div className="max-w-7xl mx-auto px-4 py-6">
          <div className="grid grid-cols-2 md:grid-cols-4 gap-6 text-center">
            <div className="flex flex-col items-center gap-2">
              <div className="w-10 h-10 rounded-full bg-primary/10 flex items-center justify-center">
                <Truck className="h-5 w-5 text-primary" />
              </div>
              <div>
                <p className="text-sm font-semibold">Fast Delivery</p>
                <p className="text-xs text-muted-foreground">Nationwide shipping</p>
              </div>
            </div>
            <div className="flex flex-col items-center gap-2">
              <div className="w-10 h-10 rounded-full bg-primary/10 flex items-center justify-center">
                <ShieldCheck className="h-5 w-5 text-primary" />
              </div>
              <div>
                <p className="text-sm font-semibold">Secure Shopping</p>
                <p className="text-xs text-muted-foreground">100% protected payments</p>
              </div>
            </div>
            <div className="flex flex-col items-center gap-2">
              <div className="w-10 h-10 rounded-full bg-primary/10 flex items-center justify-center">
                <CreditCard className="h-5 w-5 text-primary" />
              </div>
              <div>
                <p className="text-sm font-semibold">Easy Payments</p>
                <p className="text-xs text-muted-foreground">Mobile money & cards</p>
              </div>
            </div>
            <div className="flex flex-col items-center gap-2">
              <div className="w-10 h-10 rounded-full bg-primary/10 flex items-center justify-center">
                <Clock className="h-5 w-5 text-primary" />
              </div>
              <div>
                <p className="text-sm font-semibold">24/7 Support</p>
                <p className="text-xs text-muted-foreground">Always here to help</p>
              </div>
            </div>
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
                <Button 
                  variant="outline" 
                  size="icon" 
                  className="rounded-full h-9 w-9 hover:bg-blue-600 hover:text-white hover:border-blue-600 transition-all"
                  onClick={() => openSocialLink(settings.facebookUrl)}
                  data-testid="button-facebook"
                  aria-label="Facebook"
                  title="Facebook"
                >
                  <FaFacebookF className="h-4 w-4" />
                </Button>
              )}
              {settings?.showSocialLinks !== false && settings?.instagramUrl && settings?.showInstagram !== false && (
                <Button 
                  variant="outline" 
                  size="icon"
                  className="rounded-full h-9 w-9 hover:bg-gradient-to-br hover:from-purple-500 hover:to-pink-500 hover:text-white hover:border-pink-500 transition-all"
                  onClick={() => openSocialLink(settings.instagramUrl)}
                  data-testid="button-instagram"
                  aria-label="Instagram"
                  title="Instagram"
                >
                  <FaInstagram className="h-4 w-4" />
                </Button>
              )}
              {settings?.showSocialLinks !== false && settings?.twitterUrl && settings?.showTwitter !== false && (
                <Button 
                  variant="outline" 
                  size="icon"
                  className="rounded-full h-9 w-9 hover:bg-sky-500 hover:text-white hover:border-sky-500 transition-all"
                  onClick={() => openSocialLink(settings.twitterUrl)}
                  data-testid="button-twitter"
                  aria-label="Twitter"
                  title="Twitter"
                >
                  <FaTwitter className="h-4 w-4" />
                </Button>
              )}
              {settings?.showSocialLinks !== false && settings?.linkedinUrl && settings?.showLinkedin !== false && (
                <Button variant="outline" size="icon" className="rounded-full h-9 w-9 hover:bg-blue-700 hover:text-white hover:border-blue-700 transition-all" onClick={() => openSocialLink(settings.linkedinUrl)} data-testid="button-linkedin">
                  <FaLinkedin className="h-4 w-4" />
                </Button>
              )}
              {settings?.showSocialLinks !== false && settings?.youtubeUrl && settings?.showYoutube !== false && (
                <Button variant="outline" size="icon" className="rounded-full h-9 w-9 hover:bg-red-600 hover:text-white hover:border-red-600 transition-all" onClick={() => openSocialLink(settings.youtubeUrl)} data-testid="button-youtube">
                  <FaYoutube className="h-4 w-4" />
                </Button>
              )}
              {settings?.showSocialLinks !== false && settings?.tiktokUrl && settings?.showTiktok !== false && (
                <Button variant="outline" size="icon" className="rounded-full h-9 w-9 hover:bg-black hover:text-white hover:border-black transition-all" onClick={() => openSocialLink(settings.tiktokUrl)} data-testid="button-tiktok" aria-label="TikTok" title="TikTok">
                  <FaTiktok className="h-4 w-4" />
                </Button>
              )}
              {settings?.showSocialLinks !== false && settings?.pinterestUrl && settings?.showPinterest !== false && (
                <Button variant="outline" size="icon" className="rounded-full h-9 w-9 hover:bg-red-500 hover:text-white hover:border-red-500 transition-all" onClick={() => openSocialLink(settings.pinterestUrl)} data-testid="button-pinterest" aria-label="Pinterest" title="Pinterest">
                  <FaPinterest className="h-4 w-4" />
                </Button>
              )}
              {settings?.showSocialLinks !== false && settings?.whatsappPage && settings?.showWhatsapp !== false && (
                <Button variant="outline" size="icon" className="rounded-full h-9 w-9 hover:bg-green-500 hover:text-white hover:border-green-500 transition-all" onClick={() => openSocialLink(settings.whatsappPage)} data-testid="button-whatsapp" aria-label="WhatsApp" title="WhatsApp">
                  <FaWhatsapp className="h-4 w-4" />
                </Button>
              )}
            </div>
          </div>

          {/* Quick Links / Marketplace Column */}
          <div>
            {settings?.isMultiVendor ? (
              <>
                <h4 className="font-semibold mb-4 text-foreground">Marketplace</h4>
                <ul className="space-y-2.5 text-muted-foreground text-sm">
                  <li><Link href="/" className="hover:text-primary transition-colors" data-testid="link-home">Home</Link></li>
                  <li><Link href="/products" className="hover:text-primary transition-colors" data-testid="link-all-products">All Products</Link></li>
                  <li><Link href="/stores" className="hover:text-primary transition-colors" data-testid="link-stores">Browse Stores</Link></li>
                  <li><Link href="/products" className="hover:text-primary transition-colors" data-testid="link-deals">Today's Deals</Link></li>
                  {(!isAuthenticated || user?.role === 'buyer') && (
                    <li><Link href="/become-seller" className="hover:text-primary transition-colors" data-testid="link-become-seller">Become a Seller</Link></li>
                  )}
                  {(!isAuthenticated || user?.role === 'buyer') && (
                    <li><Link href="/become-rider" className="hover:text-primary transition-colors" data-testid="link-become-rider">Become a Rider</Link></li>
                  )}
                </ul>
              </>
            ) : (
              <>
                <h4 className="font-semibold mb-4 text-foreground">Shop</h4>
                <ul className="space-y-2.5 text-muted-foreground text-sm">
                  <li><Link href="/" className="hover:text-primary transition-colors" data-testid="link-home">Home</Link></li>
                  {productCategories.length > 0 ? (
                    productCategories.map((category) => (
                      <li key={category}>
                        <Link 
                          href={`/category/${category.toLowerCase()}`} 
                          className="hover:text-primary transition-colors capitalize" 
                          data-testid={`link-${category.toLowerCase()}`}
                        >
                          {category}
                        </Link>
                      </li>
                    ))
                  ) : (
                    <li><Link href="/products" className="hover:text-primary transition-colors" data-testid="link-all-products">All Products</Link></li>
                  )}
                  <li><Link href="/products" className="hover:text-primary transition-colors" data-testid="link-new-arrivals-foot">New Arrivals</Link></li>
                </ul>
              </>
            )}
          </div>

          {/* Customer Service Column */}
          {groupedPages['customer_service'] && groupedPages['customer_service'].length > 0 ? (
            <div>
              <h4 className="font-semibold mb-4 text-foreground">Customer Service</h4>
              <ul className="space-y-2.5 text-muted-foreground text-sm">
                {groupedPages['customer_service'].map(page => (
                  <li key={page.id}>
                    {page.url ? (
                      <a 
                        href={page.url}
                        target={page.openInNewTab ? "_blank" : undefined}
                        rel={page.openInNewTab ? "noopener noreferrer" : undefined}
                        className="hover:text-primary transition-colors"
                        data-testid={`link-${page.slug}`}
                      >
                        {page.title}
                      </a>
                    ) : (
                      <Link 
                        href={`/page/${page.slug}`}
                        className="hover:text-primary transition-colors"
                        data-testid={`link-${page.slug}`}
                      >
                        {page.title}
                      </Link>
                    )}
                  </li>
                ))}
                {/* Always show these essentials */}
                {(!user || (user.role !== 'super_admin' && user.role !== 'admin' && user.role !== 'agent')) && (
                  <li>
                    <Link 
                      href={isAuthenticated ? "/support" : "/auth"} 
                      className="hover:text-primary transition-colors"
                      data-testid="link-support"
                    >
                      Customer Support
                    </Link>
                  </li>
                )}
              </ul>
            </div>
          ) : (
            <div>
              <h4 className="font-semibold mb-4 text-foreground">Customer Service</h4>
              <ul className="space-y-2.5 text-muted-foreground text-sm">
                {(!user || (user.role !== 'super_admin' && user.role !== 'admin' && user.role !== 'agent')) && (
                  <li>
                    <Link 
                      href={isAuthenticated ? "/support" : "/auth"} 
                      className="hover:text-primary transition-colors"
                      data-testid="link-support"
                    >
                      Customer Support
                    </Link>
                  </li>
                )}
                <li>
                  <Link 
                    href={isAuthenticated ? "/orders" : "/auth"} 
                    className="hover:text-primary transition-colors" 
                    data-testid="link-orders"
                  >
                    Track My Order
                  </Link>
                </li>
                <li>
                  <Link 
                    href={isAuthenticated ? "/wishlist" : "/auth"} 
                    className="hover:text-primary transition-colors" 
                    data-testid="link-wishlist"
                  >
                    My Wishlist
                  </Link>
                </li>
                <li>
                  <Link 
                    href={isAuthenticated ? "/profile" : "/auth"} 
                    className="hover:text-primary transition-colors" 
                    data-testid="link-profile"
                  >
                    My Account
                  </Link>
                </li>
                <li>
                  <Link 
                    href={isAuthenticated ? "/notifications" : "/auth"} 
                    className="hover:text-primary transition-colors"
                    data-testid="link-notifications"
                  >
                    Notifications
                  </Link>
                </li>
                {/* Dynamic footer pages from other groups */}
                {Object.entries(groupedPages)
                  .filter(([group]) => group !== 'customer_service')
                  .flatMap(([_, pages]) => pages)
                  .slice(0, 3)
                  .map(page => (
                    <li key={page.id}>
                      {page.url ? (
                        <a 
                          href={page.url}
                          target={page.openInNewTab ? "_blank" : undefined}
                          rel={page.openInNewTab ? "noopener noreferrer" : undefined}
                          className="hover:text-primary transition-colors"
                        >
                          {page.title}
                        </a>
                      ) : (
                        <Link href={`/page/${page.slug}`} className="hover:text-primary transition-colors">
                          {page.title}
                        </Link>
                      )}
                    </li>
                  ))
                }
              </ul>
            </div>
          )}

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

            {/* Newsletter/CTA */}
            <div className="mt-6">
              <h5 className="font-medium text-sm mb-2 text-foreground">Quick Access</h5>
              <div className="flex flex-col gap-2">
                <Link href="/products">
                  <Button variant="outline" size="sm" className="w-full text-xs justify-start">
                    <ShieldCheck className="h-3.5 w-3.5 mr-2" />
                    Browse All Products
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
              &copy; {new Date().getFullYear()} {settings?.platformName || "KiyuMart"}. All rights reserved.
            </p>
            <div className="flex items-center gap-4 text-xs text-muted-foreground">
              {footerPages.filter(p => p.group === 'legal').length > 0 ? (
                footerPages.filter(p => p.group === 'legal').map(page => (
                  <Link key={page.id} href={page.url || `/page/${page.slug}`} className="hover:text-primary transition-colors">
                    {page.title}
                  </Link>
                ))
              ) : (
                <>
                  <Link href="/page/privacy-policy" className="hover:text-primary transition-colors">Privacy Policy</Link>
                  <span className="text-muted-foreground/40">|</span>
                  <Link href="/page/terms-of-service" className="hover:text-primary transition-colors">Terms of Service</Link>
                  <span className="text-muted-foreground/40">|</span>
                  <Link href="/page/return-policy" className="hover:text-primary transition-colors">Return Policy</Link>
                </>
              )}
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
