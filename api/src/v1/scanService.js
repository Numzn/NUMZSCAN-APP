import { z } from "zod";
import { audit } from "./audit.js";
import { ApiError, conflict, hmacHex, notFound } from "./security.js";

// The one scan rule set. Device scans (POST /interactions) and staff scans (POST /events/:eventId/scans) both call
// processScan, so validation, duplicate rules, the check-in and check-out state change, and the audit entry cannot
// drift apart. Callers own the transaction: processScan throws to roll back, and returns when the caller may commit.

export const CREDENTIAL_FORMAT = /^EP1:[A-Za-z0-9_-]{43}$/;

// The client sends a fresh UUID for each scan attempt. Retrying the same attempt reuses that UUID, so the server
// returns the stored result instead of recording the scan twice.
export const scanSchema = z.object({
  id: z.string().uuid(),
  credential: z.string().regex(CREDENTIAL_FORMAT, "invalid credential format"),
  checkpointId: z.string().uuid(),
  occurrenceId: z.string().uuid(),
  scannedAt: z.string().datetime({ offset: true }),
});

// A check-in or departure checkpoint moves the participant to a new status, in the same transaction as the scan.
const STATUS_FOR_KIND = { check_in: "checked_in", departure: "departed" };
const OPERATION_FOR_KIND = { check_in: "check_in", departure: "check_out", meal: "meal" };

const INTERACTION_SELECT = `id, event_id as "eventId", checkpoint_id as "checkpointId",
  occurrence_id as "occurrenceId", event_participant_id as "eventParticipantId",
  credential_id as "credentialId", device_id as "deviceId", operator_user_id as "operatorUserId",
  scanned_at as "scannedAt", received_at as "receivedAt", outcome, reason`;

const INSERT_INTERACTION = `insert into interactions
   (id, event_id, checkpoint_id, occurrence_id, event_participant_id, credential_id, device_id, operator_user_id,
    scanned_at, outcome, reason)
 values ($1, $2, $3, $4, $5, $6, $7, $8, $9::timestamptz, $10, $11)
 returning ${INTERACTION_SELECT}`;

// Decides the outcome of a check-in or departure from the participant's current status. Returns the status to set
// when the scan is accepted.
export function decideStatus(kind, current) {
  if (current === "cancelled") return { outcome: "rejected", reason: "participant cancelled" };
  if (kind === "check_in") {
    if (current === "checked_in") return { outcome: "duplicate", reason: "already checked in" };
    return { outcome: "accepted", next: "checked_in" };
  }
  if (current === "departed") return { outcome: "duplicate", reason: "already checked out" };
  if (current !== "checked_in") return { outcome: "rejected", reason: "not checked in" };
  return { outcome: "accepted", next: "departed" };
}

async function persist(client, row) {
  await client.query("savepoint interaction");
  try {
    const { rows } = await client.query(INSERT_INTERACTION, [
      row.id, row.eventId, row.checkpointId, row.occurrenceId, row.eventParticipantId, row.credentialId,
      row.deviceId ?? null, row.operatorUserId ?? null, row.scannedAt, row.outcome, row.reason ?? null,
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
    if (err.constraint === "interactions_pkey") return replay(client, row);
    throw err;
  }
}

async function replay(client, row) {
  const { rows } = await client.query(`select ${INTERACTION_SELECT} from interactions where id = $1`, [row.id]);
  const stored = rows[0];
  const sameScan =
    stored &&
    stored.deviceId === (row.deviceId ?? null) &&
    stored.operatorUserId === (row.operatorUserId ?? null) &&
    stored.credentialId === row.credentialId &&
    stored.occurrenceId === row.occurrenceId &&
    stored.eventParticipantId === row.eventParticipantId;
  if (!sameScan) {
    throw conflict("IDEMPOTENCY_KEY_REUSED", "This interaction id was already used for a different scan");
  }
  return { replayed: true, interaction: stored };
}

// recorder: { kind: "device", device } or { kind: "user", userId }. deviceScope limits a device to one checkpoint.
export async function processScan(client, { tokenKey, eventId, recorder, deviceScope = null, body }) {
  const cp = (await client.query("select id, event_id, kind, active from checkpoints where id = $1", [body.checkpointId])).rows[0];
  if (!cp) throw notFound("Checkpoint not found");
  if (cp.event_id !== eventId) {
    if (recorder.kind === "device") throw new ApiError(403, "SCANNER_OUT_OF_SCOPE", "This scanner cannot record for that checkpoint");
    throw notFound("Checkpoint not found");
  }
  if (deviceScope?.checkpointId && deviceScope.checkpointId !== cp.id) {
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
    [hmacHex(tokenKey, body.credential)]
  )).rows[0];
  if (!cred || cred.event_id !== eventId) {
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

  // The participant row is locked, so two scans cannot both check the same person in.
  let nextStatus = null;
  if (outcome === "accepted" && STATUS_FOR_KIND[cp.kind]) {
    const current = (await client.query("select status from event_participants where id = $1 for update", [cred.participation_id])).rows[0].status;
    const decision = decideStatus(cp.kind, current);
    outcome = decision.outcome;
    reason = decision.reason ?? null;
    nextStatus = decision.next ?? null;
  }

  const result = await persist(client, {
    id: body.id,
    eventId,
    checkpointId: cp.id,
    occurrenceId: body.occurrenceId,
    eventParticipantId: cred.participation_id,
    credentialId: cred.id,
    deviceId: recorder.kind === "device" ? recorder.device.id : null,
    operatorUserId: recorder.kind === "user" ? recorder.userId : null,
    scannedAt: body.scannedAt,
    outcome,
    reason,
  });

  // A retried attempt was already applied and audited the first time.
  if (result.replayed) return { replayed: true, interaction: result.interaction, operation: null };

  // Only an accepted interaction changes status. The database may have downgraded it to a duplicate at this occurrence.
  const finalOutcome = result.interaction.outcome;
  if (finalOutcome === "accepted" && nextStatus) {
    await client.query("update event_participants set status = $2 where id = $1", [cred.participation_id, nextStatus]);
  }

  const operation = OPERATION_FOR_KIND[cp.kind] ?? "scan";
  await audit(client, {
    actor: recorder.kind === "device" ? recorder.device.id : recorder.userId,
    action: "scan",
    entity: "interaction",
    entityId: result.interaction.id,
    eventId,
    details: {
      operation,
      outcome: finalOutcome,
      ...(result.interaction.reason ? { reason: result.interaction.reason } : {}),
      recordedBy: recorder.kind,
      checkpointId: cp.id,
      eventParticipantId: cred.participation_id,
      ...(nextStatus && finalOutcome === "accepted" ? { status: nextStatus } : {}),
    },
  });

  return { replayed: false, interaction: result.interaction, operation };
}

// The error a scan answer carries, once its outcome has been recorded. Rejections name their reason.
export function errorFor(outcome, reason) {
  switch (outcome) {
    case "duplicate":
      if (reason === "already checked in") return conflict("ALREADY_CHECKED_IN", "This participant is already checked in");
      if (reason === "already checked out") return conflict("ALREADY_CHECKED_OUT", "This participant has already checked out");
      return conflict("DUPLICATE_INTERACTION", "This participant has already been recorded at this occurrence");
    case "revoked":
      return new ApiError(403, "CREDENTIAL_REVOKED", "This credential has been revoked or replaced");
    case "outside_window":
      return conflict("OUTSIDE_WINDOW", "This scan is outside the occurrence window");
    case "rejected":
      if (reason === "credential expired") return new ApiError(403, "CREDENTIAL_EXPIRED", "This credential has expired");
      if (reason === "participant cancelled") return conflict("PARTICIPANT_CANCELLED", "This participant has been cancelled");
      if (reason === "not checked in") return conflict("NOT_CHECKED_IN", "This participant has not checked in");
      return conflict("SCAN_REJECTED", "This scan was rejected");
    default:
      return null;
  }
}
