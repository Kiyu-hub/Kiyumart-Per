export interface FashionServiceApplication {
  id: string;
  storeId: string;
  sellerId: string;
  status: "pending" | "changes_requested" | "approved" | "rejected" | "suspended";
  headline: string;
  bio: string;
  specialties: string[];
  coverageAreas: string[];
  languages: string[];
  portfolioUrls: string[];
  evidenceUrls?: string[];
  experienceYears: number | null;
  availability: { days: number[]; advanceDays: number; paused: boolean };
  reviewNote?: string | null;
}
export interface FashionServiceOffering {
  id: string;
  storeId: string;
  title: string;
  serviceType: "tailoring" | "custom_design" | "occasion_wear" | "consultation";
  description: string;
  startingPricePesewas: number;
  turnaroundDays: number;
  isActive: boolean;
}
export interface FashionServiceRequest {
  id: string;
  referenceCode: string;
  storeId: string;
  sellerId: string;
  buyerId: string;
  offeringId: string | null;
  serviceTitle: string;
  description: string;
  referenceImages: string[];
  preferredDate: string | null;
  fittingMethod: string;
  customerLocation: string | null;
  status: "pending" | "quoted" | "accepted" | "in_progress" | "ready_for_collection" | "completed" | "cancelled" | "declined";
  quotePesewas: number | null;
  depositPercent: number | null;
  quoteExpiresAt: string | null;
  paidPesewas: number;
  createdAt: string;
}
export interface FashionServiceMessage {
  id: string;
  senderId: string;
  message: string;
  createdAt: string;
}
export interface FashionServicesPublic {
  profile: Omit<FashionServiceApplication, "status" | "evidenceUrls" | "reviewNote"> & {
    storeName: string;
    verifiedService: boolean;
  };
  offerings: FashionServiceOffering[];
  reviews: Array<{rating:number;comment:string;createdAt:string}>;
}
export const formatPesewas = (pesewas: number | null | undefined) =>
  new Intl.NumberFormat("en-GH",{style:"currency",currency:"GHS"}).format((pesewas||0)/100);
export const serviceTypes = [
  {key:"tailoring",label:"Tailoring & Alterations"},
  {key:"custom_design",label:"Custom Fashion Design"},
  {key:"occasion_wear",label:"Bridal & Occasion Wear"},
  {key:"consultation",label:"Fashion Consultation"},
] as const;
export const requestStatusLabel = (status: string) => status.replaceAll("_"," ").replace(/\b\w/g,char=>char.toUpperCase());
