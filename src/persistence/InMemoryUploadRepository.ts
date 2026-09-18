import type {
  ObservationListQuery,
  ObservationPage,
  UploadClaimInput,
  UploadClaimResult,
  UploadRepository,
} from "./UploadRepository";
import type {
  DailyStatRecord,
  StoredObservation,
  UploadFailure,
  UploadRecord,
} from "./models";

function clone<T>(value: T): T {
  return structuredClone(value);
}

export class InMemoryUploadRepository implements UploadRepository {
  private readonly uploads = new Map<string, UploadRecord>();
  private readonly observations = new Map<string, StoredObservation[]>();
  private readonly dailyStats = new Map<string, DailyStatRecord[]>();

  async claimUpload(input: UploadClaimInput): Promise<UploadClaimResult> {
    const existing = this.uploads.get(input.uploadId);

    if (existing?.status === "complete") {
      return { state: "complete", upload: clone(existing) };
    }

    if (existing?.status === "processing") {
      return { state: "processing", upload: clone(existing) };
    }

    const upload: UploadRecord = {
      uploadId: input.uploadId,
      fileHash: input.fileHash,
      filename: input.filename,
      schemaVersion: 1,
      status: "processing",
      createdAt: existing?.createdAt ?? input.nowUtc,
      updatedAt: input.nowUtc,
      processedAt: null,
      failedAt: null,
      failure: null,
      rangeStartUtc: null,
      rangeEndUtc: null,
      rangeStartDate: null,
      rangeEndDate: null,
      services: [],
      sourceRowCount: 0,
      storedObservationCount: 0,
      exactDuplicateRowsRemoved: 0,
      unassignedObservationCount: 0,
      issueCounts: {},
      overall: null,
    };

    this.uploads.set(upload.uploadId, clone(upload));
    return { state: "claimed", upload: clone(upload) };
  }

  async completeUpload(
    upload: UploadRecord,
    observations: readonly StoredObservation[],
    dailyStats: readonly DailyStatRecord[],
  ): Promise<void> {
    this.observations.set(upload.uploadId, clone([...observations]));
    this.dailyStats.set(upload.uploadId, clone([...dailyStats]));
    this.uploads.set(upload.uploadId, clone(upload));
  }

  async markUploadFailed(
    uploadId: string,
    failure: UploadFailure,
    nowUtc: string,
  ): Promise<void> {
    const existing = this.uploads.get(uploadId);
    if (existing === undefined) {
      return;
    }

    this.uploads.set(uploadId, {
      ...existing,
      status: "failed",
      updatedAt: nowUtc,
      failedAt: nowUtc,
      failure: clone(failure),
    });
  }

  async getUpload(uploadId: string): Promise<UploadRecord | null> {
    const value = this.uploads.get(uploadId);
    return value === undefined ? null : clone(value);
  }

  async getDailyStats(
    uploadId: string,
    fromDateInclusive: string,
    toDateInclusive: string,
  ): Promise<DailyStatRecord[]> {
    return clone(
      (this.dailyStats.get(uploadId) ?? []).filter(
        (stat) => stat.date >= fromDateInclusive && stat.date <= toDateInclusive,
      ),
    );
  }

  async listObservations(
    uploadId: string,
    query: ObservationListQuery,
  ): Promise<ObservationPage> {
    let items = (this.observations.get(uploadId) ?? [])
      .filter(
        (observation) =>
          observation.sortKey >= query.fromSortKeyInclusive &&
          observation.sortKey < query.toSortKeyExclusive,
      )
      .filter(
        (observation) =>
          query.serviceId === undefined || observation.serviceId === query.serviceId,
      )
      .sort((a, b) => a.sortKey.localeCompare(b.sortKey));

    if (query.afterSortKey !== undefined) {
      items = items.filter((observation) => observation.sortKey > query.afterSortKey!);
    }

    const hasMore = items.length > query.pageSize;
    const page = items.slice(0, query.pageSize);

    return {
      items: clone(page),
      nextSortKey:
        hasMore && page.length > 0
          ? (page[page.length - 1]?.sortKey ?? null)
          : null,
    };
  }
}
