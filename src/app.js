import express from "express";
import session from "express-session";
import { fileURLToPath } from "node:url";
import path from "node:path";
import { createDiscordOAuthProvider } from "./providers/discord-oauth-provider.js";
import { createInMemoryBanRepository } from "./repositories/in-memory-ban-repository.js";
import { createInMemorySessionRegistry } from "./repositories/in-memory-session-registry.js";
import { createInMemoryUserRepository } from "./repositories/in-memory-user-repository.js";
import { createAuthService } from "./services/auth-service.js";
import { createRolePolicy } from "./services/role-policy.js";
import { ensureCsrfToken } from "./security/csrf.js";
import { requireAuth } from "./middleware/require-auth.js";
import { createRefreshRoles } from "./middleware/refresh-roles.js";
import { fragmentRequest } from "./middleware/fragment-request.js";
import { createAuthRoutes } from "./routes/auth-routes.js";
import { createPageRoutes } from "./routes/page-routes.js";
import { createJournalRoutes } from "./routes/journal-routes.js";
import { createMarketNewsService } from "./services/market-news-service.js";
import { createEconomiciumCalendarProvider } from "./providers/economicium-calendar-provider.js";

const sourceDirectory = path.dirname(fileURLToPath(import.meta.url));

export function createApp({
  sessionSecret,
  sessionStore,
  environment = process.env.NODE_ENV ?? "development",
  trustProxy,
  authConfig,
  authService,
  discordProvider,
  userRepository = createInMemoryUserRepository(),
  banRepository = createInMemoryBanRepository(),
  sessionRegistry = createInMemorySessionRegistry(),
  marketNewsService = createMarketNewsService({
    provider: createEconomiciumCalendarProvider(),
  }),
  configureRoutes,
  logger = console,
} = {}) {
  const resolvedAuthConfig = authConfig ?? {
    mode: "demo",
    sessionSecret: sessionSecret ?? process.env.SESSION_SECRET ?? "",
    demoRoles: ["Developer"],
    roleRefreshMs: 300_000,
    discord: null,
  };
  if (environment === "production" && resolvedAuthConfig.mode !== "discord") {
    throw new Error("Discord authentication is required in production");
  }
  const secret = sessionSecret || resolvedAuthConfig.sessionSecret || process.env.SESSION_SECRET;
  if (!secret && environment === "production") {
    throw new Error("SESSION_SECRET is required in production");
  }
  if (!sessionStore && environment === "production") {
    throw new Error("sessionStore is required in production");
  }
  const resolvedSessionStore = sessionStore ?? new session.MemoryStore();
  const resolvedDiscordProvider = discordProvider ?? (resolvedAuthConfig.mode === "discord"
    ? createDiscordOAuthProvider(resolvedAuthConfig.discord)
    : undefined);
  const resolvedAuthService = authService ?? createAuthService({
    mode: resolvedAuthConfig.mode,
    demoRoles: resolvedAuthConfig.demoRoles,
    discordProvider: resolvedDiscordProvider,
    rolePolicy: createRolePolicy({ roleIds: resolvedAuthConfig.discord?.roleIds ?? {} }),
    userRepository,
    banRepository,
  });
  const refreshRoles = createRefreshRoles({
    authService: resolvedAuthService,
    refreshAfterMs: resolvedAuthConfig.roleRefreshMs,
    sessionRegistry,
  });

  const app = express();
  app.locals.authConfig = resolvedAuthConfig;
  app.locals.authService = resolvedAuthService;
  app.locals.userRepository = userRepository;
  app.locals.banRepository = banRepository;
  app.locals.sessionRegistry = sessionRegistry;
  app.locals.sessionStore = resolvedSessionStore;
  app.set("trust proxy", trustProxy ?? (environment === "production" ? 1 : false));
  app.set("view engine", "ejs");
  app.set("views", path.join(sourceDirectory, "..", "views"));
  app.use(express.json());
  app.use(express.urlencoded({ extended: false }));
  app.use(express.static(path.join(sourceDirectory, "..", "public")));
  app.use(session({
    store: resolvedSessionStore,
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
  app.use((req, res, next) => {
    if (req.session.operator) res.locals.csrfToken = ensureCsrfToken(req);
    next();
  });
  app.get("/", (req, res) => res.redirect(req.session.operator ? "/home" : "/login"));
  app.get("/login", (req, res) => req.session.operator
    ? res.redirect("/home")
    : res.render("layouts/login", { authMode: resolvedAuthConfig.mode, complete: false }));
  app.use("/auth", createAuthRoutes({ authConfig: resolvedAuthConfig, authService: resolvedAuthService, sessionRegistry }));
  configureRoutes?.(app);
  app.use(requireAuth, refreshRoles);
  app.use(createPageRoutes({ marketNewsService, logger }));
  app.use(createJournalRoutes());

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
