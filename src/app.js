import express from "express";
import session from "express-session";
import { fileURLToPath } from "node:url";
import path from "node:path";
import { createAuthService } from "./services/auth-service.js";
import { requireAuth } from "./middleware/require-auth.js";
import { fragmentRequest } from "./middleware/fragment-request.js";
import { createAuthRoutes } from "./routes/auth-routes.js";
import { createPageRoutes } from "./routes/page-routes.js";
import { createJournalRoutes } from "./routes/journal-routes.js";
import { createMarketNewsService } from "./services/market-news-service.js";
import { createTradingEconomicsCalendarProvider } from "./providers/trading-economics-calendar-provider.js";

const sourceDirectory = path.dirname(fileURLToPath(import.meta.url));

export function createApp({
  sessionSecret,
  sessionStore,
  environment = process.env.NODE_ENV ?? "development",
  trustProxy,
  authService = createAuthService(),
  marketNewsService = createMarketNewsService({
    provider: createTradingEconomicsCalendarProvider(),
  }),
  configureRoutes,
  logger = console,
} = {}) {
  const secret = sessionSecret ?? process.env.SESSION_SECRET;
  if (!secret && environment === "production") {
    throw new Error("SESSION_SECRET is required in production");
  }
  if (!sessionStore && environment === "production") {
    throw new Error("sessionStore is required in production");
  }

  const app = express();
  app.set("trust proxy", trustProxy ?? (environment === "production" ? 1 : false));
  app.set("view engine", "ejs");
  app.set("views", path.join(sourceDirectory, "..", "views"));
  app.use(express.json());
  app.use(express.urlencoded({ extended: false }));
  app.use(express.static(path.join(sourceDirectory, "..", "public")));
  app.use(session({
    ...(sessionStore ? { store: sessionStore } : {}),
    secret: secret ?? "omensite-local-development-secret",
    resave: false,
    saveUninitialized: false,
    cookie: {
      httpOnly: true,
      sameSite: "lax",
      secure: environment === "production",
    },
  }));

  app.use(fragmentRequest);
  app.get("/", (req, res) => res.redirect(req.session.operator ? "/home" : "/login"));
  app.get("/login", (req, res) => req.session.operator ? res.redirect("/home") : res.render("layouts/login"));
  app.use("/auth", createAuthRoutes({ authService }));
  configureRoutes?.(app);
  app.use(requireAuth, createPageRoutes({ marketNewsService, logger }));
  app.use(requireAuth, createJournalRoutes());

  app.use((req, res) => res.status(404).render("pages/error", {
    fragment: req.isOmensiteFragment, status: 404, heading: "ROUTE NOT FOUND",
    message: "REQUESTED COORDINATE DOES NOT EXIST",
  }));
  app.use((error, req, res, next) => {
    logger.error?.(error);
    if (res.headersSent) return next(error);
    res.status(500).render("pages/error", {
      fragment: req.isOmensiteFragment, status: 500, heading: "INTERNAL TERMINAL ERROR",
      message: "SERVER FAULT CONTAINED :: TRY AGAIN",
    });
  });

  return app;
}
