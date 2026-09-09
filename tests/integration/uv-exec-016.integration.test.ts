import { EventEmitter } from "node:events";
import { describe, expect, it } from "vitest";

import {
  VoiceDispatchProjectionViewSchema,
  type AutonomousDispatchTimeoutCommand,
  type DriverAcceptTaskCommand,
  type DriverRejectTaskCommand,
} from "@drts/contracts";

import { AuditNotificationService } from "../../apps/api/src/modules/audit-notification/audit-notification.service";
import { CallcenterService } from "../../apps/api/src/modules/callcenter/callcenter.service";
import { DriverProfileService } from "../../apps/api/src/modules/driver-profile/driver-profile.service";
import { OpsDispatchEventsService } from "../../apps/api/src/common/ops-dispatch-events.service";
import { OwnedMobilityTaskEventsService } from "../../apps/api/src/modules/owned-mobility/owned-mobility-task-events.service";
import { OwnedMobilityService } from "../../apps/api/src/modules/owned-mobility/owned-mobility.service";
import { RegulatoryRegistryService } from "../../apps/api/src/modules/regulatory-registry/regulatory-registry.service";
import { TenantPartnerService } from "../../apps/api/src/modules/tenant-partner/tenant-partner.service";
import { VoiceDispatchProjectionService } from "../../apps/api/src/modules/voice-booking/voice-dispatch-projection.service";

function registerSupplyCandidate(
  regulatoryRegistryService: RegulatoryRegistryService,
  candidate: {
    vehicleId: string;
    driverId: string;
    plateNo: string;
    driverName: string;
    etaMinutes: number;
  },
) {
  const reg = regulatoryRegistryService as unknown as {
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

function createHarness() {
  const auditService = new AuditNotificationService();
  const callcenterService = new CallcenterService(auditService);
  const regulatoryRegistryService = new RegulatoryRegistryService(
    new OpsDispatchEventsService(new EventEmitter() as never),
    auditService,
    new DriverProfileService(auditService),
  );

  // Seed two additional candidates so we have 3 candidates available for retry, collision & exhaustion testing
  registerSupplyCandidate(regulatoryRegistryService, {
    vehicleId: "veh-extra-002",
    driverId: "drv-extra-002",
    plateNo: "ABC-2002",
    driverName: "Driver Demo Two",
    etaMinutes: 10,
  });
  registerSupplyCandidate(regulatoryRegistryService, {
    vehicleId: "veh-extra-003",
    driverId: "drv-extra-003",
    plateNo: "ABC-2003",
    driverName: "Driver Demo Three",
    etaMinutes: 12,
  });

  const taskEventsService = new OwnedMobilityTaskEventsService(
    new EventEmitter() as never,
  );
  const opsDispatchEvents = new OpsDispatchEventsService(
    new EventEmitter() as never,
  );
  const tenantPartnerService = new TenantPartnerService(auditService);

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
  const projectionService = new VoiceDispatchProjectionService(
    ownedMobilityService,
  );

  const createOrder = (options?: {
    passengerName?: string;
    pickupAddress?: string;
    dropoffAddress?: string;
  }) => {
    return ownedMobilityService.createPassengerOrder({
      pickup: {
        address: options?.pickupAddress ?? "台中市梧棲區中二路一段9號",
      },
      dropoff: {
        address: options?.dropoffAddress ?? "台中市大安區興安路378號",
      },
      passenger: {
        name: options?.passengerName ?? "陳先生",
        phone: "0912345678",
      },
    });
  };

  return {
    auditService,
    callcenterService,
    regulatoryRegistryService,
    taskEventsService,
    opsDispatchEvents,
    tenantPartnerService,
    ownedMobilityService,
    executor,
    projectionService,
    createOrder,
  };
}

describe("UV-EXEC-016: Autonomous Dispatch Executor & Voice Projection Integration Suite", () => {
  describe("1. no_ops_assignment_evidence (Autonomous Dispatch Execution)", () => {
    it("generates a valid offer and driver task in mode auto without manual ops console intervention", async () => {
      const { executor, projectionService, createOrder } = createHarness();
      const order = createOrder();

      // SD §7.6: requestDispatch triggers autonomous matching & offer round 1
      const offerResult = await executor.requestDispatch(order.orderId);

      expect(offerResult.status).toBe("offered");
      expect(offerResult.orderId).toBe(order.orderId);
      expect(offerResult.round).toBe(1);
      expect(offerResult.assignmentId).toBeTruthy();
      expect(offerResult.taskId).toBeTruthy();
      expect(offerResult.driverId).toBeTruthy();
      expect(offerResult.vehicleId).toBeTruthy();
      expect(offerResult.acceptanceDeadline).toBeTruthy();
      expect(offerResult.candidateCount).toBeGreaterThan(0);
      expect(offerResult.operationKey).toBe(
        `job:${offerResult.dispatchJobId}:round:1:offer`,
      );

      // Verify outbox record created for passenger disclosure with notify operation key
      const outbox = executor.getOutboxRecords();
      expect(outbox.length).toBeGreaterThanOrEqual(1);
      const notifyOutbox = executor.getOutboxRecordByOperationKey(
        `assignment:${offerResult.assignmentId}:notify`,
      );
      expect(notifyOutbox).toBeDefined();
      expect(notifyOutbox?.eventType).toBe("assignment_disclosure_ready");
      expect(notifyOutbox?.assignmentVersion).toBe(1);

      // Verify capacity reservation is held
      const reservations = executor.getInMemReservations();
      const heldDriver = reservations.find(
        (r) =>
          r.resourceType === "driver" &&
          r.resourceId === offerResult.driverId &&
          r.status === "held",
      );
      const heldVehicle = reservations.find(
        (r) =>
          r.resourceType === "vehicle" &&
          r.resourceId === offerResult.vehicleId &&
          r.status === "held",
      );
      expect(heldDriver).toBeDefined();
      expect(heldVehicle).toBeDefined();

      // Voice truth projection reflects 'offered' state (driver identity hidden, ETA null)
      const projection = await projectionService.projectDispatch(order.orderId);
      expect(projection.projection).toBe("offered");
      expect(projection.announcement).toBe("正在等候司機確認");
      expect(projection.driverId).toBeNull();
      expect(projection.etaMinutes).toBeNull();
      expect(VoiceDispatchProjectionViewSchema.safeParse(projection).success).toBe(
        true,
      );
    });
  });

  describe("2. offer_accept_reject_retry_evidence (Accept, Reject, Retry, Collision & Exhaustion)", () => {
    it("transitions capacity from held to occupied when driver accepts task", async () => {
      const { executor, projectionService, createOrder } = createHarness();
      const order = createOrder();

      const offer = await executor.requestDispatch(order.orderId);
      expect(offer.status).toBe("offered");

      const acceptCommand: DriverAcceptTaskCommand = {
        acceptedAt: "2026-09-09T17:00:00Z",
      };

      const acceptResult = await executor.handleDriverAccept(
        offer.taskId!,
        acceptCommand,
      );
      expect(acceptResult.status).toBe("accepted");
      expect(acceptResult.assignmentId).toBe(offer.assignmentId);

      // Verify capacity moved from held to occupied
      const reservations = executor.getInMemReservations();
      const occupiedDriver = reservations.find(
        (r) =>
          r.resourceType === "driver" &&
          r.resourceId === offer.driverId &&
          r.status === "occupied",
      );
      const occupiedVehicle = reservations.find(
        (r) =>
          r.resourceType === "vehicle" &&
          r.resourceId === offer.vehicleId &&
          r.status === "occupied",
      );
      expect(occupiedDriver).toBeDefined();
      expect(occupiedVehicle).toBeDefined();

      // Voice projection reflects 'accepted' state with driver identity
      const projection = await projectionService.projectDispatch(order.orderId);
      expect(projection.projection).toBe("accepted");
      expect(projection.driverId).toBe(offer.driverId);
      expect(projection.vehicleId).toBe(offer.vehicleId);
      expect(projection.announcement).toContain("司機已接單");
      expect(VoiceDispatchProjectionViewSchema.safeParse(projection).success).toBe(
        true,
      );
    });

    it("releases reservation and advances to round 2 when driver rejects task", async () => {
      const { executor, createOrder } = createHarness();
      const order = createOrder();

      const offerRound1 = await executor.requestDispatch(order.orderId);
      expect(offerRound1.status).toBe("offered");
      expect(offerRound1.round).toBe(1);

      const rejectCommand: DriverRejectTaskCommand = {
        reasonCode: "busy",
        reasonNote: "Driver unable to take ride",
      };

      const rejectResult = await executor.handleDriverReject(
        offerRound1.taskId!,
        rejectCommand,
      );
      expect(rejectResult.status).toBe("rejected");
      expect(rejectResult.nextRound).toBe(2);

      // Verify Round 1 reservation was released
      const reservations = executor.getInMemReservations();
      const releasedDriver = reservations.find(
        (r) =>
          r.assignmentId === offerRound1.assignmentId &&
          r.resourceType === "driver" &&
          r.status === "released",
      );
      expect(releasedDriver).toBeDefined();

      // Verify Round 2 offer was created with a different driver
      const offerRound2 = rejectResult.nextOffer;
      expect(offerRound2.status).toBe("offered");
      expect(offerRound2.round).toBe(2);
      expect(offerRound2.driverId).not.toBe(offerRound1.driverId);

      // Verify Round 2 driver reservation is held
      const heldRound2 = reservations.find(
        (r) =>
          r.assignmentId === offerRound2.assignmentId &&
          r.resourceType === "driver" &&
          r.status === "held",
      );
      expect(heldRound2).toBeDefined();
    });

    it("rolls back on resource reservation conflict and deterministically advances to next candidate without leaving orphan active assignments", async () => {
      const { executor, ownedMobilityService, createOrder } = createHarness();

      // Order A takes candidate 1
      const orderA = createOrder({ passengerName: "Order A" });
      const offerA = await executor.requestDispatch(orderA.orderId);
      expect(offerA.status).toBe("offered");

      // Order B requests dispatch: candidate 1 is held by Order A, so Order B should automatically pick candidate 2
      const orderB = createOrder({ passengerName: "Order B" });
      const offerB = await executor.requestDispatch(orderB.orderId);
      expect(offerB.status).toBe("offered");

      // Verify Order B did not collide with Order A's driver/vehicle
      expect(offerB.driverId).not.toBe(offerA.driverId);
      expect(offerB.vehicleId).not.toBe(offerA.vehicleId);

      // Regression check (SD §7.6 losing-transaction rollback):
      // Verify Order B has EXACTLY ONE assignment (candidate 2), with NO orphan active assignment for candidate 1
      const orderBAssignments = ownedMobilityService.getDispatchAssignmentsForOrder(orderB.orderId);
      expect(orderBAssignments).toHaveLength(1);
      expect(orderBAssignments[0]?.assignmentId).toBe(offerB.assignmentId);
      expect(orderBAssignments[0]?.driverId).toBe(offerB.driverId);

      const activeOrderBAssignment = ownedMobilityService.getActiveDispatchAssignmentForOrder(orderB.orderId);
      expect(activeOrderBAssignment?.assignmentId).toBe(offerB.assignmentId);

      // Candidate 1's active driver task belongs ONLY to Order A, NOT Order B
      const candidate1ActiveTask = ownedMobilityService.getActiveDriverTaskForAssignment(offerA.assignmentId!);
      expect(candidate1ActiveTask?.driverId).toBe(offerA.driverId);
      expect(candidate1ActiveTask?.orderId).toBe(orderA.orderId);
    });

    it("rolls back cleanly with no orphan active assignments when all candidates encounter reservation conflicts (SD §7.6 losing-transaction rollback)", async () => {
      const { executor, ownedMobilityService, projectionService, createOrder } = createHarness();

      // Take all 3 candidates with orders A, B, C
      const orderA = createOrder({ passengerName: "Order A" });
      const offerA = await executor.requestDispatch(orderA.orderId);
      expect(offerA.status).toBe("offered");

      const orderB = createOrder({ passengerName: "Order B" });
      const offerB = await executor.requestDispatch(orderB.orderId);
      expect(offerB.status).toBe("offered");

      const orderC = createOrder({ passengerName: "Order C" });
      const offerC = await executor.requestDispatch(orderC.orderId);
      expect(offerC.status).toBe("offered");

      // Verify each order took a distinct driver
      const takenDrivers = new Set([offerA.driverId, offerB.driverId, offerC.driverId]);
      expect(takenDrivers.size).toBe(3);

      // Order D now requests dispatch: all 3 candidates collide
      const orderD = createOrder({ passengerName: "Order D" });
      const offerD = await executor.requestDispatch(orderD.orderId);
      expect(offerD.status).toBe("no_supply");
      expect(offerD.candidateCount).toBe(0);

      // Verify SD §7.6 losing-transaction rollback:
      // Order D must have ZERO active or orphan assignments
      const orderDAssignments = ownedMobilityService.getDispatchAssignmentsForOrder(orderD.orderId);
      expect(orderDAssignments).toHaveLength(0);

      const activeOrderDAssignment = ownedMobilityService.getActiveDispatchAssignmentForOrder(orderD.orderId);
      expect(activeOrderDAssignment).toBeNull();

      // None of the 3 drivers have any task for Order D
      for (const driverId of takenDrivers) {
        const orderDTasks = (ownedMobilityService as unknown as { driverTasks: { orderId: string; driverId: string }[] })
          .driverTasks.filter((t) => t.orderId === orderD.orderId && t.driverId === driverId);
        expect(orderDTasks).toHaveLength(0);
      }

      // Voice projection reflects 'retrying' with no driver/vehicle assigned
      const projectionD = await projectionService.projectDispatch(orderD.orderId);
      expect(projectionD.projection).toBe("retrying");
      expect(projectionD.assignmentId).toBeNull();
      expect(projectionD.driverId).toBeNull();
      expect(projectionD.vehicleId).toBeNull();
      expect(projectionD.announcement).toBe("仍在找車或重新安排");
    });

    it("explicitly rolls back in-memory assignment, task, outbox, and restores order/job state via rollbackDispatchAssignmentInMem", async () => {
      const { executor, ownedMobilityService, createOrder } = createHarness();
      const order = createOrder({ passengerName: "Order Rollback Test" });
      const previousOrder = { ...order };

      const offer = await executor.requestDispatch(order.orderId);
      expect(offer.status).toBe("offered");
      expect(ownedMobilityService.getDispatchAssignmentsForOrder(order.orderId)).toHaveLength(1);

      // Execute explicit rollback
      ownedMobilityService.rollbackDispatchAssignmentInMem(offer.assignmentId!, previousOrder);

      // Verify assignment and task are removed
      expect(ownedMobilityService.getDispatchAssignmentsForOrder(order.orderId)).toHaveLength(0);
      expect(ownedMobilityService.getActiveDispatchAssignmentForOrder(order.orderId)).toBeNull();
      expect(ownedMobilityService.getActiveDriverTaskForAssignment(offer.assignmentId!)).toBeNull();
      expect(() => ownedMobilityService.requireTask(offer.taskId!)).toThrow();

      // Verify order state was restored
      const restoredOrder = ownedMobilityService.requireOrder(order.orderId);
      expect(restoredOrder.status).toBe(previousOrder.status);
    });

    it("transitions to no_supply when candidate supply is exhausted", async () => {
      const { executor, projectionService, createOrder } = createHarness();
      const order = createOrder();

      // Dispatch order to create job
      const offerRound1 = await executor.requestDispatch(order.orderId);
      expect(offerRound1.status).toBe("offered");

      // Reject all candidates sequentially
      const reject1 = await executor.handleDriverReject(offerRound1.taskId!, {
        reasonCode: "busy",
      });
      expect(reject1.nextOffer.status).toBe("offered");
      expect(reject1.nextRound).toBe(2);

      const reject2 = await executor.handleDriverReject(
        reject1.nextOffer.taskId!,
        { reasonCode: "busy" },
      );
      expect(reject2.nextOffer.status).toBe("offered");
      expect(reject2.nextRound).toBe(3);

      const reject3 = await executor.handleDriverReject(
        reject2.nextOffer.taskId!,
        { reasonCode: "busy" },
      );
      // Now all 3 candidates have rejected -> transitions to no_supply
      expect(reject3.nextOffer.status).toBe("no_supply");
      expect(reject3.nextOffer.candidateCount).toBe(0);

      // Order status is now redispatch_required
      const projection = await projectionService.projectDispatch(order.orderId);
      expect(projection.projection).toBe("retrying");
      expect(projection.announcement).toBe("仍在找車或重新安排");
    });
  });

  describe("3. late_timeout_noop_evidence (Safe Timeout Fences)", () => {
    it("treats late timeout on already accepted offer as safe superseded_or_no_op and preserves occupied capacity", async () => {
      const { executor, createOrder } = createHarness();
      const order = createOrder();

      const offer = await executor.requestDispatch(order.orderId);
      expect(offer.status).toBe("offered");

      // Driver accepts
      await executor.handleDriverAccept(offer.taskId!, {
        acceptedAt: "2026-09-09T17:01:00Z",
      });

      // Expired timer fires for the already accepted assignment
      const timeoutCommand: AutonomousDispatchTimeoutCommand = {
        targetJobId: offer.dispatchJobId,
        round: 1,
        targetAssignmentId: offer.assignmentId!,
        assignmentVersion: 1,
        acceptanceDeadline: "2026-09-09T17:00:30Z",
        orderId: order.orderId,
      };

      const timeoutResult = await executor.handleOfferTimeout(timeoutCommand);
      expect(timeoutResult.outcome).toBe("superseded_or_no_op");
      expect(timeoutResult.reason).toBe("offer_already_accepted");

      // Verify occupied capacity is NOT released
      const reservations = executor.getInMemReservations();
      const stillOccupied = reservations.find(
        (r) =>
          r.assignmentId === offer.assignmentId &&
          r.status === "occupied",
      );
      expect(stillOccupied).toBeDefined();
    });

    it("treats timeout on superseded assignment as safe superseded_or_no_op and preserves newer assignment", async () => {
      const { executor, createOrder } = createHarness();
      const order = createOrder();

      const offerRound1 = await executor.requestDispatch(order.orderId);
      expect(offerRound1.status).toBe("offered");

      // Driver 1 rejects -> advances to round 2 with assignment 2
      const rejectResult = await executor.handleDriverReject(
        offerRound1.taskId!,
        { reasonCode: "busy" },
      );
      const offerRound2 = rejectResult.nextOffer;
      expect(offerRound2.status).toBe("offered");
      expect(offerRound2.assignmentId).not.toBe(offerRound1.assignmentId);

      // Now late timer for Round 1 fires with targetAssignmentId = Round 1
      const oldTimeoutCommand: AutonomousDispatchTimeoutCommand = {
        targetJobId: offerRound1.dispatchJobId,
        round: 1,
        targetAssignmentId: offerRound1.assignmentId!,
        assignmentVersion: 1,
        acceptanceDeadline: "2026-09-09T17:00:30Z",
        orderId: order.orderId,
      };

      const timeoutResult = await executor.handleOfferTimeout(oldTimeoutCommand);
      expect(timeoutResult.outcome).toBe("superseded_or_no_op");

      // Verify Round 2 reservation is still held and unaffected
      const reservations = executor.getInMemReservations();
      const round2Held = reservations.find(
        (r) =>
          r.assignmentId === offerRound2.assignmentId &&
          r.status === "held",
      );
      expect(round2Held).toBeDefined();
    });

    it("cancels pending assignment and retries next round when valid expired timeout occurs", async () => {
      const { executor, createOrder } = createHarness();
      const order = createOrder();

      const offer = await executor.requestDispatch(order.orderId);
      expect(offer.status).toBe("offered");

      // Timeout fires for currently active and pending offer
      const expiredTimeoutCommand: AutonomousDispatchTimeoutCommand = {
        targetJobId: offer.dispatchJobId,
        round: 1,
        targetAssignmentId: offer.assignmentId!,
        assignmentVersion: 1,
        acceptanceDeadline: new Date(Date.now() - 1000).toISOString(),
        orderId: order.orderId,
      };

      const timeoutResult = await executor.handleOfferTimeout(
        expiredTimeoutCommand,
      );
      expect(timeoutResult.outcome).toBe("timed_out_and_retried");
      expect(timeoutResult.nextRound).toBe(2);

      // Verify Round 1 assignment capacity is released
      const reservations = executor.getInMemReservations();
      const round1Released = reservations.find(
        (r) =>
          r.assignmentId === offer.assignmentId &&
          r.status === "released",
      );
      expect(round1Released).toBeDefined();

      // Verify Round 2 offer was triggered
      expect(timeoutResult.nextOffer?.status).toBe("offered");
      expect(timeoutResult.nextOffer?.round).toBe(2);
    });
  });

  describe("4. dispatch_truth_projection (Voice Truth Projection)", () => {
    it("correctly projects matching state", () => {
      const projectionService = new VoiceDispatchProjectionService();
      const order = {
        orderId: "order-proj-1",
        status: "ready_for_dispatch",
      } as never;
      const job = {
        dispatchJobId: "job-1",
        status: "matching",
      } as never;

      const view = projectionService.projectDispatchFromEntities(order, job);
      expect(view.projection).toBe("matching");
      expect(view.announcement).toBe("已受理，正在找車");
      expect(VoiceDispatchProjectionViewSchema.safeParse(view).success).toBe(true);
    });

    it("correctly projects offered state (driver identity hidden, ETA null)", () => {
      const projectionService = new VoiceDispatchProjectionService();
      const order = {
        orderId: "order-proj-2",
        status: "ready_for_dispatch",
      } as never;
      const job = {
        dispatchJobId: "job-2",
        status: "matching",
        latestEtaMinutes: 5,
      } as never;
      const assignment = {
        assignmentId: "asg-2",
        status: "assigned",
        driverId: "driver-2",
        vehicleId: "veh-2",
        acceptedAt: null,
      } as never;
      const task = {
        taskId: "task-2",
        status: "pending_acceptance",
        acceptedAt: null,
      } as never;

      const view = projectionService.projectDispatchFromEntities(
        order,
        job,
        assignment,
        task,
      );
      expect(view.projection).toBe("offered");
      expect(view.announcement).toBe("正在等候司機確認");
      expect(view.driverId).toBeNull();
      expect(view.vehicleId).toBeNull();
      expect(view.etaMinutes).toBeNull();
      expect(VoiceDispatchProjectionViewSchema.safeParse(view).success).toBe(true);
    });

    it("faithfully reports ETA absence (null) and only claims driver accepted on driver acceptance", () => {
      const projectionService = new VoiceDispatchProjectionService();

      // Case A: Accepted with ETA
      const orderWithEta = {
        orderId: "order-proj-3a",
        status: "driver_accepted",
      } as never;
      const jobWithEta = {
        dispatchJobId: "job-3a",
        status: "assigned",
        latestEtaMinutes: 8,
      } as never;
      const assignmentAccepted = {
        assignmentId: "asg-3a",
        status: "accepted",
        driverId: "driver-3a",
        vehicleId: "veh-3a",
        acceptedAt: "2026-09-09T17:10:00Z",
      } as never;
      const taskAccepted = {
        taskId: "task-3a",
        status: "accepted",
        acceptedAt: "2026-09-09T17:10:00Z",
      } as never;

      const viewWithEta = projectionService.projectDispatchFromEntities(
        orderWithEta,
        jobWithEta,
        assignmentAccepted,
        taskAccepted,
      );
      expect(viewWithEta.projection).toBe("accepted");
      expect(viewWithEta.announcement).toBe("司機已接單，預計 8 分鐘到達");
      expect(viewWithEta.etaMinutes).toBe(8);
      expect(viewWithEta.driverId).toBe("driver-3a");

      // Case B: Accepted WITHOUT ETA (null ETA fidelity)
      const jobWithoutEta = {
        dispatchJobId: "job-3b",
        status: "assigned",
        latestEtaMinutes: null,
      } as never;
      const viewWithoutEta = projectionService.projectDispatchFromEntities(
        orderWithEta,
        jobWithoutEta,
        assignmentAccepted,
        taskAccepted,
      );
      expect(viewWithoutEta.projection).toBe("accepted");
      expect(viewWithoutEta.announcement).toBe("司機已接單");
      expect(viewWithoutEta.etaMinutes).toBeNull();
      expect(
        VoiceDispatchProjectionViewSchema.safeParse(viewWithoutEta).success,
      ).toBe(true);
    });

    it("correctly projects arrived state", () => {
      const projectionService = new VoiceDispatchProjectionService();
      const order = {
        orderId: "order-proj-4",
        status: "arrived_pickup",
      } as never;
      const task = {
        taskId: "task-4",
        status: "arrived_pickup",
        arrivedPickupAt: "2026-09-09T17:15:00Z",
      } as never;

      const view = projectionService.projectDispatchFromEntities(
        order,
        null,
        null,
        task,
      );
      expect(view.projection).toBe("arrived");
      expect(view.announcement).toBe("車輛已到指定上車點");
      expect(view.etaMinutes).toBe(0);
      expect(VoiceDispatchProjectionViewSchema.safeParse(view).success).toBe(true);
    });

    it("correctly projects retrying state (cannot announce as cancelled)", () => {
      const projectionService = new VoiceDispatchProjectionService();
      const order = {
        orderId: "order-proj-5",
        status: "redispatch_required",
        lastDispatchFailureReason: "no_eligible_candidate",
      } as never;

      const view = projectionService.projectDispatchFromEntities(order);
      expect(view.projection).toBe("retrying");
      expect(view.announcement).toBe("仍在找車或重新安排");
      expect(view.announcement).not.toContain("取消");
      expect(VoiceDispatchProjectionViewSchema.safeParse(view).success).toBe(true);
    });

    it("correctly projects manual_intervention state", () => {
      const projectionService = new VoiceDispatchProjectionService();
      const order = {
        orderId: "order-proj-6",
        status: "exception_hold",
        exceptionHold: { reasonCode: "manual_intervention" },
      } as never;

      const view = projectionService.projectDispatchFromEntities(order);
      expect(view.projection).toBe("manual_intervention");
      expect(view.announcement).toBe("正在轉由調度協助");
      expect(VoiceDispatchProjectionViewSchema.safeParse(view).success).toBe(true);
    });

    it("correctly projects terminal states", () => {
      const projectionService = new VoiceDispatchProjectionService();

      const completedOrder = {
        orderId: "order-proj-7a",
        status: "completed",
      } as never;
      const completedView =
        projectionService.projectDispatchFromEntities(completedOrder);
      expect(completedView.projection).toBe("terminal");
      expect(completedView.announcement).toBe("行程已完成");

      const cancelledOrder = {
        orderId: "order-proj-7b",
        status: "cancelled",
        cancelReason: "passenger_cancelled",
      } as never;
      const cancelledView =
        projectionService.projectDispatchFromEntities(cancelledOrder);
      expect(cancelledView.projection).toBe("terminal");
      expect(cancelledView.announcement).toBe("訂單已取消");
    });
  });

  describe("5. Operation Key Replay & Idempotency", () => {
    it("replays idempotent receipt on repeated requestDispatch", async () => {
      const { executor, createOrder } = createHarness();
      const order = createOrder();

      const offer1 = await executor.requestDispatch(order.orderId, {
        idempotencyKey: `idemp:req:${order.orderId}`,
      });
      const offer2 = await executor.requestDispatch(order.orderId, {
        idempotencyKey: `idemp:req:${order.orderId}`,
      });

      expect(offer1.assignmentId).toBe(offer2.assignmentId);
      expect(offer1.taskId).toBe(offer2.taskId);
      expect(offer1.round).toBe(offer2.round);
    });

    it("replays idempotent receipt on repeated handleDriverAccept", async () => {
      const { executor, createOrder } = createHarness();
      const order = createOrder();

      const offer = await executor.requestDispatch(order.orderId);
      const command: DriverAcceptTaskCommand = {
        acceptedAt: "2026-09-09T17:30:00Z",
      };

      const res1 = await executor.handleDriverAccept(offer.taskId!, command);
      const res2 = await executor.handleDriverAccept(offer.taskId!, command);

      expect(res1.status).toBe("accepted");
      expect(res2.status).toBe("accepted");
      expect(res1.acceptedAt).toBe(res2.acceptedAt);
    });
  });
});
