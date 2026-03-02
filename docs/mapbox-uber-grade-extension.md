# Mapbox-First Uber-Grade Extension (Non-Breaking)

## What Was Added

- **Mapbox-first primary routing**:
  - `client/src/tracking/providers/routing/osrmProviderA.ts`
  - Uses Mapbox Directions API as primary provider.
  - Uses OSRM only as transparent fallback.
- **Mapbox-first primary basemap style**:
  - `client/src/tracking/providers/map/leafletProviderA.ts`
  - Uses Mapbox style tiles with `VITE_MAPBOX_ACCESS_TOKEN` + `VITE_MAPBOX_STYLE_ID`.
- **Provider-agnostic external map URL helper**:
  - `client/src/tracking/providers/externalMapUrl.ts`
  - Replaces direct provider URLs in rider/admin surfaces.
- **Deterministic lifecycle socket event stream**:
  - `server/routes.ts` emits `trip_lifecycle_event` from canonical order status transitions.
- **AI ETA controls (super-admin, runtime, non-breaking)**:
  - `GET /api/admin/eta-controls`
  - `PATCH /api/admin/eta-controls`
  - `GET /api/orders/:id/eta` now includes:
    - `rawEtaMinutes`
    - `aiEtaMinutes`
    - `etaConfidenceScore`
    - `aiEtaEnabled`
    - `aiEtaVisible`
    - `etaRegion`
- **Fraud/anomaly risk scoring (silent, non-blocking)**:
  - `server/services/riderRiskEngine.ts`
  - Signals include `impossible_speed` and `route_deviation`.
  - API: `GET /api/admin/rider-risk-scores`.

## Runtime Environment

- `VITE_MAPBOX_ACCESS_TOKEN`
- `VITE_MAPBOX_STYLE_ID` (default `mapbox/dark-v11`)
- `VITE_MAPBOX_DIRECTIONS_PROFILE` (default `driving`)

## Event Flow Compatibility

This extension preserves existing order flow and adds lifecycle telemetry:

- `ORDER_CREATED`
- `PAYMENT_CONFIRMED`
- `MATCHING_RIDER`
- `RIDER_ASSIGNED`
- `RIDER_ARRIVED_PICKUP`
- `PICKUP_VERIFIED`
- `IN_TRANSIT`
- `COMPLETED`
- `CANCELLED`

Events are emitted via socket as `trip_lifecycle_event` without changing existing APIs.

## Cost Guard Compatibility

Existing usage guard still enforces:
- tile loads
- route calls
- map instantiations
- warnings at 60/80/90%
- auto-degrade: reroute suppression and secondary-layer freeze

## QA Matrix (Operational)

- Rider assignment emits lifecycle event.
- GPS updates animate smoothly through tracking engine.
- Pickup/dropoff verification remains existing backend-gated flow.
- Deviation triggers risk signal + admin alert.
- AI ETA toggle fallback returns stable raw ETA when disabled.
- No schema changes.
- Existing endpoints and dashboards remain intact.
