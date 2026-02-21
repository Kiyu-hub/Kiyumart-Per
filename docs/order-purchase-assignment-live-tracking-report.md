# Order Purchase -> Rider Assignment -> Live Tracking Report

Date: February 21, 2026  
Scope: End-to-end audit and verification of checkout, payment verification, assignment, status propagation, and live tracking.

## Executive Summary

- The platform uses backend-controlled order state transitions with audit history.
- Payment confirmation is the gate for deterministic rider matching.
- Rider assignment is sequential and race-safe (one active offer at a time).
- Live tracking is socket-driven, DB-persisted, and visible to all authorized stakeholders.
- This audit fixed remaining flow gaps in detail authorization and rider tracking UX consistency.

## Canonical End-to-End Flow

1. Customer checkout creates order(s):
   - Endpoint: `POST /api/orders`
   - Multi-vendor carts create one order per seller under one checkout session.
   - Orders are created with `paymentStatus = pending`.

2. Payment initialization:
   - Endpoint: `POST /api/payments/initialize`
   - Paystack reference stored on order(s), payment status moves to processing.

3. Payment verification/webhook:
   - Endpoints:
     - `GET /api/payments/verify/:reference`
     - `POST /api/webhooks/paystack`
   - Backend marks payment completed and self-heals stale `pending` order statuses where needed.

4. Rider matching starts after payment success:
   - Triggered from verify path or explicit dispatch endpoint:
     - `POST /api/orders/:id/start-rider-matching`
   - Order status transitions to `searching_rider`.

5. Rider candidate selection and offers:
   - Deterministic ranking: availability + distance (Haversine) + soft-zone preference.
   - Dynamic radius expansion: `3km -> 5km -> 8km`.
   - Sequential rider offers with timeout; no parallel acceptance race.
   - Rider responds:
     - `POST /api/rider/assignment-offers/:orderId/respond` (`accept|reject`)

6. Assignment lock-in:
   - Backend assigns rider and transitions order to `assigned`.
   - Notifications sent to rider, buyer, seller, and admins.

7. Delivery progression:
   - Backend-only state transitions via `applyOrderStatusTransition`.
   - Rider transitions through:
     - `rider_arrived -> picked_up -> in_transit -> delivered -> completed` (where applicable)
   - Delivery completion can be QR-verified:
     - `POST /api/orders/:id/complete-delivery`

8. Live tracking:
   - Rider sends location updates:
     - `POST /api/delivery-tracking`
   - Latest and history APIs:
     - `GET /api/delivery-tracking/:orderId`
     - `GET /api/delivery-tracking/:orderId/history`
   - Real-time events:
     - `rider_location_updated`
     - `order_status_updated`

## Data Sources and Truth Model

- Source of truth:
  - Orders + order status history in DB.
  - Delivery tracking points in DB.
- UI behavior:
  - UI renders backend state only.
  - State mutation happens through backend endpoints and role checks.

## Role Access / Permissions in This Flow

- Buyer:
  - Can view own orders, track assigned rider, receive updates.
- Rider:
  - Can receive offers, accept/reject, submit location updates, complete delivery.
- Seller:
  - Can view own orders and trigger/start assignment where permitted.
- Admin/Super Admin:
  - Full oversight, manual assignment tools, dispatch controls, live tracking dashboards.

## Audit Findings and Fixes Applied in This Pass

1. Order detail authorization hardening
- Problem:
  - `GET /api/orders/:id` did not enforce stakeholder ownership checks.
- Fix:
  - Added strict access control: only admin/super_admin or order stakeholder (buyer/seller/assigned rider).

2. Live tracking rider info dependency mismatch
- Problem:
  - Live tracking page depended on admin-only user endpoint for rider profile.
- Fix:
  - `GET /api/orders/:id` now includes safe `riderInfo`.
  - Live tracking now renders from `order.riderInfo`.

3. Rider dashboard hard-coded tracking logic
- Problem:
  - Static tracking steps and stale route state placeholders remained.
- Fix:
  - Replaced static steps with dynamic status-driven steps.
  - Fixed track link to use real order ID.
  - Expanded active status handling to canonical delivery statuses.

4. Order tracking status coverage
- Problem:
  - Initial location fetch only ran for `en_route`.
- Fix:
  - Expanded to `rider_arrived`, `picked_up`, `in_transit`, and `en_route`.

## Key Backend Controls Verified

- Canonical status validation:
  - `server/services/orderStateMachine.ts`
- Transition write path:
  - `storage.applyOrderStatusTransition(...)`
- Assignment safety:
  - One-rider-at-a-time offers
  - Timeout + fallback to next candidate
  - Assignment lock checks before transition

## Real-Time Events Used

- `order_status_updated`
- `admin_order_status_updated`
- `rider_assignment_offer`
- `rider_location_updated`
- `order_rider_assigned`
- `order_delivered`

## Validation Performed

- Type safety: `npm run typecheck` passed
- Frontend build: `npm run build:frontend` passed

## Conclusion

The order purchase -> payment verification -> rider assignment -> live tracking pipeline is now fully aligned with backend-first, real-time, deterministic behavior. The remaining logic inconsistencies identified in this audit pass were fixed and validated.
