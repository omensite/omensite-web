import { ACCESS_ERRORS } from "../models/access.js";

export const ACCESS_DENIED_MESSAGE = "ACCESS FAILED :: INSUFFICIENT PERMISSIONS";

function expectsStructuredResponse(req) {
  return req.isOmensiteFragment === true
    || req.get?.("X-Omensite-Fragment") === "1"
    || req.path?.startsWith("/api/");
}

export function requireCapability(capability) {
  return function enforceCapability(req, res, next) {
    if (req.session?.operator?.capabilities?.includes(capability)) {
      return next();
    }

    if (expectsStructuredResponse(req)) {
      return res.status(403).json({
        error: ACCESS_ERRORS.INSUFFICIENT_PERMISSIONS,
        message: ACCESS_DENIED_MESSAGE,
      });
    }

    req.session.accessNotice = ACCESS_DENIED_MESSAGE;
    return res.redirect("/home");
  };
}
