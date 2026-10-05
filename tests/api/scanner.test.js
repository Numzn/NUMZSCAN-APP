import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { api, close, grant, makeCheckpoint, makeEvent, resetDatabase, sessionFor, startServer, TEST_URL } from "./harness.js";

const future = (days = 1) => new Date(Date.now() + days * 86400e3).toISOString();

describe.skipIf(!TEST_URL)("scanner devices", () => {
  let pool, server, base, managerCookie;
  let eventA, eventB, checkpointA;

  beforeAll(async () => {
    pool = await resetDatabase();
    ({ server, base } = await startServer(pool));
    managerCookie = await sessionFor(base, pool, "manager@example.org");
    await sessionFor(base, pool, "staff@example.org");
    eventA = await makeEvent(pool, { slug: "camp-a" });
    eventB = await makeEvent(pool, { slug: "camp-b" });
    await grant(pool, "manager@example.org", eventA, "event_manager");
    await grant(pool, "manager@example.org", eventB, "event_manager");
    checkpointA = await makeCheckpoint(pool, eventA, "once_per_occurrence", "Gate");
  });

  afterAll(async () => {
    await close(server, pool);
  });

  async function enroll(body) {
    return api(base, "POST", `/api/v1/events/${eventA}/scanner-devices`, { cookie: managerCookie, body });
  }

  it("a manager enrols a scanner; the secret is shown once and stored only as an HMAC", async () => {
    const res = await enroll({ name: "Gate 1", expiresAt: future() });
    expect(res.status).toBe(201);
    expect(res.body.secret).toMatch(/^sd_[A-Za-z0-9_-]{43}$/);
    const rows = await pool.query("select row_to_json(d)::text as j from scanner_devices d");
    for (const row of rows.rows) expect(row.j).not.toContain(res.body.secret);
    const listed = await api(base, "GET", `/api/v1/events/${eventA}/scanner-devices`, { cookie: managerCookie });
    expect(listed.text).not.toContain(res.body.secret);
  });

  it("an enrolled scanner can read its own event context", async () => {
    const enrolled = await enroll({ name: "Gate 2", expiresAt: future() });
    const res = await api(base, "GET", "/api/v1/scanner/context", { scanner: enrolled.body.secret });
    expect(res.status).toBe(200);
    expect(res.body.event.id).toBe(eventA);
    expect(res.body).not.toHaveProperty("secret");
  });

  it("a scanner cannot read another event", async () => {
    const enrolled = await enroll({ name: "Gate 3", expiresAt: future() });
    const res = await api(base, "GET", `/api/v1/events/${eventB}`, { scanner: enrolled.body.secret });
    expect(res.status).toBe(403);
  });

  it("a scanner cannot perform admin or manager operations", async () => {
    const enrolled = await enroll({ name: "Gate 4", expiresAt: future() });
    const s = enrolled.body.secret;
    expect((await api(base, "POST", "/api/v1/events", { scanner: s, body: {} })).status).toBe(403);
    expect((await api(base, "GET", "/api/v1/events", { scanner: s })).status).toBe(403);
    expect((await api(base, "POST", `/api/v1/events/${eventA}/checkpoints`, { scanner: s, body: {} })).status).toBe(403);
    expect((await api(base, "GET", `/api/v1/events/${eventA}/participants`, { scanner: s })).status).toBe(403);
  });

  it("a revoked scanner fails", async () => {
    const enrolled = await enroll({ name: "Gate 5", expiresAt: future() });
    const revoke = await api(base, "POST", `/api/v1/scanner-devices/${enrolled.body.device.id}/revoke`, { cookie: managerCookie, body: {} });
    expect(revoke.status).toBe(200);
    const res = await api(base, "GET", "/api/v1/scanner/context", { scanner: enrolled.body.secret });
    expect(res.status).toBe(401);
    expect(res.body.error.code).toBe("DEVICE_REVOKED");
  });

  it("an expired scanner fails", async () => {
    const enrolled = await enroll({ name: "Gate 6", expiresAt: future() });
    await pool.query("update scanner_devices set created_at = now() - interval '2 days', expires_at = now() - interval '1 hour' where id = $1", [enrolled.body.device.id]);
    const res = await api(base, "GET", "/api/v1/scanner/context", { scanner: enrolled.body.secret });
    expect(res.status).toBe(401);
    expect(res.body.error.code).toBe("DEVICE_EXPIRED");
  });

  it("an unknown scanner secret is unauthenticated", async () => {
    const res = await api(base, "GET", "/api/v1/scanner/context", { scanner: "sd_" + "A".repeat(43) });
    expect(res.status).toBe(401);
    expect(res.body.error.code).toBe("UNAUTHENTICATED");
  });

  it("a scanner limited to one checkpoint sees only that checkpoint", async () => {
    const other = await makeCheckpoint(pool, eventA, "unlimited", "Supper");
    const enrolled = await enroll({ name: "Lunch line", expiresAt: future(), checkpointId: checkpointA });
    const res = await api(base, "GET", "/api/v1/scanner/context", { scanner: enrolled.body.secret });
    expect(res.body.checkpoints.map((c) => c.id)).toEqual([checkpointA]);
    expect(res.body.checkpoints.map((c) => c.id)).not.toContain(other);
  });

  it("a device cannot be enrolled for a checkpoint in another event", async () => {
    const otherCheckpoint = await makeCheckpoint(pool, eventB, "unlimited", "Other camp");
    const res = await enroll({ name: "Wrong scope", expiresAt: future(), checkpointId: otherCheckpoint });
    expect(res.status).toBe(404);
  });

  it("an expiry beyond 30 days or in the past is refused", async () => {
    expect((await enroll({ name: "Too long", expiresAt: future(90) })).status).toBe(400);
    expect((await enroll({ name: "Past", expiresAt: future(-1) })).status).toBe(400);
  });
});
