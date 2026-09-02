import assert from "node:assert/strict";
import test from "node:test";
import session from "express-session";
import request from "supertest";
import { createInMemorySessionRegistry } from "../../src/repositories/in-memory-session-registry.js";
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

test("fragment requests receive 401 instead of a redirect", async () => {
  await request(createTestApp()).get("/home").set("X-Omensite-Fragment", "1").expect(401).expect({ error: "AUTH_REQUIRED", loginUrl: "/login" });
});

test("login identifies the current v0.1.1 release", async () => {
  await request(createTestApp()).get("/login").expect(200).expect(/OMENSITE TRADING TERMINAL v0\.1\.1/);
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
  const authService = {
    beginDiscord: () => ({ state: "single-use", authorizationUrl: "/discord" }),
    completeDiscord: async () => { completionCalls += 1; throw Object.assign(new Error("provider unavailable"), { code: "DISCORD_REQUEST_FAILED" }); },
  };
  const agent = request.agent(createTestApp({ authMode: "discord", authService, logger: { error() {} } }));
  await agent.get("/auth/discord");
  await agent.get("/auth/discord/callback?code=code&state=single-use").expect(302).expect("Location", "/login?error=discord_auth_failed");
  await agent.get("/auth/discord/callback?code=code&state=single-use").expect(302).expect("Location", "/login?error=invalid_oauth_state");
  assert.equal(completionCalls, 1);
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
