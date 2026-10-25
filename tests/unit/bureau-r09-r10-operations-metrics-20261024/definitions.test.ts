import { describe, expect, it } from "vitest";
import {
  classifyTripPunctuality,
  toTaipeiMonth,
} from "../../../apps/api/src/modules/reporting/operations-metrics";

describe("bureau-r10_late_and_no_show_metrics definitions", () => {
  it("never counts a trip with a missing canonical timestamp as on time", () => {
    const base = {
      orderId: "syn",
      reservationTime: "2026-08-10T02:00:00.000Z",
      firstAssignedAt: "2026-08-10T01:00:00.000Z",
      etaSecondsAtAssignment: 600,
      arrivedPickupAt: "2026-08-10T02:00:00.000Z",
      finalStatus: "completed",
    };
    expect(
      classifyTripPunctuality({
        record: { ...base, arrivedPickupAt: null },
        dispatchSemantics: "reservation",
      }),
    ).toBe("unknown");
    expect(
      classifyTripPunctuality({
        record: { ...base, reservationTime: null },
        dispatchSemantics: "reservation",
      }),
    ).toBe("unknown");
    expect(
      classifyTripPunctuality({
        record: { ...base, etaSecondsAtAssignment: null },
        dispatchSemantics: "realtime",
      }),
    ).toBe("unknown");
    expect(
      classifyTripPunctuality({
        record: { ...base, firstAssignedAt: null },
        dispatchSemantics: "realtime",
      }),
    ).toBeNull();
  });
});

describe("bureau-r09_monthly_complaint_statistics calendar", () => {
  it("uses the Asia/Taipei calendar, not the UTC month", () => {
    expect(toTaipeiMonth("2026-07-31T15:59:59.999Z")).toBe("2026-07");
    expect(toTaipeiMonth("2026-07-31T16:00:00.000Z")).toBe("2026-08");
    expect(toTaipeiMonth("2026-12-31T16:00:00.000Z")).toBe("2027-01");
    expect(toTaipeiMonth(null)).toBeNull();
    expect(toTaipeiMonth("not-a-time")).toBeNull();
  });
});
