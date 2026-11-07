import { describe, expect, it } from "vitest";
import {
  BOOKING_PROPOSAL_MARGIN_MINUTES,
  earliestBookingTime,
  fromLocalDateTime,
  isBookingTimeAllowed,
  proposedBookingTime,
  toLocalDateTime,
  validateBookingSettings,
  withBookableTime,
} from "../../../packages/passenger-client/src/booking/time";

const settings = (minLeadTimeMinutes: number) => ({
  minLeadTimeMinutes,
  requireSmsVerification: false,
});

describe("formal configured reservation boundary (R5)", () => {
  for (const lead of [0, 15, 30]) {
    for (const seconds of [0, 30, 59]) {
      it(`initial local minute is lawful for lead=${lead}, second=${seconds}`, () => {
        const now = Date.UTC(2026, 9, 11, 6, 0, seconds);
        const initial = earliestBookingTime(settings(lead), now);
        const iso = fromLocalDateTime(initial);
        expect(isBookingTimeAllowed(iso, settings(lead), now)).toBe(true);
        expect(new Date(iso).getTime() - now - lead * 60_000).toBeLessThan(
          60_000,
        );
      });
    }
    it(`strictly rejects before and accepts equal/after for lead=${lead}`, () => {
      const now = Date.UTC(2026, 9, 11, 6, 0, 30);
      const boundary = now + lead * 60_000;
      expect(
        isBookingTimeAllowed(
          new Date(boundary - 1).toISOString(),
          settings(lead),
          now,
        ),
      ).toBe(false);
      expect(
        isBookingTimeAllowed(
          new Date(boundary).toISOString(),
          settings(lead),
          now,
        ),
      ).toBe(true);
      expect(
        isBookingTimeAllowed(
          new Date(boundary + 1).toISOString(),
          settings(lead),
          now,
        ),
      ).toBe(true);
      expect(
        isBookingTimeAllowed(
          new Date(boundary).toISOString(),
          settings(lead),
          now + 1,
        ),
      ).toBe(false);
    });
  }
  for (const value of [
    null,
    undefined,
    {},
    { minLeadTimeMinutes: 15 },
    { minLeadTimeMinutes: "15", requireSmsVerification: false },
    settings(-1),
    settings(NaN),
    settings(Infinity),
    { ...settings(15), requireSmsVerification: "false" },
  ]) {
    it(`missing/invalid configuration fails closed: ${JSON.stringify(value)}`, () => {
      expect(() => validateBookingSettings(value)).toThrow(
        "booking_settings_unavailable",
      );
    });
  }
  it("does not invent integer-only policy; finite fractional lead remains strict", () => {
    const now = Date.UTC(2026, 9, 11, 6, 0, 0);
    expect(fromLocalDateTime(earliestBookingTime(settings(0.5), now))).toBe(
      new Date(now + 60_000).toISOString(),
    );
  });
  it.each(["2026-11-01T05:55:30Z", "2026-11-01T06:05:00Z"])(
    "DST fold still initializes a lawful representable minute at %s",
    (clock) => {
      const now = Date.parse(clock);
      const local = earliestBookingTime(settings(30), now);
      expect(
        isBookingTimeAllowed(fromLocalDateTime(local), settings(30), now),
      ).toBe(true);
      if (process.env.TZ === "America/New_York")
        expect(local).toBe("2026-11-01T02:00");
    },
  );
  it("invalid timestamps cannot be quoted or submitted", () => {
    expect(isBookingTimeAllowed("bad", settings(30))).toBe(false);
  });
});

describe("ISO / datetime-local complete draft roundtrip (R6)", () => {
  it("roundtrips current local timezone without passing Z to datetime-local", () => {
    const iso = "2026-10-11T07:00:00.000Z";
    const local = toLocalDateTime(iso);
    expect(local).toMatch(/^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}$/);
    expect(fromLocalDateTime(local)).toBe(iso);
  });
  for (const value of [
    "",
    "invalid",
    "2026-10-11T07:00:00Z",
    "2026-02-30T07:00",
    "2026-10-11T25:00",
  ]) {
    it(`rejects invalid/non-local value ${value}`, () => {
      expect(() => fromLocalDateTime(value)).toThrow("invalid_booking_time");
    });
  }
});

describe("the time the app proposes", () => {
  for (const lead of [0, 1, 15, 30]) {
    for (const seconds of [0, 30, 59]) {
      it(`stays bookable through the margin for lead=${lead}, second=${seconds}`, () => {
        const now = Date.UTC(2026, 10, 4, 6, 0, seconds);
        const later = now + BOOKING_PROPOSAL_MARGIN_MINUTES * 60_000;
        const proposed = fromLocalDateTime(
          proposedBookingTime(settings(lead), now),
        );
        expect(isBookingTimeAllowed(proposed, settings(lead), later)).toBe(
          true,
        );
        // Why a proposal cannot sit on the lead itself.
        const earliest = fromLocalDateTime(
          earliestBookingTime(settings(lead), now),
        );
        expect(
          isBookingTimeAllowed(earliest, settings(lead), now + 60_000),
        ).toBe(false);
      });
    }
  }
});

describe("keeping a draft's time bookable", () => {
  const now = Date.UTC(2026, 10, 4, 6, 0, 30);
  const policy = settings(1);
  const proposal = proposedBookingTime(policy, now);
  it("keeps a picked time that can still be booked", () => {
    const draft = { localTime: "2099-10-11T12:00", localTimeAuto: false };
    expect(withBookableTime(draft, policy, now)).toBe(draft);
  });
  it("treats a draft without the flag, saved before it existed, as picked", () => {
    const draft = { localTime: "2099-10-11T12:00" };
    expect(withBookableTime(draft, policy, now)).toBe(draft);
  });
  it.each(["2000-01-01T00:00", "", "not-a-time"])(
    "replaces the picked value %j, which cannot be booked",
    (localTime) => {
      expect(withBookableTime({ localTime }, policy, now)).toEqual({
        localTime: proposal,
        localTimeAuto: true,
      });
    },
  );
  it("moves an earlier proposal even while it is still bookable", () => {
    const draft = { localTime: "2099-10-11T12:00", localTimeAuto: true };
    expect(withBookableTime(draft, policy, now).localTime).toBe(proposal);
  });
  it("leaves the rest of the draft alone", () => {
    const draft = { origin: "A", localTime: "2000-01-01T00:00" };
    expect(withBookableTime(draft, policy, now).origin).toBe("A");
  });
});
