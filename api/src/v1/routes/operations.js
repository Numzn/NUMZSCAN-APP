import { Router } from "express";
import { authorizeEvent, OPERATE_ROLES, READ_ROLES, requireUser } from "../access.js";
import { parse } from "../validation.js";
import { errorFor, processScan, scanSchema } from "../scanService.js";
import { withTransaction } from "../tx.js";

const PARTICIPANT_BRIEF = `ep.id, p.full_name as "fullName", g.name as "groupName", ep.status`;

// What the operator needs to act on a scan: who it is and where they are placed. Never the credential itself.
async function participantBrief(pool, participantId) {
  const { rows } = await pool.query(
    `select ${PARTICIPANT_BRIEF} from event_participants ep
       join people p on p.id = ep.person_id
       left join groups g on g.id = ep.group_id
      where ep.id = $1`,
    [participantId]
  );
  return rows[0] ?? null;
}

export function operationsRouter({ pool, config }) {
  const router = Router();

  // Staff scanning. The same rules as a device scan, with the signed-in user recorded as the operator.
  router.post("/events/:eventId/scans", requireUser, async (req, res, next) => {
    try {
      const user = req.principal.user;
      const eventId = req.params.eventId;
      await authorizeEvent(pool, user, eventId, OPERATE_ROLES);
      const body = parse(scanSchema, req.body);

      const result = await withTransaction(pool, (client) =>
        processScan(client, {
          tokenKey: config.tokenKey,
          eventId,
          recorder: { kind: "user", userId: user.id },
          body,
        })
      );

      const participant = await participantBrief(pool, result.interaction.eventParticipantId);
      const error = errorFor(result.interaction.outcome, result.interaction.reason);
      if (error) {
        // The refusal is recorded. The operator still sees who it was, so they can act on it.
        error.details = { participant };
        return next(error);
      }
      res.status(result.replayed ? 200 : 201).json({
        interaction: result.interaction,
        replayed: result.replayed,
        operation: result.operation,
        participant,
      });
    } catch (err) {
      next(err);
    }
  });

  // The totals the camp needs to see: attendance by status and group, meals and scans by checkpoint.
  router.get("/events/:eventId/attendance", requireUser, async (req, res, next) => {
    try {
      const eventId = req.params.eventId;
      await authorizeEvent(pool, req.principal.user, eventId, READ_ROLES);

      const byStatus = (await pool.query(
        `select status, count(*)::int as n from event_participants where event_id = $1 group by status`,
        [eventId]
      )).rows;
      const byGroup = (await pool.query(
        `select coalesce(g.name, 'No group') as "groupName",
                count(*)::int as total,
                count(*) filter (where ep.status = 'checked_in')::int as "checkedIn",
                count(*) filter (where ep.status = 'departed')::int as departed
           from event_participants ep left join groups g on g.id = ep.group_id
          where ep.event_id = $1
          group by g.name
          order by g.name nulls last`,
        [eventId]
      )).rows;
      const byCheckpoint = (await pool.query(
        `select c.id as "checkpointId", c.name, c.kind,
                count(i.id) filter (where i.outcome = 'accepted')::int as accepted,
                count(i.id) filter (where i.outcome = 'duplicate')::int as duplicate,
                count(i.id) filter (where i.outcome in ('rejected', 'revoked', 'outside_window'))::int as refused
           from checkpoints c left join interactions i on i.checkpoint_id = c.id
          where c.event_id = $1
          group by c.id, c.name, c.kind
          order by c.name`,
        [eventId]
      )).rows;

      const counts = Object.fromEntries(["registered", "checked_in", "departed", "cancelled"].map((s) => [s, 0]));
      for (const row of byStatus) counts[row.status] = row.n;
      res.json({
        counts,
        byGroup,
        byCheckpoint,
        meals: byCheckpoint.filter((c) => c.kind === "meal").map((c) => ({ name: c.name, served: c.accepted })),
      });
    } catch (err) {
      next(err);
    }
  });

  return router;
}
