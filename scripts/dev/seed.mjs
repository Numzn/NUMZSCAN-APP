// Seeds the local development database: three accounts and one demo event. Safe to run again.
// Refuses to run against anything other than the local dev database.
import pg from "pg";
import { hashPassword } from "../../api/src/v1/security.js";

const url = process.env.DATABASE_URL ?? "";
const password = process.env.DEV_PASSWORD ?? "";
const dev = /^postgres(ql)?:\/\/[^@]+@127\.0\.0\.1:\d+\/numzscan_dev$/.test(url);
if (!dev) {
  console.error("refusing to seed: DATABASE_URL is not the local dev database (127.0.0.1, numzscan_dev)");
  process.exit(1);
}
if (password.length < 12) {
  console.error("DEV_PASSWORD is missing or too short; scripts/dev/up.sh writes it into .env.dev");
  process.exit(1);
}

const pool = new pg.Pool({ connectionString: url });
const hash = await hashPassword(password);

const accounts = [
  ["admin@dev.local", "Ada Admin", true, null],
  ["manager@dev.local", "Grace Manager", false, "event_manager"],
  ["staff@dev.local", "Sam Staff", false, "staff"],
];
for (const [email, name, isAdmin] of accounts) {
  await pool.query(
    "insert into users (email, display_name, password_hash, is_admin) values ($1, $2, $3, $4) on conflict (email) do nothing",
    [email, name, hash, isAdmin]
  );
}

let { rows: [event] } = await pool.query("select id from events where slug = 'demo-camp-2027'");
if (!event) {
  ({ rows: [event] } = await pool.query(
    "insert into events (slug, name, kind, timezone, starts_on, ends_on, status) values ('demo-camp-2027', 'Demo Camp 2027', 'church_camp', 'Africa/Lusaka', '2027-12-01', '2027-12-05', 'open') returning id"
  ));

  const groups = [];
  for (const [name, kind] of [["Church A", "church"], ["Dorm 1", "dorm"], ["Team Blue", "team"]]) {
    const { rows: [g] } = await pool.query("insert into groups (event_id, name, kind) values ($1, $2, $3) returning id", [event.id, name, kind]);
    groups.push(g.id);
  }

  const campers = [
    ["Michael Banda", "+260 97 123 4567", "registered"],
    ["Esther Mulenga", "+260 96 555 0101", "registered"],
    ["Joseph Tembo", "+260 97 555 0102", "checked_in"],
    ["Ruth Banda", "+260 95 555 0103", "registered"],
    ["Daniel Zulu", null, "checked_in"],
    ["Mercy Phiri", "+260 97 555 0105", "cancelled"],
    ["Peter Lungu", null, "registered"],
  ];
  for (const [i, [name, phone, status]] of campers.entries()) {
    const { rows: [person] } = await pool.query(
      "insert into people (full_name, normalized_name, phone) values ($1, $2, $3) returning id",
      [name, name.toLowerCase(), phone]
    );
    await pool.query(
      "insert into event_participants (event_id, person_id, group_id, role, status) values ($1, $2, $3, 'camper', $4)",
      [event.id, person.id, groups[i % groups.length], status]
    );
  }
  console.log("created the demo event with groups and campers");
}

const memberships = [["manager@dev.local", "event_manager"], ["staff@dev.local", "staff"]];
for (const [email, role] of memberships) {
  await pool.query(
    `insert into event_memberships (user_id, event_id, role)
     select u.id, $1, $2 from users u where u.email = $3
     on conflict (user_id, event_id) do nothing`,
    [event.id, role, email]
  );
}

console.log("dev accounts ready: admin@dev.local, manager@dev.local, staff@dev.local");
await pool.end();
