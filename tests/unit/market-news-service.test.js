import test from "node:test";
import assert from "node:assert/strict";
import {
  createMarketNewsService,
  getCalendarWeekRange,
} from "../../src/services/market-news-service.js";

test("week range is the containing Sunday through Saturday", () => {
  assert.deepEqual(getCalendarWeekRange(new Date("2026-09-02T12:00:00Z")), {
    from: "2026-08-30",
    to: "2026-09-05",
  });
});

test("service keeps supported medium and high events and normalizes missing values", async () => {
  const provider = {
    async fetchWeek() {
      return [
        { CalendarId: "3", Date: "2026-09-03T12:30:00", Country: "United States", Event: "Non Farm Payrolls", Importance: 3, Actual: "", Forecast: "75K", Previous: "62K" },
        { CalendarId: "2", Date: "2026-09-02T09:00:00", Country: "Euro Area", Event: "CPI", Importance: 2, Actual: "2.1%", Forecast: "2.0%", Previous: "1.9%" },
        { CalendarId: "1", Date: "2026-09-01T08:00:00", Country: "United Kingdom", Event: "Minor Survey", Importance: 1 },
        { CalendarId: "4", Date: "2026-09-04T08:00:00", Country: "Brazil", Event: "Unsupported Market", Importance: 3 },
      ];
    },
  };
  const service = createMarketNewsService({
    provider,
    now: () => new Date("2026-09-02T12:00:00Z"),
  });

  const result = await service.getCurrentWeek();

  assert.equal(result.state, "live");
  assert.deepEqual(result.events.map((event) => [event.id, event.market, event.importance]), [
    ["2", "EUR", "medium"],
    ["3", "USD", "high"],
  ]);
  assert.equal(result.events[0].timestamp, "2026-09-02T09:00:00.000Z");
  assert.equal(result.events[1].actual, null);
});

test("service shares fresh results and force refresh bypasses the cache", async () => {
  let calls = 0;
  const provider = {
    fetchWeek: async () => [{ CalendarId: String(++calls), Date: "2026-09-02T12:00:00", Country: "Japan", Event: "BoJ Statement", Importance: 3, Actual: null, Forecast: null, Previous: null }],
  };
  const service = createMarketNewsService({ provider, now: () => new Date("2026-09-02T12:00:00Z") });

  const first = await service.getCurrentWeek();
  const cached = await service.getCurrentWeek();
  const refreshed = await service.getCurrentWeek({ force: true });

  assert.equal(first.events[0].id, "1");
  assert.equal(cached.events[0].id, "1");
  assert.equal(refreshed.events[0].id, "2");
  assert.equal(calls, 2);
});

test("service returns the last successful week as stale when revalidation fails", async () => {
  let fail = false;
  const provider = {
    async fetchWeek() {
      if (fail) throw new Error("offline");
      return [{ CalendarId: "9", Date: "2026-09-02T12:00:00", Country: "Canada", Event: "Rate Decision", Importance: 3, Actual: null, Forecast: null, Previous: null }];
    },
  };
  const service = createMarketNewsService({ provider, now: () => new Date("2026-09-02T12:00:00Z"), cacheTtlMs: 0 });
  await service.getCurrentWeek();
  fail = true;

  const result = await service.getCurrentWeek();

  assert.equal(result.state, "stale");
  assert.equal(result.events[0].id, "9");
});

test("simultaneous calls for one week share an in-flight provider request", async () => {
  let calls = 0;
  const resolveProviders = [];
  const provider = {
    fetchWeek() {
      calls += 1;
      return new Promise((resolve) => { resolveProviders.push(resolve); });
    },
  };
  const service = createMarketNewsService({ provider, now: () => new Date("2026-09-02T12:00:00Z") });

  const first = service.getCurrentWeek();
  const second = service.getCurrentWeek();
  for (const resolve of resolveProviders) {
    resolve([{ CalendarId: "10", Date: "2026-09-02T12:00:00", Country: "Australia", Event: "GDP", Importance: 2, Actual: null, Forecast: null, Previous: null }]);
  }
  const [firstResult, secondResult] = await Promise.all([first, second]);

  assert.equal(calls, 1);
  assert.equal(firstResult.events[0].id, "10");
  assert.equal(secondResult.events[0].id, "10");
});

test("a new week does not reuse the prior week's cached result", async () => {
  let calls = 0;
  let currentTime = new Date("2026-09-05T12:00:00Z");
  const provider = {
    fetchWeek: async () => [{ CalendarId: String(++calls), Date: "2026-09-05T12:00:00", Country: "Switzerland", Event: "CPI", Importance: 2, Actual: null, Forecast: null, Previous: null }],
  };
  const service = createMarketNewsService({ provider, now: () => currentTime });

  const first = await service.getCurrentWeek();
  currentTime = new Date("2026-09-06T12:00:00Z");
  const nextWeek = await service.getCurrentWeek();

  assert.equal(first.events[0].id, "1");
  assert.equal(nextWeek.events[0].id, "2");
  assert.deepEqual(nextWeek.range, { from: "2026-09-06", to: "2026-09-12" });
  assert.equal(calls, 2);
});
