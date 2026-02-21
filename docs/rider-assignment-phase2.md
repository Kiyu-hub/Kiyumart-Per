# Phase 2 Rider Assignment & Delivery Sync (February 21, 2026)

## Scope

This phase upgrades rider assignment and delivery tracking logic to a deterministic, backend-first model while keeping existing infrastructure and APIs intact.

## Non-Breaking Strategy

- Kept existing DB and tables (`orders`, `users`, `delivery_tracking`, `order_status_history`).
- Kept existing Socket.IO stack; extended event handling only.
- Kept existing dashboards and routes; added incremental endpoints.
- No paid services added.

## Status Lifecycle (Backward Compatible)

Order statuses now support:

- `pending`
- `searching_rider`
- `confirmed`
- `ready`
- `processing`
- `assigned`
- `rider_arrived`
- `picked_up`
- `in_transit`
- `en_route`
- `delivered`
- `completed`
- `cancelled`
- `disputed`

Legacy aliases are still accepted and canonicalized (`ready_for_pickup`, `assigned_to_rider`, `out_for_delivery`, `delivering`).

## Rider Matching Logic

Implemented deterministic candidate ranking from backend:

1. Rider must be `approved + active`.
2. Rider must not be on active delivery.
3. Candidate distance uses Haversine math from latest rider GPS to order location.
4. Radius filter: `<= 5km` when coordinates are available.
5. Sort: `distance ASC`, then `rating DESC`, then `riderId ASC`.
6. Limit: top `5` candidates.

## Offer Dispatch Flow

- One rider receives the offer at a time.
- Offer timeout: `12 seconds`.
- Rider response API: accept/reject.
- On reject/timeout, backend dispatches next rider.
- Manual assignment remains available and clears pending auto-matching state.

New endpoints:

- `POST /api/orders/:id/start-rider-matching`
- `POST /api/rider/assignment-offers/:orderId/respond`
- `GET /api/admin/rider-assignment/active`

## Real-Time Tracking Alignment

Tracking is now accepted from:

- HTTP: `POST /api/delivery-tracking`
- Socket: `rider_location_update`

Backend now:

- validates coordinates
- smooths short GPS jitter
- suppresses impossible spikes
- persists final point to DB
- broadcasts same payload to buyer/seller/rider/admin/super_admin

Deviation alerts are emitted to admin/super_admin via `geofence_alert` when route drift increases sharply.

## Auto-Reassign / Edge Cases

- Rider disconnect during early delivery (`searching_rider`, `assigned`) triggers backend rider release and re-matching.
- If no rider accepts, assignment failure event is pushed to admin/super_admin (`order_rider_assignment_failed`).
- Last known location remains available via existing tracking read endpoints.

## Cost & Tooling Confirmation

- Paid services added: **none**
- Per-request paid APIs added: **none**
- Uses existing self-hosted backend + DB + Socket.IO
- Distance logic is pure math (Haversine), no paid map API dependency
