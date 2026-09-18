import { useState } from "react";
import type { UploadSummaryResponse } from "../api/types";
import { formatDurationMinutes, formatLatency, formatPercent } from "../utils/formatters";
import { Alert } from "./Alert";
import { Icon } from "./Icon";
import { MetricCard } from "./MetricCard";
import { QualitySummary } from "./QualitySummary";
import { ServiceStats } from "./ServiceStats";

function availabilityTone(summary: UploadSummaryResponse): "healthy" | "critical" | "neutral" {
  const value = summary.overall.availabilityPercent;
  if (value === null) return "neutral";
  return value >= summary.slaTargetPercent ? "healthy" : "critical";
}

export function StatsPanel({ summary }: { summary: UploadSummaryResponse }) {
  const [expanded, setExpanded] = useState(true);
  const coverage = summary.overall.coveragePercent;

  return (
    <section className="section-card stats-section" aria-labelledby="stats-title">
      <div className="section-card__header">
        <div>
          <span className="eyebrow">Selected period</span>
          <h2 id="stats-title" className="section-title">Monitoring summary</h2>
        </div>
        <button
          type="button"
          className="icon-button section-toggle"
          aria-expanded={expanded}
          aria-controls="stats-content"
          onClick={() => setExpanded((value) => !value)}
        >
          <span>{expanded ? "Collapse" : "Expand"}</span>
          <Icon name="chevron" className={expanded ? "icon-rotate" : ""} />
        </button>
      </div>

      {expanded ? (
        <div id="stats-content" className="section-card__body stats-content">
          <div className="metric-grid">
            <MetricCard
              label="Observed availability"
              value={formatPercent(summary.overall.availabilityPercent, 3)}
              meta={`Reference target ${summary.slaTargetPercent}%`}
              tone={availabilityTone(summary)}
              icon="pulse"
            />
            <MetricCard
              label="Monitoring coverage"
              value={formatPercent(coverage, 3)}
              meta={`${summary.overall.resolvedIntervals.toLocaleString()} of ${summary.overall.expectedIntervals.toLocaleString()} intervals resolved`}
              tone={coverage === 100 ? "healthy" : "warning"}
              icon="coverage"
            />
            <MetricCard
              label="Detected downtime"
              value={formatDurationMinutes(summary.overall.detectedDowntimeMinutes)}
              meta={`${summary.overall.downIntervals.toLocaleString()} down intervals`}
              tone={summary.overall.detectedDowntimeMinutes === 0 ? "healthy" : "critical"}
              icon="clock"
            />
            <MetricCard
              label="p95 latency"
              value={formatLatency(summary.overall.p95LatencyMs)}
              meta="Nearest-rank p95 of normalized interval latency"
              tone="info"
              icon="speed"
            />
          </div>

          {!summary.period.completeCalendarMonth ? (
            <Alert tone="info" title="Partial-period observation">
              This selection does not cover a complete calendar month. The observed availability should not be interpreted as a contractual monthly SLA determination.
            </Alert>
          ) : summary.services.some((service) => !service.sla.evaluable) ? (
            <Alert tone="warning" title="Monthly SLA cannot be fully evaluated">
              At least one service has incomplete or conflicted monitoring coverage for the selected month.
            </Alert>
          ) : null}

          <div className="stats-subsection">
            <div className="subsection-heading">
              <div>
                <span className="eyebrow">Per service</span>
                <h3>Service statistics</h3>
              </div>
            </div>
            <ServiceStats services={summary.services} />
          </div>

          <div className="stats-subsection">
            <div className="subsection-heading">
              <div>
                <span className="eyebrow">Trust signals</span>
                <h3>Data-quality findings</h3>
              </div>
              <span className="subsection-note">Findings for the selected date period</span>
            </div>
            <QualitySummary counts={summary.overall.issueCounts} />
          </div>
        </div>
      ) : null}
    </section>
  );
}
