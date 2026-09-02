const ROUTES = [
  { key: "home", title: "HOME", path: "/home", uri: "home", description: "Landing dashboard, system status, recent activity, important summaries, and quick links.", view: "home" },
  { key: "indicators", title: "INDICATORS", path: "/indicators", uri: "indicators", description: "TradingView indicator access, entitlement status, instructions, and related resources.", view: "indicators" },
  { key: "market-news", title: "MARKET NEWS", path: "/market-news", uri: "market-news", description: "Important financial events, red-folder news, orange-folder news, and market reports.", view: "market-news" },
  { key: "alerts-ict", title: "ALERTS :: ICT", path: "/alerts/ict", uri: "alerts/ict", description: "Alerts for ICT-based conditions, concepts, and future strategy-specific signals.", view: "alerts-ict" },
  { key: "alerts-sr", title: "ALERTS :: S&R", path: "/alerts/support-resistance", uri: "alerts/support-resistance", description: "Support and resistance alerts presented with the same live terminal-style feedback.", view: "alerts-sr" },
  { key: "journal", title: "JOURNAL", path: "/journal", uri: "journal", description: "Create, review, organize, and publicly share structured trade entries.", view: "journal-index" },
  { key: "journal-new", title: "NEW JOURNAL ENTRY", path: "/journal/new", uri: "journal/new", description: "Capture direction, timing, price, confluences, evidence and notes for one trade.", view: "journal-new" },
  { key: "journal-public", title: "PUBLIC JOURNAL ENTRY", path: "/journal/:id", uri: "journal/public", description: "The shareable public record and webhook embed generated on submission.", view: "journal-public" },
];

export const NAVIGATION = ROUTES.slice(0, 6);

export const ROUTE_BY_KEY = Object.fromEntries(ROUTES.map((route) => [route.key, route]));

export function getRouteByPath(pathname) {
  return ROUTES.find((route) => route.path === pathname);
}
