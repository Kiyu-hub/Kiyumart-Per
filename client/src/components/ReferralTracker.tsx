import { useState } from "react";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { Copy, Check, Gift, Share2, ChevronRight, Clock, Tag, Megaphone } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { useToast } from "@/hooks/use-toast";

interface ReferralReward {
  id: string;
  type: "discount" | "promotion";
  status: "pending" | "claimed" | "expired";
  discountCode: string | null;
  rewardPercent: number | null;
  rewardDurationHours: number | null;
  claimedAt: string | null;
  expiresAt: string | null;
  createdAt: string;
}

interface ReferralStats {
  referralCode: string;
  completed: number;
  signedUp: number;
  threshold: number;
  rewardPercent: number;
  rewardDurationHours: number;
  isSeller: boolean;
  rewards: ReferralReward[];
}

function getFrontendBaseUrl(): string {
  const envUrl = (import.meta.env as any).VITE_FRONTEND_URL || (import.meta.env as any).VITE_APP_URL || "";
  if (envUrl) return envUrl.replace(/\/$/, "");
  if (typeof window !== "undefined") return window.location.origin;
  return "";
}

export default function ReferralTracker() {
  const { toast } = useToast();
  const queryClient = useQueryClient();
  const [copiedCode, setCopiedCode] = useState(false);
  const [copiedLink, setCopiedLink] = useState(false);
  const [claimingRewardId, setClaimingRewardId] = useState<string | null>(null);
  const [showClaimModal, setShowClaimModal] = useState<ReferralReward | null>(null);
  const [promoType, setPromoType] = useState<"store" | "product">("store");
  const [promoTargetId, setPromoTargetId] = useState("");

  const { data: stats, isLoading } = useQuery<ReferralStats>({
    queryKey: ["/api/referral/stats"],
    queryFn: () =>
      fetch("/api/referral/stats", { credentials: "include" }).then((r) => {
        if (!r.ok) throw new Error("Failed");
        return r.json();
      }),
    staleTime: 30_000,
  });

  const claimMutation = useMutation({
    mutationFn: async ({ rewardId, promoOptions }: { rewardId: string; promoOptions?: { promotionType: "store" | "product"; targetId: string } }) => {
      const res = await fetch(`/api/referral/claim/${rewardId}`, {
        method: "POST",
        credentials: "include",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(promoOptions ? { promoOptions } : {}),
      });
      const data = await res.json();
      if (!res.ok) throw new Error(data.error || "Failed to claim reward");
      return data;
    },
    onSuccess: (data) => {
      queryClient.invalidateQueries({ queryKey: ["/api/referral/stats"] });
      setShowClaimModal(null);
      toast({ title: "Reward Claimed!", description: data.message });
    },
    onError: (err: any) => {
      toast({ title: "Claim Failed", description: err.message, variant: "destructive" });
    },
  });

  const copyToClipboard = async (text: string, type: "code" | "link") => {
    try {
      await navigator.clipboard.writeText(text);
      if (type === "code") {
        setCopiedCode(true);
        setTimeout(() => setCopiedCode(false), 2000);
      } else {
        setCopiedLink(true);
        setTimeout(() => setCopiedLink(false), 2000);
      }
      toast({ title: "Copied!", description: type === "link" ? "Referral link copied." : "Code copied." });
    } catch {
      toast({ title: "Copy failed", variant: "destructive" });
    }
  };

  const handleShare = async () => {
    if (!stats) return;
    const link = `${getFrontendBaseUrl()}/auth?ref=${stats.referralCode}`;
    if (navigator.share) {
      try {
        await navigator.share({ title: "Join KiyuMart", text: "Use my referral link to sign up!", url: link });
      } catch {}
    } else {
      copyToClipboard(link, "link");
    }
  };

  if (isLoading) {
    return (
      <div className="rounded-2xl border bg-card p-6 space-y-3 animate-pulse">
        <div className="h-5 w-32 bg-muted rounded" />
        <div className="h-10 w-full bg-muted rounded-xl" />
        <div className="h-4 w-48 bg-muted rounded" />
      </div>
    );
  }

  if (!stats) return null;

  const referralLink = `${getFrontendBaseUrl()}/auth?ref=${stats.referralCode}`;
  const progressPct = Math.min((stats.completed / stats.threshold) * 100, 100);
  const pendingRewards = stats.rewards.filter((r) => r.status === "pending");
  const pastRewards = stats.rewards.filter((r) => r.status !== "pending");

  return (
    <div className="rounded-2xl border bg-card p-6 space-y-5">
      {/* Header */}
      <div className="flex items-center gap-3">
        <div className="flex h-10 w-10 items-center justify-center rounded-xl bg-primary/10">
          <Gift className="h-5 w-5 text-primary" />
        </div>
        <div>
          <h3 className="font-semibold text-base">Referral Programme</h3>
          <p className="text-xs text-muted-foreground">
            {stats.isSeller
              ? `Refer ${stats.threshold} customers → earn ${stats.rewardDurationHours}h free promotion`
              : `Refer ${stats.threshold} friends → earn ${stats.rewardPercent}% off your next order`}
          </p>
        </div>
      </div>

      {/* Progress */}
      <div className="space-y-2">
        <div className="flex items-center justify-between text-sm">
          <span className="text-muted-foreground">Progress to next reward</span>
          <span className="font-semibold">
            {stats.completed}/{stats.threshold}
            {stats.signedUp > 0 && (
              <span className="text-muted-foreground font-normal text-xs ml-1">({stats.signedUp} pending purchase)</span>
            )}
          </span>
        </div>
        <div className="h-2 w-full rounded-full bg-muted overflow-hidden">
          <div
            className="h-full rounded-full bg-primary transition-all duration-500"
            style={{ width: `${progressPct}%` }}
          />
        </div>
      </div>

      {/* Referral link */}
      <div className="space-y-2">
        <p className="text-xs font-medium text-muted-foreground uppercase tracking-wide">Your Referral Link</p>
        <div className="flex items-center gap-2 rounded-xl border bg-muted/40 px-3 py-2.5">
          <span className="flex-1 text-sm truncate font-mono">{referralLink}</span>
          <Button
            size="icon"
            variant="ghost"
            className="h-7 w-7 shrink-0"
            onClick={() => copyToClipboard(referralLink, "link")}
          >
            {copiedLink ? <Check className="h-4 w-4 text-emerald-500" /> : <Copy className="h-4 w-4" />}
          </Button>
          <Button size="icon" variant="ghost" className="h-7 w-7 shrink-0" onClick={handleShare}>
            <Share2 className="h-4 w-4" />
          </Button>
        </div>
      </div>

      {/* Pending rewards */}
      {pendingRewards.length > 0 && (
        <div className="space-y-2">
          <p className="text-xs font-medium text-amber-600 uppercase tracking-wide">Rewards to Claim</p>
          {pendingRewards.map((reward) => (
            <div key={reward.id} className="flex items-center justify-between rounded-xl border border-amber-200 bg-amber-50 dark:border-amber-800 dark:bg-amber-950/30 px-4 py-3">
              <div className="flex items-center gap-3">
                <div className="flex h-8 w-8 items-center justify-center rounded-lg bg-amber-100 dark:bg-amber-900/50">
                  {reward.type === "discount" ? (
                    <Tag className="h-4 w-4 text-amber-600" />
                  ) : (
                    <Megaphone className="h-4 w-4 text-amber-600" />
                  )}
                </div>
                <div>
                  <p className="text-sm font-medium">
                    {reward.type === "discount"
                      ? `${reward.rewardPercent}% discount code`
                      : `${reward.rewardDurationHours}h free promotion`}
                  </p>
                  {reward.expiresAt && (
                    <p className="text-xs text-muted-foreground flex items-center gap-1">
                      <Clock className="h-3 w-3" />
                      Expires {new Date(reward.expiresAt).toLocaleDateString()}
                    </p>
                  )}
                </div>
              </div>
              <Button
                size="sm"
                className="shrink-0"
                onClick={() => {
                  if (reward.type === "promotion") {
                    setShowClaimModal(reward);
                  } else {
                    claimMutation.mutate({ rewardId: reward.id });
                  }
                }}
                disabled={claimMutation.isPending}
              >
                Claim
                <ChevronRight className="h-3.5 w-3.5 ml-1" />
              </Button>
            </div>
          ))}
        </div>
      )}

      {/* Claim promotion modal */}
      {showClaimModal && (
        <div className="rounded-xl border bg-muted/30 p-4 space-y-3">
          <p className="text-sm font-semibold">Choose what to promote</p>
          <div className="flex gap-2">
            <Button
              size="sm"
              variant={promoType === "store" ? "default" : "outline"}
              onClick={() => setPromoType("store")}
            >
              Store
            </Button>
            <Button
              size="sm"
              variant={promoType === "product" ? "default" : "outline"}
              onClick={() => setPromoType("product")}
            >
              Product
            </Button>
          </div>
          <input
            className="w-full rounded-lg border bg-background px-3 py-2 text-sm"
            placeholder={promoType === "store" ? "Store ID" : "Product ID"}
            value={promoTargetId}
            onChange={(e) => setPromoTargetId(e.target.value)}
          />
          <div className="flex gap-2">
            <Button
              size="sm"
              onClick={() => {
                if (!promoTargetId.trim()) {
                  toast({ title: "Enter a target ID", variant: "destructive" });
                  return;
                }
                claimMutation.mutate({
                  rewardId: showClaimModal.id,
                  promoOptions: { promotionType: promoType, targetId: promoTargetId.trim() },
                });
              }}
              disabled={claimMutation.isPending}
            >
              Activate Promotion
            </Button>
            <Button size="sm" variant="ghost" onClick={() => setShowClaimModal(null)}>
              Cancel
            </Button>
          </div>
        </div>
      )}

      {/* Past rewards */}
      {pastRewards.length > 0 && (
        <div className="space-y-1.5">
          <p className="text-xs font-medium text-muted-foreground uppercase tracking-wide">Past Rewards</p>
          {pastRewards.map((reward) => (
            <div key={reward.id} className="flex items-center justify-between rounded-lg border px-3 py-2.5">
              <div className="flex items-center gap-2.5">
                <div className={`flex h-7 w-7 items-center justify-center rounded-lg ${reward.status === "claimed" ? "bg-emerald-100 dark:bg-emerald-900/40" : "bg-muted"}`}>
                  {reward.type === "discount" ? (
                    <Tag className={`h-3.5 w-3.5 ${reward.status === "claimed" ? "text-emerald-600" : "text-muted-foreground"}`} />
                  ) : (
                    <Megaphone className={`h-3.5 w-3.5 ${reward.status === "claimed" ? "text-emerald-600" : "text-muted-foreground"}`} />
                  )}
                </div>
                <div>
                  <p className="text-xs font-medium">
                    {reward.type === "discount" ? `${reward.rewardPercent}% discount` : `${reward.rewardDurationHours}h promotion`}
                    {reward.discountCode && reward.status === "claimed" && (
                      <span className="ml-2 font-mono text-primary">{reward.discountCode}</span>
                    )}
                  </p>
                  {reward.claimedAt && (
                    <p className="text-[11px] text-muted-foreground">
                      Claimed {new Date(reward.claimedAt).toLocaleDateString()}
                    </p>
                  )}
                </div>
              </div>
              <Badge
                variant={reward.status === "claimed" ? "default" : "secondary"}
                className="text-[10px] capitalize"
              >
                {reward.status}
              </Badge>
            </div>
          ))}
        </div>
      )}
    </div>
  );
}
