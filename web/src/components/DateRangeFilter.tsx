import { useEffect, useState, type ChangeEvent, type FormEvent } from "react";
import type { ServiceDescriptor } from "../api/types";
import type { DateFilter } from "../utils/dateFilter";
import { fullRangeFilter, validateDateFilter } from "../utils/dateFilter";
import { Icon } from "./Icon";

interface DateRangeFilterProps {
  minDate: string;
  maxDate: string;
  value: DateFilter;
  serviceId: string;
  services: ServiceDescriptor[];
  pageSize: number;
  onApply: (value: DateFilter, serviceId: string, pageSize: number) => void;
}

export function DateRangeFilter({
  minDate,
  maxDate,
  value,
  serviceId,
  services,
  pageSize,
  onApply,
}: DateRangeFilterProps) {
  const [draft, setDraft] = useState<DateFilter>(value);
  const [draftService, setDraftService] = useState(serviceId);
  const [draftPageSize, setDraftPageSize] = useState(pageSize);
  const [validation, setValidation] = useState<string | null>(null);

  useEffect(() => {
    setDraft(value);
    setDraftService(serviceId);
    setDraftPageSize(pageSize);
  }, [value, serviceId, pageSize]);

  function apply(nextDraft = draft, nextService = draftService, nextPageSize = draftPageSize) {
    const error = validateDateFilter(nextDraft, minDate, maxDate);
    setValidation(error);
    if (error === null) onApply(nextDraft, nextService, nextPageSize);
  }

  function setMode(mode: DateFilter["mode"]) {
    if (mode === draft.mode) return;
    setValidation(null);
    setDraft(
      mode === "single"
        ? { mode: "single", date: draft.mode === "range" ? draft.from : minDate }
        : fullRangeFilter(
            draft.mode === "single" ? draft.date : minDate,
            draft.mode === "single" ? draft.date : maxDate,
          ),
    );
  }

  return (
    <section className="filter-section" aria-labelledby="filter-title">
      <div className="filter-section__heading">
        <div>
          <span className="eyebrow">Explore persisted observations</span>
          <h2 id="filter-title" className="section-title">Logs</h2>
        </div>
      </div>

      <form
        className="filter-panel"
        onSubmit={(event: FormEvent<HTMLFormElement>) => {
          event.preventDefault();
          apply();
        }}
      >
        <fieldset className="filter-mode">
          <legend className="form-label">Date filter</legend>
          <div className="segmented-control">
            <button type="button" aria-pressed={draft.mode === "single"} onClick={() => setMode("single")}>Single date</button>
            <button type="button" aria-pressed={draft.mode === "range"} onClick={() => setMode("range")}>Date range</button>
          </div>
        </fieldset>

        <div className="filter-grid">
          {draft.mode === "single" ? (
            <label className="form-field">
              <span className="form-label">Date</span>
              <input
                className="form-control"
                type="date"
                min={minDate}
                max={maxDate}
                value={draft.date}
                onChange={(event: ChangeEvent<HTMLInputElement>) => setDraft({ mode: "single", date: event.target.value })}
              />
            </label>
          ) : (
            <>
              <label className="form-field">
                <span className="form-label">From</span>
                <input
                  className="form-control"
                  type="date"
                  min={minDate}
                  max={maxDate}
                  value={draft.from}
                  onChange={(event: ChangeEvent<HTMLInputElement>) => setDraft({ ...draft, from: event.target.value })}
                />
              </label>
              <label className="form-field">
                <span className="form-label">To</span>
                <input
                  className="form-control"
                  type="date"
                  min={minDate}
                  max={maxDate}
                  value={draft.to}
                  onChange={(event: ChangeEvent<HTMLInputElement>) => setDraft({ ...draft, to: event.target.value })}
                />
              </label>
            </>
          )}

          <label className="form-field">
            <span className="form-label">Service</span>
            <select className="form-control" value={draftService} onChange={(event: ChangeEvent<HTMLSelectElement>) => setDraftService(event.target.value)}>
              <option value="">All services</option>
              {services.map((service) => (
                <option value={service.serviceId} key={service.serviceId}>{service.serviceName}</option>
              ))}
            </select>
          </label>

          <label className="form-field form-field--compact">
            <span className="form-label">Rows per page</span>
            <select className="form-control" value={draftPageSize} onChange={(event: ChangeEvent<HTMLSelectElement>) => setDraftPageSize(Number(event.target.value))}>
              <option value={25}>25</option>
              <option value={50}>50</option>
              <option value={100}>100</option>
            </select>
          </label>

          <div className="filter-actions">
            <button type="submit" className="button button--primary"><Icon name="filter" /> Apply filters</button>
            <button
              type="button"
              className="button button--secondary"
              onClick={() => {
                const full = fullRangeFilter(minDate, maxDate);
                setDraft(full);
                setDraftService("");
                setValidation(null);
                onApply(full, "", draftPageSize);
              }}
            >
              Entire upload
            </button>
            <button
              type="button"
              className="button button--ghost"
              onClick={() => {
                const latest: DateFilter = { mode: "single", date: maxDate };
                setDraft(latest);
                setValidation(null);
                onApply(latest, draftService, draftPageSize);
              }}
            >
              Latest day
            </button>
          </div>
        </div>
        {validation ? <p className="form-error" role="alert">{validation}</p> : null}
      </form>
    </section>
  );
}
