import { Router } from "express";
import crypto from "node:crypto";
import { z } from "zod";
import { audit } from "../audit.js";
import { MANAGE_ROLES, READ_ROLES, authorizeEvent, requireDevice, requireUser } from "../access.js";
import { parse } from "../validation.js";
import { ApiError, hmacHex, notFound, randomToken } from "../security.js";

const DEVICE_SELECT = `id, event_id as "eventId", name, checkpoint_id as "checkpointId",
  expires_at as "expiresAt", revoked_at as "revokedAt", created_at as "createdAt", last_used_at as "lastUsedAt"`;

const MAX_DEVICE_LIFETIME_DAYS = 30;

const createSchema = z.object({
  name: z.string().trim().min(1).max(120),
  checkpointId: z.string().uuid().nullable().optional(),
  expiresAt: z.string().datetime({ offset: true }),
});

// Scanner secrets are random, prefixed, and stored only as an HMAC. The secret is shown once.
export function newScannerSecret() {
  return `sd_${randomToken(32)}`;
}

export function devicesRouter({ pool, config }) {
  const router = Router();

  router.get("/events/:eventId/scanner-devices", requireUser, async (req, res, next) => {
    try {
      await authorizeEvent(pool, req.principal.user, req.params.eventId, MANAGE_ROLES);
      const { rows } = await pool.query(
        `select ${DEVICE_SELECT} from scanner_devices where event_id = $1 order by created_at`,
        [req.params.eventId]
      );
      res.json({ devices: rows });
    } catch (err) {
      next(err);
    }
  });

  router.post("/events/:eventId/scanner-devices", requireUser, async (req, res, next) => {
    try {
      const user = req.principal.user;
      const eventId = req.params.eventId;
      await authorizeEvent(pool, user, eventId, MANAGE_ROLES);
      const body = parse(createSchema, req.body);

      const expiresAt = Date.parse(body.expiresAt);
      if (expiresAt <= Date.now()) throw new ApiError(400, "INVALID_INPUT", "Request is invalid", [{ path: "expiresAt", message: "must be in the future" }]);
      if (expiresAt > Date.now() + MAX_DEVICE_LIFETIME_DAYS * 86400e3) {
        throw new ApiError(400, "INVALID_INPUT", "Request is invalid", [{ path: "expiresAt", message: `must be within ${MAX_DEVICE_LIFETIME_DAYS} days` }]);
      }
      if (body.checkpointId) {
        const cp = await pool.query("select 1 from checkpoints where id = $1 and event_id = $2", [body.checkpointId, eventId]);
        if (!cp.rows[0]) throw notFound("Checkpoint not found in this event");
      }

      const secret = newScannerSecret();
      const { rows } = await pool.query(
        `insert into scanner_devices (id, event_id, name, checkpoint_id, token_hmac, enrolled_by, expires_at)
         values ($1, $2, $3, $4, $5, $6, $7::timestamptz)
         returning ${DEVICE_SELECT}`,
        [crypto.randomUUID(), eventId, body.name, body.checkpointId ?? null, hmacHex(config.tokenKey, secret), user.id, body.expiresAt]
      );
      await audit(pool, { actor: user.id, action: "create", entity: "scanner_device", entityId: rows[0].id, eventId });
      res.status(201).json({ device: rows[0], secret });
    } catch (err) {
      next(err);
    }
  });

  router.post("/scanner-devices/:deviceId/revoke", requireUser, async (req, res, next) => {
    try {
      const user = req.principal.user;
      const found = await pool.query("select event_id from scanner_devices where id = $1", [req.params.deviceId]);
      if (!found.rows[0]) throw notFound("Scanner device not found");
      await authorizeEvent(pool, user, found.rows[0].event_id, MANAGE_ROLES);
      const { rows } = await pool.query(
        `update scanner_devices set revoked_at = coalesce(revoked_at, now())
          where id = $1 returning ${DEVICE_SELECT}`,
        [req.params.deviceId]
      );
      await audit(pool, { actor: user.id, action: "revoke", entity: "scanner_device", entityId: req.params.deviceId, eventId: found.rows[0].event_id });
      res.json({ device: rows[0] });
    } catch (err) {
      next(err);
    }
  });

  // What an authenticated scanner is allowed to see: its own event and its checkpoint scope.
  router.get("/scanner/context", requireDevice, async (req, res, next) => {
    try {
      const device = req.principal.device;
      const { rows: events } = await pool.query(
        `select id, name, status, timezone from events where id = $1`,
        [device.eventId]
      );
      const { rows: checkpoints } = await pool.query(
        `select id, name, kind, rule_type as "ruleType" from checkpoints
          where event_id = $1 and active and ($2::uuid is null or id = $2)
          order by name`,
        [device.eventId, device.checkpointId]
      );
      res.json({
        device: { id: device.id, name: device.name, checkpointId: device.checkpointId },
        event: events[0],
        checkpoints,
      });
    } catch (err) {
      next(err);
    }
  });

  return router;
}
