import { useQuery } from "@tanstack/react-query";
import { useLocation } from "wouter";
import { fetchApiJson } from "@/lib/queryClient";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Scissors, BadgeCheck, ArrowRight, CalendarClock, Star } from "lucide-react";
import { formatPesewas, requestStatusLabel, type FashionServicesPublic } from "@/lib/fashionServices";

/**
 * Appears ONLY when a clothing store has an approved fashion-services profile.
 * Does not add a global "Become an Artisan" tab or separate store account.
 */
export default function FashionServicesStorePanel({storeId}:{storeId:string}) {
  const [,navigate] = useLocation();
  const {data} = useQuery<FashionServicesPublic|null>({
    queryKey:["/api/stores",storeId,"fashion-services"],
    queryFn:()=>fetchApiJson<FashionServicesPublic>("/api/stores/"+encodeURIComponent(storeId)+"/fashion-services")
      .catch(()=>null),
    enabled:!!storeId,retry:false,
    staleTime:30000,
  });
  if(!data?.profile?.verifiedService || !data.offerings.length)return null;
  const scores=data.reviews.map(r=>r.rating);
  const rating=scores.length?scores.reduce((a,b)=>a+b,0)/scores.length:null;
  return <section className="rounded-2xl border border-[#009688]/20 bg-card shadow-sm p-4 sm:p-6 space-y-4" data-testid="fashion-service-store-panel">
    <div className="flex gap-3 items-start">
      <div className="rounded-xl bg-[#009688]/10 p-3"><Scissors className="text-[#009688] w-5 h-5"/></div>
      <div className="flex-1">
        <div className="flex flex-wrap items-center gap-2">
          <h2 className="font-bold text-lg">Custom Fashion & Tailoring</h2>
          <Badge variant="outline" className="text-[#009688] border-[#009688]/40 gap-1"><BadgeCheck className="w-3 h-3"/>Fashion Services Verified</Badge>
        </div>
        <p className="text-sm text-muted-foreground mt-1">{data.profile.headline}</p>
        {rating!==null&&<span className="text-sm inline-flex gap-1 items-center mt-1"><Star className="w-4 h-4 fill-amber-400 text-amber-400"/>{rating.toFixed(1)} service rating · {scores.length} reviews</span>}
      </div>
    </div>
    <p className="text-sm text-muted-foreground">{data.profile.bio}</p>
    {data.profile.portfolioUrls.length>0&&<div className="flex gap-2 overflow-x-auto pb-1">
      {data.profile.portfolioUrls.slice(0,5).map((src,i)=><img key={src+i} src={src} loading="lazy" alt={"Completed fashion project "+(i+1)} className="h-28 w-28 sm:h-32 sm:w-32 rounded-lg object-cover flex-none"/>)}
    </div>}
    <div className="grid gap-2 sm:grid-cols-2">{data.offerings.map(o=><div key={o.id} className="rounded-xl border p-3 flex items-start gap-2">
      <div className="flex-1 min-w-0"><p className="font-semibold text-sm">{o.title}</p><p className="text-xs text-muted-foreground line-clamp-2">{o.description}</p>
        <p className="text-xs text-[#009688] mt-2 font-semibold">From {formatPesewas(o.startingPricePesewas)} · {o.turnaroundDays} days</p></div>
      <Button size="sm" variant="outline" className="shrink-0" disabled={data.profile.availability.paused}
        onClick={()=>navigate("/stores/"+storeId+"/fashion-services/request/"+o.id)}>
        Request <ArrowRight className="ml-1 h-3 w-3"/>
      </Button>
    </div>)}</div>
    <div className="flex gap-2 items-center text-xs text-muted-foreground">
      <CalendarClock className="h-4 w-4"/>
      {data.profile.availability.paused?"Temporarily not accepting requests":"Request a design or fitting; the seller confirms the final quotation before payment."}
    </div>
    {data.reviews.length>0&&<div className="border-t pt-3 space-y-2"><p className="text-xs font-semibold">Recent service reviews</p>
      {data.reviews.slice(0,2).map((review,i)=><p key={i} className="text-sm text-muted-foreground"><strong className="text-foreground">{review.rating}/5</strong> — {review.comment}</p>)}
    </div>}
  </section>;
}
