import test from "node:test";
import assert from "node:assert/strict";
import request from "supertest";
import { createApp } from "../../src/app.js";

const liveCalendar = {
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
};

async function authenticatedAgent(marketNewsService) {
  const agent = request.agent(createApp({
    sessionSecret: "test-secret", marketNewsService, logger: { error() {} },
  }));
  await agent.post("/auth/login").send({ username: "operator", passkey: "preview" }).expect(200);
  return agent;
}

test("market news renders provider data in full and fragment responses", async () => {
  const service = { getCurrentWeek: async () => liveCalendar };
  const agent = await authenticatedAgent(service);

  await agent.get("/market-news").expect(200).expect(/data-app-shell/).expect(/Non Farm Payrolls/);
  await agent.get("/market-news").set("X-Omensite-Fragment", "1").expect(200)
    .expect(/data-market-news/).expect((response) => assert.doesNotMatch(response.text, /data-app-shell/));
});

test("refresh endpoint returns normalized data and honors a forced refresh", async () => {
  const calls = [];
  const service = { getCurrentWeek: async (options) => { calls.push(options); return liveCalendar; } };
  const agent = await authenticatedAgent(service);

  const response = await agent.get("/api/market-news/events?refresh=1").expect(200);

  assert.equal(response.body.ok, true);
  assert.deepEqual(response.body.calendar, liveCalendar);
  assert.deepEqual(calls, [{ force: true }]);
});

test("page preserves the terminal shell while a first load failure makes the API unavailable", async () => {
  const service = { getCurrentWeek: async () => { throw new Error("provider secret body"); } };
  const agent = await authenticatedAgent(service);

  await agent.get("/market-news").expect(200).expect(/CALENDAR DATA LINK OFFLINE/).expect(/data-market-news/);
  const response = await agent.get("/api/market-news/events").expect(503);
  assert.deepEqual(response.body, {
    ok: false,
    calendar: { state: "offline", events: [], updatedAt: null, range: null },
  });
  assert.doesNotMatch(JSON.stringify(response.body), /provider secret body/);
});

test("market news API requires an authenticated operator", async () => {
  await request(createApp({ sessionSecret: "test-secret", logger: { error() {} } }))
    .get("/api/market-news/events")
    .expect(401);
});
