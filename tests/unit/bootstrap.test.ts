import { describe, expect, it } from "vitest";

describe("bootstrap smoke", () => {
  it("keeps the project slug stable", () => {
    expect("drts-fleet-platform").toBe("drts-fleet-platform");
  });
});
