import test from "node:test";
import assert from "node:assert/strict";
import request from "supertest";
import { JSDOM } from "jsdom";
import { createApp } from "../../src/app.js";

test("protected clean routes render full documents and fragments", async () => {
  const agent = request.agent(createApp({ sessionSecret: "test-secret" }));
  await agent.post("/auth/login").send({ username: "operator", passkey: "preview" }).expect(200);

  const response = await agent.get("/home").expect(200);
  assert.match(response.text, /data-statusbar/);
  assert.match(response.text, /data-sidebar/);
  assert.match(response.text, /data-main/);
  assert.match(response.text, /OMENSITE/);
  assert.match(response.text, /root@omensite:~\$/);
  assert.match(response.text, /SESSION 01 \/ AUTHORIZED/);

  const cases = [
    ["/home", "omensite://home"],
    ["/indicators", "omensite://indicators"],
    ["/market-news", "omensite://market-news"],
    ["/alerts/ict", "omensite://alerts/ict"],
    ["/alerts/support-resistance", "omensite://alerts/support-resistance"],
    ["/journal", "omensite://journal"],
    ["/journal/new", "omensite://journal/new"],
  ];

  for (const [path, identity] of cases) {
    await agent.get(path).expect(200).expect(/data-app-shell/).expect(new RegExp(identity));
    await agent.get(path).set("X-Omensite-Fragment", "1").expect(200)
      .expect(/data-route-view/).expect((response) => {
        assert.doesNotMatch(response.text, /data-app-shell/);
        assert.equal(response.headers["x-omensite-path"], path);
      });
  }
});

test("home quick-access links opt into fragment navigation", async () => {
  const agent = request.agent(createApp({ sessionSecret: "test-secret" }));
  await agent.post("/auth/login").send({ username: "operator", passkey: "preview" }).expect(200);

  const response = await agent.get("/home").expect(200);
  for (const path of ["/indicators", "/market-news", "/alerts/ict", "/alerts/support-resistance", "/journal"]) {
    assert.match(response.text, new RegExp(`<a href="${path}" data-nav-link>`));
  }
});

test("server-rendered shell anchors retain terminal row styling and route-title markup", async () => {
  const app = createApp({ sessionSecret: "test-secret" });
  const agent = request.agent(app);
  await agent.post("/auth/login").send({ username: "operator", passkey: "preview" }).expect(200);

  const [response, stylesheet] = await Promise.all([
    agent.get("/home").expect(200),
    request(app).get("/css/omensite.css").expect(200),
  ]);
  const dom = new JSDOM(response.text);
  const style = dom.window.document.createElement("style");
  style.textContent = stylesheet.text;
  dom.window.document.head.append(style);

  const navLink = dom.window.document.querySelector("[data-sidebar] .navitem");
  const routeTitle = dom.window.document.querySelector(".route-title");
  const navLinkStyle = dom.window.getComputedStyle(navLink);

  assert.equal(navLinkStyle.display, "block");
  assert.equal(navLinkStyle.textDecoration, "none");
  assert.equal(routeTitle.tagName, "DIV");
});

test("public journal fragments expose the concrete request path", async () => {
  const agent = request.agent(createApp({ sessionSecret: "test-secret" }));
  await agent.post("/auth/login").send({ username: "operator", passkey: "preview" }).expect(200);

  await agent.get("/journal/entry-42").set("X-Omensite-Fragment", "1")
    .expect(200)
    .expect("X-Omensite-Path", "/journal/entry-42")
    .expect("X-Omensite-Key", "journal-public");
});
