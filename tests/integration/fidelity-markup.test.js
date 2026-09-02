import test from "node:test";
import request from "supertest";
import { createApp } from "../../src/app.js";

test("server pages retain the accepted panel and empty-state geometry hooks", async () => {
  const agent = request.agent(createApp({
    sessionSecret: "test-secret",
    marketNewsService: {
      getCurrentWeek: async () => ({
        state: "live",
        events: [],
        updatedAt: "2026-09-02T12:00:00.000Z",
        range: { from: "2026-08-30", to: "2026-09-05" },
      }),
    },
  }));
  await agent.post("/auth/login").send({ username: "operator", passkey: "preview" }).expect(200);
  await agent.get("/home").expect(200).expect(/grid grid-4/).expect(/grid grid-2-1/).expect(/panel-kicker/).expect(/quicklink/);
  await agent.get("/indicators").expect(200).expect(/section-label/).expect(/empty/).expect(/panel howto/).expect(/code-row/);
  await agent.get("/market-news").expect(200).expect(/class="chips"/).expect(/class="empty"/);
  await agent.get("/alerts/ict").expect(200).expect(/class="toolbar"/).expect(/section-label/).expect(/class="empty"/);
});
