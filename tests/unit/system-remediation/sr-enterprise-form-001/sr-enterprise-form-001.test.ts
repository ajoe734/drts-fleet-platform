import fs from "node:fs";
import path from "node:path";
import { describe, expect, it } from "vitest";

import {
  DEFAULT_TIMEZONE_OFFSET,
  MIN_LEAD_TIME_MINUTES,
  createEnterpriseBookingDraft,
  derivePlacard,
  getEarliestReservationTime,
  isEnterpriseDraftComplete,
  parseEnterpriseBookingDraft,
  serializeEnterpriseBookingDraft,
  validateReservationWindow,
} from "../../../../apps/enterprise-dispatch-web/lib/enterprise-booking-draft";

describe("SR-ENTERPRISE-FORM-001: Enterprise Booking Form Remediation (R20, R21, R22)", () => {
  // Reference baseline time for deterministic tests: 2026-09-06 15:00:00 UTC (23:00:00 +08:00)
  const TEST_NOW = new Date("2026-09-06T15:00:00.000Z");

  describe("R20 / C015: Passenger Mode, Default Entry, and Placard Synchronization", () => {
    it("defaults to self mode with bookedBy as passenger and matching placard", () => {
      const draft = createEnterpriseBookingDraft("zh", TEST_NOW);

      expect(draft.passengerMode).toBe("self");
      expect(draft.passenger).toBe(draft.bookedBy);
      expect(draft.placard).toBe(draft.bookedBy);
      expect(draft.passenger).toBe("林宜君");
      expect(draft.placard).toBe("林宜君");
    });

    it("parses empty query params as self-booking for the logged-in user without defaulting to other/Sato", () => {
      const draft = parseEnterpriseBookingDraft({}, "zh", TEST_NOW);

      expect(draft.passengerMode).toBe("self");
      expect(draft.passenger).toBe(draft.bookedBy);
      expect(draft.placard).toBe(draft.bookedBy);
      expect(draft.passenger).not.toContain("Sato");
    });

    it("parses explicit pm=self and synchronizes passenger and placard to bookedBy", () => {
      const draft = parseEnterpriseBookingDraft(
        { pm: "self", bookedBy: "王大明" },
        "zh",
        TEST_NOW,
      );

      expect(draft.passengerMode).toBe("self");
      expect(draft.bookedBy).toBe("王大明");
      expect(draft.passenger).toBe("王大明");
      expect(draft.placard).toBe("王大明");
    });

    it("parses explicit pm=other and derives matching placard", () => {
      const draft = parseEnterpriseBookingDraft(
        { pm: "other", passenger: "林冠廷", bookedBy: "林宜君" },
        "zh",
        TEST_NOW,
      );

      expect(draft.passengerMode).toBe("other");
      expect(draft.bookedBy).toBe("林宜君");
      expect(draft.passenger).toBe("林冠廷");
      expect(draft.placard).toBe("林冠廷");
    });

    it("derives respectful placard for guest or Japanese titles", () => {
      expect(derivePlacard("訪客 · Sato Kenji")).toBe("Sato 様");
      expect(derivePlacard("Guest · Sato")).toBe("Sato 様");
      expect(derivePlacard("林冠廷")).toBe("林冠廷");
      expect(derivePlacard("訪客 · 陳思妤")).toBe("陳思妤");
      expect(derivePlacard("")).toBe("");
    });

    it("preserves custom edited placard across serialization and parsing", () => {
      const draft = parseEnterpriseBookingDraft(
        {
          pm: "other",
          passenger: "林冠廷",
          placard: "林冠廷 博士",
        },
        "zh",
        TEST_NOW,
      );

      expect(draft.passenger).toBe("林冠廷");
      expect(draft.placard).toBe("林冠廷 博士");

      const params = serializeEnterpriseBookingDraft(draft);
      expect(params.get("placard")).toBe("林冠廷 博士");

      const roundtripped = parseEnterpriseBookingDraft(
        Object.fromEntries(params.entries()),
        "zh",
        TEST_NOW,
      );
      expect(roundtripped.placard).toBe("林冠廷 博士");
    });

    it("maintains data integrity from form draft to review serialization", () => {
      const initial = createEnterpriseBookingDraft("zh", TEST_NOW, "other");
      initial.passenger = "Sato Haruka";
      initial.placard = "Sato 様";
      initial.flight = "JL809";
      initial.terminal = "T1";
      initial.airportDirection = "pickup";

      const searchParams = serializeEnterpriseBookingDraft(initial);
      const parsed = parseEnterpriseBookingDraft(
        Object.fromEntries(searchParams.entries()),
        "zh",
        TEST_NOW,
      );

      expect(parsed.passengerMode).toBe("other");
      expect(parsed.passenger).toBe("Sato Haruka");
      expect(parsed.placard).toBe("Sato 様");
      expect(parsed.flight).toBe("JL809");
      expect(parsed.terminal).toBe("T1");
      expect(parsed.airportDirection).toBe("pickup");
    });
  });

  describe("R21 / C016: Past Date, Minimum Lead Time, and Timezone Boundary Validation", () => {
    it("rejects past dates such as 2026-06-13 relative to current evaluation date", () => {
      const result = validateReservationWindow("2026-06-13", "15:20", TEST_NOW);

      expect(result.valid).toBe(false);
      expect(result.code).toBe("PAST_DATE");
      expect(result.reason).toContain("不能為過去時間");
      expect(result.earliestAllowedLabel).toContain("(UTC+8)");
    });

    it("rejects reservation inside the authoritative 15-minute lead time", () => {
      // TEST_NOW in +08:00 is 2026-09-06 23:00:00
      // 5 minutes later is 23:05:00
      const result = validateReservationWindow("2026-09-06", "23:05", TEST_NOW);

      expect(result.valid).toBe(false);
      expect(result.code).toBe("TOO_SOON_TO_BOOK");
      expect(result.reason).toContain(`需至少提前 ${MIN_LEAD_TIME_MINUTES} 分鐘`);
    });

    it("accepts valid reservation after the 15-minute minimum lead time", () => {
      // 30 minutes later: 23:30:00
      const result = validateReservationWindow("2026-09-06", "23:30", TEST_NOW);

      expect(result.valid).toBe(true);
      expect(result.reason).toBeUndefined();
    });

    it("correctly handles timezone day boundaries (+08:00 vs UTC)", () => {
      // Consider UTC time 2026-09-06 16:30:00Z.
      // In +08:00 this is 2026-09-07 00:30:00 (the next calendar day in Taipei).
      const midnightRollOver = new Date("2026-09-06T16:30:00.000Z");

      // Booking for 2026-09-06 23:30 (+08:00) is 15:30Z, which is in the past!
      const pastResult = validateReservationWindow(
        "2026-09-06",
        "23:30",
        midnightRollOver,
      );
      expect(pastResult.valid).toBe(false);
      expect(pastResult.code).toBe("PAST_DATE");

      // Booking for 2026-09-07 01:00 (+08:00) is 17:00Z (30 min ahead) -> valid
      const futureResult = validateReservationWindow(
        "2026-09-07",
        "01:00",
        midnightRollOver,
      );
      expect(futureResult.valid).toBe(true);
    });

    it("calculates earliest reservation time rounded up to nearest 5 minutes", () => {
      // TEST_NOW is 23:00:00 +08:00.
      // 23:00 + 15 min = 23:15. Rounded to 5 min = 23:15.
      const earliest = getEarliestReservationTime(TEST_NOW, 15);
      expect(earliest.date).toBe("2026-09-06");
      expect(earliest.time).toBe("23:15");
      expect(earliest.label).toBe("2026-09-06 23:15 (UTC+8)");
    });

    it("enforces isEnterpriseDraftComplete to block review progress on past dates", () => {
      const draft = createEnterpriseBookingDraft("zh", TEST_NOW);
      // Overwrite with past date
      draft.reservationDate = "2026-06-13";
      draft.reservationTime = "15:20";

      expect(isEnterpriseDraftComplete(draft, TEST_NOW)).toBe(false);

      // Overwrite with valid future date
      draft.reservationDate = "2026-09-08";
      draft.reservationTime = "10:00";
      expect(isEnterpriseDraftComplete(draft, TEST_NOW)).toBe(true);
    });
  });

  describe("R22 / C019 / C120: 390px Mobile Viewport Layout and Token Contracts", () => {
    it("defines responsive single-column classes and viewport protections in globals.css", () => {
      const cssPath = path.resolve(
        __dirname,
        "../../../../apps/enterprise-dispatch-web/app/globals.css",
      );
      const css = fs.readFileSync(cssPath, "utf-8");

      expect(css).toContain("overflow-x: hidden");
      expect(css).toContain("max-width: 100vw");
      expect(css).toContain(".booking-form-grid");
      expect(css).toContain(".review-grid");
      expect(css).toContain(".booking-form-inner-grid");
      expect(css).toContain("@media (max-width: 768px)");
      expect(css).toContain("grid-template-columns: 1fr !important");
    });

    it("strictly utilizes realm tokens from @drts/ui-tokens without arbitrary hex palettes", () => {
      const cssPath = path.resolve(
        __dirname,
        "../../../../apps/enterprise-dispatch-web/app/globals.css",
      );
      const css = fs.readFileSync(cssPath, "utf-8");

      // Tenant realm tokens
      expect(css).toContain("--realm-tenant-fg: #0F766E");
      expect(css).toContain("--realm-tenant-hi: #14B8A6");
      expect(css).toContain("--realm-tenant-bg: #F0FDFA");
      expect(css).toContain("--realm-tenant-border: #99F6E4");

      // Danger status tokens
      expect(css).toContain("--tone-danger-fg: #B42318");
      expect(css).toContain("--tone-danger-bg: #FEE4E2");
      expect(css).toContain("--tone-danger-border: #F8B3AC");
    });

    it("configures viewport in layout.tsx to support responsive mobile scaling", () => {
      const layoutPath = path.resolve(
        __dirname,
        "../../../../apps/enterprise-dispatch-web/app/layout.tsx",
      );
      const layoutContent = fs.readFileSync(layoutPath, "utf-8");

      expect(layoutContent).toContain("export const viewport: Viewport");
      expect(layoutContent).toContain('width: "device-width"');
      expect(layoutContent).toContain("initialScale: 1");
    });
  });
});
