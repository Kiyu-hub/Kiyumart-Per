# KiyuMart Development Guide

**Purpose:** Complete guide for developers working on KiyuMart  
**Target Audience:** Backend developers, frontend developers, AI models  
**Last Updated:** January 23, 2026

---

## Quick Start for Developers

### Prerequisites

```bash
# Required
Node.js 18+        # LTS version recommended
npm 9+             # Or yarn/pnpm
PostgreSQL 14+     # Or Neon serverless account

# Optional but recommended
Git                # Version control
Postman/Insomnia   # API testing
VSCode + Extensions:
  - Thunder Client (API testing)
  - Drizzle Kit extension
  - Tailwind CSS IntelliSense
  - TypeScript Vue Plugin
```

### Initial Setup (First Time)

```bash
# 1. Clone repository
git clone https://github.com/Kiyu-hub/Kiyumart-Per.git
cd Kiyumart-Per

# 2. Install dependencies
npm install

# 3. Setup environment variables
cp .env.example .env.local

# 4. Configure .env.local with:
DATABASE_URL=postgresql://user:password@host:5432/kiyumart
PAYSTACK_PUBLIC_KEY=pk_test_xxxxx
PAYSTACK_SECRET_KEY=sk_test_xxxxx
CLOUDINARY_CLOUD_NAME=xxxxx
CLOUDINARY_API_KEY=xxxxx
CLOUDINARY_API_SECRET=xxxxx
JWT_SECRET=your_super_secret_random_key
SESSION_SECRET=another_random_secret
NODE_ENV=development

# 5. Setup database
npx drizzle-kit push:pg

# 6. Seed test data
npm run seed-admins

# 7. Start servers
# Terminal 1: Backend Server
npx tsx server/index.ts
# Backend API: http://localhost:5000
# Platform UI: http://localhost:5000/admin/dashboard
# Socket.IO: wss://localhost:5000/socket.io/

# Terminal 2: Frontend Dev Server
npm run dev:frontend
# Frontend: http://localhost:5173
```

---

## Server Documentation

### Backend Server Overview

The KiyuMart backend is a **full-featured Express.js API server** running on **port 5000** with:

- **REST API** for all platform operations
- **Socket.IO** for real-time features (notifications, live tracking, video calls)
- **PostgreSQL/Neon** database with Drizzle ORM
- **Background workers** for async tasks (payouts, ad expiry, notifications)
- **Server-side rendering** (SSR) capability for admin dashboard
- **JWT authentication** with role-based access control

### Core Server Features

```
┌─────────────────────────────────────────────────────────────┐
│              KiyuMart Backend (Port 5000)                   │
├─────────────────────────────────────────────────────────────┤
│                                                               │
│  ✅ REST API Endpoints (~120+ routes)                       │
│     - Authentication & Authorization                         │
│     - Product Management                                     │
│     - Order Processing                                       │
│     - Admin Panel                                            │
│     - Seller Management                                      │
│     - Payment Gateway Integration                            │
│     - Delivery Zone Management                               │
│     - Real-time Notifications                                │
│                                                               │
│  ✅ Real-Time Features (Socket.IO)                          │
│     - Live Order Status Updates                              │
│     - Instant Notifications                                  │
│     - Rider Location Tracking                                │
│     - Real-time Chat                                         │
│     - WebRTC Video Calls                                     │
│                                                               │
│  ✅ Background Workers                                       │
│     - Payout Processing Worker (every 15 seconds)           │
│     - Promotional Ads Expiry Worker (every 60 seconds)      │
│     - Order Status Auto-updates                              │
│                                                               │
│  ✅ Database Layer (Drizzle ORM + PostgreSQL)               │
│     - 30+ tables for platform data                           │
│     - RLS (Row Level Security) support                       │
│     - Automatic migrations                                   │
│                                                               │
│  ✅ Security                                                 │
│     - JWT Token Authentication                               │
│     - CORS Protection                                        │
│     - Request Rate Limiting                                  │
│     - Input Validation                                       │
│     - Secure Password Hashing                                │
│                                                               │
└─────────────────────────────────────────────────────────────┘
```

### Starting the Backend Server

```bash
# Development (with hot reload via tsx)
npx tsx server/index.ts

# Production
npm run build
node dist/server/index.js

# With debug logging
DEBUG=* npx tsx server/index.ts
```

**Server Startup Output:**
```
[server] 🚀 Express server listening on http://0.0.0.0:5000
[server] ✅ Database connected
[server] ✅ Payout worker started (interval: 15000ms)
[server] ✅ Promotional ads worker started (interval: 60000ms)
[server] 🔌 Socket.IO ready for connections
```

### API Base URL

- **Development:** `http://localhost:5000`
- **Production:** `https://your-domain.com`

When frontend is on a different port, set environment variable:
```bash
VITE_API_URL=http://localhost:5000
```

### Server Endpoints Structure

```
/api/auth                    # Authentication (login, register, logout)
/api/users                   # User management
/api/products                # Product catalog
/api/products/:id            # Product details, variants, reviews
/api/orders                  # Order operations
/api/cart                    # Shopping cart
/api/wishlist                # User wishlist
/api/sellers                 # Seller operations
/api/stores                  # Store management
/api/riders                  # Rider management
/api/admin                   # Admin operations (products, orders, sellers, payouts)
/api/admin/promotions        # Promotional ads management
/api/payments                # Payment processing (Paystack)
/api/notifications           # Push notifications
/api/delivery-zones          # Delivery coverage areas
/api/categories              # Product categories
/api/settings                # Platform settings
/api/analytics               # Dashboard analytics
/api/homepage                # Homepage data
/api/platform-settings       # Global platform configuration
```

### Socket.IO Events

**Authentication:**
```javascript
socket.emit('authenticate', { token: 'jwt_token' });
socket.on('authenticated', (user) => { ... });
```

**Real-Time Updates:**
```javascript
// Order status updates
socket.on('order:updated', (order) => { ... });

// Rider location
socket.on('rider:location', (location) => { ... });

// Notifications
socket.on('notification:new', (notification) => { ... });

// Messages (Chat)
socket.on('message:received', (message) => { ... });
```

### Database Connection

The server automatically connects to PostgreSQL via Drizzle ORM:

```typescript
// From environment variable
DATABASE_URL=postgresql://user:password@host:5432/kiyumart

// Connection pooling is automatic
// Max connections: 20 (configurable)
```

---

## Project Structure (Developer View)

### Frontend File Organization

```
client/src/
├── components/                  # Reusable UI components
│   ├── ui/                      # Shadcn UI primitives
│   │   ├── Button.tsx
│   │   ├── Dialog.tsx
│   │   ├── Input.tsx
│   │   └── ...
│   ├── ProductCard.tsx          # Product display component
│   ├── OrderTracker.tsx         # Order tracking widget
│   ├── CategorySelector.tsx     # Category navigation
│   ├── Header.tsx               # Top navigation
│   ├── Sidebar.tsx              # Mobile/desktop sidebar
│   └── ...
│
├── pages/                       # Full-page components
│   ├── HomePage.tsx             # Main landing page
│   ├── ProductDetailsPage.tsx   # Single product view
│   ├── CartPage.tsx             # Shopping cart
│   ├── CheckoutPage.tsx         # Payment page
│   ├── OrdersPage.tsx           # Order history
│   ├── ProfilePage.tsx          # User profile
│   ├── AdminDashboard.tsx       # Admin main dashboard
│   ├── SellerDashboard.tsx      # Seller main dashboard
│   ├── RiderDashboard.tsx       # Rider main dashboard
│   └── ...
│
├── hooks/                       # Custom React hooks
│   ├── useAuth.ts              # Authentication logic
│   ├── useCart.ts              # Shopping cart logic
│   ├── useOrders.ts            # Order management
│   ├── useWebRTC.ts            # WebRTC video calls
│   ├── useGroupCall.ts         # Group video calls
│   └── ...
│
├── lib/                         # Utility functions
│   ├── api.ts                  # Fetch wrapper with auth
│   ├── socket.ts               # Socket.IO setup
│   ├── validators.ts           # Zod schemas
│   ├── currency.ts             # Currency conversion
│   ├── dates.ts                # Date utilities
│   └── ...
│
├── contexts/                    # React contexts
│   ├── AuthContext.tsx         # Auth state
│   ├── ThemeContext.tsx        # Dark/light theme
│   ├── LanguageContext.tsx     # i18n language
│   └── ...
│
├── App.tsx                      # Root component
└── main.tsx                     # Vite entry point
```

### Backend File Organization

```
server/
├── index.ts                     # Server entry point
│   - Middleware setup
│   - Route registration
│   - Socket.IO setup
│   - Startup checks
│
├── routes.ts                    # ALL API endpoints (~6000 lines)
│   - Auth routes (/api/auth)
│   - Product routes (/api/products)
│   - Order routes (/api/orders)
│   - Admin routes (/api/admin)
│   - Seller routes (/api/sellers)
│   - Rider routes (/api/riders)
│   - Payment routes (/api/payments)
│   - Delivery zone routes (/api/delivery-zones)
│   - Seed routes (/api/seed)
│
├── auth.ts                      # Authentication logic
│   - JWT creation/verification
│   - Password hashing
│   - Role validation
│
├── payments.ts                  # Payment business logic
│   - Paystack integration
│   - Transaction tracking
│   - Refund processing
│
├── paystack.ts                  # Paystack API wrapper
│   - Initialize payment
│   - Verify payment
│   - List transactions
│
├── cloudinary.ts                # Image upload logic
│   - Upload to Cloudinary
│   - URL generation
│   - Signature verification
│
├── storage.ts                   # Database abstraction layer
│   - CRUD operations for all entities
│   - Query builders
│   - Transaction management
│
├── currency.ts                  # Currency conversion
│   - Exchange rate fetching
│   - Amount conversion
│   - Multi-currency support
│
├── metrics.ts                   # Analytics calculations
│   - Revenue calculations
│   - Order statistics
│   - User analytics
│
├── seed.ts                      # Seed data generation
│   - Create test users
│   - Create sample products
│   - Create test orders
│
├── seedMediaLibrary.ts          # Product media generation
│   - Generate product data
│   - Create Cloudinary URLs
│
├── vite.ts                      # Vite integration
│   - Serve frontend in dev
│   - HMR setup
│
├── __tests__/                   # Test files
│   ├── auth.test.ts
│   ├── payments.test.ts
│   └── paystack-integration.test.ts
│
├── services/                    # Business logic services
│   └── ...
│
└── workers/                     # Background workers
    └── payoutWorker.ts         # Process seller payouts
```

### Database Layer

```
db/
└── index.ts                     # Drizzle ORM setup
    ├── Schema definitions (shared/schema.ts imports)
    ├── Connection pool setup
    ├── Query helpers

shared/
├── schema.ts                    # Drizzle ORM schema
│   ├── users table
│   ├── products table
│   ├── orders table
│   ├── payments table
│   ├── etc...
│
└── storeTypes.ts               # TypeScript type definitions
    ├── User types
    ├── Product types
    ├── Order types
    └── etc...

migrations/
└── SQL migration files
    ├── 0001_chat_message_status.sql
    ├── 0002_create_idempotency_keys.sql
    ├── etc...
```

---

## Common Development Tasks

### Task: Add a New API Endpoint

**Example:** Add endpoint to update rider location

```typescript
// 1. Define endpoint in server/routes.ts

app.put("/api/riders/:riderId/location", requireAuth, async (req, res) => {
  try {
    // Validate input with Zod
    const schema = z.object({
      latitude: z.number(),
      longitude: z.number(),
      timestamp: z.string().datetime()
    });

    const validatedData = schema.parse(req.body);

    // Get rider ID from URL
    const { riderId } = req.params;

    // Verify authorization (rider can only update own location)
    if (req.user?.id !== riderId && req.user?.role !== 'super_admin') {
      return res.status(403).json({ error: "Unauthorized" });
    }

    // Update database
    const updated = await storage.updateRiderLocation(riderId, validatedData);

    // Emit real-time event
    io.to(`rider:${riderId}`).emit('location:updated', {
      riderId,
      ...validatedData
    });

    // Return success response
    res.json({
      status: 200,
      data: updated,
      message: "Location updated successfully"
    });
  } catch (error) {
    if (error instanceof z.ZodError) {
      return res.status(400).json({
        status: 400,
        error: "Validation failed",
        details: error.errors
      });
    }
    console.error("Error updating rider location:", error);
    res.status(500).json({ error: "Internal server error" });
  }
});

// 2. Add database function in server/storage.ts

async updateRiderLocation(riderId: string, data: {
  latitude: number;
  longitude: number;
  timestamp: string;
}) {
  return await db
    .update(riders)
    .set({
      last_latitude: data.latitude,
      last_longitude: data.longitude,
      last_location_update: new Date(data.timestamp)
    })
    .where(eq(riders.id, riderId))
    .returning();
}

// 3. Add frontend API call in client/lib/api.ts

export async function updateRiderLocation(
  riderId: string,
  latitude: number,
  longitude: number
) {
  const response = await fetch(`/api/riders/${riderId}/location`, {
    method: 'PUT',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ latitude, longitude, timestamp: new Date().toISOString() })
  });

  if (!response.ok) throw new Error('Failed to update location');
  return response.json();
}

// 4. Create React hook in client/src/hooks/useRiderLocation.ts

export function useRiderLocation(riderId: string) {
  const mutation = useMutation({
    mutationFn: (data) => updateRiderLocation(riderId, data.lat, data.lng),
    onSuccess: () => {
      queryClient.invalidateQueries(['rider', riderId]);
    }
  });

  return mutation;
}

// 5. Use in component

export function RiderLocationUpdater({ riderId }) {
  const mutation = useRiderLocation(riderId);

  useEffect(() => {
    const watcher = navigator.geolocation.watchPosition(
      (position) => {
        mutation.mutate({
          lat: position.coords.latitude,
          lng: position.coords.longitude
        });
      }
    );

    return () => navigator.geolocation.clearWatch(watcher);
  }, [riderId]);

  return <div>Location tracking active</div>;
}
```

### Task: Add a New Database Table

**Example:** Add `promotions` table

```typescript
// 1. Update shared/schema.ts

import { pgTable, text, numeric, timestamp, boolean } from "drizzle-orm/pg-core";

export const promotions = pgTable("promotions", {
  id: text("id").primaryKey().default(generateId()),
  name: text("name").notNull(),
  description: text("description"),
  discount_percentage: numeric("discount_percentage", { precision: 5, scale: 2 }),
  discount_amount: numeric("discount_amount", { precision: 10, scale: 2 }),
  minimum_purchase: numeric("minimum_purchase", { precision: 10, scale: 2 }),
  product_id: text("product_id"), // null = apply to all
  start_date: timestamp("start_date").notNull(),
  end_date: timestamp("end_date").notNull(),
  is_active: boolean("is_active").default(true),
  created_by: text("created_by").notNull(), // admin user ID
  created_at: timestamp("created_at").defaultNow()
});

// 2. Create migration file: migrations/0007_add_promotions.sql

CREATE TABLE promotions (
  id TEXT PRIMARY KEY,
  name TEXT NOT NULL,
  description TEXT,
  discount_percentage NUMERIC(5, 2),
  discount_amount NUMERIC(10, 2),
  minimum_purchase NUMERIC(10, 2),
  product_id TEXT,
  start_date TIMESTAMP NOT NULL,
  end_date TIMESTAMP NOT NULL,
  is_active BOOLEAN DEFAULT true,
  created_by TEXT NOT NULL,
  created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
  FOREIGN KEY (product_id) REFERENCES products(id) ON DELETE SET NULL,
  FOREIGN KEY (created_by) REFERENCES users(id)
);

CREATE INDEX idx_promotions_active ON promotions(is_active);
CREATE INDEX idx_promotions_dates ON promotions(start_date, end_date);

// 3. Apply migration
npx drizzle-kit push:pg

// 4. Add type to shared/storeTypes.ts

export interface Promotion {
  id: string;
  name: string;
  description?: string;
  discount_percentage?: number;
  discount_amount?: number;
  minimum_purchase?: number;
  product_id?: string;
  start_date: Date;
  end_date: Date;
  is_active: boolean;
  created_by: string;
  created_at: Date;
}

// 5. Add CRUD functions to server/storage.ts

async createPromotion(data: Promotion) {
  return await db.insert(promotions).values(data).returning();
}

async getActivePromotions() {
  return await db.query.promotions.findMany({
    where: (promo) => sql`
      ${promo.is_active} = true 
      AND ${promo.start_date} <= NOW() 
      AND ${promo.end_date} >= NOW()
    `
  });
}
```

### Task: Fix a Bug in Authentication

**Example:** JWT token not being validated correctly

```typescript
// 1. Identify the issue
// Location: server/auth.ts - verifyToken function

// Before (BUGGY):
export function verifyToken(token: string) {
  try {
    return jwt.verify(token, process.env.JWT_SECRET!) as TokenPayload;
  } catch {
    return null; // Silent failure - hard to debug
  }
}

// After (FIXED):
export function verifyToken(token: string): TokenPayload | null {
  try {
    // Validate token format first
    if (!token || token.split('.').length !== 3) {
      console.error('[AUTH] Invalid token format');
      return null;
    }

    const decoded = jwt.verify(token, process.env.JWT_SECRET!) as TokenPayload;
    
    // Validate payload
    if (!decoded.userId || !decoded.role) {
      console.error('[AUTH] Invalid token payload');
      return null;
    }

    return decoded;
  } catch (error) {
    if (error instanceof jwt.TokenExpiredError) {
      console.warn('[AUTH] Token expired:', error.expiredAt);
    } else if (error instanceof jwt.JsonWebTokenError) {
      console.warn('[AUTH] Invalid token:', error.message);
    } else {
      console.error('[AUTH] Token verification error:', error);
    }
    return null;
  }
}

// 2. Add test to server/__tests__/auth.test.ts

describe('JWT Token Verification', () => {
  it('should reject expired tokens', () => {
    const expiredToken = jwt.sign(
      { userId: 'test', role: 'buyer' },
      process.env.JWT_SECRET!,
      { expiresIn: '-1h' }
    );

    const result = verifyToken(expiredToken);
    expect(result).toBeNull();
  });

  it('should reject tokens with missing payload', () => {
    const invalidToken = jwt.sign({}, process.env.JWT_SECRET!);
    const result = verifyToken(invalidToken);
    expect(result).toBeNull();
  });

  it('should accept valid tokens', () => {
    const validToken = jwt.sign(
      { userId: 'user123', role: 'buyer' },
      process.env.JWT_SECRET!,
      { expiresIn: '24h' }
    );

    const result = verifyToken(validToken);
    expect(result).toBeDefined();
    expect(result?.userId).toBe('user123');
  });
});

// 3. Run tests
npm run test:unit
```

### Task: Optimize a Slow Query

**Example:** Product listing endpoint is slow

```typescript
// 1. Identify slow query - add timing
console.time('product-list-query');
const products = await db.query.products.findMany({
  limit: 20,
  offset: 0
});
console.timeEnd('product-list-query');

// 2. Analyze query plan
// EXPLAIN ANALYZE SELECT * FROM products LIMIT 20;

// 3. Add missing indexes in migration
CREATE INDEX idx_products_created_at ON products(created_at DESC);
CREATE INDEX idx_products_seller_stock ON products(seller_id, stock_quantity);

// 4. Optimize query - add eager loading

const products = await db.query.products.findMany({
  with: {
    seller: {
      columns: { id: true, name: true } // Only needed columns
    },
    category: true
  },
  limit: 20,
  offset: 0
});

// 5. Add caching with React Query (frontend)

const { data } = useQuery({
  queryKey: ['products', page],
  queryFn: () => fetchProducts(page),
  staleTime: 5 * 60 * 1000, // Cache for 5 minutes
  cacheTime: 10 * 60 * 1000
});

// 6. Test performance
console.time('product-list-query-optimized');
// ... run query
console.timeEnd('product-list-query-optimized');
```

---

## Testing

### Running Tests

```bash
# Unit tests
npm run test:unit

# Integration tests (with live database)
npm run test:integration

# E2E tests (with browser)
npm run test:e2e

# All tests
npm run test:*
```

### Writing Tests

```typescript
// server/__tests__/products.test.ts

import { describe, it, expect, beforeEach, afterEach } from '@jest/globals';
import request from 'supertest';
import app from '../index';
import { storage } from '../storage';

describe('Product API', () => {
  let adminToken: string;
  let productId: string;

  beforeEach(async () => {
    // Setup test data
    adminToken = generateTestToken('admin@test.com', 'super_admin');
  });

  afterEach(async () => {
    // Cleanup
    if (productId) {
      await storage.deleteProduct(productId);
    }
  });

  describe('GET /api/products', () => {
    it('should list products with pagination', async () => {
      const response = await request(app)
        .get('/api/products?page=1&limit=10')
        .expect(200);

      expect(response.body).toHaveProperty('data');
      expect(response.body).toHaveProperty('pagination');
      expect(Array.isArray(response.body.data)).toBe(true);
    });

    it('should filter products by category', async () => {
      const response = await request(app)
        .get('/api/products?category=electronics')
        .expect(200);

      response.body.data.forEach(product => {
        expect(product.category).toBe('electronics');
      });
    });
  });

  describe('POST /api/products', () => {
    it('should create product as seller', async () => {
      const response = await request(app)
        .post('/api/products')
        .set('Authorization', `Bearer ${sellerToken}`)
        .send({
          title: 'Test Product',
          description: 'Test Description',
          category: 'electronics',
          selling_price: 99.99,
          stock_quantity: 10
        })
        .expect(201);

      expect(response.body.data).toHaveProperty('id');
      productId = response.body.data.id;
    });

    it('should reject unauthenticated requests', async () => {
      await request(app)
        .post('/api/products')
        .send({ title: 'Test' })
        .expect(401);
    });
  });
});
```

---

## Code Style & Conventions

### TypeScript Best Practices

```typescript
// ✅ Good: Explicit types, proper error handling
async function fetchUser(id: string): Promise<User | null> {
  try {
    const response = await fetch(`/api/users/${id}`);
    if (!response.ok) {
      throw new Error(`HTTP ${response.status}`);
    }
    return await response.json();
  } catch (error) {
    console.error('Failed to fetch user:', error);
    return null;
  }
}

// ❌ Bad: Any types, no error handling
async function fetchUser(id) {
  const response = await fetch(`/api/users/${id}`);
  return response.json();
}
```

### React Component Patterns

#### Product Card Pricing

- Product cards display a sale price and — when a product has a higher original/cost price (the system's `costPrice`, also called the original price) — the original price is shown with a strikethrough (line-through) to emphasize discounts. Maintain `costPrice` handling in components that render `<ProductCard />` and pass `costPrice` where available from the API. If a discount value is provided without `costPrice`, UI components should infer an original price for display to show the strike-through and percent-off badge consistently.


```typescript
// ✅ Good: Functional component with hooks, memoized
interface ProductCardProps {
  productId: string;
  onSelect?: (id: string) => void;
}

export const ProductCard = memo(function ProductCard({
  productId,
  onSelect
}: ProductCardProps) {
  const { data: product, isLoading } = useQuery({
    queryKey: ['product', productId],
    queryFn: () => fetchProduct(productId)
  });

  if (isLoading) return <ProductCardSkeleton />;
  if (!product) return null;

  return (
    <div onClick={() => onSelect?.(productId)}>
      <h3>{product.title}</h3>
      <p>${product.price}</p>
    </div>
  );
});

// ❌ Bad: Class component, prop drilling, no memoization
class ProductCard extends React.Component {
  render() {
    // ... verbose code
  }
}
```

### API Endpoint Patterns

```typescript
// ✅ Good: Consistent error handling, validation
app.post('/api/orders', requireAuth, async (req, res) => {
  try {
    const schema = z.object({
      items: z.array(z.object({
        productId: z.string(),
        quantity: z.number().min(1)
      })),
      shippingAddress: z.string()
    });

    const data = schema.parse(req.body);
    const order = await storage.createOrder({
      ...data,
      buyerId: req.user.id,
      status: 'pending'
    });

    io.emit('order:created', order);

    res.status(201).json({
      status: 201,
      data: order,
      message: 'Order created successfully'
    });
  } catch (error) {
    handleApiError(error, res);
  }
});

// ❌ Bad: No validation, inconsistent responses
app.post('/api/orders', (req, res) => {
  const order = createOrder(req.body);
  res.json(order); // No status code, could be error or success
});
```

---

## Debugging Tips

### Backend Debugging

```typescript
// Add debug logging
console.log('[COMPONENT]', 'descriptive message', data);

// Use debugger
debugger; // Pause execution in Node.js with --inspect flag
// Run: node --inspect-brk server/index.ts

// Check database state
const users = await db.query.users.findMany();
console.log('Database users:', users);

// Test endpoint with curl
curl -X GET http://localhost:5000/api/products -H "Authorization: Bearer $TOKEN"

// Use Postman/Insomnia for API testing
```

### Frontend Debugging

```typescript
// React DevTools
- Inspect component tree
- Check props and state
- Trace renders

// Network tab
- Check API responses
- Verify request headers
- Monitor WebSocket

// Console logs with context
console.log('[COMPONENT_NAME]', 'action', data);

// React Query DevTools
import { ReactQueryDevtools } from '@tanstack/react-query-devtools';

<App>
  <ReactQueryDevtools initialIsOpen={false} />
</App>
```

---

## Common Issues & Solutions

### Issue: "Cannot find module"

**Solution:**
```bash
# Clear node_modules and reinstall
rm -rf node_modules package-lock.json
npm install
```

### Issue: Database connection timeout

**Solution:**
```typescript
// Check DATABASE_URL in .env
// Verify PostgreSQL is running
// Increase connection timeout:
const db = drizzle(new Pool({
  connectionTimeoutMillis: 30000,
  idleTimeoutMillis: 30000
}));
```

### Issue: CORS errors

**Solution:**
```typescript
// Update server/index.ts
app.use(cors({
  origin: process.env.FRONTEND_URL || 'http://localhost:5173',
  credentials: true,
  methods: ['GET', 'POST', 'PUT', 'DELETE', 'OPTIONS']
}));
```

### Issue: Socket.IO connection fails

**Solution:**
```typescript
// Check WebSocket setup in server/index.ts
// Verify Socket.IO client initialization in client/lib/socket.ts
// Check for CORS issues with socket events
```

---

## Performance Monitoring

### Frontend Performance

```typescript
// Measure component render time
import { measurePerformance } from './perf-utils';

export function MyComponent() {
  return (
    <ErrorBoundary>
      {measurePerformance('MyComponent', () => (
        <div>Component content</div>
      ))}
    </ErrorBoundary>
  );
}

// Check Core Web Vitals
// Chrome DevTools → Lighthouse → Performance
```

### Backend Performance

```typescript
// Add timing middleware
app.use((req, res, next) => {
  const start = Date.now();
  res.on('finish', () => {
    const duration = Date.now() - start;
    if (duration > 1000) {
      console.warn(`[SLOW] ${req.method} ${req.path} took ${duration}ms`);
    }
  });
  next();
});

// Monitor database queries
// Check query times in Neon dashboard
```

---

## Deployment Checklist

- [ ] Environment variables configured
- [ ] Database migrations applied
- [ ] Frontend build tested (`npm run build:frontend`)
- [ ] API endpoints tested (smoke test script)
- [ ] Payment gateway configured (Paystack)
- [ ] Image uploads working (Cloudinary)
- [ ] SSL certificate installed
- [ ] Rate limiting configured
- [ ] Logging enabled
- [ ] Backups scheduled

---

## Getting Help

1. **Check existing documentation**: ARCHITECTURE.md, README.md
2. **Search codebase**: Use Ctrl+Shift+F
3. **Check error logs**: Monitor server console output
4. **Review similar code**: Find similar features for patterns
5. **Ask in team chat**: Reach out to teammates
6. **Create debug branch**: Isolate issue in separate branch

---

## Recent Updates (February 1, 2026)

### Promotional Ads System

✅ **Comprehensive Admin Promotions Dashboard** 
- Create store and product promotions with rich fields
- Image upload with drag-drop support
- Auto-generated CTA URLs based on selection
- Default image fallback (store logo or product image)
- Real-time status updates with 3-second polling
- Immediate refresh after promotion expiry

✅ **Frontend Display**
- Promotional cards display on homepage (sidebar variant on desktop, full-width on mobile)
- Live countdown timers showing time remaining
- Proper theming using primary brand colors
- Emoji indicators for promo type (store/product)

✅ **Backend Features**
- Automatic promotion expiry worker (60-second interval)
- Server-side isActive flag for reliable status tracking
- Proper NULL handling in expiry query
- Enrichment of promos with store/product data
- Comprehensive error logging for debugging

### UI/UX Improvements

✅ **ProductAutocomplete Component**
- Fixed white text/background visibility
- Uses theme-aware bg-card and text-card-foreground
- Improved dropdown styling with z-50 and shadow-xl
- Better focus states and accessibility

✅ **AdminPromotions Component**
- Removed hardcoded theme colors
- Uses primary brand color system
- Status badges reflect server isActive state
- Better form input styling
- Proper text contrast in all fields

### Bug Fixes

✅ **Promotion Status Updates**
- Fixed real-time updates not reflecting after delete action
- Added awaited refetch() in mutation onSuccess
- Query now uses isNotNull check for NULL endAt values
- Promotions properly expire when past endAt timestamp

