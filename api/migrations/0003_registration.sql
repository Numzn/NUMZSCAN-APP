-- Registration v1: one public registration per event, its form, and the submissions it receives. Additive.
--
-- Form fields are rows, not a JSON blob. A field is archived rather than deleted, so every answer
-- keeps a snapshot of the label and type it was given (registration_answers), and a historical
-- submission can still be read after the form changes.

create table event_registrations (
  id uuid primary key default gen_random_uuid(),
  event_id uuid not null unique references events (id) on delete restrict,
  slug text not null unique check (slug ~ '^[a-z0-9]+(-[a-z0-9]+)*$' and length(slug) between 3 and 80),
  status text not null default 'draft' check (status in ('draft', 'open', 'closed')),
  opened_at timestamptz,
  closed_at timestamptz,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create table registration_fields (
  id uuid primary key default gen_random_uuid(),
  event_id uuid not null references events (id) on delete restrict,
  field_key text not null check (field_key ~ '^[a-z][a-z0-9_]{0,47}$'),
  label text not null check (length(btrim(label)) between 1 and 120),
  field_type text not null check (field_type in (
    'text', 'email', 'phone', 'number', 'date', 'dropdown', 'radio', 'checkbox', 'long_text'
  )),
  required boolean not null,
  section text check (section is null or length(btrim(section)) between 1 and 60),
  options text[] check (options is null or cardinality(options) between 2 and 50),
  -- The three fields that identify the person. They are always present, always required, and cannot be archived.
  person_field text check (person_field in ('first_name', 'last_name', 'phone')),
  position integer not null check (position >= 0),
  archived_at timestamptz,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  check ((field_type in ('dropdown', 'radio')) = (options is not null)),
  check (person_field is null or (required and field_type in ('text', 'phone'))),
  unique (id, event_id)
);
-- Keys are unique among active fields. Archived keys are never reused by the application (see the route).
create unique index registration_fields_active_key
  on registration_fields (event_id, field_key) where archived_at is null;
create unique index registration_fields_active_person
  on registration_fields (event_id, person_field) where archived_at is null and person_field is not null;
create index registration_fields_event_position_idx on registration_fields (event_id, position);

-- The identity lookup for public registration compares digits only, so a phone with and without spaces matches.
create index people_phone_digits_idx on people ((regexp_replace(coalesce(phone, ''), '[^0-9]', '', 'g')));

create table registration_submissions (
  id uuid primary key default gen_random_uuid(),
  event_id uuid not null references events (id) on delete restrict,
  event_participant_id uuid not null,
  -- Shown to the participant as the confirmation code. Crockford-style: no 0, 1, I, L, O or U.
  reference text not null unique check (reference ~ '^EP-[2-9A-HJKMNP-TV-Z]{5}$'),
  -- Set by the browser once per form, so a retried or double-clicked submit maps to one registration.
  client_request_id uuid not null,
  identity_match text not null check (identity_match in ('new', 'reused', 'ambiguous')),
  submitted_at timestamptz not null default now(),
  foreign key (event_participant_id, event_id) references event_participants (id, event_id),
  unique (event_id, client_request_id)
);
create index registration_submissions_participant_idx on registration_submissions (event_participant_id);

create table registration_answers (
  submission_id uuid not null references registration_submissions (id) on delete restrict,
  field_id uuid not null references registration_fields (id) on delete restrict,
  -- Snapshot at submission time, so the answer reads the same after the field is renamed or archived.
  field_key text not null,
  field_label text not null,
  field_type text not null,
  value text not null check (length(value) <= 4000),
  primary key (submission_id, field_key)
);
