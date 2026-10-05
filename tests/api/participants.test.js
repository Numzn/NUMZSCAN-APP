import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { api, close, grant, makeEvent, resetDatabase, sessionFor, startServer, TEST_URL } from "./harness.js";

describe.skipIf(!TEST_URL)("participants, people and groups", () => {
  let pool, server, base, managerCookie, staffCookie;
  let eventA, eventB;

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
  });

  afterAll(async () => {
    await close(server, pool);
  });

  it("a manager registers a new participant for an authorized event", async () => {
    const res = await api(base, "POST", `/api/v1/events/${eventA}/participants`, {
      cookie: managerCookie,
      body: { person: { fullName: "  Michael   Banda ", phone: "+260971000001" } },
    });
    expect(res.status).toBe(201);
    expect(res.body.participant).toMatchObject({ eventId: eventA, fullName: "Michael Banda", role: "camper", status: "registered" });
  });

  it("the path decides the event: a body-supplied eventId is ignored", async () => {
    const res = await api(base, "POST", `/api/v1/events/${eventA}/participants`, {
      cookie: managerCookie,
      body: { person: { fullName: "Grace Phiri" }, eventId: eventB },
    });
    expect(res.status).toBe(201);
    expect(res.body.participant.eventId).toBe(eventA);
  });

  it("registering into an event the caller does not manage fails", async () => {
    const res = await api(base, "POST", `/api/v1/events/${eventB}/participants`, {
      cookie: staffCookie,
      body: { person: { fullName: "Nobody" } },
    });
    expect(res.status).toBe(404);
  });

  it("staff can list participants but cannot register them", async () => {
    const list = await api(base, "GET", `/api/v1/events/${eventA}/participants`, { cookie: staffCookie });
    expect(list.status).toBe(200);
    expect(list.body.participants.length).toBeGreaterThan(0);
    const create = await api(base, "POST", `/api/v1/events/${eventA}/participants`, {
      cookie: staffCookie,
      body: { person: { fullName: "Staff Attempt" } },
    });
    expect(create.status).toBe(403);
  });

  it("the same person can take part in two different events", async () => {
    const first = await api(base, "POST", `/api/v1/events/${eventA}/participants`, {
      cookie: managerCookie,
      body: { person: { fullName: "Tendai Moyo" } },
    });
    const personId = (await pool.query("select person_id from event_participants where id = $1", [first.body.participant.id])).rows[0].person_id;
    const second = await api(base, "POST", `/api/v1/events/${eventB}/participants`, {
      cookie: managerCookie,
      body: { personId },
    });
    expect(second.status).toBe(201);
    expect(second.body.participant.personId).toBe(personId);
  });

  it("registering the same person twice for one event is a conflict", async () => {
    const first = await api(base, "POST", `/api/v1/events/${eventA}/participants`, {
      cookie: managerCookie,
      body: { person: { fullName: "Repeat Person" } },
    });
    const dup = await api(base, "POST", `/api/v1/events/${eventA}/participants`, {
      cookie: managerCookie,
      body: { personId: first.body.participant.personId },
    });
    expect(dup.status).toBe(409);
    expect(dup.body.error.code).toBe("DUPLICATE_PARTICIPATION");
  });

  it("a body must name exactly one of personId or person", async () => {
    const res = await api(base, "POST", `/api/v1/events/${eventA}/participants`, { cookie: managerCookie, body: {} });
    expect(res.status).toBe(400);
    expect(res.body.error.code).toBe("INVALID_INPUT");
  });

  it("groups belong to an event and can be assigned to participants", async () => {
    const group = await api(base, "POST", `/api/v1/events/${eventA}/groups`, {
      cookie: managerCookie,
      body: { name: "Youth Group A", kind: "church" },
    });
    expect(group.status).toBe(201);
    const participant = await api(base, "POST", `/api/v1/events/${eventA}/participants`, {
      cookie: managerCookie,
      body: { person: { fullName: "Assigned Person" } },
    });
    const patched = await api(base, "PATCH", `/api/v1/event-participants/${participant.body.participant.id}`, {
      cookie: managerCookie,
      body: { groupId: group.body.group.id },
    });
    expect(patched.status).toBe(200);
    expect(patched.body.participant.groupId).toBe(group.body.group.id);
  });

  it("a group from another event cannot be assigned", async () => {
    const groupB = await api(base, "POST", `/api/v1/events/${eventB}/groups`, {
      cookie: managerCookie,
      body: { name: "Other Camp Group", kind: "dorm" },
    });
    const participant = await api(base, "POST", `/api/v1/events/${eventA}/participants`, {
      cookie: managerCookie,
      body: { person: { fullName: "Wrong Group" } },
    });
    const res = await api(base, "PATCH", `/api/v1/event-participants/${participant.body.participant.id}`, {
      cookie: managerCookie,
      body: { groupId: groupB.body.group.id },
    });
    expect(res.status).toBe(404);
  });

  it("a participant from another event is not visible to this event's manager", async () => {
    const other = await api(base, "POST", `/api/v1/events/${eventB}/participants`, {
      cookie: managerCookie,
      body: { person: { fullName: "Event B Only" } },
    });
    const res = await api(base, "GET", `/api/v1/event-participants/${other.body.participant.id}`, { cookie: staffCookie });
    expect(res.status).toBe(404);
  });

  it("people search returns names for members and nothing for short queries", async () => {
    const hit = await api(base, "GET", "/api/v1/people?q=banda", { cookie: managerCookie });
    expect(hit.status).toBe(200);
    expect(hit.body.people.map((p) => p.fullName)).toContain("Michael Banda");
    expect(hit.body.people[0]).not.toHaveProperty("phone");
    const short = await api(base, "GET", "/api/v1/people?q=b", { cookie: managerCookie });
    expect(short.body.people).toEqual([]);
  });
});
