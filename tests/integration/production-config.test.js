import assert from "node:assert/strict";
import test from "node:test";
import session from "express-session";
import request from "supertest";
import { createApp } from "../../src/app.js";
import { createDemoAuthConfig, createDiscordAuthConfig } from "../helpers/auth-test-helpers.js";

test("production rejects explicitly configured demo authentication", () => {
  assert.throws(
    () => createApp({ environment: "production", authConfig: createDemoAuthConfig(), sessionStore: new session.MemoryStore() }),
    /Discord authentication is required in production/,
  );
});

test("production still requires an explicitly injected session store", () => {
  assert.throws(
    () => createApp({ environment: "production", authConfig: createDiscordAuthConfig() }),
    /sessionStore is required in production/,
  );
});

test("createApp retains an explicit MemoryStore for session invalidation", () => {
  const defaultStoreApp = createApp({ environment: "test", authConfig: createDemoAuthConfig() });
  assert.ok(defaultStoreApp.locals.sessionStore instanceof session.MemoryStore);

  const injectedStore = new session.MemoryStore();
  const injectedStoreApp = createApp({ environment: "test", authConfig: createDemoAuthConfig(), sessionStore: injectedStore });
  assert.equal(injectedStoreApp.locals.sessionStore, injectedStore);
});

test("production config trusts the configured proxy and emits HTTPS-only session cookies", async () => {
  const app = createApp({
    environment: "production",
    authConfig: createDiscordAuthConfig(),
    authService: { beginDiscord: () => ({ state: "state", authorizationUrl: "/provider" }) },
    sessionStore: new session.MemoryStore(),
    trustProxy: 1,
  });

  assert.equal(app.get("trust proxy"), 1);
  const response = await request(app).get("/auth/discord").set("X-Forwarded-Proto", "https").expect(302);
  assert.match(response.headers["set-cookie"][0], /Secure/);
});
