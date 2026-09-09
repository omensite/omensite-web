import { Router } from "express";
import { createAuthController } from "../controllers/auth-controller.js";
import { requireCsrf } from "../security/csrf.js";

const notFound = (_req, res) => res.sendStatus(404);

export function createAuthRoutes({ authConfig, authService, sessionRegistry, logger }) {
  const router = Router();
  const authController = createAuthController({ authService, sessionRegistry, logger });
  router.use((_req, res, next) => {
    res.set("Cache-Control", "no-store");
    res.set("Referrer-Policy", "no-referrer");
    next();
  });

  if (authConfig.mode === "demo") {
    router.post("/login", authController.login);
    router.get("/discord", notFound);
    router.get("/discord/callback", notFound);
    router.get("/complete", notFound);
  } else if (authConfig.mode === "discord") {
    router.post("/login", notFound);
    router.get("/discord", authController.beginDiscord);
    router.get("/discord/callback", authController.completeDiscord);
    router.get("/discord/status", authController.popupStatus);
    router.get("/discord/popup-complete", authController.showPopupComplete);
    router.get("/complete", authController.showComplete);
  } else {
    router.post("/login", notFound);
    router.get("/discord", notFound);
    router.get("/discord/callback", notFound);
    router.get("/complete", notFound);
  }
  router.post("/logout", requireCsrf, authController.logout);

  return router;
}
