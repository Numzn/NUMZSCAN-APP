import { Router } from "express";
import { z } from "zod";
import { audit } from "../audit.js";
import { READ_ROLES, MANAGE_ROLES, authorizeEvent, requireUser } from "../access.js";
import { parse } from "../validation.js";
import { withTransaction } from "../tx.js";
import { ApiError, conflict, notFound, forbidden } from "../security.js";

const dateString = z.string().regex(/^\d{4}-\d{2}-\d{2}$/, "expected YYYY-MM-DD");

function validTimezone(tz) {
  try {
    new Intl.DateTimeFormat("en-US", { timeZone: tz });
    return true;
  } catch {
    return false;
  }
}

const timezone = z.string().min(1).max(64).refine(validTimezone, "unknown timezone");

const createSchema = z
  .object({
    slug: z.string().min(3).max(60).regex(/^[a-z0-9]+(-[a-z0-9]+)*$/, "lowercase letters, digits and hyphens"),
    name: z.string().trim().min(1).max(200),
    kind: z.enum(["church_camp", "generic"]),
    timezone,
    startsOn: dateString,
    endsOn: dateString,
  })
  .refine((v) => v.endsOn >= v.startsOn, { message: "endsOn must not be before startsOn", path: ["endsOn"] });

const updateSchema = z
  .object({
    name: z.string().trim().min(1).max(200).optional(),
    status: z.enum(["draft", "open", "closed", "archived"]).optional(),
    timezone: timezone.optional(),
    startsOn: dateString.optional(),
    endsOn: dateString.optional(),
  })
  .refine((v) => Object.keys(v).length > 0, { message: "nothing to update" });

const EVENT_SELECT = `id, slug, name, kind, timezone, status,
  to_char(starts_on, 'YYYY-MM-DD') as "startsOn", to_char(ends_on, 'YYYY-MM-DD') as "endsOn"`;

export function eventsRouter({ pool }) {
  const router = Router();

  router.post("/events", requireUser, async (req, res, next) => {
    try {
      if (!req.principal.user.isAdmin) throw forbidden("Only administrators can create events");
      const body = parse(createSchema, req.body);
      const { rows } = await pool.query(
        `insert into events (slug, name, kind, timezone, starts_on, ends_on)
         values ($1, $2, $3, $4, $5, $6) returning ${EVENT_SELECT}`,
        [body.slug, body.name, body.kind, body.timezone, body.startsOn, body.endsOn]
      );
      await audit(pool, { actor: req.principal.user.id, action: "create", entity: "event", entityId: rows[0].id, eventId: rows[0].id });
      res.status(201).json({ event: rows[0] });
    } catch (err) {
      if (err.code === "23505") return next(conflict("SLUG_TAKEN", "An event with this slug already exists"));
      next(err);
    }
  });

  router.get("/events", requireUser, async (req, res, next) => {
    try {
      const user = req.principal.user;
      const { rows } = await pool.query(
        `select ${EVENT_SELECT} from events e
          where $1::boolean or exists (
            select 1 from event_memberships m where m.event_id = e.id and m.user_id = $2)
          order by e.starts_on desc, e.name`,
        [user.isAdmin, user.id]
      );
      res.json({ events: rows });
    } catch (err) {
      next(err);
    }
  });

  router.get("/events/:eventId", requireUser, async (req, res, next) => {
    try {
      await authorizeEvent(pool, req.principal.user, req.params.eventId, READ_ROLES);
      const { rows } = await pool.query(`select ${EVENT_SELECT} from events where id = $1`, [req.params.eventId]);
      if (!rows[0]) throw notFound("Event not found");
      res.json({ event: rows[0] });
    } catch (err) {
      next(err);
    }
  });

  router.patch("/events/:eventId", requireUser, async (req, res, next) => {
    try {
      const user = req.principal.user;
      const eventId = z.string().uuid().safeParse(req.params.eventId);
      if (!eventId.success) throw notFound("Event not found");
      await authorizeEvent(pool, user, eventId.data, MANAGE_ROLES);
      const body = parse(updateSchema, req.body);

      // The change and its audit entry commit together. Both administrators and event managers are audited.
      const event = await withTransaction(pool, async (client) => {
        const { rows: before } = await client.query(`select ${EVENT_SELECT} from events where id = $1 for update`, [eventId.data]);
        const current = before[0];
        if (!current) throw notFound("Event not found");

        const startsOn = body.startsOn ?? current.startsOn;
        const endsOn = body.endsOn ?? current.endsOn;
        if (endsOn < startsOn) throw new ApiError(400, "INVALID_INPUT", "Request is invalid", [{ path: "endsOn", message: "endsOn must not be before startsOn" }]);

        const { rows } = await client.query(
          `update events set
             name = coalesce($2, name),
             status = coalesce($3, status),
             timezone = coalesce($4, timezone),
             starts_on = $5,
             ends_on = $6
           where id = $1
           returning ${EVENT_SELECT}`,
          [eventId.data, body.name ?? null, body.status ?? null, body.timezone ?? null, startsOn, endsOn]
        );
        const updated = rows[0];
        const changes = {};
        for (const field of ["name", "status", "timezone", "startsOn", "endsOn"]) {
          if (current[field] !== updated[field]) changes[field] = { from: current[field], to: updated[field] };
        }
        await audit(client, {
          actor: user.id,
          action: "event.update",
          entity: "event",
          entityId: eventId.data,
          eventId: eventId.data,
          details: { changes },
        });
        return updated;
      });
      res.json({ event });
    } catch (err) {
      next(err);
    }
  });

  return router;
}
