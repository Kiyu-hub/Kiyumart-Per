# Phase 2 - Zone Soft-Matching Upgrade (February 21, 2026)

## Scope

This phase upgrades existing city/region zone usage to an Uber-style soft-zone model without replacing infrastructure, APIs, or core UI flows.

## Non-Breaking Guarantees

- Existing `delivery_zones` records are preserved.
- Existing rider assignment APIs remain valid.
- Database remains source of truth.
- Real-time layer is event broadcasting only (Socket.IO already in use).
- No paid APIs or paid routing/maps services added.

## Audit Summary (What was found)

1. Rider matching was distance-based with a fixed radius and no zone-aware ranking.
2. Zone model lacked structured `city/region/type` metadata in DB.
3. Rider application did not consistently capture city/region, reducing zone match quality.
4. Admin manual assignment UI expected zone city display, but backend model did not guarantee it.

## Implemented Changes

## 1) Schema & Migration (Non-Destructive)

Migration file: `migrations/0020_soft_zone_upgrade.sql`

Added columns:

- `delivery_zones.type` (`city` or `region`, default `city`)
- `delivery_zones.city`
- `delivery_zones.region`
- `users.rider_city`
- `users.rider_region`
- `users.delivery_zone_id` (FK to `delivery_zones.id`)

Backfill behavior:

- `delivery_zones.city` receives legacy `name` when empty.
- Invalid/null zone type values normalized to `city`.

## 2) Soft-Zone Matching Logic

Matching remains backend-only and deterministic:

1. Filter rider pool by availability and non-active-delivery.
2. Compute distance using Haversine formula.
3. Rank with distance-first + soft zone preference:
   - same-zone candidate receives boost only when distance difference is minimal.
4. Dispatch sequential offers to one rider at a time.
5. Expand search radius when needed:
   - `3km -> 5km -> 8km`

Feature flag:

- `ENABLE_SOFT_ZONE_MATCH` (defaults to enabled; set `false` to disable same-zone ranking boost).

## 3) Rider Onboarding Improvements

Rider application now captures:

- `riderCity`
- `riderRegion`

Backend behavior:

- trims/normalizes values;
- best-effort fallback from `businessAddress` for compatibility;
- best-effort mapping to `deliveryZoneId` using city/region and legacy zone name.

## 4) Admin UI Compatibility

- Delivery Zone management UI now supports `type`, `city`, and `region`.
- Manual assignment UI now safely renders zone location using `city || region || "Not specified"`.

## Assignment Decision Model (Reference)

```text
input: order, riders, zones
for radius in [3, 5, 8]:
  candidates = available riders within radius
  rank by:
    1) zoneMatched (only when close to best-distance candidate)
    2) distance ascending
    3) rating descending
  offer one rider at a time with timeout
  if accepted -> assign and stop
if all fail -> emit assignment failure for admin/super admin visibility
```

## Zero-Cost Resource Check

- Maps: OpenStreetMap + Leaflet (unchanged, free/open-source)
- Distance: Haversine formula (in-code math, no external billing)
- Realtime: Socket.IO (open-source, existing)
- DB: existing PostgreSQL + Drizzle (unchanged)

## Validation Executed

- `npm run typecheck` passed.
- `npm run build:frontend` passed.

## Rollout Notes

1. Run migration before deployment:
   - `migrations/0020_soft_zone_upgrade.sql`
2. Keep feature flag enabled for soft-zone ranking:
   - `ENABLE_SOFT_ZONE_MATCH=true` (default behavior)
3. Existing operations continue with backward-compatible defaults.
