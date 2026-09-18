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

const WRITE_BATCH_SIZE = 450;

interface DocumentSnapshotLike {
  readonly exists: boolean;
  data(): unknown;
}

interface QueryDocumentSnapshotLike {
  data(): unknown;
}

interface QuerySnapshotLike {
  readonly docs: QueryDocumentSnapshotLike[];
}

interface QueryLike {
  where(fieldPath: string, op: string, value: unknown): QueryLike;
  orderBy(fieldPath: string, direction?: "asc" | "desc"): QueryLike;
  startAfter(value: unknown): QueryLike;
  limit(value: number): QueryLike;
  get(): Promise<QuerySnapshotLike>;
}

interface DocumentReferenceLike {
  collection(name: string): CollectionReferenceLike;
  get(): Promise<DocumentSnapshotLike>;
  set(data: unknown, options?: { merge: boolean }): Promise<unknown>;
}

interface CollectionReferenceLike extends QueryLike {
  doc(id: string): DocumentReferenceLike;
}

interface TransactionLike {
  get(ref: DocumentReferenceLike): Promise<DocumentSnapshotLike>;
  set(ref: DocumentReferenceLike, data: unknown): TransactionLike;
}

interface WriteBatchLike {
  set(ref: DocumentReferenceLike, data: unknown): WriteBatchLike;
  commit(): Promise<unknown>;
}

/** Structural subset of the official @google-cloud/firestore client we use. */
export interface FirestoreLike {
  collection(name: string): CollectionReferenceLike;
  runTransaction<T>(
    updateFunction: (transaction: TransactionLike) => Promise<T>,
  ): Promise<T>;
  batch(): WriteBatchLike;
}

function chunk<T>(items: readonly T[], size: number): T[][] {
  const groups: T[][] = [];
  for (let index = 0; index < items.length; index += size) {
    groups.push(items.slice(index, index + size));
  }
  return groups;
}

export interface FirestoreUploadRepositoryOptions {
  firestore: FirestoreLike;
  uploadsCollection?: string;
}

/**
 * Typed persistence adapter. The cloud entry point constructs the official
 * Firestore client and injects it here, keeping Google SDK construction at the
 * outermost runtime boundary while this repository remains type-checkable and
 * independently testable.
 */
export class FirestoreUploadRepository implements UploadRepository {
  private readonly firestore: FirestoreLike;
  private readonly uploadsCollection: string;

  constructor(options: FirestoreUploadRepositoryOptions) {
    this.firestore = options.firestore;
    this.uploadsCollection = options.uploadsCollection ?? "uploads";
  }

  async claimUpload(input: UploadClaimInput): Promise<UploadClaimResult> {
    const ref = this.firestore.collection(this.uploadsCollection).doc(input.uploadId);

    return this.firestore.runTransaction(async (transaction) => {
      const snapshot = await transaction.get(ref);

      if (snapshot.exists) {
        const existing = snapshot.data() as UploadRecord;
        if (existing.status === "complete") {
          return { state: "complete", upload: existing } as const;
        }
        if (existing.status === "processing") {
          return { state: "processing", upload: existing } as const;
        }

        const retried: UploadRecord = {
          ...existing,
          filename: input.filename,
          status: "processing",
          updatedAt: input.nowUtc,
          processedAt: null,
          failedAt: null,
          failure: null,
        };
        transaction.set(ref, retried);
        return { state: "claimed", upload: retried } as const;
      }

      const created: UploadRecord = {
        uploadId: input.uploadId,
        fileHash: input.fileHash,
        filename: input.filename,
        schemaVersion: 1,
        status: "processing",
        createdAt: input.nowUtc,
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

      transaction.set(ref, created);
      return { state: "claimed", upload: created } as const;
    });
  }

  async completeUpload(
    upload: UploadRecord,
    observations: readonly StoredObservation[],
    dailyStats: readonly DailyStatRecord[],
  ): Promise<void> {
    const uploadRef = this.firestore
      .collection(this.uploadsCollection)
      .doc(upload.uploadId);

    const observationsRef = uploadRef.collection("observations");
    for (const group of chunk(observations, WRITE_BATCH_SIZE)) {
      const batch = this.firestore.batch();
      for (const observation of group) {
        batch.set(observationsRef.doc(observation.observationId), observation);
      }
      await batch.commit();
    }

    const dailyStatsRef = uploadRef.collection("dailyStats");
    for (const group of chunk(dailyStats, WRITE_BATCH_SIZE)) {
      const batch = this.firestore.batch();
      for (const stat of group) {
        batch.set(dailyStatsRef.doc(stat.dailyStatId), stat);
      }
      await batch.commit();
    }

    // Finalize the parent last so readers never see `complete` before all
    // queryable child documents are durable.
    await uploadRef.set(upload);
  }

  async markUploadFailed(
    uploadId: string,
    failure: UploadFailure,
    nowUtc: string,
  ): Promise<void> {
    const ref = this.firestore.collection(this.uploadsCollection).doc(uploadId);
    await ref.set(
      {
        status: "failed",
        updatedAt: nowUtc,
        failedAt: nowUtc,
        failure,
      },
      { merge: true },
    );
  }

  async getUpload(uploadId: string): Promise<UploadRecord | null> {
    const snapshot = await this.firestore
      .collection(this.uploadsCollection)
      .doc(uploadId)
      .get();

    return snapshot.exists ? (snapshot.data() as UploadRecord) : null;
  }

  async getDailyStats(
    uploadId: string,
    fromDateInclusive: string,
    toDateInclusive: string,
  ): Promise<DailyStatRecord[]> {
    const snapshot = await this.firestore
      .collection(this.uploadsCollection)
      .doc(uploadId)
      .collection("dailyStats")
      .where("date", ">=", fromDateInclusive)
      .where("date", "<=", toDateInclusive)
      .orderBy("date", "asc")
      .get();

    return snapshot.docs.map((doc) => doc.data() as DailyStatRecord);
  }

  async listObservations(
    uploadId: string,
    query: ObservationListQuery,
  ): Promise<ObservationPage> {
    let firestoreQuery: QueryLike = this.firestore
      .collection(this.uploadsCollection)
      .doc(uploadId)
      .collection("observations");

    if (query.serviceId !== undefined) {
      firestoreQuery = firestoreQuery.where("serviceId", "==", query.serviceId);
    }

    firestoreQuery = firestoreQuery
      .where("sortKey", ">=", query.fromSortKeyInclusive)
      .where("sortKey", "<", query.toSortKeyExclusive)
      .orderBy("sortKey", "asc");

    if (query.afterSortKey !== undefined) {
      firestoreQuery = firestoreQuery.startAfter(query.afterSortKey);
    }

    const snapshot = await firestoreQuery.limit(query.pageSize + 1).get();
    const records = snapshot.docs.map((doc) => doc.data() as StoredObservation);
    const hasMore = records.length > query.pageSize;
    const items = records.slice(0, query.pageSize);

    return {
      items,
      nextSortKey:
        hasMore && items.length > 0
          ? (items[items.length - 1]?.sortKey ?? null)
          : null,
    };
  }
}
