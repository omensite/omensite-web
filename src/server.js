import { createApp } from "./app.js";
import { readAuthConfig } from "./config/auth-config.js";
import { readDatabaseConfig } from "./config/database-config.js";
import { createPostgresRuntime } from "./runtime/postgres-runtime.js";

const port = process.env.PORT ?? 3000;
const host = process.env.HOST || "127.0.0.1";
const authConfig = readAuthConfig({
  env: process.env.NODE_ENV === "production"
    ? process.env
    : { AUTH_MODE: "demo", DEMO_ROLES: "Developer", ...process.env },
});
const databaseConfig = readDatabaseConfig();
const postgresRuntime = databaseConfig.configured ? createPostgresRuntime(databaseConfig) : null;
const app = createApp({
  authConfig,
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
    await postgresRuntime?.close();
    process.exit(0);
  });
}
