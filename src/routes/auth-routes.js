import { Router } from "express";
import { createAuthController } from "../controllers/auth-controller.js";

export function createAuthRoutes({ authService }) {
  const router = Router();
  const authController = createAuthController({ authService });

  router.post("/login", authController.login);
  router.post("/logout", authController.logout);

  return router;
}
