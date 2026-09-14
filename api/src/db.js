import pg from "pg";

const { Pool } = pg;

export const pool = new Pool({
  connectionString: process.env.DATABASE_URL,
  max: 5,
});

pool.on("error", (err) => {
  console.error("[db] Unexpected error on idle client", err);
});
