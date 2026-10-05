import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { api, close, grant, makeEvent, resetDatabase, sessionFor, startServer, TEST_URL } from "./harness.js";

describe.skipIf(!TEST_URL)("authorization", () => {
  let pool, server, base;
  let adminCookie, managerCookie, staffCookie;
  let eventA, eventB;

  beforeAll(async () => {
    pool = await resetDatabase();
    ({ server, base } = await startServer(pool));
    adminCookie = await sessionFor(base, pool, "admin@example.org", true);
    managerCookie = await sessionFor(base, pool, "manager@example.org");
    staffCookie = await sessionFor(base, pool, "staff@example.org");
    eventA = await makeEvent(pool, { slug: "camp-a" });
    eventB = await makeEvent(pool, { slug: "camp-b" });
    await grant(pool, "manager@example.org", eventA, "event_manager");
    await grant(pool, "staff@example.org", eventA, "staff");
  });

  afterAll(async () => {
    await close(server, pool);
  });

  it("protected endpoints reject unauthenticated requests", async () => {
    const res = await api(base, "GET", "/api/v1/events");
    expect(res.status).toBe(401);
    expect(res.body.error.code).toBe("UNAUTHENTICATED");
  });

  it("an admin can create an event", async () => {
    const res = await api(base, "POST", "/api/v1/events", {
      cookie: adminCookie,
      body: { slug: "youth-2027", name: "Youth Camp 2027", kind: "church_camp", timezone: "Africa/Lusaka", startsOn: "2027-12-01", endsOn: "2027-12-05" },
    });
    expect(res.status).toBe(201);
    expect(res.body.event).toMatchObject({ slug: "youth-2027", startsOn: "2027-12-01", endsOn: "2027-12-05" });
  });

  it("a duplicate slug is a conflict", async () => {
    const res = await api(base, "POST", "/api/v1/events", {
      cookie: adminCookie,
      body: { slug: "camp-a", name: "Again", kind: "generic", timezone: "UTC", startsOn: "2027-01-01", endsOn: "2027-01-02" },
    });
    expect(res.status).toBe(409);
    expect(res.body.error.code).toBe("SLUG_TAKEN");
  });

  it("an invalid timezone or date range is rejected with a structured error", async () => {
    const bad = await api(base, "POST", "/api/v1/events", {
      cookie: adminCookie,
      body: { slug: "bad-tz", name: "X", kind: "generic", timezone: "Mars/Olympus", startsOn: "2027-01-01", endsOn: "2027-01-02" },
    });
    expect(bad.status).toBe(400);
    expect(bad.body.error.code).toBe("INVALID_INPUT");
    const range = await api(base, "POST", "/api/v1/events", {
      cookie: adminCookie,
      body: { slug: "bad-range", name: "X", kind: "generic", timezone: "UTC", startsOn: "2027-01-05", endsOn: "2027-01-01" },
    });
    expect(range.status).toBe(400);
  });

  it("an event manager cannot create events", async () => {
    const res = await api(base, "POST", "/api/v1/events", {
      cookie: managerCookie,
      body: { slug: "sneaky", name: "X", kind: "generic", timezone: "UTC", startsOn: "2027-01-01", endsOn: "2027-01-02" },
    });
    expect(res.status).toBe(403);
    expect(res.body.error.code).toBe("FORBIDDEN");
  });

  it("staff cannot perform admin-only operations", async () => {
    const res = await api(base, "POST", "/api/v1/events", {
      cookie: staffCookie,
      body: { slug: "staff-try", name: "X", kind: "generic", timezone: "UTC", startsOn: "2027-01-01", endsOn: "2027-01-02" },
    });
    expect(res.status).toBe(403);
  });

  it("an event manager can read their assigned event", async () => {
    const res = await api(base, "GET", `/api/v1/events/${eventA}`, { cookie: managerCookie });
    expect(res.status).toBe(200);
    expect(res.body.event.id).toBe(eventA);
  });

  it("an event manager cannot read another event, and is told it does not exist", async () => {
    const res = await api(base, "GET", `/api/v1/events/${eventB}`, { cookie: managerCookie });
    expect(res.status).toBe(404);
    expect(res.body.error.code).toBe("NOT_FOUND");
  });

  it("an event manager can update their assigned event", async () => {
    const res = await api(base, "PATCH", `/api/v1/events/${eventA}`, { cookie: managerCookie, body: { name: "Renamed Camp" } });
    expect(res.status).toBe(200);
    expect(res.body.event.name).toBe("Renamed Camp");
  });

  it("staff can read but cannot update the event", async () => {
    const read = await api(base, "GET", `/api/v1/events/${eventA}`, { cookie: staffCookie });
    expect(read.status).toBe(200);
    const write = await api(base, "PATCH", `/api/v1/events/${eventA}`, { cookie: staffCookie, body: { name: "Hijack" } });
    expect(write.status).toBe(403);
  });

  it("the event list shows admins every event and managers only their own", async () => {
    const admin = await api(base, "GET", "/api/v1/events", { cookie: adminCookie });
    expect(admin.body.events.map((e) => e.id)).toEqual(expect.arrayContaining([eventA, eventB]));
    const manager = await api(base, "GET", "/api/v1/events", { cookie: managerCookie });
    expect(manager.body.events.map((e) => e.id)).toEqual([eventA]);
  });

  it("an admin can read any event", async () => {
    const res = await api(base, "GET", `/api/v1/events/${eventB}`, { cookie: adminCookie });
    expect(res.status).toBe(200);
  });
});
