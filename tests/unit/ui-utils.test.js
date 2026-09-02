import assert from "node:assert/strict";
import test from "node:test";
import { JSDOM } from "jsdom";
import { createDrawerController } from "../../public/js/ui-utils.js";

test("drawer maintains aria-expanded and closes on Escape", () => {
  const dom = new JSDOM(`
    <button data-nav-toggle aria-expanded="false"></button>
    <div data-shell-body><button data-nav-scrim></button></div>
  `);
  const drawer = createDrawerController({ documentRef: dom.window.document });
  const toggle = dom.window.document.querySelector("[data-nav-toggle]");
  const body = dom.window.document.querySelector("[data-shell-body]");

  toggle.click();
  assert.equal(body.classList.contains("nav-open"), true);
  assert.equal(toggle.getAttribute("aria-expanded"), "true");

  dom.window.document.dispatchEvent(new dom.window.KeyboardEvent("keydown", { key: "Escape", bubbles: true }));
  assert.equal(body.classList.contains("nav-open"), false);
  assert.equal(toggle.getAttribute("aria-expanded"), "false");
  drawer.dispose();
});
