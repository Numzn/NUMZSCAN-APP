import { Router } from "express";
import { z } from "zod";
import { audit } from "../audit.js";
import { requireUser } from "../access.js";
import { withTransaction } from "../tx.js";
import { parse } from "../validation.js";
import { conflict, hashPassword, notFound } from "../security.js";

const email = z.string().trim().toLowerCase().email().max(254);
const displayName = z.string().trim().min(1).max(200);
const password = z.string().min(12, "must be at least 12 characters").max(1024);
const uuid = z.string().uuid();

const createSchema = z.object({
  email,
  displayName,
  password,
  isAdmin: z.boolean().optional().default(false),
});

const updateSchema = z
  .object({
    displayName: displayName.optional(),
    isAdmin: z.boolean().optional(),
    isActive: z.boolean().optional(),
  })
  .refine((v) => Object.keys(v).length > 0, { message: "nothing to update" });

const passwordSchema = z.object({ password });

const listSchema = z.object({
  q: z.string().trim().max(120).optional().default(""),
  status: z.enum(["active", "deactivated", "all"]).optional().default("all"),
  limit: z.coerce.number().int().min(1).max(100).optional().default(50),
  offset: z.coerce.number().int().min(0).max(100000).optional().default(0),
});

const auditSchema = z.object({
  limit: z.coerce.number().int().min(1).max(100).optional().default(50),
  before: z.coerce.number().int().positive().optional(),
  actor: uuid.optional(),
  action: z.string().trim().min(1).max(64).optional(),
  eventId: uuid.optional(),
});

const USER_COLUMNS = `id, email, display_name as "displayName", is_admin as "isAdmin", is_active as "isActive", last_login_at as "lastLoginAt"`;

// Administrators only. Anyone else gets a 404, so the admin area is not even confirmed to exist.
function requireAdmin(req, res, next) {
  if (req.principal?.user?.isAdmin) return next();
  return next(notFound("Not found"));
}

function idOrNotFound(value, what) {
  const parsed = uuid.safeParse(value);
  if (!parsed.success) throw notFound(`${what} not found`);
  return parsed.data;
}

function escapeLike(text) {
  return text.replace(/[\\%_]/g, (c) => `\\${c}`);
}

export function adminRouter({ pool }) {
  const router = Router();
  router.use("/admin", requireUser, requireAdmin);

  router.get("/admin/overview", async (req, res, next) => {
    try {
      const { rows } = await pool.query(
        `select
           (select count(*)::int from users where is_active) as "activeUsers",
           (select count(*)::int from users where is_active and is_admin) as administrators,
           (select count(*)::int from events where status = 'open') as "openEvents",
           (select count(*)::int from audit_log where occurred_at > now() - interval '7 days') as "changesLast7Days"`
      );
      res.json({ overview: rows[0] });
    } catch (err) {
      next(err);
    }
  });

  router.get("/admin/users", async (req, res, next) => {
    try {
      const query = parse(listSchema, req.query);
      const where = [];
      const params = [];
      if (query.q) {
        params.push(`%${escapeLike(query.q)}%`);
        where.push(`(display_name ilike $${params.length} or email ilike $${params.length})`);
      }
      if (query.status === "active") where.push("is_active");
      if (query.status === "deactivated") where.push("not is_active");
      const whereSql = where.length ? `where ${where.join(" and ")}` : "";

      const total = await pool.query(`select count(*)::int as n from users ${whereSql}`, params);
      params.push(query.limit, query.offset);
      const { rows } = await pool.query(
        `select ${USER_COLUMNS} from users ${whereSql}
          order by display_name, email
          limit $${params.length - 1} offset $${params.length}`,
        params
      );
      res.json({ users: rows, total: total.rows[0].n });
    } catch (err) {
      next(err);
    }
  });

  router.post("/admin/users", async (req, res, next) => {
    try {
      const actor = req.principal.user;
      const body = parse(createSchema, req.body);
      const user = await withTransaction(pool, async (client) => {
        let rows;
        try {
          ({ rows } = await client.query(
            `insert into users (email, display_name, password_hash, is_admin)
             values ($1, $2, $3, $4) returning ${USER_COLUMNS}`,
            [body.email, body.displayName, await hashPassword(body.password), body.isAdmin]
          ));
        } catch (err) {
          if (err.code === "23505") throw conflict("EMAIL_TAKEN", "An account with this email already exists");
          throw err;
        }
        await audit(client, {
          actor: actor.id,
          action: "user.create",
          entity: "user",
          entityId: rows[0].id,
          details: { email: body.email, isAdmin: body.isAdmin },
        });
        return rows[0];
      });
      res.status(201).json({ user });
    } catch (err) {
      next(err);
    }
  });

  router.get("/admin/users/:userId", async (req, res, next) => {
    try {
      const userId = idOrNotFound(req.params.userId, "User");
      const { rows } = await pool.query(`select ${USER_COLUMNS} from users where id = $1`, [userId]);
      if (!rows[0]) throw notFound("User not found");
      const access = await pool.query(
        `select e.id as "eventId", e.name as "eventName", m.role
           from event_memberships m join events e on e.id = m.event_id
          where m.user_id = $1
          order by e.name`,
        [userId]
      );
      res.json({ user: { ...rows[0], access: access.rows } });
    } catch (err) {
      next(err);
    }
  });

  router.patch("/admin/users/:userId", async (req, res, next) => {
    try {
      const actor = req.principal.user;
      const userId = idOrNotFound(req.params.userId, "User");
      const body = parse(updateSchema, req.body);

      const result = await withTransaction(pool, async (client) => {
        // Locks the target row, so two changes to the same person run one after the other.
        const { rows: found } = await client.query(`select ${USER_COLUMNS} from users where id = $1 for update`, [userId]);
        const target = found[0];
        if (!target) throw notFound("User not found");

        const self = target.id === actor.id;
        const removesAdmin = body.isAdmin === false && target.isAdmin;
        const deactivates = body.isActive === false && target.isActive;
        if (self && (removesAdmin || deactivates)) {
          throw conflict("CANNOT_CHANGE_SELF", "You cannot remove your own administrator access or deactivate your own account");
        }
        if ((removesAdmin || deactivates) && target.isAdmin && target.isActive) {
          // Lock the other active administrators too, so a concurrent change cannot leave none.
          const { rows: others } = await client.query(
            "select id from users where is_admin and is_active and id <> $1 for update",
            [userId]
          );
          if (others.length === 0) throw conflict("LAST_ADMIN", "At least one active administrator must remain");
        }

        const changes = {};
        if (body.displayName !== undefined && body.displayName !== target.displayName) {
          changes.displayName = { from: target.displayName, to: body.displayName };
        }
        if (body.isAdmin !== undefined && body.isAdmin !== target.isAdmin) {
          changes.isAdmin = { from: target.isAdmin, to: body.isAdmin };
        }
        if (body.isActive !== undefined && body.isActive !== target.isActive) {
          changes.isActive = { from: target.isActive, to: body.isActive };
        }
        if (Object.keys(changes).length === 0) return { user: target, changed: false };

        const { rows: updated } = await client.query(
          `update users set
             display_name = coalesce($2, display_name),
             is_admin = coalesce($3, is_admin),
             is_active = coalesce($4, is_active)
           where id = $1
           returning ${USER_COLUMNS}`,
          [userId, body.displayName ?? null, body.isAdmin ?? null, body.isActive ?? null]
        );

        let sessionsEnded = 0;
        if (changes.isActive?.to === false) {
          const ended = await client.query(
            "update sessions set revoked_at = now() where user_id = $1 and revoked_at is null",
            [userId]
          );
          sessionsEnded = ended.rowCount;
        }

        const action = changes.isActive ? (changes.isActive.to ? "user.reactivate" : "user.deactivate") : "user.update";
        await audit(client, {
          actor: actor.id,
          action,
          entity: "user",
          entityId: userId,
          details: { email: target.email, changes, ...(sessionsEnded ? { sessionsEnded } : {}) },
        });
        return { user: updated[0], changed: true };
      });
      res.json({ user: result.user });
    } catch (err) {
      next(err);
    }
  });

  router.post("/admin/users/:userId/password", async (req, res, next) => {
    try {
      const actor = req.principal.user;
      const userId = idOrNotFound(req.params.userId, "User");
      const body = parse(passwordSchema, req.body);
      const passwordHash = await hashPassword(body.password);

      const sessionsEnded = await withTransaction(pool, async (client) => {
        const { rows } = await client.query("update users set password_hash = $2 where id = $1 returning email", [userId, passwordHash]);
        if (!rows[0]) throw notFound("User not found");
        // A new password ends every existing session, so a stolen session stops working.
        const ended = await client.query("update sessions set revoked_at = now() where user_id = $1 and revoked_at is null", [userId]);
        await audit(client, {
          actor: actor.id,
          action: "user.password_reset",
          entity: "user",
          entityId: userId,
          details: { email: rows[0].email, sessionsEnded: ended.rowCount },
        });
        return ended.rowCount;
      });
      res.json({ ok: true, sessionsEnded });
    } catch (err) {
      next(err);
    }
  });

  router.post("/admin/users/:userId/sessions/revoke", async (req, res, next) => {
    try {
      const actor = req.principal.user;
      const userId = idOrNotFound(req.params.userId, "User");
      const sessionsEnded = await withTransaction(pool, async (client) => {
        const { rows } = await client.query("select email from users where id = $1", [userId]);
        if (!rows[0]) throw notFound("User not found");
        const ended = await client.query("update sessions set revoked_at = now() where user_id = $1 and revoked_at is null", [userId]);
        await audit(client, {
          actor: actor.id,
          action: "user.sessions_revoke",
          entity: "user",
          entityId: userId,
          details: { email: rows[0].email, sessionsEnded: ended.rowCount },
        });
        return ended.rowCount;
      });
      res.json({ ok: true, sessionsEnded });
    } catch (err) {
      next(err);
    }
  });

  router.get("/admin/audit", async (req, res, next) => {
    try {
      const query = parse(auditSchema, req.query);
      const { rows } = await pool.query(
        `select a.id, a.occurred_at as "occurredAt", a.actor as "actorId", u.display_name as "actorName",
                a.action, a.entity, a.entity_id as "entityId", a.event_id as "eventId", a.details
           from audit_log a
           left join users u on u.id::text = a.actor
          where ($1::bigint is null or a.id < $1)
            and ($2::text is null or a.actor = $2)
            and ($3::text is null or a.action = $3)
            and ($4::uuid is null or a.event_id = $4)
          order by a.id desc
          limit $5`,
        [query.before ?? null, query.actor ?? null, query.action ?? null, query.eventId ?? null, query.limit]
      );
      const nextBefore = rows.length === query.limit ? rows[rows.length - 1].id : null;
      res.json({ entries: rows, nextBefore });
    } catch (err) {
      next(err);
    }
  });

  return router;
}
