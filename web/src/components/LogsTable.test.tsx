import { fireEvent, render, screen } from "@testing-library/react";
import { describe, expect, it, vi } from "vitest";
import type { LogsResponse } from "../api/types";
import { LogsTable } from "./LogsTable";

const page: LogsResponse = {
  uploadId: "b".repeat(64),
  period: { from: "2025-05-08", to: "2025-05-08" },
  serviceId: null,
  hasMore: true,
  nextCursor: "cursor",
  items: [{
    observationId: "obs-1",
    uploadId: "b".repeat(64),
    sourceRow: 2,
    sourceRows: [2],
    duplicateCount: 1,
    raw: { service_id: "svc-search", service_name: "search-api", timestamp: "2025-05-08T00:00:00Z", status_code: "200", latency: "0.497", latency_unit: "s", agent: "agent-1", region: "ap-south-1" },
    serviceId: "svc-search",
    serviceName: "search-api",
    agent: "agent-1",
    region: "ap-south-1",
    timestampRaw: "2025-05-08T00:00:00Z",
    timestampUtc: "2025-05-08T00:00:00.000Z",
    dateUtc: "2025-05-08",
    isOnExpectedCadence: true,
    statusCodeRaw: "200",
    statusCode: 200,
    healthState: "healthy",
    latencyRaw: "0.497",
    latencyUnitRaw: "s",
    latencyMs: 497,
    intervalKey: "svc-search\u00002025-05-08T00:00:00.000Z",
    issues: [],
  }],
};

describe("LogsTable", () => {
  it("renders normalized operational values and cursor controls", () => {
    const onNext = vi.fn();
    render(<LogsTable page={page} pageNumber={1} canGoPrevious={false} onPrevious={vi.fn()} onNext={onNext} />);
    expect(screen.getByText("search-api")).toBeInTheDocument();
    expect(screen.getByText("497 ms")).toBeInTheDocument();
    expect(screen.getByRole("button", { name: "Previous" })).toBeDisabled();
    fireEvent.click(screen.getByRole("button", { name: "Next" }));
    expect(onNext).toHaveBeenCalledOnce();
  });
});
