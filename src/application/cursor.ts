import { applicationError } from "./errors";

interface CursorPayload {
  v: 1;
  sortKey: string;
  from: string;
  to: string;
  serviceId: string | null;
}

function utf8ToBase64Url(value: string): string {
  const bytes = new TextEncoder().encode(value);
  let binary = "";
  for (const byte of bytes) {
    binary += String.fromCharCode(byte);
  }
  return btoa(binary)
    .replace(/\+/g, "-")
    .replace(/\//g, "_")
    .replace(/=+$/g, "");
}

function base64UrlToUtf8(value: string): string {
  const base64 = value.replace(/-/g, "+").replace(/_/g, "/");
  const padded = base64.padEnd(Math.ceil(base64.length / 4) * 4, "=");
  const binary = atob(padded);
  const bytes = Uint8Array.from(binary, (character) => character.charCodeAt(0));
  return new TextDecoder("utf-8", { fatal: true }).decode(bytes);
}

export function encodeLogsCursor(payload: Omit<CursorPayload, "v">): string {
  return utf8ToBase64Url(JSON.stringify({ v: 1, ...payload } satisfies CursorPayload));
}

export function decodeLogsCursor(
  cursor: string,
  expected: { from: string; to: string; serviceId: string | null },
): string {
  try {
    const parsed = JSON.parse(base64UrlToUtf8(cursor)) as Partial<CursorPayload>;

    if (
      parsed.v !== 1 ||
      typeof parsed.sortKey !== "string" ||
      parsed.from !== expected.from ||
      parsed.to !== expected.to ||
      parsed.serviceId !== expected.serviceId
    ) {
      throw new Error("Cursor does not match this query.");
    }

    return parsed.sortKey;
  } catch {
    throw applicationError(
      "INVALID_CURSOR",
      "Pagination cursor is invalid or belongs to a different log query.",
      400,
    );
  }
}
