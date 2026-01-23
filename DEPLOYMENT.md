# KiyuMart Deployment Guide

**Purpose:** Step-by-step deployment instructions for production  
**Platforms Covered:** Netlify (Frontend), Render (Backend), Neon (Database)  
**Last Updated:** January 23, 2026  
**Version:** 1.1.1 (Security Hardened)

---

## Table of Contents

1. [Pre-Deployment Checklist](#pre-deployment-checklist)
2. [Environment Setup](#environment-setup)
3. [Database Deployment](#database-deployment)
4. [Backend Deployment](#backend-deployment)
5. [Frontend Deployment](#frontend-deployment)
6. [Post-Deployment Verification](#post-deployment-verification)
7. [Monitoring & Maintenance](#monitoring--maintenance)
8. [Troubleshooting](#troubleshooting)
9. [Rollback Procedures](#rollback-procedures)

---

## Pre-Deployment Checklist

### Code Quality

```bash
# Run all tests
npm run test:unit
npm run test:e2e
npm run test:integration

# Check for console.logs
grep -r "console\." server/index.ts server/routes.ts | grep -v "//"

# Verify no hardcoded secrets
grep -r "sk_test\|sk_live\|password\|secret" . --include="*.ts" --exclude-dir=node_modules

# Check TypeScript compilation
npx tsc --noEmit

# Verify dependencies are up to date
npm audit
```

### Security Verification

```bash
# ✅ Verify security hardening is in place:

# 1. Check request size limits (server/index.ts line ~140)
grep -A 2 "express.json" server/index.ts | grep "limit"

# 2. Check Helmet configuration (server/index.ts line ~150)
grep -A 10 "helmet" server/index.ts | grep -E "csp|hsts|frameguard"

# 3. Check request timeout (server/index.ts)
grep -A 5 "timeout" server/index.ts | grep -E "30|30000"

# 4. Check seed endpoint guards (server/routes.ts)
grep -A 5 "api/seed/" server/routes.ts | grep -A 2 "production"

# 5. Check JWT secret is not exposed
grep "JWT_SECRET" server/index.ts | grep "process.env"
```

### Checklist

```
Backend:
  ✅ All tests passing
  ✅ No console.logs (or wrapped in dev checks)
  ✅ Security headers configured
  ✅ Request limits set
  ✅ Seed endpoints guarded
  ✅ Error handling complete
  ✅ Logging configured
  ✅ Linting passed (no errors)

Frontend:
  ✅ All tests passing
  ✅ Build succeeds (npm run build:frontend)
  ✅ No API hardcoded URLs
  ✅ Environment variables used
  ✅ Error boundaries present
  ✅ Loading states complete
  ✅ Mobile responsive
  ✅ Dark mode tested

Database:
  ✅ All migrations applied
  ✅ Backup created
  ✅ Connection pooling configured
  ✅ Indexes verified
  ✅ Schema up to date

Secrets:
  ✅ All API keys configured
  ✅ JWT_SECRET set (strong)
  ✅ SESSION_SECRET set
  ✅ DATABASE_URL correct
  ✅ No secrets in git history
  ✅ Paystack keys active
  ✅ Cloudinary credentials verified

Documentation:
  ✅ README updated
  ✅ ARCHITECTURE.md up to date
  ✅ DEVELOPMENT.md complete
  ✅ Runbooks prepared
  ✅ Contact info documented
```

---

## Environment Setup

### Prepare Deployment Accounts

```
Required Services:
1. GitHub account (code repository)
2. Netlify account (frontend hosting)
3. Render account (backend hosting)
4. Neon account (database)
5. Paystack account (payments)
6. Cloudinary account (image storage)
```

### Environment Variables Template

**Backend (Render):**
```
# Database
DATABASE_URL=postgresql://user:password@host:5432/kiyumart_prod

# Authentication
JWT_SECRET=your_super_secret_random_string_min_32_chars
SESSION_SECRET=another_random_secret_min_32_chars

# External APIs
PAYSTACK_PUBLIC_KEY=pk_live_xxxxx
PAYSTACK_SECRET_KEY=sk_live_xxxxx
CLOUDINARY_CLOUD_NAME=xxxxx
CLOUDINARY_API_KEY=xxxxx
CLOUDINARY_API_SECRET=xxxxx

# Frontend
FRONTEND_URL=https://yourdomain.com

# Environment
NODE_ENV=production
PORT=5000

# Optional
LOG_LEVEL=info
SENTRY_DSN=https://xxxxx@sentry.io/xxxxx
```

**Frontend (Netlify):**
```
# API Configuration
VITE_API_URL=https://api.yourdomain.com

# Feature Flags
VITE_ENABLE_ANALYTICS=true
VITE_ENABLE_CHAT=true
```

---

## Database Deployment

### Using Neon Serverless PostgreSQL

#### Step 1: Create Neon Project

```bash
# 1. Go to https://console.neon.tech
# 2. Create new project
# 3. Copy connection string:
#    postgresql://user:password@host/neon_kiyumart?sslmode=require

# 4. Test connection locally first:
PGPASSWORD=password psql -h host -U user -d neon_kiyumart -c "SELECT 1"

# 5. Add to .env.local for testing:
DATABASE_URL=postgresql://user:password@host/neon_kiyumart?sslmode=require

# 6. Apply migrations locally
npx drizzle-kit push:pg
```

#### Step 2: Create Production Database

```bash
# 1. In Neon dashboard, create separate project for production
# 2. Get production DATABASE_URL
# 3. Apply migrations to production database:

# Using migration files:
npx tsx migrations/0001_*.sql
npx tsx migrations/0002_*.sql
# ... all migrations in order

# Or use Drizzle Kit:
DATABASE_URL=<production-url> npx drizzle-kit push:pg
```

#### Step 3: Seed Production Data

```bash
# 1. Create admin accounts
DATABASE_URL=<production-url> npm run seed-admins

# 2. Create banners (optional)
DATABASE_URL=<production-url> npm run seed-banners

# 3. Verify data created
DATABASE_URL=<production-url> npm run check-migrations
```

#### Step 4: Setup Backups

```
Neon Dashboard:
1. Go to Settings → Backups
2. Enable automated backups (daily)
3. Set retention to 30 days minimum
4. Test backup restoration (monthly)
```

---

## Backend Deployment

### Using Render.com

#### Step 1: Connect Repository

```
1. Go to https://render.com
2. Click "New +" → "Web Service"
3. Connect GitHub repository
4. Select branch: main
5. Configuration:
   - Name: kiyumart-api
   - Environment: Node
   - Build Command: npm install
   - Start Command: npx tsx server/index.ts
```

#### Step 2: Configure Environment

```
In Render Dashboard:
1. Go to Environment
2. Add all variables from template above
3. Set DATABASE_URL from Neon
4. Set JWT_SECRET (generate random: openssl rand -base64 32)
5. Verify Paystack and Cloudinary credentials
```

#### Step 3: Configure Resources

```
Render Dashboard → Settings:
- Plan: Starter ($7/month) or higher
- Region: Closest to your users
- Auto-deploy: Enabled
- Health check: /api/health
- Health check interval: 30s
```

#### Step 4: Deploy

```
Render will automatically:
1. Pull latest code from GitHub
2. Install dependencies (npm install)
3. Start server (npx tsx server/index.ts)
4. Health check passes? → Service live
5. Any errors? → See logs in Render dashboard

To redeploy:
1. Push to main branch on GitHub
2. Render automatically redeploys
3. Check logs: Render Dashboard → Logs
```

#### Step 5: Verify Backend

```bash
# Test health endpoint
curl https://api.yourdomain.com/api/health

# Should return:
# {"status":"ok","database":"connected",...}

# Test authentication endpoint
curl -X POST https://api.yourdomain.com/api/auth/login \
  -H "Content-Type: application/json" \
  -d '{"email":"admin@kiyumart.com","password":"admin123"}'
```

---

## Frontend Deployment

### Using Netlify

#### Step 1: Connect Repository

```
1. Go to https://app.netlify.com
2. Click "Add new site" → "Import an existing project"
3. Connect GitHub
4. Select repository: Kiyumart-Per
5. Select branch: main
```

#### Step 2: Configure Build

```
Netlify Build Settings:
- Base directory: (leave empty)
- Build command: npm run build:frontend
- Publish directory: client/dist
- Functions directory: (leave empty)
```

#### Step 3: Add Environment Variables

```
Netlify Dashboard → Site settings → Build & deploy → Environment:

1. Add VITE_API_URL:
   Key: VITE_API_URL
   Value: https://api.yourdomain.com

2. Trigger rebuild
```

#### Step 4: Configure Domain

```
Netlify Dashboard → Domain settings:
1. Add custom domain (e.g., yourdomain.com)
2. Follow DNS configuration steps
3. Wait for DNS propagation (24-48 hours)
4. Auto-provision SSL certificate (automatic)
```

#### Step 5: Verify Frontend

```bash
# Test frontend loads
curl https://yourdomain.com | head -50

# Should return HTML
# Check for script tags

# Test browser
# Open https://yourdomain.com
# Check console for errors
```

---

## SSL/HTTPS Configuration

### Automatic (Recommended)

**Netlify:**
- Automatic SSL provisioning included
- Renewal automatic
- HSTS preloading available

**Render:**
- Free SSL with Let's Encrypt
- Auto-renewal
- Custom domain support

### Manual Domain Configuration

```
1. Register domain (GoDaddy, Namecheap, etc.)

2. Update DNS records:
   
   For Netlify:
   - Add CNAME record:
     Name: yourdomain.com
     Value: netlify-domain.com
   
   For Render (API):
   - Add CNAME record:
     Name: api.yourdomain.com
     Value: render-domain.com

3. Wait for DNS propagation:
   $ dig yourdomain.com
   $ nslookup yourdomain.com

4. Verify SSL:
   $ curl -I https://yourdomain.com
```

---

## Post-Deployment Verification

### Comprehensive Testing Checklist

```bash
# 1. Health Checks
curl https://api.yourdomain.com/api/health
# Expected: {"status":"ok","database":"connected"}

# 2. Frontend Loading
curl -I https://yourdomain.com
# Expected: HTTP/2 200, Cache-Control headers

# 3. Authentication
curl -X POST https://api.yourdomain.com/api/auth/login \
  -H "Content-Type: application/json" \
  -d '{"email":"admin@kiyumart.com","password":"admin123"}'
# Expected: 200 with token

# 4. Product Listing
curl https://api.yourdomain.com/api/products?limit=5
# Expected: 200 with product array

# 5. Seed Endpoints (Should be BLOCKED)
curl -X POST https://api.yourdomain.com/api/seed/test-users
# Expected: 403 (Forbidden)

# 6. WebSocket Connection
# Open browser console:
# const socket = io('https://api.yourdomain.com')
# socket.on('connect', () => console.log('Connected'))

# 7. Image Uploads
# Upload image via admin dashboard
# Verify it appears in Cloudinary and loads on frontend

# 8. Payment Gateway
# Test Paystack integration with test card:
# Card: 4111 1111 1111 1111
# Expiry: Any future date
# CVV: Any 3 digits
```

### Security Verification

```bash
# Check Security Headers
curl -I https://api.yourdomain.com/api/health | grep -i "strict-transport\|content-security\|x-frame"

# Expected headers:
# strict-transport-security: max-age=31536000; includeSubDomains; preload
# x-content-type-options: nosniff
# x-frame-options: DENY

# Test Rate Limiting (make 6+ requests quickly)
for i in {1..10}; do
  curl https://api.yourdomain.com/api/auth/login \
    -X POST \
    -H "Content-Type: application/json" \
    -d '{"email":"test","password":"test"}' \
    -w "\n%{http_code}\n"
done
# Expected: After 5 failures, 429 (Too Many Requests)

# Test Request Size Limit
python3 << 'EOF'
import requests
large_payload = {"data": "x" * (11 * 1024 * 1024)}
r = requests.post('https://api.yourdomain.com/api/health', json=large_payload)
print(f"Status: {r.status_code}")  # Expected: 413
EOF

# Verify HTTPS Only
curl -i http://yourdomain.com
# Expected: 301 redirect to HTTPS
```

### Performance Baseline

```bash
# Frontend Performance
# Open in Chrome DevTools → Lighthouse
# Expected: Performance > 80, Accessibility > 90, Best Practices > 90

# Backend Response Times
# Expected: <200ms for 95% of requests
# Check in logs: "response time: XXXms"

# Database Query Performance
# Expected: <100ms for most queries
# Check in Neon dashboard
```

---

## Monitoring & Maintenance

### Set Up Monitoring

```
1. Render Monitoring:
   - Enable error tracking
   - Set up alerts for crashes
   - Monitor resource usage
   - Check logs regularly

2. Netlify Monitoring:
   - Monitor build times
   - Track deployment history
   - Monitor 404 errors

3. Application Monitoring (Recommended):
   - Set up Sentry for error tracking
   - Configure DataDog for metrics
   - Set up log aggregation (Papertrail, etc.)
```

### Daily/Weekly Tasks

```
Daily:
  ☑ Check error logs
  ☑ Verify API responsiveness (curl health check)
  ☑ Monitor database connections
  ☑ Check Paystack transaction logs

Weekly:
  ☑ Review performance metrics
  ☑ Check disk usage
  ☑ Verify backups completed
  ☑ Review user feedback
  ☑ Update dependencies (if needed)

Monthly:
  ☑ Security scan (npm audit)
  ☑ Database optimization
  ☑ Disaster recovery drill
  ☑ Cost review
  ☑ Scaling assessment
```

### Database Maintenance

```sql
-- Analyze query performance
ANALYZE;

-- Vacuum to clean up deleted rows
VACUUM ANALYZE;

-- Check index health
SELECT schemaname, tablename, indexname
FROM pg_indexes
WHERE schemaname != 'pg_catalog';

-- Monitor connections
SELECT count(*) FROM pg_stat_activity;

-- Check cache hit ratio (should be >99%)
SELECT 
  sum(heap_blks_read) as heap_read, 
  sum(heap_blks_hit) as heap_hit, 
  sum(heap_blks_hit) / 
    (sum(heap_blks_hit) + sum(heap_blks_read)) as ratio 
FROM pg_statio_user_tables;
```

---

## Troubleshooting

### Common Issues & Solutions

#### Issue: 502 Bad Gateway

**Causes:**
- Backend server crashed
- Database connection failed
- Memory limit exceeded
- Timeout exceeded

**Solutions:**
```bash
# Check backend logs in Render
# Look for error messages

# Restart service
# In Render dashboard → Services → Restart

# Check database connection
# Verify DATABASE_URL is correct
# Check Neon dashboard for connectivity issues

# Check resource usage
# Render dashboard → Metrics
# Increase plan if CPU/Memory at 90%+
```

#### Issue: Frontend Not Loading

**Causes:**
- Build failed
- VITE_API_URL incorrect
- DNS not propagated
- Certificate issue

**Solutions:**
```bash
# Check Netlify build logs
# Netlify Dashboard → Deploys → Latest → View logs

# Verify DNS resolution
dig yourdomain.com

# Check certificate
curl -vI https://yourdomain.com

# Verify VITE_API_URL
# Should be: https://api.yourdomain.com
# NOT: http://localhost:5000
```

#### Issue: Database Connection Timeout

**Causes:**
- Neon serverless database suspended
- Wrong connection string
- IP whitelisting issue
- Network connectivity

**Solutions:**
```bash
# Test connection string
psql "postgresql://user:pass@host/db"

# Check Neon dashboard
# Wake up database if suspended
# Verify IP whitelist (should allow all: 0.0.0.0/0)

# Increase connection timeout in code
DATABASE_URL=<url>?connect_timeout=30

# Check network connectivity
telnet host 5432
```

#### Issue: Paystack Webhook Not Firing

**Causes:**
- Webhook URL not configured
- Webhook endpoint not accessible
- Webhook secret incorrect
- Payload validation failing

**Solutions:**
```bash
# In Paystack Dashboard:
# Settings → Webhook

# 1. Verify webhook URL:
curl https://api.yourdomain.com/api/payments/webhook

# 2. Should return 200 (or 400 with proper error)

# 3. Check webhook logs in Paystack dashboard
# Test webhook from Paystack dashboard

# 4. Verify webhook secret in code
grep "PAYSTACK_SECRET" server/payments.ts

# 5. Check server logs for webhook receives
grep "webhook" server/index.ts
```

---

## Rollback Procedures

### Rollback Frontend (Netlify)

```
1. Go to Netlify Dashboard → Deploys
2. Find previous working deployment
3. Click on deployment → Click "Publish deploy"
4. Wait for deployment to complete
5. Verify at https://yourdomain.com
```

### Rollback Backend (Render)

```
1. In Render Dashboard → Services → kiyumart-api
2. Go to Events (deployment history)
3. Click on previous working deployment
4. Click "Redeploy"
5. Wait for deployment
6. Verify: curl https://api.yourdomain.com/api/health
```

### Rollback Database (Neon)

```
1. In Neon Dashboard → Databases → neon_kiyumart_prod
2. Go to Backups
3. Select backup point before issue
4. Click "Restore"
5. Confirm restore point
6. Wait for restoration (may take 5-10 minutes)
7. Verify data integrity
```

### Git Rollback (Emergency)

```bash
# If critical error in code:

# 1. Identify last working commit
git log --oneline | head -20

# 2. Create rollback commit
git revert <commit-hash>

# 3. Push to main
git push origin main

# 4. Services automatically redeploy
# (or manually trigger deployment)

# 5. Verify services are back online
curl https://api.yourdomain.com/api/health
```

---

## Deployment Checklists

### Pre-Deployment

- [ ] All tests passing
- [ ] Security audit passed
- [ ] No hardcoded secrets in code
- [ ] Environment variables documented
- [ ] Database backups created
- [ ] Staging deployment tested
- [ ] Team notified of deployment
- [ ] Maintenance window scheduled (if needed)

### Deployment Day

- [ ] Database migrations applied
- [ ] Backend deployment triggered
- [ ] Backend health check passing
- [ ] Frontend build completed
- [ ] Frontend deployment triggered
- [ ] SSL certificates active
- [ ] All services responding

### Post-Deployment

- [ ] Comprehensive testing checklist passed
- [ ] Security headers verified
- [ ] API endpoints tested
- [ ] Payment gateway tested
- [ ] Image uploads tested
- [ ] Database connectivity verified
- [ ] Logs monitored for errors
- [ ] Team notified of completion
- [ ] Documentation updated

---

## Emergency Contacts & Escalation

```
Critical Issues (Down):
1. Check dashboard for obvious issues
2. Restart service
3. Check database connectivity
4. Check error logs

If still down:
1. Rollback latest deployment
2. Check status page
3. Contact hosting provider support
4. Notify team/users

Contacts:
- Render Support: https://render.com/support
- Netlify Support: https://app.netlify.com/support
- Neon Support: https://neon.tech/support
- Paystack Support: https://paystack.com/support
```

