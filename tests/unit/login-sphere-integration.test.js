import test from "node:test";
import assert from "node:assert/strict";
import request from "supertest";
import { JSDOM } from "jsdom";
import { createApp } from "../../src/app.js";
import { initializeLoginController } from "../../public/js/login-controller.js";

test("login controller hydrates and disposes the accepted animated 34x12 sphere", async () => {
  const response = await request(createApp({ sessionSecret: "test-secret" })).get("/login").expect(200);
  const dom = new JSDOM(response.text, { url: "http://localhost/login" });
  let intervalDelay;
  let intervalCallback;
  let clearedInterval;
  dom.window.matchMedia = () => ({ matches: false });
  dom.window.setInterval = (callback, delay) => {
    intervalCallback = callback;
    intervalDelay = delay;
    return 73;
  };
  dom.window.clearInterval = (id) => { clearedInterval = id; };

  const sphere = dom.window.document.querySelector("[data-sphere]");
  assert.equal(sphere.dataset.cols, "34");
  assert.equal(sphere.dataset.rows, "12");

  const controller = initializeLoginController({
    documentRef: dom.window.document,
    windowRef: dom.window,
    fetchImpl: async () => new Response("{}", { status: 400 }),
  });

  const firstFrame = sphere.textContent.split("\n");
  assert.equal(firstFrame.length, 12);
  assert.ok(firstFrame.every((line) => line.length === 34));
  assert.equal(intervalDelay, 60);
  const before = sphere.textContent;
  intervalCallback();
  assert.notEqual(sphere.textContent, before);

  controller.dispose();
  assert.equal(clearedInterval, 73);
  dom.window.close();
});

test("reduced-motion sphere renders one frame without scheduling an interval", async () => {
  const response = await request(createApp({ sessionSecret: "test-secret" })).get("/login").expect(200);
  const dom = new JSDOM(response.text, { url: "http://localhost/login" });
  let intervals = 0;
  dom.window.matchMedia = () => ({ matches: true });
  dom.window.setInterval = () => { intervals += 1; return 99; };

  const controller = initializeLoginController({
    documentRef: dom.window.document,
    windowRef: dom.window,
    fetchImpl: async () => new Response("{}", { status: 400 }),
  });

  assert.equal(dom.window.document.querySelector("[data-sphere]").textContent.split("\n").length, 12);
  assert.equal(intervals, 0);
  controller.dispose();
  dom.window.close();
});
