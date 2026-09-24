import test from "node:test";
import assert from "node:assert/strict";
import { mkdtemp, rm } from "node:fs/promises";
import { tmpdir } from "node:os";
import path from "node:path";
import { createSqliteBrokerRepository, createMemoryBrokerRepository } from "../../src/brokers/broker-repository.js";
import { createRobinhoodService } from "../../src/brokers/robinhood-service.js";
import { createBrokerCipher, createRobinhoodClient, readRobinhoodConfig } from "../../src/brokers/robinhood-client.js";
import { robinhoodToolKind } from "../../src/brokers/robinhood-catalog.js";
import { robinhoodHarness, sampleOrder, orderInput } from "../helpers/robinhood-test-helpers.js";

test("Robinhood configuration preserves live lock and validates callback/encryption setup", () => {
  const env = { ROBINHOOD_TOKEN_ENCRYPTION_KEY: "ab".repeat(32), DISCORD_REDIRECT_URI: "https://beta.omensite.com/auth/discord/callback", NODE_ENV: "production" };
  assert.equal(readRobinhoodConfig(env).redirectUri, "https://beta.omensite.com/auth/robinhood/callback");
  assert.equal(readRobinhoodConfig(env).configured, true);
  assert.equal(readRobinhoodConfig(env).liveEnabled, false);
  for (const url of ["http://beta.omensite.com/auth/robinhood/callback", "https://u:p@example.com/auth/robinhood/callback", "https://example.com/other", "https://example.com/auth/robinhood/callback#token"]) assert.equal(readRobinhoodConfig({ ...env, ROBINHOOD_REDIRECT_URI: url }).configured, false);
});

test("encrypted credentials cannot be moved between users or decrypted after tampering", () => {
  const cipher = createBrokerCipher("ab".repeat(32)), sealed = cipher.seal("a", { accessToken: "secret-fixture" });
  assert.doesNotMatch(JSON.stringify(sealed), /secret-fixture/);
  assert.equal(cipher.open("a", sealed).accessToken, "secret-fixture");
  assert.throws(() => cipher.open("b", sealed), { code: "ROBINHOOD_RECONNECT" });
  assert.throws(() => cipher.open("a", { ...sealed, data: sealed.data.slice(4) }), { code: "ROBINHOOD_RECONNECT" });
});

test("public OAuth client uses PKCE, exact redirect, resource binding, and refreshed credentials", async () => {
  const calls = [];
  const client = createRobinhoodClient({ fetchImpl: async (url, options) => {
    calls.push({ url, ...options });
    return new Response(JSON.stringify(url.endsWith("register") ? { client_id: "fixture-client" } : { access_token: "token", refresh_token: "refresh", token_type: "Bearer", expires_in: 3600 }));
  } });
  const { pending, authorizationUrl } = await client.begin("https://omensite.test/auth/robinhood/callback");
  const url = new URL(authorizationUrl);
  assert.equal(url.origin, "https://robinhood.com"); assert.equal(url.searchParams.get("code_challenge_method"), "S256");
  assert.notEqual(url.searchParams.get("code_challenge"), pending.verifier);
  const credentials = await client.complete(pending, "fixture-code");
  await client.refresh(credentials);
  const exchange = new URLSearchParams(calls[1].body);
  assert.equal(exchange.get("code_verifier"), pending.verifier);
  assert.equal(exchange.get("redirect_uri"), pending.redirectUri);
  assert.equal(exchange.get("resource"), "https://agent.robinhood.com/mcp/trading");
  assert.ok(calls.every((item) => item.redirect === "error"));
});

test("ephemeral stores cannot hold a connected brokerage account", async () => {
  const h = robinhoodHarness();
  const service = createRobinhoodService({ repository: createMemoryBrokerRepository(), config: h.config, client: h.client });
  await assert.rejects(() => service.begin("owner"), { code: "ROBINHOOD_CONFIG" });
});

test("discovery uses a static policy, not an untrusted read-only annotation; public state omits tokens", async () => {
  for (const name of ["constructor", "__proto__", "toString", "send_money"]) assert.equal(robinhoodToolKind(name), "blocked");
  const h = robinhoodHarness(); await h.connect();
  const state = await h.service.state("owner");
  assert.equal(state.tools.some((tool) => tool.name === "send_money"), false);
  assert.doesNotMatch(JSON.stringify(state), /fixture-token|fixture-refresh|sealed|accessToken/);
  assert.equal((await h.service.state("other")).connected, false);
  await assert.rejects(() => h.service.read("owner", "send_money", {}), { code: "ROBINHOOD_TOOL_DENIED" });
  await assert.rejects(() => h.service.read("owner", "place_equity_order", {}), { code: "ROBINHOOD_TOOL_DENIED" });
});

test("account reads validate discovered schemas and save owner-scoped snapshots", async () => {
  const h = robinhoodHarness(); await h.connect();
  await assert.rejects(() => h.service.read("owner", "get_equity_quotes", { symbols: "EXAMPLE" }), { code: "ROBINHOOD_INPUT" });
  assert.equal(h.invocations.length, 0);
  const snapshot = await h.service.read("owner", "get_equity_quotes", { symbols: ["EXAMPLE"] });
  assert.equal((await h.service.state("owner")).snapshots[0].id, snapshot.id);
  assert.deepEqual((await h.service.state("other")).snapshots, []);
});

for (const asset of ["equity", "option", "crypto"]) test(`${asset} requests use the matching broker preview; live lock prevents dispatch`, async () => {
  const h = robinhoodHarness(); await h.connect();
  const action = await h.service.propose("owner", sampleOrder(`place_${asset}_order`));
  assert.equal(action.status, "awaiting_approval"); assert.ok(action.preview);
  assert.equal(h.invocations[0].name, asset === "crypto" ? "preview_crypto_order" : `review_${asset}_order`);
  await assert.rejects(() => h.service.decide("owner", action.id, { decision: "approve", version: 1 }), { code: "ROBINHOOD_LIVE_LOCKED" });
  assert.equal(h.invocations.some((item) => item.name.startsWith("place_")), false);
});

test("broker requests and encrypted connection survive a fresh SQLite repository", async (t) => {
  const directory = await mkdtemp(path.join(tmpdir(), "omen-robinhood-"));
  const filename = path.join(directory, "broker.sqlite"), repo = createSqliteBrokerRepository(filename);
  const h = robinhoodHarness({ repository: repo }); await h.connect();
  const action = await h.service.propose("owner", sampleOrder());
  assert.doesNotMatch(JSON.stringify(await repo.read("owner")), /fixture-token|fixture-refresh/);
  await repo.close();
  const fresh = createSqliteBrokerRepository(filename); t.after(async () => { await fresh.close(); await rm(directory, { recursive: true, force: true }); });
  const resumed = robinhoodHarness({ repository: fresh });
  assert.equal((await resumed.service.state("owner")).actions[0].id, action.id);
  await resumed.service.read("owner", "get_accounts", {});
});

test("concurrent approvals dispatch once and replay never repeats an order", async () => {
  const h = robinhoodHarness({ liveEnabled: true }); await h.connect(); await h.service.pause("owner", false);
  const action = await h.service.propose("owner", sampleOrder());
  const outcomes = await Promise.allSettled([1, 2].map(() => h.service.decide("owner", action.id, { decision: "approve", version: 1 })));
  assert.equal(outcomes.filter((item) => item.status === "fulfilled").length, 1);
  assert.equal(h.invocations.filter((item) => item.name === "place_equity_order").length, 1);
  await assert.rejects(() => h.service.decide("owner", action.id, { decision: "approve", version: 1 }), { code: "ROBINHOOD_CONFLICT" });
});

test("unknown broker outcome is durable and blocks subsequent submissions", async () => {
  const h = robinhoodHarness({ liveEnabled: true, call: async (name) => { if (name.startsWith("place_")) throw new Error("timeout"); return { structuredContent: {}, content: [] }; } });
  await h.connect(); await h.service.pause("owner", false);
  const action = await h.service.propose("owner", sampleOrder());
  await assert.rejects(() => h.service.decide("owner", action.id, { decision: "approve", version: 1 }), { code: "ROBINHOOD_OUTCOME_UNKNOWN" });
  assert.equal((await h.service.state("owner")).actions[0].status, "unknown");
  const next = await h.service.propose("owner", { ...sampleOrder(), requestId: "another-request", arguments: { ...sampleOrder().arguments, quantity: 2 } });
  await assert.rejects(() => h.service.decide("owner", next.id, { decision: "approve", version: 1 }), { code: "ROBINHOOD_UNRESOLVED" });
});

test("expired, paused, wrong-owner, and replaced-connection approvals cannot dispatch", async () => {
  let time = Date.now(); const h = robinhoodHarness({ liveEnabled: true, now: () => time }); await h.connect();
  const action = await h.service.propose("owner", sampleOrder());
  await assert.rejects(() => h.service.decide("owner", action.id, { decision: "approve", version: 1 }), { code: "ROBINHOOD_PAUSED" });
  await h.connect("other"); await h.service.pause("other", false);
  await assert.rejects(() => h.service.decide("other", action.id, { decision: "approve", version: 1 }), { code: "ROBINHOOD_NOT_FOUND" });
  await h.service.pause("owner", false); time += 60001;
  await assert.rejects(() => h.service.decide("owner", action.id, { decision: "approve", version: 1 }), { code: "ROBINHOOD_EXPIRED" });
  await h.service.disconnect("owner");
  assert.equal((await h.service.state("owner")).connected, false);
  assert.equal(h.invocations.filter((item) => item.name.startsWith("place_")).length, 0);
});

test("schema drift and incomplete preview coverage stop before any write", async () => {
  const h = robinhoodHarness({ liveEnabled: true }); await h.connect(); await h.service.pause("owner", false);
  const action = await h.service.propose("owner", sampleOrder());
  h.setCatalog([{ name: "place_equity_order", inputSchema: { ...orderInput, description: "changed contract" } }]);
  await assert.rejects(() => h.service.decide("owner", action.id, { decision: "approve", version: 1 }), { code: "ROBINHOOD_SUBMISSION_STOPPED" });
  assert.equal(h.invocations.filter((item) => item.name.startsWith("place_")).length, 0);
  const preview = structuredClone(orderInput); delete preview.properties.limit_price; preview.required = preview.required.filter((key) => key !== "limit_price");
  h.setCatalog([{ name: "place_equity_order", inputSchema: orderInput }, { name: "review_equity_order", inputSchema: preview }]);
  await assert.rejects(() => h.service.propose("owner", { ...sampleOrder(), requestId: "changed-request" }), { code: "ROBINHOOD_PREVIEW_SCHEMA" });
});
