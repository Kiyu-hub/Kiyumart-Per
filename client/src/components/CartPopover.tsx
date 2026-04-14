import { type MouseEvent } from "react";
import { ShoppingCart, X, Plus, Minus, Trash2 } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Card } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Popover, PopoverContent, PopoverTrigger } from "@/components/ui/popover";
import { ScrollArea } from "@/components/ui/scroll-area";
import { useQuery, useMutation } from "@tanstack/react-query";
import { queryClient, fetchSameOriginJson } from "@/lib/queryClient";
import { useLocation } from "wouter";
import { useLanguage } from "@/contexts/LanguageContext";
import { useToast } from "@/hooks/use-toast";

interface CartItem {
  id: string;
  productId: string;
  productName: string;
  productImage: string;
  quantity: number;
  price: string;
  selectedColor?: string | null;
  selectedSize?: string | null;
  availableStock?: number;
  requiresVariantSelection?: boolean;
}

interface CartPopoverProps {
  isAuthenticated?: boolean;
}

export default function CartPopover({ isAuthenticated = false }: CartPopoverProps) {
  const [, navigate] = useLocation();
  const { currencySymbol, formatPrice } = useLanguage();
  const { toast } = useToast();

  const { data: cart = [], isLoading } = useQuery<CartItem[]>({
    queryKey: ["/api/cart"],
    enabled: isAuthenticated,
    queryFn: async () =>
      fetchSameOriginJson("/api/cart", {
        cache: "no-store",
      }),
    refetchOnMount: "always",
    refetchOnWindowFocus: true,
    staleTime: 0,
  });

  const updateQuantityMutation = useMutation({
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

  const removeItemMutation = useMutation({
    mutationFn: async (id: string) => {
      return fetchSameOriginJson(`/api/cart/${id}`, {
        method: "DELETE",
      });
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["/api/cart"] });
    },
  });

  const totalAmount = cart.reduce(
    (sum, item) => sum + parseFloat(item.price) * item.quantity,
    0
  );

  const totalItems = cart.reduce((sum, item) => sum + item.quantity, 0);
  const isCompactState = isLoading || cart.length === 0;

  const handleCartClick = (e: MouseEvent) => {
    if (!isAuthenticated) {
      e.preventDefault();
      navigate("/auth");
    }
  };

  return (
    <Popover>
      <PopoverTrigger asChild>
        <Button
          variant="ghost"
          size="icon"
          className="relative"
          data-testid="button-cart"
          onClick={handleCartClick}
        >
          <ShoppingCart className="h-5 w-5" />
          {totalItems > 0 && (
            <Badge
              className="absolute -top-1 -right-1 h-5 w-5 min-w-[20px] flex items-center justify-center p-0 text-xs font-semibold bg-primary text-primary-foreground rounded-full"
              data-testid="badge-cart-count"
            >
              {totalItems > 9 ? "9+" : totalItems}
            </Badge>
          )}
        </Button>
      </PopoverTrigger>
      <PopoverContent
        className={`flex flex-col overflow-hidden p-0 ${
          isCompactState
            ? "w-[min(92vw,24rem)] max-h-[min(70vh,24rem)] sm:w-[24rem]"
            : "h-[min(84vh,46rem)] w-[min(96vw,32rem)] sm:w-[32rem] lg:w-[34rem]"
        }`}
        align="end"
        data-testid="cart-popover"
      >
        <div className="flex items-center justify-between border-b px-4 py-4">
          <h3 className="font-semibold text-lg">Shopping Cart</h3>
          <Badge variant="secondary" data-testid="badge-cart-items">
            {totalItems} items
          </Badge>
        </div>

        {isLoading ? (
          <div className="p-8 text-center">
            <div className="animate-spin rounded-full h-8 w-8 border-b-2 border-primary mx-auto"></div>
            <p className="text-sm text-muted-foreground mt-2">Loading cart...</p>
          </div>
        ) : cart.length === 0 ? (
          <div className="p-8 text-center">
            <ShoppingCart className="h-12 w-12 mx-auto text-muted-foreground mb-2" />
            <p className="text-sm text-muted-foreground">Your cart is empty</p>
            <Button
              variant="outline"
              size="sm"
              className="mt-4"
              onClick={() => navigate("/")}
              data-testid="button-start-shopping"
            >
              Start Shopping
            </Button>
          </div>
        ) : (
          <>
            <ScrollArea className="min-h-0 flex-1">
              <div className="space-y-3 p-4">
                {cart.map((item) => (
                  <Card
                    key={item.id}
                    className="cursor-pointer p-3 transition-colors hover:bg-muted/30"
                    data-testid={`cart-item-${item.id}`}
                    onClick={() => navigate(`/product/${item.productId}?from=${encodeURIComponent("/cart")}`)}
                  >
                    <div className="flex gap-3">
                      <img
                        src={item.productImage}
                        alt={item.productName}
                        className="h-16 w-16 shrink-0 rounded object-cover"
                        data-testid={`img-product-${item.id}`}
                      />
                      <div className="min-w-0 flex-1">
                        <h4 className="truncate text-sm font-medium" data-testid={`text-name-${item.id}`}>
                          {item.productName}
                        </h4>
                        <p className="text-sm font-semibold text-primary mt-1" data-testid={`text-price-${item.id}`}>
                          {formatPrice(parseFloat(item.price))}
                        </p>
                        {(item.selectedColor || item.selectedSize) && (
                          <div className="mt-1 text-xs text-muted-foreground">
                            {item.selectedColor && <span>Color: {item.selectedColor}</span>}
                            {item.selectedColor && item.selectedSize && <span> • </span>}
                            {item.selectedSize && <span>Size: {item.selectedSize}</span>}
                          </div>
                        )}
                        {item.requiresVariantSelection ? (
                          <div className="mt-1 text-xs font-medium text-amber-600">
                            Choose this product option again
                          </div>
                        ) : typeof item.availableStock === "number" && item.availableStock > 0 ? (
                          <div className="mt-1 text-xs font-medium text-muted-foreground">
                            {item.availableStock} available
                          </div>
                        ) : null}
                        <div className="mt-3 flex items-center gap-2">
                          <Button
                            type="button"
                            size="icon"
                            variant="outline"
                            className="h-8 w-8 shrink-0"
                            onClick={(event) => {
                              event.preventDefault();
                              event.stopPropagation();
                              updateQuantityMutation.mutate({
                                id: item.id,
                                quantity: Math.max(1, item.quantity - 1),
                              });
                            }}
                            disabled={
                              item.quantity <= 1 || updateQuantityMutation.isPending
                            }
                            data-testid={`button-decrease-${item.id}`}
                          >
                            <Minus className="h-3 w-3" />
                          </Button>
                          <span className="w-8 text-center text-sm font-semibold" data-testid={`text-quantity-${item.id}`}>
                            {item.quantity}
                          </span>
                          <Button
                            type="button"
                            size="icon"
                            variant="outline"
                            className="h-8 w-8 shrink-0"
                            onClick={(event) => {
                              event.preventDefault();
                              event.stopPropagation();
                             updateQuantityMutation.mutate({
                               id: item.id,
                               quantity: Math.min(item.availableStock ?? item.quantity + 1, item.quantity + 1),
                              });
                            }}
                            disabled={
                              updateQuantityMutation.isPending ||
                              item.requiresVariantSelection ||
                              item.quantity >= (item.availableStock ?? Number.MAX_SAFE_INTEGER)
                            }
                            data-testid={`button-increase-${item.id}`}
                          >
                            <Plus className="h-3 w-3" />
                          </Button>
                          <Button
                            type="button"
                            size="icon"
                            variant="ghost"
                            className="ml-auto h-8 w-8 shrink-0"
                            onClick={(event) => {
                              event.preventDefault();
                              event.stopPropagation();
                              removeItemMutation.mutate(item.id);
                            }}
                            disabled={removeItemMutation.isPending}
                            data-testid={`button-remove-${item.id}`}
                          >
                            <Trash2 className="h-3 w-3" />
                          </Button>
                        </div>
                      </div>
                    </div>
                  </Card>
                ))}
              </div>
            </ScrollArea>

            <div className="space-y-3 border-t bg-background px-4 py-4">
              <div className="flex items-center justify-between">
                <span className="font-semibold">Total:</span>
                <span className="text-lg font-bold text-primary" data-testid="text-cart-total">
                  {currencySymbol} {totalAmount.toFixed(2)}
                </span>
              </div>
              <div className="grid grid-cols-2 gap-2">
                <Button
                  variant="outline"
                  onClick={() => navigate("/cart")}
                  data-testid="button-view-cart"
                >
                  View Cart
                </Button>
                <Button
                  onClick={() => navigate("/checkout")}
                  data-testid="button-checkout"
                >
                  Checkout
                </Button>
              </div>
            </div>
          </>
        )}
      </PopoverContent>
    </Popover>
  );
}
