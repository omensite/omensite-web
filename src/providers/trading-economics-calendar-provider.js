const DEFAULT_BASE_URL = "https://api.tradingeconomics.com";

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
} = {}) {
  return {
    async fetchWeek({ from, to }) {
      if (!apiKey?.trim()) throw new MarketNewsConfigurationError();

      const url = new URL(`/calendar/country/All/${from}/${to}`, baseUrl);
      url.searchParams.set("c", apiKey);
      url.searchParams.set("f", "json");

      try {
        const response = await fetchImpl(url, {
          headers: { Accept: "application/json" },
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
      }
    },
  };
}
