import assert from "node:assert/strict";
import test from "node:test";
import session from "express-session";
import request from "supertest";
import { createInMemorySessionRegistry } from "../../src/repositories/in-memory-session-registry.js";
import { createInMemoryBanRepository } from "../../src/repositories/in-memory-ban-repository.js";
import { createTestApp, loginDemo, readCsrfToken } from "../helpers/auth-test-helpers.js";

const discordOperator = {
  id: "42", username: "omen", displayName: "Omen", avatarUrl: null, authMode: "discord",
  roles: ["OS", "Indicators"], capabilities: ["base", "indicators"], rolesSyncedAt: "2026-09-02T12:00:00.000Z",
  discordAuth: { accessToken: "discord-access-token-42", refreshToken: "discord-refresh-token-42", expiresAt: "2026-09-03T12:00:00.000Z" },
};

test("demo login establishes, registers, and CSRF-protects the operator session", async () => {
  const registered = [];
  const unregistered = [];
  const sessionRegistry = { register: (...values) => registered.push(values), unregister: (...values) => unregistered.push(values) };
  const authService = {
    authenticateDemo: async ({ username }) => ({ ...discordOperator, id: `demo:${username}`, username, displayName: username, authMode: "demo", discordAuth: null }),
    revokeOperatorToken: async () => {},
  };
  const app = createTestApp({ authService, sessionRegistry });
  const agent = request.agent(app);

  await agent.get("/home").expect(302).expect("Location", "/login");
  const login = await agent.post("/auth/login").send({ username: "operator", passkey: "preview" }).expect(200).expect({ ok: true, redirectTo: "/home" });
  assert.doesNotMatch(login.text, /discord-access-token-42|discord-refresh-token-42|test-secret/);
  assert.equal(registered.length, 1);
  assert.equal(registered[0][0], "demo:operator");

  const csrfToken = await readCsrfToken(agent, "/home");
  assert.match(csrfToken, /^[A-Za-z0-9_-]{43}$/);
  await agent.post("/auth/logout").expect(403).expect({ error: "CSRF_INVALID", message: "REQUEST REJECTED :: SESSION TOKEN INVALID" });
  await agent.get("/home").expect(200);
  await agent.post("/auth/logout").set("X-CSRF-Token", csrfToken).expect(200);
  assert.equal(unregistered.length, 1);
  assert.deepEqual(unregistered[0], registered[0]);
  await agent.get("/home").expect(302).expect("Location", "/login");
});

test("same-browser re-login replaces the prior identity session registry mapping", async () => {
  const sessionRegistry = createInMemorySessionRegistry();
  const app = createTestApp({ sessionRegistry });
  const agent = request.agent(app);

  const firstLogin = await agent.post("/auth/login")
    .send({ username: "first", passkey: "preview" })
    .expect(200);
  const firstCookie = firstLogin.headers["set-cookie"][0].split(";", 1)[0];
  assert.equal(sessionRegistry.activeCount("demo:first"), 1);

  const secondLogin = await agent.post("/auth/login")
    .send({ username: "second", passkey: "preview" })
    .expect(200);
  const secondCookie = secondLogin.headers["set-cookie"][0].split(";", 1)[0];

  assert.notEqual(secondCookie, firstCookie);
  assert.equal(sessionRegistry.activeCount("demo:first"), 0);
  assert.deepEqual(sessionRegistry.listSessionIds("demo:first"), []);
  assert.equal(sessionRegistry.activeCount("demo:second"), 1);
  assert.equal(sessionRegistry.listSessionIds("demo:second").length, 1);
});

test("a ban committed during session regeneration prevents final demo admission", async () => {
  const banRepository = createInMemoryBanRepository();
  const sessionRegistry = createInMemorySessionRegistry();
  const sessionStore = new session.MemoryStore();
  const destroy = sessionStore.destroy.bind(sessionStore);
  let destroyCalls = 0;
  let signalRegeneration;
  let releaseRegeneration;
  const regenerationReached = new Promise((resolve) => { signalRegeneration = resolve; });
  const regenerationReleased = new Promise((resolve) => { releaseRegeneration = resolve; });
  sessionStore.destroy = (sessionId, callback) => {
    destroyCalls += 1;
    if (destroyCalls !== 1) return destroy(sessionId, callback);
    signalRegeneration();
    return regenerationReleased.then(() => destroy(sessionId, callback));
  };
  const app = createTestApp({ banRepository, sessionRegistry, sessionStore });
  const agent = request.agent(app);

  const loginPromise = agent.post("/auth/login")
    .send({ username: "racing-user", passkey: "preview" })
    .then((response) => response);
  await regenerationReached;
  banRepository.ban({ userId: "demo:racing-user", actorId: "admin", reason: "Concurrent ban" });
  releaseRegeneration();
  const response = await loginPromise;

  assert.equal(response.status, 403);
  assert.deepEqual(response.body, {
    ok: false,
    error: "ACCOUNT_BANNED",
    message: "ACCESS FAILED :: ACCOUNT BANNED",
  });
  assert.equal(sessionRegistry.activeCount("demo:racing-user"), 0);
  await agent.get("/home").expect(302).expect("Location", "/login");
});

test("Discord completion performs final admission and returns a stable banned redirect", async () => {
  let admissionChecks = 0;
  const sessionRegistry = createInMemorySessionRegistry();
  const authService = {
    beginDiscord: () => ({ state: "correct", authorizationUrl: "/discord" }),
    completeDiscord: async () => discordOperator,
    assertOperatorAdmission() {
      admissionChecks += 1;
      throw Object.assign(new Error("private ban detail"), { code: "ACCOUNT_BANNED" });
    },
  };
  const agent = request.agent(createTestApp({
    authMode: "discord",
    authService,
    sessionRegistry,
    logger: { warn() {}, error() {} },
  }));
  await agent.get("/auth/discord");

  await agent.get("/auth/discord/callback?code=code&state=correct")
    .expect(302).expect("Location", "/login?error=account_banned");
  assert.equal(admissionChecks, 1);
  assert.equal(sessionRegistry.activeCount("42"), 0);
  await agent.get("/home").expect(302).expect("Location", "/login");
});

test("fragment requests receive 401 instead of a redirect", async () => {
  await request(createTestApp()).get("/home").set("X-Omensite-Fragment", "1").expect(401).expect({ error: "AUTH_REQUIRED", loginUrl: "/login" });
});

test("login identifies the current v0.1.1 release", async () => {
  await request(createTestApp()).get("/login").expect(200).expect(/OMENSITE TRADING TERMINAL v0\.1\.1/);
});

test("login renders only allowlisted authentication failures with fixed messages", async () => {
  const outcomes = [
    ["invalid_oauth_state", "AUTHENTICATION FAILED :: INVALID OR EXPIRED REQUEST"],
    ["discord_auth_failed", "AUTHENTICATION FAILED :: DISCORD UNAVAILABLE"],
    ["access_revoked", "ACCESS FAILED :: REQUIRED ROLE NOT PRESENT"],
    ["account_banned", "ACCESS FAILED :: ACCOUNT BANNED"],
    ["role_sync_failed", "AUTHENTICATION FAILED :: ROLE SYNC UNAVAILABLE"],
  ];

  for (const [code, message] of outcomes) {
    await request(createTestApp()).get(`/login?error=${code}&message=private-provider-body`)
      .expect(200)
      .expect(new RegExp(message.replace(/[.*+?^${}()|[\]\\]/g, "\\$&")))
      .expect((response) => assert.doesNotMatch(response.text, /private-provider-body/));
  }

  await request(createTestApp()).get("/login?error=%3Cscript%3Ealert(1)%3C%2Fscript%3E")
    .expect(200)
    .expect((response) => {
      assert.doesNotMatch(response.text, /alert\(1\)|data-login-page-error/);
    });
});

test("demo and Discord modes expose only their matching login entry point", async () => {
  await request(createTestApp()).get("/login").expect(200).expect(/data-login-form/)
    .expect((response) => assert.doesNotMatch(response.text, /data-discord-login/));
  await request(createTestApp()).get("/auth/discord").expect(404);

  const discordApp = createTestApp({ authMode: "discord", authService: { beginDiscord: () => ({ state: "state", authorizationUrl: "/provider" }) } });
  await request(discordApp).get("/login").expect(200).expect(/data-discord-login/)
    .expect((response) => assert.doesNotMatch(response.text, /data-login-form/));
  await request(discordApp).post("/auth/login").send({ username: "x", passkey: "y" }).expect(404);
});

test("root and login recover to the correct page from every session state", async () => {
  const app = createTestApp();
  await request(app).get("/").expect(302).expect("Location", "/login");
  await request(app).get("/login").expect(200).expect(/data-login-root/);
  const agent = await loginDemo(app, { username: "cinematic", passkey: "refresh" });
  await agent.get("/").expect(302).expect("Location", "/home");
  await agent.get("/login").expect(302).expect("Location", "/home");
  await agent.get("/home").expect(200).expect(/data-app-shell/);
});

test("Discord login stores state and redirects to the provider", async () => {
  const authService = { beginDiscord: () => ({ state: "state-value", authorizationUrl: "https://discord.com/oauth2/authorize?state=state-value" }) };
  const agent = request.agent(createTestApp({ authMode: "discord", authService }));
  const response = await agent.get("/auth/discord").expect(302);
  assert.match(response.headers.location, /^https:\/\/discord\.com\/oauth2\/authorize/);
});

test("Discord callback rejects a mismatched state without authenticating", async () => {
  let completionCalls = 0;
  const authService = {
    beginDiscord: () => ({ state: "correct", authorizationUrl: "/discord" }),
    completeDiscord: async () => { completionCalls += 1; return discordOperator; },
  };
  const agent = request.agent(createTestApp({ authMode: "discord", authService }));
  await agent.get("/auth/discord").expect(302);
  await agent.get("/auth/discord/callback?code=code&state=wrong").expect(302).expect("Location", "/login?error=invalid_oauth_state");
  assert.equal(completionCalls, 0);
  await agent.get("/auth/discord/callback?code=code&state=correct").expect(302).expect("Location", "/login?error=invalid_oauth_state");
  assert.equal(completionCalls, 0);
  await agent.get("/home").expect(302).expect("Location", "/login");
});

test("OAuth state is consumed before provider work even when authentication fails", async () => {
  let completionCalls = 0;
  const warnings = [];
  const authService = {
    beginDiscord: () => ({ state: "single-use", authorizationUrl: "/discord" }),
    completeDiscord: async () => { completionCalls += 1; throw Object.assign(new Error("provider unavailable"), { code: "DISCORD_REQUEST_FAILED" }); },
  };
  const agent = request.agent(createTestApp({
    authMode: "discord",
    authService,
    logger: { warn: (...values) => warnings.push(values), error() {} },
  }));
  await agent.get("/auth/discord");
  await agent.get("/auth/discord/callback?code=code&state=single-use").expect(302).expect("Location", "/login?error=discord_auth_failed");
  await agent.get("/auth/discord/callback?code=code&state=single-use").expect(302).expect("Location", "/login?error=invalid_oauth_state");
  assert.equal(completionCalls, 1);
  assert.deepEqual(warnings, [["Discord OAuth callback failed", { code: "DISCORD_REQUEST_FAILED" }]]);
  assert.doesNotMatch(JSON.stringify(warnings), /provider unavailable|code=code/);
});

test("OAuth callback maps known auth/provider codes and forwards unexpected faults", async () => {
  const known = [
    ["ACCOUNT_BANNED", "/login?error=account_banned"],
    ["ACCESS_REVOKED", "/login?error=access_revoked"],
    ["DISCORD_HTTP_ERROR", "/login?error=discord_auth_failed"],
    ["DISCORD_TIMEOUT", "/login?error=discord_auth_failed"],
    ["DISCORD_REQUEST_FAILED", "/login?error=discord_auth_failed"],
    ["DISCORD_INVALID_RESPONSE", "/login?error=discord_auth_failed"],
  ];

  for (const [code, location] of known) {
    const warnings = [];
    const authService = {
      beginDiscord: () => ({ state: "known", authorizationUrl: "/discord" }),
      completeDiscord: async () => {
        throw Object.assign(new Error("private access_token=response-body"), { code });
      },
    };
    const agent = request.agent(createTestApp({
      authMode: "discord",
      authService,
      logger: { warn: (...values) => warnings.push(values), error() {} },
    }));
    await agent.get("/auth/discord");
    await agent.get("/auth/discord/callback?code=private-code&state=known")
      .expect(302).expect("Location", location);
    assert.deepEqual(warnings, [["Discord OAuth callback failed", { code }]]);
    assert.doesNotMatch(JSON.stringify(warnings), /access_token|response-body|private-code/);
  }

  const unexpected = Object.assign(new Error("private unexpected body"), { accessToken: "secret-token" });
  const boundaryDiagnostics = [];
  const warnings = [];
  const authService = {
    beginDiscord: () => ({ state: "unexpected", authorizationUrl: "/discord" }),
    completeDiscord: async () => { throw unexpected; },
  };
  const agent = request.agent(createTestApp({
    authMode: "discord",
    authService,
    logger: {
      warn: (...values) => warnings.push(values),
      error: (...values) => boundaryDiagnostics.push(values),
    },
  }));
  await agent.get("/auth/discord");
  await agent.get("/auth/discord/callback?code=private-code&state=unexpected")
    .expect(500)
    .expect((response) => assert.doesNotMatch(response.text, /private unexpected body|secret-token|private-code/));
  assert.deepEqual(warnings, []);
  assert.deepEqual(boundaryDiagnostics, [["Unhandled application error"]]);
  assert.doesNotMatch(
    JSON.stringify(boundaryDiagnostics),
    /private unexpected body|secret-token|private-code|accessToken|stack/i,
  );
});

test("successful Discord callback regenerates and registers the session then renders completion", async () => {
  const registered = [];
  const sessionStore = new session.MemoryStore();
  let sessionWrites = 0;
  const storeSession = sessionStore.set.bind(sessionStore);
  sessionStore.set = (sessionId, value, callback) => {
    sessionWrites += 1;
    return storeSession(sessionId, value, callback);
  };
  let stateConsumedBeforeProvider = false;
  let writesAfterBegin = 0;
  const authService = {
    beginDiscord: () => ({ state: "correct", authorizationUrl: "/discord" }),
    completeDiscord: async () => {
      stateConsumedBeforeProvider = sessionWrites > writesAfterBegin;
      return discordOperator;
    },
    refreshOperator: async (operator) => operator,
  };
  const sessionRegistry = { register: (...values) => registered.push(values), unregister() {} };
  const agent = request.agent(createTestApp({ authMode: "discord", authService, sessionRegistry, sessionStore }));
  const begin = await agent.get("/auth/discord");
  const initialCookie = begin.headers["set-cookie"][0].split(";", 1)[0];
  writesAfterBegin = sessionWrites;
  const callback = await agent.get("/auth/discord/callback?code=code&state=correct").expect(302).expect("Location", "/auth/complete");
  const regeneratedCookie = callback.headers["set-cookie"][0].split(";", 1)[0];
  assert.equal(stateConsumedBeforeProvider, true);
  assert.notEqual(regeneratedCookie, initialCookie);
  assert.doesNotMatch(callback.headers.location, /discord-access-token-42|discord-refresh-token-42|test-secret/);
  assert.equal(registered.length, 1);
  assert.equal(registered[0][0], "42");
  const completion = await agent.get("/auth/complete").expect(200).expect(/data-auth-complete/);
  assert.doesNotMatch(completion.text, /discord-access-token-42|discord-refresh-token-42|test-secret/);
  const home = await agent.get("/home").expect(200).expect(/Omen/);
  assert.doesNotMatch(home.text, /discord-access-token-42|discord-refresh-token-42|test-secret/);
});

test("logout attempts Discord revocation but always destroys and unregisters the local session", async () => {
  const registered = [];
  const unregistered = [];
  let revocations = 0;
  const authService = {
    beginDiscord: () => ({ state: "correct", authorizationUrl: "/discord" }), completeDiscord: async () => discordOperator,
    refreshOperator: async (operator) => operator,
    revokeOperatorToken: async () => { revocations += 1; throw new Error("Discord offline"); },
  };
  const sessionRegistry = { register: (...values) => registered.push(values), unregister: (...values) => unregistered.push(values) };
  const agent = request.agent(createTestApp({ authMode: "discord", authService, sessionRegistry, logger: { error() {} } }));
  await agent.get("/auth/discord");
  await agent.get("/auth/discord/callback?code=code&state=correct").expect(302);
  const csrfToken = await readCsrfToken(agent, "/home");
  await agent.post("/auth/logout").send({ _csrf: csrfToken }).expect(200);
  assert.equal(revocations, 1);
  assert.deepEqual(unregistered, registered);
  await agent.get("/home").expect(302).expect("Location", "/login");
});

test("logout still revokes and destroys when session registry cleanup fails", async () => {
  let revocations = 0;
  const authService = {
    authenticateDemo: async ({ username }) => ({
      ...discordOperator,
      id: `demo:${username}`,
      username,
      displayName: username,
      authMode: "demo",
      discordAuth: null,
    }),
    revokeOperatorToken: async () => { revocations += 1; },
  };
  const sessionRegistry = {
    register() {},
    unregister() { throw new Error("registry unavailable"); },
  };
  const app = createTestApp({ authService, sessionRegistry, logger: { error() {} } });
  const agent = await loginDemo(app);
  const csrfToken = await readCsrfToken(agent, "/home");

  await agent.post("/auth/logout").set("X-CSRF-Token", csrfToken).expect(200);
  assert.equal(revocations, 1);
  await agent.get("/home").expect(302).expect("Location", "/login");
});

test("logout destruction failure retains a revoked registry entry and clears the client cookie", async () => {
  const sessionStore = new session.MemoryStore();
  const originalDestroy = sessionStore.destroy.bind(sessionStore);
  const sessionRegistry = createInMemorySessionRegistry();
  const app = createTestApp({ sessionStore, sessionRegistry, logger: { error() {} } });
  const agent = request.agent(app);
  const loginResponse = await agent.post("/auth/login")
    .send({ username: "retryable-logout", passkey: "preview" })
    .expect(200);
  const csrfToken = await readCsrfToken(agent, "/home");
  const [sessionId] = sessionRegistry.listSessionIds("demo:retryable-logout");
  const originalCookie = loginResponse.headers["set-cookie"][0].split(";", 1)[0];
  sessionStore.destroy = (candidate, callback) => {
    if (candidate === sessionId) return callback(new Error("private store failure"));
    return originalDestroy(candidate, callback);
  };

  const response = await agent.post("/auth/logout")
    .set("X-CSRF-Token", csrfToken)
    .expect(500)
    .expect((result) => assert.doesNotMatch(result.text, /OMENSITE OVERVIEW|private store failure/));

  assert.match(response.headers["set-cookie"]?.join(";") ?? "", /connect\.sid=;/);
  assert.deepEqual(sessionRegistry.listSessionIds("demo:retryable-logout"), [sessionId]);
  assert.equal(sessionRegistry.isRevoked(sessionId), true);
  await request(app).get("/home").set("Cookie", originalCookie).expect(302).expect("Location", "/login?error=access_revoked");
});
