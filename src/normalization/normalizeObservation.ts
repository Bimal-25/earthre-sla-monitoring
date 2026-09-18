import type {
  NormalizedObservation,
  ParsedMonitoringRow,
  QualityIssue,
  RequiredCsvColumn,
} from "../types";
import { normalizeLatency } from "./normalizeLatency";
import { normalizeStatus } from "./normalizeStatus";
import { normalizeTimestamp } from "./normalizeTimestamp";

const REQUIRED_NONEMPTY_FIELDS: Array<{
  source: RequiredCsvColumn;
  label: string;
}> = [
  { source: "service_id", label: "service_id" },
  { source: "service_name", label: "service_name" },
  { source: "agent", label: "agent" },
  { source: "region", label: "region" },
];

export function createIntervalKey(
  serviceId: string,
  timestampUtc: string,
): string {
  return `${serviceId}\u0000${timestampUtc}`;
}

export function normalizeObservation(
  parsed: ParsedMonitoringRow,
): NormalizedObservation {
  const { raw } = parsed;
  const serviceId = raw.service_id.trim();
  const serviceName = raw.service_name.trim();
  const agent = raw.agent.trim();
  const region = raw.region.trim();

  const issues: QualityIssue[] = [];

  for (const field of REQUIRED_NONEMPTY_FIELDS) {
    if (raw[field.source].trim() === "") {
      issues.push({
        code: "MISSING_REQUIRED_FIELD",
        field: field.source,
        rawValue: raw[field.source],
        message: `Required field '${field.label}' is blank.`,
      });
    }
  }

  const timestamp = normalizeTimestamp(raw.timestamp);
  const status = normalizeStatus(raw.status_code);
  const latency = normalizeLatency(raw.latency, raw.latency_unit);

  issues.push(...timestamp.issues, ...status.issues, ...latency.issues);

  const intervalKey =
    serviceId !== "" &&
    timestamp.timestampUtc !== null &&
    timestamp.isOnExpectedCadence
      ? createIntervalKey(serviceId, timestamp.timestampUtc)
      : null;

  return {
    sourceRow: parsed.sourceRow,
    sourceRows: [parsed.sourceRow],
    duplicateCount: 1,
    raw,
    serviceId,
    serviceName,
    agent,
    region,
    timestampRaw: raw.timestamp,
    timestampUtc: timestamp.timestampUtc,
    isOnExpectedCadence: timestamp.isOnExpectedCadence,
    statusCodeRaw: raw.status_code,
    statusCode: status.statusCode,
    healthState: status.healthState,
    latencyRaw: raw.latency,
    latencyUnitRaw: raw.latency_unit,
    latencyMs: latency.latencyMs,
    intervalKey,
    issues,
  };
}

export function normalizeObservations(
  rows: readonly ParsedMonitoringRow[],
): NormalizedObservation[] {
  return rows.map(normalizeObservation);
}
