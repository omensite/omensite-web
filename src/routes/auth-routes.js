import { Router } from "express";
import { createAuthController } from "../controllers/auth-controller.js";
import { requireCsrf } from "../security/csrf.js";

const notFound = (_req, res) => res.sendStatus(404);

export function createAuthRoutes({ authConfig, authService, sessionRegistry, logger }) {
  const router = Router();
  const authController = createAuthController({ authService, sessionRegistry, logger });

  if (authConfig.mode === "demo") {
    router.post("/login", authController.login);
    router.get("/discord", notFound);
    router.get("/discord/callback", notFound);
    router.get("/complete", notFound);
  } else {
    router.post("/login", notFound);
    router.get("/discord", authController.beginDiscord);
    router.get("/discord/callback", authController.completeDiscord);
    router.get("/complete", authController.showComplete);
  }
  router.post("/logout", requireCsrf, authController.logout);

  return router;
}
