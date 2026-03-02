export type ProviderId = "PROVIDER_A" | "PROVIDER_B";

export type AppRole =
  | "buyer"
  | "seller"
  | "rider"
  | "agent"
  | "admin"
  | "super_admin";

export type TripPhase =
  | "idle"
  | "assigned"
  | "pickup"
  | "en_route"
  | "arrived"
  | "delivered";

export type RerouteReason = "destination_set" | "phase_change" | "deviation";

export interface Coordinates {
  lat: number;
  lng: number;
}

export interface RealityGpsUpdate {
  vehicleId: string;
  orderId?: string;
  position: Coordinates;
  speedMps?: number | null;
  bearingDeg?: number | null;
  accuracyM?: number | null;
  timestampMs: number;
}

export interface CanonicalETA {
  minutes: number;
  distanceKm: number;
  source: string;
  calculatedAtMs: number;
}

export interface RouteInstruction {
  text: string;
  distanceMeters: number;
}

export interface RouteResult {
  geometry: Coordinates[];
  instructions: RouteInstruction[];
  distanceMeters: number;
  durationSeconds: number;
  etaMinutes: number;
  source: string;
}

export interface DeviationMetrics {
  distanceFromRouteMeters: number;
  exceededThreshold: boolean;
  thresholdMeters: number;
}

export interface VehicleSnapshot {
  vehicleId: string;
  orderId?: string;
  tripPhase: TripPhase;
  confirmedPosition?: Coordinates;
  predictedPosition?: Coordinates;
  speedMps?: number;
  bearingDeg?: number;
  route?: RouteResult;
  eta?: CanonicalETA;
  lastRerouteReason?: RerouteReason;
  deviation?: DeviationMetrics;
  lastRealityUpdateMs?: number;
}

export interface MapRenderConfig {
  provider: ProviderId;
  tileUrl: string;
  attribution: string;
  minZoom?: number;
  maxZoom?: number;
  detectRetina?: boolean;
  updateWhenIdle?: boolean;
  keepBuffer?: number;
}

export interface MapRenderer {
  id: ProviderId;
  getRenderConfig(): MapRenderConfig;
}

export interface RoutingRequest {
  from: Coordinates;
  to: Coordinates;
  reason: RerouteReason;
}

export interface RoutingEngine {
  id: ProviderId;
  route(request: RoutingRequest): Promise<RouteResult>;
}

export interface VehicleAnimatorState {
  position?: Coordinates;
  speedMps: number;
  bearingDeg: number;
}

export interface VehicleAnimator {
  start(): void;
  stop(): void;
  setRoute(route: RouteResult | undefined): void;
  setReality(update: RealityGpsUpdate): void;
  getState(): VehicleAnimatorState;
  subscribe(listener: (state: VehicleAnimatorState) => void): () => void;
}

export interface TrackingProvider {
  start(onGps: (update: RealityGpsUpdate) => void): void;
  stop(): void;
}

export interface ETARequest {
  orderId: string;
  vehicleId: string;
  riderLat?: number | null;
  riderLng?: number | null;
  speed?: number | null;
  tripPhase?: TripPhase;
}

export interface ETAService {
  getStableEta(request: ETARequest): Promise<CanonicalETA>;
}

export interface UsageSnapshot {
  tileLoads: number;
  routeCalls: number;
  mapInstantiations: number;
  tileUsagePct: number;
  routeUsagePct: number;
  mapUsagePct: number;
  disableReroute: boolean;
  freezeSecondaryLayers: boolean;
  alerts: Array<{ levelPct: number; metric: string; timestampMs: number }>;
}

export interface UsageMonitor {
  trackTileLoad(): void;
  trackRouteCall(): void;
  trackMapInstantiation(): void;
  getSnapshot(): UsageSnapshot;
  subscribe(listener: (snapshot: UsageSnapshot) => void): () => void;
}

export interface NotificationService {
  notifyReportRequested(payload: { requestedBy: string; reportType: string; relatedId?: string }): void;
  notifyTripFlagged(payload: { orderId: string; vehicleId: string; reason: string }): void;
  notifyAnomaly(payload: { vehicleId: string; message: string; orderId?: string }): void;
}

export interface RoleMetric {
  id: string;
  label: string;
  value: string;
}

export interface AnalyticsSnapshot {
  activeVehicles: number;
  staleVehicles: number;
  anomalyCount: number;
  averageDeviationMeters: number;
  etaStabilityScore: number;
  usage: UsageSnapshot;
}

export interface AnalyticsEngine {
  ingestVehicleSnapshot(snapshot: VehicleSnapshot): void;
  getSnapshot(): AnalyticsSnapshot;
  getRoleMetrics(role: AppRole): RoleMetric[];
}

export interface DashboardAccessController {
  canViewMetric(role: AppRole, metricId: string): boolean;
  filterMetrics(role: AppRole, metrics: RoleMetric[]): RoleMetric[];
}

