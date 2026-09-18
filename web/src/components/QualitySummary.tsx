import type { IssueCounts, QualityIssueCode } from "../api/types";
import { formatInteger } from "../utils/formatters";

const ISSUE_LABELS: Record<QualityIssueCode, string> = {
  UNIX_TIMESTAMP_NORMALIZED: "Unix timestamps normalized",
  UNIX_MILLISECONDS_TIMESTAMP_NORMALIZED: "Unix millisecond timestamps normalized",
  INVALID_TIMESTAMP: "Invalid timestamps",
  OFF_CADENCE_TIMESTAMP: "Off-cadence timestamps",
  MISSING_LATENCY: "Missing latency values",
  NEGATIVE_LATENCY: "Negative latency values",
  INVALID_LATENCY: "Invalid latency values",
  UNKNOWN_LATENCY_UNIT: "Unknown latency units",
  INVALID_HTTP_STATUS: "Invalid HTTP statuses",
  MISSING_REQUIRED_FIELD: "Missing required fields",
  EXACT_DUPLICATE: "Exact duplicate rows",
};

function issueTone(code: QualityIssueCode): string {
  if (["INVALID_TIMESTAMP", "NEGATIVE_LATENCY", "INVALID_LATENCY", "INVALID_HTTP_STATUS", "MISSING_REQUIRED_FIELD"].includes(code)) {
    return "danger";
  }
  if (["MISSING_LATENCY", "UNKNOWN_LATENCY_UNIT", "OFF_CADENCE_TIMESTAMP"].includes(code)) {
    return "warning";
  }
  return "info";
}

export function QualitySummary({ counts }: { counts: IssueCounts }) {
  const entries = (Object.entries(counts) as [QualityIssueCode, number | undefined][])
    .filter((entry): entry is [QualityIssueCode, number] => (entry[1] ?? 0) > 0)
    .sort((a, b) => b[1] - a[1]);

  if (entries.length === 0) {
    return <p className="empty-copy">No data-quality findings in this selection.</p>;
  }

  return (
    <div className="quality-grid">
      {entries.map(([code, count]) => (
        <div className={`quality-item quality-item--${issueTone(code)}`} key={code}>
          <span className="quality-item__count">{formatInteger(count)}</span>
          <span className="quality-item__label">{ISSUE_LABELS[code]}</span>
        </div>
      ))}
    </div>
  );
}
