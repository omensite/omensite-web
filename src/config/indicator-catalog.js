const DEMO_INDICATORS = [
  {
    id: "demo-market-structure",
    name: "DEMO :: MARKET STRUCTURE",
    description: "Demonstration catalog record for structure analysis.",
    tradingViewUrl: null,
    version: "demo",
    active: true,
    demo: true,
  },
  {
    id: "demo-liquidity-map",
    name: "DEMO :: LIQUIDITY MAP",
    description: "Demonstration catalog record for liquidity visualization.",
    tradingViewUrl: null,
    version: "demo",
    active: true,
    demo: true,
  },
];

function freezeCatalog(entries) {
  return Object.freeze(entries.map((entry) => Object.freeze({ ...entry })));
}

export function createIndicatorCatalog({ authMode } = {}) {
  return freezeCatalog(authMode === "demo" ? DEMO_INDICATORS : []);
}
