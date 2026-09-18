import type {
  NormalizedObservation,
  QualityIssue,
  RawCheckRow,
} from "../types";
import { uniqueIssues } from "../utils/issues";

const RAW_FIELDS: Array<keyof RawCheckRow> = [
  "service_id",
  "service_name",
  "timestamp",
  "status_code",
  "latency",
  "latency_unit",
  "agent",
  "region",
];

function exactSourceIdentity(observation: NormalizedObservation): string {
  // Trimming harmless surrounding whitespace makes duplicate detection stable
  // without collapsing different timestamp/unit representations.
  return JSON.stringify(
    RAW_FIELDS.map((field) => observation.raw[field].trim()),
  );
}

function duplicateIssue(): QualityIssue {
  return {
    code: "EXACT_DUPLICATE",
    message: "One or more identical source observations were collapsed while preserving source-row provenance.",
  };
}

export function deduplicateObservations(
  observations: readonly NormalizedObservation[],
): NormalizedObservation[] {
  const result: NormalizedObservation[] = [];
  const indexByIdentity = new Map<string, number>();

  for (const observation of observations) {
    const identity = exactSourceIdentity(observation);
    const existingIndex = indexByIdentity.get(identity);

    if (existingIndex === undefined) {
      indexByIdentity.set(identity, result.length);
      result.push({
        ...observation,
        sourceRows: [...observation.sourceRows],
        issues: [...observation.issues],
      });
      continue;
    }

    const existing = result[existingIndex];
    if (existing === undefined) {
      throw new Error("Internal deduplication index corruption.");
    }

    result[existingIndex] = {
      ...existing,
      duplicateCount: existing.duplicateCount + observation.duplicateCount,
      sourceRows: [...existing.sourceRows, ...observation.sourceRows].sort(
        (a, b) => a - b,
      ),
      issues: uniqueIssues([
        ...existing.issues,
        ...observation.issues,
        duplicateIssue(),
      ]),
    };
  }

  return result;
}
