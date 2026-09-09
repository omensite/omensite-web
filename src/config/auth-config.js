import { MAX_ROLE_SNAPSHOT_AGE_MS, ROLES } from "../models/access.js";

const AUTH_MODES = new Set(["demo", "discord"]);
const DISCORD_KEYS = Object.freeze([
  "DISCORD_CLIENT_ID",
  "DISCORD_CLIENT_SECRET",
  "DISCORD_REDIRECT_URI",
  "DISCORD_GUILD_ID",
]);
const DISCORD_ROLE_KEYS = Object.freeze([
  "DISCORD_ROLE_DEVELOPER_ID",
  "DISCORD_ROLE_ADMIN_ID",
  "DISCORD_ROLE_OS_ID",
  "DISCORD_ROLE_INDICATORS_ID",
  "DISCORD_ROLE_JOURNAL_ID",
]);

function readValue(env, key) {
  return typeof env[key] === "string" ? env[key].trim() : "";
}

function readRoleRefreshMs(env) {
  const minutes = Number(readValue(env, "DISCORD_ROLE_REFRESH_MINUTES") || "5");
  if (!Number.isFinite(minutes) || minutes <= 0) {
    throw new Error("DISCORD_ROLE_REFRESH_MINUTES must be a positive number");
  }
  return Math.min(minutes * 60_000, MAX_ROLE_SNAPSHOT_AGE_MS);
}

function readDiscordConfig(env) {
  const accessPolicy = readValue(env, "DISCORD_ACCESS_POLICY") || "roles";
  if (!["roles", "beta-guild"].includes(accessPolicy)) {
    throw new Error("DISCORD_ACCESS_POLICY must be roles or beta-guild");
  }
  if (accessPolicy === "beta-guild" && readValue(env, "APP_ENVIRONMENT") !== "beta") {
    throw new Error("DISCORD_ACCESS_POLICY=beta-guild is only allowed with APP_ENVIRONMENT=beta");
  }
  const requiredKeys = accessPolicy === "roles" ? [...DISCORD_KEYS, ...DISCORD_ROLE_KEYS] : DISCORD_KEYS;
  const missingKeys = requiredKeys.filter((key) => !readValue(env, key));
  if (missingKeys.length > 0) {
    throw new Error(`Missing required Discord configuration: ${missingKeys.join(", ")}`);
  }

  return {
    accessPolicy,
    clientId: readValue(env, "DISCORD_CLIENT_ID"),
    clientSecret: readValue(env, "DISCORD_CLIENT_SECRET"),
    redirectUri: readValue(env, "DISCORD_REDIRECT_URI"),
    guildId: readValue(env, "DISCORD_GUILD_ID"),
    roleIds: {
      [ROLES.DEVELOPER]: readValue(env, "DISCORD_ROLE_DEVELOPER_ID"),
      [ROLES.ADMIN]: readValue(env, "DISCORD_ROLE_ADMIN_ID"),
      [ROLES.OS]: readValue(env, "DISCORD_ROLE_OS_ID"),
      [ROLES.INDICATORS]: readValue(env, "DISCORD_ROLE_INDICATORS_ID"),
      [ROLES.JOURNAL]: readValue(env, "DISCORD_ROLE_JOURNAL_ID"),
    },
  };
}

export function readAuthConfig({ env = process.env, nodeEnvironment = process.env.NODE_ENV } = {}) {
  const mode = readValue(env, "AUTH_MODE");
  if (!AUTH_MODES.has(mode)) {
    throw new Error("AUTH_MODE must be demo or discord");
  }
  if (nodeEnvironment === "production" && mode === "demo") {
    throw new Error("Discord authentication is required in production");
  }

  const sessionSecret = readValue(env, "SESSION_SECRET");
  if (nodeEnvironment === "production" && !sessionSecret) {
    throw new Error("SESSION_SECRET is required in production");
  }

  return {
    mode,
    sessionSecret,
    demoRoles: mode === "demo"
      ? readValue(env, "DEMO_ROLES").split(",").map((role) => role.trim()).filter(Boolean)
      : [],
    roleRefreshMs: readRoleRefreshMs(env),
    discord: mode === "discord" ? readDiscordConfig(env) : null,
  };
}
