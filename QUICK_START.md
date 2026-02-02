# KiyuMart Quick Start Guide

**Purpose:** Get up and running in 5 minutes  
**Target:** New developers, AI models, quick reference  
**Last Updated:** February 1, 2026

---

## 🚀 5-Minute Setup

### 1. Install & Start (3 minutes)

```bash
# Clone and install
git clone https://github.com/Kiyu-hub/Kiyumart-Per.git
cd Kiyumart-Per
npm install

# Copy environment template
cp .env.example .env.local

# Edit .env.local and add your credentials:
# - DATABASE_URL=postgresql://...
# - PAYSTACK_PUBLIC_KEY=pk_test_...
# - CLOUDINARY_CLOUD_NAME=...

# Start backend (Terminal 1)
npx tsx server/index.ts

# Start frontend (Terminal 2)
npm run dev:frontend
```

### 2. Login (1 minute)

**Default Admin Credentials (Development Only):**
```
Email: admin@kiyumart.com
Password: admin123
```

First, create test users:
```bash
# In a third terminal:
curl -X POST http://localhost:5000/api/seed/test-users
```

Then login at `http://localhost:5173`

### 3. Test (1 minute)

```bash
# Health check
curl http://localhost:5000/api/health

# List products
curl http://localhost:5000/api/products

# You're ready!
```

---

## 📁 Project Structure (TL;DR)

```
client/           Frontend (React, Vite)
  └─ src/
    ├─ components/    UI components
    ├─ pages/         Page screens
    ├─ hooks/         Custom hooks
    └─ lib/           Utilities

server/           Backend (Express, Node.js)
  ├─ routes.ts       All API endpoints
  ├─ storage.ts      Database functions
  ├─ payments.ts     Payment logic
  └─ seed.ts         Test data

shared/           Shared code
  ├─ schema.ts       Database schema
  └─ storeTypes.ts   TypeScript types

db/               Database config
└─ index.ts        Drizzle setup

migrations/       Database migrations (.sql files)
```

---

## 🔑 Key Endpoints (Most Common)

### Authentication
```bash
POST   /api/auth/login              # Login
POST   /api/auth/register           # Register
GET    /api/auth/me                 # Current user
POST   /api/auth/logout             # Logout
```

### Products
```bash
GET    /api/products                # List products
GET    /api/products/:id            # Get product
POST   /api/products                # Create product (seller/admin)
PUT    /api/products/:id            # Update product
DELETE /api/products/:id            # Delete product
```

### Orders
```bash
GET    /api/orders                  # My orders
POST   /api/orders                  # Create order
GET    /api/orders/:id              # Order details
PUT    /api/orders/:id/status       # Update status
```

### Admin
```bash
GET    /api/admin/dashboard         # Dashboard stats
GET    /api/admin/settings          # Platform settings
PUT    /api/admin/settings          # Update settings
```

**Full API reference:** See [ARCHITECTURE.md](./ARCHITECTURE.md#api-architecture)

---

## 👥 User Roles

| Role | Purpose | Features |
|------|---------|----------|
| **super_admin** | Full platform control | All features + settings |
| **admin** | Limited admin functions | Orders, users, products |
| **seller** | Manage own store | Own products, orders, earnings |
| **buyer** | Purchase products | Browse, cart, checkout |
| **rider** | Deliver orders | Assigned deliveries, tracking |
| **agent** | Customer support | View users, orders |

**Test Credentials:**
```
super_admin: superadmin@kiyumart.com (password configured via `SUPER_ADMIN_PASSWORD` env var)
admin:       admin@kiyumart.com / admin123
seller:      seller@kiyumart.com / seller123
buyer:       buyer@kiyumart.com / buyer123
rider:       rider@kiyumart.com / rider123
agent:       agent@kiyumart.com / agent123
```

---

## 🛠️ Common Tasks

### Add a Product (As Admin)

```
1. Go to http://localhost:5173/admin
2. Click Products
3. Click "Add Product"
4. Fill form:
   - Title: "Amazing Product"
   - Description: "..."
   - Category: Select one
   - Price: 99.99
   - Stock: 50
   - Upload images (up to 5)
5. Click Save
```

### Create an Order (As Buyer)

```
1. Go to http://localhost:5173
2. Click on a product
3. Select variant (size, color)
4. Click "Add to Cart"
5. Click Cart icon
6. Click "Checkout"
7. Fill address
8. Click "Pay with Paystack"
9. Test with card: 4111 1111 1111 1111
```

### View Admin Dashboard

```
1. Login as admin
2. Go to http://localhost:5173/admin
3. See:
   - Total revenue
   - Recent orders
   - Product stats
   - User count
```

---

## 🧪 Quick Testing

### Test Backend API

```bash
# Health check
curl http://localhost:5000/api/health

# Create product (need auth token)
TOKEN=$(curl -s -X POST http://localhost:5000/api/auth/login \
  -H "Content-Type: application/json" \
  -d '{"email":"admin@kiyumart.com","password":"admin123"}' | jq -r '.token')

curl -X POST http://localhost:5000/api/products \
  -H "Authorization: Bearer $TOKEN" \
  -H "Content-Type: application/json" \
  -d '{
    "title": "Test Product",
    "description": "Test",
    "selling_price": 99.99,
    "stock_quantity": 10
  }'
```

### Test Frontend Build

```bash
# Build for production
npm run build:frontend

# Check build output
ls -lh client/dist

# Preview production build
npm run preview:frontend  # (if available)
```

---

## 🐛 Troubleshooting

| Problem | Solution |
|---------|----------|
| **Port 5000 already in use** | `lsof -i :5000` then `kill -9 <PID>` |
| **Database connection error** | Check `DATABASE_URL` in .env.local |
| **Frontend won't load** | Check `npm run dev:frontend` terminal for errors |
| **Can't login** | Ensure seed ran: `curl -X POST http://localhost:5000/api/seed/test-users` |
| **Images not uploading** | Verify Cloudinary credentials in .env.local |
| **Payment fails** | Use test card: 4111 1111 1111 1111 |

---

## 📚 Full Documentation

- **ARCHITECTURE.md** - Complete system architecture
- **DEVELOPMENT.md** - Development guide with examples
- **DEPLOYMENT.md** - Production deployment steps
- **PRODUCTION_ASSESSMENT.md** - Security & readiness report
- **README.md** - Project overview

---

## 🚀 Next Steps

1. **Explore the code** - Start with `client/src/pages/HomePage.tsx`
2. **Read DEVELOPMENT.md** - Learn development patterns
3. **Check ARCHITECTURE.md** - Understand system design
4. **Build a feature** - Try adding a new component
5. **Run tests** - `npm run test:unit`

---

## ⚡ Important Notes

### Development vs Production

**Development:**
- Seed endpoints ENABLED
- Debug logging enabled
- CORS allows localhost
- Rate limiting disabled

**Production:**
- Seed endpoints BLOCKED (403)
- Error logging only
- CORS restricted to allowed domains
- Rate limiting strict
- Security headers enabled

### Security Hardening (v1.1.1)

```
✅ Request size limits (10MB)
✅ Helmet security headers
✅ 30-second request timeout
✅ All seed endpoints guarded
✅ Rate limiting on auth endpoints
```

---

## 💡 Pro Tips

```bash
# Use Postman for API testing
# Import: server/routes.ts for endpoint reference

# Monitor logs in real-time
# Terminal 1: npx tsx server/index.ts 2>&1 | grep "[ERROR]"

# Debug database queries
# Add console.log in storage.ts functions

# Check for TypeScript errors
# npx tsc --noEmit

# Format code
# npx prettier --write client/src server

# Run single test
# npm run test:unit -- auth.test.ts
```

---

## 📞 Need Help?

1. Check error messages carefully - they're descriptive
2. Search existing code - patterns are everywhere
3. Check browser console for frontend errors
4. Check server terminal for backend errors
5. Read DEVELOPMENT.md for detailed examples

---

## 🎯 Success Criteria

You know you're set up correctly when:

✅ `http://localhost:5000/api/health` returns 200  
✅ `http://localhost:5173` loads without errors  
✅ You can login with admin@kiyumart.com / admin123  
✅ You can see products on homepage  
✅ You can create a product as admin  
✅ `npm run test:unit` passes  

**You're ready to develop!** 🎉

