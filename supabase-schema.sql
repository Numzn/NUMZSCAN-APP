-- Supabase schema for QR Ticket System
-- Run this script in the Supabase SQL editor.

create extension if not exists "uuid-ossp";

create table if not exists public.tickets (
  id text primary key,
  event_id text not null,
  active boolean not null default true,
  created_at timestamptz not null default now(),
  created_by text not null,
  metadata jsonb default '{}',
  last_synced_at timestamptz,
  constraint tickets_event_unique unique (id, event_id)
);

create table if not exists public.ticket_scans (
  id uuid primary key default uuid_generate_v4(),
  ticket_id text not null references public.tickets(id) on delete cascade,
  event_id text not null,
  device_id text not null,
  scan_at timestamptz not null default now(),
  scan_location text,
  scan_action text not null check (scan_action in ('scan','reset')),
  payload jsonb default '{}'
);

create index if not exists idx_ticket_scans_ticket_id on public.ticket_scans(ticket_id);
create index if not exists idx_ticket_scans_event_id on public.ticket_scans(event_id);
create index if not exists idx_ticket_scans_device_id on public.ticket_scans(device_id);

-- Sample policies (adjust when auth is added)
-- For now, rely on service role key used by clients.
