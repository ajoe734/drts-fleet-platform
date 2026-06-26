import { afterEach, describe, expect, it } from "vitest";

import { EventEmitter2 } from "@nestjs/event-emitter";

import { buildMockRecorderFixture } from "../../../../packages/shared-test-fixtures/src";

import { OpsDispatchEventsService } from "../../src/common/ops-dispatch-events.service";
import { AuditNotificationService } from "../../src/modules/audit-notification/audit-notification.service";
import { CallcenterService } from "../../src/modules/callcenter/callcenter.service";
import { DriverProfileService } from "../../src/modules/driver-profile/driver-profile.service";
import { OwnedMobilityService } from "../../src/modules/owned-mobility/owned-mobility.service";
import { OwnedMobilityTaskEventsService } from "../../src/modules/owned-mobility/owned-mobility-task-events.service";
import { RegulatoryRegistryService } from "../../src/modules/regulatory-registry/regulatory-registry.service";
import { RocOperationsService } from "../../src/modules/roc-operations/roc-operations.service";
import { SandboxDispatchGateService } from "../../src/modules/sandbox-dispatch-gate/sandbox-dispatch-gate.service";
import { SandboxGovernanceService } from "../../src/modules/sandbox-governance/sandbox-governance.service";
import { ServiceProductService } from "../../src/modules/service-product/service-product.service";
import { VehicleEligibilityService } from "../../src/modules/vehicle-eligibility/vehicle-eligibility.service";
import { VehicleEvidenceService } from "../../src/modules/vehicle-evidence/vehicle-evidence.service";

function createHarness() {
  const eventEmitter = new EventEmitter2();
  const auditNotificationService = new AuditNotificationService();
  const opsDispatchEventsService = new OpsDispatchEventsService(eventEmitter);
  const driverProfileService = new DriverProfileService(auditNotificationService);
  const regulatoryRegistryRepository = {
    isEnabled: () => true,
    upsertDriverLocation: async () => true,
  };
  const regulatoryRegistryService = new RegulatoryRegistryService(
    opsDispatchEventsService,
    auditNotificationService,
    driverProfileService,
    regulatoryRegistryRepository as never,
  );
  const callcenterService = new CallcenterService(auditNotificationService);
  const taskEventsService = new OwnedMobilityTaskEventsService(eventEmitter);
  const serviceProductService = new ServiceProductService(
    auditNotificationService,
    undefined,
  );
  const vehicleEligibilityService = new VehicleEligibilityService(
    regulatoryRegistryService,
    auditNotificationService,
    undefined,
    serviceProductService,
  );
  vehicleEligibilityService.assertDispatchAssignmentEligible = () => undefined;
  const sandboxGovernanceService = new SandboxGovernanceService(
    auditNotificationService,
    undefined,
  );
  const vehicleEvidenceService = new VehicleEvidenceService();
  vehicleEvidenceService.registerRecorder(
    buildMockRecorderFixture({
      recorderId: "rec-veh-av-demo-001",
      vehicleId: "veh-av-demo-001",
    }),
  );
  const sandboxDispatchGateService = new SandboxDispatchGateService(
    vehicleEvidenceService,
    sandboxGovernanceService,
  );
  const ownedMobilityService = new OwnedMobilityService(
    regulatoryRegistryService,
    auditNotificationService,
    callcenterService,
    taskEventsService,
    opsDispatchEventsService,
    undefined,
    undefined,
    vehicleEligibilityService,
    serviceProductService,
    undefined,
    undefined,
    sandboxDispatchGateService,
  );
  const rocOperationsService = new RocOperationsService(
    ownedMobilityService,
    sandboxDispatchGateService,
    auditNotificationService,
  );

  return {
    auditNotificationService,
    ownedMobilityService,
    rocOperationsService,
    sandboxDispatchGateService,
    cleanup: async () => {
      await taskEventsService.onModuleDestroy();
      await opsDispatchEventsService.onModuleDestroy();
    },
  };
}

describe("INT-P2-008 ROC fallback to human", () => {
  const cleanups: Array<() => Promise<void>> = [];

  afterEach(async () => {
    while (cleanups.length > 0) {
      await cleanups.pop()?.();
    }
  });

  it("reuses the same booking and order when the sandbox gate requires human fallback", async () => {
    const {
      auditNotificationService,
      ownedMobilityService,
      rocOperationsService,
      sandboxDispatchGateService,
      cleanup,
    } = createHarness();
    cleanups.push(cleanup);

    const booking = await ownedMobilityService.createTenantBooking(
      {
        businessDispatchSubtype: "enterprise_dispatch",
        reservationWindowStart: "2026-06-26T14:00:00.000Z",
        reservationWindowEnd: "2026-06-26T15:00:00.000Z",
        pickup: { address: "Taipei 101", lat: 25.0338, lng: 121.5646 },
        dropoff: { address: "Taipei Main Station", lat: 25.0478, lng: 121.517 },
        passenger: { name: "Rider Gate", phone: "0912000010" },
      },
      "tenant-demo-001",
    );
    const dispatchResult = ownedMobilityService.dispatchOrder(booking.orderId, {
      mode: "auto",
    });
    const decision = await sandboxDispatchGateService.evaluateDispatch({
      orderId: booking.orderId,
      dispatchJobId: dispatchResult.dispatchJobId,
      vehicleId: "veh-av-missing-001",
      sandboxProgramId: "phase2-tesla-fsd-sandbox-202606",
      policyVersion: "sandbox-dispatch-gate.v1",
    });

    expect(decision.decision).toBe("block");
    expect(decision.fallbackRequired).toBe(true);

    const result = await rocOperationsService.fallbackTripToHuman(
      booking.orderId,
      {
        dispatchJobId: dispatchResult.dispatchJobId,
        sandboxDecisionId: decision.decisionId,
        humanVehicleId: "veh-human-001",
        humanDriverId: "drv-human-001",
        revisedEtaMinutes: 18,
        reason: "AV gate blocked by sandbox governance",
        rocOperatorId: "ops-roc-001",
        trigger: "gate_fallback_required",
      },
      null,
      "req-p2-fallback-001",
    );

    expect(result.orderId).toBe(booking.orderId);
    expect(result.bookingId).toBe(booking.bookingId);
    expect(result.dispatchJobId).toBe(dispatchResult.dispatchJobId);
    expect(result.status).toBe("assigned");
    expect(result.etaSnapshot).toMatchObject({
      etaMinutes: 18,
    });
    expect(result.report).toMatchObject({
      tripId: booking.orderId,
      orderId: booking.orderId,
      bookingId: booking.bookingId,
      dispatchJobId: dispatchResult.dispatchJobId,
      sandboxDecisionId: decision.decisionId,
      humanVehicleId: "veh-human-001",
      humanDriverId: "drv-human-001",
      revisedEtaMinutes: 18,
    });
    expect(result.receipt).toMatchObject({
      resourceType: "sandbox_exception_report",
      resourceId: result.report.reportId,
      status: "completed",
    });

    const updatedOrder = ownedMobilityService.getOrder(booking.orderId);
    expect(updatedOrder.bookingId).toBe(booking.bookingId);
    expect(updatedOrder.etaSnapshot).toMatchObject({
      etaMinutes: 18,
    });
    expect(updatedOrder.complianceFlags).toEqual(
      expect.arrayContaining([
        "sandbox_human_fallback",
        "sandbox_exception_reported",
      ]),
    );
    expect(
      ownedMobilityService
        .listOrders()
        .filter((order) => order.bookingId === booking.bookingId),
    ).toHaveLength(1);
    expect(ownedMobilityService.getDriverTask(result.taskId)).toMatchObject({
      driverId: "drv-human-001",
      vehicleId: "veh-human-001",
      orderId: booking.orderId,
    });
    expect(ownedMobilityService.listDispatchTrace(booking.orderId)).toEqual(
      expect.arrayContaining([
        expect.objectContaining({
          eventType: "roc.fallback_to_human",
          details: expect.objectContaining({
            reportId: result.report.reportId,
            fallbackAssignmentId: result.assignmentId,
          }),
        }),
      ]),
    );
    expect(
      auditNotificationService.listAuditLogs().map((auditLog) => auditLog.actionName),
    ).toEqual(
      expect.arrayContaining([
        "roc.intervention.started",
        "roc.intervention.resolved",
        "roc.fallback_to_human.reported",
        "roc_fallback_to_human",
      ]),
    );
  });

  it("cancels the active AV assignment and creates a human replacement assignment on the same dispatch job", async () => {
    const {
      auditNotificationService,
      ownedMobilityService,
      rocOperationsService,
      cleanup,
    } = createHarness();
    cleanups.push(cleanup);

    const booking = await ownedMobilityService.createTenantBooking(
      {
        businessDispatchSubtype: "enterprise_dispatch",
        reservationWindowStart: "2026-06-26T14:00:00.000Z",
        reservationWindowEnd: "2026-06-26T15:00:00.000Z",
        pickup: { address: "Route Start", lat: 25.044, lng: 121.522 },
        dropoff: { address: "Route End", lat: 25.054, lng: 121.533 },
        passenger: { name: "Rider Reassign", phone: "0912000011" },
      },
      "tenant-demo-001",
    );
    const dispatchResult = ownedMobilityService.dispatchOrder(booking.orderId, {
      mode: "auto",
    });
    const avAssignment = await ownedMobilityService.assignDispatch({
      dispatchJobId: dispatchResult.dispatchJobId,
      vehicleId: "veh-av-demo-001",
      driverId: "safety-op-001",
      sandboxDispatchSnapshot: {
        entitlement: {
          active: true,
        },
        candidateRoute: {
          type: "MultiLineString",
          coordinates: [
            [
              [121.522, 25.044],
              [121.526, 25.047],
              [121.529, 25.05],
              [121.533, 25.054],
            ],
          ],
        },
        providerCapabilities: {
          av_dispatch: true,
          telemetry_stream: true,
          regulatory_event_feed: true,
          evidence_recorder: true,
          odd_geofence: true,
          minimal_risk_condition: true,
        },
        telemetry: {
          stale: false,
          minimalRiskConditionActive: false,
          socPercent: 80,
          currentTripCount: 0,
          odometerKm: 25_000,
        },
        regulatory: {
          approvalFresh: true,
          vehicleCertified: true,
        },
        recorder: {
          healthy: true,
        },
      },
    });

    const result = await rocOperationsService.fallbackTripToHuman(
      booking.orderId,
      {
        dispatchJobId: dispatchResult.dispatchJobId,
        humanVehicleId: "veh-human-002",
        humanDriverId: "drv-human-002",
        revisedEtaMinutes: 11,
        reason: "AV entered minimal risk condition",
        rocOperatorId: "ops-roc-002",
        trigger: "roc_manual_intervention",
      },
      null,
      "req-p2-fallback-002",
    );

    expect(result.dispatchJobId).toBe(dispatchResult.dispatchJobId);
    expect(result.assignmentId).not.toBe(avAssignment.assignmentId);
    expect(result.report).toMatchObject({
      previousAssignmentId: avAssignment.assignmentId,
      avVehicleId: "veh-av-demo-001",
      humanVehicleId: "veh-human-002",
      humanDriverId: "drv-human-002",
      revisedEtaMinutes: 11,
    });

    const tasks = ownedMobilityService
      .listDriverTasks()
      .filter((task) => task.orderId === booking.orderId);
    expect(tasks).toEqual(
      expect.arrayContaining([
        expect.objectContaining({
          taskId: avAssignment.taskId,
          status: "cancelled",
          vehicleId: "veh-av-demo-001",
        }),
        expect.objectContaining({
          taskId: result.taskId,
          status: "pending_acceptance",
          vehicleId: "veh-human-002",
          driverId: "drv-human-002",
          dispatchJobId: dispatchResult.dispatchJobId,
        }),
      ]),
    );
    expect(ownedMobilityService.getOrder(booking.orderId).etaSnapshot).toMatchObject({
      etaMinutes: 11,
    });
    expect(
      auditNotificationService.listAuditLogs().map((auditLog) => auditLog.actionName),
    ).toEqual(
      expect.arrayContaining([
        "reassign_dispatch",
        "roc.intervention.started",
        "roc.intervention.resolved",
        "roc.fallback_to_human.reported",
      ]),
    );
  });
});
