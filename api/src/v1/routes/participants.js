import { Router } from "express";
import { z } from "zod";
import { audit } from "../audit.js";
import { MANAGE_ROLES, READ_ROLES, authorizeEvent, eventIdOf, requireUser } from "../access.js";
import { parse } from "../validation.js";
import { conflict, notFound } from "../security.js";

const PARTICIPANT_SELECT = `ep.id, ep.event_id as "eventId", ep.person_id as "personId",
  p.full_name as "fullName", ep.group_id as "groupId", ep.role, ep.status, ep.registered_at as "registeredAt"`;

const createSchema = z
  .object({
    personId: z.string().uuid().optional(),
    person: z
      .object({
        fullName: z.string().trim().min(1).max(200),
        phone: z.string().trim().max(40).optional(),
      })
      .optional(),
    groupId: z.string().uuid().nullable().optional(),
    role: z.enum(["camper", "leader", "staff"]).optional(),
  })
  .refine((v) => Boolean(v.personId) !== Boolean(v.person), {
    message: "provide exactly one of personId or person",
  });

const updateSchema = z
  .object({
    groupId: z.string().uuid().nullable().optional(),
    role: z.enum(["camper", "leader", "staff"]).optional(),
    status: z.enum(["registered", "checked_in", "departed", "cancelled"]).optional(),
  })
  .refine((v) => Object.keys(v).length > 0, { message: "nothing to update" });

const groupSchema = z.object({
  name: z.string().trim().min(1).max(120),
  kind: z.enum(["church", "dorm", "team"]),
});

const displayName = (name) => name.trim().replace(/\s+/g, " ");
const normalizeName = (name) => displayName(name).toLowerCase();

async function assertGroupInEvent(client, groupId, eventId) {
  if (groupId === null || groupId === undefined) return;
  const { rows } = await client.query("select 1 from groups where id = $1 and event_id = $2", [groupId, eventId]);
  if (!rows[0]) throw notFound("Group not found in this event");
}

export function participantsRouter({ pool }) {
  const router = Router();

  router.get("/people", requireUser, async (req, res, next) => {
    try {
      const user = req.principal.user;
      const q = String(req.query.q ?? "").trim();
      if (q.length < 2) return res.json({ people: [] });
      if (!user.isAdmin) {
        const { rows: memberships } = await pool.query(
          "select 1 from event_memberships where user_id = $1 limit 1",
          [user.id]
        );
        if (!memberships[0]) return res.json({ people: [] });
      }
      const { rows } = await pool.query(
        `select id, full_name as "fullName" from people
          where normalized_name like $1 order by full_name limit 20`,
        [`%${normalizeName(q)}%`]
      );
      res.json({ people: rows });
    } catch (err) {
      next(err);
    }
  });

  router.get("/events/:eventId/groups", requireUser, async (req, res, next) => {
    try {
      await authorizeEvent(pool, req.principal.user, req.params.eventId, READ_ROLES);
      const { rows } = await pool.query(
        `select id, event_id as "eventId", name, kind from groups where event_id = $1 order by name`,
        [req.params.eventId]
      );
      res.json({ groups: rows });
    } catch (err) {
      next(err);
    }
  });

  router.post("/events/:eventId/groups", requireUser, async (req, res, next) => {
    try {
      const user = req.principal.user;
      await authorizeEvent(pool, user, req.params.eventId, MANAGE_ROLES);
      const body = parse(groupSchema, req.body);
      const { rows } = await pool.query(
        `insert into groups (event_id, name, kind) values ($1, $2, $3)
         returning id, event_id as "eventId", name, kind`,
        [req.params.eventId, body.name, body.kind]
      );
      await audit(pool, { actor: user.id, action: "create", entity: "group", entityId: rows[0].id, eventId: req.params.eventId });
      res.status(201).json({ group: rows[0] });
    } catch (err) {
      if (err.code === "23505") return next(conflict("GROUP_NAME_TAKEN", "A group with this name already exists"));
      next(err);
    }
  });

  router.get("/events/:eventId/participants", requireUser, async (req, res, next) => {
    try {
      await authorizeEvent(pool, req.principal.user, req.params.eventId, READ_ROLES);
      const { rows } = await pool.query(
        `select ${PARTICIPANT_SELECT} from event_participants ep
           join people p on p.id = ep.person_id
          where ep.event_id = $1
          order by p.full_name`,
        [req.params.eventId]
      );
      res.json({ participants: rows });
    } catch (err) {
      next(err);
    }
  });

  router.post("/events/:eventId/participants", requireUser, async (req, res, next) => {
    const client = await pool.connect();
    try {
      const user = req.principal.user;
      const eventId = req.params.eventId;
      await authorizeEvent(pool, user, eventId, MANAGE_ROLES);
      const body = parse(createSchema, req.body);

      await client.query("begin");
      let personId = body.personId;
      if (body.person) {
        const created = await client.query(
          "insert into people (full_name, normalized_name, phone) values ($1, $2, $3) returning id",
          [displayName(body.person.fullName), normalizeName(body.person.fullName), body.person.phone ?? null]
        );
        personId = created.rows[0].id;
      } else {
        const existing = await client.query("select 1 from people where id = $1", [personId]);
        if (!existing.rows[0]) throw notFound("Person not found");
      }
      await assertGroupInEvent(client, body.groupId, eventId);

      const inserted = await client.query(
        `insert into event_participants (event_id, person_id, group_id, role)
         values ($1, $2, $3, $4) returning id`,
        [eventId, personId, body.groupId ?? null, body.role ?? "camper"]
      );
      await client.query("commit");
      await audit(pool, { actor: user.id, action: "create", entity: "event_participant", entityId: inserted.rows[0].id, eventId });

      const { rows } = await pool.query(
        `select ${PARTICIPANT_SELECT} from event_participants ep join people p on p.id = ep.person_id where ep.id = $1`,
        [inserted.rows[0].id]
      );
      res.status(201).json({ participant: rows[0] });
    } catch (err) {
      await client.query("rollback").catch(() => {});
      if (err.code === "23505" && err.constraint === "event_participants_event_id_person_id_key") {
        return next(conflict("DUPLICATE_PARTICIPATION", "This person is already registered for this event"));
      }
      next(err);
    } finally {
      client.release();
    }
  });

  router.get("/event-participants/:participantId", requireUser, async (req, res, next) => {
    try {
      const eventId = await eventIdOf(pool, "event_participants", req.params.participantId);
      await authorizeEvent(pool, req.principal.user, eventId, READ_ROLES);
      const { rows } = await pool.query(
        `select ${PARTICIPANT_SELECT} from event_participants ep join people p on p.id = ep.person_id where ep.id = $1`,
        [req.params.participantId]
      );
      res.json({ participant: rows[0] });
    } catch (err) {
      next(err);
    }
  });

  router.patch("/event-participants/:participantId", requireUser, async (req, res, next) => {
    try {
      const user = req.principal.user;
      const eventId = await eventIdOf(pool, "event_participants", req.params.participantId);
      await authorizeEvent(pool, user, eventId, MANAGE_ROLES);
      const body = parse(updateSchema, req.body);
      if (body.groupId !== undefined) await assertGroupInEvent(pool, body.groupId, eventId);

      await pool.query(
        `update event_participants set
           group_id = case when $2::boolean then $3 else group_id end,
           role = coalesce($4, role),
           status = coalesce($5, status)
         where id = $1`,
        [req.params.participantId, body.groupId !== undefined, body.groupId ?? null, body.role ?? null, body.status ?? null]
      );
      await audit(pool, { actor: user.id, action: "update", entity: "event_participant", entityId: req.params.participantId, eventId, details: { fields: Object.keys(body) } });

      const { rows } = await pool.query(
        `select ${PARTICIPANT_SELECT} from event_participants ep join people p on p.id = ep.person_id where ep.id = $1`,
        [req.params.participantId]
      );
      res.json({ participant: rows[0] });
    } catch (err) {
      next(err);
    }
  });

  return router;
}
