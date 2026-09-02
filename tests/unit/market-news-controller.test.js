import test from "node:test";
import assert from "node:assert/strict";
import { JSDOM } from "jsdom";
import { initializeMarketNewsPage } from "../../public/js/market-news/market-news-controller.js";

function calendarFixture() {
  const dom = new JSDOM(`
    <section data-market-news data-calendar-state="live">
      <p>WEEK :: 2026-08-30 / 2026-09-05 :: <span data-calendar-timezone>TIMES UTC</span></p>
      <button data-calendar-impact="all" aria-pressed="true"></button>
      <button data-calendar-impact="high" aria-pressed="false"></button>
      <button data-calendar-impact="medium" aria-pressed="false"></button>
      <button data-calendar-market="all" aria-pressed="true"></button>
      <button data-calendar-market="usd" aria-pressed="false"></button>
      <button data-calendar-market="eur" aria-pressed="false"></button>
      <button data-calendar-refresh></button>
      <div data-calendar-status>
        <span data-calendar-link-status></span>
        <span>VISIBLE :: <strong data-calendar-count>3</strong></span>
        <span>UPDATED :: <time data-calendar-updated datetime="2026-09-02T12:01:00.000Z">2026-09-02T12:01:00.000Z</time></span>
      </div>
      <div data-calendar-events>
        <article data-calendar-event data-event-id="1" data-timestamp="2026-09-02T12:00:00.000Z" data-market="usd" data-impact="high"><time data-event-time></time></article>
        <article data-calendar-event data-event-id="2" data-timestamp="2026-09-02T13:00:00.000Z" data-market="eur" data-impact="medium"><time data-event-time></time></article>
        <article data-calendar-event data-event-id="3" data-timestamp="2026-09-03T14:00:00.000Z" data-market="eur" data-impact="high"><time data-event-time></time></article>
      </div>
      <div data-calendar-empty hidden></div>
      <div data-calendar-filter-empty hidden></div>
      <div data-calendar-offline hidden></div>
    </section>
  `, { url: "http://localhost/market-news" });
  return { dom, root: dom.window.document.querySelector("[data-market-news]") };
}

test("impact and market filters combine and update the visible count", () => {
  const { dom, root } = calendarFixture();
  const instance = initializeMarketNewsPage(root, {
    windowRef: dom.window,
    fetchImpl: async () => new Response(),
    refreshIntervalMs: 0,
  });

  root.querySelector('[data-calendar-impact="high"]').click();
  root.querySelector('[data-calendar-market="eur"]').click();

  const visible = [...root.querySelectorAll("[data-calendar-event]")]
    .filter((row) => !row.hidden).map((row) => row.dataset.eventId);
  assert.deepEqual(visible, ["3"]);
  assert.equal(root.querySelector("[data-calendar-count]").textContent, "1");
  assert.equal(root.querySelector('[data-calendar-impact="high"]').getAttribute("aria-pressed"), "true");
  assert.equal(root.querySelector('[data-calendar-market="eur"]').getAttribute("aria-pressed"), "true");
  instance.dispose();
  dom.window.close();
});

test("timestamps and day headers are formatted through the workstation timezone", () => {
  const { dom, root } = calendarFixture();
  const instance = initializeMarketNewsPage(root, {
    windowRef: dom.window,
    fetchImpl: async () => new Response(),
    refreshIntervalMs: 0,
  });

  assert.match(root.querySelector("[data-event-time]").textContent, /\d{1,2}:\d{2}/);
  assert.ok(root.querySelectorAll("[data-calendar-day]").length >= 2);
  assert.equal(root.querySelector("[data-calendar-timezone]").textContent, "TIMES LOCAL");
  instance.dispose();
  dom.window.close();
});

test("initial hydration formats the updated timestamp locally and preserves its ISO datetime", () => {
  const { dom, root } = calendarFixture();
  const instance = initializeMarketNewsPage(root, {
    windowRef: dom.window,
    fetchImpl: async () => new Response(),
    refreshIntervalMs: 0,
  });
  const updated = root.querySelector("[data-calendar-updated]");

  assert.equal(updated.dateTime, "2026-09-02T12:01:00.000Z");
  assert.doesNotMatch(updated.textContent, /^2026-09-02T/);
  assert.match(updated.textContent, /\d/);
  instance.dispose();
  dom.window.close();
});

test("invalid timestamps use the unknown-date group and placeholder time", () => {
  const { dom, root } = calendarFixture();
  const row = root.querySelector('[data-event-id="1"]');
  row.dataset.timestamp = "not-a-date";
  const instance = initializeMarketNewsPage(root, {
    windowRef: dom.window,
    fetchImpl: async () => new Response(),
    refreshIntervalMs: 0,
  });

  assert.equal(row.querySelector("[data-event-time]").textContent, "--:--");
  assert.equal(row.closest("[data-calendar-day]").querySelector(".calendar-day-label").textContent, "DATE UNKNOWN");
  instance.dispose();
  dom.window.close();
});

test("manual refresh requests fresh data and renders it as text", async () => {
  const { dom, root } = calendarFixture();
  const calls = [];
  const instance = initializeMarketNewsPage(root, {
    windowRef: dom.window,
    refreshIntervalMs: 0,
    fetchImpl: async (url) => {
      calls.push(url);
      return new Response(JSON.stringify({
        ok: true,
        calendar: {
          state: "live",
          events: [{ id: "99", timestamp: "2026-09-04T15:00:00.000Z", market: "USD", country: "United States", title: "<img src=x onerror=alert(1)>", importance: "high", actual: "4.2%", forecast: "4.1%", previous: "4.0%" }],
          updatedAt: "2026-09-02T12:01:00.000Z",
          range: { from: "2026-08-30", to: "2026-09-05" },
        },
      }), { status: 200, headers: { "Content-Type": "application/json" } });
    },
  });

  root.querySelector("[data-calendar-refresh]").click();
  await new Promise((resolve) => dom.window.setTimeout(resolve, 0));

  assert.equal(calls[0], "/api/market-news/events?refresh=1");
  assert.equal(root.querySelector("[data-calendar-event]").textContent.includes("<img"), true);
  assert.equal(root.querySelector("img"), null);
  assert.equal(root.querySelector("[data-calendar-link-status]").textContent, "LINK :: LIVE");
  assert.equal(root.querySelector("[data-calendar-updated]").dateTime, "2026-09-02T12:01:00.000Z");
  instance.dispose();
  dom.window.close();
});

test("dispose clears polling and aborts an active refresh", async () => {
  const { dom, root } = calendarFixture();
  const signals = [];
  const clearedIntervals = [];
  const originalClearInterval = dom.window.clearInterval.bind(dom.window);
  dom.window.clearInterval = (interval) => {
    clearedIntervals.push(interval);
    originalClearInterval(interval);
  };
  const instance = initializeMarketNewsPage(root, {
    windowRef: dom.window,
    refreshIntervalMs: 10,
    fetchImpl: async (_url, options) => {
      signals.push(options.signal);
      return new Promise(() => {});
    },
  });
  root.querySelector("[data-calendar-refresh]").click();
  instance.dispose();

  assert.equal(signals[0].aborted, true);
  assert.equal(clearedIntervals.length, 1);
  dom.window.close();
});

test("failed refresh retains rows, reports degradation, and prevents overlap", async () => {
  const { dom, root } = calendarFixture();
  let rejectRequest;
  let calls = 0;
  const request = new Promise((_resolve, reject) => { rejectRequest = reject; });
  const instance = initializeMarketNewsPage(root, {
    windowRef: dom.window,
    refreshIntervalMs: 0,
    fetchImpl: async () => {
      calls += 1;
      return request;
    },
  });
  const button = root.querySelector("[data-calendar-refresh]");

  button.click();
  button.click();
  assert.equal(calls, 1);
  assert.equal(button.disabled, true);
  assert.equal(root.getAttribute("aria-busy"), "true");
  assert.equal(root.querySelector("[data-calendar-link-status]").textContent, "SYNCING CALENDAR...");

  rejectRequest(new Error("network unavailable"));
  await new Promise((resolve) => dom.window.setTimeout(resolve, 0));

  assert.equal(root.querySelectorAll("[data-calendar-event]").length, 3);
  assert.equal(root.querySelector("[data-calendar-link-status]").textContent, "DATA LINK DEGRADED :: RETAINING LAST BUFFER");
  assert.equal(button.disabled, false);
  assert.equal(root.getAttribute("aria-busy"), "false");
  assert.equal(root.querySelector("[data-calendar-offline]").hidden, true);
  instance.dispose();
  dom.window.close();
});
