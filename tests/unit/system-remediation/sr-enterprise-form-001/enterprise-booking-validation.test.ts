import { describe, expect, it } from "vitest";

// This module is intentionally alias-free (see the module's own header
// comment) so it loads under the repo-root vitest config used by this
// task's mandated test command, unlike lib/enterprise-booking-draft.ts
// which pulls in "@/lib/enterprise-fixtures" and "@/lib/translations" --
// aliases the root vitest.config.ts pins to a different app
// (apps/tenant-console-web) and therefore cannot resolve here.
import {
  getEarliestBookableLabel,
  getEnterprisePassengerDisplayName,
  isEnterpriseDraftComplete,
  isReservationWindowInFuture,
  type EnterpriseDraftCompletenessInput,
} from "../../../../apps/enterprise-dispatch-web/components/booking-form/enterprise-booking-validation";

const NOW = new Date("2026-09-06T02:00:00.000Z"); // 2026-09-06 10:00 +08:00

function completeDraft(
  overrides: Partial<EnterpriseDraftCompletenessInput> = {},
): EnterpriseDraftCompletenessInput {
  return {
    passengerMode: "other",
    passenger: "Sato Haruka",
    bookedBy: "林宜君",
    pickup: "Pickup Point",
    dropoff: "Dropoff Point",
    reservationDate: "2026-09-08",
    reservationTime: "10:00",
    onsiteContactPhone: "0912-000-000",
    costCenterCode: "CC-PRD-07",
    costCenterLabel: "CC-PRD-07 · Product",
    ...overrides,
  };
}

describe("SR-ENTERPRISE-FORM-001 (R21): reservation window past-time / timezone-boundary guard", () => {
  it("rejects a reservation date that has already passed relative to now (audit repro: filled 6/13 while today is 9/6)", () => {
    const draft = { reservationDate: "2026-06-13", reservationTime: "15:20" };
    expect(isReservationWindowInFuture(draft, NOW)).toBe(false);
  });

  it("accepts a reservation date/time strictly after now", () => {
    const draft = { reservationDate: "2026-09-08", reservationTime: "10:00" };
    expect(isReservationWindowInFuture(draft, NOW)).toBe(true);
  });

  it("resolves the +08:00 wall-clock boundary correctly around the current instant", () => {
    expect(
      isReservationWindowInFuture(
        { reservationDate: "2026-09-06", reservationTime: "09:59" },
        NOW,
      ),
    ).toBe(false);
    expect(
      isReservationWindowInFuture(
        { reservationDate: "2026-09-06", reservationTime: "10:01" },
        NOW,
      ),
    ).toBe(true);
  });

  it("rejects malformed date/time instead of silently falling back to a fixture date", () => {
    expect(
      isReservationWindowInFuture(
        { reservationDate: "", reservationTime: "" },
        NOW,
      ),
    ).toBe(false);
    expect(
      isReservationWindowInFuture(
        { reservationDate: "not-a-date", reservationTime: "10:00" },
        NOW,
      ),
    ).toBe(false);
  });

  it("getEarliestBookableLabel surfaces a locale-aware, non-empty explanation of the current boundary", () => {
    expect(getEarliestBookableLabel("zh", NOW)).toContain("09/06");
    expect(getEarliestBookableLabel("zh", NOW)).toContain("10:00");
    expect(getEarliestBookableLabel("en", NOW).toLowerCase()).toContain(
      "earliest",
    );
  });

  it("isEnterpriseDraftComplete rejects an otherwise-complete draft whose reservation window is in the past", () => {
    const draft = completeDraft({
      reservationDate: "2020-01-01",
      reservationTime: "09:00",
    });
    expect(isEnterpriseDraftComplete(draft, NOW)).toBe(false);
  });

  it("isEnterpriseDraftComplete accepts a fully filled draft with a future reservation window", () => {
    const draft = completeDraft();
    expect(isEnterpriseDraftComplete(draft, NOW)).toBe(true);
  });

  it("isEnterpriseDraftComplete still rejects a draft missing a required field even with a future window", () => {
    const draft = completeDraft({ onsiteContactPhone: "" });
    expect(isEnterpriseDraftComplete(draft, NOW)).toBe(false);
  });
});

describe("SR-ENTERPRISE-FORM-001 (R20): passenger name / placard consistency across self, delegate and rename", () => {
  it("uses the booker's own name when booking for self", () => {
    expect(
      getEnterprisePassengerDisplayName({
        passengerMode: "self",
        bookedBy: "林宜君",
        passenger: "fixture leftover value",
      }),
    ).toBe("林宜君");
  });

  it("uses the selected passenger's name when booking for someone else", () => {
    expect(
      getEnterprisePassengerDisplayName({
        passengerMode: "other",
        bookedBy: "林宜君",
        passenger: "Sato Haruka",
      }),
    ).toBe("Sato Haruka");
  });

  it("switches from a stale delegate passenger to the booker's own name once self mode is chosen (regression for the review-flagged Sato placard defect)", () => {
    const delegate = {
      passengerMode: "other" as const,
      bookedBy: "林宜君",
      passenger: "Sato Haruka",
    };
    expect(getEnterprisePassengerDisplayName(delegate)).toBe("Sato Haruka");

    const switchedToSelf = { ...delegate, passengerMode: "self" as const };
    expect(getEnterprisePassengerDisplayName(switchedToSelf)).toBe("林宜君");
  });

  it("reflects a renamed booker immediately", () => {
    const draft = {
      passengerMode: "self" as const,
      bookedBy: "Old Name",
      passenger: "",
    };
    expect(getEnterprisePassengerDisplayName(draft)).toBe("Old Name");

    const renamed = { ...draft, bookedBy: "New Name" };
    expect(getEnterprisePassengerDisplayName(renamed)).toBe("New Name");
  });

  it("trims whitespace so a not-yet-typed field reads as empty rather than a placeholder", () => {
    expect(
      getEnterprisePassengerDisplayName({
        passengerMode: "other",
        bookedBy: "林宜君",
        passenger: "   ",
      }),
    ).toBe("");
  });
});
