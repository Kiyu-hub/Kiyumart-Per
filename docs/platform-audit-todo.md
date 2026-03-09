# Platform Audit TODO

## Phase 1 - Audit Engine Foundation
- [x] Add automated audit script (`scripts/generate-platform-audit.ts`)
- [x] Scan all frontend routes and dashboard paths from `client/src/App.tsx`
- [x] Scan feature modules by keyword coverage
- [x] Build dependency and cost/license inventory
- [x] Validate route/link health and detect broken route targets
- [x] Detect orphan pages and dead routes
- [x] Generate machine-readable audit report (`docs/platform-audit-report.json`)
- [x] Append audit run history (`docs/platform-audit-log.jsonl`)

## Phase 2 - Living README System
- [x] Generate living documentation snapshot (`docs/platform-living-readme.md`)
- [x] Auto-inject audit section into root `README.md`
- [x] Add version/timestamp/change summary to generated documentation
- [x] Use strict 10-section README structure

## Phase 3 - Release Enforcement
- [x] Add audit command (`npm run audit:platform`)
- [x] Add strict check command (`npm run audit:platform:check`)
- [ ] Wire strict check into release/deploy pipeline gate

## Phase 4 - Admin/Agent Access Surfaces
- [x] Add super admin trigger endpoint for audit runs
- [x] Add admin read-only endpoint for latest audit report
- [x] Add agent read-only endpoint for scoped documentation access

## Phase 5 - Coverage Hardening
- [ ] Expand button/modal workflow extraction per dashboard page
- [ ] Add navigation graph export per role dashboard
- [ ] Add validation for orphaned feature flags and stale integrations
- [ ] Add automated smoke checklist artifacts for each release
