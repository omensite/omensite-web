import { randomUUID } from "node:crypto";
import { ACCESS_ERRORS } from "../models/access.js";
import { createRolePolicy } from "./role-policy.js";

function createAuthError(code, message) {
  const error = new Error(message);
  error.code = code;
  return error;
}

function toIsoTimestamp(value) {
  const date = value instanceof Date ? value : new Date(value);
  return date.toISOString();
}

function isExpired(expiresAt, now) {
  const expiry = new Date(expiresAt).getTime();
  const currentValue = now();
  const current = currentValue instanceof Date ? currentValue.getTime() : new Date(currentValue).getTime();
  return Number.isFinite(expiry) && expiry <= current;
}

export function createAuthService({
  mode = "demo",
  demoRoles = [],
  discordProvider,
  rolePolicy = createRolePolicy({ roleIds: {} }),
  userRepository = { upsert: (record) => record },
  banRepository = { isBanned: () => false },
  now = () => new Date(),
} = {}) {
  function buildOperator({ identity, authMode, roles, capabilities, discordAuth }) {
    return {
      id: identity.id,
      username: identity.username,
      displayName: identity.displayName,
      avatarUrl: identity.avatarUrl,
      authMode,
      roles,
      capabilities,
      rolesSyncedAt: toIsoTimestamp(now()),
      discordAuth,
    };
  }

  function persistSafeSnapshot(operator) {
    const { discordAuth: _discordAuth, ...snapshot } = operator;
    userRepository.upsert(snapshot);
  }

  function rejectIfBanned(id) {
    if (banRepository.isBanned(id)) {
      throw createAuthError(ACCESS_ERRORS.ACCOUNT_BANNED, "This account is not permitted to sign in");
    }
  }

  function rejectIfNoBaseAccess(access) {
    if (!rolePolicy.hasBaseAccess(access)) {
      throw createAuthError("ACCESS_REVOKED", "This account no longer has access");
    }
  }

  async function authenticateDemo({ username = "", passkey = "" } = {}) {
    const normalizedUsername = username.trim();
    if (!normalizedUsername || !passkey.trim()) {
      throw createAuthError("CREDENTIALS_REQUIRED", "Credentials required");
    }

    rejectIfBanned(`demo:${normalizedUsername.toLowerCase()}`);
    const access = rolePolicy.fromRoleNames(demoRoles);
    const operator = buildOperator({
      identity: {
        id: `demo:${normalizedUsername.toLowerCase()}`,
        username: normalizedUsername,
        displayName: normalizedUsername,
        avatarUrl: null,
      },
      authMode: "demo",
      roles: access.roles,
      capabilities: access.capabilities,
      discordAuth: null,
    });
    persistSafeSnapshot(operator);
    return operator;
  }

  function beginDiscord() {
    const state = randomUUID();
    return { state, authorizationUrl: discordProvider.buildAuthorizationUrl({ state }) };
  }

  async function completeDiscord({ code } = {}) {
    const discordAuth = await discordProvider.exchangeCode({ code });
    const [identity, member] = await Promise.all([
      discordProvider.getCurrentUser({ accessToken: discordAuth.accessToken }),
      discordProvider.getCurrentGuildMember({ accessToken: discordAuth.accessToken }),
    ]);
    rejectIfBanned(identity.id);

    const access = rolePolicy.fromDiscordRoleIds(member.roles);
    rejectIfNoBaseAccess(access);
    const operator = buildOperator({
      identity,
      authMode: "discord",
      roles: access.roles,
      capabilities: access.capabilities,
      discordAuth,
    });
    persistSafeSnapshot(operator);
    return operator;
  }

  async function refreshOperator(operator) {
    rejectIfBanned(operator.id);
    let discordAuth = operator.discordAuth;
    if (isExpired(discordAuth?.expiresAt, now)) {
      discordAuth = await discordProvider.refreshAccessToken({ refreshToken: discordAuth.refreshToken });
    }

    const member = await discordProvider.getCurrentGuildMember({ accessToken: discordAuth?.accessToken });
    const access = rolePolicy.fromDiscordRoleIds(member.roles);
    rejectIfNoBaseAccess(access);
    const refreshed = buildOperator({
      identity: {
        id: operator.id,
        username: operator.username,
        displayName: operator.displayName,
        avatarUrl: operator.avatarUrl,
      },
      authMode: "discord",
      roles: access.roles,
      capabilities: access.capabilities,
      discordAuth,
    });
    persistSafeSnapshot(refreshed);
    return refreshed;
  }

  async function revokeOperatorToken(operator) {
    if (operator?.discordAuth?.accessToken) {
      await discordProvider.revokeToken({ token: operator.discordAuth.accessToken });
    }
  }

  return {
    authenticateDemo,
    authenticate: authenticateDemo,
    beginDiscord,
    completeDiscord,
    refreshOperator,
    revokeOperatorToken,
  };
}
