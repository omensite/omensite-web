import test from "node:test";
import assert from "node:assert/strict";
import { JSDOM } from "jsdom";
import { buildBrainNetworkData, createBrainNetwork } from "../../public/js/brain/brain-network.js";

const tools = ["context.read", "knowledge.search", "memory.search", "journal.search", "calendar.read", "risk.check"].map((name) => ({ name, description: `${name} description` }));
const run = { id: "r1", status: "completed", input: { symbol: "ES", mode: "demo", provider: "gemini", objective: "Review the supplied market context" },
  graph: { nodes: [{ role: "researcher", status: "complete" }] }, trace: [{ at: "2026-09-14T12:00:00Z", agent: "researcher", type: "tool", summary: "Read the market snapshot", details: { tool: "context.read" } }] };
const state = { defaultProvider: "gemini", paidCallsEnabled: false, providers: [{ id: "gemini", label: "Gemini", model: "test-model" }], runs: [run], selectedRun: run, toolDefinitions: tools, documents: [{ id: "d1", kind: "memory", title: "Reviewed ES lesson", characters: 87 }] };

function fixture(t, options = {}, beforeCreate = () => {}) {
  const dom = new JSDOM('<div data-network-host></div>'); const host = dom.window.document.querySelector("[data-network-host]"); beforeCreate(dom.window);
  const instance = createBrainNetwork(host, options); t.after(() => { instance.dispose(); dom.window.close(); });
  return { dom, host, instance, find: (selector) => host.querySelector(selector) };
}

function canvasHarness({ reducedMotion = false } = {}) {
  const frames = new Map(), disconnected = []; let next = 0, paints = 0, operations = [], intersection, hidden = false, motionChange;
  const context = {
    clearRect() { paints += 1; operations = []; },
    setTransform() {}, createRadialGradient() { return { addColorStop() {} }; },
  };
  for (const name of ["fillRect", "fillText", "beginPath", "moveTo", "lineTo", "quadraticCurveTo", "stroke", "arc", "ellipse"]) {
    context[name] = (...args) => operations.push([name, ...args]);
  }
  return {
    frames, disconnected, get paints() { return paints; }, snapshot: () => JSON.stringify(operations),
    install(window) {
      window.CanvasRenderingContext2D = function () {};
      window.HTMLCanvasElement.prototype.getContext = () => context;
      window.requestAnimationFrame = (callback) => { frames.set(++next, callback); return next; };
      window.cancelAnimationFrame = (id) => frames.delete(id);
      window.ResizeObserver = class { observe() {} disconnect() { disconnected.push("resize"); } };
      window.IntersectionObserver = class { constructor(callback) { intersection = callback; } observe() {} disconnect() { disconnected.push("intersection"); } };
      window.matchMedia = () => ({ matches: reducedMotion, addEventListener(type, callback) { motionChange = callback; }, removeEventListener() { motionChange = null; } });
      Object.defineProperty(window.document, "hidden", { get: () => hidden, configurable: true });
    },
    step(time) {
      assert.equal(frames.size, 1, "one animation frame should be scheduled");
      const [id, callback] = frames.entries().next().value; frames.delete(id); callback(time);
    },
    setIntersection(value) { intersection([{ isIntersecting: value }]); },
    setHidden(window, value) { hidden = value; window.document.dispatchEvent(new window.Event("visibilitychange")); },
    setReducedMotion(value) { motionChange?.({ matches: value }); },
  };
}

test("network reports actual saved counts and bounded source nodes without fabricated usage", () => {
  const documents = Array.from({ length: 14 }, (_, index) => ({ id: `d${index}`, title: `Source ${index}`, kind: index < 3 ? "memory" : "knowledge", characters: index + 1 }));
  const data = buildBrainNetworkData({ ...state, documents });
  assert.deepEqual(data.counts, { agents: 4, tools: 6, documents: 14, memories: 3, runs: 1 });
  assert.equal(data.nodes.filter((node) => node.kind === "memory").length, 6);
  assert.equal(data.nodes.filter((node) => node.kind === "run").length, 1);
  assert.equal(data.nodes.find((node) => node.id === "tool:context.read").observations, 1);
  assert.equal(Object.hasOwn(data.counts, "tokens"), false);
  assert.equal(buildBrainNetworkData().counts.tools, 0);
  assert.equal(buildBrainNetworkData().counts.runs, 0);
});

test("tool connections follow the most recent valid recorded agent", () => {
  const selectedRun = { ...run, trace: [
    { agent: "researcher", details: { tool: "context.read" } },
    { agent: "critic", details: { tool: "context.read" } },
    { agent: "unknown", details: { tool: "context.read" } },
  ] };
  const data = buildBrainNetworkData({ ...state, selectedRun });
  assert.equal(data.nodes.find((node) => node.id === "tool:context.read").parent, "agent:critic");
  assert.equal(data.nodes.find((node) => node.id === "tool:calendar.read").parent, "agent:researcher");
  assert.equal(data.nodes.find((node) => node.id === "tool:risk.check").parent, "agent:strategist");
});

test("provider routes use saved mission overrides before the selected default", () => {
  const providers = [{ id: "claude", label: "Claude", model: "c-test" }, ...state.providers];
  const initial = buildBrainNetworkData({ providers, defaultProvider: "claude" });
  assert.match(initial.nodes.find((node) => node.id === "agent:planner").provider, /Claude.*default route/);
  const selectedRun = { ...run, input: { ...run.input, mode: "analysis", routes: { planner: "claude" } } };
  const routed = buildBrainNetworkData({ ...state, providers, selectedRun });
  assert.match(routed.nodes.find((node) => node.id === "agent:planner").provider, /Claude/);
  assert.match(routed.nodes.find((node) => node.id === "agent:researcher").provider, /Gemini/);
  assert.match(buildBrainNetworkData(state).nodes.find((node) => node.id === "agent:planner").provider, /Offline demo · no model calls/);
});

test("accessible controls work without canvas or paid access", (t) => {
  const app = fixture(t); app.instance.update(state);
  assert.equal(app.find("canvas").getAttribute("aria-hidden"), "true");
  assert.equal(app.host.querySelectorAll('[data-network-node^="tool:"]').length, 6);
  assert.match(app.find(".brain-network-lock").textContent, /LOCKED/);
  assert.match(app.find(".brain-network-inspector").textContent, /uses no AI tokens/);
  assert.match(app.find(".brain-network-activity").textContent, /Read the market snapshot/);
  assert.match(app.find(".brain-network-current-mission").textContent, /OFFLINE DEMO/);
});

test("node filters and selection inspect real entity data and navigate without requests", (t) => {
  const navigations = [], app = fixture(t, { onNavigate: (panel) => navigations.push(panel) }); app.instance.update(state);
  const planner = app.find('[data-network-node="agent:planner"]'); planner.click();
  assert.equal(planner.getAttribute("aria-pressed"), "true"); assert.match(app.find(".brain-network-inspector").textContent, /Decomposes the objective/);
  app.find('[data-network-filter="tool"]').click();
  assert.equal(planner.hidden, true); assert.equal(app.find('[data-network-node="omen"]').hidden, false);
  const context = app.find('[data-network-node="tool:context.read"]'); assert.equal(context.hidden, false); context.click();
  assert.match(app.find(".brain-network-inspector").textContent, /1 matching trace events/);
  app.find('[data-network-navigate="mission"]').click();
  app.find('[data-network-filter="memory"]').click(); app.find('[data-network-node="document:d1"]').click();
  assert.match(app.find(".brain-network-inspector").textContent, /Saved after human review/);
  app.find('[data-network-navigate="knowledge"]').click(); assert.deepEqual(navigations, ["mission", "knowledge"]);
});

test("untrusted source and trace text never becomes markup", (t) => {
  const app = fixture(t), hostile = '<img src=x onerror="alert(1)">';
  app.instance.update({ ...state, documents: [{ id: "hostile", title: hostile, kind: "knowledge", characters: 40 }], selectedRun: { ...run, trace: [{ agent: hostile, summary: hostile }] } });
  app.find('[data-network-node="document:hostile"]').click();
  assert.equal(app.host.querySelector("img"), null); assert.match(app.find(".brain-network-inspector").textContent, /<img/); assert.match(app.find(".brain-network-activity").textContent, /<img/);
});

test("polling preserves keyboard focus on a surviving node and its inspector action", (t) => {
  const app = fixture(t); app.instance.update(state);
  const source = app.find('[data-network-node="document:d1"]'); source.focus(); source.click();
  app.instance.update({ ...state, documents: [{ id: "new", title: "New playbook", kind: "knowledge", characters: 22 }, ...state.documents] });
  assert.equal(app.dom.window.document.activeElement, source);
  assert.equal(source.getAttribute("aria-pressed"), "true");
  assert.match(app.find(".brain-network-inspector").textContent, /Reviewed ES lesson/);
  app.find('[data-network-navigate="knowledge"]').focus();
  app.instance.update(state);
  assert.equal(app.dom.window.document.activeElement.dataset.networkNavigate, "knowledge");
  app.find('[aria-label="Zoom in"]').focus();
  app.instance.update(state);
  assert.equal(app.dom.window.document.activeElement.getAttribute("aria-label"), "Zoom in");
});

test("zoom changes the projection and reset restores it within bounds", (t) => {
  const app = fixture(t), planner = app.find('[data-network-node="agent:planner"]'), original = planner.style.left;
  app.find('[aria-label="Zoom in"]').click(); assert.equal(app.find(".brain-network-zoom").textContent, "110%"); assert.notEqual(planner.style.left, original);
  for (let index = 0; index < 20; index++) app.find('[aria-label="Zoom in"]').click();
  assert.equal(app.find(".brain-network-zoom").textContent, "145%"); assert.equal(app.find('[aria-label="Zoom in"]').disabled, true);
  app.find('[aria-label="Reset network view"]').click(); assert.equal(planner.style.left, original); assert.equal(app.find(".brain-network-zoom").textContent, "100%");
});

test("empty state does not invent missions or activity", (t) => {
  const app = fixture(t); assert.match(app.find(".brain-network-activity").textContent, /No mission activity yet/);
  assert.equal(app.host.querySelectorAll('[data-network-node^="run:"]').length, 0);
  assert.match(app.find(".brain-network-stats").textContent, /Available tools0Saved sources0Saved missions0/);
  app.instance.update({ ...state, paidCallsEnabled: "true" }); assert.match(app.find(".brain-network-lock").textContent, /LOCKED/);
});

test("disposal removes controls, prevents rendering, and disconnects animation observers", (t) => {
  const harness = canvasHarness(), navigations = [];
  const app = fixture(t, { onNavigate: (panel) => navigations.push(panel) }, harness.install);
  assert.equal(harness.frames.size, 1);
  harness.setIntersection(false); assert.equal(harness.frames.size, 0);
  harness.setIntersection(true); assert.equal(harness.frames.size, 1);
  app.find('[aria-label="Pause network motion"]').click(); assert.equal(harness.frames.size, 0);
  app.find('[aria-label="Resume network motion"]').click(); assert.equal(harness.frames.size, 1);
  app.instance.dispose(); assert.equal(harness.frames.size, 0); assert.deepEqual(harness.disconnected, ["resize", "intersection"]);
  const before = app.host.innerHTML; app.instance.update(state); app.instance.refresh(); app.find('[aria-label="Zoom in"]').click(); app.find('[data-network-navigate="mission"]').click();
  assert.equal(app.host.innerHTML, before); assert.deepEqual(navigations, []);
});

test("reduced-motion preference starts paused and does not schedule decorative rendering", (t) => {
  const harness = canvasHarness({ reducedMotion: true }), app = fixture(t, {}, harness.install);
  assert.ok(app.find('[aria-label="Resume network motion"]')); assert.equal(harness.frames.size, 0);
  assert.equal(app.find(".brain-network-shell").dataset.motion, "paused");
  harness.setReducedMotion(false); assert.equal(harness.frames.size, 1);
  harness.setReducedMotion(true); assert.equal(harness.frames.size, 0);
});

test("idle decorative animation continues at a bounded paint rate and pause preserves its exact phase", (t) => {
  const harness = canvasHarness(), app = fixture(t, {}, harness.install);
  assert.equal(app.find(".brain-network-shell").dataset.motion, "running");
  assert.match(app.find(".brain-network-mode").textContent, /IDLE/);
  assert.match(app.find(".brain-network-decoration-note").textContent, /DECORATIVE.*ZERO AI TOKENS/);
  harness.step(0); const first = harness.snapshot(), paints = harness.paints;
  harness.step(10); harness.step(20); assert.equal(harness.paints, paints, "skip paints above 30 fps");
  harness.step(34); assert.equal(harness.paints, paints + 1); assert.notEqual(harness.snapshot(), first);
  const moving = harness.snapshot();
  app.find('[aria-label="Pause network motion"]').click();
  assert.equal(harness.frames.size, 0); assert.equal(harness.snapshot(), moving, "pause must not reset the animation phase");
  assert.equal(app.find(".brain-network-shell").dataset.motion, "paused");
  app.instance.refresh(); assert.equal(harness.snapshot(), moving, "layout refresh keeps the paused phase");
  app.find('[aria-label="Resume network motion"]').click(); harness.step(90000);
  assert.equal(harness.snapshot(), moving, "time spent paused must not advance the scene");
  harness.step(90040); assert.notEqual(harness.snapshot(), moving);
  assert.match(app.find(".brain-network-activity").textContent, /No mission activity yet/);
});

test("background tabs and hidden panels suspend rendering without losing the current phase", (t) => {
  const harness = canvasHarness(), app = fixture(t, {}, harness.install);
  harness.step(0); harness.step(50); const current = harness.snapshot();
  harness.setHidden(app.dom.window, true); assert.equal(harness.frames.size, 0);
  assert.equal(app.find(".brain-network-shell").dataset.motion, "paused");
  harness.setHidden(app.dom.window, false); harness.step(100000);
  assert.equal(harness.snapshot(), current); assert.equal(harness.frames.size, 1);
  app.host.hidden = true; harness.step(100040); assert.equal(harness.frames.size, 0);
  app.host.hidden = false; app.instance.refresh(); harness.step(200000);
  assert.equal(harness.snapshot(), current);
  harness.setIntersection(false); assert.equal(harness.frames.size, 0);
  harness.setIntersection(true); harness.step(300000); assert.equal(harness.snapshot(), current);
  const paints = harness.paints; app.instance.dispose(); app.instance.refresh(); assert.equal(harness.paints, paints);
});
