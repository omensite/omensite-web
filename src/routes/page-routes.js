import { Router } from "express";
import { createPageController } from "../controllers/page-controller.js";
import { ROUTE_BY_KEY } from "../models/navigation.js";

export function createPageRoutes() {
  const router = Router();
  const pageController = createPageController();
  for (const key of ["home", "indicators", "market-news", "alerts-ict", "alerts-sr"]) {
    router.get(ROUTE_BY_KEY[key].path, pageController.show(ROUTE_BY_KEY[key]));
  }
  return router;
}
