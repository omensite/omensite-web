const DEFAULT_BASE_URL = "https://api.tradingeconomics.com";
const DEFAULT_REQUEST_TIMEOUT_MS = 10_000;
const MAX_REQUEST_TIMEOUT_MS = 30_000;

export class MarketNewsConfigurationError extends Error {
  constructor() {
    super("Trading Economics API key is not configured");
    this.name = "MarketNewsConfigurationError";
  }
}

export class MarketNewsProviderError extends Error {
  constructor(message = "Economic calendar provider is unavailable") {
    super(message);
    this.name = "MarketNewsProviderError";
  }
}

export function createTradingEconomicsCalendarProvider({
  apiKey = process.env.TRADING_ECONOMICS_API_KEY,
  fetchImpl = globalThis.fetch,
  baseUrl = DEFAULT_BASE_URL,
  requestTimeoutMs = DEFAULT_REQUEST_TIMEOUT_MS,
  setTimeoutImpl = globalThis.setTimeout,
  clearTimeoutImpl = globalThis.clearTimeout,
} = {}) {
  const boundedTimeoutMs = Number.isFinite(requestTimeoutMs) && requestTimeoutMs > 0
    ? Math.min(requestTimeoutMs, MAX_REQUEST_TIMEOUT_MS)
    : DEFAULT_REQUEST_TIMEOUT_MS;

  return {
    async fetchWeek({ from, to }) {
      if (!apiKey?.trim()) throw new MarketNewsConfigurationError();

      const url = new URL(`/calendar/country/All/${from}/${to}`, baseUrl);
      url.searchParams.set("c", apiKey);
      url.searchParams.set("f", "json");

      const abortController = new AbortController();
      let timeout;
      try {
        timeout = setTimeoutImpl(() => abortController.abort(), boundedTimeoutMs);
        const response = await fetchImpl(url, {
          headers: { Accept: "application/json" },
          signal: abortController.signal,
        });
        if (!response.ok) throw new MarketNewsProviderError();

        const rows = await response.json();
        if (!Array.isArray(rows)) throw new MarketNewsProviderError();
        return rows;
      } catch (error) {
        if (
          error instanceof MarketNewsConfigurationError ||
          error instanceof MarketNewsProviderError
        ) {
          throw error;
        }
        throw new MarketNewsProviderError();
      } finally {
        if (timeout !== undefined) clearTimeoutImpl(timeout);
      }
    },
  };
}
