import { useEffect } from "react";
import { useLocation } from "wouter";
import { useMobileDevice } from "@/hooks/useMobileDevice";
import { MobileCart } from "@/pages/mobile/MobileCart";
import { useQuery, useMutation } from "@tanstack/react-query";
import { fetchSameOriginJson, queryClient } from "@/lib/queryClient";
import { useAuth } from "@/lib/auth";
import { useToast } from "@/hooks/use-toast";
import { useLanguage } from "@/contexts/LanguageContext";
import { calculateProductPricingSummary, getCurrentSellingPrice, getOriginalDisplayPrice } from "@/lib/pricing";
import { Button } from "@/components/ui/button";
import { Card } from "@/components/ui/card";
import { Minus, Plus, Trash2, ShoppingBag, ArrowLeft } from "lucide-react";
import Header from "@/components/Header";
import Footer from "@/components/Footer";
import ThemeToggle from "@/components/ThemeToggle";

interface CartItem {
  id: string;
  productId: string;
  productName: string;
  productImage: string;
  price: string;
  quantity: number;
  variantId: string | null;
  selectedColor: string | null;
  selectedSize: string | null;
  selectedImageIndex: number | null;
  availableStock?: number;
  requiresVariantSelection?: boolean;
  createdAt: string;
}

interface Product {
  id: string;
  name: string;
  price: string;
  costPrice?: string;
  discount?: number | null;
  images: string[];
  category: string;
  stock: number;
}

export default function Cart() {
  const [, navigate] = useLocation();
  const { isAuthenticated } = useAuth();
  const { toast } = useToast();
  const { currencySymbol, formatPrice } = useLanguage();

  useEffect(() => {
    if (!isAuthenticated) {
      navigate("/auth");
    }
  }, [isAuthenticated, navigate]);

  const { data: cartItems = [], isLoading: cartLoading } = useQuery<CartItem[]>({
    queryKey: ["/api/cart"],
    enabled: isAuthenticated,
    queryFn: async () =>
      fetchSameOriginJson("/api/cart", {
        cache: "no-store",
      }),
    refetchOnMount: "always",
    refetchOnWindowFocus: true,
    refetchOnReconnect: true,
    staleTime: 0,
  });

  const { data: cartProducts = [], isLoading: productsLoading } = useQuery<Product[]>({
    queryKey: ["/api/cart/products", cartItems.map(item => item.productId).sort().join(",")],
    queryFn: async () => {
      if (!cartItems.length) return [];
      const productIds = cartItems.map(item => item.productId);
        const productsData = await Promise.all(
          productIds.map(async (id) => {
            return fetchSameOriginJson<Product>(`/api/products/${id}`, {
              cache: "no-store",
            });
          })
        );
        return productsData;
    },
    enabled: cartItems.length > 0,
  });

  const updateCartMutation = useMutation({
    mutationFn: async ({ id, quantity }: { id: string; quantity: number }) => {
      return fetchSameOriginJson(`/api/cart/${id}`, {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ quantity }),
      });
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["/api/cart"] });
    },
    onError: (error: any) => {
      const message = String(error?.message || "").trim();
      queryClient.invalidateQueries({ queryKey: ["/api/cart"] });
      toast({
        title: "Cart update not completed",
        description: /only\s+\d+|out of stock|maximum available quantity/i.test(message)
          ? "That quantity is no longer available. The cart has been refreshed."
          : "Please try again in a moment.",
        variant: "destructive",
      });
    },
  });

  const removeFromCartMutation = useMutation({
    mutationFn: async (id: string) => {
      return fetchSameOriginJson(`/api/cart/${id}`, {
        method: "DELETE",
      });
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["/api/cart"] });
      toast({
        title: "Removed from cart",
        description: "Item has been removed from your cart",
      });
    },
  });

  const cartItemsWithProducts = cartItems.map(cartItem => {
    const product = cartProducts.find(p => p.id === cartItem.productId);
    const sellingPrice = getCurrentSellingPrice({
      price: product?.price ?? cartItem.price ?? "0",
      costPrice: product?.costPrice ?? null,
      discount: product?.discount ?? null,
    });
    const originalPrice = getOriginalDisplayPrice({
      price: product?.price ?? cartItem.price ?? "0",
      costPrice: product?.costPrice ?? null,
      discount: product?.discount ?? null,
    });
    const fallbackIndex = cartItem.selectedImageIndex || 0;

    return {
      cartId: cartItem.id,
      productId: cartItem.productId,
      name: product?.name || cartItem.productName || "Product",
      price: sellingPrice,
      originalPrice,
      quantity: cartItem.quantity,
      stock: cartItem.availableStock ?? product?.stock ?? 0,
      image:
        cartItem.productImage ||
        product?.images?.[fallbackIndex] ||
        product?.images?.[0] ||
        "",
      category: product?.category || "",
      variantId: cartItem.variantId,
      selectedColor: cartItem.selectedColor,
      selectedSize: cartItem.selectedSize,
      requiresVariantSelection: cartItem.requiresVariantSelection,
    };
  });

  const pricingSummary = calculateProductPricingSummary(
    cartItemsWithProducts.map((item) => ({
      price: item.price,
      costPrice: item.originalPrice,
      quantity: item.quantity,
    })),
  );
  const subtotal = pricingSummary.subtotal;
  const originalSubtotal = pricingSummary.originalSubtotal;
  const productSavings = pricingSummary.productSavings;

  const isLoading = cartLoading || productsLoading;

  const { isMobile } = useMobileDevice();

  if (!isAuthenticated) {
    return null;
  }

  if (isMobile) {
    return (
      <MobileCart
        cartItems={cartItemsWithProducts.map((item) => ({
          id: item.cartId,
          productId: item.productId,
          productName: item.name,
          productImage: item.image,
          price: String(item.price),
          quantity: item.quantity,
          selectedColor: item.selectedColor,
          selectedSize: item.selectedSize,
          availableStock: item.stock,
        }))}
        isLoading={isLoading}
        onQuantityChange={(itemId, delta) => {
          const item = cartItemsWithProducts.find((i) => i.cartId === itemId);
          if (!item) return;
          const newQty = Math.max(1, item.quantity + delta);
          updateCartMutation.mutate({ id: itemId, quantity: newQty });
        }}
        onRemoveItem={(itemId) => removeFromCartMutation.mutate(itemId)}
        subtotal={subtotal}
        deliveryFee={0}
        total={subtotal}
        onCheckout={() => navigate("/checkout")}
      />
    );
  }

  return (
    <div className="min-h-screen flex flex-col">
      <div className="flex items-center justify-end p-2 border-b bg-background">
        <ThemeToggle />
      </div>

      <Header
        cartItemsCount={cartItems.reduce((sum, item) => sum + item.quantity, 0)}
        onCartClick={() => navigate("/cart")}
      />

      <main className="flex-1">
        <div className="max-w-7xl mx-auto px-4 py-8">
          <div className="flex items-center justify-between mb-8">
            <div>
              <h1 className="text-3xl font-bold mb-2" data-testid="text-page-title">
                Shopping Cart
              </h1>
              <p className="text-muted-foreground">
                {cartItems.length} {cartItems.length === 1 ? 'item' : 'items'} in your cart
              </p>
            </div>
            <Button
              variant="outline"
              onClick={() => navigate("/")}
              data-testid="button-continue-shopping"
            >
              <ArrowLeft className="h-4 w-4 mr-2" />
              Continue Shopping
            </Button>
          </div>

          {isLoading ? (
            <div className="text-center py-12">
              <div className="animate-spin h-8 w-8 border-4 border-primary border-t-transparent rounded-full mx-auto mb-4"></div>
              <p className="text-muted-foreground">Loading cart...</p>
            </div>
          ) : cartItems.length === 0 ? (
            <Card className="p-12 text-center">
              <ShoppingBag className="h-16 w-16 mx-auto mb-4 text-muted-foreground" />
              <h2 className="text-2xl font-semibold mb-2" data-testid="text-empty-cart">
                Your cart is empty
              </h2>
              <p className="text-muted-foreground mb-6">
                Add some products to get started!
              </p>
              <Button onClick={() => navigate("/")} data-testid="button-shop-now">
                Start Shopping
              </Button>
            </Card>
          ) : (
            <div className="grid grid-cols-1 lg:grid-cols-3 gap-8">
              <div className="lg:col-span-2 space-y-4">
                {cartItemsWithProducts.map((item) => {
                  if (!item) return null;
                  
                  return (
                    <Card
                      key={item.cartId}
                      className="cursor-pointer p-4 transition-colors hover:bg-muted/30"
                      data-testid={`cart-item-${item.productId}`}
                      onClick={() => navigate(`/product/${item.productId}?from=${encodeURIComponent("/cart")}`)}
                    >
                      <div className="flex gap-4">
                         <img
                           src={item.image}
                           alt={item.name}
                           className="w-24 h-24 object-cover rounded"
                           data-testid={`img-cart-item-${item.productId}`}
                         />
                        
                        <div className="flex-1">
                          <h3 
                            className="font-semibold mb-1"
                            data-testid={`text-cart-item-name-${item.productId}`}
                          >
                            {item.name}
                          </h3>
                          <p className="text-sm text-muted-foreground mb-2">
                            {item.category}
                          </p>
                          
                          {(item.selectedColor || item.selectedSize) && (
                            <div className="text-sm text-muted-foreground mb-2">
                              {item.selectedColor && <span>Color: {item.selectedColor}</span>}
                              {item.selectedColor && item.selectedSize && <span> • </span>}
                              {item.selectedSize && <span>Size: {item.selectedSize}</span>}
                            </div>
                          )}
                          {item.requiresVariantSelection && (
                            <div className="text-sm font-medium text-amber-600 mb-2">
                              Choose this product option again
                            </div>
                          )}
                          
                          <div className="flex items-center gap-2">
                            <span 
                              className="font-bold text-primary"
                              data-testid={`text-cart-item-price-${item.productId}`}
                            >
                              {formatPrice(item.price)}
                            </span>
                            {item.originalPrice && item.originalPrice > item.price && (
                              <span className="text-sm text-muted-foreground line-through">
                                {formatPrice(item.originalPrice)}
                              </span>
                            )}
                          </div>
                        </div>

                        <div className="flex flex-col items-end justify-between">
                           <Button
                             variant="ghost"
                             size="icon"
                             onClick={(event) => {
                               event.preventDefault();
                               event.stopPropagation();
                               removeFromCartMutation.mutate(item.cartId);
                             }}
                             disabled={removeFromCartMutation.isPending}
                             data-testid={`button-remove-${item.productId}`}
                           >
                            <Trash2 className="h-4 w-4 text-destructive" />
                          </Button>

                          <div className="flex items-center gap-2">
                            <Button
                              type="button"
                              variant="outline"
                              size="icon"
                              onClick={(event) => {
                                event.preventDefault();
                                event.stopPropagation();
                                updateCartMutation.mutate({
                                  id: item.cartId,
                                  quantity: Math.max(1, item.quantity - 1)
                                });
                              }}
                              disabled={item.quantity <= 1 || updateCartMutation.isPending}
                              data-testid={`button-decrease-${item.productId}`}
                            >
                              <Minus className="h-4 w-4" />
                            </Button>
                            
                            <span 
                              className="w-12 text-center font-semibold"
                              data-testid={`text-quantity-${item.productId}`}
                            >
                              {item.quantity}
                            </span>
                            
                            <Button
                              type="button"
                              variant="outline"
                              size="icon"
                              onClick={(event) => {
                                event.preventDefault();
                                event.stopPropagation();
                                updateCartMutation.mutate({
                                  id: item.cartId,
                                  quantity: Math.min(item.stock, item.quantity + 1)
                                });
                              }}
                              disabled={item.requiresVariantSelection || item.quantity >= item.stock || updateCartMutation.isPending}
                              data-testid={`button-increase-${item.productId}`}
                            >
                              <Plus className="h-4 w-4" />
                            </Button>
                          </div>
                          
                          <span 
                            className="text-sm font-semibold"
                            data-testid={`text-subtotal-${item.productId}`}
                          >
                            {formatPrice(item.price * item.quantity)}
                          </span>
                        </div>
                      </div>
                    </Card>
                  );
                })}
              </div>

              <div className="lg:col-span-1">
                <Card className="p-6 sticky top-24">
                  <h2 className="text-xl font-semibold mb-4">Order Summary</h2>
                  
                  <div className="space-y-3 mb-6">
                    <div className="flex justify-between">
                      <span className="text-muted-foreground">Items Total</span>
                      <span className="font-semibold" data-testid="text-original-subtotal">
                        {formatPrice(originalSubtotal)}
                      </span>
                    </div>
                    {productSavings > 0 && (
                      <div className="flex justify-between">
                        <span className="text-muted-foreground">Product Discounts</span>
                        <span className="font-semibold text-primary" data-testid="text-product-discounts">
                          -{formatPrice(productSavings)}
                        </span>
                      </div>
                    )}
                    <div className="flex justify-between">
                      <span className="text-muted-foreground">Subtotal</span>
                      <span className="font-semibold" data-testid="text-subtotal">
                        {formatPrice(subtotal)}
                      </span>
                    </div>
                    <div className="flex justify-between">
                      <span className="text-muted-foreground">Delivery</span>
                      <span className="text-sm">Calculated at checkout</span>
                    </div>
                    <div className="border-t pt-3">
                      <div className="flex justify-between">
                        <span className="text-lg font-semibold">Total</span>
                        <span className="text-lg font-bold text-primary" data-testid="text-total">
                          {formatPrice(subtotal)}
                        </span>
                      </div>
                    </div>
                  </div>

                  <Button
                    className="w-full"
                    size="lg"
                    onClick={() => navigate("/checkout")}
                    disabled={cartItems.length === 0}
                    data-testid="button-checkout"
                  >
                    Proceed to Checkout
                  </Button>
                </Card>
              </div>
            </div>
          )}
        </div>
      </main>

      <Footer />
    </div>
  );
}
