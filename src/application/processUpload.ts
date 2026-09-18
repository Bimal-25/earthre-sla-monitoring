import {
  CsvParseError,
  CsvSchemaError,
  IntervalBuildError,
} from "../errors";
import { parseMonitoringCsv } from "../csv/parseMonitoringCsv";
import { normalizeObservations } from "../normalization/normalizeObservation";
import { deduplicateObservations } from "../deduplication/deduplicateObservations";
import { buildCanonicalIntervals } from "../intervals/buildCanonicalIntervals";
import { summarizeIntervals } from "../intervals/summarizeIntervals";
import { buildDailyStats } from "../aggregation/buildDailyStats";
import { countUploadIssues } from "../aggregation/issueCounts";
import type { UploadRepository } from "../persistence/UploadRepository";
import { sha256Hex } from "../persistence/documentIds";
import { toStoredObservation } from "../persistence/mappers";
import type { UploadRecord } from "../persistence/models";
import { applicationError, ApplicationError } from "./errors";
import { normalizeCsvFilename } from "./filename";

export interface ProcessUploadInput {
  bytes: Uint8Array;
  filenameHeader: string | undefined;
  repository: UploadRepository;
  maxCsvRows: number;
  now?: () => Date;
}

export interface ProcessUploadResult {
  upload: UploadRecord;
  alreadyProcessed: boolean;
}

function decodeUtf8(bytes: Uint8Array): string {
  try {
    return new TextDecoder("utf-8", { fatal: true }).decode(bytes);
  } catch {
    throw applicationError(
      "INVALID_TEXT_ENCODING",
      "CSV must be valid UTF-8 text.",
      422,
    );
  }
}

function toFailure(error: unknown): { code: string; message: string } {
  if (error instanceof ApplicationError) {
    return { code: error.code, message: error.message };
  }
  if (error instanceof CsvSchemaError || error instanceof CsvParseError) {
    return { code: "INVALID_CSV", message: error.message };
  }
  if (error instanceof IntervalBuildError) {
    return { code: "INTERVAL_BUILD_FAILED", message: error.message };
  }
  if (error instanceof Error) {
    return { code: "PROCESSING_FAILED", message: error.message };
  }
  return { code: "PROCESSING_FAILED", message: "Unknown processing failure." };
}

function translateDomainError(error: unknown): never {
  if (error instanceof ApplicationError) {
    throw error;
  }
  if (error instanceof CsvSchemaError || error instanceof CsvParseError) {
    throw applicationError("INVALID_CSV", error.message, 422, {
      ...(error instanceof CsvParseError && error.recordNumber !== undefined
        ? { recordNumber: error.recordNumber }
        : {}),
    });
  }
  if (error instanceof IntervalBuildError) {
    throw applicationError("INTERVAL_BUILD_FAILED", error.message, 422);
  }
  throw error;
}

export async function processCsvUpload(
  input: ProcessUploadInput,
): Promise<ProcessUploadResult> {
  if (input.bytes.length === 0) {
    throw applicationError("EMPTY_UPLOAD", "Uploaded CSV is empty.", 422);
  }

  const filename = normalizeCsvFilename(input.filenameHeader);
  const uploadId = await sha256Hex(input.bytes);
  const now = input.now ?? (() => new Date());
  const claimTime = now().toISOString();

  const claim = await input.repository.claimUpload({
    uploadId,
    fileHash: uploadId,
    filename,
    nowUtc: claimTime,
  });

  if (claim.state === "complete") {
    return { upload: claim.upload, alreadyProcessed: true };
  }

  if (claim.state === "processing") {
    throw applicationError(
      "UPLOAD_IN_PROGRESS",
      "This exact CSV is already being processed.",
      409,
      { uploadId },
    );
  }

  try {
    const csvText = decodeUtf8(input.bytes);
    const parsed = parseMonitoringCsv(csvText);

    if (parsed.rows.length === 0) {
      throw applicationError(
        "EMPTY_DATASET",
        "CSV contains a header but no monitoring rows.",
        422,
      );
    }

    if (parsed.rows.length > input.maxCsvRows) {
      throw applicationError(
        "ROW_LIMIT_EXCEEDED",
        `CSV contains ${parsed.rows.length} rows; limit is ${input.maxCsvRows}.`,
        413,
        { rows: parsed.rows.length, limit: input.maxCsvRows },
      );
    }

    const normalized = normalizeObservations(parsed.rows);
    const deduplicated = deduplicateObservations(normalized);
    const canonical = buildCanonicalIntervals(deduplicated);

    if (canonical.window === null || canonical.intervals.length === 0) {
      throw applicationError(
        "NO_CANONICAL_INTERVALS",
        "CSV does not contain any usable on-cadence service/timestamp intervals.",
        422,
      );
    }

    const exactDuplicateRowsRemoved = parsed.rows.length - deduplicated.length;
    const issueCounts = countUploadIssues(
      normalized,
      exactDuplicateRowsRemoved,
    );
    const completedAt = now().toISOString();
    const rangeStartDate = canonical.window.startUtc.slice(0, 10);
    const rangeEndDate = canonical.window.endUtc.slice(0, 10);

    const upload: UploadRecord = {
      ...claim.upload,
      filename,
      status: "complete",
      updatedAt: completedAt,
      processedAt: completedAt,
      failedAt: null,
      failure: null,
      rangeStartUtc: canonical.window.startUtc,
      rangeEndUtc: canonical.window.endUtc,
      rangeStartDate,
      rangeEndDate,
      services: canonical.services.map((service) => ({ ...service })),
      sourceRowCount: parsed.rows.length,
      storedObservationCount: deduplicated.length,
      exactDuplicateRowsRemoved,
      unassignedObservationCount: canonical.unassignedObservations.length,
      issueCounts,
      overall: summarizeIntervals(canonical.intervals),
    };

    const storedObservations = await Promise.all(
      deduplicated.map((observation) =>
        toStoredObservation(uploadId, observation),
      ),
    );
    const dailyStats = buildDailyStats(
      uploadId,
      canonical.intervals,
      normalized,
      deduplicated,
    );

    await input.repository.completeUpload(
      upload,
      storedObservations,
      dailyStats,
    );

    return { upload, alreadyProcessed: false };
  } catch (error) {
    const failedAt = now().toISOString();
    const failure = toFailure(error);

    try {
      await input.repository.markUploadFailed(uploadId, failure, failedAt);
    } catch {
      // Preserve the original processing error. The structured server log will
      // still show the persistence failure at the API boundary.
    }

    translateDomainError(error);
  }
}
