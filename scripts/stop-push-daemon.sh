#!/bin/bash
# Stop auto-commit + push daemon

PID_FILE="/workspaces/Kiyumart-Per/.git/watcher.pid"
LOG_FILE="/workspaces/Kiyumart-Per/.git/auto-commit.log"

if [ ! -f "$PID_FILE" ]; then
  echo "❌ Watcher is not running"
  exit 1
fi

DAEMON_PID=$(cat "$PID_FILE")

if ! ps -p "$DAEMON_PID" > /dev/null 2>&1; then
  echo "❌ Watcher process not found (PID: $DAEMON_PID)"
  rm -f "$PID_FILE"
  exit 1
fi

# Kill the daemon
kill -TERM "$DAEMON_PID" 2>/dev/null

# Wait for graceful shutdown
sleep 1

if ps -p "$DAEMON_PID" > /dev/null 2>&1; then
  kill -9 "$DAEMON_PID" 2>/dev/null
  echo "⏹️  Watcher daemon forcefully stopped (PID: $DAEMON_PID)"
else
  echo "✅ Watcher daemon stopped gracefully (PID: $DAEMON_PID)"
fi

# Cleanup PID file
rm -f "$PID_FILE"
echo "📋 Logs available: tail -f $LOG_FILE"
