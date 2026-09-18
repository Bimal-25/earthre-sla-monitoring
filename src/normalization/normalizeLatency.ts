import type { QualityIssue } from "../types";

export interface NormalizedLatency {
  latencyMs: number | null;
  issues: QualityIssue[];
}

export function normalizeLatency(
  rawLatency: string,
  rawUnit: string,
): NormalizedLatency {
  const value = rawLatency.trim();
  const unit = rawUnit.trim().toLowerCase();

  if (value === "") {
    return {
      latencyMs: null,
      issues: [
        {
          code: "MISSING_LATENCY",
          field: "latency",
          rawValue: rawLatency,
          message: "Latency is missing; the status observation is retained but latency is unavailable.",
        },
      ],
    };
  }

  const isDecimalNumber = /^[+-]?(?:\d+(?:\.\d*)?|\.\d+)(?:[eE][+-]?\d+)?$/.test(value);
  const numeric = Number(value);
  if (!isDecimalNumber || !Number.isFinite(numeric)) {
    return {
      latencyMs: null,
      issues: [
        {
          code: "INVALID_LATENCY",
          field: "latency",
          rawValue: rawLatency,
          message: "Latency is not a finite numeric value.",
        },
      ],
    };
  }

  const issues: QualityIssue[] = [];

  if (numeric < 0) {
    issues.push({
      code: "NEGATIVE_LATENCY",
      field: "latency",
      rawValue: rawLatency,
      message: "Negative latency is invalid and was excluded from normalized latency statistics.",
    });
  }

  if (unit !== "ms" && unit !== "s") {
    issues.push({
      code: "UNKNOWN_LATENCY_UNIT",
      field: "latency_unit",
      rawValue: rawUnit,
      message: "Latency unit is not supported; expected 'ms' or 's'.",
    });
  }

  if (issues.length > 0) {
    return { latencyMs: null, issues };
  }

  return {
    latencyMs: unit === "s" ? numeric * 1000 : numeric,
    issues: [],
  };
}
