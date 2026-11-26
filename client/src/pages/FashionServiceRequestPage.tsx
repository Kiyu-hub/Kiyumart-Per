import { useState } from "react";
import { useRoute, useLocation } from "wouter";
import { useQuery, useMutation } from "@tanstack/react-query";
import { useAuth } from "@/lib/auth";
import { fetchApiJson } from "@/lib/queryClient";
import { useToast } from "@/hooks/use-toast";
import Header from "@/components/Header";
import Footer from "@/components/Footer";
import MediaUploadInput from "@/components/MediaUploadInput";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { Input } from "@/components/ui/input";
import { Scissors, CalendarDays, ArrowLeft, ArrowRight, ImagePlus } from "lucide-react";
import { formatPesewas, type FashionServicesPublic } from "@/lib/fashionServices";

export default function FashionServiceRequestPage() {
  const [,params] = useRoute("/stores/:storeId/fashion-services/request/:offeringId");
  const storeId=params?.storeId||"";
  const offeringId=params?.offeringId||"";
  const [,navigate] = useLocation();
  const {user,isAuthenticated} = useAuth();
  const {toast} = useToast();
  const [details,setDetails] = useState("");
  const [preferred,setPreferred] = useState("");
  const [fittingMethod,setFittingMethod] = useState("discuss");
  const [location,setLocation] = useState("");
  const [photos,setPhotos] = useState<string[]>([]);
  const [image,setImage] = useState("");
  const {data,isLoading} = useQuery<FashionServicesPublic>({
    queryKey:["/api/stores",storeId,"fashion-services"],
    queryFn:()=>fetchApiJson<FashionServicesPublic>("/api/stores/"+storeId+"/fashion-services"),
    enabled:!!storeId,
  });
  const offer=data?.offerings.find(x=>x.id===offeringId);
  const mutation=useMutation({
    mutationFn:()=>fetchApiJson<{id:string;referenceCode:string}>("/api/stores/"+storeId+"/fashion-service-requests",{
      method:"POST",headers:{"Content-Type":"application/json"},
      body:JSON.stringify({offeringId,description:details,referenceImages:photos,
        preferredDate:preferred?new Date(preferred).toISOString():undefined,
        fittingMethod,customerLocation:location||undefined,
      }),
    }),
    onSuccess:saved=>{toast({title:"Request submitted",description:"Your fashion seller can now review and quote your request."});navigate("/fashion-services/requests/"+saved.id);},
    onError:(e:Error)=>toast({title:"Request could not be sent",description:e.message,variant:"destructive"}),
  });
  return <div className="min-h-screen bg-background">
    <Header/>
    <main className="max-w-3xl mx-auto p-4 md:py-10 space-y-5">
      <Button variant="ghost" onClick={()=>navigate("/sellers/"+storeId)}><ArrowLeft className="w-4 h-4 mr-2"/>Back to store</Button>
      <div className="flex items-center gap-3"><Scissors className="text-[#009688]"/><div><h1 className="text-2xl font-bold">Request Custom Fashion</h1><p className="text-sm text-muted-foreground">Discuss your design and receive a seller-approved quotation before paying.</p></div></div>
      {isLoading?<Card><CardContent className="py-7">Loading available services…</CardContent></Card>:!offer?<Card><CardContent className="py-7 text-muted-foreground">This service is not available for new requests.</CardContent></Card>:<>
        <Card><CardHeader><CardTitle>{offer.title}</CardTitle>
          <CardDescription>{data?.profile.storeName} · From {formatPesewas(offer.startingPricePesewas)} · Usually {offer.turnaroundDays} days</CardDescription></CardHeader>
          <CardContent><p className="text-sm">{offer.description}</p></CardContent>
        </Card>
        <Card>
          <CardHeader><CardTitle>Tell the designer what you need</CardTitle><CardDescription>Sizes, preferred fabric, style, event, and reference photos can be discussed privately with the seller.</CardDescription></CardHeader>
          <CardContent className="space-y-4">
            <div className="space-y-1"><Label>Describe your request</Label><Textarea value={details} onChange={e=>setDetails(e.target.value)}
              placeholder="I would like a custom kaftan for an event. Fabric, colors and fitting…" maxLength={3000} rows={5}/></div>
            <div className="grid gap-3 sm:grid-cols-2">
              <div className="space-y-1"><Label><CalendarDays className="w-4 h-4 inline mr-1"/>Preferred appointment or fitting</Label>
                <Input type="datetime-local" value={preferred} onChange={e=>setPreferred(e.target.value)}/></div>
              <div className="space-y-1"><Label>Fitting method</Label>
                <select className="h-10 w-full rounded-md border bg-background px-3" value={fittingMethod} onChange={e=>setFittingMethod(e.target.value)}>
                  <option value="discuss">Discuss with seller</option>
                  <option value="in_store">Visit the workshop</option>
                  <option value="virtual">Virtual consultation</option>
                </select>
              </div>
            </div>
            <div className="space-y-1"><Label>Area or preferred meeting location (optional)</Label><Input value={location} onChange={e=>setLocation(e.target.value)} maxLength={260} placeholder="Accra, or discuss privately"/></div>
            <div className="space-y-2"><Label>Reference images (optional)</Label><MediaUploadInput id="fashion-reference-photo" label="Attach a design reference" accept="image" value={image} onChange={setImage} skip4KValidation compact/>
              <Button size="sm" variant="outline" disabled={!image.startsWith("https://")||photos.length>=8} onClick={()=>{setPhotos(v=>[...v,image]);setImage("");}}><ImagePlus className="w-4 h-4 mr-2"/>Add image ({photos.length}/8)</Button>
              <div className="grid grid-cols-3 sm:grid-cols-6 gap-2">{photos.map((photo,i)=><button title="Remove reference photo" onClick={()=>setPhotos(x=>x.filter((_,index)=>index!==i))} key={photo+i}><img src={photo} alt="Design reference" className="w-full h-20 object-cover rounded-lg"/></button>)}</div>
            </div>
            <div className="rounded-lg border bg-muted/40 p-3 text-sm text-muted-foreground">No payment is collected when submitting this request. The seller first reviews your requirements and sends a final quote for your approval. Avoid uploading private identity documents.</div>
            {isAuthenticated?<Button className="w-full" disabled={mutation.isPending||details.trim().length<5} onClick={()=>mutation.mutate()}>
              {mutation.isPending?"Submitting…":"Send Design Request"}<ArrowRight className="w-4 h-4 ml-2"/></Button>:<Button className="w-full" onClick={()=>navigate("/login")}>Sign in to request a service</Button>}
            {user?.role==="seller"&&<p className="text-xs text-muted-foreground">Sellers can book other stores' services but not their own store.</p>}
          </CardContent>
        </Card>
      </>}
    </main><Footer/>
  </div>;
}
