import { useEffect, useRef, useState } from "react";
import { useRoute, useLocation } from "wouter";
import { useMutation, useQuery } from "@tanstack/react-query";
import { useAuth } from "@/lib/auth";
import { fetchApiJson, queryClient } from "@/lib/queryClient";
import { useToast } from "@/hooks/use-toast";
import Header from "@/components/Header";
import Footer from "@/components/Footer";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Textarea } from "@/components/ui/textarea";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { ArrowLeft, CheckCircle2, CreditCard, MessageCircle, Send, Scissors } from "lucide-react";
import { formatPesewas, requestStatusLabel, type FashionServiceRequest, type FashionServiceMessage } from "@/lib/fashionServices";

type Detail = { request: FashionServiceRequest; messages: FashionServiceMessage[] };
const post = <T,>(url:string,payload:unknown={},method="POST")=>fetchApiJson<T>(url,{method,
  headers:{"Content-Type":"application/json"},body:JSON.stringify(payload),
});

export default function FashionServiceRequestDetail() {
  const [,params]=useRoute("/fashion-services/requests/:id");
  const id=params?.id||"";
  const {user,isAuthenticated}=useAuth();
  const [,navigate]=useLocation();
  const {toast}=useToast();
  const [text,setText]=useState("");
  const [quote,setQuote]=useState("");
  const [deposit,setDeposit]=useState("50");
  const [rating,setRating]=useState("5");
  const [comment,setComment]=useState("");
  const verifiedRef=useRef<string|null>(null);
  const {data,isLoading,isError}=useQuery<Detail>({
    queryKey:["/api/fashion-service-requests",id],
    queryFn:()=>fetchApiJson<Detail>("/api/fashion-service-requests/"+id),
    enabled:isAuthenticated&&!!id,
    refetchInterval:12000,
  });
  const request=data?.request;
  const isBuyer=request?.buyerId===user?.id;
  const isSeller=request?.sellerId===user?.id;
  const invalidate=()=>queryClient.invalidateQueries({queryKey:["/api/fashion-service-requests",id]});
  const send=useMutation({
    mutationFn:()=>post("/api/fashion-service-requests/"+id+"/messages",{message:text}),
    onSuccess:()=>{setText("");invalidate();},
    onError:(e:Error)=>toast({title:"Message failed",description:e.message,variant:"destructive"}),
  });
  const quoteMutation=useMutation({
    mutationFn:()=>post("/api/fashion-service-requests/"+id+"/quote",{
      quotePesewas:Math.round(Number(quote)*100),depositPercent:Number(deposit),expiresInDays:7,
    }),
    onSuccess:()=>{invalidate();toast({title:"Quotation sent to customer"});},
    onError:(e:Error)=>toast({title:"Quote failed",description:e.message,variant:"destructive"}),
  });
  const accept=useMutation({
    mutationFn:()=>post("/api/fashion-service-requests/"+id+"/accept"),
    onSuccess:()=>{invalidate();toast({title:"Quote accepted",description:"Payment will be available once the service payment rollout is enabled."});},
    onError:(e:Error)=>toast({title:"Unable to accept quote",description:e.message,variant:"destructive"}),
  });
  const change=useMutation({
    mutationFn:(status:string)=>post("/api/fashion-service-requests/"+id+"/status",{status},"PATCH"),
    onSuccess:()=>{invalidate();toast({title:"Request updated"});},
    onError:(e:Error)=>toast({title:"Status update failed",description:e.message,variant:"destructive"}),
  });
  const pay=useMutation({
    mutationFn:()=>post<{authorizationUrl:string}>("/api/fashion-service-requests/"+id+"/payments/initialize"),
    onSuccess:d=>{
      try {
        const target=new URL(d.authorizationUrl);
        if(target.protocol!=="https:"||!target.hostname.endsWith(".paystack.co")) throw new Error("Unexpected payment destination");
        window.location.assign(target.href);
      }catch{toast({title:"Unable to open payment provider",variant:"destructive"});}
    },
    onError:(e:Error)=>toast({title:"Payment unavailable",description:e.message,variant:"destructive"}),
  });
  const verify=useMutation({
    mutationFn:(reference:string)=>post("/api/fashion-service-payments/"+encodeURIComponent(reference)+"/verify"),
    onSuccess:()=>{invalidate();toast({title:"Paystack payment verified"});},
    onError:(e:Error)=>toast({title:"Payment verification pending",description:e.message,variant:"destructive"}),
  });
  const review=useMutation({
    mutationFn:()=>post("/api/fashion-service-requests/"+id+"/reviews",{rating:Number(rating),comment}),
    onSuccess:()=>{setComment("");toast({title:"Thank you for reviewing this service"});},
    onError:(e:Error)=>toast({title:"Review not submitted",description:e.message,variant:"destructive"}),
  });
  useEffect(()=>{
    if(!isBuyer||!request||typeof window==="undefined")return;
    const ref=new URLSearchParams(window.location.search).get("reference");
    if(!ref||verifiedRef.current===ref)return;
    verifiedRef.current=ref;
    verify.mutate(ref);
  },[isBuyer,request?.id]);
  if(!isAuthenticated)return <div className="p-8">Sign in to access your private fashion service requests.</div>;
  return <div className="min-h-screen bg-background"><Header/>
    <main className="max-w-5xl mx-auto p-4 md:py-8 space-y-5">
      <Button variant="ghost" onClick={()=>navigate(isSeller?"/seller/fashion-services":"/fashion-services/my-requests")}><ArrowLeft className="w-4 h-4 mr-2"/>Back to requests</Button>
      {isLoading&&<p className="text-muted-foreground">Loading your service request…</p>}
      {isError&&<p className="text-destructive">This request is unavailable or you do not have permission to view it.</p>}
      {request&&<><div className="flex flex-wrap gap-3 justify-between items-center">
        <div><h1 className="text-2xl font-bold flex gap-2 items-center"><Scissors className="text-[#009688]"/>{request.serviceTitle}</h1>
          <p className="text-sm text-muted-foreground mt-1">{request.referenceCode}</p></div>
        <Badge>{requestStatusLabel(request.status)}</Badge>
      </div>
      <div className="grid gap-5 lg:grid-cols-3">
        <div className="lg:col-span-2 space-y-5">
          <Card><CardHeader><CardTitle>Design request</CardTitle><CardDescription>Private details shared only between the customer, the seller and authorized support.</CardDescription></CardHeader>
            <CardContent className="space-y-3 text-sm">
              <p className="whitespace-pre-wrap">{request.description}</p>
              {request.preferredDate&&<p><strong>Preferred date:</strong> {new Date(request.preferredDate).toLocaleString()}</p>}
              <p><strong>Fitting:</strong> {requestStatusLabel(request.fittingMethod)}</p>
              {request.customerLocation&&<p><strong>Location:</strong> {request.customerLocation}</p>}
              {request.referenceImages.length>0&&<div className="flex overflow-x-auto gap-2">{request.referenceImages.map((src,i)=><img key={src+i} src={src} alt={"Reference "+(i+1)} className="w-28 h-28 object-cover rounded-lg shrink-0"/>)}</div>}
            </CardContent></Card>
          <Card><CardHeader><CardTitle className="flex items-center gap-2"><MessageCircle className="w-5 h-5"/>Discuss your order</CardTitle>
            <CardDescription>Keep fabric selection, measurements and progress updates in your private request conversation.</CardDescription></CardHeader>
            <CardContent className="space-y-3">
              <div className="max-h-96 overflow-y-auto rounded-xl border p-3 space-y-3">
                {!data?.messages.length&&<p className="text-sm text-muted-foreground">Start a conversation to clarify details.</p>}
                {data?.messages.map(m=><div key={m.id} className={"flex "+(m.senderId===user?.id?"justify-end":"justify-start")}>
                  <div className={"max-w-[90%] rounded-xl px-3 py-2 text-sm "+(m.senderId===user?.id?"bg-[#009688] text-white":"bg-muted")}>
                    <p className="whitespace-pre-wrap">{m.message}</p>
                    <p className="text-[10px] opacity-70 mt-1">{new Date(m.createdAt).toLocaleString()}</p>
                  </div>
                </div>)}
              </div>
              {!["cancelled","declined"].includes(request.status)&&<div className="flex gap-2">
                <Input value={text} onChange={e=>setText(e.target.value)} maxLength={2500}
                  placeholder="Message the "+(isBuyer?"seller":"customer")} onKeyDown={e=>{if(e.key==="Enter"&&!e.shiftKey&&text.trim()){e.preventDefault();send.mutate();}}}/>
                <Button disabled={send.isPending||!text.trim()} onClick={()=>send.mutate()} aria-label="Send message"><Send className="w-4 h-4"/></Button>
              </div>}
            </CardContent></Card>
        </div>
        <div className="space-y-5">
          <Card><CardHeader><CardTitle>Quotation & payment</CardTitle></CardHeader>
            <CardContent className="space-y-3 text-sm">
              {request.quotePesewas?<><p className="flex justify-between"><span>Quoted total</span><strong>{formatPesewas(request.quotePesewas)}</strong></p>
                <p className="flex justify-between"><span>Deposit</span><strong>{request.depositPercent}%</strong></p>
                <p className="flex justify-between"><span>Verified payments</span><strong>{formatPesewas(request.paidPesewas)}</strong></p>
                <p className="text-xs text-muted-foreground">Quote valid until {request.quoteExpiresAt?new Date(request.quoteExpiresAt).toLocaleDateString():"—"}</p>
              </>:<p className="text-muted-foreground">Awaiting seller quotation.</p>}
              {isSeller&&["pending","quoted"].includes(request.status)&&request.paidPesewas===0&&<div className="space-y-2">
                <Label>Final price in GHS</Label><Input type="number" step="0.01" min="1" value={quote} onChange={e=>setQuote(e.target.value)}/>
                <Label>Initial payment</Label><select className="border rounded-md p-2 w-full bg-background" value={deposit} onChange={e=>setDeposit(e.target.value)}>
                  <option value="50">50% deposit, balance later</option><option value="100">Full payment</option>
                </select>
                <Button disabled={quoteMutation.isPending||Number(quote)<=0} onClick={()=>quoteMutation.mutate()} className="w-full">Send quotation</Button>
              </div>}
              {isBuyer&&request.status==="quoted"&&<Button className="w-full" disabled={accept.isPending} onClick={()=>accept.mutate()}>Accept quotation</Button>}
              {isBuyer&&request.status==="accepted"&&(request.paidPesewas<(request.quotePesewas||0))&&<>
                <Button className="w-full" disabled={pay.isPending} onClick={()=>pay.mutate()}><CreditCard className="w-4 h-4 mr-2"/>Pay through Paystack</Button>
                <p className="text-xs text-muted-foreground">Paystack will be activated only after the service-payment rollout is tested. No payment is charged by this form itself.</p>
              </>}
              {isSeller&&request.status==="accepted"&&<Button className="w-full" disabled={change.isPending} onClick={()=>change.mutate("in_progress")}>Start production (requires verified deposit)</Button>}
              {isSeller&&request.status==="in_progress"&&<Button className="w-full" disabled={change.isPending} onClick={()=>change.mutate("ready_for_collection")}>Mark ready for customer</Button>}
              {isBuyer&&request.status==="ready_for_collection"&&<Button className="w-full" disabled={change.isPending} onClick={()=>change.mutate("completed")}><CheckCircle2 className="w-4 h-4 mr-2"/>Confirm completed</Button>}
              {isSeller&&request.status==="pending"&&<Button variant="destructive" className="w-full" disabled={change.isPending} onClick={()=>change.mutate("declined")}>Decline request</Button>}
              {isBuyer&&["pending","quoted","accepted"].includes(request.status)&&request.paidPesewas===0&&
                <Button variant="outline" className="w-full" disabled={change.isPending} onClick={()=>change.mutate("cancelled")}>Cancel request</Button>}
            </CardContent></Card>
          {isBuyer&&request.status==="completed"&&request.quotePesewas!==null&&request.paidPesewas>=request.quotePesewas&&<Card>
            <CardHeader><CardTitle>Review your experience</CardTitle></CardHeader><CardContent className="space-y-3">
              <Label>Rating</Label><select className="w-full border rounded-md p-2 bg-background" value={rating} onChange={e=>setRating(e.target.value)}>
                {[5,4,3,2,1].map(x=><option key={x} value={x}>{x} / 5</option>)}
              </select>
              <Textarea value={comment} onChange={e=>setComment(e.target.value)} maxLength={1000} placeholder="What was your experience?"/>
              <Button className="w-full" onClick={()=>review.mutate()} disabled={review.isPending}>Submit review</Button>
            </CardContent></Card>}
        </div>
      </div></>}
    </main><Footer/></div>;
}
