import { Router } from "express";
import { createMarketNewsController } from "../controllers/market-news-controller.js";
import { createPageController } from "../controllers/page-controller.js";
import { ROUTE_BY_KEY } from "../models/navigation.js";

export function createPageRoutes({ marketNewsService, logger } = {}) {
  const router = Router();
  const pageController = createPageController();
  for (const key of ["home", "indicators", "alerts-ict", "alerts-sr"]) {
    router.get(ROUTE_BY_KEY[key].path, pageController.show(ROUTE_BY_KEY[key]));
  }
  const marketNews = createMarketNewsController({ marketNewsService, logger });
  router.get(ROUTE_BY_KEY["market-news"].path, marketNews.show(ROUTE_BY_KEY["market-news"]));
  router.get("/api/market-news/events", marketNews.events);
  return router;
}
