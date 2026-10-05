-- EventPass identity and access: users, event memberships, sessions. Additive.

create table users (
  id uuid primary key default gen_random_uuid(),
  email text not null unique
    check (email = lower(btrim(email)) and email ~ '^[^@[:space:]]+@[^@[:space:]]+$'),
  display_name text not null check (length(btrim(display_name)) > 0),
  password_hash text not null check (password_hash like 'scrypt$%'),
  is_admin boolean not null default false,
  is_active boolean not null default true,
  created_at timestamptz not null default now(),
  last_login_at timestamptz
);

create table event_memberships (
  user_id uuid not null references users (id) on delete restrict,
  event_id uuid not null references events (id) on delete restrict,
  role text not null check (role in ('event_manager', 'staff')),
  created_at timestamptz not null default now(),
  primary key (user_id, event_id)
);
create index event_memberships_event_idx on event_memberships (event_id);

-- The primary key is the SHA-256 of the session secret. The secret itself is only
-- ever held by the browser, in an HttpOnly cookie.
create table sessions (
  id text primary key check (id ~ '^[0-9a-f]{64}$'),
  user_id uuid not null references users (id) on delete cascade,
  created_at timestamptz not null default now(),
  last_used_at timestamptz not null default now(),
  expires_at timestamptz not null,
  revoked_at timestamptz,
  check (expires_at > created_at)
);
create index sessions_user_idx on sessions (user_id);

alter table scanner_devices add column last_used_at timestamptz;

-- Optional credential expiry. Null means the credential does not expire.
alter table credentials add column expires_at timestamptz;
alter table credentials add constraint credentials_expiry_after_issue
  check (expires_at is null or expires_at > issued_at);
