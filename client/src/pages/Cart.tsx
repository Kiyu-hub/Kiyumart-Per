import { useEffect } from "react";
import { useLocation } from "wouter";
import { useQuery, useMutation } from "@tanstack/react-query";
import { apiRequest, queryClient } from "@/lib/queryClient";
import { useAuth } from "@/lib/auth";
import { useToast } from "@/hooks/use-toast";
import { useLanguage } from "@/contexts/LanguageContext";
import { Button } from "@/components/ui/button";
import { Card } from "@/components/ui/card";
import { Minus, Plus, Trash2, ShoppingBag, ArrowLeft } from "lucide-react";
import Header from "@/components/Header";
import Footer from "@/components/Footer";
import ThemeToggle from "@/components/ThemeToggle";

interface CartItem {
  id: string;
  productId: string;
  quantity: number;
  createdAt: string;
}

interface Product {
  id: string;
  name: string;
  price: string;
  costPrice?: string;
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
  });

  const { data: cartProducts = [], isLoading: productsLoading } = useQuery<Product[]>({
    queryKey: ["/api/cart/products", cartItems.map(item => item.productId).sort().join(",")],
    queryFn: async () => {
      if (!cartItems.length) return [];
      const productIds = cartItems.map(item => item.productId);
      const productsData = await Promise.all(
        productIds.map(async (id) => {
          const res = await fetch(`/api/products/${id}`);
          return res.json();
        })
      );
      return productsData;
    },
    enabled: cartItems.length > 0,
  });

  const updateCartMutation = useMutation({
    mutationFn: async ({ id, quantity }: { id: string; quantity: number }) => {
      const res = await apiRequest("PATCH", `/api/cart/${id}`, { quantity });
      return res.json();
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["/api/cart"] });
    },
  });

  const removeFromCartMutation = useMutation({
    mutationFn: async (id: string) => {
      await apiRequest("DELETE", `/api/cart/${id}`, {});
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["/api/cart"] });
      toast({
        title: "Removed from cart",
        description: "Item has been removed from your cart",
      });
    },
  });

  const cartItemsWithProducts = cartItems
    .map(cartItem => {
      const product = cartProducts.find(p => p.id === cartItem.productId);
      if (!product) return null;
      
      const sellingPrice = parseFloat(product.price);
      const originalPrice = product.costPrice ? parseFloat(product.costPrice) : null;
      
      return {
        cartId: cartItem.id,
        productId: product.id,
        name: product.name,
        price: sellingPrice,
        originalPrice,
        quantity: cartItem.quantity,
        stock: product.stock,
        image: product.images[0] || '',
        category: product.category,
      };
    })
    .filter(Boolean);

  const subtotal = cartItemsWithProducts.reduce(
    (sum, item) => sum + (item!.price * item!.quantity),
    0
  );

  const isLoading = cartLoading || productsLoading;

  if (!isAuthenticated) {
    return null;
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
                    <Card key={item.cartId} className="p-4" data-testid={`cart-item-${item.productId}`}>
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
                            onClick={() => removeFromCartMutation.mutate(item.cartId)}
                            disabled={removeFromCartMutation.isPending}
                            data-testid={`button-remove-${item.productId}`}
                          >
                            <Trash2 className="h-4 w-4 text-destructive" />
                          </Button>

                          <div className="flex items-center gap-2">
                            <Button
                              variant="outline"
                              size="icon"
                              onClick={() => updateCartMutation.mutate({
                                id: item.cartId,
                                quantity: Math.max(1, item.quantity - 1)
                              })}
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
                              variant="outline"
                              size="icon"
                              onClick={() => updateCartMutation.mutate({
                                id: item.cartId,
                                quantity: Math.min(item.stock, item.quantity + 1)
                              })}
                              disabled={item.quantity >= item.stock || updateCartMutation.isPending}
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
