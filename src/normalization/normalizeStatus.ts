import type { ObservationHealthState, QualityIssue } from "../types";

export interface NormalizedStatus {
  statusCode: number | null;
  healthState: ObservationHealthState;
  issues: QualityIssue[];
}

export function normalizeStatus(rawInput: string): NormalizedStatus {
  const value = rawInput.trim();

  if (!/^\d{3}$/.test(value)) {
    return {
      statusCode: null,
      healthState: null,
      issues: [
        {
          code: "INVALID_HTTP_STATUS",
          field: "status_code",
          rawValue: rawInput,
          message: "HTTP status must be an integer from 100 through 599.",
        },
      ],
    };
  }

  const statusCode = Number(value);
  if (statusCode < 100 || statusCode > 599) {
    return {
      statusCode: null,
      healthState: null,
      issues: [
        {
          code: "INVALID_HTTP_STATUS",
          field: "status_code",
          rawValue: rawInput,
          message: "HTTP status must be an integer from 100 through 599.",
        },
      ],
    };
  }

  let healthState: ObservationHealthState = null;
  if (statusCode >= 200 && statusCode <= 399) {
    healthState = "healthy";
  } else if (statusCode >= 400) {
    healthState = "down";
  }

  return {
    statusCode,
    healthState,
    issues: [],
  };
}
