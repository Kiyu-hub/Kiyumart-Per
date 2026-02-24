# Order Process Audit: Ecommerce Fulfillment Visibility

Date: 2026-02-23
Scope: Buyer checkout -> order creation -> payment -> buyer order list -> order tracking -> live tracking

## Objective
- Enforce ecommerce-standard fulfillment UX:
- Pickup orders must not expose delivery address, delivery map, or rider-tracking UI.
- Delivery details and live map must be shown only for delivery-capable methods.

## Audit Summary
- Backend source-of-truth validation: `PASS`
- Buyer checkout data shaping: `PASS`
- Buyer order list visibility rules: `PASS`
- Buyer tracking visibility rules: `PASS`
- Live map eligibility rules: `PASS`
- Payment success fulfillment presentation: `PASS`
- Remaining risk (legacy records with old data patterns): `PARTIAL`

## End-to-End Flow Audit

1. Cart and checkout
- File: `client/src/pages/CheckoutConnected.tsx`
- Current behavior:
- Buyer selects `pickup`, `bus`, or `rider`.
- Delivery fields are shown only when method is not `pickup`.
- Finding: UI behavior is correct for the checkout form itself.

2. Order creation API
- File: `server/routes.ts`
- Previous issue:
- Delivery address/phone could still be defaulted for pickup orders.
- Fix applied:
- Added backend guard for delivery method validity (`pickup|bus|rider`).
- For `pickup`, backend now nulls delivery fields:
- `deliveryAddress`, `deliveryPhone`, `deliveryCity`, `deliveryZoneId`, `deliveryLatitude`, `deliveryLongitude`.
- For `bus`/`rider`, backend now enforces required delivery address and phone.
- Result: backend is now authoritative and ecommerce-safe.

3. Payment and post-order visibility
- Files:
- `client/src/pages/Orders.tsx`
- `client/src/pages/OrderTracking.tsx`
- `client/src/pages/LiveTracking.tsx`
- `client/src/pages/PaymentSuccess.tsx`
- Fixes applied:
- Orders list now shows `Fulfillment` method always, and shows delivery address/phone only when method is not `pickup`.
- Track page now shows fulfillment method first; delivery address block is hidden for pickup.
- Live map now requires rider delivery and in-transit statuses.
- Payment success now uses fulfillment-aware section:
- Pickup: no delivery address shown.
- Delivery: address shown.

## Verification Matrix

1. Pickup order should not show delivery address in buyer order card
- Status: `PASS`
- Evidence: `client/src/pages/Orders.tsx`

2. Pickup order should not show delivery address/map in tracking page
- Status: `PASS`
- Evidence: `client/src/pages/OrderTracking.tsx`

3. Live map should be available only for rider delivery while in transit
- Status: `PASS`
- Evidence: `client/src/pages/OrderTracking.tsx`, `client/src/pages/LiveTracking.tsx`

4. Backend should reject missing fulfillment method
- Status: `PASS`
- Evidence: `server/routes.ts`

5. Backend should enforce delivery contact info for non-pickup orders
- Status: `PASS`
- Evidence: `server/routes.ts`

6. Backend should clear delivery fields for pickup orders
- Status: `PASS`
- Evidence: `server/routes.ts`

## Remaining Risk / Pending Follow-up

1. Historical data cleanup
- Status: `PARTIAL`
- Reason:
- Existing older pickup orders created before this fix may still contain delivery fields in DB.
- Recommended action:
- One-time migration/backfill script to null delivery fields where `delivery_method='pickup'`.

2. Runtime QA sweep
- Status: `PARTIAL`
- Reason:
- Typecheck passed, but full click-path QA for all fulfillment types should still be run per environment.
- Recommended action:
- Manual smoke pass for:
- pickup paid order
- bus paid order
- rider paid order with tracking transition to in-transit

## Files Changed By This Audit Fix
- `server/routes.ts`
- `client/src/pages/Orders.tsx`
- `client/src/pages/OrderTracking.tsx`
- `client/src/pages/LiveTracking.tsx`
- `client/src/pages/PaymentSuccess.tsx`

## Compliance Result
- Fulfillment visibility now matches ecommerce standard for pickup vs delivery in current code paths.
- Backend and UI are aligned to prevent delivery info leakage for pickup orders.
