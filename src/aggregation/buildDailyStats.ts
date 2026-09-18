import type {
  CanonicalInterval,
  NormalizedObservation,
  QualityIssueCode,
} from "../types";
import { createDailyStatId } from "../persistence/documentIds";
import type { DailyStatRecord, IssueCounts } from "../persistence/models";

function increment(
  counts: IssueCounts,
  code: QualityIssueCode,
  amount = 1,
): void {
  counts[code] = (counts[code] ?? 0) + amount;
}

function statKey(date: string, serviceId: string): string {
  return `${date}\u0000${serviceId}`;
}

export function buildDailyStats(
  uploadId: string,
  intervals: readonly CanonicalInterval[],
  normalizedSourceObservations: readonly NormalizedObservation[],
  deduplicatedObservations: readonly NormalizedObservation[],
): DailyStatRecord[] {
  const stats = new Map<string, DailyStatRecord>();

  for (const interval of intervals) {
    const date = interval.timestampUtc.slice(0, 10);
    const key = statKey(date, interval.serviceId);
    let stat = stats.get(key);

    if (stat === undefined) {
      stat = {
        dailyStatId: createDailyStatId(date, interval.serviceId),
        uploadId,
        date,
        serviceId: interval.serviceId,
        serviceName: interval.serviceName,
        expectedIntervals: 0,
        healthyIntervals: 0,
        downIntervals: 0,
        unknownIntervals: 0,
        conflictedIntervals: 0,
        resolvedIntervals: 0,
        unresolvedIntervals: 0,
        detectedDowntimeMinutes: 0,
        latencySamplesMs: [],
        issueCounts: {},
        intervalStateCounts: {
          healthy: 0,
          down: 0,
          unknown: 0,
          conflicted: 0,
        },
      };
      stats.set(key, stat);
    }

    stat.expectedIntervals += 1;
    stat.intervalStateCounts[interval.state] += 1;

    switch (interval.state) {
      case "healthy":
        stat.healthyIntervals += 1;
        stat.resolvedIntervals += 1;
        break;
      case "down":
        stat.downIntervals += 1;
        stat.resolvedIntervals += 1;
        stat.detectedDowntimeMinutes += 15;
        break;
      case "unknown":
        stat.unknownIntervals += 1;
        stat.unresolvedIntervals += 1;
        break;
      case "conflicted":
        stat.conflictedIntervals += 1;
        stat.unresolvedIntervals += 1;
        break;
      default: {
        const exhaustive: never = interval.state;
        throw new Error(`Unsupported interval state: ${String(exhaustive)}`);
      }
    }

    if (interval.representativeLatencyMs !== null) {
      stat.latencySamplesMs.push(interval.representativeLatencyMs);
    }
  }

  // Quality counts use the pre-dedup normalized observations so repeated source
  // rows still remain visible as source-data findings. EXACT_DUPLICATE is added
  // separately below because that issue only exists after deduplication.
  for (const observation of normalizedSourceObservations) {
    if (observation.timestampUtc === null || observation.serviceId === "") {
      continue;
    }

    const date = observation.timestampUtc.slice(0, 10);
    const stat = stats.get(statKey(date, observation.serviceId));
    if (stat === undefined) {
      continue;
    }

    for (const issue of observation.issues) {
      if (issue.code !== "EXACT_DUPLICATE") {
        increment(stat.issueCounts, issue.code);
      }
    }
  }

  for (const observation of deduplicatedObservations) {
    const duplicateRowsRemoved = observation.duplicateCount - 1;
    if (
      duplicateRowsRemoved <= 0 ||
      observation.timestampUtc === null ||
      observation.serviceId === ""
    ) {
      continue;
    }

    const date = observation.timestampUtc.slice(0, 10);
    const stat = stats.get(statKey(date, observation.serviceId));
    if (stat !== undefined) {
      increment(stat.issueCounts, "EXACT_DUPLICATE", duplicateRowsRemoved);
    }
  }

  return [...stats.values()]
    .map((stat) => ({
      ...stat,
      latencySamplesMs: [...stat.latencySamplesMs].sort((a, b) => a - b),
    }))
    .sort((a, b) =>
      a.date === b.date
        ? a.serviceId.localeCompare(b.serviceId)
        : a.date.localeCompare(b.date),
    );
}
