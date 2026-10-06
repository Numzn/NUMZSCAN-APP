import crypto from "node:crypto";
import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { api, close, grant, makeEvent, makeOccurrence, resetDatabase, sessionFor, startServer, TEST_URL } from "./harness.js";

const future = (days = 1) => new Date(Date.now() + days * 86400e3).toISOString();
const INSIDE = "2026-12-02T12:00:00Z";
const LATER = "2026-12-03T12:00:00Z";
const DEPART = "2026-12-04T12:00:00Z";
const WINDOW = (start, end) => ({ startsAt: start, endsAt: end });

describe.skipIf(!TEST_URL)("staff operations: scanning, check-in and check-out, meals, checkpoints", () => {
  let pool, server, base;
  let managerCookie, staffCookie, staffBCookie, managerBCookie;
  let eventA, eventB;
  let checkIn, departure, lunch, supper, checkInOnce;
  let occCheckIn, occCheckInLater, occDepart, occLunch, occSupper;

  let seq = 0;
  const name = (prefix) => `${prefix} ${++seq}`;

  async function participant(eventId, cookie, fullName = name("Camper")) {
    const res = await api(base, "POST", `/api/v1/events/${eventId}/participants`, { cookie, body: { person: { fullName } } });
    return res.body.participant;
  }

  // A participant with a live pass, created and issued by a manager of the given event.
  async function holder(eventId = eventA, cookie = managerCookie) {
    const p = await participant(eventId, cookie);
    const cred = await api(base, "POST", `/api/v1/event-participants/${p.id}/credentials`, { cookie, body: {} });
    return { participantId: p.id, token: cred.body.token, credentialId: cred.body.credential.id };
  }

  async function staffScan(cookie, eventId, fields) {
    return api(base, "POST", `/api/v1/events/${eventId}/scans`, {
      cookie,
      body: { id: crypto.randomUUID(), scannedAt: INSIDE, ...fields },
    });
  }

  async function statusOf(participantId) {
    return (await pool.query("select status from event_participants where id = $1", [participantId])).rows[0].status;
  }

  const count = async (sql, params = []) => Number((await pool.query(sql, params)).rows[0].n);

  beforeAll(async () => {
    pool = await resetDatabase();
    ({ server, base } = await startServer(pool));
    managerCookie = await sessionFor(base, pool, "manager@ops.test");
    staffCookie = await sessionFor(base, pool, "staff@ops.test");
    staffBCookie = await sessionFor(base, pool, "staffb@ops.test");
    managerBCookie = await sessionFor(base, pool, "managerb@ops.test");
    eventA = await makeEvent(pool, { slug: "ops-a" });
    eventB = await makeEvent(pool, { slug: "ops-b" });
    await grant(pool, "manager@ops.test", eventA, "event_manager");
    await grant(pool, "staff@ops.test", eventA, "staff");
    await grant(pool, "staff@ops.test", eventB, "staff");
    await grant(pool, "staffb@ops.test", eventB, "staff");
    await grant(pool, "managerb@ops.test", eventB, "event_manager");

    const cp = async (event, kind, rule, cpName) =>
      (await pool.query("insert into checkpoints (event_id, name, kind, rule_type) values ($1, $2, $3, $4) returning id", [event, cpName, kind, rule])).rows[0].id;
    checkIn = await cp(eventA, "check_in", "once_per_occurrence", "Check-in desk");
    checkInOnce = await cp(eventA, "check_in", "once_per_event", "Gate once");
    departure = await cp(eventA, "departure", "once_per_occurrence", "Departure desk");
    lunch = await cp(eventA, "meal", "once_per_occurrence", "Lunch");
    supper = await cp(eventA, "meal", "once_per_occurrence", "Supper");

    occCheckIn = await makeOccurrence(pool, eventA, checkIn, { ...WINDOW("2026-12-02T10:00:00Z", "2026-12-02T14:00:00Z"), label: "Arrival" });
    occCheckInLater = await makeOccurrence(pool, eventA, checkIn, { ...WINDOW("2026-12-03T10:00:00Z", "2026-12-03T14:00:00Z"), label: "Day 2" });
    occDepart = await makeOccurrence(pool, eventA, departure, { ...WINDOW("2026-12-04T10:00:00Z", "2026-12-04T14:00:00Z"), label: "Departure" });
    occLunch = await makeOccurrence(pool, eventA, lunch, { ...WINDOW("2026-12-02T11:00:00Z", "2026-12-02T13:00:00Z"), label: "Lunch day 1" });
    occSupper = await makeOccurrence(pool, eventA, supper, { ...WINDOW("2026-12-02T17:00:00Z", "2026-12-02T19:00:00Z"), label: "Supper day 1" });
  });

  afterAll(async () => {
    await close(server, pool);
  });

  describe("authorization", () => {
    it("staff can scan at an active checkpoint of their event", async () => {
      const h = await holder();
      const res = await staffScan(staffCookie, eventA, { credential: h.token, checkpointId: lunch, occurrenceId: occLunch });
      expect(res.status).toBe(201);
      expect(res.body.operation).toBe("meal");
    });

    it("staff cannot create or change checkpoints", async () => {
      expect((await api(base, "POST", `/api/v1/events/${eventA}/checkpoints`, { cookie: staffCookie, body: { name: "X", kind: "generic", ruleType: "unlimited" } })).status).toBe(403);
      expect((await api(base, "PATCH", `/api/v1/checkpoints/${lunch}`, { cookie: staffCookie, body: { name: "Changed" } })).status).toBe(403);
    });

    it("staff cannot change a participant's group or profile", async () => {
      const p = await participant(eventA, managerCookie);
      const g = await api(base, "POST", `/api/v1/events/${eventA}/groups`, { cookie: managerCookie, body: { name: name("Group"), kind: "team" } });
      expect((await api(base, "PATCH", `/api/v1/event-participants/${p.id}`, { cookie: staffCookie, body: { groupId: g.body.group.id } })).status).toBe(403);
      expect((await api(base, "PATCH", `/api/v1/event-participants/${p.id}`, { cookie: staffCookie, body: { role: "leader" } })).status).toBe(403);
    });

    it("staff cannot manage scanner devices or event membership", async () => {
      expect((await api(base, "POST", `/api/v1/events/${eventA}/scanner-devices`, { cookie: staffCookie, body: { name: "Gate", expiresAt: future() } })).status).toBe(403);
      expect((await api(base, "POST", `/api/v1/events/${eventA}/memberships`, { cookie: staffCookie, body: { userId: crypto.randomUUID(), role: "staff" } })).status).toBe(403);
    });

    it("a manager can create, edit and switch checkpoints", async () => {
      const created = await api(base, "POST", `/api/v1/events/${eventA}/checkpoints`, { cookie: managerCookie, body: { name: "Service", kind: "service", ruleType: "unlimited" } });
      expect(created.status).toBe(201);
      const renamed = await api(base, "PATCH", `/api/v1/checkpoints/${created.body.checkpoint.id}`, { cookie: managerCookie, body: { name: "Morning service", active: false } });
      expect(renamed.status).toBe(200);
      expect(renamed.body.checkpoint).toMatchObject({ name: "Morning service", active: false });
    });

    it("event isolation: a staff member of another event cannot scan here, or see this event's checkpoints", async () => {
      const h = await holder();
      const res = await staffScan(staffBCookie, eventA, { credential: h.token, checkpointId: lunch, occurrenceId: occLunch });
      expect(res.status).toBe(404);
      const listed = await api(base, "GET", `/api/v1/events/${eventA}/checkpoints`, { cookie: staffBCookie });
      expect(listed.status).toBe(404);
    });

    it("event isolation: a manager of another event cannot edit this event's checkpoint", async () => {
      expect((await api(base, "PATCH", `/api/v1/checkpoints/${lunch}`, { cookie: managerBCookie, body: { name: "Hijack" } })).status).toBe(404);
    });

    it("event isolation: a credential from another event is not found when scanned here", async () => {
      const other = await holder(eventB, managerBCookie);
      const res = await staffScan(staffCookie, eventA, { credential: other.token, checkpointId: lunch, occurrenceId: occLunch });
      expect(res.status).toBe(404);
      expect(res.body.error.code).toBe("CREDENTIAL_NOT_FOUND");
    });
  });

  describe("scan outcomes", () => {
    it("an invalid credential format is refused before anything is recorded", async () => {
      const before = await count("select count(*)::int as n from interactions where event_id = $1", [eventA]);
      const res = await staffScan(staffCookie, eventA, { credential: "EP1:too-short", checkpointId: lunch, occurrenceId: occLunch });
      expect(res.status).toBe(400);
      expect(await count("select count(*)::int as n from interactions where event_id = $1", [eventA])).toBe(before);
    });

    it("an unknown credential is refused", async () => {
      const res = await staffScan(staffCookie, eventA, { credential: `EP1:${"a".repeat(43)}`, checkpointId: lunch, occurrenceId: occLunch });
      expect(res.status).toBe(404);
      expect(res.body.error.code).toBe("CREDENTIAL_NOT_FOUND");
    });

    it("a revoked credential is refused and the attempt is recorded as revoked", async () => {
      const h = await holder();
      await api(base, "POST", `/api/v1/credentials/${h.credentialId}/revoke`, { cookie: managerCookie, body: {} });
      const res = await staffScan(staffCookie, eventA, { credential: h.token, checkpointId: lunch, occurrenceId: occLunch });
      expect(res.status).toBe(403);
      expect(res.body.error.code).toBe("CREDENTIAL_REVOKED");
      const rec = await pool.query("select outcome from interactions where credential_id = $1", [h.credentialId]);
      expect(rec.rows[0].outcome).toBe("revoked");
    });

    it("an expired credential is refused and recorded as rejected", async () => {
      const h = await holder();
      await pool.query("update credentials set issued_at = now() - interval '2 days', expires_at = now() - interval '1 day' where id = $1", [h.credentialId]);
      const res = await staffScan(staffCookie, eventA, { credential: h.token, checkpointId: lunch, occurrenceId: occLunch });
      expect(res.status).toBe(403);
      expect(res.body.error.code).toBe("CREDENTIAL_EXPIRED");
    });

    it("an inactive checkpoint takes no scans", async () => {
      const off = (await pool.query("insert into checkpoints (event_id, name, kind, rule_type, active) values ($1, 'Closed', 'meal', 'unlimited', false) returning id", [eventA])).rows[0].id;
      const occ = await makeOccurrence(pool, eventA, off, { ...WINDOW("2026-12-02T10:00:00Z", "2026-12-02T14:00:00Z"), label: "Closed" });
      const h = await holder();
      const res = await staffScan(staffCookie, eventA, { credential: h.token, checkpointId: off, occurrenceId: occ });
      expect(res.status).toBe(409);
      expect(res.body.error.code).toBe("CHECKPOINT_INACTIVE");
    });
  });

  describe("check-in and check-out", () => {
    it("a staff check-in marks the participant checked in and records the operator", async () => {
      const h = await holder();
      const res = await staffScan(staffCookie, eventA, { credential: h.token, checkpointId: checkIn, occurrenceId: occCheckIn });
      expect(res.status).toBe(201);
      expect(res.body.operation).toBe("check_in");
      expect(res.body.participant).toMatchObject({ status: "checked_in" });
      expect(await statusOf(h.participantId)).toBe("checked_in");
      const rec = await pool.query("select operator_user_id, device_id from interactions where id = $1", [res.body.interaction.id]);
      expect(rec.rows[0].device_id).toBeNull();
      expect(rec.rows[0].operator_user_id).toBeTruthy();
    });

    it("a second check-in for a checked-in participant is refused as a recorded duplicate", async () => {
      const h = await holder();
      await staffScan(staffCookie, eventA, { credential: h.token, checkpointId: checkIn, occurrenceId: occCheckIn });
      const again = await staffScan(staffCookie, eventA, { credential: h.token, checkpointId: checkIn, occurrenceId: occCheckInLater, scannedAt: LATER });
      expect(again.status).toBe(409);
      expect(again.body.error.code).toBe("ALREADY_CHECKED_IN");
      expect(again.body.error.details.participant.status).toBe("checked_in");
      const stored = await pool.query("select outcome from interactions where event_participant_id = $1 and occurrence_id = $2", [h.participantId, occCheckInLater]);
      expect(stored.rows[0].outcome).toBe("duplicate");
      expect(await statusOf(h.participantId)).toBe("checked_in");
    });

    it("a check-out marks the participant departed", async () => {
      const h = await holder();
      await staffScan(staffCookie, eventA, { credential: h.token, checkpointId: checkIn, occurrenceId: occCheckIn });
      const out = await staffScan(staffCookie, eventA, { credential: h.token, checkpointId: departure, occurrenceId: occDepart, scannedAt: DEPART });
      expect(out.status).toBe(201);
      expect(out.body.operation).toBe("check_out");
      expect(await statusOf(h.participantId)).toBe("departed");
    });

    it("a second check-out is refused as already checked out", async () => {
      const h = await holder();
      await staffScan(staffCookie, eventA, { credential: h.token, checkpointId: checkIn, occurrenceId: occCheckIn });
      await staffScan(staffCookie, eventA, { credential: h.token, checkpointId: departure, occurrenceId: occDepart, scannedAt: DEPART });
      const again = await staffScan(staffCookie, eventA, { credential: h.token, checkpointId: departure, occurrenceId: occDepart, scannedAt: DEPART });
      expect(again.status).toBe(409);
      expect(again.body.error.code).toBe("ALREADY_CHECKED_OUT");
    });

    it("checking out someone who never checked in is refused and recorded", async () => {
      const h = await holder();
      const res = await staffScan(staffCookie, eventA, { credential: h.token, checkpointId: departure, occurrenceId: occDepart, scannedAt: DEPART });
      expect(res.status).toBe(409);
      expect(res.body.error.code).toBe("NOT_CHECKED_IN");
      expect(await statusOf(h.participantId)).toBe("registered");
    });

    it("a cancelled participant cannot be checked in", async () => {
      const h = await holder();
      await api(base, "PATCH", `/api/v1/event-participants/${h.participantId}`, { cookie: managerCookie, body: { status: "cancelled" } });
      const res = await staffScan(staffCookie, eventA, { credential: h.token, checkpointId: checkIn, occurrenceId: occCheckIn });
      expect(res.status).toBe(409);
      expect(res.body.error.code).toBe("PARTICIPANT_CANCELLED");
    });

    it("a repeat scan with the same id is a replay, and changes nothing twice", async () => {
      const h = await holder();
      const id = crypto.randomUUID();
      const first = await api(base, "POST", `/api/v1/events/${eventA}/scans`, { cookie: staffCookie, body: { id, credential: h.token, checkpointId: checkIn, occurrenceId: occCheckIn, scannedAt: INSIDE } });
      const retry = await api(base, "POST", `/api/v1/events/${eventA}/scans`, { cookie: staffCookie, body: { id, credential: h.token, checkpointId: checkIn, occurrenceId: occCheckIn, scannedAt: INSIDE } });
      expect(first.status).toBe(201);
      expect(retry.status).toBe(200);
      expect(retry.body.replayed).toBe(true);
      expect(await count("select count(*)::int as n from audit_log where entity = 'interaction' and entity_id = $1", [id])).toBe(1);
    });

    it("the check-in and the audit entry are written together: if the status change fails, neither is kept", async () => {
      const h = await holder();
      await pool.query(`create or replace function fail_departure() returns trigger language plpgsql as $$
        begin raise exception 'simulated failure'; end; $$`);
      await pool.query(`create trigger fail_departure before update of status on event_participants
        for each row when (new.status = 'departed') execute function fail_departure()`);
      try {
        await staffScan(staffCookie, eventA, { credential: h.token, checkpointId: checkIn, occurrenceId: occCheckIn });
        const out = await staffScan(staffCookie, eventA, { credential: h.token, checkpointId: departure, occurrenceId: occDepart, scannedAt: DEPART });
        expect(out.status).toBe(500);
        expect(await statusOf(h.participantId)).toBe("checked_in");
        expect(await count("select count(*)::int as n from interactions where event_participant_id = $1 and checkpoint_id = $2", [h.participantId, departure])).toBe(0);
      } finally {
        await pool.query("drop trigger if exists fail_departure on event_participants");
        await pool.query("drop function if exists fail_departure()");
      }
    });
  });

  describe("meals", () => {
    it("a valid meal scan is accepted and does not change the participant's status", async () => {
      const h = await holder();
      const res = await staffScan(staffCookie, eventA, { credential: h.token, checkpointId: lunch, occurrenceId: occLunch });
      expect(res.status).toBe(201);
      expect(res.body.operation).toBe("meal");
      expect(await statusOf(h.participantId)).toBe("registered");
    });

    it("a duplicate meal at the same service is refused", async () => {
      const h = await holder();
      await staffScan(staffCookie, eventA, { credential: h.token, checkpointId: lunch, occurrenceId: occLunch });
      const again = await staffScan(staffCookie, eventA, { credential: h.token, checkpointId: lunch, occurrenceId: occLunch });
      expect(again.status).toBe(409);
      expect(again.body.error.code).toBe("DUPLICATE_INTERACTION");
    });

    it("different meal types are separate claims", async () => {
      const h = await holder();
      expect((await staffScan(staffCookie, eventA, { credential: h.token, checkpointId: lunch, occurrenceId: occLunch })).status).toBe(201);
      expect((await staffScan(staffCookie, eventA, { credential: h.token, checkpointId: supper, occurrenceId: occSupper, scannedAt: "2026-12-02T18:00:00Z" })).status).toBe(201);
    });
  });

  describe("audit trail", () => {
    it("every operational scan writes an audit entry with the operator and outcome, and no credential or personal data", async () => {
      const h = await holder();
      const res = await staffScan(staffCookie, eventA, { credential: h.token, checkpointId: checkIn, occurrenceId: occCheckIn });
      const rows = (await pool.query(
        "select actor, action, entity, entity_id, details::text as details from audit_log where entity = 'interaction' and entity_id = $1",
        [res.body.interaction.id]
      )).rows;
      expect(rows).toHaveLength(1);
      expect(rows[0].action).toBe("scan");
      const details = JSON.parse(rows[0].details);
      expect(details).toMatchObject({ operation: "check_in", outcome: "accepted", recordedBy: "user" });
      expect(rows[0].details).not.toContain(h.token);
      expect(rows[0].details).not.toMatch(/Camper/);
    });

    it("the device scan path writes an audit entry too, recorded by the device", async () => {
      const created = (await api(base, "POST", `/api/v1/events/${eventA}/scanner-devices`, { cookie: managerCookie, body: { name: "Gate", expiresAt: future() } })).body;
      const device = created.device;
      const h = await holder();
      const id = crypto.randomUUID();
      const res = await api(base, "POST", "/api/v1/interactions", {
        scanner: created.secret,
        body: { id, credential: h.token, checkpointId: checkIn, occurrenceId: occCheckIn, scannedAt: INSIDE },
      });
      expect(res.status).toBe(201);
      expect(await statusOf(h.participantId)).toBe("checked_in");
      const row = (await pool.query("select actor, details::text as d from audit_log where entity = 'interaction' and entity_id = $1", [id])).rows[0];
      expect(row.actor).toBe(device.id);
      expect(JSON.parse(row.d)).toMatchObject({ recordedBy: "device", operation: "check_in" });
    });
  });

  describe("checkpoint management", () => {
    it("rename and activate/deactivate apply at once, and a deactivated checkpoint takes no scans", async () => {
      const cp = (await api(base, "POST", `/api/v1/events/${eventA}/checkpoints`, { cookie: managerCookie, body: { name: "Gate", kind: "generic", ruleType: "unlimited" } })).body.checkpoint;
      const occ = await makeOccurrence(pool, eventA, cp.id, { ...WINDOW("2026-12-02T10:00:00Z", "2026-12-02T14:00:00Z"), label: "Gate" });
      await api(base, "PATCH", `/api/v1/checkpoints/${cp.id}`, { cookie: managerCookie, body: { active: false } });
      const h = await holder();
      expect((await staffScan(staffCookie, eventA, { credential: h.token, checkpointId: cp.id, occurrenceId: occ })).body.error.code).toBe("CHECKPOINT_INACTIVE");
      await api(base, "PATCH", `/api/v1/checkpoints/${cp.id}`, { cookie: managerCookie, body: { active: true, name: "Gate 1" } });
      expect((await staffScan(staffCookie, eventA, { credential: h.token, checkpointId: cp.id, occurrenceId: occ })).status).toBe(201);
    });

    it("kind and rule can change while the checkpoint has no scans", async () => {
      const cp = (await api(base, "POST", `/api/v1/events/${eventA}/checkpoints`, { cookie: managerCookie, body: { name: "Flex", kind: "generic", ruleType: "unlimited" } })).body.checkpoint;
      const res = await api(base, "PATCH", `/api/v1/checkpoints/${cp.id}`, { cookie: managerCookie, body: { kind: "meal", ruleType: "once_per_occurrence" } });
      expect(res.status).toBe(200);
      expect(res.body.checkpoint).toMatchObject({ kind: "meal", ruleType: "once_per_occurrence", hasScans: false });
    });

    it("kind and rule are locked once the checkpoint has recorded a scan", async () => {
      const h = await holder();
      await staffScan(staffCookie, eventA, { credential: h.token, checkpointId: lunch, occurrenceId: occLunch });
      const res = await api(base, "PATCH", `/api/v1/checkpoints/${lunch}`, { cookie: managerCookie, body: { kind: "generic" } });
      expect(res.status).toBe(409);
      expect(res.body.error.code).toBe("CHECKPOINT_LOCKED");
      const renamed = await api(base, "PATCH", `/api/v1/checkpoints/${lunch}`, { cookie: managerCookie, body: { name: "Lunch hall" } });
      expect(renamed.status).toBe(200);
      const listed = await api(base, "GET", `/api/v1/events/${eventA}/checkpoints`, { cookie: managerCookie });
      expect(listed.body.checkpoints.find((c) => c.id === lunch).hasScans).toBe(true);
    });

    it("a once-per-event rule is refused while the checkpoint has more than one occurrence", async () => {
      const cp = (await api(base, "POST", `/api/v1/events/${eventA}/checkpoints`, { cookie: managerCookie, body: { name: "Two days", kind: "activity", ruleType: "unlimited" } })).body.checkpoint;
      await makeOccurrence(pool, eventA, cp.id, { ...WINDOW("2026-12-02T10:00:00Z", "2026-12-02T14:00:00Z"), label: "A" });
      await makeOccurrence(pool, eventA, cp.id, { ...WINDOW("2026-12-03T10:00:00Z", "2026-12-03T14:00:00Z"), label: "B" });
      const res = await api(base, "PATCH", `/api/v1/checkpoints/${cp.id}`, { cookie: managerCookie, body: { ruleType: "once_per_event" } });
      expect(res.status).toBe(409);
      expect(res.body.error.code).toBe("RULE_CONFLICT");
    });
  });

  describe("attendance summary", () => {
    it("totals attendance by status and group, and meals by checkpoint", async () => {
      const res = await api(base, "GET", `/api/v1/events/${eventA}/attendance`, { cookie: staffCookie });
      expect(res.status).toBe(200);
      expect(res.body.counts).toEqual(expect.objectContaining({ registered: expect.any(Number), checked_in: expect.any(Number), departed: expect.any(Number) }));
      expect(Array.isArray(res.body.byGroup)).toBe(true);
      expect(res.body.meals.find((m) => m.name === "Lunch hall")).toBeDefined();
    });

    it("the summary is event-isolated", async () => {
      expect((await api(base, "GET", `/api/v1/events/${eventA}/attendance`, { cookie: staffBCookie })).status).toBe(404);
    });
  });
});
