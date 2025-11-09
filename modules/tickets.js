export function ensureTicketShape(ticket) {
  return {
    id: ticket.id,
    used: Boolean(ticket.used),
    createdAt: ticket.createdAt || new Date().toISOString(),
    usedAt: ticket.usedAt || null,
    syncStatus: ticket.syncStatus || "local",
    lastSyncedAt: ticket.lastSyncedAt || null,
    pendingAction: ticket.pendingAction || null,
    metadata: ticket.metadata || {},
    source: ticket.source || "local",
  };
}

export function normalizeTickets(tickets) {
  return tickets.map(ensureTicketShape);
}

export function rebuildTicketMap(tickets) {
  return tickets.reduce((map, ticket) => {
    map.set(ticket.id, ticket);
    return map;
  }, new Map());
}

export function sortTickets(tickets) {
  return [...tickets].sort((a, b) => a.id.localeCompare(b.id, undefined, { numeric: true }));
}

export function computeTicketStats(tickets) {
  const used = tickets.filter((t) => t.used).length;
  return {
    total: tickets.length,
    used,
    unused: tickets.length - used,
  };
}

export function findTicket(ticketMap, code) {
  if (!code) return null;
  const normalized = code.trim();
  return ticketMap.get(normalized) || null;
}


