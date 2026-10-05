-- EventPass v2. Additive: creates new tables and leaves tickets and ticket_scans untouched.
--
-- Cross-event integrity uses composite keys: every child row references its parent as
-- (parent_id, event_id), so a row cannot point at another event's data.

create table people (
  id uuid primary key default gen_random_uuid(),
  full_name text not null check (length(btrim(full_name)) > 0),
  normalized_name text not null,
  phone text,
  merged_into_id uuid references people (id),
  created_at timestamptz not null default now(),
  check (merged_into_id is null or merged_into_id <> id)
);
create index people_normalized_name_idx on people (normalized_name);

create table events (
  id uuid primary key default gen_random_uuid(),
  slug text not null unique check (slug ~ '^[a-z0-9]+(-[a-z0-9]+)*$'),
  name text not null,
  kind text not null check (kind in ('church_camp', 'generic')),
  timezone text not null,
  starts_on date not null,
  ends_on date not null,
  status text not null default 'draft' check (status in ('draft', 'open', 'closed', 'archived')),
  created_at timestamptz not null default now(),
  check (ends_on >= starts_on)
);

create table groups (
  id uuid primary key default gen_random_uuid(),
  event_id uuid not null references events (id) on delete restrict,
  name text not null,
  kind text not null check (kind in ('church', 'dorm', 'team')),
  created_at timestamptz not null default now(),
  unique (event_id, name),
  unique (id, event_id)
);

create table event_participants (
  id uuid primary key default gen_random_uuid(),
  event_id uuid not null references events (id) on delete restrict,
  person_id uuid not null references people (id) on delete restrict,
  group_id uuid,
  role text not null default 'camper' check (role in ('camper', 'leader', 'staff')),
  status text not null default 'registered'
    check (status in ('registered', 'checked_in', 'departed', 'cancelled')),
  registered_at timestamptz not null default now(),
  unique (event_id, person_id),
  unique (id, event_id),
  foreign key (group_id, event_id) references groups (id, event_id)
);

create table credentials (
  id uuid primary key default gen_random_uuid(),
  event_id uuid not null,
  event_participant_id uuid not null,
  kind text not null default 'qr' check (kind in ('qr', 'nfc')),
  token_hmac text not null unique check (token_hmac ~ '^[0-9a-f]{64}$'),
  token_hint text,
  status text not null default 'active' check (status in ('active', 'revoked', 'replaced')),
  issued_at timestamptz not null default now(),
  revoked_at timestamptz,
  replaced_by uuid references credentials (id),
  foreign key (event_participant_id, event_id) references event_participants (id, event_id),
  unique (id, event_participant_id),
  check (status <> 'revoked' or revoked_at is not null)
);
create unique index credentials_one_active_per_participation
  on credentials (event_participant_id) where status = 'active';

create table checkpoints (
  id uuid primary key default gen_random_uuid(),
  event_id uuid not null references events (id) on delete restrict,
  name text not null,
  kind text not null check (kind in (
    'gate', 'check_in', 'service', 'activity', 'meal', 'transport', 'departure', 'generic'
  )),
  rule_type text not null check (rule_type in ('once_per_event', 'once_per_occurrence', 'unlimited')),
  active boolean not null default true,
  unique (id, event_id)
);

create table checkpoint_occurrences (
  id uuid primary key default gen_random_uuid(),
  event_id uuid not null,
  checkpoint_id uuid not null,
  label text not null,
  starts_at timestamptz not null,
  ends_at timestamptz not null,
  service_date date not null,
  foreign key (checkpoint_id, event_id) references checkpoints (id, event_id),
  unique (id, checkpoint_id),
  check (ends_at > starts_at)
);

-- once_per_event: a checkpoint has exactly one occurrence, covering the whole event.
-- Locking the checkpoint row serialises concurrent occurrence inserts for it.
create function enforce_single_occurrence_for_event_rule() returns trigger
language plpgsql as $$
declare
  rule text;
begin
  select rule_type into rule from checkpoints where id = new.checkpoint_id for update;
  if rule = 'once_per_event' and exists (
    select 1 from checkpoint_occurrences where checkpoint_id = new.checkpoint_id
  ) then
    raise exception 'once_per_event checkpoint already has an occurrence'
      using errcode = 'check_violation';
  end if;
  return new;
end;
$$;
create trigger checkpoint_occurrences_single_for_event
  before insert on checkpoint_occurrences
  for each row execute function enforce_single_occurrence_for_event_rule();

create table scanner_devices (
  id uuid primary key default gen_random_uuid(),
  event_id uuid not null references events (id) on delete restrict,
  name text not null,
  checkpoint_id uuid,
  token_hmac text not null unique check (token_hmac ~ '^[0-9a-f]{64}$'),
  enrolled_by text not null,
  expires_at timestamptz not null,
  revoked_at timestamptz,
  created_at timestamptz not null default now(),
  foreign key (checkpoint_id, event_id) references checkpoints (id, event_id),
  unique (id, event_id)
);

-- Interactions are append-only. The client supplies the id, so a retried upload of the
-- same scan hits the primary key and is ignored.
create table interactions (
  id uuid primary key,
  event_id uuid not null,
  checkpoint_id uuid not null,
  occurrence_id uuid not null,
  event_participant_id uuid not null,
  credential_id uuid not null,
  device_id uuid not null,
  scanned_at timestamptz not null,
  received_at timestamptz not null default now(),
  outcome text not null check (outcome in ('accepted', 'duplicate', 'rejected', 'revoked', 'outside_window')),
  reason text,
  dedupe_applies boolean not null default true,
  foreign key (event_participant_id, event_id) references event_participants (id, event_id),
  foreign key (credential_id, event_participant_id) references credentials (id, event_participant_id),
  foreign key (checkpoint_id, event_id) references checkpoints (id, event_id),
  foreign key (occurrence_id, checkpoint_id) references checkpoint_occurrences (id, checkpoint_id),
  foreign key (device_id, event_id) references scanner_devices (id, event_id)
);

-- The database decides whether duplicate prevention applies, from the checkpoint rule,
-- so a caller cannot switch it off.
create function set_dedupe_from_checkpoint_rule() returns trigger
language plpgsql as $$
declare
  rule text;
begin
  select rule_type into rule from checkpoints where id = new.checkpoint_id;
  new.dedupe_applies := rule <> 'unlimited';
  return new;
end;
$$;
create trigger interactions_set_dedupe
  before insert on interactions
  for each row execute function set_dedupe_from_checkpoint_rule();

-- At most one accepted interaction per participant per occurrence, for rules that dedupe.
-- Concurrent inserts resolve here, not in application code.
create unique index interactions_one_accepted_per_occurrence
  on interactions (occurrence_id, event_participant_id)
  where outcome = 'accepted' and dedupe_applies;

create index interactions_event_received_idx on interactions (event_id, received_at);

create table audit_log (
  id bigint generated always as identity primary key,
  occurred_at timestamptz not null default now(),
  actor text not null,
  action text not null,
  entity text not null,
  entity_id text not null,
  event_id uuid references events (id),
  details jsonb not null default '{}'
);

create function audit_log_is_append_only() returns trigger
language plpgsql as $$
begin
  raise exception 'audit_log is append-only' using errcode = 'insufficient_privilege';
end;
$$;
create trigger audit_log_no_update_delete
  before update or delete on audit_log
  for each row execute function audit_log_is_append_only();
create trigger audit_log_no_truncate
  before truncate on audit_log
  for each statement execute function audit_log_is_append_only();
