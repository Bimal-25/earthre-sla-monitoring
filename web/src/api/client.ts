import type {
  ApiErrorBody,
  LogsResponse,
  PublicUpload,
  UploadMetadataResponse,
  UploadResponse,
  UploadSummaryResponse,
} from "./types";

const configuredBase = import.meta.env.VITE_API_BASE_URL?.trim() ?? "";

export const API_BASE_URL = configuredBase.replace(/\/+$/, "");

export class ApiError extends Error {
  readonly status: number;
  readonly code: string;
  readonly requestId: string | null;
  readonly details: unknown;

  constructor(input: {
    status: number;
    code: string;
    message: string;
    requestId?: string | null;
    details?: unknown;
  }) {
    super(input.message);

    this.name = "ApiError";
    this.status = input.status;
    this.code = input.code;
    this.requestId = input.requestId ?? null;
    this.details = input.details;
  }
}

function endpoint(path: string): string {
  return `${API_BASE_URL}${path}`;
}

/**
 * Request cancellation is expected lifecycle behaviour.
 *
 * React StrictMode intentionally mounts, cleans up, and remounts effects
 * during development. Fetch requests aborted during effect cleanup must not
 * be reported to users as network failures.
 */
function isAbortError(error: unknown, signal?: AbortSignal | null): boolean {
  if (signal?.aborted === true) {
    return true;
  }

  if (error instanceof DOMException && error.name === "AbortError") {
    return true;
  }

  return error instanceof Error && error.name === "AbortError";
}

function createAbortError(): DOMException {
  return new DOMException("The request was aborted.", "AbortError");
}

async function parseError(response: Response): Promise<ApiError> {
  let body: ApiErrorBody | null = null;

  try {
    body = (await response.json()) as ApiErrorBody;
  } catch {
    // Upstream infrastructure can occasionally return non-JSON responses.
    // Fall through to a stable generic HTTP error.
  }

  const requestId =
    body?.error.requestId ?? response.headers.get("x-request-id") ?? null;

  return new ApiError({
    status: response.status,
    code: body?.error.code ?? `HTTP_${response.status}`,
    message:
      body?.error.message ??
      `The request failed with HTTP ${response.status}. Please try again.`,
    requestId,
    details: body?.error.details,
  });
}

async function requestJson<T>(path: string, init?: RequestInit): Promise<T> {
  let response: Response;

  try {
    response = await fetch(endpoint(path), init);
  } catch (error) {
    /*
     * Do not convert intentional AbortController cancellation into a
     * NETWORK_ERROR. Callers use AbortError to silently ignore stale
     * requests during React effect cleanup.
     */
    if (isAbortError(error, init?.signal)) {
      throw createAbortError();
    }

    throw new ApiError({
      status: 0,
      code: "NETWORK_ERROR",
      message:
        error instanceof Error
          ? `Unable to reach the API: ${error.message}`
          : "Unable to reach the API.",
    });
  }

  if (!response.ok) {
    throw await parseError(response);
  }

  return (await response.json()) as T;
}

export function safeHeaderFilename(filename: string): string {
  const sanitized = filename
    .replace(/[\u0000-\u001f\u007f]/g, "")
    .replace(/[^\x20-\x7e]/g, "_")
    .trim();

  return sanitized || "monitoring.csv";
}

export async function uploadCsv(
  file: File,
  signal?: AbortSignal,
): Promise<UploadResponse> {
  return requestJson<UploadResponse>("/v1/uploads", {
    method: "POST",
    headers: {
      "Content-Type": "text/csv",
      "X-File-Name": safeHeaderFilename(file.name),
    },
    body: file,
    ...(signal === undefined ? {} : { signal }),
  });
}

export async function getUpload(
  uploadId: string,
  signal?: AbortSignal,
): Promise<PublicUpload> {
  const response = await requestJson<UploadMetadataResponse>(
    `/v1/uploads/${encodeURIComponent(uploadId)}`,
    signal === undefined ? undefined : { signal },
  );

  return response.upload;
}

export interface SummaryQuery {
  from?: string;
  to?: string;
}

export interface LogsQuery extends SummaryQuery {
  serviceId?: string;
  pageSize?: number;
  cursor?: string;
}

export function queryString(
  values: Readonly<Record<string, string | number | undefined>>,
): string {
  const params = new URLSearchParams();

  Object.entries(values).forEach(([key, value]) => {
    if (value !== undefined && value !== "") {
      params.set(key, String(value));
    }
  });

  const encoded = params.toString();

  return encoded === "" ? "" : `?${encoded}`;
}

export async function getSummary(
  uploadId: string,
  query: SummaryQuery,
  signal?: AbortSignal,
): Promise<UploadSummaryResponse> {
  return requestJson<UploadSummaryResponse>(
    `/v1/uploads/${encodeURIComponent(uploadId)}/summary${queryString({
      from: query.from,
      to: query.to,
    })}`,
    signal === undefined ? undefined : { signal },
  );
}

export async function getLogs(
  uploadId: string,
  query: LogsQuery,
  signal?: AbortSignal,
): Promise<LogsResponse> {
  return requestJson<LogsResponse>(
    `/v1/uploads/${encodeURIComponent(uploadId)}/logs${queryString({
      from: query.from,
      to: query.to,
      serviceId: query.serviceId,
      pageSize: query.pageSize,
      cursor: query.cursor,
    })}`,
    signal === undefined ? undefined : { signal },
  );
}
