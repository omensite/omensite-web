import session from "express-session";
import connectPgSimple from "connect-pg-simple";
import pg from "pg";
import { createPostgresJournalRepository } from "../repositories/postgres-journal-repository.js";
import { createPostgresBrainRepository } from "../agent-brain/brain-repository.js";

export function createPostgresRuntime(databaseConfig) {
  if (!databaseConfig?.configured) throw new Error("PostgreSQL runtime requires a configured database");
  const pool = new pg.Pool({
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
    createTableIfMissing: false,
    pruneSessionInterval: 15 * 60,
  });
  return {
    pool,
    sessionStore,
    journalRepository: createPostgresJournalRepository(pool),
    brainRepository: createPostgresBrainRepository(pool),
    readinessCheck: async () => {
      const result = await pool.query("SELECT 1 AS ready");
      return result.rows[0]?.ready === 1;
    },
    close: () => pool.end(),
  };
}
