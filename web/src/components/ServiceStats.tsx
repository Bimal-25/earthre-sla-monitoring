import type { ServiceSummary } from "../api/types";
import { formatDurationMinutes, formatLatency, formatPercent } from "../utils/formatters";

function slaLabel(service: ServiceSummary): { text: string; tone: string } {
  if (!service.sla.evaluable) return { text: "Not evaluable", tone: "neutral" };
  return service.sla.observedTargetMet
    ? { text: "Target met", tone: "healthy" }
    : { text: "Below target", tone: "critical" };
}

export function ServiceStats({ services }: { services: ServiceSummary[] }) {
  return (
    <div className="service-stats" role="table" tabIndex={0} aria-label="Service statistics. Scroll horizontally on medium screens.">
      <div className="service-row service-row--header" role="row">
        <span role="columnheader">Service</span>
        <span role="columnheader">Availability</span>
        <span role="columnheader">Coverage</span>
        <span role="columnheader">Downtime</span>
        <span role="columnheader">p95 latency</span>
        <span role="columnheader">SLA state</span>
      </div>
      {services.map((service) => {
        const sla = slaLabel(service);
        return (
          <div className="service-row" role="row" key={service.serviceId}>
            <div className="service-row__name" role="cell">
              <strong>{service.serviceName}</strong>
              <span>{service.serviceId}</span>
            </div>
            <div className="service-row__metric" role="cell" data-label="Availability">
              <span>{formatPercent(service.availabilityPercent)}</span>
            </div>
            <div className="service-row__metric" role="cell" data-label="Coverage">
              <span>{formatPercent(service.coveragePercent)}</span>
            </div>
            <div className="service-row__metric" role="cell" data-label="Downtime">
              <span>{formatDurationMinutes(service.detectedDowntimeMinutes)}</span>
            </div>
            <div className="service-row__metric" role="cell" data-label="p95 latency">
              <span>{formatLatency(service.p95LatencyMs)}</span>
            </div>
            <div className="service-row__metric" role="cell" data-label="SLA state">
              <span className={`badge badge--${sla.tone}`}>{sla.text}</span>
            </div>
          </div>
        );
      })}
    </div>
  );
}
