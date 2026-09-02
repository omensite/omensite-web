import test from "node:test";
import assert from "node:assert/strict";
import { createAuthService } from "../../src/services/auth-service.js";
import { createRolePolicy } from "../../src/services/role-policy.js";
import { createInMemoryUserRepository } from "../../src/repositories/in-memory-user-repository.js";

const rolePolicy = createRolePolicy({
  roleIds: {
    Developer: "role-dev",
    Admin: "role-admin",
    OS: "role-os",
    Indicators: "role-indicators",
    Journal: "role-journal",
  },
});
const now = () => new Date("2026-09-02T12:00:00.000Z");

test("demo authentication rejects blank credentials", async () => {
  const service = createAuthService({ mode: "demo" });

  await assert.rejects(
    () => service.authenticateDemo({ username: " ", passkey: "" }),
    { code: "CREDENTIALS_REQUIRED" },
  );
});

test("legacy authenticate retains demo login with a normalized demo ID", async () => {
  const service = createAuthService({
    mode: "demo",
    demoRoles: ["OS"],
    rolePolicy,
    now,
  });

  const operator = await service.authenticate({ username: " Local_Operator ", passkey: "preview" });

  assert.deepEqual(operator, {
    id: "demo:local_operator",
    username: "Local_Operator",
    displayName: "Local_Operator",
    avatarUrl: null,
    authMode: "demo",
    roles: ["OS"],
    capabilities: ["base"],
    rolesSyncedAt: "2026-09-02T12:00:00.000Z",
    discordAuth: null,
  });
});

test("Discord completion rejects banned users before creating an operator", async () => {
  const userRepository = createInMemoryUserRepository({ now: () => "2026-09-02T12:00:00.000Z" });
  const service = createAuthService({
    mode: "discord",
    discordProvider: {
      exchangeCode: async () => ({
        accessToken: "a",
        refreshToken: "r",
        expiresAt: "2026-09-03T12:00:00.000Z",
      }),
      getCurrentUser: async () => ({
        id: "42",
        username: "omen",
        displayName: "Omen",
        avatarUrl: null,
      }),
      getCurrentGuildMember: async () => ({ roles: ["role-os"] }),
    },
    rolePolicy,
    userRepository,
    banRepository: { isBanned: (id) => id === "42" },
    now,
  });

  await assert.rejects(() => service.completeDiscord({ code: "code" }), { code: "ACCOUNT_BANNED" });
  assert.equal(userRepository.findById("42"), null);
});

test("refresh replaces roles and capabilities from Discord membership", async () => {
  const service = createAuthService({
    mode: "discord",
    discordProvider: { getCurrentGuildMember: async () => ({ roles: ["role-os", "role-journal"] }) },
    rolePolicy,
    userRepository: createInMemoryUserRepository({ now: () => "2026-09-02T12:00:00.000Z" }),
    banRepository: { isBanned: () => false },
    now,
  });

  const refreshed = await service.refreshOperator({
    id: "42",
    username: "omen",
    displayName: "Omen",
    avatarUrl: null,
    authMode: "discord",
    roles: ["Indicators"],
    capabilities: ["indicators"],
    rolesSyncedAt: "2026-09-02T11:00:00.000Z",
    discordAuth: { accessToken: "a", refreshToken: "r", expiresAt: "2026-09-03T12:00:00.000Z" },
  });

  assert.deepEqual(refreshed.roles, ["OS", "Journal"]);
  assert.deepEqual(refreshed.capabilities, ["base", "journal"]);
});
