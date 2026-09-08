import assert from "node:assert/strict";
import test from "node:test";
import request from "supertest";
import { createApp } from "../../src/app.js";

const proxyAuthConfig = {
  mode: "proxy", sessionSecret: "test-secret", demoRoles: [], roleRefreshMs: 300_000, discord: null,
};

test("trusted Authentik headers establish one beta session with full preview access", async () => {
  const agent = request.agent(createApp({ environment: "test", authConfig: proxyAuthConfig }));
  const response = await agent.get("/home").set({
    "X-authentik-uid": "discord-42",
    "X-authentik-username": "beta-member",
    "X-authentik-name": "Beta Member",
  }).expect(200);
  assert.match(response.text, /SESSION 01 \/ AUTHORIZED/);

  await agent.get("/admin").set("X-authentik-uid", "discord-42").expect(200);
});

test("proxy mode does not invent an identity when Authentik headers are absent", async () => {
  const app = createApp({ environment: "test", authConfig: proxyAuthConfig });
  const response = await request(app).get("/home").expect(302);
  assert.equal(response.headers.location, "/login");
});
