import { useState } from "react";
import { useMutation, useQuery } from "@tanstack/react-query";
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogDescription } from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Loader2, Zap, Calendar, Infinity } from "lucide-react";
import { useToast } from "@/hooks/use-toast";
import { useAuth } from "@/lib/auth";
import { apiRequest, queryClient } from "@/lib/queryClient";
import { PaystackInlineService } from "@/lib/paystackInline";

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

export function SellerUpgradeModal({ open, onClose, onUpgraded }: SellerUpgradeModalProps) {
  const { user } = useAuth();
  const { toast } = useToast();
  const [paying, setPaying] = useState<"plan_a" | "plan_b" | "plan_c" | null>(null);

  const { data: tierInfo } = useQuery<TierInfo>({
    queryKey: ["/api/seller/tier-info"],
    enabled: open && !!user,
  });

  const initMutation = useMutation({
    mutationFn: async (plan: "plan_a" | "plan_b" | "plan_c") => {
      const res = await apiRequest("POST", "/api/seller/upgrade/initialize", { plan });
      if (!res.ok) {
        const err = await res.json().catch(() => ({}));
        throw new Error(err?.error || "Could not initialize payment");
      }
      return res.json();
    },
  });

  const handlePay = async (plan: "plan_a" | "plan_b" | "plan_c") => {
    if (!user?.email) return;
    setPaying(plan);
    try {
      const init = await initMutation.mutateAsync(plan);
      const reference = await PaystackInlineService.pay({
        publicKey: init.publicKey,
        email: user.email,
        amount: Math.round(init.amountGhs * 100),
        currency: "GHS",
        reference: init.reference,
        accessCode: init.accessCode,
      });
      // Webhook handles the DB update; we just poll tier-info to reflect the change
      await queryClient.invalidateQueries({ queryKey: ["/api/seller/tier-info"] });
      await queryClient.invalidateQueries({ queryKey: ["/api/auth/me"] });

      const planLabels: Record<string, string> = {
        plan_a: "Plan A",
        plan_b: "Plan B",
        plan_c: "Plan C",
      };
      toast({
        title: `${planLabels[plan]} Payment Successful`,
        description: "Your plan has been activated. You can now add more products.",
        duration: 7000,
      });
      onUpgraded?.();
      onClose();
    } catch (err: any) {
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
      icon: <Zap className="h-5 w-5 text-yellow-500" />,
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
      icon: <Calendar className="h-5 w-5 text-blue-500" />,
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
      icon: <Infinity className="h-5 w-5 text-green-500" />,
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
    <Dialog open={open} onOpenChange={(v) => { if (!v && paying === null) onClose(); }}>
      <DialogContent className="w-full max-w-3xl sm:max-w-3xl">
        <DialogHeader>
          <DialogTitle>Upgrade Your Listing Plan</DialogTitle>
          <DialogDescription>
            You've reached your current product listing limit
            {tierInfo ? ` (${tierInfo.productCount}/${tierInfo.effectiveLimit > 0 ? tierInfo.effectiveLimit : "∞"})` : ""}.
            Choose a plan below to continue adding products.
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
            return (
              <div
                key={p.plan}
                className={`relative flex flex-col rounded-xl border p-4 gap-3 ${
                  p.highlight ? "border-primary ring-2 ring-primary/20" : "border-border"
                } ${isCurrentPlan ? "opacity-60" : ""}`}
              >
                {p.highlight && (
                  <span className="absolute -top-3 left-1/2 -translate-x-1/2 rounded-full bg-primary px-3 py-0.5 text-xs font-semibold text-primary-foreground">
                    Most Popular
                  </span>
                )}
                <div className="flex items-center gap-2">
                  {p.icon}
                  <span className="font-semibold text-foreground">{p.title}</span>
                  <Badge variant={p.badgeVariant} className="ml-auto text-xs">{p.badge}</Badge>
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
                  className="w-full mt-2"
                  variant={p.highlight ? "default" : "outline"}
                  disabled={isPaying || (paying !== null && !isPaying) || isCurrentPlan}
                  onClick={() => handlePay(p.plan)}
                >
                  {isPaying ? (
                    <Loader2 className="h-4 w-4 animate-spin" />
                  ) : isCurrentPlan ? (
                    "Current Plan"
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
