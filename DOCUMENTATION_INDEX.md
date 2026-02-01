# KiyuMart Documentation Index

**Purpose:** Central hub for all KiyuMart project documentation  
**Created:** January 23, 2026  
**For:** Developers, AI models, DevOps engineers, project managers

---

## 📚 Documentation Overview

This project has comprehensive documentation for every aspect of the platform. Choose your role/need below:

---

## 🚀 **I'm Starting Fresh (New Developer)**

**Start here:** [QUICK_START.md](./QUICK_START.md)
- 5-minute setup instructions
- Login credentials
- Common tasks
- Troubleshooting

**Then read:** [DEVELOPMENT.md](./DEVELOPMENT.md)
- Project structure
- How to add features
- Common development tasks
- Testing guidelines

**Reference:** [ARCHITECTURE.md](./ARCHITECTURE.md)
- System design
- Database schema
- API endpoints
- Technology stack

---

## 🏗️ **I Need to Understand the System**

**Architecture & Design:**
- [ARCHITECTURE.md](./ARCHITECTURE.md) - Complete system architecture (1000+ lines)
  - System overview & diagrams
  - Technology stack details
  - Database schema & relationships
  - API architecture & endpoints
  - Frontend/backend structure
  - Security layers
  - Performance considerations

**Code Organization:**
- [README.md](./README.md) - Project overview
  - Features by user role
  - Technology stack
  - Getting started
  - Project structure

**Data Model:**
- See [ARCHITECTURE.md](./ARCHITECTURE.md) section: "Database Design"
  - Complete schema
  - Table relationships
  - Indexing strategy

---

## 💻 **I'm a Developer Building Features**

**Setup:**
1. [QUICK_START.md](./QUICK_START.md) - Get running in 5 minutes
2. [DEVELOPMENT.md](./DEVELOPMENT.md) - Development guide

**Development Tasks:**
- Adding a new API endpoint - See [DEVELOPMENT.md](./DEVELOPMENT.md#task-add-a-new-api-endpoint)
- Adding a database table - See [DEVELOPMENT.md](./DEVELOPMENT.md#task-add-a-new-database-table)
- Fixing a bug - See [DEVELOPMENT.md](./DEVELOPMENT.md#task-fix-a-bug-in-authentication)
- Optimizing queries - See [DEVELOPMENT.md](./DEVELOPMENT.md#task-optimize-a-slow-query)

**Code Patterns:**
- API endpoint patterns - [DEVELOPMENT.md](./DEVELOPMENT.md#api-endpoint-patterns)
- React component patterns - [DEVELOPMENT.md](./DEVELOPMENT.md#react-component-patterns)
- TypeScript best practices - [DEVELOPMENT.md](./DEVELOPMENT.md#typescript-best-practices)

**Testing:**
- Running tests - [DEVELOPMENT.md](./DEVELOPMENT.md#running-tests)
- Writing tests - [DEVELOPMENT.md](./DEVELOPMENT.md#writing-tests)

**Debugging:**
- Debugging tips - [DEVELOPMENT.md](./DEVELOPMENT.md#debugging-tips)
- Common issues - [DEVELOPMENT.md](./DEVELOPMENT.md#common-issues--solutions)

---

## 🚢 **I'm Deploying to Production**

**Follow this sequence:**

1. **Pre-Deployment Preparation**
   - [DEPLOYMENT.md](./DEPLOYMENT.md#pre-deployment-checklist) - Run pre-deployment checklist

2. **Production Setup**
   - [DEPLOYMENT.md](./DEPLOYMENT.md#environment-setup) - Configure environment variables
   - [DEPLOYMENT.md](./DEPLOYMENT.md#database-deployment) - Setup database (Neon)

3. **Deploy Backend**
   - [DEPLOYMENT.md](./DEPLOYMENT.md#backend-deployment) - Deploy with Render

4. **Deploy Frontend**
   - [DEPLOYMENT.md](./DEPLOYMENT.md#frontend-deployment) - Deploy with Netlify

5. **Verify & Monitor**
   - [DEPLOYMENT.md](./DEPLOYMENT.md#post-deployment-verification) - Run verification tests
   - [DEPLOYMENT.md](./DEPLOYMENT.md#monitoring--maintenance) - Setup monitoring

---

## 🔒 **I Need to Understand Security**

**Security Overview:**
- [ARCHITECTURE.md](./ARCHITECTURE.md#authentication--security) - Security layers and implementation
- [PRODUCTION_ASSESSMENT.md](./PRODUCTION_ASSESSMENT.md#security-enhancements-v111) - v1.1.1 security hardening

**Specific Topics:**
- Authentication & JWT - [ARCHITECTURE.md](./ARCHITECTURE.md#authentication--authorization)
- Security headers - [DEPLOYMENT.md](./DEPLOYMENT.md#sslhttps-configuration)
- Password security - [ARCHITECTURE.md](./ARCHITECTURE.md#password-security)
- RBAC (Role-Based Access Control) - [ARCHITECTURE.md](./ARCHITECTURE.md#authentication--authorization)
- Request protection - [PRODUCTION_ASSESSMENT.md](./PRODUCTION_ASSESSMENT.md#request-protection)

**Checklist:**
- [PRODUCTION_ASSESSMENT.md](./PRODUCTION_ASSESSMENT.md#security-checklist) - Security verification checklist

---

## 📊 **I Need API Documentation**

**All Endpoints:**
- [ARCHITECTURE.md](./ARCHITECTURE.md#api-architecture) - Complete API architecture
  - RESTful endpoint structure
  - Request/response patterns
  - Authentication methods
  - Status codes

**Endpoint Quick Reference:**
- [QUICK_START.md](./QUICK_START.md#key-endpoints-most-common) - Most common endpoints
- [ARCHITECTURE.md](./ARCHITECTURE.md#restful-endpoints-structure) - Full endpoint list

**Example Usage:**
- [DEVELOPMENT.md](./DEVELOPMENT.md#task-add-a-new-api-endpoint) - API endpoint example with full code
- [QUICK_START.md](./QUICK_START.md#quick-testing) - cURL examples

---

## 📱 **I'm Building the Frontend**

**Setup:**
1. [QUICK_START.md](./QUICK_START.md) - Quick setup
2. [DEVELOPMENT.md](./DEVELOPMENT.md) - Development guide

**Frontend Architecture:**
- [ARCHITECTURE.md](./ARCHITECTURE.md#frontend-architecture) - Component hierarchy & state management

**Component Development:**
- React patterns - [DEVELOPMENT.md](./DEVELOPMENT.md#react-component-patterns)
- Custom hooks - [ARCHITECTURE.md](./ARCHITECTURE.md#real-time-features-socketio)

**Styling & UI:**
- See [README.md](./README.md) - Tailwind CSS + Shadcn UI mentioned
- See [ARCHITECTURE.md](./ARCHITECTURE.md#technology-stack) - Complete stack

---

## 🗄️ **I'm Working with the Database**

**Database Design:**
- [ARCHITECTURE.md](./ARCHITECTURE.md#database-design) - Complete schema documentation
  - All tables with columns
  - Relationships
  - Indexing strategy

**Migrations:**
- Migration files: `/migrations/*.sql`
- How to run: [DEPLOYMENT.md](./DEPLOYMENT.md#database-deployment)
- How to create new: [DEVELOPMENT.md](./DEVELOPMENT.md#task-add-a-new-database-table)

**ORM (Drizzle):**
- Schema file: `shared/schema.ts`
- Setup: `db/index.ts`
- Usage examples: [DEVELOPMENT.md](./DEVELOPMENT.md)

**Performance:**
- Indexing strategy - [ARCHITECTURE.md](./ARCHITECTURE.md#indexing-strategy)
- Query optimization - [DEVELOPMENT.md](./DEVELOPMENT.md#task-optimize-a-slow-query)

---

## 💳 **I'm Integrating Payments**

**Payment Architecture:**
- [ARCHITECTURE.md](./ARCHITECTURE.md#payment-processing) - Payment flow documentation
- Configuration: [DEPLOYMENT.md](./DEPLOYMENT.md#environment-setup)

**Implementation:**
- Payment code: `server/payments.ts`
- Paystack wrapper: `server/paystack.ts`
- API endpoint: See [ARCHITECTURE.md](./ARCHITECTURE.md#restful-endpoints-structure) - `/api/payments`

**Testing:**
- Test card: 4111 1111 1111 1111
- More in: [DEPLOYMENT.md](./DEPLOYMENT.md#post-deployment-verification)

---

## 📸 **I'm Working with File Storage**

**File Storage (Cloudinary):**
- [ARCHITECTURE.md](./ARCHITECTURE.md#file-storage) - File storage architecture
- Implementation: `server/cloudinary.ts`
- Configuration: [DEPLOYMENT.md](./DEPLOYMENT.md#environment-setup)

**Image URLs:**
- URL format explained in [ARCHITECTURE.md](./ARCHITECTURE.md#file-storage)
- Responsive image sizing tips included

---

## 🚴 **I'm Implementing Real-time Features**

**Real-time Architecture:**
- [ARCHITECTURE.md](./ARCHITECTURE.md#real-time-communication) - Socket.IO setup

**WebSocket Events:**
- Event types: `/api/orders`, `/api/chat`, `/api/notifications`, `/api/tracking`
- Examples: [ARCHITECTURE.md](./ARCHITECTURE.md#socketio-architecture)

**Implementation Example:**
- See [DEVELOPMENT.md](./DEVELOPMENT.md#task-add-a-new-api-endpoint) - includes Socket.IO emit

---

## 📊 **I'm Analyzing Performance**

**Performance Metrics:**
- [PRODUCTION_ASSESSMENT.md](./PRODUCTION_ASSESSMENT.md#performance-metrics) - Baseline metrics
- [ARCHITECTURE.md](./ARCHITECTURE.md#performance-considerations) - Optimization strategies

**Monitoring:**
- [DEPLOYMENT.md](./DEPLOYMENT.md#monitoring--maintenance) - Setup monitoring
- [PRODUCTION_ASSESSMENT.md](./PRODUCTION_ASSESSMENT.md#monitoring--alerts) - Alert recommendations

**Optimization:**
- Frontend: [ARCHITECTURE.md](./ARCHITECTURE.md#performance-considerations)
- Backend: [ARCHITECTURE.md](./ARCHITECTURE.md#performance-considerations)
- Database: [DEVELOPMENT.md](./DEVELOPMENT.md#task-optimize-a-slow-query)

---

## 🎯 **I'm Managing Admin Features**

**Admin Capabilities:**
- [README.md](./README.md#-admin-features-super-admin) - All admin features listed
- **Promotional Ads:** Admins can create time-limited promotions (store/product) via `/admin/promotions`. Promotions include a live countdown and are expired by admin action or the background worker.

**Admin API:**
- [ARCHITECTURE.md](./ARCHITECTURE.md#restful-endpoints-structure) - `/api/admin` endpoints
- Platform settings - [README.md](./README.md)

**Admin Setup:**
- [QUICK_START.md](./QUICK_START.md#5-minute-setup) - Default admin credentials
- [DEVELOPMENT.md](./DEVELOPMENT.md) - Run seed to create admins

---

## 🔄 **I Need to Understand the Business Logic**

**Multi-Vendor vs Single-Store:**
- [ARCHITECTURE.md](./ARCHITECTURE.md#platform-modes) - Mode switching explained
- Admin setting: `platform_settings.multi_vendor_mode`

**User Roles & Permissions:**
- [QUICK_START.md](./QUICK_START.md#-user-roles) - Role reference table
- [README.md](./README.md) - Detailed role features

**Order Flow:**
- [ARCHITECTURE.md](./ARCHITECTURE.md#payment-processing) - Payment to delivery

**Commission & Earnings:**
- Database schema: [ARCHITECTURE.md](./ARCHITECTURE.md#database-design)
- Seller payouts: [README.md](./README.md#-seller-features-multi-vendor-mode)

---

## 🆘 **I Have a Problem**

**Troubleshooting:**
- [QUICK_START.md](./QUICK_START.md#-troubleshooting) - Quick fixes
- [DEVELOPMENT.md](./DEVELOPMENT.md#common-issues--solutions) - Detailed solutions
- [DEPLOYMENT.md](./DEPLOYMENT.md#troubleshooting) - Production issues

**Common Issues:**
- Port already in use - [QUICK_START.md](./QUICK_START.md#-troubleshooting)
- Database connection - [DEVELOPMENT.md](./DEVELOPMENT.md#common-issues--solutions)
- Frontend won't load - [QUICK_START.md](./QUICK_START.md#-troubleshooting)
- 502 Bad Gateway - [DEPLOYMENT.md](./DEPLOYMENT.md#troubleshooting)

---

## 📞 **I Need Project Information**

**Project Overview:**
- [README.md](./README.md) - What is KiyuMart?
- [ARCHITECTURE.md](./ARCHITECTURE.md#system-overview) - How does it work?

**Technology Stack:**
- [ARCHITECTURE.md](./ARCHITECTURE.md#technology-stack) - Complete stack with versions
- [README.md](./README.md#-technology-stack) - Stack overview

**Features:**
- [README.md](./README.md#-features) - Complete feature list by role
- [ARCHITECTURE.md](./ARCHITECTURE.md#system-overview) - Business capabilities

**Status & Roadmap:**
- Current version: v1.1.1 (Security Hardened)
- Production ready: ✅ Yes
- See [PRODUCTION_ASSESSMENT.md](./PRODUCTION_ASSESSMENT.md) for details

---

## 📖 **Document Quick Reference**

| Document | Pages | Purpose | For Whom |
|----------|-------|---------|----------|
| [README.md](./README.md) | 30 | Project overview | Everyone |
| [QUICK_START.md](./QUICK_START.md) | 15 | Quick setup & reference | New developers |
| [ARCHITECTURE.md](./ARCHITECTURE.md) | 60 | System design | Architects, senior devs |
| [DEVELOPMENT.md](./DEVELOPMENT.md) | 40 | Development guide | Developers |
| [DEPLOYMENT.md](./DEPLOYMENT.md) | 50 | Production deployment | DevOps, managers |
| [PRODUCTION_ASSESSMENT.md](./PRODUCTION_ASSESSMENT.md) | 20 | Security & readiness | QA, managers |

**Total Documentation:** 215+ pages of comprehensive guidance

---

## 🎓 **Learning Path**

### For New Developers (Week 1)
```
Day 1: QUICK_START.md + get server running
Day 2: DEVELOPMENT.md + project structure
Day 3: ARCHITECTURE.md + database schema
Day 4: Build first feature (add simple endpoint)
Day 5: Code review + refinements
```

### For DevOps Engineers
```
1. ARCHITECTURE.md - Understand system
2. DEPLOYMENT.md - Learn deployment
3. PRODUCTION_ASSESSMENT.md - Understand requirements
4. Deploy to staging
5. Deploy to production
```

### For Project Managers
```
1. README.md - Project overview
2. PRODUCTION_ASSESSMENT.md - Readiness status
3. DEPLOYMENT.md - Deployment timeline
4. Understand team bandwidth needed
```

---

## 🔗 **Related Files in Repository**

### Configuration Files
- `package.json` - Dependencies & scripts
- `tsconfig.json` - TypeScript config
- `vite.config.ts` - Frontend build config
- `drizzle.config.ts` - Database ORM config
- `.env.example` - Environment template

### Source Code
- `server/` - Backend Express server
- `client/` - Frontend React app
- `shared/` - Shared code
- `db/` - Database setup

### Database
- `migrations/` - SQL migration files
- `shared/schema.ts` - Drizzle schema

### Testing
- `e2e/` - End-to-end tests
- `server/__tests__/` - Unit/integration tests

### Scripts
- `scripts/` - Utility scripts (seeding, etc.)

---

## ✅ **Verification Checklist**

After reading documentation, verify your understanding:

- [ ] I can start the dev server (5 mins)
- [ ] I understand the system architecture (30 mins)
- [ ] I can add a new API endpoint (1 hour)
- [ ] I understand the database schema (30 mins)
- [ ] I can deploy to production (with guide) (2 hours)
- [ ] I know how to debug issues (15 mins)
- [ ] I understand security measures (30 mins)

---

## 📝 **Documentation Maintenance**

**Updated:** January 23, 2026  
**Next Review:** February 23, 2026  
**Maintainer:** Development Team

**How to Update:**
1. Make code changes
2. Update relevant documentation
3. Run `npm run test:e2e` to verify
4. Commit with detailed message
5. Push to main branch

**Report Issues:**
If documentation is unclear or outdated:
1. Create issue describing problem
2. Suggest correction
3. Link to specific document section

---

## 🎉 **You're Ready!**

You now have access to comprehensive documentation covering:
- ✅ System architecture
- ✅ Development guidelines
- ✅ Deployment procedures
- ✅ Security practices
- ✅ API reference
- ✅ Troubleshooting

**Start with:** [QUICK_START.md](./QUICK_START.md) or choose from sections above based on your role.

**Questions?** Check the index above to find the right document!

