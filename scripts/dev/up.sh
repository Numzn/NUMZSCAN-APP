#!/usr/bin/env bash
# Starts the local EventPass development stack:
#   Postgres in Docker (localhost only), the API in watch mode, and the web app with hot reload.
# It never reads the production .env and never connects to the production database.
set -euo pipefail

ROOT="$(cd "$(dirname "${BASH_SOURCE[0]}")/../.." && pwd)"
cd "$ROOT"

ENV_FILE=.env.dev
STATE_DIR=.dev
DB_PORT=54329
API_PORT=3301
WEB_PORT=5294

random() { node -e "process.stdout.write(require('crypto').randomBytes($1).toString('base64url'))"; }

# First run: create the local secrets. Written with mode 600 and never printed.
if [ ! -f "$ENV_FILE" ]; then
  umask 077
  PG=$(random 24)
  TK=$(random 32)
  DP=$(random 18)
  {
    printf 'DEV_POSTGRES_PASSWORD=%s\n' "$PG"
    printf 'DATABASE_URL=postgres://postgres:%s@127.0.0.1:%s/numzscan_dev\n' "$PG" "$DB_PORT"
    printf 'EVENTPASS_TOKEN_KEY=%s\n' "$TK"
    printf 'DEV_PASSWORD=%s\n' "$DP"
  } > "$ENV_FILE"
  chmod 600 "$ENV_FILE"
  echo "created $ENV_FILE (local only, mode 600)"
fi

set -a
. "./$ENV_FILE"
set +a

# Guard: only the local dev database. Anything else stops here.
case "$DATABASE_URL" in
  *"@127.0.0.1:${DB_PORT}/numzscan_dev") ;;
  *) echo "refusing: DATABASE_URL in $ENV_FILE is not the local dev database"; exit 1 ;;
esac

if [ ! -d node_modules ] || [ ! -d web/node_modules ]; then
  echo "install dependencies first: npm install (in the repo root) and npm install (in web/)"
  exit 1
fi

mkdir -p "$STATE_DIR"

# Postgres
docker compose -f docker-compose.dev.yml --env-file "$ENV_FILE" up -d
PG_CONTAINER=$(docker compose -f docker-compose.dev.yml --env-file "$ENV_FILE" ps -q postgres)
for _ in $(seq 1 60); do
  [ "$(docker inspect --format '{{.State.Health.Status}}' "$PG_CONTAINER")" = healthy ] && break
  sleep 1
done
[ "$(docker inspect --format '{{.State.Health.Status}}' "$PG_CONTAINER")" = healthy ] || { echo "dev Postgres did not become healthy"; exit 1; }

# Schema and demo data (both safe to repeat)
(cd api && node scripts/migrate.js)
node scripts/dev/seed.mjs

# Starts a server unless its pid file shows it is already running.
start() {
  local name=$1 dir=$2 port=$3
  shift 3
  local pidfile="$ROOT/$STATE_DIR/$name.pid"
  if [ -f "$pidfile" ] && kill -0 "$(cat "$pidfile")" 2>/dev/null; then
    echo "$name already running (pid $(cat "$pidfile"))"
    return
  fi
  if ss -ltnH "sport = :$port" | grep -q .; then
    echo "port $port is busy; cannot start $name"
    exit 1
  fi
  # Only nohup is backgrounded. nohup and env both exec the server, so $! is the server's own pid.
  (
    cd "$dir"
    nohup "$@" > "$ROOT/$STATE_DIR/$name.log" 2>&1 &
    echo $! > "$pidfile"
  )
  echo "started $name on port $port"
}

# The API runs from api/, which has no .env, so the production file is never loaded.
start api api "$API_PORT" env PORT="$API_PORT" HOST=127.0.0.1 EVENTPASS_COOKIE_SECURE=false node --watch src/server.js
start web web "$WEB_PORT" env EVENTPASS_API="http://127.0.0.1:$API_PORT" node node_modules/vite/bin/vite.js --host 127.0.0.1 --port "$WEB_PORT" --strictPort

for _ in $(seq 1 60); do
  curl -fsS "http://127.0.0.1:$API_PORT/api/health" >/dev/null 2>&1 && curl -fsS "http://127.0.0.1:$WEB_PORT/login" >/dev/null 2>&1 && break
  sleep 1
done

cat <<EOF

EventPass dev is running.
  App:      http://127.0.0.1:$WEB_PORT
  API:      http://127.0.0.1:$API_PORT
  Accounts: admin@dev.local, manager@dev.local, staff@dev.local
  Password: grep DEV_PASSWORD $ENV_FILE | cut -d= -f2-
  Logs:     $STATE_DIR/api.log, $STATE_DIR/web.log
  Stop:     npm run dev:down
EOF
