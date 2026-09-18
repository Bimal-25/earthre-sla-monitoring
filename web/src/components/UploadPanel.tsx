import { useRef, useState, type ChangeEvent, type DragEvent, type KeyboardEvent } from "react";
import { ApiError, uploadCsv } from "../api/client";
import type { UploadResponse } from "../api/types";
import { formatFileSize } from "../utils/formatters";
import { Alert } from "./Alert";
import { Icon } from "./Icon";

const MAX_FILE_BYTES = 5 * 1024 * 1024;

interface UploadPanelProps {
  onUploaded: (response: UploadResponse) => void;
}

function validateFile(file: File): string | null {
  if (!file.name.toLowerCase().endsWith(".csv")) {
    return "Choose a file with a .csv extension.";
  }
  if (file.size === 0) {
    return "The selected CSV is empty.";
  }
  if (file.size > MAX_FILE_BYTES) {
    return "The selected CSV is larger than the 5 MB upload limit.";
  }
  return null;
}

export function UploadPanel({ onUploaded }: UploadPanelProps) {
  const inputRef = useRef<HTMLInputElement | null>(null);
  const [file, setFile] = useState<File | null>(null);
  const [isDragging, setIsDragging] = useState(false);
  const [isUploading, setIsUploading] = useState(false);
  const [error, setError] = useState<ApiError | Error | null>(null);

  function selectFile(nextFile: File | null) {
    setError(null);
    if (nextFile === null) {
      setFile(null);
      return;
    }
    const validation = validateFile(nextFile);
    if (validation !== null) {
      setFile(null);
      setError(new Error(validation));
      if (inputRef.current) inputRef.current.value = "";
      return;
    }
    setFile(nextFile);
  }

  async function submit() {
    if (file === null || isUploading) return;
    setIsUploading(true);
    setError(null);
    try {
      onUploaded(await uploadCsv(file));
    } catch (uploadError) {
      setError(uploadError instanceof Error ? uploadError : new Error("Upload failed."));
    } finally {
      setIsUploading(false);
    }
  }

  return (
    <main className="upload-page page-container">
      <section className="upload-card" aria-labelledby="upload-title">
        <div className="upload-card__intro">
          <span className="eyebrow">EarthRe · SLA monitoring</span>
          <h1 id="upload-title" className="page-title">Inspect monitoring data you can trust</h1>
          <p className="page-description">
            Upload a monitoring CSV. A stateless serverless API validates, normalizes,
            deduplicates, persists, and calculates canonical 15-minute SLA intervals.
          </p>
        </div>

        {error ? (
          <Alert
            tone="error"
            title={error.message}
            requestId={error instanceof ApiError ? error.requestId : null}
          >
            Check the file and API connection, then try again.
          </Alert>
        ) : null}

        <div
          className="upload-dropzone"
          data-drag-active={isDragging}
          role="button"
          tabIndex={0}
          aria-describedby="upload-help"
          onClick={() => inputRef.current?.click()}
          onKeyDown={(event: KeyboardEvent<HTMLDivElement>) => {
            if (event.key === "Enter" || event.key === " ") {
              event.preventDefault();
              inputRef.current?.click();
            }
          }}
          onDragEnter={(event: DragEvent<HTMLDivElement>) => {
            event.preventDefault();
            setIsDragging(true);
          }}
          onDragOver={(event: DragEvent<HTMLDivElement>) => {
            event.preventDefault();
            setIsDragging(true);
          }}
          onDragLeave={(event: DragEvent<HTMLDivElement>) => {
            event.preventDefault();
            if (event.currentTarget === event.target) setIsDragging(false);
          }}
          onDrop={(event: DragEvent<HTMLDivElement>) => {
            event.preventDefault();
            setIsDragging(false);
            selectFile(event.dataTransfer.files.item(0));
          }}
        >
          <input
            ref={inputRef}
            className="sr-only"
            type="file"
            accept=".csv,text/csv,application/csv"
            onChange={(event: ChangeEvent<HTMLInputElement>) => selectFile(event.target.files?.item(0) ?? null)}
          />
          <span className="upload-dropzone__icon"><Icon name="upload" /></span>
          <strong>Drop your monitoring CSV here</strong>
          <span>or choose a file from your device</span>
          <span id="upload-help" className="upload-dropzone__help">CSV only · maximum 5 MB</span>
        </div>

        {file ? (
          <div className="selected-file" aria-live="polite">
            <Icon name="file" className="selected-file__icon" />
            <div className="selected-file__details">
              <strong className="text-truncate" title={file.name}>{file.name}</strong>
              <span>{formatFileSize(file.size)}</span>
            </div>
            <button
              type="button"
              className="button button--ghost button--compact"
              disabled={isUploading}
              onClick={() => selectFile(null)}
            >
              Remove
            </button>
          </div>
        ) : null}

        <div className="upload-actions">
          <button
            type="button"
            className="button button--primary button--responsive-full"
            disabled={file === null || isUploading}
            onClick={() => void submit()}
          >
            {isUploading ? <span className="spinner spinner--button" aria-hidden="true" /> : <Icon name="upload" />}
            {isUploading ? "Processing in cloud…" : "Process CSV"}
          </button>
        </div>

        <div className="schema-note">
          <strong>Expected columns</strong>
          <code>service_id</code>, <code>service_name</code>, <code>timestamp</code>,
          <code>status_code</code>, <code>latency</code>, <code>latency_unit</code>,
          <code>agent</code>, <code>region</code>
        </div>
      </section>
    </main>
  );
}
