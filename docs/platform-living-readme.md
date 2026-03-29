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
