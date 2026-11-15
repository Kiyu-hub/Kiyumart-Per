# Developing KiyuMart in GitHub Codespaces (no computer-specific files)

This is the **optional cloud development environment configuration**, not a deployed Fashion Services preview. It is saved in the private GitHub repository. It does **not** create a Codespace, database, or hosting service automatically.

## Start

1. Open [the private KiyuMart repository](https://github.com/Smart3990/Kiyumart-Per) and switch to branch `feature/fashion-services-isolated`.
2. In **Code → Codespaces**, choose to create a Codespace for the selected branch (availability and usage charges depend on your GitHub account). The `.devcontainer/devcontainer.json` configuration installs Node.js 22 and runs `npm ci`.
3. In the Codespace terminal, run read-only code checks:

```bash
npx tsc --noEmit --pretty false
node scripts/run-tsx-test-suite-safe.mjs
npm run build
```

4. Inspect [PR #10](https://github.com/Smart3990/Kiyumart-Per/pull/10), [AI_HANDOFF.md](../AI_HANDOFF.md) and [staging checklist #13](https://github.com/Smart3990/Kiyumart-Per/issues/13) before changing functionality.

## Running a preview

- **Do not point previews at the production database or use live Paystack keys.** Create an independent staging database, use test-only service credentials, and apply the reviewed additive migrations on staging before starting the backend.
- Set staging secrets in GitHub Codespaces secret settings or a private untracked `.env` (the tracked repository ignores `.env`), never in a commit or PR.
- With a suitable test-only environment configured, start the backend in one terminal with `npx tsx server/index.ts` and the frontend in another with `npx vite --host 0.0.0.0`. Check the forwarded ports 5000/5173. Keep any preview port **private**; do not publish staging to the internet by default.
- API startup may fail without a valid test-only `DATABASE_URL` and `SESSION_SECRET`. A clean unit/build check alone does not verify application behavior.

## Save changes remotely

Codespaces is a workspace, not a substitute for committing: after reviewing changes for secrets and generated data, run `git status --short`, commit to a feature branch, and `git push origin <branch-name>`. Confirm the commit and GitHub Actions result in the private repository. Do not force-push or merge to `main` automatically.

Never upload customer records, identity documents, raw Supabase backups, production API keys, secrets, or Paystack live credentials. Production deployment and the destructive catalog reset require separate explicit review.
