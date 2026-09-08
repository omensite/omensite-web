import test from "node:test";
import request from "supertest";
import { createApp } from "../../src/app.js";

test("health is public and reports ready dependencies", async () => {
  const app = createApp({
    sessionSecret: "test-secret",
    readinessCheck: async () => true,
  });

  const response = await request(app).get("/health").expect(200);
  assertHealth(response.body, "ok");
});

test("health fails closed without exposing dependency details", async () => {
  const app = createApp({
    sessionSecret: "test-secret",
    readinessCheck: async () => false,
  });

  const response = await request(app).get("/health").expect(503);
  assertHealth(response.body, "unavailable");
});

function assertHealth(body, status) {
  if (body?.status !== status) throw new Error(`expected health status ${status}`);
  if (Object.keys(body).some((key) => /database|secret|url/i.test(key))) {
    throw new Error("health response exposed internal dependency details");
  }
}
