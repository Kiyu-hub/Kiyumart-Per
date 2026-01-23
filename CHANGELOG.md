# Changelog

## 2026-01-23

- Fix: Resolved runtime crash in `client/src/App.tsx` by making React namespace import resilient to bundler/runtime issues.
- Change: Disabled external currency conversion. Platform now uses GHS (Ghanaian Cedi) as the single default currency.
  - Simplified server `server/currency.ts` to no-op conversion and removed external API calls.
  - Updated admin UI (`AdminStoreManager`, `AdminSettings`) to only allow `GHS` as the default currency.
- Note: Further verification and comprehensive README feature integration is pending; next steps include running unit/e2e tests and implementing any missing features listed in `README.md`.
