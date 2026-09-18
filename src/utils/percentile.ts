/**
 * Nearest-rank percentile. This is intentionally explicit rather than relying
 * on a chart/database implementation whose percentile semantics may differ.
 */
export function percentileNearestRank(
  values: readonly number[],
  percentile: number,
): number | null {
  if (values.length === 0) {
    return null;
  }
  if (!Number.isFinite(percentile) || percentile <= 0 || percentile > 100) {
    throw new RangeError("Percentile must be greater than 0 and at most 100.");
  }

  const sorted = [...values].sort((a, b) => a - b);
  const rank = Math.ceil((percentile / 100) * sorted.length);
  return sorted[Math.max(0, rank - 1)] ?? null;
}
