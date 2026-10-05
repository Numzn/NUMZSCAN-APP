#!/usr/bin/env bash
# Stops the local EventPass development stack. The dev database keeps its data unless --wipe is given.
set -euo pipefail

ROOT="$(cd "$(dirname "${BASH_SOURCE[0]}")/../.." && pwd)"
cd "$ROOT"

for name in api web; do
  pidfile=".dev/$name.pid"
  if [ -f "$pidfile" ]; then
    pid=$(cat "$pidfile")
    # node --watch runs the real server as a child, so stop the children first.
    for child in $(pgrep -P "$pid" 2>/dev/null || true); do kill "$child" 2>/dev/null || true; done
    if kill "$pid" 2>/dev/null; then echo "stopped $name (pid $pid)"; fi
    rm -f "$pidfile"
  fi
done

if [ "${1:-}" = "--wipe" ]; then
  docker compose -f docker-compose.dev.yml --env-file .env.dev down --volumes
  echo "dev database stopped and its data removed"
else
  docker compose -f docker-compose.dev.yml --env-file .env.dev down
  echo "dev database stopped (data kept)"
fi
