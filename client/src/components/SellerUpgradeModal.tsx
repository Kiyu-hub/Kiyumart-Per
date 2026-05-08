import { useState, useEffect } from "react";
import { useMutation, useQuery } from "@tanstack/react-query";
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogDescription } from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Loader2 } from "lucide-react";
import { Stack, CalendarCheck, Infinity as PhInfinity } from "@phosphor-icons/react";
import { useToast } from "@/hooks/use-toast";
import { useAuth } from "@/lib/auth";
import { queryClient } from "@/lib/queryClient";
import { loadPaystackInlineScript, PaystackInlineService, resetPaystackGuard } from "@/lib/paystackInline";

interface TierInfo {
  isPremiumSeller: boolean;
  sellerUpgradePlan: string | null;
  sellerPlanExpiresAt: string | null;
  sellerBonusSlots: number;
  planBExpired: boolean;
  productCount: number;
  freeTierLimit: number;
  hardMax: number;
  effectiveLimit: number;
  upgradePlanAPrice: number;
  upgradePlanASlots: number;
  upgradePlanBPrice: number;
  upgradePlanCPrice: number;
}

interface SellerUpgradeModalProps {
  open: boolean;
  onClose: () => void;
  onUpgraded?: () => void;
  isRenewal?: boolean;
}

interface PlanCard {
  plan: "plan_a" | "plan_b" | "plan_c";
  icon: React.ReactNode;
  title: string;
  badge: string;
  badgeVariant: "default" | "secondary" | "outline";
  price: number;
  priceLabel: string;
  perks: string[];
  highlight?: boolean;
}

export function SellerUpgradeModal({ open, onClose, onUpgraded, isRenewal = false }: SellerUpgradeModalProps) {
  const { user } = useAuth();
  const { toast } = useToast();
  const [paying, setPaying] = useState<"plan_a" | "plan_b" | "plan_c" | null>(null);
  // Temporarily hide the Radix Dialog while Paystack is open so its overlay
  // doesn't block pointer events on the Paystack iframe.
  const [hideForPayment, setHideForPayment] = useState(false);

  // Pre-load Paystack script as soon as the modal opens so it is ready when user clicks Pay
  useEffect(() => {
    if (open) {
      void loadPaystackInlineScript().catch(() => {});
    }
  }, [open]);

  const { data: tierInfo } = useQuery<TierInfo>({
    queryKey: ["/api/seller/tier-info"],
    enabled: open && !!user,
  });

  const initMutation = useMutation({
    mutationFn: async (plan: "plan_a" | "plan_b" | "plan_c") => {
      const res = await fetch("/api/seller/upgrade/initialize", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        credentials: "include",
        body: JSON.stringify({ plan }),
      });
      if (!res.ok) {
        const err = await res.json().catch(() => ({}));
        throw new Error(err?.error || `Payment initialization failed (${res.status})`);
      }
      return res.json();
    },
  });

  const handlePay = async (plan: "plan_a" | "plan_b" | "plan_c") => {
    if (!user?.email) return;
    setPaying(plan);
    try {
      const init = await initMutation.mutateAsync(plan);
      resetPaystackGuard();
      setHideForPayment(true);
      const reference = await PaystackInlineService.pay({
        publicKey: init.publicKey,
        email: user.email,
        amount: Math.round(init.amountGhs * 100),
        currency: "GHS",
        reference: init.reference,
        accessCode: init.accessCode,
      });
      setHideForPayment(false);

      // Immediately verify with the server so the plan activates without waiting for the webhook
      try {
        const verifyRes = await fetch("/api/seller/upgrade/verify", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          credentials: "include",
          body: JSON.stringify({ reference }),
        });
        if (verifyRes.ok) {
          const tierData = await verifyRes.json();
          // Seed the cache directly so the UI updates instantly
          queryClient.setQueryData(["/api/seller/tier-info"], tierData);
        }
      } catch { /* non-critical — webhook is the authoritative path */ }

      // Also run a short polling burst in case the webhook fires concurrently and updates bonus slots
      queryClient.invalidateQueries({ queryKey: ["/api/seller/tier-info"] });
      queryClient.invalidateQueries({ queryKey: ["/api/auth/me"] });
      let pollCount = 0;
      const pollTierInfo = () => {
        queryClient.invalidateQueries({ queryKey: ["/api/seller/tier-info"] });
        pollCount++;
        if (pollCount < 5) setTimeout(pollTierInfo, 3000); // 5 × 3s = 15s — short burst
      };
      setTimeout(pollTierInfo, 3000);

      const planLabels: Record<string, string> = {
        plan_a: "Plan A",
        plan_b: "Plan B",
        plan_c: "Plan C",
      };
      const isRenewedPlan = isRenewal && plan === "plan_b";
      toast({
        title: isRenewedPlan ? "Plan B Renewed" : `${planLabels[plan]} Payment Successful`,
        description: isRenewedPlan
          ? "Your Plan B subscription has been renewed for another 30 days. You can now add unlimited products again."
          : "Your plan has been activated. You can now add more products.",
        duration: 7000,
      });
      onUpgraded?.();
      onClose();
    } catch (err: any) {
      setHideForPayment(false);
      if (err?.message !== "Payment was cancelled before completion.") {
        toast({
          title: "Payment failed",
          description: err?.message || "Something went wrong. Please try again.",
          variant: "destructive",
        });
      }
    } finally {
      setPaying(null);
    }
  };

  const aPrice = tierInfo?.upgradePlanAPrice ?? 15;
  const aSlots = tierInfo?.upgradePlanASlots ?? 10;
  const bPrice = tierInfo?.upgradePlanBPrice ?? 40;
  const cPrice = tierInfo?.upgradePlanCPrice ?? 100;
  const currentPlan = tierInfo?.sellerUpgradePlan;
  const planBExpired = tierInfo?.planBExpired;

  const plans: PlanCard[] = [
    {
      plan: "plan_a",
      icon: <Stack size={20} weight="fill" className="text-yellow-500" />,
      title: "Plan A",
      badge: "Extra Slots",
      badgeVariant: "secondary",
      price: aPrice,
      priceLabel: `GHS ${aPrice.toFixed(2)} one-time`,
      perks: [
        `+${aSlots} additional product listing slots`,
        "Slots stack — buy again for more",
        "No expiry date",
      ],
    },
    {
      plan: "plan_b",
      icon: <CalendarCheck size={20} weight="fill" className="text-blue-500" />,
      title: "Plan B",
      badge: "Monthly",
      badgeVariant: "default",
      price: bPrice,
      priceLabel: `GHS ${bPrice.toFixed(2)} / month`,
      perks: [
        "Unlimited product listings for 30 days",
        "Renew monthly to keep access",
        "Best for high-volume sellers",
      ],
      highlight: true,
    },
    {
      plan: "plan_c",
      icon: <PhInfinity size={20} weight="bold" className="text-green-500" />,
      title: "Plan C",
      badge: "Unlimited Forever",
      badgeVariant: "outline",
      price: cPrice,
      priceLabel: `GHS ${cPrice.toFixed(2)} one-time`,
      perks: [
        "Unlimited product listings permanently",
        "Never pay again",
        "Best long-term value",
      ],
    },
  ];

  return (
    <Dialog open={open && !hideForPayment} onOpenChange={(v) => { if (!v && paying === null) onClose(); }}>
      <DialogContent className="w-full max-w-3xl sm:max-w-3xl">
        <DialogHeader>
          <DialogTitle>{isRenewal ? "Renew Your Plan" : "Upgrade Your Listing Plan"}</DialogTitle>
          <DialogDescription>
            {isRenewal
              ? `Your Plan B subscription has expired. Renew Plan B to restore unlimited listings, or upgrade to Plan C for permanent access.${tierInfo ? ` You currently have ${tierInfo.productCount} products listed (free-tier limit: ${tierInfo.freeTierLimit > 0 ? tierInfo.freeTierLimit : "∞"}).` : ""}`
              : `You've reached your current product listing limit${tierInfo ? ` (${tierInfo.productCount}/${tierInfo.effectiveLimit > 0 ? tierInfo.effectiveLimit : "∞"})` : ""}. Choose a plan below to continue adding products.`}
          </DialogDescription>
        </DialogHeader>

        {paying !== null && (
          <div className="flex items-center justify-between rounded-lg border border-yellow-200 bg-yellow-50 dark:bg-yellow-900/20 dark:border-yellow-700/40 px-4 py-2 text-sm text-yellow-800 dark:text-yellow-300">
            <span className="flex items-center gap-2"><Loader2 className="h-4 w-4 animate-spin" /> Processing payment — complete or close the Paystack window</span>
            <Button variant="ghost" size="sm" className="h-7 text-xs shrink-0" onClick={() => setPaying(null)}>Cancel</Button>
          </div>
        )}

        <div className="grid grid-cols-1 gap-4 sm:grid-cols-3 mt-2">
          {plans.map((p) => {
            const isCurrentPlan = currentPlan === p.plan && (p.plan !== "plan_b" || !planBExpired);
            const isPaying = paying === p.plan;
            const isExpiredPlan = p.plan === "plan_b" && planBExpired;
            const isRenewalTarget = isRenewal && p.plan === "plan_b";
            return (
              <div
                key={p.plan}
                className={`relative flex flex-col rounded-xl border p-4 gap-3 ${
                  isRenewalTarget
                    ? "border-red-400 ring-2 ring-red-400/30"
                    : p.highlight
                    ? "border-primary ring-2 ring-primary/20"
                    : "border-border"
                } ${isCurrentPlan ? "opacity-60" : ""}`}
              >
                {isRenewalTarget && (
                  <span className="absolute -top-3 left-1/2 -translate-x-1/2 rounded-full bg-red-500 px-3 py-0.5 text-xs font-semibold text-white">
                    Renewal Required
                  </span>
                )}
                {!isRenewalTarget && p.highlight && (
                  <span className="absolute -top-3 left-1/2 -translate-x-1/2 rounded-full bg-primary px-3 py-0.5 text-xs font-semibold text-primary-foreground">
                    Most Popular
                  </span>
                )}
                <div className="flex items-center gap-2">
                  {p.icon}
                  <span className="font-semibold text-foreground">{p.title}</span>
                  <Badge
                    variant={isExpiredPlan ? "destructive" : p.badgeVariant}
                    className="ml-auto text-xs"
                  >
                    {isExpiredPlan ? "Expired" : p.badge}
                  </Badge>
                </div>
                <p className="text-lg font-bold text-foreground">{p.priceLabel}</p>
                <ul className="space-y-1.5 flex-1">
                  {p.perks.map((perk, i) => (
                    <li key={i} className="flex items-start gap-1.5 text-xs text-muted-foreground">
                      <span className="mt-0.5 text-primary">✓</span>
                      {perk}
                    </li>
                  ))}
                </ul>
                <Button
                  className={`w-full mt-2 ${isRenewalTarget ? "bg-red-600 hover:bg-red-700 text-white border-0" : ""}`}
                  variant={isRenewalTarget ? "default" : p.highlight ? "default" : "outline"}
                  disabled={isPaying || (paying !== null && !isPaying) || isCurrentPlan}
                  onClick={() => handlePay(p.plan)}
                >
                  {isPaying ? (
                    <Loader2 className="h-4 w-4 animate-spin" />
                  ) : isCurrentPlan ? (
                    "Current Plan"
                  ) : isExpiredPlan ? (
                    `Renew — GHS ${p.price.toFixed(2)}`
                  ) : (
                    `Pay GHS ${p.price.toFixed(2)}`
                  )}
                </Button>
              </div>
            );
          })}
        </div>

        <p className="text-xs text-muted-foreground text-center mt-1">
          All payments are processed securely via Paystack. Plans activate instantly after payment.
        </p>
      </DialogContent>
    </Dialog>
  );
}
