import crypto from "node:crypto";
import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { PASSWORD, api, close, createUser, login, resetDatabase, startServer, TEST_URL } from "./harness.js";

describe.skipIf(!TEST_URL)("authentication", () => {
  let pool, server, base;

  beforeAll(async () => {
    pool = await resetDatabase();
    ({ server, base } = await startServer(pool));
    await createUser(pool, { email: "manager@example.org", name: "Grace Phiri" });
  });

  afterAll(async () => {
    await close(server, pool);
  });

  it("valid login succeeds and sets a hardened session cookie", async () => {
    const res = await login(base, "manager@example.org");
    expect(res.status).toBe(200);
    expect(res.body.user).toMatchObject({ email: "manager@example.org", displayName: "Grace Phiri", isAdmin: false });
    expect(res.setCookie).toMatch(/HttpOnly/);
    expect(res.setCookie).toMatch(/Secure/);
    expect(res.setCookie).toMatch(/SameSite=Strict/);
    expect(res.setCookie).toMatch(/Path=\/api\/v1/);
    expect(res.sessionCookie).toBeTruthy();
  });

  it("responses never contain the password hash or the session secret in the body", async () => {
    const res = await login(base, "manager@example.org");
    const { rows } = await pool.query("select password_hash from users where email = 'manager@example.org'");
    expect(res.text).not.toContain(rows[0].password_hash);
    expect(res.text).not.toContain(res.sessionCookie);
    expect(res.text).not.toContain("password");
  });

  it("the database stores only a hash of the session secret", async () => {
    const res = await login(base, "manager@example.org");
    const { rows } = await pool.query("select id from sessions where id = $1", [crypto.createHash("sha256").update(res.sessionCookie).digest("hex")]);
    expect(rows).toHaveLength(1);
    const all = await pool.query("select id from sessions");
    expect(all.rows.map((r) => r.id)).not.toContain(res.sessionCookie);
  });

  it("an invalid password is refused with a generic error", async () => {
    const res = await login(base, "manager@example.org", "wrong password entirely");
    expect(res.status).toBe(401);
    expect(res.body.error.code).toBe("INVALID_CREDENTIALS");
    expect(res.body.error.message).toBe("Email or password is incorrect");
  });

  it("an unknown user gets the same error as a wrong password", async () => {
    const res = await login(base, "nobody@example.org", PASSWORD);
    expect(res.status).toBe(401);
    expect(res.body.error).toEqual({ code: "INVALID_CREDENTIALS", message: "Email or password is incorrect" });
  });

  it("a deactivated user cannot log in", async () => {
    await createUser(pool, { email: "left@example.org" });
    await pool.query("update users set is_active = false where email = 'left@example.org'");
    const res = await login(base, "left@example.org");
    expect(res.status).toBe(401);
  });

  it("an authenticated session can read /auth/me", async () => {
    const session = (await login(base, "manager@example.org")).sessionCookie;
    const res = await api(base, "GET", "/api/v1/auth/me", { cookie: session });
    expect(res.status).toBe(200);
    expect(res.body.user.email).toBe("manager@example.org");
    expect(Array.isArray(res.body.memberships)).toBe(true);
  });

  it("/auth/me without a session is rejected", async () => {
    const res = await api(base, "GET", "/api/v1/auth/me");
    expect(res.status).toBe(401);
    expect(res.body.error.code).toBe("UNAUTHENTICATED");
  });

  it("logout invalidates the session", async () => {
    const session = (await login(base, "manager@example.org")).sessionCookie;
    const out = await api(base, "POST", "/api/v1/auth/logout", { body: {}, cookie: session });
    expect(out.status).toBe(204);
    expect(out.setCookie).toMatch(/Max-Age=0/);
    const after = await api(base, "GET", "/api/v1/auth/me", { cookie: session });
    expect(after.status).toBe(401);
  });

  it("an expired session fails", async () => {
    const session = (await login(base, "manager@example.org")).sessionCookie;
    await pool.query(
      "update sessions set created_at = now() - interval '2 hours', expires_at = now() - interval '1 minute' where id = $1",
      [crypto.createHash("sha256").update(session).digest("hex")]
    );
    const res = await api(base, "GET", "/api/v1/auth/me", { cookie: session });
    expect(res.status).toBe(401);
  });

  it("a revoked session fails", async () => {
    const session = (await login(base, "manager@example.org")).sessionCookie;
    await pool.query(
      "update sessions set revoked_at = now() where id = $1",
      [crypto.createHash("sha256").update(session).digest("hex")]
    );
    const res = await api(base, "GET", "/api/v1/auth/me", { cookie: session });
    expect(res.status).toBe(401);
  });

  it("a made-up session cookie is rejected", async () => {
    const res = await api(base, "GET", "/api/v1/auth/me", { cookie: "A".repeat(43) });
    expect(res.status).toBe(401);
  });

  it("malformed login input returns structured validation errors", async () => {
    const res = await api(base, "POST", "/api/v1/auth/login", { body: { email: "not-an-email" } });
    expect(res.status).toBe(400);
    expect(res.body.error.code).toBe("INVALID_INPUT");
    expect(Array.isArray(res.body.error.details)).toBe(true);
  });

  it("malformed JSON returns a clean 400, not a stack trace", async () => {
    const res = await fetch(base + "/api/v1/auth/login", {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: "{not json",
    });
    const text = await res.text();
    expect(res.status).toBe(400);
    expect(text).not.toMatch(/at \w+|node_modules|SyntaxError/);
  });
});
