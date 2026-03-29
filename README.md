# KiyuMart Platform Manual

This is the single operational and technical manual for the KiyuMart platform.
It is written for:

- Developers
- Super Admins and Admins
- Agents and support operators
- Riders, Sellers, and Buyer-operation teams
- AI builders/assistants (Claude, Codex, and similar tools)
- Auditors and compliance reviewers
- Future contributors
- Newbies (including first-time platform operators)

## Table of Contents

1. What This Platform Is
2. How To Read This Manual
3. Core Rules (Source of Truth)
4. System Architecture
5. Role Map and Permission Model
6. Dashboard Guide (Role by Role)
7. End-to-End Order Lifecycle
8. Store Operating Modes (Single Store vs Multi-Vendor)
9. Live Map and Dispatch System (Uber-like Operations)
10. Messaging, Support, and Calls
11. Finance, Fees, Commissions, and Payouts
12. Platform Settings Reference
13. Data Model and Canonical Statuses
14. Realtime and Event Consistency
15. API and Workflow Health Checks
16. Setup, Environment, and Developer Commands
17. Audit System and Living README
18. Production Smoke Checklist
19. Troubleshooting Playbook
20. Source-of-Truth File Index

## 1) What This Platform Is

KiyuMart is a role-based commerce + logistics platform. It combines:

- Marketplace ordering
- Seller packaging and readiness workflows
- Rider assignment and live dispatch tracking
- Buyer order tracking and support
- Super Admin command-center control
- Finance operations (processing fees, commissions, payouts)

In plain words:

- Buyer places order
- Seller prepares order
- Rider picks up and delivers
- Admin roles monitor, validate, and control the flow
- Everything important is stored and validated on the backend

## 2) How To Read This Manual

If you are new, read in this order:

1. `Core Rules`
2. `Dashboard Guide`
3. `Order Lifecycle`
4. `Live Map and Dispatch`
5. `Finance and Payouts`

If you are a developer or AI assistant:

1. Start at `Source-of-Truth File Index`
2. Verify behavior in code before changing UI
3. Never assume state; use backend responses and canonical transitions

## 3) Core Rules (Source of Truth)

These are platform design rules enforced by architecture:

- Backend is authoritative for business state
- UI reflects backend state; UI does not invent transitions
- Role access is enforced server-side (`requireAuth`, `requireRole`, `requirePermission`, role features)
- Realtime state is derived from live presence/GPS/heartbeat, not stale toggles
- Order transitions must pass state-machine validation
- Rider map visibility depends on freshness and role-feature access

## 4) System Architecture

### Frontend

- React + TypeScript
- Wouter routing (`client/src/App.tsx`)
- TanStack Query for server-state
- Role dashboards and pages for super_admin/admin/agent/seller/rider/buyer
- Map rendering:
  - Mapbox GL mode (`client/src/tracking/mapbox/MapboxFleetMap.tsx`)
  - Open-source tile mode (Leaflet presets)

### Backend

- Express + TypeScript
- Central route layer (`server/routes.ts`)
- Service-layer policies (state machine, messaging, permissions)
- RBAC and role-feature checks (`server/auth.ts`)

### Data + Realtime

- PostgreSQL schema contracts (`shared/schema.ts`)
- Socket.IO live channels for map, chat, support, and notifications
- Presence and heartbeat services for online/offline consistency

## 5) Role Map and Permission Model

Roles:

- `super_admin`
- `admin`
- `agent`
- `seller`
- `rider`
- `buyer`

Permission layers:

- Authentication: `requireAuth`
- Role validation: `requireRole`
- Admin permission gates: `requirePermission`
- Feature toggles per role: `requireRoleFeature`

Important map rule:

- Riders always keep `maps.view` enabled by policy fallback
- Other roles can have map access toggled by super admin role-feature settings

## 6) Dashboard Guide (Role by Role)

All route definitions come from `client/src/App.tsx`.

### Super Admin Dashboard

Primary purpose:

- Platform governance
- Global permission and map-access control
- Live command center monitoring

Key areas:

- `/admin`
- `/admin/permissions`
- `/admin/delivery-tracking`
- `/admin/analytics`
- `/admin/settings`

Core actions:

- Enable/disable role feature access
- Control map provider mode
- Review payouts, analytics, and operational alerts

### Admin Dashboard

Primary purpose:

- Day-to-day operations

Key areas:

- `/admin/orders`
- `/admin/users`
- `/admin/sellers`
- `/admin/riders`
- `/admin/zones`
- `/admin/payouts` routes and earnings screens

Core actions:

- Manage orders and assignments
- Manage users, approvals, zones, and store operations
- Process payout workflows

### Agent Dashboard

Primary purpose:

- Support operations and customer issue handling

Key areas:

- `/agent`
- `/agent/tickets`
- `/agent/messages`
- `/agent/customers`

Core actions:

- Resolve support conversations
- Communicate with users under support rules

### Seller Dashboard

Primary purpose:

- Store operations and order preparation

Key areas:

- `/seller/products`
- `/seller/orders`
- `/seller/deliveries`
- `/seller/promotions`
- `/seller/payment-setup`

Core actions:

- Manage catalog and promotions
- Move paid orders through seller-side preparation states
- Configure payout setup

### Rider Dashboard

Primary purpose:

- Delivery execution and live routing

Key areas:

- `/rider/deliveries`
- `/rider/route`
- `/rider/messages`
- `/rider/earnings`

Core actions:

- Accept/reject assignments
- Execute pickup and delivery state transitions
- Use live map routing and comms

### Buyer Dashboard

Primary purpose:

- Shopping, checkout, payment, tracking, support

Key areas:

- `/buyer`
- `/orders`
- `/checkout`
- `/payment/:orderId`
- `/support`

Core actions:

- Place and pay for orders
- Track order journey
- Contact support

## 7) End-to-End Order Lifecycle

Canonical state logic lives in `server/services/orderStateMachine.ts`.

Canonical statuses:

- `created`
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

Legacy aliases are normalized:

- `pending -> created`
- `delivering -> en_route`
- several legacy delivery aliases are mapped to canonical statuses

High-level delivery flow:

1. Buyer creates order and pays
2. Seller confirms/processes
3. Seller marks ready
4. Rider matching and assignment
5. Rider arrives/picks up
6. In-transit and en-route tracking
7. Delivered and completed

High-level pickup flow:

1. Buyer creates and pays
2. Seller processes and marks ready
3. Pickup verification and completion (no rider transit path)

Transition safety:

- Every status move checks role + preconditions
- Invalid moves return deterministic errors (for example: `Cannot transition from X to Y`)

## 8) Store Operating Modes (Single Store vs Multi-Vendor)

Source of truth:

- `platform_settings.is_multi_vendor`
- `platform_settings.primary_store_id`

### Single Store Mode

- `isMultiVendor = false`
- Platform uses `primaryStoreId`
- Catalog and checkout are scoped to the primary store model

### Multi-Vendor Mode

- `isMultiVendor = true`
- Orders may span multiple sellers
- Checkout/payment metadata carries multi-order/session context
- Commission and subaccount logic is applied per seller as configured

Where this is wired:

- Backend branching in `server/routes.ts` around product loading, checkout creation, and payment verification
- Admin controls in `client/src/pages/AdminSettings.tsx` and `client/src/pages/AdminStoreManager.tsx`

## 9) Live Map and Dispatch System (Uber-like Operations)

Core files:

- `client/src/components/RealTimeRiderMap.tsx`
- `client/src/tracking/mapbox/MapboxFleetMap.tsx`
- `client/src/tracking/mapbox/mapboxLoader.ts`
- `client/src/tracking/components/MapTileLayer.tsx`
- `client/src/tracking/hooks/useAnimatedFleetPositions.ts`

### Provider model

- `mapbox` mode: Mapbox GL pipeline
- `open_source` mode: Leaflet + open presets
- Runtime provider config from `/api/public/map-provider-config`
- Provider mode persisted in local storage key: `map_provider_mode`

### Mapbox 3D rider models

3D model mapping is data-driven for supported vehicle types:

- `car -> /assets/vehicles/car_textured.glb`
- `motorcycle -> /assets/vehicles/moto_textured.glb`
- `bicycle -> /assets/vehicles/bycicle_textured.glb`

Unsupported/invalid vehicle types are not rendered as 3D models in the Mapbox 3D layer.

### Open-source map presets (Leaflet)

Current preset catalog includes:

- Voyager
- Positron
- OpenStreetMap
- Humanitarian
- Topo
- Cycle
- Esri Satellite
- Esri Topo
- Dark

### Camera and controls

Implemented controls include:

- Zoom in/out
- Street zoom quick action
- Recenter/Fit
- Focus anchor
- Reset bearing (north)
- 2D/3D pitch toggle

Auto-focus behavior:

- Camera refits/focuses on available rider/destination points
- User interactions temporarily lock auto-camera before next auto adjustment

### Realtime rider visibility and freshness

Operational behavior in live map logic:

- Rider snapshots are normalized and deduplicated
- Online status uses presence + GPS recency interpretation
- Riders without GPS are separated into dedicated no-GPS panels
- Active order count is surfaced per rider to avoid visual duplication

### Role map access enforcement

- Riders: map access is always available
- Other roles: map access controlled by `maps.view` feature toggle
- Super admin can update role map access controls

## 10) Messaging, Support, and Calls

Core files:

- `server/services/chatPermissionService.ts`
- `server/services/messageDeliveryService.ts`
- `server/services/supportMessagingService.ts`
- `server/services/jitsiMeetService.ts`
- messaging and support routes in `server/routes.ts`

### Chat permission model

- Admin/Super Admin: full chat access
- Agent: support access across users
- Buyer/Seller/Rider chat is constrained by active order relationships
- Support contact with agent/admin roles is allowed by policy

### Message delivery reliability

Message delivery service tracks states with retry behavior:

- queued
- sent
- delivered
- read
- failed (after max retries)

It also supports reconnect delivery for pending queues.

### Support conversations

Support module manages:

- conversation lifecycle (`open`, `assigned`, `resolved`)
- first-response analytics
- role-scoped support visibility
- optional identity masking rules for support display

### Calls

Jitsi service provides room/session generation for call-enabled workflows.

## 11) Finance, Fees, Commissions, and Payouts

Primary schemas (`shared/schema.ts`):

- `commissions`
- `seller_payouts`
- `rider_payouts`
- `platform_earnings`

### Processing fee

- Configurable by `platform_settings.processing_fee_percent`
- Applied in checkout and payment totals

### Seller commission accounting

- Commission rows are created per order as payout source
- Seller payout requests consume pending commission balances
- Exact-composition validation is enforced for payout amount composition

### Rider payout lifecycle

- Rider payouts are queued from delivery-completion events
- Admin/Super Admin approval/rejection endpoints update payout states
- Notifications and realtime events are emitted on payout decision

### Platform earnings

- Platform earnings are recorded with commission linkage
- Admin earnings views aggregate by type/date

### Paystack integration

- Payment initialize + verify + webhook flows implemented
- Supports seller payout setup/subaccount flows
- Supports bank-account and mobile-money payout types for stores

## 12) Platform Settings Reference

Source:

- `platform_settings` table in `shared/schema.ts`
- Settings UI in `client/src/pages/AdminSettings.tsx`

Major setting groups:

- Branding and theme colors
- Mode toggles (`isMultiVendor`, `primaryStoreId`)
- Currency and frontend callback URL
- Mapbox token/style/version
- Processing fee and default commission rate
- Paystack keys
- Cloudinary keys
- Registration gates for seller/rider
- Contact/social/footer/ads toggles
- Homepage/banner/shop display controls

Security handling:

- Secret fields are masked in API responses
- Env import helpers can backfill missing settings safely

## 13) Data Model and Canonical Statuses

Critical enums and core tables are in `shared/schema.ts`:

- user roles
- order status
- delivery method
- payment status
- support status
- payout types
- notification types

Entity highlights:

- Users include role/approval/vehicle/location preference fields
- Orders hold delivery coordinates, payment state, and lifecycle status
- Delivery tracking stores GPS snapshots per order/rider
- Role features store per-role feature flags used at runtime

## 14) Realtime and Event Consistency

Realtime behavior combines:

- Socket.IO channels for state push
- TanStack Query invalidation and re-fetch
- Presence services for online/offline truth

Consistency goals:

- No stale state from UI-only assumptions
- Role dashboards consume same backend truth
- Map and dashboard counters should reconcile via shared data streams

## 15) API and Workflow Health Checks

Use these checkpoints during operations:

- Verify route exists in `client/src/App.tsx`
- Verify backend endpoint exists and has role guards
- Verify order transition is permitted by state machine
- Verify query invalidation/realtime events after action
- Verify role feature access (`maps.view`, support features, etc.)

## 16) Setup, Environment, and Developer Commands

### Prerequisites

- Node.js 18+
- npm
- PostgreSQL

### Local run

```bash
npm install
npm run dev:backend
npm run dev:frontend
```

### Quality checks

```bash
npm run typecheck
npm run build:frontend
npm run test:unit
npm run test:e2e
```

### Platform audit

```bash
npm run audit:platform
npm run audit:platform:check
```

## 17) Audit System and Living README

Audit generator:

- `scripts/generate-platform-audit.ts`

Generated artifacts:

- `docs/platform-audit-report.json`
- `docs/platform-audit-log.jsonl`
- `docs/platform-living-readme.md`

API controls:

- `POST /api/admin/platform-audit/run`
- `GET /api/admin/platform-audit`
- `GET /api/agent/platform-audit`

Behavior:

- Scans routes, dashboard coverage, feature keyword matches, dependencies, and health findings
- Injects/updates the `PLATFORM_AUDIT` section in this README

## 18) Production Smoke Checklist

Run this before release:

1. Login as Super Admin and open `/admin/delivery-tracking`
2. Toggle map provider between Mapbox and open-source mode
3. Confirm rider markers appear in both modes for fresh GPS riders
4. Click rider marker and confirm rider detail dialog opens
5. Verify no-GPS panel entries match riders missing live coordinates
6. Validate map access toggle behavior for non-rider roles
7. Validate seller order status buttons only allow legal transitions
8. Validate rider assignment and active route updates in realtime
9. Validate payout approval/rejection flows update rider/seller views
10. Run `npm run audit:platform:check` and resolve blockers

## 19) Troubleshooting Playbook

### Map is blank or freezing

- Validate provider mode and Mapbox token/style settings
- Validate Mapbox GL version supports 3D model layers
- Check browser console for model/layer load errors
- Confirm rider GPS data is fresh and valid

### Transition error (example: processing -> ready)

- Check order current canonical status
- Check actor role and permissions
- Check state-machine preconditions for target status

### Online counters look wrong

- Verify presence heartbeat inputs
- Verify GPS timestamps and freshness gating
- Verify dashboards consume same backend stream

### Payment verification fails

- Check Paystack keys in platform settings
- Confirm webhook signature and idempotency handling
- Confirm order/payment metadata consistency

## 20) Source-of-Truth File Index

Use this index before making any change.

| Domain | Source of truth |
| --- | --- |
| App route definitions | `client/src/App.tsx` |
| Dashboard layout/sidebar wiring | `client/src/components/DashboardLayout.tsx` |
| Auth, RBAC, role features | `server/auth.ts` |
| API routes and workflow handlers | `server/routes.ts` |
| Order lifecycle state machine | `server/services/orderStateMachine.ts` |
| Chat permission rules | `server/services/chatPermissionService.ts` |
| Support identity and masking | `server/services/supportMessagingService.ts` |
| Message retry/delivery state machine | `server/services/messageDeliveryService.ts` |
| Presence and heartbeat state | `server/services/presenceService.ts` |
| Shared DB schema contracts | `shared/schema.ts` |
| Data access implementation | `server/storage.ts` |
| Super admin live map UI | `client/src/components/RealTimeRiderMap.tsx` |
| Mapbox 3D fleet map renderer | `client/src/tracking/mapbox/MapboxFleetMap.tsx` |
| Map runtime loader/provider mode | `client/src/tracking/mapbox/mapboxLoader.ts` |
| Open-source map presets | `client/src/tracking/components/MapTileLayer.tsx` |
| Fleet animation hook | `client/src/tracking/hooks/useAnimatedFleetPositions.ts` |
| Platform audit generator | `scripts/generate-platform-audit.ts` |

---

This document is intentionally operational and strict. If a feature exists in code, it must be documented here and in generated audit output.

---

The section below is auto-generated by the platform audit script. Do not edit it manually.

<!-- PLATFORM_AUDIT:START -->

## Platform Living Audit README

Generated version: `v12`
Generated at: `2026-03-16T10:03:23.710Z`

### 1. Platform Overview
- Continuous internal audit for routes, dashboards, features, flows, services, and dependencies.
- Roles covered: super_admin, admin, agent, seller, rider, buyer.

### 2. System Architecture
- Frontend: React + Wouter dashboard/page routing.
- Backend: Express + service-layer APIs + RBAC middleware.
- Realtime: Socket.IO and live-tracking map telemetry.

### 3. Dashboards (Fully Detailed)
- Super Admin Dashboard: 37 routes, entry /admin, exits 8, APIs 69
- Admin Dashboard: 37 routes, entry /admin, exits 8, APIs 69
- Agent Dashboard: 6 routes, entry /agent, exits 1, APIs 6
- Seller Dashboard: 15 routes, entry /seller, exits 12, APIs 26
- Rider Dashboard: 7 routes, entry /rider, exits 6, APIs 14
- Customer / Buyer Dashboard: 1 routes, entry /buyer, exits 2, APIs 1

### 4. Features (By Module)
- Order Management: 195 files, dashboards Admin Dashboard, Agent Dashboard, Customer / Buyer Dashboard, Rider Dashboard, Seller Dashboard, Super Admin Dashboard, APIs 232
- Rider Delivery: 104 files, dashboards Admin Dashboard, Agent Dashboard, Customer / Buyer Dashboard, Rider Dashboard, Seller Dashboard, Super Admin Dashboard, APIs 229
- Agent-Assisted Handling: 68 files, dashboards Admin Dashboard, Agent Dashboard, Rider Dashboard, Seller Dashboard, Super Admin Dashboard, APIs 226
- BUS Delivery Logic: 35 files, dashboards Admin Dashboard, Customer / Buyer Dashboard, Rider Dashboard, Seller Dashboard, Super Admin Dashboard, APIs 220
- Pickup Logic: 23 files, dashboards Admin Dashboard, Customer / Buyer Dashboard, Rider Dashboard, Seller Dashboard, Super Admin Dashboard, APIs 216
- Zone & Region Logic: 28 files, dashboards Admin Dashboard, Agent Dashboard, Customer / Buyer Dashboard, Rider Dashboard, Seller Dashboard, Super Admin Dashboard, APIs 222
- Real-time Tracking & Maps: 80 files, dashboards Admin Dashboard, Agent Dashboard, Customer / Buyer Dashboard, Rider Dashboard, Super Admin Dashboard, APIs 225
- Messaging & Calls: 142 files, dashboards Admin Dashboard, Agent Dashboard, Customer / Buyer Dashboard, Rider Dashboard, Seller Dashboard, Super Admin Dashboard, APIs 230
- Reporting, Analytics & Receipts: 35 files, dashboards Admin Dashboard, Agent Dashboard, Customer / Buyer Dashboard, Rider Dashboard, Seller Dashboard, Super Admin Dashboard, APIs 222
- Verification (QR / OTP): 26 files, dashboards Customer / Buyer Dashboard, Rider Dashboard, Seller Dashboard, APIs 220
- User Management & Roles: 68 files, dashboards Admin Dashboard, Agent Dashboard, Rider Dashboard, Seller Dashboard, Super Admin Dashboard, APIs 230

### 5. Delivery Logic
- Rider delivery, BUS/pickup keywords, assignment, verification, and tracking are scanned from backend and UI sources.

### 6. Reporting, Analytics & Receipts
- Analytics/reporting/receipt modules are indexed in feature inventory and dashboard coverage.

### 7. Resources & Tools (Full Inventory)
| Dependency | License | Cost status | Open source |
| --- | --- | --- | --- |
| `@hookform/resolvers` | MIT | free_or_self_hosted | yes |
| `@jridgewell/trace-mapping` | MIT | free_or_self_hosted | yes |
| `@neondatabase/serverless` | MIT | free_or_self_hosted | yes |
| `@playwright/test` | Apache-2.0 | free_or_self_hosted | yes |
| `@radix-ui/react-accordion` | MIT | free_or_self_hosted | yes |
| `@radix-ui/react-alert-dialog` | MIT | free_or_self_hosted | yes |
| `@radix-ui/react-aspect-ratio` | MIT | free_or_self_hosted | yes |
| `@radix-ui/react-avatar` | MIT | free_or_self_hosted | yes |
| `@radix-ui/react-checkbox` | MIT | free_or_self_hosted | yes |
| `@radix-ui/react-collapsible` | MIT | free_or_self_hosted | yes |
| `@radix-ui/react-context-menu` | MIT | free_or_self_hosted | yes |
| `@radix-ui/react-dialog` | MIT | free_or_self_hosted | yes |
| `@radix-ui/react-dropdown-menu` | MIT | free_or_self_hosted | yes |
| `@radix-ui/react-hover-card` | MIT | free_or_self_hosted | yes |
| `@radix-ui/react-label` | MIT | free_or_self_hosted | yes |
| `@radix-ui/react-menubar` | MIT | free_or_self_hosted | yes |
| `@radix-ui/react-navigation-menu` | MIT | free_or_self_hosted | yes |
| `@radix-ui/react-popover` | MIT | free_or_self_hosted | yes |
| `@radix-ui/react-progress` | MIT | free_or_self_hosted | yes |
| `@radix-ui/react-radio-group` | MIT | free_or_self_hosted | yes |
| `@radix-ui/react-scroll-area` | MIT | free_or_self_hosted | yes |
| `@radix-ui/react-select` | MIT | free_or_self_hosted | yes |
| `@radix-ui/react-separator` | MIT | free_or_self_hosted | yes |
| `@radix-ui/react-slider` | MIT | free_or_self_hosted | yes |
| `@radix-ui/react-slot` | MIT | free_or_self_hosted | yes |
| `@radix-ui/react-switch` | MIT | free_or_self_hosted | yes |
| `@radix-ui/react-tabs` | MIT | free_or_self_hosted | yes |
| `@radix-ui/react-toast` | MIT | free_or_self_hosted | yes |
| `@radix-ui/react-toggle` | MIT | free_or_self_hosted | yes |
| `@radix-ui/react-toggle-group` | MIT | free_or_self_hosted | yes |
| `@radix-ui/react-tooltip` | MIT | free_or_self_hosted | yes |
| `@replit/vite-plugin-cartographer` | unknown | unknown | no |
| `@replit/vite-plugin-dev-banner` | unknown | unknown | no |
| `@replit/vite-plugin-runtime-error-modal` | unknown | unknown | no |
| `@tailwindcss/typography` | MIT | free_or_self_hosted | yes |
| `@tailwindcss/vite` | MIT | free_or_self_hosted | yes |
| `@tanstack/react-query` | MIT | free_or_self_hosted | yes |
| `@types/bcryptjs` | MIT | free_or_self_hosted | yes |
| `@types/connect-pg-simple` | MIT | free_or_self_hosted | yes |
| `@types/cookie-parser` | MIT | free_or_self_hosted | yes |
| `@types/cors` | MIT | free_or_self_hosted | yes |
| `@types/express` | MIT | free_or_self_hosted | yes |
| `@types/express-session` | MIT | free_or_self_hosted | yes |
| `@types/jsonwebtoken` | MIT | free_or_self_hosted | yes |
| `@types/leaflet` | MIT | free_or_self_hosted | yes |
| `@types/multer` | MIT | free_or_self_hosted | yes |
| `@types/node` | MIT | free_or_self_hosted | yes |
| `@types/passport` | MIT | free_or_self_hosted | yes |
| `@types/passport-local` | MIT | free_or_self_hosted | yes |
| `@types/react` | MIT | free_or_self_hosted | yes |
| `@types/react-dom` | MIT | free_or_self_hosted | yes |
| `@types/ws` | MIT | free_or_self_hosted | yes |
| `@vitejs/plugin-react` | MIT | free_or_self_hosted | yes |
| `autoprefixer` | MIT | free_or_self_hosted | yes |
| `axios` | MIT | free_or_self_hosted | yes |
| `bcryptjs` | BSD-3-Clause | free_or_self_hosted | yes |
| `class-variance-authority` | Apache-2.0 | free_or_self_hosted | yes |
| `cloudinary` | MIT | usage_metered_or_external | yes |
| `clsx` | MIT | free_or_self_hosted | yes |
| `cmdk` | MIT | free_or_self_hosted | yes |
| `connect-pg-simple` | MIT | free_or_self_hosted | yes |
| `cookie-parser` | MIT | free_or_self_hosted | yes |
| `cors` | MIT | free_or_self_hosted | yes |
| `date-fns` | MIT | free_or_self_hosted | yes |
| `dotenv` | BSD-2-Clause | free_or_self_hosted | yes |
| `drizzle-kit` | MIT | free_or_self_hosted | yes |
| `drizzle-orm` | Apache-2.0 | free_or_self_hosted | yes |
| `drizzle-zod` | Apache-2.0 | free_or_self_hosted | yes |
| `embla-carousel-autoplay` | MIT | free_or_self_hosted | yes |
| `embla-carousel-react` | MIT | free_or_self_hosted | yes |
| `esbuild` | MIT | free_or_self_hosted | yes |
| `express` | MIT | free_or_self_hosted | yes |
| `express-rate-limit` | MIT | free_or_self_hosted | yes |
| `express-session` | MIT | free_or_self_hosted | yes |
| `express-validator` | MIT | free_or_self_hosted | yes |
| `framer-motion` | MIT | free_or_self_hosted | yes |
| `helmet` | MIT | free_or_self_hosted | yes |
| `html5-qrcode` | Apache-2.0 | free_or_self_hosted | yes |
| `input-otp` | MIT | free_or_self_hosted | yes |
| `jsonwebtoken` | MIT | free_or_self_hosted | yes |
| `leaflet` | BSD-2-Clause | free_or_self_hosted | yes |
| `leaflet-routing-machine` | ISC | free_or_self_hosted | yes |
| `lucide-react` | ISC | free_or_self_hosted | yes |
| `memorystore` | MIT | free_or_self_hosted | yes |
| `mongoose` | MIT | free_or_self_hosted | yes |
| `multer` | MIT | free_or_self_hosted | yes |
| `next-themes` | MIT | free_or_self_hosted | yes |
| `passport` | MIT | free_or_self_hosted | yes |
| `passport-local` | MIT | free_or_self_hosted | yes |
| `pg` | MIT | free_or_self_hosted | yes |
| `postcss` | MIT | free_or_self_hosted | yes |
| `prom-client` | Apache-2.0 | free_or_self_hosted | yes |
| `react` | MIT | free_or_self_hosted | yes |
| `react-day-picker` | MIT | free_or_self_hosted | yes |
| `react-dom` | MIT | free_or_self_hosted | yes |
| `react-hook-form` | MIT | free_or_self_hosted | yes |
| `react-icons` | MIT | free_or_self_hosted | yes |
| `react-leaflet` | Hippocratic-2.1 | free_or_self_hosted | yes |
| `react-leaflet-cluster` | SEE LICENSE IN <LICENSE> | free_or_self_hosted | yes |
| `react-qr-code` | MIT | free_or_self_hosted | yes |
| `react-resizable-panels` | MIT | free_or_self_hosted | yes |
| `recharts` | MIT | free_or_self_hosted | yes |
| `sharp` | Apache-2.0 | free_or_self_hosted | yes |
| `socket.io` | MIT | free_or_self_hosted | yes |
| `socket.io-client` | MIT | free_or_self_hosted | yes |
| `tailwind-merge` | MIT | free_or_self_hosted | yes |
| `tailwindcss` | MIT | free_or_self_hosted | yes |
| `tailwindcss-animate` | MIT | free_or_self_hosted | yes |
| `tsx` | MIT | free_or_self_hosted | yes |
| `tw-animate-css` | MIT | free_or_self_hosted | yes |
| `typescript` | Apache-2.0 | free_or_self_hosted | yes |
| `vaul` | MIT | free_or_self_hosted | yes |
| `vite` | MIT | free_or_self_hosted | yes |
| `wouter` | Unlicense | free_or_self_hosted | yes |
| `ws` | MIT | free_or_self_hosted | yes |
| `zod` | MIT | free_or_self_hosted | yes |
| `zod-validation-error` | MIT | free_or_self_hosted | yes |
| `zustand` | MIT | free_or_self_hosted | yes |

### 8. Configuration & Environment
- Run audit: `npm run audit:platform`
- Strict gate: `npm run audit:platform:check`

### 9. Security & Permissions
- RBAC and role feature gates are enforced via backend middleware and audited as part of dashboard coverage.

### 10. Audit, Logs & Monitoring
- JSON report: `docs/platform-audit-report.json`
- Audit log: `docs/platform-audit-log.jsonl`

### Health Findings
- [medium] ORPHAN_PAGES: 12 orphan pages (client/src/pages/AdminDashboardConnected.tsx, client/src/pages/AdminDashboardRouter.tsx, client/src/pages/AdminLiveSupportDashboard.tsx, client/src/pages/AgentTickets.tsx, client/src/pages/ChatPageConnected.tsx, client/src/pages/ChatPageSimple.tsx, client/src/pages/CheckoutConnected.tsx, client/src/pages/HomeConnected.tsx, client/src/pages/MultiVendorHome.tsx, client/src/pages/not-found.tsx)
- [high] NON_FREE_OR_UNKNOWN_DEPENDENCIES: 4 non-free or unknown dependencies (@replit/vite-plugin-cartographer, @replit/vite-plugin-dev-banner, @replit/vite-plugin-runtime-error-modal, cloudinary)

<!-- PLATFORM_AUDIT:END -->

