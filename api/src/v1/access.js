import { ApiError, forbidden, hmacHex, notFound, sha256Hex, unauthenticated } from "./security.js";

export const SESSION_COOKIE = "ep_session";
export const COOKIE_PATH = "/api/v1";
const SCANNER_SCHEME = "Scanner ";

export const READ_ROLES = ["event_manager", "staff"];
export const MANAGE_ROLES = ["event_manager"];
export const ISSUE_ROLES = ["event_manager", "staff"];

export function parseCookies(header = "") {
  const cookies = {};
  for (const part of header.split(";")) {
    const index = part.indexOf("=");
    if (index === -1) continue;
    cookies[part.slice(0, index).trim()] = part.slice(index + 1).trim();
  }
  return cookies;
}

// Resolves who is calling. Sets req.principal to a user (from a session cookie) or a
// scanner device (from an Authorization header). Handlers decide what that principal may do.
export function loadPrincipal({ pool, config }) {
  return async (req, res, next) => {
    try {
      const sessionSecret = parseCookies(req.headers.cookie)[SESSION_COOKIE];
      if (sessionSecret) {
        const user = await userForSession(pool, sessionSecret);
        if (user) req.principal = { type: "user", user };
      }

      const header = req.headers.authorization;
      if (!req.principal && header?.startsWith(SCANNER_SCHEME)) {
        const device = await deviceForSecret(pool, config, header.slice(SCANNER_SCHEME.length).trim());
        req.principal = { type: "device", device };
      }
      next();
    } catch (err) {
      next(err);
    }
  };
}

async function userForSession(pool, secret) {
  const { rows } = await pool.query(
    `update sessions s set last_used_at = now()
       from users u
      where s.id = $1
        and u.id = s.user_id
        and s.revoked_at is null
        and s.expires_at > now()
        and u.is_active
     returning s.id as session_id, u.id, u.email, u.display_name, u.is_admin`,
    [sha256Hex(secret)]
  );
  const row = rows[0];
  if (!row) return null;
  return {
    id: row.id,
    email: row.email,
    displayName: row.display_name,
    isAdmin: row.is_admin,
    sessionId: row.session_id,
  };
}

async function deviceForSecret(pool, config, secret) {
  const { rows } = await pool.query(
    `select id, event_id, checkpoint_id, name, revoked_at, expires_at <= now() as expired
       from scanner_devices where token_hmac = $1`,
    [hmacHex(config.tokenKey, secret)]
  );
  const row = rows[0];
  if (!row) throw unauthenticated("Invalid scanner credentials");
  if (row.revoked_at) throw new ApiError(401, "DEVICE_REVOKED", "Scanner device has been revoked");
  if (row.expired) throw new ApiError(401, "DEVICE_EXPIRED", "Scanner device has expired");
  await pool.query("update scanner_devices set last_used_at = now() where id = $1", [row.id]);
  return {
    id: row.id,
    eventId: row.event_id,
    checkpointId: row.checkpoint_id,
    name: row.name,
  };
}

export function requireUser(req, res, next) {
  if (req.principal?.type === "user") return next();
  if (req.principal?.type === "device") return next(forbidden("Scanner devices cannot use this endpoint"));
  return next(unauthenticated());
}

export function requireDevice(req, res, next) {
  if (req.principal?.type === "device") return next();
  if (req.principal?.type === "user") return next(forbidden("Only scanner devices can use this endpoint"));
  return next(unauthenticated("Scanner credentials required"));
}

// Returns the caller's role on an event, or throws. Admins act on every event.
// An event the caller cannot see is reported as not found, so existence is not leaked.
export async function authorizeEvent(pool, user, eventId, allowedRoles) {
  if (user.isAdmin) return "admin";
  const { rows } = await pool.query(
    "select role from event_memberships where user_id = $1 and event_id = $2",
    [user.id, eventId]
  );
  const role = rows[0]?.role;
  if (!role) throw notFound("Event not found");
  if (!allowedRoles.includes(role)) throw forbidden("Your role cannot perform this action");
  return role;
}

const EVENT_OF_QUERY = {
  event_participants: "select event_id from event_participants where id = $1",
  credentials: "select event_id from credentials where id = $1",
  checkpoints: "select event_id from checkpoints where id = $1",
  checkpoint_occurrences: "select event_id from checkpoint_occurrences where id = $1",
  groups: "select event_id from groups where id = $1",
  scanner_devices: "select event_id from scanner_devices where id = $1",
};

// Resolves the event that owns a resource, so authorization always runs against the real owner.
export async function eventIdOf(pool, kind, id) {
  const sql = EVENT_OF_QUERY[kind];
  if (!sql) throw new Error(`unknown resource kind: ${kind}`);
  const { rows } = await pool.query(sql, [id]);
  if (!rows[0]) throw notFound("Not found");
  return rows[0].event_id;
}
