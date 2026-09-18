import type { QualityIssue } from "../types";

const ISO_WITH_TIMEZONE =
  /^(\d{4})-(\d{2})-(\d{2})T(\d{2}):(\d{2}):(\d{2})(?:\.(\d{1,3}))?(Z|[+-]\d{2}:\d{2})$/i;
const UNIX_SECONDS = /^\d{10}$/;
const UNIX_MILLISECONDS = /^\d{13}$/;

export interface NormalizedTimestamp {
  timestampUtc: string | null;
  isOnExpectedCadence: boolean;
  issues: QualityIssue[];
}

function invalidTimestamp(rawValue: string): NormalizedTimestamp {
  return {
    timestampUtc: null,
    isOnExpectedCadence: false,
    issues: [
      {
        code: "INVALID_TIMESTAMP",
        field: "timestamp",
        rawValue,
        message: "Timestamp is not a supported valid timezone-qualified ISO value or Unix epoch value.",
      },
    ],
  };
}

function fromDate(
  date: Date,
  rawValue: string,
  initialIssues: QualityIssue[] = [],
): NormalizedTimestamp {
  if (!Number.isFinite(date.getTime())) {
    return invalidTimestamp(rawValue);
  }

  const onCadence =
    date.getUTCMinutes() % 15 === 0 &&
    date.getUTCSeconds() === 0 &&
    date.getUTCMilliseconds() === 0;

  const issues = [...initialIssues];

  if (!onCadence) {
    issues.push({
      code: "OFF_CADENCE_TIMESTAMP",
      field: "timestamp",
      rawValue,
      message: "Timestamp is valid but does not fall on the expected 15-minute UTC cadence.",
    });
  }

  return {
    timestampUtc: date.toISOString(),
    isOnExpectedCadence: onCadence,
    issues,
  };
}

function daysInMonth(year: number, month: number): number {
  if (month === 2) {
    const leap = year % 4 === 0 && (year % 100 !== 0 || year % 400 === 0);
    return leap ? 29 : 28;
  }
  return [4, 6, 9, 11].includes(month) ? 30 : 31;
}

function parseIsoWithTimezone(value: string): Date | null {
  const match = ISO_WITH_TIMEZONE.exec(value);
  if (match === null) {
    return null;
  }

  const year = Number(match[1]);
  const month = Number(match[2]);
  const day = Number(match[3]);
  const hour = Number(match[4]);
  const minute = Number(match[5]);
  const second = Number(match[6]);
  const milliseconds = Number((match[7] ?? "").padEnd(3, "0") || "0");
  const timezone = match[8];

  if (
    month < 1 ||
    month > 12 ||
    day < 1 ||
    day > daysInMonth(year, month) ||
    hour < 0 ||
    hour > 23 ||
    minute < 0 ||
    minute > 59 ||
    second < 0 ||
    second > 59 ||
    timezone === undefined
  ) {
    return null;
  }

  let offsetMinutes = 0;
  if (timezone.toUpperCase() !== "Z") {
    const sign = timezone[0] === "+" ? 1 : -1;
    const offsetHour = Number(timezone.slice(1, 3));
    const offsetMinute = Number(timezone.slice(4, 6));

    if (offsetHour > 23 || offsetMinute > 59) {
      return null;
    }

    offsetMinutes = sign * (offsetHour * 60 + offsetMinute);
  }

  // Date.UTC treats years 0..99 specially, so setUTCFullYear keeps the parsed
  // calendar year literal and also makes the validation behavior explicit.
  const utc = new Date(0);
  utc.setUTCFullYear(year, month - 1, day);
  utc.setUTCHours(hour, minute, second, milliseconds);
  utc.setTime(utc.getTime() - offsetMinutes * 60 * 1000);

  return Number.isFinite(utc.getTime()) ? utc : null;
}

export function normalizeTimestamp(rawInput: string): NormalizedTimestamp {
  const value = rawInput.trim();

  if (UNIX_SECONDS.test(value)) {
    const seconds = Number(value);
    return fromDate(new Date(seconds * 1000), rawInput, [
      {
        code: "UNIX_TIMESTAMP_NORMALIZED",
        field: "timestamp",
        rawValue: rawInput,
        message: "Unix epoch seconds were normalized to a UTC ISO timestamp.",
      },
    ]);
  }

  if (UNIX_MILLISECONDS.test(value)) {
    const milliseconds = Number(value);
    return fromDate(new Date(milliseconds), rawInput, [
      {
        code: "UNIX_MILLISECONDS_TIMESTAMP_NORMALIZED",
        field: "timestamp",
        rawValue: rawInput,
        message: "Unix epoch milliseconds were normalized to a UTC ISO timestamp.",
      },
    ]);
  }

  const isoDate = parseIsoWithTimezone(value);
  if (isoDate !== null) {
    return fromDate(isoDate, rawInput);
  }

  return invalidTimestamp(rawInput);
}
