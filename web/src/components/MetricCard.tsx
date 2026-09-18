import type { IconName } from "./Icon";
import { Icon } from "./Icon";

interface MetricCardProps {
  label: string;
  value: string;
  meta: string;
  tone?: "neutral" | "healthy" | "warning" | "critical" | "info";
  icon: IconName;
}

export function MetricCard({ label, value, meta, tone = "neutral", icon }: MetricCardProps) {
  return (
    <article className={`metric-card metric-card--${tone}`}>
      <div className="metric-card__heading">
        <span className="metric-card__label">{label}</span>
        <span className="metric-card__icon" aria-hidden="true"><Icon name={icon} /></span>
      </div>
      <div className="metric-card__value">{value}</div>
      <div className="metric-card__meta">{meta}</div>
    </article>
  );
}
