import { describe, expect, it } from "vitest";
import { dateFilterToQuery, validateDateFilter } from "./dateFilter";

describe("date filtering", () => {
  it("maps a single date to the API's from-only contract", () => {
    expect(dateFilterToQuery({ mode: "single", date: "2025-05-10" }))
      .toEqual({ from: "2025-05-10" });
  });

  it("maps a date range to inclusive from/to values", () => {
    expect(dateFilterToQuery({ mode: "range", from: "2025-05-10", to: "2025-05-12" }))
      .toEqual({ from: "2025-05-10", to: "2025-05-12" });
  });

  it("rejects reversed or out-of-upload ranges", () => {
    expect(validateDateFilter({ mode: "range", from: "2025-05-12", to: "2025-05-10" }, "2025-05-08", "2025-05-16"))
      .toContain("Start date");
    expect(validateDateFilter({ mode: "single", date: "2025-05-17" }, "2025-05-08", "2025-05-16"))
      .toContain("between");
  });
});
