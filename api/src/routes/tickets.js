import { Router } from "express";
import { pool } from "../db.js";

const router = Router();

router.get("/tickets", async (req, res, next) => {
  try {
    const { event_id: eventId } = req.query;
    const { rows } = await pool.query(
      `select id, event_id, active, created_at, created_by, metadata, last_synced_at
       from tickets
       where $1::text is null or event_id = $1
       order by id`,
      [eventId || null]
    );
    res.json(rows);
  } catch (err) {
    next(err);
  }
});

router.post("/tickets", async (req, res, next) => {
  try {
    const { id, event_id: eventId, active, created_at: createdAt, created_by: createdBy, metadata } = req.body || {};
    if (!id || !eventId) {
      return res.status(400).json({ error: "id and event_id are required" });
    }
    const { rows } = await pool.query(
      `insert into tickets (id, event_id, active, created_at, created_by, metadata)
       values ($1, $2, coalesce($3, true), coalesce($4, now()), $5, coalesce($6, '{}'::jsonb))
       on conflict (id) do update set
         event_id = excluded.event_id,
         active = excluded.active,
         created_by = coalesce(excluded.created_by, tickets.created_by),
         metadata = excluded.metadata,
         last_synced_at = now()
       returning id, event_id, active, created_at, created_by, metadata, last_synced_at`,
      [id, eventId, active, createdAt, createdBy || null, metadata ? JSON.stringify(metadata) : null]
    );
    res.status(201).json(rows[0]);
  } catch (err) {
    next(err);
  }
});

router.patch("/tickets/:id", async (req, res, next) => {
  try {
    const { active, metadata, last_synced_at: lastSyncedAt } = req.body || {};
    const { rows } = await pool.query(
      `update tickets set
         active = coalesce($2, active),
         metadata = coalesce($3, metadata),
         last_synced_at = coalesce($4, now())
       where id = $1
       returning id, event_id, active, created_at, created_by, metadata, last_synced_at`,
      [req.params.id, active, metadata ? JSON.stringify(metadata) : null, lastSyncedAt || null]
    );
    if (!rows.length) {
      return res.status(404).json({ error: "ticket not found" });
    }
    res.json(rows[0]);
  } catch (err) {
    next(err);
  }
});

router.post("/ticket-scans", async (req, res, next) => {
  try {
    const {
      ticket_id: ticketId,
      event_id: eventId,
      device_id: deviceId,
      scan_location: scanLocation,
      scan_action: scanAction,
      payload,
    } = req.body || {};
    if (!ticketId || !eventId || !deviceId || !["scan", "reset"].includes(scanAction)) {
      return res.status(400).json({ error: "ticket_id, event_id, device_id and a valid scan_action are required" });
    }
    const { rows } = await pool.query(
      `insert into ticket_scans (ticket_id, event_id, device_id, scan_location, scan_action, payload)
       values ($1, $2, $3, $4, $5, coalesce($6, '{}'::jsonb))
       returning id, ticket_id, event_id, device_id, scan_at, scan_location, scan_action, payload`,
      [ticketId, eventId, deviceId, scanLocation || null, scanAction, payload ? JSON.stringify(payload) : null]
    );
    res.status(201).json(rows[0]);
  } catch (err) {
    if (err.code === "23503") {
      return res.status(404).json({ error: "ticket not found" });
    }
    next(err);
  }
});

router.get("/ticket-scans", async (req, res, next) => {
  try {
    const { since, event_id: eventId } = req.query;
    const { rows } = await pool.query(
      `select id, ticket_id, event_id, device_id, scan_at, scan_location, scan_action, payload
       from ticket_scans
       where scan_at >= coalesce($1::timestamptz, '-infinity')
         and ($2::text is null or event_id = $2)
       order by scan_at asc`,
      [since || null, eventId || null]
    );
    res.json(rows);
  } catch (err) {
    next(err);
  }
});

export default router;
