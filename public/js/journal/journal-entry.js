export function calculateProfitLoss({ direction, entryPrice, exitPrice }) {
  const entry = parseFloat(entryPrice) || 0;
  const exit = parseFloat(exitPrice) || 0;
  const raw = direction === "long" ? exit - entry : entry - exit;
  return `${raw >= 0 ? "+" : ""}${raw.toFixed(2)}`;
}

export function createJournalEntry(input, { id, createdAt }) {
  return {
    id,
    direction: input.direction,
    entryTime: input.entryTime.trim() || "--",
    entryPrice: input.entryPrice.trim() || "0",
    exitPrice: input.exitPrice.trim() || "0",
    pl: calculateProfitLoss(input),
    notes: input.notes,
    confluences: input.confluences.slice(),
    screenshotCount: input.screenshotCount,
    createdAt,
  };
}
