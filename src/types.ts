export const REQUIRED_CSV_COLUMNS = [
  "service_id",
  "service_name",
  "timestamp",
  "status_code",
  "latency",
  "latency_unit",
  "agent",
  "region",
] as const;

export type RequiredCsvColumn = (typeof REQUIRED_CSV_COLUMNS)[number];

export interface RawCheckRow {
  service_id: string;
  service_name: string;
  timestamp: string;
  status_code: string;
  latency: string;
  latency_unit: string;
  agent: string;
  region: string;
}

export interface ParsedMonitoringRow {
  /** 1-based CSV record number. Header is record 1, so the first data row is 2. */
  sourceRow: number;
  raw: RawCheckRow;
}

export interface ParsedMonitoringCsv {
  headers: string[];
  rows: ParsedMonitoringRow[];
}

export type QualityIssueCode =
  | "UNIX_TIMESTAMP_NORMALIZED"
  | "UNIX_MILLISECONDS_TIMESTAMP_NORMALIZED"
  | "INVALID_TIMESTAMP"
  | "OFF_CADENCE_TIMESTAMP"
  | "MISSING_LATENCY"
  | "NEGATIVE_LATENCY"
  | "INVALID_LATENCY"
  | "UNKNOWN_LATENCY_UNIT"
  | "INVALID_HTTP_STATUS"
  | "MISSING_REQUIRED_FIELD"
  | "EXACT_DUPLICATE";

export interface QualityIssue {
  code: QualityIssueCode;
  message: string;
  field?: RequiredCsvColumn;
  rawValue?: string;
}

export type ObservationHealthState = "healthy" | "down" | null;

export interface NormalizedObservation {
  /** The first source row represented by this observation. */
  sourceRow: number;
  /** All source rows represented after exact duplicate collapse. */
  sourceRows: number[];
  /** Number of source rows represented after exact duplicate collapse. */
  duplicateCount: number;

  /** Original source values are retained for auditability. */
  raw: RawCheckRow;

  serviceId: string;
  serviceName: string;
  agent: string;
  region: string;

  timestampRaw: string;
  timestampUtc: string | null;
  isOnExpectedCadence: boolean;

  statusCodeRaw: string;
  statusCode: number | null;
  healthState: ObservationHealthState;

  latencyRaw: string;
  latencyUnitRaw: string;
  latencyMs: number | null;

  /** Present only when service + timestamp can participate in canonical SLA intervals. */
  intervalKey: string | null;

  issues: QualityIssue[];
}

export type CanonicalIntervalState =
  | "healthy"
  | "down"
  | "unknown"
  | "conflicted";

export interface ServiceDescriptor {
  serviceId: string;
  serviceName: string;
}

export interface CanonicalInterval {
  key: string;
  serviceId: string;
  serviceName: string;
  timestampUtc: string;
  state: CanonicalIntervalState;

  /** Number of deduplicated observations attached to the interval. */
  observationCount: number;
  /** Number of raw source rows represented, including exact duplicates. */
  rawObservationCount: number;
  /** Observations with a final healthy/down HTTP classification. */
  validHealthObservationCount: number;

  /** Median of valid normalized agent latency values for this interval. */
  representativeLatencyMs: number | null;

  sourceRows: number[];
  issues: QualityIssue[];
}

export interface CanonicalIntervalWindow {
  startUtc: string;
  endUtc: string;
  cadenceMinutes: 15;
  slotsPerService: number;
}

export interface CanonicalIntervalBuildResult {
  services: ServiceDescriptor[];
  window: CanonicalIntervalWindow | null;
  intervals: CanonicalInterval[];
  /** Rows that cannot be assigned because service/timestamp/cadence is unusable. */
  unassignedObservations: NormalizedObservation[];
}

export interface IntervalSummary {
  expectedIntervals: number;
  healthyIntervals: number;
  downIntervals: number;
  unknownIntervals: number;
  conflictedIntervals: number;
  resolvedIntervals: number;
  unresolvedIntervals: number;
  availabilityPercent: number | null;
  coveragePercent: number | null;
  detectedDowntimeMinutes: number;
}
