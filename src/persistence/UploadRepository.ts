import type {
  DailyStatRecord,
  StoredObservation,
  UploadFailure,
  UploadRecord,
} from "./models";

export interface UploadClaimInput {
  uploadId: string;
  fileHash: string;
  filename: string;
  nowUtc: string;
}

export type UploadClaimResult =
  | { state: "claimed"; upload: UploadRecord }
  | { state: "complete"; upload: UploadRecord }
  | { state: "processing"; upload: UploadRecord };

export interface ObservationListQuery {
  fromSortKeyInclusive: string;
  toSortKeyExclusive: string;
  serviceId?: string;
  afterSortKey?: string;
  pageSize: number;
}

export interface ObservationPage {
  items: StoredObservation[];
  nextSortKey: string | null;
}

export interface UploadRepository {
  claimUpload(input: UploadClaimInput): Promise<UploadClaimResult>;

  completeUpload(
    upload: UploadRecord,
    observations: readonly StoredObservation[],
    dailyStats: readonly DailyStatRecord[],
  ): Promise<void>;

  markUploadFailed(
    uploadId: string,
    failure: UploadFailure,
    nowUtc: string,
  ): Promise<void>;

  getUpload(uploadId: string): Promise<UploadRecord | null>;

  getDailyStats(
    uploadId: string,
    fromDateInclusive: string,
    toDateInclusive: string,
  ): Promise<DailyStatRecord[]>;

  listObservations(
    uploadId: string,
    query: ObservationListQuery,
  ): Promise<ObservationPage>;
}
