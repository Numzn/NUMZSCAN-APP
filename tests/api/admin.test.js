import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { api, close, grant, login, makeEvent, PASSWORD, resetDatabase, sessionFor, startServer, TEST_URL } from "./harness.js";

describe.skipIf(!TEST_URL)("admin platform", () => {
  let pool, server, base;
  let adminCookie, adminId, managerCookie, staffCookie, staffId, managerId, secondAdminCookie, secondAdminId;
  let eventA, eventB;

  const auditRows = async (action) =>
    (await pool.query("select action, actor, entity_id, event_id, details from audit_log where action = $1 order by id", [action])).rows;

  beforeAll(async () => {
    pool = await resetDatabase();
    ({ server, base } = await startServer(pool));
    adminCookie = await sessionFor(base, pool, "admin@example.org", true);
    adminId = (await pool.query("select id from users where email = 'admin@example.org'")).rows[0].id;
    managerCookie = await sessionFor(base, pool, "manager@example.org");
    managerId = (await pool.query("select id from users where email = 'manager@example.org'")).rows[0].id;
    staffCookie = await sessionFor(base, pool, "staff@example.org");
    staffId = (await pool.query("select id from users where email = 'staff@example.org'")).rows[0].id;
    eventA = await makeEvent(pool, { slug: "camp-a" });
    eventB = await makeEvent(pool, { slug: "camp-b" });
    await grant(pool, "manager@example.org", eventA, "event_manager");
    await grant(pool, "staff@example.org", eventA, "staff");
  });

  afterAll(async () => {
    await close(server, pool);
  });

  describe("administrator-only area", () => {
    it("refuses anonymous visitors with 401", async () => {
      const res = await api(base, "GET", "/api/v1/admin/users");
      expect(res.status).toBe(401);
    });

    it("answers 404 to managers and staff, so the area is not confirmed to exist", async () => {
      for (const cookie of [managerCookie, staffCookie]) {
        for (const route of ["/api/v1/admin/users", "/api/v1/admin/overview", "/api/v1/admin/audit", `/api/v1/admin/users/${staffId}`]) {
          const res = await api(base, "GET", route, { cookie });
          expect(res.status, route).toBe(404);
          expect(res.body.error.code).toBe("NOT_FOUND");
        }
      }
    });

    it("gives an administrator the overview counts", async () => {
      const res = await api(base, "GET", "/api/v1/admin/overview", { cookie: adminCookie });
      expect(res.status).toBe(200);
      expect(res.body.overview).toMatchObject({ activeUsers: 3, administrators: 1, openEvents: 0 });
    });
  });

  describe("user management", () => {
    it("lists users, filters by status, and searches name or email literally", async () => {
      const all = await api(base, "GET", "/api/v1/admin/users", { cookie: adminCookie });
      expect(all.status).toBe(200);
      expect(all.body.total).toBe(3);
      expect(all.body.users.map((u) => u.email).sort()).toEqual(["admin@example.org", "manager@example.org", "staff@example.org"]);
      expect(all.body.users[0]).not.toHaveProperty("password_hash");

      const search = await api(base, "GET", "/api/v1/admin/users?q=MANAGER", { cookie: adminCookie });
      expect(search.body.users.map((u) => u.email)).toEqual(["manager@example.org"]);

      const wildcard = await api(base, "GET", `/api/v1/admin/users?q=${encodeURIComponent("%")}`, { cookie: adminCookie });
      expect(wildcard.body.total).toBe(0);
    });

    it("creates a user with a password of at least 12 characters, and the user can sign in", async () => {
      const short = await api(base, "POST", "/api/v1/admin/users", {
        cookie: adminCookie,
        body: { email: "new@example.org", displayName: "New Person", password: "short-pass1" },
      });
      expect(short.status).toBe(400);
      expect(short.body.error.code).toBe("INVALID_INPUT");

      const bad = await api(base, "POST", "/api/v1/admin/users", {
        cookie: adminCookie,
        body: { email: "not-an-email", displayName: "New Person", password: "a long enough password" },
      });
      expect(bad.status).toBe(400);

      const created = await api(base, "POST", "/api/v1/admin/users", {
        cookie: adminCookie,
        body: { email: "New@Example.org", displayName: "New Person", password: "a long enough password" },
      });
      expect(created.status).toBe(201);
      expect(created.body.user).toMatchObject({ email: "new@example.org", displayName: "New Person", isAdmin: false, isActive: true });
      expect(JSON.stringify(created.body)).not.toContain("a long enough password");

      const signIn = await login(base, "new@example.org", "a long enough password");
      expect(signIn.status).toBe(200);
    });

    it("refuses a second account with the same email, in any letter case", async () => {
      const res = await api(base, "POST", "/api/v1/admin/users", {
        cookie: adminCookie,
        body: { email: "NEW@example.org", displayName: "Copy", password: "a long enough password" },
      });
      expect(res.status).toBe(409);
      expect(res.body.error.code).toBe("EMAIL_TAKEN");
    });

    it("records the creation in the audit log without the password", async () => {
      const rows = await auditRows("user.create");
      expect(rows).toHaveLength(1);
      expect(rows[0].actor).toBe(adminId);
      expect(JSON.stringify(rows[0].details)).not.toContain("a long enough password");
      expect(rows[0].details).toMatchObject({ email: "new@example.org", isAdmin: false });
    });

    it("gives one user with their event access, and 404 for unknown or malformed ids", async () => {
      const res = await api(base, "GET", `/api/v1/admin/users/${managerId}`, { cookie: adminCookie });
      expect(res.status).toBe(200);
      expect(res.body.user.access).toEqual([{ eventId: eventA, eventName: "Youth Camp", role: "event_manager" }]);
      expect((await api(base, "GET", "/api/v1/admin/users/00000000-0000-4000-8000-000000000000", { cookie: adminCookie })).status).toBe(404);
      expect((await api(base, "GET", "/api/v1/admin/users/not-an-id", { cookie: adminCookie })).status).toBe(404);
    });

    it("edits a display name and audits the change", async () => {
      const res = await api(base, "PATCH", `/api/v1/admin/users/${managerId}`, { cookie: adminCookie, body: { displayName: "Grace Manager" } });
      expect(res.status).toBe(200);
      expect(res.body.user.displayName).toBe("Grace Manager");
      const rows = await auditRows("user.update");
      expect(rows.at(-1).details.changes).toEqual({ displayName: { from: "manager", to: "Grace Manager" } });
    });

    it("refuses an empty change", async () => {
      const res = await api(base, "PATCH", `/api/v1/admin/users/${managerId}`, { cookie: adminCookie, body: {} });
      expect(res.status).toBe(400);
    });

    it("stops an administrator removing their own administrator access or deactivating themselves", async () => {
      const demote = await api(base, "PATCH", `/api/v1/admin/users/${adminId}`, { cookie: adminCookie, body: { isAdmin: false } });
      expect(demote.status).toBe(409);
      expect(demote.body.error.code).toBe("CANNOT_CHANGE_SELF");

      const deactivate = await api(base, "PATCH", `/api/v1/admin/users/${adminId}`, { cookie: adminCookie, body: { isActive: false } });
      expect(deactivate.status).toBe(409);
      expect(deactivate.body.error.code).toBe("CANNOT_CHANGE_SELF");

      const still = await api(base, "GET", "/api/v1/auth/me", { cookie: adminCookie });
      expect(still.status).toBe(200);
    });

    it("grants administrator access to a second administrator", async () => {
      secondAdminCookie = await sessionFor(base, pool, "second@example.org");
      secondAdminId = (await pool.query("select id from users where email = 'second@example.org'")).rows[0].id;
      const res = await api(base, "PATCH", `/api/v1/admin/users/${secondAdminId}`, { cookie: adminCookie, body: { isAdmin: true } });
      expect(res.status).toBe(200);
      expect(res.body.user.isAdmin).toBe(true);
      const rows = await auditRows("user.update");
      expect(rows.at(-1).details.changes).toEqual({ isAdmin: { from: false, to: true } });
    });

    it("deactivating a person ends their sessions, blocks sign-in, and reactivating restores it", async () => {
      const before = await api(base, "GET", "/api/v1/auth/me", { cookie: staffCookie });
      expect(before.status).toBe(200);

      const deactivate = await api(base, "PATCH", `/api/v1/admin/users/${staffId}`, { cookie: adminCookie, body: { isActive: false } });
      expect(deactivate.status).toBe(200);
      expect(deactivate.body.user.isActive).toBe(false);

      const after = await api(base, "GET", "/api/v1/auth/me", { cookie: staffCookie });
      expect(after.status).toBe(401);
      expect((await login(base, "staff@example.org")).status).toBe(401);

      const rows = await auditRows("user.deactivate");
      expect(rows.at(-1).details.sessionsEnded).toBeGreaterThanOrEqual(1);

      const reactivate = await api(base, "PATCH", `/api/v1/admin/users/${staffId}`, { cookie: adminCookie, body: { isActive: true } });
      expect(reactivate.status).toBe(200);
      const back = await login(base, "staff@example.org");
      expect(back.status).toBe(200);
      staffCookie = back.sessionCookie;
      expect((await auditRows("user.reactivate")).length).toBe(1);
    });

    it("resets a password, ends existing sessions, and accepts only the new password", async () => {
      const old = await api(base, "GET", "/api/v1/auth/me", { cookie: managerCookie });
      expect(old.status).toBe(200);

      const short = await api(base, "POST", `/api/v1/admin/users/${managerId}/password`, { cookie: adminCookie, body: { password: "too short" } });
      expect(short.status).toBe(400);

      const reset = await api(base, "POST", `/api/v1/admin/users/${managerId}/password`, { cookie: adminCookie, body: { password: "brand new secret phrase" } });
      expect(reset.status).toBe(200);
      expect(reset.body.sessionsEnded).toBeGreaterThanOrEqual(1);
      expect(JSON.stringify(reset.body)).not.toContain("brand new secret phrase");

      expect((await api(base, "GET", "/api/v1/auth/me", { cookie: managerCookie })).status).toBe(401);
      expect((await login(base, "manager@example.org", PASSWORD)).status).toBe(401);
      const fresh = await login(base, "manager@example.org", "brand new secret phrase");
      expect(fresh.status).toBe(200);
      managerCookie = fresh.sessionCookie;

      const rows = await auditRows("user.password_reset");
      expect(rows).toHaveLength(1);
      expect(JSON.stringify(rows[0].details)).not.toContain("brand new secret phrase");
    });

    it("signs a person out everywhere and audits it", async () => {
      const second = await login(base, "second@example.org");
      expect(second.status).toBe(200);
      const res = await api(base, "POST", `/api/v1/admin/users/${secondAdminId}/sessions/revoke`, { cookie: adminCookie, body: {} });
      expect(res.status).toBe(200);
      expect(res.body.sessionsEnded).toBeGreaterThanOrEqual(1);
      expect((await api(base, "GET", "/api/v1/auth/me", { cookie: second.sessionCookie })).status).toBe(401);
      secondAdminCookie = (await login(base, "second@example.org")).sessionCookie;
      expect((await auditRows("user.sessions_revoke")).length).toBe(1);
    });

    it("lets one administrator remove another's administrator access, but never their own", async () => {
      const res = await api(base, "PATCH", `/api/v1/admin/users/${adminId}`, { cookie: secondAdminCookie, body: { isAdmin: false } });
      expect(res.status).toBe(200);
      // The first administrator is now a member, so the second is the only one left and cannot demote itself.
      const self = await api(base, "PATCH", `/api/v1/admin/users/${secondAdminId}`, { cookie: secondAdminCookie, body: { isAdmin: false } });
      expect(self.status).toBe(409);
      expect(self.body.error.code).toBe("CANNOT_CHANGE_SELF");
      // Restore administrator access so the rest of the suite still has one.
      await api(base, "PATCH", `/api/v1/admin/users/${adminId}`, { cookie: secondAdminCookie, body: { isAdmin: true } });
      adminCookie = (await login(base, "admin@example.org")).sessionCookie;
    });
  });

  describe("event access", () => {
    it("lets a manager see their own event's access list, and nothing else", async () => {
      const own = await api(base, "GET", `/api/v1/events/${eventA}/memberships`, { cookie: managerCookie });
      expect(own.status).toBe(200);
      expect(own.body.memberships.map((m) => m.email).sort()).toEqual(["manager@example.org", "staff@example.org"]);

      expect((await api(base, "GET", `/api/v1/events/${eventB}/memberships`, { cookie: managerCookie })).status).toBe(404);
      expect((await api(base, "GET", `/api/v1/events/${eventA}/memberships`, { cookie: staffCookie })).status).toBe(403);
      expect((await api(base, "GET", `/api/v1/events/${eventA}/memberships`)).status).toBe(401);
    });

    it("refuses a manager or staff member any change to access, with no audit entry", async () => {
      const before = (await pool.query("select count(*)::int as n from audit_log")).rows[0].n;
      const add = await api(base, "POST", `/api/v1/events/${eventA}/memberships`, { cookie: managerCookie, body: { userId: staffId, role: "staff" } });
      expect(add.status).toBe(403);
      expect(add.body.error.message).toBe("Only administrators can change event access");
      expect((await api(base, "POST", `/api/v1/events/${eventB}/memberships`, { cookie: managerCookie, body: { userId: staffId, role: "staff" } })).status).toBe(404);
      expect((await api(base, "POST", `/api/v1/events/${eventA}/memberships`, { cookie: staffCookie, body: { userId: staffId, role: "staff" } })).status).toBe(403);
      const after = (await pool.query("select count(*)::int as n from audit_log")).rows[0].n;
      expect(after).toBe(before);
    });

    it("lets an administrator add, change, and remove access, and audits each step", async () => {
      const add = await api(base, "POST", `/api/v1/events/${eventB}/memberships`, { cookie: adminCookie, body: { userId: managerId, role: "staff" } });
      expect(add.status).toBe(201);
      expect(add.body.membership).toMatchObject({ userId: managerId, email: "manager@example.org", role: "staff" });

      const dup = await api(base, "POST", `/api/v1/events/${eventB}/memberships`, { cookie: adminCookie, body: { userId: managerId, role: "staff" } });
      expect(dup.status).toBe(409);
      expect(dup.body.error.code).toBe("MEMBERSHIP_EXISTS");

      const change = await api(base, "PATCH", `/api/v1/events/${eventB}/memberships/${managerId}`, { cookie: adminCookie, body: { role: "event_manager" } });
      expect(change.status).toBe(200);
      expect(change.body.membership.role).toBe("event_manager");

      const same = await api(base, "PATCH", `/api/v1/events/${eventB}/memberships/${managerId}`, { cookie: adminCookie, body: { role: "event_manager" } });
      expect(same.status).toBe(200);

      const remove = await api(base, "DELETE", `/api/v1/events/${eventB}/memberships/${managerId}`, { cookie: adminCookie, body: {} });
      expect(remove.status).toBe(204);
      expect((await api(base, "DELETE", `/api/v1/events/${eventB}/memberships/${managerId}`, { cookie: adminCookie, body: {} })).status).toBe(404);

      const adds = await auditRows("membership.add");
      expect(adds.at(-1)).toMatchObject({ event_id: eventB, entity_id: managerId, details: { email: "manager@example.org", role: "staff" } });
      const changes = await auditRows("membership.change");
      expect(changes).toHaveLength(1);
      expect(changes[0].details).toMatchObject({ from: "staff", to: "event_manager" });
      expect(await auditRows("membership.remove")).toHaveLength(1);
    });

    it("refuses to add an inactive person, an unknown person, an unknown role, or to an unknown event", async () => {
      await pool.query("update users set is_active = false where email = 'new@example.org'");
      const newId = (await pool.query("select id from users where email = 'new@example.org'")).rows[0].id;
      const inactive = await api(base, "POST", `/api/v1/events/${eventB}/memberships`, { cookie: adminCookie, body: { userId: newId, role: "staff" } });
      expect(inactive.status).toBe(409);
      expect(inactive.body.error.code).toBe("USER_INACTIVE");
      await pool.query("update users set is_active = true where email = 'new@example.org'");

      expect((await api(base, "POST", `/api/v1/events/${eventB}/memberships`, { cookie: adminCookie, body: { userId: "00000000-0000-4000-8000-000000000000", role: "staff" } })).status).toBe(404);
      expect((await api(base, "POST", `/api/v1/events/${eventB}/memberships`, { cookie: adminCookie, body: { userId: managerId, role: "administrator" } })).status).toBe(400);
      expect((await api(base, "POST", `/api/v1/events/00000000-0000-4000-8000-000000000000/memberships`, { cookie: adminCookie, body: { userId: managerId, role: "staff" } })).status).toBe(404);
    });
  });

  describe("event settings", () => {
    it("audits a manager's change to event settings with the changed values", async () => {
      const res = await api(base, "PATCH", `/api/v1/events/${eventA}`, { cookie: managerCookie, body: { name: "Youth Camp 2026" } });
      expect(res.status).toBe(200);
      const rows = await auditRows("event.update");
      const last = rows.at(-1);
      expect(last.event_id).toBe(eventA);
      expect(last.details).toEqual({ changes: { name: { from: "Youth Camp", to: "Youth Camp 2026" } } });
      expect(last.actor).toBe(managerId);
    });

    it("audits an administrator's change, including status", async () => {
      const res = await api(base, "PATCH", `/api/v1/events/${eventA}`, { cookie: adminCookie, body: { status: "open" } });
      expect(res.status).toBe(200);
      const last = (await auditRows("event.update")).at(-1);
      expect(last.details.changes).toEqual({ status: { from: "draft", to: "open" } });
      expect(last.actor).toBe(adminId);
    });

    it("refuses an invalid change without writing an audit entry", async () => {
      const before = (await auditRows("event.update")).length;
      const res = await api(base, "PATCH", `/api/v1/events/${eventA}`, { cookie: managerCookie, body: { endsOn: "2000-01-01" } });
      expect(res.status).toBe(400);
      expect((await auditRows("event.update")).length).toBe(before);
    });

    it("keeps staff and outsiders out of event settings, and answers unknown events with 404", async () => {
      expect((await api(base, "PATCH", `/api/v1/events/${eventA}`, { cookie: staffCookie, body: { name: "x" } })).status).toBe(403);
      expect((await api(base, "PATCH", `/api/v1/events/${eventB}`, { cookie: managerCookie, body: { name: "x" } })).status).toBe(404);
      expect((await api(base, "PATCH", "/api/v1/events/00000000-0000-4000-8000-000000000000", { cookie: adminCookie, body: { name: "x" } })).status).toBe(404);
    });
  });

  describe("audit log", () => {
    it("is readable only by administrators, newest first, with the actor's name", async () => {
      expect((await api(base, "GET", "/api/v1/admin/audit", { cookie: managerCookie })).status).toBe(404);
      const res = await api(base, "GET", "/api/v1/admin/audit?limit=5", { cookie: adminCookie });
      expect(res.status).toBe(200);
      expect(res.body.entries).toHaveLength(5);
      const ids = res.body.entries.map((e) => e.id);
      expect([...ids].sort((a, b) => b - a)).toEqual(ids);
      expect(res.body.entries[0]).toHaveProperty("actorName");
    });

    it("filters by action and event, and pages with a cursor", async () => {
      const byAction = await api(base, "GET", "/api/v1/admin/audit?action=user.create", { cookie: adminCookie });
      expect(byAction.body.entries.every((e) => e.action === "user.create")).toBe(true);

      const byEvent = await api(base, "GET", `/api/v1/admin/audit?eventId=${eventA}`, { cookie: adminCookie });
      expect(byEvent.body.entries.length).toBeGreaterThan(0);
      expect(byEvent.body.entries.every((e) => e.eventId === eventA)).toBe(true);

      const first = await api(base, "GET", "/api/v1/admin/audit?limit=2", { cookie: adminCookie });
      expect(first.body.nextBefore).toBe(first.body.entries.at(-1).id);
      const second = await api(base, "GET", `/api/v1/admin/audit?limit=2&before=${first.body.nextBefore}`, { cookie: adminCookie });
      expect(Number(second.body.entries[0].id)).toBeLessThan(Number(first.body.nextBefore));

      expect((await api(base, "GET", "/api/v1/admin/audit?eventId=not-a-uuid", { cookie: adminCookie })).status).toBe(400);
    });

    it("never contains a password or session secret in any entry", async () => {
      const all = await api(base, "GET", "/api/v1/admin/audit?limit=100", { cookie: adminCookie });
      const text = JSON.stringify(all.body);
      expect(text).not.toContain("a long enough password");
      expect(text).not.toContain("brand new secret phrase");
      expect(text).not.toContain(PASSWORD);
      expect(text).not.toMatch(/ep_session|sessionSecret|password_hash/);
    });
  });

});
