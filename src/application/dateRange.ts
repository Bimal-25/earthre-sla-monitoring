import type { UploadRecord } from "../persistence/models";
import { applicationError } from "./errors";

const DATE_PATTERN = /^\d{4}-\d{2}-\d{2}$/;

function parseDateOnly(value: string): Date {
  if (!DATE_PATTERN.test(value)) {
    throw applicationError(
      "INVALID_DATE",
      `Invalid UTC date '${value}'. Expected YYYY-MM-DD.`,
      400,
    );
  }

  const [yearText, monthText, dayText] = value.split("-");
  const year = Number(yearText);
  const month = Number(monthText);
  const day = Number(dayText);
  const date = new Date(Date.UTC(year, month - 1, day));

  if (
    date.getUTCFullYear() !== year ||
    date.getUTCMonth() !== month - 1 ||
    date.getUTCDate() !== day
  ) {
    throw applicationError(
      "INVALID_DATE",
      `Invalid UTC calendar date '${value}'.`,
      400,
    );
  }

  return date;
}

function formatDate(date: Date): string {
  return date.toISOString().slice(0, 10);
}

function addUtcDays(value: string, days: number): string {
  const date = parseDateOnly(value);
  date.setUTCDate(date.getUTCDate() + days);
  return formatDate(date);
}

export interface ResolvedDateRange {
  fromDate: string;
  toDate: string;
  fromUtcInclusive: string;
  toUtcExclusive: string;
}

export function resolveDateRange(
  upload: UploadRecord,
  fromRaw: string | undefined,
  toRaw: string | undefined,
): ResolvedDateRange {
  if (upload.rangeStartDate === null || upload.rangeEndDate === null) {
    throw applicationError(
      "UPLOAD_HAS_NO_QUERYABLE_RANGE",
      "Upload does not have a queryable canonical date range.",
      409,
    );
  }

  if (fromRaw === undefined && toRaw !== undefined) {
    throw applicationError(
      "INVALID_DATE_RANGE",
      "Query parameter 'to' requires 'from'.",
      400,
    );
  }

  const fromDate = fromRaw ?? upload.rangeStartDate;
  const toDate = toRaw ?? (fromRaw === undefined ? upload.rangeEndDate : fromDate);

  parseDateOnly(fromDate);
  parseDateOnly(toDate);

  if (fromDate > toDate) {
    throw applicationError(
      "INVALID_DATE_RANGE",
      "Query parameter 'from' must not be after 'to'.",
      400,
    );
  }

  if (fromDate < upload.rangeStartDate || toDate > upload.rangeEndDate) {
    throw applicationError(
      "DATE_OUT_OF_UPLOAD_RANGE",
      `Requested range must stay within ${upload.rangeStartDate} through ${upload.rangeEndDate}.`,
      400,
      {
        uploadFrom: upload.rangeStartDate,
        uploadTo: upload.rangeEndDate,
      },
    );
  }

  const toExclusiveDate = addUtcDays(toDate, 1);

  return {
    fromDate,
    toDate,
    fromUtcInclusive: `${fromDate}T00:00:00.000Z`,
    toUtcExclusive: `${toExclusiveDate}T00:00:00.000Z`,
  };
}

export function isCompleteCalendarMonth(
  fromDate: string,
  toDate: string,
): boolean {
  const from = parseDateOnly(fromDate);
  const to = parseDateOnly(toDate);

  if (from.getUTCDate() !== 1) {
    return false;
  }
  if (
    from.getUTCFullYear() !== to.getUTCFullYear() ||
    from.getUTCMonth() !== to.getUTCMonth()
  ) {
    return false;
  }

  const lastDay = new Date(
    Date.UTC(from.getUTCFullYear(), from.getUTCMonth() + 1, 0),
  ).getUTCDate();
  return to.getUTCDate() === lastDay;
}

export function uploadCoversDateRangeBoundaries(
  upload: UploadRecord,
  range: ResolvedDateRange,
): boolean {
  if (upload.rangeStartUtc === null || upload.rangeEndUtc === null) {
    return false;
  }

  const expectedLastSlot = new Date(
    Date.parse(range.toUtcExclusive) - 15 * 60 * 1000,
  ).toISOString();

  return (
    upload.rangeStartUtc <= range.fromUtcInclusive &&
    upload.rangeEndUtc >= expectedLastSlot
  );
}
