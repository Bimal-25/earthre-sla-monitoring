import type { UploadRepository } from "../persistence/UploadRepository";
import type { StoredObservation, UploadRecord } from "../persistence/models";
import { decodeLogsCursor, encodeLogsCursor } from "./cursor";
import { resolveDateRange } from "./dateRange";
import { applicationError } from "./errors";

export interface LogsResponse {
  uploadId: string;
  period: { from: string; to: string };
  serviceId: string | null;
  items: Omit<StoredObservation, "sortKey">[];
  nextCursor: string | null;
  hasMore: boolean;
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

function withoutSortKey(
  observation: StoredObservation,
): Omit<StoredObservation, "sortKey"> {
  const { sortKey: _sortKey, ...publicObservation } = observation;
  return publicObservation;
}

export async function getUploadLogs(input: {
  repository: UploadRepository;
  uploadId: string;
  from?: string;
  to?: string;
  serviceId?: string;
  pageSize: number;
  cursor?: string;
}): Promise<LogsResponse> {
  const upload = requireQueryableUpload(
    await input.repository.getUpload(input.uploadId),
  );
  const range = resolveDateRange(upload, input.from, input.to);
  const serviceId = input.serviceId?.trim() || undefined;

  if (
    serviceId !== undefined &&
    !upload.services.some((service) => service.serviceId === serviceId)
  ) {
    throw applicationError(
      "UNKNOWN_SERVICE",
      `Service '${serviceId}' does not exist in this upload.`,
      400,
    );
  }

  const cursorContext = {
    from: range.fromDate,
    to: range.toDate,
    serviceId: serviceId ?? null,
  };
  const afterSortKey =
    input.cursor === undefined
      ? undefined
      : decodeLogsCursor(input.cursor, cursorContext);

  const page = await input.repository.listObservations(upload.uploadId, {
    fromSortKeyInclusive: `${range.fromUtcInclusive}|`,
    toSortKeyExclusive: `${range.toUtcExclusive}|`,
    ...(serviceId === undefined ? {} : { serviceId }),
    ...(afterSortKey === undefined ? {} : { afterSortKey }),
    pageSize: input.pageSize,
  });

  return {
    uploadId: upload.uploadId,
    period: { from: range.fromDate, to: range.toDate },
    serviceId: serviceId ?? null,
    items: page.items.map(withoutSortKey),
    nextCursor:
      page.nextSortKey === null
        ? null
        : encodeLogsCursor({ sortKey: page.nextSortKey, ...cursorContext }),
    hasMore: page.nextSortKey !== null,
  };
}
