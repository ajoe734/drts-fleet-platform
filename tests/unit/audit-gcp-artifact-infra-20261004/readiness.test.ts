import { describe, expect, it } from "vitest";

import { isMarkerFresh } from "../../../operations/artifact-scanner/gateway/readiness";

describe("isMarkerFresh", () => {
  it("is fresh when the marker was touched within the max age", () => {
    expect(isMarkerFresh(1_000, 1_500, 1_000)).toBe(true);
  });

  it("is fresh at the exact age boundary", () => {
    expect(isMarkerFresh(1_000, 2_000, 1_000)).toBe(true);
  });

  it("is stale once the marker's age exceeds the max age", () => {
    expect(isMarkerFresh(1_000, 2_001, 1_000)).toBe(false);
  });

  it("is stale for a marker far in the past", () => {
    expect(isMarkerFresh(0, 6 * 60 * 60 * 1000 + 1, 6 * 60 * 60 * 1000)).toBe(false);
  });
});
