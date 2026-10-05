import crypto from "node:crypto";
import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { api, close, grant, makeEvent, resetDatabase, sessionFor, startServer, TEST_URL } from "./harness.js";

const REFERENCE = /^EP-[2-9A-HJKMNP-TV-Z]{5}$/;
const UUID = /[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}/i;

// A valid answer to the default form. Individual tests override what they need.
const answers = (overrides = {}) => ({
  first_name: "Michael",
  last_name: "Banda",
  date_of_birth: "2010-05-17",
  phone: "+260 971 000001",
  email: "michael@example.org",
  church: "Lusaka Central",
  emergency_contact: "Mary Banda",
  emergency_phone: "+260 977 000002",
  ...overrides,
});

describe.skipIf(!TEST_URL)("registration v1", () => {
  let pool, server, base;
  let manager, otherManager, staff;
  let campA, campB;

  beforeAll(async () => {
    pool = await resetDatabase();
    ({ server, base } = await startServer(pool));
    manager = await sessionFor(base, pool, "manager@example.org");
    otherManager = await sessionFor(base, pool, "other@example.org");
    staff = await sessionFor(base, pool, "staff@example.org");
    campA = await makeEvent(pool, { slug: "youth-camp-2026" });
    campB = await makeEvent(pool, { slug: "other-camp-2026" });
    await grant(pool, "manager@example.org", campA, "event_manager");
    await grant(pool, "staff@example.org", campA, "staff");
    await grant(pool, "other@example.org", campB, "event_manager");
  });

  afterAll(async () => {
    await close(server, pool);
  });

  const count = async (sql, params = []) => Number((await pool.query(sql, params)).rows[0].n);

  const configure = (eventId, cookie = manager) =>
    api(base, "POST", `/api/v1/events/${eventId}/registration`, { cookie, body: {} });
  const publish = (eventId, cookie = manager) =>
    api(base, "POST", `/api/v1/events/${eventId}/registration/publish`, { cookie, body: {} });
  const close_ = (eventId, cookie = manager) =>
    api(base, "POST", `/api/v1/events/${eventId}/registration/close`, { cookie, body: {} });
  const formOf = async (eventId) =>
    (await api(base, "GET", `/api/v1/events/${eventId}/registration/form`, { cookie: manager })).body.fields;
  const publicPage = (slug) => api(base, "GET", `/api/v1/public/registration/${slug}`);
  const submit = (slug, submissionId, values = answers()) =>
    api(base, "POST", `/api/v1/public/registration/${slug}`, { body: { submissionId, answers: values } });

  describe("configuration", () => {
    it("a manager configures registration with the common fields and the event's own address", async () => {
      const res = await configure(campA);
      expect(res.status).toBe(201);
      expect(res.body.registration).toMatchObject({
        status: "draft",
        slug: "youth-camp-2026",
        publicUrl: "https://events.test/r/youth-camp-2026",
        fieldCount: 10,
      });
      const keys = (await formOf(campA)).map((f) => f.key);
      expect(keys).toEqual([
        "first_name", "last_name", "date_of_birth", "phone", "email",
        "church", "district", "emergency_contact", "emergency_phone", "dietary_requirements",
      ]);
    });

    it("configuring the same event twice is refused", async () => {
      const res = await configure(campA);
      expect(res.status).toBe(409);
      expect(res.body.error.code).toBe("REGISTRATION_EXISTS");
    });

    it("a taken address gets the next free one, deterministically", async () => {
      const b = await configure(campB, otherManager);
      expect(b.status).toBe(201);
      // Move event B's link onto event A's future address, then configure a third event with that name.
      const moved = await api(base, "PATCH", `/api/v1/events/${campB}/registration`, { cookie: otherManager, body: { slug: "camp-c" } });
      expect(moved.status).toBe(200);
      const campC = await makeEvent(pool, { slug: "camp-c" });
      await grant(pool, "other@example.org", campC, "event_manager");
      const c = await configure(campC, otherManager);
      expect(c.status).toBe(201);
      expect(c.body.registration.slug).toBe("camp-c-2");
      // Give event B its own address back for the tests that follow.
      const back = await api(base, "PATCH", `/api/v1/events/${campB}/registration`, { cookie: otherManager, body: { slug: "other-camp-2026" } });
      expect(back.status).toBe(200);
    });

    it("staff cannot read or configure registration, an unrelated manager cannot reach the event, and anonymous callers are refused", async () => {
      expect((await api(base, "GET", `/api/v1/events/${campA}/registration`, { cookie: staff })).status).toBe(403);
      expect((await api(base, "POST", `/api/v1/events/${campA}/registration`, { cookie: staff, body: {} })).status).toBe(403);
      expect((await api(base, "GET", `/api/v1/events/${campA}/registration`, { cookie: otherManager })).status).toBe(404);
      expect((await api(base, "GET", `/api/v1/events/${campA}/registration`)).status).toBe(401);
    });

    it("the public address can be changed explicitly, and the old link stops working", async () => {
      const clash = await api(base, "PATCH", `/api/v1/events/${campA}/registration`, { cookie: manager, body: { slug: "camp-c-2" } });
      expect(clash.status).toBe(409);
      expect(clash.body.error.code).toBe("SLUG_TAKEN");

      const moved = await api(base, "PATCH", `/api/v1/events/${campA}/registration`, { cookie: manager, body: { slug: "youth-2026" } });
      expect(moved.status).toBe(200);
      expect(moved.body.registration.slug).toBe("youth-2026");
      expect((await publicPage("youth-camp-2026")).status).toBe(404);
      expect((await publicPage("youth-2026")).status).toBe(200);
    });
  });

  describe("opening and closing", () => {
    it("a draft shows the event but no form, and accepts no submissions", async () => {
      const page = await publicPage("youth-2026");
      expect(page.body.registration).toEqual({ status: "draft", fields: [] });
      const res = await submit("youth-2026", crypto.randomUUID());
      expect(res.status).toBe(409);
      expect(res.body.error.code).toBe("REGISTRATION_NOT_OPEN");
    });

    it("publishing opens registration; closing stops submissions at the API", async () => {
      const opened = await publish(campA);
      expect(opened.status).toBe(200);
      expect(opened.body.registration.status).toBe("open");
      const page = await publicPage("youth-2026");
      expect(page.body.registration.status).toBe("open");
      expect(page.body.registration.fields.length).toBe(10);

      const closed = await close_(campA);
      expect(closed.status).toBe(200);
      expect(closed.body.registration.status).toBe("closed");
      const refused = await submit("youth-2026", crypto.randomUUID());
      expect(refused.status).toBe(409);
      expect(refused.body.error.code).toBe("REGISTRATION_CLOSED");
      const page2 = await publicPage("youth-2026");
      expect(page2.body.registration).toEqual({ status: "closed", fields: [] });
    });

    it("closing is refused unless registration is open, and reopening accepts submissions again", async () => {
      expect((await close_(campB, otherManager)).body.error.code).toBe("REGISTRATION_NOT_OPEN");
      expect((await publish(campA)).body.registration.status).toBe("open");
    });

    it("an archived event takes no submissions, even with registration still open", async () => {
      const archived = await makeEvent(pool, { slug: "archived-camp-2026" });
      await grant(pool, "manager@example.org", archived, "event_manager");
      await configure(archived);
      await publish(archived);
      await pool.query("update events set status = 'archived' where id = $1", [archived]);
      const page = await publicPage("archived-camp-2026");
      expect(page.body.registration.status).toBe("closed");
      const res = await submit("archived-camp-2026", crypto.randomUUID());
      expect(res.body.error.code).toBe("REGISTRATION_CLOSED");
    });
  });

  describe("public submission", () => {
    it("a valid submission creates the person and the event participant, and confirms with a reference", async () => {
      const res = await submit("youth-2026", crypto.randomUUID());
      expect(res.status).toBe(201);
      expect(res.body.confirmation).toMatchObject({
        firstName: "Michael",
        eventName: "Youth Camp",
        startsOn: "2026-12-01",
        endsOn: "2026-12-05",
        timezone: "Africa/Lusaka",
      });
      expect(res.body.confirmation.reference).toMatch(REFERENCE);
      expect(await count("select count(*)::int as n from event_participants where event_id = $1", [campA])).toBe(1);
      const person = await pool.query(
        `select p.full_name from event_participants ep join people p on p.id = ep.person_id where ep.event_id = $1`,
        [campA]
      );
      expect(person.rows[0].full_name).toBe("Michael Banda");
    });

    it("a retried submission with the same id returns the same confirmation and creates nothing new", async () => {
      const submissionId = crypto.randomUUID();
      const first = await submit("youth-2026", submissionId, answers({ first_name: "Grace", last_name: "Phiri", phone: "+260 97 555 0001" }));
      const again = await submit("youth-2026", submissionId, answers({ first_name: "Grace", last_name: "Phiri", phone: "+260 97 555 0001" }));
      expect(first.status).toBe(201);
      expect(again.status).toBe(200);
      expect(again.body.confirmation.reference).toBe(first.body.confirmation.reference);
      expect(await count("select count(*)::int as n from registration_submissions where client_request_id = $1", [submissionId])).toBe(1);
    });

    it("a different submission from the same person is refused, and the existing registration is left alone", async () => {
      const before = await count("select count(*)::int as n from event_participants where event_id = $1", [campA]);
      const res = await submit("youth-2026", crypto.randomUUID());
      expect(res.status).toBe(409);
      expect(res.body.error.code).toBe("ALREADY_REGISTERED");
      expect(await count("select count(*)::int as n from event_participants where event_id = $1", [campA])).toBe(before);
    });

    it("an existing person with the same name and phone digits is reused, not duplicated", async () => {
      const { rows } = await pool.query(
        "insert into people (full_name, normalized_name, phone) values ('Esther Mulenga', 'esther mulenga', '+260 97 7654321') returning id"
      );
      const peopleBefore = await count("select count(*)::int as n from people");
      const res = await submit("youth-2026", crypto.randomUUID(), answers({ first_name: "Esther", last_name: "Mulenga", phone: "260 97 7654321", date_of_birth: "2011-02-03" }));
      expect(res.status).toBe(201);
      expect(await count("select count(*)::int as n from people")).toBe(peopleBefore);
      const linked = await pool.query(
        `select ep.person_id from event_participants ep where ep.event_id = $1 and ep.person_id = $2`,
        [campA, rows[0].id]
      );
      expect(linked.rowCount).toBe(1);
      const submission = await pool.query(
        "select identity_match from registration_submissions s join event_participants ep on ep.id = s.event_participant_id where ep.person_id = $1",
        [rows[0].id]
      );
      expect(submission.rows[0].identity_match).toBe("reused");
    });

    it("a person with the same name but a different phone is treated as someone new", async () => {
      const peopleBefore = await count("select count(*)::int as n from people");
      const res = await submit("youth-2026", crypto.randomUUID(), answers({ first_name: "Esther", last_name: "Mulenga", phone: "+260 96 1111111" }));
      expect(res.status).toBe(201);
      expect(await count("select count(*)::int as n from people")).toBe(peopleBefore + 1);
    });

    it("two people with the same name and phone are not merged: the new one is recorded as ambiguous", async () => {
      await pool.query("insert into people (full_name, normalized_name, phone) values ('Ruth Mwansa', 'ruth mwansa', '+260 95 2222222')");
      await pool.query("insert into people (full_name, normalized_name, phone) values ('Ruth Mwansa', 'ruth mwansa', '260 95 2222222')");
      const existingBefore = await count("select count(*)::int as n from people where normalized_name = 'ruth mwansa'");
      const res = await submit("youth-2026", crypto.randomUUID(), answers({ first_name: "Ruth", last_name: "Mwansa", phone: "260952222222" }));
      expect(res.status).toBe(201);
      expect(await count("select count(*)::int as n from people where normalized_name = 'ruth mwansa'")).toBe(existingBefore + 1);
      const match = await pool.query(
        `select s.identity_match from registration_submissions s
           join event_participants ep on ep.id = s.event_participant_id
           join people p on p.id = ep.person_id where p.normalized_name = 'ruth mwansa' and s.reference = $1`,
        [res.body.confirmation.reference]
      );
      expect(match.rows[0].identity_match).toBe("ambiguous");
    });

    it("a person merged into another is not matched again", async () => {
      const { rows } = await pool.query(
        "insert into people (full_name, normalized_name, phone) values ('Joel Tembo', 'joel tembo', '+260 97 3333333') returning id"
      );
      const target = await pool.query("insert into people (full_name, normalized_name, phone) values ('Joel Tembo', 'joel tembo', '+260 97 4444444') returning id");
      await pool.query("update people set merged_into_id = $2 where id = $1", [rows[0].id, target.rows[0].id]);
      const res = await submit("youth-2026", crypto.randomUUID(), answers({ first_name: "Joel", last_name: "Tembo", phone: "+260 97 3333333" }));
      expect(res.status).toBe(201);
      const linked = await pool.query(
        "select 1 from event_participants ep join registration_submissions s on s.event_participant_id = ep.id where ep.person_id = $1",
        [rows[0].id]
      );
      expect(linked.rowCount).toBe(0);
    });

    it("one person can register for two events, using the same person record", async () => {
      await configure(campB, otherManager);
      await publish(campB, otherManager);
      expect((await publicPage("other-camp-2026")).body.registration.status).toBe("open");
      const { rows } = await pool.query(
        "insert into people (full_name, normalized_name, phone) values ('Lydia Zulu', 'lydia zulu', '+260 97 5555555') returning id"
      );
      expect((await submit("other-camp-2026", crypto.randomUUID(), answers({ first_name: "Lydia", last_name: "Zulu", phone: "+260 97 5555555" }))).status).toBe(201);
      expect((await submit("youth-2026", crypto.randomUUID(), answers({ first_name: "Lydia", last_name: "Zulu", phone: "+260 97 5555555" }))).status).toBe(201);
      expect(await count("select count(*)::int as n from event_participants where person_id = $1", [rows[0].id])).toBe(2);
    });

    it("answers are validated against the published form: missing, unknown, malformed and out-of-list values are named", async () => {
      const res = await submit("youth-2026", crypto.randomUUID(), {
        first_name: "Sam",
        last_name: "",
        date_of_birth: "2010-02-30",
        phone: "12",
        email: "not-an-email",
        church: "Lusaka Central",
        emergency_contact: "Mary",
        emergency_phone: "+260 977 000003",
        shoe_size: "42",
      });
      expect(res.status).toBe(400);
      expect(res.body.error.code).toBe("INVALID_INPUT");
      const paths = res.body.error.details.map((d) => d.path);
      expect(paths).toEqual(expect.arrayContaining(["last_name", "date_of_birth", "phone", "email", "shoe_size"]));
      expect(JSON.stringify(res.body)).not.toMatch(/stack|SELECT|insert/i);
    });

    it("the answers are stored with the label and type they were given", async () => {
      const res = await submit("youth-2026", crypto.randomUUID(), answers({ first_name: "Hope", last_name: "Chanda", phone: "+260 97 6666666", dietary_requirements: "No nuts" }));
      expect(res.status).toBe(201);
      const stored = await pool.query(
        `select a.field_key, a.field_label, a.field_type, a.value from registration_answers a
           join registration_submissions s on s.id = a.submission_id where s.reference = $1 and a.field_key = 'dietary_requirements'`,
        [res.body.confirmation.reference]
      );
      expect(stored.rows[0]).toEqual({ field_key: "dietary_requirements", field_label: "Dietary requirements", field_type: "long_text", value: "No nuts" });
    });

    it("the audit log records the outcome of a submission and never the answers", async () => {
      const rows = (await pool.query("select details::text as text from audit_log where entity = 'registration_submission'")).rows;
      expect(rows.length).toBeGreaterThan(0);
      for (const row of rows) {
        expect(row.text).not.toMatch(/Michael|Banda|michael@example|Mary|Lusaka/);
      }
    });

    it("the public page reveals no participant data and no internal identifiers", async () => {
      const page = await publicPage("youth-2026");
      expect(page.status).toBe(200);
      expect(page.text).not.toMatch(UUID);
      expect(page.text).not.toMatch(/Michael|Esther|Ruth|Lydia|Hope/);
      const raw = await fetch(`${base}/api/v1/public/registration/youth-2026`);
      expect(raw.headers.get("cache-control")).toMatch(/no-store/);
    });

    it("an unknown address gets a safe 404", async () => {
      const page = await publicPage("no-such-camp");
      expect(page.status).toBe(404);
      expect(page.body.error).toEqual({ code: "NOT_FOUND", message: "Registration not found" });
    });

    it("a submission id that is not a UUID is refused", async () => {
      const res = await submit("youth-2026", "not-a-uuid");
      expect(res.status).toBe(400);
    });

    it("an oversized submission is refused before it reaches the database", async () => {
      const res = await api(base, "POST", "/api/v1/public/registration/youth-2026", {
        body: { submissionId: crypto.randomUUID(), answers: { church: "x".repeat(200_000) } },
      });
      expect(res.status).toBe(413);
    });

    it("concurrent identical submissions create one participant, and every response is a confirmation", async () => {
      const { rows } = await pool.query("select count(*)::int as n from event_participants where event_id = $1", [campB]);
      const before = Number(rows[0].n);
      const submissionId = crypto.randomUUID();
      const values = answers({ first_name: "Peter", last_name: "Lungu", phone: "+260 97 7777777" });
      const responses = await Promise.all(Array.from({ length: 5 }, () => api(base, "POST", "/api/v1/public/registration/other-camp-2026", { body: { submissionId, answers: values } })));
      expect(responses.map((r) => r.status).sort()).toEqual([200, 200, 200, 200, 201]);
      expect(new Set(responses.map((r) => r.body.confirmation.reference)).size).toBe(1);
      const after = await pool.query("select count(*)::int as n from event_participants where event_id = $1", [campB]);
      expect(Number(after.rows[0].n)).toBe(before + 1);
    });

    it("concurrent different submissions for one person: one registers, the other is refused", async () => {
      const values = answers({ first_name: "Naomi", last_name: "Sakala", phone: "+260 97 8888888" });
      const responses = await Promise.all([
        submit("other-camp-2026", crypto.randomUUID(), values),
        submit("other-camp-2026", crypto.randomUUID(), values),
      ]);
      expect(responses.map((r) => r.status).sort()).toEqual([201, 409]);
      expect(responses.find((r) => r.status === 409).body.error.code).toBe("ALREADY_REGISTERED");
    });
  });

  describe("form builder", () => {
    it("a new field's key comes from its label, and a key is never reused", async () => {
      const first = await api(base, "POST", `/api/v1/events/${campA}/registration/form/fields`, {
        cookie: manager,
        body: { label: "Bus stop", type: "dropdown", required: true, options: ["Town", "Farm"] },
      });
      expect(first.status).toBe(201);
      expect(first.body.field.key).toBe("bus_stop");
      await api(base, "DELETE", `/api/v1/events/${campA}/registration/form/fields/${first.body.field.id}`, { cookie: manager, body: {} });
      const second = await api(base, "POST", `/api/v1/events/${campA}/registration/form/fields`, {
        cookie: manager,
        body: { label: "Bus stop", type: "text" },
      });
      expect(second.body.field.key).toBe("bus_stop_2");
    });

    it("choice fields need options, and other fields refuse them", async () => {
      const noOptions = await api(base, "POST", `/api/v1/events/${campA}/registration/form/fields`, { cookie: manager, body: { label: "Shirt", type: "radio" } });
      expect(noOptions.status).toBe(400);
      expect(noOptions.body.error.details[0].path).toBe("options");
      const extraOptions = await api(base, "POST", `/api/v1/events/${campA}/registration/form/fields`, { cookie: manager, body: { label: "Notes", type: "text", options: ["a", "b"] } });
      expect(extraOptions.status).toBe(400);
      const duplicate = await api(base, "POST", `/api/v1/events/${campA}/registration/form/fields`, { cookie: manager, body: { label: "Shirt", type: "radio", options: ["M", "m"] } });
      expect(duplicate.status).toBe(400);
    });

    it("a dropdown answer must be one of its options", async () => {
      const field = (await api(base, "POST", `/api/v1/events/${campA}/registration/form/fields`, {
        cookie: manager,
        body: { label: "Shirt size", type: "dropdown", required: false, options: ["S", "M", "L"] },
      })).body.field;
      const bad = await submit("youth-2026", crypto.randomUUID(), answers({ first_name: "Tom", last_name: "Mbewe", phone: "+260 97 1212121", [field.key]: "XXL" }));
      expect(bad.status).toBe(400);
      expect(bad.body.error.details.find((d) => d.path === field.key).message).toMatch(/listed options/);
      const good = await submit("youth-2026", crypto.randomUUID(), answers({ first_name: "Tom", last_name: "Mbewe", phone: "+260 97 1212121", [field.key]: "M" }));
      expect(good.status).toBe(201);
    });

    it("fields can be reordered, and the order must name every active field exactly once", async () => {
      const fields = await formOf(campA);
      const reversed = fields.map((f) => f.id).reverse();
      const ok = await api(base, "PATCH", `/api/v1/events/${campA}/registration/form`, { cookie: manager, body: { fieldOrder: reversed } });
      expect(ok.status).toBe(200);
      expect(ok.body.fields[0].id).toBe(fields[fields.length - 1].id);
      const page = await publicPage("youth-2026");
      expect(page.body.registration.fields[0].key).toBe(fields[fields.length - 1].key);

      const missing = await api(base, "PATCH", `/api/v1/events/${campA}/registration/form`, { cookie: manager, body: { fieldOrder: reversed.slice(1) } });
      expect(missing.status).toBe(400);
    });

    it("removing a field archives it: it leaves the form, and its past answers keep their label", async () => {
      const dietary = (await formOf(campA)).find((f) => f.key === "dietary_requirements");
      const ok = await submit("youth-2026", crypto.randomUUID(), answers({ first_name: "Ada", last_name: "Lungu", phone: "+260 97 9999999", dietary_requirements: "Vegetarian" }));
      expect(ok.status).toBe(201);
      await api(base, "PATCH", `/api/v1/events/${campA}/registration/form/fields/${dietary.id}`, { cookie: manager, body: { label: "Food needs" } });
      const removed = await api(base, "DELETE", `/api/v1/events/${campA}/registration/form/fields/${dietary.id}`, { cookie: manager, body: {} });
      expect(removed.status).toBe(200);
      expect((await formOf(campA)).map((f) => f.key)).not.toContain("dietary_requirements");
      const later = await submit("youth-2026", crypto.randomUUID(), answers({ first_name: "Ada", last_name: "Phiri", phone: "+260 97 9898989", dietary_requirements: "Nuts" }));
      expect(later.body.error.details[0].path).toBe("dietary_requirements");
      const historic = await pool.query(
        `select a.field_label, a.value from registration_answers a join registration_submissions s on s.id = a.submission_id
          where s.reference = $1 and a.field_key = 'dietary_requirements'`,
        [ok.body.confirmation.reference]
      );
      expect(historic.rows[0]).toEqual({ field_label: "Dietary requirements", value: "Vegetarian" });
    });

    it("the three person fields cannot be removed, retyped, or made optional", async () => {
      const phone = (await formOf(campA)).find((f) => f.personField === "phone");
      expect((await api(base, "DELETE", `/api/v1/events/${campA}/registration/form/fields/${phone.id}`, { cookie: manager, body: {} })).body.error.code).toBe("PERSON_FIELD_LOCKED");
      expect((await api(base, "PATCH", `/api/v1/events/${campA}/registration/form/fields/${phone.id}`, { cookie: manager, body: { type: "text" } })).body.error.code).toBe("PERSON_FIELD_LOCKED");
      expect((await api(base, "PATCH", `/api/v1/events/${campA}/registration/form/fields/${phone.id}`, { cookie: manager, body: { required: false } })).body.error.code).toBe("PERSON_FIELD_LOCKED");
    });

    it("a form holds at most 60 active fields", async () => {
      const active = (await formOf(campA)).length;
      for (let i = active; i < 60; i += 1) {
        const res = await api(base, "POST", `/api/v1/events/${campA}/registration/form/fields`, { cookie: manager, body: { label: `Extra ${i}`, type: "text" } });
        expect(res.status).toBe(201);
      }
      const over = await api(base, "POST", `/api/v1/events/${campA}/registration/form/fields`, { cookie: manager, body: { label: "One too many", type: "text" } });
      expect(over.status).toBe(409);
      expect(over.body.error.code).toBe("FORM_FULL");
    });

    it("another event's field is not found through this event", async () => {
      const fieldOfA = (await formOf(campA))[0];
      const res = await api(base, "PATCH", `/api/v1/events/${campB}/registration/form/fields/${fieldOfA.id}`, { cookie: otherManager, body: { label: "Hijack" } });
      expect(res.status).toBe(404);
    });
  });

  describe("audit and manager views", () => {
    it("manager changes are audited, with no answers in the record", async () => {
      const actions = (await pool.query(
        "select distinct entity || ':' || action as a from audit_log where event_id = $1",
        [campA]
      )).rows.map((r) => r.a);
      expect(actions).toEqual(expect.arrayContaining([
        "registration:create", "registration:update", "registration:publish", "registration:close",
        "registration_field:create", "registration_field:update", "registration_field:archive", "registration_form:reorder",
      ]));
      const details = (await pool.query("select details::text as text from audit_log where event_id = $1 and entity like 'registration%'", [campA])).rows;
      for (const row of details) expect(row.text).not.toMatch(/Michael|Banda|@example|Mary/);
    });

    it("a manager reads a participant's answers; staff cannot", async () => {
      const { rows } = await pool.query(
        `select ep.id from event_participants ep join people p on p.id = ep.person_id
          where ep.event_id = $1 and p.full_name = 'Michael Banda'`,
        [campA]
      );
      const participant = rows[0].id;
      const res = await api(base, "GET", `/api/v1/event-participants/${participant}/registration`, { cookie: manager });
      expect(res.status).toBe(200);
      expect(res.body.submission.identityMatch).toBe("new");
      expect(res.body.submission.answers.find((a) => a.key === "church").value).toBe("Lusaka Central");
      expect((await api(base, "GET", `/api/v1/event-participants/${participant}/registration`, { cookie: staff })).status).toBe(403);
    });

    it("a participant registered by hand has no registration answers", async () => {
      const person = await pool.query("insert into people (full_name, normalized_name) values ('Walk In', 'walk in') returning id");
      const participant = await pool.query(
        "insert into event_participants (event_id, person_id) values ($1, $2) returning id",
        [campA, person.rows[0].id]
      );
      const res = await api(base, "GET", `/api/v1/event-participants/${participant.rows[0].id}/registration`, { cookie: manager });
      expect(res.body.submission).toBeNull();
    });
  });
});

describe.skipIf(!TEST_URL)("public registration limits", () => {
  let pool, server, base;

  beforeAll(async () => {
    pool = await resetDatabase();
    ({ server, base } = await startServer(pool, { publicRegistrationLimitPerMinute: 3 }));
    const manager = await sessionFor(base, pool, "limits@example.org");
    const eventId = await makeEvent(pool, { slug: "limit-camp" });
    await grant(pool, "limits@example.org", eventId, "event_manager");
    await api(base, "POST", `/api/v1/events/${eventId}/registration`, { cookie: manager, body: {} });
    await api(base, "POST", `/api/v1/events/${eventId}/registration/publish`, { cookie: manager, body: {} });
  });

  afterAll(async () => {
    await close(server, pool);
  });

  it("public registration is limited per address, and says so safely", async () => {
    const statuses = [];
    for (let i = 0; i < 5; i += 1) {
      statuses.push((await api(base, "GET", "/api/v1/public/registration/limit-camp")).status);
    }
    expect(statuses.slice(0, 3)).toEqual([200, 200, 200]);
    expect(statuses[4]).toBe(429);
  });
});
