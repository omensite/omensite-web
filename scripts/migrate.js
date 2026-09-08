import { readFile } from "node:fs/promises";
import { pathToFileURL } from "node:url";
import pg from "pg";

export function assertMigrationAllowed(env = process.env) {
  if (env.APP_ENVIRONMENT !== "production") throw new Error("Migrations are allowed only in production");
  if (env.APP_ALLOW_MIGRATIONS !== "true") throw new Error("APP_ALLOW_MIGRATIONS must be true");
  if (!env.DATABASE_URL?.trim()) throw new Error("DATABASE_URL is required");
}

export async function migrate(env = process.env) {
  assertMigrationAllowed(env);
  const pool = new pg.Pool({
    connectionString: env.DATABASE_URL,
    ssl: env.DATABASE_SSL === "require" ? { rejectUnauthorized: true } : undefined,
    max: 1,
  });
  try {
    const sql = await readFile(new URL("../migrations/001_initial.sql", import.meta.url), "utf8");
    await pool.query("BEGIN");
    await pool.query(sql);
    await pool.query("COMMIT");
  } catch (error) {
    await pool.query("ROLLBACK").catch(() => {});
    throw error;
  } finally {
    await pool.end();
  }
}

if (process.argv[1] && import.meta.url === pathToFileURL(process.argv[1]).href) {
  migrate().then(
    () => console.log("OMENSITE database migration completed"),
    (error) => { console.error(`OMENSITE database migration failed: ${error.message}`); process.exitCode = 1; },
  );
}
