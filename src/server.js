import { createApp } from "./app.js";
import { readAuthConfig } from "./config/auth-config.js";
import { readDatabaseConfig } from "./config/database-config.js";
import { createPostgresRuntime } from "./runtime/postgres-runtime.js";
import { createSqliteBrainRepository } from "./agent-brain/brain-repository.js";

const port = process.env.PORT ?? 3000;
const host = process.env.HOST || "127.0.0.1";
const authConfig = readAuthConfig();
const databaseConfig = readDatabaseConfig();
const postgresRuntime = databaseConfig.configured ? createPostgresRuntime(databaseConfig) : null;
const brainRepository = postgresRuntime?.brainRepository ?? createSqliteBrainRepository({
  filename: process.env.BRAIN_DB_PATH?.trim() || "data/agent-brain.sqlite",
});
const app = createApp({
  authConfig,
  brainRepository,
  ...(postgresRuntime ? {
    sessionStore: postgresRuntime.sessionStore,
    journalRepository: postgresRuntime.journalRepository,
    readinessCheck: postgresRuntime.readinessCheck,
  } : {}),
});

app.listen(port, host, () => {
  console.log(`OMENSITE listening on http://${host}:${port}`);
});

for (const signal of ["SIGINT", "SIGTERM"]) {
  process.once(signal, async () => {
    await app.locals.brainService?.close?.();
    await brainRepository.close();
    await postgresRuntime?.close();
    process.exit(0);
  });
}
