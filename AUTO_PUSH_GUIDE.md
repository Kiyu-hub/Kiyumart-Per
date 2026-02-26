# Auto-Push Daemon Guide

## Overview
The auto-push daemon monitors your files for changes and automatically commits + pushes to GitHub every time you save a file. No more manual `git push` commands!

## How It Works
1. **File Watcher**: Monitors all file changes in the repository
2. **Debouncing**: Waits 3 seconds after the last change before committing (prevents duplicate commits)
3. **Auto-Commit**: Stages all changes and creates a timestamped commit
4. **Auto-Push**: Pushes the commit to the remote branch (usually `main`)

## Quick Commands

### Start the daemon
```bash
bash scripts/start-push-daemon.sh
```
✅ Starts watching for file changes and auto-pushing

### Check daemon status
```bash
bash scripts/status-push-daemon.sh
```
Shows if daemon is running and displays recent logs

### Stop the daemon
```bash
bash scripts/stop-push-daemon.sh
```
Gracefully shuts down the watcher

### View live logs
```bash
tail -f .git/auto-commit.log
```
Watch real-time activity of the auto-push daemon

## What Gets Ignored
The daemon automatically ignores changes to:
- `node_modules/` - Dependencies
- `dist/` - Build output
- `.git/` - Git internals
- `*.log` - Log files
- `.DS_Store` - macOS system files
- `cookiejar` - HTTP client state
- `.env` - Environment variables
- `coverage/` - Test coverage
- And more (based on `.gitignore`)

## Understanding the Logs
Each log entry shows:
- **Timestamp**: ISO 8601 format (UTC)
- **Event Type**: File change, commit, push, or error
- **Details**: What files changed or commit message

Example log:
```
[2026-02-16T15:54:24.999Z] File changed: src/components/Button.tsx
[2026-02-16T15:54:28.011Z] Staged changes
[2026-02-16T15:54:28.072Z] Committed: Auto-commit: 2026-02-16T15:54:28.028Z
[2026-02-16T15:54:29.602Z] Pushed to origin/main
```

## Workflow Example

### Before (Manual Process)
```bash
# Edit file
vim src/pages/Admin.tsx

# Manually commit and push
git add -A
git commit -m "Update admin page"
git push
```

### Now (With Auto-Push Daemon)
```bash
# Start daemon once
bash scripts/start-push-daemon.sh

# Just edit files - everything else is automatic!
vim src/pages/Admin.tsx

# Changes auto-commit and push within 3 seconds ✨
```

## Stopping the Daemon

The daemon runs in the background indefinitely. Stop it when you want to take a break or need to run manual git operations:

```bash
bash scripts/stop-push-daemon.sh
```

## Troubleshooting

### Daemon won't start
1. Check if it's already running: `bash scripts/status-push-daemon.sh`
2. View recent errors: `tail -f .git/auto-commit.log`
3. Ensure git is configured: `git config user.name` and `git config user.email`

### Push failures
- The daemon logs all push errors in `.git/auto-commit.log`
- Common causes: network issues, authentication, or conflicting remote changes
- If push fails, the commit is still created locally

### Runtime logs (app/server)
- For platform runtime debugging, use `server.log` in the project root.
- Keep runtime logs clean by avoiding verbose success-path `console.log` in hot endpoints.
- Keep only actionable logs by default:
  - `console.error` for failures
  - targeted warnings when user-impacting fallback behavior is triggered

### Daemon stops unexpectedly
The daemon sends logs to `.git/auto-commit.log`. Check there for any error messages.

## Advanced Configuration

To modify behavior, edit `scripts/auto-push-daemon.js`:
- `DEBOUNCE_TIME` - Change how long to wait before committing (default: 3000ms)
- `getIgnorePatterns()` - Add/remove patterns to ignore

## Technical Details

- **Process Type**: Daemonized Node.js process
- **PID File**: `.git/watcher.pid` (tracks daemon process ID)
- **Log File**: `.git/auto-commit.log` (all daemon activity)
- **Signal Handling**: Graceful shutdown on SIGTERM/SIGINT
- **Module Type**: ES Modules (Node.js)

---

**Happy coding! Your changes are now always safe and synced.** 🚀
