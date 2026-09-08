function readValue(env, key) {
  return typeof env[key] === "string" ? env[key].trim() : "";
}

export function readDatabaseConfig({ env = process.env, nodeEnvironment = process.env.NODE_ENV } = {}) {
  const connectionString = readValue(env, "DATABASE_URL");
  if (nodeEnvironment === "production" && !connectionString) {
    throw new Error("DATABASE_URL is required in production");
  }

  const sslMode = readValue(env, "DATABASE_SSL") || "disable";
  if (!new Set(["disable", "require"]).has(sslMode)) {
    throw new Error("DATABASE_SSL must be disable or require");
  }

  return {
    configured: Boolean(connectionString),
    connectionString,
    ssl: sslMode === "require",
    toJSON() {
      return { configured: Boolean(connectionString), ssl: sslMode === "require" };
    },
  };
}
