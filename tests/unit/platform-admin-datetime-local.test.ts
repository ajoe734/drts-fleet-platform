import { describe, expect, it } from "vitest";

import { normalizeDateTimeLocalValue } from "../../apps/platform-admin-web/app/switchboard/datetime-local";

describe("platform admin datetime-local normalization", () => {
  it("rejects impossible calendar dates instead of rolling them forward", () => {
    expect(normalizeDateTimeLocalValue("2026-02-31T12:00")).toEqual({
      isoValue: null,
    });
  });

  it("converts valid datetime-local values to ISO timestamps", () => {
    const input = "2026-02-28T12:34";
    const expected = new Date(2026, 1, 28, 12, 34).toISOString();

    expect(normalizeDateTimeLocalValue(input)).toEqual({
      isoValue: expected,
    });
  });
});
