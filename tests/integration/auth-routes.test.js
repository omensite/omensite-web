import test from "node:test";
import request from "supertest";
import { createApp } from "../../src/app.js";

test("login establishes and logout removes the operator session", async () => {
  const agent = request.agent(createApp({ sessionSecret: "test-secret" }));
  await agent.get("/home").expect(302).expect("Location", "/login");
  await agent.post("/auth/login").send({ username: "operator", passkey: "preview" }).expect(200);
  await agent.get("/home").expect(200);
  await agent.post("/auth/logout").expect(200);
  await agent.get("/home").expect(302).expect("Location", "/login");
});

test("fragment requests receive 401 instead of a redirect", async () => {
  await request(createApp({ sessionSecret: "test-secret" }))
    .get("/home")
    .set("X-Omensite-Fragment", "1")
    .expect(401)
    .expect({ error: "AUTH_REQUIRED", loginUrl: "/login" });
});

test("root and login recover to the correct page from every session state", async () => {
  const app = createApp({ sessionSecret: "test-secret" });
  await request(app).get("/").expect(302).expect("Location", "/login");
  await request(app).get("/login").expect(200).expect(/data-login-root/);

  const agent = request.agent(app);
  await agent.post("/auth/login").send({ username: "cinematic", passkey: "refresh" }).expect(200);
  await agent.get("/").expect(302).expect("Location", "/home");
  await agent.get("/login").expect(302).expect("Location", "/home");
  await agent.get("/home").expect(200).expect(/data-app-shell/);
});
