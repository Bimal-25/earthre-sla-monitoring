export interface AppConfig {
  maxUploadBytes: number;
  maxCsvRows: number;
  defaultPageSize: number;
  maxPageSize: number;
  slaTargetPercent: number;
  allowedOrigins: string[];
}

export type Environment = Readonly<Record<string, string | undefined>>;

function positiveIntegerFromEnv(
  env: Environment,
  name: string,
  fallback: number,
): number {
  const raw = env[name];

  if (raw === undefined || raw.trim() === "") {
    return fallback;
  }

  const parsed = Number(raw);

  if (!Number.isInteger(parsed) || parsed <= 0) {
    throw new Error(`${name} must be a positive integer.`);
  }

  return parsed;
}

function percentFromEnv(
  env: Environment,
  name: string,
  fallback: number,
): number {
  const raw = env[name];

  if (raw === undefined || raw.trim() === "") {
    return fallback;
  }

  const parsed = Number(raw);

  if (!Number.isFinite(parsed) || parsed <= 0 || parsed > 100) {
    throw new Error(`${name} must be greater than 0 and at most 100.`);
  }

  return parsed;
}

export function loadConfigFromEnv(env: Environment): AppConfig {
  const configuredOrigins = (env.ALLOWED_ORIGIN ?? "")
    .split(",")
    .map((value) => value.trim())
    .filter((value) => value.length > 0);

  return {
    maxUploadBytes: positiveIntegerFromEnv(
      env,
      "MAX_UPLOAD_BYTES",
      5 * 1024 * 1024,
    ),

    maxCsvRows: positiveIntegerFromEnv(env, "MAX_CSV_ROWS", 25_000),

    defaultPageSize: positiveIntegerFromEnv(env, "DEFAULT_PAGE_SIZE", 100),

    maxPageSize: positiveIntegerFromEnv(env, "MAX_PAGE_SIZE", 250),

    slaTargetPercent: percentFromEnv(env, "SLA_TARGET_PERCENT", 99.9),

    allowedOrigins: [
      ...new Set([
        "http://localhost:5173",
        "http://127.0.0.1:5173",
        ...configuredOrigins,
      ]),
    ],
  };
}
