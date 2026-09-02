import test from "node:test";
import assert from "node:assert/strict";
import request from "supertest";
import { JSDOM } from "jsdom";
import { createInMemoryIndicatorRequestRepository } from "../../src/repositories/in-memory-indicator-request-repository.js";
import { createTestApp, loginDemo, readCsrfToken } from "../helpers/auth-test-helpers.js";

test("Indicators page renders identity, catalog, request state, and CSRF field", async () => {
  const agent = await loginDemo(createTestApp({ demoRoles: ["OS", "Indicators"] }), { username: "omen" });
  const response = await agent.get("/indicators").expect(200)
    .expect(/data-indicator-access-root/)
    .expect(/DEMO :: MARKET STRUCTURE/)
    .expect(/NOT REQUESTED/)
    .expect(/name="_csrf"/);
  const dom = new JSDOM(response.text);

  assert.equal(dom.window.document.querySelector("[data-indicator-identity]").textContent.trim(), "omen");
  assert.ok(dom.window.document.querySelector("[data-indicator-role-sync] time").dateTime);
  assert.equal(dom.window.document.querySelectorAll("[data-indicator-catalog-row]").length, 2);
  dom.window.close();
});

test("request API creates one pending all-indicator request", async () => {
  const indicatorRequestRepository = createInMemoryIndicatorRequestRepository({
    now: () => "2026-09-02T12:00:00.000Z",
  });
  const agent = await loginDemo(createTestApp({
    demoRoles: ["OS", "Indicators"], indicatorRequestRepository,
  }), { username: "omen" });
  const csrf = await readCsrfToken(agent, "/indicators");

  await agent.post("/api/indicator-access/requests")
    .set("X-CSRF-Token", csrf)
    .send({ tradingViewUsername: "omen_trader", consent: true })
    .expect(201)
    .expect(({ body }) => {
      assert.equal(body.ok, true);
      assert.equal(body.request.status, "PENDING");
      assert.equal(body.request.indicatorIds.length, 2);
    });
  assert.equal(indicatorRequestRepository.list().length, 1);
});

test("Indicators page and request API both require the Indicators capability", async () => {
  const os = await loginDemo(createTestApp({ demoRoles: ["OS"] }), { username: "member" });

  await os.get("/indicators").set("X-Omensite-Fragment", "1").expect(403)
    .expect(({ body }) => assert.equal(body.error, "INSUFFICIENT_PERMISSIONS"));
  await os.post("/api/indicator-access/requests")
    .send({ tradingViewUsername: "member_tv", consent: true })
    .expect(403)
    .expect(({ body }) => assert.equal(body.error, "INSUFFICIENT_PERMISSIONS"));
});

test("request API rejects missing CSRF and safe validation failures without storing a request", async () => {
  const indicatorRequestRepository = createInMemoryIndicatorRequestRepository();
  const agent = await loginDemo(createTestApp({
    demoRoles: ["OS", "Indicators"], indicatorRequestRepository,
  }));

  await agent.post("/api/indicator-access/requests")
    .send({ tradingViewUsername: "valid_user", consent: true })
    .expect(403)
    .expect(({ body }) => assert.equal(body.error, "CSRF_INVALID"));
  const csrf = await readCsrfToken(agent, "/indicators");
  await agent.post("/api/indicator-access/requests")
    .set("X-CSRF-Token", csrf)
    .send({ tradingViewUsername: "<invalid>", consent: true })
    .expect(422)
    .expect(({ body }) => {
      assert.deepEqual(body, {
        ok: false,
        error: "TRADINGVIEW_USERNAME_INVALID",
        message: "TRADINGVIEW USERNAME MUST BE 3–64 LETTERS, NUMBERS, UNDERSCORES, OR HYPHENS",
      });
    });
  assert.equal(indicatorRequestRepository.list().length, 0);
});

test("standard form submission creates the request and redirects back to Indicators", async () => {
  const agent = await loginDemo(createTestApp({ demoRoles: ["OS", "Indicators"] }));
  const csrf = await readCsrfToken(agent, "/indicators");

  await agent.post("/api/indicator-access/requests")
    .type("form")
    .send({ _csrf: csrf, tradingViewUsername: "operator_tv", consent: "true" })
    .expect(303)
    .expect("Location", "/indicators");
  await agent.get("/indicators").expect(200).expect(/PENDING/).expect(/value="operator_tv"/);
});

test("TradingView links render only for granted requests with configured URLs", async () => {
  const indicatorRequestRepository = createInMemoryIndicatorRequestRepository();
  const indicatorCatalog = Object.freeze([
    Object.freeze({
      id: "private-one", name: "PRIVATE ONE", description: "Configured script",
      tradingViewUrl: "https://www.tradingview.com/script/example/", version: "1.0.0", active: true, demo: false,
    }),
    Object.freeze({
      id: "private-two", name: "PRIVATE TWO", description: "Configured without a URL",
      tradingViewUrl: null, version: "1.0.0", active: true, demo: false,
    }),
  ]);
  const app = createTestApp({
    demoRoles: ["OS", "Indicators"], indicatorRequestRepository, indicatorCatalog,
  });
  const agent = await loginDemo(app, { username: "omen" });
  indicatorRequestRepository.upsertPending({
    userId: "demo:omen", discordUsername: "omen", tradingViewUsername: "omen_tv",
    indicatorIds: ["private-one", "private-two"],
  });

  let response = await agent.get("/indicators").expect(200);
  assert.doesNotMatch(response.text, /href="https:\/\/www\.tradingview\.com\/script\/example\//);
  indicatorRequestRepository.decide({ userId: "demo:omen", status: "GRANTED", actorId: "admin" });
  response = await agent.get("/indicators").expect(200);
  assert.match(response.text, /href="https:\/\/www\.tradingview\.com\/script\/example\/"/);
  assert.equal((response.text.match(/OPEN IN TRADINGVIEW/g) ?? []).length, 1);
});

test("unauthenticated indicator request API is rejected before request processing", async () => {
  await request(createTestApp()).post("/api/indicator-access/requests")
    .send({ tradingViewUsername: "valid_user", consent: true })
    .expect(401);
});
