import assert from "node:assert/strict";
import test from "node:test";
import { calculateProfitLoss, createJournalEntry } from "../../public/js/journal/journal-entry.js";

test("P&L follows direction and formats two decimals", () => {
  assert.equal(calculateProfitLoss({ direction: "long", entryPrice: "100", exitPrice: "103.5" }), "+3.50");
  assert.equal(calculateProfitLoss({ direction: "short", entryPrice: "100", exitPrice: "103.5" }), "-3.50");
});

test("entry creation normalizes defaults and preserves confluences", () => {
  const entry = createJournalEntry(
    { direction: "long", entryTime: "", entryPrice: "100", exitPrice: "101", notes: " test ", confluences: ["FVG"], screenshotCount: 2 },
    { id: "entry-1", createdAt: "2026-09-01T00:00:00.000Z" },
  );

  assert.deepEqual(entry, {
    id: "entry-1", direction: "long", entryTime: "--", entryPrice: "100", exitPrice: "101",
    pl: "+1.00", notes: " test ", confluences: ["FVG"], screenshotCount: 2,
    createdAt: "2026-09-01T00:00:00.000Z",
  });
});
