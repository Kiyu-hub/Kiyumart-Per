# Real-Time Tracking Upgrade (Non-Breaking)

## Safety Guarantees
- Existing APIs are unchanged.
- Existing DB schema is unchanged.
- Existing pages/components remain in place; upgrades are additive.
- All provider-specific routing/rendering logic is isolated in adapters.

## Architecture Layers

### 1) Input / Reality Layer
- `client/src/tracking/reality/realityInput.ts`
- Accepts GPS, trip phase, and network events only.
- No animation, no rendering, no prediction.

### 2) Canonical State Layer
- `client/src/tracking/state/canonicalTrackingStore.ts`
- Single source of truth for:
  - Confirmed position
  - Route geometry
  - Trip phase
  - ETA
  - Last reroute reason
  - Deviation metrics

### 3) Routing / Navigation Layer
- Interfaces: `client/src/tracking/interfaces.ts`
- Provider adapters:
  - `client/src/tracking/providers/routing/osrmProviderA.ts`
  - `client/src/tracking/providers/routing/osrmProviderB.ts`
- Trigger policy is enforced in `client/src/tracking/hooks/useVehicleTracking.ts`:
  - Destination set
  - Phase change
  - Deviation threshold breach
- No polling and no GPS-triggered route recalculation loop.

### 4) Prediction / Motion Engine
- `client/src/tracking/motion/vehicleAnimator.ts`
- `requestAnimationFrame` animator with:
  - Continuous interpolation
  - Velocity smoothing
  - Bearing updates
  - Route snapping
  - Drift correction and anti-teleport clamping

### 5) Visualization Layer
- Map rendering components only:
  - `client/src/tracking/components/MapTileLayer.tsx`
  - `client/src/tracking/components/MapUsageTracker.tsx`
- Business logic stays in tracking hooks/services.

## Required Interfaces Implemented
- `MapRenderer`
- `RoutingEngine`
- `VehicleAnimator`
- `TrackingProvider`
- `ETAService`
- `UsageMonitor`
- `NotificationService`
- `AnalyticsEngine`
- `DashboardAccessController`

Defined in: `client/src/tracking/interfaces.ts`.

## Provider Switching
- Config flag: `USE_PROVIDER` from `VITE_MAP_PROVIDER`
- File: `client/src/tracking/config.ts`
- Values:
  - `PROVIDER_A`
  - `PROVIDER_B`
- Factory:
  - `client/src/tracking/providers/factory.ts`

No calling component needs provider-specific logic.

## Cost Protection
- Usage monitor:
  - `client/src/tracking/usage/usageMonitor.ts`
- Tracks:
  - Tile loads
  - Route calls
  - Map instantiations
- Alerts:
  - 60%
  - 80%
  - 90%
- Auto-degrade:
  - `disableReroute` at high usage
  - `freezeSecondaryLayers` at critical usage

## ETA Stability
- Service: `client/src/tracking/eta/stableEtaService.ts`
- Stabilization:
  - Minimum refresh interval
  - Blend-based smoothing
  - Meaningful-change gate to avoid flicker

## Notifications and Reports
- Tracking notifications:
  - `client/src/tracking/notifications/trackingNotificationService.ts`
- Notification bridge:
  - `client/src/contexts/NotificationContext.tsx`
- Report request signal:
  - `client/src/lib/reporting.ts`

## Dashboard Upgrades
- Role-scoped tracking panel:
  - `client/src/components/TrackingMetricsPanel.tsx`
- Wired into:
  - Rider dashboard
  - Agent dashboard
  - Admin/Super-admin dashboard

## Upgraded Map Surfaces
- `client/src/components/DeliveryMap.tsx`
- `client/src/components/RiderNavigationMap.tsx`
- `client/src/components/RiderLiveMap.tsx`
- `client/src/components/RealTimeRiderMap.tsx`

All continue to work with current API contracts while now using the shared tracking kernel.
