# KiyuMart Architecture Documentation

**Purpose:** Complete technical architecture overview for developers and AI models

**Last Updated:** January 23, 2026  
**Version:** 1.1.1 (Security Hardened)

---

## Table of Contents

1. [System Overview](#system-overview)
2. [Technology Stack](#technology-stack)
3. [Directory Structure](#directory-structure)
4. [Database Design](#database-design)
5. [API Architecture](#api-architecture)
6. [Frontend Architecture](#frontend-architecture)
7. [Authentication & Security](#authentication--security)
8. [Real-time Communication](#real-time-communication)
9. [File Storage](#file-storage)
10. [Payment Processing](#payment-processing)
11. [Deployment Architecture](#deployment-architecture)

---

## System Overview

### High-Level Architecture

```
┌─────────────────────────────────────────────────────────────────┐
│                          Frontend (React 18)                     │
│  - Browser-based SPA with Vite build tool                        │
│  - Real-time UI updates via Socket.IO                            │
│  - Multi-currency, multi-language support                        │
└────────────────────────────┬────────────────────────────────────┘
                             │ HTTP/WebSocket
┌────────────────────────────▼────────────────────────────────────┐
│                    Express.js Backend (Node.js)                  │
│  - RESTful API endpoints with JWT authentication                 │
│  - Socket.IO server for real-time events                         │
│  - Middleware stack (Helmet, CORS, rate-limiting)                │
│  - Business logic and data validation                            │
└────────────────────────────┬────────────────────────────────────┘
                             │ SQL
┌────────────────────────────▼────────────────────────────────────┐
│              PostgreSQL Database (Neon Serverless)               │
│  - Multi-tenant data model with organization isolation           │
│  - Normalized schema with proper indexes                         │
│  - Transaction support for financial operations                  │
└─────────────────────────────────────────────────────────────────┘

External Services:
- Paystack: Payment processing
- Cloudinary: Image/video storage
- OpenStreetMap (Leaflet): Map visualization
```

### Platform Modes

**Single-Store Mode:**
- Admin controls all products
- Single payment account
- Sellers exist but have limited access
- Ideal for startups and brand stores

**Multi-Vendor Mode:**
- Multiple sellers independently manage their stores
- Each seller has complete product control
- Buyers choose from multiple sellers
- Platform collects commission/fees
- Scalable marketplace model

Mode is controlled by `multi_vendor_mode` in platform settings (admin-only).

---

## Technology Stack

### Frontend Stack

```typescript
Framework & Build:
├── React 18.x
├── TypeScript (strict mode)
├── Vite (build tool + dev server)
└── Wouter (lightweight routing)

State Management:
├── TanStack Query v5 (server state + caching)
├── Zustand (client state)
└── Context API (theme, language, auth)

UI & Styling:
├── Shadcn UI (Radix UI + Tailwind)
├── Tailwind CSS
├── Lucide React (icons)
└── React Icons

Forms & Validation:
├── React Hook Form
└── Zod (schema validation)

Real-time & Communication:
├── Socket.IO Client
└── Native Fetch API

Maps & Visualization:
├── Leaflet.js
├── React QR Code
└── Chart.js (analytics)

Utilities:
├── date-fns (date handling)
├── clsx (class name merging)
└── nanoid (unique IDs)
```

### Backend Stack

```typescript
Runtime & Framework:
├── Node.js (LTS recommended)
├── Express.js (web framework)
└── TypeScript (tsx for runtime)

Database:
├── PostgreSQL (primary database)
├── Drizzle ORM (type-safe queries)
├── Migrations system
└── Connection pooling

Authentication & Security:
├── JWT (JSON Web Tokens)
├── Bcrypt (password hashing)
├── express-session (session management)
├── Helmet (security headers)
├── express-rate-limit (rate limiting)
└── CORS (cross-origin control)

Real-time Communication:
├── Socket.IO (WebSocket fallback)
├── Socket.IO namespaces
└── Event-based architecture

Validation & Middleware:
├── Zod (runtime validation)
├── zod-validation-error (error formatting)
└── Express middleware stack

File Upload:
├── Multer (file handling)
└── Cloudinary SDK (cloud storage)

External Integrations:
├── Paystack (payment gateway)
├── Cloudinary (image/video storage)
└── OpenStreetMap (map tiles)

Development & Testing:
├── Playwright (e2e testing)
└── TypeScript (type safety)
```

---

## Directory Structure

```
/workspaces/Kiyumart-Per/
├── client/                           # Frontend React application
│   ├── index.html                    # Entry HTML
│   ├── src/
│   │   ├── App.tsx                   # Root component
│   │   ├── main.tsx                  # Vite entry point
│   │   ├── components/               # Reusable UI components
│   │   │   ├── ProductCard.tsx
│   │   │   ├── OrderTracker.tsx
│   │   │   ├── CategorySelector.tsx
│   │   │   └── ...
│   │   ├── pages/                    # Page components (full screens)
│   │   │   ├── HomePage.tsx
│   │   │   ├── AdminDashboard.tsx
│   │   │   ├── SellerDashboard.tsx
│   │   │   ├── RiderDashboard.tsx
│   │   │   ├── CheckoutPage.tsx
│   │   │   └── ...
│   │   ├── hooks/                    # Custom React hooks
│   │   │   ├── useWebRTC.ts         # WebRTC calls
│   │   │   ├── useGroupCall.ts      # Group video calls
│   │   │   ├── useAuth.ts           # Authentication logic
│   │   │   └── ...
│   │   ├── lib/                      # Utility functions
│   │   │   ├── api.ts               # API client setup
│   │   │   ├── socket.ts            # Socket.IO setup
│   │   │   ├── validators.ts        # Zod schemas
│   │   │   └── ...
│   │   ├── styles/                   # Global styles
│   │   └── contexts/                 # React contexts
│   │       ├── AuthContext.tsx
│   │       ├── ThemeContext.tsx
│   │       └── LanguageContext.tsx
│   ├── public/                       # Static assets
│   └── vite.config.ts               # Vite configuration
│
├── server/                           # Backend Express application
│   ├── index.ts                     # Server entry point
│   ├── routes.ts                    # All API route definitions (~6000 lines)
│   ├── auth.ts                      # Authentication logic
│   ├── payments.ts                  # Paystack integration
│   ├── paystack.ts                  # Paystack SDK wrapper
│   ├── cloudinary.ts                # Cloudinary integration
│   ├── currency.ts                  # Currency conversion
│   ├── metrics.ts                   # Analytics calculations
│   ├── storage.ts                   # Database abstraction layer
│   ├── seed.ts                      # Seed data generation
│   ├── seedMediaLibrary.ts          # Product media generation
│   ├── vite.ts                      # Vite integration
│   ├── __tests__/                   # Unit & integration tests
│   ├── services/                    # Business logic services
│   ├── workers/                     # Background workers (payouts)
│   └── scripts/                     # Database utilities
│
├── db/                              # Database configuration
│   └── index.ts                     # Drizzle ORM setup
│
├── shared/                          # Shared code between frontend & backend
│   ├── schema.ts                    # Drizzle database schema
│   └── storeTypes.ts               # Shared TypeScript types
│
├── migrations/                      # SQL migrations
│   ├── 0001_chat_message_status.sql
│   ├── 0002_create_idempotency_keys.sql
│   ├── 0003_add_social_toggles.sql
│   └── ...
│
├── e2e/                            # End-to-end tests
│   └── admin-settings.spec.ts
│
├── scripts/                        # Utility scripts
│   ├── seed-admins.ts             # Create admin accounts
│   ├── seed-banners.ts            # Create banners
│   ├── check-migrations.ts        # Verify migrations
│   └── ...
│
├── docs/                           # Documentation
│   └── cryptocurrency-payment-integration.md
│
├── attached_assets/                # Marketing & guide materials
├── archive/                        # Old files & documentation
│
├── Configuration Files:
├── package.json                    # Dependencies & scripts
├── tsconfig.json                   # TypeScript configuration
├── vite.config.ts                 # Vite build configuration
├── drizzle.config.ts              # Drizzle ORM configuration
├── tailwind.config.ts             # Tailwind CSS configuration
├── postcss.config.js              # PostCSS plugins
├── playwright.config.ts           # E2E testing configuration
├── components.json                # Shadcn UI configuration
│
├── Documentation Files:
├── README.md                       # Main project documentation
├── ARCHITECTURE.md                 # This file
├── PRODUCTION_ASSESSMENT.md        # Production readiness report
├── PRODUCTION_READY.md            # Deployment checklist
├── DEVELOPMENT.md                  # Development guide
├── DEPLOYMENT.md                   # Deployment instructions
├── design_guidelines.md            # UI/UX guidelines
├── ADMIN_LOGIN_CREDENTIALS.md     # Admin credentials (dev only)
├── ADMIN_SETUP.md                 # Admin setup guide
└── SETUP_COMPLETE.md              # Setup completion checklist
```

---

## Database Design

### Schema Overview

The database uses PostgreSQL with Drizzle ORM for type safety. Key tables:

```sql
-- User Management
users                    # All users (customers, sellers, riders, admins)
  ├── id (UUID)
  ├── email (unique)
  ├── password_hash (bcrypt)
  ├── role (super_admin, admin, seller, buyer, rider, agent)
  ├── profile_picture_url (Cloudinary)
  ├── is_verified
  └── created_at

-- Products
products
  ├── id (UUID)
  ├── title
  ├── description
  ├── category_id
  ├── seller_id (for multi-vendor)
  ├── cost_price
  ├── selling_price
  ├── stock_quantity
  ├── images (array of Cloudinary URLs)
  ├── video_url (optional)
  ├── created_at

product_variants
  ├── id (UUID)
  ├── product_id
  ├── option (size, color, etc.)
  ├── value
  └── stock_quantity

-- Orders & Payments
orders
  ├── id (UUID)
  ├── order_number (unique)
  ├── buyer_id
  ├── seller_id (if multi-vendor)
  ├── status (pending, confirmed, shipped, delivered, cancelled)
  ├── total_amount
  ├── currency
  ├── payment_status
  ├── delivery_zone_id
  ├── rider_id
  ├── created_at

order_items
  ├── id (UUID)
  ├── order_id
  ├── product_id
  ├── quantity
  ├── unit_price
  └── subtotal

payments
  ├── id (UUID)
  ├── order_id
  ├── amount
  ├── currency
  ├── paystack_reference
  ├── status (pending, successful, failed)
  ├── created_at

-- Delivery Management
delivery_zones
  ├── id (UUID)
  ├── name
  ├── area_description
  ├── delivery_fee
  ├── estimated_days
  ├── is_active
  └── created_at

-- Platform Settings
platform_settings
  ├── id (UUID)
  ├── multi_vendor_mode (boolean)
  ├── platform_name
  ├── default_currency
  ├── paystack_public_key
  ├── paystack_secret_key
  ├── cloudinary_cloud_name
  ├── cloudinary_api_key
  ├── cloudinary_api_secret
  ├── primary_color
  ├── footer_description
  └── social_media_links (JSON)

-- Real-time Features
chat_messages
  ├── id (UUID)
  ├── sender_id
  ├── recipient_id
  ├── message_text
  ├── is_read
  ├── created_at

-- Financial Tracking
earnings
  ├── id (UUID)
  ├── seller_id
  ├── order_id
  ├── amount
  ├── currency
  ├── status (pending, paid)
  ├── payout_date
  └── created_at

payouts
  ├── id (UUID)
  ├── seller_id
  ├── amount
  ├── currency
  ├── status (pending, approved, completed, rejected)
  ├── request_date
  └── completion_date
```

### Key Relationships

```
users (1) ──→ (many) orders (as buyer)
users (1) ──→ (many) orders (as seller, in multi-vendor mode)
users (1) ──→ (many) products (seller_id in multi-vendor)

products (1) ──→ (many) product_variants
products (1) ──→ (many) order_items

orders (1) ──→ (many) order_items
orders (1) ──→ (1) payments
orders (1) ──→ (1) delivery_zones
orders (1) ──→ (1) users (rider_id, nullable)

categories (1) ──→ (many) products

chat_messages (many) ──→ (1) users (sender)
chat_messages (many) ──→ (1) users (recipient)

earnings (many) ──→ (1) users (seller)
earnings (many) ──→ (1) orders
```

### Indexing Strategy

Critical indexes for performance:

```sql
-- User lookups
CREATE INDEX idx_users_email ON users(email);
CREATE INDEX idx_users_role ON users(role);

-- Product queries
CREATE INDEX idx_products_seller_id ON products(seller_id);
CREATE INDEX idx_products_category_id ON products(category_id);

-- Order tracking
CREATE INDEX idx_orders_buyer_id ON orders(buyer_id);
CREATE INDEX idx_orders_seller_id ON orders(seller_id);
CREATE INDEX idx_orders_status ON orders(status);
CREATE INDEX idx_orders_created_at ON orders(created_at);

-- Payment tracking
CREATE INDEX idx_payments_order_id ON payments(order_id);
CREATE INDEX idx_payments_paystack_ref ON payments(paystack_reference);

-- Earnings & Payouts
CREATE INDEX idx_earnings_seller_id ON earnings(seller_id);
CREATE INDEX idx_payouts_seller_id ON payouts(seller_id);
```

---

## API Architecture

### RESTful Endpoints Structure

```
AUTH ENDPOINTS (/api/auth)
├── POST /login              - Authenticate user
├── POST /register           - Create new account
├── POST /logout             - Logout (invalidate session)
├── GET  /me                 - Get current user profile
├── PUT  /me                 - Update profile
└── POST /refresh-token      - Refresh JWT token

PRODUCTS (/api/products)
├── GET  /                   - List products (with filters)
├── GET  /:id                - Get product details
├── POST /                   - Create product (seller/admin)
├── PUT  /:id                - Update product
├── DELETE /:id              - Delete product
└── POST /:id/images         - Upload product images

ORDERS (/api/orders)
├── GET  /                   - List user's orders
├── GET  /:id                - Get order details
├── POST /                   - Create new order
├── PUT  /:id/status         - Update order status
├── PUT  /:id/cancel         - Cancel order
├── POST /:id/refund         - Request refund
└── GET  /:id/track          - Real-time order tracking

PAYMENTS (/api/payments)
├── POST /initialize         - Initialize Paystack payment
├── POST /verify             - Verify payment status
├── GET  /history            - Payment history
└── GET  /receipts/:id       - Get payment receipt

ADMIN (/api/admin)
├── GET  /dashboard          - Dashboard metrics
├── GET  /users              - List all users
├── PUT  /users/:id/role     - Change user role
├── GET  /settings           - Get platform settings
├── PUT  /settings           - Update platform settings
├── GET  /orders             - All orders (admin view)
├── GET  /analytics          - Detailed analytics
└── POST /export             - Export data (CSV/PDF)

SELLERS (/api/sellers)
├── GET  /dashboard          - Seller dashboard
├── GET  /earnings           - Seller earnings
├── POST /payouts            - Request payout
├── GET  /payouts            - Payout history
└── GET  /analytics          - Seller-specific analytics

RIDERS (/api/riders)
├── GET  /dashboard          - Delivery dashboard
├── GET  /assignments        - Assigned deliveries
├── PUT  /assignments/:id    - Update delivery status
├── POST /track              - Start route tracking
└── GET  /earnings           - Rider earnings

DELIVERY ZONES (/api/delivery-zones)
├── GET  /                   - List all zones
├── GET  /:id                - Zone details
├── POST /                   - Create zone (admin)
├── PUT  /:id                - Update zone
├── DELETE /:id              - Delete zone
└── GET  /:id/coverage       - Zone coverage area

SEED ENDPOINTS (/api/seed) **PRODUCTION GUARDED**
├── POST /test-users         - Create test users
├── POST /complete-marketplace - Full marketplace setup
├── POST /islamic-fashion    - Create fashion products
├── POST /marketplace-setup  - Setup delivery zones
└── POST /sample-data        - Sample seller data
    └── ⚠️  All return 403 in production mode

HEALTH & UTILITIES
├── GET  /api/health         - Health check
├── GET  /api/metrics        - Server metrics
└── POST /api/currency-convert - Convert between currencies
```

### Request/Response Patterns

```typescript
// Successful Response
{
  "status": 200,
  "data": { /* payload */ },
  "message": "Operation successful"
}

// Error Response
{
  "status": 400,
  "error": "Descriptive error message",
  "code": "ERROR_CODE",
  "details": { /* validation errors */ }
}

// Paginated Response
{
  "status": 200,
  "data": [ /* items */ ],
  "pagination": {
    "page": 1,
    "limit": 20,
    "total": 150,
    "pages": 8
  }
}
```

### Authentication & Authorization

```
Request Header:
Authorization: Bearer <JWT_TOKEN>

OR

Cookie:
token=<JWT_TOKEN> (httpOnly, secure, sameSite)

JWT Payload:
{
  "userId": "<user-id>",
  "email": "<user-email>",
  "role": "<role>",
  "iat": 1234567890,
  "exp": 1234571490
}

Role-Based Access Control (RBAC):
├── super_admin    - Full platform control
├── admin          - Limited admin functions
├── seller         - Manage own products & orders
├── buyer          - Purchase products
├── rider          - Manage deliveries
└── agent          - Customer support (optional)
```

---

## Frontend Architecture

### Component Hierarchy

```
App.tsx (Root)
├── AuthLayout
│   ├── LoginPage
│   └── RegisterPage
├── MainLayout
│   ├── Header (Navigation)
│   ├── Sidebar (Mobile/Desktop)
│   ├── Router
│   │   ├── HomePage
│   │   ├── ProductDetailsPage
│   │   ├── CartPage
│   │   ├── CheckoutPage
│   │   ├── OrdersPage
│   │   ├── ProfilePage
│   │   └── [Role-specific pages]
│   └── Footer
└── AdminLayout
    ├── AdminDashboard
    ├── ProductManagement
    ├── OrderManagement
    ├── UserManagement
    ├── Settings
    └── Analytics
```

### State Management Strategy

```typescript
// Server State (TanStack Query)
// Handles: API data, caching, revalidation
useQuery({ queryKey: ['products'], queryFn: fetchProducts })
useMutation({ mutationFn: updateProduct })

// Client State (Zustand)
// Handles: UI state, user preferences
const store = useStore(state => state.theme)
store.setTheme('dark')

// Context State (Context API)
// Handles: Global config, auth
<AuthProvider>
  <ThemeProvider>
    <LanguageProvider>
      <App />
    </LanguageProvider>
  </ThemeProvider>
</AuthProvider>
```

### Real-time Features (Socket.IO)

```typescript
// Client-side
socket.on('order:status-updated', (orderData) => {
  queryClient.invalidateQueries(['orders'])
})

socket.emit('product:view', { productId })

// Server-side
io.on('connection', (socket) => {
  socket.on('product:view', (data) => {
    // Update product view count
  })
  
  socket.emit('order:status-updated', orderData)
})
```

---

## Authentication & Security

### Security Layers

```
1. Request Level
   ├── Rate limiting (5 attempts per 15 min for auth)
   ├── Request size limits (10MB max)
   ├── Timeout protection (30 seconds)
   └── CORS configuration

2. Application Level
   ├── JWT token validation
   ├── Role-based access control (RBAC)
   ├── Input validation (Zod schemas)
   ├── SQL injection prevention (Drizzle ORM)
   └── XSS protection (React escaping + CSP)

3. Transportation Level
   ├── HTTPS enforcement (HSTS)
   ├── Security headers (Helmet)
   ├── CORS headers
   └── SameSite cookie policy

4. Data Level
   ├── Password hashing (Bcrypt)
   ├── Sensitive field masking
   ├── PII encryption recommendations
   └── Audit logging
```

### Helmet Security Headers (Production)

```
Content-Security-Policy: 
  default-src 'self'; script-src 'self' 'unsafe-inline' cdn.example.com

Strict-Transport-Security: 
  max-age=31536000; includeSubDomains; preload

X-Content-Type-Options: 
  nosniff

X-Frame-Options: 
  DENY

X-XSS-Protection: 
  1; mode=block

Referrer-Policy: 
  strict-origin-when-cross-origin
```

### Password Security

```
Algorithm: bcrypt with 10 salt rounds
Min Length: 8 characters
Requirements:
  - At least one uppercase letter
  - At least one lowercase letter
  - At least one number
  - At least one special character

Session Timeout: 24 hours
Token Refresh: Available before expiration
Logout: Invalidates all sessions
```

---

## Real-time Communication

### Socket.IO Architecture

```typescript
// Namespaces
/orders            - Order status updates
/chat              - Messaging
/notifications     - Alerts & notifications
/tracking          - Live map tracking
/analytics         - Real-time metrics

// Key Events
Order Updates:
- order:created
- order:status-changed
- order:cancelled
- order:delivered

Messaging:
- message:new
- message:read
- typing-indicator

Tracking:
- location:updated
- rider:location
- eta:updated

Notifications:
- notification:new
- notification:read
```

---

## File Storage

### Cloudinary Integration

```typescript
// Image Upload Flow
1. Client uploads to Cloudinary directly
   - 100MB max file size
   - Supports: JPG, PNG, GIF, WebP, PDF
   
2. Server validates upload
   - Verify file exists
   - Store URL in database
   - Generate thumbnails

3. CDN Distribution
   - Global edge locations
   - Automatic optimization
   - Responsive image sizing

// URL Format
https://res.cloudinary.com/{cloud_name}/image/upload/
  /c_fill,w_400,h_400,q_auto/
  {public_id}.{format}
```

---

## Payment Processing

### Paystack Integration

```typescript
// Payment Flow
1. Customer initiates checkout
   └─ Amount validated & formatted

2. Client calls /api/payments/initialize
   └─ Backend calls Paystack API
   └─ Returns authorization_url

3. Customer redirected to Paystack
   └─ Enters card details securely

4. Paystack redirects to callback_url
   └─ Payment verified via webhook
   └─ Order status updated

5. Database records transaction
   └─ Earnings credited to seller
   └─ Platform fee deducted

// Error Handling
- Failed payment: Order remains pending
- Duplicate transaction: Idempotency checks
- Refund: Via Paystack API or manual review
```

---

## Deployment Architecture

### Environment Configuration

```
Development:
- NODE_ENV=development
- Debug logging enabled
- Seed endpoints available
- CORS: localhost:*
- Rate limiting: disabled for testing

Production:
- NODE_ENV=production
- Error logging only
- Seed endpoints: BLOCKED (403)
- CORS: Specified domains only
- Rate limiting: Strict enforcement
- Security headers: Maximum
- HTTPS: Mandatory
```

### Deployment Options

```
Netlify (Frontend):
- Frontend builds to static files
- Deployed to CDN
- Environment: NODE_ENV=production

Render (Backend):
- Express server containerized
- 512MB-2GB RAM recommended
- PostgreSQL connection via Neon
- Environment variables via Render dashboard

Database (Neon Serverless):
- PostgreSQL compatible
- Auto-scaling
- Automatic backups
- Point-in-time recovery

CDN (Cloudinary):
- Image optimization
- Global distribution
- Automatic format detection
```

---

## Performance Considerations

### Optimization Strategies

```
Frontend:
├── Code splitting (route-based)
├── Image lazy loading
├── Caching with React Query
├── Virtual scrolling (long lists)
├── Memoization (useMemo, useCallback)
└── Asset compression & minification

Backend:
├── Database query optimization
├── Connection pooling
├── Response caching
├── Pagination (prevent large responses)
├── Indexing strategy
└── Query result limiting

Infrastructure:
├── CDN for static assets
├── Database read replicas (future)
├── API rate limiting
├── Request batching (GraphQL future)
└── Monitoring & alerting
```

### Monitoring & Logging

```
Application Metrics:
- Request latency (p50, p95, p99)
- Error rate by endpoint
- Database query time
- Active connections
- Memory usage

Business Metrics:
- Orders per hour
- Revenue per currency
- Seller count
- Product inventory
- Payment success rate

Alerting:
- High error rate (>5%)
- Database down
- API response time >5s
- Payment gateway unreachable
- Disk space critical
```

---

## Security Hardening (v1.1.1)

### Recent Security Improvements

```
✅ Request Size Limits
   - 10MB max for JSON bodies
   - 10MB max for URL-encoded forms
   - Prevents payload-based DoS

✅ Helmet Security Headers
   - CSP (Content Security Policy)
   - HSTS (HTTP Strict Transport Security)
   - X-Frame-Options (clickjacking protection)
   - X-Content-Type-Options (MIME type sniffing)

✅ Request Timeout Handling
   - 30-second timeout per request
   - Returns 408 status on timeout
   - Prevents connection hanging

✅ Seed Endpoint Protection
   - All seed endpoints guarded
   - 403 response in production
   - Prevents accidental data reset

✅ Rate Limiting
   - Auth endpoints: 5 attempts per 15 minutes
   - API endpoints: Configurable per role
   - DDoS protection layer
```

---

## Development Workflow

### Getting Started

```bash
# Install dependencies
npm install

# Setup environment
cp .env.example .env.local

# Start development server
npx tsx server/index.ts

# In separate terminal, start frontend
npm run dev:frontend

# Run tests
npm run test:unit
npm run test:e2e

# Build for production
npm run build:frontend
```

### Common Development Tasks

```bash
# Check migrations
npm run check-migrations

# Seed database
npm run seed-admins
npm run seed-banners

# Run integration tests
npm run test:integration

# Verify production ready
npm run test:e2e
```

---

## Troubleshooting Guide

### Common Issues

**Issue:** Server won't start  
**Solution:** Check `node_modules`, `npm install`, verify `.env` variables

**Issue:** Database connection fails  
**Solution:** Verify `DATABASE_URL`, check PostgreSQL connection limits

**Issue:** Payment integration fails  
**Solution:** Verify Paystack keys, check webhook URL configuration

**Issue:** Image upload fails  
**Solution:** Verify Cloudinary credentials, check file size limits

---

## Future Improvements

```
Short-term:
- Enhanced error logging (Sentry)
- Advanced pagination
- Database query timeouts
- Input sanitization (trim)
- Console.log optimization

Medium-term:
- GraphQL API layer
- Advanced analytics dashboard
- Machine learning recommendations
- Mobile app (React Native)
- WhatsApp integration

Long-term:
- Global payment methods
- Blockchain for transparency
- AI-powered search
- Predictive inventory
- Marketplace federation
```

