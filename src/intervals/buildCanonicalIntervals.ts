import { IntervalBuildError } from "../errors";
import type {
  CanonicalInterval,
  CanonicalIntervalBuildResult,
  CanonicalIntervalState,
  NormalizedObservation,
  ServiceDescriptor,
} from "../types";
import { median } from "../utils/math";
import { uniqueIssues } from "../utils/issues";
import { createIntervalKey } from "../normalization/normalizeObservation";

const CADENCE_MINUTES = 15 as const;
const CADENCE_MS = CADENCE_MINUTES * 60 * 1000;
const DEFAULT_MAX_GENERATED_INTERVALS = 250_000;

export interface BuildCanonicalIntervalsOptions {
  maxGeneratedIntervals?: number;
}

function discoverServices(
  observations: readonly NormalizedObservation[],
): ServiceDescriptor[] {
  const services = new Map<string, string>();

  for (const observation of observations) {
    if (observation.serviceId === "") {
      continue;
    }

    const existing = services.get(observation.serviceId);
    if (existing === undefined) {
      services.set(observation.serviceId, observation.serviceName);
      continue;
    }

    if (existing === "" && observation.serviceName !== "") {
      services.set(observation.serviceId, observation.serviceName);
    }
  }

  return [...services.entries()]
    .map(([serviceId, serviceName]) => ({ serviceId, serviceName }))
    .sort((a, b) => a.serviceId.localeCompare(b.serviceId));
}

function resolveState(
  observations: readonly NormalizedObservation[],
): CanonicalIntervalState {
  let healthy = false;
  let down = false;

  for (const observation of observations) {
    if (observation.healthState === "healthy") {
      healthy = true;
    } else if (observation.healthState === "down") {
      down = true;
    }
  }

  if (healthy && down) {
    return "conflicted";
  }
  if (healthy) {
    return "healthy";
  }
  if (down) {
    return "down";
  }
  return "unknown";
}

export function buildCanonicalIntervals(
  observations: readonly NormalizedObservation[],
  options: BuildCanonicalIntervalsOptions = {},
): CanonicalIntervalBuildResult {
  const services = discoverServices(observations);
  const assignable = observations.filter(
    (observation) => observation.intervalKey !== null,
  );
  const unassignedObservations = observations.filter(
    (observation) => observation.intervalKey === null,
  );

  if (assignable.length === 0 || services.length === 0) {
    return {
      services,
      window: null,
      intervals: [],
      unassignedObservations,
    };
  }

  const times = assignable
    .map((observation) =>
      observation.timestampUtc === null
        ? Number.NaN
        : Date.parse(observation.timestampUtc),
    )
    .filter(Number.isFinite);

  const startMs = Math.min(...times);
  const endMs = Math.max(...times);

  if (!Number.isFinite(startMs) || !Number.isFinite(endMs) || endMs < startMs) {
    throw new IntervalBuildError("Could not derive a valid canonical interval window.");
  }

  const slotsPerService = Math.floor((endMs - startMs) / CADENCE_MS) + 1;
  const generatedIntervalCount = slotsPerService * services.length;
  const maxGeneratedIntervals =
    options.maxGeneratedIntervals ?? DEFAULT_MAX_GENERATED_INTERVALS;

  if (generatedIntervalCount > maxGeneratedIntervals) {
    throw new IntervalBuildError(
      `Refusing to generate ${generatedIntervalCount} canonical intervals; limit is ${maxGeneratedIntervals}.`,
    );
  }

  const observationsByInterval = new Map<
    string,
    NormalizedObservation[]
  >();

  for (const observation of assignable) {
    const key = observation.intervalKey;
    if (key === null) {
      continue;
    }

    const existing = observationsByInterval.get(key);
    if (existing === undefined) {
      observationsByInterval.set(key, [observation]);
    } else {
      existing.push(observation);
    }
  }

  const intervals: CanonicalInterval[] = [];

  for (const service of services) {
    for (let timestampMs = startMs; timestampMs <= endMs; timestampMs += CADENCE_MS) {
      const timestampUtc = new Date(timestampMs).toISOString();
      const key = createIntervalKey(service.serviceId, timestampUtc);
      const attached = observationsByInterval.get(key) ?? [];
      const latencyValues = attached
        .map((observation) => observation.latencyMs)
        .filter((value): value is number => value !== null);

      intervals.push({
        key,
        serviceId: service.serviceId,
        serviceName: service.serviceName,
        timestampUtc,
        state: resolveState(attached),
        observationCount: attached.length,
        rawObservationCount: attached.reduce(
          (total, observation) => total + observation.duplicateCount,
          0,
        ),
        validHealthObservationCount: attached.filter(
          (observation) => observation.healthState !== null,
        ).length,
        representativeLatencyMs: median(latencyValues),
        sourceRows: attached
          .flatMap((observation) => observation.sourceRows)
          .sort((a, b) => a - b),
        issues: uniqueIssues(attached.flatMap((observation) => observation.issues)),
      });
    }
  }

  return {
    services,
    window: {
      startUtc: new Date(startMs).toISOString(),
      endUtc: new Date(endMs).toISOString(),
      cadenceMinutes: CADENCE_MINUTES,
      slotsPerService,
    },
    intervals,
    unassignedObservations,
  };
}
