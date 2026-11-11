import { Router, type RequestHandler, type Response } from "express";
import rateLimit from "express-rate-limit";
import { and, asc, desc, eq, sql, lte } from "drizzle-orm";
import { randomUUID } from "node:crypto";
import { z } from "zod";
import { db } from "../db";
import { users, stores, catalogDepartments, notifications } from "@shared/schema";
import {
  fashionServiceApplications as applications,
  fashionServiceOfferings as offerings,
  fashionServiceRequests as requests,
  fashionServiceMessages as messages,
  fashionServicePayments as payments,
  fashionServiceReviews as reviews,
} from "@shared/fashionServicesSchema";
import {
  canTransitionFashionRequest, depositDuePesewas,
  nextFashionPaymentPesewas, validServiceType, validateFashionImages,
  type FashionRequestStatus,
} from "@shared/fashionServiceRules";
import { requireAuth, requireRole, type AuthRequest } from "./auth";
import { storage } from "./storage";

export const fashionServicesRouter = Router();
class HttpError extends Error {
  constructor(readonly statusCode: number, message: string) { super(message); }
}
const fail = (code: number, text: string): never => { throw new HttpError(code, text); };
const short = (limit = 160) => z.string().trim().min(1).max(limit);
const list = (max = 8, chars = 100) => z.array(z.string().trim().min(1).max(chars)).max(max);
const images = z.array(z.string().trim()).max(12).default([]);
const appInput = z.object({
  headline: short(120),
  bio: short(2000),
  specialties: z.array(z.enum(["tailoring","custom_design","occasion_wear","consultation"])).min(1).max(4),
  coverageAreas: list(12, 90).default([]),
  languages: list(8, 45).default([]),
  portfolioUrls: images,
  evidenceUrls: images,
  experienceYears: z.number().int().min(0).max(70).optional(),
});
const profileInput = z.object({
  headline: short(120).optional(),
  bio: short(2000).optional(),
  coverageAreas: list(12, 90).optional(),
  languages: list(8, 45).optional(),
  portfolioUrls: images.optional(),
  availability: z.object({
    days: z.array(z.number().int().min(0).max(6)).min(1).max(7),
    advanceDays: z.number().int().min(1).max(180),
    paused: z.boolean(),
  }).optional(),
}).strict();
const offerInput = z.object({
  title: short(120),
  serviceType: z.enum(["tailoring","custom_design","occasion_wear","consultation"]),
  description: short(1200),
  startingPricePesewas: z.number().int().min(0).max(10_000_000),
  turnaroundDays: z.number().int().min(1).max(365),
});
const requestInput = z.object({
  offeringId: z.string().uuid(),
  description: short(3000),
  referenceImages: images,
  preferredDate: z.string().datetime({ offset: true }).optional(),
  fittingMethod: z.enum(["discuss","in_store","virtual"]).default("discuss"),
  customerLocation: z.string().trim().max(260).optional(),
});
const quoteInput = z.object({
  quotePesewas: z.number().int().min(100).max(10_000_000),
  depositPercent: z.union([z.literal(50), z.literal(100)]),
  expiresInDays: z.number().int().min(1).max(30).default(7),
});
function handler(fn: (req: AuthRequest, res: Response) => Promise<unknown>): RequestHandler {
  return (req, res, next) => Promise.resolve(fn(req as AuthRequest, res)).catch(error => {
    if (res.headersSent) return next(error);
    if (error instanceof z.ZodError) return res.status(400).json({ error: "Invalid form details", details: error.issues.map(x=>({ path:x.path.join("."), message:x.message })) });
    if (error instanceof HttpError) return res.status(error.statusCode).json({ error: error.message });
    console.error("[FASHION SERVICES] Operation failed", error);
    return res.status(503).json({ error: "Fashion services are temporarily unavailable" });
  });
}
const limiter = rateLimit({ windowMs: 60 * 60_000, limit: 25, standardHeaders: "draft-7", legacyHeaders: false });
const messageLimiter = rateLimit({ windowMs: 5 * 60_000, limit: 30, standardHeaders: "draft-7", legacyHeaders: false });

async function ensureFashionDepartment() {
  const [department] = await db.select().from(catalogDepartments)
    .where(eq(catalogDepartments.slug,"clothing")).limit(1);
  if (!department?.isEnabled || !department.launchReady) fail(409, "Fashion services are not enabled");
}
async function sellerStore(id: string) {
  const [user, store] = await Promise.all([storage.getUser(id),storage.getStoreByPrimarySeller(id)]);
  if (!user || user.role !== "seller" || user.isActive === false || !user.isApproved ||
      !store || store.isActive === false || !store.isApproved || store.storeType !== "clothing") {
    fail(403, "An active approved clothing store is required");
  }
  return store!;
}
async function findApplication(storeId: string) {
  const [app] = await db.select().from(applications).where(eq(applications.storeId,storeId)).limit(1);
  return app || null;
}
async function requireApprovedService(storeId: string) {
  await ensureFashionDepartment();
  const app = await findApplication(storeId);
  if (!app || app.status !== "approved" || app.availability?.paused) fail(409,"Fashion services are not accepting requests");
  return app!;
}
async function getRequest(id: string, userId: string, role?: string) {
  const [request] = await db.select().from(requests).where(eq(requests.id,id)).limit(1);
  if (!request) fail(404,"Service request not found");
  if (request!.buyerId!==userId && request!.sellerId!==userId && role!=="super_admin") fail(403,"You cannot access this request");
  return request!;
}
function permittedMedia(values: string[], max = 8) {
  try { return validateFashionImages(values,max); }
  catch (error) { fail(400, error instanceof Error ? error.message : "Invalid image link"); }
}
async function notify(userId: string, title: string, message: string, requestId?: string) {
  try {
    await db.insert(notifications).values({
      userId, type: "message", title, message,
      metadata: requestId ? { kind: "fashion_service", requestId } : { kind: "fashion_service" },
    });
  } catch (error) {
    console.warn("[FASHION SERVICES] Notification delivery failed", error);
  }
}
function toPublicProfile(app: typeof applications.$inferSelect, storeName: string) {
  return { storeId: app.storeId, sellerId: app.sellerId, storeName,
    headline: app.headline, bio: app.bio, specialties: app.specialties,
    coverageAreas: app.coverageAreas, languages: app.languages,
    portfolioUrls: app.portfolioUrls, experienceYears: app.experienceYears,
    availability: app.availability,
    verifiedService: app.status==="approved" };
}

/** Public: no ID evidence, application notes or customer information. */
fashionServicesRouter.get("/api/stores/:storeId/fashion-services", handler(async (req,res)=>{
  const [store] = await db.select().from(stores).where(eq(stores.id,req.params.storeId)).limit(1);
  if (!store || store.isActive===false || store.isApproved===false || store.storeType!=="clothing") return res.status(404).json({error:"Fashion services unavailable"});
  const seller = store.primarySellerId ? await storage.getUser(store.primarySellerId) : null;
  if (!seller || seller.isActive===false || !seller.isApproved) return res.status(404).json({error:"Fashion services unavailable"});
  await ensureFashionDepartment();
  const app = await findApplication(store.id);
  if (app?.status!=="approved") return res.status(404).json({error:"Fashion services unavailable"});
  const activeOffers = await db.select().from(offerings).where(and(eq(offerings.storeId,store.id),eq(offerings.isActive,true))).orderBy(asc(offerings.createdAt));
  const history = await db.select({ rating:reviews.rating, comment:reviews.comment, createdAt:reviews.createdAt })
    .from(reviews).where(eq(reviews.sellerId,app!.sellerId)).orderBy(desc(reviews.createdAt)).limit(20);
  return res.json({ profile:toPublicProfile(app!,store.name), offerings:activeOffers, reviews:history });
}));

/** Seller: approval happens before the optional service application. */
fashionServicesRouter.get("/api/seller/fashion-services", requireAuth, requireRole("seller"), handler(async (req,res)=>{
  const store = await sellerStore(req.user!.id);
  const [app, serviceOffers, customerRequests] = await Promise.all([
    findApplication(store.id),
    db.select().from(offerings).where(eq(offerings.storeId,store.id)).orderBy(desc(offerings.createdAt)),
    db.select().from(requests).where(eq(requests.storeId,store.id)).orderBy(desc(requests.createdAt)).limit(100),
  ]);
  return res.json({storeId:store.id, application:app, offerings:serviceOffers, requests:customerRequests});
}));
fashionServicesRouter.post("/api/seller/fashion-services/apply", requireAuth, requireRole("seller"), limiter, handler(async (req,res)=>{
  const store=await sellerStore(req.user!.id);
  await ensureFashionDepartment();
  const data=appInput.parse(req.body);
  const portfolioUrls=permittedMedia(data.portfolioUrls,8);
  const evidenceUrls=permittedMedia(data.evidenceUrls,6);
  if (!portfolioUrls.length) fail(400,"Add at least one example of your fashion work");
  const old=await findApplication(store.id);
  if(old && (old.status==="approved" || old.status==="suspended")) fail(409,"An approved or suspended service account cannot be re-applied this way");
  if(old?.status==="pending") fail(409,"Your application is already under review");
  const update={headline:data.headline,bio:data.bio,specialties:data.specialties,coverageAreas:data.coverageAreas,
    languages:data.languages,portfolioUrls,evidenceUrls,experienceYears:data.experienceYears??0,
    status:"pending",reviewNote:null,reviewedBy:null,reviewedAt:null,updatedAt:new Date()};
  const [record]=old
    ?await db.update(applications).set(update).where(eq(applications.id,old.id)).returning()
    :await db.insert(applications).values({...update,storeId:store.id,sellerId:req.user!.id}).returning();
  // Do not return verification documents to anyone except the applicant and Super Admin.
  res.status(201).json({id:record.id,status:record.status});
}));
fashionServicesRouter.patch("/api/seller/fashion-services/profile", requireAuth, requireRole("seller"),handler(async(req,res)=>{
  const store=await sellerStore(req.user!.id);
  const data=profileInput.parse(req.body);
  const app=await findApplication(store.id);
  if(!app || app.status!=="approved") fail(403,"Service profile approval is required");
  if(!Object.keys(data).length) fail(400,"No profile changes provided");
  const portfolioUrls=data.portfolioUrls?permittedMedia(data.portfolioUrls,8):undefined;
  const changedPortfolio=portfolioUrls && JSON.stringify(portfolioUrls)!==JSON.stringify(app.portfolioUrls);
  const update={...data, ...(portfolioUrls?{portfolioUrls}:{}),
    ...(changedPortfolio?{status:"pending",reviewNote:null}:{}),updatedAt:new Date()};
  const [saved]=await db.update(applications).set(update).where(eq(applications.id,app.id)).returning();
  return res.json({status:saved.status,reviewRequired:!!changedPortfolio});
}));
fashionServicesRouter.post("/api/seller/fashion-services/offerings",requireAuth,requireRole("seller"),handler(async(req,res)=>{
  const store=await sellerStore(req.user!.id);
  const app=await requireApprovedService(store.id);
  const input=offerInput.parse(req.body);
  if(!app.specialties.includes(input.serviceType)) fail(403,"This service type is not included in your approved application");
  const count=await db.select({id:offerings.id}).from(offerings).where(eq(offerings.storeId,store.id)).limit(21);
  if(count.length>=20) fail(409,"Maximum of 20 services per store");
  const [created]=await db.insert(offerings).values({...input,storeId:store.id,sellerId:req.user!.id}).returning();
  res.status(201).json(created);
}));
fashionServicesRouter.patch("/api/seller/fashion-services/offerings/:id",requireAuth,requireRole("seller"),handler(async(req,res)=>{
  const store=await sellerStore(req.user!.id);
  const app=await requireApprovedService(store.id);
  const input=offerInput.partial().extend({isActive:z.boolean().optional()}).strict().parse(req.body);
  if(input.serviceType && !app.specialties.includes(input.serviceType)) fail(403,"Service type not approved");
  if(!Object.keys(input).length) fail(400,"No changes provided");
  const [saved]=await db.update(offerings).set({...input,updatedAt:new Date()})
    .where(and(eq(offerings.id,req.params.id),eq(offerings.storeId,store.id))).returning();
  if(!saved) fail(404,"Service offering not found");
  res.json(saved);
}));

/** Administrative review is permissioned separately from seller approval. */
fashionServicesRouter.get("/api/admin/fashion-services/applications",requireAuth,requireRole("super_admin"),handler(async(_req,res)=>{
  const data=await db.select().from(applications).orderBy(desc(applications.updatedAt)).limit(250);
  res.json(data);
}));
fashionServicesRouter.patch("/api/admin/fashion-services/applications/:id",requireAuth,requireRole("super_admin"),handler(async(req,res)=>{
  const input=z.object({status:z.enum(["approved","rejected","changes_requested","suspended"]),note:z.string().trim().max(1200).default("")}).parse(req.body);
  const [app]=await db.select().from(applications).where(eq(applications.id,req.params.id)).limit(1);
  if(!app) fail(404,"Application not found");
  if(input.status==="approved") {
    await sellerStore(app.sellerId);
    if(!app.portfolioUrls.length) fail(409,"The applicant must submit a work portfolio");
  }
  if((input.status==="rejected"||input.status==="changes_requested"||input.status==="suspended")&&!input.note) fail(400,"An explanation is required");
  const [saved]=await db.update(applications).set({
    status:input.status,reviewNote:input.note,reviewedBy:req.user!.id,
    reviewedAt:new Date(),updatedAt:new Date(),
  }).where(eq(applications.id,app.id)).returning();
  await notify(app.sellerId,"Fashion Services review",`Your fashion services application is ${saved.status}.`);
  res.json({id:saved.id,status:saved.status});
}));

/** A booking is created only from an explicitly approved service offering. */
fashionServicesRouter.post("/api/stores/:storeId/fashion-service-requests", requireAuth, limiter, handler(async(req,res)=>{
  const user=await storage.getUser(req.user!.id);
  if(!user || user.isActive===false || !["buyer","seller","super_admin"].includes(String(user.role))) fail(403,"An active customer account is required");
  const [store]=await db.select().from(stores).where(eq(stores.id,req.params.storeId)).limit(1);
  if(!store || store.isActive===false || store.isApproved===false || !store.primarySellerId) fail(404,"Store not found");
  if(store.primarySellerId===user.id) fail(400,"You cannot request a service from your own store");
  const app=await requireApprovedService(store.id);
  const input=requestInput.parse(req.body);
  const [offering]=await db.select().from(offerings)
    .where(and(eq(offerings.id,input.offeringId),eq(offerings.storeId,store.id),eq(offerings.isActive,true))).limit(1);
  if(!offering) fail(404,"Service offering not found");
  const refs=permittedMedia(input.referenceImages,8);
  const preferredDate=input.preferredDate?new Date(input.preferredDate):null;
  if(preferredDate && (preferredDate.getTime()<Date.now() || preferredDate.getTime()>Date.now()+180*86400000)) fail(400,"Preferred date must be within the next 180 days");
  const avail=app.availability;
  if(preferredDate && (!avail.days.includes(preferredDate.getUTCDay()) || preferredDate.getTime()>Date.now()+avail.advanceDays*86400000)) fail(400,"The selected date is outside the seller's availability");
  const [saved]=await db.insert(requests).values({
    referenceCode:"KFS-"+randomUUID().slice(0,12).toUpperCase(),
    storeId:store.id,sellerId:app.sellerId,buyerId:user.id,
    offeringId:offering.id,serviceTitle:offering.title,description:input.description,
    referenceImages:refs,preferredDate,fittingMethod:input.fittingMethod,
    customerLocation:input.customerLocation||null,
  }).returning();
  await notify(saved.sellerId,"New fashion request",`A customer requested ${saved.serviceTitle}.`,saved.id);
  res.status(201).json({id:saved.id,referenceCode:saved.referenceCode,status:saved.status});
}));
fashionServicesRouter.get("/api/fashion-service-requests", requireAuth,handler(async(req,res)=>{
  const uid=req.user!.id;
  const role=req.user!.role;
  const data=role==="super_admin"
    ?await db.select().from(requests).orderBy(desc(requests.createdAt)).limit(200)
    :role==="seller"
      ?await db.select().from(requests).where(eq(requests.sellerId,uid)).orderBy(desc(requests.createdAt)).limit(100)
      :await db.select().from(requests).where(eq(requests.buyerId,uid)).orderBy(desc(requests.createdAt)).limit(100);
  res.json(data);
}));
fashionServicesRouter.get("/api/fashion-service-requests/:id",requireAuth,handler(async(req,res)=>{
  const data=await getRequest(req.params.id,req.user!.id,req.user!.role);
  const thread=await db.select().from(messages).where(eq(messages.requestId,data.id)).orderBy(asc(messages.createdAt));
  res.json({request:data,messages:thread});
}));
fashionServicesRouter.post("/api/fashion-service-requests/:id/messages",requireAuth,messageLimiter,handler(async(req,res)=>{
  const request=await getRequest(req.params.id,req.user!.id,req.user!.role);
  if(![request.buyerId,request.sellerId].includes(req.user!.id)) fail(403,"Only the customer or seller can message");
  if(["cancelled","declined"].includes(request.status)) fail(409,"This request is closed");
  const {message}=z.object({message:short(2500)}).parse(req.body);
  const [saved]=await db.insert(messages).values({requestId:request.id,senderId:req.user!.id,message}).returning();
  const target=req.user!.id===request.buyerId?request.sellerId:request.buyerId;
  await notify(target,"New fashion service message","You have a new message about a service request.",request.id);
  res.status(201).json(saved);
}));
fashionServicesRouter.post("/api/fashion-service-requests/:id/quote",requireAuth,requireRole("seller"),handler(async(req,res)=>{
  const input=quoteInput.parse(req.body);
  const request=await getRequest(req.params.id,req.user!.id);
  if(request.sellerId!==req.user!.id) fail(403,"Not your customer request");
  const store=await sellerStore(req.user!.id);
  await requireApprovedService(store.id);
  if(!["pending","quoted"].includes(request.status) || request.paidPesewas!==0) fail(409,"This request cannot be quoted");
  const [saved]=await db.update(requests).set({status:"quoted",quotePesewas:input.quotePesewas,depositPercent:input.depositPercent,
    quoteExpiresAt:new Date(Date.now()+input.expiresInDays*86400000),updatedAt:new Date()})
    .where(and(eq(requests.id,request.id),eq(requests.sellerId,req.user!.id))).returning();
  await notify(request.buyerId,"Fashion service quote", "The seller sent a quotation for your request.",request.id);
  res.json(saved);
}));
fashionServicesRouter.post("/api/fashion-service-requests/:id/accept",requireAuth,handler(async(req,res)=>{
  const reqData=await getRequest(req.params.id,req.user!.id);
  if(reqData.buyerId!==req.user!.id) fail(403,"Only the customer can accept");
  if(reqData.status!=="quoted"||!reqData.quotePesewas||!reqData.depositPercent||
    !reqData.quoteExpiresAt||reqData.quoteExpiresAt.getTime()<Date.now()) fail(409,"The quote has expired or is not ready");
  const [saved]=await db.update(requests).set({status:"accepted",updatedAt:new Date()})
    .where(and(eq(requests.id,reqData.id),eq(requests.status,"quoted"))).returning();
  if(!saved) fail(409,"Request status changed");
  await notify(saved.sellerId,"Quote accepted","The customer accepted the quotation.",saved.id);
  res.json(saved);
}));
fashionServicesRouter.patch("/api/fashion-service-requests/:id/status",requireAuth,handler(async(req,res)=>{
  const input=z.object({status:z.enum(["cancelled","declined","in_progress","ready_for_collection","completed"])}).parse(req.body);
  const data=await getRequest(req.params.id,req.user!.id,req.user!.role);
  const actor=data.buyerId===req.user!.id?"buyer":data.sellerId===req.user!.id?"seller":null;
  if(!actor) fail(403,"Only the customer or seller can change this request");
  const required=data.quotePesewas&&data.depositPercent
    ?depositDuePesewas(data.quotePesewas,data.depositPercent):0;
  if(!canTransitionFashionRequest(data.status as FashionRequestStatus,input.status,actor,data.paidPesewas,required)) {
    fail(409,"Invalid request transition or payment is required");
  }
  const [saved]=await db.update(requests).set({status:input.status,
    ...(input.status==="completed"?{completedAt:new Date()}:{}),updatedAt:new Date()})
    .where(and(eq(requests.id,data.id),eq(requests.status,data.status))).returning();
  if(!saved) fail(409,"Request was already updated");
  await notify(actor==="buyer"?data.sellerId:data.buyerId,"Fashion service update",
    `Your fashion service request is now ${input.status.replaceAll("_"," ")}.`,data.id);
  res.json(saved);
}));
fashionServicesRouter.post("/api/fashion-service-requests/:id/reviews",requireAuth,handler(async(req,res)=>{
  const data=await getRequest(req.params.id,req.user!.id);
  if(data.buyerId!==req.user!.id || data.status!=="completed") fail(403,"You can only review your completed service");
  if(!data.quotePesewas||data.paidPesewas<data.quotePesewas) fail(409,"Payment must be completed before reviewing");
  const input=z.object({rating:z.number().int().min(1).max(5),comment:z.string().trim().max(1000)}).parse(req.body);
  const [result]=await db.insert(reviews).values({requestId:data.id,buyerId:data.buyerId,sellerId:data.sellerId,...input})
    .onConflictDoNothing().returning();
  if(!result) fail(409,"This service has already been reviewed");
  await notify(data.sellerId,"New service review","A customer reviewed a completed service.",data.id);
  res.status(201).json(result);
}));

/**
 * Explicit release gate. Paystack transactions are disabled by default until
 * staging scenarios, payout reconciliation and refund policy are validated.
 * This code never credits a service booking from client-side success alone.
 */
const paystackEnabled=()=>process.env.FASHION_SERVICE_PAYMENTS_ENABLED==="true";
function paystackKey(): string {
  if(!paystackEnabled()) fail(503,"Fashion service payments are not enabled yet");
  const key=(process.env.PAYSTACK_SECRET_KEY||"").trim();
  if(!/^sk_(test|live)_/.test(key)) fail(503,"Paystack is not configured for service payments");
  return key;
}
fashionServicesRouter.post("/api/fashion-service-requests/:id/payments/initialize",requireAuth,handler(async(req,res)=>{
  const key=paystackKey();
  const data=await getRequest(req.params.id,req.user!.id);
  if(data.buyerId!==req.user!.id||data.status!=="accepted"||!data.quotePesewas||!data.depositPercent)
    fail(409,"This quotation is not ready for payment");
  const outstanding=nextFashionPaymentPesewas(data.quotePesewas,data.depositPercent,data.paidPesewas);
  if(outstanding<=0) fail(409,"Already paid in full");
  const existing=await db.select().from(payments).where(and(eq(payments.requestId,data.id),eq(payments.status,"initiated"))).limit(1);
  if(existing.length) fail(409,"You have an outstanding payment attempt. Verify it before creating a new one.");
  const buyer=await storage.getUser(data.buyerId);
  if(!buyer?.email) fail(409,"Buyer email is unavailable");
  const reference="kfs-"+randomUUID();
  const [record]=await db.insert(payments).values({
    requestId:data.id,buyerId:data.buyerId,paystackReference:reference,amountPesewas:outstanding,
  }).returning();
  const response=await fetch("https://api.paystack.co/transaction/initialize",{
    method:"POST",headers:{Authorization:`Bearer ${key}`,"Content-Type":"application/json"},
    body:JSON.stringify({email:buyer.email,amount:record.amountPesewas,currency:"GHS",reference,
      callback_url:`${process.env.FRONTEND_URL||"https://kiyumartofficial.netlify.app"}/fashion-services/requests/${data.id}?reference=${reference}`,
      metadata:{kind:"kiyumart_fashion_service",requestId:data.id,buyerId:data.buyerId,paymentId:record.id},
    }),signal:AbortSignal.timeout(12000),
  });
  const result=await response.json().catch(()=>({}));
  if(!response.ok||!result.status||!result.data?.authorization_url){
    await db.update(payments).set({status:"failed"}).where(eq(payments.id,record.id));
    fail(502,"Could not initialize service payment");
  }
  res.json({reference,authorizationUrl:result.data.authorization_url,amountPesewas:record.amountPesewas,currency:"GHS"});
}));
fashionServicesRouter.post("/api/fashion-service-payments/:reference/verify",requireAuth,handler(async(req,res)=>{
  const key=paystackKey();
  const [payment]=await db.select().from(payments).where(eq(payments.paystackReference,req.params.reference)).limit(1);
  if(!payment) fail(404,"Payment reference not found");
  if(payment.buyerId!==req.user!.id) fail(403,"This payment belongs to another customer");
  if(payment.status==="paid")return res.json({status:"paid",alreadyProcessed:true,requestId:payment.requestId});
  if(payment.status!=="initiated") fail(409,"This payment is no longer pending");
  const result=await fetch(`https://api.paystack.co/transaction/verify/${encodeURIComponent(payment.paystackReference)}`,{
    headers:{Authorization:`Bearer ${key}`},signal:AbortSignal.timeout(12000),
  });
  if(!result.ok) fail(502,"Could not verify payment");
  const body=await result.json();
  const transaction=body.data;
  if(!body.status||transaction?.status!=="success")fail(402,"Payment has not been confirmed");
  if(transaction.reference!==payment.paystackReference||transaction.currency!=="GHS"||
    Number(transaction.amount)!==payment.amountPesewas ||
    transaction.metadata?.kind!=="kiyumart_fashion_service"||
    transaction.metadata?.requestId!==payment.requestId||
    transaction.metadata?.buyerId!==payment.buyerId||
    transaction.metadata?.paymentId!==payment.id) fail(409,"Paystack confirmation did not match the booking");
  const updated=await db.transaction(async tx=>{
    const [changed]=await tx.update(payments).set({status:"paid",paidAt:new Date()})
      .where(and(eq(payments.id,payment.id),eq(payments.status,"initiated"))).returning();
    if(!changed)return false;
    const [saved]=await tx.update(requests).set({
      paidPesewas:sql`${requests.paidPesewas} + ${payment.amountPesewas}`,updatedAt:new Date(),
    }).where(and(eq(requests.id,payment.requestId),lte(requests.paidPesewas,
      sql`${requests.quotePesewas} - ${payment.amountPesewas}`))).returning();
    if(!saved)throw new Error("Payment value exceeded agreed quotation; requires reconciliation");
    return saved;
  });
  if(!updated)return res.json({status:"paid",alreadyProcessed:true,requestId:payment.requestId});
  await notify(updated.sellerId,"Service payment verified","A customer payment was verified by Paystack.",updated.id);
  res.json({status:"paid",alreadyProcessed:false,requestId:payment.requestId,paidPesewas:updated.paidPesewas});
}));
