import type { NormalizedObservation, QualityIssueCode } from "../types";
import type { IssueCounts } from "../persistence/models";

export function countUploadIssues(
  normalizedSourceObservations: readonly NormalizedObservation[],
  exactDuplicateRowsRemoved: number,
): IssueCounts {
  const result: IssueCounts = {};

  for (const observation of normalizedSourceObservations) {
    for (const issue of observation.issues) {
      const code = issue.code;
      result[code] = (result[code] ?? 0) + 1;
    }
  }

  if (exactDuplicateRowsRemoved > 0) {
    result.EXACT_DUPLICATE = exactDuplicateRowsRemoved;
  }

  return result;
}

export function mergeIssueCounts(
  counts: readonly IssueCounts[],
): IssueCounts {
  const result: IssueCounts = {};

  for (const count of counts) {
    for (const [code, value] of Object.entries(count)) {
      if (value === undefined) {
        continue;
      }
      const typedCode = code as QualityIssueCode;
      result[typedCode] = (result[typedCode] ?? 0) + value;
    }
  }

  return result;
}
