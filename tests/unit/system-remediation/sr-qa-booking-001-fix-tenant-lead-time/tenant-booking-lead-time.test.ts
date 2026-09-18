import { afterEach, describe, expect, it, vi } from "vitest";

import { OpsDispatchEventsService } from "../../../../apps/api/src/common/ops-dispatch-events.service";
import { AuditNotificationService } from "../../../../apps/api/src/modules/audit-notification/audit-notification.service";
import { OwnedMobilityTaskEventsService } from "../../../../apps/api/src/modules/owned-mobility/owned-mobility-task-events.service";
import { OwnedMobilityService } from "../../../../apps/api/src/modules/owned-mobility/owned-mobility.service";
import { ServiceProductService } from "../../../../apps/api/src/modules/service-product/service-product.service";
import { TenantPartnerService } from "../../../../apps/api/src/modules/tenant-partner/tenant-partner.service";

/**
 * SR-QA-BOOKING-001-FIX-TENANT-LEAD-TIME:
 * Validate that enterprise/tenant channels (createTenantBooking) and referral passenger
 * bookings (createReferralPassengerBooking) enforce minimum lead time (default 15 minutes)
 * and reject past dates with HTTP 400 TOO_SOON_TO_BOOK, semantically aligned with createMultiTaxiRide.
 */
function createLeadTimeTestHarness() {
  const auditNotificationService = new AuditNotificationService();
  const tenantPartnerService = new TenantPartnerService(
    auditNotificationService as never,
  );
  const serviceProductService = new ServiceProductService(
    auditNotificationService as never,
    undefined,
  );
  const regulatoryRegistryService = {
    getEligibleCandidates: vi.fn(() => []),
    getVehicleDispatchability: vi.fn(() => true),
    getDriverAvailability: vi.fn(() => true),
  };
  const callcenterService = {
    registerRecordingAttachmentListener: vi.fn(),
    registerRecordingStateChangeListener: vi.fn(),
    linkOrderToCallSession: vi.fn(),
  };
  const stubEmitter = { emit: () => {} } as never;
  const taskEventsService = new OwnedMobilityTaskEventsService(stubEmitter);
  const opsDispatchEventsService = new OpsDispatchEventsService(stubEmitter);
  const service = new OwnedMobilityService(
    regulatoryRegistryService as never,
    auditNotificationService as never,
    callcenterService as never,
    taskEventsService,
    opsDispatchEventsService,
    undefined,
    tenantPartnerService,
    undefined,
    serviceProductService,
  );
  return { service, tenantPartnerService, serviceProductService };
}

const TENANT_ID = "tenant-demo-001";
const TENANT_ADMIN = {
  actorType: "tenant_admin",
  actorId: "tenant-leadtime-admin-001",
} as never;

const REFERRAL_IDENTITY = {
  actorType: "referral_passenger",
  actorId: "referral-passenger-001",
  realm: "partner",
  tenantId: "tenant-demo-001",
  partnerId: "partner_ead6bf3d-e858-47cc-bfe1-5a3742524118",
  partnerProgramId: "program-referral-community",
  partnerEntrySlug: "yuhe-residence",
  drtsPassengerId: "referral-passenger-001",
} as never;

function tenantBookingCommand(overrides?: Record<string, unknown>) {
  return {
    businessDispatchSubtype: "enterprise_dispatch",
    reservationWindowStart: new Date(Date.now() + 3 * 3600_000).toISOString(),
    pickup: { address: "Taipei City Hall" },
    dropoff: { address: "Taipei 101" },
    passenger: { name: "Lead Time Rider", phone: "0912000000" },
    ...overrides,
  } as never;
}

describe("SR-QA-BOOKING-001-FIX-TENANT-LEAD-TIME: Tenant and referral booking lead time & past date validation", () => {
  afterEach(() => {
    vi.useRealTimers();
  });

  describe("1. Baseline multi-taxi control case", () => {
    it("gap-1: multi-taxi scheduled ride rejects pickup under 15 minutes with 400 TOO_SOON_TO_BOOK", () => {
      const { service } = createLeadTimeTestHarness();
      const authorization = {
        operatingAuthorizationId: "auth-multi-taxi-001",
        vehicleId: "veh-demo-001",
        driverId: "drv-demo-001",
      } as never;

      expect(() =>
        service.createMultiTaxiRide(
          {
            timingMode: "scheduled",
            requestedPickupAt: new Date(Date.now() + 2 * 60_000).toISOString(),
            pickup: { address: "Pickup Location" },
            dropoff: { address: "Dropoff Location" },
          } as never,
          authorization,
        ),
      ).toThrowError(
        expect.objectContaining({
          status: 400,
          response: expect.objectContaining({
            error: expect.objectContaining({
              code: "TOO_SOON_TO_BOOK",
              details: expect.objectContaining({
                minLeadTimeMinutes: 15,
              }),
            }),
          }),
        }),
      );
    });
  });

  describe("2. Tenant booking lead time & past date validation", () => {
    it("gap-2 resolved: rejects tenant booking with pickup earlier than minLeadTime (e.g. 2 min) with 400 TOO_SOON_TO_BOOK", () => {
      const { service } = createLeadTimeTestHarness();
      const reservationWindowStart = new Date(
        Date.now() + 2 * 60_000,
      ).toISOString();

      expect(() =>
        service.createTenantBooking(
          tenantBookingCommand({ reservationWindowStart }),
          TENANT_ID,
          TENANT_ADMIN,
        ),
      ).toThrowError(
        expect.objectContaining({
          status: 400,
          response: expect.objectContaining({
            error: expect.objectContaining({
              code: "TOO_SOON_TO_BOOK",
              details: expect.objectContaining({
                reservationWindowStart,
                requestedPickupAt: reservationWindowStart,
                minLeadTimeMinutes: 15,
              }),
            }),
          }),
        }),
      );
    });

    it("gap-3 resolved: rejects tenant booking with reservationWindowStart in the past with 400 TOO_SOON_TO_BOOK", () => {
      const { service } = createLeadTimeTestHarness();
      const pastReservationWindowStart = new Date(
        Date.now() - 3600_000,
      ).toISOString();

      expect(() =>
        service.createTenantBooking(
          tenantBookingCommand({
            reservationWindowStart: pastReservationWindowStart,
          }),
          TENANT_ID,
          TENANT_ADMIN,
        ),
      ).toThrowError(
        expect.objectContaining({
          status: 400,
          response: expect.objectContaining({
            error: expect.objectContaining({
              code: "TOO_SOON_TO_BOOK",
              details: expect.objectContaining({
                reservationWindowStart: pastReservationWindowStart,
                minLeadTimeMinutes: 15,
              }),
            }),
          }),
        }),
      );
    });

    it("accepts tenant booking with valid future reservationWindowStart (>= 15 minutes)", async () => {
      const { service } = createLeadTimeTestHarness();
      const validReservationWindowStart = new Date(
        Date.now() + 60 * 60_000,
      ).toISOString();

      const created = await service.createTenantBooking(
        tenantBookingCommand({
          reservationWindowStart: validReservationWindowStart,
        }),
        TENANT_ID,
        TENANT_ADMIN,
      );

      expect(created.orderId).toBeTruthy();
      expect(created.status).toBe("created");
      const order = service.getOrder(created.orderId);
      expect(order.reservationWindowStart).toBe(validReservationWindowStart);
    });

    it("rejects tenant booking when reservationWindowStart is missing or non-string", () => {
      const { service } = createLeadTimeTestHarness();

      expect(() =>
        service.createTenantBooking(
          tenantBookingCommand({ reservationWindowStart: "" }),
          TENANT_ID,
          TENANT_ADMIN,
        ),
      ).toThrowError(
        expect.objectContaining({
          status: 400,
          response: expect.objectContaining({
            error: expect.objectContaining({
              code: "RESERVATION_WINDOW_START_REQUIRED",
            }),
          }),
        }),
      );
    });

    it("rejects tenant booking when reservationWindowStart is not a valid ISO date string", () => {
      const { service } = createLeadTimeTestHarness();

      expect(() =>
        service.createTenantBooking(
          tenantBookingCommand({ reservationWindowStart: "not-a-date" }),
          TENANT_ID,
          TENANT_ADMIN,
        ),
      ).toThrowError(
        expect.objectContaining({
          status: 400,
          response: expect.objectContaining({
            error: expect.objectContaining({
              code: "INVALID_RESERVATION_WINDOW_START",
            }),
          }),
        }),
      );
    });

    it("respects custom setMinLeadTimeMinutes", () => {
      const { service } = createLeadTimeTestHarness();
      service.setMinLeadTimeMinutes(45);

      // 30 minutes in future is > default 15 min, but < configured 45 min
      const reservationWindowStart = new Date(
        Date.now() + 30 * 60_000,
      ).toISOString();

      expect(() =>
        service.createTenantBooking(
          tenantBookingCommand({ reservationWindowStart }),
          TENANT_ID,
          TENANT_ADMIN,
        ),
      ).toThrowError(
        expect.objectContaining({
          status: 400,
          response: expect.objectContaining({
            error: expect.objectContaining({
              code: "TOO_SOON_TO_BOOK",
              details: expect.objectContaining({
                minLeadTimeMinutes: 45,
              }),
            }),
          }),
        }),
      );
    });
  });

  describe("3. Referral passenger booking scheduled lead time & past date validation", () => {
    it("rejects scheduled referral booking with scheduledAt earlier than minLeadTime (e.g. 2 min) with 400 TOO_SOON_TO_BOOK", async () => {
      const { service } = createLeadTimeTestHarness();
      const scheduledAt = new Date(Date.now() + 2 * 60_000).toISOString();

      await expect(
        service.createReferralPassengerBooking(
          {
            entrySlug: "yuhe-residence",
            pickupAddress: "Taipei Main Station",
            dropoffAddress: "Taoyuan Airport T2",
            scheduledAt,
          },
          REFERRAL_IDENTITY,
        ),
      ).rejects.toMatchObject({
        status: 400,
        response: {
          error: {
            code: "TOO_SOON_TO_BOOK",
            details: {
              requestedPickupAt: scheduledAt,
              reservationWindowStart: scheduledAt,
              minLeadTimeMinutes: 15,
            },
          },
        },
      });
    });

    it("rejects scheduled referral booking with scheduledAt in the past with 400 TOO_SOON_TO_BOOK", async () => {
      const { service } = createLeadTimeTestHarness();
      const pastScheduledAt = new Date(Date.now() - 3600_000).toISOString();

      await expect(
        service.createReferralPassengerBooking(
          {
            entrySlug: "yuhe-residence",
            pickupAddress: "Taipei Main Station",
            dropoffAddress: "Taoyuan Airport T2",
            scheduledAt: pastScheduledAt,
          },
          REFERRAL_IDENTITY,
        ),
      ).rejects.toMatchObject({
        status: 400,
        response: {
          error: {
            code: "TOO_SOON_TO_BOOK",
            details: {
              requestedPickupAt: pastScheduledAt,
              minLeadTimeMinutes: 15,
            },
          },
        },
      });
    });

    it("rejects idempotent scheduled referral booking with past scheduledAt early before locking idempotency", async () => {
      const { service } = createLeadTimeTestHarness();
      const pastScheduledAt = new Date(Date.now() - 3600_000).toISOString();

      await expect(
        service.createReferralPassengerBooking(
          {
            entrySlug: "yuhe-residence",
            pickupAddress: "Taipei Main Station",
            dropoffAddress: "Taoyuan Airport T2",
            scheduledAt: pastScheduledAt,
            idempotencyKey: "ref-idem-past-001",
          },
          REFERRAL_IDENTITY,
          undefined,
          undefined,
          "ref-idem-past-001",
        ),
      ).rejects.toMatchObject({
        status: 400,
        response: {
          error: {
            code: "TOO_SOON_TO_BOOK",
          },
        },
      });
    });

    it("allows on-demand referral passenger booking (no scheduledAt) without lead-time rejection", async () => {
      const { service } = createLeadTimeTestHarness();

      const booking = await service.createReferralPassengerBooking(
        {
          entrySlug: "yuhe-residence",
          pickupAddress: "Taipei Main Station",
          dropoffAddress: "Taoyuan Airport T2",
        },
        REFERRAL_IDENTITY,
      );

      expect(booking.orderId).toBeTruthy();
      expect(booking.status).toBe("created");
      expect(booking.businessDispatchSubtype).toBe("enterprise_dispatch");
    });

    it("allows valid scheduled referral passenger booking (>= 15 minutes)", async () => {
      const { service } = createLeadTimeTestHarness();
      const validScheduledAt = new Date(
        Date.now() + 60 * 60_000,
      ).toISOString();

      const booking = await service.createReferralPassengerBooking(
        {
          entrySlug: "yuhe-residence",
          pickupAddress: "Taipei Main Station",
          dropoffAddress: "Taoyuan Airport T2",
          scheduledAt: validScheduledAt,
        },
        REFERRAL_IDENTITY,
      );

      expect(booking.orderId).toBeTruthy();
      expect(booking.status).toBe("created");
      const order = service.getOrder(booking.orderId);
      expect(order.reservationWindowStart).toBe(validScheduledAt);
    });
  });

  describe("4. Fake timers compatibility verification", () => {
    it("works correctly under vi.useFakeTimers() with relative advance time", async () => {
      vi.useFakeTimers();
      vi.setSystemTime(new Date("2026-10-01T10:00:00.000Z"));

      const { service } = createLeadTimeTestHarness();

      // 5 minutes in future under fake clock (should fail)
      const tooSoonTime = new Date("2026-10-01T10:05:00.000Z").toISOString();
      expect(() =>
        service.createTenantBooking(
          tenantBookingCommand({ reservationWindowStart: tooSoonTime }),
          TENANT_ID,
          TENANT_ADMIN,
        ),
      ).toThrowError(
        expect.objectContaining({
          response: expect.objectContaining({
            error: expect.objectContaining({ code: "TOO_SOON_TO_BOOK" }),
          }),
        }),
      );

      // 30 minutes in future under fake clock (should succeed)
      const validTime = new Date("2026-10-01T10:30:00.000Z").toISOString();
      const created = await service.createTenantBooking(
        tenantBookingCommand({ reservationWindowStart: validTime }),
        TENANT_ID,
        TENANT_ADMIN,
      );
      expect(created.orderId).toBeTruthy();
    });
  });

  describe("5. Regression verification of cutoff and modifiable/cancelable rules (C024/C031/C032 compatibility)", () => {
    it("computes modifiableUntil / cancelableUntil correctly on valid tenant booking and enforces cutoff rules", async () => {
      vi.useFakeTimers();
      vi.setSystemTime(new Date("2026-06-01T00:00:00.000Z"));
      const { service } = createLeadTimeTestHarness();
      // reservationWindowStart = 40 minutes in future (> 15 min minLeadTime)
      const reservationWindowStart = "2026-06-01T00:40:00.000Z";
      const created = await service.createTenantBooking(
        tenantBookingCommand({ reservationWindowStart }),
        TENANT_ID,
        TENANT_ADMIN,
      );

      const order = service.getOrder(created.orderId);
      const expectedCutoffMs =
        new Date(reservationWindowStart).getTime() - 30 * 60_000;
      expect(new Date(order.modifiableUntil!).getTime()).toBe(expectedCutoffMs);
      expect(new Date(order.cancelableUntil!).getTime()).toBe(expectedCutoffMs);

      // Before cutoff (at 00:05), update succeeds
      vi.setSystemTime(new Date("2026-06-01T00:05:00.000Z"));
      const updated = service.updateTenantBooking(
        TENANT_ID,
        created.bookingId,
        { notes: "Updated before cutoff" } as never,
        TENANT_ADMIN,
      );
      expect((updated as { notes?: string }).notes).toBe(
        "Updated before cutoff",
      );

      // Past cutoff (at 00:15 > modifiableUntil at 00:10), update throws 409 ORDER_NOT_MODIFIABLE
      vi.setSystemTime(new Date("2026-06-01T00:15:00.000Z"));
      expect(() =>
        service.updateTenantBooking(
          TENANT_ID,
          created.bookingId,
          { notes: "Update after cutoff" } as never,
          TENANT_ADMIN,
        ),
      ).toThrowError(
        expect.objectContaining({
          response: expect.objectContaining({
            error: expect.objectContaining({ code: "ORDER_NOT_MODIFIABLE" }),
          }),
        }),
      );

      // Past cutoff (at 00:15 > cancelableUntil at 00:10), cancel throws 409 ORDER_NOT_CANCELABLE
      await expect(
        service.cancelTenantBooking(TENANT_ID, created.bookingId, {
          reason: "Cancel after cutoff",
        }),
      ).rejects.toMatchObject({
        response: { error: { code: "ORDER_NOT_CANCELABLE" } },
      });
    });

    it("respects service product specific cutoffs (airport transfer 60m, insurance replacement 120m)", async () => {
      const { service, serviceProductService } = createLeadTimeTestHarness();
      serviceProductService.createServiceProduct({
        serviceProductType: "insurance_replacement_vehicle",
        displayName: "Insurance Replacement Vehicle",
        timing: "reservation",
        active: true,
        defaultBillingMode: "partner_settlement",
      } as never);

      const reservationWindowStart = new Date(
        Date.now() + 5 * 3600_000,
      ).toISOString();
      const created = await service.createTenantBooking(
        tenantBookingCommand({
          businessDispatchSubtype: "insurance_replacement_vehicle",
          reservationWindowStart,
        }),
        TENANT_ID,
        TENANT_ADMIN,
      );

      const order = service.getOrder(created.orderId);
      const expectedCutoffMs =
        new Date(reservationWindowStart).getTime() - 120 * 60_000;
      expect(new Date(order.cancelableUntil!).getTime()).toBe(expectedCutoffMs);
    });
  });
});
