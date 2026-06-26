import { afterEach, describe, expect, it } from "vitest";

import { EventEmitter2 } from "@nestjs/event-emitter";

import { buildMockRecorderFixture } from "../../../../packages/shared-test-fixtures/src";

import { ApiRequestError } from "../../src/common/api-envelope";
import { OpsDispatchEventsService } from "../../src/common/ops-dispatch-events.service";
import { AuditNotificationService } from "../../src/modules/audit-notification/audit-notification.service";
import { BillingSettlementService } from "../../src/modules/billing-settlement/billing-settlement.service";
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

const SAMPLE_PROOF_PHOTO = "cHJvb2YtcDItMDA4LTAwMQ==";

function createHarness() {
  const eventEmitter = new EventEmitter2();
  const auditNotificationService = new AuditNotificationService();
  const opsDispatchEventsService = new OpsDispatchEventsService(eventEmitter);
  const driverProfileService = new DriverProfileService(
    auditNotificationService,
  );
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
  (sandboxDispatchGateService as any).disclosurePolicies = [
    {
      policyId: "policy-test-av-001",
      policyVersion: "test-v1",
      tenantId: null,
      businessDispatchSubtype: null,
      partnerEntrySlug: null,
      active: true,
      channelRules: [
        {
          channel: "tenant_portal",
          messageCode: "sandbox_passenger_disclosure.av_program_notice",
          requiresAcknowledgement: false,
          acknowledgementMode: "operator_confirmed_notice",
        },
        {
          channel: "partner_portal",
          messageCode: "sandbox_passenger_disclosure.av_program_notice",
          requiresAcknowledgement: false,
          acknowledgementMode: "operator_confirmed_notice",
        },
      ],
      createdAt: "2026-06-26T00:00:00.000Z",
      updatedAt: "2026-06-26T00:00:00.000Z",
    },
  ];
  (sandboxDispatchGateService as any).disclosureCacheLoaded = true;
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
  const billingSettlementRepository = {
    isEnabled: () => true,
    loadState: async () => ({
      tenantBillingProfiles: [],
      tenantInvoices: [],
      driverFeePlans: [],
      driverStatements: [],
      reimbursementBatches: [],
      reconciliationIssues: [],
    }),
    persistChanges: async () => undefined,
    reportPersistenceFailure: () => undefined,
    listLiveCompletedTenantTrips: async (
      tenantId: string,
      periodStart: string,
      periodEnd: string,
    ) => {
      const start = new Date(periodStart).getTime();
      const end = new Date(periodEnd).getTime();
      const ordersById = new Map(
        ownedMobilityService
          .listOrders()
          .filter((order) => order.tenantId === tenantId)
          .map((order) => [order.orderId, order]),
      );

      return ownedMobilityService
        .listDriverTasks()
        .filter(
          (task) =>
            task.status === "completed" &&
            task.completedAt &&
            new Date(task.completedAt).getTime() >= start &&
            new Date(task.completedAt).getTime() <= end,
        )
        .flatMap((task) => {
          const order = ordersById.get(task.orderId);
          if (!order) {
            return [];
          }

          return [
            {
              tenantId: order.tenantId ?? tenantId,
              driverId: task.driverId,
              orderId: order.orderId,
              completedAt: task.completedAt ?? order.updatedAt,
              grossEarning: task.fare ??
                order.quotedFare ?? {
                  currency: "NTD",
                  amountMinor: 0,
                },
              orderSource: order.orderSource,
              serviceBucket: order.serviceBucket,
              businessDispatchSubtype: order.businessDispatchSubtype,
              costCenterCode: order.costCenter,
              riderId: order.passenger.passengerId ?? null,
              partnerId: order.partnerId,
              partnerProgramId: order.partnerProgramId,
              partnerEntrySlug: order.partnerEntrySlug,
              eligibilityVerificationId: order.eligibilityVerificationId,
              issuerAuthorizationRef: order.issuerAuthorizationRef,
              benefitReference: order.benefitReference,
            },
          ];
        });
    },
    listLiveDriverTripsInPeriod: async () => [],
    listLiveDriverTripsInPeriodForDriver: async () => [],
  };
  const billingSettlementService = new BillingSettlementService(
    auditNotificationService,
    billingSettlementRepository as never,
  );

  return {
    auditNotificationService,
    billingSettlementService,
    ownedMobilityService,
    rocOperationsService,
    sandboxDispatchGateService,
    cleanup: async () => {
      await taskEventsService.onModuleDestroy();
      await opsDispatchEventsService.onModuleDestroy();
    },
  };
}

describe("INT-P2-008 / E2E-P2-008 ROC fallback to human", () => {
  const cleanups: Array<() => Promise<void>> = [];

  afterEach(async () => {
    while (cleanups.length > 0) {
      await cleanups.pop()?.();
    }
  });

  it("E2E-P2-008 reuses the same booking and order when the sandbox gate requires human fallback", async () => {
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
      passengerDisclosure: {
        channel: "tenant_portal" as const,
        policyId: "policy-test-av-001",
        policyVersion: "test-v1",
        messageCode: "sandbox_passenger_disclosure.av_program_notice",
        requiresAcknowledgement: false,
        acknowledgementMode: "operator_confirmed_notice" as const,
        acknowledgedAt: null,
        acknowledgementRecordId: null,
      },
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
      auditNotificationService
        .listAuditLogs()
        .map((auditLog) => auditLog.actionName),
    ).toEqual(
      expect.arrayContaining([
        "roc.intervention.started",
        "roc.intervention.resolved",
        "roc.fallback_to_human.reported",
        "roc_fallback_to_human",
      ]),
    );
  });

  it("rejects gate-triggered human fallback when the sandbox decision does not require fallback", async () => {
    const {
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
        pickup: { address: "Governed Start", lat: 25.044, lng: 121.522 },
        dropoff: { address: "Governed End", lat: 25.054, lng: 121.533 },
        passenger: { name: "Rider Guard", phone: "0912000013" },
      },
      "tenant-demo-001",
    );
    const dispatchResult = ownedMobilityService.dispatchOrder(booking.orderId, {
      mode: "auto",
    });
    const decision = await sandboxDispatchGateService.evaluateDispatch({
      passengerDisclosure: {
        channel: "tenant_portal" as const,
        policyId: "policy-test-av-001",
        policyVersion: "test-v1",
        messageCode: "sandbox_passenger_disclosure.av_program_notice",
        requiresAcknowledgement: false,
        acknowledgementMode: "operator_confirmed_notice" as const,
        acknowledgedAt: null,
        acknowledgementRecordId: null,
      },
      orderId: booking.orderId,
      dispatchJobId: dispatchResult.dispatchJobId,
      vehicleId: "veh-av-demo-001",
      sandboxProgramId: "phase2-tesla-fsd-sandbox-202606",
      policyVersion: "sandbox-dispatch-gate.v1",
      bookingWindow: {
        start: "2026-06-26T14:00:00.000Z",
        end: "2026-06-26T15:00:00.000Z",
      },
      entitlement: {
        active: true,
      },
      vehicleEnrollment: {
        status: "active",
        approvedAreaIds: ["odd-area-demo"],
        approvedRouteIds: ["odd-route-demo"],
      },
      safetyOperator: {
        required: false,
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
      operatingArea: {
        inBounds: true,
        boundaryRisk: false,
        matchedAreaIds: ["odd-area-demo"],
      },
      routeContainment: {
        contained: true,
        matchedRouteIds: ["odd-route-demo"],
      },
    });

    expect(decision.decision).toBe("allow");
    expect(decision.fallbackRequired).toBe(false);

    try {
      await rocOperationsService.fallbackTripToHuman(
        booking.orderId,
        {
          dispatchJobId: dispatchResult.dispatchJobId,
          sandboxDecisionId: decision.decisionId,
          humanVehicleId: "veh-human-003",
          humanDriverId: "drv-human-003",
          revisedEtaMinutes: 12,
          reason:
            "Operator attempted gate fallback without a fallback-required decision",
          rocOperatorId: "ops-roc-003",
          trigger: "gate_fallback_required",
        },
        null,
        "req-p2-fallback-003",
      );

      throw new Error("Expected gate-triggered human fallback to reject");
    } catch (error) {
      expect(error).toBeInstanceOf(ApiRequestError);
      expect((error as ApiRequestError).getResponse()).toMatchObject({
        error: {
          code: "SANDBOX_FALLBACK_NOT_REQUIRED",
        },
      });
    }

    expect(rocOperationsService.listInterventions()).toHaveLength(0);
    expect(rocOperationsService.listFallbackReports()).toHaveLength(0);
    expect(
      ownedMobilityService
        .listDriverTasks()
        .filter((task) => task.orderId === booking.orderId),
    ).toHaveLength(0);
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
    expect(
      ownedMobilityService.getOrder(booking.orderId).etaSnapshot,
    ).toMatchObject({
      etaMinutes: 11,
    });
    expect(
      auditNotificationService
        .listAuditLogs()
        .map((auditLog) => auditLog.actionName),
    ).toEqual(
      expect.arrayContaining([
        "reassign_dispatch",
        "roc.intervention.started",
        "roc.intervention.resolved",
        "roc.fallback_to_human.reported",
      ]),
    );
  });

  it("UAT-AV-010 keeps billing and audit chain intact after AV fallback to human", async () => {
    const {
      auditNotificationService,
      billingSettlementService,
      ownedMobilityService,
      rocOperationsService,
      sandboxDispatchGateService,
      cleanup,
    } = createHarness();
    cleanups.push(cleanup);

    const booking = await ownedMobilityService.createTenantBooking(
      {
        businessDispatchSubtype: "enterprise_dispatch",
        reservationWindowStart: "2026-05-26T14:00:00.000Z",
        reservationWindowEnd: "2026-05-26T15:00:00.000Z",
        pickup: { address: "Neihu AV Hub", lat: 25.0823, lng: 121.5671 },
        dropoff: { address: "Songshan Airport", lat: 25.0697, lng: 121.5518 },
        passenger: { name: "Rider Billing", phone: "0912000012" },
      },
      "tenant-demo-001",
    );
    const dispatchResult = ownedMobilityService.dispatchOrder(booking.orderId, {
      mode: "auto",
    });
    const decision = await sandboxDispatchGateService.evaluateDispatch({
      passengerDisclosure: {
        channel: "tenant_portal" as const,
        policyId: "policy-test-av-001",
        policyVersion: "test-v1",
        messageCode: "sandbox_passenger_disclosure.av_program_notice",
        requiresAcknowledgement: false,
        acknowledgementMode: "operator_confirmed_notice" as const,
        acknowledgedAt: null,
        acknowledgementRecordId: null,
      },
      orderId: booking.orderId,
      dispatchJobId: dispatchResult.dispatchJobId,
      vehicleId: "veh-av-missing-001",
      sandboxProgramId: "phase2-tesla-fsd-sandbox-202606",
      policyVersion: "sandbox-dispatch-gate.v1",
    });

    const fallback = await rocOperationsService.fallbackTripToHuman(
      booking.orderId,
      {
        dispatchJobId: dispatchResult.dispatchJobId,
        sandboxDecisionId: decision.decisionId,
        humanVehicleId: "veh-human-010",
        humanDriverId: "drv-human-010",
        revisedEtaMinutes: 16,
        reason: "AV cannot continue and ROC switched to human taxi",
        rocOperatorId: "ops-roc-010",
        trigger: "gate_fallback_required",
      },
      null,
      "req-p2-fallback-010",
    );

    ownedMobilityService.acceptDriverTask(
      fallback.taskId,
      { acceptedAt: "2026-05-26T14:06:00.000Z" },
      "req-p2-accept-010",
    );
    ownedMobilityService.departDriverTask(
      fallback.taskId,
      {
        departedAt: "2026-05-26T14:08:00.000Z",
        currentLocation: { lat: 25.0802, lng: 121.5651 },
      },
      "req-p2-depart-010",
    );
    ownedMobilityService.arrivedPickup(
      fallback.taskId,
      { arrivedAt: "2026-05-26T14:19:00.000Z" },
      "req-p2-arrive-010",
    );
    ownedMobilityService.startDriverTask(
      fallback.taskId,
      { startedAt: "2026-05-26T14:23:00.000Z" },
      "req-p2-start-010",
    );
    ownedMobilityService.completeDriverTask(
      fallback.taskId,
      {
        completedAt: "2026-05-26T14:47:00.000Z",
        actualDistanceKm: 12.4,
        actualDurationSec: 1440,
        proof: {
          photos: [SAMPLE_PROOF_PHOTO],
        },
      },
      "req-p2-complete-010",
    );

    const invoice = await billingSettlementService.generateTenantInvoice(
      "tenant-demo-001",
      {
        tenantId: "tenant-demo-001",
        periodStart: "2026-05-01T00:00:00.000Z",
        periodEnd: "2026-05-31T23:59:59.000Z",
      },
      "req-p2-invoice-010",
    );

    expect(fallback.report).toMatchObject({
      bookingId: booking.bookingId,
      orderId: booking.orderId,
      dispatchJobId: dispatchResult.dispatchJobId,
      sandboxDecisionId: decision.decisionId,
      fallbackAssignmentId: fallback.assignmentId,
      fallbackTaskId: fallback.taskId,
    });
    expect(
      ownedMobilityService
        .listOrders()
        .filter((order) => order.bookingId === booking.bookingId),
    ).toHaveLength(1);
    expect(ownedMobilityService.getOrder(booking.orderId)).toMatchObject({
      bookingId: booking.bookingId,
      status: "completed",
    });
    expect(ownedMobilityService.getDriverTask(fallback.taskId)).toMatchObject({
      taskId: fallback.taskId,
      driverId: "drv-human-010",
      vehicleId: "veh-human-010",
      status: "completed",
    });
    expect(invoice.lines).toEqual(
      expect.arrayContaining([
        expect.objectContaining({
          orderId: booking.orderId,
        }),
      ]),
    );
    expect(
      auditNotificationService
        .listAuditLogs()
        .map((auditLog) => auditLog.actionName),
    ).toEqual(
      expect.arrayContaining([
        "roc_fallback_to_human",
        "roc.fallback_to_human.reported",
        "accept_task",
        "depart_task",
        "arrive_pickup",
        "start_trip",
        "complete_trip",
      ]),
    );
  });
});
