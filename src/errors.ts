export class CsvParseError extends Error {
  constructor(
    message: string,
    public readonly recordNumber?: number,
  ) {
    super(message);
    this.name = "CsvParseError";
  }
}

export class CsvSchemaError extends Error {
  constructor(message: string) {
    super(message);
    this.name = "CsvSchemaError";
  }
}

export class IntervalBuildError extends Error {
  constructor(message: string) {
    super(message);
    this.name = "IntervalBuildError";
  }
}
