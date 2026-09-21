import test from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { fileURLToPath } from "node:url";
import ejs from "ejs";
import { JSDOM } from "jsdom";
import { initializeBrainPage } from "../../public/js/brain/brain-controller.js";

const filename = fileURLToPath(new URL("../../views/pages/brain.ejs", import.meta.url));
const template = readFileSync(filename, "utf8");
const state = { defaultProvider: "gemini", paidCallsEnabled: true, providers: [{ id: "gemini", model: "gemini-test", configured: true }, { id: "openai", model: "openai-test", configured: false }, { id: "claude", model: "claude-test", configured: true }], runs: [], documents: [] };
const response = (value, status = 200) => new Response(JSON.stringify(value), { status, headers: { "Content-Type": "application/json" } });
const tick = () => new Promise((resolve) => setImmediate(resolve));
function run(overrides = {}) {
  return { id: "run-1", version: 12, status: "awaiting_approval", createdAt: "2026-09-14T12:00:00Z", input: { symbol: "ES", provider: "gemini", mode: "demo" }, metrics: { modelCalls: 0, toolCalls: 6, inputTokens: 0, outputTokens: 0, estimatedCostUsd: 0, elapsedMs: 300, compactions: 1 },
    graph: { nodes: [{ id: "research", role: "researcher", label: "Gather evidence", status: "complete" }], edges: [] }, trace: [{ at: "2026-09-14T12:00:00Z", type: "tool", agent: "researcher", summary: "Read context", details: { tool: "context.read" } }], result: { proposalStatus: "ready", thesis: { bias: "long", summary: "Illustrative proposal", entry: 100, stop: 98, target: 106, invalidation: "Below 98", evidence: ["Reclaim [snapshot]"], missingData: [] }, risk: { passed: true, quantity: 2, maxLoss: 200, riskBudget: 250, rewardRisk: 3, reasons: [] }, review: { verdict: "pass", reason: "Demo reviewed" }, citations: [{ id: "snapshot", title: "Snapshot", excerpt: "Fictional prices" }] }, ...overrides };
}
function fixture(t, fetchImpl, options = {}) {
  const html = ejs.render(template, { page: { route: { key: "brain", title: "Agent Brain", uri: "brain", description: "Research control panel" } } }, { filename });
  const dom = new JSDOM(`<meta name="csrf-token" content="test-csrf">${html}`, { url: "http://localhost/brain" });
  const root = dom.window.document.querySelector("[data-brain]");
  const instance = initializeBrainPage(root, { fetchImpl, ...options });
  t.after(() => { instance.dispose(); dom.window.close(); });
  return { dom, root, instance, find: (name) => root.querySelector(`[data-brain-${name}]`), field: (name) => root.querySelector("form").elements.namedItem(name) };
}
test("Gemini defaults and unavailable role routes disable paid missions but keep demo", async (t) => {
  const app = fixture(t, async () => response(state)); await tick();
  assert.equal(app.field("provider").value, "gemini"); assert.equal(app.find("start").disabled, false);
  app.field("route_critic").value = "openai"; app.field("route_critic").dispatchEvent(new app.dom.window.Event("change", { bubbles: true }));
  assert.equal(app.find("start").disabled, true); assert.equal(app.find("demo").disabled, false);
  assert.match(app.find("provider").textContent, /API key/); assert.equal(app.root.querySelector('input[type="password"]'), null);
});
test("demo submits explicit role routes and budgets with CSRF then renders review", async (t) => {
  const calls = []; const app = fixture(t, async (url, options) => { calls.push({ url, options }); return response(url.endsWith("state") ? state : { run: run() }); }); await tick();
  app.field("route_critic").value = "claude"; app.field("maxCostUsd").value = "0.25"; app.find("demo").click(); await tick();
  const call = calls.find((item) => item.url.endsWith("runs")), body = JSON.parse(call.options.body);
  assert.equal(call.options.headers["X-CSRF-Token"], "test-csrf"); assert.equal(body.mode, "demo"); assert.equal(body.routes.critic, "claude"); assert.equal(body.limits.maxCostUsd, .25); assert.equal(body.limits.maxDurationMs, 120000);
  assert.equal(app.find("approval").hidden, false); assert.match(app.find("result").textContent, /2 whole units/); assert.match(app.find("trace").textContent, /CONTEXT|context/);
});
test("approval sends displayed version and review note and refreshes accepted memory", async (t) => {
  let decision; const app = fixture(t, async (url, options) => {
    if (url.endsWith("state")) return response({ ...state, runs: [run()] });
    if (url.endsWith("decision")) { decision = JSON.parse(options.body); return response({ run: run({ status: "completed", version: 14, approval: { decision: "approve", note: decision.note } }) }); }
    return response({ documents: [{ id: "run:run-1", title: "Approved ES research", kind: "memory", characters: 80 }] });
  }); await tick(); app.find("note").value = "Keep the lesson"; app.find("approve").click(); await tick();
  assert.deepEqual(decision, { version: 12, decision: "approve", note: "Keep the lesson" }); assert.equal(app.find("approval").hidden, true); assert.match(app.find("documents").textContent, /Approved ES research/);
});
test("conflicting approval preserves review and shows server message", async (t) => {
  const app = fixture(t, async (url) => url.endsWith("state") ? response({ ...state, runs: [run()] }) : response({ message: "The run changed. Reload it." }, 409)); await tick(); app.find("approve").click(); await tick();
  assert.equal(app.find("approval").hidden, false); assert.equal(app.find("approve").disabled, false); assert.match(app.find("feedback").textContent, /run changed/);
});
test("untrusted model, trace and document markup is displayed as text", async (t) => {
  const malicious = '<img src=x onerror="alert(1)">'; const value = run(); value.result.thesis.summary = malicious; value.trace[0].summary = malicious; value.result.citations[0].excerpt = malicious;
  const app = fixture(t, async () => response({ ...state, runs: [value], documents: [{ id: "d", title: malicious, kind: "knowledge", characters: 12 }] })); await tick();
  assert.equal(app.root.querySelector("img"), null); assert.match(app.find("result").textContent, /<img/); assert.match(app.find("documents").textContent, /<img/); assert.equal(app.dom.window.localStorage.length, 0);
});
test("polling advances a running mission to its approval checkpoint", async (t) => {
  let poll; const timers = []; const fakeWindow = { setTimeout(fn) { timers.push(fn); return timers.length; }, clearTimeout() {} };
  const app = fixture(t, async (url) => { if (url.endsWith("state")) return response({ ...state, runs: [run({ status: "running", result: null })] }); poll = url; return response({ run: run() }); }, { windowRef: fakeWindow }); await tick();
  assert.equal(app.find("cancel").hidden, false); await timers.at(-1)();
  assert.equal(poll, "/api/brain/runs/run-1"); assert.equal(app.find("cancel").hidden, true); assert.equal(app.find("approval").hidden, false);
});
test("cancellation targets the selected run and stops further polling", async (t) => {
  const calls = []; const app = fixture(t, async (url, options) => { calls.push({ url, options }); return response(url.endsWith("state") ? { ...state, runs: [run({ status: "running", result: null })] } : { run: run({ status: "cancelled", result: null }) }); }); await tick(); app.find("cancel").click(); await tick();
  assert.equal(calls[1].url, "/api/brain/runs/run-1/cancel"); assert.equal(calls[1].options.method, "POST"); assert.equal(app.find("status").textContent, "CANCELLED"); assert.equal(app.find("demo").disabled, false);
});
test("navigation disposal aborts pending requests without modifying a detached page", async (t) => {
  let signal; const app = fixture(t, (_url, options) => { signal = options.signal; return new Promise(() => {}); });
  app.instance.dispose(); assert.equal(signal.aborted, true);
});
test("failed initial state can be retried with Refresh", async (t) => {
  let attempts = 0; const app = fixture(t, async () => ++attempts === 1 ? response({ message: "Temporarily offline" }, 503) : response(state)); await tick();
  assert.match(app.find("feedback").textContent, /offline/); app.find("refresh").click(); await tick(); assert.equal(app.find("demo").disabled, false);
});
test("source form supports knowledge only and sends text with CSRF", async (t) => {
  let payload; const app = fixture(t, async (url, options) => { if (url.endsWith("state")) return response(state); if (options.method === "POST") { payload = JSON.parse(options.body); assert.equal(options.headers["X-CSRF-Token"], "test-csrf"); return response({ document: { id: "source" } }, 201); } return response({ documents: [{ id: "source", title: "ES lesson", kind: "knowledge", characters: 25 }] }); }); await tick();
  const form = app.find("document-form"); form.elements.title.value = "ES lesson"; form.elements.text.value = "Use dated session context.";
  form.dispatchEvent(new app.dom.window.Event("submit", { bubbles: true, cancelable: true })); await tick();
  assert.equal(payload.kind, "knowledge"); assert.equal(payload.text, "Use dated session context."); assert.equal(form.querySelector('option[value="memory"]'), null); assert.match(app.find("documents").textContent, /ES lesson/);
});
test("offline evaluation report renders actual passed and failed scenarios", async (t) => {
  const app = fixture(t, async (url) => response(url.endsWith("state") ? state : { passed: false, total: 2, failed: 1, durationMs: 12, cases: [{ id: "risk", name: "Risk", passed: true }, { id: "bad", name: "Budget", passed: false, detail: "Expected stop" }] })); await tick(); app.find("evals").click(); await tick();
  assert.match(app.find("eval-results").textContent, /1 \/ 2 passed/); assert.match(app.find("eval-results").textContent, /FAIL · Budget/); assert.equal(app.find("evals").disabled, false);
});

test("configured keys cannot unlock analysis without explicit server enablement", async (t) => {
  for (const flag of [false, undefined, "true"]) {
    const calls = []; const app = fixture(t, async (url) => { calls.push(url); return response({ ...state, paidCallsEnabled: flag }); }); await tick();
    assert.equal(app.find("start").disabled, true); assert.equal(app.find("demo").disabled, false); assert.equal(app.find("evals").disabled, false);
    assert.match(app.find("cost-lock").textContent, /Paid AI calls locked/);
    app.field("provider").value = "claude"; app.find("form").dispatchEvent(new app.dom.window.Event("change", { bubbles: true }));
    app.find("form").dispatchEvent(new app.dom.window.Event("submit", { bubbles: true, cancelable: true })); await tick();
    assert.equal(app.find("start").disabled, true); assert.deepEqual(calls, ["/api/brain/state"]);
  }
});

test("locked mode still runs the explicit offline demo", async (t) => {
  const calls = []; const app = fixture(t, async (url, options) => { calls.push({ url, options }); return response(url.endsWith("state") ? { ...state, paidCallsEnabled: false } : { run: run() }); }); await tick();
  app.find("demo").click(); await tick();
  assert.equal(JSON.parse(calls[1].options.body).mode, "demo"); assert.equal(app.find("approval").hidden, false);
  assert.match(app.find("cost-lock").textContent, /Paid AI calls locked/);
});

test("readiness renders server evidence as text and refreshes after offline checks", async (t) => {
  let evaluated = false; const hostile = '<img src=x onerror="alert(1)">';
  const app = fixture(t, async (url) => {
    if (url.endsWith("evals")) { evaluated = true; return response({ total: 1, failed: 0, durationMs: 5, cases: [{ name: "Offline controls", passed: true }] }); }
    return response({ ...state, paidCallsEnabled: false, readiness: { checkedAt: "2026-09-14T12:00:00Z", checks: [{ id: "evals", label: hostile, status: evaluated ? "ready" : "pending", detail: evaluated ? "1 offline check passed; live model quality remains unverified." : "No offline check yet." }, { id: "access", label: "Provider access", status: "locked", detail: "Server blocks paid calls." }] } });
  }); await tick();
  assert.equal(app.root.querySelector("img"), null); assert.match(app.find("readiness-checks").textContent, /<img/);
  assert.equal(app.find("readiness-checks").firstElementChild.dataset.status, "pending");
  assert.match(app.find("readiness-time").textContent, /^Checked /);
  app.find("evals").click(); await tick();
  assert.equal(app.find("readiness-checks").firstElementChild.dataset.status, "ready");
  assert.match(app.find("readiness-checks").textContent, /live model quality remains unverified/);
  assert.equal(app.find("start").disabled, true); assert.equal(app.find("evals").disabled, false);
});

test("failed readiness refresh disables paid submissions and disposed failures leave markup unchanged", async (t) => {
  let attempts = 0; const app = fixture(t, async () => ++attempts === 1 ? response(state) : response({ message: "Server unavailable" }, 503)); await tick();
  assert.equal(app.find("start").disabled, false); app.find("refresh").click(); await tick();
  assert.equal(app.find("start").disabled, true); assert.equal(app.find("demo").disabled, false);
  let fail; const detached = fixture(t, () => new Promise((_resolve, reject) => { fail = reject; }));
  detached.instance.dispose(); const before = detached.root.outerHTML; fail(new Error("Aborted")); await tick();
  assert.equal(detached.root.outerHTML, before);
});

test("network tabs preserve mission inputs and support keyboard navigation without model requests", async (t) => {
  const calls = [];
  const app = fixture(t, async (url) => { calls.push(url); return response({ ...state, paidCallsEnabled: false }); });
  await tick();
  const tab = (name) => app.root.querySelector(`[data-brain-view="${name}"]`);
  const panel = (name) => app.root.querySelector(`[data-brain-panel="${name}"]`);
  assert.equal(panel("network").hidden, false);
  assert.equal(panel("mission").hidden, true);
  app.find("open-mission").click();
  assert.equal(panel("mission").hidden, false);
  assert.equal(app.dom.window.document.activeElement, app.field("objective"));
  app.field("context").value = "Keep this unsent draft while inspecting the neural network.";
  tab("network").click();
  tab("network").dispatchEvent(new app.dom.window.KeyboardEvent("keydown", { key: "End", bubbles: true }));
  assert.equal(tab("checks").getAttribute("aria-selected"), "true");
  assert.equal(app.dom.window.document.activeElement, tab("checks"));
  tab("mission").click();
  assert.match(app.field("context").value, /Keep this unsent draft/);
  assert.equal(app.find("start").disabled, true);
  assert.deepEqual(calls, ["/api/brain/state"]);
});

test("network demo uses the real offline endpoint and exposes pending review without unlocking paid calls", async (t) => {
  const calls = [];
  const app = fixture(t, async (url, options) => {
    calls.push({ url, options });
    return response(url.endsWith("state") ? { ...state, paidCallsEnabled: false } : { run: run() });
  });
  await tick(); app.find("map-demo").click(); await tick();
  const sent = calls.find((call) => call.url === "/api/brain/runs");
  assert.equal(JSON.parse(sent.options.body).mode, "demo");
  assert.equal(app.find("map-demo").disabled, true);
  assert.equal(app.find("review-count").hidden, false);
  assert.equal(app.find("review-count").textContent, "1");
  assert.match(app.find("map-feedback").textContent, /ready for your review/);
  assert.equal(app.find("start").disabled, true);
});

test("network surfaces request failures while the mission panel is hidden", async (t) => {
  const app = fixture(t, async (url) => url.endsWith("state") ? response({ ...state, paidCallsEnabled: false })
    : response({ message: "Finish the existing research checkpoint first." }, 409));
  await tick(); app.find("map-demo").click(); await tick();
  assert.equal(app.root.querySelector('[data-brain-panel="mission"]').hidden, true);
  assert.match(app.find("map-feedback").textContent, /Finish the existing/);
  assert.equal(app.find("map-feedback").dataset.error, "true");
});
