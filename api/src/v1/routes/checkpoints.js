import { Router } from "express";
import { z } from "zod";
import { audit } from "../audit.js";
import { MANAGE_ROLES, READ_ROLES, authorizeEvent, eventIdOf, requireUser } from "../access.js";
import { parse } from "../validation.js";
import { conflict } from "../security.js";

const CHECKPOINT_SELECT = `id, event_id as "eventId", name, kind, rule_type as "ruleType", active`;
const OCCURRENCE_SELECT = `id, checkpoint_id as "checkpointId", label,
  starts_at as "startsAt", ends_at as "endsAt", to_char(service_date, 'YYYY-MM-DD') as "serviceDate"`;

const checkpointSchema = z.object({
  name: z.string().trim().min(1).max(120),
  kind: z.enum(["gate", "check_in", "service", "activity", "meal", "transport", "departure", "generic"]),
  ruleType: z.enum(["once_per_event", "once_per_occurrence", "unlimited"]),
  active: z.boolean().optional(),
});

const occurrenceSchema = z
  .object({
    label: z.string().trim().min(1).max(120),
    startsAt: z.string().datetime({ offset: true }),
    endsAt: z.string().datetime({ offset: true }),
    serviceDate: z.string().regex(/^\d{4}-\d{2}-\d{2}$/, "expected YYYY-MM-DD"),
  })
  .refine((v) => Date.parse(v.endsAt) > Date.parse(v.startsAt), {
    message: "endsAt must be after startsAt",
    path: ["endsAt"],
  });

export function checkpointsRouter({ pool }) {
  const router = Router();

  router.get("/events/:eventId/checkpoints", requireUser, async (req, res, next) => {
    try {
      await authorizeEvent(pool, req.principal.user, req.params.eventId, READ_ROLES);
      const { rows } = await pool.query(
        `select ${CHECKPOINT_SELECT} from checkpoints where event_id = $1 order by name`,
        [req.params.eventId]
      );
      res.json({ checkpoints: rows });
    } catch (err) {
      next(err);
    }
  });

  router.post("/events/:eventId/checkpoints", requireUser, async (req, res, next) => {
    try {
      const user = req.principal.user;
      await authorizeEvent(pool, user, req.params.eventId, MANAGE_ROLES);
      const body = parse(checkpointSchema, req.body);
      const { rows } = await pool.query(
        `insert into checkpoints (event_id, name, kind, rule_type, active)
         values ($1, $2, $3, $4, coalesce($5::boolean, true))
         returning ${CHECKPOINT_SELECT}`,
        [req.params.eventId, body.name, body.kind, body.ruleType, body.active ?? null]
      );
      await audit(pool, { actor: user.id, action: "create", entity: "checkpoint", entityId: rows[0].id, eventId: req.params.eventId });
      res.status(201).json({ checkpoint: rows[0] });
    } catch (err) {
      next(err);
    }
  });

  router.get("/checkpoints/:checkpointId/occurrences", requireUser, async (req, res, next) => {
    try {
      const eventId = await eventIdOf(pool, "checkpoints", req.params.checkpointId);
      await authorizeEvent(pool, req.principal.user, eventId, READ_ROLES);
      const { rows } = await pool.query(
        `select ${OCCURRENCE_SELECT} from checkpoint_occurrences where checkpoint_id = $1 order by starts_at`,
        [req.params.checkpointId]
      );
      res.json({ occurrences: rows });
    } catch (err) {
      next(err);
    }
  });

  router.post("/checkpoints/:checkpointId/occurrences", requireUser, async (req, res, next) => {
    try {
      const user = req.principal.user;
      const checkpointId = req.params.checkpointId;
      const eventId = await eventIdOf(pool, "checkpoints", checkpointId);
      await authorizeEvent(pool, user, eventId, MANAGE_ROLES);
      const body = parse(occurrenceSchema, req.body);
      const { rows } = await pool.query(
        `insert into checkpoint_occurrences (event_id, checkpoint_id, label, starts_at, ends_at, service_date)
         values ($1, $2, $3, $4::timestamptz, $5::timestamptz, $6::date)
         returning ${OCCURRENCE_SELECT}`,
        [eventId, checkpointId, body.label, body.startsAt, body.endsAt, body.serviceDate]
      ).catch((err) => {
        if (err.code === "23514" && /once_per_event/.test(err.message)) {
          throw conflict("OCCURRENCE_EXISTS", "This checkpoint already has its single event-wide occurrence");
        }
        throw err;
      });
      await audit(pool, { actor: user.id, action: "create", entity: "occurrence", entityId: rows[0].id, eventId });
      res.status(201).json({ occurrence: rows[0] });
    } catch (err) {
      next(err);
    }
  });

  return router;
}
