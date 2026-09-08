import assert from "node:assert/strict";
import session from "express-session";
import test from "node:test";
import { createPostgresRuntime } from "../../src/runtime/postgres-runtime.js";

test("PostgreSQL runtime supplies durable sessions, readiness, and clean shutdown", async () => {
  let closed = false;
  const pool = {
    query: async () => ({ rows: [{ ready: 1 }] }),
    end: async () => { closed = true; },
  };
  const runtime = createPostgresRuntime(
    { configured: true, connectionString: "postgres://db/app", ssl: false },
    { pool },
  );

  assert.ok(runtime.sessionStore instanceof session.Store);
  assert.equal(await runtime.readinessCheck(), true);
  await runtime.close();
  assert.equal(closed, true);
});

test("PostgreSQL runtime rejects missing configuration", () => {
  assert.throws(() => createPostgresRuntime({ configured: false }), /configured database/);
});
