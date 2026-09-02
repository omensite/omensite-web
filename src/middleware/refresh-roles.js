import { ACCESS_ERRORS } from "../models/access.js";

function currentTime(now) {
  const value = now();
  return value instanceof Date ? value.getTime() : new Date(value).getTime();
}

function needsRefresh(operator, refreshAfterMs, now) {
  if (operator.authMode !== "discord") return false;
  const syncedAt = new Date(operator.rolesSyncedAt).getTime();
  return !Number.isFinite(syncedAt) || currentTime(now) - syncedAt >= refreshAfterMs;
}

function loginErrorFor(error) {
  if (error?.code === "ACCESS_REVOKED") return "access_revoked";
  if (error?.code === ACCESS_ERRORS.ACCOUNT_BANNED) return "account_banned";
  return "role_sync_failed";
}

function destroySession(session) {
  return new Promise((resolve, reject) => {
    session.destroy((error) => error ? reject(error) : resolve());
  });
}

function expectsStructuredResponse(req) {
  return req.isOmensiteFragment === true
    || req.get?.("X-Omensite-Fragment") === "1"
    || req.path?.startsWith("/api/");
}

export function createRefreshRoles({
  authService,
  refreshAfterMs,
  sessionRegistry,
  now = () => new Date(),
}) {
  return async function refreshRoles(req, res, next) {
    const operator = req.session?.operator;
    if (!operator || !needsRefresh(operator, refreshAfterMs, now)) {
      return next();
    }

    try {
      req.session.operator = await authService.refreshOperator(operator);
      return next();
    } catch (error) {
      const loginUrl = `/login?error=${loginErrorFor(error)}`;
      try {
        sessionRegistry.unregister(operator.id, req.sessionID);
      } catch {
        // Session destruction remains authoritative if registry bookkeeping fails.
      }
      delete req.session.operator;
      try {
        await destroySession(req.session);
      } catch (destroyError) {
        return next(destroyError);
      }

      if (expectsStructuredResponse(req)) {
        return res.status(401).json({ error: ACCESS_ERRORS.AUTH_REQUIRED, loginUrl });
      }
      return res.redirect(loginUrl);
    }
  };
}
