import session from "express-session";
import connectPgSimple from "connect-pg-simple";
import pg from "pg";

export function createPostgresRuntime(databaseConfig, { pool: suppliedPool } = {}) {
  if (!databaseConfig?.configured) {
    throw new Error("PostgreSQL runtime requires a configured database");
  }

  const pool = suppliedPool ?? new pg.Pool({
    connectionString: databaseConfig.connectionString,
    max: Number(process.env.DATABASE_POOL_MAX || 10),
    idleTimeoutMillis: 30_000,
    connectionTimeoutMillis: 5_000,
    ssl: databaseConfig.ssl ? { rejectUnauthorized: true } : undefined,
  });
  const PgSessionStore = connectPgSimple(session);
  const sessionStore = new PgSessionStore({
    pool,
    tableName: "user_sessions",
    createTableIfMissing: true,
    pruneSessionInterval: 15 * 60,
  });

  return {
    pool,
    sessionStore,
    readinessCheck: async () => {
      const result = await pool.query("SELECT 1 AS ready");
      return result.rows[0]?.ready === 1;
    },
    close: () => pool.end(),
  };
}
