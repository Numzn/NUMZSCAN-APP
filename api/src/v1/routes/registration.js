import { Router } from "express";
import rateLimit from "express-rate-limit";
import { z } from "zod";
import { audit } from "../audit.js";
import { MANAGE_ROLES, authorizeEvent, eventIdOf, requireUser } from "../access.js";
import { withTransaction } from "../tx.js";
import { parse } from "../validation.js";
import { ApiError, conflict, notFound } from "../security.js";
import {
  DEFAULT_FIELDS,
  FIELD_TYPES,
  MAX_FIELDS,
  OPTION_TYPES,
  SLUG,
  checkFieldDefinition,
  fullName,
  keyFromLabel,
  newReference,
  normalizeName,
  phoneDigits,
  slugCandidate,
  validateAnswers,
} from "../registration.js";

// Registration is configured by event managers. Administrators pass authorizeEvent for every event.
// Staff cannot see or change the registration of an event, so the answers they would reveal stay private.
const REGISTRATION_ROLES = MANAGE_ROLES;
const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

const newFieldSchema = z.object({
  label: z.string().trim().min(1).max(120),
  type: z.enum(FIELD_TYPES),
  required: z.boolean().optional(),
  section: z.string().trim().min(1).max(60).nullable().optional(),
  options: z.array(z.string().trim().min(1).max(120)).min(2).max(50).nullable().optional(),
});

const fieldPatchSchema = z
  .object({
    label: z.string().trim().min(1).max(120).optional(),
    type: z.enum(FIELD_TYPES).optional(),
    required: z.boolean().optional(),
    section: z.string().trim().min(1).max(60).nullable().optional(),
    options: z.array(z.string().trim().min(1).max(120)).min(2).max(50).nullable().optional(),
  })
  .refine((v) => Object.keys(v).length > 0, { message: "nothing to update" });

const orderSchema = z.object({ fieldOrder: z.array(z.string().regex(UUID)).min(1).max(MAX_FIELDS) });
const linkSchema = z.object({ slug: SLUG });
const submitSchema = z.object({ submissionId: z.string().regex(UUID), answers: z.unknown() });

// A field as the manager sees it. The id is needed to edit it; it is never shown on the public form.
const MANAGER_FIELD = `id, field_key as key, label, field_type as type, required, section, options,
  person_field as "personField", position`;

const PUBLIC_FIELD = `field_key as key, label, field_type as type, required, section, options`;

const uuidOr404 = (value) => {
  if (!UUID.test(value)) throw notFound("Not found");
  return value;
};

async function registrationRow(client, eventId) {
  const { rows } = await client.query(
    `select id, slug, status, opened_at as "openedAt", closed_at as "closedAt", updated_at as "updatedAt"
       from event_registrations where event_id = $1`,
    [eventId]
  );
  return rows[0] ?? null;
}

async function activeFields(client, eventId) {
  const { rows } = await client.query(
    `select ${MANAGER_FIELD} from registration_fields
      where event_id = $1 and archived_at is null order by position, created_at`,
    [eventId]
  );
  return rows;
}

function summaryOf(row, fieldCount, config) {
  return {
    status: row.status,
    slug: row.slug,
    publicUrl: config.publicUrl ? `${config.publicUrl}/r/${row.slug}` : null,
    fieldCount,
    openedAt: row.openedAt,
    closedAt: row.closedAt,
    updatedAt: row.updatedAt,
  };
}

async function summaryFor(client, row, eventId, config) {
  const { rows } = await client.query(
    "select count(*)::int as n from registration_fields where event_id = $1 and archived_at is null",
    [eventId]
  );
  return summaryOf(row, rows[0].n, config);
}

// A free public address. The event's own slug first, then -2, -3, and so on, so the choice is deterministic.
async function freeSlug(client, base) {
  for (let attempt = 1; attempt <= 50; attempt += 1) {
    const candidate = slugCandidate(base, attempt);
    const { rowCount } = await client.query("select 1 from event_registrations where slug = $1", [candidate]);
    if (rowCount === 0) return candidate;
  }
  throw conflict("SLUG_TAKEN", "No free public address could be found for this event");
}

// The field definition a request describes. Options given for a field that takes none are kept, so they are refused.
function definitionOf({ label, type, required, section, options }) {
  return {
    label,
    type,
    required: Boolean(required),
    section: section ?? null,
    options: options ?? null,
  };
}

function assertDefinition(definition) {
  const problems = checkFieldDefinition(definition);
  if (problems.length > 0) throw new ApiError(400, "INVALID_INPUT", "Request is invalid", problems);
}

function publicFieldOf(row) {
  return {
    id: row.id,
    key: row.key,
    label: row.label,
    type: row.type,
    required: row.required,
    section: row.section,
    options: row.options,
    personField: row.personField,
    position: row.position,
  };
}

// Publishing needs the three fields that identify the person. Defaults include them, and the form builder keeps them.
function missingPersonFields(fields) {
  const present = new Set(fields.map((field) => field.personField).filter(Boolean));
  return ["first_name", "last_name", "phone"].filter((name) => !present.has(name));
}

export function registrationRouter({ pool, config }) {
  const router = Router();

  router.get("/events/:eventId/registration", requireUser, async (req, res, next) => {
    try {
      const eventId = req.params.eventId;
      await authorizeEvent(pool, req.principal.user, eventId, REGISTRATION_ROLES);
      const row = await registrationRow(pool, eventId);
      if (!row) return res.json({ registration: null });
      res.json({ registration: await summaryFor(pool, row, eventId, config) });
    } catch (err) {
      next(err);
    }
  });

  router.post("/events/:eventId/registration", requireUser, async (req, res, next) => {
    try {
      const user = req.principal.user;
      const eventId = req.params.eventId;
      await authorizeEvent(pool, user, eventId, REGISTRATION_ROLES);
      const created = await withTransaction(pool, async (client) => {
        const event = (await client.query("select slug, status from events where id = $1 for update", [eventId])).rows[0];
        if (!event) throw notFound("Event not found");
        if (event.status === "archived") throw conflict("EVENT_ARCHIVED", "An archived event cannot take registrations");
        if (await registrationRow(client, eventId)) {
          throw conflict("REGISTRATION_EXISTS", "Registration is already configured for this event");
        }
        const slug = await freeSlug(client, event.slug);
        const { rows } = await client.query(
          `insert into event_registrations (event_id, slug) values ($1, $2) returning id`,
          [eventId, slug]
        );
        for (const [position, field] of DEFAULT_FIELDS.entries()) {
          await client.query(
            `insert into registration_fields
               (event_id, field_key, label, field_type, required, section, options, person_field, position)
             values ($1, $2, $3, $4, $5, $6, null, $7, $8)`,
            [eventId, field.key, field.label, field.type, field.required, field.section, field.personField ?? null, position]
          );
        }
        await audit(client, {
          actor: user.id,
          action: "create",
          entity: "registration",
          entityId: rows[0].id,
          eventId,
          details: { slug, fields: DEFAULT_FIELDS.length },
        });
        return registrationRow(client, eventId);
      });
      res.status(201).json({ registration: await summaryFor(pool, created, eventId, config) });
    } catch (err) {
      if (err.code === "23505" && err.constraint === "event_registrations_slug_key") {
        return next(conflict("SLUG_TAKEN", "That public address is already used"));
      }
      if (err.code === "23505" && err.constraint === "event_registrations_event_id_key") {
        return next(conflict("REGISTRATION_EXISTS", "Registration is already configured for this event"));
      }
      next(err);
    }
  });

  // Changing the public address is an explicit act: the old link stops working.
  router.patch("/events/:eventId/registration", requireUser, async (req, res, next) => {
    try {
      const user = req.principal.user;
      const eventId = req.params.eventId;
      await authorizeEvent(pool, user, eventId, REGISTRATION_ROLES);
      const body = parse(linkSchema, req.body);
      await withTransaction(pool, async (client) => {
        const row = (await client.query("select id, slug from event_registrations where event_id = $1 for update", [eventId])).rows[0];
        if (!row) throw notFound("Registration is not configured for this event");
        if (row.slug === body.slug) return;
        const clash = await client.query("select 1 from event_registrations where slug = $1", [body.slug]);
        if (clash.rowCount > 0) throw conflict("SLUG_TAKEN", "That public address is already used");
        await client.query("update event_registrations set slug = $2, updated_at = now() where id = $1", [row.id, body.slug]);
        await audit(client, {
          actor: user.id,
          action: "update",
          entity: "registration",
          entityId: row.id,
          eventId,
          details: { change: "link", from: row.slug, to: body.slug },
        });
      });
      const row = await registrationRow(pool, eventId);
      res.json({ registration: await summaryFor(pool, row, eventId, config) });
    } catch (err) {
      if (err.code === "23505" && err.constraint === "event_registrations_slug_key") {
        return next(conflict("SLUG_TAKEN", "That public address is already used"));
      }
      next(err);
    }
  });

  router.get("/events/:eventId/registration/form", requireUser, async (req, res, next) => {
    try {
      await authorizeEvent(pool, req.principal.user, req.params.eventId, REGISTRATION_ROLES);
      const fields = await activeFields(pool, req.params.eventId);
      res.json({ fields });
    } catch (err) {
      next(err);
    }
  });

  router.patch("/events/:eventId/registration/form", requireUser, async (req, res, next) => {
    try {
      const user = req.principal.user;
      const eventId = req.params.eventId;
      await authorizeEvent(pool, user, eventId, REGISTRATION_ROLES);
      const body = parse(orderSchema, req.body);
      const fields = await withTransaction(pool, async (client) => {
        const row = (await client.query("select id from event_registrations where event_id = $1 for update", [eventId])).rows[0];
        if (!row) throw conflict("REGISTRATION_NOT_CONFIGURED", "Configure registration before editing its form");
        const active = (await client.query(
          "select id from registration_fields where event_id = $1 and archived_at is null",
          [eventId]
        )).rows.map((r) => r.id);
        const requested = body.fieldOrder;
        const complete =
          requested.length === active.length &&
          new Set(requested).size === requested.length &&
          active.every((id) => requested.includes(id));
        if (!complete) {
          throw new ApiError(400, "INVALID_INPUT", "Request is invalid", [
            { path: "fieldOrder", message: "List every active field exactly once" },
          ]);
        }
        await client.query(
          `update registration_fields set position = o.ord::integer - 1, updated_at = now()
             from unnest($2::uuid[]) with ordinality as o(id, ord)
            where registration_fields.id = o.id and registration_fields.event_id = $1`,
          [eventId, requested]
        );
        await audit(client, {
          actor: user.id,
          action: "reorder",
          entity: "registration_form",
          entityId: row.id,
          eventId,
          details: { fields: requested.length },
        });
        return activeFields(client, eventId);
      });
      res.json({ fields });
    } catch (err) {
      next(err);
    }
  });

  router.post("/events/:eventId/registration/form/fields", requireUser, async (req, res, next) => {
    try {
      const user = req.principal.user;
      const eventId = req.params.eventId;
      await authorizeEvent(pool, user, eventId, REGISTRATION_ROLES);
      const body = parse(newFieldSchema, req.body);
      const definition = definitionOf({ required: false, ...body });
      assertDefinition(definition);
      const field = await withTransaction(pool, async (client) => {
        const reg = (await client.query("select id from event_registrations where event_id = $1 for update", [eventId])).rows[0];
        if (!reg) throw conflict("REGISTRATION_NOT_CONFIGURED", "Configure registration before editing its form");
        const active = (await client.query(
          "select count(*)::int as n from registration_fields where event_id = $1 and archived_at is null",
          [eventId]
        )).rows[0].n;
        if (active >= MAX_FIELDS) throw conflict("FORM_FULL", `A form can have at most ${MAX_FIELDS} fields`);
        // Keys are never reused, archived ones included, so every stored answer names one field for good.
        const taken = new Set((await client.query("select field_key from registration_fields where event_id = $1", [eventId])).rows.map((r) => r.field_key));
        const key = keyFromLabel(definition.label, taken);
        const { rows } = await client.query(
          `insert into registration_fields (event_id, field_key, label, field_type, required, section, options, position)
           values ($1, $2, $3, $4, $5, $6, $7, $8) returning ${MANAGER_FIELD}`,
          [eventId, key, definition.label, definition.type, definition.required, definition.section, definition.options, active]
        );
        await audit(client, {
          actor: user.id,
          action: "create",
          entity: "registration_field",
          entityId: rows[0].id,
          eventId,
          details: { key, type: definition.type, required: definition.required },
        });
        return rows[0];
      });
      res.status(201).json({ field });
    } catch (err) {
      next(err);
    }
  });

  router.patch("/events/:eventId/registration/form/fields/:fieldId", requireUser, async (req, res, next) => {
    try {
      const user = req.principal.user;
      const eventId = req.params.eventId;
      const fieldId = uuidOr404(req.params.fieldId);
      await authorizeEvent(pool, user, eventId, REGISTRATION_ROLES);
      const body = parse(fieldPatchSchema, req.body);
      const field = await withTransaction(pool, async (client) => {
        const current = (await client.query(
          `select id, field_key as key, label, field_type as type, required, section, options,
                  person_field as "personField", archived_at as "archivedAt"
             from registration_fields where id = $1 and event_id = $2 for update`,
          [fieldId, eventId]
        )).rows[0];
        if (!current) throw notFound("Field not found");
        if (current.archivedAt) throw conflict("FIELD_ARCHIVED", "An archived field cannot be changed");
        if (current.personField) {
          if (body.type !== undefined && body.type !== current.type) {
            throw conflict("PERSON_FIELD_LOCKED", "This field identifies the person, so its type cannot change");
          }
          if (body.required === false) throw conflict("PERSON_FIELD_LOCKED", "This field is always required");
        }
        const type = body.type ?? current.type;
        // Changing to a type without options drops the old options, unless the request sets them explicitly.
        const options = body.options !== undefined
          ? body.options
          : OPTION_TYPES.includes(type) ? current.options : null;
        const next = definitionOf({
          label: body.label ?? current.label,
          type,
          required: body.required ?? current.required,
          section: body.section !== undefined ? body.section : current.section,
          options,
        });
        assertDefinition(next);
        const { rows } = await client.query(
          `update registration_fields
              set label = $2, field_type = $3, required = $4, section = $5, options = $6, updated_at = now()
            where id = $1
          returning ${MANAGER_FIELD}`,
          [fieldId, next.label, next.type, next.required, next.section, next.options]
        );
        await audit(client, {
          actor: user.id,
          action: "update",
          entity: "registration_field",
          entityId: fieldId,
          eventId,
          details: { key: current.key, changed: Object.keys(body) },
        });
        return rows[0];
      });
      res.json({ field });
    } catch (err) {
      next(err);
    }
  });

  // Removing a field archives it. Answers already given keep their snapshot, so history stays readable.
  router.delete("/events/:eventId/registration/form/fields/:fieldId", requireUser, async (req, res, next) => {
    try {
      const user = req.principal.user;
      const eventId = req.params.eventId;
      const fieldId = uuidOr404(req.params.fieldId);
      await authorizeEvent(pool, user, eventId, REGISTRATION_ROLES);
      const field = await withTransaction(pool, async (client) => {
        const current = (await client.query(
          `select field_key as key, person_field as "personField", archived_at as "archivedAt"
             from registration_fields where id = $1 and event_id = $2 for update`,
          [fieldId, eventId]
        )).rows[0];
        if (!current) throw notFound("Field not found");
        if (current.archivedAt) return null;
        if (current.personField) {
          throw conflict("PERSON_FIELD_LOCKED", "This field identifies the person, so it cannot be removed");
        }
        const { rows } = await client.query(
          `update registration_fields set archived_at = now(), updated_at = now() where id = $1 returning ${MANAGER_FIELD}`,
          [fieldId]
        );
        await audit(client, {
          actor: user.id,
          action: "archive",
          entity: "registration_field",
          entityId: fieldId,
          eventId,
          details: { key: current.key },
        });
        return rows[0];
      });
      res.json({ field });
    } catch (err) {
      next(err);
    }
  });

  router.post("/events/:eventId/registration/publish", requireUser, async (req, res, next) => {
    try {
      const user = req.principal.user;
      const eventId = req.params.eventId;
      await authorizeEvent(pool, user, eventId, REGISTRATION_ROLES);
      await withTransaction(pool, async (client) => {
        const row = (await client.query("select id, slug, status from event_registrations where event_id = $1 for update", [eventId])).rows[0];
        if (!row) throw conflict("REGISTRATION_NOT_CONFIGURED", "Configure registration before publishing it");
        const event = (await client.query("select status from events where id = $1", [eventId])).rows[0];
        if (event?.status === "archived") throw conflict("EVENT_ARCHIVED", "An archived event cannot take registrations");
        if (row.status === "open") return;
        const missing = missingPersonFields(await activeFields(client, eventId));
        if (missing.length > 0) {
          throw new ApiError(409, "REGISTRATION_INCOMPLETE", "The form is not ready to publish", [
            { path: "form", message: "Keep first name, last name and phone number on the form" },
          ]);
        }
        await client.query(
          "update event_registrations set status = 'open', opened_at = now(), closed_at = null, updated_at = now() where id = $1",
          [row.id]
        );
        await audit(client, {
          actor: user.id,
          action: "publish",
          entity: "registration",
          entityId: row.id,
          eventId,
          details: { from: row.status, slug: row.slug },
        });
      });
      res.json({ registration: await summaryFor(pool, await registrationRow(pool, eventId), eventId, config) });
    } catch (err) {
      next(err);
    }
  });

  router.post("/events/:eventId/registration/close", requireUser, async (req, res, next) => {
    try {
      const user = req.principal.user;
      const eventId = req.params.eventId;
      await authorizeEvent(pool, user, eventId, REGISTRATION_ROLES);
      await withTransaction(pool, async (client) => {
        const row = (await client.query("select id, status from event_registrations where event_id = $1 for update", [eventId])).rows[0];
        if (!row) throw conflict("REGISTRATION_NOT_CONFIGURED", "Registration is not configured for this event");
        if (row.status !== "open") throw conflict("REGISTRATION_NOT_OPEN", "Only open registration can be closed");
        await client.query(
          "update event_registrations set status = 'closed', closed_at = now(), updated_at = now() where id = $1",
          [row.id]
        );
        await audit(client, {
          actor: user.id,
          action: "close",
          entity: "registration",
          entityId: row.id,
          eventId,
          details: { from: row.status },
        });
      });
      res.json({ registration: await summaryFor(pool, await registrationRow(pool, eventId), eventId, config) });
    } catch (err) {
      next(err);
    }
  });

  // The answers a participant gave on their most recent registration. Managers only: they hold personal details.
  router.get("/event-participants/:participantId/registration", requireUser, async (req, res, next) => {
    try {
      const participantId = uuidOr404(req.params.participantId);
      const eventId = await eventIdOf(pool, "event_participants", participantId);
      await authorizeEvent(pool, req.principal.user, eventId, REGISTRATION_ROLES);
      const submission = (await pool.query(
        `select id, reference, submitted_at as "submittedAt", identity_match as "identityMatch"
           from registration_submissions where event_participant_id = $1
          order by submitted_at desc limit 1`,
        [participantId]
      )).rows[0];
      if (!submission) return res.json({ submission: null });
      const { rows } = await pool.query(
        `select a.field_key as key, a.field_label as label, a.field_type as type, a.value
           from registration_answers a left join registration_fields f on f.id = a.field_id
          where a.submission_id = $1
          order by f.position nulls last, a.field_key`,
        [submission.id]
      );
      res.json({
        submission: {
          reference: submission.reference,
          submittedAt: submission.submittedAt,
          identityMatch: submission.identityMatch,
          answers: rows,
        },
      });
    } catch (err) {
      next(err);
    }
  });

  return router;
}

// The public details of a registration by its address. Used by the public routes and by the submit transaction.
const detailsSql = `
  select r.event_id as "eventId", r.status, e.name, e.status as "eventStatus",
         to_char(e.starts_on, 'YYYY-MM-DD') as "startsOn", to_char(e.ends_on, 'YYYY-MM-DD') as "endsOn", e.timezone
    from event_registrations r join events e on e.id = r.event_id
   where r.slug = $1`;

// An archived event takes no registrations, even if its registration was still open.
const effectiveStatus = (row) => (row.eventStatus === "archived" && row.status === "open" ? "closed" : row.status);

// Public registration: unauthenticated, so it is limited per address, and it reveals only the event's public
// details, the open form, and the registration's status.
export function publicRegistrationRouter({ pool, config }) {
  const router = Router();
  router.use(
    "/public/registration/:slug",
    rateLimit({
      windowMs: 60 * 1000,
      limit: config.publicRegistrationLimitPerMinute,
      standardHeaders: true,
      legacyHeaders: false,
    })
  );

  router.get("/public/registration/:slug", async (req, res, next) => {
    try {
      const row = (await pool.query(detailsSql, [req.params.slug])).rows[0];
      if (!row) throw notFound("Registration not found");
      const status = effectiveStatus(row);
      const fields = status === "open" ? (await pool.query(
        `select ${PUBLIC_FIELD} from registration_fields where event_id = $1 and archived_at is null order by position, created_at`,
        [row.eventId]
      )).rows : [];
      res.set("Cache-Control", "no-store").json({
        event: { name: row.name, startsOn: row.startsOn, endsOn: row.endsOn, timezone: row.timezone },
        registration: { status, fields },
      });
    } catch (err) {
      next(err);
    }
  });

  router.post("/public/registration/:slug", async (req, res, next) => {
    try {
      const body = parse(submitSchema, req.body);
      const result = await withTransaction(pool, (client) => submitRegistration(client, req.params.slug, body));
      res.set("Cache-Control", "no-store").status(result.created ? 201 : 200).json({ confirmation: result.confirmation });
    } catch (err) {
      next(err);
    }
  });

  return router;
}

// The confirmation a participant sees. It names only the person's first name, the event, and the reference.
function confirmationOf(reg, reference, firstName) {
  return {
    reference,
    firstName,
    eventName: reg.name,
    startsOn: reg.startsOn,
    endsOn: reg.endsOn,
    timezone: reg.timezone,
  };
}

async function existingConfirmation(client, reg, submissionId) {
  const { rows } = await client.query(
    `select s.reference,
            (select a.value from registration_answers a
               join registration_fields f on f.id = a.field_id
              where a.submission_id = s.id and f.person_field = 'first_name') as "firstName"
       from registration_submissions s
      where s.event_id = $1 and s.client_request_id = $2`,
    [reg.eventId, submissionId]
  );
  return rows[0] ? confirmationOf(reg, rows[0].reference, rows[0].firstName) : null;
}

async function submitRegistration(client, slug, body) {
  // Holds the registration's status steady while the submission is written, so a close cannot race a submit.
  const reg = (await client.query(`${detailsSql} for share of r`, [slug])).rows[0];
  if (!reg) throw notFound("Registration not found");

  // The same submission id queues here. The second request finds the first one's record and returns it.
  await client.query("select pg_advisory_xact_lock(hashtext($1))", [`registration-request:${reg.eventId}:${body.submissionId}`]);
  const prior = await existingConfirmation(client, reg, body.submissionId);
  if (prior) return { created: false, confirmation: prior };

  const status = effectiveStatus(reg);
  if (status === "closed") throw conflict("REGISTRATION_CLOSED", "Registration for this event is closed");
  if (status !== "open") throw conflict("REGISTRATION_NOT_OPEN", "Registration for this event is not open yet");

  const fields = await activeFields(client, reg.eventId);
  const { errors, values } = validateAnswers(fields, body.answers);
  if (errors.length > 0) throw new ApiError(400, "INVALID_INPUT", "Request is invalid", errors);

  const keyOf = Object.fromEntries(fields.filter((f) => f.personField).map((f) => [f.personField, f.key]));
  const firstName = values[keyOf.first_name].trim();
  const name = fullName(firstName, values[keyOf.last_name]);
  const phone = values[keyOf.phone];
  const nameKey = normalizeName(name);
  const digits = phoneDigits(phone);

  // Two registrations for the same name and phone are serialised here, so they cannot both create a person.
  await client.query("select pg_advisory_xact_lock(hashtext($1))", [`registration-person:${nameKey}|${digits}`]);
  const matches = (await client.query(
    `select id from people
      where normalized_name = $1 and regexp_replace(coalesce(phone, ''), '[^0-9]', '', 'g') = $2 and merged_into_id is null
      order by created_at limit 2`,
    [nameKey, digits]
  )).rows;

  // One exact match is the same person. No match is a new person. Several matches are ambiguous: a new person is
  // created and nothing is merged, and the submission records the ambiguity for later review.
  let personId;
  let identityMatch;
  if (matches.length === 1) {
    personId = matches[0].id;
    identityMatch = "reused";
  } else {
    personId = (await client.query(
      "insert into people (full_name, normalized_name, phone) values ($1, $2, $3) returning id",
      [name, nameKey, phone]
    )).rows[0].id;
    identityMatch = matches.length === 0 ? "new" : "ambiguous";
  }

  const already = await client.query("select 1 from event_participants where event_id = $1 and person_id = $2", [reg.eventId, personId]);
  if (already.rowCount > 0) throw conflict("ALREADY_REGISTERED", "You are already registered for this event");
  const participant = (await client.query(
    "insert into event_participants (event_id, person_id, role) values ($1, $2, 'camper') returning id",
    [reg.eventId, personId]
  )).rows[0];

  const submission = await insertSubmission(client, {
    eventId: reg.eventId,
    participantId: participant.id,
    clientRequestId: body.submissionId,
    identityMatch,
  });
  for (const field of fields) {
    if (values[field.key] === undefined) continue;
    await client.query(
      `insert into registration_answers (submission_id, field_id, field_key, field_label, field_type, value)
       values ($1, $2, $3, $4, $5, $6)`,
      [submission.id, field.id, field.key, field.label, field.type, values[field.key]]
    );
  }
  // The audit entry records the outcome only, never the answers.
  await audit(client, {
    actor: "public",
    action: "submit",
    entity: "registration_submission",
    entityId: submission.id,
    eventId: reg.eventId,
    details: { identityMatch },
  });
  return { created: true, confirmation: confirmationOf(reg, submission.reference, firstName) };
}

// Writes the submission under a fresh reference. A reference collision (rare) is retried inside a savepoint.
async function insertSubmission(client, { eventId, participantId, clientRequestId, identityMatch }) {
  for (let attempt = 1; attempt <= 5; attempt += 1) {
    await client.query("savepoint registration_submission");
    try {
      const { rows } = await client.query(
        `insert into registration_submissions (event_id, event_participant_id, reference, client_request_id, identity_match)
         values ($1, $2, $3, $4, $5) returning id, reference`,
        [eventId, participantId, newReference(), clientRequestId, identityMatch]
      );
      await client.query("release savepoint registration_submission");
      return rows[0];
    } catch (err) {
      await client.query("rollback to savepoint registration_submission");
      if (err.code !== "23505" || err.constraint !== "registration_submissions_reference_key") throw err;
    }
  }
  throw new ApiError(503, "TRY_AGAIN", "Please try again");
}
