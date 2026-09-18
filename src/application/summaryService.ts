import { mergeIssueCounts } from "../aggregation/issueCounts";
import type { UploadRepository } from "../persistence/UploadRepository";
import type {
  DailyStatRecord,
  IssueCounts,
  UploadRecord,
} from "../persistence/models";
import type { IntervalSummary } from "../types";
import { percentileNearestRank } from "../utils/percentile";
import { applicationError } from "./errors";
import {
  isCompleteCalendarMonth,
  resolveDateRange,
  uploadCoversDateRangeBoundaries,
} from "./dateRange";

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

function summarizeDailyStats(stats: readonly DailyStatRecord[]): SummaryMetrics {
  let healthyIntervals = 0;
  let downIntervals = 0;
  let unknownIntervals = 0;
  let conflictedIntervals = 0;
  let expectedIntervals = 0;
  const latencySamples: number[] = [];

  for (const stat of stats) {
    expectedIntervals += stat.expectedIntervals;
    healthyIntervals += stat.healthyIntervals;
    downIntervals += stat.downIntervals;
    unknownIntervals += stat.unknownIntervals;
    conflictedIntervals += stat.conflictedIntervals;
    latencySamples.push(...stat.latencySamplesMs);
  }

  const resolvedIntervals = healthyIntervals + downIntervals;
  const unresolvedIntervals = unknownIntervals + conflictedIntervals;

  return {
    expectedIntervals,
    healthyIntervals,
    downIntervals,
    unknownIntervals,
    conflictedIntervals,
    resolvedIntervals,
    unresolvedIntervals,
    availabilityPercent:
      resolvedIntervals === 0
        ? null
        : (healthyIntervals / resolvedIntervals) * 100,
    coveragePercent:
      expectedIntervals === 0
        ? null
        : (resolvedIntervals / expectedIntervals) * 100,
    detectedDowntimeMinutes: downIntervals * 15,
    p95LatencyMs: percentileNearestRank(latencySamples, 95),
    issueCounts: mergeIssueCounts(stats.map((stat) => stat.issueCounts)),
  };
}

function slaEvaluation(
  metrics: SummaryMetrics,
  targetPercent: number,
  completeCalendarMonth: boolean,
  uploadCoversPeriodBoundaries: boolean,
): ServiceSlaEvaluation {
  if (!completeCalendarMonth) {
    return {
      targetPercent,
      evaluable: false,
      observedTargetMet: null,
      reason: "Selected period is not a complete calendar month.",
    };
  }

  if (!uploadCoversPeriodBoundaries) {
    return {
      targetPercent,
      evaluable: false,
      observedTargetMet: null,
      reason: "Uploaded data does not cover the complete selected month boundaries.",
    };
  }

  if (metrics.expectedIntervals !== metrics.resolvedIntervals) {
    return {
      targetPercent,
      evaluable: false,
      observedTargetMet: null,
      reason: "Monitoring coverage is incomplete or conflicted for this service.",
    };
  }

  if (metrics.availabilityPercent === null) {
    return {
      targetPercent,
      evaluable: false,
      observedTargetMet: null,
      reason: "No resolved monitoring intervals are available.",
    };
  }

  return {
    targetPercent,
    evaluable: true,
    observedTargetMet: metrics.availabilityPercent >= targetPercent,
    reason: null,
  };
}

function requireQueryableUpload(upload: UploadRecord | null): UploadRecord {
  if (upload === null) {
    throw applicationError("UPLOAD_NOT_FOUND", "Upload was not found.", 404);
  }
  if (upload.status !== "complete") {
    throw applicationError(
      "UPLOAD_NOT_READY",
      `Upload is '${upload.status}' and cannot be queried yet.`,
      409,
    );
  }
  return upload;
}

export async function getUploadSummary(input: {
  repository: UploadRepository;
  uploadId: string;
  from?: string;
  to?: string;
  slaTargetPercent: number;
}): Promise<UploadSummaryResponse> {
  const upload = requireQueryableUpload(
    await input.repository.getUpload(input.uploadId),
  );
  const range = resolveDateRange(upload, input.from, input.to);
  const stats = await input.repository.getDailyStats(
    upload.uploadId,
    range.fromDate,
    range.toDate,
  );

  const completeCalendarMonth = isCompleteCalendarMonth(
    range.fromDate,
    range.toDate,
  );
  const coversBoundaries = uploadCoversDateRangeBoundaries(upload, range);
  const overall = summarizeDailyStats(stats);

  const byService = new Map<string, DailyStatRecord[]>();
  for (const stat of stats) {
    const existing = byService.get(stat.serviceId);
    if (existing === undefined) {
      byService.set(stat.serviceId, [stat]);
    } else {
      existing.push(stat);
    }
  }

  const services = upload.services.map((service) => {
    const metrics = summarizeDailyStats(byService.get(service.serviceId) ?? []);
    return {
      serviceId: service.serviceId,
      serviceName: service.serviceName,
      ...metrics,
      sla: slaEvaluation(
        metrics,
        input.slaTargetPercent,
        completeCalendarMonth,
        coversBoundaries,
      ),
    };
  });

  return {
    uploadId: upload.uploadId,
    filename: upload.filename,
    period: {
      from: range.fromDate,
      to: range.toDate,
      completeCalendarMonth,
      uploadCoversPeriodBoundaries: coversBoundaries,
    },
    overall,
    services,
    slaTargetPercent: input.slaTargetPercent,
  };
}
