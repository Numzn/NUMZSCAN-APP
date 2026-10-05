import { Router } from "express";
import { z } from "zod";
import { requireDevice } from "../access.js";
import { parse } from "../validation.js";
import { ApiError, conflict, hmacHex, notFound } from "../security.js";

const CREDENTIAL_FORMAT = /^EP1:[A-Za-z0-9_-]{43}$/;

// The client sends a fresh UUID for each scan attempt. Retrying the same scan reuses that UUID,
// so the server returns the stored result instead of recording the scan twice.
const scanSchema = z.object({
  id: z.string().uuid(),
  credential: z.string().regex(CREDENTIAL_FORMAT, "invalid credential format"),
  checkpointId: z.string().uuid(),
  occurrenceId: z.string().uuid(),
  scannedAt: z.string().datetime({ offset: true }),
});

const INTERACTION_SELECT = `id, event_id as "eventId", checkpoint_id as "checkpointId",
  occurrence_id as "occurrenceId", event_participant_id as "eventParticipantId",
  credential_id as "credentialId", device_id as "deviceId", scanned_at as "scannedAt",
  received_at as "receivedAt", outcome, reason`;

const INSERT_INTERACTION = `insert into interactions
   (id, event_id, checkpoint_id, occurrence_id, event_participant_id, credential_id, device_id, scanned_at, outcome, reason)
 values ($1, $2, $3, $4, $5, $6, $7, $8::timestamptz, $9, $10)
 returning ${INTERACTION_SELECT}`;

async function persist(client, row) {
  await client.query("savepoint interaction");
  try {
    const { rows } = await client.query(INSERT_INTERACTION, [
      row.id, row.eventId, row.checkpointId, row.occurrenceId, row.eventParticipantId,
      row.credentialId, row.deviceId, row.scannedAt, row.outcome, row.reason ?? null,
    ]);
    await client.query("release savepoint interaction");
    return { replayed: false, interaction: rows[0] };
  } catch (err) {
    await client.query("rollback to savepoint interaction");
    if (err.code !== "23505") throw err;
    if (err.constraint === "interactions_one_accepted_per_occurrence") {
      // Someone already has an accepted scan here. Keep this attempt as a recorded duplicate.
      return persist(client, { ...row, outcome: "duplicate", reason: "already accepted at this occurrence" });
    }
    if (err.constraint === "interactions_pkey") {
      return replay(client, row);
    }
    throw err;
  }
}

async function replay(client, row) {
  const { rows } = await client.query(`select ${INTERACTION_SELECT} from interactions where id = $1`, [row.id]);
  const stored = rows[0];
  const sameScan =
    stored &&
    stored.deviceId === row.deviceId &&
    stored.credentialId === row.credentialId &&
    stored.occurrenceId === row.occurrenceId &&
    stored.eventParticipantId === row.eventParticipantId;
  if (!sameScan) {
    throw conflict("IDEMPOTENCY_KEY_REUSED", "This interaction id was already used for a different scan");
  }
  return { replayed: true, interaction: stored };
}

async function recordScan(client, config, device, body) {
  const cp = (await client.query("select id, event_id, active from checkpoints where id = $1", [body.checkpointId])).rows[0];
  if (!cp) throw notFound("Checkpoint not found");
  if (cp.event_id !== device.eventId || (device.checkpointId && device.checkpointId !== cp.id)) {
    throw new ApiError(403, "SCANNER_OUT_OF_SCOPE", "This scanner cannot record for that checkpoint");
  }
  if (!cp.active) throw conflict("CHECKPOINT_INACTIVE", "This checkpoint is not active");

  const occ = (await client.query(
    "select starts_at, ends_at from checkpoint_occurrences where id = $1 and checkpoint_id = $2",
    [body.occurrenceId, cp.id]
  )).rows[0];
  if (!occ) throw notFound("Occurrence not found for this checkpoint");

  const cred = (await client.query(
    `select c.id, c.status, ep.id as participation_id, ep.event_id,
            (c.expires_at is not null and c.expires_at <= now()) as expired
       from credentials c join event_participants ep on ep.id = c.event_participant_id
      where c.token_hmac = $1`,
    [hmacHex(config.tokenKey, body.credential)]
  )).rows[0];
  if (!cred || cred.event_id !== device.eventId) {
    throw new ApiError(404, "CREDENTIAL_NOT_FOUND", "Credential not found");
  }

  const scannedAt = new Date(body.scannedAt);
  let outcome = "accepted";
  let reason = null;
  if (cred.status !== "active") {
    outcome = "revoked";
    reason = `credential ${cred.status}`;
  } else if (cred.expired) {
    outcome = "rejected";
    reason = "credential expired";
  } else if (scannedAt < occ.starts_at || scannedAt > occ.ends_at) {
    outcome = "outside_window";
    reason = "scanned outside the occurrence window";
  }

  return persist(client, {
    id: body.id,
    eventId: device.eventId,
    checkpointId: cp.id,
    occurrenceId: body.occurrenceId,
    eventParticipantId: cred.participation_id,
    credentialId: cred.id,
    deviceId: device.id,
    scannedAt: body.scannedAt,
    outcome,
    reason,
  });
}

// Outcomes that must be kept as audit records are committed first, then reported as errors.
function errorFor(outcome) {
  switch (outcome) {
    case "duplicate":
      return conflict("DUPLICATE_INTERACTION", "This participant has already been recorded at this occurrence");
    case "revoked":
      return new ApiError(403, "CREDENTIAL_REVOKED", "This credential has been revoked or replaced");
    case "outside_window":
      return conflict("OUTSIDE_WINDOW", "This scan is outside the occurrence window");
    case "rejected":
      return new ApiError(403, "CREDENTIAL_EXPIRED", "This credential has expired");
    default:
      return null;
  }
}

export function interactionsRouter({ pool, config }) {
  const router = Router();

  router.post("/interactions", requireDevice, async (req, res, next) => {
    const client = await pool.connect();
    let result;
    try {
      const body = parse(scanSchema, req.body);
      await client.query("begin");
      result = await recordScan(client, config, req.principal.device, body);
      await client.query("commit");
    } catch (err) {
      await client.query("rollback").catch(() => {});
      client.release();
      return next(err);
    }
    client.release();

    const error = errorFor(result.interaction.outcome);
    if (error) return next(error);
    return res.status(result.replayed ? 200 : 201).json({ interaction: result.interaction, replayed: result.replayed });
  });

  return router;
}
