import assert from "node:assert/strict";
import request from "supertest";
import { createApp } from "../../src/app.js";

export const TEST_ROLE_IDS = Object.freeze({
  Developer: "role-dev",
  Admin: "role-admin",
  OS: "role-os",
  Indicators: "role-indicators",
  Journal: "role-journal",
});

export function createDemoAuthConfig(demoRoles = ["Developer"]) {
  return { mode: "demo", sessionSecret: "test-secret", demoRoles, roleRefreshMs: 300_000, discord: null };
}

export function createDiscordAuthConfig(overrides = {}) {
  return {
    mode: "discord", sessionSecret: "test-secret", demoRoles: [], roleRefreshMs: 300_000,
    discord: {
      clientId: "client", clientSecret: "secret", redirectUri: "http://localhost/auth/discord/callback", guildId: "guild",
      roleIds: TEST_ROLE_IDS, ...overrides,
    },
  };
}

export function createTestApp({ authMode = "demo", demoRoles = ["Developer"], discord = {}, ...appOptions } = {}) {
  const authConfig = authMode === "discord" ? createDiscordAuthConfig(discord) : createDemoAuthConfig(demoRoles);
  return createApp({ environment: "test", sessionSecret: "test-secret", authConfig, ...appOptions });
}

export async function loginDemo(app, { username = "operator", passkey = "preview" } = {}) {
  const agent = request.agent(app);
  await agent.post("/auth/login").send({ username, passkey }).expect(200);
  return agent;
}

export async function readCsrfToken(agent, path) {
  const response = await agent.get(path).expect(200);
  const match = response.text.match(/<meta name="csrf-token" content="([^"]+)">/);
  assert.ok(match, "expected a CSRF metadata token");
  return match[1];
}
