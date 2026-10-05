import { Router } from "express";
import { z } from "zod";
import { audit } from "../audit.js";
import { READ_ROLES, authorizeEvent, requireUser } from "../access.js";
import { withTransaction } from "../tx.js";
import { parse } from "../validation.js";
import { conflict, forbidden, notFound } from "../security.js";

const uuid = z.string().uuid();
const ROLES = ["event_manager", "staff"];

const addSchema = z.object({ userId: uuid, role: z.enum(ROLES) });
const changeSchema = z.object({ role: z.enum(ROLES) });

function idOrNotFound(value, what) {
  const parsed = uuid.safeParse(value);
  if (!parsed.success) throw notFound(`${what} not found`);
  return parsed.data;
}

async function ensureEvent(db, eventId) {
  const { rows } = await db.query("select 1 from events where id = $1", [eventId]);
  if (!rows[0]) throw notFound("Event not found");
}

// Only administrators change who works on an event. A manager of that event is told so; anyone
// else gets the usual not-found, so the event's existence is not revealed to them.
async function requireAccessAdmin(pool, user, eventId) {
  if (user.isAdmin) {
    await ensureEvent(pool, eventId);
    return;
  }
  await authorizeEvent(pool, user, eventId, READ_ROLES);
  throw forbidden("Only administrators can change event access");
}

export function membershipsRouter({ pool }) {
  const router = Router();

  // Visible to administrators and to the event's managers. Staff and outsiders do not see it.
  router.get("/events/:eventId/memberships", requireUser, async (req, res, next) => {
    try {
      const user = req.principal.user;
      const eventId = idOrNotFound(req.params.eventId, "Event");
      if (user.isAdmin) await ensureEvent(pool, eventId);
      else await authorizeEvent(pool, user, eventId, ["event_manager"]);
      const { rows } = await pool.query(
        `select m.user_id as "userId", u.email, u.display_name as "displayName", u.is_active as "isActive", m.role
           from event_memberships m join users u on u.id = m.user_id
          where m.event_id = $1
          order by u.display_name, u.email`,
        [eventId]
      );
      res.json({ memberships: rows });
    } catch (err) {
      next(err);
    }
  });

  router.post("/events/:eventId/memberships", requireUser, async (req, res, next) => {
    try {
      const user = req.principal.user;
      const eventId = idOrNotFound(req.params.eventId, "Event");
      await requireAccessAdmin(pool, user, eventId);
      const body = parse(addSchema, req.body);

      const membership = await withTransaction(pool, async (client) => {
        await ensureEvent(client, eventId);
        const { rows } = await client.query(
          `select id, email, display_name as "displayName", is_active as "isActive" from users where id = $1`,
          [body.userId]
        );
        const person = rows[0];
        if (!person) throw notFound("User not found");
        if (!person.isActive) throw conflict("USER_INACTIVE", "Reactivate this account before adding it to an event");
        try {
          await client.query("insert into event_memberships (user_id, event_id, role) values ($1, $2, $3)", [body.userId, eventId, body.role]);
        } catch (err) {
          if (err.code === "23505") throw conflict("MEMBERSHIP_EXISTS", "This person already has access to this event");
          throw err;
        }
        await audit(client, {
          actor: user.id,
          action: "membership.add",
          entity: "membership",
          entityId: body.userId,
          eventId,
          details: { email: person.email, role: body.role },
        });
        return { userId: person.id, email: person.email, displayName: person.displayName, role: body.role };
      });
      res.status(201).json({ membership });
    } catch (err) {
      next(err);
    }
  });

  router.patch("/events/:eventId/memberships/:userId", requireUser, async (req, res, next) => {
    try {
      const user = req.principal.user;
      const eventId = idOrNotFound(req.params.eventId, "Event");
      const userId = idOrNotFound(req.params.userId, "Membership");
      await requireAccessAdmin(pool, user, eventId);
      const body = parse(changeSchema, req.body);

      const membership = await withTransaction(pool, async (client) => {
        const { rows } = await client.query(
          `select m.role, u.email, u.display_name as "displayName"
             from event_memberships m join users u on u.id = m.user_id
            where m.user_id = $1 and m.event_id = $2 for update of m`,
          [userId, eventId]
        );
        const current = rows[0];
        if (!current) throw notFound("Membership not found");
        if (current.role !== body.role) {
          await client.query("update event_memberships set role = $3 where user_id = $1 and event_id = $2", [userId, eventId, body.role]);
          await audit(client, {
            actor: user.id,
            action: "membership.change",
            entity: "membership",
            entityId: userId,
            eventId,
            details: { email: current.email, from: current.role, to: body.role },
          });
        }
        return { userId, email: current.email, displayName: current.displayName, role: body.role };
      });
      res.json({ membership });
    } catch (err) {
      next(err);
    }
  });

  router.delete("/events/:eventId/memberships/:userId", requireUser, async (req, res, next) => {
    try {
      const user = req.principal.user;
      const eventId = idOrNotFound(req.params.eventId, "Event");
      const userId = idOrNotFound(req.params.userId, "Membership");
      await requireAccessAdmin(pool, user, eventId);

      await withTransaction(pool, async (client) => {
        const { rows } = await client.query(
          `select m.role, u.email from event_memberships m join users u on u.id = m.user_id
            where m.user_id = $1 and m.event_id = $2 for update of m`,
          [userId, eventId]
        );
        const current = rows[0];
        if (!current) throw notFound("Membership not found");
        await client.query("delete from event_memberships where user_id = $1 and event_id = $2", [userId, eventId]);
        await audit(client, {
          actor: user.id,
          action: "membership.remove",
          entity: "membership",
          entityId: userId,
          eventId,
          details: { email: current.email, role: current.role },
        });
      });
      res.status(204).end();
    } catch (err) {
      next(err);
    }
  });

  return router;
}
