import type { AppConfig } from "../config";
import { ApplicationError, applicationError } from "../application/errors";
import { getUploadLogs } from "../application/logsService";
import { processCsvUpload } from "../application/processUpload";
import { getUploadSummary } from "../application/summaryService";
import type { Logger } from "../observability/logger";
import type { UploadRepository } from "../persistence/UploadRepository";
import type { UploadRecord } from "../persistence/models";

export interface HttpRequestLike {
  method?: string;
  url?: string;
  originalUrl?: string;
  path?: string;
  headers?: Readonly<Record<string, string | string[] | undefined>>;
  get?: (name: string) => string | undefined;
  rawBody?: Uint8Array;
  body?: unknown;
  [Symbol.asyncIterator]?: () => AsyncIterator<Uint8Array | string>;
}

export interface HttpResponseLike {
  statusCode?: number;
  status?: (code: number) => HttpResponseLike;
  json?: (body: unknown) => unknown;
  setHeader: (name: string, value: string) => unknown;
  end: (body?: string) => unknown;
}

export interface ApiDependencies {
  repository: UploadRepository;
  config: AppConfig;
  logger: Logger;
}

function getHeader(request: HttpRequestLike, name: string): string | undefined {
  const viaGet = request.get?.(name);
  if (viaGet !== undefined) {
    return viaGet;
  }

  const headers = request.headers ?? {};
  const lower = name.toLowerCase();
  for (const [key, value] of Object.entries(headers)) {
    if (key.toLowerCase() !== lower || value === undefined) {
      continue;
    }
    return Array.isArray(value) ? value[0] : value;
  }
  return undefined;
}

function requestUrl(request: HttpRequestLike): URL {
  const value = request.originalUrl ?? request.url ?? request.path ?? "/";
  return new URL(value, "http://localhost");
}

function optionalQuery(url: URL, name: string): string | undefined {
  const values = url.searchParams.getAll(name);
  if (values.length === 0) {
    return undefined;
  }
  if (values.length > 1) {
    throw applicationError(
      "INVALID_QUERY_PARAMETER",
      `Query parameter '${name}' must be supplied once.`,
      400,
    );
  }
  return values[0] ?? undefined;
}

function validateUploadId(uploadId: string): void {
  if (!/^[a-f0-9]{64}$/.test(uploadId)) {
    throw applicationError(
      "INVALID_UPLOAD_ID",
      "Upload ID must be a 64-character SHA-256 hexadecimal value.",
      400,
    );
  }
}

function resolvePageSize(raw: string | undefined, config: AppConfig): number {
  if (raw === undefined || raw.trim() === "") {
    return config.defaultPageSize;
  }
  if (!/^\d+$/.test(raw)) {
    throw applicationError(
      "INVALID_PAGE_SIZE",
      "pageSize must be a positive integer.",
      400,
    );
  }
  const parsed = Number(raw);
  if (parsed < 1 || parsed > config.maxPageSize) {
    throw applicationError(
      "INVALID_PAGE_SIZE",
      `pageSize must be between 1 and ${config.maxPageSize}.`,
      400,
    );
  }
  return parsed;
}

function setStatus(response: HttpResponseLike, statusCode: number): void {
  if (response.status !== undefined) {
    response.status(statusCode);
  } else {
    response.statusCode = statusCode;
  }
}

function sendJson(
  response: HttpResponseLike,
  statusCode: number,
  body: unknown,
): void {
  setStatus(response, statusCode);
  response.setHeader("Content-Type", "application/json; charset=utf-8");
  if (response.json !== undefined) {
    response.json(body);
  } else {
    response.end(JSON.stringify(body));
  }
}

function sendNoContent(response: HttpResponseLike): void {
  setStatus(response, 204);
  response.end();
}

function publicUpload(upload: UploadRecord) {
  return {
    uploadId: upload.uploadId,
    filename: upload.filename,
    status: upload.status,
    createdAt: upload.createdAt,
    updatedAt: upload.updatedAt,
    processedAt: upload.processedAt,
    failedAt: upload.failedAt,
    failure: upload.failure,
    range: {
      startUtc: upload.rangeStartUtc,
      endUtc: upload.rangeEndUtc,
      startDate: upload.rangeStartDate,
      endDate: upload.rangeEndDate,
    },
    services: upload.services,
    counts: {
      sourceRows: upload.sourceRowCount,
      storedObservations: upload.storedObservationCount,
      exactDuplicateRowsRemoved: upload.exactDuplicateRowsRemoved,
      unassignedObservations: upload.unassignedObservationCount,
    },
    quality: upload.issueCounts,
    overall: upload.overall,
  };
}

function contentTypeAllowed(request: HttpRequestLike): boolean {
  const contentType = getHeader(request, "content-type")?.toLowerCase() ?? "";
  return [
    "text/csv",
    "application/csv",
    "application/vnd.ms-excel",
    "text/plain",
  ].some((allowed) => contentType.startsWith(allowed));
}

function concatBytes(chunks: readonly Uint8Array[], total: number): Uint8Array {
  const result = new Uint8Array(total);
  let offset = 0;
  for (const chunk of chunks) {
    result.set(chunk, offset);
    offset += chunk.byteLength;
  }
  return result;
}

async function readRequestBytes(
  request: HttpRequestLike,
  maxUploadBytes: number,
): Promise<Uint8Array> {
  const immediate =
    request.rawBody instanceof Uint8Array
      ? request.rawBody
      : request.body instanceof Uint8Array
        ? request.body
        : typeof request.body === "string"
          ? new TextEncoder().encode(request.body)
          : null;

  if (immediate !== null) {
    if (immediate.byteLength > maxUploadBytes) {
      throw applicationError(
        "FILE_TOO_LARGE",
        `Upload exceeds the ${maxUploadBytes}-byte limit.`,
        413,
      );
    }
    return immediate;
  }

  const iterator = request[Symbol.asyncIterator]?.();
  if (iterator === undefined) {
    return new Uint8Array();
  }

  const chunks: Uint8Array[] = [];
  let total = 0;
  for (;;) {
    const next = await iterator.next();
    if (next.done) {
      break;
    }
    const bytes =
      typeof next.value === "string"
        ? new TextEncoder().encode(next.value)
        : next.value;
    total += bytes.byteLength;
    if (total > maxUploadBytes) {
      throw applicationError(
        "FILE_TOO_LARGE",
        `Upload exceeds the ${maxUploadBytes}-byte limit.`,
        413,
      );
    }
    chunks.push(bytes);
  }
  return concatBytes(chunks, total);
}

function applyCors(
  request: HttpRequestLike,
  response: HttpResponseLike,
  config: AppConfig,
): void {
  const origin = getHeader(request, "origin");
  if (origin !== undefined) {
    if (!config.allowedOrigins.includes(origin)) {
      throw applicationError(
        "ORIGIN_NOT_ALLOWED",
        "Request origin is not allowed.",
        403,
      );
    }
    response.setHeader("Access-Control-Allow-Origin", origin);
    response.setHeader("Vary", "Origin");
  }

  response.setHeader("Access-Control-Allow-Methods", "GET,POST,OPTIONS");
  response.setHeader(
    "Access-Control-Allow-Headers",
    "Content-Type,X-File-Name,X-Request-Id",
  );
  response.setHeader("Access-Control-Expose-Headers", "X-Request-Id");
}

function routeMatch(pathname: string):
  | { type: "health" }
  | { type: "uploads" }
  | { type: "upload"; uploadId: string }
  | { type: "summary"; uploadId: string }
  | { type: "logs"; uploadId: string }
  | { type: "not-found" } {
  if (pathname === "/v1/health") {
    return { type: "health" };
  }
  if (pathname === "/v1/uploads") {
    return { type: "uploads" };
  }

  const match = pathname.match(/^\/v1\/uploads\/([^/]+)(?:\/(summary|logs))?$/);
  if (match === null) {
    return { type: "not-found" };
  }

  const uploadId = decodeURIComponent(match[1] ?? "");
  if (match[2] === "summary") {
    return { type: "summary", uploadId };
  }
  if (match[2] === "logs") {
    return { type: "logs", uploadId };
  }
  return { type: "upload", uploadId };
}

export function createApiHandler(dependencies: ApiDependencies) {
  return async (request: HttpRequestLike, response: HttpResponseLike): Promise<void> => {
    const requestId = getHeader(request, "x-request-id")?.trim() || crypto.randomUUID();
    response.setHeader("X-Request-Id", requestId);

    try {
      applyCors(request, response, dependencies.config);
      const method = (request.method ?? "GET").toUpperCase();
      if (method === "OPTIONS") {
        sendNoContent(response);
        return;
      }

      const url = requestUrl(request);
      const route = routeMatch(url.pathname);

      if (route.type === "health" && method === "GET") {
        sendJson(response, 200, { status: "ok", version: "0.2.0" });
        return;
      }

      if (route.type === "uploads" && method === "POST") {
        if (!contentTypeAllowed(request)) {
          throw applicationError(
            "UNSUPPORTED_MEDIA_TYPE",
            "Upload Content-Type must be CSV text.",
            415,
          );
        }

        const startedAt = Date.now();
        const bytes = await readRequestBytes(request, dependencies.config.maxUploadBytes);
        dependencies.logger.info("upload_started", {
          requestId,
          bytes: bytes.byteLength,
        });

        const result = await processCsvUpload({
          bytes,
          filenameHeader: getHeader(request, "x-file-name"),
          repository: dependencies.repository,
          maxCsvRows: dependencies.config.maxCsvRows,
        });

        dependencies.logger.info("upload_complete", {
          requestId,
          uploadId: result.upload.uploadId,
          alreadyProcessed: result.alreadyProcessed,
          sourceRows: result.upload.sourceRowCount,
          storedObservations: result.upload.storedObservationCount,
          durationMs: Date.now() - startedAt,
        });

        sendJson(response, result.alreadyProcessed ? 200 : 201, {
          alreadyProcessed: result.alreadyProcessed,
          upload: publicUpload(result.upload),
        });
        return;
      }

      if (route.type === "upload" && method === "GET") {
        validateUploadId(route.uploadId);
        const upload = await dependencies.repository.getUpload(route.uploadId);
        if (upload === null) {
          throw applicationError("UPLOAD_NOT_FOUND", "Upload was not found.", 404);
        }
        sendJson(response, 200, { upload: publicUpload(upload) });
        return;
      }

      if (route.type === "summary" && method === "GET") {
        validateUploadId(route.uploadId);
        const from = optionalQuery(url, "from");
        const to = optionalQuery(url, "to");
        const summary = await getUploadSummary({
          repository: dependencies.repository,
          uploadId: route.uploadId,
          ...(from === undefined ? {} : { from }),
          ...(to === undefined ? {} : { to }),
          slaTargetPercent: dependencies.config.slaTargetPercent,
        });
        sendJson(response, 200, summary);
        return;
      }

      if (route.type === "logs" && method === "GET") {
        validateUploadId(route.uploadId);
        const from = optionalQuery(url, "from");
        const to = optionalQuery(url, "to");
        const serviceId = optionalQuery(url, "serviceId");
        const cursor = optionalQuery(url, "cursor");
        const pageSize = resolvePageSize(optionalQuery(url, "pageSize"), dependencies.config);

        const logs = await getUploadLogs({
          repository: dependencies.repository,
          uploadId: route.uploadId,
          ...(from === undefined ? {} : { from }),
          ...(to === undefined ? {} : { to }),
          ...(serviceId === undefined ? {} : { serviceId }),
          ...(cursor === undefined ? {} : { cursor }),
          pageSize,
        });
        sendJson(response, 200, logs);
        return;
      }

      throw applicationError("ROUTE_NOT_FOUND", "API route was not found.", 404);
    } catch (error) {
      if (error instanceof ApplicationError) {
        dependencies.logger.error("request_failed", {
          requestId,
          code: error.code,
          statusCode: error.statusCode,
        });
        sendJson(response, error.statusCode, {
          error: {
            code: error.code,
            message: error.message,
            ...(error.details === null ? {} : { details: error.details }),
            requestId,
          },
        });
        return;
      }

      dependencies.logger.error("request_failed", {
        requestId,
        code: "INTERNAL_ERROR",
        message: error instanceof Error ? error.message : "Unknown error",
      });
      sendJson(response, 500, {
        error: {
          code: "INTERNAL_ERROR",
          message: "An unexpected server error occurred.",
          requestId,
        },
      });
    }
  };
}
