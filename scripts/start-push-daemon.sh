#!/bin/bash
# Start auto-commit + push daemon

DAEMON_SCRIPT="/workspaces/Kiyumart-Per/scripts/auto-push-daemon.js"
PID_FILE="/workspaces/Kiyumart-Per/.git/watcher.pid"
LOG_FILE="/workspaces/Kiyumart-Per/.git/auto-commit.log"

# Check if already running
if [ -f "$PID_FILE" ]; then
  EXISTING_PID=$(cat "$PID_FILE")
  if ps -p "$EXISTING_PID" > /dev/null 2>&1; then
    echo "❌ Watcher is already running (PID: $EXISTING_PID)"
    echo "View logs: tail -f $LOG_FILE"
    exit 1
  fi
fi

# Start daemon in background
echo "Starting auto-commit + push daemon..."
nohup node "$DAEMON_SCRIPT" > /dev/null 2>&1 &
DAEMON_PID=$!

# Give it a moment to start
sleep 1

# Verify it started
if ps -p "$DAEMON_PID" > /dev/null 2>&1; then
  echo "✅ Watcher daemon started (PID: $DAEMON_PID)"
  echo "📋 Logs: tail -f $LOG_FILE"
  echo ""
  echo "Any file changes will be automatically committed and pushed to GitHub."
  echo "To stop: bash scripts/stop-push-daemon.sh"
else
  echo "❌ Failed to start daemon"
  exit 1
fi
