import crypto from "node:crypto";
import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { api, close, grant, makeCheckpoint, makeEvent, makeOccurrence, resetDatabase, sessionFor, startServer, TEST_URL } from "./harness.js";

const future = (days = 1) => new Date(Date.now() + days * 86400e3).toISOString();
const START = "2026-12-02T10:00:00Z";
const END = "2026-12-02T14:00:00Z";
const INSIDE = "2026-12-02T12:00:00Z";
const OUTSIDE = "2026-12-02T16:00:00Z";

describe.skipIf(!TEST_URL)("interactions", () => {
  let pool, server, base;
  let managerCookie, staffCookie;
  let eventA, eventB;
  let deviceA, deviceB;
  let lunch, once, unlimited;

  // Each test works on its own participant and occurrence, so tests do not interfere.
  let seq = 0;
  const label = () => `case-${++seq}`;

  async function participant(eventId, cookie, name) {
    const res = await api(base, "POST", `/api/v1/events/${eventId}/participants`, { cookie, body: { person: { fullName: name } } });
    return res.body.participant;
  }

  async function issue(participantId, body = {}) {
    return api(base, "POST", `/api/v1/event-participants/${participantId}/credentials`, { cookie: staffCookie, body });
  }

  async function freshOccurrence(checkpointId, eventId, startsAt = START, endsAt = END) {
    return makeOccurrence(pool, eventId, checkpointId, { startsAt, endsAt, label: label() });
  }

  async function holder(name = label()) {
    const p = await participant(eventA, managerCookie, name);
    const cred = await issue(p.id);
    return { participantId: p.id, token: cred.body.token, credentialId: cred.body.credential.id };
  }

  const scan = (device, fields) => api(base, "POST", "/api/v1/interactions", { scanner: device.secret, body: fields });
  const scanFields = (over) => ({ id: crypto.randomUUID(), checkpointId: lunch, scannedAt: INSIDE, ...over });

  beforeAll(async () => {
    pool = await resetDatabase();
    ({ server, base } = await startServer(pool));
    managerCookie = await sessionFor(base, pool, "manager@example.org");
    staffCookie = await sessionFor(base, pool, "staff@example.org");
    eventA = await makeEvent(pool, { slug: "camp-a" });
    eventB = await makeEvent(pool, { slug: "camp-b" });
    await grant(pool, "manager@example.org", eventA, "event_manager");
    await grant(pool, "staff@example.org", eventA, "staff");
    await grant(pool, "manager@example.org", eventB, "event_manager");

    lunch = await makeCheckpoint(pool, eventA, "once_per_occurrence", "Lunch");
    once = await makeCheckpoint(pool, eventA, "once_per_event", "Check-in");
    unlimited = await makeCheckpoint(pool, eventA, "unlimited", "Activity");

    deviceA = (await api(base, "POST", `/api/v1/events/${eventA}/scanner-devices`, { cookie: managerCookie, body: { name: "Gate A", expiresAt: future() } })).body;
    deviceB = (await api(base, "POST", `/api/v1/events/${eventB}/scanner-devices`, { cookie: managerCookie, body: { name: "Gate B", expiresAt: future() } })).body;
  });

  afterAll(async () => {
    await close(server, pool);
  });

  it("a valid scan is accepted and returns the interaction without personal data", async () => {
    const h = await holder("Michael Banda");
    const occ = await freshOccurrence(lunch, eventA);
    const res = await scan(deviceA, scanFields({ credential: h.token, occurrenceId: occ }));
    expect(res.status).toBe(201);
    expect(res.body.interaction).toMatchObject({ outcome: "accepted", eventId: eventA, checkpointId: lunch, occurrenceId: occ });
    expect(res.text).not.toMatch(/Michael|Banda|fullName/);
  });

  it("retrying the same interaction id is idempotent and returns the stored result", async () => {
    const h = await holder();
    const occ = await freshOccurrence(lunch, eventA);
    const fields = scanFields({ credential: h.token, occurrenceId: occ });
    const first = await scan(deviceA, fields);
    const retry = await scan(deviceA, fields);
    expect(first.status).toBe(201);
    expect(retry.status).toBe(200);
    expect(retry.body.replayed).toBe(true);
    expect(retry.body.interaction.id).toBe(first.body.interaction.id);
    const { rows } = await pool.query("select count(*)::int as n from interactions where id = $1", [fields.id]);
    expect(rows[0].n).toBe(1);
  });

  it("reusing an interaction id for a different scan is refused", async () => {
    const h = await holder();
    const occ = await freshOccurrence(lunch, eventA);
    const other = await freshOccurrence(lunch, eventA, "2026-12-03T10:00:00Z", "2026-12-03T14:00:00Z");
    const fields = scanFields({ credential: h.token, occurrenceId: occ });
    await scan(deviceA, fields);
    const conflicting = await scan(deviceA, { ...fields, occurrenceId: other, scannedAt: "2026-12-03T11:00:00Z" });
    expect(conflicting.status).toBe(409);
    expect(conflicting.body.error.code).toBe("IDEMPOTENCY_KEY_REUSED");
  });

  it("a repeat at the same occurrence with a new id is refused as a recorded duplicate", async () => {
    const h = await holder();
    const occ = await freshOccurrence(lunch, eventA);
    expect((await scan(deviceA, scanFields({ credential: h.token, occurrenceId: occ }))).status).toBe(201);
    const repeat = await scan(deviceA, scanFields({ credential: h.token, occurrenceId: occ }));
    expect(repeat.status).toBe(409);
    expect(repeat.body.error.code).toBe("DUPLICATE_INTERACTION");
    const { rows } = await pool.query(
      "select count(*)::int as n from interactions where event_participant_id = $1 and outcome = 'duplicate'",
      [h.participantId]
    );
    expect(rows[0].n).toBe(1);
  });

  it("the database refuses a second accepted row even if the API is bypassed", async () => {
    const h = await holder();
    const occ = await freshOccurrence(lunch, eventA);
    expect((await scan(deviceA, scanFields({ credential: h.token, occurrenceId: occ }))).status).toBe(201);
    await expect(
      pool.query(
        `insert into interactions (id, event_id, checkpoint_id, occurrence_id, event_participant_id, credential_id, device_id, scanned_at, outcome)
         values ($1, $2, $3, $4, $5, $6, $7, now(), 'accepted')`,
        [crypto.randomUUID(), eventA, lunch, occ, h.participantId, h.credentialId, deviceA.device.id]
      )
    ).rejects.toMatchObject({ code: "23505" });
  });

  it("once per event: a second scan at the single event-wide occurrence is a duplicate", async () => {
    const h = await holder();
    const occ = await freshOccurrence(once, eventA);
    expect((await scan(deviceA, scanFields({ credential: h.token, checkpointId: once, occurrenceId: occ }))).status).toBe(201);
    const second = await scan(deviceA, scanFields({ credential: h.token, checkpointId: once, occurrenceId: occ }));
    expect(second.status).toBe(409);
    expect(second.body.error.code).toBe("DUPLICATE_INTERACTION");
  });

  it("once per event: a checkpoint cannot take a second occurrence", async () => {
    const checkpoint = await makeCheckpoint(pool, eventA, "once_per_event", label());
    await freshOccurrence(checkpoint, eventA);
    await expect(freshOccurrence(checkpoint, eventA)).rejects.toMatchObject({ code: "23514" });
  });

  it("once per occurrence: the same person at another occurrence is accepted", async () => {
    const h = await holder();
    const first = await freshOccurrence(lunch, eventA);
    const second = await freshOccurrence(lunch, eventA, "2026-12-03T10:00:00Z", "2026-12-03T14:00:00Z");
    expect((await scan(deviceA, scanFields({ credential: h.token, occurrenceId: first }))).status).toBe(201);
    const res = await scan(deviceA, scanFields({ credential: h.token, occurrenceId: second, scannedAt: "2026-12-03T11:00:00Z" }));
    expect(res.status).toBe(201);
  });

  it("unlimited checkpoints accept repeated scans of the same person", async () => {
    const h = await holder();
    const occ = await freshOccurrence(unlimited, eventA);
    const first = await scan(deviceA, scanFields({ credential: h.token, checkpointId: unlimited, occurrenceId: occ }));
    const second = await scan(deviceA, scanFields({ credential: h.token, checkpointId: unlimited, occurrenceId: occ }));
    expect(first.status).toBe(201);
    expect(second.status).toBe(201);
  });

  it("a scan outside the occurrence window is refused and recorded as outside_window", async () => {
    const h = await holder();
    const occ = await freshOccurrence(lunch, eventA);
    const id = crypto.randomUUID();
    const res = await scan(deviceA, scanFields({ id, credential: h.token, occurrenceId: occ, scannedAt: OUTSIDE }));
    expect(res.status).toBe(409);
    expect(res.body.error.code).toBe("OUTSIDE_WINDOW");
    const { rows } = await pool.query("select outcome from interactions where id = $1", [id]);
    expect(rows[0].outcome).toBe("outside_window");
  });

  it("a revoked credential is refused and the attempt is recorded as revoked", async () => {
    const h = await holder();
    const occ = await freshOccurrence(lunch, eventA);
    await api(base, "POST", `/api/v1/credentials/${h.credentialId}/revoke`, { cookie: managerCookie, body: {} });
    const id = crypto.randomUUID();
    const res = await scan(deviceA, scanFields({ id, credential: h.token, occurrenceId: occ }));
    expect(res.status).toBe(403);
    expect(res.body.error.code).toBe("CREDENTIAL_REVOKED");
    const { rows } = await pool.query("select outcome from interactions where id = $1", [id]);
    expect(rows[0].outcome).toBe("revoked");
  });

  it("a replaced credential's old token is refused", async () => {
    const p = await participant(eventA, managerCookie, label());
    const first = await issue(p.id);
    const replaced = await api(base, "POST", `/api/v1/credentials/${first.body.credential.id}/replace`, { cookie: managerCookie, body: {} });
    expect(replaced.status).toBe(201);
    const occ = await freshOccurrence(lunch, eventA);
    const res = await scan(deviceA, scanFields({ credential: first.body.token, occurrenceId: occ }));
    expect(res.status).toBe(403);
    expect(res.body.error.code).toBe("CREDENTIAL_REVOKED");
  });

  it("an expired credential is refused and recorded as rejected", async () => {
    const p = await participant(eventA, managerCookie, label());
    const cred = await issue(p.id, { expiresAt: future() });
    await pool.query(
      "update credentials set issued_at = now() - interval '2 hours', expires_at = now() - interval '1 hour' where id = $1",
      [cred.body.credential.id]
    );
    const occ = await freshOccurrence(lunch, eventA);
    const id = crypto.randomUUID();
    const res = await scan(deviceA, scanFields({ id, credential: cred.body.token, occurrenceId: occ }));
    expect(res.status).toBe(403);
    expect(res.body.error.code).toBe("CREDENTIAL_EXPIRED");
    const { rows } = await pool.query("select outcome, reason from interactions where id = $1", [id]);
    expect(rows[0]).toMatchObject({ outcome: "rejected", reason: "credential expired" });
  });

  it("a scanner cannot record for a checkpoint in another event", async () => {
    const h = await holder();
    const otherCheckpoint = await makeCheckpoint(pool, eventB, "unlimited", label());
    const otherOcc = await freshOccurrence(otherCheckpoint, eventB);
    const res = await scan(deviceA, scanFields({ credential: h.token, checkpointId: otherCheckpoint, occurrenceId: otherOcc }));
    expect(res.status).toBe(403);
    expect(res.body.error.code).toBe("SCANNER_OUT_OF_SCOPE");
  });

  it("a scanner in one event cannot use a credential issued in another event", async () => {
    const h = await holder();
    const checkpointB = await makeCheckpoint(pool, eventB, "unlimited", label());
    const occ = await freshOccurrence(checkpointB, eventB);
    const res = await scan(deviceB, scanFields({ credential: h.token, checkpointId: checkpointB, occurrenceId: occ }));
    expect(res.status).toBe(404);
    expect(res.body.error.code).toBe("CREDENTIAL_NOT_FOUND");
  });

  it("a scanner limited to one checkpoint is refused for any other", async () => {
    const scoped = (await api(base, "POST", `/api/v1/events/${eventA}/scanner-devices`, { cookie: managerCookie, body: { name: "Supper line", expiresAt: future(), checkpointId: once } })).body;
    const h = await holder();
    const occ = await freshOccurrence(lunch, eventA);
    const res = await scan(scoped, scanFields({ credential: h.token, occurrenceId: occ }));
    expect(res.status).toBe(403);
    expect(res.body.error.code).toBe("SCANNER_OUT_OF_SCOPE");
  });

  it("an inactive checkpoint takes no scans", async () => {
    const closed = await makeCheckpoint(pool, eventA, "unlimited", label());
    await pool.query("update checkpoints set active = false where id = $1", [closed]);
    const h = await holder();
    const occ = await freshOccurrence(closed, eventA);
    const res = await scan(deviceA, scanFields({ credential: h.token, checkpointId: closed, occurrenceId: occ }));
    expect(res.status).toBe(409);
    expect(res.body.error.code).toBe("CHECKPOINT_INACTIVE");
  });

  it("a malformed credential is rejected before anything is recorded", async () => {
    const occ = await freshOccurrence(lunch, eventA);
    const res = await scan(deviceA, scanFields({ credential: "not-a-credential", occurrenceId: occ }));
    expect(res.status).toBe(400);
    expect(res.body.error.code).toBe("INVALID_INPUT");
  });

  it("a manager cannot record interactions; only scanners can", async () => {
    const h = await holder();
    const occ = await freshOccurrence(lunch, eventA);
    const res = await api(base, "POST", "/api/v1/interactions", { cookie: managerCookie, body: scanFields({ credential: h.token, occurrenceId: occ }) });
    expect(res.status).toBe(403);
  });
});
