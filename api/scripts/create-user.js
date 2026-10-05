import pg from "pg";
import { hashPassword } from "../src/v1/security.js";

// Usage: DATABASE_URL=... EP_PASSWORD=... node scripts/create-user.js <email> "<name>" [--admin]
// The password comes from the environment or stdin, never from argv, so it stays out of shell history.
const MIN_PASSWORD_LENGTH = 12;

async function readPassword() {
  if (process.env.EP_PASSWORD) return process.env.EP_PASSWORD;
  if (process.stdin.isTTY) throw new Error("set EP_PASSWORD, or pipe the password on stdin");
  let data = "";
  for await (const chunk of process.stdin) data += chunk;
  return data.replace(/\r?\n$/, "");
}

const [email, displayName, ...flags] = process.argv.slice(2);
if (!email || !displayName) {
  console.error('usage: create-user.js <email> "<display name>" [--admin]');
  process.exit(2);
}

const password = await readPassword();
if (password.length < MIN_PASSWORD_LENGTH) {
  console.error(`password must be at least ${MIN_PASSWORD_LENGTH} characters`);
  process.exit(2);
}

const client = new pg.Client({ connectionString: process.env.DATABASE_URL });
await client.connect();
try {
  const { rows } = await client.query(
    `insert into users (email, display_name, password_hash, is_admin)
     values ($1, $2, $3, $4) returning id`,
    [email.trim().toLowerCase(), displayName.trim(), await hashPassword(password), flags.includes("--admin")]
  );
  console.log(`created user ${rows[0].id}`);
} finally {
  await client.end();
}
