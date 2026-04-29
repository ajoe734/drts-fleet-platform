import { EventEmitter2 } from "@nestjs/event-emitter";
import { afterEach, describe, expect, it, vi } from "vitest";

import {
  QUEUE_ENTRY_POLICY_MAP,
  ORDER_SOURCE_DISPATCH_SEMANTICS_MAP,
  RESERVATION_HOLD_VALID_TRANSITIONS,
  EXCEPTION_HOLD_REASON_CODES,
} from "@drts/contracts";
import { ApiRequestError } from "../../src/common/api-envelope";
import { OpsDispatchEventsService } from "../../src/common/ops-dispatch-events.service";
import { AuditNotificationService } from "../../src/modules/audit-notification/audit-notification.service";
import { OwnedMobilityTaskEventsService } from "../../src/modules/owned-mobility/owned-mobility-task-events.service";
import { OwnedMobilityService } from "../../src/modules/owned-mobility/owned-mobility.service";
import { TenantPartnerService } from "../../src/modules/tenant-partner/tenant-partner.service";

const SAMPLE_PROOF_PHOTO = "cHJvb2YtcGhvdG8tMDAx";

function createOwnedMobilityService(options?: {
  candidates?: Array<{
    driverId: string;
    vehicleId: string;
    etaMinutes: number;
    operatingArea: string;
    serviceBuckets: string[];
  }>;
  vehicleDispatchable?: boolean;
  tenantPartnerService?: TenantPartnerService;
}) {
  const regulatoryRegistryService = {
    getEligibleCandidates: vi.fn(() => options?.candidates ?? []),
    getVehicleDispatchability: vi.fn(
      () => options?.vehicleDispatchable ?? true,
    ),
    getDriverAvailability: vi.fn(() => true),
  };
  const auditNotificationService = {
    recordNotification: vi.fn(),
    recordAuditLog: vi.fn(),
  };
  const callcenterService = {
    registerRecordingAttachmentListener: vi.fn(),
  };
  const taskEventsService = new OwnedMobilityTaskEventsService(
    new EventEmitter2(),
  );
  const opsDispatchEventsService = new OpsDispatchEventsService(
    new EventEmitter2(),
  );

  const service = new OwnedMobilityService(
    regulatoryRegistryService as never,
    auditNotificationService as never,
    callcenterService as never,
    taskEventsService,
    opsDispatchEventsService,
    undefined,
    options?.tenantPartnerService,
  );

  return {
    service,
    regulatoryRegistryService,
    auditNotificationService,
  };
}

describe("OwnedMobilityService queue and reservation orchestration", () => {
  afterEach(() => {
    vi.useRealTimers();
  });

  it("enforces queue check-in eligibility and keeps stable queue positions", () => {
    const { service } = createOwnedMobilityService({
      vehicleDispatchable: true,
    });

    const firstEntry = service.queueCheckIn({
      vehicleId: "vehicle-001",
      siteId: "north-station",
    });
    const duplicateEntry = service.queueCheckIn({
      vehicleId: "vehicle-001",
      siteId: "north-station",
    });
    const secondEntry = service.queueCheckIn({
      vehicleId: "vehicle-002",
      siteId: "north-station",
    });

    expect(firstEntry.position).toBe(1);
    expect(duplicateEntry).toEqual(firstEntry);
    expect(secondEntry.position).toBe(2);
  });

  it("rejects queue check-in when the vehicle is not dispatchable", () => {
    const { service } = createOwnedMobilityService({
      vehicleDispatchable: false,
    });

    expect(() =>
      service.queueCheckIn({
        vehicleId: "vehicle-blocked",
        siteId: "north-station",
      }),
    ).toThrowError(ApiRequestError);

    try {
      service.queueCheckIn({
        vehicleId: "vehicle-blocked",
        siteId: "north-station",
      });
    } catch (error) {
      expect((error as ApiRequestError).getResponse()).toMatchObject({
        error: {
          code: "VEHICLE_NOT_DISPATCHABLE",
        },
      });
    }
  });

  it("resolves tenant booking passenger and addresses from governed master data", () => {
    vi.useFakeTimers();
    vi.setSystemTime(new Date("2026-04-29T12:00:00.000Z"));
    const tenantPartnerService = new TenantPartnerService(
      new AuditNotificationService(),
    );
    const passenger = tenantPartnerService.upsertPassenger("tenant-demo-001", {
      passengerId: "passenger-master-001",
      fullName: "王小美",
      mobile: "0911222333",
      roles: ["employee", "passenger"],
      employeeNo: "EMP-001",
    });
    const pickupAddress = tenantPartnerService.upsertAddress(
      "tenant-demo-001",
      {
        addressId: "address-master-pickup-001",
        ownerPassengerId: passenger.passengerId,
        addressName: "Acme HQ",
        addressText: "台北市信義區市府路 1 號",
        geocodeSource: "provider",
        lat: 25.0375,
        lng: 121.5637,
      },
    );
    const dropoffAddress = tenantPartnerService.upsertAddress(
      "tenant-demo-001",
      {
        addressId: "address-master-dropoff-001",
        ownerPassengerId: passenger.passengerId,
        addressName: "Airport T1",
        addressText: "桃園市大園區航站南路 9 號",
        sensitiveFlag: true,
        geocodeSource: "manual",
        lat: 25.0777,
        lng: 121.2328,
      },
    );
    const { service } = createOwnedMobilityService({
      candidates: [],
      tenantPartnerService,
    });

    const booking = service.createTenantBooking(
      {
        businessDispatchSubtype: "enterprise_dispatch",
        passengerId: passenger.passengerId,
        pickupAddressId: pickupAddress.addressId,
        dropoffAddressId: dropoffAddress.addressId,
        reservationWindowStart: "2026-04-29T14:00:00.000Z",
        reservationWindowEnd: "2026-04-29T15:00:00.000Z",
        pickup: { address: "ignored pickup" },
        dropoff: { address: "ignored dropoff" },
        passenger: { name: "ignored passenger", phone: "0900000000" },
      },
      "tenant-demo-001",
    );

    const created = service.getTenantBooking(
      "tenant-demo-001",
      booking.bookingId,
    );
    expect(created.passenger).toMatchObject({
      passengerId: passenger.passengerId,
      name: passenger.fullName,
      phone: passenger.mobile,
      roles: passenger.roles,
    });
    expect(created.quotedFareSource).toBe("platform_pricing_rule");
    expect(created.quotedFareRuleVersion).toBe(
      "enterprise_dispatch.default.v1",
    );
    expect(created.pickup).toMatchObject({
      addressId: pickupAddress.addressId,
      addressName: pickupAddress.addressName,
      address: pickupAddress.addressText,
      normalizedAddress: pickupAddress.normalizedAddressText,
      maskedAddress: pickupAddress.maskedAddressText,
    });
    expect(created.dropoff).toMatchObject({
      addressId: dropoffAddress.addressId,
      sensitive: true,
      maskedAddress: dropoffAddress.maskedAddressText,
    });

    const updatedPassenger = tenantPartnerService.upsertPassenger(
      "tenant-demo-001",
      {
        passengerId: "passenger-master-002",
        fullName: "李大華",
        mobile: "0922333444",
        roles: ["vip", "passenger"],
      },
    );
    const updated = service.updateTenantBooking(
      "tenant-demo-001",
      booking.bookingId,
      {
        passengerId: updatedPassenger.passengerId,
        pickup: {
          address: "台北市中山區南京東路 100 號",
          addressName: "Manual Override",
        },
      },
    );
    expect(updated.passenger).toMatchObject({
      passengerId: updatedPassenger.passengerId,
      name: updatedPassenger.fullName,
      phone: updatedPassenger.mobile,
    });
    expect(updated.pickup).toMatchObject({
      addressId: null,
      addressName: "Manual Override",
      address: "台北市中山區南京東路 100 號",
    });
  });

  it("rejects tenant attempts to set quoted fare through booking channels", () => {
    const { service } = createOwnedMobilityService({
      candidates: [],
    });

    expect(() =>
      service.createTenantBooking(
        {
          businessDispatchSubtype: "enterprise_dispatch",
          reservationWindowStart: "2026-04-29T14:00:00.000Z",
          reservationWindowEnd: "2026-04-29T15:00:00.000Z",
          pickup: { address: "Pickup" },
          dropoff: { address: "Dropoff" },
          passenger: { name: "Rider One", phone: "0912000000" },
          quotedFare: {
            currency: "NTD",
            amountMinor: 99000,
          },
        },
        "tenant-demo-001",
        {
          actorType: "tenant_admin",
        } as never,
      ),
    ).toThrowError(ApiRequestError);

    try {
      service.createTenantBooking(
        {
          businessDispatchSubtype: "enterprise_dispatch",
          reservationWindowStart: "2026-04-29T14:00:00.000Z",
          reservationWindowEnd: "2026-04-29T15:00:00.000Z",
          pickup: { address: "Pickup" },
          dropoff: { address: "Dropoff" },
          passenger: { name: "Rider One", phone: "0912000000" },
          quotedFare: {
            currency: "NTD",
            amountMinor: 99000,
          },
        },
        "tenant-demo-001",
        {
          actorType: "tenant_admin",
        } as never,
      );
    } catch (error) {
      expect((error as ApiRequestError).getResponse()).toMatchObject({
        error: {
          code: "PRICING_AUTHORITY_FORBIDDEN",
        },
      });
    }
  });

  it("requires actor, reason, and trace for manual fare override and writes trace evidence", () => {
    const { service, auditNotificationService } = createOwnedMobilityService({
      candidates: [],
    });
    const booking = service.createTenantBooking(
      {
        businessDispatchSubtype: "enterprise_dispatch",
        reservationWindowStart: "2026-04-29T14:00:00.000Z",
        reservationWindowEnd: "2026-04-29T15:00:00.000Z",
        pickup: { address: "Pickup" },
        dropoff: { address: "Dropoff" },
        passenger: { name: "Rider One", phone: "0912000000" },
      },
      "tenant-demo-001",
      {
        actorType: "tenant_admin",
      } as never,
    );

    const overridden = service.applyManualFareOverride(
      booking.orderId,
      {
        fare: {
          currency: "NTD",
          amountMinor: 188000,
        },
        reason: "Airport surge approval",
        traceId: "trace-fare-override-001",
      },
      {
        actorType: "ops_user",
        actorId: "ops-007",
      } as never,
      "req-override-001",
    );

    expect(overridden.quotedFare).toEqual({
      currency: "NTD",
      amountMinor: 188000,
    });
    expect(overridden.quotedFareSource).toBe("ops_manual_override");
    expect(overridden.manualFareOverride).toMatchObject({
      actorType: "ops_user",
      actorId: "ops-007",
      reason: "Airport surge approval",
      traceId: "trace-fare-override-001",
      previousQuotedFareSource: "platform_pricing_rule",
    });
    expect(service.listDispatchTrace(booking.orderId)).toEqual(
      expect.arrayContaining([
        expect.objectContaining({
          eventType: "pricing.manual_override",
          details: expect.objectContaining({
            actorId: "ops-007",
            traceId: "trace-fare-override-001",
          }),
        }),
      ]),
    );
    expect(auditNotificationService.recordAuditLog).toHaveBeenCalledWith(
      expect.objectContaining({
        actionName: "manual_fare_override",
        actorId: "ops-007",
        requestId: "req-override-001",
      }),
    );
  });

  it("rejects manual fare override after a fixed-price order is completed", () => {
    vi.useFakeTimers();
    vi.setSystemTime(new Date("2026-04-29T12:00:00.000Z"));
    const { service } = createOwnedMobilityService({
      candidates: [
        {
          driverId: "driver-001",
          vehicleId: "vehicle-001",
          etaMinutes: 5,
          operatingArea: "north",
          serviceBuckets: ["business_dispatch"],
        },
      ],
    });

    const booking = service.createTenantBooking(
      {
        businessDispatchSubtype: "enterprise_dispatch",
        reservationWindowStart: "2026-04-29T14:00:00.000Z",
        reservationWindowEnd: "2026-04-29T15:00:00.000Z",
        pickup: { address: "Pickup" },
        dropoff: { address: "Dropoff" },
        passenger: { name: "Rider One", phone: "0912000000" },
      },
      "tenant-demo-001",
    );

    const dispatchResult = service.dispatchOrder(booking.orderId, {
      mode: "auto",
    });
    const assignment = service.assignDispatch({
      dispatchJobId: dispatchResult.dispatchJobId,
      vehicleId: "vehicle-001",
      driverId: "driver-001",
    });
    service.acceptDriverTask(assignment.taskId, {
      acceptedAt: "2026-04-29T12:05:00.000Z",
    });
    service.departDriverTask(assignment.taskId, {
      departedAt: "2026-04-29T12:10:00.000Z",
    });
    service.arrivedPickup(assignment.taskId, {
      arrivedAt: "2026-04-29T12:20:00.000Z",
    });
    service.startDriverTask(assignment.taskId, {
      startedAt: "2026-04-29T12:25:00.000Z",
    });
    service.completeDriverTask(assignment.taskId, {
      completedAt: "2026-04-29T12:45:00.000Z",
      actualDistanceKm: 14.2,
      actualDurationSec: 1200,
      proof: {
        photos: [SAMPLE_PROOF_PHOTO],
      },
    });

    expect(() =>
      service.applyManualFareOverride(
        booking.orderId,
        {
          fare: {
            currency: "NTD",
            amountMinor: 188000,
          },
          reason: "Late override after close",
          traceId: "trace-fare-override-closed-001",
        },
        {
          actorType: "ops_user",
          actorId: "ops-007",
        } as never,
      ),
    ).toThrowError(ApiRequestError);

    try {
      service.applyManualFareOverride(
        booking.orderId,
        {
          fare: {
            currency: "NTD",
            amountMinor: 188000,
          },
          reason: "Late override after close",
          traceId: "trace-fare-override-closed-001",
        },
        {
          actorType: "ops_user",
          actorId: "ops-007",
        } as never,
      );
    } catch (error) {
      expect((error as ApiRequestError).getResponse()).toMatchObject({
        error: {
          code: "MANUAL_FARE_OVERRIDE_CLOSED_ORDER",
        },
      });
    }
  });

  it("keeps reservation orders in redispatch queue before the confirmation window", () => {
    vi.useFakeTimers();
    vi.setSystemTime(new Date("2026-04-29T12:00:00.000Z"));
    const { service, auditNotificationService } = createOwnedMobilityService({
      candidates: [],
    });

    const booking = service.createTenantBooking(
      {
        businessDispatchSubtype: "enterprise_dispatch",
        reservationWindowStart: "2026-04-29T14:00:00.000Z",
        reservationWindowEnd: "2026-04-29T15:00:00.000Z",
        pickup: { address: "Pickup" },
        dropoff: { address: "Dropoff" },
        passenger: { name: "Rider One", phone: "0912000000" },
      },
      "tenant-demo-001",
    );

    const dispatchResult = service.dispatchOrder(booking.orderId, {
      mode: "auto",
    });
    const order = service.getOrder(booking.orderId);
    const trace = service.listDispatchTrace(booking.orderId);

    expect(booking.dispatchSemantics).toBe("reservation");
    expect(order.status).toBe("redispatch_required");
    expect(order.reservationHoldStatus).toBe("redispatch_queue");
    expect(dispatchResult.status).toBe("queued");
    expect(trace).toEqual(
      expect.arrayContaining([
        expect.objectContaining({
          eventType: "queue.entry.created",
          details: expect.objectContaining({
            queueType: "redispatch",
            reasonCode: "no_eligible_supply",
          }),
        }),
      ]),
    );
    expect(auditNotificationService.recordNotification).toHaveBeenCalledTimes(
      2,
    );
  });

  it("escalates reservation orders to exception hold inside the confirmation window", () => {
    vi.useFakeTimers();
    vi.setSystemTime(new Date("2026-04-29T12:00:00.000Z"));
    const { service } = createOwnedMobilityService({
      candidates: [],
    });

    const booking = service.createTenantBooking(
      {
        businessDispatchSubtype: "enterprise_dispatch",
        reservationWindowStart: "2026-04-29T12:20:00.000Z",
        reservationWindowEnd: "2026-04-29T13:00:00.000Z",
        pickup: { address: "Pickup" },
        dropoff: { address: "Dropoff" },
        passenger: { name: "Rider One", phone: "0912000000" },
      },
      "tenant-demo-001",
    );

    const dispatchResult = service.dispatchOrder(booking.orderId, {
      mode: "auto",
    });
    const order = service.getOrder(booking.orderId);
    const trace = service.listDispatchTrace(booking.orderId);

    expect(order.status).toBe("exception_hold");
    expect(order.reservationHoldStatus).toBe("exception_hold");
    expect(dispatchResult.status).toBe("failed");
    expect(trace).toEqual(
      expect.arrayContaining([
        expect.objectContaining({
          eventType: "order.exception_hold",
          details: expect.objectContaining({
            reasonCode: "no_eligible_supply",
            exceptionHoldCriteria: expect.objectContaining({
              isReservation: true,
              isWithinConfirmationWindow: true,
              hasEligibleSupply: false,
            }),
          }),
        }),
      ]),
    );
  });

  it("escalates redispatch queue with confirmation_window_expired once the window opens", () => {
    vi.useFakeTimers();
    vi.setSystemTime(new Date("2026-04-29T12:00:00.000Z"));
    const { service } = createOwnedMobilityService({
      candidates: [],
    });

    const booking = service.createTenantBooking(
      {
        businessDispatchSubtype: "enterprise_dispatch",
        reservationWindowStart: "2026-04-29T13:00:00.000Z",
        reservationWindowEnd: "2026-04-29T14:00:00.000Z",
        pickup: { address: "Pickup" },
        dropoff: { address: "Dropoff" },
        passenger: { name: "Rider One", phone: "0912000000" },
      },
      "tenant-demo-001",
    );

    const firstAttempt = service.dispatchOrder(booking.orderId, {
      mode: "auto",
    });
    expect(firstAttempt.status).toBe("queued");

    vi.setSystemTime(new Date("2026-04-29T12:35:00.000Z"));
    const secondAttempt = service.dispatchOrder(booking.orderId, {
      mode: "auto",
    });
    const order = service.getOrder(booking.orderId);
    const trace = service.listDispatchTrace(booking.orderId);

    expect(secondAttempt.status).toBe("failed");
    expect(order.status).toBe("exception_hold");
    expect(order.reservationHoldStatus).toBe("exception_hold");
    expect(trace).toEqual(
      expect.arrayContaining([
        expect.objectContaining({
          eventType: "order.exception_hold",
          details: expect.objectContaining({
            reasonCode: "confirmation_window_expired",
          }),
        }),
      ]),
    );
  });

  it("resolves exception hold by releasing order to dispatch", () => {
    vi.useFakeTimers();
    vi.setSystemTime(new Date("2026-04-29T12:00:00.000Z"));
    const { service } = createOwnedMobilityService({
      candidates: [],
    });

    const booking = service.createTenantBooking(
      {
        businessDispatchSubtype: "enterprise_dispatch",
        reservationWindowStart: "2026-04-29T12:20:00.000Z",
        reservationWindowEnd: "2026-04-29T13:00:00.000Z",
        pickup: { address: "Pickup" },
        dropoff: { address: "Dropoff" },
        passenger: { name: "Rider One", phone: "0912000000" },
      },
      "tenant-demo-001",
    );

    service.dispatchOrder(booking.orderId, { mode: "auto" });
    const heldOrder = service.getOrder(booking.orderId);
    expect(heldOrder.status).toBe("exception_hold");

    const resolvedOrder = service.resolveExceptionHold(booking.orderId, {
      resolution: "release_to_dispatch",
      operatorId: "ops-user-001",
      reason: "Supply confirmed manually",
    });

    expect(resolvedOrder.status).toBe("ready_for_dispatch");
    expect(resolvedOrder.reservationHoldStatus).toBe("requested");

    const trace = service.listDispatchTrace(booking.orderId);
    expect(trace).toEqual(
      expect.arrayContaining([
        expect.objectContaining({
          eventType: "exception_hold.resolved.release",
          details: expect.objectContaining({
            operatorId: "ops-user-001",
            resolution: "release_to_dispatch",
          }),
        }),
      ]),
    );
  });

  it("re-enters requested hold before redispatch after exception hold release", () => {
    vi.useFakeTimers();
    vi.setSystemTime(new Date("2026-04-29T12:00:00.000Z"));
    const { service } = createOwnedMobilityService({
      candidates: [],
    });

    const booking = service.createTenantBooking(
      {
        businessDispatchSubtype: "enterprise_dispatch",
        reservationWindowStart: "2026-04-29T12:20:00.000Z",
        reservationWindowEnd: "2026-04-29T13:00:00.000Z",
        pickup: { address: "Pickup" },
        dropoff: { address: "Dropoff" },
        passenger: { name: "Rider One", phone: "0912000000" },
      },
      "tenant-demo-001",
    );

    service.dispatchOrder(booking.orderId, { mode: "auto" });
    service.resolveExceptionHold(booking.orderId, {
      resolution: "release_to_dispatch",
      operatorId: "ops-user-001",
      reason: "Retry dispatch",
    });

    const redispatchResult = service.dispatchOrder(booking.orderId, {
      mode: "auto",
    });
    const order = service.getOrder(booking.orderId);

    expect(redispatchResult.status).toBe("failed");
    expect(order.status).toBe("exception_hold");
    expect(order.reservationHoldStatus).toBe("exception_hold");
  });

  it("allows dispatch assignment after release_to_dispatch without invalid hold transitions", () => {
    vi.useFakeTimers();
    vi.setSystemTime(new Date("2026-04-29T12:00:00.000Z"));
    const candidates = [
      {
        driverId: "driver-009",
        vehicleId: "vehicle-009",
        etaMinutes: 4,
        operatingArea: "north",
        serviceBuckets: ["business_dispatch"],
      },
    ];
    const { service, regulatoryRegistryService } = createOwnedMobilityService({
      candidates: [],
    });

    const booking = service.createTenantBooking(
      {
        businessDispatchSubtype: "enterprise_dispatch",
        reservationWindowStart: "2026-04-29T12:20:00.000Z",
        reservationWindowEnd: "2026-04-29T13:00:00.000Z",
        pickup: { address: "Pickup" },
        dropoff: { address: "Dropoff" },
        passenger: { name: "Rider One", phone: "0912000000" },
      },
      "tenant-demo-001",
    );

    service.dispatchOrder(booking.orderId, { mode: "auto" });
    service.resolveExceptionHold(booking.orderId, {
      resolution: "release_to_dispatch",
      operatorId: "ops-user-001",
      reason: "Retry dispatch after manual confirmation",
    });

    regulatoryRegistryService.getEligibleCandidates.mockReturnValue(candidates);

    const redispatchResult = service.dispatchOrder(booking.orderId, {
      mode: "auto",
    });
    expect(redispatchResult.status).toBe("reserved");

    const assignment = service.assignDispatch({
      dispatchJobId: redispatchResult.dispatchJobId,
      vehicleId: "vehicle-009",
      driverId: "driver-009",
    });
    const order = service.getOrder(booking.orderId);

    expect(assignment.status).toBe("assigned");
    expect(order.status).toBe("assigned");
    expect(order.reservationHoldStatus).toBe("released");
  });

  it("resolves exception hold by cancelling the order", () => {
    vi.useFakeTimers();
    vi.setSystemTime(new Date("2026-04-29T12:00:00.000Z"));
    const { service } = createOwnedMobilityService({
      candidates: [],
    });

    const booking = service.createTenantBooking(
      {
        businessDispatchSubtype: "enterprise_dispatch",
        reservationWindowStart: "2026-04-29T12:20:00.000Z",
        reservationWindowEnd: "2026-04-29T13:00:00.000Z",
        pickup: { address: "Pickup" },
        dropoff: { address: "Dropoff" },
        passenger: { name: "Rider One", phone: "0912000000" },
      },
      "tenant-demo-001",
    );

    service.dispatchOrder(booking.orderId, { mode: "auto" });

    const cancelledOrder = service.resolveExceptionHold(booking.orderId, {
      resolution: "cancel_order",
      operatorId: "ops-user-002",
      reason: "No supply available, rider notified",
    });

    expect(cancelledOrder.status).toBe("cancelled");
    expect(cancelledOrder.reservationHoldStatus).toBe("released");
  });

  it("rejects resolveExceptionHold on orders not in exception hold", () => {
    const { service } = createOwnedMobilityService();

    const order = service.createPassengerOrder({
      pickup: { address: "A" },
      dropoff: { address: "B" },
      passenger: { name: "Test", phone: "0911111111" },
    });

    expect(() =>
      service.resolveExceptionHold(order.orderId, {
        resolution: "release_to_dispatch",
        operatorId: "ops-001",
        reason: "test",
      }),
    ).toThrowError(ApiRequestError);

    try {
      service.resolveExceptionHold(order.orderId, {
        resolution: "release_to_dispatch",
        operatorId: "ops-001",
        reason: "test",
      });
    } catch (error) {
      expect((error as ApiRequestError).getResponse()).toMatchObject({
        error: {
          code: "ORDER_NOT_IN_EXCEPTION_HOLD",
        },
      });
    }
  });

  it("releases reservation hold on assignment and traces it", () => {
    vi.useFakeTimers();
    vi.setSystemTime(new Date("2026-04-29T12:00:00.000Z"));
    const candidates = [
      {
        driverId: "driver-001",
        vehicleId: "vehicle-001",
        etaMinutes: 5,
        operatingArea: "north",
        serviceBuckets: ["business_dispatch"],
      },
    ];
    const { service } = createOwnedMobilityService({ candidates });

    const booking = service.createTenantBooking(
      {
        businessDispatchSubtype: "enterprise_dispatch",
        reservationWindowStart: "2026-04-29T14:00:00.000Z",
        reservationWindowEnd: "2026-04-29T15:00:00.000Z",
        pickup: { address: "Pickup" },
        dropoff: { address: "Dropoff" },
        passenger: { name: "Rider", phone: "0912000000" },
      },
      "tenant-demo-001",
    );

    const dispatchResult = service.dispatchOrder(booking.orderId, {
      mode: "auto",
    });
    expect(dispatchResult.status).toBe("reserved");

    const assignResult = service.assignDispatch({
      dispatchJobId: dispatchResult.dispatchJobId,
      vehicleId: "vehicle-001",
      driverId: "driver-001",
    });
    expect(assignResult.status).toBe("assigned");

    const orderAfterAssign = service.getOrder(booking.orderId);
    expect(orderAfterAssign.reservationHoldStatus).toBe("released");

    const trace = service.listDispatchTrace(booking.orderId);
    expect(trace).toEqual(
      expect.arrayContaining([
        expect.objectContaining({
          eventType: "reservation.hold.released",
          details: expect.objectContaining({
            reason: "assignment_confirmed",
          }),
        }),
      ]),
    );
  });

  it("releases reservation hold when cancelling from redispatch queue", () => {
    vi.useFakeTimers();
    vi.setSystemTime(new Date("2026-04-29T12:00:00.000Z"));
    const { service } = createOwnedMobilityService({
      candidates: [],
    });

    const booking = service.createTenantBooking(
      {
        businessDispatchSubtype: "enterprise_dispatch",
        reservationWindowStart: "2026-04-29T14:00:00.000Z",
        reservationWindowEnd: "2026-04-29T15:00:00.000Z",
        pickup: { address: "Pickup" },
        dropoff: { address: "Dropoff" },
        passenger: { name: "Rider One", phone: "0912000000" },
      },
      "tenant-demo-001",
    );

    service.dispatchOrder(booking.orderId, { mode: "auto" });
    const cancelledOrder = service.cancelOwnedOrder(booking.orderId, {
      reason: "Rider cancelled",
    });

    expect(cancelledOrder.status).toBe("cancelled");
    expect(cancelledOrder.reservationHoldStatus).toBe("released");

    const trace = service.listDispatchTrace(booking.orderId);
    expect(trace).toEqual(
      expect.arrayContaining([
        expect.objectContaining({
          eventType: "reservation.hold.released",
          details: expect.objectContaining({
            reason: "order_cancelled",
          }),
        }),
      ]),
    );
  });
});

describe("Queue-entry policy and dispatch semantics contracts", () => {
  it("maps all owned order sources to a dispatch semantics", () => {
    const sources = [
      "app",
      "web",
      "phone",
      "portal",
      "api",
      "concierge",
    ] as const;
    for (const source of sources) {
      expect(ORDER_SOURCE_DISPATCH_SEMANTICS_MAP[source]).toBeDefined();
    }
  });

  it("defines queue-entry policy for every dispatch semantics", () => {
    const semantics = [
      "realtime",
      "reservation",
      "queue",
      "forwarder_broadcast",
    ] as const;
    for (const sem of semantics) {
      const policy = QUEUE_ENTRY_POLICY_MAP[sem];
      expect(policy).toBeDefined();
      expect(typeof policy.allowsQueueEntry).toBe("boolean");
      expect(typeof policy.requiresSiteCheckIn).toBe("boolean");
      expect(typeof policy.requiresVehicleDispatchable).toBe("boolean");
    }
  });

  it("does not allow queue entry for reservation or forwarder_broadcast semantics", () => {
    expect(QUEUE_ENTRY_POLICY_MAP.reservation.allowsQueueEntry).toBe(false);
    expect(QUEUE_ENTRY_POLICY_MAP.forwarder_broadcast.allowsQueueEntry).toBe(
      false,
    );
  });

  it("allows queue entry for realtime and queue semantics", () => {
    expect(QUEUE_ENTRY_POLICY_MAP.realtime.allowsQueueEntry).toBe(true);
    expect(QUEUE_ENTRY_POLICY_MAP.queue.allowsQueueEntry).toBe(true);
  });

  it("defines valid reservation hold transitions for all states", () => {
    const statuses = [
      "none",
      "requested",
      "released",
      "redispatch_queue",
      "exception_hold",
    ] as const;
    for (const status of statuses) {
      expect(RESERVATION_HOLD_VALID_TRANSITIONS[status]).toBeDefined();
      expect(Array.isArray(RESERVATION_HOLD_VALID_TRANSITIONS[status])).toBe(
        true,
      );
    }
  });

  it("prevents transitions from terminal states", () => {
    expect(RESERVATION_HOLD_VALID_TRANSITIONS.released).toHaveLength(0);
  });

  it("defines all exception hold reason codes", () => {
    expect(EXCEPTION_HOLD_REASON_CODES).toContain("no_eligible_supply");
    expect(EXCEPTION_HOLD_REASON_CODES).toContain(
      "confirmation_window_expired",
    );
    expect(EXCEPTION_HOLD_REASON_CODES).toContain("driver_rejected_in_window");
    expect(EXCEPTION_HOLD_REASON_CODES).toContain("manual_escalation");
  });
});
