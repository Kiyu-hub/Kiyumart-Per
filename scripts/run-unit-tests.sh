#!/usr/bin/env bash
set -euo pipefail
export SESSION_SECRET=${SESSION_SECRET:-testsecret}
echo "Running server unit tests..."
for f in server/__tests__/*.test.ts; do
  echo "---- Running $f ----"
  npx tsx "$f"
done
echo "All tests completed successfully"
