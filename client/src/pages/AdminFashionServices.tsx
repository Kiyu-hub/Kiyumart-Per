import { useMemo, useState } from "react";
import { useLocation } from "wouter";
import { useMutation, useQuery } from "@tanstack/react-query";
import { useAuth } from "@/lib/auth";
import { fetchApiJson, queryClient } from "@/lib/queryClient";
import DashboardLayout from "@/components/DashboardLayout";
import { Button } from "@/components/ui/button";
import { Textarea } from "@/components/ui/textarea";
import { Badge } from "@/components/ui/badge";
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from "@/components/ui/card";
import { useToast } from "@/hooks/use-toast";
import { BadgeCheck, ArrowLeft, ShieldCheck, AlertTriangle, Loader2, Scissors } from "lucide-react";
import { requestStatusLabel, type FashionServiceApplication } from "@/lib/fashionServices";

type Application = FashionServiceApplication & { reviewedBy: string | null; reviewedAt: string | null; updatedAt: string };
type Action = "approved" | "rejected" | "changes_requested" | "suspended";

export default function AdminFashionServices() {
  const {user,isLoading:authLoading} = useAuth();
  const [,navigate] = useLocation();
  const {toast} = useToast();
  const [notes,setNotes] = useState<Record<string,string>>({});
  const [filter,setFilter] = useState("all");
  const {data=[],isLoading,isError} = useQuery<Application[]>({
    queryKey:["/api/admin/fashion-services/applications"],
    enabled:!!user&&user.role==="super_admin",retry:false,
  });
  const mutation = useMutation({
    mutationFn:async({id,status}:{id:string;status:Action})=>
      fetchApiJson("/api/admin/fashion-services/applications/"+id,{
        method:"PATCH",headers:{"Content-Type":"application/json"},
        body:JSON.stringify({status,note:notes[id]||""}),
      }),
    onSuccess:()=>{queryClient.invalidateQueries({queryKey:["/api/admin/fashion-services/applications"]});toast({title:"Service verification updated"});},
    onError:(error:Error)=>toast({title:"Review failed",description:error.message,variant:"destructive"}),
  });
  const visible=useMemo(()=>data.filter(app=>filter==="all"||app.status===filter),[data,filter]);
  if(authLoading||!user||user.role!=="super_admin")return <div className="p-8 text-muted-foreground">Super Admin access required.</div>;
  return <DashboardLayout role="super_admin">
    <main className="max-w-5xl mx-auto p-4 md:p-8 space-y-5">
      <div className="flex items-center gap-3"><Button variant="ghost" size="icon" onClick={()=>navigate("/admin/categories")} aria-label="Back"><ArrowLeft/></Button>
        <div><h1 className="text-2xl font-bold flex items-center gap-2"><Scissors className="text-[#009688]"/>Fashion Services Verification</h1>
          <p className="text-sm text-muted-foreground">Review optional tailoring capabilities for approved clothing stores. Seller accounts remain unchanged.</p></div>
      </div>
      <Card className="border-[#009688]/25"><CardContent className="pt-5 flex gap-3 items-start"><ShieldCheck className="text-[#009688] shrink-0"/><div className="text-sm"><strong>Separate service approval.</strong> Approving a portfolio makes the store eligible to offer fashion services. It does not certify a professional qualification, authorize payments, or change the seller's existing store permissions. Never publish identity or private supporting documents.</div></CardContent></Card>
      <div className="flex flex-wrap gap-2">{["all","pending","changes_requested","approved","rejected","suspended"].map(s=><Button size="sm" key={s} variant={filter===s?"default":"outline"} onClick={()=>setFilter(s)}>{requestStatusLabel(s)} ({s==="all"?data.length:data.filter(d=>d.status===s).length})</Button>)}</div>
      {isLoading&&<p className="flex gap-2 items-center"><Loader2 className="animate-spin w-4 h-4"/> Loading applications…</p>}
      {isError&&<p className="text-destructive flex gap-2 items-center"><AlertTriangle/> Unable to load verification requests. Check database migration and permissions.</p>}
      {!isLoading&&visible.length===0&&<p className="text-sm text-muted-foreground">No applications in this status.</p>}
      {visible.map(app=><Card key={app.id}>
        <CardHeader><div className="flex items-start justify-between gap-3"><div>
          <CardTitle className="text-lg">{app.headline}</CardTitle>
          <CardDescription className="mt-1">Store ID: {app.storeId} · Seller ID: {app.sellerId}</CardDescription>
        </div><Badge variant={app.status==="approved"?"default":"secondary"}>{requestStatusLabel(app.status)}</Badge></div></CardHeader>
        <CardContent className="space-y-4">
          <p className="text-sm whitespace-pre-wrap">{app.bio}</p>
          <div className="flex flex-wrap gap-2">{app.specialties.map(s=><Badge key={s} variant="outline">{requestStatusLabel(s)}</Badge>)}</div>
          <p className="text-xs text-muted-foreground">Experience: {app.experienceYears??"Not specified"} years · Areas: {app.coverageAreas.join(", ")||"Not specified"}</p>
          <p className="text-xs font-medium">Submitted portfolio — compare work quality, consistency, and suitability</p>
          <div className="grid grid-cols-3 sm:grid-cols-5 gap-2">{app.portfolioUrls.map((url,i)=><a key={url+i} href={url} target="_blank" rel="noopener noreferrer"><img alt={"Portfolio "+(i+1)} src={url} className="aspect-square object-cover rounded-lg w-full"/></a>)}</div>
          {app.evidenceUrls?.length? <div className="space-y-1"><p className="text-xs font-semibold">Applicant-supplied supporting links (reviewer-only response)</p><div className="flex flex-wrap gap-2">{app.evidenceUrls.map((url,i)=><a href={url} target="_blank" rel="noopener noreferrer" key={url+i} className="text-xs text-[#009688] underline">Supporting item {i+1}</a>)}</div></div>:null}
          {app.reviewNote&&<p className="bg-muted rounded-lg p-3 text-sm">Previous feedback: {app.reviewNote}</p>}
          <Textarea placeholder="Reason required for rejection, suspension or requested changes…" value={notes[app.id]||""}
            onChange={e=>setNotes(state=>({...state,[app.id]:e.target.value}))} maxLength={1200}/>
          <div className="flex flex-wrap gap-2">
            <Button size="sm" disabled={mutation.isPending||app.status==="approved"} onClick={()=>mutation.mutate({id:app.id,status:"approved"})}><BadgeCheck className="w-4 h-4 mr-1"/>Approve services</Button>
            <Button size="sm" variant="outline" disabled={mutation.isPending||!notes[app.id]?.trim()} onClick={()=>mutation.mutate({id:app.id,status:"changes_requested"})}>Request changes</Button>
            <Button size="sm" variant="outline" disabled={mutation.isPending||!notes[app.id]?.trim()} onClick={()=>mutation.mutate({id:app.id,status:"rejected"})}>Reject</Button>
            <Button size="sm" variant="destructive" disabled={mutation.isPending||!notes[app.id]?.trim()||app.status==="suspended"} onClick={()=>mutation.mutate({id:app.id,status:"suspended"})}>Suspend services only</Button>
          </div>
        </CardContent>
      </Card>)}
    </main>
  </DashboardLayout>;
}
