import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { api, close, grant, makeEvent, resetDatabase, sessionFor, startServer, TEST_URL } from "./harness.js";

describe.skipIf(!TEST_URL)("credentials", () => {
  let pool, server, base, managerCookie, staffCookie;
  let eventA, eventB, participantA;

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
    const p = await api(base, "POST", `/api/v1/events/${eventA}/participants`, {
      cookie: managerCookie,
      body: { person: { fullName: "Michael Banda" } },
    });
    participantA = p.body.participant.id;
  });

  afterAll(async () => {
    await close(server, pool);
  });

  // Staff operate the camp but do not issue passes: that is a manager decision.
  it("staff cannot issue a credential, though they can see the list", async () => {
    const refused = await api(base, "POST", `/api/v1/event-participants/${participantA}/credentials`, { cookie: staffCookie, body: {} });
    expect(refused.status).toBe(403);
    const listed = await api(base, "GET", `/api/v1/event-participants/${participantA}/credentials`, { cookie: staffCookie });
    expect(listed.status).toBe(200);
  });

  it("a manager issues a credential, and the raw token is returned once", async () => {
    const fresh = await api(base, "POST", `/api/v1/events/${eventA}/participants`, { cookie: managerCookie, body: { person: { fullName: "Issue Once" } } });
    const res = await api(base, "POST", `/api/v1/event-participants/${fresh.body.participant.id}/credentials`, { cookie: managerCookie, body: {} });
    expect(res.status).toBe(201);
    expect(res.body.token).toMatch(/^EP1:[A-Za-z0-9_-]{43}$/);
    expect(res.body.credential).toMatchObject({ kind: "qr", status: "active", tokenHint: res.body.token.slice(-4) });

    const listed = await api(base, "GET", `/api/v1/event-participants/${fresh.body.participant.id}/credentials`, { cookie: managerCookie });
    expect(listed.status).toBe(200);
    expect(listed.text).not.toContain(res.body.token);
  });

  it("the raw token is never persisted in PostgreSQL", async () => {
    const fresh = await api(base, "POST", `/api/v1/events/${eventA}/participants`, {
      cookie: managerCookie,
      body: { person: { fullName: "Persist Check" } },
    });
    const issued = await api(base, "POST", `/api/v1/event-participants/${fresh.body.participant.id}/credentials`, { cookie: managerCookie, body: {} });
    const rows = await pool.query("select row_to_json(c)::text as j from credentials c");
    for (const row of rows.rows) {
      expect(row.j).not.toContain(issued.body.token);
      expect(row.j).not.toContain(issued.body.token.slice(4));
    }
  });

  it("the credential contains no participant data and no sequence number", async () => {
    const fresh = await api(base, "POST", `/api/v1/events/${eventA}/participants`, {
      cookie: managerCookie,
      body: { person: { fullName: "Chipo Zulu" } },
    });
    const issued = await api(base, "POST", `/api/v1/event-participants/${fresh.body.participant.id}/credentials`, { cookie: managerCookie, body: {} });
    expect(issued.body.token).not.toMatch(/chipo|zulu|camp|youth|TK\d/i);
  });

  it("a second active credential for one participation is refused; replace it instead", async () => {
    // Make sure one is active first, whatever the earlier tests did.
    await api(base, "POST", `/api/v1/event-participants/${participantA}/credentials`, { cookie: managerCookie, body: {} });
    const res = await api(base, "POST", `/api/v1/event-participants/${participantA}/credentials`, { cookie: managerCookie, body: {} });
    expect(res.status).toBe(409);
    expect(res.body.error.code).toBe("CREDENTIAL_ALREADY_ACTIVE");
  });

  it("replacing a credential retires the old one and returns a new token", async () => {
    const before = (await pool.query("select id from credentials where event_participant_id = $1 and status = 'active'", [participantA])).rows[0];
    const refused = await api(base, "POST", `/api/v1/credentials/${before.id}/replace`, { cookie: staffCookie, body: {} });
    expect(refused.status).toBe(403);
    const res = await api(base, "POST", `/api/v1/credentials/${before.id}/replace`, { cookie: managerCookie, body: {} });
    expect(res.status).toBe(201);
    expect(res.body.token).toMatch(/^EP1:/);
    const old = (await pool.query("select status, replaced_by from credentials where id = $1", [before.id])).rows[0];
    expect(old.status).toBe("replaced");
    expect(old.replaced_by).toBe(res.body.credential.id);
  });

  it("a revoked credential is marked revoked and cannot be revoked twice", async () => {
    const active = (await pool.query("select id from credentials where event_participant_id = $1 and status = 'active'", [participantA])).rows[0];
    const staffRevoke = await api(base, "POST", `/api/v1/credentials/${active.id}/revoke`, { cookie: staffCookie, body: {} });
    expect(staffRevoke.status).toBe(403);
    const res = await api(base, "POST", `/api/v1/credentials/${active.id}/revoke`, { cookie: managerCookie, body: {} });
    expect(res.status).toBe(200);
    expect(res.body.credential.status).toBe("revoked");
    const again = await api(base, "POST", `/api/v1/credentials/${active.id}/revoke`, { cookie: managerCookie, body: {} });
    expect(again.status).toBe(409);
    expect(again.body.error.code).toBe("CREDENTIAL_NOT_ACTIVE");
  });

  it("a manager of one event cannot issue credentials for another event's participant", async () => {
    const res = await api(base, "POST", `/api/v1/event-participants/${participantA}/credentials`, {
      cookie: await sessionFor(base, pool, "outsider@example.org"),
      body: {},
    });
    expect(res.status).toBe(404);
  });
});
