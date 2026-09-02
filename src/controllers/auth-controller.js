import { ensureCsrfToken } from "../security/csrf.js";

function regenerateSession(req) {
  return new Promise((resolve, reject) => {
    req.session.regenerate((error) => error ? reject(error) : resolve());
  });
}

function destroySession(req) {
  return new Promise((resolve, reject) => {
    req.session.destroy((error) => error ? reject(error) : resolve());
  });
}

function saveSession(req) {
  return new Promise((resolve, reject) => {
    req.session.save((error) => error ? reject(error) : resolve());
  });
}

const LOGIN_FAILURES = Object.freeze({
  ACCOUNT_BANNED: Object.freeze({ status: 403, message: "ACCESS FAILED :: ACCOUNT BANNED" }),
  ACCESS_REVOKED: Object.freeze({ status: 403, message: "ACCESS FAILED :: REQUIRED ROLE NOT PRESENT" }),
});

function discordFailureLocation(error) {
  if (error?.code === "ACCOUNT_BANNED") return "/login?error=account_banned";
  if (error?.code === "ACCESS_REVOKED") return "/login?error=access_revoked";
  if ([
    "DISCORD_HTTP_ERROR",
    "DISCORD_TIMEOUT",
    "DISCORD_REQUEST_FAILED",
    "DISCORD_INVALID_RESPONSE",
  ].includes(error?.code)) return "/login?error=discord_auth_failed";
  return null;
}

export function createAuthController({ authService, sessionRegistry, logger = console }) {
  async function establishOperator(req, operator, { complete = false } = {}) {
    const previousOperator = req.session.operator;
    const previousSessionId = req.sessionID;
    await regenerateSession(req);
    if (previousOperator?.id) {
      sessionRegistry.unregister(previousOperator.id, previousSessionId);
    }
    try {
      authService.assertOperatorAdmission?.(operator);
    } catch (error) {
      try {
        await destroySession(req);
      } catch {
        // The admission failure is authoritative and safe to report.
      }
      throw error;
    }
    req.session.operator = operator;
    req.session.authComplete = complete;
    ensureCsrfToken(req);
    sessionRegistry.register(operator.id, req.sessionID);
  }

  return {
    async login(req, res, next) {
      try {
        const authenticate = authService.authenticateDemo ?? authService.authenticate;
        const operator = await authenticate(req.body ?? {});
        await establishOperator(req, operator);
        return res.json({ ok: true, redirectTo: "/home" });
      } catch (error) {
        if (error.code === "CREDENTIALS_REQUIRED") {
          return res.status(400).json({ error: error.code });
        }
        const failure = LOGIN_FAILURES[error.code];
        if (failure) {
          return res.status(failure.status).json({
            ok: false,
            error: error.code,
            message: failure.message,
          });
        }
        return next(error);
      }
    },

    beginDiscord(req, res, next) {
      try {
        const { state, authorizationUrl } = authService.beginDiscord();
        req.session.oauthState = state;
        return res.redirect(authorizationUrl);
      } catch (error) {
        return next(error);
      }
    },

    async completeDiscord(req, res, next) {
      const expectedState = req.session.oauthState;
      delete req.session.oauthState;
      if (expectedState) await saveSession(req);
      const suppliedState = typeof req.query.state === "string" ? req.query.state : "";
      if (!expectedState || suppliedState !== expectedState) {
        return res.redirect("/login?error=invalid_oauth_state");
      }

      const code = typeof req.query.code === "string" ? req.query.code : "";
      if (!code) return res.redirect("/login?error=discord_auth_failed");

      try {
        const operator = await authService.completeDiscord({ code });
        await establishOperator(req, operator, { complete: true });
        return res.redirect("/auth/complete");
      } catch (error) {
        const location = discordFailureLocation(error);
        if (!location) return next(error);
        logger.warn?.("Discord OAuth callback failed", { code: error.code });
        return res.redirect(location);
      }
    },

    showComplete(req, res) {
      if (!req.session.operator) return res.redirect("/login");
      if (!req.session.authComplete) return res.redirect("/home");
      delete req.session.authComplete;
      return res.render("layouts/login", { authMode: "discord", complete: true, authError: null });
    },

    async logout(req, res, next) {
      const operator = req.session.operator;
      const sessionId = req.sessionID;
      try {
        try {
          sessionRegistry.markRevoked?.(sessionId);
        } catch {
          // Cookie clearing and session destruction remain authoritative.
        }
        delete req.session.operator;
        res.clearCookie("connect.sid", { path: "/" });
        try {
          await authService.revokeOperatorToken?.(operator);
        } catch {
          // Local logout must not depend on provider availability.
        }
        await destroySession(req);
        try {
          if (operator?.id) sessionRegistry.unregister(operator.id, sessionId);
        } catch {
          // The backing session is already gone.
        }
        return res.json({ ok: true, redirectTo: "/login" });
      } catch (error) {
        return next(error);
      }
    },
  };
}
