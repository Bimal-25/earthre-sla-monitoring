const STORAGE_KEY = "earthre:last-upload-id";
const UPLOAD_ID_PATTERN = /^[a-f0-9]{64}$/;

export function isValidUploadId(value: string | null | undefined): value is string {
  return value !== null && value !== undefined && UPLOAD_ID_PATTERN.test(value);
}

export function readInitialUploadId(): string | null {
  const queryValue = new URLSearchParams(window.location.search).get("upload");
  if (isValidUploadId(queryValue)) return queryValue;

  const stored = window.localStorage.getItem(STORAGE_KEY);
  return isValidUploadId(stored) ? stored : null;
}

export function persistUploadId(uploadId: string): void {
  if (!isValidUploadId(uploadId)) return;
  window.localStorage.setItem(STORAGE_KEY, uploadId);
  const url = new URL(window.location.href);
  url.searchParams.set("upload", uploadId);
  window.history.replaceState({}, "", url);
}

export function clearUploadId(): void {
  window.localStorage.removeItem(STORAGE_KEY);
  const url = new URL(window.location.href);
  url.searchParams.delete("upload");
  window.history.replaceState({}, "", url);
}
