import { CAPABILITIES } from "./access.js";

const ROUTES = [
  { key: "home", title: "HOME", path: "/home", uri: "home", description: "Landing dashboard, system status, recent activity, important summaries, and quick links.", view: "home", capability: CAPABILITIES.BASE },
  { key: "indicators", title: "INDICATORS", path: "/indicators", uri: "indicators", description: "TradingView indicator access, entitlement status, instructions, and related resources.", view: "indicators", capability: CAPABILITIES.INDICATORS },
  { key: "market-news", title: "MARKET NEWS", path: "/market-news", uri: "market-news", description: "Important financial events, red-folder news, orange-folder news, and market reports.", view: "market-news", capability: CAPABILITIES.BASE },
  { key: "alerts-ict", title: "ALERTS :: ICT", path: "/alerts/ict", uri: "alerts/ict", description: "Alerts for ICT-based conditions, concepts, and future strategy-specific signals.", view: "alerts-ict", capability: CAPABILITIES.BASE },
  { key: "alerts-sr", title: "ALERTS :: S&R", path: "/alerts/support-resistance", uri: "alerts/support-resistance", description: "Support and resistance alerts presented with the same live terminal-style feedback.", view: "alerts-sr", capability: CAPABILITIES.BASE },
  { key: "journal", title: "JOURNAL", path: "/journal", uri: "journal", description: "Create, review, organize, and publicly share structured trade entries.", view: "journal-index", capability: CAPABILITIES.JOURNAL },
  { key: "admin", title: "ADMIN", path: "/admin", uri: "admin", description: "Administrative controls for users, access requests, sessions, and temporary policy state.", view: "admin", capability: CAPABILITIES.ADMIN },
  { key: "journal-new", title: "NEW JOURNAL ENTRY", path: "/journal/new", uri: "journal/new", description: "Capture direction, timing, price, confluences, evidence and notes for one trade.", view: "journal-new", capability: CAPABILITIES.JOURNAL },
  { key: "journal-public", title: "PUBLIC JOURNAL ENTRY", path: "/journal/:id", uri: "journal/public", description: "The shareable public record and webhook embed generated on submission.", view: "journal-public", capability: CAPABILITIES.JOURNAL },
];

export const NAVIGATION = ROUTES.slice(0, 7);

export const ROUTE_BY_KEY = Object.fromEntries(ROUTES.map((route) => [route.key, route]));

export function getRouteByPath(pathname) {
  return ROUTES.find((route) => route.path === pathname);
}
