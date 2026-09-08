import { ensureCsrfToken } from "../security/csrf.js";
import { CAPABILITIES, ROLES } from "../models/access.js";

function header(req, name, fallback = "") {
  const value = req.get?.(name);
  return typeof value === "string" && value.trim() ? value.trim().slice(0, 256) : fallback;
}

export function createProxyAuth({ userRepository, sessionRegistry, now = () => new Date() }) {
  return function proxyAuth(req, res, next) {
    const id = header(req, "X-authentik-uid");
    if (!id) return next();
    const username = header(req, "X-authentik-username", id);
    const displayName = header(req, "X-authentik-name", username);
    const timestamp = now().toISOString();
    const operator = {
      id,
      username,
      displayName,
      avatarUrl: null,
      authMode: "proxy",
      roles: [ROLES.DEVELOPER],
      capabilities: Object.values(CAPABILITIES),
      rolesSyncedAt: timestamp,
      lastSignedInAt: req.session.operator?.lastSignedInAt ?? timestamp,
      discordAuth: null,
    };
    req.session.operator = operator;
    ensureCsrfToken(req);
    userRepository.upsert({ ...operator, discordAuth: undefined });
    sessionRegistry.register(operator.id, req.sessionID);
    return next();
  };
}
