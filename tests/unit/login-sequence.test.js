import assert from "node:assert/strict";
import test from "node:test";
import { JSDOM } from "jsdom";
import { initializeLoginController } from "../../public/js/login-controller.js";
import { AUTH_LINES, runLoginSequence } from "../../public/js/login-sequence.js";

test("login sequence emits every handshake line before grant and completion", async () => {
  const events = [];
  await runLoginSequence({
    reducedMotion: true,
    delay: async () => {},
    onLine: (line) => events.push(line),
    onGrant: () => events.push("ACCESS GRANTED"),
    onComplete: () => events.push("COMPLETE"),
  });

  assert.deepEqual(events, [...AUTH_LINES, "ACCESS GRANTED", "COMPLETE"]);
});

test("login sequence keeps the six established handshake messages", () => {
  assert.deepEqual(AUTH_LINES, [
    "HANDSHAKE........OK",
    "TOKEN_CHECK......OK",
    "ROUTE_MAP........OK",
    "UI_KERNEL........OK",
    "MOTION_SYSTEM....OK",
    "ACCESS_GRANT.....OK",
  ]);
});

test("login sequence uses the specified timing profile for each motion preference", async () => {
  const standardDelays = [];
  await runLoginSequence({
    reducedMotion: false,
    delay: async (milliseconds) => standardDelays.push(milliseconds),
  });
  assert.deepEqual(standardDelays, [230, 230, 230, 230, 230, 230, 360, 1700]);

  const reducedDelays = [];
  await runLoginSequence({
    reducedMotion: true,
    delay: async (milliseconds) => reducedDelays.push(milliseconds),
  });
  assert.deepEqual(reducedDelays, [80, 80, 80, 80, 80, 80, 140, 650]);
});

test("reduced-motion grant replaces the login card with the granted screen", async () => {
  const dom = new JSDOM(`
    <section data-login-root>
      <div class="login-card">
        <form data-login-form>
          <input data-login-user value="operator">
          <input data-login-passkey value="preview">
          <div data-login-error hidden></div>
          <button data-login-submit type="submit">[ LOGIN ]</button>
        </form>
      </div>
    </section>
  `, { url: "http://localhost/login" });
  dom.window.matchMedia = () => ({ matches: true });
  const controller = initializeLoginController({
    documentRef: dom.window.document,
    windowRef: dom.window,
    fetchImpl: async () => new Response(JSON.stringify({ ok: true, redirectTo: "#granted" }), {
      status: 200,
      headers: { "Content-Type": "application/json" },
    }),
  });

  try {
    dom.window.document.querySelector("[data-login-form]")
      .dispatchEvent(new dom.window.Event("submit", { bubbles: true, cancelable: true }));
    await new Promise((resolve) => dom.window.setTimeout(resolve, 1000));

    assert.ok(dom.window.document.querySelector(".auth-granted"));
    assert.equal(dom.window.document.querySelector(".login-card"), null);
  } finally {
    controller.dispose();
    dom.window.close();
  }
});

test("Discord completion marker starts the same grant sequence without a demo form", async () => {
  const dom = new JSDOM(`
    <section data-login-root>
      <div class="login-card"><div data-auth-complete data-redirect-to="#discord-granted"></div></div>
    </section>
  `, { url: "http://localhost/auth/complete" });
  dom.window.matchMedia = () => ({ matches: true });
  const controller = initializeLoginController({
    documentRef: dom.window.document,
    windowRef: dom.window,
    fetchImpl: async () => { throw new Error("completion must not submit"); },
  });

  try {
    await new Promise((resolve) => dom.window.setTimeout(resolve, 1400));
    assert.ok(dom.window.document.querySelector(".auth-granted"));
    assert.equal(dom.window.document.querySelector(".login-card"), null);
  } finally {
    controller.dispose();
    dom.window.close();
  }
});
