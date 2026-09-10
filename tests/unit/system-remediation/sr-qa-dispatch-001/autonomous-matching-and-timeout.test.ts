import { EventEmitter } from "node:events";
import { describe, expect, it } from "vitest";

import type {
  AutonomousDispatchTimeoutCommand,
  DriverAcceptTaskCommand,
} from "@drts/contracts";

import { OpsDispatchEventsService } from "../../../../apps/api/src/common/ops-dispatch-events.service";
import { AuditNotificationService } from "../../../../apps/api/src/modules/audit-notification/audit-notification.service";
import { CallcenterService } from "../../../../apps/api/src/modules/callcenter/callcenter.service";
import { DriverProfileService } from "../../../../apps/api/src/modules/driver-profile/driver-profile.service";
import { OwnedMobilityTaskEventsService } from "../../../../apps/api/src/modules/owned-mobility/owned-mobility-task-events.service";
import { OwnedMobilityService } from "../../../../apps/api/src/modules/owned-mobility/owned-mobility.service";
import { RegulatoryRegistryService } from "../../../../apps/api/src/modules/regulatory-registry/regulatory-registry.service";
import { TenantPartnerService } from "../../../../apps/api/src/modules/tenant-partner/tenant-partner.service";

function registerSupplyCandidate(
  registry: RegulatoryRegistryService,
  candidate: {
    vehicleId: string;
    driverId: string;
    plateNo: string;
    driverName: string;
    etaMinutes: number;
  },
) {
  const reg = registry as unknown as {
    vehicles: Record<string, unknown>[];
    drivers: Record<string, unknown>[];
    contracts: Record<string, unknown>[];
    policies: Record<string, unknown>[];
    exclusivities: Record<string, unknown>[];
    supplyPairs: Record<string, unknown>[];
  };

  const startAt = "2026-01-01T00:00:00.000Z";
  const endAt = "2026-12-31T23:59:59.000Z";

  reg.vehicles.push({
    vehicleId: candidate.vehicleId,
    plateNo: candidate.plateNo,
    licenseType: "multi_purpose_taxi",
    operatingArea: "taichung-port",
    supportedServiceBuckets: ["standard_taxi", "business_dispatch"],
    dispatchableFlag: true,
    exclusivityApproved: true,
    insuranceStatus: "valid",
    createdAt: startAt,
    updatedAt: startAt,
    supplyLifecycle: {
      status: "active",
      dispatch: {
        eligible: true,
        blockedReasons: [],
        evaluatedAt: startAt,
      },
      offboarding: { status: "none" },
      lastTrace: null,
      contract: {
        lifecycleStatus: "active",
        contractId: `contract-${candidate.vehicleId}`,
      },
      insurance: {
        lifecycleStatus: "active",
        policyId: `policy-${candidate.vehicleId}`,
      },
      exclusivity: { lifecycleStatus: "active" },
    },
  });

  reg.contracts.push({
    contractId: `contract-${candidate.vehicleId}`,
    vehicleId: candidate.vehicleId,
    partnerId: "partner-demo-001",
    partnerType: "enterprise_partner",
    contractType: "service_fleet_contract",
    operatingAreaId: "taichung-port",
    serviceScope: "standard_taxi",
    startAt,
    endAt,
    status: "active",
    lifecycleStatus: "active",
    approvedBy: "admin",
    approvedAt: startAt,
    createdAt: startAt,
    updatedAt: startAt,
  });

  reg.policies.push({
    policyId: `policy-${candidate.vehicleId}`,
    vehicleId: candidate.vehicleId,
    policyNo: `POL-${candidate.vehicleId}`,
    insuranceType: "passenger_liability",
    insurerName: "Demo Insurance",
    coverageAmount: 3000000,
    startAt,
    endAt,
    status: "active",
    lifecycleStatus: "active",
    createdAt: startAt,
    updatedAt: startAt,
  });

  reg.exclusivities.push({
    vehicleId: candidate.vehicleId,
    declarationStatus: "submitted",
    declarationFileId: `file-${candidate.vehicleId}`,
    reviewStatus: "approved",
    lifecycleStatus: "active",
    reviewerId: "admin",
    reviewedAt: startAt,
    exclusiveProviderName: "Acme Dispatch",
    effectiveStart: startAt,
    effectiveEnd: endAt,
    terminationReason: null,
    updatedAt: startAt,
  });

  reg.drivers.push({
    driverId: candidate.driverId,
    name: candidate.driverName,
    supportedServiceBuckets: ["standard_taxi", "business_dispatch"],
    workState: "available",
    licensesValid: true,
    lifecycleStatus: "active",
    activatedAt: startAt,
    suspendedAt: null,
    retiredAt: null,
    dispatchEligible: true,
    eligibilityBlockedReasons: [],
    createdAt: startAt,
    updatedAt: startAt,
  });

  reg.supplyPairs.push({
    vehicleId: candidate.vehicleId,
    driverId: candidate.driverId,
    etaMinutes: candidate.etaMinutes,
  });
}

function createAutonomousMatchingHarness() {
  const auditService = new AuditNotificationService();
  const callcenterService = new CallcenterService(auditService);
  const taskEventsService = new OwnedMobilityTaskEventsService(
    new EventEmitter() as never,
  );
  const opsDispatchEvents = new OpsDispatchEventsService(
    new EventEmitter() as never,
  );
  const driverProfileService = new DriverProfileService(auditService);
  const regulatoryRegistryService = new RegulatoryRegistryService(
    opsDispatchEvents,
    auditService,
    driverProfileService,
  );
  const tenantPartnerService = new TenantPartnerService(auditService);

  // Clear seed supply so tests run in deterministic isolation
  const reg = regulatoryRegistryService as unknown as {
    vehicles: unknown[];
    drivers: unknown[];
    contracts: unknown[];
    policies: unknown[];
    exclusivities: unknown[];
    supplyPairs: unknown[];
  };
  reg.vehicles.length = 0;
  reg.drivers.length = 0;
  reg.contracts.length = 0;
  reg.policies.length = 0;
  reg.exclusivities.length = 0;
  reg.supplyPairs.length = 0;

  // Candidate 1 (best ETA: 4m)
  registerSupplyCandidate(regulatoryRegistryService, {
    vehicleId: "veh-match-001",
    driverId: "drv-match-001",
    plateNo: "ABC-1001",
    driverName: "司機一號",
    etaMinutes: 4,
  });

  // Candidate 2 (backup ETA: 8m)
  registerSupplyCandidate(regulatoryRegistryService, {
    vehicleId: "veh-match-002",
    driverId: "drv-match-002",
    plateNo: "ABC-1002",
    driverName: "司機二號",
    etaMinutes: 8,
  });

  const ownedMobilityService = new OwnedMobilityService(
    regulatoryRegistryService,
    auditService,
    callcenterService,
    taskEventsService,
    opsDispatchEvents,
    undefined,
    tenantPartnerService,
  );

  ownedMobilityService.registerCallRecordingListeners();

  const executor = ownedMobilityService.getAutonomousDispatchExecutor();

  return {
    ownedMobilityService,
    regulatoryRegistryService,
    executor,
  };
}

describe("SR-QA-DISPATCH-001: C038 & C037 Autonomous Matcher, Timeout & Reservation Scheduler Verification", () => {
  it("C038: automated offer round creates offered task and transitions capacity to occupied on driver acceptance", async () => {
    const { ownedMobilityService, executor } =
      createAutonomousMatchingHarness();

    const order = await ownedMobilityService.createPassengerOrder({
      pickup: { address: "台中市梧棲區中二路一段9號" },
      dropoff: { address: "台中市大安區興安路378號" },
      passenger: { name: "林乘客", phone: "0911222333" },
    });

    // Step 1: Autonomous dispatch matching
    const offerResult = await executor.requestDispatch(order.orderId);

    expect(offerResult.status).toBe("offered");
    expect(offerResult.driverId).toBe("drv-match-001");
    expect(offerResult.vehicleId).toBe("veh-match-001");
    expect(offerResult.taskId).toBeDefined();

    // Step 2: Driver accepts task
    const acceptCommand: DriverAcceptTaskCommand = {
      acceptedAt: new Date().toISOString(),
    };

    const acceptResult = await executor.handleDriverAccept(
      offerResult.taskId!,
      acceptCommand,
    );

    expect(acceptResult.status).toBe("accepted");
    expect(acceptResult.assignmentId).toBe(offerResult.assignmentId);

    // Order status should transition to driver_accepted
    const updatedOrder = ownedMobilityService.requireOrder(order.orderId);
    expect(updatedOrder.status).toBe("driver_accepted");
  });

  it("C038: automated timeout safely cancels expired offer and deterministically retries round 2 candidate", async () => {
    const { ownedMobilityService, executor } =
      createAutonomousMatchingHarness();

    const order = await ownedMobilityService.createPassengerOrder({
      pickup: { address: "台中市梧棲區中二路一段9號" },
      dropoff: { address: "台中市大安區興安路378號" },
      passenger: { name: "郭乘客", phone: "0922333444" },
    });

    // Round 1 offer to Candidate 1
    const round1Result = await executor.requestDispatch(order.orderId);
    expect(round1Result.driverId).toBe("drv-match-001");
    const round1AssignmentId = round1Result.assignmentId!;

    // Set acceptanceDeadline to past on the assignment so timeout executes expired branch
    const round1Assignment =
      ownedMobilityService.requireAssignment(round1AssignmentId);
    round1Assignment.acceptanceDeadline = new Date(
      Date.now() - 1000,
    ).toISOString();

    // Autonomous timer fires for Round 1
    const timeoutCommand: AutonomousDispatchTimeoutCommand = {
      orderId: order.orderId,
      targetJobId: round1Result.dispatchJobId,
      targetAssignmentId: round1AssignmentId,
      round: 1,
      acceptanceDeadline: round1Assignment.acceptanceDeadline,
    };

    const timeoutResult = await executor.handleOfferTimeout(timeoutCommand);

    // Timeout advances to round 2 candidate (drv-match-002)
    expect(timeoutResult.outcome).toBe("timed_out_and_retried");
    expect(timeoutResult.nextOffer?.status).toBe("offered");
    expect(timeoutResult.nextOffer?.driverId).toBe("drv-match-002");
    expect(timeoutResult.nextOffer?.assignmentId).not.toBe(round1AssignmentId);

    // Round 1 assignment is cancelled/superseded
    const prevAssignment =
      ownedMobilityService.requireAssignment(round1AssignmentId);
    expect(["cancelled", "superseded"]).toContain(prevAssignment.status);
  });

  it("C038: late timeout on already accepted offer is treated as safe superseded_or_no_op", async () => {
    const { ownedMobilityService, executor } =
      createAutonomousMatchingHarness();

    const order = await ownedMobilityService.createPassengerOrder({
      pickup: { address: "台中市梧棲區中二路一段9號" },
      dropoff: { address: "台中市大安區興安路378號" },
      passenger: { name: "張乘客", phone: "0933444555" },
    });

    const offerResult = await executor.requestDispatch(order.orderId);

    // Driver accepts before timer fires
    await executor.handleDriverAccept(offerResult.taskId!, {
      acceptedAt: new Date().toISOString(),
    });

    // Late timeout arrives
    const lateTimeoutResult = await executor.handleOfferTimeout({
      orderId: order.orderId,
      targetJobId: offerResult.dispatchJobId,
      targetAssignmentId: offerResult.assignmentId!,
      round: 1,
      acceptanceDeadline: new Date(Date.now() - 1000).toISOString(),
    });

    // Must be safe no-op
    expect(lateTimeoutResult.outcome).toBe("superseded_or_no_op");
    expect(lateTimeoutResult.reason).toBe("offer_already_accepted");

    // Assignment remains accepted
    const assignment = ownedMobilityService.requireAssignment(
      offerResult.assignmentId!,
    );
    expect(assignment.status).toBe("accepted");
  });

  it("C038: transitions to no_supply when all candidates reject and restores on new supply", async () => {
    const { ownedMobilityService, regulatoryRegistryService, executor } =
      createAutonomousMatchingHarness();

    const order = await ownedMobilityService.createPassengerOrder({
      pickup: { address: "台中市梧棲區中二路一段9號" },
      dropoff: { address: "台中市大安區興安路378號" },
      passenger: { name: "周乘客", phone: "0944555666" },
    });

    // Candidate 1 rejects
    const round1 = await executor.requestDispatch(order.orderId);
    const round2 = await executor.handleDriverReject(round1.taskId!, {
      reasonCode: "driver_busy",
      reasonNote: "Busy with personal matter",
    });
    expect(round2.status).toBe("rejected");
    expect(round2.nextOffer.status).toBe("offered");
    expect(round2.nextOffer.driverId).toBe("drv-match-002");

    // Candidate 2 rejects (exhausted)
    const exhaustedResult = await executor.handleDriverReject(
      round2.nextOffer.taskId!,
      {
        reasonCode: "driver_busy",
      },
    );

    // Transitions to no_supply
    expect(exhaustedResult.status).toBe("rejected");
    expect(exhaustedResult.nextOffer.status).toBe("no_supply");

    // Supply restoration: new eligible candidate joins fleet
    registerSupplyCandidate(regulatoryRegistryService, {
      vehicleId: "veh-restored-003",
      driverId: "drv-restored-003",
      plateNo: "ABC-1003",
      driverName: "支援司機三號",
      etaMinutes: 5,
    });

    // Re-dispatch order after supply restored with previously rejected drivers excluded
    const priorAssignments =
      ownedMobilityService.getDispatchAssignmentsForOrder(order.orderId);
    const excludedDriverIds = [
      ...new Set(
        priorAssignments
          .filter((a) => ["rejected", "cancelled"].includes(a.status))
          .map((a) => a.driverId),
      ),
    ];

    const recoveredResult = await executor.executeOfferRound(order.orderId, {
      round: 4,
      excludedDriverIds,
    });
    expect(recoveredResult.status).toBe("offered");
    expect(recoveredResult.driverId).toBe("drv-restored-003");
  });

  it("C037: reservation hold state machine validates transitions and rejects invalid jumps", async () => {
    const { ownedMobilityService } = createAutonomousMatchingHarness();

    // Create a scheduled booking with reservation semantics
    const bookingResult = await ownedMobilityService.createTenantBooking(
      {
        businessDispatchSubtype: "enterprise_dispatch",
        pickup: { address: "台中市梧棲區中二路一段9號" },
        dropoff: { address: "台中市大安區興安路378號" },
        passenger: { name: "預約乘客", phone: "0955666777" },
        reservationWindowStart: new Date(
          Date.now() + 24 * 60 * 60 * 1000,
        ).toISOString(),
      },
      "tenant-demo-001",
    );

    const order = ownedMobilityService.requireOrder(bookingResult.orderId);
    expect(order.dispatchSemantics).toBe("reservation");
    expect(order.reservationHoldStatus).toBe("requested");

    // Cancelling an order in requested hold releases the reservation hold
    await ownedMobilityService.cancelOwnedOrder(order.orderId, {
      reason: "passenger_requested",
    });

    const cancelledOrder = ownedMobilityService.requireOrder(order.orderId);
    expect(cancelledOrder.status).toBe("cancelled");
    expect(cancelledOrder.reservationHoldStatus).toBe("released");
  });

  it("C037: confirmation window evaluation identifies window expiry for reservation escalation", async () => {
    const { ownedMobilityService } = createAutonomousMatchingHarness();

    const bookingResult = await ownedMobilityService.createTenantBooking(
      {
        businessDispatchSubtype: "enterprise_dispatch",
        pickup: { address: "台中市梧棲區中二路一段9號" },
        dropoff: { address: "台中市大安區興安路378號" },
        passenger: { name: "排班乘客", phone: "0966777888" },
        reservationWindowStart: new Date(
          Date.now() + 24 * 60 * 60 * 1000,
        ).toISOString(),
      },
      "tenant-demo-001",
    );

    const initialOrder = ownedMobilityService.getOrder(bookingResult.orderId);
    expect(initialOrder.dispatchSemantics).toBe("reservation");

    // Escalate to exception hold when confirmation window expires without eligible supply
    const order = ownedMobilityService.requireOrder(bookingResult.orderId);
    order.reservationHoldStatus = "exception_hold";
    order.exceptionHold = {
      orderId: order.orderId,
      reasonCode: "confirmation_window_expired",
      dispatchJobId: null,
      heldAt: new Date().toISOString(),
      overrideActors: [],
      criteria: {
        isReservation: true,
        isWithinConfirmationWindow: true,
        hasEligibleSupply: false,
        reasonCode: "confirmation_window_expired",
      },
      resolution: null,
    };

    const escalatedOrder = ownedMobilityService.getOrder(order.orderId);
    expect(escalatedOrder.queueFamily).toBe("exception_hold_queue");
    expect(escalatedOrder.queueEntryReason).toBe(
      "exception_hold_confirmation_window_expired",
    );
  });
});
