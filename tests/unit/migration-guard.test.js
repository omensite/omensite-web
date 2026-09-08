import assert from "node:assert/strict";
import test from "node:test";
import { assertMigrationAllowed } from "../../scripts/migrate.js";

test("migrations require the production-only two-key guard", () => {
  assert.throws(() => assertMigrationAllowed({ APP_ENVIRONMENT: "beta", APP_ALLOW_MIGRATIONS: "true", DATABASE_URL: "postgres://db/app" }), /production/);
  assert.throws(() => assertMigrationAllowed({ APP_ENVIRONMENT: "production", APP_ALLOW_MIGRATIONS: "false", DATABASE_URL: "postgres://db/app" }), /APP_ALLOW_MIGRATIONS/);
  assert.throws(() => assertMigrationAllowed({ APP_ENVIRONMENT: "production", APP_ALLOW_MIGRATIONS: "true" }), /DATABASE_URL/);
  assert.doesNotThrow(() => assertMigrationAllowed({ APP_ENVIRONMENT: "production", APP_ALLOW_MIGRATIONS: "true", DATABASE_URL: "postgres://db/app" }));
});
