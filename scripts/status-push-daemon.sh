#!/bin/bash
# Check auto-push daemon status

PID_FILE="/workspaces/Kiyumart-Per/.git/watcher.pid"
LOG_FILE="/workspaces/Kiyumart-Per/.git/auto-commit.log"

if [ ! -f "$PID_FILE" ]; then
  echo "❌ Watcher daemon is NOT running"
  exit 1
fi

DAEMON_PID=$(cat "$PID_FILE")

if ps -p "$DAEMON_PID" > /dev/null 2>&1; then
  echo "✅ Watcher daemon is RUNNING (PID: $DAEMON_PID)"
  echo ""
  echo "Recent logs (last 10 lines):"
  if [ -f "$LOG_FILE" ]; then
    tail -10 "$LOG_FILE"
  fi
else
  echo "❌ Watcher daemon is NOT running (stale PID: $DAEMON_PID)"
  rm -f "$PID_FILE"
  exit 1
fi
