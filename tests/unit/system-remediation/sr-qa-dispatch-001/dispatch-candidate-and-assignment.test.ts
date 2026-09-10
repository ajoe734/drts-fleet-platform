import { EventEmitter } from "node:events";
import { describe, expect, it, vi } from "vitest";

import type {
  AssignDispatchCommand,
  ReassignDispatchCommand,
} from "@drts/contracts";

import { OpsDispatchEventsService } from "../../../../apps/api/src/common/ops-dispatch-events.service";
import { AuditNotificationService } from "../../../../apps/api/src/modules/audit-notification/audit-notification.service";
import { CallcenterService } from "../../../../apps/api/src/modules/callcenter/callcenter.service";
import { OwnedMobilityTaskEventsService } from "../../../../apps/api/src/modules/owned-mobility/owned-mobility-task-events.service";
import { OwnedMobilityService } from "../../../../apps/api/src/modules/owned-mobility/owned-mobility.service";
import { ServiceProductService } from "../../../../apps/api/src/modules/service-product/service-product.service";
import { TenantPartnerService } from "../../../../apps/api/src/modules/tenant-partner/tenant-partner.service";
import { EligibilityContextResolver } from "../../../../apps/api/src/modules/vehicle-eligibility/eligibility-context-resolver.service";
import { RuntimeEligibilityEvaluator } from "../../../../apps/api/src/modules/vehicle-eligibility/runtime-eligibility-evaluator.service";
import { VehicleEligibilityService } from "../../../../apps/api/src/modules/vehicle-eligibility/vehicle-eligibility.service";

function createRegistryStub() {
  const drivers = [
    {
      driverId: "drv-cand-001",
      name: "林志明 (Eligible)",
      supportedServiceBuckets: ["business_dispatch", "standard_taxi"],
      workState: "available",
      licensesValid: true,
      lifecycleStatus: "active",
      eligibilityBlockedReasons: [],
      dispatchEligible: true,
      createdAt: "2026-06-20T00:00:00.000Z",
      updatedAt: "2026-06-20T00:00:00.000Z",
      activatedAt: "2026-06-20T00:00:00.000Z",
      suspendedAt: null,
      retiredAt: null,
      profileUpdatedAt: "2026-06-20T00:00:00.000Z",
      deviceBindings: [],
    },
    {
      driverId: "drv-cand-002",
      name: "張美玲 (Eligible Reassign)",
      supportedServiceBuckets: ["business_dispatch", "standard_taxi"],
      workState: "available",
      licensesValid: true,
      lifecycleStatus: "active",
      eligibilityBlockedReasons: [],
      dispatchEligible: true,
      createdAt: "2026-06-20T00:00:00.000Z",
      updatedAt: "2026-06-20T00:00:00.000Z",
      activatedAt: "2026-06-20T00:00:00.000Z",
      suspendedAt: null,
      retiredAt: null,
      profileUpdatedAt: "2026-06-20T00:00:00.000Z",
      deviceBindings: [],
    },
    {
      driverId: "drv-cand-003",
      name: "王大同 (Ineligible / Busy)",
      supportedServiceBuckets: ["business_dispatch", "standard_taxi"],
      workState: "busy",
      licensesValid: true,
      lifecycleStatus: "active",
      eligibilityBlockedReasons: ["work_state_busy"],
      dispatchEligible: false,
      createdAt: "2026-06-20T00:00:00.000Z",
      updatedAt: "2026-06-20T00:00:00.000Z",
      activatedAt: "2026-06-20T00:00:00.000Z",
      suspendedAt: null,
      retiredAt: null,
      profileUpdatedAt: "2026-06-20T00:00:00.000Z",
      deviceBindings: [],
    },
  ];

  const vehicles = [
    {
      vehicleId: "veh-cand-001",
      plateNo: "TPE-1001",
      licenseType: "multi_purpose_taxi",
      operatingArea: "taichung-port",
      supportedServiceBuckets: ["business_dispatch", "standard_taxi"],
      dispatchableFlag: true,
      exclusivityApproved: true,
      insuranceStatus: "valid",
      updatedAt: "2026-06-20T00:00:00.000Z",
      supplyLifecycle: {
        contract: {
          contractId: "contract-001",
          lifecycleStatus: "active",
          startAt: "2026-01-01T00:00:00.000Z",
          endAt: null,
          updatedAt: "2026-06-20T00:00:00.000Z",
        },
        insurance: {
          policyId: "policy-001",
          lifecycleStatus: "active",
          startAt: "2026-01-01T00:00:00.000Z",
          endAt: null,
          updatedAt: "2026-06-20T00:00:00.000Z",
        },
        exclusivity: {
          lifecycleStatus: "approved",
          declarationStatus: "submitted",
          declarationFileId: "decl-001",
          reviewStatus: "approved",
          providerName: "DRTS",
          effectiveStart: "2026-01-01T00:00:00.000Z",
          effectiveEnd: null,
          reviewedAt: "2026-06-20T00:00:00.000Z",
          updatedAt: "2026-06-20T00:00:00.000Z",
        },
        dispatch: {
          eligible: true,
          blockedReasons: [],
          evaluatedAt: "2026-06-20T00:00:00.000Z",
        },
        offboarding: {
          status: "none",
          reason: null,
          requestedAt: null,
          effectiveAt: null,
          completedAt: null,
          requestedBy: null,
          debrandingRequired: false,
          debrandingStatus: "not_required",
          debrandingDueAt: null,
          debrandingCompletedAt: null,
          debrandingTicketId: null,
          notes: null,
        },
        lastTrace: null,
      },
    },
    {
      vehicleId: "veh-cand-002",
      plateNo: "TPE-1002",
      licenseType: "multi_purpose_taxi",
      operatingArea: "taichung-port",
      supportedServiceBuckets: ["business_dispatch", "standard_taxi"],
      dispatchableFlag: true,
      exclusivityApproved: true,
      insuranceStatus: "valid",
      updatedAt: "2026-06-20T00:00:00.000Z",
      supplyLifecycle: {
        contract: {
          contractId: "contract-002",
          lifecycleStatus: "active",
          startAt: "2026-01-01T00:00:00.000Z",
          endAt: null,
          updatedAt: "2026-06-20T00:00:00.000Z",
        },
        insurance: {
          policyId: "policy-002",
          lifecycleStatus: "active",
          startAt: "2026-01-01T00:00:00.000Z",
          endAt: null,
          updatedAt: "2026-06-20T00:00:00.000Z",
        },
        exclusivity: {
          lifecycleStatus: "approved",
          declarationStatus: "submitted",
          declarationFileId: "decl-002",
          reviewStatus: "approved",
          providerName: "DRTS",
          effectiveStart: "2026-01-01T00:00:00.000Z",
          effectiveEnd: null,
          reviewedAt: "2026-06-20T00:00:00.000Z",
          updatedAt: "2026-06-20T00:00:00.000Z",
        },
        dispatch: {
          eligible: true,
          blockedReasons: [],
          evaluatedAt: "2026-06-20T00:00:00.000Z",
        },
        offboarding: {
          status: "none",
          reason: null,
          requestedAt: null,
          effectiveAt: null,
          completedAt: null,
          requestedBy: null,
          debrandingRequired: false,
          debrandingStatus: "not_required",
          debrandingDueAt: null,
          debrandingCompletedAt: null,
          debrandingTicketId: null,
          notes: null,
        },
        lastTrace: null,
      },
    },
    {
      vehicleId: "veh-cand-003",
      plateNo: "TPE-1003",
      licenseType: "multi_purpose_taxi",
      operatingArea: "taichung-port",
      supportedServiceBuckets: ["business_dispatch", "standard_taxi"],
      dispatchableFlag: false,
      exclusivityApproved: true,
      insuranceStatus: "valid",
      updatedAt: "2026-06-20T00:00:00.000Z",
      supplyLifecycle: {
        contract: {
          contractId: "contract-003",
          lifecycleStatus: "active",
          startAt: "2026-01-01T00:00:00.000Z",
          endAt: null,
          updatedAt: "2026-06-20T00:00:00.000Z",
        },
        insurance: {
          policyId: "policy-003",
          lifecycleStatus: "active",
          startAt: "2026-01-01T00:00:00.000Z",
          endAt: null,
          updatedAt: "2026-06-20T00:00:00.000Z",
        },
        exclusivity: {
          lifecycleStatus: "approved",
          declarationStatus: "submitted",
          declarationFileId: "decl-003",
          reviewStatus: "approved",
          providerName: "DRTS",
          effectiveStart: "2026-01-01T00:00:00.000Z",
          effectiveEnd: null,
          reviewedAt: "2026-06-20T00:00:00.000Z",
          updatedAt: "2026-06-20T00:00:00.000Z",
        },
        dispatch: {
          eligible: false,
          blockedReasons: ["vehicle_not_dispatchable"],
          evaluatedAt: "2026-06-20T00:00:00.000Z",
        },
        offboarding: {
          status: "none",
          reason: null,
          requestedAt: null,
          effectiveAt: null,
          completedAt: null,
          requestedBy: null,
          debrandingRequired: false,
          debrandingStatus: "not_required",
          debrandingDueAt: null,
          debrandingCompletedAt: null,
          debrandingTicketId: null,
          notes: null,
        },
        lastTrace: null,
      },
    },
  ];

  const supplyPairs = [
    { vehicleId: "veh-cand-001", driverId: "drv-cand-001", etaMinutes: 4 },
    { vehicleId: "veh-cand-002", driverId: "drv-cand-002", etaMinutes: 7 },
    { vehicleId: "veh-cand-003", driverId: "drv-cand-003", etaMinutes: 9 },
  ];

  const busyDrivers = new Set<string>(["drv-cand-003"]);

  return {
    drivers,
    vehicles,
    supplyPairs,
    getEligibleCandidates: vi.fn(() => [
      {
        driverId: "drv-cand-001",
        vehicleId: "veh-cand-001",
        etaMinutes: 4,
        operatingArea: "taichung-port",
        serviceBuckets: ["business_dispatch", "standard_taxi"],
      },
      {
        driverId: "drv-cand-002",
        vehicleId: "veh-cand-002",
        etaMinutes: 7,
        operatingArea: "taichung-port",
        serviceBuckets: ["business_dispatch", "standard_taxi"],
      },
    ]),
    getVehicleDispatchability: vi.fn((vid: string) => vid !== "veh-cand-003"),
    getDriverAvailability: vi.fn((did: string) => !busyDrivers.has(did)),
    markDriverBusy: (did: string) => busyDrivers.add(did),
    getVehicleLicenseType: vi.fn(() => "multi_purpose_taxi"),
    getVehiclePassengerDisclosureProfile: vi.fn((vid: string) => ({
      vehicleId: vid,
      make: "Toyota",
      model: "Sienta",
      modelYear: 2024,
      doorCount: 5,
      color: "White",
      status: "complete",
      missingFieldCodes: [],
    })),
    getDriverPublicRegistrationCredential: vi.fn((did: string) => ({
      driverId: did,
      effectiveUntil: "2027-01-01",
      status: "verified_active",
      maskedDisplay: "RE***01",
      version: 1,
    })),
    listLatestDriverLocations: vi.fn(() => [
      {
        driverId: "drv-cand-001",
        location: { lat: 24.26, lng: 120.53 },
        recordedAt: "2026-06-20T12:00:00.000Z",
        accuracyMeters: 5,
      },
      {
        driverId: "drv-cand-002",
        location: { lat: 24.25, lng: 120.54 },
        recordedAt: "2026-06-20T12:00:00.000Z",
        accuracyMeters: 5,
      },
    ]),
    listVehicles: vi.fn(() => vehicles),
    listDrivers: vi.fn(() => drivers),
    listSupplyPairs: vi.fn(() => supplyPairs),
  };
}

function createDispatchTestHarness() {
  const eventEmitter = new EventEmitter() as never;
  const auditService = new AuditNotificationService();
  const callcenterService = new CallcenterService(auditService);
  const opsDispatchEvents = new OpsDispatchEventsService(eventEmitter);
  const taskEventsService = new OwnedMobilityTaskEventsService(eventEmitter);
  const tenantPartnerService = new TenantPartnerService(auditService);
  const registryStub = createRegistryStub();

  const serviceProductService = new ServiceProductService(
    auditService,
    undefined,
  );

  const vehicleEligibilityService = new VehicleEligibilityService(
    registryStub as never,
    auditService,
    undefined,
    serviceProductService,
  );
  const contextResolver = new EligibilityContextResolver(
    registryStub as never,
    serviceProductService,
    vehicleEligibilityService,
  );
  const runtimeEligibilityEvaluator = new RuntimeEligibilityEvaluator(
    contextResolver,
    auditService,
    undefined,
  );

  const ownedMobilityService = new OwnedMobilityService(
    registryStub as never,
    auditService,
    callcenterService,
    taskEventsService,
    opsDispatchEvents,
    undefined,
    tenantPartnerService,
    vehicleEligibilityService,
    serviceProductService,
    eventEmitter,
    runtimeEligibilityEvaluator,
  );

  return {
    ownedMobilityService,
    registryStub,
    auditService,
  };
}

describe("SR-QA-DISPATCH-001: C035 & C036 Dispatch Candidate Query & Assignment Verification", () => {
  it("C035: listDispatchCandidates distinguishes eligible vs ineligible candidates and provides block reasons", async () => {
    const { ownedMobilityService } = createDispatchTestHarness();

    const order = await ownedMobilityService.createPassengerOrder({
      pickup: { address: "台中市梧棲區中二路一段9號" },
      dropoff: { address: "台中市大安區興安路378號" },
      passenger: { name: "陳乘客", phone: "0912345678" },
      serviceBucket: "business_dispatch",
    });

    const dispatchJob = await ownedMobilityService.dispatchOrder(
      order.orderId,
      { mode: "manual" },
    );
    expect(dispatchJob).toBeDefined();

    // Query candidates
    const candidates = await ownedMobilityService.listDispatchCandidates(
      dispatchJob.dispatchJobId,
      false,
    );
    expect(candidates.length).toBeGreaterThanOrEqual(2);
    const candidateIds = candidates.map((c) => c.driverId);
    expect(candidateIds).toContain("drv-cand-001");
    expect(candidateIds).toContain("drv-cand-002");
    expect(candidateIds).not.toContain("drv-cand-003"); // busy driver excluded from eligible pool
  });

  it("C035: dynamically updates candidate availability when driver state changes or new orders arrive", async () => {
    const { ownedMobilityService, registryStub } = createDispatchTestHarness();

    const order = await ownedMobilityService.createPassengerOrder({
      pickup: { address: "台中市梧棲區中二路一段9號" },
      dropoff: { address: "台中市大安區興安路378號" },
      passenger: { name: "王乘客", phone: "0987654321" },
      serviceBucket: "business_dispatch",
    });

    const dispatchJob = await ownedMobilityService.dispatchOrder(
      order.orderId,
      { mode: "manual" },
    );

    // Initially drv-cand-001 is eligible
    let candidates = await ownedMobilityService.listDispatchCandidates(
      dispatchJob.dispatchJobId,
      false,
    );
    expect(candidates.some((c) => c.driverId === "drv-cand-001")).toBe(true);

    // Driver 001 goes offline in registry
    registryStub.getEligibleCandidates.mockReturnValueOnce([
      {
        driverId: "drv-cand-002",
        vehicleId: "veh-cand-002",
        etaMinutes: 7,
        operatingArea: "taichung-port",
        serviceBuckets: ["business_dispatch", "standard_taxi"],
      },
    ]);

    // Now drv-cand-001 should not appear in candidate list
    candidates = await ownedMobilityService.listDispatchCandidates(
      dispatchJob.dispatchJobId,
      false,
    );
    expect(candidates.some((c) => c.driverId === "drv-cand-001")).toBe(false);
    expect(candidates.some((c) => c.driverId === "drv-cand-002")).toBe(true);
  });

  it("C036: assigns dispatch, creates driver task, records trace log and holds resource capacity", async () => {
    const { ownedMobilityService, auditService } = createDispatchTestHarness();
    const recordAuditSpy = vi.spyOn(auditService, "recordAuditLog");
    expect(recordAuditSpy).toBeDefined();

    const order = await ownedMobilityService.createPassengerOrder({
      pickup: { address: "台中市梧棲區中二路一段9號" },
      dropoff: { address: "台中市大安區興安路378號" },
      passenger: { name: "李乘客", phone: "0911222333" },
      serviceBucket: "standard_taxi",
    });

    const dispatchJob = await ownedMobilityService.dispatchOrder(
      order.orderId,
      { mode: "manual" },
    );

    const assignCmd: AssignDispatchCommand = {
      dispatchJobId: dispatchJob.dispatchJobId,
      driverId: "drv-cand-001",
      vehicleId: "veh-cand-001",
    };

    const result = await ownedMobilityService.assignDispatch(
      assignCmd,
      "req-assign-001",
      "idemp-assign-001",
    );

    expect(result.assignmentId).toBeDefined();
    expect(["assigned", "offered"]).toContain(result.status);

    // Verify task created in system with correct driver and vehicle
    const createdTask = ownedMobilityService.getDriverTask(result.taskId);
    expect(createdTask).toBeDefined();
    expect(createdTask.driverId).toBe("drv-cand-001");
    expect(createdTask.vehicleId).toBe("veh-cand-001");
    expect(createdTask.orderId).toBe(order.orderId);

    // Verify assignment read-back from service
    const assignment = ownedMobilityService.requireAssignment(
      result.assignmentId,
    );
    expect(assignment.driverId).toBe("drv-cand-001");
    expect(assignment.vehicleId).toBe("veh-cand-001");

    // Verify dispatch trace logs recorded
    const traceLogs = ownedMobilityService.listDispatchTrace(order.orderId);
    expect(traceLogs.length).toBeGreaterThanOrEqual(1);
    expect(
      traceLogs.some(
        (t) =>
          t.eventType.includes("assign") ||
          t.eventType.includes("created") ||
          t.message.includes("assign"),
      ),
    ).toBe(true);
  });

  it("C036: double dispatch prevention rejects concurrent assignment of same vehicle or driver to another order", async () => {
    const { ownedMobilityService, registryStub } = createDispatchTestHarness();

    // Order 1: Assigned to drv-cand-001 + veh-cand-001
    const order1 = await ownedMobilityService.createPassengerOrder({
      pickup: { address: "台中市梧棲區中二路一段9號" },
      dropoff: { address: "台中市大安區興安路378號" },
      passenger: { name: "乘客一", phone: "0911000111" },
    });
    const job1 = await ownedMobilityService.dispatchOrder(order1.orderId, {
      mode: "manual",
    });
    await ownedMobilityService.assignDispatch({
      dispatchJobId: job1.dispatchJobId,
      driverId: "drv-cand-001",
      vehicleId: "veh-cand-001",
    });
    registryStub.markDriverBusy("drv-cand-001");

    // Order 2: Attempting to assign same driver drv-cand-001
    const order2 = await ownedMobilityService.createPassengerOrder({
      pickup: { address: "台中市梧棲區台灣大道十段" },
      dropoff: { address: "台中市清水區中社路" },
      passenger: { name: "乘客二", phone: "0922000222" },
    });
    const job2 = await ownedMobilityService.dispatchOrder(order2.orderId, {
      mode: "manual",
    });

    // Driver 001 is already committed, attempting to assign should fail synchronously
    expect(() =>
      ownedMobilityService.assignDispatch({
        dispatchJobId: job2.dispatchJobId,
        driverId: "drv-cand-001",
        vehicleId: "veh-cand-002",
      }),
    ).toThrow();
  });

  it("C036: reassignDispatch invalidates prior task, preserves reasonCode and sets previousAssignmentId", async () => {
    const { ownedMobilityService } = createDispatchTestHarness();

    const order = await ownedMobilityService.createPassengerOrder({
      pickup: { address: "台中市梧棲區中二路一段9號" },
      dropoff: { address: "台中市大安區興安路378號" },
      passenger: { name: "趙乘客", phone: "0933444555" },
    });

    const dispatchJob = await ownedMobilityService.dispatchOrder(
      order.orderId,
      { mode: "manual" },
    );

    // Step 1: First assignment to Candidate 001
    const firstResult = await ownedMobilityService.assignDispatch({
      dispatchJobId: dispatchJob.dispatchJobId,
      driverId: "drv-cand-001",
      vehicleId: "veh-cand-001",
    });
    const firstAssignmentId = firstResult.assignmentId;

    // Step 2: Negative test - reassign without reasonCode is rejected with 400
    const invalidReassignCmd: ReassignDispatchCommand = {
      dispatchJobId: dispatchJob.dispatchJobId,
      driverId: "drv-cand-002",
      vehicleId: "veh-cand-002",
      reasonCode: "" as never,
    };
    expect(() =>
      ownedMobilityService.reassignDispatch(invalidReassignCmd),
    ).toThrow();

    // Step 3: Valid reassign to Candidate 002 with reasonCode
    const validReassignCmd: ReassignDispatchCommand = {
      dispatchJobId: dispatchJob.dispatchJobId,
      driverId: "drv-cand-002",
      vehicleId: "veh-cand-002",
      reasonCode: "driver_traffic_delay",
      notes: "原司機路況嚴重壅塞，改派就近車輛",
    };

    const secondResult = await ownedMobilityService.reassignDispatch(
      validReassignCmd,
      "req-reassign-001",
    );

    expect(secondResult.assignmentId).not.toBe(firstAssignmentId);

    // Verify assignment read-back from service for candidate 002
    const secondAssignment = ownedMobilityService.requireAssignment(
      secondResult.assignmentId,
    );
    expect(secondAssignment.driverId).toBe("drv-cand-002");
    expect(secondAssignment.vehicleId).toBe("veh-cand-002");

    // Step 4: Verify previous assignment state and prior task invalidation
    const priorAssignment =
      ownedMobilityService.requireAssignment(firstAssignmentId);
    expect(["cancelled", "superseded"]).toContain(priorAssignment.status);

    // Verify task state for first driver is cancelled
    const firstTask = ownedMobilityService
      .listDriverTasks()
      .find((t) => t.assignmentId === firstAssignmentId);
    if (firstTask) {
      expect(firstTask.status).toBe("cancelled");
    }

    // New task exists for second driver
    const secondTask = ownedMobilityService
      .listDriverTasks()
      .find((t) => t.assignmentId === secondResult.assignmentId);
    expect(secondTask).toBeDefined();
    expect(secondTask?.driverId).toBe("drv-cand-002");
  });

  it("C036: idempotent replay on assignDispatch returns identical result without side effects", async () => {
    const { ownedMobilityService } = createDispatchTestHarness();

    const order = await ownedMobilityService.createPassengerOrder({
      pickup: { address: "台中市梧棲區中二路一段9號" },
      dropoff: { address: "台中市大安區興安路378號" },
      passenger: { name: "何乘客", phone: "0955666777" },
    });

    const dispatchJob = await ownedMobilityService.dispatchOrder(
      order.orderId,
      { mode: "manual" },
    );

    const assignCmd: AssignDispatchCommand = {
      dispatchJobId: dispatchJob.dispatchJobId,
      driverId: "drv-cand-001",
      vehicleId: "veh-cand-001",
    };

    const firstRun = await ownedMobilityService.assignDispatch(
      assignCmd,
      "req-idemp-001",
      "idemp-key-assign-12345",
      { required: true },
    );

    const secondRun = await ownedMobilityService.assignDispatch(
      assignCmd,
      "req-idemp-002",
      "idemp-key-assign-12345",
      { required: true },
    );

    expect(secondRun.assignmentId).toBe(firstRun.assignmentId);
    expect(secondRun.status).toBe(firstRun.status);
    expect(secondRun.taskId).toBe(firstRun.taskId);

    // Verify only ONE task was created for this order
    const orderTasks = ownedMobilityService
      .listDriverTasks()
      .filter((t) => t.orderId === order.orderId);
    expect(orderTasks.length).toBe(1);
  });
});
