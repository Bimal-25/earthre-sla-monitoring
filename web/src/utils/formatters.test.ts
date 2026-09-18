import { describe, expect, it } from "vitest";
import { formatDurationMinutes, formatLatency, formatPercent } from "./formatters";

describe("dashboard formatters", () => {
  it("formats absent values without inventing numbers", () => {
    expect(formatPercent(null)).toBe("—");
    expect(formatLatency(null)).toBe("—");
  });

  it("formats percentages and downtime for operational display", () => {
    expect(formatPercent(99.050706, 3)).toBe("99.051%");
    expect(formatDurationMinutes(615)).toBe("10h 15m");
    expect(formatDurationMinutes(45)).toBe("45 min");
  });
});
