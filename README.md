# NUMZSCAN App (EventPass)

EventPass manages church camps: events, groups, participants, and QR camp passes. It runs as a NumzLab platform service and is reachable only through the NumzLab gateway at `numzscan.lab.numz.site`.

## Layout

```
web/                 React + TypeScript app (EventPass), built to web/dist
api/                 Express + Postgres API (EventPass /api/v1, plus the legacy /api/tickets)
api/migrations/      EventPass schema migrations (0001, 0002), applied with api/scripts/migrate.js
fundraising.html     Fundraising page, with fundraising-main.js and modules/fundraising/
obs-overlay.html     OBS browser-source overlay, with obs-overlay.js
public/              Static files for the root build: fundraising.css, data.json, ticket-page.html
tests/               Root test suite: API, database, and serving rules
```

## Serving paths

- `/` and every React route (`/login`, `/events`, `/events/:id`, `/event-participants/:id`, ...) serve the React app.
- `/api/v1/*` is the EventPass API. `/api/*` is the legacy tickets API. Unknown `/api` paths return JSON 404, never the app shell.
- `/fundraising.html`, `/fundraising.css`, `/obs-overlay.html`, `/data.json`, and `/ticket-page.html` are served from the root build. OBS and bookmarks use these URLs.
- `/service-worker.js` (from `web/public/`) caches the app shell and hashed assets. API requests are never cached.

## Configuration

Copy `.env.example` to `.env` and fill in the values. Keep `.env` out of git.

- `EVENTPASS_TOKEN_KEY` must be set for `/api/v1` and sign-in to work. Without it the React app loads but cannot sign in. Generate it with `node -e "console.log(require('crypto').randomBytes(32).toString('base64url'))"`.
- `NUMZSCAN_DB_*` point at the shared `infra-postgres` database.

## Running

```bash
docker compose up -d --build numzscan
curl http://127.0.0.1:3210/api/health
```

Only the `numzscan` service should be recreated. Other containers on this host belong to other projects.

## Database

Apply the EventPass migrations to a database (never to production without a backup):

```bash
DATABASE_URL=... node api/scripts/migrate.js
```

The first user is created with `api/scripts/create-user.js`, which reads the password from stdin or `EP_PASSWORD`, never from arguments.

## Tests

```bash
npm test                       # root suite: API, database, serving (needs TEST_DATABASE_URL, a database name ending in _test)
cd web && npx vitest run       # web suite
cd web && npx tsc --noEmit     # web type check
npm run build && (cd web && npm run build)
```
