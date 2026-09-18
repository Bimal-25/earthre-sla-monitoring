export interface Logger {
  info(event: string, fields?: Record<string, unknown>): void;
  error(event: string, fields?: Record<string, unknown>): void;
}

function write(
  severity: "INFO" | "ERROR",
  event: string,
  fields: Record<string, unknown> = {},
): void {
  const payload = {
    severity,
    event,
    timestamp: new Date().toISOString(),
    ...fields,
  };

  const line = JSON.stringify(payload);
  if (severity === "ERROR") {
    console.error(line);
  } else {
    console.log(line);
  }
}

export const consoleLogger: Logger = {
  info(event, fields) {
    write("INFO", event, fields);
  },
  error(event, fields) {
    write("ERROR", event, fields);
  },
};
