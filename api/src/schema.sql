-- NUMZSCAN ticket sync schema — run once against the numzscan database on infra-postgres.

create table if not exists tickets (
  id text primary key,
  event_id text not null,
  active boolean not null default true,
  created_at timestamptz not null default now(),
  created_by text,
  metadata jsonb not null default '{}',
  last_synced_at timestamptz
);

create index if not exists idx_tickets_event_id on tickets (event_id);

create table if not exists ticket_scans (
  id uuid primary key default gen_random_uuid(),
  ticket_id text not null references tickets (id) on delete cascade,
  event_id text not null,
  device_id text not null,
  scan_at timestamptz not null default now(),
  scan_location text,
  scan_action text not null check (scan_action in ('scan', 'reset')),
  payload jsonb not null default '{}'
);

create index if not exists idx_ticket_scans_ticket_id on ticket_scans (ticket_id);
create index if not exists idx_ticket_scans_event_id on ticket_scans (event_id);
create index if not exists idx_ticket_scans_scan_at on ticket_scans (scan_at);
