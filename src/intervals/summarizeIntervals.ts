import type { CanonicalInterval, IntervalSummary } from "../types";

export function summarizeIntervals(
  intervals: readonly CanonicalInterval[],
): IntervalSummary {
  let healthyIntervals = 0;
  let downIntervals = 0;
  let unknownIntervals = 0;
  let conflictedIntervals = 0;

  for (const interval of intervals) {
    switch (interval.state) {
      case "healthy":
        healthyIntervals += 1;
        break;
      case "down":
        downIntervals += 1;
        break;
      case "unknown":
        unknownIntervals += 1;
        break;
      case "conflicted":
        conflictedIntervals += 1;
        break;
      default: {
        const exhaustive: never = interval.state;
        throw new Error(`Unknown interval state: ${String(exhaustive)}`);
      }
    }
  }

  const expectedIntervals = intervals.length;
  const resolvedIntervals = healthyIntervals + downIntervals;
  const unresolvedIntervals = unknownIntervals + conflictedIntervals;

  return {
    expectedIntervals,
    healthyIntervals,
    downIntervals,
    unknownIntervals,
    conflictedIntervals,
    resolvedIntervals,
    unresolvedIntervals,
    availabilityPercent:
      resolvedIntervals === 0
        ? null
        : (healthyIntervals / resolvedIntervals) * 100,
    coveragePercent:
      expectedIntervals === 0
        ? null
        : (resolvedIntervals / expectedIntervals) * 100,
    detectedDowntimeMinutes: downIntervals * 15,
  };
}
