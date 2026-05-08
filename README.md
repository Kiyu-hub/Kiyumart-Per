# KiyuMart

**KiyuMart** is a full-stack, multi-role commerce and logistics platform built for the Ghanaian market. It supports both single-store and multi-vendor (marketplace) modes, handles real-time order tracking and live chat, processes payments through Paystack, and coordinates physical delivery through either an internal rider fleet or an external logistics provider.

> **This file is the sole source of truth for the platform.** Every feature, route, configuration field, and architectural decision is documented here. It is updated on every significant change and is the first document any developer or AI assistant should read.

---

## Table of Contents

1. [What KiyuMart Is](#what-kiyumart-is)
2. [Platform Modes](#platform-modes)
3. [Who Uses It — The 7 Roles](#who-uses-it--the-7-roles)
4. [Feature Map](#feature-map)
5. [Technology Stack](#technology-stack)
6. [Project Structure](#project-structure)
7. [Getting Started (Local Development)](#getting-started-local-development)
8. [Environment Variables](#environment-variables)
9. [Core Concepts](#core-concepts)
   - [Order Lifecycle](#order-lifecycle)
   - [Payment Flow](#payment-flow)
   - [Delivery Modes](#delivery-modes)
   - [Permission System](#permission-system)
10. [Database Overview](#database-overview)
11. [API Routes Overview](#api-routes-overview)
12. [Frontend Routes](#frontend-routes)
13. [Background Workers](#background-workers)
14. [Email System](#email-system)
15. [Real-time Events (Socket.IO)](#real-time-events-socketio)
16. [Platform Settings](#platform-settings)
17. [Deployment](#deployment)
18. [Scripts Reference](#scripts-reference)
19. [Security](#security)
20. [Known Constraints](#known-constraints)

---

## What KiyuMart Is

KiyuMart is an e-commerce and last-mile logistics platform. Buyers browse products, add to cart, and pay via Paystack. Sellers list products and receive automatic payouts when orders are fulfilled. Admins operate the platform and manage users, permissions, content, and finances.

**Currency:** Ghana Cedis (GHS) exclusively.  
**Language:** English only.  
**Region:** Ghana — Paystack (GHS), Neon PostgreSQL (EU region).

The platform is designed to be operated entirely through its web dashboards without any code changes — product listings, delivery zones, commission rates, promotional ads, platform branding, SMTP config, and feature flags are all configurable by an authenticated super admin through the UI.

---

## Platform Modes

Two runtime modes are set by the super admin in **Settings → General**.

### Single-Vendor Mode (`isMultiVendor: false`)

One store, one seller identity. The admin manages all products. Buyers see a unified storefront without any store-switching. The primary store is set via `primaryStoreId` in platform settings. Best for brand stores, single-operator businesses.

### Multi-Vendor Mode (`isMultiVendor: true`)

Multiple independent sellers each manage their own store, products, and payouts. Buyers browse a marketplace. Sellers see only their own data. The platform earns commission on each transaction (configurable, default 1%). Promotional ads and store-level branding are available. Best for marketplaces.

**Switching modes does not delete data** — it changes the UI routes exposed to buyers and the filtering applied to data queries.

---

## Who Uses It — The 7 Roles

| Role | Dashboard Entry | What They Do |
|---|---|---|
| `super_admin` | `/admin` | Full platform control — settings, permissions, all features unlocked. Cannot be restricted by role-feature gates. |
| `admin` | `/admin` | Platform management with role-feature gates applied. Can manage orders, users, products, analytics — gated by super admin. |
| `seller` | `/seller` | Lists products, views their orders, manages payouts, uploads media, creates coupons and promotions. |
| `buyer` | `/buyer` | Shops, checks out, tracks orders, messages sellers, leaves reviews. |
| `rider` | `/rider` | Manages assigned deliveries, updates order status (pickup → in transit → delivered). Internal rider mode only. |
| `pickup_agent` | `/pickup-agent` | Verifies pickup orders at a pickup station using QR code or 6-digit OTP. Manages work shifts. |
| `agent` | `/agent` | Customer support — handles support tickets, looks up customers, responds in support threads. |

Every role except `super_admin` has a **role-feature map**: a DB-stored set of boolean flags (e.g. `products.create`, `orders.view`, `analytics.view`) that the super admin can toggle per-user through the Permissions page. This means two sellers can have different capabilities without any code change.

---

## Feature Map

### Buyer Features
- Product browsing by category, store, search
- Cart with quantity management and variant selection
- Paystack inline payment (popup — no external redirect)
- Order tracking with live status updates
- Real-time map tracking for rider deliveries
- Wishlist
- Product reviews and ratings
- Support ticket creation and live chat with agents
- Digital e-receipt after payment with "Items Ordered" summary (thumbnails, variants)
- Order history with full detail view; pending/unpaid orders can be removed
- Referral programme (share code → earn rewards when friends complete orders)
- Chat message delete and edit (with real-time sync)

### Seller Features
- Product management: create, edit, delete, with image/video upload
- Product variants (size, color) with per-variant stock and images
- Category assignment per product
- **Ghanaian food presets:** ~40 quick-add product presets covering Rice & Grains, Soups & Stews, Staples, Proteins, Snacks & Street Food, and Beverages
- Coupon creation (discount codes, min purchase, expiry, usage limits)
- Promotional ad campaigns (multi-vendor mode) — apply for promotion slots and track status across Pending / Active / History tabs
- Media library: upload and reuse images across products
- Order management: view, process, package, mark ready
- Payout setup (bank account or mobile money)
- Automatic payouts when orders are fulfilled (no manual request needed)
- Sales analytics (charts, date filters, export CSV/PDF)
- Store profile and branding
- Chat with buyers (if enabled by admin) — includes message delete and edit with real-time sync
- Seller group chat (real-time channel shared between all sellers and super admin)
- Seller ratings and reviews received
- Free tier product limit with optional premium upgrade (instant verification — no webhook wait)
- Referral programme (share code → earn rewards)

### Admin / Super Admin Features
- User directory: create, edit, activate/deactivate, change roles
- Seller and rider application approvals with email notifications
- Per-user role-feature permission management
- Product catalog management (all sellers)
- Order oversight with full status control
- Manual rider assignment (internal rider mode)
- Live delivery map with real-time GPS tracking
- Delivery zone management
- Pickup station configuration
- Pickup order verification (QR / OTP)
- Promotional ad management with pricing tiers
- **Banner Promotion Designer:** visual drag-and-drop canvas to design hero carousel banners for approved promotions — set backgrounds (gradient, solid colour, or image from media library), add overlay product/store images, freely position title, subtitle, CTA button, and "Sponsored" label by dragging on the live preview
- Banner management (hero banners, carousel banners, sidebar ads)
- Seller payout management and approval
- Rider payout management
- Platform earnings and commission tracking
- Analytics dashboard (revenue, orders, users, delivery metrics)
- Report export (CSV and PDF)
- Support ticket oversight and live support dashboard
- Bulk notification dispatch
- System activity audit log with severity and resolution tracking
- Maintenance mode (manual on/off + auto on server restart)
- Platform settings (branding, SMTP, fees, Paystack keys, feature flags)
- **Custom audio upload:** upload custom ringtone/notification audio files (WAV, MP3, OGG) for call and notification sounds
- Footer CMS (custom pages for Terms, Privacy, etc.)
- Sentry DSN and Google Analytics configuration
- Referral programme management and admin reporting
- Group chat channels: Staff Chat (admins/agents), Seller Chat, Rider Chat
- Pickup order verification by OTP or order number
- Notification visibility control (operational events hidden from non-super-admin)

### Rider Features (Internal Rider Mode Only)
- View and accept assigned deliveries
- Update delivery status (assigned → arrived → picked up → in transit → delivered)
- Live route map with navigation
- Earnings dashboard
- Chat with buyers
- Rating received from buyers
- Rider group chat (real-time channel shared between all riders and super admin)

### Pickup Agent Features
- Verify pickup orders by scanning QR code or entering OTP
- View shift schedule
- Performance and earnings tracking

---

## Technology Stack

| Layer | Technology | Notes |
|---|---|---|
| Frontend framework | React 18.3 + TypeScript | Strict mode |
| Build tool | Vite | With PWA plugin (`vite-plugin-pwa`) |
| Frontend routing | Wouter 3.3 | Lightweight, no React Router |
| Server state | TanStack Query v5 | All API data, invalidated not reloaded |
| Client state | Zustand 5 | UI-only state |
| UI components | Radix UI + Tailwind CSS | Via Shadcn UI conventions |
| Icons | Lucide React | Primary icon set |
| Charts | Recharts | Analytics dashboards |
| Forms | React Hook Form + Zod | Validation at form and API level |
| Animations | Framer Motion | Page transitions and UI motion |
| Maps | Leaflet / React-Leaflet | OpenStreetMap tiles (default); Mapbox optional |
| QR | html5-qrcode (scan) + react-qr-code (generate) | |
| Compression | `compression` (gzip) | Applied server-side to all Express responses — 60-80% payload reduction |
| Backend framework | Express 4.21 + TypeScript | |
| Runtime | Node.js (LTS) via `tsx` in dev, `esbuild` bundle in prod | |
| ORM | Drizzle ORM 0.39 | Type-safe, no raw SQL for core queries |
| Database | PostgreSQL (Neon serverless) | |
| Real-time | Socket.IO 4.8 | WebSocket with HTTP-long-poll fallback |
| Auth | JWT (jsonwebtoken) + bcryptjs | 7-day tokens, httpOnly cookies |
| Payments | Paystack | Inline popup (primary) |
| Email | Nodemailer | SMTP — configurable per platform settings |
| Media | Cloudinary | Image/video hosting and CDN |
| File uploads | Multer | To Cloudinary or local disk |
| Security | Helmet, express-rate-limit, CORS | |
| Error tracking | Sentry (optional) | DSN configurable in platform settings |
| Metrics | Prometheus (`prom-client`) | `/api/metrics` endpoint |
| Deployment | Render (backend) + Netlify (frontend) | |

---

## Project Structure

```
Kiyumart-Per/
├── client/                        # React frontend (Vite)
│   ├── index.html
│   ├── public/
│   │   ├── robots.txt             # SEO: blocks /admin, /seller, /rider, /api
│   │   ├── sitemap.xml            # Lists public pages
│   │   ├── favicon.png
│   │   ├── icons/                 # PWA icons (192px, 512px, Apple touch)
│   │   └── assets/
│   │       ├── vehicles/          # 3D GLB models for map markers
│   │       └── stock_images/      # Banner image library (~80 images)
│   └── src/
│       ├── App.tsx                # Root — all client routes defined here
│       ├── main.tsx               # Vite entry, mounts ErrorBoundary
│       ├── index.css              # Global styles, CSS variables
│       ├── components/            # Shared UI components
│       │   ├── ui/                # Radix/Shadcn primitives
│       │   ├── DashboardLayout.tsx  # Shared dashboard shell (sidebar + header)
│       │   ├── DashboardSidebar.tsx # Role-aware sidebar navigation
│       │   ├── Header.tsx
│       │   ├── Footer.tsx
│       │   ├── ErrorBoundary.tsx
│       │   └── ...
│       ├── pages/                 # One file per page/route (~88 pages)
│       ├── hooks/                 # Custom React hooks
│       ├── contexts/              # React contexts (auth, language, notifications)
│       ├── lib/
│       │   ├── queryClient.ts     # TanStack Query setup + apiRequest helper
│       │   ├── auth.ts            # useAuth hook, auth state
│       │   └── utils.ts           # cn(), formatting helpers
│       └── assets/                # Imported images and SVGs
│
├── server/                        # Express backend
│   ├── index.ts                   # Entry: middleware, routes, workers, startup migrations
│   ├── routes.ts                  # All ~300 API endpoints (~21,750 lines)
│   ├── storage.ts                 # DB access layer (~5,186 lines)
│   ├── auth.ts                    # JWT middleware, password hashing
│   ├── payments.ts                # Paystack webhook handling, order settlement
│   ├── paystack.ts                # Paystack API wrapper
│   ├── email.ts                   # Nodemailer setup, sendEmail()
│   ├── cloudinary.ts              # Cloudinary upload helpers
│   ├── currency.ts                # Currency conversion utilities
│   ├── metrics.ts                 # Prometheus metrics
│   ├── workers/
│   │   ├── payoutWorker.ts        # Seller payout processing (every 15s)
│   │   ├── promotionalWorker.ts   # Ad expiry (every 60s)
│   │   ├── orderAutoCancelWorker.ts  # Stale order cancellation (every 5min)
│   │   └── notificationReminderWorker.ts  # Payment/interview reminders (every 30min)
│   ├── services/
│   │   ├── orderStateMachine.ts   # Canonical order status transitions + validation
│   │   ├── messageDeliveryService.ts  # WhatsApp-style delivery lifecycle
│   │   ├── supportMessagingService.ts  # Support thread roles and identity masking
│   │   ├── chatPermissionService.ts   # Role-based chat access control
│   │   ├── jitsiMeetService.ts    # Video call room generation
│   │   ├── presenceService.ts     # Online/offline status tracking
│   │   └── riderRiskEngine.ts     # Rider risk scoring with time decay
│   └── data/
│       └── platform-settings-compat.json  # Fallback settings for cold starts
│
├── shared/
│   ├── schema.ts                  # Drizzle ORM schema — all 42 tables and enums
│   └── storeTypes.ts              # Shared TypeScript types
│
├── db/
│   └── index.ts                   # Drizzle + Neon DB connection
│
├── migrations/                    # SQL migration files
├── scripts/                       # Utility scripts (seeding, audit, type checks)
├── docs/                          # Generated audit reports
├── e2e/                           # Playwright end-to-end tests
│
├── package.json
├── tsconfig.json
├── vite.config.ts
├── drizzle.config.ts
├── tailwind.config.ts
├── render.yaml                    # Render deployment config
├── README.md                      # This file — sole source of truth
└── ARCHITECTURE.md                # Deep technical architecture reference
```

---

## Getting Started (Local Development)

### Prerequisites

- Node.js LTS (18+)
- A PostgreSQL database (Neon free tier works)
- A Paystack account (test keys sufficient)
- Cloudinary account (optional — falls back to local uploads)

### Setup

```bash
# 1. Install all dependencies
npm install

# 2. Copy the environment template and fill in your values
cp .env.example .env

# 3. Start development — runs both backend and Vite frontend simultaneously
npm run dev
```

The backend starts on `http://localhost:5000`. Vite proxies `/api` and `/socket.io` requests to it. The frontend is available at `http://localhost:5173`.

On first boot, `server/index.ts` runs **schema self-heal migrations** — `IF NOT EXISTS` SQL blocks that create any missing columns or tables without destroying data. This means you generally do not need to run migrations manually in development.

### Creating an Admin Account

Set `SUPER_ADMIN_EMAIL` and `SUPER_ADMIN_PASSWORD` in your `.env`. On first boot the server will create the super admin account automatically if it does not already exist.

---

## Environment Variables

### Required

| Variable | Description |
|---|---|
| `DATABASE_URL` | Neon (or any PostgreSQL) connection string |
| `JWT_SECRET` | Secret for signing JWTs — use a 64-char random string |
| `SESSION_SECRET` | Express session secret — can be the same as `JWT_SECRET` |
| `PAYSTACK_SECRET_KEY` | Paystack secret key (`sk_live_...` or `sk_test_...`) |
| `PAYSTACK_PUBLIC_KEY` | Paystack public key (`pk_live_...` or `pk_test_...`) |
| `FRONTEND_URL` | Full public URL of the frontend (e.g. `https://kiyumart.netlify.app`) — used for Paystack callback URLs |

### Recommended for Production

| Variable | Description |
|---|---|
| `CLOUDINARY_CLOUD_NAME` | Cloudinary cloud name |
| `CLOUDINARY_API_KEY` | Cloudinary API key |
| `CLOUDINARY_API_SECRET` | Cloudinary API secret |
| `SMTP_HOST` | SMTP server hostname |
| `SMTP_PORT` | SMTP port (typically 465 or 587) |
| `SMTP_USER` | SMTP username / email address |
| `SMTP_PASS` | SMTP password or app password |
| `SMTP_SECURE` | `true` for SSL/TLS, `false` for STARTTLS |
| `SMTP_FROM_EMAIL` | From email address (e.g. `noreply@kiyumart.com`) |
| `SMTP_FROM_NAME` | Sender display name (e.g. `KiyuMart`) |
| `SETTINGS_ENCRYPTION_KEY` | 32-byte hex key for AES-256-GCM encryption of sensitive DB fields |
| `SUPER_ADMIN_EMAIL` | Super admin email to auto-create on first boot |
| `SUPER_ADMIN_PASSWORD` | Super admin password (set once on first boot) |
| `NODE_ENV` | Set to `production` — enables HTTPS cookies, disables seed endpoints |

### Optional / Feature-specific

| Variable | Default | Description |
|---|---|---|
| `PORT` | `5000` | Backend server port |
| `HOST` | `0.0.0.0` | Bind address |
| `KIYUMART_USE_EMBEDDED_VITE` | `false` | `true` in dev to embed Vite into Express |
| `API_VERBOSE_LOGS` | — | Enable detailed API request logging |
| `SOCKET_VERBOSE_LOGS` | — | Enable Socket.IO debug logs |
| `RIDER_GPS_FRESHNESS_MS` | `10000` | Max age (ms) of rider GPS data before marked stale |
| `RIDER_LAST_KNOWN_RETENTION_MS` | `86400000` | How long to retain last known rider location (24h) |
| `RIDER_DEFAULT_MAX_CAPACITY` | `3` | Max order items a rider can carry simultaneously |
| `RIDER_RISK_BLOCK_THRESHOLD` | `8` | Risk score above which a rider is auto-suspended |
| `ENABLE_SOFT_ZONE_MATCH` | — | Allow delivery orders to nearby zones if exact zone unavailable |
| `PAYOUT_WORKER_INTERVAL_MS` | `15000` | How often the payout worker runs |
| `PROMO_WORKER_INTERVAL_MS` | `60000` | How often the promotional ad expiry worker runs |
| `VITE_MAP_PROVIDER` | `PROVIDER_A` | Map provider: `PROVIDER_A` (Leaflet/OSM) or `PROVIDER_B` (Mapbox) |
| `MAPBOX_PUBLIC_TOKEN` | — | Mapbox public token (if using Mapbox) |
| `MAPBOX_ACCESS_TOKEN` | — | Mapbox access token (if using Mapbox) |
| `JITSI_APP_ID` | — | Jitsi Meet app ID (for self-hosted Jitsi JWT auth) |
| `JITSI_SECRET` | — | Jitsi Meet secret (for self-hosted Jitsi JWT auth) |
| `ADMIN_EMAIL` | — | Auto-create a demo admin on boot |
| `ADMIN_PASSWORD` | — | Demo admin password |

> **Note:** SMTP config and Paystack keys can also be stored encrypted in the `platform_settings` database table and configured through the Admin Settings UI. Environment variables serve as a fallback and are used during initial setup before the DB is configured.

---

## Core Concepts

### Order Lifecycle

Every order flows through a canonical state machine defined in `server/services/orderStateMachine.ts`. Transitions are enforced by role — only the correct role can move an order to the next state.

```
CREATED / PENDING
  └── (buyer pays) ──→ PROCESSING
        └── (seller packages) ──→ PACKAGED
              └── (seller marks ready) ──→ READY
                    │
                    ├── [Internal rider mode]
                    │     └── SEARCHING_RIDER
                    │           └── ASSIGNED (rider accepted)
                    │                 └── RIDER_ARRIVED
                    │                       └── PICKED_UP
                    │                             └── IN_TRANSIT / EN_ROUTE
                    │                                   └── DELIVERED
                    │                                         └── COMPLETED
                    │
                    ├── [External delivery mode]
                    │     └── EXTERNAL_DISPATCH_ARRANGED (admin confirms handover)
                    │           └── COMPLETED (super admin marks delivered)
                    │
                    └── [Pickup order]
                          └── (buyer arrives, agent scans QR or enters OTP)
                                └── COMPLETED
```

Orders can also be `CANCELLED` from `pending/created` (buyer) or `processing` (admin/seller with reason).

### Payment Flow

Payments are processed exclusively through **Paystack inline popup**. There is no external page redirect as a primary flow.

1. Buyer clicks "Pay" on checkout.
2. Frontend calls `POST /api/payments/initialize` with cart total and order ID.
3. Backend validates, calls Paystack API, returns `{ accessCode, reference }`.
4. Frontend opens the Paystack popup using the access code.
5. Buyer enters card details inside the popup (no redirect).
6. Paystack sends a webhook to `POST /api/webhooks/paystack`.
7. Backend verifies the webhook signature (HMAC-SHA512), checks idempotency, then calls `processPaystackChargeSuccess()`.
8. Orders transition to `processing`, seller earnings are credited, buyer gets a confirmation email.
9. If the Paystack SDK fails to load, the frontend falls back to redirecting to `authorization_url` (emergency fallback only).

**Idempotency:** Every webhook call is checked against the `idempotencyKeys` table. Duplicate webhooks return 200 immediately without reprocessing.

**Premium seller upgrade:** Sellers can upgrade to premium via `POST /api/seller/upgrade/initialize`. On payment, the webhook sets `isPremiumSeller: true`, bypassing the `freeTierProductLimit`.

### Delivery Modes

Controlled by `isExternalRiderSystemEnabled` in platform settings.

#### Internal Rider Mode (`false` — default)

- The platform operates its own fleet of riders registered as `role: rider`.
- After payment, `startRiderMatchingForPaidOrders` runs and broadcasts an assignment request.
- Riders accept and the order tracks through the full rider flow.
- The Rider Dashboard, rider applications, manual rider assignment, rider payouts, and delivery zone pages are all active.

#### External Delivery Mode (`true`)

- No internal riders are used. Rider-specific pages and routes are hidden from all dashboards.
- After the seller marks an order ready, admin uses `POST /api/admin/orders/:id/arrange-external-delivery` to move it to `external_dispatch_arranged`.
- Super admin uses `POST /api/admin/orders/:id/mark-external-delivered` to complete it.
- Buyers and sellers see contextual notifications explaining the external courier (e.g. VIP Bus or third-party).

### Permission System

Access control has three layers:

**1. Route guards (frontend):** `App.tsx` wraps admin/seller/rider routes in guards that check the current user's role. Some routes are additionally gated by platform mode (e.g. rider routes hidden in external delivery mode).

**2. API middleware (backend):**
- `requireAuth` — validates JWT, attaches `req.user`.
- `requireRole(...roles)` — rejects if user's role is not in the allowed list.
- `requirePermission(feature)` — checks `req.user.roleFeatures[feature] !== false`.
- `requireRoleFeature(feature)` — same as above, used for finer-grained gating.

**3. Role-feature map (DB-driven):** The super admin can toggle individual capabilities per user through `/admin/permissions`. These are stored in the `roleFeatures` JSONB column on the `users` table. `super_admin` bypasses all feature gates.

**Protected settings fields:** Only `super_admin` can write `freeTierProductLimit`, `maxProductsPerSeller`, `orderAutoCancelHours`, and `inviteOnlyRegistration` via the settings API. Non-super-admin writes to these fields are silently stripped.

---

## Database Overview

43 tables managed by Drizzle ORM. Schema source of truth: `shared/schema.ts`.

| Table | Purpose |
|---|---|
| `users` | All accounts. Fields: role, isApproved, isActive, applicationStatus, vehicleInfo, roleFeatures (JSONB), isPremiumSeller |
| `stores` | One per seller in multi-vendor mode. Logo, description, payout details |
| `products` | Catalog. Images array, video, stock, category, dynamic fields, ratings |
| `product_variants` | Color/size variants with per-variant stock, images, price override |
| `categories` | Product categories with custom fields (e.g. "Size" for clothing) |
| `orders` | Order records: status, paymentStatus, deliveryMethod, total, fee breakdown |
| `order_items` | Line items (product, variant, quantity, unit price) |
| `order_status_history` | Audit log of every status transition with actor and reason |
| `deliveryZones` | Delivery areas with fees and pickup station flag |
| `deliveryTracking` | GPS coordinates logged during active delivery |
| `deliveryAssignments` | Rider-to-order assignment records |
| `coupons` | Seller discount codes |
| `cart` | Buyer shopping cart (persisted in DB) |
| `wishlist` | Buyer saved products |
| `reviews` | Product reviews with rating, text, images, seller response |
| `riderReviews` | Buyer ratings of rider delivery quality |
| `chatMessages` | Direct messages between users, with media attachments. Supports soft-delete (`is_deleted`, `deleted_at`) and edit (`is_edited`, `edited_at`) |
| `supportConversations` | Buyer–agent support threads |
| `supportMessages` | Messages within support threads |
| `transactions` | Paystack payment records (reference, amount, status) |
| `notifications` | In-app notifications for all roles |
| `platformSettings` | Single-row config table (see Platform Settings section) |
| `adminPermissions` | Role-level permission presets |
| `adminWalletTransactions` | Admin commission ledger entries |
| `commissions` | Commission record per fulfilled order |
| `sellerPayouts` | Seller settlement records (created on payment, processed by worker) |
| `riderPayouts` | Rider earning settlement records |
| `platformEarnings` | Daily aggregated platform revenue |
| `promotionalAds` | Time-limited promoted stores/products. `banner_config` JSONB stores the visual Banner Designer output (`BannerConfig`) |
| `promotionPricing` | Pricing tiers for promo applications |
| `promotionApplications` | Seller applications to run promotions |
| `heroBanners` | Hero section images with CTA |
| `bannerCollections` | Groups of banners for carousels |
| `marketplaceBanners` | Marketplace-wide promotional banners |
| `footerPages` | CMS pages (Terms, Privacy, etc.) |
| `mediaLibrary` | Global uploaded media assets |
| `passwordResetTokens` | One-time reset links with expiry |
| `reportActivityLogs` | Audit of who generated which reports |
| `systemActivityLogs` | Platform events with severity, fingerprinting, resolution |
| `receipts` | E-receipt records linked to orders |
| `idempotencyKeys` | Deduplication for payment webhooks |
| `referrals` | Referral links between referrer and referred user |
| `referralRewards` | Reward records (discount, free tier, etc.) per completed referral |
| `group_chat_messages` | Group channel messages (staff/sellers/riders) with sender, type, optional file URL |

---

## API Routes Overview

All routes are defined in `server/routes.ts`. Base prefix: `/api`.

### Authentication
```
POST /api/auth/register        Create account
POST /api/auth/login           Authenticate, returns JWT cookie
POST /api/auth/logout          Clears session
GET  /api/auth/me              Current user profile
PATCH /api/auth/me             Update profile
POST /api/auth/forgot-password Send reset email
POST /api/auth/reset-password  Apply new password with token
POST /api/auth/change-password Change password (authenticated)
```

### Products
```
GET    /api/products                    List (filters: search, category, seller, sort)
GET    /api/products/:id                Product detail with variants
POST   /api/products                    Create (seller/admin)
PATCH  /api/products/:id               Update
DELETE /api/products/:id               Delete
POST   /api/products/:id/images        Upload images to Cloudinary
POST   /api/products/:id/variants      Add variant
PATCH  /api/products/:id/variants/:vid Update variant
DELETE /api/products/:id/variants/:vid Delete variant
```

### Orders
```
GET    /api/orders                               List (filtered by role/context)
GET    /api/orders/:id                           Order detail
POST   /api/orders                               Create order
PATCH  /api/orders/:id/status                    Transition status
POST   /api/orders/:id/cancel                    Cancel (buyer/admin)
DELETE /api/orders/:id                           Remove pending/unpaid order (buyer only)
POST   /api/orders/:id/verify-customer-pickup    Verify pickup (QR/OTP)
POST   /api/admin/orders/:id/arrange-external-delivery   Move to external_dispatch_arranged
POST   /api/admin/orders/:id/mark-external-delivered     Complete external delivery
```

### Payments
```
POST /api/payments/initialize             Initialize Paystack transaction
POST /api/webhooks/paystack               Paystack webhook (HMAC verified, idempotent)
POST /api/seller/upgrade/initialize       Initialize premium seller upgrade payment
POST /api/seller/upgrade/verify           Verify upgrade payment reference & return tier-info immediately
```

### Users & Applications
```
GET   /api/users                          List users (admin)
GET   /api/users/:id                      User detail
PATCH /api/users/:id                      Update user (admin)
PATCH /api/users/:id/interview            Schedule interview (admin → applicant)
PATCH /api/users/:id/approve             Approve seller/rider application
PATCH /api/users/:id/reject              Reject application with reason
PATCH /api/users/:id/deactivate          Deactivate account
```

### Admin
```
GET  /api/admin/dashboard           Dashboard metrics (orders, revenue, users)
GET  /api/admin/analytics           Detailed analytics
GET  /api/admin/pending-orders      Orders needing rider assignment
GET  /api/admin/system-activities   System event log
GET  /api/admin/system-activities/summary  Issues count (used by sidebar badge)
```

### Platform Settings
```
GET   /api/settings                 Get all platform settings
PATCH /api/settings                 Update settings (admin/super_admin)
```

### Notifications
```
GET  /api/notifications                  List user's notifications
GET  /api/notifications/unread-count     Count for sidebar badge
PATCH /api/notifications/:id/read       Mark read
PATCH /api/notifications/read-all       Mark all read
POST /api/admin/notifications/broadcast  Send to all users (admin)
```

### Delivery & Zones
```
GET    /api/zones                         List delivery zones
POST   /api/zones                         Create zone (admin)
PATCH  /api/zones/:id                     Update zone
DELETE /api/zones/:id                     Delete zone
GET    /api/rider/location/:orderId       Get rider's current GPS position
POST   /api/rider/location               Submit rider GPS update
```

### Chat & Support
```
GET    /api/messages/:userId              Conversation with a user
POST   /api/messages                      Send message
DELETE /api/messages/:messageId           Soft-delete a message (sender only)
PATCH  /api/messages/:messageId/edit      Edit message text (sender only)
GET    /api/support/conversations         Support threads (agent/admin)
POST   /api/support/conversations         Create support ticket
POST   /api/support/messages              Reply in support thread
GET    /api/group-chat/:group/messages    Get recent group chat messages (limit, before)
POST   /api/group-chat/:group/messages    Post message to group channel
```

Group `staff` — accessible to: super_admin, admin, agent, pickup_agent  
Group `sellers` — accessible to: super_admin, seller  
Group `riders` — accessible to: super_admin, rider

### Seller-Specific
```
GET    /api/seller/earnings                              Earnings history
GET    /api/seller/payouts                               Payout records
GET    /api/seller/analytics                             Sales analytics
POST   /api/seller/payout-setup                          Configure bank/mobile money
GET    /api/coupons                                      List seller's coupons
POST   /api/coupons                                      Create coupon
POST   /api/seller/promotions/:appId/verify-payment      Re-verify promo payment reference
DELETE /api/seller/promotions/:appId                     Remove expired or rejected promo application
```

### Promotions & Banners (Admin)
```
PATCH  /api/admin/promotions/:id/banner-config    Update Banner Designer config for a promotion
```

### Media & Uploads
```
POST /api/upload/audio    Upload custom audio notification files (WAV, MP3, OGG; max AUDIO_UPLOAD_MAX_BYTES)
GET  /api/media-library   List uploaded media assets (images, videos) for the current user
```

### Health & Monitoring
```
GET /api/health          Health check (DB ping, returns { ok: true })
GET /api/metrics         Prometheus metrics
```

---

## Frontend Routes

All routes are defined in `client/src/App.tsx`.

### Public (no auth required)
```
/                    Homepage (single-vendor: product grid; multi-vendor: marketplace)
/products            All products browse
/stores              Browse all stores (multi-vendor mode)
/sellers/:id         Individual seller storefront
/product/:id         Product detail
/category/:id        Category browse
/auth                Login / register
/reset-password      Password recovery
/become-seller       Seller application form
/become-rider        Rider application (hidden if external rider mode enabled)
/page/:slug          Dynamic CMS footer pages
/track/:id           Public order tracking (no login required)
/track               Track by order number
```

### Buyer
```
/cart                    Shopping cart
/checkout                Checkout flow
/payment/:orderId        Paystack payment initiation
/payment/verify          Paystack callback handler
/payment/success         Order confirmed page
/payment/failure         Payment failed page
/orders                  Order history
/orders/:id              Order detail and tracking
/orders/:id/receipt      Digital e-receipt
/wishlist                Saved products
/buyer                   Buyer dashboard
/buyer/orders            Orders list (alternative entry)
```

### Seller
```
/seller                  Dashboard with quick stats
/seller/products         Product management (CRUD)
/seller/categories       Category assignment
/seller/orders           Order list
/seller/orders/:id       Order detail
/seller/coupons          Coupon management
/seller/promotions       Promo campaigns (multi-vendor only)
/seller/deliveries       Delivery management (internal rider only)
/seller/media-library    Media uploads
/seller/notifications    Notifications
/seller/messages         Chat with buyers (if platform allows)
/seller/analytics        Sales reports and charts
/seller/payment-setup    Payout bank/mobile money setup
/seller/settings         Store profile and preferences
/seller/reviews          Ratings received
```

### Rider (all hidden when external rider mode is enabled)
```
/rider                   Delivery dashboard
/rider/deliveries        Active deliveries
/rider/route             Current route map
/rider/earnings          Commission history
/rider/notifications     Delivery alerts
/rider/messages          Chat with buyers
/rider/settings          Preferences
/become-rider            Application form
```

### Pickup Agent
```
/pickup-agent            Dashboard
/pickup-agent/verify     QR/OTP verification
/pickup-agent/earnings   Commissions
/pickup-agent/shift      Shift management
/pickup-agent/support    Support tickets
/pickup-agent/notifications  Alerts
/pickup-agent/settings   Settings
```

### Support Agent
```
/agent                   Agent dashboard
/agent/tickets           Support queue
/agent/customers         Customer directory
/agent/messages          Ticket chats
/agent/direct-messages   Direct messages
/agent/notifications     Alerts
/agent/settings          Settings
```

### Admin / Super Admin
```
/admin                         Main dashboard (KPIs, recent orders, maintenance mode)
/admin/settings                Platform config (all settings fields)
/admin/branding                Logo, colors, social links
/admin/users                   User directory
/admin/users/create            Create user
/admin/users/:id/edit          Edit user
/admin/users/:id               User detail
/admin/sellers                 Seller directory
/admin/sellers/:id             Seller detail
/admin/riders                  Rider directory (internal rider only)
/admin/riders/:id/edit         Edit rider profile (internal rider only)
/admin/riders/:id              Rider detail (internal rider only)
/admin/products                All products
/admin/products/create         Create product
/admin/products/:id/edit       Edit product
/admin/orders                  All orders with full controls
/admin/orders/:id/action       Order state transition page
/admin/agents                  Support agent management
/admin/applications            Seller/rider application queue
/admin/permissions             Per-user role-feature management (super_admin only)
/admin/categories              Category manager
/admin/zones                   Delivery zone manager (internal rider only)
/admin/delivery-zones          (alias for /admin/zones)
/admin/pickup-stations         Pickup point configuration
/admin/pickup-verify           Admin pickup verification (QR/OTP)
/admin/delivery-tracking       Live delivery map (internal rider only)
/admin/manual-rider-assignment Assign orders to riders manually (internal rider only)
/admin/sellers-payouts         Seller settlement management
/admin/riders-payouts          Rider payout management (internal rider only)
/admin/platform-earnings       Commission and fee tracking
/admin/analytics               Full analytics dashboard
/admin/promotions              Promotional ad management
/admin/banners                 Carousel banner management
/admin/hero-banners            Hero section banners
/admin/footer-pages            CMS footer pages
/admin/media-library           Global media asset library
/admin/notifications           Bulk notification sender
/admin/messages                Message conversations
/admin/live-support            Support thread overview
/admin/system-activities       System event audit log
```

### Group Chat (role-gated)
```
/staff-chat            Staff group channel (super_admin, admin, agent, pickup_agent)
/seller-chat           Seller group channel (super_admin, seller)
/rider-chat            Rider group channel (super_admin, rider)
```

### Shared (all authenticated roles)
```
/profile               User profile
/settings              Account settings
/change-password       Password change
/notifications         Notification center
/chat                  Direct messaging
/support               Support ticket creation
/live-tracking         Open map tracker
/referral              Referral programme (buyer — shows only when referral feature enabled)
```

---

## Background Workers

Four workers are started at boot in `server/index.ts`. All use `setInterval` — there is no external queue or cron daemon.

### Payout Worker (`server/workers/payoutWorker.ts`)
- **Interval:** Every 15 seconds (configurable via `PAYOUT_WORKER_INTERVAL_MS`)
- **What it does:** Processes seller payouts with `status: pending`. Calls Paystack Transfers API to initiate bank or mobile money transfers. Updates payout records to `completed` or `failed`. Notifies seller via socket and DB notification. Supports split-settlement mode.

### Promotional Ad Worker (`server/workers/promotionalWorker.ts`)
- **Interval:** Every 60 seconds (configurable via `PROMO_WORKER_INTERVAL_MS`)
- **What it does:** Scans `promotionalAds` for records where `endAt < now()`. Marks expired ads as inactive. Notifies admin. Gracefully skips if the promotions table does not yet exist (handles migration lag on first deploy).

### Order Auto-Cancel Worker (`server/workers/orderAutoCancelWorker.ts`)
- **Interval:** Every 5 minutes
- **What it does:** Cancels orders that are `pending` with `paymentStatus: pending` and were created more than `orderAutoCancelHours` hours ago. Set `orderAutoCancelHours` to `0` in platform settings to disable. Default is disabled.

### Notification Reminder Worker (`server/workers/notificationReminderWorker.ts`)
- **Interval:** Every 30 minutes
- **What it does:**
  - Sends a **5-hour payment reminder** to buyers for unpaid orders that are 5–24 hours old. Deduplicates via `reminderKey` in notification metadata so the reminder is sent exactly once.
  - Sends **interview schedule reminders** to applicants with `applicationStatus: interview_scheduled`: a day-before reminder (20–28h window) and an hour-before reminder (45–75min window).
  - Both types also send optional email notifications via `sendEmail()`.

---

## Email System

Configured in `server/email.ts`. Uses Nodemailer with SMTP.

SMTP credentials are resolved in this order:
1. Platform settings from the database (`platformSettings.smtpHost`, etc.)
2. Environment variables (`SMTP_HOST`, `SMTP_PORT`, etc.)

Transactional emails sent by the platform:

| Trigger | Recipient | Content |
|---|---|---|
| Payment confirmed | Buyer | Order summary with items, total, "Track Your Orders" link |
| Payment confirmed | Each seller | "New Paid Order" notification with order detail |
| Seller/rider application interview scheduled | Applicant | Interview date and time |
| Seller/rider application approved | Applicant | Approval notice with link to dashboard |
| Seller/rider application rejected | Applicant | Rejection notice with optional reason |
| Unpaid order (5 hours old) | Buyer | Payment reminder with order number |
| Interview approaching (day before / hour before) | Applicant | Reminder notice |
| Password reset | User | Reset link (expires in 1 hour) |
| Seller payout completed | Seller | Settlement confirmation with amount and destination |

---

## Real-time Events (Socket.IO)

Socket.IO runs on the same Express server. Clients authenticate via JWT on connection. Each user is joined to a personal room (`io.to(userId).emit(...)`) for targeted events. Users are also auto-joined to group chat rooms based on their role (`group_chat_staff`, `group_chat_sellers`, `group_chat_riders`).

### Key events emitted to clients

| Event | Emitted to | Description |
|---|---|---|
| `notification` | User | New in-app notification (all types) |
| `order_status_updated` | Buyer + Seller | Order status changed |
| `order_rider_assignment_failed` | Admins | No rider found for order |
| `rider_location_update` | Buyer (on active order) | Rider GPS coordinates |
| `new_message` | Recipient | Chat message received |
| `message_read` | Sender | Their message was read |
| `typing` | Conversation partner | Typing indicator |
| `support_message` | Agent + Buyer | New support thread message |
| `support_conversation_updated` | Agent | Support ticket updated in real time |
| `group_chat_message` | Group room members | New group chat message |
| `maintenance_status` | All connected | Maintenance mode toggled |
| `seller-approved:{userId}` | Admin | Seller/rider application approved |

### Presence

`presenceService.ts` tracks online/away/offline status using heartbeats. Clients ping the server every 5–10 seconds. Missing a heartbeat for longer than the timeout period marks the user offline. Typing indicators are also handled here.

---

## Platform Settings

All settings live in a single row in the `platformSettings` table. Configurable by admin/super_admin through `/admin/settings`. The following fields exist:

### Branding
`platformName`, `logo`, `primaryColor`, `secondaryColor`, `accentColor`, `lightBgColor`, `lightTextColor`, `darkBgColor`, `darkTextColor`, `lightCardColor`, `darkCardColor`

### Store & Mode
`isMultiVendor`, `primaryStoreId`, `shopDisplayMode` (`by-store` | `by-category`), `categoryDisplayStyle`, `showShopBySection`, `showHomepageFeaturedSection`, `showHomepageNewArrivalSection`

### Access Control
`allowSellerRegistration`, `allowRiderRegistration`, `inviteOnlyRegistration` *(super_admin only)*

### Product Limits *(super_admin only fields)*
`freeTierProductLimit` (default 20), `maxProductsPerSeller` (0 = unlimited), `maxProductsPerDay`

### Order Settings *(super_admin only)*
`orderAutoCancelHours` (0 = disabled)

### Payments & Fees
`paystackPublicKey`, `paystackSecretKey`, `defaultCommissionRate` (1%), `processingFeePercent` (1.95%), `allowSellerBankPayouts`

### Delivery
`isExternalRiderSystemEnabled`, `showCheckoutDeliveryMap`

### Advertising & Banners
`adsEnabled`, `heroBannerEnabled`, `sidebarAdEnabled`, `footerAdEnabled`, `productPageAdEnabled`, `activeBannerCollectionId`, `heroBannerAdImage`, `heroBannerAdUrl`, `sidebarAdImage`, `sidebarAdUrl`, `footerAdImage`, `footerAdUrl`, `productPageAdImage`, `productPageAdUrl`

### Maps
`mapboxPublicToken`, `mapboxStyleUrl`, `mapboxGlVersion`

### Messaging
`allowSellerDirectSupportMessages` (if true: sellers use messages tab; if false: sellers use support tab), `allowPickupAgentAdminChat`

### SMTP / Email
`smtpHost`, `smtpPort`, `smtpUser`, `smtpPass`, `smtpSecure`, `smtpFromEmail`, `smtpFromName`

### Analytics & Monitoring
`googleAnalyticsId`, `microsoftClarityId`, `sentryDsn`, `renderDeployHookUrl`

### GA4 Data API Credentials (server-side reporting dashboard)
`ga4PropertyId`, `googleCredentialsJson`

### Sentry REST API Credentials (Sentry Issues dashboard)
`sentryAuthToken`, `sentryOrg`, `sentryProject`

### Contact & Social
`contactPhone`, `contactEmail`, `contactAddress`, `facebookUrl`, `instagramUrl`, `twitterUrl`, `linkedinUrl`, `youtubeUrl`, `tiktokUrl`, `pinterestUrl`, `whatsappPage` (each with a `showX` toggle), `footerDescription`, `footerLinks`, `footerPaymentIcons`

### Media
`maxUploadSizeMb` (10), `allowedUploadTypes` (`jpg,jpeg,png,webp,gif,avif`)

### Cloudinary
`cloudinaryCloudName`, `cloudinaryApiKey`, `cloudinaryApiSecret`

### Sound & Ringtones *(super_admin only — Settings → Sounds tab)*
`callerRingtone`, `receiverRingtone`, `notificationSound`

Controls platform-wide audio for WebRTC calls and notifications. Each field accepts one of five preset IDs (`default`, `whatsapp`, `classic`, `gentle`, `professional`). Admins can preview every preset before saving using the built-in Web Audio API player (no file uploads needed — tones are generated programmatically). Changes take effect on the next call or notification.

- **callerRingtone** — ringback tone the caller hears while waiting for the other party to answer
- **receiverRingtone** — ringtone the receiver hears when an incoming call arrives
- **notificationSound** — sound played for in-app notifications, messages, and alerts

### Referral System *(super_admin configurable)*
`referralEnabled`, `referralEnabledSingleStore`, `referralEnabledMultiVendor`, `referralRewardPercent` (default 10%), `referralCustomerThreshold`, `referralSellerThreshold`, `referralSellerPromoHours`

Visibility rules: in multi-vendor mode all user roles see the referral section; in single-store mode all roles see it **except sellers** (sellers cannot buy their own products, so referral is irrelevant for them in single-store).

### Seller Promotions
Sellers can submit promotion applications after payment. The application includes a `displaySection` field (`banner` | `homepage`) indicating where they want the promotion placed. Super admins can view and edit the placement, duration, and seller note before approving the promotion.

---

## Deployment

This guide walks you from zero to a fully running production platform — from creating the required accounts through to configuring everything via the Admin Settings UI after your first deploy. Follow the phases in order.

> **Tip:** The same guide is also available inside the platform at **Admin → Settings → Deploy Guide** once you are logged in as super admin.

---

### Phase 0 — Create Your Accounts First

Before doing anything else, create free accounts on each of these services. You will need credentials from all of them before the backend can go live.

| Service | Purpose | URL | Free Tier |
|---|---|---|---|
| **GitHub** | Code repository | github.com | Yes |
| **Neon** | PostgreSQL database | neon.tech | Yes (0.5 GB, auto-pauses) |
| **Render** | Backend API hosting | render.com | Yes (sleeps after 15 min inactivity) |
| **Netlify** | Frontend hosting | netlify.com | Yes (100 GB bandwidth/mo) |
| **Paystack** | Payments (GHS) | paystack.com | Yes (test mode, no verification needed) |
| **Cloudinary** | Image & video hosting | cloudinary.com | Yes (25 GB storage/bandwidth) |
| **SMTP provider** | Transactional email | See options below | Varies |

#### Choosing an SMTP Provider

| Provider | Free Emails/Mo | Signup |
|---|---|---|
| **Brevo** (recommended for beginners) | 9,000 | brevo.com |
| **Mailersend** | 3,000 | mailersend.com |
| **Gmail + App Password** | Unlimited (low sending limits) | Requires 2FA on Google account |
| **Postmark** | 100 (trial) | postmarkapp.com — best deliverability |

---

### Phase 1 — Local Development Setup

#### 1.1 Clone the Repository

```bash
git clone https://github.com/YOUR_ORG/Kiyumart-Per.git
cd Kiyumart-Per
```

#### 1.2 Install Node.js 18+

Download and install **Node.js LTS** from [nodejs.org](https://nodejs.org). Verify:

```bash
node --version   # v18.x.x or higher
npm --version
```

#### 1.3 Create Your Environment File

```bash
cp .env.example .env
```

Open `.env` and fill in the minimum required values (see Phase 2–5 for where each credential comes from):

```env
# ── Required ────────────────────────────────────────
DATABASE_URL=postgresql://...          # from Neon
JWT_SECRET=<64-char random hex>
SESSION_SECRET=<64-char random hex>
PAYSTACK_SECRET_KEY=sk_test_...
PAYSTACK_PUBLIC_KEY=pk_test_...
FRONTEND_URL=http://localhost:5173     # local dev only

# ── Recommended for first boot ──────────────────────
SUPER_ADMIN_EMAIL=admin@yourdomain.com
SUPER_ADMIN_PASSWORD=StrongPassword123!
NODE_ENV=development
```

Generate a secure secret:
```bash
node -e "console.log(require('crypto').randomBytes(32).toString('hex'))"
```

#### 1.4 Install Dependencies

```bash
npm install
```

#### 1.5 Start the Development Server

```bash
npm run dev
```

This starts both the Express backend (`:5000`) and the Vite frontend (`:5173`) simultaneously.  
Open `http://localhost:5173`. On first boot the server automatically:
- Creates all 42 database tables via self-heal migrations
- Creates the super admin account if `SUPER_ADMIN_EMAIL`/`SUPER_ADMIN_PASSWORD` are set

Log in at `/auth` with your super admin credentials.

---

### Phase 2 — Neon Database Setup

#### 2.1 Create a Project

1. Log into [console.neon.tech](https://console.neon.tech)
2. Click **Create a project** → name it `kiyumart-production`
3. Select region closest to your backend host (e.g. **Europe — Frankfurt** for Render EU)
4. Click **Create project**

#### 2.2 Get the Connection String

1. In your project → **Connection Details**
2. Select **Pooled connection** (required — do not use the direct URL)
3. Copy the string:
   ```
   postgresql://username:password@ep-xxxx.eu-central-1.aws.neon.tech/neondb?sslmode=require
   ```

#### 2.3 Add to `.env`

```env
DATABASE_URL=postgresql://...your_pooled_neon_url...
```

> The database schema is created automatically on first server boot. No manual `drizzle-kit push` is required for a fresh deploy.

---

### Phase 3 — Cloudinary Setup

Without Cloudinary, product images are saved to local disk and lost on every Render redeploy.

#### 3.1 Create an Account

1. Go to [cloudinary.com](https://cloudinary.com) → **Sign Up Free**
2. Complete registration and verify your email

#### 3.2 Copy Your API Credentials

In the Cloudinary dashboard → **Settings → Access Keys**:

| What you need | Where to find it |
|---|---|
| Cloud name | Top of the dashboard (e.g. `dxyz123abc`) |
| API Key | Settings → Access Keys |
| API Secret | Settings → Access Keys (click reveal) |

#### 3.3 Add to `.env`

```env
CLOUDINARY_CLOUD_NAME=your_cloud_name
CLOUDINARY_API_KEY=123456789012345
CLOUDINARY_API_SECRET=AbCdEfGhIjKlMnOpQrStUvWxYz
```

> In production these can also be entered in **Admin Settings → Storage** after first login — no redeploy needed.

---

### Phase 4 — Paystack Setup

#### 4.1 Create an Account

1. Go to [paystack.com](https://paystack.com) → **Create a free account**
2. Verify your email address

#### 4.2 Get Test API Keys

1. Paystack dashboard → **Settings → API Keys & Webhooks**
2. Copy under **Test Keys**:
   - Secret key (starts `sk_test_...`)
   - Public key (starts `pk_test_...`)

#### 4.3 Add to `.env`

```env
PAYSTACK_SECRET_KEY=sk_test_your_key
PAYSTACK_PUBLIC_KEY=pk_test_your_key
```

#### 4.4 Configure the Webhook (After Backend Deploys)

Once your Render URL is known (Phase 6), go to Paystack → **Settings → API Keys & Webhooks** → Webhook URL:

```
https://your-render-app.onrender.com/api/webhooks/paystack
```

> **Live payments:** Complete Paystack's business verification to get live keys (`sk_live_...` / `pk_live_...`). Replace test keys in Render env vars and Admin Settings → Payments when ready to accept real GHS.

---

### Phase 5 — SMTP Email Setup

Email is used for order confirmations, application approvals, password resets, and payment reminders.

#### Option A — Brevo (Recommended)

1. Go to [brevo.com](https://www.brevo.com) → Sign Up Free
2. Go to **SMTP & API → SMTP** → copy your credentials:

```env
SMTP_HOST=smtp-relay.brevo.com
SMTP_PORT=587
SMTP_USER=your_brevo_login_email
SMTP_PASS=your_brevo_smtp_key
SMTP_SECURE=false
SMTP_FROM_EMAIL=noreply@yourdomain.com
SMTP_FROM_NAME=KiyuMart
```

#### Option B — Gmail (Quick Testing)

1. Google Account → **Security → App Passwords** (requires 2FA enabled)
2. Generate an App Password for Mail

```env
SMTP_HOST=smtp.gmail.com
SMTP_PORT=587
SMTP_USER=youremail@gmail.com
SMTP_PASS=your_16_char_app_password
SMTP_SECURE=false
SMTP_FROM_EMAIL=youremail@gmail.com
SMTP_FROM_NAME=KiyuMart
```

> SMTP can also be configured in **Admin Settings → Contact** after first login — stored encrypted in the database, no redeploy needed.

---

### Phase 6 — Backend Deployment (Render)

#### 6.1 Push Code to GitHub

```bash
git add .
git commit -m "Initial production deployment"
git push origin main
```

#### 6.2 Create a Web Service

1. [render.com](https://render.com) → **New → Web Service**
2. **Connect a repository** → authorize GitHub → select **Kiyumart-Per**

#### 6.3 Configure the Service

| Field | Value |
|---|---|
| Name | `kiyumart-api` |
| Region | Frankfurt (EU) |
| Runtime | Node |
| Branch | `main` |
| Build Command | `npm install && npm run build` |
| Start Command | `npm run start` |
| Plan | Free (for testing) or **Starter** (for production — no cold starts) |
| Health Check Path | `/api/health` |

#### 6.4 Set All Environment Variables

In Render → your service → **Environment**, add:

```
NODE_ENV                  = production
DATABASE_URL              = postgresql://...  (Neon pooled URL)
JWT_SECRET                = <64-char hex>
SESSION_SECRET            = <64-char hex>
PAYSTACK_SECRET_KEY       = sk_test_...
PAYSTACK_PUBLIC_KEY       = pk_test_...
FRONTEND_URL              = https://your-app.netlify.app   ← fill in AFTER Netlify deploys
CLOUDINARY_CLOUD_NAME     = your_cloud_name
CLOUDINARY_API_KEY        = your_api_key
CLOUDINARY_API_SECRET     = your_api_secret
SMTP_HOST                 = smtp-relay.brevo.com
SMTP_PORT                 = 587
SMTP_USER                 = your_smtp_user
SMTP_PASS                 = your_smtp_pass
SMTP_SECURE               = false
SMTP_FROM_EMAIL           = noreply@yourdomain.com
SMTP_FROM_NAME            = KiyuMart
SUPER_ADMIN_EMAIL         = admin@yourdomain.com
SUPER_ADMIN_PASSWORD      = StrongPassword123!
SETTINGS_ENCRYPTION_KEY   = <32-byte hex>    ← generate: node -e "console.log(require('crypto').randomBytes(32).toString('hex'))"
KIYUMART_USE_EMBEDDED_VITE = false
```

#### 6.5 Deploy

Click **Create Web Service**. The first deploy takes 3–5 minutes. Watch the logs — success looks like:

```
Server running on port 5000
Database connected
Self-heal migrations complete
```

Your backend URL will be: `https://kiyumart-api.onrender.com`

#### 6.6 Register the Paystack Webhook

1. Paystack dashboard → **Settings → API Keys & Webhooks**
2. Webhook URL:
   ```
   https://kiyumart-api.onrender.com/api/webhooks/paystack
   ```
3. Click **Update**

---

### Phase 7 — Frontend Deployment (Netlify)

#### 7.1 Verify the SPA Redirect Rule

The file `client/public/_redirects` must contain:
```
/*    /index.html   200
```
This is already included in the repo. Verify it is present before deploying.

#### 7.2 Create a Site on Netlify

1. [netlify.com](https://netlify.com) → **Add new site → Import an existing project**
2. Click **GitHub** → authorize Netlify → select **Kiyumart-Per**

#### 7.3 Configure Build Settings

| Field | Value |
|---|---|
| Base directory | *(leave blank)* |
| Build command | `npm run build:frontend` |
| Publish directory | `dist/public` |

#### 7.4 Set the API URL

Netlify → your site → **Site configuration → Environment variables**:

```
VITE_API_URL = https://kiyumart-api.onrender.com
```

Replace with your actual Render URL. This tells the frontend where to make API calls.

#### 7.5 Deploy

Click **Deploy site**. Build takes 1–3 minutes. On success you get a URL like:
```
https://kiyumart-abc123.netlify.app
```

**Custom domain (optional):** Netlify → **Domain management → Add custom domain** → follow DNS instructions.

#### 7.6 Update FRONTEND_URL on Render

Critical — without this, Paystack payment redirects will break:

1. Render → your service → **Environment**
2. Set `FRONTEND_URL` = `https://kiyumart-abc123.netlify.app` (no trailing slash)
3. Render will automatically redeploy

---

### Phase 8 — Post-Deploy Admin Configuration

Everything below is done in the Admin Settings UI — no code changes or redeployment required.

Open your Netlify URL → `/auth` → log in with `SUPER_ADMIN_EMAIL` / `SUPER_ADMIN_PASSWORD`.

#### 8.1 Settings → General
- Set Platform Name and choose Single-Vendor or Multi-Vendor mode
- Configure Store Display Mode and homepage sections

#### 8.2 Settings → Payments
- Enter Paystack Public Key and Secret Key (stored encrypted in DB)
- Set Default Commission Rate and Processing Fee

#### 8.3 Settings → Storage
- Enter Cloudinary Cloud Name, API Key, and API Secret
- Set Max Upload Size and allowed file types

#### 8.4 Settings → Contact
- Fill in Contact Phone, Email, and Address
- Configure SMTP if not set via environment variables
- Add social media URLs

#### 8.5 Settings → Advanced Features
- Choose delivery mode (Internal Riders vs External Delivery)
- Set Order Auto-Cancel window
- Configure seller Free Tier Product Limit and upgrade plan pricing
- Enable/disable Referral System

#### 8.6 Settings → Security Keys
- Verify Paystack and Cloudinary credentials show as configured
- Enable Invite-Only Registration if you want controlled onboarding

---

### Phase 9 — Going Live Checklist

Work through this before announcing the platform publicly.

#### Infrastructure
- [ ] `NODE_ENV=production` is set on Render
- [ ] `FRONTEND_URL` matches exact Netlify URL (no trailing slash)
- [ ] `JWT_SECRET` is a 64-character random hex string
- [ ] `SETTINGS_ENCRYPTION_KEY` is set (encrypts DB-stored credentials)
- [ ] Render plan is **Starter or higher** if you need no cold starts (Free plan sleeps after 15 min inactivity — first request takes 30–60 s)

#### Payments
- [ ] Paystack webhook URL is set: `https://your-backend.onrender.com/api/webhooks/paystack`
- [ ] A test checkout completes end-to-end (order → payment popup → order confirmed)
- [ ] Live Paystack keys in place before accepting real GHS payments
- [ ] Paystack business verification complete (required for live mode)

#### Email
- [ ] A test order confirmation email is received
- [ ] Password reset email arrives and the link works
- [ ] `SMTP_FROM_EMAIL` is a domain you control (improves deliverability and avoids spam folder)

#### Media
- [ ] A test product image upload shows a Cloudinary URL in the product record
- [ ] Local disk fallback is not in use (verify in Cloudinary dashboard)

#### Frontend
- [ ] All routes work on page refresh (no 404 — the `_redirects` file is deployed)
- [ ] PWA installs correctly on mobile (Chrome → install prompt appears)
- [ ] `VITE_API_URL` points to your production Render URL

#### Security
- [ ] `.env` is in `.gitignore` and was never committed to git
- [ ] No test credentials remain in production environment variables
- [ ] Admin password is strong and not the default from setup
- [ ] `SUPER_ADMIN_PASSWORD` env var can be removed after first boot (account already exists)

#### SEO
- [ ] `robots.txt` is deployed (blocks `/admin`, `/seller`, `/rider`, `/api` from crawlers)
- [ ] `sitemap.xml` is deployed and lists your public product and category pages
- [ ] Platform name and contact details are filled in Settings

---

### Alternative Hosting Platforms

The stack is not tied to Render or Netlify. Any platform that runs Node.js works for the backend; any static CDN works for the frontend.

#### Backend Alternatives

| Platform | Notes |
|---|---|
| **Railway** | No cold starts on Hobby plan ($5/mo), simpler DX |
| **Fly.io** | Better global latency, requires more config |
| **DigitalOcean App Platform** | $5–12/mo managed |
| **VPS (any provider)** | Full control — use PM2 or systemd to manage the process |

Build: `npm install && npm run build` → Start: `npm run start` — same on any platform.

#### Frontend Alternatives

| Platform | Notes |
|---|---|
| **Vercel** | Fastest CDN globally, identical build/publish config |
| **Cloudflare Pages** | Unlimited bandwidth on free plan, very fast CDN |
| **GitHub Pages** | Free; limited to `.github.io` domain on free plan |

Build command: `npm run build:frontend` — Publish directory: `dist/public` — add `/*  /index.html  200` SPA redirect on any platform.

---

## Scripts Reference

```bash
npm run dev            # Start backend + Vite dev server together (development)
npm run build          # Production build: Vite frontend + esbuild backend bundle
npm run start          # Start production server (runs dist/server.mjs)
npm run typecheck      # TypeScript type check across all workspaces
npm run test:e2e       # Run Playwright end-to-end tests
npm run audit:platform # Generate platform audit report (docs/)
```

---

## Security

### What is in place

- **JWT authentication** — `httpOnly`, `secure` (production), `sameSite` cookies. 7-day expiry.
- **RBAC** — every API route guarded by `requireAuth`, `requireRole`, or `requireRoleFeature`.
- **Rate limiting** — auth routes: 5 attempts per 15 minutes. API routes: role-tiered limits (super_admin/admin: 1000/15min; buyer: 100/15min).
- **Helmet** — Content-Security-Policy, HSTS, X-Frame-Options, X-Content-Type-Options, Referrer-Policy.
- **CORS** — restricted to `FRONTEND_URL` origin in production.
- **Input validation** — Zod schemas on all API inputs; Drizzle ORM prevents SQL injection.
- **Paystack webhook HMAC** — every webhook verified with `PAYSTACK_SECRET_KEY` SHA-512 signature.
- **Idempotency** — webhook deduplication via `idempotencyKeys` table.
- **Sensitive field encryption** — Cloudinary and SMTP credentials in DB are AES-256-GCM encrypted when `SETTINGS_ENCRYPTION_KEY` is set.
- **Seed endpoint protection** — all `/api/seed/*` endpoints return 403 in production (`NODE_ENV=production`).
- **No security-sensitive logging** — user emails and payment details are not written to logs.

### What you must do before going live

- Rotate all credentials if `.env` was ever committed to git.
- Set `SETTINGS_ENCRYPTION_KEY` and verify DB credentials are stored encrypted.
- Confirm `NODE_ENV=production` is set on Render.
- Confirm Paystack webhook URL is set to the production backend URL.
- Never share or commit `.env` or any file containing live API keys.

---

## Known Constraints

- **GHS only** — the platform does not support multiple currencies at runtime. All prices, payouts, and fees are in Ghana Cedis.
- **English only** — localization infrastructure exists (a `localizationStrings` table and a `LanguageContext`) but is not fully implemented.
- **Single webhook endpoint** — the only valid Paystack webhook is `POST /api/webhooks/paystack`. Any legacy `/webhooks/paystack` path was removed.
- **No automatic DB migrations** — schema changes beyond the self-heal blocks require manual `drizzle-kit push` or SQL migration files.
- **Render free tier cold starts** — the backend on Render's free plan may sleep after inactivity. First requests after a cold start may take 30–60 seconds. The `/api/health` check on the frontend detects this and uses `queryClient.invalidateQueries()` (not a page reload) to refresh data once the backend is back.
- **`window.location.reload()` is banned** — all data refresh is done via `queryClient.invalidateQueries()` to preserve user state.
- **No external task queue** — background work uses `setInterval`. There is no Bull, BullMQ, or similar queue. If the server restarts, in-flight jobs are dropped (they will be retried on next interval).

---

*Last updated: 2026-04-26. Update this file whenever a feature is added, removed, or changed.*

<!-- PLATFORM_AUDIT:START -->

## Platform Living Audit README

Generated version: `v19`
Generated at: `2026-04-26T20:59:15.281Z`

### 1. Platform Overview
- Continuous internal audit for routes, dashboards, features, flows, services, and dependencies.
- Roles covered: super_admin, admin, agent, seller, rider, buyer.

### 2. System Architecture
- Frontend: React + Wouter dashboard/page routing.
- Backend: Express + service-layer APIs + RBAC middleware.
- Realtime: Socket.IO and live-tracking map telemetry.

### 3. Dashboards (Fully Detailed)
- Super Admin Dashboard: 46 routes, entry /admin, exits 7, APIs 99
- Admin Dashboard: 46 routes, entry /admin, exits 7, APIs 99
- Agent Dashboard: 6 routes, entry /agent, exits 1, APIs 6
- Seller Dashboard: 20 routes, entry /seller, exits 12, APIs 36
- Rider Dashboard: 7 routes, entry /rider, exits 5, APIs 15
- Customer / Buyer Dashboard: 3 routes, entry /buyer, exits 9, APIs 2

### 4. Features (By Module)
- Order Management: 228 files, dashboards Admin Dashboard, Agent Dashboard, Customer / Buyer Dashboard, Rider Dashboard, Seller Dashboard, Super Admin Dashboard, APIs 313
- Rider Delivery: 119 files, dashboards Admin Dashboard, Agent Dashboard, Customer / Buyer Dashboard, Rider Dashboard, Seller Dashboard, Super Admin Dashboard, APIs 309
- Agent-Assisted Handling: 92 files, dashboards Admin Dashboard, Agent Dashboard, Customer / Buyer Dashboard, Rider Dashboard, Seller Dashboard, Super Admin Dashboard, APIs 306
- BUS Delivery Logic: 48 files, dashboards Admin Dashboard, Customer / Buyer Dashboard, Rider Dashboard, Seller Dashboard, Super Admin Dashboard, APIs 305
- Pickup Logic: 58 files, dashboards Admin Dashboard, Customer / Buyer Dashboard, Rider Dashboard, Seller Dashboard, Super Admin Dashboard, APIs 303
- Zone & Region Logic: 49 files, dashboards Admin Dashboard, Agent Dashboard, Customer / Buyer Dashboard, Rider Dashboard, Seller Dashboard, Super Admin Dashboard, APIs 305
- Real-time Tracking & Maps: 101 files, dashboards Admin Dashboard, Agent Dashboard, Customer / Buyer Dashboard, Rider Dashboard, Seller Dashboard, Super Admin Dashboard, APIs 308
- Messaging & Calls: 179 files, dashboards Admin Dashboard, Agent Dashboard, Customer / Buyer Dashboard, Rider Dashboard, Seller Dashboard, Super Admin Dashboard, APIs 311
- Reporting, Analytics & Receipts: 44 files, dashboards Admin Dashboard, Agent Dashboard, Customer / Buyer Dashboard, Rider Dashboard, Seller Dashboard, Super Admin Dashboard, APIs 302
- Verification (QR / OTP): 45 files, dashboards Admin Dashboard, Customer / Buyer Dashboard, Rider Dashboard, Seller Dashboard, Super Admin Dashboard, APIs 298
- User Management & Roles: 83 files, dashboards Admin Dashboard, Agent Dashboard, Customer / Buyer Dashboard, Rider Dashboard, Seller Dashboard, Super Admin Dashboard, APIs 311

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
| `@sentry/node` | MIT | free_or_self_hosted | yes |
| `@sentry/react` | MIT | free_or_self_hosted | yes |
| `@sentry/vite-plugin` | MIT | free_or_self_hosted | yes |
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
| `nodemailer` | MIT-0 | free_or_self_hosted | yes |
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
| `vite-plugin-pwa` | MIT | free_or_self_hosted | yes |
| `workbox-window` | MIT | free_or_self_hosted | yes |
| `wouter` | Unlicense | free_or_self_hosted | yes |
| `ws` | MIT | free_or_self_hosted | yes |
| `zod` | MIT | free_or_self_hosted | yes |
| `zod-validation-error` | MIT | free_or_self_hosted | yes |

### 8. Configuration & Environment
- Run audit: `npm run audit:platform`
- Strict gate: `npm run audit:platform:check`

### 9. Security & Permissions
- RBAC and role feature gates are enforced via backend middleware and audited as part of dashboard coverage.

### 10. Audit, Logs & Monitoring
- JSON report: `docs/platform-audit-report.json`
- Audit log: `docs/platform-audit-log.jsonl`

### Health Findings
- [medium] ORPHAN_PAGES: 11 orphan pages (client/src/pages/AdminDashboard.tsx, client/src/pages/ChatPageConnected.tsx, client/src/pages/CheckoutConnected.tsx, client/src/pages/HomeConnected.tsx, client/src/pages/MaintenancePage.tsx, client/src/pages/MultiVendorHome.tsx, client/src/pages/ProductPageAd.tsx, client/src/pages/SellerCoupons.tsx, client/src/pages/SellerDashboardConnected.tsx, client/src/pages/SellerDeliveries.tsx)
- [medium] NON_FREE_OR_UNKNOWN_DEPENDENCIES: 1 non-free or unknown dependencies (cloudinary)

<!-- PLATFORM_AUDIT:END -->
