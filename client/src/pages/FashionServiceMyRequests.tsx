import { useQuery } from "@tanstack/react-query";
import { useLocation } from "wouter";
import { useAuth } from "@/lib/auth";
import { fetchApiJson } from "@/lib/queryClient";
import Header from "@/components/Header";
import Footer from "@/components/Footer";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { ArrowLeft, Scissors, ArrowRight } from "lucide-react";
import { type FashionServiceRequest, requestStatusLabel, formatPesewas } from "@/lib/fashionServices";

export default function FashionServiceMyRequests() {
  const { user,isAuthenticated }=useAuth();
  const [,navigate]=useLocation();
  const {data=[],isLoading,isError}=useQuery<FashionServiceRequest[]>({
    queryKey:["/api/fashion-service-requests"],
    enabled:isAuthenticated,
  });
  const mine=data.filter(req=>req.buyerId===user?.id);
  return <div className="min-h-screen bg-background"><Header/><main className="max-w-4xl mx-auto p-4 md:py-10 space-y-5">
    <Button variant="ghost" onClick={()=>navigate("/profile")}><ArrowLeft className="w-4 h-4 mr-2"/>Back to profile</Button>
    <div className="flex gap-3 items-center"><Scissors className="text-[#009688]"/><div><h1 className="text-2xl font-bold">My Custom Fashion Requests</h1><p className="text-sm text-muted-foreground">Track tailoring quotes, fittings, messages and order progress.</p></div></div>
    {!isAuthenticated?<Card><CardContent className="py-6">Sign in to view your service requests.</CardContent></Card>:
      <Card><CardHeader><CardTitle>Requests ({mine.length})</CardTitle><CardDescription>Your custom orders are separate from ready-made product orders.</CardDescription></CardHeader>
      <CardContent className="space-y-2">{isLoading&&<p className="text-muted-foreground">Loading requests…</p>}
        {isError&&<p className="text-destructive">Could not load service requests yet.</p>}
        {!isLoading&&!mine.length&&<p className="text-sm text-muted-foreground">No custom fashion requests yet. Visit a verified clothing store to request a design.</p>}
        {mine.map(req=><button key={req.id} type="button" onClick={()=>navigate("/fashion-services/requests/"+req.id)} className="w-full text-left rounded-xl border p-3 flex gap-3 items-center hover:border-[#009688]">
          <div className="flex-1 min-w-0"><p className="font-semibold truncate">{req.serviceTitle}</p><p className="text-xs text-muted-foreground">{req.referenceCode} · {new Date(req.createdAt).toLocaleDateString()}</p>
            {req.quotePesewas!==null&&<p className="text-sm text-[#009688]">{formatPesewas(req.quotePesewas)}</p>}
          </div><Badge variant="secondary">{requestStatusLabel(req.status)}</Badge><ArrowRight className="w-4 h-4 shrink-0"/>
        </button>)}
      </CardContent></Card>}
  </main><Footer/></div>;
}
