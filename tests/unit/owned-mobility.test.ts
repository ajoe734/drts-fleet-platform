import { describe, expect, it, vi } from "vitest";

import { AuditNotificationService } from "../../apps/api/src/modules/audit-notification/audit-notification.service";
import { CallcenterService } from "../../apps/api/src/modules/callcenter/callcenter.service";
import { OwnedMobilityRepository } from "../../apps/api/src/modules/owned-mobility/owned-mobility.repository";
import { OwnedMobilityService } from "../../apps/api/src/modules/owned-mobility/owned-mobility.service";
import { RegulatoryRegistryService } from "../../apps/api/src/modules/regulatory-registry/regulatory-registry.service";

function createService(repository?: OwnedMobilityRepository) {
  const auditService = new AuditNotificationService();
  const callcenterService = new CallcenterService(auditService);
  const regulatoryRegistryService = new RegulatoryRegistryService();
  const ownedMobilityService = new OwnedMobilityService(
    regulatoryRegistryService,
    auditService,
    callcenterService,
    repository,
  );

  return {
    auditService,
    callcenterService,
    regulatoryRegistryService,
    ownedMobilityService,
  };
}

function getErrorCode(error: unknown) {
  const response = (
    error as {
      getResponse?: () => {
        error?: {
          code?: string;
        };
      };
    }
  ).getResponse?.();

  return response?.error?.code ?? null;
}

describe("owned mobility service", () => {
  it("runs the standard taxi dispatch and driver-task loop to completion", () => {
    const { auditService, ownedMobilityService } = createService();
    const order = ownedMobilityService.createPassengerOrder({
      pickup: {
        address: "台中市梧棲區中二路一段9號",
      },
      dropoff: {
        address: "台中市大安區興安路378號",
      },
      passenger: {
        name: "李先生",
        phone: "0911222333",
      },
    });

    const dispatchJob = ownedMobilityService.dispatchOrder(order.orderId, {
      mode: "auto",
    });
    const candidate = ownedMobilityService.listDispatchCandidates(
      dispatchJob.dispatchJobId,
    )[0];

    expect(dispatchJob.status).toBe("matching");
    expect(candidate).toBeDefined();

    const assignment = ownedMobilityService.assignDispatch({
      dispatchJobId: dispatchJob.dispatchJobId,
      vehicleId: candidate!.vehicleId,
      driverId: candidate!.driverId,
    });

    ownedMobilityService.acceptDriverTask(assignment.taskId, {
      acceptedAt: "2026-04-10T09:02:00Z",
    });
    ownedMobilityService.departDriverTask(assignment.taskId, {
      departedAt: "2026-04-10T09:03:00Z",
      currentLocation: {
        lat: 24.266,
        lng: 120.522,
      },
    });
    ownedMobilityService.arrivedPickup(assignment.taskId, {
      arrivedAt: "2026-04-10T09:08:00Z",
    });
    ownedMobilityService.startDriverTask(assignment.taskId, {
      startedAt: "2026-04-10T09:10:00Z",
    });
    const completedTask = ownedMobilityService.completeDriverTask(
      assignment.taskId,
      {
        completedAt: "2026-04-10T09:45:00Z",
        actualDistanceKm: 22.4,
        actualDurationSec: 2100,
        fare: {
          currency: "NTD",
          amountMinor: 150000,
        },
        proof: {
          photoIds: [],
        },
      },
    );

    expect(completedTask.status).toBe("completed");
    expect(ownedMobilityService.getOrder(order.orderId).status).toBe(
      "completed",
    );
    expect(
      auditService
        .listNotifications()
        .some((notification) => notification.channel === "driver_task"),
    ).toBe(true);
  });

  it("creates a phone order without recording_id and binds it later", () => {
    const { callcenterService, ownedMobilityService } = createService();
    const order = ownedMobilityService.createCallCenterOrder({
      callId: "CALL-20260410-000120",
      agentId: "AGENT-0088",
      pickup: {
        address: "台中市梧棲區中二路一段9號",
      },
      dropoff: {
        address: "台中市大安區興安路378號",
      },
      passenger: {
        name: "李先生",
        phone: "0911222333",
      },
    });

    expect(order.orderSource).toBe("phone");
    expect(order.callId).toBe("CALL-20260410-000120");
    expect(order.recordingId).toBeNull();
    expect(order.status).toBe("recording_pending");
    expect(order.complianceFlags).toContain("recording_pending");

    const session = callcenterService.getCallSession("CALL-20260410-000120");
    expect(session.linkedOrderId).toBe(order.orderId);
    expect(session.recordingId).toBeNull();
    expect(session.flags).toContain("recording_pending");

    const attachedSession = callcenterService.attachRecordingCallback(
      "CALL-20260410-000120",
      {
        recordingId: "REC-20260410-000120",
        providerRecordingRef: "cti-ref-001",
        recordingUrl: "https://recordings.example.com/REC-20260410-000120",
        agentId: "AGENT-0088",
      },
    );

    expect(attachedSession.recordingId).toBe("REC-20260410-000120");
    expect(attachedSession.flags).toContain("recording_bound");
    expect(attachedSession.flags).not.toContain("recording_pending");
    expect(ownedMobilityService.getOrder(order.orderId).recordingId).toBe(
      "REC-20260410-000120",
    );
    expect(ownedMobilityService.getOrder(order.orderId).status).toBe(
      "ready_for_dispatch",
    );
    expect(
      ownedMobilityService.getOrder(order.orderId).complianceFlags,
    ).toEqual(["recording_bound"]);
  });

  it("prevents trip start before arrived_pickup", () => {
    const { ownedMobilityService } = createService();
    const order = ownedMobilityService.createPassengerOrder({
      pickup: {
        address: "台中市梧棲區中二路一段9號",
      },
      dropoff: {
        address: "台中市大安區興安路378號",
      },
      passenger: {
        name: "李先生",
        phone: "0911222333",
      },
    });
    const dispatchJob = ownedMobilityService.dispatchOrder(order.orderId, {
      mode: "auto",
    });
    const candidate = ownedMobilityService.listDispatchCandidates(
      dispatchJob.dispatchJobId,
    )[0]!;
    const assignment = ownedMobilityService.assignDispatch({
      dispatchJobId: dispatchJob.dispatchJobId,
      vehicleId: candidate.vehicleId,
      driverId: candidate.driverId,
    });
    ownedMobilityService.acceptDriverTask(assignment.taskId, {
      acceptedAt: "2026-04-10T09:02:00Z",
    });
    ownedMobilityService.departDriverTask(assignment.taskId, {
      departedAt: "2026-04-10T09:03:00Z",
    });

    try {
      ownedMobilityService.startDriverTask(assignment.taskId, {
        startedAt: "2026-04-10T09:10:00Z",
      });
      expect.unreachable("startDriverTask should fail before arrived_pickup");
    } catch (error) {
      expect(getErrorCode(error)).toBe("PICKUP_NOT_ARRIVED");
    }
  });

  it("enforces airport flight number and business proof rules", () => {
    const { ownedMobilityService } = createService();

    try {
      ownedMobilityService.createTenantBooking({
        businessDispatchSubtype: "credit_card_airport_transfer",
        direction: "pickup",
        pickup: {
          address: "桃園機場第二航廈",
        },
        dropoff: {
          address: "台中市梧棲區中二路一段9號",
        },
        reservationWindowStart: "2026-04-18T10:00:00Z",
        reservationWindowEnd: "2026-04-18T10:20:00Z",
        passenger: {
          name: "陳小姐",
          phone: "0900123456",
        },
      });
      expect.unreachable("airport pickup should require flight_no");
    } catch (error) {
      expect(getErrorCode(error)).toBe("FLIGHT_NO_REQUIRED");
    }

    const booking = ownedMobilityService.createTenantBooking({
      businessDispatchSubtype: "enterprise_dispatch",
      pickup: {
        address: "台北市信義區松仁路100號",
      },
      dropoff: {
        address: "桃園機場第二航廈",
      },
      reservationWindowStart: "2026-04-15T08:30:00Z",
      reservationWindowEnd: "2026-04-15T08:45:00Z",
      passenger: {
        name: "王小明",
        phone: "0912000111",
      },
      signoffRequired: true,
      minPhotoCount: 1,
      quotedFare: {
        currency: "NTD",
        amountMinor: 150000,
      },
    });
    const dispatchJob = ownedMobilityService.dispatchOrder(booking.orderId, {
      mode: "auto",
    });
    const candidate = ownedMobilityService.listDispatchCandidates(
      dispatchJob.dispatchJobId,
    )[0]!;
    const assignment = ownedMobilityService.assignDispatch({
      dispatchJobId: dispatchJob.dispatchJobId,
      vehicleId: candidate.vehicleId,
      driverId: candidate.driverId,
    });

    ownedMobilityService.acceptDriverTask(assignment.taskId, {
      acceptedAt: "2026-04-10T09:02:00Z",
    });
    ownedMobilityService.departDriverTask(assignment.taskId, {
      departedAt: "2026-04-10T09:03:00Z",
    });
    ownedMobilityService.arrivedPickup(assignment.taskId, {
      arrivedAt: "2026-04-10T09:08:00Z",
    });
    ownedMobilityService.startDriverTask(assignment.taskId, {
      startedAt: "2026-04-10T09:10:00Z",
    });

    try {
      ownedMobilityService.completeDriverTask(assignment.taskId, {
        completedAt: "2026-04-10T09:45:00Z",
        actualDistanceKm: 22.4,
        actualDurationSec: 2100,
        fare: {
          currency: "NTD",
          amountMinor: 140000,
        },
        proof: {
          photoIds: ["FILE-1001"],
          signatureId: "FILE-2001",
        },
      });
      expect.unreachable(
        "fixed-price business booking should reject fare change",
      );
    } catch (error) {
      expect(getErrorCode(error)).toBe("FIXED_PRICE_IMMUTABLE");
    }

    try {
      ownedMobilityService.completeDriverTask(assignment.taskId, {
        completedAt: "2026-04-10T09:45:00Z",
        actualDistanceKm: 22.4,
        actualDurationSec: 2100,
        fare: {
          currency: "NTD",
          amountMinor: 150000,
        },
        proof: {
          photoIds: ["FILE-1001"],
        },
      });
      expect.unreachable("enterprise booking should require signoff proof");
    } catch (error) {
      expect(getErrorCode(error)).toBe("PROOF_REQUIRED");
    }
  });

  it("lists, updates, and cancels tenant bookings within the SLA windows", () => {
    vi.useFakeTimers();
    vi.setSystemTime(new Date("2026-04-14T08:00:00Z"));

    const { ownedMobilityService } = createService();
    const created = ownedMobilityService.createTenantBooking({
      businessDispatchSubtype: "enterprise_dispatch",
      pickup: {
        address: "台北市信義區松仁路100號",
      },
      dropoff: {
        address: "桃園機場第二航廈",
      },
      reservationWindowStart: "2026-04-14T10:00:00Z",
      reservationWindowEnd: "2026-04-14T10:20:00Z",
      passenger: {
        name: "王小明",
        phone: "0912000111",
      },
      costCenter: "OPS-01",
      notes: "原始預約",
    });

    const listed = ownedMobilityService.listTenantBookings();
    expect(listed.items).toHaveLength(1);
    expect(listed.items[0]?.bookingId).toBe(created.bookingId);
    expect(listed.items[0]?.modifiableUntil).toBe("2026-04-14T09:30:00.000Z");

    const updated = ownedMobilityService.updateTenantBooking(
      created.bookingId,
      {
        reservationWindowStart: "2026-04-14T11:00:00Z",
        reservationWindowEnd: "2026-04-14T11:15:00Z",
        costCenter: "OPS-02",
        notes: "改到十一點出發",
      },
    );
    expect(updated.reservationWindowStart).toBe("2026-04-14T11:00:00Z");
    expect(updated.modifiableUntil).toBe("2026-04-14T10:30:00.000Z");
    expect(updated.costCenter).toBe("OPS-02");
    expect(updated.notes).toBe("改到十一點出發");

    const cancelled = ownedMobilityService.cancelTenantBooking(
      created.bookingId,
      {
        reason: "passenger_rescheduled",
      },
    );
    expect(cancelled.status).toBe("cancelled");
    expect(ownedMobilityService.getOrder(created.orderId).status).toBe(
      "cancelled",
    );

    vi.useRealTimers();
  });

  it("rejects tenant booking changes after modifiable_until", () => {
    vi.useFakeTimers();
    vi.setSystemTime(new Date("2026-04-15T08:00:00Z"));

    const { ownedMobilityService } = createService();
    const created = ownedMobilityService.createTenantBooking({
      businessDispatchSubtype: "enterprise_dispatch",
      pickup: {
        address: "台中高鐵站",
      },
      dropoff: {
        address: "台中市梧棲區中二路一段9號",
      },
      reservationWindowStart: "2026-04-15T10:00:00Z",
      reservationWindowEnd: "2026-04-15T10:20:00Z",
      passenger: {
        name: "李秘書",
        phone: "0933555777",
      },
    });

    vi.setSystemTime(new Date("2026-04-15T09:31:00Z"));

    try {
      ownedMobilityService.updateTenantBooking(created.bookingId, {
        notes: "延後十分鐘",
      });
      expect.unreachable("booking update should fail after modifiable_until");
    } catch (error) {
      expect(getErrorCode(error)).toBe("ORDER_NOT_MODIFIABLE");
    }

    vi.useRealTimers();
  });

  it("routes reservation failures into redispatch queue or exception_hold", () => {
    vi.useFakeTimers();
    vi.setSystemTime(new Date("2026-04-15T06:00:00Z"));

    const { auditService, regulatoryRegistryService, ownedMobilityService } =
      createService();
    regulatoryRegistryService.updateDriverWorkState("drv-demo-001", {
      workState: "offline",
    });
    const initialEscalationNotifications = auditService
      .listNotifications()
      .filter((notification) =>
        ["ops_notice", "tenant_sla"].includes(notification.channel),
      ).length;

    const queuedBooking = ownedMobilityService.createTenantBooking({
      businessDispatchSubtype: "enterprise_dispatch",
      pickup: {
        address: "台中高鐵站",
      },
      dropoff: {
        address: "台中市梧棲區中二路一段9號",
      },
      reservationWindowStart: "2026-04-15T08:00:00Z",
      reservationWindowEnd: "2026-04-15T08:20:00Z",
      passenger: {
        name: "企業旅客 A",
        phone: "0911000001",
      },
    });
    const queuedDispatch = ownedMobilityService.dispatchOrder(
      queuedBooking.orderId,
      {
        mode: "auto",
      },
    );

    expect(queuedDispatch.status).toBe("queued");
    expect(ownedMobilityService.getOrder(queuedBooking.orderId).status).toBe(
      "redispatch_required",
    );

    const holdBooking = ownedMobilityService.createTenantBooking({
      businessDispatchSubtype: "enterprise_dispatch",
      pickup: {
        address: "台中高鐵站",
      },
      dropoff: {
        address: "台中市梧棲區中二路一段9號",
      },
      reservationWindowStart: "2026-04-15T06:20:00Z",
      reservationWindowEnd: "2026-04-15T06:35:00Z",
      passenger: {
        name: "企業旅客 B",
        phone: "0911000002",
      },
    });
    const holdDispatch = ownedMobilityService.dispatchOrder(
      holdBooking.orderId,
      {
        mode: "auto",
      },
    );

    expect(holdDispatch.status).toBe("failed");
    expect(ownedMobilityService.getOrder(holdBooking.orderId).status).toBe(
      "exception_hold",
    );
    expect(
      auditService
        .listNotifications()
        .filter((notification) =>
          ["ops_notice", "tenant_sla"].includes(notification.channel),
        ),
    ).toHaveLength(initialEscalationNotifications + 4);

    vi.useRealTimers();
  });

  it("cancels assigned standard taxi orders and closes active dispatch state", () => {
    const { ownedMobilityService } = createService();
    const order = ownedMobilityService.createPassengerOrder({
      pickup: {
        address: "台中市梧棲區中二路一段9號",
      },
      dropoff: {
        address: "台中市大安區興安路378號",
      },
      passenger: {
        name: "李先生",
        phone: "0911222333",
      },
    });
    const dispatchJob = ownedMobilityService.dispatchOrder(order.orderId, {
      mode: "auto",
    });
    const candidate = ownedMobilityService.listDispatchCandidates(
      dispatchJob.dispatchJobId,
    )[0]!;
    const assignment = ownedMobilityService.assignDispatch({
      dispatchJobId: dispatchJob.dispatchJobId,
      vehicleId: candidate.vehicleId,
      driverId: candidate.driverId,
    });

    const cancelledOrder = ownedMobilityService.cancelOwnedOrder(
      order.orderId,
      {
        reason: "passenger_cancelled",
      },
    );

    expect(cancelledOrder.status).toBe("cancelled");
    expect(
      ownedMobilityService
        .listDispatchJobs()
        .find((job) => job.dispatchJobId === dispatchJob.dispatchJobId)?.status,
    ).toBe("closed");
    expect(ownedMobilityService.getDriverTask(assignment.taskId).status).toBe(
      "cancelled",
    );
  });

  it("persists queue check-in and check-out traces through the repository", async () => {
    const persistChanges = vi.fn(async () => undefined);
    const repository = {
      loadState: vi.fn(async () => ({
        orders: [],
        dispatchJobs: [],
        dispatchAttempts: [],
        dispatchAssignments: [],
        driverTasks: [],
        dispatchTraceLogs: [],
      })),
      persistChanges,
      reportPersistenceFailure: vi.fn(),
    } as unknown as OwnedMobilityRepository;

    const { ownedMobilityService } = createService(repository);
    await ownedMobilityService.onModuleInit();

    const checkedIn = ownedMobilityService.queueCheckIn({
      vehicleId: "veh-demo-001",
      siteId: "site-demo-001",
    });
    const checkedOut = ownedMobilityService.queueCheckOut({
      vehicleId: "veh-demo-001",
      siteId: "site-demo-001",
    });

    expect(checkedIn.status).toBe("checked_in");
    expect(checkedOut.status).toBe("checked_out");
    expect(persistChanges).toHaveBeenCalledWith(
      expect.objectContaining({
        dispatchTraceLogs: [
          expect.objectContaining({
            eventType: "queue.entry.created",
          }),
        ],
      }),
    );
    expect(persistChanges).toHaveBeenCalledWith(
      expect.objectContaining({
        dispatchTraceLogs: [
          expect.objectContaining({
            eventType: "queue.entry.closed",
          }),
        ],
      }),
    );
  });

  it("rehydrates persisted orders and writes dispatch snapshots through the repository", async () => {
    const auditService = new AuditNotificationService();
    const callcenterService = new CallcenterService(auditService);
    const regulatoryRegistryService = new RegulatoryRegistryService();
    const persistChanges = vi.fn(async () => undefined);
    const repository = {
      loadState: vi.fn(async () => ({
        orders: [
          {
            orderId: "order-persisted-001",
            orderNo: "O-20260410-000099",
            orderSource: "app",
            orderDomain: "owned",
            serviceBucket: "standard_taxi",
            dispatchSemantics: "realtime",
            businessDispatchSubtype: null,
            status: "ready_for_dispatch",
            pickup: {
              address: "台中市梧棲區中二路一段9號",
            },
            dropoff: {
              address: "台中市大安區興安路378號",
            },
            passenger: {
              name: "李先生",
              phone: "0911222333",
            },
            bookingId: null,
            bookingType: null,
            etaSnapshot: {
              etaMinutes: 8,
              calculatedAt: "2026-04-10T09:00:00Z",
            },
            callId: null,
            recordingId: null,
            reservationWindowStart: null,
            reservationWindowEnd: null,
            recurrenceRule: null,
            modifiableUntil: null,
            cancelableUntil: null,
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
            fixedPrice: false,
            quotedFare: null,
            proofRequirements: {
              minPhotoCount: 0,
              signoffRequired: false,
              expenseProofRequired: false,
            },
            complianceFlags: [],
            cancelledAt: null,
            cancelReason: null,
            reservationHoldStatus: "none",
            reservationHoldId: null,
            reservationHoldExpiresAt: null,
            createdAt: "2026-04-10T09:00:00Z",
            updatedAt: "2026-04-10T09:00:00Z",
          },
        ],
        dispatchJobs: [],
        dispatchAttempts: [],
        dispatchAssignments: [],
        driverTasks: [],
        dispatchTraceLogs: [],
      })),
      persistChanges,
      reportPersistenceFailure: vi.fn(),
    } as unknown as OwnedMobilityRepository;

    const ownedMobilityService = new OwnedMobilityService(
      regulatoryRegistryService,
      auditService,
      callcenterService,
      repository,
    );

    await ownedMobilityService.onModuleInit();

    expect(ownedMobilityService.getOrder("order-persisted-001").orderNo).toBe(
      "O-20260410-000099",
    );

    const dispatchJob = ownedMobilityService.dispatchOrder(
      "order-persisted-001",
      {
        mode: "auto",
      },
    );

    await Promise.resolve();

    expect(dispatchJob.status).toBe("matching");
    expect(persistChanges).toHaveBeenCalledWith(
      expect.objectContaining({
        dispatchJobs: [
          expect.objectContaining({
            dispatchJobId: dispatchJob.dispatchJobId,
            orderId: "order-persisted-001",
          }),
        ],
        dispatchAttempts: [
          expect.objectContaining({
            dispatchJobId: dispatchJob.dispatchJobId,
            outcome: "candidate_found",
          }),
        ],
        dispatchTraceLogs: [
          expect.objectContaining({
            orderId: "order-persisted-001",
            eventType: "dispatch.matching",
          }),
        ],
      }),
    );
  });
});
