import { useEffect, useState } from "react";
import { ApiError, getUpload } from "./api/client";
import type { PublicUpload, UploadResponse } from "./api/types";
import { Alert } from "./components/Alert";
import { Dashboard } from "./components/Dashboard";
import { LoadingState } from "./components/LoadingState";
import { UploadPanel } from "./components/UploadPanel";
import { clearUploadId, persistUploadId, readInitialUploadId } from "./utils/storage";

export default function App() {
  const [upload, setUpload] = useState<PublicUpload | null>(null);
  const [initialUploadId, setInitialUploadId] = useState(() => readInitialUploadId());
  const [loading, setLoading] = useState(initialUploadId !== null);
  const [restoreError, setRestoreError] = useState<ApiError | Error | null>(null);

  useEffect(() => {
    if (initialUploadId === null) return;
    const controller = new AbortController();
    setLoading(true);
    setRestoreError(null);
    void getUpload(initialUploadId, controller.signal)
      .then(setUpload)
      .catch((error: unknown) => {
        if (error instanceof DOMException && error.name === "AbortError") return;
        setRestoreError(error instanceof Error ? error : new Error("Unable to restore upload."));
      })
      .finally(() => {
        if (!controller.signal.aborted) setLoading(false);
      });
    return () => controller.abort();
  }, [initialUploadId]);

  function handleUploaded(response: UploadResponse) {
    persistUploadId(response.upload.uploadId);
    setUpload(response.upload);
    setInitialUploadId(response.upload.uploadId);
    setRestoreError(null);
  }

  function reset() {
    clearUploadId();
    setUpload(null);
    setInitialUploadId(null);
    setRestoreError(null);
    setLoading(false);
  }

  if (loading && upload === null) {
    return (
      <main className="bootstrap-state page-container">
        <LoadingState label="Restoring persisted upload" />
      </main>
    );
  }

  if (upload !== null) {
    return <Dashboard upload={upload} onReset={reset} />;
  }

  return (
    <>
      {restoreError ? (
        <div className="restore-error page-container">
          <Alert
            tone="warning"
            title="The previous upload could not be restored."
            requestId={restoreError instanceof ApiError ? restoreError.requestId : null}
          >
            {restoreError.message} You can upload the CSV again; identical content will be reused by the backend.
          </Alert>
        </div>
      ) : null}
      <UploadPanel onUploaded={handleUploaded} />
    </>
  );
}
