import { EventEmitter2 } from "@nestjs/event-emitter";
import { afterEach, describe, expect, it } from "vitest";

import { buildMockRecorderFixture } from "../../../../packages/shared-test-fixtures/src";

import { ApiRequestError } from "../../src/common/api-envelope";
import type { BootstrapRequestIdentity } from "../../src/common/auth";
import { CallcenterService } from "../../src/modules/callcenter/callcenter.service";
import { OwnedMobilityTaskEventsService } from "../../src/modules/owned-mobility/owned-mobility-task-events.service";
import { OwnedMobilityService } from "../../src/modules/owned-mobility/owned-mobility.service";
import { SandboxDispatchGateService } from "../../src/modules/sandbox-dispatch-gate/sandbox-dispatch-gate.service";
import type { SandboxDispatchStoredEvaluationRecord } from "../../src/modules/sandbox-dispatch-gate/sandbox-dispatch-gate.types";
import type { SandboxGovernanceService } from "../../src/modules/sandbox-governance/sandbox-governance.service";
import { ServiceProductService } from "../../src/modules/service-product/service-product.service";
import {
  DEFAULT_SANDBOX_PROGRAM_ID,
  DEFAULT_SAFETY_OPERATOR_ID,
  buildReadyDispatchGateInput,
  createPublicFleetHarness,
} from "./e2e-p2-test-helpers";

const TENANT_ID = "tenant-demo-001";
const AV_VEHICLE_ID = "veh-av-demo-001";
const SCHEDULE_DATE = "2026-06-26";
const BOOKING_START = `${SCHEDULE_DATE}T14:00:00.000Z`;
const BOOKING_END = `${SCHEDULE_DATE}T15:00:00.000Z`;
const PASSENGER_DISCLOSURE_MESSAGE_CODE =
  "sandbox_passenger_disclosure.av_program_notice";
const PASSENGER_DISCLOSURE_MESSAGE_ENTRY = {
  entryId: "pdc-test-av-en-us",
  catalogVersion: "passenger_disclosure.v1",
  messageCode: PASSENGER_DISCLOSURE_MESSAGE_CODE,
  locale: "en-US",
  bodyText:
    "This trip may be fulfilled by an autonomous vehicle operating under the sandbox program.",
  legalApproved: true,
  createdAt: "2026-06-26T00:00:00.000Z",
  updatedAt: "2026-06-26T00:00:00.000Z",
};
const READY_SANDBOX_DISPATCH_SNAPSHOT = {
  candidateRoute: {
    type: "MultiLineString" as const,
    coordinates: [
      [
        [121.5319, 25.0478],
        [121.5436, 25.052],
      ],
    ],
  },
  entitlement: { active: true },
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
    odometerKm: 2_500,
    qualityScore: 0.99,
    providerHealthState: "healthy" as const,
    dispatchHold: false,
  },
  regulatory: {
    approvalFresh: true,
    vehicleCertified: true,
  },
  recorder: {
    healthy: true,
  },
  holdState: {
    activeSafetyIncident: false,
    programSuspended: false,
    vehicleHold: false,
  },
  limits: {
    minSocPercent: 20,
    maxConcurrentTrips: 1,
    maxOdometerKm: 250_000,
  },
};
const TENANT_IDENTITY: BootstrapRequestIdentity = {
  authMode: "bootstrap_headers",
  actorType: "tenant_admin",
  actorId: "tenant-admin-e2e-p2-008",
  realm: "tenant",
  tenantId: TENANT_ID,
  roleFamilies: ["tenant"],
  roles: ["tenant_admin"],
  scopes: ["bookings:write", "dispatch:write"],
  requestId: "req-e2e-p2-008-tenant-admin",
};

type InMemoryGateStore = {
  decisions: SandboxDispatchStoredEvaluationRecord[];
  policies: Array<Record<string, unknown>>;
  messageCatalogEntries: Array<Record<string, unknown>>;
  acknowledgements: Array<Record<string, unknown>>;
};

function buildSandboxGovernanceStub(
  safetyOperatorId: string = DEFAULT_SAFETY_OPERATOR_ID,
  sandboxProgramId: string = DEFAULT_SANDBOX_PROGRAM_ID,
) {
  const schedule = {
    scheduleId: "sched-downtown-core-all-day",
    active: true,
    daysOfWeek: [5],
    startLocalTime: "00:00",
    endLocalTime: "23:59",
    effectiveFrom: "2026-06-01T00:00:00.000Z",
    effectiveUntil: null,
  };

  return {
    listSafetyOperatorQualifications: () => [
      {
        qualificationId: `qual-${safetyOperatorId}`,
        sandboxProgramId,
        safetyOperatorId,
        providerCode: "tesla",
        version: 1,
        status: "qualified",
        approvedAreaIds: ["odd-downtown-core"],
        approvedRouteIds: ["route-downtown-loop"],
        certificationRefs: ["cert-001"],
        effectiveFrom: "2026-06-01T00:00:00.000Z",
        effectiveUntil: null,
        createdAt: "2026-06-01T00:00:00.000Z",
        updatedAt: "2026-06-01T00:00:00.000Z",
      },
    ],
    listVehicleEnrollments: () => [
      {
        enrollmentId: "enroll-veh-av-demo-001",
        sandboxProgramId,
        vehicleId: AV_VEHICLE_ID,
        providerCode: "tesla",
        version: 1,
        status: "active",
        approvedAreaIds: ["odd-downtown-core"],
        approvedRouteIds: ["route-downtown-loop"],
        maxConcurrentTrips: 1,
        effectiveFrom: "2026-06-01T00:00:00.000Z",
        effectiveUntil: null,
        createdAt: "2026-06-01T00:00:00.000Z",
        updatedAt: "2026-06-01T00:00:00.000Z",
      },
    ],
    validatePointInApprovedArea: async () => ({
      inApprovedArea: true,
      matches: [
        {
          areaId: "odd-downtown-core",
          areaKind: "operating_area",
        },
      ],
    }),
    validateRouteContainment: async () => ({
      contained: true,
      routeIds: ["route-downtown-loop"],
    }),
    listOperatingAreas: () => [
      {
        sandboxProgramId,
        areaId: "odd-downtown-core",
        schedules: [schedule],
      },
    ],
    listRoutes: () => [
      {
        sandboxProgramId,
        routeId: "route-downtown-loop",
        schedules: [schedule],
      },
    ],
  } as SandboxGovernanceService;
}

function createInMemoryGateRepository(store: InMemoryGateStore) {
  return {
    isEnabled: () => true,
    persistEvaluation: async (
      record: Omit<SandboxDispatchStoredEvaluationRecord, "releaseAudit"> & {
        releaseAudit?: Record<string, unknown> | null;
      },
    ) => {
      const nextRecord: SandboxDispatchStoredEvaluationRecord = {
        decision: {
          ...record.decision,
          hardReasonCodes: [...record.decision.hardReasonCodes],
          softReasonCodes: [...record.decision.softReasonCodes],
        },
        evaluationSnapshot: JSON.parse(
          JSON.stringify(record.evaluationSnapshot),
        ) as SandboxDispatchStoredEvaluationRecord["evaluationSnapshot"],
        releaseAudit: record.releaseAudit ?? null,
      };
      store.decisions = [
        nextRecord,
        ...store.decisions.filter(
          (candidate) =>
            candidate.decision.decisionId !== nextRecord.decision.decisionId,
        ),
      ];
    },
    loadLatestDecision: async (orderId: string) =>
      store.decisions.find((record) => record.decision.orderId === orderId) ??
      null,
    loadDecisionById: async (decisionId: string) =>
      store.decisions.find((record) => record.decision.decisionId === decisionId) ??
      null,
    updateReleaseAudit: async (
      decisionId: string,
      releaseAudit: Record<string, unknown>,
    ) => {
      const existing = store.decisions.find(
        (record) => record.decision.decisionId === decisionId,
      );
      if (existing) {
        existing.releaseAudit = releaseAudit;
      }
    },
    listPassengerDisclosurePolicies: async () =>
      store.policies.map((policy) => JSON.parse(JSON.stringify(policy))),
    listPassengerDisclosureMessageCatalogEntries: async () =>
      store.messageCatalogEntries.map((entry) => JSON.parse(JSON.stringify(entry))),
    listPassengerAcknowledgements: async () =>
      store.acknowledgements.map((record) => JSON.parse(JSON.stringify(record))),
    upsertPassengerDisclosurePolicy: async (policy: Record<string, unknown>) => {
      store.policies = [
        JSON.parse(JSON.stringify(policy)),
        ...store.policies.filter(
          (candidate) => candidate.policyId !== policy.policyId,
        ),
      ];
    },
    upsertPassengerDisclosureMessageCatalogEntry: async (
      entry: Record<string, unknown>,
    ) => {
      store.messageCatalogEntries = [
        JSON.parse(JSON.stringify(entry)),
        ...store.messageCatalogEntries.filter(
          (candidate) =>
            candidate.entryId !== entry.entryId &&
            !(
              candidate.messageCode === entry.messageCode &&
              candidate.locale === entry.locale
            ),
        ),
      ];
    },
    insertPassengerAcknowledgement: async (record: Record<string, unknown>) => {
      store.acknowledgements = [
        JSON.parse(JSON.stringify(record)),
        ...store.acknowledgements.filter(
          (candidate) =>
            candidate.acknowledgementId !== record.acknowledgementId,
        ),
      ];
    },
    reportPersistenceFailure: () => undefined,
  };
}

function createOwnedMobilityDispatchHarness() {
  const publicHarness = createPublicFleetHarness({
    safetyOperatorId: DEFAULT_SAFETY_OPERATOR_ID,
    sandboxProgramId: DEFAULT_SANDBOX_PROGRAM_ID,
  });
  const sandboxGovernanceService = buildSandboxGovernanceStub(
    publicHarness.safetyOperatorId,
    publicHarness.sandboxProgramId,
  );
  const store: InMemoryGateStore = {
    decisions: [],
    policies: [],
    messageCatalogEntries: [PASSENGER_DISCLOSURE_MESSAGE_ENTRY],
    acknowledgements: [],
  };
  const sandboxDispatchGateService = new SandboxDispatchGateService(
    publicHarness.vehicleEvidenceService,
    sandboxGovernanceService,
    createInMemoryGateRepository(store) as never,
    publicHarness.auditNotificationService,
    publicHarness.rocOperationsService,
  );
  const callcenterService = new CallcenterService(
    publicHarness.auditNotificationService,
  );
  const taskEventsService = new OwnedMobilityTaskEventsService(
    new EventEmitter2(),
  );
  const serviceProductService = new ServiceProductService(
    publicHarness.auditNotificationService,
    undefined,
  );
  const originalVehicleDispatchability =
    publicHarness.regulatoryRegistryService.getVehicleDispatchability.bind(
      publicHarness.regulatoryRegistryService,
    );
  publicHarness.regulatoryRegistryService.getVehicleDispatchability = ((
    vehicleId,
    serviceBucket,
  ) =>
    vehicleId === AV_VEHICLE_ID
      ? true
      : originalVehicleDispatchability(vehicleId, serviceBucket)) as never;
  const originalDriverAvailability =
    publicHarness.regulatoryRegistryService.getDriverAvailability.bind(
      publicHarness.regulatoryRegistryService,
    );
  publicHarness.regulatoryRegistryService.getDriverAvailability = ((
    driverId,
    serviceBucket,
  ) =>
    driverId === publicHarness.safetyOperatorId
      ? true
      : originalDriverAvailability(driverId, serviceBucket)) as never;

  const ownedMobilityService = new OwnedMobilityService(
    publicHarness.regulatoryRegistryService,
    publicHarness.auditNotificationService,
    callcenterService,
    taskEventsService,
    publicHarness.opsDispatchEventsService,
    undefined,
    undefined,
    undefined,
    serviceProductService,
    undefined,
    undefined,
    undefined,
    sandboxDispatchGateService,
  );

  return {
    ...publicHarness,
    ownedMobilityService,
    sandboxDispatchGateService,
    store,
    cleanup: async () => {
      await taskEventsService.onModuleDestroy();
      await publicHarness.opsDispatchEventsService.onModuleDestroy();
    },
  };
}

async function assignAvDispatch(
  ownedMobilityService: OwnedMobilityService,
  dispatchJobId: string,
  sandboxDispatchSnapshot?: Record<string, unknown>,
) {
  return ownedMobilityService.assignDispatch({
    dispatchJobId,
    vehicleId: AV_VEHICLE_ID,
    driverId: DEFAULT_SAFETY_OPERATOR_ID,
    ...(sandboxDispatchSnapshot
      ? { sandboxDispatchSnapshot: sandboxDispatchSnapshot as never }
      : {}),
  });
}

async function expectApiError(
  action: Promise<unknown>,
  expectedCode: string,
) {
  try {
    await action;
    throw new Error(`Expected ApiRequestError ${expectedCode}`);
  } catch (error) {
    expect(error).toBeInstanceOf(ApiRequestError);
    expect((error as ApiRequestError).getResponse()).toMatchObject({
      error: {
        code: expectedCode,
      },
    });
  }
}

const cleanups: Array<() => Promise<void>> = [];

describe("E2E-P2-008 human fallback", () => {
  afterEach(async () => {
    while (cleanups.length > 0) {
      await cleanups.pop()?.();
    }
  });

  it("routes the vehicle into human fallback and activates stop-dispatch plus operational hold together", async () => {
    const harness = createPublicFleetHarness();
    harness.vehicleEvidenceService.registerRecorder(
      buildMockRecorderFixture({
        recorderId: "rec-e2e-p2-008",
        vehicleId: "veh-demo-001",
      }),
    );
    harness.vehicleEvidenceService.updateRecorderHealth("rec-e2e-p2-008", {
      overall: "unhealthy",
      clockDriftMs: 18_000,
      uploadQueueState: "error",
      uploadPendingCount: 1,
      storageState: "error",
    });

    const receipt = harness.rocOperationsService.fallbackToHuman(
      "roc-alert-recorder-veh-demo-001",
      {
        reason: "Autonomy behavior degraded; human supervisor required.",
      },
      {
        authMode: "bootstrap_headers",
        actorType: "ops_user",
        actorId: "roc-user-e2e-p2-008",
        realm: "ops",
        tenantId: null,
        roleFamilies: ["ops"],
        roles: ["roc_operator", "ops_supervisor", "dispatch_manager"],
        scopes: ["dispatch:read", "dispatch:write"],
        requestId: "req-e2e-p2-008",
      },
    );

    const restrictions =
      harness.rocOperationsService.getDispatchRestrictions("veh-demo-001");
    const vehicle = harness.rocOperationsService
      .listVehicles(null)
      .find((item) => item.vehicleId === "veh-demo-001");
    const evaluatedDecision = await harness.sandboxDispatchGateService.evaluateDispatch(
      buildReadyDispatchGateInput({
        orderId: "ord-e2e-p2-008",
        vehicleId: "veh-demo-001",
        sandboxProgramId: harness.sandboxProgramId,
        policyVersion: "phase2-e2e-p2-008",
      }),
    );

    expect(receipt).toMatchObject({
      status: "completed",
      resourceId: "roc-alert-recorder-veh-demo-001",
      message:
        "fallback-to-human: Vehicle veh-demo-001 routed to human fallback.",
    });
    expect(restrictions).toMatchObject({
      stopNewDispatchActive: true,
      operationalHoldActive: true,
      humanFallbackActive: true,
      reasonCodes: expect.arrayContaining([
        "ROC_STOP_NEW_DISPATCH",
        "ROC_OPERATIONAL_HOLD",
      ]),
    });
    expect(vehicle).toMatchObject({
      vehicleId: "veh-demo-001",
      humanFallbackActive: true,
      stopNewDispatchActive: true,
      operationalHoldActive: true,
    });
    expect(evaluatedDecision).toMatchObject({
      decision: "block",
      hardReasonCodes: expect.arrayContaining([
        "ROC_STOP_NEW_DISPATCH",
        "ROC_OPERATIONAL_HOLD",
      ]),
    });
  });

  it("blocks AV assignment when the dispatch snapshot is sparse and persists the gate decision", async () => {
    const harness = createOwnedMobilityDispatchHarness();
    cleanups.push(harness.cleanup);
    await harness.sandboxDispatchGateService.upsertPassengerDisclosurePolicy({
      policyVersion: "policy-e2e-p2-008-sparse",
      tenantId: TENANT_ID,
      businessDispatchSubtype: "enterprise_dispatch",
      channelRules: [
        {
          channel: "tenant_portal",
          messageCode: PASSENGER_DISCLOSURE_MESSAGE_CODE,
          requiresAcknowledgement: false,
          acknowledgementMode: "operator_confirmed_notice",
        },
      ],
    });

    const booking = await harness.ownedMobilityService.createTenantBooking(
      {
        businessDispatchSubtype: "enterprise_dispatch",
        reservationWindowStart: BOOKING_START,
        reservationWindowEnd: BOOKING_END,
        pickup: { address: "Taipei 101", lat: 25.0338, lng: 121.5645 },
        dropoff: {
          address: "Songshan Cultural Park",
          lat: 25.044,
          lng: 121.5602,
        },
        passenger: { name: "Sparse Snapshot Rider", phone: "0912000001" },
      },
      TENANT_ID,
      TENANT_IDENTITY,
      "req-e2e-p2-008-sparse-booking",
    );
    const dispatchJob = harness.ownedMobilityService.dispatchOrder(
      booking.orderId,
      {
        mode: "auto",
      },
    );

    await expectApiError(
      assignAvDispatch(harness.ownedMobilityService, dispatchJob.dispatchJobId, {
        entitlement: { active: true },
        candidateRoute: READY_SANDBOX_DISPATCH_SNAPSHOT.candidateRoute,
      }),
      "SANDBOX_REGULATORY_APPROVAL_MISSING",
    );

    const persistedDecision =
      await harness.sandboxDispatchGateService.findDecisionForOrder(
        booking.orderId,
      );
    expect(harness.store.decisions).toHaveLength(1);
    expect(persistedDecision).toMatchObject({
      orderId: booking.orderId,
      vehicleId: AV_VEHICLE_ID,
      decision: "block",
      hardReasonCodes: expect.arrayContaining([
        "REGULATORY_APPROVAL_MISSING",
      ]),
    });
  });

  it("blocks AV assignment when disclosure is missing and allows it after acknowledgement-backed disclosure is present", async () => {
    const blockedHarness = createOwnedMobilityDispatchHarness();
    cleanups.push(blockedHarness.cleanup);

    const blockedBooking =
      await blockedHarness.ownedMobilityService.createTenantBooking(
        {
          businessDispatchSubtype: "enterprise_dispatch",
          reservationWindowStart: BOOKING_START,
          reservationWindowEnd: BOOKING_END,
          pickup: { address: "Taipei 101", lat: 25.0338, lng: 121.5645 },
          dropoff: {
            address: "Songshan Cultural Park",
            lat: 25.044,
            lng: 121.5602,
          },
          passenger: { name: "Missing Disclosure Rider", phone: "0912000002" },
        },
        TENANT_ID,
        TENANT_IDENTITY,
        "req-e2e-p2-008-disclosure-missing-booking",
      );
    const blockedDispatchJob = blockedHarness.ownedMobilityService.dispatchOrder(
      blockedBooking.orderId,
      {
        mode: "auto",
      },
    );

    await expectApiError(
      assignAvDispatch(
        blockedHarness.ownedMobilityService,
        blockedDispatchJob.dispatchJobId,
        READY_SANDBOX_DISPATCH_SNAPSHOT,
      ),
      "SANDBOX_PASSENGER_DISCLOSURE_POLICY_MISSING",
    );

    const blockedDecision =
      await blockedHarness.sandboxDispatchGateService.findDecisionForOrder(
        blockedBooking.orderId,
      );
    expect(blockedDecision).toMatchObject({
      orderId: blockedBooking.orderId,
      decision: "block",
      hardReasonCodes: expect.arrayContaining([
        "PASSENGER_DISCLOSURE_POLICY_MISSING",
        "PASSENGER_DISCLOSURE_MESSAGE_MISSING",
      ]),
    });

    const allowedHarness = createOwnedMobilityDispatchHarness();
    cleanups.push(allowedHarness.cleanup);
    await allowedHarness.sandboxDispatchGateService.upsertPassengerDisclosurePolicy(
      {
        policyVersion: "policy-e2e-p2-008-allow",
        tenantId: TENANT_ID,
        businessDispatchSubtype: "enterprise_dispatch",
        channelRules: [
          {
            channel: "tenant_portal",
            messageCode: PASSENGER_DISCLOSURE_MESSAGE_CODE,
            requiresAcknowledgement: true,
            acknowledgementMode: "operator_confirmed_notice",
          },
        ],
      },
    );

    const allowedBooking =
      await allowedHarness.ownedMobilityService.createTenantBooking(
        {
          businessDispatchSubtype: "enterprise_dispatch",
          reservationWindowStart: BOOKING_START,
          reservationWindowEnd: BOOKING_END,
          pickup: { address: "Taipei 101", lat: 25.0338, lng: 121.5645 },
          dropoff: {
            address: "Songshan Cultural Park",
            lat: 25.044,
            lng: 121.5602,
          },
          passenger: { name: "Acknowledged Rider", phone: "0912000003" },
          passengerDisclosureAcknowledgement: {
            actorType: "tenant_admin",
            actorRef: TENANT_IDENTITY.actorId,
            evidenceRef: "ack-e2e-p2-008",
          },
        },
        TENANT_ID,
        TENANT_IDENTITY,
        "req-e2e-p2-008-disclosure-allow-booking",
      );
    const bookingSnapshot = allowedHarness.ownedMobilityService.getTenantBooking(
      TENANT_ID,
      allowedBooking.bookingId,
    );
    const allowedDispatchJob = allowedHarness.ownedMobilityService.dispatchOrder(
      allowedBooking.orderId,
      {
        mode: "auto",
      },
    );

    const assignment = await assignAvDispatch(
      allowedHarness.ownedMobilityService,
      allowedDispatchJob.dispatchJobId,
      READY_SANDBOX_DISPATCH_SNAPSHOT,
    );
    const allowedDecision =
      await allowedHarness.sandboxDispatchGateService.findDecisionForOrder(
        allowedBooking.orderId,
      );

    expect(bookingSnapshot.passengerDisclosure).toMatchObject({
      policyId: expect.any(String),
      messageCode: PASSENGER_DISCLOSURE_MESSAGE_CODE,
      requiresAcknowledgement: true,
      acknowledgedAt: expect.any(String),
      acknowledgementRecordId: expect.any(String),
    });
    expect(allowedHarness.store.acknowledgements).toHaveLength(1);
    expect(assignment).toMatchObject({
      status: "assigned",
    });
    expect(allowedDecision).toMatchObject({
      orderId: allowedBooking.orderId,
      vehicleId: AV_VEHICLE_ID,
      decision: "allow_with_safety_operator",
      requiredSafetyOperatorId: DEFAULT_SAFETY_OPERATOR_ID,
      hardReasonCodes: [],
    });
    expect(allowedHarness.store.decisions).toHaveLength(1);
  });
});
