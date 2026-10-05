import { Router } from "express";
import rateLimit from "express-rate-limit";
import { z } from "zod";
import { audit } from "./audit.js";
import { COOKIE_PATH, SESSION_COOKIE, requireUser } from "./access.js";
import { parse } from "./validation.js";
import { ApiError, burnPasswordTime, randomToken, sha256Hex, verifyPassword } from "./security.js";

const loginSchema = z.object({
  email: z.string().trim().toLowerCase().email().max(254),
  password: z.string().min(1).max(1024),
});

function sessionCookie(secret, maxAgeSeconds, secure) {
  return [
    `${SESSION_COOKIE}=${secret}`,
    `Path=${COOKIE_PATH}`,
    `Max-Age=${maxAgeSeconds}`,
    "HttpOnly",
    "SameSite=Strict",
    secure ? "Secure" : null,
  ]
    .filter(Boolean)
    .join("; ");
}

const publicUser = (user) => ({ id: user.id, email: user.email, displayName: user.displayName, isAdmin: user.isAdmin });

export function authRouter({ pool, config }) {
  const router = Router();
  const loginLimiter = rateLimit({
    windowMs: 15 * 60 * 1000,
    limit: config.loginLimitPer15Min,
    standardHeaders: true,
    legacyHeaders: false,
  });

  router.post("/login", loginLimiter, async (req, res, next) => {
    try {
      const { email, password } = parse(loginSchema, req.body);
      const { rows } = await pool.query(
        "select id, email, display_name, is_admin, is_active, password_hash from users where email = $1",
        [email]
      );
      const user = rows[0];
      const passwordOk = user?.is_active
        ? await verifyPassword(password, user.password_hash)
        : (await burnPasswordTime(password), false);

      if (!passwordOk) {
        await audit(pool, { actor: "anonymous", action: "login_failed", entity: "user", entityId: user?.id ?? "unknown" });
        throw new ApiError(401, "INVALID_CREDENTIALS", "Email or password is incorrect");
      }

      const secret = randomToken(32);
      await pool.query(
        `insert into sessions (id, user_id, expires_at)
         values ($1, $2, now() + make_interval(hours => $3::int))`,
        [sha256Hex(secret), user.id, config.sessionTtlHours]
      );
      await pool.query("update users set last_login_at = now() where id = $1", [user.id]);
      await audit(pool, { actor: user.id, action: "login", entity: "user", entityId: user.id });

      res.setHeader("Set-Cookie", sessionCookie(secret, config.sessionTtlHours * 3600, config.cookieSecure));
      res.status(200).json({
        user: publicUser({ id: user.id, email: user.email, displayName: user.display_name, isAdmin: user.is_admin }),
      });
    } catch (err) {
      next(err);
    }
  });

  router.get("/me", requireUser, async (req, res, next) => {
    try {
      const user = req.principal.user;
      const { rows } = await pool.query(
        "select event_id, role from event_memberships where user_id = $1 order by event_id",
        [user.id]
      );
      res.json({
        user: publicUser(user),
        memberships: rows.map((r) => ({ eventId: r.event_id, role: r.role })),
      });
    } catch (err) {
      next(err);
    }
  });

  router.post("/logout", requireUser, async (req, res, next) => {
    try {
      const user = req.principal.user;
      await pool.query(
        "update sessions set revoked_at = now() where id = $1 and revoked_at is null",
        [user.sessionId]
      );
      await audit(pool, { actor: user.id, action: "logout", entity: "user", entityId: user.id });
      res.setHeader("Set-Cookie", sessionCookie("", 0, config.cookieSecure));
      res.status(204).end();
    } catch (err) {
      next(err);
    }
  });

  return router;
}

