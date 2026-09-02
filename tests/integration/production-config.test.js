import assert from "node:assert/strict";
import test from "node:test";
import session from "express-session";
import request from "supertest";
import { createApp } from "../../src/app.js";

test("production requires an explicitly injected session store", () => {
  assert.throws(
    () => createApp({ environment: "production", sessionSecret: "test-secret" }),
    /sessionStore is required in production/,
  );
});

test("production config trusts the configured proxy and emits HTTPS-only session cookies", async () => {
  const app = createApp({
    environment: "production",
    sessionSecret: "test-secret",
    sessionStore: new session.MemoryStore(),
    trustProxy: 1,
  });

  assert.equal(app.get("trust proxy"), 1);
  const response = await request(app)
    .post("/auth/login")
    .set("X-Forwarded-Proto", "https")
    .send({ username: "operator", passkey: "preview" })
    .expect(200);
  assert.match(response.headers["set-cookie"][0], /Secure/);
});
