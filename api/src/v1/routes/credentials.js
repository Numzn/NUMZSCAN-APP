import { Router } from "express";
import crypto from "node:crypto";
import { z } from "zod";
import { audit } from "../audit.js";
import { MANAGE_ROLES, READ_ROLES, authorizeEvent, eventIdOf, requireUser } from "../access.js";
import { parse } from "../validation.js";
import { conflict, hmacHex, notFound, randomToken } from "../security.js";

const CREDENTIAL_SELECT = `id, event_participant_id as "eventParticipantId", kind, status,
  token_hint as "tokenHint", issued_at as "issuedAt", expires_at as "expiresAt",
  revoked_at as "revokedAt", replaced_by as "replacedBy"`;

const issueSchema = z.object({
  kind: z.enum(["qr"]).default("qr"),
  expiresAt: z.string().datetime({ offset: true }).optional(),
});

// The QR payload is a prefix plus 256 random bits. It carries no participant data or sequence number.
export function newCredentialToken() {
  return `EP1:${randomToken(32)}`;
}

export function credentialTokenHmac(tokenKey, token) {
  return hmacHex(tokenKey, token);
}

export function credentialsRouter({ pool, config }) {
  const router = Router();

  router.get("/event-participants/:participantId/credentials", requireUser, async (req, res, next) => {
    try {
      const eventId = await eventIdOf(pool, "event_participants", req.params.participantId);
      await authorizeEvent(pool, req.principal.user, eventId, READ_ROLES);
      const { rows } = await pool.query(
        `select ${CREDENTIAL_SELECT} from credentials where event_participant_id = $1 order by issued_at`,
        [req.params.participantId]
      );
      res.json({ credentials: rows });
    } catch (err) {
      next(err);
    }
  });

  router.post("/event-participants/:participantId/credentials", requireUser, async (req, res, next) => {
    try {
      const user = req.principal.user;
      const participantId = req.params.participantId;
      const eventId = await eventIdOf(pool, "event_participants", participantId);
      await authorizeEvent(pool, user, eventId, MANAGE_ROLES);
      const body = parse(issueSchema, req.body);

      const participant = await pool.query("select status from event_participants where id = $1", [participantId]);
      if (participant.rows[0].status === "cancelled") {
        throw conflict("PARTICIPANT_CANCELLED", "Cancelled participants cannot receive a credential");
      }

      const token = newCredentialToken();
      const credentialId = crypto.randomUUID();
      try {
        const { rows } = await pool.query(
          `insert into credentials (id, event_id, event_participant_id, kind, token_hmac, token_hint, expires_at)
           values ($1, $2, $3, $4, $5, $6, $7::timestamptz)
           returning ${CREDENTIAL_SELECT}`,
          [credentialId, eventId, participantId, body.kind, credentialTokenHmac(config.tokenKey, token), token.slice(-4), body.expiresAt ?? null]
        );
        await audit(pool, { actor: user.id, action: "issue", entity: "credential", entityId: credentialId, eventId, details: { participantId } });
        res.status(201).json({ credential: rows[0], token });
      } catch (err) {
        if (err.code === "23505" && err.constraint === "credentials_one_active_per_participation") {
          throw conflict("CREDENTIAL_ALREADY_ACTIVE", "This participant already has an active credential; replace it instead");
        }
        throw err;
      }
    } catch (err) {
      next(err);
    }
  });

  router.post("/credentials/:credentialId/replace", requireUser, async (req, res, next) => {
    const client = await pool.connect();
    try {
      const user = req.principal.user;
      const oldId = req.params.credentialId;
      const eventId = await eventIdOf(pool, "credentials", oldId);
      await authorizeEvent(pool, user, eventId, MANAGE_ROLES);
      parse(z.object({}).passthrough(), req.body);

      await client.query("begin");
      const old = await client.query(
        "select event_participant_id, status from credentials where id = $1 for update",
        [oldId]
      );
      if (!old.rows[0]) throw notFound("Credential not found");
      if (old.rows[0].status !== "active") throw conflict("CREDENTIAL_NOT_ACTIVE", "Only an active credential can be replaced");

      const token = newCredentialToken();
      const newId = crypto.randomUUID();
      // Retire the old credential before inserting the new one, so the one-active-per-participation rule holds throughout.
      await client.query("update credentials set status = 'replaced' where id = $1", [oldId]);
      const created = await client.query(
        `insert into credentials (id, event_id, event_participant_id, kind, token_hmac, token_hint)
         values ($1, $2, $3, 'qr', $4, $5) returning ${CREDENTIAL_SELECT}`,
        [newId, eventId, old.rows[0].event_participant_id, credentialTokenHmac(config.tokenKey, token), token.slice(-4)]
      );
      await client.query("update credentials set replaced_by = $2 where id = $1", [oldId, newId]);
      await client.query("commit");
      await audit(pool, { actor: user.id, action: "replace", entity: "credential", entityId: oldId, eventId, details: { replacedBy: newId } });
      res.status(201).json({ credential: created.rows[0], token });
    } catch (err) {
      await client.query("rollback").catch(() => {});
      next(err);
    } finally {
      client.release();
    }
  });

  router.post("/credentials/:credentialId/revoke", requireUser, async (req, res, next) => {
    try {
      const user = req.principal.user;
      const credentialId = req.params.credentialId;
      const eventId = await eventIdOf(pool, "credentials", credentialId);
      await authorizeEvent(pool, user, eventId, MANAGE_ROLES);
      parse(z.object({}).passthrough(), req.body);

      const { rows } = await pool.query(
        `update credentials set status = 'revoked', revoked_at = now()
          where id = $1 and status = 'active'
         returning ${CREDENTIAL_SELECT}`,
        [credentialId]
      );
      if (!rows[0]) throw conflict("CREDENTIAL_NOT_ACTIVE", "Only an active credential can be revoked");
      await audit(pool, { actor: user.id, action: "revoke", entity: "credential", entityId: credentialId, eventId });
      res.json({ credential: rows[0] });
    } catch (err) {
      next(err);
    }
  });

  return router;
}
