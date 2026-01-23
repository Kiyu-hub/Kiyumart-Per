# KiyuMart - Islamic Women's Fashion E-commerce Marketplace

## Overview

KiyuMart is an e-commerce platform for modest Islamic women's fashion, functioning as both a single-store and multi-vendor marketplace. It provides comprehensive e-commerce features including product and order management, real-time delivery tracking, live chat, and Paystack payments. The platform supports a diverse product range, dynamic category and store management, extensive admin dashboards, and a robust application verification system for sellers and riders. The project aims to deliver a seamless and inclusive online shopping experience within the modest fashion market.

## Recent Changes (November 11, 2025)

### Production Readiness (Tasks 1-7 Complete)

1. **Single-Currency Formatting (GHS)** (Task 7): Centralized `formatPrice` utility enforces consistent GHS display across the UI
   - Created `PriceDisplay` component wrapping `formatPrice` from `useLanguage` hook
   - Systematic replacement across RiderDashboard, RiderDetailsPage, SellerDetailsPage, SellerDashboardConnected, Cart, ProductDetails
   - Internationalization and automatic currency switching have been disabled; platform displays prices in GHS only
   - Zero LSP errors, production-ready implementation

2. **Analytics Endpoints Stabilization** (Tasks 1-3): Fixed rider/seller analytics crashes
   - Fixed storage.getOrders() regression by migrating to storage.getOrdersByUser(userId, role)
   - Broadened admin access from super_admin-only to include admin role
   - Updated order counting logic to count only paymentStatus==="completed" orders
   - Rider deliveries and seller sales endpoints now stable

3. **UI Terminology Consistency** (Task 4): Replaced all "shipping" references with "delivery" across dashboards

4. **Seller Onboarding Enhancement** (Tasks 5-6): Conditional forms with vehicleInfo JSONB validation

### Completed Features

1. **WhatsApp-Style Message Status Ticks**: Real-time message delivery and read status indicators
   - Single gray tick: Message sent to server
   - Double gray tick: Message delivered to recipient
   - Double blue tick: Message read by recipient
   - Real-time updates via Socket.IO (no page refresh needed)
   - React Query cache optimistic updates for instant UI feedback
   - Backend handlers: `message_delivered` and `message_read` events
   - Component: MessageStatusTicks with color-coded status display

2. **Production-Ready WebRTC Voice/Video Calling**: Full peer-to-peer calling system for admins
   - Voice and video calling between admin and all user roles
   - Browser-based WebRTC using native getUserMedia API
   - Socket.IO signaling for offer/answer/ICE candidate exchange
   - STUN server: stun.l.google.com:19302 for NAT traversal
   - Incoming call dialog with caller identification
   - Ongoing call dialog with live video streams
   - Proper cleanup and media stream lifecycle management
   - Fixed critical ICE candidate bug (stale closure issue resolved)
   - Phone/Video buttons with smart disabled states during active calls

### Technical Improvements

- **NotificationContext Refactor**: Converted from refs to React state to expose live Socket.IO instance via useSocket() hook
- **ICE Candidate Fix**: Resolved stale closure bug by passing targetUserId as parameter to initPeerConnection() instead of relying on async state
- **WebRTC State Management**: Implemented proper peer connection lifecycle with refs for streams and peer connection objects
- **Message Status Architecture**: Socket.IO event listeners integrated with TanStack Query cache updates for real-time UI synchronization
- **Call Signaling Enhanced**: Backend call_offer handler now relays callType and callerName alongside offer for proper caller identification
- **Media Permissions**: Proper browser permission handling for camera and microphone access
- **LSP Clean**: Zero TypeScript errors across all new implementations

## Recent Changes (November 10, 2025)

### Completed Features

1. **Hero Banner CTAs**: Wired action buttons ("Shop Now", "Explore Collection", "View Deals") to navigate to product pages with proper filtering
2. **Product Expansion**: Seeded 50+ Islamic women's fashion products across 5 categories (Hijabs, Abayas, Modest Dresses, Islamic Accessories, Modest Footwear) with stock imagery
3. **Auto-Assign Riders**: Round-robin delivery assignment algorithm with load balancing (<10 active orders per rider), seeded 7 test orders across 5 riders
4. **Video Validation**: Corrected to strict <30 seconds (not ≤30s) per product requirements
5. **4K Image Enhancement**: Hybrid auto-upscaling system using Cloudinary transformations - automatically enhances images below 4K (3840×2160) with quality validation fallback
6. **Admin Dashboard Fixes**: Resolved 7 critical navigation and data access issues, fixed notification queryFn bug preventing invalid URLs

### Technical Improvements

- **Type Safety**: Fixed `vehicleInfo` JSONB type inference issues across rider seed data and application routes
- **Error Handling**: Improved upload endpoints to properly distinguish validation errors (400) from system errors (500)
- **Image Quality**: Cloudinary integration now includes smart 4K enhancement with crop: "fill", quality: "auto:best", and eager validation
- **LSP Diagnostics**: Zero TypeScript errors - all compilation issues resolved
- **Dashboard Navigation**: Fixed Live Delivery and Permissions button routing in AdminDashboardConnected
- **Role-Based Access**: Broadened Orders and Recent Orders data access from super_admin-only to include admin role
- **Query Bug Fix**: Added explicit queryFn to all notification pages (Admin, Rider, Seller) to prevent React Query's default fetcher from concatenating multi-element queryKeys with "|" which created invalid URLs like "/api/notifications|admin"
- **Notification System**: Enhanced with automatic notification creation for order status updates to buyers

## User Preferences

Preferred communication style: Simple, everyday language.

## System Architecture

### Frontend Architecture

The frontend is built with React 18 (Vite, TypeScript), using Wouter for routing and TanStack Query for server state management. UI components are developed with Shadcn UI (Radix UI primitives) and Tailwind CSS, focusing on responsive design. Key features include a persistent shopping cart, product browsing with advanced filters, real-time order tracking via Socket.IO, multi-language support with automatic currency switching, QR code generation, and role-based dashboards. It supports dynamic components for multi-vendor functionality, an admin branding system, a reusable media upload system integrated with Cloudinary, and comprehensive approval workflows. Public seller store routes are `sellers/:id`. The design removed all glassmorphism styles and mobile-specific components, reverting to a standard responsive desktop UI. The theme system has been overhauled to use modern fonts (Inter, Poppins, Playfair Display, Lora, JetBrains Mono, Fira Code), a neutral pure black/gray dark mode, and a vibrant orange primary color. Product image and video validation enforce specific dimensions and durations (4K images, videos under 30 seconds).

### Backend Architecture

The backend is an Express.js application with a native HTTP server and Socket.IO for real-time communication. Authentication is JWT-based with bcrypt for password hashing and implements role-based access control. PostgreSQL (Neon serverless) is the primary database, managed by Drizzle ORM for type-safe operations and Drizzle Kit for migrations. Cloudinary handles all media uploads. The API is RESTful, employing Zod for request validation and Multer for file uploads. Security features include Helmet, role-aware rate limiting, structured error logging, and HMAC signature verification for Paystack webhooks. The system supports a multi-vendor financial model with commission tracking, seller payout management, and automatic revenue splitting. An application verification system utilizes Ghana Card verification for sellers and riders.

### Database Schema Design

The database schema includes tables for Users, Products, Orders, Reviews, Delivery Zones, Transactions, Product Variants, Cart, Stores, Chat Messages, Hero Banners, and Footer Pages. It supports commission tracking, seller payouts, platform earnings, and application verification details such as `profileImage`, `ghanaCardFront`, `ghanaCardBack`, and `isApproved` flags.

## External Dependencies

-   **Cloudinary**: Media asset management.
-   **Paystack**: Payment processing (Card, Bank Transfers, Mobile Money).
-   **Frankfurter.app**: Currency conversion API.
-   **Neon Database**: Serverless PostgreSQL.
-   **Socket.IO**: Real-time communication.
-   **Drizzle ORM**: Type-safe database operations.
-   **TanStack Query**: Asynchronous state management.
-   **Shadcn UI + Radix UI**: UI component primitives.
-   **Tailwind CSS**: CSS framework.
-   **Wouter**: React router.
-   **JWT + Bcrypt**: Authentication and password security.
-   **Multer**: File uploads.
-   **React QR Code**: QR code generation.
-   **Leaflet.js**: Interactive maps (with OpenStreetMap).