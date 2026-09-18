import type { LogsResponse } from "../api/types";
import { formatLatency, formatTimestamp } from "../utils/formatters";
import { StatusBadge } from "./StatusBadge";

interface LogsTableProps {
  page: LogsResponse;
  pageNumber: number;
  canGoPrevious: boolean;
  onPrevious: () => void;
  onNext: () => void;
}

function qualityLabel(count: number): string {
  if (count === 0) return "Clean";
  return `${count} finding${count === 1 ? "" : "s"}`;
}

export function LogsTable({ page, pageNumber, canGoPrevious, onPrevious, onNext }: LogsTableProps) {
  if (page.items.length === 0) {
    return (
      <div className="empty-state">
        <strong>No observations match these filters.</strong>
        <span>Try a wider date range or choose another service.</span>
      </div>
    );
  }

  return (
    <>
      <div className="logs-table-wrapper" tabIndex={0} aria-label="Monitoring logs table. Scroll horizontally on small screens.">
        <table className="logs-table">
          <thead>
            <tr>
              <th scope="col">Timestamp</th>
              <th scope="col">Service</th>
              <th scope="col">Status</th>
              <th scope="col">Latency</th>
              <th scope="col">Agent</th>
              <th scope="col">Region</th>
              <th scope="col">Quality</th>
            </tr>
          </thead>
          <tbody>
            {page.items.map((item) => {
              const showRawTimestamp = item.issues.some((issue) =>
                ["UNIX_TIMESTAMP_NORMALIZED", "UNIX_MILLISECONDS_TIMESTAMP_NORMALIZED", "INVALID_TIMESTAMP", "OFF_CADENCE_TIMESTAMP"].includes(issue.code),
              );
              return (
              <tr key={item.observationId}>
                <td className="cell-timestamp">
                  <time dateTime={item.timestampUtc ?? undefined}>{formatTimestamp(item.timestampUtc)}</time>
                  {showRawTimestamp ? <span className="cell-secondary">Raw: {item.timestampRaw}</span> : null}
                </td>
                <td>
                  <strong>{item.serviceName}</strong>
                  <span className="cell-secondary">{item.serviceId}</span>
                </td>
                <td><StatusBadge healthState={item.healthState} statusCode={item.statusCode} /></td>
                <td>{formatLatency(item.latencyMs)}</td>
                <td>{item.agent || "—"}</td>
                <td>{item.region || "—"}</td>
                <td>
                  <span className={item.issues.length === 0 ? "quality-clean" : "quality-has-findings"}>
                    {qualityLabel(item.issues.length)}
                  </span>
                  {item.issues.length > 0 ? (
                    <span className="cell-secondary" title={item.issues.map((issue) => issue.message).join(" · ")}>
                      {item.issues.map((issue) => issue.code).join(", ")}
                    </span>
                  ) : null}
                </td>
              </tr>
              );
            })}
          </tbody>
        </table>
      </div>

      <nav className="pagination" aria-label="Logs pagination">
        <div className="pagination__summary">
          Page {pageNumber} · {page.items.length} record{page.items.length === 1 ? "" : "s"}
        </div>
        <div className="pagination__actions">
          <button type="button" className="button button--secondary" disabled={!canGoPrevious} onClick={onPrevious}>Previous</button>
          <button type="button" className="button button--secondary" disabled={!page.hasMore || page.nextCursor === null} onClick={onNext}>Next</button>
        </div>
      </nav>
    </>
  );
}
