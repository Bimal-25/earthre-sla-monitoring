import type {
  CanonicalIntervalState,
  IntervalSummary,
  QualityIssue,
  QualityIssueCode,
  RawCheckRow,
  ServiceDescriptor,
} from "../types";

export type UploadStatus = "processing" | "complete" | "failed";

export type IssueCounts = Partial<Record<QualityIssueCode, number>>;

export interface UploadFailure {
  code: string;
  message: string;
}

export interface UploadRecord {
  uploadId: string;
  fileHash: string;
  filename: string;
  schemaVersion: 1;
  status: UploadStatus;

  createdAt: string;
  updatedAt: string;
  processedAt: string | null;
  failedAt: string | null;
  failure: UploadFailure | null;

  rangeStartUtc: string | null;
  rangeEndUtc: string | null;
  rangeStartDate: string | null;
  rangeEndDate: string | null;

  services: ServiceDescriptor[];

  sourceRowCount: number;
  storedObservationCount: number;
  exactDuplicateRowsRemoved: number;
  unassignedObservationCount: number;

  issueCounts: IssueCounts;
  overall: IntervalSummary | null;
}

export interface StoredObservation {
  observationId: string;
  uploadId: string;
  sortKey: string;

  sourceRow: number;
  sourceRows: number[];
  duplicateCount: number;

  raw: RawCheckRow;

  serviceId: string;
  serviceName: string;
  agent: string;
  region: string;

  timestampRaw: string;
  timestampUtc: string | null;
  dateUtc: string | null;
  isOnExpectedCadence: boolean;

  statusCodeRaw: string;
  statusCode: number | null;
  healthState: "healthy" | "down" | null;

  latencyRaw: string;
  latencyUnitRaw: string;
  latencyMs: number | null;

  intervalKey: string | null;
  issues: QualityIssue[];
}

export interface DailyStatRecord {
  dailyStatId: string;
  uploadId: string;
  date: string;
  serviceId: string;
  serviceName: string;

  expectedIntervals: number;
  healthyIntervals: number;
  downIntervals: number;
  unknownIntervals: number;
  conflictedIntervals: number;
  resolvedIntervals: number;
  unresolvedIntervals: number;
  detectedDowntimeMinutes: number;

  /** One representative latency value per canonical interval when available. */
  latencySamplesMs: number[];

  /** Source-observation quality findings assigned to this service/day. */
  issueCounts: IssueCounts;

  /** Useful for troubleshooting without storing every interval document. */
  intervalStateCounts: Record<CanonicalIntervalState, number>;
}
