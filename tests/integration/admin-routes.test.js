import test from "node:test";
import assert from "node:assert/strict";
import request from "supertest";
import { JSDOM } from "jsdom";
import { createInMemoryBanRepository } from "../../src/repositories/in-memory-ban-repository.js";
import { createInMemoryIndicatorRequestRepository } from "../../src/repositories/in-memory-indicator-request-repository.js";
import { createInMemorySessionRegistry } from "../../src/repositories/in-memory-session-registry.js";
import { createInMemoryUserRepository } from "../../src/repositories/in-memory-user-repository.js";
import { createTestApp, loginDemo, readCsrfToken } from "../helpers/auth-test-helpers.js";

function createAdminRouteHarness(demoRoles = ["Admin"], appOptions = {}) {
  const now = () => "2026-09-02T12:00:00.000Z";
  const userRepository = createInMemoryUserRepository({ now });
  const banRepository = createInMemoryBanRepository({ now });
  const sessionRegistry = createInMemorySessionRegistry();
  const indicatorRequestRepository = createInMemoryIndicatorRequestRepository({ now });
  userRepository.upsert({
    id: "42", username: "member", displayName: "Member", authMode: "discord",
    roles: ["OS", "Indicators"], capabilities: ["base", "indicators"],
    rolesSyncedAt: "2026-09-02T11:55:00.000Z", lastSignedInAt: "2026-09-02T10:30:00.000Z",
  });
  indicatorRequestRepository.upsertPending({
    userId: "42", discordUsername: "member", tradingViewUsername: "member_tv",
    indicatorIds: ["demo-market-structure"],
  });
  return {
    app: createTestApp({
      demoRoles, userRepository, banRepository, sessionRegistry, indicatorRequestRepository,
      ...appOptions,
    }),
    userRepository, banRepository, sessionRegistry, indicatorRequestRepository,
  };
}

test("Admin page renders memory warning, safe users, requests, and mutation tokens", async () => {
  const { app, userRepository } = createAdminRouteHarness(["Admin"]);
  userRepository.upsert({
    id: "unsafe", username: "safe-name", displayName: "Safe Name", roles: ["OS"], capabilities: ["base"],
    discordAuth: { accessToken: "must-not-render" },
  });
  const agent = await loginDemo(app, { username: "admin" });
  const response = await agent.get("/admin").expect(200)
    .expect(/TEMPORARY MEMORY MODE/)
    .expect(/data-admin-root/)
    .expect(/data-admin-users/)
    .expect(/data-admin-requests/)
    .expect(/name="_csrf"/);
  const dom = new JSDOM(response.text);

  assert.equal(dom.window.document.querySelectorAll("[data-admin-user-row]").length, 3);
  assert.equal(dom.window.document.querySelectorAll("[data-admin-request-row]").length, 1);
  assert.doesNotMatch(response.text, /must-not-render/);
  assert.ok(dom.window.document.querySelector('button[data-admin-action="ban"][disabled]'));
  const member = dom.window.document.querySelector('[data-admin-user-row][data-user-id="42"]');
  assert.equal(member.querySelector("[data-admin-last-sign-in] time").dateTime, "2026-09-02T10:30:00.000Z");
  assert.equal(member.querySelector("[data-admin-role-sync] time").dateTime, "2026-09-02T11:55:00.000Z");
  dom.window.close();
});

test("Admin request audit renders safe active TradingView links and decision metadata", async () => {
  const indicatorCatalog = Object.freeze([
    Object.freeze({ id: "demo-market-structure", name: "SAFE SCRIPT", active: true, tradingViewUrl: "https://www.tradingview.com/script/safe/" }),
    Object.freeze({ id: "unsafe", name: "UNSAFE SCRIPT", active: true, tradingViewUrl: "javascript:alert(1)" }),
  ]);
  const harness = createAdminRouteHarness(["Admin"], { indicatorCatalog });
  harness.indicatorRequestRepository.upsertPending({
    userId: "42", discordUsername: "member", tradingViewUsername: "member_tv",
    indicatorIds: ["demo-market-structure", "unsafe"],
  });
  harness.indicatorRequestRepository.decide({ userId: "42", status: "GRANTED", actorId: "reviewer-7" });
  const agent = await loginDemo(harness.app, { username: "admin" });

  const response = await agent.get("/admin").expect(200);
  const dom = new JSDOM(response.text);
  const row = dom.window.document.querySelector('[data-admin-request-row][data-user-id="42"]');

  assert.equal(row.querySelectorAll('a[href="https://www.tradingview.com/script/safe/"]').length, 1);
  assert.equal(row.querySelectorAll('a[href^="javascript:"]').length, 0);
  assert.equal(row.querySelector("[data-admin-decided-by]").textContent.trim(), "DECIDED BY :: reviewer-7");
  assert.equal(row.querySelector("[data-admin-decided-at] time").dateTime, "2026-09-02T12:00:00.000Z");
  dom.window.close();
});

test("OS cannot mutate Admin resources and capability is checked before CSRF", async () => {
  const { app, banRepository } = createAdminRouteHarness(["OS"]);
  const agent = await loginDemo(app, { username: "member" });

  await agent.post("/api/admin/users/42/ban")
    .send({ _csrf: "anything", reason: "blocked" })
    .expect(403)
    .expect(({ body }) => assert.equal(body.error, "INSUFFICIENT_PERMISSIONS"));
  assert.equal(banRepository.isBanned("42"), false);
});

test("Admin can ban, unban, sign out, and decide an indicator request", async () => {
  const { app, sessionRegistry } = createAdminRouteHarness(["Admin"]);
  const admin = await loginDemo(app, { username: "admin" });
  const csrf = await readCsrfToken(admin, "/admin");
  sessionRegistry.register("42", "not-present-in-store");

  await admin.post("/api/admin/users/42/ban")
    .set("X-CSRF-Token", csrf).send({ reason: "Policy violation" })
    .expect(200).expect(({ body }) => assert.equal(body.user.banned, true));
  await admin.post("/api/admin/users/42/unban")
    .set("X-CSRF-Token", csrf)
    .expect(200).expect(({ body }) => assert.equal(body.user.banned, false));
  await admin.post("/api/admin/users/42/sign-out")
    .set("X-CSRF-Token", csrf)
    .expect(200).expect(({ body }) => assert.equal(body.user.activeSessions, 0));
  await admin.post("/api/admin/indicator-requests/42/decision")
    .set("X-CSRF-Token", csrf).send({ status: "GRANTED" })
    .expect(200).expect(({ body }) => assert.equal(body.request.status, "GRANTED"));
});

test("Admin actions reject missing CSRF without changing temporary state", async () => {
  const { app, banRepository } = createAdminRouteHarness(["Developer"]);
  const admin = await loginDemo(app, { username: "developer" });

  await admin.post("/api/admin/users/42/ban").send({ reason: "blocked" })
    .expect(403).expect(({ body }) => assert.equal(body.error, "CSRF_INVALID"));
  assert.equal(banRepository.isBanned("42"), false);
});

test("self-ban is blocked while self-sign-out invalidates the current Admin session", async () => {
  const { app, banRepository } = createAdminRouteHarness(["Admin"]);
  const admin = await loginDemo(app, { username: "admin" });
  const csrf = await readCsrfToken(admin, "/admin");

  await admin.post("/api/admin/users/demo%3Aadmin/ban")
    .set("X-CSRF-Token", csrf).send({ reason: "self" })
    .expect(409).expect(({ body }) => assert.equal(body.error, "SELF_BAN_FORBIDDEN"));
  assert.equal(banRepository.isBanned("demo:admin"), false);
  await admin.post("/api/admin/users/demo%3Aadmin/sign-out")
    .set("X-CSRF-Token", csrf)
    .expect(200).expect(({ body }) => {
      assert.equal(body.selfSignedOut, true);
      assert.equal(body.redirectTo, "/login");
    });
  await admin.get("/home").expect(302).expect("Location", "/login");
});

test("Admin mutations support ordinary HTML form posts", async () => {
  const { app, banRepository } = createAdminRouteHarness(["Admin"]);
  const admin = await loginDemo(app, { username: "admin" });
  const csrf = await readCsrfToken(admin, "/admin");

  await admin.post("/api/admin/users/42/ban").type("form")
    .send({ _csrf: csrf, reason: "Policy violation" })
    .expect(303).expect("Location", "/admin");
  assert.equal(banRepository.isBanned("42"), true);
});

test("unauthenticated Admin API requests are rejected", async () => {
  await request(createAdminRouteHarness(["Admin"]).app)
    .post("/api/admin/users/42/sign-out").send({})
    .expect(401);
});
