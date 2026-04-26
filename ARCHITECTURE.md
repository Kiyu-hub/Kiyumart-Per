# KiyuMart Architecture Reference

**Purpose:** Deep technical architecture for engineers and AI builders.  
**Last Updated:** 2026-04-25  
**Companion:** See `README.md` for the platform overview, feature list, environment variables, and deployment guide. This document covers the *how* and *why* behind each architectural decision.

---

## Table of Contents

1. [System Topology](#system-topology)
2. [Data Model](#data-model)
3. [Order State Machine](#order-state-machine)
4. [Payment Architecture](#payment-architecture)
5. [Authentication & Authorization](#authentication--authorization)
6. [Real-time Architecture (Socket.IO)](#real-time-architecture-socketio)
7. [Background Workers](#background-workers)
8. [Services Layer](#services-layer)
9. [Frontend Architecture](#frontend-architecture)
10. [API Layer](#api-layer)
11. [File Storage](#file-storage)
12. [Email System](#email-system)
13. [Platform Configuration System](#platform-configuration-system)
14. [Startup Sequence](#startup-sequence)
15. [Security Architecture](#security-architecture)
16. [Performance Design](#performance-design)
17. [Testing](#testing)

---

## System Topology

```
┌─────────────────────────────────────────────────────────┐
│  Browser (React 18 SPA)                                  │
│  ├── Wouter client-side routing                          │
│  ├── TanStack Query (server state + cache)               │
│  ├── Socket.IO client (WebSocket, HTTP-long-poll fallback)│
│  └── Paystack inline SDK (popup payment)                 │
└────────────────────────┬────────────────────────────────┘
                         │ HTTPS + WSS
┌────────────────────────▼────────────────────────────────┐
│  Express.js Backend (Render, Frankfurt EU)               │
│  ├── Helmet + CORS + express-rate-limit                  │
│  ├── JWT cookie auth + role middleware                    │
│  ├── Drizzle ORM → Neon PostgreSQL                       │
│  ├── Socket.IO server (same process)                     │
│  ├── 4 background workers (setInterval)                  │
│  └── Multer → Cloudinary (media uploads)                 │
└────────────────────────┬────────────────────────────────┘
                         │ SQL (TLS)
┌────────────────────────▼────────────────────────────────┐
│  Neon Serverless PostgreSQL (42 tables)                  │
└─────────────────────────────────────────────────────────┘

External Services:
  Paystack API          ← payment initialization + payout transfers
  Paystack Webhooks  → POST /api/webhooks/paystack
  Cloudinary            ← image/video upload + CDN
  Nodemailer / SMTP     ← transactional email
  OpenStreetMap / Mapbox ← map tiles (Leaflet)
  Jitsi Meet (public)   ← video calls
  Sentry (optional)     ← error tracking
  Prometheus            ← metrics at /api/metrics
```

### Design Decisions

**Monorepo:** Frontend and backend share a single `package.json`. The shared `schema.ts` is imported by both sides — the frontend uses the Zod schemas for form validation, the backend uses the Drizzle table definitions. This eliminates type drift between API contracts and UI forms.

**One process:** Socket.IO runs inside the Express process. This avoids inter-process messaging complexity but means horizontal scaling requires a Redis adapter if you ever run multiple instances. For the current deployment (Render single instance), this is fine.

**No message queue:** Workers use `setInterval`. There is no Bull, BullMQ, or Redis. This is intentional for the free-tier Render deployment — adding a queue requires a Redis instance which costs money. The trade-off is that dropped jobs on server restart are retried on the next interval tick. All critical operations (payouts, order state transitions) are idempotent at the DB level, so a repeated worker run cannot double-process.

---

## Data Model

Schema defined in `shared/schema.ts` using Drizzle ORM. PostgreSQL on Neon (serverless, auto-scaling).

### Core Entities

#### `users`
The central entity. All roles (buyer, seller, rider, admin, etc.) are rows in this table distinguished by `role` enum.

Key columns:
- `role`: `super_admin | admin | seller | buyer | rider | agent | pickup_agent`
- `applicationStatus`: `pending | interview_scheduled | approved | rejected` — used for seller/rider onboarding
- `isApproved`: boolean — must be `true` for sellers and riders to access their dashboards
- `isActive`: boolean — if `false`, the user is locked out (can only reach support)
- `roleFeatures`: JSONB — dynamic permission flags (e.g. `{"orders.view": true, "analytics.view": false}`)
- `isPremiumSeller`: boolean — bypasses `freeTierProductLimit` when `true`
- `vehicleInfo`: JSONB — rider's vehicle details (type, plate number, etc.)

#### `stores`
One store per seller in multi-vendor mode. Holds the seller's public storefront data (name, logo, description) and payout configuration (bank account or mobile money details, encrypted).

#### `products`
Each product belongs to a category and optionally a seller. Key columns:
- `images`: text array — Cloudinary URLs
- `videoUrl`: optional Cloudinary video URL
- `dynamicFields`: JSONB — category-specific custom attributes
- `stockQuantity`: decremented on order placement
- Ratings are denormalized: `averageRating` and `totalReviews` are stored on the product row and updated when a review is created/updated.

#### `orders`
The central transaction record.
- `status`: enum covering all states from `pending` to `completed`
- `paymentStatus`: `pending | paid | failed | refunded`
- `deliveryMethod`: `delivery | pickup`
- `deliveryMethod === "pickup"` triggers the QR/OTP verification flow at the pickup station
- `externalDeliveryByBus`, `externalDeliveryType`: flags for external delivery context shown to buyer/seller
- Fee breakdown: `platformFee`, `deliveryFee`, `couponDiscount`, `processingFee` stored separately for accounting

#### `platformSettings`
A single row. All platform configuration is stored here. At startup, `server/data/platform-settings-compat.json` is used as a fallback if the DB row does not exist (handles cold-start race conditions on first deploy).

### Table Relationships

```
users (buyer_id) ──→ orders ←── users (seller_id)
                      │
           ┌──────────┤──────────┐
           ▼          ▼          ▼
      order_items  transactions  order_status_history
           │
           ▼
        products ──→ product_variants
           │
           ▼
        categories

users (seller_id) ──→ stores
stores ──→ promotionalAds
stores ──→ products (multi-vendor)

orders ──→ deliveryZones
orders ──→ users (rider_id, nullable)
orders ──→ deliveryTracking (GPS log)
orders ──→ receipts

users ──→ notifications (recipient_id)
users ──→ chatMessages (sender_id, recipient_id)
users ──→ sellerPayouts
users ──→ riderPayouts
```

---

## Order State Machine

Defined in `server/services/orderStateMachine.ts`. This is the canonical authority for what transitions are allowed and by whom.

### State Enum (in order)

```
pending / created
  → processing         (trigger: successful payment webhook)
    → packaged         (actor: seller)
      → ready          (actor: seller — marks order ready for pickup or dispatch)
        → [pickup path]     → completed (actor: pickup_agent or admin, via QR/OTP)
        → [internal rider]  → searching_rider → assigned → rider_arrived
                                              → picked_up → in_transit → en_route
                                              → delivered → completed
        → [external delivery] → external_dispatch_arranged → completed
cancelled                (actor: buyer from pending; admin/seller with reason)
```

### Transition Rules

- Each transition is validated: the requested `newStatus` must be reachable from `currentStatus`.
- Each transition is role-gated: only specific roles can trigger each transition.
- The `order_status_history` table logs every transition with actor ID, timestamp, and optional reason.
- Payment precondition: status cannot advance past `pending` unless `paymentStatus === 'paid'`.

### External Delivery Flag

When `isExternalRiderSystemEnabled: true` in platform settings, the `searching_rider` transition is never triggered. `ready → external_dispatch_arranged` is the only path forward, and it requires an admin action via a dedicated API endpoint.

---

## Payment Architecture

### Initialization

```
Client                     Backend                      Paystack API
  │                           │                              │
  │── POST /api/payments/     │                              │
  │   initialize ────────────▶│                              │
  │                           │── POST /transaction/        │
  │                           │   initialize ───────────────▶│
  │                           │◀── { accessCode, reference } ─│
  │◀── { accessCode,          │                              │
  │     reference } ──────────│                              │
  │                           │                              │
  │── Open Paystack popup     │                              │
  │   (using accessCode)      │                              │
  │                           │                              │
```

### Webhook Flow

```
Paystack                   Backend                       DB
  │                           │                           │
  │── POST /api/webhooks/     │                           │
  │   paystack ──────────────▶│                           │
  │                           │── Verify HMAC-SHA512      │
  │                           │── Check idempotencyKeys ──▶│
  │                           │◀── { used: false } ───────│
  │                           │── processPaystackCharge   │
  │                           │   Success()               │
  │                           │   ├── Update order status │
  │                           │   ├── Credit sellerPayout │
  │                           │   ├── Record commission   │
  │                           │   ├── Send buyer email    │
  │                           │   ├── Send seller email   │
  │                           │   ├── Emit socket events  │
  │                           │   └── Mark idempotency key│
  │◀── 200 OK ────────────────│                           │
```

### Idempotency

The `idempotencyKeys` table stores `{ key, used, usedAt }`. Every webhook handler checks this before processing. If `used === true`, the handler returns 200 immediately. This prevents double-processing of duplicate webhook deliveries.

The key is the Paystack `reference` field.

### Premium Seller Upgrade

Sellers can pay to become premium (bypasses the free-tier product limit). The flow uses the same Paystack webhook. The webhook detects `metadata.upgradeType === "premium_seller"` before calling `processPaystackChargeSuccess`, updates `users.isPremiumSeller = true`, sends notifications, and returns.

### Seller Payouts

Seller payouts are **not manual requests**. They are created automatically when an order is paid (`processPaystackChargeSuccess` creates a `sellerPayouts` record). The payout worker picks them up every 15 seconds and initiates Paystack Transfer API calls to the seller's configured bank account or mobile money number.

---

## Authentication & Authorization

### JWT Flow

1. Client sends credentials to `POST /api/auth/login`.
2. Backend hashes password with bcrypt (10 salt rounds), compares.
3. On match, generates JWT: `{ userId, role }`, signed with `JWT_SECRET`, 7-day expiry.
4. JWT is set as an `httpOnly`, `secure` (production), `sameSite: strict` cookie.
5. Client includes cookie automatically on all same-origin requests.
6. Each protected route runs `requireAuth`, which extracts the cookie, verifies the JWT, fetches the user from DB, and attaches to `req.user`.

### Middleware Chain

```
requireAuth
  └── requireRole("admin", "super_admin")
        └── requireRoleFeature("orders.view")
              └── handler
```

`requireRoleFeature` checks `req.user.roleFeatures[featureKey] !== false`. Undefined means the feature is allowed (opt-out rather than opt-in). Only explicitly `false` blocks access. `super_admin` bypasses all feature gates.

### Role Normalization

The string `"superadmin"` (without underscore) is normalized to `"super_admin"` in both `DashboardSidebar.tsx` and `DashboardLayout.tsx`. This handles legacy JWT tokens or inconsistent role strings.

### Password Reset

`POST /api/auth/forgot-password` creates a `passwordResetTokens` record with a random token and 1-hour expiry. An email with the reset link is sent. `POST /api/auth/reset-password` validates the token and updates the password hash.

---

## Real-time Architecture (Socket.IO)

Socket.IO runs on the same HTTP server as Express. Upgrade from HTTP to WebSocket happens transparently.

### Authentication

The Socket.IO `connection` handler reads the JWT from the cookie header (or `auth.token` in handshake data). Invalid tokens result in immediate disconnection.

### Room Strategy

On successful connection, the socket joins:
- `user:{userId}` — personal room for targeted notifications
- `role:{role}` — role room for broadcast events (e.g. new seller application → all admins)

This means `io.to("user:abc123").emit(...)` reaches exactly one user regardless of how many tabs they have open.

### Event Reference

| Event | Direction | Emitted by | Consumed by |
|---|---|---|---|
| `notification` | S→C | Backend on any notification create | User's personal room |
| `order_status_updated` | S→C | Order state machine | Buyer + Seller personal rooms |
| `order_rider_assignment_failed` | S→C | Rider matching service | Admin role room + Buyer personal room |
| `rider_location_update` | S→C | Rider GPS submit handler | Buyer on active delivery |
| `new_message` | S→C | Chat message handler | Recipient personal room |
| `message_read` | S→C | Read receipt handler | Sender personal room |
| `typing` | C→S→C | Client | Conversation partner |
| `support_message` | S→C | Support handler | Agent + Buyer personal rooms |
| `maintenance_status` | S→C | Admin toggle handler | All connected clients |
| `presence_update` | S→C | Presence heartbeat | Conversation partners |
| `seller-approved:{userId}` | S→C | Application handler | Admin room |

### Presence System

`server/services/presenceService.ts` maintains an in-memory map of `userId → { status, lastSeen }`. Clients must emit a `heartbeat` event every 5–10 seconds to stay online. A sweep runs periodically and marks users whose last heartbeat is stale as offline. This is entirely in-memory — presence state does not survive server restarts.

---

## Background Workers

All workers are started in `server/index.ts` inside try/catch blocks. A failed worker import does not crash the server.

```typescript
// Pattern used for each worker:
try {
  const { runXWorker } = await import('./workers/xWorker');
  runXWorker();
} catch (e) {
  console.error('Worker failed to start:', e);
}
```

### Graceful Shutdown

```typescript
process.on("SIGTERM", () => { setTimeout(() => process.exit(0), 8000).unref(); });
process.on("SIGINT",  () => { setTimeout(() => process.exit(0), 8000).unref(); });
```

This gives in-flight HTTP requests up to 8 seconds to complete before the process exits. Workers are not explicitly stopped — the process exit terminates them.

---

## Services Layer

`server/services/` contains stateless (or in-memory) business logic modules that multiple route handlers import.

### `orderStateMachine.ts`
Pure functions: `canTransition(from, to, role): boolean`, `transition(orderId, newStatus, actor)`. The transition function writes to both `orders.status` and `order_status_history`. It is the only place order status is updated.

### `messageDeliveryService.ts`
Manages the lifecycle of chat messages: `sent → delivered → read`. Uses a retry queue for messages sent to offline users. Exponential backoff: 1s, 2s, 4s, 8s, 16s (max 5 retries). After 5 failures, the message is marked `failed` and the sender is notified.

### `chatPermissionService.ts`
Enforces who can chat with whom. Rules:
- Rider ↔ Buyer: only if there is an active order between them
- Seller ↔ Buyer: only if there is an order linking them
- Buyer ↔ Agent: always (support tickets)
- Admin: can initiate with any user
- Sellers → sellers: not permitted

### `supportMessagingService.ts`
Handles the support thread context. When an admin or agent replies in a support thread, their display name is shown as "Live Support" to non-staff members. Their real name is visible to other staff. This is a privacy design decision.

### `jitsiMeetService.ts`
Generates a Jitsi room URL for a given context (order ID, chat thread ID). Supports the public `meet.jit.si` domain (no auth needed) and a self-hosted instance with JWT room tokens.

### `presenceService.ts`
In-memory only. Tracks `{ userId → { status: "online"|"away"|"offline", lastSeen: Date, typing: boolean } }`. No DB writes. Resets on restart.

### `riderRiskEngine.ts`
Scores riders on risk signals: GPS dropout, impossible speed (teleportation), manual cancellations, late pickups. Score decays at 0.96× per hour (so a score of 10 becomes ~1 after 56 hours with no new signals). When a rider's score exceeds `RIDER_RISK_BLOCK_THRESHOLD` (default 8), they are flagged for admin review.

---

## Frontend Architecture

### Routing

`client/src/App.tsx` is the single file that defines every route. Wouter's `<Route>` components are used. Route guards are HOCs applied inline:

```tsx
// Example guard pattern
const GuardedAdminRoute = withAdminRouteGuard(AdminPage);
// ...
<Route path="/admin/page" component={GuardedAdminRoute} />
```

Guards implemented in App.tsx:
- `withAdminRouteGuard` — redirects to `/auth` if not `admin` or `super_admin`
- `withExternalRiderRouteGuard` — renders null if `isExternalRiderSystemEnabled` is true
- `withAdminExternalRiderFeatureGuard` — same, for admin rider-management pages

### Dashboard Layout

`DashboardLayout.tsx` is the shared shell used by all role dashboards. It:
- Reads the current URL via `useLocation()` from Wouter
- Maps URL to a `menuId` via `routeToMenuId` lookup
- Passes `activeItem` and `onItemClick` to `DashboardSidebar`
- `onItemClick` calls `setLocation(...)` (Wouter navigation) — never `window.location.href`
- Handles `InactiveAccountNotice` for deactivated sellers/riders
- Runs `useSellerProfileGuard` to enforce profile completion for sellers

`AdminDashboardConnected.tsx` is the main admin dashboard page. It has its **own** `DashboardSidebar` instance (not using `DashboardLayout`) because it renders its own full-page layout with live metrics. It maintains its own `activeItem` state and `handleItemClick` handler that mirrors the URL mapping.

### State Management

```
Server state  → TanStack Query v5
  queryClient.invalidateQueries()  ← preferred for refreshing
  Never: window.location.reload()  ← BANNED

UI state      → Zustand (theme, ephemeral UI)
Auth state    → React Context (AuthContext) + TanStack Query (/api/auth/me)
Platform mode → usePlatformSettings() hook → /api/settings query
Notifications → NotificationContext + Socket.IO
```

### `queryClient.ts`

`apiRequest(method, url, body)` is the centralized fetch helper used by all mutations. It:
- Includes `credentials: "include"` (sends JWT cookie)
- Throws if response is not ok (TanStack Query mutation will catch and surface the error)

`fetchApiJson<T>(url, options)` is the query function helper — adds timeout handling.

### Platform Settings Hook

```typescript
const {
  isMultiVendor,
  isExternalRiderSystemEnabled,
  hasResolvedSettings,
  freeTierProductLimit,
  ...
} = usePlatformSettings();
```

This hook queries `/api/settings` and memoizes the result. `hasResolvedSettings` is `false` until the first fetch completes. Guards that depend on platform mode wait for `hasResolvedSettings` before rendering to avoid flicker.

### No Page Reloads

`window.location.reload()` was removed from the entire codebase. All data refresh is done via `queryClient.invalidateQueries()`. This is critical for:
- Backend recovery after cold start: the health poller in `App.tsx` calls `invalidateQueries()` when the backend comes back, not `reload()`
- Maintenance mode exit: `MaintenancePage.tsx` calls `invalidateQueries()` when `isMaintenanceMode` flips to false
- Manual refresh buttons: call `invalidateQueries()` with a spinner state

---

## API Layer

All ~300 API endpoints are in `server/routes.ts` (≈21,750 lines). This is a deliberate architectural choice — one file to grep.

### Middleware Stack (per request)

```
helmet()                     ← security headers
cors()                       ← origin check
express.json({ limit: "10mb" })
cookieParser()
express-session
rateLimiter (role-aware)
│
▼
Route handler
  requireAuth               ← JWT validation
  requireRole(...)          ← role check
  requireRoleFeature(...)   ← feature flag check
  Business logic
  storage.x() calls         ← DB via Drizzle
  io.to(...).emit(...)      ← socket events
  res.json(...)
```

### Rate Limiting

```typescript
// Auth routes
authLimiter = rateLimit({ windowMs: 15min, max: 5 })

// API routes (tiered by role, applied after auth)
super_admin / admin: 1000 per 15min
seller / rider:      500  per 15min
agent:               300  per 15min
buyer:               100  per 15min
```

### Context Parameter

Many list endpoints accept `?context=admin|seller|buyer`. This changes which fields are returned and which filters are applied. For example, `GET /api/orders?context=admin` returns all orders with full detail, while `?context=seller` returns only the authenticated seller's orders.

---

## File Storage

### Cloudinary (Production)

Images and videos are uploaded via Multer to a temporary buffer, then pushed to Cloudinary via the Node.js SDK. The returned Cloudinary URL is stored in the DB. Cloudinary handles CDN, compression, and resizing.

Upload size limit: controlled by `maxUploadSizeMb` in platform settings (default 10MB).  
Allowed types: `jpg, jpeg, png, webp, gif, avif` (configurable in platform settings).

### Local Disk (Development / Fallback)

If Cloudinary credentials are not configured, Multer stores files in `/uploads`. These are served statically. Not suitable for production (not persistent across Render deploys).

### 3D Models

`client/public/assets/vehicles/` contains GLB 3D models used as map markers for rider type (car, motorcycle, bicycle). These are loaded by Leaflet/Three.js in the live delivery tracking view.

---

## Email System

`server/email.ts` exports `sendEmail({ to, subject, html })`.

SMTP config resolution order:
1. `platformSettings.smtpHost` (DB, potentially encrypted)
2. `SMTP_HOST` environment variable

The function creates a transporter on each call (not cached) so SMTP config changes in the admin UI take effect immediately.

All email sends in route handlers and workers are:
- Fully wrapped in `try/catch`
- Non-blocking (the main operation succeeds even if email fails)
- Using dynamic `import('./email')` when called from `payments.ts` to avoid circular import issues

---

## Platform Configuration System

`platformSettings` is a single-row table. It is the operational control panel for the entire platform — no code redeploy is needed to change fees, enable features, or update SMTP credentials.

### Read Path

`GET /api/settings` returns the full settings object. This is cached by TanStack Query on the frontend and accessed via `usePlatformSettings()`. The `staleTime` is short so changes propagate within a few seconds.

### Write Path

`PATCH /api/settings` merges the request body into the existing settings. The middleware strips super_admin-only fields from non-super_admin requests:

```typescript
if (req.user.role !== 'super_admin') {
  delete updateData.freeTierProductLimit;
  delete updateData.maxProductsPerSeller;
  delete updateData.orderAutoCancelHours;
  delete updateData.inviteOnlyRegistration;
}
```

### Cold Start Fallback

`server/data/platform-settings-compat.json` is loaded if the DB settings row doesn't exist (race condition on first deploy). It provides sensible defaults so the server can respond to health checks and initial requests before the DB is fully initialized.

---

## Startup Sequence

`server/index.ts` executes in this order:

1. Load environment variables (`dotenv`)
2. Create Express app, configure middleware (Helmet, CORS, rate limiting, sessions)
3. Connect to Neon PostgreSQL via Drizzle
4. Run **schema self-heal migrations** — `DO $$ BEGIN ... IF NOT EXISTS ... END $$` blocks for every column and table added since the initial schema. This is safe to run on every boot.
5. Register all routes (`server/routes.ts`)
6. In development: embed Vite dev server middleware
7. In production: serve `client/dist` as static files
8. Start listening on `PORT` (default 5000)
9. Register background workers: payout, promotional, orderAutoCancel, notificationReminder
10. Set up graceful shutdown handlers (SIGTERM, SIGINT → 8-second drain)

If any worker fails to import (e.g. missing dependency), the error is logged and the server continues.

---

## Security Architecture

### Defense in Depth

```
Layer 1 — Network
  ├── HTTPS enforced via HSTS header
  ├── CORS: only FRONTEND_URL allowed in production
  └── Rate limiting: 5 auth attempts per 15min

Layer 2 — Transport
  ├── httpOnly cookies (XSS cannot steal JWT)
  ├── secure cookie flag (HTTPS only in production)
  └── sameSite: strict (CSRF mitigation)

Layer 3 — Application
  ├── JWT signature validation on every request
  ├── Role checks (requireRole)
  ├── Feature flag checks (requireRoleFeature)
  ├── Zod input validation (all API inputs)
  └── Drizzle ORM (parameterized queries — no raw SQL injection vectors)

Layer 4 — Data
  ├── bcrypt (10 rounds) for all passwords
  ├── AES-256-GCM for sensitive DB fields (when SETTINGS_ENCRYPTION_KEY set)
  ├── No PII in server logs (user emails, payment details stripped from logs)
  └── Idempotency keys prevent duplicate payment processing

Layer 5 — External
  ├── Paystack webhook HMAC-SHA512 verification
  └── Seed endpoints return 403 in production
```

### Sensitive Field Encryption

When `SETTINGS_ENCRYPTION_KEY` is set, the following `platformSettings` fields are encrypted at rest using AES-256-GCM before writing to the DB and decrypted on read:
- `cloudinaryApiSecret`
- `paystackSecretKey`
- `smtpPass`

The encryption key must be exactly 32 bytes (256 bits). If the key is changed, existing encrypted values cannot be decrypted — set the key once and never change it in production.

---

## Performance Design

### Frontend

- **No page reloads** — all state refresh via `queryClient.invalidateQueries()`
- **React Query caching** — API responses cached by query key, with configurable `staleTime`
- **React.lazy() code splitting** — all 100+ pages are loaded on demand. Only 5 pages are eagerly loaded (Home, MultiVendorHome, AuthPage, MaintenancePage, NotFound). Initial JS payload is ~783 kB vs 4.1 MB pre-split.
- **Suspense boundary** — `<React.Suspense fallback={<RouteGateLoader />}>` wraps the entire route tree; each lazy chunk shows a spinner while loading.
- **Image lazy loading** — product images use `loading="lazy"` by default
- **Maintenance polling** — reduced from 20s to 60s (`refetchInterval: 60000, staleTime: 55000`) to halve background API calls during idle
- **PWA** — `vite-plugin-pwa` generates a service worker for offline-capable shell caching (precache limit set to 5 MB to accommodate the main bundle)

### Backend

- **Gzip compression** — `compression` middleware applied before all routes; reduces response payload by 60-80%
- **Drizzle query builder** — generates efficient parameterized SQL; no N+1 by design
- **Multi-vendor order lookup** — uses individual `getOrder(id)` calls per order ID rather than a full table scan (`getAllOrders()`)
- **Context-filtered queries** — `?context=admin|seller|buyer` minimizes unnecessary data transfer
- **Neon serverless** — connection pooling handled by Neon's serverless driver; no manual pool management needed
- **Prometheus metrics** — `GET /api/metrics` exposes request counts, latency histograms, and error rates for monitoring
- **No production console.log** — all debug logging removed from route handlers; only `console.info` (prefixed `[STORE]`, `[ADMIN]`, `[PAYOUT]`) and `console.error`/`console.warn` remain

### Free Tier Constraints

The platform is designed to run on free tiers:
- Render free plan (backend) — can cold-start; frontend detects this and re-fetches data on recovery
- Neon free plan (database) — auto-pauses after inactivity; connection wakes it on first query
- Netlify free plan (frontend) — static CDN, always available
- Cloudinary free plan (media) — 25GB storage, 25GB bandwidth/month

---

## Testing

### End-to-End (Playwright)

Tests in `e2e/`. Run with `npm run test:e2e`. Covers admin settings flows.

### Unit / Integration

Test files in `server/__tests__/`. Notable:
- `paystack-integration.test.ts` — verifies Paystack webhook HMAC validation and idempotency logic
- Run with `npm run test:integration`

### Type Safety

`npm run typecheck` runs TypeScript compilation across the full monorepo (frontend + backend + shared). This is the primary code correctness gate — all contributions should pass typecheck with zero errors.

### Platform Audit Script

`npm run audit:platform` runs `scripts/generate-platform-audit.ts` which produces:
- `docs/platform-audit-report.json` — machine-readable feature inventory
- `docs/platform-audit-log.jsonl` — line-delimited audit entries
- Updates the `<!-- PLATFORM_AUDIT:START -->` section in `README.md`

---

*Last updated: 2026-04-26. Update this file whenever the architecture changes.*
