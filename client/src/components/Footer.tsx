import { Facebook, Instagram, Twitter, Mail, Phone, MapPin } from "lucide-react";
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
  
  const { isAuthenticated } = useAuth();

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
    <footer className="bg-card border-t mt-20">
      <div className="max-w-7xl mx-auto px-4 py-12">
        <div className={`grid grid-cols-1 ${settings?.isMultiVendor ? 'md:grid-cols-3' : 'md:grid-cols-2 lg:grid-cols-4'} gap-8`}>
          <div className={settings?.isMultiVendor ? 'md:col-span-1' : ''}>
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
            <p className="text-muted-foreground mb-4">
              {displayDescription}
            </p>
            <div className="flex gap-2">
              {settings?.facebookUrl && (
                <Button 
                  variant="ghost" 
                  size="icon" 
                  onClick={() => openSocialLink(settings.facebookUrl)}
                  data-testid="button-facebook"
                >
                  <Facebook className="h-5 w-5" />
                </Button>
              )}
              {settings?.instagramUrl && (
                <Button 
                  variant="ghost" 
                  size="icon"
                  onClick={() => openSocialLink(settings.instagramUrl)}
                  data-testid="button-instagram"
                >
                  <Instagram className="h-5 w-5" />
                </Button>
              )}
              {settings?.twitterUrl && (
                <Button 
                  variant="ghost" 
                  size="icon"
                  onClick={() => openSocialLink(settings.twitterUrl)}
                  data-testid="button-twitter"
                >
                  <Twitter className="h-5 w-5" />
                </Button>
              )}
            </div>
          </div>

          <div>
            {settings?.isMultiVendor ? (
              <>
                <h4 className="font-semibold mb-4">Marketplace</h4>
                <ul className="space-y-2 text-muted-foreground">
                  <li><Link href="/" className="hover:text-foreground transition-colors" data-testid="link-home">Home</Link></li>
                  <li><Link href="/products" className="hover:text-foreground transition-colors" data-testid="link-all-products">All Products</Link></li>
                  <li><Link href="/stores" className="hover:text-foreground transition-colors" data-testid="link-stores">Browse Stores</Link></li>
                  <li><Link href="/become-seller" className="hover:text-foreground transition-colors" data-testid="link-become-seller">Become a Seller</Link></li>
                </ul>
              </>
            ) : (
              <>
                <h4 className="font-semibold mb-4">Shop</h4>
                <ul className="space-y-2 text-muted-foreground">
                  <li><Link href="/" className="hover:text-foreground transition-colors" data-testid="link-home">Home</Link></li>
                  {productCategories.length > 0 ? (
                    productCategories.map((category) => (
                      <li key={category}>
                        <Link 
                          href={`/category/${category.toLowerCase()}`} 
                          className="hover:text-foreground transition-colors capitalize" 
                          data-testid={`link-${category.toLowerCase()}`}
                        >
                          {category}
                        </Link>
                      </li>
                    ))
                  ) : (
                    <>
                      <li><Link href="/products" className="hover:text-foreground transition-colors" data-testid="link-all-products">All Products</Link></li>
                    </>
                  )}
                </ul>
              </>
            )}
          </div>

          {groupedPages['customer_service'] && groupedPages['customer_service'].length > 0 ? (
            <div>
              <h4 className="font-semibold mb-4">Customer Service</h4>
              <ul className="space-y-2 text-muted-foreground">
                {groupedPages['customer_service'].map(page => (
                  <li key={page.id}>
                    {page.url ? (
                      <a 
                        href={page.url}
                        target={page.openInNewTab ? "_blank" : undefined}
                        rel={page.openInNewTab ? "noopener noreferrer" : undefined}
                        className="hover:text-foreground transition-colors"
                        data-testid={`link-${page.slug}`}
                      >
                        {page.title}
                      </a>
                    ) : (
                      <Link 
                        href={`/page/${page.slug}`}
                        className="hover:text-foreground transition-colors"
                        data-testid={`link-${page.slug}`}
                      >
                        {page.title}
                      </Link>
                    )}
                  </li>
                ))}
              </ul>
            </div>
          ) : (
            <div>
              <h4 className="font-semibold mb-4">Customer Service</h4>
              <ul className="space-y-2 text-muted-foreground">
                <li>
                  <Link 
                    href={isAuthenticated ? "/support" : "/auth"} 
                    className="hover:text-foreground transition-colors"
                    data-testid="link-support"
                  >
                    Customer Support
                  </Link>
                </li>
                <li>
                  <Link 
                    href={isAuthenticated ? "/orders" : "/auth"} 
                    className="hover:text-foreground transition-colors" 
                    data-testid="link-orders"
                  >
                    My Orders
                  </Link>
                </li>
                <li>
                  <Link 
                    href={isAuthenticated ? "/wishlist" : "/auth"} 
                    className="hover:text-foreground transition-colors" 
                    data-testid="link-wishlist"
                  >
                    Wishlist
                  </Link>
                </li>
              </ul>
            </div>
          )}

          <div>
            <h4 className="font-semibold mb-4">Contact</h4>
            <ul className="space-y-3 text-muted-foreground">
              <li className="flex items-center gap-2">
                <Phone className="h-4 w-4" />
                <span>{settings?.contactPhone || "+233 XX XXX XXXX"}</span>
              </li>
              <li className="flex items-center gap-2">
                <Mail className="h-4 w-4" />
                <span>{settings?.contactEmail || "support@kiyumart.com"}</span>
              </li>
              <li className="flex items-center gap-2">
                <MapPin className="h-4 w-4" />
                <span>{settings?.contactAddress || "Accra, Ghana"}</span>
              </li>
            </ul>
          </div>
        </div>

        <div className="border-t mt-8 pt-8 text-center text-muted-foreground">
          <p>&copy; 2024 {settings?.platformName || "KiyuMart"}. All rights reserved.</p>
        </div>
      </div>
    </footer>
  );
}
