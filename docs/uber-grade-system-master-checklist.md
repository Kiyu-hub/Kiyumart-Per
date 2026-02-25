# Uber-Grade Platform Master TODO (Non-Breaking, 0-Cost)

## 0. Audit + Push Integrity (Completed)
- [x] Verify local vs remote head (`main == origin/main`).
- [x] Verify tracked pending changes are committed/pushed.
- [x] Confirm only local utility files remain untracked (`test-db.js`, `test-server-start.js`).

## 1. Canonical State Model Alignment (High Priority)
- [ ] Normalize all order state naming to one canonical public model in service layer:
  - `PENDING_PAYMENT`, `UNPAID`, `PAID`, `PREPARING`, `READY`, `SEARCHING_RIDER`, `ASSIGNED`, `RIDER_ARRIVED`, `PICKED_UP`, `IN_TRANSIT`, `ARRIVED`, `COMPLETED`, `CANCELLED`.
- [ ] Keep DB enum backward-compatible; map legacy values in one adapter only.
- [ ] Ensure all UI components consume adapter output, not raw status strings.
- [ ] Add transition tests to block skipped states and UI-forced transitions.

## 2. Fulfillment Fork Enforcement (Delivery vs Pickup)
- [ ] Delivery track:
  - `PAID -> PREPARING -> READY -> SEARCHING_RIDER -> ASSIGNED -> RIDER_ARRIVED -> PICKED_UP -> IN_TRANSIT -> ARRIVED -> COMPLETED`.
- [ ] Pickup track:
  - `PAID -> PREPARING -> READY -> COMPLETED` with customer QR+OTP verification.
- [ ] Ensure rider/admin logic is bypassed for pickup orders end-to-end.
- [ ] Ensure buyer UI hides delivery-only states for pickup method.

## 3. Rider Matching Orchestration (Uber-like + Manual Confirm)
- [x] Keep distance-first + zone-aware candidate discovery in backend.
- [x] Ensure proposal dialog/event path for Admin/Super Admin confirmation before `ASSIGNED`.
- [x] Prevent silent auto-assign when policy is set to manual-confirm mode.
- [x] Add explicit feature flag: `RIDER_ASSIGNMENT_MANUAL_CONFIRM=true`.

## 4. Verification Security (QR + OTP, Dual Gate)
- [x] Seller -> Rider pickup verification requires both QR and OTP.
- [x] Rider -> Customer dropoff verification requires both QR and OTP.
- [x] Seller -> Customer pickup verification requires both QR and OTP.
- [x] Add denial logs for invalid actor/order/proximity.

## 5. Role Visibility Matrix Enforcement
- [ ] Implement one backend visibility resolver by role + state + fulfillment method.
- [ ] Remove page-level ad hoc visibility logic for order states.
- [ ] Add regression tests for Customer/Seller/Rider/Admin/Super Admin state visibility.

## 6. Real-Time Guarantees (Keep Existing Infra)
- [ ] Confirm rider GPS publish cadence remains 3-5s (no regression).
- [ ] Ensure same location stream is consumed by Customer/Admin/Super Admin.
- [ ] Add runtime monitor for stale GPS (>15s).

## 7. Super Admin Command Center (Vehicle-Aware Map)
- [ ] Render vehicle-type icon mapping (car/bike/bicycle/van).
- [ ] Use vehicle color as marker accent.
- [ ] Apply bearing-based rotation + smoothing.
- [ ] Keep data feed unchanged (visual-only enhancement).

## 8. Messaging / Calls / Notifications
- [ ] Confirm message persistence + websocket sync for all required role combinations.
- [ ] Confirm delivery-context restrictions for rider/seller/order chats.
- [ ] Confirm Jitsi/WebRTC call access is order-bound and expires on completion.
- [ ] Confirm support masking policy for admin/super admin identities in support chat.

## 9. Dashboard Hardening Audit (All Roles)
- [ ] No dead links.
- [ ] No broken buttons.
- [ ] No invalid redirects.
- [ ] No hard-coded placeholder operational data.
- [ ] Add smoke checklist per dashboard route set.

## 10. Rider Dashboard Mandatory Blocks
- [ ] Active order block.
- [ ] Live map/route block.
- [ ] State-driven action buttons (backend-authoritative).
- [ ] Chat + call controls.
- [x] OTP/QR verification scanner.
- [ ] Empty/error/offline recovery states.

## 11. Analytics Consistency
- [x] Super Admin dashboard shows `Total Received Money` (paid-state based).
- [ ] Propagate `Total Received Money` metric to all Super Admin analytics surfaces (`/admin/analytics`, `/admin/platform-earnings`, orders analytics widgets).
- [x] Ensure all analytics cards are overflow-safe responsive layouts.
- [ ] Ensure all analytics values are backend-authoritative and currency-consistent (GHS).

## 12. Documentation and Evidence
- [ ] Update `README.md` with final canonical flows and policy toggles.
- [ ] Add sequence diagrams for Delivery and Pickup flows.
- [ ] Add verification matrix (pass/partial/fail) with file references.
- [ ] Add runtime evidence section (commands + outputs summary).

## Execution Notes
- All upgrades must remain:
  - Backward compatible
  - Service-layer focused
  - Feature-flag friendly
  - 100% free/open-source
  - Non-breaking to existing rider/maps/GPS infrastructure
