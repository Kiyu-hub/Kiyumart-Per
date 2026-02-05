# KiyuMart - Modern Local Marketplace Platform

![KiyuMart](https://via.placeholder.com/1200x300/16a34a/ffffff?text=KiyuMart+-+Local+Marketplace)

> **✅ Production-Ready Platform**
>
> A **fully functional, production-ready local marketplace platform** enabling small businesses, artisans, and entrepreneurs to sell their products to local and regional customers. Multi-vendor support, comprehensive admin management, real-time order tracking, and secure payment processing.
> 
> **Version:** 1.1.4 (Latest - Multi-Vendor Promotional Ads Parity & Route Fixes)  
> **Status:** ✅ Production Ready with Enterprise-Grade Security  
> **Last Updated:** February 3, 2026
> 
> **📚 Documentation:** Start with [DOCUMENTATION_INDEX.md](./DOCUMENTATION_INDEX.md) for complete guides  
> **🚀 Quick Start:** See [QUICK_START.md](./QUICK_START.md) to get running in 5 minutes  
> **🔒 Security:** See [PRODUCTION_ASSESSMENT.md](./PRODUCTION_ASSESSMENT.md) for security audit

---

## 📖 Table of Contents

- [Overview](#overview)
- [Features](#features)
- [Documentation](#documentation)
- [Technology Stack](#technology-stack)
- [Getting Started](#getting-started)
 - [Testing](#testing)
- [Project Structure](#project-structure)
- [Configuration](#configuration)
- [User Roles & Permissions](#user-roles--permissions)
- [Deployment](#deployment)
- [Contributing](#contributing)
- [License](#license)

---

## 🌟 Overview

**KiyuMart** is a comprehensive local marketplace platform designed to empower entrepreneurs, small businesses, and artisans to reach customers in their local and regional markets. The platform operates as both a **single-store marketplace** and a **multi-vendor marketplace**, with dynamic switching controlled by super admin settings.

Key capabilities include product inventory management, secure payment processing via Paystack, real-time order tracking with live map visualization, single-currency (GHS) operation and English-only UI, and comprehensive admin/seller dashboards for business management.

### 🎯 Business Vision

To be the leading online marketplace platform for local businesses, connecting quality products with customers while providing tools, logistics support, and payment processing that empowers entrepreneurs to scale their operations regionally and internationally.

---

## ✨ Features

### 🛍️ Customer Features

- **Product Browsing**
  - Browse products across multiple categories
  - Advanced filtering, search, and sorting capabilities
  - Product variant selection (size, color, specifications)
  - High-quality product media (up to 5 images per product)
  - Product videos for detailed viewing
  - Customer reviews and ratings (1-5 stars)
  - Related products suggestions
  - Wishlist functionality with heart icons
  - Product comparison tools

- **Shopping Experience**
  - Persistent shopping cart with real-time updates
  - Single-currency support (GHS)
  - English-only UI
  - Mobile-first responsive design
  - Dark/light mode theme support
  - One-click checkout
  - Save payment methods securely

- **Order Management**
  - Secure Paystack payment integration with server-side verification
  - Real-time order tracking with live map visualization (Leaflet.js + OpenStreetMap)
  - QR code generation for order verification
  - Order history and status tracking
  - Email and push notifications
  - Estimated delivery time display
  - Order invoice generation

- **User Account**
  - Profile picture upload (Cloudinary integration)
  - Personal information management
  - Multiple address management (home, work, other)
  - Order history and repeat purchase
  - Wishlist management
  - Settings and preferences (notifications, theme, language)
  - Account security settings

### 👨‍💼 Admin Features (Super Admin)

- **Dashboard Analytics**
  - Total revenue tracking with currency conversion
  - Order statistics (daily, weekly, monthly)
  - Product performance metrics
  - User growth analytics
  - Real-time order monitoring
  - Sales trends and forecasting

- **Platform Settings** (`/admin/settings`)
  - **General Settings**: Platform name, multi-vendor mode toggle
  - **Payment Configuration**: Paystack API keys (public/secret), processing fee percentage
  - **Cloudinary Storage**: Cloud name, API key, API secret for image storage
  - **Contact Information**: Phone, email, address, social media links
  - **Branding**: Primary color customization, logo upload
  - **Currency**: Default currency selection (GHS)
  - **Footer Content**: Dynamic footer description and contact details
  - **Feature Toggles**: Enable/disable specific marketplace features
  - **Security Settings**: API rate limiting, request size limits

- **Delivery Zone Management** (`/admin/delivery-zones`)
  - Create, edit, and delete delivery zones
  - Set delivery fees per zone
  - Configure estimated delivery times
  - Manage zone coverage areas (geographic boundaries)
  - Enable/disable zones dynamically
  - Export zone analytics

- **Product Management**
  - Add, edit, delete products
  - Manage product variants (sizes, colors, specifications)
  - Upload multiple images and videos
  - Inventory management with stock alerts
  - Category assignment with hierarchical organization
  - Pricing control (cost price, selling price, discounts)
  - Bulk product operations
  - Product approval workflows
  - Tax configuration per product

- **Order Management**
  - View all orders with advanced filtering
  - Update order status (pending, confirmed, shipped, delivered, cancelled)
  - Assign riders to orders
  - Process refunds and returns
  - Export order data (CSV, PDF)
  - Batch order operations
  - Order analytics and reporting

- **User Management**
  - View all users (customers, sellers, riders, agents)
  - Manage user roles and permissions
  - Enable/disable accounts
  - View user activity logs
  - User verification management
  - Bulk user import
  - Export user data for analysis

- **Hero Banner Management**
  - Create promotional banners with rich media
  - Auto-scrolling carousel
  - Schedule banner visibility (start/end dates)
  - Image upload and positioning
  - Banner performance analytics
  - A/B testing support

- **Ads Configuration**
  - Manage homepage, sidebar, product-page, and footer ads via Admin Settings
  - Ad links accept absolute URLs (https://...), relative paths (/category/...), anchors (#section), and protocol links like mailto: and tel:
  - Recommended image sizes and responsive behavior are shown in the Admin Settings UI
  - Ads respect `adsEnabled` flag and can be toggled on/off by admin
  - Individual ad placements (Hero, Sidebar, Footer, Product page) now have per-position toggles (`heroBannerEnabled`, `sidebarAdEnabled`, `footerAdEnabled`, `productPageAdEnabled`) in Admin Settings.
  - External ad links now support protocol-relative URLs (`//host/path`) and external http(s) links open in a new tab (`target="_blank"`). Internal/anchor links remain SPA-friendly and use client navigation or smooth-scroll behavior.
  - UI Display: The platform now renders **Hero** (homepage), **Sidebar** (homepage - large screens), **Product Page** (product detail pages), and **Footer** ads when configured.
  
  - Promotional Ads: Admins can create time-limited promotional placements that feature a **store** or **product**. Promotions include a live client-side countdown, appear as a full-height sticky **Sidebar** variant on large screens and as a full-width block on mobile, and are automatically expired either by admin action or by the background worker. The Admin Promotions UI provides a seller→product selector, supports adding multiple products at once (bulk create for product promotions), and scheduling (start/end times). Promotions now support rich fields: **title**, **description**, **image URL**, **CTA text & URL**, and **theme color** for custom branding. Playwright e2e tests cover create → visible → expire → removal lifecycle.
  
  - **Multi-Vendor Mode Parity (v1.1.4):** Promotional ads and banner ads are now fully supported in multi-vendor mode. The MultiVendorHome component displays hero ads, promotional grids (for 2+ promotions), sidebar promotions/ads, and footer ads—identical to single-vendor mode. Store routes use `/sellers/:id` consistently across all components.

Development notes:
  - The Vite dev server proxies `/api` to `http://localhost:5000` (backend) to keep client API calls consistent in development and avoid mismatches between ports (e.g., `5173`, `5174`). This is set in `vite.config.ts`.
  - If you see inconsistent behavior between ports (frontend appearing stale on one port while the backend reflects changes), kill extra Vite instances and restart the dev server (`npm run dev:frontend`) so only one dev server runs on `5173`.
  - Optionally set `VITE_API_URL` to `http://localhost:5000` if you want the client to always use the backend origin for API calls instead of relying on the proxy.

- **Product Card Pricing**
  - Product cards show a sale price and (when applicable) the original/cost price as a struck-through value to highlight discounts and savings.

- **Rider Management** (Logistics Partner)
  - Register and manage delivery riders
  - Track rider performance metrics
  - Assign delivery zones to riders
  - View rider earnings and payouts
  - Approve/reject rider applications
  - Manage rider commissions

- **Reporting & Analytics**
  - Sales reports by product, category, seller
  - User activity reports
  - Payment reconciliation reports
  - Tax reports
  - Inventory reports
  - Performance dashboards

### 🏪 Seller Features (Multi-Vendor Mode)

- **Seller Dashboard**
  - Sales analytics (daily, weekly, monthly)
  - Product performance tracking
  - Revenue reports with withdrawal history
  - Order notifications in real-time
  - Marketing tools and promotions
  - Customer reviews and feedback

- **Product Management**
  - Add own products with full customization
  - Manage inventory with stock alerts
  - Set pricing and discounts
  - Upload product media (images and videos)
  - Track product views, click-through rates, and sales
  - Batch product operations
  - Product variant management
  - Automatic best-seller labeling

- **Order Processing**
  - View incoming orders with filters
  - Update order status and customer communication
  - Manage fulfillment (accept/reject orders)
  - Customer communication through in-app messaging
  - Order fulfillment tracking
  - Return and refund management

- **Store Customization**
  - Store name and description
  - Store banner and logo upload
  - Store policy settings
  - Social media links

- **Payments & Payouts**
  - Real-time sales tracking
  - Withdrawal requests with approval workflow
  - Payout history and statements
  - Commission calculation transparency
  - Tax reporting

### 🚴 Rider Features (Delivery Partner)

- **Delivery Dashboard**
  - Assigned deliveries list with status
  - Route optimization for efficient delivery
  - Real-time location tracking
  - Delivery status updates and proof of delivery

- **Order Management**
  - View delivery details (recipient, address, items)
  - Update delivery status (picked up, in transit, delivered)
  - Customer contact information
  - Navigation assistance with maps
  - Photo/signature capture for delivery proof
  - Delivery history and earnings

  ## 🧪 Testing

  This repository includes unit and Playwright e2e tests. The project includes a GitHub Actions workflow that runs tests on push and pull requests to `main`.

  Refer to `TEST_CREDENTIALS.md` for a central, safe reference of test account emails and instructions for obtaining tokens (no plaintext passwords are included).

  Local test commands:

  ```bash
  # Install deps
  npm ci

  # Run unit tests
  npm run test:unit

  # Start backend (in a separate terminal)
  npx tsx server/index.ts (Backend: http://localhost:5000)

  # Start frontend (in a separate terminal)
  npm run dev:frontend (Vite frontend: http://localhost:5173)

  ## Local dev URLs
  - Frontend: http://localhost:5173
  - Backend API: http://localhost:5000
  - Playwright tests expect the backend and frontend to be running. Use the test-only helper `POST /api/test/token` (development only) to obtain JWTs for seeded users to avoid repeated UI logins and rate-limits in CI.

  # Install Playwright browsers (first time)
  npx playwright install chromium

  # Run e2e tests (expects backend and frontend to be running)
  npx playwright test --project=chromium
  ```

  Notes:
  - In CI we install Playwright browsers with `--with-deps`. If you encounter Playwright browser errors locally, run `npx playwright install --with-deps` and ensure required system libraries are present.
  - The tests assume `SESSION_SECRET` is set; the CI workflow sets `SESSION_SECRET=testsecret` for e2e runs.
  - For faster, more reliable e2e runs that don't trigger rate limits, tests may obtain tokens using the test-only endpoint `POST /api/test/token` (development/testing only). This avoids repeated UI logins and prevents 429s in CI.


---

## � Documentation

### Quick References
- **[DOCUMENTATION_INDEX.md](./DOCUMENTATION_INDEX.md)** - Central hub for all documentation (START HERE!)
- **[QUICK_START.md](./QUICK_START.md)** - Get running in 5 minutes
- **[ARCHITECTURE.md](./ARCHITECTURE.md)** - Complete system design (1000+ lines)
- **[DEVELOPMENT.md](./DEVELOPMENT.md)** - Development guide with code examples
- **[DEPLOYMENT.md](./DEPLOYMENT.md)** - Production deployment instructions
- **[PRODUCTION_ASSESSMENT.md](./PRODUCTION_ASSESSMENT.md)** - Security audit & readiness report

### Choose Your Path

**I'm a New Developer:**
→ Start with [QUICK_START.md](./QUICK_START.md), then read [DEVELOPMENT.md](./DEVELOPMENT.md)

**I Need to Understand the System:**
→ Read [ARCHITECTURE.md](./ARCHITECTURE.md) for complete technical overview

**I'm Deploying to Production:**
→ Follow [DEPLOYMENT.md](./DEPLOYMENT.md) step-by-step

**I Need API Documentation:**
→ See [ARCHITECTURE.md](./ARCHITECTURE.md#api-architecture) for complete API reference

**I Need Help:**
→ Check [DOCUMENTATION_INDEX.md](./DOCUMENTATION_INDEX.md) to find what you need

---

## �🛠️ Technology Stack

### Frontend
- **Framework**: React 18 with Vite
- **Language**: TypeScript
- **Routing**: Wouter (lightweight React router)
- **State Management**: 
  - TanStack Query v5 (server state)
  - Zustand (client state)
  - Context API (theme, language)
- **UI Components**: Shadcn UI (Radix UI primitives)
- **Styling**: Tailwind CSS with custom green theme
- **Forms**: React Hook Form with Zod validation
- **Maps**: Leaflet.js with OpenStreetMap
- **Real-time**: Socket.IO Client
- **Icons**: Lucide React, React Icons
- **QR Codes**: React QR Code

### Backend
- **Runtime**: Node.js
- **Framework**: Express.js
- **Language**: TypeScript (tsx runtime)
- **Real-time**: Socket.IO
- **Authentication**: JWT + Bcrypt
- **Session Management**: express-session with connect-pg-simple
- **File Upload**: Multer
- **Validation**: Zod with zod-validation-error

### Database
- **Database**: PostgreSQL (Neon Serverless)
- **ORM**: Drizzle ORM (type-safe SQL)
- **Migrations**: Drizzle Kit
- **Schema Validation**: Drizzle Zod

### External Services
- **Payment Gateway**: Paystack API
- **Media Storage**: Cloudinary (images, videos)
- **Currency Conversion**: Not used — platform operates in GHS only
- **Maps**: OpenStreetMap with Leaflet.js

### Development Tools
- **Build Tool**: Vite
- **Package Manager**: npm
- **Type Checking**: TypeScript
- **Code Quality**: ESBuild

---

## 🚀 Getting Started

### Prerequisites

- **Node.js** 18+ installed
- **PostgreSQL** database (or use Replit's built-in Neon database)
- **Cloudinary** account for media storage
- **Paystack** account for payment processing

### Installation

1. **Clone the repository**
   ```bash
   git clone <repository-url>
   cd kiyumart
   ```

2. **Install dependencies**
   ```bash
   npm install
   ```

3. **Set up environment variables**
   
   Create a `.env` file or configure in Replit Secrets:
   ```env
   # Database (auto-configured on Replit)
   DATABASE_URL=postgresql://...
   PGHOST=...
   PGPORT=...
   PGDATABASE=...
   PGUSER=...
   PGPASSWORD=...

   # Cloudinary (configure via Admin Settings or env vars)
   CLOUDINARY_CLOUD_NAME=your-cloud-name
   CLOUDINARY_API_KEY=your-api-key
   CLOUDINARY_API_SECRET=your-api-secret
   ```

4. **Initialize the database**
   ```bash
   npm run db:push
   ```

5. **Run the development server**
   ```bash
   npm run dev
   ```

6. **Access the application**
   - Frontend: `http://localhost:5000`
   - Backend API: `http://localhost:5000/api`

### First-Time Setup

1. **Access Admin Settings**
   - Navigate to `/admin/settings`
   - Default admin credentials are set during database initialization

2. **Configure Platform**
   - **Paystack**: Enter your Paystack public and secret keys
   - **Cloudinary**: Enter your Cloudinary credentials
   - **Contact Info**: Add your business contact details
   - **Delivery Zones**: Set up delivery areas and fees

3. **Add Products**
   - Go to Admin Dashboard
   - Add product categories
   - Upload products with images and variants
   - Set pricing and inventory

4. **Test Payment**
   - Use Paystack test keys for development
   - Test cards: `4084084084084081` (successful), `4084084084084095` (insufficient funds)

---

## 📁 Project Structure

```
kiyumart/
├── client/                  # Frontend React application
│   ├── src/
│   │   ├── components/      # Reusable UI components
│   │   │   ├── Header.tsx
│   │   │   ├── Footer.tsx
│   │   │   ├── ProductCard.tsx
│   │   │   ├── QRCodeDisplay.tsx
│   │   │   └── ui/          # Shadcn UI components
│   │   ├── pages/           # Route pages
│   │   │   ├── Home.tsx
│   │   │   ├── ProductDetails.tsx
│   │   │   ├── Cart.tsx
│   │   │   ├── Checkout.tsx
│   │   │   ├── AdminDashboard.tsx
│   │   │   ├── AdminSettings.tsx
│   │   │   ├── AdminDeliveryZones.tsx
│   │   │   ├── SellerDashboard.tsx
│   │   │   └── RiderDashboard.tsx
│   │   ├── contexts/        # React contexts
│   │   │   └── LanguageContext.tsx
│   │   ├── lib/             # Utilities
│   │   │   ├── auth.tsx
│   │   │   └── queryClient.ts
│   │   └── App.tsx          # Main app with routes
│   └── index.html
├── server/                  # Backend Express application
│   ├── routes.ts            # API routes
│   ├── storage.ts           # Database operations (IStorage)
│   ├── index.ts             # Server entry point
│   └── vite.ts              # Vite dev server integration
├── shared/                  # Shared types and schemas
│   └── schema.ts            # Drizzle ORM schema + Zod validation
├── attached_assets/         # User-uploaded static assets
├── package.json             # Dependencies and scripts
├── vite.config.ts           # Vite configuration
├── tailwind.config.ts       # Tailwind CSS configuration
├── drizzle.config.ts        # Drizzle ORM configuration
└── README.md                # This file
```

---

## ⚙️ Configuration

### Admin Settings Page (`/admin/settings`)

The platform can be fully configured through the admin settings interface:

#### 1. General Settings
- **Platform Name**: Your marketplace brand name
- **Multi-Vendor Mode**: Toggle between single-store and multi-vendor marketplace

#### 2. Payment Settings
- **Paystack Public Key**: For frontend payment initialization
- **Paystack Secret Key**: For backend payment verification
- **Processing Fee**: Percentage fee per transaction (e.g., 1.95%)

#### 3. Cloudinary Settings
- **Cloud Name**: Your Cloudinary account identifier
- **API Key**: Cloudinary API key
- **API Secret**: Cloudinary API secret (encrypted)

#### 4. Contact Information
- **Phone**: Business phone number
- **Email**: Support email address
- **Address**: Physical business address
- **Social Media**: Facebook, Instagram, Twitter URLs
- **Footer Description**: Brief platform description

#### 5. Branding
- **Primary Color**: Main theme color (HSL format)
- **Logo Upload**: Platform logo (light and dark versions)

#### 6. Currency
  - **Default Currency**: GHS (single-currency platform)
### Delivery Zones (`/admin/delivery-zones`)

Configure delivery areas and pricing:
- **Zone Name**: e.g., "Accra Central", "Lagos Island"
- **Coverage Area**: Description of the area covered
- **Delivery Fee**: Cost in default currency
- **Estimated Time**: e.g., "1-2 days", "Same day"
- **Active Status**: Enable/disable the zone

---

## 👥 User Roles & Permissions

### Super Admin
- Full platform access
- Manage all settings
- User management
- Financial reports
- System configuration

### Admin
- Product management
- Order management
- User support
- Analytics access
- Cannot change platform settings

### Seller (Multi-Vendor Mode)
- Manage own products
- View own orders
- Sales analytics
- Product inventory
- Cannot access other sellers' data

### Rider
- View assigned deliveries
- Update delivery status
- Access customer contact info
- Location tracking

### Customer
- Browse products
- Place orders
- Track deliveries
- Manage profile
- Leave reviews

---

## 📡 API Documentation

### Authentication Endpoints

```
POST   /api/auth/register          # Register new user
POST   /api/auth/login             # Login
GET    /api/auth/me                # Get current user
POST   /api/auth/logout            # Logout
```

### Product Endpoints

```
GET    /api/products               # Get all products (with filters)
# Note: Product objects include `costPrice` when set (string decimal)
GET    /api/products/:id           # Get single product
POST   /api/products               # Create product (seller)
POST   /api/admin/products         # Create product on behalf of a seller (admin/super_admin)
# Note: The "original" price equals the product's `costPrice` (if set). When `costPrice` is higher than the selling `price`, it will be shown as the struck-through original price and the discount percent will be displayed.
PATCH  /api/products/:id           # Update product (admin/seller)
DELETE /api/products/:id           # Delete product (admin/seller)
GET    /api/products/:id/variants  # Get product variants
GET    /api/products/:id/reviews   # Get product reviews
```

### Order Endpoints

```
POST   /api/orders                 # Create order
GET    /api/orders                 # Get user's orders
GET    /api/orders/:id             # Get order details
PATCH  /api/orders/:id             # Update order status (admin)
POST   /api/orders/:id/assign      # Assign rider (admin)
```

### Cart Endpoints

```
GET    /api/cart                   # Get cart items
POST   /api/cart                   # Add to cart
PATCH  /api/cart/:id               # Update cart item
DELETE /api/cart/:id               # Remove from cart
```

### Wishlist Endpoints

```
GET    /api/wishlist               # Get wishlist
POST   /api/wishlist               # Add to wishlist
DELETE /api/wishlist/:productId    # Remove from wishlist
```

### Payment Endpoints

```
POST   /api/payments/initialize    # Initialize Paystack payment
GET    /api/payments/verify/:ref   # Verify payment
```

### Settings Endpoints

```
GET    /api/settings               # Get platform settings (public)
PATCH  /api/settings               # Update settings (admin only)
```

### Delivery Zones

```
GET    /api/delivery-zones         # Get all active zones
POST   /api/delivery-zones         # Create zone (admin)
PATCH  /api/delivery-zones/:id     # Update zone (admin)
DELETE /api/delivery-zones/:id     # Delete zone (admin)
```

### Reviews

```
POST   /api/reviews                # Create review
GET    /api/products/:id/reviews   # Get product reviews
```

---

## 🗄️ Database Schema

### Core Tables

- **users**: User accounts (customers, admins, sellers, riders)
- **products**: Product catalog with variants
- **product_variants**: Size/color combinations with stock
- **orders**: Customer orders with delivery tracking
- **order_items**: Individual products in orders
- **reviews**: Product reviews and ratings
- **cart**: Shopping cart items
- **wishlist**: User wishlist items
- **delivery_zones**: Configurable delivery areas
- **delivery_tracking**: Real-time GPS location tracking
- **chat_messages**: Customer support chat
- **transactions**: Paystack payment records
- **hero_banners**: Homepage promotional banners
- **platform_settings**: Dynamic configuration (singleton table)

### Key Relationships

```
users (1) ─── (N) products (seller)
users (1) ─── (N) orders
users (1) ─── (N) reviews
products (1) ─── (N) product_variants
products (1) ─── (N) reviews
orders (1) ─── (N) order_items
orders (1) ─── (N) delivery_tracking
```

---

## 🚀 Deployment

### Replit Deployment (Recommended)

1. **Configure Deployment**
   - Click "Deploy" button in Replit
   - Deployment is pre-configured for Autoscale

2. **Set Production Secrets**
   - Add production Paystack keys
   - Add production Cloudinary credentials
   - Database URL is auto-configured

3. **Deploy**
   - Replit handles SSL, CDN, and scaling automatically
   - Custom domain support available

### Manual Deployment

#### Build for Production

```bash
npm run build
```

#### Run Production Server

```bash
NODE_ENV=production node server/index.js
```

#### Environment Requirements

- Node.js 18+
- PostgreSQL database
- Redis (optional, for sessions)
- Port 5000 or PORT environment variable

#### Reverse Proxy (Nginx)

```nginx
server {
    listen 80;
    server_name yourdomain.com;

    location / {
        proxy_pass http://localhost:5000;
        proxy_http_version 1.1;
        proxy_set_header Upgrade $http_upgrade;
        proxy_set_header Connection 'upgrade';
        proxy_set_header Host $host;
        proxy_cache_bypass $http_upgrade;
    }
}
```

---

## 🔐 Environment Variables

### Required

```env
# Database (Replit provides these automatically)
DATABASE_URL=postgresql://user:pass@host:port/db
PGHOST=host
PGPORT=5432
PGDATABASE=dbname
PGUSER=user
PGPASSWORD=password
```

### Optional (Can be configured via Admin Settings)

```env
# Cloudinary (or configure in Admin Settings)
CLOUDINARY_CLOUD_NAME=your-cloud-name
CLOUDINARY_API_KEY=your-api-key
CLOUDINARY_API_SECRET=your-api-secret

# Paystack (or configure in Admin Settings)
PAYSTACK_PUBLIC_KEY=pk_test_xxxxx
PAYSTACK_SECRET_KEY=sk_test_xxxxx
```

### Session Secret (Auto-generated)

```env
SESSION_SECRET=auto-generated-on-first-run
```

---

## 🎨 Customization

### Theme Colors

Edit `client/src/index.css`:

```css
:root {
  --primary: 142.1 76.2% 36.3%;        /* Green #16a34a */
  --primary-foreground: 0 0% 100%;      /* White */
  --destructive: 0 84.2% 60.2%;         /* Red for discounts */
  --background: 0 0% 100%;              /* White */
  --foreground: 240 10% 3.9%;           /* Dark text */
}

.dark {
  --primary: 142.1 76.2% 36.3%;        /* Same green */
  --background: 240 10% 3.9%;           /* Dark background */
  --foreground: 0 0% 98%;               /* Light text */
}
```

### Logo

Upload custom logos via Admin Settings or replace:
- Light mode: Upload via branding section
- Dark mode: Upload dark variant
- Footer logo: Automatically uses uploaded logos

---

## 🧪 Testing

### Test Accounts

**Admin Account:**
- Email: `admin@kiyumart.com`
- Password: `admin123`

**Customer Account:**
- Email: `customer@test.com`
- Password: `password123`

### Paystack Test Cards

- **Successful**: `4084084084084081`
- **Insufficient Funds**: `4084084084084095`
- **CVV**: 408
- **PIN**: 0000
- **Expiry**: Any future date

---

## 📱 Language Support

This platform uses English as the single supported language. Internationalization and automatic language-to-currency switching have been removed; the UI and documentation are English-only. To add languages later, implement a `LanguageContext` with translations and expose a selector in the header.

---

## 🛡️ Security Features

- **Authentication**: JWT-based with httpOnly cookies
- **Password Hashing**: Bcrypt with salt rounds
- **Role-Based Access Control**: Middleware authorization
- **Input Validation**: Zod schema validation
- **SQL Injection Protection**: Drizzle ORM parameterized queries
- **XSS Protection**: React automatic escaping
- **CSRF Protection**: Same-origin policy
- **Secure File Upload**: MIME type validation, size limits
- **Payment Security**: Paystack server-side verification

---

## 📊 Analytics & Monitoring

### Admin Dashboard Metrics

- **Revenue Analytics**: Daily, weekly, monthly revenue
- **Order Tracking**: Pending, processing, delivered
- **Product Performance**: Top-selling products
- **User Growth**: New registrations, active users
- **Inventory Alerts**: Low stock notifications

### Real-Time Features

- **Live Order Updates**: Socket.IO notifications
- **Delivery Tracking**: GPS location updates
- **Chat Notifications**: Unread message counts
- **Stock Updates**: Real-time inventory changes

---

## 🔧 Troubleshooting

### Common Issues

**1. Database Connection Error**
```
Solution: Check DATABASE_URL and ensure PostgreSQL is running
```

**2. Paystack Payment Fails**
```
Solution: Verify Paystack keys in Admin Settings
Ensure using test keys in development
```

**3. Images Not Uploading**
```
Solution: Check Cloudinary credentials in Admin Settings
Verify CLOUDINARY_CLOUD_NAME, API_KEY, API_SECRET
```

**4. Socket.IO Connection Failed**
```
Solution: Ensure server is running on correct port
Check firewall settings for WebSocket connections
```

**5. Cart Shows NaN Price**
```
Solution: Already fixed - ensure products have valid prices
Run database migration: npm run db:push
```

---

## 🤝 Contributing

We welcome contributions! Please follow these guidelines:

1. Fork the repository
2. Create a feature branch (`git checkout -b feature/AmazingFeature`)
3. Commit your changes (`git commit -m 'Add some AmazingFeature'`)
4. Push to the branch (`git push origin feature/AmazingFeature`)
5. Open a Pull Request

### Code Style

- Use TypeScript for all new code
- Follow existing naming conventions
- Add comments for complex logic
- Include data-testid attributes for UI elements
- Validate forms with Zod schemas

### Pre-push checks ✅

To help prevent common problems from reaching CI or production, please run the following before pushing:

- Typecheck: `npm run typecheck` — this runs `tsc --noEmit` and will catch TypeScript errors early.
- Run tests: `npm run test:e2e` (Playwright) and `npm run test:unit` when relevant.

Testing helpers:

- `e2e/test-utils.ts#getTestToken(request, email)` is a small helper that returns a test JWT (via `/api/test/token`) for Playwright tests. Use it to avoid duplicated token-fetching logic and block-scoped redeclaration issues in tests.

Adding these checks locally keeps CI fast and reduces churn in PRs.
---

## 📄 License

This project is licensed under the MIT License - see the LICENSE file for details.

---

## 👨‍💻 Author

**KiyuMart Development Team**

---

## 🙏 Acknowledgments

- **Shadcn UI** - Beautiful accessible components
- **Drizzle ORM** - Type-safe database operations
- **Paystack** - Reliable African payment gateway
- **Cloudinary** - Powerful media management
- **Replit** - Seamless deployment platform
- **OpenStreetMap** - Free mapping solution

---

## 📞 Support

For support and questions:
- **Email**: Configure in Admin Settings → Contact Info
- **Phone**: Configure in Admin Settings → Contact Info
- **Documentation**: This README
- **Issues**: GitHub Issues (if applicable)

---

## 🗺️ Roadmap

### Planned Features

- [ ] SMS notifications (Twilio integration)
- [ ] Email marketing campaigns
- [ ] Advanced analytics dashboard
- [ ] Inventory forecasting
- [ ] Seller onboarding wizard
- [ ] Mobile app (React Native)
- [ ] Multi-warehouse support
- [ ] Subscription-based products
- [ ] Gift cards and vouchers
- [ ] Affiliate marketing program
- [ ] AI-powered product recommendations
- [ ] Advanced SEO optimization
- [ ] PWA (Progressive Web App) support

---

## 🔄 Recent Updates

### February 2, 2026
- **Enhanced Promotional System**: Complete overhaul of promotional ads with real-time updates and improvements
  - Auto-generate CTA URLs based on store/product selection
  - Image upload functionality with drag-drop support
  - Automatic fallback to store logo/product image if no custom upload
  - Real-time table updates using 3-second polling + instant mutation refetch
  - Fixed status calculation to use server-side `isActive` field
  - Fixed promotion expiry logic to handle NULL endAt values properly
- **Admin UI Improvements**: 
  - Fixed ProductAutocomplete visibility - now uses proper background/foreground colors
  - Improved dropdown styling with better contrast and accessibility
  - Fixed product input field visibility when seller is selected
- **Bug Fixes**:
  - Resolved multiple promotions showing as active but not updating
  - Fixed end promotion action not reflecting changes in real-time
  - Improved mutation refetch handling with proper async/await
  - Added `isNotNull` check to promotional ads expiry query

### February 1, 2026
- **Comprehensive Promotions Overhaul**:
  - Removed theme color input (now uses primary brand colors)
  - Implemented auto-CTA URL generation
  - Added image upload with default fallback
  - Fixed promotions dashboard visibility
  - Redesigned promotion cards with better display
  - Implemented vertical space optimization

### November 6, 2025
- **Fixed Admin Messaging**: AdminMessages now properly filters conversations by userId when clicking "Message" from AdminUsers page
- **Renamed Delivery Partner**: Changed all "Become a Rider" references to "Become a Delivery Partner" throughout the platform
- **Verified Agent Dashboard**: Confirmed AgentDashboard exists and is properly routed at `/agent`
- **Added Comprehensive Documentation**: Added AI protection guidelines and detailed architecture documentation to README

### November 5, 2025
- **Fixed AdminUsers**: Now displays ALL user roles (admin, seller, buyer, rider, agent) instead of just buyers
- **Fixed Seller Creation**: POST /api/users now automatically creates associated store when admin adds new seller
- **Admin Chat Access**: Admins now have same permissions as agents for support conversations
- **Ghana Card Verification**: Enhanced application system with profile photo and Ghana Card image verification
- **Image Optimizations**: Reduced product card and detail page image sizes for better layout
- **Primary Store Architecture**: Added centralized marketplace with primary store selection for single-store mode
- **Registration Controls**: Added admin toggles for seller and delivery partner registrations

### November 3, 2025
- Initial production deployment with full feature set

---

**Built with ❤️ for the Islamic Fashion Community**

*Last Updated: February 2, 2026*

