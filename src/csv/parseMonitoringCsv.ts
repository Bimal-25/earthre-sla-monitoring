import { CsvParseError, CsvSchemaError } from "../errors";
import {
  REQUIRED_CSV_COLUMNS,
  type ParsedMonitoringCsv,
  type ParsedMonitoringRow,
  type RawCheckRow,
} from "../types";

interface CsvRecord {
  recordNumber: number;
  fields: string[];
}

/**
 * Small RFC-4180-style parser tailored to the assignment input boundary.
 * It supports quoted fields, escaped quotes, embedded newlines, CRLF/LF,
 * and rejects malformed quote placement rather than guessing.
 */
function parseCsvRecords(input: string): CsvRecord[] {
  const text = input.charCodeAt(0) === 0xfeff ? input.slice(1) : input;
  const records: CsvRecord[] = [];
  let row: string[] = [];
  let field = "";
  let inQuotes = false;
  let justClosedQuote = false;
  let recordNumber = 1;

  const pushRecord = (): void => {
    row.push(field);
    field = "";
    justClosedQuote = false;

    const isBlank = row.every((value) => value.trim() === "");
    if (!isBlank) {
      records.push({ recordNumber, fields: row });
    }

    row = [];
    recordNumber += 1;
  };

  for (let index = 0; index < text.length; index += 1) {
    const char = text[index];

    if (char === undefined) {
      break;
    }

    if (inQuotes) {
      if (char === '"') {
        if (text[index + 1] === '"') {
          field += '"';
          index += 1;
        } else {
          inQuotes = false;
          justClosedQuote = true;
        }
      } else {
        field += char;
      }
      continue;
    }

    if (justClosedQuote) {
      if (char === ",") {
        row.push(field);
        field = "";
        justClosedQuote = false;
        continue;
      }

      if (char === "\n") {
        pushRecord();
        continue;
      }

      if (char === "\r") {
        if (text[index + 1] === "\n") {
          index += 1;
        }
        pushRecord();
        continue;
      }

      throw new CsvParseError(
        `Unexpected character after closing quote in CSV record ${recordNumber}.`,
        recordNumber,
      );
    }

    if (char === '"') {
      if (field.length !== 0) {
        throw new CsvParseError(
          `Unexpected quote inside unquoted field in CSV record ${recordNumber}.`,
          recordNumber,
        );
      }
      inQuotes = true;
      continue;
    }

    if (char === ",") {
      row.push(field);
      field = "";
      continue;
    }

    if (char === "\n") {
      pushRecord();
      continue;
    }

    if (char === "\r") {
      if (text[index + 1] === "\n") {
        index += 1;
      }
      pushRecord();
      continue;
    }

    field += char;
  }

  if (inQuotes) {
    throw new CsvParseError(
      `Unclosed quoted field in CSV record ${recordNumber}.`,
      recordNumber,
    );
  }

  if (justClosedQuote || field.length > 0 || row.length > 0) {
    pushRecord();
  }

  return records;
}

function validateHeaders(headers: readonly string[]): void {
  const seen = new Set<string>();

  for (const header of headers) {
    if (seen.has(header)) {
      throw new CsvSchemaError(`Duplicate CSV header: ${header}`);
    }
    seen.add(header);
  }

  const missing = REQUIRED_CSV_COLUMNS.filter((header) => !seen.has(header));
  if (missing.length > 0) {
    throw new CsvSchemaError(
      `CSV is missing required column${missing.length === 1 ? "" : "s"}: ${missing.join(", ")}`,
    );
  }
}

export function parseMonitoringCsv(input: string): ParsedMonitoringCsv {
  if (input.trim().length === 0) {
    throw new CsvSchemaError("CSV input is empty.");
  }

  const records = parseCsvRecords(input);
  const headerRecord = records[0];

  if (headerRecord === undefined) {
    throw new CsvSchemaError("CSV input does not contain a header row.");
  }

  const headers = headerRecord.fields.map((header) => header.trim());
  validateHeaders(headers);

  const rows: ParsedMonitoringRow[] = [];

  for (const record of records.slice(1)) {
    if (record.fields.length !== headers.length) {
      throw new CsvParseError(
        `CSV record ${record.recordNumber} has ${record.fields.length} fields; expected ${headers.length}.`,
        record.recordNumber,
      );
    }

    const values = new Map<string, string>();
    headers.forEach((header, index) => {
      values.set(header, record.fields[index] ?? "");
    });

    const raw: RawCheckRow = {
      service_id: values.get("service_id") ?? "",
      service_name: values.get("service_name") ?? "",
      timestamp: values.get("timestamp") ?? "",
      status_code: values.get("status_code") ?? "",
      latency: values.get("latency") ?? "",
      latency_unit: values.get("latency_unit") ?? "",
      agent: values.get("agent") ?? "",
      region: values.get("region") ?? "",
    };

    rows.push({ sourceRow: record.recordNumber, raw });
  }

  return { headers, rows };
}
