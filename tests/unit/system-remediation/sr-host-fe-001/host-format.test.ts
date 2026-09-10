import { describe, expect, it } from "vitest";
import {
  classifyHostAccessError,
  classifyHostEarningsVariant,
  formatHostMoney,
  formatHostMoneyOrNull,
  getCurrentHostPeriodMonth,
  sliceIsoDate,
} from "../../../../apps/fleet-partner-portal-web/app/host/lib/host-format";

describe("SR-HOST-FE-001: host-format pure helpers", () => {
  describe("formatHostMoney / formatHostMoneyOrNull", () => {
    it("formats a positive amount with the NT$ prefix and thousands separators", () => {
      expect(formatHostMoney(84200)).toBe("NT$ 84,200");
    });

    it("formats zero as a real zero, not a fallback dash", () => {
      expect(formatHostMoney(0)).toBe("NT$ 0");
    });

    it("returns null (never a fabricated 0) for a null pending_policy amount", () => {
      expect(formatHostMoneyOrNull(null)).toBeNull();
    });

    it("formats a non-null amount through formatHostMoneyOrNull", () => {
      expect(formatHostMoneyOrNull(12630)).toBe("NT$ 12,630");
    });
  });

  describe("classifyHostEarningsVariant — three distinct states", () => {
    it("classifies real non-zero activity as reported, even when settlementStatus is pending_policy", () => {
      // host-screen-contract.md §3 FX_HOST_EARNINGS: real activity, but
      // fleetCommission/netEarnings are null pending the split-policy
      // decision — the variant is still "reported", not "zero".
      expect(
        classifyHostEarningsVariant({ grossRevenue: 84200, tripsCount: 182 }),
      ).toBe("reported");
    });

    it("classifies a real, calculated zero-activity period as zero — not an error", () => {
      expect(
        classifyHostEarningsVariant({ grossRevenue: 0, tripsCount: 0 }),
      ).toBe("zero");
    });

    it("does not classify zero revenue with nonzero trips as zero (defensive: partial-zero is not the zero state)", () => {
      expect(
        classifyHostEarningsVariant({ grossRevenue: 0, tripsCount: 3 }),
      ).toBe("reported");
    });
  });

  describe("classifyHostAccessError — Family 3 error codes", () => {
    it("maps HOST_UNAUTHORIZED to unauthorized", () => {
      expect(
        classifyHostAccessError({ code: "HOST_UNAUTHORIZED", statusCode: 401 }),
      ).toBe("unauthorized");
    });

    it("maps HOST_FORBIDDEN to forbidden", () => {
      expect(
        classifyHostAccessError({ code: "HOST_FORBIDDEN", statusCode: 403 }),
      ).toBe("forbidden");
    });

    it("maps HOST_VEHICLE_NOT_FOUND to vehicle_not_found (anti-enumeration: never forbidden)", () => {
      expect(
        classifyHostAccessError({
          code: "HOST_VEHICLE_NOT_FOUND",
          statusCode: 404,
        }),
      ).toBe("vehicle_not_found");
    });

    it("falls back to statusCode when no recognized code is present", () => {
      expect(classifyHostAccessError({ statusCode: 403 })).toBe("forbidden");
    });

    it("classifies an unrecognized error (e.g. network failure while the backend module is unmerged) as fetch_failed", () => {
      expect(classifyHostAccessError(new Error("ECONNREFUSED"))).toBe(
        "fetch_failed",
      );
      expect(classifyHostAccessError(null)).toBe("fetch_failed");
      expect(classifyHostAccessError({ statusCode: 500 })).toBe(
        "fetch_failed",
      );
    });
  });

  describe("sliceIsoDate", () => {
    it("extracts the YYYY-MM-DD portion of an ISO timestamp", () => {
      expect(sliceIsoDate("2026-01-01T00:00:00.000Z")).toBe("2026-01-01");
    });
  });

  describe("getCurrentHostPeriodMonth", () => {
    it("returns a YYYY-MM string", () => {
      expect(getCurrentHostPeriodMonth()).toMatch(/^\d{4}-\d{2}$/);
    });
  });
});
