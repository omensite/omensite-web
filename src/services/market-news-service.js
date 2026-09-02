const COUNTRY_MARKETS = new Map([
  ["United States", "USD"],
  ["Euro Area", "EUR"], ["Germany", "EUR"], ["France", "EUR"],
  ["Italy", "EUR"], ["Spain", "EUR"], ["Netherlands", "EUR"],
  ["Belgium", "EUR"], ["Austria", "EUR"], ["Ireland", "EUR"],
  ["Portugal", "EUR"], ["Finland", "EUR"], ["Greece", "EUR"],
  ["United Kingdom", "GBP"],
  ["Japan", "JPY"],
  ["Canada", "CAD"],
  ["Australia", "AUD"],
  ["New Zealand", "NZD"],
  ["Switzerland", "CHF"],
  ["China", "CNY"],
]);

function nullableText(value) {
  if (value === null || value === undefined || String(value).trim() === "") return null;
  return String(value);
}

function normalizeEvent(row) {
  const market = COUNTRY_MARKETS.get(String(row.Country ?? ""));
  const importance = Number(row.Importance);
  const id = nullableText(row.CalendarId);
  const providerTime = String(row.Date ?? "");
  const timestamp = new Date(/[zZ]|[+-]\d\d:\d\d$/.test(providerTime) ? providerTime : `${providerTime}Z`);

  if (!id || !market || ![2, 3].includes(importance) || Number.isNaN(timestamp.valueOf())) return null;

  return {
    id,
    timestamp: timestamp.toISOString(),
    market,
    country: String(row.Country),
    title: String(row.Event || row.Category || "UNNAMED EVENT"),
    importance: importance === 3 ? "high" : "medium",
    actual: nullableText(row.Actual),
    forecast: nullableText(row.Forecast),
    previous: nullableText(row.Previous),
  };
}

function formatUtcDate(date) {
  return date.toISOString().slice(0, 10);
}

export function getCalendarWeekRange(date) {
  const sunday = new Date(Date.UTC(date.getUTCFullYear(), date.getUTCMonth(), date.getUTCDate()));
  sunday.setUTCDate(sunday.getUTCDate() - sunday.getUTCDay());
  const saturday = new Date(sunday);
  saturday.setUTCDate(saturday.getUTCDate() + 6);
  return { from: formatUtcDate(sunday), to: formatUtcDate(saturday) };
}

export function createMarketNewsService({ provider, now = () => new Date(), cacheTtlMs = 60_000 }) {
  let cache = null;
  let inFlight = null;
  let requestGeneration = 0;
  const latestGenerationByKey = new Map();

  async function load(range, key, generation) {
    const rows = await provider.fetchWeek(range);
    const events = rows.map(normalizeEvent).filter(Boolean)
      .sort((left, right) => left.timestamp.localeCompare(right.timestamp));
    const result = {
      state: "live",
      events,
      updatedAt: now().toISOString(),
      range,
    };
    if (latestGenerationByKey.get(key) === generation) {
      cache = { key, savedAt: now().valueOf(), result };
    }
    return result;
  }

  return {
    async getCurrentWeek({ force = false } = {}) {
      const range = getCalendarWeekRange(now());
      const key = `${range.from}:${range.to}`;
      const fresh = cache?.key === key && now().valueOf() - cache.savedAt < cacheTtlMs;
      if (!force && fresh) return cache.result;
      if (!force && inFlight?.key === key) return inFlight.promise;

      const generation = ++requestGeneration;
      latestGenerationByKey.set(key, generation);
      const promise = load(range, key, generation).catch((error) => {
        if (cache?.key === key) return { ...cache.result, state: "stale" };
        throw error;
      }).finally(() => {
        if (inFlight?.promise === promise) inFlight = null;
        if (latestGenerationByKey.get(key) === generation) latestGenerationByKey.delete(key);
      });
      inFlight = { key, promise };
      return promise;
    },
  };
}
