import { useLocation } from "wouter";
import { useHaptic } from "@/hooks/useHaptic";
import { cn } from "@/lib/utils";
import { MobilePageHeader } from "@/components/mobile/MobilePageHeader";
import { SwipeableRow } from "@/components/mobile/SwipeableRow";
import { MobileListItemSkeleton } from "@/components/mobile/MobileSkeletonCard";
import { Button } from "@/components/ui/button";
import { Package, Minus, Plus, Trash2, ShoppingBag, ChevronRight, Tag } from "lucide-react";

interface CartItem {
  id: string;
  productId: string;
  productName: string;
  productImage: string;
  price: string;
  quantity: number;
  selectedColor?: string | null;
  selectedSize?: string | null;
  availableStock?: number;
}

interface MobileCartProps {
  cartItems: CartItem[];
  isLoading: boolean;
  onQuantityChange: (itemId: string, delta: number) => void;
  onRemoveItem: (itemId: string) => void;
  subtotal: number;
  deliveryFee: number;
  total: number;
  onCheckout: () => void;
}

function CartItemRow({
  item,
  onQuantityChange,
  onRemove,
}: {
  item: CartItem;
  onQuantityChange: (id: string, delta: number) => void;
  onRemove: (id: string) => void;
}) {
  const { trigger: haptic } = useHaptic();
  const unitPrice = parseFloat(item.price) || 0;

  return (
    <SwipeableRow
      rightAction={{
        label: "Remove",
        icon: <Trash2 className="w-5 h-5" />,
        color: "destructive",
        onPress: () => { haptic("medium"); onRemove(item.id); },
      }}
    >
      <div className="flex items-center gap-3 p-4 bg-card">
        {/* Thumbnail */}
        <div className="w-16 h-16 rounded-2xl overflow-hidden bg-muted border border-border/30 shrink-0">
          {item.productImage ? (
            <img src={item.productImage} alt={item.productName} className="w-full h-full object-cover" />
          ) : (
            <div className="w-full h-full flex items-center justify-center">
              <Package className="w-6 h-6 text-muted-foreground/50" />
            </div>
          )}
        </div>

        {/* Details */}
        <div className="flex-1 min-w-0">
          <p className="text-sm font-semibold text-foreground line-clamp-2 leading-tight">{item.productName}</p>
          {(item.selectedColor || item.selectedSize) && (
            <p className="mobile-caption text-muted-foreground mt-0.5">
              {[item.selectedColor, item.selectedSize].filter(Boolean).join(" · ")}
            </p>
          )}
          <p className="text-[15px] font-bold text-primary mt-1">
            GHS {(unitPrice * item.quantity).toFixed(2)}
          </p>
          {item.quantity > 1 && (
            <p className="mobile-caption text-muted-foreground">GHS {unitPrice.toFixed(2)} each</p>
          )}
        </div>

        {/* Quantity stepper */}
        <div className="flex items-center gap-2 shrink-0 bg-muted/60 rounded-2xl p-1">
          <button
            onClick={() => { haptic("light"); onQuantityChange(item.id, -1); }}
            className="w-7 h-7 rounded-xl flex items-center justify-center touch-ripple text-foreground disabled:opacity-40 bg-background"
            disabled={item.quantity <= 1}
          >
            <Minus className="w-3.5 h-3.5" />
          </button>
          <span className="text-sm font-bold min-w-[16px] text-center">{item.quantity}</span>
          <button
            onClick={() => { haptic("light"); onQuantityChange(item.id, 1); }}
            className="w-7 h-7 rounded-xl flex items-center justify-center touch-ripple text-foreground disabled:opacity-40 bg-background"
            disabled={item.availableStock !== undefined && item.quantity >= item.availableStock}
          >
            <Plus className="w-3.5 h-3.5" />
          </button>
        </div>
      </div>
    </SwipeableRow>
  );
}

export function MobileCart({
  cartItems,
  isLoading,
  onQuantityChange,
  onRemoveItem,
  subtotal,
  deliveryFee,
  total,
  onCheckout,
}: MobileCartProps) {
  const [, navigate] = useLocation();

  if (isLoading) {
    return (
      <div className="flex flex-col min-h-screen bg-background">
        <MobilePageHeader title="Cart" showBack={false} />
        <div className="p-4"><MobileListItemSkeleton count={4} /></div>
      </div>
    );
  }

  if (cartItems.length === 0) {
    return (
      <div className="flex flex-col min-h-screen bg-background mobile-page-enter">
        <MobilePageHeader title="Cart" showBack={false} />
        <div className="flex-1 flex flex-col items-center justify-center px-8 text-center py-20">
          <div className="w-24 h-24 rounded-3xl bg-muted/40 flex items-center justify-center mb-5">
            <ShoppingBag className="w-11 h-11 text-muted-foreground/50" />
          </div>
          <p className="mobile-title-3 text-foreground mb-2">Your cart is empty</p>
          <p className="mobile-subhead text-muted-foreground mb-6">Add items from the store to get started.</p>
          <Button
            className="rounded-2xl px-8 h-11 font-semibold"
            onClick={() => navigate("/")}
          >
            Start Shopping
          </Button>
        </div>
      </div>
    );
  }

  return (
    <div className="flex flex-col min-h-screen bg-background mobile-page-enter">
      <MobilePageHeader
        title={`Cart (${cartItems.length})`}
        showBack={false}
      />

      {/* Items list */}
      <main className="flex-1 overflow-y-auto">
        <div className="divide-y divide-border/30">
          {cartItems.map((item) => (
            <CartItemRow
              key={item.id}
              item={item}
              onQuantityChange={onQuantityChange}
              onRemove={onRemoveItem}
            />
          ))}
        </div>

        {/* Swipe hint */}
        <p className="text-center mobile-caption text-muted-foreground/60 py-3 px-4">
          Swipe left on an item to remove it
        </p>

        {/* Order Summary */}
        <div className="mx-4 mb-4 mobile-card bg-card p-4 space-y-3">
          <p className="mobile-headline">Order Summary</p>
          <div className="space-y-2">
            <div className="flex justify-between">
              <span className="mobile-subhead text-muted-foreground">Subtotal ({cartItems.length} item{cartItems.length !== 1 ? "s" : ""})</span>
              <span className="mobile-subhead font-medium">GHS {subtotal.toFixed(2)}</span>
            </div>
            <div className="flex justify-between">
              <span className="mobile-subhead text-muted-foreground">Estimated delivery</span>
              <span className="mobile-subhead font-medium">
                {deliveryFee > 0 ? `GHS ${deliveryFee.toFixed(2)}` : "Calculated at checkout"}
              </span>
            </div>
          </div>
          <div className="border-t border-border/40 pt-3 flex justify-between items-center">
            <span className="mobile-headline">Total</span>
            <span className="text-lg font-bold text-primary">GHS {total.toFixed(2)}</span>
          </div>
        </div>
      </main>

      {/* Sticky checkout bar */}
      <div
        className="glass border-t border-border/30 px-4 py-3"
        style={{ paddingBottom: "calc(12px + env(safe-area-inset-bottom, 0px))" }}
      >
        <Button
          className="w-full h-13 rounded-2xl text-[15px] font-semibold shadow-lg shadow-primary/20"
          onClick={onCheckout}
          style={{ height: "52px" }}
        >
          Checkout · GHS {total.toFixed(2)}
          <ChevronRight className="w-4 h-4 ml-1" />
        </Button>
      </div>
    </div>
  );
}
