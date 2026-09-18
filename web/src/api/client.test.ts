import { afterEach, describe, expect, it, vi } from "vitest";

import { getSummary, queryString, safeHeaderFilename } from "./client";

describe("API client helpers", () => {
  afterEach(() => {
    vi.restoreAllMocks();
  });

  it("encodes only supplied query values", () => {
    expect(
      queryString({
        from: "2025-05-08",
        to: undefined,
        pageSize: 50,
        serviceId: "svc search",
      }),
    ).toBe("?from=2025-05-08&pageSize=50&serviceId=svc+search");
  });

  it("returns an empty query string when no values are supplied", () => {
    expect(
      queryString({
        from: undefined,
        serviceId: "",
      }),
    ).toBe("");
  });

  it("creates an ASCII-safe filename header without losing the csv suffix", () => {
    expect(safeHeaderFilename("métrics.csv")).toBe("m_trics.csv");

    expect(safeHeaderFilename("monitoring.csv")).toBe("monitoring.csv");
  });

  it("preserves request cancellation as AbortError instead of NETWORK_ERROR", async () => {
    const controller = new AbortController();

    vi.spyOn(globalThis, "fetch").mockImplementation(
      (_input, init) =>
        new Promise((_resolve, reject) => {
          const signal = init?.signal;

          signal?.addEventListener(
            "abort",
            () => {
              reject(
                new DOMException("The operation was aborted.", "AbortError"),
              );
            },
            { once: true },
          );
        }),
    );

    const request = getSummary(
      "a".repeat(64),
      {
        from: "2025-05-08",
        to: "2025-05-16",
      },
      controller.signal,
    );

    controller.abort();

    await expect(request).rejects.toMatchObject({
      name: "AbortError",
    });
  });
});
