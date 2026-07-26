import { describe, expect, it } from "vitest";
import React from "react";
import { renderToString } from "react-dom/server";
import { ProgramBookingFlow } from "@/lib/program-screens";
import { getProgramThemeForTenantSlug } from "@/lib/program-theme";
import type { BookingRecord } from "@drts/contracts";

describe("ProgramBookingFlow embed real order creation", () => {
  const theme = getProgramThemeForTenantSlug("ctbc");

  it("renders embed submit button on embed handoff screen", () => {
    const html = renderToString(
      React.createElement(ProgramBookingFlow, {
        theme,
        screen: "embed_handoff",
        basePath: "/ctbc/program/embed",
        locale: "zh",
        surface: "embed",
      }),
    );

    expect(html).toContain('data-testid="embed-booking-submit-button"');
    expect(html).toContain("開始預約接送");
  });

  it("renders real booking details on embed success screen when booking record is present", () => {
    const mockBooking: BookingRecord = {
      bookingId: "booking-real-123456",
      tenantId: "tenant-ctbc",
      businessDispatchSubtype: "credit_card_airport_transfer",
      partnerEntrySlug: "ctbc",
      eligibilityVerificationId: "elig-real-999",
      pickup: {
        address: "台北市信義區忠孝東路五段1號",
        lat: 25.04,
        lng: 121.56,
      },
      dropoff: { address: "桃園國際機場第一航廈", lat: 25.07, lng: 121.23 },
      reservationWindowStart: "2026-08-01T10:00:00.000Z",
      reservationWindowEnd: null,
      passenger: { name: "張大明", phone: "0912345678" },
      notes: null,
      flightNo: "CI-100",
      status: "confirmed",
      cancellationReason: null,
      orderId: "order-real-123456",
      createdAt: "2026-07-26T16:00:00.000Z",
      updatedAt: "2026-07-26T16:00:00.000Z",
    } as unknown as BookingRecord;

    const html = renderToString(
      React.createElement(ProgramBookingFlow, {
        theme,
        screen: "success",
        basePath: "/ctbc/program/embed",
        locale: "zh",
        surface: "embed",
        booking: mockBooking,
      }),
    );

    expect(html).toContain("booking-real-123456");
    expect(html).toContain("台北市信義區忠孝東路五段1號");
    expect(html).toContain("桃園國際機場第一航廈");
    expect(html).toContain("2026-08-01T10:00:00.000Z");
  });

  it("renders no-valid-booking error and prevents fixture false success when booking is absent on embed success screen", () => {
    const html = renderToString(
      React.createElement(ProgramBookingFlow, {
        theme,
        screen: "success",
        basePath: "/ctbc/program/embed",
        locale: "zh",
        surface: "embed",
        booking: null,
      }),
    );

    expect(html).toContain("無有效預約紀錄");
    expect(html).not.toContain("CTBC-2026-0004");
  });

  it("maintains embed surface path in navigation links", () => {
    const html = renderToString(
      React.createElement(ProgramBookingFlow, {
        theme,
        screen: "embed_handoff",
        basePath: "/ctbc/program/embed",
        locale: "zh",
        surface: "embed",
        eligibilityVerificationId: "elig-test-123",
      }),
    );

    expect(html).toContain(
      'href="/ctbc/program/embed/review?eligibilityVerificationId=elig-test-123"',
    );
    expect(html).toContain(
      'href="/ctbc/program/embed/success?eligibilityVerificationId=elig-test-123"',
    );
    expect(html).not.toContain("/ctbc/program/site/");
  });
});
