import { useState } from "react";
import { useQuery, useMutation } from "@tanstack/react-query";
import { useAuth } from "@/lib/auth";
import { apiRequest, queryClient } from "@/lib/queryClient";
import DashboardLayout from "@/components/DashboardLayout";
import { useToast } from "@/hooks/use-toast";
import { PageLoadingState } from "@/components/ui/loading-state";
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Textarea } from "@/components/ui/textarea";
import { Star, MessageSquare, Loader2, Package } from "lucide-react";
import { formatDistanceToNow } from "date-fns";

interface Review {
  id: string;
  productId: string;
  productName: string;
  productImage: string | null;
  userId: string;
  userName: string;
  profileImage: string | null;
  rating: number;
  comment: string | null;
  sellerReply: string | null;
  isVerifiedPurchase: boolean;
  createdAt: string;
}

function StarDisplay({ rating }: { rating: number }) {
  return (
    <div className="flex items-center gap-0.5">
      {[1, 2, 3, 4, 5].map((star) => (
        <Star
          key={star}
          className={`h-4 w-4 ${star <= rating ? "fill-amber-400 text-amber-400" : "text-muted-foreground/30"}`}
        />
      ))}
    </div>
  );
}

export default function SellerRatings() {
  const { user, isAuthenticated, isLoading: authLoading } = useAuth();
  const { toast } = useToast();
  const [replyingTo, setReplyingTo] = useState<string | null>(null);
  const [replyText, setReplyText] = useState("");

  const { data: reviews = [], isLoading } = useQuery<Review[]>({
    queryKey: ["/api/seller/reviews"],
    enabled: isAuthenticated && user?.role === "seller",
    refetchOnWindowFocus: true,
    refetchOnMount: "always",
    staleTime: 0,
  });

  const replyMutation = useMutation({
    mutationFn: async ({ id, reply }: { id: string; reply: string }) =>
      apiRequest("POST", `/api/reviews/${id}/reply`, { reply }),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["/api/seller/reviews"] });
      toast({ title: "Reply posted", description: "Your response has been saved." });
      setReplyingTo(null);
      setReplyText("");
    },
    onError: (error: any) => {
      toast({ title: "Failed to post reply", description: error?.message || "Please try again.", variant: "destructive" });
    },
  });

  if (authLoading || !isAuthenticated || user?.role !== "seller") {
    return <PageLoadingState title="Loading ratings" description="Fetching your product reviews." />;
  }

  const avgRating = reviews.length
    ? reviews.reduce((s, r) => s + r.rating, 0) / reviews.length
    : 0;
  const ratingCounts = [5, 4, 3, 2, 1].map((star) => ({
    star,
    count: reviews.filter((r) => r.rating === star).length,
  }));

  return (
    <DashboardLayout role="seller">
      <div className="p-6 space-y-6">
        <div>
          <h1 className="text-2xl font-bold">Ratings &amp; Reviews</h1>
          <p className="text-sm text-muted-foreground mt-1">
            See what customers think of your products and reply to their feedback.
          </p>
        </div>

        {/* Summary cards */}
        <div className="grid gap-4 sm:grid-cols-3">
          <Card className="border-l-4 border-l-amber-400">
            <CardHeader className="pb-2">
              <CardDescription>Overall Rating</CardDescription>
              <CardTitle className="text-3xl">{avgRating.toFixed(1)}</CardTitle>
            </CardHeader>
            <CardContent>
              <StarDisplay rating={Math.round(avgRating)} />
              <p className="text-xs text-muted-foreground mt-1">{reviews.length} review{reviews.length !== 1 ? "s" : ""}</p>
            </CardContent>
          </Card>

          <Card className="border-l-4 border-l-emerald-500">
            <CardHeader className="pb-2">
              <CardDescription>Verified Purchases</CardDescription>
              <CardTitle className="text-3xl">{reviews.filter((r) => r.isVerifiedPurchase).length}</CardTitle>
            </CardHeader>
            <CardContent>
              <p className="text-xs text-muted-foreground">Reviews confirmed as real purchases</p>
            </CardContent>
          </Card>

          <Card className="border-l-4 border-l-blue-500">
            <CardHeader className="pb-2">
              <CardDescription>Awaiting Reply</CardDescription>
              <CardTitle className="text-3xl">{reviews.filter((r) => !r.sellerReply).length}</CardTitle>
            </CardHeader>
            <CardContent>
              <p className="text-xs text-muted-foreground">Reviews without a seller response</p>
            </CardContent>
          </Card>
        </div>

        {/* Rating breakdown */}
        {reviews.length > 0 && (
          <Card>
            <CardHeader>
              <CardTitle className="text-base">Rating Breakdown</CardTitle>
            </CardHeader>
            <CardContent>
              <div className="space-y-2">
                {ratingCounts.map(({ star, count }) => (
                  <div key={star} className="flex items-center gap-3 text-sm">
                    <span className="w-4 text-right text-muted-foreground">{star}</span>
                    <Star className="h-3.5 w-3.5 fill-amber-400 text-amber-400 shrink-0" />
                    <div className="flex-1 h-2 rounded-full bg-muted overflow-hidden">
                      <div
                        className="h-full rounded-full bg-amber-400"
                        style={{ width: reviews.length ? `${(count / reviews.length) * 100}%` : "0%" }}
                      />
                    </div>
                    <span className="w-6 text-right text-muted-foreground">{count}</span>
                  </div>
                ))}
              </div>
            </CardContent>
          </Card>
        )}

        {/* Reviews list */}
        {isLoading ? (
          <div className="flex justify-center py-12">
            <Loader2 className="h-8 w-8 animate-spin text-primary" />
          </div>
        ) : reviews.length === 0 ? (
          <Card>
            <CardContent className="py-16 text-center">
              <Star className="h-12 w-12 mx-auto text-muted-foreground/30 mb-4" />
              <p className="font-medium text-muted-foreground">No reviews yet</p>
              <p className="text-sm text-muted-foreground mt-1">Reviews from customers will appear here once they rate your products.</p>
            </CardContent>
          </Card>
        ) : (
          <div className="space-y-4">
            {reviews.map((review) => (
              <Card key={review.id} className="border-border/70">
                <CardContent className="p-5 space-y-3">
                  {/* Product info */}
                  <div className="flex items-center gap-3">
                    {review.productImage ? (
                      <img src={review.productImage} alt={review.productName} className="h-10 w-10 rounded-lg object-cover" />
                    ) : (
                      <div className="h-10 w-10 rounded-lg bg-muted flex items-center justify-center">
                        <Package className="h-5 w-5 text-muted-foreground" />
                      </div>
                    )}
                    <div>
                      <p className="text-xs text-muted-foreground">Product</p>
                      <p className="text-sm font-medium">{review.productName}</p>
                    </div>
                  </div>

                  {/* Review header */}
                  <div className="flex items-start justify-between gap-3 flex-wrap">
                    <div className="flex items-center gap-2">
                      <div className="h-8 w-8 rounded-full bg-primary/10 flex items-center justify-center text-sm font-bold text-primary">
                        {review.userName?.[0]?.toUpperCase() || "?"}
                      </div>
                      <div>
                        <p className="text-sm font-medium">{review.userName}</p>
                        <p className="text-xs text-muted-foreground">
                          {formatDistanceToNow(new Date(review.createdAt), { addSuffix: true })}
                        </p>
                      </div>
                    </div>
                    <div className="flex items-center gap-2">
                      <StarDisplay rating={review.rating} />
                      {review.isVerifiedPurchase && (
                        <Badge variant="outline" className="text-emerald-600 border-emerald-600/30 text-xs">
                          Verified Purchase
                        </Badge>
                      )}
                    </div>
                  </div>

                  {/* Comment */}
                  {review.comment && (
                    <p className="text-sm text-foreground/90 leading-relaxed">{review.comment}</p>
                  )}

                  {/* Existing reply */}
                  {review.sellerReply && (
                    <div className="rounded-lg border border-border/60 bg-muted/20 p-3">
                      <p className="text-xs font-medium text-muted-foreground mb-1">Your reply</p>
                      <p className="text-sm">{review.sellerReply}</p>
                    </div>
                  )}

                  {/* Reply controls */}
                  {!review.sellerReply && (
                    <>
                      {replyingTo === review.id ? (
                        <div className="space-y-2">
                          <Textarea
                            value={replyText}
                            onChange={(e) => setReplyText(e.target.value)}
                            placeholder="Write a helpful, professional response..."
                            className="resize-none text-sm"
                            rows={3}
                          />
                          <div className="flex items-center gap-2">
                            <Button
                              size="sm"
                              onClick={() => replyMutation.mutate({ id: review.id, reply: replyText.trim() })}
                              disabled={!replyText.trim() || replyMutation.isPending}
                            >
                              {replyMutation.isPending ? <Loader2 className="h-3.5 w-3.5 animate-spin mr-1" /> : null}
                              Post Reply
                            </Button>
                            <Button size="sm" variant="ghost" onClick={() => { setReplyingTo(null); setReplyText(""); }}>
                              Cancel
                            </Button>
                          </div>
                        </div>
                      ) : (
                        <Button
                          size="sm"
                          variant="outline"
                          className="gap-1.5"
                          onClick={() => { setReplyingTo(review.id); setReplyText(""); }}
                        >
                          <MessageSquare className="h-3.5 w-3.5" />
                          Reply to Review
                        </Button>
                      )}
                    </>
                  )}
                </CardContent>
              </Card>
            ))}
          </div>
        )}
      </div>
    </DashboardLayout>
  );
}
