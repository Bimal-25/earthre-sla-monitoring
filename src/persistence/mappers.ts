import type { NormalizedObservation } from "../types";
import type { StoredObservation } from "./models";
import {
  createObservationId,
  createObservationSortKey,
} from "./documentIds";

export async function toStoredObservation(
  uploadId: string,
  observation: NormalizedObservation,
): Promise<StoredObservation> {
  const observationId = await createObservationId(observation);

  return {
    observationId,
    uploadId,
    sortKey: createObservationSortKey(observation.timestampUtc, observationId),
    sourceRow: observation.sourceRow,
    sourceRows: [...observation.sourceRows],
    duplicateCount: observation.duplicateCount,
    raw: { ...observation.raw },
    serviceId: observation.serviceId,
    serviceName: observation.serviceName,
    agent: observation.agent,
    region: observation.region,
    timestampRaw: observation.timestampRaw,
    timestampUtc: observation.timestampUtc,
    dateUtc:
      observation.timestampUtc === null
        ? null
        : observation.timestampUtc.slice(0, 10),
    isOnExpectedCadence: observation.isOnExpectedCadence,
    statusCodeRaw: observation.statusCodeRaw,
    statusCode: observation.statusCode,
    healthState: observation.healthState,
    latencyRaw: observation.latencyRaw,
    latencyUnitRaw: observation.latencyUnitRaw,
    latencyMs: observation.latencyMs,
    intervalKey: observation.intervalKey,
    issues: observation.issues.map((issue) => ({ ...issue })),
  };
}
