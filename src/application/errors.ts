export class ApplicationError extends Error {
  constructor(
    public readonly code: string,
    message: string,
    public readonly statusCode: number,
    public readonly details: Record<string, unknown> | null = null,
  ) {
    super(message);
    this.name = "ApplicationError";
  }
}

export function applicationError(
  code: string,
  message: string,
  statusCode: number,
  details: Record<string, unknown> | null = null,
): ApplicationError {
  return new ApplicationError(code, message, statusCode, details);
}
