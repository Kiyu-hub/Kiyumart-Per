import { useState } from "react";
import { useLocation } from "wouter";
import { useMutation, useQuery } from "@tanstack/react-query";
import { useAuth } from "@/lib/auth";
import { fetchApiJson, queryClient } from "@/lib/queryClient";
import { useToast } from "@/hooks/use-toast";
import DashboardLayout from "@/components/DashboardLayout";
import MediaUploadInput from "@/components/MediaUploadInput";
import { Card, CardHeader, CardTitle, CardDescription, CardContent } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { Badge } from "@/components/ui/badge";
import { Switch } from "@/components/ui/switch";
import { Scissors, BadgeCheck, ShieldCheck, Clock, Plus, ArrowRight, Loader2 } from "lucide-react";
import { formatPesewas, requestStatusLabel, serviceTypes, type FashionServiceApplication, type FashionServiceOffering, type FashionServiceRequest } from "@/lib/fashionServices";

type SellerData = {
  storeId: string;
  application: FashionServiceApplication | null;
  offerings: FashionServiceOffering[];
  requests: FashionServiceRequest[];
};
const jsonPost = <T,>(url: string, value: unknown, method = "POST") =>
  fetchApiJson<T>(url,{method,headers:{"Content-Type":"application/json"},body:JSON.stringify(value)});

export default function SellerFashionServices() {
  const {user,isLoading:authLoading} = useAuth();
  const [,navigate] = useLocation();
  const {toast} = useToast();
  const [headline,setHeadline] = useState("");
  const [bio,setBio] = useState("");
  const [specialties,setSpecialties] = useState<string[]>(["tailoring"]);
  const [portfolio,setPortfolio] = useState<string[]>([]);
  const [newImage,setNewImage] = useState("");
  const [evidence,setEvidence] = useState<string[]>([]);
  const [newEvidence,setNewEvidence] = useState("");
  const [experience,setExperience] = useState("1");
  const [offerTitle,setOfferTitle] = useState("");
  const [offerDescription,setOfferDescription] = useState("");
  const [offerType,setOfferType] = useState<(typeof serviceTypes)[number]["key"]>("tailoring");
  const [offerStartingPrice,setOfferStartingPrice] = useState("");
  const [offerDays,setOfferDays] = useState("7");
  const {data,isLoading,isError,refetch} = useQuery<SellerData>({
    queryKey:["/api/seller/fashion-services"],
    enabled:!!user&&user.role==="seller",
    retry:false,
  });
  const apply=useMutation({
    mutationFn:()=>jsonPost("/api/seller/fashion-services/apply",{
      headline,bio,specialties,coverageAreas:[],languages:[],
      portfolioUrls:portfolio,evidenceUrls:evidence,experienceYears:Number(experience),
    }),
    onSuccess:()=>{toast({title:"Application submitted",description:"Super Admin will review your work portfolio."});queryClient.invalidateQueries({queryKey:["/api/seller/fashion-services"]});},
    onError:(e:Error)=>toast({title:"Application not submitted",description:e.message,variant:"destructive"}),
  });
  const createOffer=useMutation({
    mutationFn:()=>jsonPost("/api/seller/fashion-services/offerings",{
      title:offerTitle,description:offerDescription,serviceType:offerType,
      startingPricePesewas:Math.round(Number(offerStartingPrice)*100),turnaroundDays:Number(offerDays),
    }),
    onSuccess:()=>{setOfferTitle("");setOfferDescription("");setOfferStartingPrice("");queryClient.invalidateQueries({queryKey:["/api/seller/fashion-services"]});toast({title:"Service added"});},
    onError:(e:Error)=>toast({title:"Unable to add service",description:e.message,variant:"destructive"}),
  });
  const changeOffer=useMutation({
    mutationFn:(input:{id:string;isActive:boolean})=>
      jsonPost("/api/seller/fashion-services/offerings/"+input.id,{isActive:input.isActive},"PATCH"),
    onSuccess:()=>queryClient.invalidateQueries({queryKey:["/api/seller/fashion-services"]}),
    onError:(e:Error)=>toast({title:"Update failed",description:e.message,variant:"destructive"}),
  });
  const pauseService=useMutation({
    mutationFn:(paused:boolean)=>jsonPost("/api/seller/fashion-services/profile",{
      availability:{days:data?.application?.availability.days??[1,2,3,4,5,6],
        advanceDays:data?.application?.availability.advanceDays??30,paused},
    },"PATCH"),
    onSuccess:()=>queryClient.invalidateQueries({queryKey:["/api/seller/fashion-services"]}),
    onError:(e:Error)=>toast({title:"Availability not changed",description:e.message,variant:"destructive"}),
  });
  if(authLoading||!user||user.role!=="seller")return <div className="p-8 text-sm text-muted-foreground">An approved seller account is required.</div>;
  const app=data?.application;
  const approved=app?.status==="approved";
  const canApply=!app||["rejected","changes_requested"].includes(app.status);
  return <DashboardLayout role="seller">
    <main className="max-w-5xl mx-auto p-4 md:p-8 space-y-6">
      <div className="flex flex-wrap gap-3 items-center justify-between">
        <div>
          <div className="flex items-center gap-2"><Scissors className="text-[#009688]"/><h1 className="text-2xl font-bold">Fashion Services</h1></div>
          <p className="text-sm text-muted-foreground mt-1">Sell your clothing as usual. Offer custom tailoring and design only after additional verification.</p>
        </div>
        <Button variant="outline" onClick={()=>navigate("/seller")}>Back to seller dashboard</Button>
      </div>
      {isLoading&&<div className="flex items-center gap-2 text-muted-foreground"><Loader2 className="animate-spin h-4 w-4"/> Loading service profile…</div>}
      {isError&&<Card><CardContent className="pt-6 text-sm text-destructive">Fashion services are not available yet. The service database migration may still need to be applied. <Button size="sm" variant="outline" onClick={()=>refetch()}>Retry</Button></CardContent></Card>}
      {!isLoading&&!isError&&<>
        <Card className="border-[#009688]/20">
          <CardHeader>
            <div className="flex gap-2 items-center">
              <CardTitle className="text-lg">Service eligibility</CardTitle>
              <Badge variant="outline" className={approved?"text-[#009688]":""}>{app?requestStatusLabel(app.status):"Not applied"}</Badge>
            </div>
            <CardDescription>Your seller role remains unchanged. This is an optional service capability for an approved clothing store.</CardDescription>
          </CardHeader>
          <CardContent className="space-y-3">
            {approved?<div className="flex flex-wrap items-center gap-3 justify-between">
              <div className="flex items-center gap-2 text-[#009688]"><BadgeCheck/> Work portfolio reviewed — Fashion Services Verified</div>
              <div className="flex gap-3 items-center">
                <Label htmlFor="pause-fashion-services">Accepting requests</Label>
                <Switch id="pause-fashion-services" checked={!app.availability.paused} disabled={pauseService.isPending} onCheckedChange={v=>pauseService.mutate(!v)}/>
              </div>
            </div>:<p className="text-sm">{app?.status==="pending"?"Your application is awaiting Super Admin review.":app?.status==="suspended"?"Service access has been suspended. Your ordinary clothing store remains available.":"Apply below to offer verified tailoring and made-to-order fashion."}</p>}
            {app?.reviewNote&&<p className="rounded-lg bg-muted p-3 text-sm">Review feedback: {app.reviewNote}</p>}
          </CardContent>
        </Card>
        {canApply&&<Card>
          <CardHeader><CardTitle>Apply to Offer Fashion Services</CardTitle><CardDescription>Showcase your own work. This does not require a new account or separate artisan registration.</CardDescription></CardHeader>
          <CardContent className="space-y-4">
            <div className="grid gap-3 md:grid-cols-2">
              <div className="space-y-1"><Label>Service headline</Label><Input value={headline} onChange={e=>setHeadline(e.target.value)} placeholder="Bespoke abayas & tailoring" maxLength={120}/></div>
              <div className="space-y-1"><Label>Years of experience</Label><Input type="number" min="0" max="70" value={experience} onChange={e=>setExperience(e.target.value)}/></div>
            </div>
            <div className="space-y-1"><Label>Tell customers about your work</Label><Textarea value={bio} onChange={e=>setBio(e.target.value)} placeholder="Your experience, styles and specialization…" maxLength={2000}/></div>
            <div className="space-y-2"><Label>Services you can provide</Label><div className="flex gap-2 flex-wrap">{serviceTypes.map(service=><Button key={service.key} size="sm" type="button" variant={specialties.includes(service.key)?"default":"outline"} onClick={()=>setSpecialties(curr=>curr.includes(service.key)?curr.filter(x=>x!==service.key):[...curr,service.key])}>{service.label}</Button>)}</div></div>
            <div className="space-y-3">
              <Label>Work portfolio (at least one photo)</Label>
              <MediaUploadInput id="fashion-portfolio-upload" label="Choose a finished outfit photo" value={newImage} onChange={setNewImage} accept="image" mediaCategory="general" compact skip4KValidation/>
              <Button size="sm" type="button" variant="outline" disabled={!newImage.startsWith("https://")||portfolio.length>=8} onClick={()=>{setPortfolio(a=>[...a,newImage]);setNewImage("");}}>Add to portfolio ({portfolio.length}/8)</Button>
              <div className="grid grid-cols-3 sm:grid-cols-5 gap-2">{portfolio.map((src,i)=><button type="button" onClick={()=>setPortfolio(x=>x.filter((_,idx)=>idx!==i))} key={src+i} title="Remove photo"><img src={src} alt={"Portfolio "+(i+1)} className="h-24 w-full object-cover rounded-lg"/><span className="text-xs">Remove</span></button>)}</div>
            </div>
            <div className="space-y-2"><Label>Optional proof of training or business work</Label>
              <MediaUploadInput id="fashion-evidence-upload" label="Additional supporting image (private to reviewers)" value={newEvidence} onChange={setNewEvidence} accept="image" compact skip4KValidation/>
              <Button size="sm" variant="outline" disabled={!newEvidence.startsWith("https://")||evidence.length>=6} onClick={()=>{setEvidence(a=>[...a,newEvidence]);setNewEvidence("");}}>Add supporting image ({evidence.length}/6)</Button>
              <p className="text-xs text-muted-foreground">Do not upload Ghana Card numbers or personal identification to this portfolio field.</p>
            </div>
            <Button disabled={apply.isPending||!headline.trim()||!bio.trim()||!portfolio.length||!specialties.length} onClick={()=>apply.mutate()}>
              {apply.isPending?"Submitting…":"Submit for verification"}</Button>
          </CardContent>
        </Card>}
        {approved&&<>
          <Card>
            <CardHeader><CardTitle>My Service Offerings</CardTitle><CardDescription>These appear inside your clothing store. Customers can request quotations rather than pay before you agree on the design.</CardDescription></CardHeader>
            <CardContent className="space-y-4">
              <div className="grid gap-3 md:grid-cols-2">
                <div className="space-y-1"><Label>Service name</Label><Input value={offerTitle} onChange={e=>setOfferTitle(e.target.value)} placeholder="Custom kaftan stitching"/></div>
                <div className="space-y-1"><Label>Type</Label><select className="border rounded-md h-10 w-full px-3 bg-background" value={offerType} onChange={e=>setOfferType(e.target.value as typeof offerType)}>{serviceTypes.filter(x=>app.specialties.includes(x.key)).map(s=><option key={s.key} value={s.key}>{s.label}</option>)}</select></div>
                <div className="space-y-1"><Label>Starting price (GHS)</Label><Input type="number" min="0" step="0.01" value={offerStartingPrice} onChange={e=>setOfferStartingPrice(e.target.value)}/></div>
                <div className="space-y-1"><Label>Typical turnaround (days)</Label><Input type="number" min="1" max="365" value={offerDays} onChange={e=>setOfferDays(e.target.value)}/></div>
              </div>
              <div className="space-y-1"><Label>Description</Label><Textarea value={offerDescription} onChange={e=>setOfferDescription(e.target.value)} maxLength={1200}/></div>
              <Button disabled={createOffer.isPending||!offerTitle.trim()||!offerDescription.trim()||offerStartingPrice===""} onClick={()=>createOffer.mutate()}><Plus className="w-4 h-4 mr-2"/>Add service</Button>
              <div className="divide-y">{data?.offerings.map(offer=><div key={offer.id} className="flex items-center justify-between py-3 gap-3">
                <div className="min-w-0"><p className="font-semibold">{offer.title}</p><p className="text-sm text-muted-foreground">From {formatPesewas(offer.startingPricePesewas)} · {offer.turnaroundDays} days</p></div>
                <div className="flex gap-2 items-center"><span className="text-xs text-muted-foreground">{offer.isActive?"Visible":"Hidden"}</span><Switch checked={offer.isActive} disabled={changeOffer.isPending} onCheckedChange={isActive=>changeOffer.mutate({id:offer.id,isActive})}/></div>
              </div>)}</div>
            </CardContent>
          </Card>
        </>}
        <Card>
          <CardHeader><CardTitle>Service Requests</CardTitle><CardDescription>Customer requests, quotes, fitting arrangements and service progress.</CardDescription></CardHeader>
          <CardContent className="space-y-3">
            {!data?.requests.length&&<div className="text-sm text-muted-foreground flex items-center gap-2"><Clock size={18}/> No requests yet.</div>}
            {data?.requests.map(request=><button type="button" key={request.id}
              onClick={()=>navigate("/fashion-services/requests/"+request.id)}
              className="w-full text-left flex gap-3 items-center p-3 rounded-xl border hover:border-[#009688] transition-colors">
              <div className="flex-1 min-w-0"><p className="font-semibold truncate">{request.serviceTitle}</p><p className="text-xs text-muted-foreground">{request.referenceCode} · {new Date(request.createdAt).toLocaleDateString()}</p></div>
              <Badge variant="secondary">{requestStatusLabel(request.status)}</Badge><ArrowRight className="w-4 h-4"/>
            </button>)}
          </CardContent>
        </Card>
      </>}
    </main>
  </DashboardLayout>;
}
