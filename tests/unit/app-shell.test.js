import assert from "node:assert/strict";
import test from "node:test";
import { JSDOM } from "jsdom";
import { initializeAppShell } from "../../public/js/app-shell.js";

const homeFragment = `
  <section data-route-view data-route-key="home">
    <div class="stat-value muted" data-journal-count>0</div>
  </section>`;

test("home journal count hydrates from legacy local entries after full and fragment renders", async () => {
  const dom = new JSDOM(`<div data-shell-body><main data-main>${homeFragment}</main></div>`, {
    url: "http://localhost/home",
  });
  dom.window.matchMedia = () => ({ matches: true });
  dom.window.localStorage.setItem("omensite.journal.v1", JSON.stringify([
    { id: "legacy-1", direction: "long" },
  ]));
  const instance = initializeAppShell({
    documentRef: dom.window.document,
    windowRef: dom.window,
    fetchImpl: async () => new Response(homeFragment, {
      status: 200,
      headers: {
        "X-Omensite-Path": "/home",
        "X-Omensite-Title": "DASHBOARD",
        "X-Omensite-Key": "home",
      },
    }),
  });

  const initialCount = dom.window.document.querySelector("[data-journal-count]");
  assert.equal(initialCount.textContent, "1");
  assert.equal(initialCount.classList.contains("muted"), false);

  dom.window.localStorage.setItem("omensite.journal.v1", JSON.stringify([
    { id: "legacy-1", direction: "long" },
    { id: "legacy-2", direction: "short" },
  ]));
  await instance.navigator.navigate("/home");

  const fragmentCount = dom.window.document.querySelector("[data-journal-count]");
  assert.equal(fragmentCount.textContent, "2");
  assert.equal(fragmentCount.classList.contains("muted"), false);
  instance.dispose();
  dom.window.close();
});

test("home journal count retains accepted muted styling at zero", () => {
  const dom = new JSDOM(`<div data-shell-body><main data-main>${homeFragment}</main></div>`, { url: "http://localhost/home" });
  dom.window.matchMedia = () => ({ matches: true });
  const instance = initializeAppShell({ documentRef: dom.window.document, windowRef: dom.window, fetchImpl: async () => new Response() });

  const count = dom.window.document.querySelector("[data-journal-count]");
  assert.equal(count.textContent, "0");
  assert.equal(count.classList.contains("muted"), true);
  instance.dispose();
  dom.window.close();
});
