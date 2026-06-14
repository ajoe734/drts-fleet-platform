import { describe, expect, it } from "vitest";
import {
  adaptBookingFixtureToCreateCommand,
  resolveDispatchEmbedDisposition,
  summarizeBookingGates,
} from "@/lib/dispatch-fixture-adapter";
import {
  enterpriseDispatchBookingFixture,
  enterpriseDispatchBookingRecord,
  tenantConsoleBookingLink,
} from "../fixtures/dispatch-booking-fixture";

describe("enterprise dispatch fixture adapter", () => {
  it("maps booking fixtures onto the tenant booking command contract", () => {
    expect(
      adaptBookingFixtureToCreateCommand(enterpriseDispatchBookingFixture),
    ).toEqual(
      expect.objectContaining({
        businessDispatchSubtype: "enterprise_dispatch",
        reservationWindowStart: "2026-06-12T10:00:00.000Z",
        reservationWindowEnd: "2026-06-12T11:00:00.000Z",
        costCenter: "OPS-001",
        notes: "Driver should call security desk on arrival.",
        bookedBy: {
          name: "Pat Coordinator",
          email: "pat.coordinator@example.com",
        },
      }),
    );
  });

  it("derives dispatch gate state from booking.complianceGates", () => {
    expect(summarizeBookingGates(enterpriseDispatchBookingRecord)).toEqual(
      expect.objectContaining({
        totalCount: 2,
        blockingCount: 1,
        reviewRequiredCount: 0,
        primaryGateType: "eligibility",
        primaryGateState: "blocked",
      }),
    );
  });

  it("keeps embed mode disabled and falls back to deep links", () => {
    expect(resolveDispatchEmbedDisposition(tenantConsoleBookingLink)).toEqual({
      allowed: false,
      mode: "deep_link_only",
      reasonCode: "PHASE1_DEEP_LINK_ONLY",
      fallbackHref: "https://tenant-console.dev.example/bookings/booking-001",
      targetApp: "tenant-console",
    });
  });
});
