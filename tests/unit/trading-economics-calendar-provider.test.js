import test from "node:test";
import assert from "node:assert/strict";
import {
  createTradingEconomicsCalendarProvider,
  MarketNewsConfigurationError,
  MarketNewsProviderError,
} from "../../src/providers/trading-economics-calendar-provider.js";

test("provider requires a configured API key before making a request", async () => {
  let requested = false;
  const provider = createTradingEconomicsCalendarProvider({
    apiKey: "",
    fetchImpl: async () => {
      requested = true;
      return new Response("[]");
    },
  });

  await assert.rejects(
    provider.fetchWeek({ from: "2026-08-30", to: "2026-09-05" }),
    MarketNewsConfigurationError,
  );
  assert.equal(requested, false);
});

test("provider requests the official date-range endpoint and returns JSON rows", async () => {
  const calls = [];
  const provider = createTradingEconomicsCalendarProvider({
    apiKey: "account:key",
    fetchImpl: async (url, options) => {
      calls.push({ url: new URL(url), options });
      return new Response(JSON.stringify([{ CalendarId: "42" }]), {
        status: 200,
        headers: { "Content-Type": "application/json" },
      });
    },
  });

  const rows = await provider.fetchWeek({ from: "2026-08-30", to: "2026-09-05" });

  assert.deepEqual(rows, [{ CalendarId: "42" }]);
  assert.equal(calls[0].url.pathname, "/calendar/country/All/2026-08-30/2026-09-05");
  assert.equal(calls[0].url.searchParams.get("c"), "account:key");
  assert.equal(calls[0].url.searchParams.get("f"), "json");
  assert.equal(calls[0].options.headers.Accept, "application/json");
});

test("provider converts HTTP and malformed-payload failures to a safe error", async () => {
  for (const response of [
    new Response("upstream secret detail", { status: 429 }),
    new Response(JSON.stringify({ message: "not an array" }), { status: 200 }),
  ]) {
    const provider = createTradingEconomicsCalendarProvider({
      apiKey: "account:key",
      fetchImpl: async () => response,
    });
    await assert.rejects(
      provider.fetchWeek({ from: "2026-08-30", to: "2026-09-05" }),
      MarketNewsProviderError,
    );
  }
});

test("provider aborts a bounded request timeout and exposes only a safe typed error", async () => {
  let abortSignal;
  let triggerTimeout;
  const clearedTimers = [];
  const provider = createTradingEconomicsCalendarProvider({
    apiKey: "account:key",
    requestTimeoutMs: 250,
    setTimeoutImpl(callback, delay) {
      assert.equal(delay, 250);
      triggerTimeout = callback;
      return "provider-timeout";
    },
    clearTimeoutImpl(timer) {
      clearedTimers.push(timer);
    },
    fetchImpl: async (_url, options) => {
      abortSignal = options.signal;
      return new Promise((_resolve, reject) => {
        abortSignal?.addEventListener("abort", () => {
          reject(new DOMException("upstream URL/key/body detail", "AbortError"));
        }, { once: true });
      });
    },
  });

  const request = provider.fetchWeek({ from: "2026-08-30", to: "2026-09-05" });

  assert.equal(typeof triggerTimeout, "function");
  triggerTimeout();
  await assert.rejects(request, (error) => {
    assert.ok(error instanceof MarketNewsProviderError);
    assert.equal(error.message, "Economic calendar provider is unavailable");
    assert.doesNotMatch(error.message, /URL|key|body/i);
    return true;
  });
  assert.equal(abortSignal.aborted, true);
  assert.deepEqual(clearedTimers, ["provider-timeout"]);
});
