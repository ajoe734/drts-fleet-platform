import { describe, expect, it, vi } from "vitest";

import type { BookingRecord } from "@drts/contracts";

import { OwnedMobilityController } from "../../src/modules/owned-mobility/owned-mobility.controller";

function makeBooking(overrides?: Partial<BookingRecord>): BookingRecord {
  return {
    bookingId: "booking-000001",
    orderId: "order-000001",
    tenantId: "tenant-demo-001",
    partnerId: null,
    partnerProgramId: null,
    partnerEntrySlug: null,
    eligibilityVerificationId: null,
    issuerAuthorizationRef: null,
    status: "accepted",
    serviceBucket: "business_dispatch",
    businessDispatchSubtype: "enterprise_dispatch",
    bookingType: "oneway",
    reservationWindowStart: "2026-05-13T14:00:00.000Z",
    reservationWindowEnd: "2026-05-13T15:00:00.000Z",
    recurrenceRule: null,
    editableUntil: "2026-05-13T13:30:00.000Z",
    modifiableUntil: "2026-05-13T13:30:00.000Z",
    cancelableUntil: "2026-05-13T13:45:00.000Z",
    readOnlyReasonCode: null,
    availableActions: [],
    pickup: { address: "Pickup" },
    dropoff: { address: "Dropoff" },
    passenger: { name: "Rider One", phone: "0912000000" },
    bookedBy: null,
    onsiteContact: null,
    costCenter: null,
    vehiclePreference: null,
    benefitReference: null,
    direction: null,
    flightNo: null,
    terminal: null,
    luggageCount: null,
    notes: null,
    quotedFare: null,
    quotedFareSource: null,
    quotedFareRuleVersion: null,
    manualFareOverride: null,
    approvalState: "not_required",
    approvalRequestIds: [],
    complianceGates: [],
    orderStatus: "created",
    createdAt: "2026-05-13T12:00:00.000Z",
    updatedAt: "2026-05-13T12:00:00.000Z",
    ...overrides,
  };
}

describe("OwnedMobilityController booking commands", () => {
  it("returns accepted+pending for create commands that require approval", async () => {
    const booking = makeBooking({
      status: "pending",
      approvalState: "pending",
      approvalRequestIds: ["approval-001"],
    });
    const ownedMobilityService = {
      createTenantBooking: vi.fn(async () => ({
        bookingId: booking.bookingId,
      })),
      getTenantBooking: vi.fn(() => booking),
    };
    const controller = new OwnedMobilityController(ownedMobilityService as never);

    const response = await controller.createTenantBookingCommand(
      {
        businessDispatchSubtype: "enterprise_dispatch",
        reservationWindowStart: booking.reservationWindowStart,
        reservationWindowEnd: booking.reservationWindowEnd,
        pickup: booking.pickup,
        dropoff: booking.dropoff,
        passenger: booking.passenger,
      },
      null,
      booking.tenantId,
      "req-booking-create-001",
    );

    expect(ownedMobilityService.createTenantBooking).toHaveBeenCalledWith(
      expect.any(Object),
      booking.tenantId,
      null,
      "req-booking-create-001",
    );
    expect(ownedMobilityService.getTenantBooking).toHaveBeenCalledWith(
      booking.tenantId,
      booking.bookingId,
    );
    expect(response).toEqual({
      data: {
        state: "accepted",
        commandId: "req-booking-create-001",
        pendingReasonCode: "approval_pending",
        booking,
      },
      meta: {
        requestId: "req-booking-create-001",
        timestamp: expect.any(String),
      },
    });
  });

  it("returns completed for update commands that finish synchronously", async () => {
    const booking = makeBooking();
    const ownedMobilityService = {
      updateTenantBooking: vi.fn(async () => booking),
    };
    const controller = new OwnedMobilityController(ownedMobilityService as never);

    const response = await controller.updateTenantBookingCommand(
      booking.bookingId,
      { notes: "Gate B" },
      null,
      booking.tenantId,
      "req-booking-update-001",
    );

    expect(ownedMobilityService.updateTenantBooking).toHaveBeenCalledWith(
      booking.tenantId,
      booking.bookingId,
      { notes: "Gate B" },
      null,
      "req-booking-update-001",
    );
    expect(response).toEqual({
      data: {
        state: "completed",
        booking,
      },
      meta: {
        requestId: "req-booking-update-001",
        timestamp: expect.any(String),
      },
    });
  });

  it("returns completed for cancel commands when the booking is already cancelled", async () => {
    const booking = makeBooking({
      status: "cancelled",
      orderStatus: "cancelled",
      readOnlyReasonCode: "booking_cancelled",
    });
    const ownedMobilityService = {
      cancelTenantBooking: vi.fn(async () => booking),
    };
    const controller = new OwnedMobilityController(ownedMobilityService as never);

    const response = await controller.cancelTenantBookingCommand(
      booking.bookingId,
      { reasonCode: "user_cancelled" },
      booking.tenantId,
      "req-booking-cancel-001",
    );

    expect(ownedMobilityService.cancelTenantBooking).toHaveBeenCalledWith(
      booking.tenantId,
      booking.bookingId,
      { reasonCode: "user_cancelled" },
      "req-booking-cancel-001",
    );
    expect(response).toEqual({
      data: {
        state: "completed",
        booking,
      },
      meta: {
        requestId: "req-booking-cancel-001",
        timestamp: expect.any(String),
      },
    });
  });
});
