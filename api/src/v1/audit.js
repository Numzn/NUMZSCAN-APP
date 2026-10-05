// Records a security-relevant action. Never pass secrets, tokens or password material in details.
export function audit(pool, { actor, action, entity, entityId, eventId = null, details = {} }) {
  return pool.query(
    `insert into audit_log (actor, action, entity, entity_id, event_id, details)
     values ($1, $2, $3, $4, $5, $6)`,
    [String(actor), action, entity, String(entityId), eventId, JSON.stringify(details)]
  );
}
