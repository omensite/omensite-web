import assert from "node:assert/strict";
import test from "node:test";
import { JSDOM } from "jsdom";
import { createTransitionController } from "../../public/js/transition-controller.js";

test("show and hide control the routing overlay", () => {
  const dom = new JSDOM("<main data-main></main>");
  const transition = createTransitionController({ documentRef: dom.window.document, reducedMotion: true });

  transition.show("MARKET NEWS");

  assert.match(dom.window.document.body.textContent, /ROUTING::MARKET NEWS/);
  assert.equal(dom.window.document.querySelectorAll(".route-xn").length, 1);

  transition.hide();
  transition.hide();

  assert.equal(dom.window.document.querySelector(".route-xn"), null);
});

test("show replaces an existing overlay and fail preserves the failure copy", () => {
  const dom = new JSDOM("<main data-main></main>");
  const transition = createTransitionController({ documentRef: dom.window.document, reducedMotion: true });

  transition.show("HOME");
  transition.show("JOURNAL");
  transition.fail("ROUTE LOAD FAILED :: CURRENT BUFFER RETAINED");

  assert.equal(dom.window.document.querySelectorAll(".route-xn").length, 1);
  assert.match(dom.window.document.body.textContent, /ROUTE LOAD FAILED :: CURRENT BUFFER RETAINED/);
});

test("show treats an interpolated route title as text", () => {
  const dom = new JSDOM("<main data-main></main>");
  const transition = createTransitionController({ documentRef: dom.window.document });

  transition.show('NEWS <img src="x" onerror="alert(1)">');

  assert.equal(dom.window.document.querySelector(".route-xn img"), null);
  assert.match(dom.window.document.querySelector(".route-xn-title").textContent, /<img src="x" onerror="alert\(1\)">/);
});
