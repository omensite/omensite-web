import { ROLES } from "../models/access.js";

const AUTH_MODES = new Set(["demo", "discord"]);
const DISCORD_KEYS = Object.freeze([
  "DISCORD_CLIENT_ID",
  "DISCORD_CLIENT_SECRET",
  "DISCORD_REDIRECT_URI",
  "DISCORD_GUILD_ID",
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
  return minutes * 60_000;
}

function readDiscordConfig(env) {
  const missingKeys = DISCORD_KEYS.filter((key) => !readValue(env, key));
  if (missingKeys.length > 0) {
    throw new Error(`Missing required Discord configuration: ${missingKeys.join(", ")}`);
  }

  return {
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
    throw new Error("AUTH_MODE must be either demo or discord");
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
