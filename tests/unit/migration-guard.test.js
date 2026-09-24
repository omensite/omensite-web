import assert from "node:assert/strict";
import test from "node:test";
import { assertMigrationAllowed, migrate } from "../../scripts/migrate.js";

test("migrations require the production-only two-key guard", () => {
  assert.throws(() => assertMigrationAllowed({ APP_ENVIRONMENT: "beta", APP_ALLOW_MIGRATIONS: "true", DATABASE_URL: "postgres://db/app" }), /production/);
  assert.throws(() => assertMigrationAllowed({ APP_ENVIRONMENT: "production", APP_ALLOW_MIGRATIONS: "false", DATABASE_URL: "postgres://db/app" }), /APP_ALLOW_MIGRATIONS/);
  assert.throws(() => assertMigrationAllowed({ APP_ENVIRONMENT: "production", APP_ALLOW_MIGRATIONS: "true" }), /DATABASE_URL/);
  assert.doesNotThrow(() => assertMigrationAllowed({ APP_ENVIRONMENT: "production", APP_ALLOW_MIGRATIONS: "true", DATABASE_URL: "postgres://db/app" }));
});

test("the supported migration command installs workspace storage within the schema transaction", async () => {
  const statements = [];
  let ended = false;
  await migrate({ APP_ENVIRONMENT: "production", APP_ALLOW_MIGRATIONS: "true", DATABASE_URL: "postgres://fixture/app" }, {
    createPool: () => ({ async query(sql) { statements.push(sql); }, async end() { ended = true; } }),
  });
  assert.equal(statements[0], "BEGIN");
  assert.ok(statements.some((sql) => /CREATE TABLE IF NOT EXISTS user_workspaces/.test(sql)));
  assert.equal(statements.at(-1), "COMMIT");
  assert.equal(ended, true);
});

test("failure while creating workspace storage rolls back and closes the migration connection", async () => {
  const statements = [];
  let ended = false;
  await assert.rejects(migrate({ APP_ENVIRONMENT: "production", APP_ALLOW_MIGRATIONS: "true", DATABASE_URL: "postgres://fixture/app" }, {
    createPool: () => ({ async query(sql) { statements.push(sql); if (/CREATE TABLE IF NOT EXISTS user_workspaces/.test(sql)) throw new Error("fixture migration failure"); }, async end() { ended = true; } }),
  }), /fixture migration failure/);
  assert.equal(statements.at(-1), "ROLLBACK");
  assert.equal(statements.includes("COMMIT"), false);
  assert.equal(ended, true);
});
