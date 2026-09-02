import test from "node:test";
import assert from "node:assert/strict";
import { NAVIGATION, ROUTE_BY_KEY, getRouteByPath } from "../../src/models/navigation.js";

test("clean routes resolve to the expected view metadata", () => {
  assert.deepEqual(getRouteByPath("/alerts/support-resistance"), {
    key: "alerts-sr",
    title: "ALERTS :: S&R",
    path: "/alerts/support-resistance",
    uri: "alerts/support-resistance",
    description: "Support and resistance alerts presented with the same live terminal-style feedback.",
    view: "alerts-sr",
    capability: "base",
  });
});

test("unknown paths return undefined", () => {
  assert.equal(getRouteByPath("/missing"), undefined);
});

test("visible navigation contains every primary destination including Admin", () => {
  assert.deepEqual(NAVIGATION.map((route) => route.key), [
    "home", "indicators", "market-news", "alerts-ict", "alerts-sr", "journal", "admin",
  ]);
  assert.deepEqual(NAVIGATION.map((route) => route.capability), [
    "base", "indicators", "base", "base", "base", "journal", "admin",
  ]);
  assert.equal(ROUTE_BY_KEY["journal-new"].view, "journal-new");
  assert.equal(ROUTE_BY_KEY["journal-public"].view, "journal-public");
});
