import test from "node:test";
import assert from "node:assert/strict";
import request from "supertest";
import { JSDOM } from "jsdom";
import { createTestApp, loginTestOperator } from "../helpers/auth-test-helpers.js";

test("server pages expose Cortex workspaces with preserved interactive calendar and access hooks", async () => {
  const agent = await loginTestOperator(createTestApp({
    sessionSecret: "test-secret",
    marketNewsService: {
      getCurrentWeek: async () => ({
        state: "live",
        events: [{
          id: "42",
          timestamp: "2026-09-03T12:30:00.000Z",
          market: "USD",
          country: "United States",
          title: "Non Farm Payrolls",
          importance: "high",
          actual: null,
          forecast: "75K",
          previous: "62K",
        }],
        updatedAt: "2026-09-02T12:00:00.000Z",
        range: { from: "2026-08-30", to: "2026-09-05" },
      }),
    },
  }));
  const home = await agent.get("/home").expect(200);
  const homeDom = new JSDOM(home.text);
  assert.equal(homeDom.window.document.querySelectorAll(".cortex-kpis .cortex-kpi").length, 4);
  assert.ok(homeDom.window.document.querySelector('.cortex-home-command a[href="/brain"][data-nav-link]'));
  assert.ok(homeDom.window.document.querySelector('.cortex-home-command a[href="/brain?view=robinhood"][data-nav-link]'));
  assert.equal(homeDom.window.document.querySelectorAll(".cortex-workspace-grid .cortex-workspace-card").length, 6);
  assert.equal(homeDom.window.document.querySelector("[data-journal-count]").textContent, "—");
  homeDom.window.close();
  await agent.get("/indicators").expect(200)
    .expect(/indicator-console/).expect(/indicator-catalog-row/).expect(/indicator-request/).expect(/terminal-check/);
  const response = await agent.get("/market-news").expect(200);
  assert.match(response.text, /market-calendar/);
  assert.match(response.text, /calendar-toolbar/);
  assert.match(response.text, /calendar-event/);
  assert.match(response.text, /calendar-state/);
  await agent.get("/alerts/ict").expect(200).expect(/cortex-panel/).expect(/data-alert-standby/).expect(/No signal rules configured/);
});

test("Indicators retain a readable script grid and access form in Cortex panels", async () => {
  const app = createTestApp();
  const agent = await loginTestOperator(app);
  const [response, stylesheet] = await Promise.all([
    agent.get("/indicators").expect(200),
    request(app).get("/css/omensite.css").expect(200),
  ]);
  const dom = new JSDOM(response.text);
  const style = dom.window.document.createElement("style");
  style.textContent = stylesheet.text;
  dom.window.document.head.append(style);

  const rowStyle = dom.window.getComputedStyle(dom.window.document.querySelector("[data-indicator-catalog-row]"));
  const consoleStyle = dom.window.getComputedStyle(dom.window.document.querySelector(".indicator-console"));
  const formStyle = dom.window.getComputedStyle(dom.window.document.querySelector("[data-indicator-request-form]"));
  assert.equal(rowStyle.display, "grid");
  assert.equal(consoleStyle.borderTopWidth, "1px");
  assert.equal(formStyle.display, "grid");
  assert.ok(dom.window.document.querySelector(".indicator-console.cortex-panel"));
  assert.ok(dom.window.document.querySelector(".indicator-request.cortex-panel"));
  dom.window.close();
});

test("Admin uses Cortex panels with dense action rows and mobile field labels", async () => {
  const app = createTestApp();
  const agent = await loginTestOperator(app);
  const [response, stylesheet] = await Promise.all([
    agent.get("/admin").expect(200),
    request(app).get("/css/omensite.css").expect(200),
  ]);
  const dom = new JSDOM(response.text);
  const style = dom.window.document.createElement("style");
  style.textContent = stylesheet.text;
  dom.window.document.head.append(style);

  const userRow = dom.window.document.querySelector("[data-admin-user-row]");
  const rail = dom.window.document.querySelector("[data-admin-users]");
  const actions = userRow.querySelector(".admin-actions");
  assert.equal(dom.window.getComputedStyle(userRow).display, "grid");
  assert.equal(dom.window.getComputedStyle(rail).borderTopWidth, "1px");
  assert.equal(dom.window.getComputedStyle(actions).display, "flex");
  assert.equal(userRow.closest(".panel"), null);
  assert.ok(userRow.closest(".cortex-panel"));
  assert.ok([...userRow.children].every((child) => child.hasAttribute("data-field")));
  dom.window.close();
});
