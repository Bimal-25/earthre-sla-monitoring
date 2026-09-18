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

export type IssueCounts = Partial<Record<QualityIssueCode, number>>;

export interface ServiceDescriptor {
  serviceId: string;
  serviceName: string;
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

export interface PublicUpload {
  uploadId: string;
  filename: string;
  status: "processing" | "complete" | "failed";
  createdAt: string;
  updatedAt: string;
  processedAt: string | null;
  failedAt: string | null;
  failure: { code: string; message: string } | null;
  range: {
    startUtc: string | null;
    endUtc: string | null;
    startDate: string | null;
    endDate: string | null;
  };
  services: ServiceDescriptor[];
  counts: {
    sourceRows: number;
    storedObservations: number;
    exactDuplicateRowsRemoved: number;
    unassignedObservations: number;
  };
  quality: IssueCounts;
  overall: IntervalSummary | null;
}

export interface UploadResponse {
  alreadyProcessed: boolean;
  upload: PublicUpload;
}

export interface UploadMetadataResponse {
  upload: PublicUpload;
}

export interface SummaryMetrics extends IntervalSummary {
  p95LatencyMs: number | null;
  issueCounts: IssueCounts;
}

export interface ServiceSlaEvaluation {
  targetPercent: number;
  evaluable: boolean;
  observedTargetMet: boolean | null;
  reason: string | null;
}

export interface ServiceSummary extends SummaryMetrics {
  serviceId: string;
  serviceName: string;
  sla: ServiceSlaEvaluation;
}

export interface UploadSummaryResponse {
  uploadId: string;
  filename: string;
  period: {
    from: string;
    to: string;
    completeCalendarMonth: boolean;
    uploadCoversPeriodBoundaries: boolean;
  };
  overall: SummaryMetrics;
  services: ServiceSummary[];
  slaTargetPercent: number;
}

export interface QualityIssue {
  code: QualityIssueCode;
  message: string;
  field?: string;
  rawValue?: string;
}

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

export interface LogObservation {
  observationId: string;
  uploadId: string;
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

export interface LogsResponse {
  uploadId: string;
  period: { from: string; to: string };
  serviceId: string | null;
  items: LogObservation[];
  nextCursor: string | null;
  hasMore: boolean;
}

export interface ApiErrorBody {
  error: {
    code: string;
    message: string;
    details?: unknown;
    requestId?: string;
  };
}
