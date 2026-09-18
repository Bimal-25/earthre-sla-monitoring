import type { LogObservation } from "../api/types";

export function StatusBadge({ healthState, statusCode }: Pick<LogObservation, "healthState" | "statusCode">) {
  if (healthState === "healthy") {
    return <span className="badge badge--healthy"><span className="badge__dot" />{statusCode ?? "Healthy"}</span>;
  }
  if (healthState === "down") {
    return <span className="badge badge--down"><span className="badge__dot" />{statusCode ?? "Down"}</span>;
  }
  return <span className="badge badge--unknown"><span className="badge__dot" />{statusCode ?? "Invalid"}</span>;
}
