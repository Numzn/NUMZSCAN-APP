-- Staff scanning: an interaction is recorded either by a scanner device or by a signed-in staff member.
-- Before this, device_id was required, so a staff scan could not be stored. Additive: existing rows keep their device.

alter table interactions alter column device_id drop not null;
alter table interactions add column operator_user_id uuid references users (id);
alter table interactions add constraint interactions_has_recorder
  check (device_id is not null or operator_user_id is not null);
