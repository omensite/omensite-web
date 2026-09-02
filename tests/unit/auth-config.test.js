import test from "node:test";
import assert from "node:assert/strict";
import { readAuthConfig } from "../../src/config/auth-config.js";

const discordEnvironment = {
  AUTH_MODE: "discord",
  SESSION_SECRET: "test-secret",
  DISCORD_CLIENT_ID: "client-id",
  DISCORD_CLIENT_SECRET: "client-secret",
  DISCORD_REDIRECT_URI: "http://localhost/auth/discord/callback",
  DISCORD_GUILD_ID: "guild-id",
  DISCORD_ROLE_DEVELOPER_ID: "developer-id",
  DISCORD_ROLE_ADMIN_ID: "admin-id",
  DISCORD_ROLE_OS_ID: "os-id",
  DISCORD_ROLE_INDICATORS_ID: "indicators-id",
  DISCORD_ROLE_JOURNAL_ID: "journal-id",
};

test("demo configuration parses roles and refresh minutes", () => {
  const config = readAuthConfig({
    env: { AUTH_MODE: "demo", SESSION_SECRET: "test-secret", DEMO_ROLES: "OS, Indicators,Journal", DISCORD_ROLE_REFRESH_MINUTES: "5" },
    nodeEnvironment: "development",
  });

  assert.equal(config.mode, "demo");
  assert.deepEqual(config.demoRoles, ["OS", "Indicators", "Journal"]);
  assert.equal(config.roleRefreshMs, 300_000);
});

test("production rejects demo mode", () => {
  assert.throws(() => readAuthConfig({
    env: { AUTH_MODE: "demo", SESSION_SECRET: "test-secret" },
    nodeEnvironment: "production",
  }), /Discord authentication is required in production/);
});

test("discord mode reports every missing required value", () => {
  assert.throws(() => readAuthConfig({
    env: { AUTH_MODE: "discord", SESSION_SECRET: "test-secret" },
    nodeEnvironment: "development",
  }), /DISCORD_CLIENT_ID.*DISCORD_CLIENT_SECRET.*DISCORD_GUILD_ID/s);
});

test("production requires a nonblank session secret", () => {
  assert.throws(() => readAuthConfig({
    env: { ...discordEnvironment, SESSION_SECRET: " " },
    nodeEnvironment: "production",
  }), /SESSION_SECRET is required in production/);
});

test("configuration rejects unsupported authentication modes", () => {
  assert.throws(() => readAuthConfig({
    env: { AUTH_MODE: "local" },
    nodeEnvironment: "development",
  }), /AUTH_MODE must be either demo or discord/);
});

test("configuration rejects a nonpositive role refresh interval", () => {
  assert.throws(() => readAuthConfig({
    env: { AUTH_MODE: "demo", DISCORD_ROLE_REFRESH_MINUTES: "0" },
    nodeEnvironment: "development",
  }), /DISCORD_ROLE_REFRESH_MINUTES must be a positive number/);
});

test("discord configuration maps all required values", () => {
  const config = readAuthConfig({ env: discordEnvironment, nodeEnvironment: "production" });

  assert.deepEqual(config, {
    mode: "discord",
    sessionSecret: "test-secret",
    demoRoles: [],
    roleRefreshMs: 300_000,
    discord: {
      clientId: "client-id",
      clientSecret: "client-secret",
      redirectUri: "http://localhost/auth/discord/callback",
      guildId: "guild-id",
      roleIds: {
        Developer: "developer-id",
        Admin: "admin-id",
        OS: "os-id",
        Indicators: "indicators-id",
        Journal: "journal-id",
      },
    },
  });
});
