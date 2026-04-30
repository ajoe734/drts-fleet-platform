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
    registerRecordingStateChangeListener: vi.fn(),
    linkOrderToCallSession: vi.fn(
      ({
        callId,
        callType,
        callerPhone,
        agentId,
        linkedOrderId,
        recordingId,
      }) => ({
        callId,
        callType,
        callerPhone,
        agentId,
        linkedOrderId,
        recordingId: recordingId ?? null,
      }),
    ),
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
    expect(heldOrder.exceptionHold).toMatchObject({
      reasonCode: "no_eligible_supply",
      overrideAllowed: true,
      overrideActors: ["ops_user", "platform_admin"],
    });
    expect(heldOrder.queueFamily).toBe("exception_hold_queue");
    expect(heldOrder.queueEntryReason).toBe(
      "exception_hold_no_eligible_supply",
    );

    const resolvedOrder = service.resolveExceptionHold(
      booking.orderId,
      {
        resolution: "release_to_dispatch",
        operatorId: "ops-user-001",
        reason: "Supply confirmed manually",
        traceId: "trace-exception-release-001",
      },
      {
        actorType: "ops_user",
        actorId: "ops-user-001",
      } as never,
    );

    expect(resolvedOrder.status).toBe("ready_for_dispatch");
    expect(resolvedOrder.reservationHoldStatus).toBe("requested");
    expect(resolvedOrder.exceptionHold?.resolution).toMatchObject({
      resolution: "release_to_dispatch",
      actorId: "ops-user-001",
      traceId: "trace-exception-release-001",
    });
    expect(resolvedOrder.queueFamily).toBe("reservation_confirmation_queue");
    expect(resolvedOrder.queueEntryReason).toBe(
      "reservation_confirmation_window_open",
    );

    const trace = service.listDispatchTrace(booking.orderId);
    expect(trace).toEqual(
      expect.arrayContaining([
        expect.objectContaining({
          eventType: "exception_hold.resolved.release",
          details: expect.objectContaining({
            operatorId: "ops-user-001",
            resolution: "release_to_dispatch",
            traceId: "trace-exception-release-001",
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
    service.resolveExceptionHold(
      booking.orderId,
      {
        resolution: "release_to_dispatch",
        operatorId: "ops-user-001",
        reason: "Retry dispatch",
        traceId: "trace-exception-release-002",
      },
      {
        actorType: "ops_user",
        actorId: "ops-user-001",
      } as never,
    );

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
    service.resolveExceptionHold(
      booking.orderId,
      {
        resolution: "release_to_dispatch",
        operatorId: "ops-user-001",
        reason: "Retry dispatch after manual confirmation",
        traceId: "trace-exception-release-003",
      },
      {
        actorType: "ops_user",
        actorId: "ops-user-001",
      } as never,
    );

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

    const cancelledOrder = service.resolveExceptionHold(
      booking.orderId,
      {
        resolution: "cancel_order",
        operatorId: "ops-user-002",
        reason: "No supply available, rider notified",
        traceId: "trace-exception-cancel-001",
      },
      {
        actorType: "ops_user",
        actorId: "ops-user-002",
      } as never,
    );

    expect(cancelledOrder.status).toBe("cancelled");
    expect(cancelledOrder.reservationHoldStatus).toBe("released");
    expect(cancelledOrder.exceptionHold?.resolution).toMatchObject({
      resolution: "cancel_order",
      actorId: "ops-user-002",
      traceId: "trace-exception-cancel-001",
    });
    expect(cancelledOrder.queueFamily).toBeNull();
    expect(cancelledOrder.queueEntryReason).toBeNull();
  });

  it("surfaces queue family and entry reason for realtime, recording, redispatch, and manual-review queues", () => {
    vi.useFakeTimers();
    vi.setSystemTime(new Date("2026-04-29T12:00:00.000Z"));

    const { service } = createOwnedMobilityService();

    const realtimeOrder = service.createPassengerOrder({
      pickup: { address: "Realtime A" },
      dropoff: { address: "Realtime B" },
      passenger: { name: "Realtime Rider", phone: "0911111111" },
    });
    expect(realtimeOrder.queueFamily).toBe("realtime_ready_queue");
    expect(realtimeOrder.queueEntryReason).toBe("realtime_ready_for_dispatch");

    const recordingOrder = service.createCallCenterOrder({
      callId: "call-queue-001",
      agentId: "agent-001",
      pickup: { address: "Phone A" },
      dropoff: { address: "Phone B" },
      passenger: { name: "Phone Rider", phone: "0922000000" },
    });
    expect(recordingOrder.queueFamily).toBe("recording_gate_queue");
    expect(recordingOrder.queueEntryReason).toBe(
      "recording_missing_for_dispatch",
    );

    const reservationBooking = service.createTenantBooking(
      {
        businessDispatchSubtype: "enterprise_dispatch",
        reservationWindowStart: "2026-04-29T14:00:00.000Z",
        reservationWindowEnd: "2026-04-29T15:00:00.000Z",
        pickup: { address: "Reservation A" },
        dropoff: { address: "Reservation B" },
        passenger: { name: "Reservation Rider", phone: "0933000000" },
      },
      "tenant-demo-001",
    );
    service.dispatchOrder(reservationBooking.orderId, { mode: "auto" });
    const redispatchOrder = service.getOrder(reservationBooking.orderId);
    expect(redispatchOrder.queueFamily).toBe("redispatch_priority_queue");
    expect(redispatchOrder.queueEntryReason).toBe("redispatch_retry_required");

    const tenantPartnerService = {
      getPartnerEntry: vi.fn(() => ({
        partnerId: "partner-demo-001",
        programId: "program-demo-001",
        entrySlug: "partner-entry-manual-review",
        tenantId: "tenant-demo-001",
        businessDispatchSubtype: "enterprise_dispatch",
        eligibilityMode: "bank_card_inline",
      })),
      getPartnerEligibilityVerification: vi.fn(() => ({
        eligibilityVerificationId: "elig-review-001",
        tenantId: "tenant-demo-001",
        partnerId: "partner-demo-001",
        partnerProgramId: "program-demo-001",
        partnerEntrySlug: "partner-entry-manual-review",
        verificationStatus: "manual_review",
        expiresAt: null,
      })),
    } as unknown as TenantPartnerService;
    const { service: manualReviewService } = createOwnedMobilityService({
      tenantPartnerService,
    });
    const manualReviewOrder = manualReviewService.createPassengerOrder({
      pickup: { address: "Manual Review A" },
      dropoff: { address: "Manual Review B" },
      passenger: { name: "Manual Review Rider", phone: "0944000000" },
    });
    const rawManualReviewOrder = (
      manualReviewService as unknown as {
        orders: Array<Record<string, unknown>>;
      }
    ).orders[0];
    rawManualReviewOrder.serviceBucket = "business_dispatch";
    rawManualReviewOrder.tenantId = "tenant-demo-001";
    rawManualReviewOrder.partnerEntrySlug = "partner-entry-manual-review";
    rawManualReviewOrder.eligibilityVerificationId = "elig-review-001";

    const queueTaggedManualReviewOrder = manualReviewService.getOrder(
      manualReviewOrder.orderId,
    );
    expect(queueTaggedManualReviewOrder.queueFamily).toBe(
      "manual_review_queue",
    );
    expect(queueTaggedManualReviewOrder.queueEntryReason).toBe(
      "dispatch_manual_review_required",
    );
  });

  it("rejects resolveExceptionHold on orders not in exception hold", () => {
    const { service } = createOwnedMobilityService();

    const order = service.createPassengerOrder({
      pickup: { address: "A" },
      dropoff: { address: "B" },
      passenger: { name: "Test", phone: "0911111111" },
    });

    expect(() =>
      service.resolveExceptionHold(
        order.orderId,
        {
          resolution: "release_to_dispatch",
          operatorId: "ops-001",
          reason: "test",
          traceId: "trace-exception-invalid-001",
        },
        {
          actorType: "ops_user",
          actorId: "ops-001",
        } as never,
      ),
    ).toThrowError(ApiRequestError);

    try {
      service.resolveExceptionHold(
        order.orderId,
        {
          resolution: "release_to_dispatch",
          operatorId: "ops-001",
          reason: "test",
          traceId: "trace-exception-invalid-001",
        },
        {
          actorType: "ops_user",
          actorId: "ops-001",
        } as never,
      );
    } catch (error) {
      expect((error as ApiRequestError).getResponse()).toMatchObject({
        error: {
          code: "ORDER_NOT_IN_EXCEPTION_HOLD",
        },
      });
    }
  });

  it("rejects resolveExceptionHold without authenticated identity even when operatorId is provided", () => {
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

    expect(() =>
      service.resolveExceptionHold(booking.orderId, {
        resolution: "release_to_dispatch",
        operatorId: "ops-user-001",
        reason: "Attempt without identity",
        traceId: "trace-exception-forbidden-001",
      }),
    ).toThrowError(ApiRequestError);

    try {
      service.resolveExceptionHold(booking.orderId, {
        resolution: "release_to_dispatch",
        operatorId: "ops-user-001",
        reason: "Attempt without identity",
        traceId: "trace-exception-forbidden-001",
      });
    } catch (error) {
      expect((error as ApiRequestError).getResponse()).toMatchObject({
        error: {
          code: "EXCEPTION_HOLD_OVERRIDE_FORBIDDEN",
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

  it("keeps reassign distinct from redispatch by rotating assignment inside the same dispatch job", () => {
    const candidates = [
      {
        driverId: "driver-001",
        vehicleId: "vehicle-001",
        etaMinutes: 5,
        operatingArea: "north",
        serviceBuckets: ["standard_taxi"],
      },
    ];
    const { service, auditNotificationService } = createOwnedMobilityService({
      candidates,
    });

    const order = service.createPassengerOrder({
      pickup: { address: "A" },
      dropoff: { address: "B" },
      passenger: { name: "Test", phone: "0911111111" },
    });
    const dispatchResult = service.dispatchOrder(order.orderId, {
      mode: "auto",
    });
    const firstAssignment = service.assignDispatch({
      dispatchJobId: dispatchResult.dispatchJobId,
      vehicleId: "vehicle-001",
      driverId: "driver-001",
    });

    const reassignResult = service.reassignDispatch({
      dispatchJobId: dispatchResult.dispatchJobId,
      vehicleId: "vehicle-002",
      driverId: "driver-002",
      reasonCode: "operator_reassign",
      reasonNote: "Closer vehicle picked by ops",
    });

    expect(reassignResult.assignmentId).not.toBe(firstAssignment.assignmentId);
    const trace = service.listDispatchTrace(order.orderId);
    expect(trace).toEqual(
      expect.arrayContaining([
        expect.objectContaining({
          eventType: "dispatch.reassigned",
          details: expect.objectContaining({
            dispatchJobId: dispatchResult.dispatchJobId,
            previousAssignmentId: firstAssignment.assignmentId,
            nextVehicleId: "vehicle-002",
            nextDriverId: "driver-002",
            reasonCode: "operator_reassign",
          }),
        }),
      ]),
    );
    const tasks = service
      .listDriverTasks()
      .filter((task) => task.orderId === order.orderId);
    expect(tasks).toEqual(
      expect.arrayContaining([
        expect.objectContaining({
          taskId: firstAssignment.taskId,
          status: "cancelled",
        }),
        expect.objectContaining({
          taskId: reassignResult.taskId,
          status: "pending_acceptance",
          dispatchJobId: dispatchResult.dispatchJobId,
          driverId: "driver-002",
          vehicleId: "vehicle-002",
        }),
      ]),
    );
    expect(auditNotificationService.recordAuditLog).toHaveBeenCalledWith(
      expect.objectContaining({
        actionName: "reassign_dispatch",
      }),
    );
  });

  it("keeps redispatch distinct from reassign by opening a new dispatch job", () => {
    const candidates = [
      {
        driverId: "driver-001",
        vehicleId: "vehicle-001",
        etaMinutes: 5,
        operatingArea: "north",
        serviceBuckets: ["standard_taxi"],
      },
    ];
    const { service } = createOwnedMobilityService({ candidates });

    const order = service.createPassengerOrder({
      pickup: { address: "A" },
      dropoff: { address: "B" },
      passenger: { name: "Test", phone: "0911111111" },
    });
    const firstDispatch = service.dispatchOrder(order.orderId, {
      mode: "auto",
    });
    const firstAssignment = service.assignDispatch({
      dispatchJobId: firstDispatch.dispatchJobId,
      vehicleId: "vehicle-001",
      driverId: "driver-001",
    });

    const secondDispatch = service.redispatchOrder(order.orderId, {
      reasonCode: "operator_redispatch",
    });

    expect(secondDispatch.dispatchJobId).not.toBe(firstDispatch.dispatchJobId);
    const jobs = service
      .listDispatchJobs()
      .filter((job) => job.orderId === order.orderId);
    expect(jobs).toHaveLength(2);
    const tasks = service
      .listDriverTasks()
      .filter((task) => task.orderId === order.orderId);
    expect(tasks).toEqual(
      expect.arrayContaining([
        expect.objectContaining({
          taskId: firstAssignment.taskId,
          status: "cancelled",
          dispatchJobId: firstDispatch.dispatchJobId,
        }),
      ]),
    );
    const trace = service.listDispatchTrace(order.orderId);
    expect(trace).toEqual(
      expect.arrayContaining([
        expect.objectContaining({
          eventType: "dispatch.redispatch_required",
          details: expect.objectContaining({
            reasonCode: "operator_redispatch",
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

  it("moves trips into proof_pending when signoff is missing", () => {
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
        signoffRequired: true,
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

    try {
      service.completeDriverTask(assignment.taskId, {
        completedAt: "2026-04-29T12:45:00.000Z",
        actualDistanceKm: 14.2,
        actualDurationSec: 1200,
        proof: {
          photos: [SAMPLE_PROOF_PHOTO],
        },
      });
    } catch (error) {
      expect((error as ApiRequestError).getResponse()).toMatchObject({
        error: {
          code: "PROOF_REQUIRED",
          details: {
            requirement: "signature",
          },
        },
      });
    }

    expect(service.getOrder(booking.orderId)).toMatchObject({
      status: "proof_pending",
    });
    expect(service.listDriverTasks()[0]).toMatchObject({
      status: "proof_pending",
      proof: {
        photos: [SAMPLE_PROOF_PHOTO],
        signatureId: null,
        expenseItems: [],
      },
    });
  });

  it("returns EXPENSE_PROOF_REQUIRED and preserves partial proof evidence", () => {
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
        businessDispatchSubtype: "credit_card_airport_transfer",
        reservationWindowStart: "2026-04-29T14:00:00.000Z",
        reservationWindowEnd: "2026-04-29T15:00:00.000Z",
        pickup: { address: "Pickup" },
        dropoff: { address: "Dropoff" },
        passenger: { name: "Rider One", phone: "0912000000" },
        expenseProofRequired: true,
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

    try {
      service.completeDriverTask(assignment.taskId, {
        completedAt: "2026-04-29T12:45:00.000Z",
        actualDistanceKm: 14.2,
        actualDurationSec: 1200,
        proof: {
          photos: [SAMPLE_PROOF_PHOTO],
        },
      });
      throw new Error("Expected completion to fail");
    } catch (error) {
      expect((error as ApiRequestError).getResponse()).toMatchObject({
        error: {
          code: "EXPENSE_PROOF_REQUIRED",
          details: {
            requirement: "expense_items",
          },
        },
      });
    }

    expect(service.getOrder(booking.orderId)).toMatchObject({
      status: "proof_pending",
    });
    expect(service.listDriverTasks()[0]).toMatchObject({
      status: "proof_pending",
      proof: {
        photos: [SAMPLE_PROOF_PHOTO],
        signatureId: null,
        expenseItems: [],
      },
    });
  });

  it("replays duplicate completion requests idempotently when the request id matches", () => {
    const tenantPartnerService = {
      publishWebhookEvent: vi.fn(async () => undefined),
    } as unknown as TenantPartnerService;
    const { service, auditNotificationService } = createOwnedMobilityService({
      candidates: [
        {
          driverId: "driver-001",
          vehicleId: "vehicle-001",
          etaMinutes: 5,
          operatingArea: "north",
          serviceBuckets: ["business_dispatch"],
        },
      ],
      tenantPartnerService,
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

    const command = {
      completedAt: "2026-04-29T12:45:00.000Z",
      actualDistanceKm: 14.2,
      actualDurationSec: 1200,
      proof: {
        photos: [SAMPLE_PROOF_PHOTO],
      },
    };

    const completed = service.completeDriverTask(
      assignment.taskId,
      command,
      "req-complete-001",
    );
    const replayed = service.completeDriverTask(
      assignment.taskId,
      command,
      "req-complete-001",
    );

    expect(replayed).toEqual(completed);
    expect(
      service
        .listDispatchTrace(booking.orderId)
        .filter((trace) => trace.eventType === "driver.completed_trip"),
    ).toHaveLength(1);
    expect(
      auditNotificationService.recordAuditLog.mock.calls.filter(
        ([input]) => input.actionName === "complete_trip",
      ),
    ).toHaveLength(1);
    expect(
      (
        tenantPartnerService.publishWebhookEvent as ReturnType<typeof vi.fn>
      ).mock.calls.filter(
        ([, payload]) => payload.eventType === "order.completed",
      ),
    ).toHaveLength(1);
  });

  it("rejects duplicate completion requests after the trip is already completed", () => {
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

    service.completeDriverTask(
      assignment.taskId,
      {
        completedAt: "2026-04-29T12:45:00.000Z",
        actualDistanceKm: 14.2,
        actualDurationSec: 1200,
        proof: {
          photos: [SAMPLE_PROOF_PHOTO],
        },
      },
      "req-complete-001",
    );

    expect(() =>
      service.completeDriverTask(
        assignment.taskId,
        {
          completedAt: "2026-04-29T12:46:00.000Z",
          actualDistanceKm: 14.3,
          actualDurationSec: 1201,
          proof: {
            photos: [SAMPLE_PROOF_PHOTO],
          },
        },
        "req-complete-002",
      ),
    ).toThrowError(ApiRequestError);

    try {
      service.completeDriverTask(
        assignment.taskId,
        {
          completedAt: "2026-04-29T12:46:00.000Z",
          actualDistanceKm: 14.3,
          actualDurationSec: 1201,
          proof: {
            photos: [SAMPLE_PROOF_PHOTO],
          },
        },
        "req-complete-002",
      );
    } catch (error) {
      expect((error as ApiRequestError).getResponse()).toMatchObject({
        error: {
          code: "TASK_ALREADY_COMPLETED",
        },
      });
    }
  });

  it("replays proof-pending completion requests idempotently when the request id matches", () => {
    const { service, auditNotificationService } = createOwnedMobilityService({
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
        signoffRequired: true,
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

    try {
      service.completeDriverTask(
        assignment.taskId,
        {
          completedAt: "2026-04-29T12:45:00.000Z",
          actualDistanceKm: 14.2,
          actualDurationSec: 1200,
          proof: {
            photos: [SAMPLE_PROOF_PHOTO],
          },
        },
        "req-proof-001",
      );
      throw new Error("Expected completion to fail");
    } catch (error) {
      expect((error as ApiRequestError).getResponse()).toMatchObject({
        error: {
          code: "PROOF_REQUIRED",
        },
      });
    }

    const replayed = service.completeDriverTask(
      assignment.taskId,
      {
        completedAt: "2026-04-29T12:45:00.000Z",
        actualDistanceKm: 14.2,
        actualDurationSec: 1200,
        proof: {
          photos: [SAMPLE_PROOF_PHOTO],
        },
      },
      "req-proof-001",
    );

    expect(replayed).toMatchObject({
      taskId: assignment.taskId,
      status: "proof_pending",
    });
    expect(
      service
        .listDispatchTrace(booking.orderId)
        .filter((trace) => trace.eventType === "driver.proof_pending"),
    ).toHaveLength(1);
    expect(
      auditNotificationService.recordAuditLog.mock.calls.filter(
        ([input]) => input.actionName === "complete_trip",
      ),
    ).toHaveLength(0);
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

describe("ORX-DP-002: reassign / redispatch / timeout / no-supply workflow", () => {
  afterEach(() => {
    vi.useRealTimers();
  });

  it("moves realtime order to delayed_queue on first no-supply dispatch failure", () => {
    const { service } = createOwnedMobilityService({ candidates: [] });

    const order = service.createPassengerOrder({
      pickup: { address: "Taipei Main Station" },
      dropoff: { address: "Taipei 101" },
      passenger: { name: "Test", phone: "0912345678" },
    });

    const dispatchResult = service.dispatchOrder(order.orderId, {
      mode: "auto",
    });

    const updatedOrder = service.getOrder(order.orderId);
    expect(updatedOrder.status).toBe("delayed_queue");
    expect(updatedOrder.queueFamily).toBe("delayed_retry_queue");
    expect(updatedOrder.queueEntryReason).toBe("no_supply_delayed_retry");
    expect(updatedOrder.dispatchAttemptCount).toBe(1);
    expect(updatedOrder.lastDispatchFailureReason).toBe("no_eligible_supply");
    expect(updatedOrder.noSupplyEscalation).not.toBeNull();
    expect(updatedOrder.noSupplyEscalation!.escalationAction).toBe(
      "move_to_delayed_queue",
    );
    expect(dispatchResult.status).toBe("no_supply");
  });

  it("escalates to ops on second no-supply dispatch failure", () => {
    const { service } = createOwnedMobilityService({ candidates: [] });

    const order = service.createPassengerOrder({
      pickup: { address: "Taipei Main Station" },
      dropoff: { address: "Taipei 101" },
      passenger: { name: "Test", phone: "0912345678" },
    });

    // First dispatch → delayed_queue
    service.dispatchOrder(order.orderId, { mode: "auto" });
    let updatedOrder = service.getOrder(order.orderId);
    expect(updatedOrder.status).toBe("delayed_queue");

    // Resolve and retry
    service.resolveNoSupplyOrder(order.orderId, "retry_dispatch");
    updatedOrder = service.getOrder(order.orderId);
    // Second dispatch → no_supply with escalation to ops
    expect(updatedOrder.status).toBe("no_supply");
    expect(updatedOrder.queueFamily).toBe("manual_review_queue");
    expect(updatedOrder.queueEntryReason).toBe("no_supply_escalated_to_ops");
    expect(updatedOrder.noSupplyEscalation!.escalationAction).toBe(
      "escalate_to_ops",
    );
  });

  it("resolves no-supply order by cancelling with notification", () => {
    const { service } = createOwnedMobilityService({ candidates: [] });

    const order = service.createPassengerOrder({
      pickup: { address: "Taipei Main Station" },
      dropoff: { address: "Taipei 101" },
      passenger: { name: "Test", phone: "0912345678" },
    });

    service.dispatchOrder(order.orderId, { mode: "auto" });
    service.resolveNoSupplyOrder(
      order.orderId,
      "cancel_with_notification",
      "operator-1",
    );

    const updatedOrder = service.getOrder(order.orderId);
    expect(updatedOrder.status).toBe("cancelled");
    expect(updatedOrder.cancelReason).toBe("no_supply_cancelled");
    expect(updatedOrder.noSupplyEscalation!.resolvedAt).not.toBeNull();
  });

  it("handles dispatch timeout and places order in redispatch priority queue", () => {
    const { service } = createOwnedMobilityService({
      candidates: [
        {
          driverId: "driver-1",
          vehicleId: "vehicle-1",
          etaMinutes: 5,
          operatingArea: "taipei",
          serviceBuckets: ["standard_taxi"],
        },
      ],
    });

    const order = service.createPassengerOrder({
      pickup: { address: "Taipei Main Station" },
      dropoff: { address: "Taipei 101" },
      passenger: { name: "Test", phone: "0912345678" },
    });

    service.dispatchOrder(order.orderId, { mode: "auto" });

    const timeoutResult = service.handleDispatchTimeout(
      order.orderId,
      "acceptance_timeout",
    );

    expect(timeoutResult.status).toBe("dispatch_timeout");
    expect(timeoutResult.timeoutReasonCode).toBe("acceptance_timeout");

    const updatedOrder = service.getOrder(order.orderId);
    expect(updatedOrder.status).toBe("dispatch_timeout");
    expect(updatedOrder.queueFamily).toBe("redispatch_priority_queue");
    expect(updatedOrder.queueEntryReason).toBe("dispatch_timeout_retry");
    expect(updatedOrder.dispatchTimeout).not.toBeNull();
    expect(updatedOrder.dispatchTimeout!.timeoutReasonCode).toBe(
      "acceptance_timeout",
    );
    expect(updatedOrder.dispatchAttemptCount).toBe(1);
  });

  it("preserves reason code and note through redispatch with operator context", () => {
    const { service, auditNotificationService } = createOwnedMobilityService({
      candidates: [
        {
          driverId: "driver-1",
          vehicleId: "vehicle-1",
          etaMinutes: 5,
          operatingArea: "taipei",
          serviceBuckets: ["standard_taxi"],
        },
      ],
    });

    const order = service.createPassengerOrder({
      pickup: { address: "Taipei Main Station" },
      dropoff: { address: "Taipei 101" },
      passenger: { name: "Test", phone: "0912345678" },
    });

    service.dispatchOrder(order.orderId, { mode: "auto" });

    service.redispatchOrder(order.orderId, {
      reasonCode: "customer_request",
      reasonNote: "Customer changed pickup location",
      operatorId: "ops-user-42",
      escalationTarget: "ops_supervisor",
    });

    const updatedOrder = service.getOrder(order.orderId);
    expect(updatedOrder.lastDispatchFailureReason).toBe("customer_request");
    expect(updatedOrder.dispatchAttemptCount).toBe(1);

    const traceItems = service.listDispatchTrace(order.orderId);
    const redispatchTrace = traceItems.find(
      (item) => item.eventType === "dispatch.redispatch_required",
    );
    expect(redispatchTrace).toBeDefined();
    expect(redispatchTrace!.details).toMatchObject({
      reasonCode: "customer_request",
      reasonNote: "Customer changed pickup location",
      operatorId: "ops-user-42",
      escalationTarget: "ops_supervisor",
    });

    const auditCalls = auditNotificationService.recordAuditLog.mock.calls;
    const redispatchAudit = auditCalls.find(
      ([log]) => log.actionName === "redispatch_order",
    );
    expect(redispatchAudit).toBeDefined();
    expect(redispatchAudit![0].actorId).toBe("ops-user-42");
    expect(redispatchAudit![0].actorType).toBe("ops_user");
    expect(redispatchAudit![0].newValuesSummary).toMatchObject({
      reasonCode: "customer_request",
      reasonNote: "Customer changed pickup location",
      escalationTarget: "ops_supervisor",
    });
  });

  it("rejects redispatch while an order remains in exception hold", () => {
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

    expect(() =>
      service.redispatchOrder(booking.orderId, {
        reasonCode: "operator_redispatch",
      }),
    ).toThrowError(ApiRequestError);

    try {
      service.redispatchOrder(booking.orderId, {
        reasonCode: "operator_redispatch",
      });
    } catch (error) {
      expect((error as ApiRequestError).getResponse()).toMatchObject({
        error: {
          code: "EXCEPTION_HOLD_REQUIRES_RESOLUTION",
        },
      });
    }

    const order = service.getOrder(booking.orderId);
    expect(order.status).toBe("exception_hold");
    expect(order.reservationHoldStatus).toBe("exception_hold");
  });

  it("rejects resolveNoSupplyOrder when order is not in no_supply or delayed_queue state", () => {
    const { service } = createOwnedMobilityService({
      candidates: [
        {
          driverId: "driver-1",
          vehicleId: "vehicle-1",
          etaMinutes: 5,
          operatingArea: "taipei",
          serviceBuckets: ["standard_taxi"],
        },
      ],
    });

    const order = service.createPassengerOrder({
      pickup: { address: "Taipei Main Station" },
      dropoff: { address: "Taipei 101" },
      passenger: { name: "Test", phone: "0912345678" },
    });

    expect(() =>
      service.resolveNoSupplyOrder(order.orderId, "retry_dispatch"),
    ).toThrowError(ApiRequestError);
  });

  it("tracks dispatch attempt count through multiple reject-redispatch cycles", () => {
    const { service } = createOwnedMobilityService({
      candidates: [
        {
          driverId: "driver-1",
          vehicleId: "vehicle-1",
          etaMinutes: 5,
          operatingArea: "taipei",
          serviceBuckets: ["standard_taxi"],
        },
      ],
    });

    const order = service.createPassengerOrder({
      pickup: { address: "Taipei Main Station" },
      dropoff: { address: "Taipei 101" },
      passenger: { name: "Test", phone: "0912345678" },
    });

    const dispatchResult = service.dispatchOrder(order.orderId, {
      mode: "auto",
    });
    const jobs = service.listDispatchJobs();
    const job = jobs.find(
      (j) => j.dispatchJobId === dispatchResult.dispatchJobId,
    );
    expect(job).toBeDefined();

    // Assign and then reject
    const assignment = service.assignDispatch({
      dispatchJobId: dispatchResult.dispatchJobId,
      vehicleId: "vehicle-1",
      driverId: "driver-1",
    });
    const task = service.getDriverTask(assignment.taskId);
    service.rejectDriverTask(task.taskId, {
      reasonCode: "driver_rejected",
      reasonNote: "Too far",
    });

    let updatedOrder = service.getOrder(order.orderId);
    expect(updatedOrder.status).toBe("redispatch_required");

    // Redispatch
    service.redispatchOrder(order.orderId, {
      reasonCode: "driver_rejected",
    });

    updatedOrder = service.getOrder(order.orderId);
    expect(updatedOrder.dispatchAttemptCount).toBe(1);
    expect(updatedOrder.lastDispatchFailureReason).toBe("driver_rejected");
  });
});
