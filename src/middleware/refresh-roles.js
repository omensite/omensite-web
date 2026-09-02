import { ACCESS_ERRORS, MAX_ROLE_SNAPSHOT_AGE_MS } from "../models/access.js";

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

function accessError(code) {
  return Object.assign(new Error("Operator access is no longer valid"), { code });
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
    if (!operator) return next();

    async function rejectOperator(error) {
      const loginUrl = `/login?error=${loginErrorFor(error)}`;
      try {
        sessionRegistry.markRevoked?.(req.sessionID);
      } catch {
        // Cookie clearing and the live admission check remain authoritative.
      }
      delete req.session.operator;
      res.clearCookie?.("connect.sid", { path: "/" });
      try {
        await destroySession(req.session);
        try {
          sessionRegistry.unregister(operator.id, req.sessionID);
        } catch {
          // The backing session is already gone.
        }
      } catch {
        // Keep the revoked SID indexed so a later request can retry destruction.
      }

      if (expectsStructuredResponse(req)) {
        return res.status(401).json({ error: ACCESS_ERRORS.AUTH_REQUIRED, loginUrl });
      }
      return res.redirect(loginUrl);
    }

    try {
      authService.assertOperatorAdmission?.(operator);
      if (sessionRegistry.isRevoked?.(req.sessionID)) {
        throw accessError("ACCESS_REVOKED");
      }
    } catch (error) {
      return rejectOperator(error);
    }

    if (!needsRefresh(operator, Math.min(refreshAfterMs, MAX_ROLE_SNAPSHOT_AGE_MS), now)) {
      return next();
    }

    try {
      const refreshedOperator = await authService.refreshOperator(operator);
      authService.assertOperatorAdmission?.(refreshedOperator);
      if (sessionRegistry.isRevoked?.(req.sessionID)) {
        throw accessError("ACCESS_REVOKED");
      }
      req.session.operator = refreshedOperator;
      return next();
    } catch (error) {
      return rejectOperator(error);
    }
  };
}
