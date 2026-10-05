import crypto from "node:crypto";
import { readFile } from "node:fs/promises";
import path from "node:path";
import { fileURLToPath } from "node:url";
import pg from "pg";
import { applyMigrations } from "../../api/scripts/migrate.js";
import { createApp } from "../../api/src/app.js";
import { hashPassword } from "../../api/src/v1/security.js";

export const TEST_URL = process.env.TEST_DATABASE_URL;

// These suites drop and recreate the whole public schema. Refuse any database
// whose name is not a test database, so a mistaken URL cannot reach real data.
export function assertTestDatabase(url) {
  const name = new URL(url).pathname.replace(/^\//, "");
  if (!/_test$/.test(name)) {
    throw new Error(`refusing to reset database "${name}": the name must end in _test`);
  }
}
const here = path.dirname(fileURLToPath(import.meta.url));

// Generated per run. Never a real key.
export const config = {
  tokenKey: crypto.randomBytes(32).toString("base64url"),
  sessionTtlHours: 12,
  loginLimitPer15Min: 100000,
  apiLimitPerMinute: 100000,
  publicRegistrationLimitPerMinute: 100000,
  publicUrl: "https://events.test",
  cookieSecure: true,
};

export async function resetDatabase() {
  assertTestDatabase(TEST_URL);
  const pool = new pg.Pool({ connectionString: TEST_URL, max: 10 });
  await pool.query("drop schema public cascade; create schema public;");
  await pool.query(await readFile(path.join(here, "../../api/src/schema.sql"), "utf8"));
  await applyMigrations(TEST_URL);
  return pool;
}

// Overrides let one suite run the server with a different limit or public address.
export function startServer(pool, overrides = {}) {
  const app = createApp({ pool, config: { ...config, ...overrides } });
  return new Promise((resolve) => {
    const server = app.listen(0, "127.0.0.1", () => {
      resolve({ server, base: `http://127.0.0.1:${server.address().port}` });
    });
  });
}

export async function api(base, method, route, { body, cookie, scanner, headers = {} } = {}) {
  const h = { ...headers };
  if (body !== undefined) h["content-type"] = "application/json";
  if (cookie) h.cookie = `ep_session=${cookie}`;
  if (scanner) h.authorization = `Scanner ${scanner}`;
  const res = await fetch(base + route, {
    method,
    headers: h,
    body: body === undefined ? undefined : JSON.stringify(body),
  });
  const text = await res.text();
  let json = null;
  try {
    json = text ? JSON.parse(text) : null;
  } catch {
    json = { raw: text };
  }
  const setCookie = res.headers.get("set-cookie");
  const match = setCookie && setCookie.match(/ep_session=([^;]*)/);
  return { status: res.status, body: json, sessionCookie: match ? match[1] : undefined, setCookie, text };
}

export const PASSWORD = "correct horse battery staple";

export async function createUser(pool, { email, name = "Test User", isAdmin = false, password = PASSWORD }) {
  const { rows } = await pool.query(
    `insert into users (email, display_name, password_hash, is_admin) values ($1, $2, $3, $4) returning id`,
    [email.toLowerCase(), name, await hashPassword(password), isAdmin]
  );
  return rows[0].id;
}

export async function login(base, email, password = PASSWORD) {
  return api(base, "POST", "/api/v1/auth/login", { body: { email, password } });
}

export async function sessionFor(base, pool, email, isAdmin = false) {
  await createUser(pool, { email, isAdmin, name: email.split("@")[0] });
  const res = await login(base, email);
  if (res.status !== 200) throw new Error(`login failed for ${email}: ${res.status}`);
  return res.sessionCookie;
}

export async function makeEvent(pool, { slug = `camp-${crypto.randomUUID().slice(0, 8)}`, startsOn = "2026-12-01", endsOn = "2026-12-05" } = {}) {
  const { rows } = await pool.query(
    `insert into events (slug, name, kind, timezone, starts_on, ends_on)
     values ($1, 'Youth Camp', 'church_camp', 'Africa/Lusaka', $2, $3) returning id`,
    [slug, startsOn, endsOn]
  );
  return rows[0].id;
}

export async function grant(pool, userEmail, eventId, role) {
  await pool.query(
    `insert into event_memberships (user_id, event_id, role)
     values ((select id from users where email = $1), $2, $3)`,
    [userEmail.toLowerCase(), eventId, role]
  );
}

export async function makePerson(pool, name = "Michael Banda") {
  const { rows } = await pool.query(
    "insert into people (full_name, normalized_name) values ($1, $2) returning id",
    [name, name.toLowerCase()]
  );
  return rows[0].id;
}

export async function makeCheckpoint(pool, eventId, ruleType = "once_per_occurrence", name = "Lunch") {
  const { rows } = await pool.query(
    "insert into checkpoints (event_id, name, kind, rule_type) values ($1, $2, 'meal', $3) returning id",
    [eventId, name, ruleType]
  );
  return rows[0].id;
}

export async function makeOccurrence(pool, eventId, checkpointId, { startsAt = "2026-12-02T10:00:00Z", endsAt = "2026-12-02T14:00:00Z", label = "Lunch day 1" } = {}) {
  const { rows } = await pool.query(
    `insert into checkpoint_occurrences (event_id, checkpoint_id, label, starts_at, ends_at, service_date)
     values ($1, $2, $3, $4::timestamptz, $5::timestamptz, '2026-12-02') returning id`,
    [eventId, checkpointId, label, startsAt, endsAt]
  );
  return rows[0].id;
}

export async function close(server, pool) {
  await new Promise((resolve) => server.close(resolve));
  await pool.end();
}
