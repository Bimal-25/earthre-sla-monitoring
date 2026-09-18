import type { SummaryQuery } from "../api/client";

export type DateFilter =
  | { mode: "single"; date: string }
  | { mode: "range"; from: string; to: string };

export function fullRangeFilter(startDate: string, endDate: string): DateFilter {
  return { mode: "range", from: startDate, to: endDate };
}

export function dateFilterToQuery(filter: DateFilter): SummaryQuery {
  return filter.mode === "single"
    ? { from: filter.date }
    : { from: filter.from, to: filter.to };
}

export function validateDateFilter(
  filter: DateFilter,
  minDate: string,
  maxDate: string,
): string | null {
  if (filter.mode === "single") {
    if (filter.date === "") return "Choose a date.";
    if (filter.date < minDate || filter.date > maxDate) {
      return `Date must be between ${minDate} and ${maxDate}.`;
    }
    return null;
  }

  if (filter.from === "" || filter.to === "") {
    return "Choose both start and end dates.";
  }
  if (filter.from > filter.to) {
    return "Start date must be on or before end date.";
  }
  if (filter.from < minDate || filter.to > maxDate) {
    return `Date range must stay between ${minDate} and ${maxDate}.`;
  }
  return null;
}
