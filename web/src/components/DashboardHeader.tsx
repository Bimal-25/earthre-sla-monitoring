import type { PublicUpload } from "../api/types";
import { formatDate, formatInteger } from "../utils/formatters";
import { Icon } from "./Icon";

export function DashboardHeader({ upload, onReset }: { upload: PublicUpload; onReset: () => void }) {
  return (
    <header className="app-header">
      <div className="app-header__inner page-container">
        <div className="app-header__identity">
          <div className="brand-mark" aria-hidden="true"><Icon name="pulse" /></div>
          <div className="app-header__copy">
            <span className="eyebrow">EarthRe · SLA monitoring</span>
            <h1 className="app-header__title">SLA Monitoring Dashboard</h1>
            <div className="dataset-meta" aria-label="Current dataset">
              <span className="dataset-meta__filename text-truncate" title={upload.filename}>{upload.filename}</span>
              <span aria-hidden="true">•</span>
              <span>{formatDate(upload.range.startDate)} – {formatDate(upload.range.endDate)}</span>
              <span aria-hidden="true">•</span>
              <span>{upload.services.length} services</span>
              <span aria-hidden="true">•</span>
              <span>{formatInteger(upload.counts.sourceRows)} source rows</span>
            </div>
          </div>
        </div>
        <button type="button" className="button button--secondary button--responsive-full" onClick={onReset}>
          <Icon name="upload" /> Upload another CSV
        </button>
      </div>
    </header>
  );
}
