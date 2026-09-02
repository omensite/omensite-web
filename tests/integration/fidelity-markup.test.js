import test from "node:test";
import assert from "node:assert/strict";
import request from "supertest";
import { createApp } from "../../src/app.js";

test("server pages retain the accepted panel and terminal calendar geometry hooks", async () => {
  const agent = request.agent(createApp({
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
  await agent.post("/auth/login").send({ username: "operator", passkey: "preview" }).expect(200);
  await agent.get("/home").expect(200).expect(/grid grid-4/).expect(/grid grid-2-1/).expect(/panel-kicker/).expect(/quicklink/);
  await agent.get("/indicators").expect(200).expect(/section-label/).expect(/empty/).expect(/panel howto/).expect(/code-row/);
  const response = await agent.get("/market-news").expect(200);
  assert.match(response.text, /market-calendar/);
  assert.match(response.text, /calendar-toolbar/);
  assert.match(response.text, /calendar-event/);
  assert.match(response.text, /calendar-state/);
  await agent.get("/alerts/ict").expect(200).expect(/class="toolbar"/).expect(/section-label/).expect(/class="empty"/);
});
