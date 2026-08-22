import { describe, expect, it } from "vitest";

import { resolveDatabasePoolMax } from "../../src/common/db/database.service";

describe("resolveDatabasePoolMax", () => {
  it("preserves the pg default when no override is configured", () => {
    expect(resolveDatabasePoolMax(undefined)).toBeUndefined();
    expect(resolveDatabasePoolMax("  ")).toBeUndefined();
  });

  it("accepts a positive integer override", () => {
    expect(resolveDatabasePoolMax("2")).toBe(2);
  });

  it.each(["0", "-1", "1.5", "invalid"])(
    "rejects invalid pool maximum %s",
    (value) => {
      expect(() => resolveDatabasePoolMax(value)).toThrow(
        "DATABASE_POOL_MAX must be a positive integer",
      );
    },
  );
});
