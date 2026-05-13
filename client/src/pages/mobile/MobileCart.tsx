import { useState } from "react";
import { useLocation } from "wouter";
import { useHaptic } from "@/hooks/useHaptic";
import { cn } from "@/lib/utils";
import { MobilePageHeader } from "@/components/mobile/MobilePageHeader";
import { SwipeableRow } from "@/components/mobile/SwipeableRow";
import { MobileListItemSkeleton } from "@/components/mobile/MobileSkeletonCard";
import { Button } from "@/components/ui/button";
import {
  Package, Minus, Plus, Trash2, ShoppingBag, ChevronRight, Tag, Gift,
  Truck, Shield, X,
} from "lucide-react";

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
      <div className="flex items-center gap-3 px-4 py-3.5 bg-card">
        {/* Thumbnail */}
        <div className="relative w-[72px] h-[72px] rounded-2xl overflow-hidden bg-muted border border-border/20 shrink-0">
          {item.productImage ? (
            <img src={item.productImage} alt={item.productName} className="w-full h-full object-cover" />
          ) : (
            <div className="w-full h-full flex items-center justify-center">
              <Package className="w-7 h-7 text-muted-foreground/40" />
            </div>
          )}
        </div>

        {/* Details */}
        <div className="flex-1 min-w-0">
          <p className="text-[14px] font-semibold text-foreground line-clamp-2 leading-tight">{item.productName}</p>
          {(item.selectedColor || item.selectedSize) && (
            <p className="text-[12px] text-muted-foreground mt-0.5">
              {[item.selectedColor, item.selectedSize].filter(Boolean).join(" · ")}
            </p>
          )}
          <div className="flex items-center justify-between mt-2">
            <div>
              <p className="text-[16px] font-bold text-primary">
                GHS {(unitPrice * item.quantity).toFixed(2)}
              </p>
              {item.quantity > 1 && (
                <p className="text-[11px] text-muted-foreground">GHS {unitPrice.toFixed(2)} each</p>
              )}
            </div>

            {/* Quantity stepper */}
            <div className="flex items-center gap-2 bg-muted/70 rounded-2xl p-1 border border-border/30">
              <button
                onClick={() => { haptic("light"); onQuantityChange(item.id, -1); }}
                className="w-7 h-7 rounded-xl flex items-center justify-center touch-ripple bg-background border border-border/30 active:scale-90 transition-transform disabled:opacity-40"
                disabled={item.quantity <= 1}
              >
                <Minus className="w-3 h-3" />
              </button>
              <span className="text-[14px] font-bold min-w-[18px] text-center">{item.quantity}</span>
              <button
                onClick={() => { haptic("light"); onQuantityChange(item.id, 1); }}
                className="w-7 h-7 rounded-xl flex items-center justify-center touch-ripple bg-primary text-primary-foreground active:scale-90 transition-transform disabled:opacity-40"
                disabled={item.availableStock !== undefined && item.quantity >= item.availableStock}
              >
                <Plus className="w-3 h-3" />
              </button>
            </div>
          </div>
        </div>
      </div>
    </SwipeableRow>
  );
}

function TrustBadge({ icon: Icon, label }: { icon: React.ElementType; label: string }) {
  return (
    <div className="flex flex-col items-center gap-1.5 flex-1">
      <div className="w-9 h-9 rounded-xl bg-primary/10 flex items-center justify-center">
        <Icon className="w-4.5 h-4.5 text-primary" style={{ width: 18, height: 18 }} />
      </div>
      <span className="text-[11px] text-muted-foreground font-medium text-center leading-tight">{label}</span>
    </div>
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
  const [promoCode, setPromoCode] = useState("");
  const [promoOpen, setPromoOpen] = useState(false);

  if (isLoading) {
    return (
      <div className="flex flex-col min-h-screen bg-background">
        <MobilePageHeader title="My Cart" showBack={false} />
        <div className="p-4"><MobileListItemSkeleton count={4} /></div>
      </div>
    );
  }

  if (cartItems.length === 0) {
    return (
      <div className="flex flex-col min-h-screen bg-background mobile-page-enter">
        <MobilePageHeader title="My Cart" showBack={false} />
        <div className="flex-1 flex flex-col items-center justify-center px-8 text-center py-20">
          <div className="w-28 h-28 rounded-3xl bg-primary/5 border-2 border-dashed border-primary/20 flex items-center justify-center mb-5">
            <ShoppingBag className="w-12 h-12 text-primary/30" />
          </div>
          <p className="text-[22px] font-bold text-foreground mb-2">Your cart is empty</p>
          <p className="text-[15px] text-muted-foreground mb-8 leading-relaxed">
            Looks like you haven't added anything yet. Start exploring!
          </p>
          <Button
            className="rounded-2xl px-10 h-12 font-bold text-[15px] shadow-lg shadow-primary/20"
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
        title={`My Cart (${cartItems.length})`}
        showBack={false}
      />

      {/* Items list */}
      <main className="flex-1 overflow-y-auto">

        {/* Swipe hint */}
        <div className="mx-4 mt-3 mb-1 flex items-center gap-2 bg-muted/50 rounded-2xl px-3 py-2">
          <Trash2 className="w-3.5 h-3.5 text-muted-foreground/60 shrink-0" />
          <p className="text-[12px] text-muted-foreground/70">Swipe left on an item to remove it</p>
        </div>

        <div className="mt-2 divide-y divide-border/20 bg-card border-y border-border/20">
          {cartItems.map((item) => (
            <CartItemRow
              key={item.id}
              item={item}
              onQuantityChange={onQuantityChange}
              onRemove={onRemoveItem}
            />
          ))}
        </div>

        {/* Promo code */}
        <div className="mx-4 mt-4">
          {promoOpen ? (
            <div className="flex items-center gap-2 bg-card border border-border/40 rounded-2xl p-1 pl-4">
              <Tag className="w-4 h-4 text-primary shrink-0" />
              <input
                autoFocus
                placeholder="Enter promo code"
                value={promoCode}
                onChange={(e) => setPromoCode(e.target.value.toUpperCase())}
                className="flex-1 bg-transparent text-[14px] font-medium outline-none placeholder:text-muted-foreground/50 tracking-widest"
                maxLength={20}
              />
              <button
                onClick={() => { setPromoCode(""); setPromoOpen(false); }}
                className="w-8 h-8 rounded-xl flex items-center justify-center text-muted-foreground touch-ripple"
              >
                <X className="w-4 h-4" />
              </button>
              <Button
                size="sm"
                className="rounded-xl h-9 px-4 font-semibold text-[13px]"
                disabled={!promoCode.trim()}
              >
                Apply
              </Button>
            </div>
          ) : (
            <button
              onClick={() => setPromoOpen(true)}
              className="w-full flex items-center gap-3 bg-card border border-dashed border-primary/30 rounded-2xl px-4 py-3 touch-ripple active:bg-primary/5"
            >
              <div className="w-8 h-8 rounded-xl bg-primary/10 flex items-center justify-center shrink-0">
                <Gift className="w-4 h-4 text-primary" />
              </div>
              <span className="text-[14px] font-semibold text-primary">Have a promo code?</span>
              <ChevronRight className="w-4 h-4 text-primary ml-auto" />
            </button>
          )}
        </div>

        {/* Trust badges */}
        <div className="mx-4 mt-4 flex items-start gap-2 bg-card border border-border/30 rounded-2xl px-3 py-3">
          <TrustBadge icon={Shield} label="Secure Checkout" />
          <div className="w-px h-10 bg-border/40 self-center" />
          <TrustBadge icon={Truck} label="Fast Delivery" />
          <div className="w-px h-10 bg-border/40 self-center" />
          <TrustBadge icon={Tag} label="Best Prices" />
        </div>

        {/* Order Summary */}
        <div className="mx-4 mt-4 mb-4 bg-card border border-border/30 rounded-3xl p-4">
          <p className="text-[17px] font-bold text-foreground mb-3">Order Summary</p>
          <div className="space-y-2.5">
            <div className="flex justify-between items-center">
              <span className="text-[15px] text-muted-foreground">
                Subtotal ({cartItems.length} item{cartItems.length !== 1 ? "s" : ""})
              </span>
              <span className="text-[15px] font-semibold">GHS {subtotal.toFixed(2)}</span>
            </div>
            <div className="flex justify-between items-center">
              <span className="text-[15px] text-muted-foreground">Delivery fee</span>
              <span className="text-[15px] font-semibold">
                {deliveryFee > 0 ? `GHS ${deliveryFee.toFixed(2)}` : (
                  <span className="text-primary">At checkout</span>
                )}
              </span>
            </div>
          </div>
          <div className="border-t border-border/30 mt-3 pt-3 flex justify-between items-center">
            <span className="text-[17px] font-bold">Total</span>
            <span className="text-[22px] font-black text-primary">GHS {total.toFixed(2)}</span>
          </div>
        </div>
      </main>

      {/* Sticky checkout bar */}
      <div
        className="bg-background/95 backdrop-blur-md border-t border-border/20 px-4 pt-3"
        style={{ paddingBottom: "calc(12px + env(safe-area-inset-bottom, 0px))" }}
      >
        <Button
          className="w-full rounded-2xl text-[16px] font-bold shadow-lg shadow-primary/25 flex items-center justify-between px-5"
          style={{ height: "54px" }}
          onClick={onCheckout}
        >
          <span>Checkout</span>
          <span className="bg-white/20 rounded-xl px-3 py-1 text-[14px] font-bold">
            GHS {total.toFixed(2)}
          </span>
        </Button>
      </div>
    </div>
  );
}
