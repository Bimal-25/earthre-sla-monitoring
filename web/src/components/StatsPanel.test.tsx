import { fireEvent, render, screen } from "@testing-library/react";
import { describe, expect, it } from "vitest";
import type { UploadSummaryResponse } from "../api/types";
import { StatsPanel } from "./StatsPanel";

const summary: UploadSummaryResponse = {
  uploadId: "a".repeat(64),
  filename: "monitoring.csv",
  period: { from: "2025-05-08", to: "2025-05-16", completeCalendarMonth: false, uploadCoversPeriodBoundaries: true },
  overall: {
    expectedIntervals: 4320,
    healthyIntervals: 4278,
    downIntervals: 41,
    unknownIntervals: 1,
    conflictedIntervals: 0,
    resolvedIntervals: 4319,
    unresolvedIntervals: 1,
    availabilityPercent: 99.05070618198657,
    coveragePercent: 99.97685185185186,
    detectedDowntimeMinutes: 615,
    p95LatencyMs: 760,
    issueCounts: { MISSING_LATENCY: 56 },
  },
  services: [],
  slaTargetPercent: 99.9,
};

describe("StatsPanel", () => {
  it("shows the partial-month guard and is keyboard-button collapsible", () => {
    render(<StatsPanel summary={summary} />);
    expect(screen.getByText("Partial-period observation")).toBeInTheDocument();
    expect(screen.getByText("99.051%")).toBeInTheDocument();

    const toggle = screen.getByRole("button", { name: /collapse/i });
    expect(toggle).toHaveAttribute("aria-expanded", "true");
    fireEvent.click(toggle);
    expect(toggle).toHaveAttribute("aria-expanded", "false");
    expect(screen.queryByText("Partial-period observation")).not.toBeInTheDocument();
  });
});
