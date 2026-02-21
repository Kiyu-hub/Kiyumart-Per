# Phase 2 - Core Data & Logic Normalization

Last updated: February 21, 2026

## Scope
- Canonical order lifecycle definition
- Revenue trigger specification (completed deliveries only for business revenue KPIs)
- Role permission matrix (super-admin controlled)
- Activity and audit logging expectations
- Phase A compatibility audit (resource-aware, non-breaking strategy)

## Non-Breaking Upgrade Strategy
- Backward compatible: legacy values are accepted and normalized (`delivering`, `in_transit`, `out_for_delivery` -> `en_route`).
- Incremental: existing endpoints remain; normalization is applied in shared transition logic and route middleware.
- Optional: components that already meet requirements are retained.
- Reversible: migrations and runtime behavior preserve legacy readability while enforcing canonical writes.

## Canonical Order Status Definition

### Canonical statuses (single source of truth)
1. `pending`
2. `confirmed`
3. `ready`
4. `processing`
5. `assigned`
6. `picked_up`
7. `en_route`
8. `delivered`
9. `cancelled`
10. `disputed`

### Legacy aliases accepted (read/input compatibility only)
- `delivering` -> `en_route`
- `in_transit` -> `en_route`
- `out_for_delivery` -> `en_route`
- `ready_for_pickup` -> `ready`
- `assigned_to_rider` -> `assigned`

### State transition authority
- Enforced in `server/services/orderStateMachine.ts`.
- Applied atomically in `server/storage.ts` via `applyOrderStatusTransition(...)`.
- Route integration:
  - `PATCH /api/orders/:id/status`
  - `POST /api/orders/:id/complete-delivery`

### Activity log requirement
- Every status transition must write to `order_status_history`.
- Required fields: `orderId`, `fromStatus`, `toStatus`, `changedBy`, `changedByRole`, optional `reason`, optional transition metadata.

## Revenue Calculation Logic Spec

### KPI revenue trigger (business revenue)
- Count order value only when BOTH conditions are true:
1. `order.status = delivered`
2. `order.paymentStatus in (completed, paid, success)` (normalized check)

### KPI rules
- `totalRevenue`: sum of delivered + paid orders.
- `revenueThisMonth`: sum of delivered + paid orders where `deliveredAt` is in current month.
- `avgOrderValue`: `totalRevenue / totalSales` (existing response contract preserved).

### Settlement and payout note
- Commission and payout records remain transaction-driven and idempotent.
- KPI revenue normalization does not break existing payout ledger workflows.

## Permission Matrix (Role x Action)

All role permissions are controlled by super admin through:
- `role_features` (all roles)
- `admin_permissions` (admin/super_admin operational caps)
- `SuperAdminPermissions` UI (`client/src/pages/SuperAdminPermissions.tsx`)

| Role | Orders | Products | Messaging | Support | Store/Delivery | Finance | Settings/Admin |
|---|---|---|---|---|---|---|---|
| `super_admin` | Full | Full | Full | Full | Full | Full | Full |
| `admin` | `orders.view`, `orders.manage` | `products.viewAll` | `messages.view/send` | `support.view/manage` | user approvals | analytics + payout ops (middleware-gated) | settings view/edit, user/admin management via `admin_permissions` |
| `seller` | `orders.view/manage` | `products.create/edit/delete` | `messages.view/send` | - | `store.manage` | `payouts.request`, analytics view | - |
| `rider` | `orders.view` | - | `messages.view/send` | - | `deliveries.view/manage`, `tracking.update` | `earnings.view` | profile manage |
| `agent` | `orders.view` | - | `messages.view/send` | `support.view/manage` | - | - | users view, profile manage |
| `buyer` | `orders.create/view` | - | `messages.view/send` | `support.view/manage` | wishlist manage | - | profile manage |

## Phase A - Inventory & Compatibility Audit (No Replacement by Default)

| Component | Current Tool | Free | Open Source | Realtime Ready | Stable in Production | Keep | Upgrade | Reason |
|---|---|---:|---:|---:|---:|---:|---:|---|
| DB | PostgreSQL (Neon) + Drizzle ORM | Yes (starter tiers exist) | PostgreSQL/Drizzle yes | N/A (DB layer) | Yes | ✅ | ❌ | Mature, consistent, scalable enough for current phase |
| Auth | JWT + cookie auth (Express) | Yes | Yes | N/A | Yes | ✅ | ❌ | Already integrated across API and socket auth |
| Messaging | Custom chat + Socket.IO + delivery/presence services | Yes | Yes | Yes | Mostly | ✅ | ⚠️ Optional | Works now; optional future event bus for very high concurrency |
| Maps | Leaflet + OpenStreetMap | Yes | Yes | Client realtime map updates supported | Yes | ✅ | ⚠️ Optional | Good cost/perf now; optional provider upgrade if SLA requires richer ETA/routing |
| Realtime core | Socket.IO | Yes | Yes | Yes | Yes | ✅ | ❌ | Covers order, message, presence, support workflows |
| Payments | Paystack | Transaction fees apply | SDK available | Webhook/event based | Yes | ✅ | ❌ | Region-fit and already integrated with idempotency |
| Media storage | Cloudinary | Free tier exists | SDK available | N/A | Yes | ✅ | ❌ | Existing upload/transform pipeline stable |
| Hosting (backend) | Render | Paid at scale | N/A | Yes | Yes | ✅ | ⚠️ Optional | Keep for now; optional scale upgrade by traffic profile |
| Hosting (frontend) | Netlify | Yes/paid tiers | N/A | N/A | Yes | ✅ | ❌ | Stable deployment model |
| Background jobs | In-process workers (`server/workers/*`) | Yes | Yes | Yes (polling/queue style) | Moderate | ✅ | ⚠️ Optional | Keep now; optional external queue (BullMQ/SQS) if throughput spikes |

## Exit Criteria Tracking
- DB -> UI dynamic: in progress, core permission/status/revenue paths normalized; continue replacing legacy fixed labels where found.
- No duplicate/conflicting logic: in progress, canonical status writes and transition logs enforced on critical delivery paths.

