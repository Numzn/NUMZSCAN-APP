import { readFile } from "node:fs/promises";
import crypto from "node:crypto";
import path from "node:path";
import { fileURLToPath } from "node:url";
import pg from "pg";
import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { applyMigrations } from "../../api/scripts/migrate.js";
import { assertTestDatabase } from "../api/harness.js";

// Runs against a scratch database only. Set TEST_DATABASE_URL to enable; the
// suite is skipped otherwise. The schema is dropped and rebuilt on every run.
const url = process.env.TEST_DATABASE_URL;
const here = path.dirname(fileURLToPath(import.meta.url));

const UNIQUE = "23505";
const FOREIGN_KEY = "23503";
const CHECK = "23514";
const APPEND_ONLY = "42501";

const hmac = () => crypto.randomBytes(32).toString("hex");
const suffix = () => crypto.randomUUID().slice(0, 8);

describe.skipIf(!url)("EventPass v2 schema", () => {
  let pool;

  beforeAll(async () => {
    assertTestDatabase(url);
    pool = new pg.Pool({ connectionString: url, max: 10 });
    await pool.query("drop schema public cascade; create schema public;");
    const legacy = await readFile(path.join(here, "../../api/src/schema.sql"), "utf8");
    await pool.query(legacy);
    await applyMigrations(url);
  });

  afterAll(async () => {
    await pool?.end();
  });

  async function expectError(promise, code) {
    try {
      await promise;
    } catch (err) {
      expect(err.code).toBe(code);
      return err;
    }
    throw new Error(`expected SQLSTATE ${code}, but the statement succeeded`);
  }

  async function makeEvent({ startsOn = "2026-12-01", endsOn = "2026-12-05" } = {}) {
    const { rows } = await pool.query(
      `insert into events (slug, name, kind, timezone, starts_on, ends_on)
       values ($1, 'Youth Camp', 'church_camp', 'Africa/Lusaka', $2, $3) returning id`,
      [`camp-${suffix()}`, startsOn, endsOn]
    );
    return rows[0].id;
  }

  async function makePerson(name = "Michael Banda") {
    const { rows } = await pool.query(
      "insert into people (full_name, normalized_name) values ($1, $2) returning id",
      [name, name.toLowerCase()]
    );
    return rows[0].id;
  }

  async function makeParticipation(eventId, personId, groupId = null) {
    const { rows } = await pool.query(
      `insert into event_participants (event_id, person_id, group_id)
       values ($1, $2, $3) returning id`,
      [eventId, personId, groupId]
    );
    return rows[0].id;
  }

  async function makeCredential(eventId, participationId, token = hmac()) {
    const { rows } = await pool.query(
      `insert into credentials (event_id, event_participant_id, token_hmac, token_hint)
       values ($1, $2, $3, 'hint') returning id`,
      [eventId, participationId, token]
    );
    return rows[0].id;
  }

  async function makeCheckpoint(eventId, ruleType, name = "Lunch") {
    const { rows } = await pool.query(
      `insert into checkpoints (event_id, name, kind, rule_type)
       values ($1, $2, 'meal', $3) returning id`,
      [eventId, name, ruleType]
    );
    return rows[0].id;
  }

  async function makeOccurrence(eventId, checkpointId, label = "Lunch day 1") {
    const { rows } = await pool.query(
      `insert into checkpoint_occurrences
         (event_id, checkpoint_id, label, starts_at, ends_at, service_date)
       values ($1, $2, $3, '2026-12-02 12:00+02', '2026-12-02 13:30+02', '2026-12-02')
       returning id`,
      [eventId, checkpointId, label]
    );
    return rows[0].id;
  }

  async function makeDevice(eventId) {
    const { rows } = await pool.query(
      `insert into scanner_devices (event_id, name, token_hmac, enrolled_by, expires_at)
       values ($1, 'gate-1', $2, 'admin', now() + interval '1 day') returning id`,
      [eventId, hmac()]
    );
    return rows[0].id;
  }

  // A complete, valid chain: event, participant, credential, checkpoint, occurrence, device.
  async function makeChain(ruleType = "once_per_occurrence") {
    const eventId = await makeEvent();
    const personId = await makePerson();
    const participationId = await makeParticipation(eventId, personId);
    const credentialId = await makeCredential(eventId, participationId);
    const checkpointId = await makeCheckpoint(eventId, ruleType);
    const occurrenceId = await makeOccurrence(eventId, checkpointId);
    const deviceId = await makeDevice(eventId);
    return { eventId, personId, participationId, credentialId, checkpointId, occurrenceId, deviceId };
  }

  function insertInteraction(c, overrides = {}) {
    const row = {
      id: crypto.randomUUID(),
      eventId: c.eventId,
      checkpointId: c.checkpointId,
      occurrenceId: c.occurrenceId,
      participationId: c.participationId,
      credentialId: c.credentialId,
      deviceId: c.deviceId,
      outcome: "accepted",
      ...overrides,
    };
    return pool.query(
      `insert into interactions
         (id, event_id, checkpoint_id, occurrence_id, event_participant_id,
          credential_id, device_id, scanned_at, outcome, dedupe_applies)
       values ($1, $2, $3, $4, $5, $6, $7, now(), $8, coalesce($9::boolean, true))`,
      [
        row.id,
        row.eventId,
        row.checkpointId,
        row.occurrenceId,
        row.participationId,
        row.credentialId,
        row.deviceId,
        row.outcome,
        row.dedupeApplies ?? null,
      ]
    );
  }

  describe("migration", () => {
    it("is idempotent: applying again changes nothing", async () => {
      await applyMigrations(url);
      const { rows } = await pool.query("select name from schema_migrations order by name");
      expect(rows.map((r) => r.name)).toEqual([
        "0001_eventpass_v2.sql",
        "0002_identity_and_access.sql",
        "0003_registration.sql",
        "0004_staff_scanning.sql",
      ]);
    });

    it("leaves the legacy ticket tables in place", async () => {
      const { rows } = await pool.query(
        `select table_name from information_schema.tables
         where table_schema = 'public' and table_name in ('tickets', 'ticket_scans')
         order by table_name`
      );
      expect(rows.map((r) => r.table_name)).toEqual(["ticket_scans", "tickets"]);
    });
  });

  describe("people and event participation", () => {
    it("a person can exist without any event", async () => {
      await expect(makePerson("Grace Phiri")).resolves.toBeTruthy();
    });

    it("one person cannot be registered twice for the same event", async () => {
      const eventId = await makeEvent();
      const personId = await makePerson();
      await makeParticipation(eventId, personId);
      await expectError(makeParticipation(eventId, personId), UNIQUE);
    });

    it("the same person can attend two different events", async () => {
      const personId = await makePerson();
      const camp2026 = await makeEvent();
      const camp2027 = await makeEvent({ startsOn: "2027-12-01", endsOn: "2027-12-05" });
      await makeParticipation(camp2026, personId);
      await expect(makeParticipation(camp2027, personId)).resolves.toBeTruthy();
    });

    it("a group must belong to the same event as the participation", async () => {
      const eventA = await makeEvent();
      const eventB = await makeEvent();
      const { rows } = await pool.query(
        "insert into groups (event_id, name, kind) values ($1, 'Youth A', 'church') returning id",
        [eventB]
      );
      await expectError(makeParticipation(eventA, await makePerson(), rows[0].id), FOREIGN_KEY);
    });

    it("rejects a blank name", async () => {
      await expectError(
        pool.query("insert into people (full_name, normalized_name) values ('   ', '')"),
        CHECK
      );
    });

    it("rejects an event that ends before it starts", async () => {
      await expectError(makeEvent({ startsOn: "2026-12-05", endsOn: "2026-12-01" }), CHECK);
    });
  });

  describe("credentials", () => {
    it("the token must be a 64-character lowercase hex HMAC, never a raw token", async () => {
      const eventId = await makeEvent();
      const participationId = await makeParticipation(eventId, await makePerson());
      await expectError(makeCredential(eventId, participationId, "LHG-TK01-ABCD"), CHECK);
    });

    it("the same token hash cannot be issued twice", async () => {
      const eventId = await makeEvent();
      const token = hmac();
      await makeCredential(eventId, await makeParticipation(eventId, await makePerson("A")), token);
      await expectError(
        makeCredential(eventId, await makeParticipation(eventId, await makePerson("B")), token),
        UNIQUE
      );
    });

    it("a participation has at most one active credential", async () => {
      const eventId = await makeEvent();
      const participationId = await makeParticipation(eventId, await makePerson());
      await makeCredential(eventId, participationId);
      await expectError(makeCredential(eventId, participationId), UNIQUE);
    });

    it("after revocation, a new active credential may be issued", async () => {
      const eventId = await makeEvent();
      const participationId = await makeParticipation(eventId, await makePerson());
      const first = await makeCredential(eventId, participationId);
      await pool.query(
        "update credentials set status = 'revoked', revoked_at = now() where id = $1",
        [first]
      );
      await expect(makeCredential(eventId, participationId)).resolves.toBeTruthy();
    });

    it("a revoked credential must record when it was revoked", async () => {
      const eventId = await makeEvent();
      const participationId = await makeParticipation(eventId, await makePerson());
      await expectError(
        pool.query(
          `insert into credentials (event_id, event_participant_id, token_hmac, status)
           values ($1, $2, $3, 'revoked')`,
          [eventId, participationId, hmac()]
        ),
        CHECK
      );
    });

    it("a credential cannot be attached to a participation in another event", async () => {
      const eventA = await makeEvent();
      const eventB = await makeEvent();
      const participationInB = await makeParticipation(eventB, await makePerson());
      await expectError(makeCredential(eventA, participationInB), FOREIGN_KEY);
    });
  });

  describe("checkpoints and occurrences", () => {
    it("an occurrence must belong to its checkpoint's event", async () => {
      const eventA = await makeEvent();
      const eventB = await makeEvent();
      const checkpointA = await makeCheckpoint(eventA, "once_per_occurrence");
      await expectError(
        pool.query(
          `insert into checkpoint_occurrences
             (event_id, checkpoint_id, label, starts_at, ends_at, service_date)
           values ($1, $2, 'x', now(), now() + interval '1 hour', current_date)`,
          [eventB, checkpointA]
        ),
        FOREIGN_KEY
      );
    });

    it("a once_per_event checkpoint takes exactly one occurrence", async () => {
      const eventId = await makeEvent();
      const checkpointId = await makeCheckpoint(eventId, "once_per_event", "Check-in");
      await makeOccurrence(eventId, checkpointId, "Event-wide");
      await expectError(makeOccurrence(eventId, checkpointId, "Second"), CHECK);
    });

    it("an occurrence must end after it starts", async () => {
      const eventId = await makeEvent();
      const checkpointId = await makeCheckpoint(eventId, "once_per_occurrence");
      await expectError(
        pool.query(
          `insert into checkpoint_occurrences
             (event_id, checkpoint_id, label, starts_at, ends_at, service_date)
           values ($1, $2, 'x', '2026-12-02 13:00+02', '2026-12-02 12:00+02', '2026-12-02')`,
          [eventId, checkpointId]
        ),
        CHECK
      );
    });
  });

  describe("interactions", () => {
    it("a retried upload with the same client id is ignored, not duplicated", async () => {
      const chain = await makeChain("unlimited");
      const id = crypto.randomUUID();
      await insertInteraction(chain, { id });
      const retry = await pool.query(
        `insert into interactions
           (id, event_id, checkpoint_id, occurrence_id, event_participant_id,
            credential_id, device_id, scanned_at, outcome)
         values ($1, $2, $3, $4, $5, $6, $7, now(), 'accepted')
         on conflict (id) do nothing`,
        [id, chain.eventId, chain.checkpointId, chain.occurrenceId, chain.participationId, chain.credentialId, chain.deviceId]
      );
      expect(retry.rowCount).toBe(0);
      const { rows } = await pool.query("select count(*)::int as n from interactions where id = $1", [id]);
      expect(rows[0].n).toBe(1);
    });

    it("once per event: a second accepted scan for the same participant is refused", async () => {
      const chain = await makeChain("once_per_event");
      await insertInteraction(chain);
      await expectError(insertInteraction(chain), UNIQUE);
    });

    it("once per occurrence: a repeat at the same occurrence is refused", async () => {
      const chain = await makeChain("once_per_occurrence");
      await insertInteraction(chain);
      await expectError(insertInteraction(chain), UNIQUE);
    });

    it("once per occurrence: the same participant can attend a different occurrence", async () => {
      const chain = await makeChain("once_per_occurrence");
      await insertInteraction(chain);
      const secondOccurrence = await makeOccurrence(chain.eventId, chain.checkpointId, "Lunch day 2");
      await expect(insertInteraction({ ...chain, occurrenceId: secondOccurrence })).resolves.toBeTruthy();
    });

    it("unlimited: repeated accepted scans are all allowed", async () => {
      const chain = await makeChain("unlimited");
      await insertInteraction(chain);
      await expect(insertInteraction(chain)).resolves.toBeTruthy();
    });

    it("a refused duplicate is still recorded as its own outcome", async () => {
      const chain = await makeChain("once_per_occurrence");
      await insertInteraction(chain);
      await expect(insertInteraction(chain, { outcome: "duplicate" })).resolves.toBeTruthy();
    });

    it("concurrent accepted scans for one participant: exactly one succeeds", async () => {
      const chain = await makeChain("once_per_occurrence");
      const attempts = Array.from({ length: 10 }, () => insertInteraction(chain));
      const results = await Promise.allSettled(attempts);
      const fulfilled = results.filter((r) => r.status === "fulfilled");
      const rejected = results.filter((r) => r.status === "rejected");
      expect(fulfilled).toHaveLength(1);
      expect(rejected).toHaveLength(9);
      for (const r of rejected) expect(r.reason.code).toBe(UNIQUE);
    });

    it("the database decides dedupe_applies from the rule, whatever the caller sends", async () => {
      const chain = await makeChain("once_per_occurrence");
      await insertInteraction(chain, { dedupeApplies: false });
      const { rows } = await pool.query(
        "select dedupe_applies from interactions where event_participant_id = $1",
        [chain.participationId]
      );
      expect(rows[0].dedupe_applies).toBe(true);
    });

    it("unlimited checkpoints do not apply dedupe, regardless of what the caller sends", async () => {
      const chain = await makeChain("unlimited");
      await insertInteraction(chain, { dedupeApplies: true });
      const { rows } = await pool.query(
        "select dedupe_applies from interactions where event_participant_id = $1",
        [chain.participationId]
      );
      expect(rows[0].dedupe_applies).toBe(false);
    });

    it("rejects an interaction whose participant belongs to another event", async () => {
      const chainA = await makeChain();
      const chainB = await makeChain();
      await expectError(
        insertInteraction({ ...chainA, participationId: chainB.participationId }),
        FOREIGN_KEY
      );
    });

    it("rejects an interaction whose credential belongs to another participant", async () => {
      const chainA = await makeChain();
      const chainB = await makeChain();
      await expectError(
        insertInteraction({ ...chainA, credentialId: chainB.credentialId }),
        FOREIGN_KEY
      );
    });

    it("rejects an interaction whose occurrence belongs to another checkpoint", async () => {
      const chain = await makeChain();
      const otherCheckpoint = await makeCheckpoint(chain.eventId, "unlimited", "Supper");
      const otherOccurrence = await makeOccurrence(chain.eventId, otherCheckpoint, "Supper");
      await expectError(insertInteraction({ ...chain, occurrenceId: otherOccurrence }), FOREIGN_KEY);
    });

    it("rejects a device enrolled for another event", async () => {
      const chain = await makeChain();
      const otherEvent = await makeEvent();
      const foreignDevice = await makeDevice(otherEvent);
      await expectError(insertInteraction({ ...chain, deviceId: foreignDevice }), FOREIGN_KEY);
    });

    it("rejects an outcome outside the allowed set", async () => {
      const chain = await makeChain();
      await expectError(insertInteraction(chain, { outcome: "maybe" }), CHECK);
    });
  });

  describe("audit log", () => {
    it("cannot be updated", async () => {
      await pool.query("insert into audit_log (actor, action, entity, entity_id) values ('admin', 'create', 'event', 'x')");
      await expectError(pool.query("update audit_log set actor = 'someone-else'"), APPEND_ONLY);
    });

    it("cannot be deleted from", async () => {
      await expectError(pool.query("delete from audit_log"), APPEND_ONLY);
    });

    it("cannot be truncated", async () => {
      await expectError(pool.query("truncate audit_log"), APPEND_ONLY);
    });
  });
});
