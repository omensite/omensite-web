import { createApp } from "./app.js";
import { readAuthConfig } from "./config/auth-config.js";
import { readDatabaseConfig } from "./config/database-config.js";
import { createPostgresRuntime } from "./runtime/postgres-runtime.js";
import { createSqliteBrainRepository } from "./agent-brain/brain-repository.js";
import { createSqliteBrokerRepository } from "./brokers/broker-repository.js";

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
  brokerRepository: postgresRuntime?.brokerRepository ?? createSqliteBrokerRepository("data/robinhood.sqlite"),
  ...(postgresRuntime ? {
    sessionStore: postgresRuntime.sessionStore,
    userRepository: postgresRuntime.userRepository,
    banRepository: postgresRuntime.banRepository,
    indicatorRequestRepository: postgresRuntime.indicatorRequestRepository,
    sessionRegistry: postgresRuntime.sessionRegistry,
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
    await app.locals.robinhoodService?.close?.();
    await brainRepository.close();
    await postgresRuntime?.close();
    process.exit(0);
  });
}
