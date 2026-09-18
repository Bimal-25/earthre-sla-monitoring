import { createHash } from "node:crypto";

import type { NormalizedObservation } from "../types";

const RAW_FIELDS = [
  "service_id",
  "service_name",
  "timestamp",
  "status_code",
  "latency",
  "latency_unit",
  "agent",
  "region",
] as const;

/**
 * Returns a deterministic SHA-256 digest as lowercase hexadecimal.
 *
 * Used for:
 * - upload/file idempotency keys
 * - deterministic observation document IDs
 *
 * Node's native crypto implementation is deliberately used instead of
 * Web Crypto because this project executes in a Node.js 22 server runtime.
 */
export async function sha256Hex(input: Uint8Array | string): Promise<string> {
  const hash = createHash("sha256");

  if (typeof input === "string") {
    hash.update(input, "utf8");
  } else {
    hash.update(input);
  }

  return hash.digest("hex");
}

/**
 * Creates a deterministic ID from the original source observation.
 *
 * Raw values are used intentionally so that genuinely different source
 * observations do not collapse merely because normalization produces the
 * same canonical representation.
 */
export async function createObservationId(
  observation: NormalizedObservation,
): Promise<string> {
  const identity = JSON.stringify(
    RAW_FIELDS.map((field) => observation.raw[field].trim()),
  );

  return sha256Hex(identity);
}

/**
 * Creates a deterministic ordering key for log pagination.
 *
 * Invalid/unparseable timestamps are sorted after valid timestamps while
 * remaining addressable and auditable.
 */
export function createObservationSortKey(
  timestampUtc: string | null,
  observationId: string,
): string {
  return timestampUtc === null
    ? `~invalid|${observationId}`
    : `${timestampUtc}|${observationId}`;
}

/**
 * Creates a stable Firestore document ID for one service/day aggregate.
 */
export function createDailyStatId(date: string, serviceId: string): string {
  return `${date}--${encodeURIComponent(serviceId)}`;
}
