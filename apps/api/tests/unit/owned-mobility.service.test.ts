import { createHash } from "node:crypto";

import { EventEmitter2 } from "@nestjs/event-emitter";
import { HttpStatus, Logger } from "@nestjs/common";
import { afterEach, describe, expect, it, vi } from "vitest";

import {
  QUEUE_ENTRY_POLICY_MAP,
  ORDER_SOURCE_DISPATCH_SEMANTICS_MAP,
  RESERVATION_HOLD_VALID_TRANSITIONS,
  EXCEPTION_HOLD_REASON_CODES,
} from "@drts/contracts";
import type {
  DriverRatingSummary,
  ServiceAreaEvaluationResult,
} from "@drts/contracts";
import { ApiRequestError } from "../../src/common/api-envelope";
import { OpsDispatchEventsService } from "../../src/common/ops-dispatch-events.service";
import { AuditNotificationService } from "../../src/modules/audit-notification/audit-notification.service";
import { OwnedMobilityTaskEventsService } from "../../src/modules/owned-mobility/owned-mobility-task-events.service";
import { OwnedMobilityService } from "../../src/modules/owned-mobility/owned-mobility.service";
import {
  OwnedOrderDuplicateVoiceLinkError,
  OwnedOrderVersionConflictError,
} from "../../src/modules/owned-mobility/owned-mobility.repository";
import { FareAnomalyRepository } from "../../src/modules/product-rule/fare-anomaly.repository";
import { FareAnomalyService } from "../../src/modules/product-rule/fare-anomaly.service";
import { ServiceAreaService } from "../../src/modules/service-area/service-area.service";
import { ServiceProductService } from "../../src/modules/service-product/service-product.service";
import { TenantPartnerService } from "../../src/modules/tenant-partner/tenant-partner.service";
import { VehicleEligibilityService } from "../../src/modules/vehicle-eligibility/vehicle-eligibility.service";

const SAMPLE_PROOF_PHOTO = "cHJvb2YtcGhvdG8tMDAx";
const DEFAULT_VEHICLE_LICENSE_TYPES: Record<string, string> = {
  "veh-demo-001": "multi_purpose_taxi",
  "veh-demo-002": "taxi",
  "veh-demo-003": "taxi",
  "veh-demo-004": "business_vehicle",
  "veh-av-demo-001": "business_vehicle",
};

function buildExpectedDriverCompletionOutboxId(
  taskId: string,
  effectType: string,
) {
  const digest = createHash("sha256")
    .update(`driver-completion-outbox:${taskId}:${effectType}`)
    .digest("hex")
    .slice(0, 32)
    .split("");
  digest[12] = "5";
  digest[16] = ((parseInt(digest[16] ?? "0", 16) & 0x3) | 0x8).toString(16);
  return [
    digest.slice(0, 8).join(""),
    digest.slice(8, 12).join(""),
    digest.slice(12, 16).join(""),
    digest.slice(16, 20).join(""),
    digest.slice(20, 32).join(""),
  ].join("-");
}

function createOwnedMobilityService(options?: {
  candidates?: Array<{
    driverId: string;
    vehicleId: string;
    etaMinutes: number;
    operatingArea: string;
    serviceBuckets: string[];
  }>;
  getEligibleCandidates?: (
    serviceBucket: string,
    destination?: { lat: number; lng: number } | null,
  ) => Array<{
    driverId: string;
    vehicleId: string;
    etaMinutes: number;
    operatingArea: string;
    serviceBuckets: string[];
  }>;
  vehicleDispatchable?: boolean;
  getVehicleDispatchability?: (
    vehicleId: string,
    serviceBucket: string,
  ) => boolean;
  vehicleLicenseTypes?: Record<string, string>;
  driverAvailable?: boolean;
  getDriverAvailability?: (driverId: string, serviceBucket: string) => boolean;
  enableVehicleEligibility?: boolean;
  tenantPartnerService?: TenantPartnerService;
  serviceProductOverrides?: Record<string, unknown>;
  runtimeEligibilityEvaluator?: {
    evaluate: ReturnType<typeof vi.fn>;
  };
  serviceAreaService?: ServiceAreaService;
  fareAnomalyService?: FareAnomalyService;
  vehicleDisclosureProfile?: Record<string, unknown> | null;
  driverRegistrationCredential?: Record<string, unknown> | null;
  repository?: {
    isEnabled: () => boolean;
    persistChanges: (...args: any[]) => Promise<unknown>;
    persistOrderWorkflow: (...args: any[]) => Promise<unknown>;
    persistDriverCompletionOutbox?: (...args: any[]) => Promise<unknown>;
    withTransaction: <T>(work: (tx: unknown) => Promise<T>) => Promise<T>;
    loadState?: (...args: any[]) => Promise<unknown>;
    loadDriverTaskCompletionBundleForUpdate?: (
      ...args: any[]
    ) => Promise<unknown>;
    hasDriverTaskTraceRequestId?: (...args: any[]) => Promise<boolean>;
    claimNextRecoverableDriverCompletionOutbox?: (
      ...args: any[]
    ) => Promise<unknown>;
    markDriverCompletionOutboxDelivered?: (...args: any[]) => Promise<unknown>;
    releaseDriverCompletionOutbox?: (...args: any[]) => Promise<unknown>;
    reportPersistenceFailure: (...args: any[]) => void;
    findOrderById?: (...args: any[]) => Promise<unknown>;
    findOrderByBookingId?: (...args: any[]) => Promise<unknown>;
    // Only the transactional assignment path reaches these, so stubs that never
    // enable a repository can keep omitting them.
    isActiveMultiTaxiAuthorizedVehicle?: (...args: any[]) => Promise<boolean>;
    getOrInitializeDriverRatingSummary?: (
      ...args: any[]
    ) => Promise<DriverRatingSummary>;
  };
}) {
  const regulatoryRegistryService = {
    getEligibleCandidates: vi.fn(
      (
        serviceBucket: string,
        destination?: { lat: number; lng: number } | null,
      ) =>
        options?.getEligibleCandidates?.(serviceBucket, destination) ??
        options?.candidates ??
        [],
    ),
    getVehicleDispatchability: vi.fn(
      (vehicleId: string, serviceBucket: string) =>
        options?.getVehicleDispatchability?.(vehicleId, serviceBucket) ??
        options?.vehicleDispatchable ??
        true,
    ),
    getDriverAvailability: vi.fn(
      (driverId: string, serviceBucket: string) =>
        options?.getDriverAvailability?.(driverId, serviceBucket) ??
        options?.driverAvailable ??
        true,
    ),
    getVehicleLicenseType: vi.fn(
      (vehicleId: string) =>
        options?.vehicleLicenseTypes?.[vehicleId] ??
        DEFAULT_VEHICLE_LICENSE_TYPES[vehicleId] ??
        null,
    ),
    getVehiclePassengerDisclosureProfile: vi.fn(
      () => options?.vehicleDisclosureProfile ?? null,
    ),
    getDriverPublicRegistrationCredential: vi.fn(
      () => options?.driverRegistrationCredential ?? null,
    ),
    listVehicles: vi.fn(() => [
      {
        vehicleId: "veh-demo-001",
        plateNo: "TAXI-001",
        operatingArea: "TPE",
      },
    ]),
    listDrivers: vi.fn(() => [
      {
        driverId: "drv-demo-001",
        name: "Driver One",
      },
    ]),
    listSupplyPairs: vi.fn(() => [
      {
        vehicleId: "veh-demo-001",
        driverId: "drv-demo-001",
        etaMinutes: 8,
      },
    ]),
  };
  const auditNotificationService = {
    recordNotification: vi.fn(),
    recordAuditLog: vi.fn(),
  };
  const serviceProductService = new ServiceProductService(
    auditNotificationService as never,
    undefined,
  );
  if (options?.serviceProductOverrides) {
    serviceProductService.createServiceProduct(
      options.serviceProductOverrides as never,
    );
  }
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
  const vehicleEligibilityService = options?.enableVehicleEligibility
    ? new VehicleEligibilityService(
        regulatoryRegistryService as never,
        undefined,
        undefined,
        serviceProductService,
      )
    : undefined;

  const service = new OwnedMobilityService(
    regulatoryRegistryService as never,
    auditNotificationService as never,
    callcenterService as never,
    taskEventsService,
    opsDispatchEventsService,
    options?.repository as never,
    options?.tenantPartnerService,
    vehicleEligibilityService,
    serviceProductService,
    undefined,
    options?.runtimeEligibilityEvaluator as never,
    undefined,
    undefined,
    options?.serviceAreaService,
    options?.fareAnomalyService,
  );

  return {
    service,
    regulatoryRegistryService,
    auditNotificationService,
  };
}

async function createFareAnomalyAuthority(databaseService?: {
  isEnabled: () => boolean;
  query: ReturnType<typeof vi.fn>;
}) {
  const repository = new FareAnomalyRepository(databaseService as never);
  const service = new FareAnomalyService(
    repository,
    { recordAuditLog: vi.fn() } as never,
    {
      isAvailable: vi.fn(() => false),
      recover: vi.fn(),
    } as never,
  );
  await service.onModuleInit();
  return service;
}

function createMultiTaxiFareProducerService(
  fareAnomalyService: FareAnomalyService,
) {
  return createOwnedMobilityService({
    candidates: [
      {
        driverId: "drv-demo-001",
        vehicleId: "veh-demo-001",
        etaMinutes: 4,
        operatingArea: "TPE",
        serviceBuckets: ["standard_taxi"],
      },
    ],
    serviceProductOverrides: {
      serviceProductType: "taxi_reservation",
      displayName: "Multi-taxi reservation",
      timing: "reservation",
      active: true,
      defaultBillingMode: "meter",
      defaultProofRequirements: [],
    },
    vehicleDisclosureProfile: {
      vehicleId: "veh-demo-001",
      make: "Toyota",
      model: "Sienta",
      modelYear: 2024,
      doorCount: 5,
      color: "Silver",
      status: "complete",
      missingFieldCodes: [],
      version: 2,
    },
    driverRegistrationCredential: {
      driverId: "drv-demo-001",
      effectiveUntil: "2027-01-01",
      status: "verified_active",
      maskedDisplay: "RE***01",
      version: 3,
    },
    fareAnomalyService,
  }).service;
}

function createFareProducerOrder(
  service: OwnedMobilityService,
  options: {
    activeFareVersionId?: string;
    resolvedRoute?: boolean;
  } = {},
) {
  return service.createMultiTaxiRide(
    {
      pickup:
        options.resolvedRoute === false
          ? { address: "台北車站" }
          : { address: "台北車站", lat: 25.0478, lng: 121.517 },
      dropoff:
        options.resolvedRoute === false
          ? { address: "松山機場" }
          : { address: "松山機場", lat: 25.0697, lng: 121.5525 },
      passenger: {
        passengerId: "passenger-fare-producer-001",
        name: "測試乘客",
        phone: "0911222333",
      },
      requestedPickupAt: new Date().toISOString(),
      timingMode: "on_demand",
      paymentMethodTokenRef: null,
    },
    {
      authorizationId: "auth-mtx-fare-producer-001",
      operatorId: "operator-001",
      authorityCode: "TPE-MTX-001",
      businessPlanVersion: "2026.1",
      status: "approved",
      serviceAreaCodes: ["TPE"],
      activeFareVersionId: options.activeFareVersionId ?? "fare-2026-001",
      effectiveFrom: "2026-01-01T00:00:00.000Z",
      effectiveUntil: "2027-01-01T00:00:00.000Z",
      createdAt: "2026-01-01T00:00:00.000Z",
      updatedAt: "2026-01-01T00:00:00.000Z",
    },
  );
}

describe("OwnedMobilityService queue and reservation orchestration", () => {
  afterEach(() => {
    vi.useRealTimers();
  });

  it("hard-blocks coordinate-bearing phone orders in no-pickup service-area policies", () => {
    const { service } = createOwnedMobilityService({
      serviceAreaService: new ServiceAreaService(),
    });

    expect(() =>
      service.createCallCenterOrder({
        callId: "call-map-block-001",
        agentId: "ops-agent-001",
        recordingId: "recording-map-block-001",
        pickup: {
          address: "台北車站禁止上車區",
          lat: 25.0478,
          lng: 121.517,
        },
        dropoff: {
          address: "信義區",
          lat: 25.06,
          lng: 121.58,
        },
        passenger: { name: "Map Rider", phone: "0912000000" },
      }),
    ).toThrowError(ApiRequestError);

    try {
      service.createCallCenterOrder({
        callId: "call-map-block-002",
        agentId: "ops-agent-001",
        recordingId: "recording-map-block-002",
        pickup: {
          address: "台北車站禁止上車區",
          lat: 25.0478,
          lng: 121.517,
        },
        dropoff: {
          address: "信義區",
          lat: 25.06,
          lng: 121.58,
        },
        passenger: { name: "Map Rider", phone: "0912000000" },
      });
    } catch (error) {
      expect((error as ApiRequestError).getResponse()).toMatchObject({
        error: {
          code: "PICKUP_NOT_ALLOWED",
          details: {
            decision: "not_serviceable",
            reasonCodes: ["PICKUP_NOT_ALLOWED"],
            geometryVersionRefs: [
              "service_area:TAIPEI_CORE@1",
              "stop_policy:TPE_STATION_PICKUP_BLOCK@1",
            ],
          },
        },
      });
    }
  });

  it("routes manual-review service-area stops away from normal dispatch", async () => {
    const { service } = createOwnedMobilityService({
      serviceAreaService: new ServiceAreaService(),
      candidates: [
        {
          driverId: "driver-map-001",
          vehicleId: "vehicle-map-001",
          etaMinutes: 4,
          operatingArea: "taipei",
          serviceBuckets: ["standard_taxi"],
        },
      ],
    });

    const order = await service.createCallCenterOrder({
      callId: "call-map-review-001",
      agentId: "ops-agent-001",
      recordingId: "recording-map-review-001",
      pickup: {
        address: "信義醫院管制入口",
        lat: 25.0338,
        lng: 121.5645,
      },
      dropoff: {
        address: "市府轉運站",
        lat: 25.041,
        lng: 121.55,
      },
      passenger: { name: "Map Rider", phone: "0912000000" },
    });

    const detail = service.getOrder(order.orderId);
    const serviceAreaGate = detail.complianceGates?.find(
      (gate) => gate.gateType === "service_area",
    );

    expect(detail.complianceFlags).toContain("service_area_manual_review");
    expect(detail.queueFamily).toBe("manual_review_queue");
    expect(detail.queueEntryReason).toBe("dispatch_manual_review_required");
    expect(serviceAreaGate).toMatchObject({
      state: "review_required",
      blocking: false,
      evidenceRefs: expect.arrayContaining([
        "stop_policy:XINYI_HOSPITAL_MANUAL_REVIEW@1",
        "STOP_REQUIRES_MANUAL_REVIEW",
      ]),
    });
    expect(() =>
      service.dispatchOrder(order.orderId, { mode: "auto" }),
    ).toThrowError(ApiRequestError);
    try {
      service.dispatchOrder(order.orderId, { mode: "auto" });
    } catch (error) {
      expect((error as ApiRequestError).getResponse()).toMatchObject({
        error: {
          code: "DISPATCH_REQUIRES_MANUAL_REVIEW",
          details: {
            gateTypes: ["service_area"],
            reasonCodes: expect.arrayContaining([
              "STOP_REQUIRES_MANUAL_REVIEW",
            ]),
          },
        },
      });
    }
  });

  it("keeps provider-outage call-center capture in manual review instead of normal ready", async () => {
    const { service } = createOwnedMobilityService({
      serviceAreaService: new ServiceAreaService(),
      candidates: [
        {
          driverId: "driver-map-provider-001",
          vehicleId: "vehicle-map-provider-001",
          etaMinutes: 4,
          operatingArea: "taipei",
          serviceBuckets: ["standard_taxi"],
        },
      ],
    });

    const order = await service.createCallCenterOrder({
      callId: "call-map-provider-001",
      agentId: "ops-agent-001",
      recordingId: "recording-map-provider-001",
      pickup: {
        address: "台北市政府",
        lat: 25.0375,
        lng: 121.5637,
      },
      dropoff: {
        address: "松山文創園區",
        lat: 25.0438,
        lng: 121.5601,
      },
      passenger: { name: "Fallback Rider", phone: "0912000000" },
      mapFallbackReview: {
        reasonCode: "map_provider_unavailable",
        providerAvailable: false,
        providerDegraded: true,
        providerReasonCode: "request_failed",
      },
    });

    const detail = service.getOrder(order.orderId);
    const addressCaptureGate = detail.complianceGates?.find(
      (gate) => gate.gateType === "address_capture",
    );

    expect(detail.queueFamily).toBe("manual_review_queue");
    expect(detail.queueEntryReason).toBe("dispatch_manual_review_required");
    expect(detail.mapFallbackReview).toMatchObject({
      reasonCode: "map_provider_unavailable",
      providerAvailable: false,
      providerDegraded: true,
      providerReasonCode: "request_failed",
    });
    expect(addressCaptureGate).toMatchObject({
      state: "review_required",
      blocking: false,
      evidenceRefs: expect.arrayContaining([
        "map_provider_unavailable",
        "request_failed",
      ]),
    });
    expect(() =>
      service.dispatchOrder(order.orderId, { mode: "auto" }),
    ).toThrowError(ApiRequestError);
    try {
      service.dispatchOrder(order.orderId, { mode: "auto" });
    } catch (error) {
      expect((error as ApiRequestError).getResponse()).toMatchObject({
        error: {
          code: "DISPATCH_REQUIRES_MANUAL_REVIEW",
          details: {
            gateTypes: expect.arrayContaining(["address_capture"]),
            reasonCodes: expect.arrayContaining([
              "map_provider_unavailable",
              "request_failed",
            ]),
          },
        },
      });
    }
  });

  it("persists service-area snapshots and emits spatial audit events for coordinate-bearing phone orders", async () => {
    const { service, auditNotificationService } = createOwnedMobilityService({
      serviceAreaService: new ServiceAreaService(),
    });

    const order = await service.createCallCenterOrder(
      {
        callId: "call-map-audit-001",
        agentId: "ops-agent-geo-001",
        recordingId: "recording-map-audit-001",
        pickup: {
          address: "台北市政府",
          lat: 25.0375,
          lng: 121.5637,
          coordinateSource: "provider_candidate",
          geocodeProvider: "mock_geo",
          geocodeConfidence: "exact",
          providerCandidateId: "mock-candidate-city-hall",
          selectedByActorId: "ops-agent-geo-001",
          selectedAt: "2026-06-30T10:00:00.000Z",
          surface: "callcenter",
        },
        dropoff: {
          address: "信義區松仁路",
          lat: 25.034,
          lng: 121.568,
          coordinateSource: "manual_pin",
          geocodeProvider: "mock_geo",
          geocodeConfidence: "manual",
          pinnedByActorId: "ops-agent-geo-001",
          pinnedAt: "2026-06-30T10:01:00.000Z",
          surface: "callcenter",
        },
        passenger: { name: "Map Audit Rider", phone: "0912000000" },
      },
      "req-map-audit-001",
    );

    const detail = service.getOrder(order.orderId);
    const spatialAudit = detail.spatialAudit;

    expect(spatialAudit).toMatchObject({
      capturedReason: "booking_creation",
      actorId: "ops-agent-geo-001",
      actorType: "ops_user",
      surface: "callcenter",
      serviceProductType: "taxi_realtime",
      decision: "serviceable",
      serviceAreaCodes: ["TAIPEI_CORE"],
      geometryVersionRefs: ["service_area:TAIPEI_CORE@1"],
      missingItems: [],
    });
    expect(spatialAudit?.stops).toEqual([
      expect.objectContaining({
        kind: "pickup",
        addressText: "台北市政府",
        location: { lat: 25.0375, lng: 121.5637 },
        provenanceComplete: true,
        missingItems: [],
        coordinateProvenance: expect.objectContaining({
          coordinateSource: "provider_candidate",
          geocodeProvider: "mock_geo",
          selectedByActorId: "ops-agent-geo-001",
          surface: "callcenter",
        }),
      }),
      expect.objectContaining({
        kind: "dropoff",
        addressText: "信義區松仁路",
        location: { lat: 25.034, lng: 121.568 },
        provenanceComplete: true,
        missingItems: [],
        coordinateProvenance: expect.objectContaining({
          coordinateSource: "manual_pin",
          pinnedByActorId: "ops-agent-geo-001",
          surface: "callcenter",
        }),
      }),
    ]);
    expect(detail.complianceFlags).toEqual(
      expect.arrayContaining(["recording_bound", "service_area_serviceable"]),
    );
    expect(auditNotificationService.recordAuditLog).toHaveBeenCalledWith(
      expect.objectContaining({
        actorId: "ops-agent-geo-001",
        actorType: "ops_user",
        moduleName: "order",
        actionName: "order.spatial_audit.snapshot_created",
        resourceType: "order",
        resourceId: order.orderId,
        requestId: "req-map-audit-001",
        newValuesSummary: expect.objectContaining({
          decision: "serviceable",
          surface: "callcenter",
          serviceProductType: "taxi_realtime",
          provenanceComplete: true,
        }),
      }),
    );
  });

  it("keeps text-only legacy orders in explicit service-area manual review", () => {
    const { service } = createOwnedMobilityService({
      serviceAreaService: new ServiceAreaService(),
      candidates: [
        {
          driverId: "driver-map-legacy-001",
          vehicleId: "vehicle-map-legacy-001",
          etaMinutes: 5,
          operatingArea: "taipei",
          serviceBuckets: ["standard_taxi"],
        },
      ],
    });

    const order = service.createPassengerOrder({
      pickup: { address: "Caller only gave a landmark" },
      dropoff: { address: "Caller only gave another landmark" },
      passenger: { name: "Legacy Rider", phone: "0912000000" },
    });
    const detail = service.getOrder(order.orderId);
    const serviceAreaGate = detail.complianceGates?.find(
      (gate) => gate.gateType === "service_area",
    );

    expect(detail.complianceFlags).toContain(
      "service_area_legacy_text_manual_review",
    );
    expect(serviceAreaGate).toMatchObject({
      state: "review_required",
      evidenceState: "missing",
      missingItems: ["pickup_coordinates", "dropoff_coordinates"],
    });
    expect(detail.spatialAudit).toMatchObject({
      capturedReason: "booking_creation",
      surface: "passenger_entry",
      decision: "manual_review",
      missingItems: ["pickup_coordinates", "dropoff_coordinates"],
      stops: [
        expect.objectContaining({
          kind: "pickup",
          location: null,
          provenanceComplete: false,
          coordinateProvenance: expect.objectContaining({
            coordinateSource: "legacy_text",
            surface: "passenger_entry",
          }),
        }),
        expect.objectContaining({
          kind: "dropoff",
          location: null,
          provenanceComplete: false,
          coordinateProvenance: expect.objectContaining({
            coordinateSource: "legacy_text",
            surface: "passenger_entry",
          }),
        }),
      ],
    });
    expect(detail.queueFamily).toBe("manual_review_queue");
    expect(() =>
      service.dispatchOrder(order.orderId, { mode: "auto" }),
    ).toThrowError(ApiRequestError);
  });

  it("exempts products with no active service area defined (e.g. insurance_replacement_vehicle) from service-area check", async () => {
    const { service } = createOwnedMobilityService({
      serviceAreaService: new ServiceAreaService(),
      serviceProductOverrides: {
        serviceProductType: "insurance_replacement_vehicle",
        displayName: "Insurance Replacement",
        timing: "reservation",
        active: true,
        defaultBillingMode: "partner_settlement",
        defaultProofRequirements: ["photo"],
      },
      candidates: [
        {
          driverId: "driver-map-exempt-001",
          vehicleId: "vehicle-map-exempt-001",
          etaMinutes: 5,
          operatingArea: "taipei",
          serviceBuckets: ["business_dispatch"],
        },
      ],
    });

    const booking = await service.createTenantBooking(
      {
        businessDispatchSubtype: "insurance_replacement_vehicle",
        reservationWindowStart: "2026-06-05T10:00:00.000Z",
        reservationWindowEnd: "2026-06-05T11:00:00.000Z",
        pickup: {
          address: "Some place outside any service area",
          lat: 24.15,
          lng: 120.67,
        },
        dropoff: {
          address: "Another place outside any service area",
          lat: 24.25,
          lng: 120.77,
        },
        passenger: { name: "Exempt Rider", phone: "0912000000" },
      },
      "tenant-demo-001",
    );

    const detail = service.getOrder(booking.orderId);
    expect(detail.complianceFlags).toContain("service_area_serviceable");
  });

  it("uses immutable spatial snapshots instead of re-evaluating created orders", () => {
    const serviceableEvaluation: ServiceAreaEvaluationResult = {
      decision: "serviceable",
      serviceProductType: "taxi_realtime",
      evaluatedAt: "2026-06-30T10:02:00.000Z",
      stops: [
        {
          kind: "pickup",
          location: { lat: 25.0375, lng: 121.5637 },
          serviceAreaCodes: ["TAIPEI_CORE"],
          policyCodes: [],
          geometryVersionRefs: ["service_area:TAIPEI_CORE@1"],
          decision: "serviceable",
          reasonCodes: [],
          reasonMessages: [],
        },
        {
          kind: "dropoff",
          location: { lat: 25.041, lng: 121.55 },
          serviceAreaCodes: ["TAIPEI_CORE"],
          policyCodes: [],
          geometryVersionRefs: ["service_area:TAIPEI_CORE@1"],
          decision: "serviceable",
          reasonCodes: [],
          reasonMessages: [],
        },
      ],
      serviceAreaCodes: ["TAIPEI_CORE"],
      geometryVersionRefs: ["service_area:TAIPEI_CORE@1"],
      reasonCodes: [],
      reasonMessages: [],
    };
    const changedEvaluation: ServiceAreaEvaluationResult = {
      ...serviceableEvaluation,
      decision: "not_serviceable",
      reasonCodes: ["PICKUP_AREA_NOT_SERVICEABLE"],
      reasonMessages: ["pickup is outside the service area."],
      stops: serviceableEvaluation.stops.map((stop) => ({
        ...stop,
        decision: "not_serviceable",
        reasonCodes: ["PICKUP_AREA_NOT_SERVICEABLE"],
        reasonMessages: ["pickup is outside the service area."],
      })),
    };
    const evaluate = vi
      .fn()
      .mockReturnValueOnce(serviceableEvaluation)
      .mockReturnValue(changedEvaluation);
    const { service } = createOwnedMobilityService({
      serviceAreaService: { evaluate } as unknown as ServiceAreaService,
    });

    const order = service.createPassengerOrder({
      pickup: {
        address: "台北市政府",
        lat: 25.0375,
        lng: 121.5637,
        coordinateSource: "provider_candidate",
        geocodeProvider: "mock_geo",
        geocodeConfidence: "exact",
        selectedByActorId: "passenger-001",
        selectedAt: "2026-06-30T10:02:00.000Z",
      },
      dropoff: {
        address: "市府轉運站",
        lat: 25.041,
        lng: 121.55,
        coordinateSource: "provider_candidate",
        geocodeProvider: "mock_geo",
        geocodeConfidence: "exact",
        selectedByActorId: "passenger-001",
        selectedAt: "2026-06-30T10:02:30.000Z",
      },
      passenger: { name: "Immutable Rider", phone: "0912000000" },
    });
    const firstDetail = service.getOrder(order.orderId);
    firstDetail.spatialAudit?.reasonCodes.push("MUTATED_REASON");
    if (firstDetail.spatialAudit?.stops[0]?.location) {
      firstDetail.spatialAudit.stops[0].location.lat = 0;
    }

    const freshDetail = service.getOrder(order.orderId);
    const serviceAreaGate = freshDetail.complianceGates?.find(
      (gate) => gate.gateType === "service_area",
    );

    expect(evaluate).toHaveBeenCalledTimes(1);
    expect(freshDetail.spatialAudit).toMatchObject({
      decision: "serviceable",
      reasonCodes: [],
      stops: [
        expect.objectContaining({
          location: { lat: 25.0375, lng: 121.5637 },
        }),
        expect.objectContaining({
          location: { lat: 25.041, lng: 121.55 },
        }),
      ],
    });
    expect(serviceAreaGate).toMatchObject({
      state: "clear",
      evidenceRefs: ["service_area:TAIPEI_CORE@1"],
    });
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

  it("projects queue reads from registry authority and fails closed when eligibility changes", () => {
    let vehicleDispatchable = true;
    const { service } = createOwnedMobilityService({
      getVehicleDispatchability: () => vehicleDispatchable,
    });
    const checkedIn = service.queueCheckIn({
      vehicleId: "veh-demo-001",
      siteId: "north-station",
      queueMode: "physical_rank",
    });

    expect(service.listQueueEntries()).toEqual([
      expect.objectContaining({
        queueEntryId: checkedIn.queueEntryId,
        runtimeProfileCode: "ordinary_taxi",
        queueMode: "physical_rank",
        driverId: "drv-demo-001",
        driverName: "Driver One",
        vehiclePlateNo: "TAXI-001",
        serviceAreaCode: "TPE",
        eligibility: expect.objectContaining({
          decision: "eligible",
          reasonCode: null,
        }),
        availableActions: expect.arrayContaining([
          expect.objectContaining({ action: "open_vehicle", enabled: true }),
          expect.objectContaining({ action: "open_driver", enabled: true }),
        ]),
      }),
    ]);

    vehicleDispatchable = false;
    expect(service.getQueueEntry(checkedIn.queueEntryId)).toMatchObject({
      eligibility: {
        decision: "denied",
        reasonCode: "VEHICLE_NOT_DISPATCHABLE",
      },
    });
  });

  it("fails queue reads closed when registry authority is unavailable", () => {
    const { service, regulatoryRegistryService } = createOwnedMobilityService();
    const checkedIn = service.queueCheckIn({
      vehicleId: "veh-demo-001",
      siteId: "north-station",
    });
    regulatoryRegistryService.listVehicles.mockImplementation(() => {
      throw new Error("registry unavailable");
    });

    expect(service.getQueueEntry(checkedIn.queueEntryId)).toMatchObject({
      driverId: null,
      vehiclePlateNo: null,
      serviceAreaCode: null,
      eligibility: {
        decision: "denied",
        reasonCode: "QUEUE_ELIGIBILITY_AUTHORITY_UNAVAILABLE",
      },
      availableActions: [
        expect.objectContaining({ action: "back_to_queue_overview" }),
      ],
    });
  });

  it("returns a canonical not-found error for unknown queue entry details", () => {
    const { service } = createOwnedMobilityService();

    expect(() => service.getQueueEntry("queue-entry-missing")).toThrowError(
      ApiRequestError,
    );
    try {
      service.getQueueEntry("queue-entry-missing");
    } catch (error) {
      expect((error as ApiRequestError).getResponse()).toMatchObject({
        error: {
          code: "QUEUE_ENTRY_NOT_FOUND",
        },
      });
    }
  });

  it("returns ELIGIBILITY_CHANGED_BEFORE_ASSIGNMENT when assignment recheck fails", async () => {
    const { service } = createOwnedMobilityService({
      candidates: [
        {
          driverId: "drv-demo-001",
          vehicleId: "veh-demo-001",
          etaMinutes: 6,
          operatingArea: "taichung-port",
          serviceBuckets: ["standard_taxi", "business_dispatch"],
        },
      ],
      vehicleDispatchable: true,
      enableVehicleEligibility: true,
    });

    const booking = await service.createTenantBooking(
      {
        businessDispatchSubtype: "enterprise_dispatch",
        reservationWindowStart: "2026-06-05T10:00:00.000Z",
        reservationWindowEnd: "2026-06-05T11:00:00.000Z",
        pickup: { address: "台中市西屯區台灣大道 1 號" },
        dropoff: { address: "台中市南屯區公益路 2 號" },
        passenger: { name: "測試乘客", phone: "0911222333" },
      },
      "tenant-demo-001",
    );

    const dispatchJob = service.dispatchOrder(booking.orderId, {
      mode: "auto",
    });

    expect(() =>
      service.assignDispatch({
        dispatchJobId: dispatchJob.dispatchJobId,
        vehicleId: "veh-demo-002",
        driverId: "drv-demo-001",
      }),
    ).toThrowError(ApiRequestError);

    try {
      service.assignDispatch({
        dispatchJobId: dispatchJob.dispatchJobId,
        vehicleId: "veh-demo-002",
        driverId: "drv-demo-001",
      });
    } catch (error) {
      expect((error as ApiRequestError).getResponse()).toMatchObject({
        error: {
          code: "ELIGIBILITY_CHANGED_BEFORE_ASSIGNMENT",
          details: {
            dispatchJobId: dispatchJob.dispatchJobId,
            vehicleId: "veh-demo-002",
            driverId: "drv-demo-001",
            serviceProductCode: "enterprise_dispatch",
            reasonCodes: ["VEHICLE_NOT_ELIGIBLE_FOR_SERVICE_PRODUCT"],
          },
        },
      });
    }
  });

  it("resolves sandbox fallback billing treatment from partner and tenant policy", () => {
    const { service } = createOwnedMobilityService();

    const booking = service.createTenantBooking(
      {
        businessDispatchSubtype: "enterprise_dispatch",
        reservationWindowStart: "2026-06-05T10:00:00.000Z",
        reservationWindowEnd: "2026-06-05T11:00:00.000Z",
        pickup: { address: "台中市西屯區台灣大道 1 號" },
        dropoff: { address: "台中市南屯區公益路 2 號" },
        passenger: { name: "測試乘客", phone: "0911222333" },
      },
      "tenant-demo-001",
    ) as { orderId: string };
    const order = service
      .listOrders()
      .find((item) => item.orderId === booking.orderId);
    expect(order).toBeDefined();

    const completedTask = {
      taskId: "task-human-fallback-001",
      vehicleId: "veh-human-demo-001",
      completedAt: "2026-06-27T12:00:00.000Z",
    };
    const grossEarning = { currency: "NTD", amountMinor: 150000 };
    const fulfillmentSegments = [
      {
        fulfillmentSegmentId: "segment-av-attempt-001",
        bookingId: order!.bookingId ?? order!.orderId,
        orderId: order!.orderId,
        sandboxTripId: order!.orderId,
        segmentType: "tesla_av",
        segmentReason: "sandbox_av_attempt",
        startedAt: "2026-06-27T11:30:00.000Z",
        endedAt: "2026-06-27T11:45:00.000Z",
        vehicleId: "veh-av-demo-001",
        vin: null,
        driverId: "safety-op-001",
        safetyOperatorId: "safety-op-001",
        sourcePlatform: "portal",
        distanceKm: null,
        durationSeconds: null,
        cost: null,
        evidenceReference: null,
        createdAt: "2026-06-27T11:30:00.000Z",
      },
    ];

    const partnerTreatment = (service as any).buildSandboxBillingTreatment(
      {
        ...order,
        partnerProgramId: "program-airport-alpha",
      },
      completedTask,
      grossEarning,
      fulfillmentSegments,
    );
    expect(partnerTreatment).toMatchObject({
      treatmentType: "partner_program_adjusted",
      fallbackCostAbsorber: "partner",
      fallbackPolicyId: "fallback-policy-partner-airport-001",
      policyResolution: "partner_policy",
      partnerCharge: grossEarning,
      tenantCharge: null,
      platformAbsorbed: null,
    });

    const tenantTreatment = (service as any).buildSandboxBillingTreatment(
      order,
      completedTask,
      grossEarning,
      fulfillmentSegments,
    );
    expect(tenantTreatment).toMatchObject({
      treatmentType: "tenant_contract_adjusted",
      fallbackCostAbsorber: "tenant_contract",
      fallbackPolicyId: "fallback-policy-tenant-demo-001",
      policyResolution: "tenant_policy",
      partnerCharge: null,
      tenantCharge: grossEarning,
      platformAbsorbed: null,
    });

    const defaultPlatformTreatment = (
      service as any
    ).buildSandboxBillingTreatment(
      {
        ...order,
        tenantId: "tenant-no-policy-001",
        partnerProgramId: null,
      },
      completedTask,
      grossEarning,
      fulfillmentSegments,
    );
    expect(defaultPlatformTreatment).toMatchObject({
      treatmentType: "fallback_human",
      fallbackCostAbsorber: "platform",
      fallbackPolicyId: null,
      policyResolution: "default_platform_no_contract",
      partnerCharge: null,
      tenantCharge: null,
      platformAbsorbed: grossEarning,
    });
  });

  it("persists exact service product on the driver task created by assignment", async () => {
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

    const booking = await service.createTenantBooking(
      {
        businessDispatchSubtype: "credit_card_airport_transfer",
        reservationWindowStart: "2026-06-20T14:00:00.000Z",
        reservationWindowEnd: "2026-06-20T15:00:00.000Z",
        pickup: { address: "Pickup" },
        dropoff: { address: "Dropoff" },
        passenger: { name: "Rider One", phone: "0912000000" },
      },
      "tenant-demo-001",
    );

    const dispatchResult = await service.dispatchOrder(booking.orderId, {
      mode: "auto",
    });
    const assignment = await service.assignDispatch({
      dispatchJobId: dispatchResult.dispatchJobId,
      vehicleId: "vehicle-001",
      driverId: "driver-001",
    });

    expect(service.getDriverTask(assignment.taskId)).toMatchObject({
      taskId: assignment.taskId,
      serviceProductCode: "credit_card_airport_transfer",
    });
  });

  it("stamps serviceProductCode at booking intake and carries it through assignment + task", async () => {
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

    const booking = await service.createTenantBooking(
      {
        businessDispatchSubtype: "credit_card_airport_transfer",
        reservationWindowStart: "2026-06-20T14:00:00.000Z",
        reservationWindowEnd: "2026-06-20T15:00:00.000Z",
        pickup: { address: "Pickup" },
        dropoff: { address: "Dropoff" },
        passenger: { name: "Rider One", phone: "0912000000" },
      },
      "tenant-demo-001",
    );

    // Booking-origin: the precise code is on the order the moment it is created,
    // before any dispatch/derivation downstream.
    expect(service.getOrder(booking.orderId)?.serviceProductCode).toBe(
      "credit_card_airport_transfer",
    );

    const dispatchResult = await service.dispatchOrder(booking.orderId, {
      mode: "auto",
    });
    const assignment = await service.assignDispatch({
      dispatchJobId: dispatchResult.dispatchJobId,
      vehicleId: "vehicle-001",
      driverId: "driver-001",
    });

    // Same value flows to the driver task (carried from the order, not re-derived).
    expect(service.getDriverTask(assignment.taskId)?.serviceProductCode).toBe(
      "credit_card_airport_transfer",
    );
  });

  it("uses repository transactions for assignment-time recheck when persistence is enabled", async () => {
    let vehicleDispatchable = true;
    const repository = {
      isEnabled: () => true,
      persistChanges: vi.fn(async () => undefined),
      persistOrderWorkflow: vi.fn(async () => undefined),
      withTransaction: vi.fn(async (work: (tx: unknown) => Promise<unknown>) =>
        work({}),
      ),
      reportPersistenceFailure: vi.fn(),
      reserveDispatchResources: vi.fn(async () => []),
      releaseDispatchResourceReservations: vi.fn(async () => 0),
      occupyDispatchResourceReservations: vi.fn(async () => 0),
    };
    const { service } = createOwnedMobilityService({
      candidates: [
        {
          driverId: "driver-001",
          vehicleId: "vehicle-001",
          etaMinutes: 4,
          operatingArea: "north",
          serviceBuckets: ["standard_taxi"],
        },
      ],
      repository,
      getVehicleDispatchability: () => vehicleDispatchable,
    });

    const order = service.createPassengerOrder({
      pickup: { address: "Taipei Main Station" },
      dropoff: { address: "Taipei 101" },
      passenger: { name: "Test", phone: "0912345678" },
    });
    const dispatchResult = service.dispatchOrder(order.orderId, {
      mode: "auto",
    });
    vehicleDispatchable = false;

    await expect(
      service.assignDispatch({
        dispatchJobId: dispatchResult.dispatchJobId,
        vehicleId: "vehicle-001",
        driverId: "driver-001",
      }),
    ).rejects.toMatchObject({
      response: {
        error: {
          code: "ELIGIBILITY_CHANGED_BEFORE_ASSIGNMENT",
          details: {
            reasonCodes: ["VEHICLE_NOT_ELIGIBLE_FOR_SERVICE_PRODUCT"],
          },
        },
      },
    });
    expect(repository.withTransaction).toHaveBeenCalledTimes(1);
    expect(repository.persistOrderWorkflow).not.toHaveBeenCalled();
  });

  it("keeps owned-mobility dispatch candidates order-specific when vehicle eligibility is enabled", async () => {
    const { service } = createOwnedMobilityService({
      enableVehicleEligibility: true,
      getEligibleCandidates: (_serviceBucket, destination) => {
        if (destination?.lat === 25.0478 && destination.lng === 121.5319) {
          return [
            {
              driverId: "driver-nearby",
              vehicleId: "veh-demo-001",
              etaMinutes: 3,
              operatingArea: "taipei",
              serviceBuckets: ["standard_taxi"],
            },
          ];
        }

        return [
          {
            driverId: "driver-fallback",
            vehicleId: "veh-demo-001",
            etaMinutes: 14,
            operatingArea: "taipei",
            serviceBuckets: ["standard_taxi"],
          },
        ];
      },
    });

    const order = service.createPassengerOrder({
      pickup: {
        address: "Taipei Main Station",
        lat: 25.0478,
        lng: 121.5319,
      },
      dropoff: {
        address: "Songshan Airport",
      },
      passenger: {
        name: "Rider One",
        phone: "0912000000",
      },
    });

    const dispatchJob = service.dispatchOrder(order.orderId, { mode: "auto" });

    await expect(
      service.listDispatchCandidates(dispatchJob.dispatchJobId),
    ).resolves.toEqual([
      expect.objectContaining({
        driverId: "driver-nearby",
        etaMinutes: 3,
      }),
    ]);
    expect(service.listDispatchJobs()).toEqual([
      expect.objectContaining({
        dispatchJobId: dispatchJob.dispatchJobId,
        latestEtaMinutes: 3,
      }),
    ]);
  });

  it("decorates candidate decisions and hides ineligible rows by default", async () => {
    const runtimeEligibilityEvaluator = {
      evaluate: vi
        .fn()
        .mockResolvedValueOnce({
          serviceProductId: "svc-enterprise",
          serviceProductCode: "enterprise_dispatch",
          policyVersion:
            "service:svc-enterprise@2026-06-20T00:00:00.000Z|capability:cap-1@2026-06-20T00:00:00.000Z",
          decision: "conditionally_eligible",
          hardReasonCodes: [],
          softReasonCodes: ["STALE_LOCATION"],
          missingRequirements: ["photo"],
          locationState: "stale",
          evaluatedAt: "2026-06-20T12:00:00.000Z",
        })
        .mockResolvedValueOnce({
          serviceProductId: "svc-enterprise",
          serviceProductCode: "enterprise_dispatch",
          policyVersion:
            "service:svc-enterprise@2026-06-20T00:00:00.000Z|capability:cap-2@2026-06-20T00:00:00.000Z",
          decision: "ineligible",
          hardReasonCodes: ["VEHICLE_NOT_ELIGIBLE_FOR_SERVICE_PRODUCT"],
          softReasonCodes: [],
          missingRequirements: [],
          locationState: "fresh",
          evaluatedAt: "2026-06-20T12:00:01.000Z",
        }),
    };
    const { service } = createOwnedMobilityService({
      enableVehicleEligibility: true,
      candidates: [
        {
          driverId: "drv-eligible",
          vehicleId: "veh-demo-001",
          etaMinutes: 5,
          operatingArea: "taipei",
          serviceBuckets: ["business_dispatch"],
        },
        {
          driverId: "drv-ineligible",
          vehicleId: "veh-demo-002",
          etaMinutes: 8,
          operatingArea: "taipei",
          serviceBuckets: ["business_dispatch"],
        },
      ],
      runtimeEligibilityEvaluator,
    });
    const booking = await service.createTenantBooking(
      {
        businessDispatchSubtype: "enterprise_dispatch",
        reservationWindowStart: "2026-06-20T13:00:00.000Z",
        reservationWindowEnd: "2026-06-20T14:00:00.000Z",
        pickup: { address: "HQ", lat: 25.033, lng: 121.5654 },
        dropoff: { address: "Airport" },
        passenger: { name: "Rider", phone: "0912000000" },
      },
      "tenant-demo-001",
    );
    const dispatchJob = service.dispatchOrder(booking.orderId, {
      mode: "auto",
    });

    const candidates = await service.listDispatchCandidates(
      dispatchJob.dispatchJobId,
    );

    expect(candidates).toEqual([
      expect.objectContaining({
        driverId: "drv-eligible",
        eligibilityDecision: "conditionally_eligible",
        softReasonCodes: ["STALE_LOCATION"],
        missingRequirements: ["photo"],
        locationState: "stale",
        serviceProductContext: {
          serviceProductId: "svc-enterprise",
          serviceProductCode: "enterprise_dispatch",
          policyVersion:
            "service:svc-enterprise@2026-06-20T00:00:00.000Z|capability:cap-1@2026-06-20T00:00:00.000Z",
          evaluatedAt: "2026-06-20T12:00:00.000Z",
        },
      }),
    ]);
    expect(runtimeEligibilityEvaluator.evaluate).toHaveBeenCalledTimes(2);
  });

  it("falls back to decorated ineligible rows instead of returning a bare empty list", async () => {
    const runtimeEligibilityEvaluator = {
      evaluate: vi.fn().mockResolvedValue({
        serviceProductId: "svc-enterprise",
        serviceProductCode: "enterprise_dispatch",
        policyVersion:
          "service:svc-enterprise@2026-06-20T00:00:00.000Z|capability:cap-2@2026-06-20T00:00:00.000Z",
        decision: "ineligible",
        hardReasonCodes: ["VEHICLE_NOT_ELIGIBLE_FOR_SERVICE_PRODUCT"],
        softReasonCodes: [],
        missingRequirements: [],
        locationState: "fresh",
        evaluatedAt: "2026-06-20T12:00:01.000Z",
      }),
    };
    const { service } = createOwnedMobilityService({
      enableVehicleEligibility: true,
      candidates: [
        {
          driverId: "drv-ineligible",
          vehicleId: "veh-demo-002",
          etaMinutes: 8,
          operatingArea: "taipei",
          serviceBuckets: ["business_dispatch"],
        },
      ],
      runtimeEligibilityEvaluator,
    });
    const booking = await service.createTenantBooking(
      {
        businessDispatchSubtype: "enterprise_dispatch",
        reservationWindowStart: "2026-06-20T13:00:00.000Z",
        reservationWindowEnd: "2026-06-20T14:00:00.000Z",
        pickup: { address: "HQ", lat: 25.033, lng: 121.5654 },
        dropoff: { address: "Airport" },
        passenger: { name: "Rider", phone: "0912000000" },
      },
      "tenant-demo-001",
    );
    const dispatchJob = service.dispatchOrder(booking.orderId, {
      mode: "auto",
    });

    const fallbackCandidates = await service.listDispatchCandidates(
      dispatchJob.dispatchJobId,
    );
    const allCandidates = await service.listDispatchCandidates(
      dispatchJob.dispatchJobId,
      true,
    );

    expect(fallbackCandidates).toHaveLength(1);
    expect(fallbackCandidates[0]?.eligibilityDecision).toBe("ineligible");
    expect(allCandidates).toHaveLength(1);
    expect(allCandidates[0]?.hardReasonCodes).toEqual([
      "VEHICLE_NOT_ELIGIBLE_FOR_SERVICE_PRODUCT",
    ]);
  });

  it("never offers an airport-permit-failing vehicle even under scarcity", async () => {
    const runtimeEligibilityEvaluator = {
      evaluate: vi.fn().mockResolvedValue({
        serviceProductId: "svc-airport",
        serviceProductCode: "credit_card_airport_transfer",
        policyVersion:
          "service:svc-airport@2026-06-20T00:00:00.000Z|capability:cap-3@2026-06-20T00:00:00.000Z",
        decision: "ineligible",
        hardReasonCodes: ["MISSING_AIRPORT_ELIGIBILITY"],
        softReasonCodes: [],
        missingRequirements: [],
        locationState: "fresh",
        evaluatedAt: "2026-06-20T12:00:01.000Z",
      }),
    };
    const { service } = createOwnedMobilityService({
      enableVehicleEligibility: true,
      candidates: [
        {
          driverId: "drv-no-airport",
          vehicleId: "veh-demo-002",
          etaMinutes: 8,
          operatingArea: "taipei",
          serviceBuckets: ["business_dispatch"],
        },
      ],
      runtimeEligibilityEvaluator,
    });
    const booking = await service.createTenantBooking(
      {
        businessDispatchSubtype: "credit_card_airport_transfer",
        reservationWindowStart: "2026-06-20T13:00:00.000Z",
        reservationWindowEnd: "2026-06-20T14:00:00.000Z",
        pickup: { address: "HQ", lat: 25.033, lng: 121.5654 },
        dropoff: { address: "Taoyuan Airport" },
        passenger: { name: "Rider", phone: "0912000000" },
      },
      "tenant-demo-001",
    );
    const dispatchJob = service.dispatchOrder(booking.orderId, {
      mode: "auto",
    });

    // Default dispatch must NOT re-admit the airport-ineligible vehicle: the
    // broad business_dispatch candidate cannot satisfy the airport transfer.
    const fallbackCandidates = await service.listDispatchCandidates(
      dispatchJob.dispatchJobId,
    );
    expect(fallbackCandidates).toHaveLength(0);

    // It still appears in the diagnostic includeIneligible view.
    const allCandidates = await service.listDispatchCandidates(
      dispatchJob.dispatchJobId,
      true,
    );
    expect(allCandidates).toHaveLength(1);
    expect(allCandidates[0]?.hardReasonCodes).toEqual([
      "MISSING_AIRPORT_ELIGIBILITY",
    ]);
  });

  it("resolves tenant booking passenger and addresses from governed master data", async () => {
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

    const booking = await service.createTenantBooking(
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
    const updated = await service.updateTenantBooking(
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

  it("resolves partner booking and order records persisted by another API instance", async () => {
    const tenantPartnerService = new TenantPartnerService(
      new AuditNotificationService(),
    );
    const producer = createOwnedMobilityService({
      candidates: [],
      tenantPartnerService,
    }).service;
    const booking = await producer.createTenantBooking(
      {
        businessDispatchSubtype: "enterprise_dispatch",
        reservationWindowStart: "2099-06-05T10:00:00.000Z",
        reservationWindowEnd: "2099-06-05T11:00:00.000Z",
        pickup: { address: "Pickup" },
        dropoff: { address: "Dropoff" },
        passenger: { name: "Rider One", phone: "0912000000" },
      },
      "tenant-demo-001",
    );
    const persistedOrder = producer.getOrder(booking.orderId);
    const parallelProducer = createOwnedMobilityService({
      candidates: [],
      tenantPartnerService,
    }).service;
    const parallelBooking = await parallelProducer.createTenantBooking(
      {
        businessDispatchSubtype: "enterprise_dispatch",
        reservationWindowStart: "2099-06-05T10:00:00.000Z",
        reservationWindowEnd: "2099-06-05T11:00:00.000Z",
        pickup: { address: "Pickup" },
        dropoff: { address: "Dropoff" },
        passenger: { name: "Rider Two", phone: "0912000001" },
      },
      "tenant-demo-001",
    );
    const parallelOrder = parallelProducer.getOrder(parallelBooking.orderId);
    expect(parallelBooking.bookingId).not.toBe(booking.bookingId);
    expect(parallelOrder.orderNo).not.toBe(persistedOrder.orderNo);

    let authorityOrder = persistedOrder;
    const repository = {
      isEnabled: vi.fn(() => true),
      findOrderById: vi.fn(async () => authorityOrder),
      findOrderByBookingId: vi.fn().mockResolvedValue(persistedOrder),
    };
    const orderConsumer = createOwnedMobilityService({
      candidates: [],
      repository: repository as never,
    }).service;
    const bookingConsumer = createOwnedMobilityService({
      candidates: [],
      repository: repository as never,
    }).service;

    await expect(
      orderConsumer.resolvePersistedOrder(persistedOrder.orderId),
    ).resolves.toEqual(persistedOrder);
    authorityOrder = {
      ...persistedOrder,
      status: "cancelled",
      updatedAt: new Date(
        Date.parse(persistedOrder.updatedAt) + 1_000,
      ).toISOString(),
    };
    await expect(
      orderConsumer.resolvePersistedOrder(persistedOrder.orderId),
    ).resolves.toMatchObject({
      status: "cancelled",
      updatedAt: authorityOrder.updatedAt,
    });
    await expect(
      bookingConsumer.resolvePersistedTenantBooking(
        "tenant-demo-001",
        booking.bookingId,
      ),
    ).resolves.toMatchObject({
      orderId: persistedOrder.orderId,
      bookingId: booking.bookingId,
    });
    expect(repository.findOrderById).toHaveBeenCalledWith(
      persistedOrder.orderId,
    );
    expect(repository.findOrderByBookingId).toHaveBeenCalledWith(
      booking.bookingId,
      "tenant-demo-001",
    );
  });

  it("allows unscoped partner_api_key callers to create partner-entry bookings", async () => {
    const tenantPartnerService = new TenantPartnerService(
      new AuditNotificationService(),
    );
    const verification = await tenantPartnerService.verifyPartnerEligibility({
      entrySlug: "bank-demo-alpha-airport",
      cardLast4: "2468",
    });
    const { service } = createOwnedMobilityService({
      candidates: [],
      tenantPartnerService,
    });

    const created = await service.createTenantBooking(
      {
        businessDispatchSubtype: "credit_card_airport_transfer",
        partnerEntrySlug: "bank-demo-alpha-airport",
        eligibilityVerificationId: verification.eligibilityVerificationId,
        direction: "pickup",
        pickup: { address: "桃園機場第二航廈" },
        dropoff: { address: "台北市信義區松高路11號" },
        reservationWindowStart: "2026-06-05T10:00:00.000Z",
        reservationWindowEnd: "2026-06-05T11:00:00.000Z",
        passenger: { name: "測試乘客", phone: "0911222333" },
        flightNo: "CI-001",
      },
      "tenant-demo-001",
      {
        authMode: "bootstrap_headers",
        actorType: "partner_api_key",
        actorId: "partner-key-alpha-demo",
        realm: "partner",
        roleFamilies: ["partner"],
        roles: ["partner"],
        scopes: ["partner:book"],
      } as never,
    );

    expect(service.getOrder(created.orderId)).toMatchObject({
      tenantId: "tenant-demo-001",
      partnerId: "partner-bank-demo-001",
      partnerProgramId: "program-airport-alpha",
      partnerEntrySlug: "bank-demo-alpha-airport",
      eligibilityVerificationId: verification.eligibilityVerificationId,
    });
  });

  it("validates costCenter against the tenant cost-center directory on create and update", async () => {
    vi.useFakeTimers();
    vi.setSystemTime(new Date("2026-05-13T12:00:00.000Z"));
    const tenantPartnerService = new TenantPartnerService(
      new AuditNotificationService(),
    );
    const { service } = createOwnedMobilityService({
      candidates: [],
      tenantPartnerService,
    });

    const booking = await service.createTenantBooking(
      {
        businessDispatchSubtype: "enterprise_dispatch",
        reservationWindowStart: "2026-05-13T14:00:00.000Z",
        reservationWindowEnd: "2026-05-13T15:00:00.000Z",
        pickup: { address: "Pickup" },
        dropoff: { address: "Dropoff" },
        passenger: { name: "Rider One", phone: "0912000000" },
        costCenter: "cc-fin-04",
      },
      "tenant-demo-001",
    );
    expect(
      service.getTenantBooking("tenant-demo-001", booking.bookingId).costCenter,
    ).toBe("CC-FIN-04");

    try {
      service.createTenantBooking(
        {
          businessDispatchSubtype: "enterprise_dispatch",
          reservationWindowStart: "2026-05-13T14:00:00.000Z",
          reservationWindowEnd: "2026-05-13T15:00:00.000Z",
          pickup: { address: "Pickup" },
          dropoff: { address: "Dropoff" },
          passenger: { name: "Rider One", phone: "0912000000" },
          costCenter: "CC-DOES-NOT-EXIST",
        },
        "tenant-demo-001",
      );
      throw new Error("Expected booking create to reject unknown cost center.");
    } catch (error) {
      expect((error as ApiRequestError).getResponse()).toMatchObject({
        error: { code: "BOOKING_COST_CENTER_UNKNOWN" },
      });
    }

    tenantPartnerService.disableCostCenter("tenant-demo-001", {
      code: "CC-FIN-04",
      reason: "sunset",
    });
    try {
      service.updateTenantBooking("tenant-demo-001", booking.bookingId, {
        costCenter: "CC-FIN-04",
      });
      throw new Error(
        "Expected booking update to reject disabled cost center.",
      );
    } catch (error) {
      expect((error as ApiRequestError).getResponse()).toMatchObject({
        error: { code: "BOOKING_COST_CENTER_DISABLED" },
      });
    }

    // Clearing the cost center is always allowed.
    const cleared = await service.updateTenantBooking(
      "tenant-demo-001",
      booking.bookingId,
      { costCenter: null },
    );
    expect(cleared.costCenter).toBeNull();
  });

  it("creates and resolves any_of approval requests on the first approval", async () => {
    const tenantPartnerService = new TenantPartnerService(
      new AuditNotificationService(),
    );
    tenantPartnerService.upsertApprovalRule("tenant-demo-001", {
      ruleName: "High-value approval",
      priority: 10,
      conditions: [
        {
          field: "booking.amount_minor",
          op: "gte",
          value: 100_000,
        },
      ],
      action: "require_approval",
      approvalMode: "any_of",
      approvers: [{ kind: "tenant_admin" }, { kind: "tenant_finance_admin" }],
    });
    const { service } = createOwnedMobilityService({
      candidates: [],
      tenantPartnerService,
    });

    const created = await service.createTenantBooking(
      {
        businessDispatchSubtype: "enterprise_dispatch",
        reservationWindowStart: "2026-05-13T14:00:00.000Z",
        reservationWindowEnd: "2026-05-13T15:00:00.000Z",
        pickup: { address: "Pickup" },
        dropoff: { address: "Dropoff" },
        passenger: { name: "Rider One", phone: "0912000000" },
      },
      "tenant-demo-001",
    );
    const pendingBooking = service.getTenantBooking(
      "tenant-demo-001",
      created.bookingId,
    );
    const request = tenantPartnerService.listApprovalRequests(
      "tenant-demo-001",
      {
        bookingId: created.bookingId,
      },
    )[0]!;

    expect(pendingBooking.approvalState).toBe("pending");
    expect(request.resolvedApproverUserIds).toEqual([
      "tenant-user-demo-001",
      "tenant-user-demo-003",
    ]);

    const approved = await service.approveTenantBookingApprovalRequest(
      "tenant-demo-001",
      request.approvalRequestId,
      "tenant-user-demo-003",
      null,
      {},
    );
    const approvedBooking = service.getTenantBooking(
      "tenant-demo-001",
      created.bookingId,
    );

    expect(approved.status).toBe("approved");
    expect(approvedBooking.approvalState).toBe("approved");
    expect(approvedBooking.approvalRequestIds).toEqual([]);
  });

  it("enforces approver authorization and all_of_parallel rejection semantics", async () => {
    const tenantPartnerService = new TenantPartnerService(
      new AuditNotificationService(),
    );
    tenantPartnerService.upsertApprovalRule("tenant-demo-001", {
      ruleName: "Dual control",
      priority: 10,
      conditions: [
        {
          field: "booking.amount_minor",
          op: "gte",
          value: 100_000,
        },
      ],
      action: "require_approval",
      approvalMode: "all_of_parallel",
      approvers: [{ kind: "tenant_admin" }, { kind: "tenant_finance_admin" }],
    });
    const { service } = createOwnedMobilityService({
      candidates: [],
      tenantPartnerService,
    });

    const created = await service.createTenantBooking(
      {
        businessDispatchSubtype: "enterprise_dispatch",
        reservationWindowStart: "2026-05-13T16:00:00.000Z",
        reservationWindowEnd: "2026-05-13T17:00:00.000Z",
        pickup: { address: "Pickup" },
        dropoff: { address: "Dropoff" },
        passenger: { name: "Rider Two", phone: "0912000001" },
      },
      "tenant-demo-001",
    );
    const request = tenantPartnerService.listApprovalRequests(
      "tenant-demo-001",
      {
        bookingId: created.bookingId,
      },
    )[0]!;

    await expect(
      service.approveTenantBookingApprovalRequest(
        "tenant-demo-001",
        request.approvalRequestId,
        "tenant-user-demo-004",
        null,
        {},
      ),
    ).rejects.toMatchObject({
      response: {
        error: {
          code: "APPROVAL_NOT_AUTHORIZED",
        },
      },
    });

    const pending = await service.approveTenantBookingApprovalRequest(
      "tenant-demo-001",
      request.approvalRequestId,
      "tenant-user-demo-001",
      null,
      {},
    );
    expect(pending.status).toBe("pending");
    expect(
      service.getTenantBooking("tenant-demo-001", created.bookingId)
        .approvalState,
    ).toBe("pending");

    const rejected = await service.rejectTenantBookingApprovalRequest(
      "tenant-demo-001",
      request.approvalRequestId,
      "tenant-user-demo-003",
      null,
      {
        reasonCode: "finance_reject",
      },
    );
    const rejectedBooking = service.getTenantBooking(
      "tenant-demo-001",
      created.bookingId,
    );

    expect(rejected.status).toBe("rejected");
    expect(rejectedBooking.approvalState).toBe("rejected");
    expect(rejectedBooking.orderStatus).toBe("cancelled");
  });

  it("falls back from cost-center owner to tenant_admin and audits the fallback", async () => {
    const approvalAudit = {
      recordAuditLog: vi.fn(),
      recordNotification: vi.fn(),
      dispatchApprovalNotification: vi.fn(async () => ({
        deduplicated: false,
        deliveredToUserIds: [],
        skippedUserIds: [],
      })),
    };
    const tenantPartnerService = new TenantPartnerService(
      approvalAudit as never,
    );
    tenantPartnerService.upsertApprovalRule("tenant-demo-001", {
      ruleName: "Exec office approval",
      priority: 10,
      conditions: [
        {
          field: "cost_center.code",
          op: "eq",
          value: "CC-EXEC-01",
        },
      ],
      action: "require_approval",
      approvers: [{ kind: "cost_center_owner" }],
    });
    const { service } = createOwnedMobilityService({
      candidates: [],
      tenantPartnerService,
    });

    const created = await service.createTenantBooking(
      {
        businessDispatchSubtype: "enterprise_dispatch",
        reservationWindowStart: "2026-05-13T18:00:00.000Z",
        reservationWindowEnd: "2026-05-13T19:00:00.000Z",
        pickup: { address: "Pickup" },
        dropoff: { address: "Dropoff" },
        passenger: { name: "Exec Rider", phone: "0912000002" },
        costCenter: "CC-EXEC-01",
      },
      "tenant-demo-001",
    );
    const request = tenantPartnerService.listApprovalRequests(
      "tenant-demo-001",
      {
        bookingId: created.bookingId,
      },
    )[0]!;

    expect(request.resolvedApproverUserIds).toEqual(["tenant-user-demo-001"]);
    expect(approvalAudit.recordAuditLog).toHaveBeenCalledWith(
      expect.objectContaining({
        actionName: "approver_fallback_used",
      }),
    );
  });

  it("cancels pending approvals on re-evaluation, but ignores note-only updates", async () => {
    vi.useFakeTimers();
    vi.setSystemTime(new Date("2026-05-13T18:00:00.000Z"));
    const tenantPartnerService = new TenantPartnerService(
      new AuditNotificationService(),
    );
    tenantPartnerService.upsertApprovalRule("tenant-demo-001", {
      ruleName: "Cost-center approval",
      priority: 10,
      conditions: [
        {
          field: "cost_center.code",
          op: "eq",
          value: "CC-FIN-04",
        },
      ],
      action: "require_approval",
      approvers: [{ kind: "tenant_admin" }],
    });
    const { service } = createOwnedMobilityService({
      candidates: [],
      tenantPartnerService,
    });

    const created = await service.createTenantBooking(
      {
        businessDispatchSubtype: "enterprise_dispatch",
        reservationWindowStart: "2026-05-13T20:00:00.000Z",
        reservationWindowEnd: "2026-05-13T21:00:00.000Z",
        pickup: { address: "Pickup" },
        dropoff: { address: "Dropoff" },
        passenger: { name: "Rider Three", phone: "0912000003" },
        costCenter: "CC-FIN-04",
      },
      "tenant-demo-001",
    );
    const initialBooking = service.getTenantBooking(
      "tenant-demo-001",
      created.bookingId,
    );
    const initialRequestId = initialBooking.approvalRequestIds[0]!;

    const notesOnly = await service.updateTenantBooking(
      "tenant-demo-001",
      created.bookingId,
      { notes: "Driver prefers gate B" },
    );
    expect(notesOnly.approvalRequestIds).toEqual([initialRequestId]);

    const reevaluated = await service.updateTenantBooking(
      "tenant-demo-001",
      created.bookingId,
      { costCenter: null },
    );
    const requests = tenantPartnerService.listApprovalRequests(
      "tenant-demo-001",
      {
        bookingId: created.bookingId,
      },
    );

    expect(reevaluated.approvalState).toBe("not_required");
    expect(reevaluated.approvalRequestIds).toEqual([]);
    expect(requests[0]!.status).toBe("cancelled_by_re_evaluation");
  });

  it("supports manual escalate and fails closed when no approvers are resolvable", async () => {
    const tenantPartnerService = new TenantPartnerService(
      new AuditNotificationService(),
    );
    tenantPartnerService.upsertApprovalRule("tenant-demo-001", {
      ruleName: "Missing approver rule",
      priority: 10,
      conditions: [
        {
          field: "booking.amount_minor",
          op: "gte",
          value: 100_000,
        },
      ],
      action: "require_approval",
      approvers: [{ kind: "tenant_role", roleCode: "tenant_missing_role" }],
    });
    const { service } = createOwnedMobilityService({
      candidates: [],
      tenantPartnerService,
    });

    await expect(
      service.createTenantBooking(
        {
          businessDispatchSubtype: "enterprise_dispatch",
          reservationWindowStart: "2026-05-13T22:00:00.000Z",
          reservationWindowEnd: "2026-05-13T23:00:00.000Z",
          pickup: { address: "Pickup" },
          dropoff: { address: "Dropoff" },
          passenger: { name: "Blocked Rider", phone: "0912000004" },
        },
        "tenant-demo-001",
      ),
    ).rejects.toMatchObject({
      response: {
        error: {
          code: "APPROVAL_NO_RESOLVABLE_APPROVERS",
        },
      },
    });
    expect(service.listTenantBookings("tenant-demo-001").items).toHaveLength(0);

    tenantPartnerService.disableApprovalRule(
      "tenant-demo-001",
      tenantPartnerService.listApprovalRules("tenant-demo-001")[0]!.ruleId,
    );
    tenantPartnerService.upsertApprovalRule("tenant-demo-001", {
      ruleName: "Escalate me",
      priority: 10,
      conditions: [
        {
          field: "booking.amount_minor",
          op: "gte",
          value: 100_000,
        },
      ],
      action: "require_approval",
      approvers: [{ kind: "tenant_admin" }],
    });

    const created = await service.createTenantBooking(
      {
        businessDispatchSubtype: "enterprise_dispatch",
        reservationWindowStart: "2026-05-14T00:00:00.000Z",
        reservationWindowEnd: "2026-05-14T01:00:00.000Z",
        pickup: { address: "Pickup" },
        dropoff: { address: "Dropoff" },
        passenger: { name: "Escalation Rider", phone: "0912000005" },
      },
      "tenant-demo-001",
    );
    const request = tenantPartnerService.listApprovalRequests(
      "tenant-demo-001",
      {
        bookingId: created.bookingId,
      },
    )[0]!;

    const escalated = await service.escalateTenantBookingApprovalRequest(
      "tenant-demo-001",
      request.approvalRequestId,
      "tenant-user-demo-001",
      "tenant_admin",
      {},
    );

    expect(escalated.status).toBe("pending");
    expect(escalated.escalatedAt).not.toBeNull();
    expect(escalated.previousApprovers).toEqual(request.approvers);
    expect(escalated.resolvedApproverUserIds).toContain("tenant-user-demo-001");
    const escalatedBooking = service.getTenantBooking(
      "tenant-demo-001",
      created.bookingId,
    );
    expect(escalatedBooking.approvalState).toBe("pending");
    expect(escalatedBooking.approvalRequestIds).toEqual([
      request.approvalRequestId,
    ]);
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

  it("rejects manual fare override after a fixed-price order is completed", async () => {
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
    await service.acceptDriverTask(assignment.taskId, {
      acceptedAt: "2026-04-29T12:05:00.000Z",
    });
    await service.departDriverTask(assignment.taskId, {
      departedAt: "2026-04-29T12:10:00.000Z",
    });
    await service.arrivedPickup(assignment.taskId, {
      arrivedAt: "2026-04-29T12:20:00.000Z",
    });
    await service.startDriverTask(assignment.taskId, {
      startedAt: "2026-04-29T12:25:00.000Z",
    });
    await service.completeDriverTask(assignment.taskId, {
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

  it("creates an auditable pending exception override request", () => {
    vi.useFakeTimers();
    vi.setSystemTime(new Date("2026-04-29T12:00:00.000Z"));
    const { service, auditNotificationService } = createOwnedMobilityService({
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

    const requestedOrder = service.requestExceptionOverride(
      booking.orderId,
      {
        operatorId: "ops-request-001",
        reason: "Supervisor requested manual release review",
        overrideType: "release_to_dispatch",
        expiresInMinutes: 45,
      },
      {
        actorType: "ops_user",
        actorId: "ops-request-001",
      } as never,
      "req-override-request-001",
    );

    expect(requestedOrder.status).toBe("exception_hold");
    expect(requestedOrder.exceptionHold?.overrideRequest).toMatchObject({
      orderId: booking.orderId,
      overrideType: "release_to_dispatch",
      status: "pending_approval",
      reason: "Supervisor requested manual release review",
      requestedBy: {
        actorType: "ops_user",
        actorId: "ops-request-001",
      },
      approval: null,
      rejection: null,
      expiredAt: null,
    });

    const trace = service.listDispatchTrace(booking.orderId);
    expect(trace).toEqual(
      expect.arrayContaining([
        expect.objectContaining({
          eventType: "exception_hold.override_requested",
          details: expect.objectContaining({
            actorId: "ops-request-001",
            actorType: "ops_user",
            overrideType: "release_to_dispatch",
            reason: "Supervisor requested manual release review",
          }),
        }),
      ]),
    );
    expect(auditNotificationService.recordAuditLog).toHaveBeenCalledWith(
      expect.objectContaining({
        actionName: "request_exception_override",
        requestId: "req-override-request-001",
        newValuesSummary: expect.objectContaining({
          overrideType: "release_to_dispatch",
          reason: "Supervisor requested manual release review",
        }),
      }),
    );
  });

  it("approves exception override with a second actor and resolves the hold", () => {
    vi.useFakeTimers();
    vi.setSystemTime(new Date("2026-04-29T12:00:00.000Z"));
    const { service, auditNotificationService } = createOwnedMobilityService({
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
    service.requestExceptionOverride(
      booking.orderId,
      {
        operatorId: "ops-request-002",
        reason: "Approved manual fallback review completed",
        overrideType: "release_to_dispatch",
        expiresInMinutes: 30,
      },
      {
        actorType: "ops_user",
        actorId: "ops-request-002",
      } as never,
    );

    const approvedOrder = service.approveExceptionOverride(
      booking.orderId,
      {
        operatorId: "ops-approve-002",
        approvalNote: "Dual-control check complete",
      },
      {
        actorType: "platform_admin",
        actorId: "ops-approve-002",
      } as never,
      "req-override-approve-002",
    );

    expect(approvedOrder.status).toBe("ready_for_dispatch");
    expect(approvedOrder.reservationHoldStatus).toBe("requested");
    expect(approvedOrder.exceptionHold?.overrideRequest).toMatchObject({
      status: "approved",
      approval: {
        actorType: "platform_admin",
        actorId: "ops-approve-002",
        approvalNote: "Dual-control check complete",
      },
    });
    expect(approvedOrder.exceptionHold?.resolution).toMatchObject({
      resolution: "release_to_dispatch",
      actorId: "ops-approve-002",
    });

    const trace = service.listDispatchTrace(booking.orderId);
    expect(trace).toEqual(
      expect.arrayContaining([
        expect.objectContaining({
          eventType: "exception_hold.override_approved",
          details: expect.objectContaining({
            approverActorId: "ops-approve-002",
            approverActorType: "platform_admin",
            approvalNote: "Dual-control check complete",
          }),
        }),
        expect.objectContaining({
          eventType: "exception_hold.resolved.release",
          details: expect.objectContaining({
            operatorId: "ops-approve-002",
            traceId:
              approvedOrder.exceptionHold?.overrideRequest?.overrideRequestId,
          }),
        }),
      ]),
    );
    expect(auditNotificationService.recordAuditLog).toHaveBeenCalledWith(
      expect.objectContaining({
        actionName: "approve_exception_override",
        requestId: "req-override-approve-002",
        newValuesSummary: expect.objectContaining({
          requestedBy: "ops-request-002",
        }),
      }),
    );
    expect(auditNotificationService.recordAuditLog).toHaveBeenCalledWith(
      expect.objectContaining({
        actionName: "resolve_exception_hold",
        requestId: "req-override-approve-002",
        newValuesSummary: expect.objectContaining({
          resolution: "release_to_dispatch",
        }),
      }),
    );
  });

  it("rejects exception override while preserving the hold and audit trail", () => {
    vi.useFakeTimers();
    vi.setSystemTime(new Date("2026-04-29T12:00:00.000Z"));
    const { service, auditNotificationService } = createOwnedMobilityService({
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
    service.requestExceptionOverride(
      booking.orderId,
      {
        operatorId: "ops-request-003",
        reason: "Ops wants cancellation review",
        overrideType: "cancel_order",
      },
      {
        actorType: "ops_user",
        actorId: "ops-request-003",
      } as never,
    );

    const rejectedOrder = service.rejectExceptionOverride(
      booking.orderId,
      {
        operatorId: "ops-approve-003",
        rejectionReason: "Downstream compliance review still pending",
      },
      {
        actorType: "platform_admin",
        actorId: "ops-approve-003",
      } as never,
      "req-override-reject-003",
    );

    expect(rejectedOrder.status).toBe("exception_hold");
    expect(rejectedOrder.reservationHoldStatus).toBe("exception_hold");
    expect(rejectedOrder.exceptionHold?.overrideRequest).toMatchObject({
      overrideType: "cancel_order",
      status: "rejected",
      rejection: {
        actorType: "platform_admin",
        actorId: "ops-approve-003",
        rejectionReason: "Downstream compliance review still pending",
      },
    });
    expect(rejectedOrder.exceptionHold?.resolution).toBeNull();

    const trace = service.listDispatchTrace(booking.orderId);
    expect(trace).toEqual(
      expect.arrayContaining([
        expect.objectContaining({
          eventType: "exception_hold.override_rejected",
          details: expect.objectContaining({
            rejectorActorId: "ops-approve-003",
            overrideType: "cancel_order",
            rejectionReason: "Downstream compliance review still pending",
          }),
        }),
      ]),
    );
    expect(auditNotificationService.recordAuditLog).toHaveBeenCalledWith(
      expect.objectContaining({
        actionName: "reject_exception_override",
        requestId: "req-override-reject-003",
        newValuesSummary: expect.objectContaining({
          requestedBy: "ops-request-003",
        }),
      }),
    );
  });

  it("expires pending exception overrides explicitly before approval", () => {
    vi.useFakeTimers();
    vi.setSystemTime(new Date("2026-04-29T12:00:00.000Z"));
    const { service, auditNotificationService } = createOwnedMobilityService({
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
    service.requestExceptionOverride(
      booking.orderId,
      {
        operatorId: "ops-request-004",
        reason: "Short-lived emergency approval window",
        overrideType: "release_to_dispatch",
        expiresInMinutes: 5,
      },
      {
        actorType: "ops_user",
        actorId: "ops-request-004",
      } as never,
    );

    vi.setSystemTime(new Date("2026-04-29T12:06:00.000Z"));

    try {
      service.approveExceptionOverride(
        booking.orderId,
        {
          operatorId: "ops-approve-004",
          approvalNote: "Too late",
        },
        {
          actorType: "platform_admin",
          actorId: "ops-approve-004",
        } as never,
        "req-override-expire-004",
      );
      throw new Error("Expected approval to fail after expiry");
    } catch (error) {
      expect((error as ApiRequestError).getResponse()).toMatchObject({
        error: {
          code: "OVERRIDE_REQUEST_EXPIRED",
        },
      });
    }

    const expiredOrder = service.getOrder(booking.orderId);
    expect(expiredOrder.status).toBe("exception_hold");
    expect(expiredOrder.exceptionHold?.overrideRequest).toMatchObject({
      status: "expired",
    });
    expect(
      expiredOrder.exceptionHold?.overrideRequest?.expiredAt,
    ).not.toBeNull();

    const trace = service.listDispatchTrace(booking.orderId);
    expect(trace).toEqual(
      expect.arrayContaining([
        expect.objectContaining({
          eventType: "exception_hold.override_expired",
          details: expect.objectContaining({
            overrideRequestId:
              expiredOrder.exceptionHold?.overrideRequest?.overrideRequestId,
          }),
        }),
      ]),
    );
    expect(auditNotificationService.recordAuditLog).toHaveBeenCalledWith(
      expect.objectContaining({
        actionName: "expire_exception_override",
        requestId: "req-override-expire-004",
        newValuesSummary: expect.objectContaining({
          requestedBy: "ops-request-004",
        }),
      }),
    );
  });

  it("forbids self-approval on exception override requests", () => {
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
    service.requestExceptionOverride(
      booking.orderId,
      {
        operatorId: "ops-request-005",
        reason: "Requester cannot approve",
        overrideType: "release_to_dispatch",
      },
      {
        actorType: "ops_user",
        actorId: "ops-request-005",
      } as never,
    );

    expect(() =>
      service.approveExceptionOverride(
        booking.orderId,
        {
          operatorId: "ops-request-005",
          approvalNote: "Trying to self-approve",
        },
        {
          actorType: "ops_user",
          actorId: "ops-request-005",
        } as never,
      ),
    ).toThrowError(ApiRequestError);

    try {
      service.approveExceptionOverride(
        booking.orderId,
        {
          operatorId: "ops-request-005",
          approvalNote: "Trying to self-approve",
        },
        {
          actorType: "ops_user",
          actorId: "ops-request-005",
        } as never,
      );
    } catch (error) {
      expect((error as ApiRequestError).getResponse()).toMatchObject({
        error: {
          code: "OVERRIDE_SELF_APPROVAL_FORBIDDEN",
        },
      });
    }

    const order = service.getOrder(booking.orderId);
    expect(order.exceptionHold?.overrideRequest?.status).toBe(
      "pending_approval",
    );
    expect(order.status).toBe("exception_hold");
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

  it("allows reservation reassignment after the assignment release already finalized the hold", () => {
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
    const firstAssignment = service.assignDispatch({
      dispatchJobId: dispatchResult.dispatchJobId,
      vehicleId: "vehicle-001",
      driverId: "driver-001",
    });

    expect(service.getOrder(booking.orderId).reservationHoldStatus).toBe(
      "released",
    );

    const reassignResult = service.reassignDispatch({
      dispatchJobId: dispatchResult.dispatchJobId,
      vehicleId: "vehicle-002",
      driverId: "driver-002",
      reasonCode: "roc_human_fallback",
      reasonNote: "Recorder unhealthy, rotating to human driver",
    });
    const order = service.getOrder(booking.orderId);
    const trace = service.listDispatchTrace(booking.orderId);

    expect(reassignResult.assignmentId).not.toBe(firstAssignment.assignmentId);
    expect(order.status).toBe("assigned");
    expect(order.reservationHoldStatus).toBe("released");
    expect(
      trace.filter((entry) => entry.eventType === "reservation.hold.released"),
    ).toHaveLength(1);
    expect(trace).toEqual(
      expect.arrayContaining([
        expect.objectContaining({
          eventType: "dispatch.reassigned",
          details: expect.objectContaining({
            reasonCode: "roc_human_fallback",
            nextVehicleId: "vehicle-002",
            nextDriverId: "driver-002",
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

  it("restores the active assignment when reassign eligibility changes before reassignment completes", async () => {
    let backupVehicleDispatchable = true;
    const repository = {
      isEnabled: () => true,
      persistChanges: vi.fn(async () => undefined),
      persistOrderWorkflow: vi.fn(async () => undefined),
      withTransaction: vi.fn(async (work: (tx: unknown) => Promise<unknown>) =>
        work({}),
      ),
      reportPersistenceFailure: vi.fn(),
      reserveDispatchResources: vi.fn(async () => []),
      releaseDispatchResourceReservations: vi.fn(async () => 0),
      occupyDispatchResourceReservations: vi.fn(async () => 0),
    };
    const { service } = createOwnedMobilityService({
      candidates: [
        {
          driverId: "driver-001",
          vehicleId: "vehicle-001",
          etaMinutes: 5,
          operatingArea: "north",
          serviceBuckets: ["standard_taxi"],
        },
      ],
      repository,
      getVehicleDispatchability: (vehicleId: string) =>
        vehicleId === "vehicle-001" ? true : backupVehicleDispatchable,
    });

    const order = service.createPassengerOrder({
      pickup: { address: "A" },
      dropoff: { address: "B" },
      passenger: { name: "Test", phone: "0911111111" },
    });
    const dispatchResult = service.dispatchOrder(order.orderId, {
      mode: "auto",
    });
    const firstAssignment = await service.assignDispatch({
      dispatchJobId: dispatchResult.dispatchJobId,
      vehicleId: "vehicle-001",
      driverId: "driver-001",
    });

    repository.persistChanges.mockClear();
    repository.persistOrderWorkflow.mockClear();
    backupVehicleDispatchable = false;

    await expect(
      service.reassignDispatch({
        dispatchJobId: dispatchResult.dispatchJobId,
        vehicleId: "vehicle-002",
        driverId: "driver-002",
        reasonCode: "operator_reassign",
      }),
    ).rejects.toMatchObject({
      response: {
        error: {
          code: "ELIGIBILITY_CHANGED_BEFORE_ASSIGNMENT",
        },
      },
    });

    const snapshot = service.getReportingSnapshot();
    expect(
      snapshot.dispatchAssignments.filter(
        (assignment) =>
          assignment.dispatchJobId === dispatchResult.dispatchJobId,
      ),
    ).toEqual([
      expect.objectContaining({
        assignmentId: firstAssignment.assignmentId,
        status: "assigned",
        vehicleId: "vehicle-001",
        driverId: "driver-001",
      }),
    ]);
    expect(
      snapshot.driverTasks.filter(
        (task) => task.dispatchJobId === dispatchResult.dispatchJobId,
      ),
    ).toEqual([
      expect.objectContaining({
        taskId: firstAssignment.taskId,
        status: "pending_acceptance",
        vehicleId: "vehicle-001",
        driverId: "driver-001",
      }),
    ]);
    expect(service.listDispatchTrace(order.orderId)).not.toEqual(
      expect.arrayContaining([
        expect.objectContaining({
          eventType: "dispatch.reassigned",
        }),
      ]),
    );
    expect(repository.persistChanges).not.toHaveBeenCalled();
    expect(repository.persistOrderWorkflow).not.toHaveBeenCalled();
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

  it("releases reservation hold when cancelling from redispatch queue", async () => {
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
    const cancelledOrder = await service.cancelOwnedOrder(booking.orderId, {
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

  it("moves trips into proof_pending when signoff is missing", async () => {
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
    await service.acceptDriverTask(assignment.taskId, {
      acceptedAt: "2026-04-29T12:05:00.000Z",
    });
    await service.departDriverTask(assignment.taskId, {
      departedAt: "2026-04-29T12:10:00.000Z",
    });
    await service.arrivedPickup(assignment.taskId, {
      arrivedAt: "2026-04-29T12:20:00.000Z",
    });
    await service.startDriverTask(assignment.taskId, {
      startedAt: "2026-04-29T12:25:00.000Z",
    });

    try {
      await service.completeDriverTask(assignment.taskId, {
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

  it("returns EXPENSE_PROOF_REQUIRED and preserves partial proof evidence", async () => {
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
    await service.acceptDriverTask(assignment.taskId, {
      acceptedAt: "2026-04-29T12:05:00.000Z",
    });
    await service.departDriverTask(assignment.taskId, {
      departedAt: "2026-04-29T12:10:00.000Z",
    });
    await service.arrivedPickup(assignment.taskId, {
      arrivedAt: "2026-04-29T12:20:00.000Z",
    });
    await service.startDriverTask(assignment.taskId, {
      startedAt: "2026-04-29T12:25:00.000Z",
    });

    try {
      await service.completeDriverTask(assignment.taskId, {
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

  it("replays duplicate completion requests idempotently when the request id matches", async () => {
    const tenantPartnerService = {
      previewBookingQuotaImpact: vi.fn(() => ({
        impacts: [],
      })),
      evaluateApprovalRules: vi.fn(() => ({
        outcome: {
          blocked: false,
          approvalRequired: false,
        },
      })),
      reserveTenantQuota: vi.fn(() => ({
        ledgerEntries: [],
        impacts: [],
      })),
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
    await service.acceptDriverTask(assignment.taskId, {
      acceptedAt: "2026-04-29T12:05:00.000Z",
    });
    await service.departDriverTask(assignment.taskId, {
      departedAt: "2026-04-29T12:10:00.000Z",
    });
    await service.arrivedPickup(assignment.taskId, {
      arrivedAt: "2026-04-29T12:20:00.000Z",
    });
    await service.startDriverTask(assignment.taskId, {
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

    const completed = await service.completeDriverTask(
      assignment.taskId,
      command,
      "req-complete-001",
    );
    const replayed = await service.completeDriverTask(
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

  it("defers task completion side effects until the database transaction commits", async () => {
    const sequence: string[] = [];
    const tenantPartnerService = {
      isPersistenceEnabled: vi.fn(() => false),
      previewBookingQuotaImpact: vi.fn(() => ({ impacts: [] })),
      evaluateApprovalRules: vi.fn(() => ({
        outcome: { blocked: false, approvalRequired: false },
      })),
      reserveTenantQuota: vi.fn(() => ({ ledgerEntries: [], impacts: [] })),
      prepareTenantQuotaConsumption: vi.fn(async () => {
        sequence.push("quota");
        return {
          tenantId: "tenant-demo-001",
          ledgerEntries: [],
          updatedSnapshots: [],
        };
      }),
      applyCommittedQuotaConsumption: vi.fn(() => {
        sequence.push("quota_apply");
      }),
      publishWebhookEvent: vi.fn(async () => {
        sequence.push("webhook");
      }),
    } as unknown as TenantPartnerService;

    const state = new Map<string, any>();
    const outboxQueue: any[] = [];
    const repository = {
      isEnabled: () => true,
      persistChanges: vi.fn(async () => {}),
      persistOrderWorkflow: vi.fn(async (_tx, changes) => {
        sequence.push("persist");
        if (changes.orders?.[0]) {
          state.set("order", changes.orders[0]);
        }
        if (changes.dispatchAssignments?.[0]) {
          state.set("assignment", changes.dispatchAssignments[0]);
        }
        if (changes.driverTasks?.[0]) {
          state.set("task", changes.driverTasks[0]);
        }
        if (changes.dispatchTraceLogs?.[0]) {
          state.set("trace", changes.dispatchTraceLogs[0]);
        }
      }),
      persistDriverCompletionOutbox: vi.fn(async (_tx, records) => {
        sequence.push("persist_outbox");
        outboxQueue.push(...records);
      }),
      markDriverCompletionOutboxDelivered: vi.fn(async () => true),
      releaseDriverCompletionOutbox: vi.fn(async () => true),
      withTransaction: vi.fn(async (work) => {
        sequence.push("begin");
        const result = await work({} as never);
        sequence.push("commit");
        return result;
      }),
      loadDriverTaskCompletionBundleForUpdate: vi.fn(async () => ({
        order: state.get("order"),
        dispatchJob: state.get("dispatchJob"),
        assignment: state.get("assignment"),
        task: state.get("task"),
      })),
      hasDriverTaskTraceRequestId: vi.fn(async () => false),
      claimNextRecoverableDriverCompletionOutbox: vi.fn(async () => {
        const record = outboxQueue.shift();
        return record ? { action: "dispatch", record } : null;
      }),
      reportPersistenceFailure: vi.fn(),
      releaseDispatchResourceReservations: vi.fn(async () => 0),
    };

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
      repository,
    });
    const { service: seedService } = createOwnedMobilityService({
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

    const booking = seedService.createTenantBooking(
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
    const dispatchResult = seedService.dispatchOrder(booking.orderId, {
      mode: "auto",
    });
    const assignment = seedService.assignDispatch({
      dispatchJobId: dispatchResult.dispatchJobId,
      vehicleId: "vehicle-001",
      driverId: "driver-001",
    });
    await seedService.acceptDriverTask(assignment.taskId, {
      acceptedAt: "2026-04-29T12:05:00.000Z",
    });
    await seedService.departDriverTask(assignment.taskId, {
      departedAt: "2026-04-29T12:10:00.000Z",
    });
    await seedService.arrivedPickup(assignment.taskId, {
      arrivedAt: "2026-04-29T12:20:00.000Z",
    });
    await seedService.startDriverTask(assignment.taskId, {
      startedAt: "2026-04-29T12:25:00.000Z",
    });

    (service as any).orders = (seedService as any).orders.map((order: any) => ({
      ...order,
    }));
    (service as any).dispatchJobs = (seedService as any).dispatchJobs.map(
      (job: any) => ({ ...job }),
    );
    (service as any).dispatchAssignments = (
      seedService as any
    ).dispatchAssignments.map((item: any) => ({ ...item }));
    (service as any).driverTasks = (seedService as any).driverTasks.map(
      (task: any) => ({
        ...task,
        fare: task.fare ? { ...task.fare } : null,
        proof: task.proof
          ? {
              photos: [...task.proof.photos],
              signatureId: task.proof.signatureId ?? null,
              expenseItems: [...(task.proof.expenseItems ?? [])],
            }
          : null,
      }),
    );
    (service as any).dispatchTraceLogs = (
      seedService as any
    ).dispatchTraceLogs.map((trace: any) => ({
      ...trace,
      details: trace.details ? { ...trace.details } : undefined,
    }));

    state.set("order", service.getOrder(booking.orderId));
    state.set("dispatchJob", (service as any).dispatchJobs[0]);
    state.set("assignment", (service as any).dispatchAssignments[0]);
    state.set("task", service.listDriverTasks()[0]);
    sequence.length = 0;
    auditNotificationService.recordAuditLog.mockClear();
    (
      tenantPartnerService.publishWebhookEvent as ReturnType<typeof vi.fn>
    ).mockClear();

    await service.completeDriverTask(
      assignment.taskId,
      {
        completedAt: "2026-04-29T12:45:00.000Z",
        actualDistanceKm: 14.2,
        actualDurationSec: 1200,
        proof: { photos: [SAMPLE_PROOF_PHOTO] },
      },
      "req-complete-db-001",
    );

    expect(sequence.slice(0, 6)).toEqual([
      "begin",
      "quota",
      "persist",
      "persist_outbox",
      "commit",
      "quota_apply",
    ]);

    await new Promise((resolve) => setImmediate(resolve));
    expect(
      auditNotificationService.recordAuditLog.mock.calls.filter(
        ([input]) => input.actionName === "complete_trip",
      ),
    ).toHaveLength(1);
    expect(tenantPartnerService.publishWebhookEvent).toHaveBeenCalledWith(
      "tenant-demo-001",
      expect.objectContaining({
        eventType: "order.completed",
        outboxKey: expect.any(String),
      }),
    );
    expect(service.listDriverTasks()[0]).toMatchObject({ status: "completed" });
  });

  it("uses the locked database completion bundle even when local task state is stale or missing", async () => {
    const tenantPartnerService = {
      isPersistenceEnabled: vi.fn(() => false),
      previewBookingQuotaImpact: vi.fn(() => ({ impacts: [] })),
      evaluateApprovalRules: vi.fn(() => ({
        outcome: { blocked: false, approvalRequired: false },
      })),
      reserveTenantQuota: vi.fn(() => ({ ledgerEntries: [], impacts: [] })),
      prepareTenantQuotaConsumption: vi.fn(async () => ({
        tenantId: "tenant-demo-001",
        ledgerEntries: [],
        updatedSnapshots: [],
      })),
      applyCommittedQuotaConsumption: vi.fn(() => undefined),
      publishWebhookEvent: vi.fn(async () => undefined),
    } as unknown as TenantPartnerService;

    const state = new Map<string, any>();
    const repository = {
      isEnabled: () => true,
      persistChanges: vi.fn(async () => {}),
      persistOrderWorkflow: vi.fn(async (_tx, changes) => {
        if (changes.orders?.[0]) {
          state.set("order", changes.orders[0]);
        }
        if (changes.dispatchAssignments?.[0]) {
          state.set("assignment", changes.dispatchAssignments[0]);
        }
        if (changes.driverTasks?.[0]) {
          state.set("task", changes.driverTasks[0]);
        }
        if (changes.dispatchTraceLogs?.[0]) {
          state.set("trace", changes.dispatchTraceLogs[0]);
        }
      }),
      persistDriverCompletionOutbox: vi.fn(async () => {}),
      withTransaction: vi.fn(async (work) => work({} as never)),
      loadDriverTaskCompletionBundleForUpdate: vi.fn(async () => ({
        order: state.get("order"),
        dispatchJob: state.get("dispatchJob"),
        assignment: state.get("assignment"),
        task: state.get("task"),
      })),
      hasDriverTaskTraceRequestId: vi.fn(async () => false),
      reportPersistenceFailure: vi.fn(),
      releaseDispatchResourceReservations: vi.fn(async () => 0),
    };

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
      tenantPartnerService,
      repository,
    });
    const { service: seedService } = createOwnedMobilityService({
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

    const booking = seedService.createTenantBooking(
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
    const dispatchResult = seedService.dispatchOrder(booking.orderId, {
      mode: "auto",
    });
    const assignment = seedService.assignDispatch({
      dispatchJobId: dispatchResult.dispatchJobId,
      vehicleId: "vehicle-001",
      driverId: "driver-001",
    });
    await seedService.acceptDriverTask(assignment.taskId, {
      acceptedAt: "2026-04-29T12:05:00.000Z",
    });
    await seedService.departDriverTask(assignment.taskId, {
      departedAt: "2026-04-29T12:10:00.000Z",
    });
    await seedService.arrivedPickup(assignment.taskId, {
      arrivedAt: "2026-04-29T12:20:00.000Z",
    });
    await seedService.startDriverTask(assignment.taskId, {
      startedAt: "2026-04-29T12:25:00.000Z",
    });

    state.set("order", seedService.getOrder(booking.orderId));
    state.set("dispatchJob", (seedService as any).dispatchJobs[0]);
    state.set("assignment", (seedService as any).dispatchAssignments[0]);
    state.set("task", seedService.listDriverTasks()[0]);

    await expect(
      service.completeDriverTask(
        assignment.taskId,
        {
          completedAt: "2026-04-29T12:45:00.000Z",
          actualDistanceKm: 14.2,
          actualDurationSec: 1200,
          proof: { photos: [SAMPLE_PROOF_PHOTO] },
        },
        "req-complete-db-stale-local-001",
      ),
    ).resolves.toMatchObject({
      taskId: assignment.taskId,
      status: "completed",
    });

    expect(service.getOrder(booking.orderId)).toMatchObject({
      status: "completed",
    });
    expect(service.listDriverTasks()[0]).toMatchObject({
      taskId: assignment.taskId,
      status: "completed",
    });
  });

  it("persists deterministic outbox ids for driver-completion effects", async () => {
    const tenantPartnerService = {
      isPersistenceEnabled: vi.fn(() => false),
      previewBookingQuotaImpact: vi.fn(() => ({ impacts: [] })),
      evaluateApprovalRules: vi.fn(() => ({
        outcome: { blocked: false, approvalRequired: false },
      })),
      reserveTenantQuota: vi.fn(() => ({ ledgerEntries: [], impacts: [] })),
      prepareTenantQuotaConsumption: vi.fn(async () => ({
        tenantId: "tenant-demo-001",
        ledgerEntries: [],
        updatedSnapshots: [],
      })),
      applyCommittedQuotaConsumption: vi.fn(() => undefined),
      publishWebhookEvent: vi.fn(async () => undefined),
    } as unknown as TenantPartnerService;

    const state = new Map<string, any>();
    const persistDriverCompletionOutbox = vi.fn(async () => {});
    const repository = {
      isEnabled: () => true,
      persistChanges: vi.fn(async () => {}),
      persistOrderWorkflow: vi.fn(async (_tx, changes) => {
        if (changes.orders?.[0]) {
          state.set("order", changes.orders[0]);
        }
        if (changes.dispatchAssignments?.[0]) {
          state.set("assignment", changes.dispatchAssignments[0]);
        }
        if (changes.driverTasks?.[0]) {
          state.set("task", changes.driverTasks[0]);
        }
      }),
      persistDriverCompletionOutbox,
      withTransaction: vi.fn(async (work) => work({} as never)),
      loadDriverTaskCompletionBundleForUpdate: vi.fn(async () => ({
        order: state.get("order"),
        dispatchJob: state.get("dispatchJob"),
        assignment: state.get("assignment"),
        task: state.get("task"),
      })),
      hasDriverTaskTraceRequestId: vi.fn(async () => false),
      claimNextRecoverableDriverCompletionOutbox: vi.fn(async () => null),
      reportPersistenceFailure: vi.fn(),
      releaseDispatchResourceReservations: vi.fn(async () => 0),
    };

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
      tenantPartnerService,
      repository,
    });
    const { service: seedService } = createOwnedMobilityService({
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

    const booking = seedService.createTenantBooking(
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
    const dispatchResult = seedService.dispatchOrder(booking.orderId, {
      mode: "auto",
    });
    const assignment = seedService.assignDispatch({
      dispatchJobId: dispatchResult.dispatchJobId,
      vehicleId: "vehicle-001",
      driverId: "driver-001",
    });
    seedService.acceptDriverTask(assignment.taskId, {
      acceptedAt: "2026-04-29T12:05:00.000Z",
    });
    seedService.departDriverTask(assignment.taskId, {
      departedAt: "2026-04-29T12:10:00.000Z",
    });
    seedService.arrivedPickup(assignment.taskId, {
      arrivedAt: "2026-04-29T12:20:00.000Z",
    });
    seedService.startDriverTask(assignment.taskId, {
      startedAt: "2026-04-29T12:25:00.000Z",
    });

    state.set("order", seedService.getOrder(booking.orderId));
    state.set("dispatchJob", (seedService as any).dispatchJobs[0]);
    state.set("assignment", (seedService as any).dispatchAssignments[0]);
    state.set("task", seedService.listDriverTasks()[0]);

    await service.completeDriverTask(
      assignment.taskId,
      {
        completedAt: "2026-04-29T12:45:00.000Z",
        actualDistanceKm: 14.2,
        actualDurationSec: 1200,
        proof: { photos: [SAMPLE_PROOF_PHOTO] },
      },
      "req-complete-db-deterministic-001",
    );

    const persistedRecords = persistDriverCompletionOutbox.mock.calls[0]?.[1];
    expect(persistedRecords).toEqual(
      expect.arrayContaining([
        expect.objectContaining({
          taskId: assignment.taskId,
          effectType: "tenant_order_completed_webhook",
          outboxId: buildExpectedDriverCompletionOutboxId(
            assignment.taskId,
            "tenant_order_completed_webhook",
          ),
        }),
        expect.objectContaining({
          taskId: assignment.taskId,
          effectType: "owned_mobility_trip_completed",
          outboxId: buildExpectedDriverCompletionOutboxId(
            assignment.taskId,
            "owned_mobility_trip_completed",
          ),
        }),
      ]),
    );
  });

  it("hydrates local state from the locked database bundle when replaying a duplicate completion request", async () => {
    const tenantPartnerService = {
      isPersistenceEnabled: vi.fn(() => false),
      previewBookingQuotaImpact: vi.fn(() => ({ impacts: [] })),
      evaluateApprovalRules: vi.fn(() => ({
        outcome: { blocked: false, approvalRequired: false },
      })),
      reserveTenantQuota: vi.fn(() => ({ ledgerEntries: [], impacts: [] })),
      prepareTenantQuotaConsumption: vi.fn(async () => ({
        tenantId: "tenant-demo-001",
        ledgerEntries: [],
        updatedSnapshots: [],
      })),
      applyCommittedQuotaConsumption: vi.fn(() => undefined),
      publishWebhookEvent: vi.fn(async () => undefined),
    } as unknown as TenantPartnerService;

    const state = new Map<string, any>();
    const repository = {
      isEnabled: () => true,
      persistChanges: vi.fn(async () => {}),
      persistOrderWorkflow: vi.fn(async () => {}),
      persistDriverCompletionOutbox: vi.fn(async () => {}),
      withTransaction: vi.fn(async (work) => work({} as never)),
      loadDriverTaskCompletionBundleForUpdate: vi.fn(async () => ({
        order: state.get("order"),
        dispatchJob: state.get("dispatchJob"),
        assignment: state.get("assignment"),
        task: state.get("task"),
      })),
      hasDriverTaskTraceRequestId: vi.fn(async () => true),
      reportPersistenceFailure: vi.fn(),
    };

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
      repository,
    });
    const { service: seedService } = createOwnedMobilityService({
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

    const booking = seedService.createTenantBooking(
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
    const dispatchResult = seedService.dispatchOrder(booking.orderId, {
      mode: "auto",
    });
    const assignment = seedService.assignDispatch({
      dispatchJobId: dispatchResult.dispatchJobId,
      vehicleId: "vehicle-001",
      driverId: "driver-001",
    });
    await seedService.acceptDriverTask(assignment.taskId, {
      acceptedAt: "2026-04-29T12:05:00.000Z",
    });
    await seedService.departDriverTask(assignment.taskId, {
      departedAt: "2026-04-29T12:10:00.000Z",
    });
    await seedService.arrivedPickup(assignment.taskId, {
      arrivedAt: "2026-04-29T12:20:00.000Z",
    });
    await seedService.startDriverTask(assignment.taskId, {
      startedAt: "2026-04-29T12:25:00.000Z",
    });
    await seedService.completeDriverTask(
      assignment.taskId,
      {
        completedAt: "2026-04-29T12:45:00.000Z",
        actualDistanceKm: 14.2,
        actualDurationSec: 1200,
        proof: { photos: [SAMPLE_PROOF_PHOTO] },
      },
      "req-complete-db-replay-001",
    );

    const completedOrder = seedService.getOrder(booking.orderId);
    const completedAssignment = (seedService as any).dispatchAssignments[0];
    const completedTask = seedService.listDriverTasks()[0];
    state.set("order", completedOrder);
    state.set("dispatchJob", (seedService as any).dispatchJobs[0]);
    state.set("assignment", completedAssignment);
    state.set("task", completedTask);

    (service as any).orders = [{ ...completedOrder, status: "on_trip" }];
    (service as any).dispatchAssignments = [
      { ...completedAssignment, status: "accepted" },
    ];
    (service as any).driverTasks = [
      { ...completedTask, status: "on_trip", completedAt: null },
    ];
    auditNotificationService.recordAuditLog.mockClear();
    (
      tenantPartnerService.publishWebhookEvent as ReturnType<typeof vi.fn>
    ).mockClear();

    await expect(
      service.completeDriverTask(
        assignment.taskId,
        {
          completedAt: "2026-04-29T12:45:00.000Z",
          actualDistanceKm: 14.2,
          actualDurationSec: 1200,
          proof: { photos: [SAMPLE_PROOF_PHOTO] },
        },
        "req-complete-db-replay-001",
      ),
    ).resolves.toMatchObject({
      taskId: assignment.taskId,
      status: "completed",
    });

    expect(service.getOrder(booking.orderId)).toMatchObject({
      status: "completed",
    });
    expect(service.listDriverTasks()[0]).toMatchObject({
      taskId: assignment.taskId,
      status: "completed",
      completedAt: "2026-04-29T12:45:00.000Z",
    });
    expect(
      auditNotificationService.recordAuditLog.mock.calls.filter(
        ([input]) => input.actionName === "complete_trip",
      ),
    ).toHaveLength(0);
    expect(tenantPartnerService.publishWebhookEvent).not.toHaveBeenCalled();
  });

  it("does not mutate in-memory completion state when the database commit fails", async () => {
    const tenantPartnerService = {
      isPersistenceEnabled: vi.fn(() => false),
      previewBookingQuotaImpact: vi.fn(() => ({ impacts: [] })),
      evaluateApprovalRules: vi.fn(() => ({
        outcome: { blocked: false, approvalRequired: false },
      })),
      reserveTenantQuota: vi.fn(() => ({ ledgerEntries: [], impacts: [] })),
      prepareTenantQuotaConsumption: vi.fn(async () => ({
        tenantId: "tenant-demo-001",
        ledgerEntries: [],
        updatedSnapshots: [],
      })),
      applyCommittedQuotaConsumption: vi.fn(() => undefined),
      publishWebhookEvent: vi.fn(async () => undefined),
    } as unknown as TenantPartnerService;

    const state = new Map<string, any>();
    const repository = {
      isEnabled: () => true,
      persistChanges: vi.fn(async () => {}),
      persistOrderWorkflow: vi.fn(async (_tx, changes) => {
        if (changes.orders?.[0]) {
          state.set("order", changes.orders[0]);
        }
        if (changes.dispatchAssignments?.[0]) {
          state.set("assignment", changes.dispatchAssignments[0]);
        }
        if (changes.driverTasks?.[0]) {
          state.set("task", changes.driverTasks[0]);
        }
      }),
      persistDriverCompletionOutbox: vi.fn(async () => {}),
      withTransaction: vi.fn(async (work) => {
        await work({} as never);
        throw new Error("commit failed");
      }),
      loadDriverTaskCompletionBundleForUpdate: vi.fn(async () => ({
        order: state.get("order"),
        dispatchJob: state.get("dispatchJob"),
        assignment: state.get("assignment"),
        task: state.get("task"),
      })),
      hasDriverTaskTraceRequestId: vi.fn(async () => false),
      reportPersistenceFailure: vi.fn(),
      releaseDispatchResourceReservations: vi.fn(async () => 0),
    };

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
      repository,
    });

    const { service: seedService } = createOwnedMobilityService({
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

    const booking = seedService.createTenantBooking(
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
    const dispatchResult = seedService.dispatchOrder(booking.orderId, {
      mode: "auto",
    });
    const assignment = seedService.assignDispatch({
      dispatchJobId: dispatchResult.dispatchJobId,
      vehicleId: "vehicle-001",
      driverId: "driver-001",
    });
    await seedService.acceptDriverTask(assignment.taskId, {
      acceptedAt: "2026-04-29T12:05:00.000Z",
    });
    await seedService.departDriverTask(assignment.taskId, {
      departedAt: "2026-04-29T12:10:00.000Z",
    });
    await seedService.arrivedPickup(assignment.taskId, {
      arrivedAt: "2026-04-29T12:20:00.000Z",
    });
    await seedService.startDriverTask(assignment.taskId, {
      startedAt: "2026-04-29T12:25:00.000Z",
    });

    (service as any).orders = (seedService as any).orders.map((order: any) => ({
      ...order,
    }));
    (service as any).dispatchJobs = (seedService as any).dispatchJobs.map(
      (job: any) => ({ ...job }),
    );
    (service as any).dispatchAssignments = (
      seedService as any
    ).dispatchAssignments.map((item: any) => ({ ...item }));
    (service as any).driverTasks = (seedService as any).driverTasks.map(
      (task: any) => ({
        ...task,
        fare: task.fare ? { ...task.fare } : null,
        proof: task.proof
          ? {
              photos: [...task.proof.photos],
              signatureId: task.proof.signatureId ?? null,
              expenseItems: [...(task.proof.expenseItems ?? [])],
            }
          : null,
      }),
    );
    (service as any).dispatchTraceLogs = (
      seedService as any
    ).dispatchTraceLogs.map((trace: any) => ({
      ...trace,
      details: trace.details ? { ...trace.details } : undefined,
    }));

    state.set("order", service.getOrder(booking.orderId));
    state.set("dispatchJob", (service as any).dispatchJobs[0]);
    state.set("assignment", (service as any).dispatchAssignments[0]);
    state.set("task", service.listDriverTasks()[0]);
    auditNotificationService.recordAuditLog.mockClear();
    (
      tenantPartnerService.publishWebhookEvent as ReturnType<typeof vi.fn>
    ).mockClear();

    await expect(
      service.completeDriverTask(
        assignment.taskId,
        {
          completedAt: "2026-04-29T12:45:00.000Z",
          actualDistanceKm: 14.2,
          actualDurationSec: 1200,
          proof: { photos: [SAMPLE_PROOF_PHOTO] },
        },
        "req-complete-db-rollback",
      ),
    ).rejects.toThrow("commit failed");

    expect(service.getOrder(booking.orderId)).toMatchObject({
      status: "on_trip",
    });
    expect(service.listDriverTasks()[0]).toMatchObject({
      status: "on_trip",
      completedAt: null,
    });
    expect(
      auditNotificationService.recordAuditLog.mock.calls.filter(
        ([input]) => input.actionName === "complete_trip",
      ),
    ).toHaveLength(0);
    expect(tenantPartnerService.publishWebhookEvent).not.toHaveBeenCalled();
    expect(
      tenantPartnerService.applyCommittedQuotaConsumption,
    ).not.toHaveBeenCalled();
  });

  it("recovers pending driver-completion outbox work on module init", async () => {
    const tenantPartnerService = {
      publishWebhookEvent: vi.fn(async () => undefined),
    } as unknown as TenantPartnerService;
    const outbox = {
      outboxId: "outbox-recovery-001",
      taskId: "task-recovery-001",
      orderId: "order-recovery-001",
      effectType: "tenant_order_completed_webhook" as const,
      requestId: "req-recovery-001",
      payload: {
        effectType: "tenant_order_completed_webhook",
        tenantId: "tenant-demo-001",
        payload: {
          eventType: "order.completed",
          orderId: "order-recovery-001",
        },
      },
      status: "processing" as const,
      attemptCount: 1,
      nextAttemptAt: "2026-07-31T00:00:00.000Z",
      leaseToken: "2b2f6670-d8d0-4c82-af9e-8f75f0275778",
      leasedUntil: "2026-07-31T00:01:00.000Z",
      lastError: null,
      createdAt: "2026-07-31T00:00:00.000Z",
      deliveredAt: null,
    };
    const repository = {
      isEnabled: () => true,
      loadState: vi.fn(async () => ({
        orders: [],
        dispatchJobs: [],
        dispatchAttempts: [],
        dispatchAssignments: [],
        driverTasks: [],
        dispatchTraceLogs: [],
        passengerDisclosureSnapshots: [],
        consumerNotificationOutbox: [],
      })),
      persistChanges: vi.fn(async () => {}),
      persistOrderWorkflow: vi.fn(async () => {}),
      persistDriverCompletionOutbox: vi.fn(async () => {}),
      withTransaction: vi.fn(async (work) => work({} as never)),
      claimNextRecoverableDriverCompletionOutbox: vi
        .fn()
        .mockResolvedValueOnce({ action: "dispatch", record: outbox })
        .mockResolvedValueOnce(null),
      markDriverCompletionOutboxDelivered: vi.fn(async () => true),
      releaseDriverCompletionOutbox: vi.fn(async () => true),
      reportPersistenceFailure: vi.fn(),
    };

    const { service } = createOwnedMobilityService({
      tenantPartnerService,
      repository,
    });

    await service.onModuleInit();
    await service.onApplicationBootstrap();
    await new Promise((resolve) => setImmediate(resolve));

    expect(
      repository.claimNextRecoverableDriverCompletionOutbox,
    ).toHaveBeenCalled();
    expect(tenantPartnerService.publishWebhookEvent).toHaveBeenCalledWith(
      "tenant-demo-001",
      expect.objectContaining({
        eventType: "order.completed",
        orderId: "order-recovery-001",
      }),
    );
    expect(repository.markDriverCompletionOutboxDelivered).toHaveBeenCalledWith(
      expect.anything(),
      outbox.outboxId,
      expect.any(String),
      expect.any(String),
    );
    service.onModuleDestroy();
  });

  it("continues global outbox recovery even when state hydration fails", async () => {
    const repository = {
      isEnabled: () => true,
      loadState: vi.fn(async () => {
        throw new Error("db unavailable");
      }),
      persistChanges: vi.fn(async () => {}),
      persistOrderWorkflow: vi.fn(async () => {}),
      persistDriverCompletionOutbox: vi.fn(async () => {}),
      withTransaction: vi.fn(async (work) => work({} as never)),
      claimNextRecoverableDriverCompletionOutbox: vi
        .fn()
        .mockResolvedValueOnce(null),
      markDriverCompletionOutboxDelivered: vi.fn(async () => true),
      releaseDriverCompletionOutbox: vi.fn(async () => true),
      reportPersistenceFailure: vi.fn(),
    };

    const { service } = createOwnedMobilityService({ repository });

    await service.onModuleInit();
    await service.onApplicationBootstrap();
    await new Promise((resolve) => setImmediate(resolve));

    expect(repository.reportPersistenceFailure).toHaveBeenCalledWith(
      expect.any(Error),
      "module init",
    );
    expect(
      repository.claimNextRecoverableDriverCompletionOutbox,
    ).toHaveBeenCalledTimes(1);
    service.onModuleDestroy();
  });

  it("dead-letters expired final-attempt recovery rows without redispatching effects", async () => {
    const tenantPartnerService = {
      publishWebhookEvent: vi.fn(async () => undefined),
    } as unknown as TenantPartnerService;
    const repository = {
      isEnabled: () => true,
      loadState: vi.fn(async () => ({
        orders: [],
        dispatchJobs: [],
        dispatchAttempts: [],
        dispatchAssignments: [],
        driverTasks: [],
        dispatchTraceLogs: [],
        passengerDisclosureSnapshots: [],
        consumerNotificationOutbox: [],
      })),
      persistChanges: vi.fn(async () => {}),
      persistOrderWorkflow: vi.fn(async () => {}),
      persistDriverCompletionOutbox: vi.fn(async () => {}),
      withTransaction: vi.fn(async (work) => work({} as never)),
      claimNextRecoverableDriverCompletionOutbox: vi
        .fn()
        .mockResolvedValueOnce({
          action: "dead_letter",
          record: {
            outboxId: "outbox-dead-letter-001",
            taskId: "task-dead-letter-001",
            orderId: "order-dead-letter-001",
            effectType: "tenant_order_completed_webhook",
            requestId: "req-dead-letter-001",
            payload: {
              effectType: "tenant_order_completed_webhook",
              tenantId: "tenant-demo-001",
              payload: {
                eventType: "order.completed",
                orderId: "order-dead-letter-001",
              },
            },
            status: "dead_letter",
            attemptCount: 5,
            nextAttemptAt: "2026-07-31T00:00:00.000Z",
            leaseToken: null,
            leasedUntil: null,
            lastError:
              "Lease expired after the final delivery attempt before acknowledgement.",
            createdAt: "2026-07-31T00:00:00.000Z",
            deliveredAt: null,
          },
        })
        .mockResolvedValueOnce(null),
      markDriverCompletionOutboxDelivered: vi.fn(async () => true),
      releaseDriverCompletionOutbox: vi.fn(async () => true),
      reportPersistenceFailure: vi.fn(),
    };
    const warnSpy = vi
      .spyOn(Logger.prototype, "warn")
      .mockImplementation(() => undefined);

    const { service } = createOwnedMobilityService({
      tenantPartnerService,
      repository,
    });

    await service.onModuleInit();
    await service.onApplicationBootstrap();
    await new Promise((resolve) => setImmediate(resolve));

    expect(tenantPartnerService.publishWebhookEvent).not.toHaveBeenCalled();
    expect(
      repository.markDriverCompletionOutboxDelivered,
    ).not.toHaveBeenCalled();
    expect(repository.releaseDriverCompletionOutbox).not.toHaveBeenCalled();
    expect(warnSpy).toHaveBeenCalledWith(
      expect.stringContaining("dead-lettered after lease recovery"),
    );
    warnSpy.mockRestore();
    service.onModuleDestroy();
  });

  it("warns when a delivered outbox loses its lease before acknowledgement", async () => {
    const tenantPartnerService = {
      publishWebhookEvent: vi.fn(async () => undefined),
    } as unknown as TenantPartnerService;
    const outbox = {
      outboxId: "outbox-stale-ack-001",
      taskId: "task-stale-ack-001",
      orderId: "order-stale-ack-001",
      effectType: "tenant_order_completed_webhook" as const,
      requestId: "req-stale-ack-001",
      payload: {
        effectType: "tenant_order_completed_webhook",
        tenantId: "tenant-demo-001",
        payload: {
          eventType: "order.completed",
          orderId: "order-stale-ack-001",
        },
      },
      status: "processing" as const,
      attemptCount: 1,
      nextAttemptAt: "2026-07-31T00:00:00.000Z",
      leaseToken: "2b2f6670-d8d0-4c82-af9e-8f75f0275778",
      leasedUntil: "2026-07-31T00:01:00.000Z",
      lastError: null,
      createdAt: "2026-07-31T00:00:00.000Z",
      deliveredAt: null,
    };
    const repository = {
      isEnabled: () => true,
      loadState: vi.fn(async () => ({
        orders: [],
        dispatchJobs: [],
        dispatchAttempts: [],
        dispatchAssignments: [],
        driverTasks: [],
        dispatchTraceLogs: [],
        passengerDisclosureSnapshots: [],
        consumerNotificationOutbox: [],
      })),
      persistChanges: vi.fn(async () => {}),
      persistOrderWorkflow: vi.fn(async () => {}),
      persistDriverCompletionOutbox: vi.fn(async () => {}),
      withTransaction: vi.fn(async (work) => work({} as never)),
      claimNextRecoverableDriverCompletionOutbox: vi
        .fn()
        .mockResolvedValueOnce({ action: "dispatch", record: outbox })
        .mockResolvedValueOnce(null),
      markDriverCompletionOutboxDelivered: vi.fn(async () => false),
      releaseDriverCompletionOutbox: vi.fn(async () => true),
      reportPersistenceFailure: vi.fn(),
    };
    const warnSpy = vi
      .spyOn(Logger.prototype, "warn")
      .mockImplementation(() => undefined);

    const { service } = createOwnedMobilityService({
      tenantPartnerService,
      repository,
    });

    await service.onModuleInit();
    await service.onApplicationBootstrap();
    await new Promise((resolve) => setImmediate(resolve));

    expect(tenantPartnerService.publishWebhookEvent).toHaveBeenCalled();
    expect(warnSpy).toHaveBeenCalledWith(
      expect.stringContaining("acknowledgement lost its lease"),
    );
    warnSpy.mockRestore();
    service.onModuleDestroy();
  });

  it("warns distinctly when a failed outbox release loses its lease", async () => {
    const tenantPartnerService = {
      publishWebhookEvent: vi.fn(async () => {
        throw new Error("webhook unavailable");
      }),
    } as unknown as TenantPartnerService;
    const outbox = {
      outboxId: "outbox-stale-release-001",
      taskId: "task-stale-release-001",
      orderId: "order-stale-release-001",
      effectType: "tenant_order_completed_webhook" as const,
      requestId: "req-stale-release-001",
      payload: {
        effectType: "tenant_order_completed_webhook",
        tenantId: "tenant-demo-001",
        payload: {
          eventType: "order.completed",
          orderId: "order-stale-release-001",
        },
      },
      status: "processing" as const,
      attemptCount: 1,
      nextAttemptAt: "2026-07-31T00:00:00.000Z",
      leaseToken: "2b2f6670-d8d0-4c82-af9e-8f75f0275778",
      leasedUntil: "2026-07-31T00:01:00.000Z",
      lastError: null,
      createdAt: "2026-07-31T00:00:00.000Z",
      deliveredAt: null,
    };
    const repository = {
      isEnabled: () => true,
      loadState: vi.fn(async () => ({
        orders: [],
        dispatchJobs: [],
        dispatchAttempts: [],
        dispatchAssignments: [],
        driverTasks: [],
        dispatchTraceLogs: [],
        passengerDisclosureSnapshots: [],
        consumerNotificationOutbox: [],
      })),
      persistChanges: vi.fn(async () => {}),
      persistOrderWorkflow: vi.fn(async () => {}),
      persistDriverCompletionOutbox: vi.fn(async () => {}),
      withTransaction: vi.fn(async (work) => work({} as never)),
      claimNextRecoverableDriverCompletionOutbox: vi
        .fn()
        .mockResolvedValueOnce({ action: "dispatch", record: outbox })
        .mockResolvedValueOnce(null),
      markDriverCompletionOutboxDelivered: vi.fn(async () => true),
      releaseDriverCompletionOutbox: vi.fn(async () => false),
      reportPersistenceFailure: vi.fn(),
    };
    const warnSpy = vi
      .spyOn(Logger.prototype, "warn")
      .mockImplementation(() => undefined);

    const { service } = createOwnedMobilityService({
      tenantPartnerService,
      repository,
    });

    await service.onModuleInit();
    await service.onApplicationBootstrap();
    await new Promise((resolve) => setImmediate(resolve));

    expect(repository.releaseDriverCompletionOutbox).toHaveBeenCalled();
    expect(warnSpy).toHaveBeenCalledWith(
      expect.stringContaining("retry release lost its lease"),
    );
    expect(warnSpy).not.toHaveBeenCalledWith(
      expect.stringContaining("delivery failed"),
    );
    warnSpy.mockRestore();
    service.onModuleDestroy();
  });

  it("rejects duplicate completion requests after the trip is already completed", async () => {
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
    await service.acceptDriverTask(assignment.taskId, {
      acceptedAt: "2026-04-29T12:05:00.000Z",
    });
    await service.departDriverTask(assignment.taskId, {
      departedAt: "2026-04-29T12:10:00.000Z",
    });
    await service.arrivedPickup(assignment.taskId, {
      arrivedAt: "2026-04-29T12:20:00.000Z",
    });
    await service.startDriverTask(assignment.taskId, {
      startedAt: "2026-04-29T12:25:00.000Z",
    });

    await service.completeDriverTask(
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

    await expect(
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
    ).rejects.toThrowError(ApiRequestError);
  });

  it("replays proof-pending completion requests idempotently when the request id matches", async () => {
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
    await service.acceptDriverTask(assignment.taskId, {
      acceptedAt: "2026-04-29T12:05:00.000Z",
    });
    await service.departDriverTask(assignment.taskId, {
      departedAt: "2026-04-29T12:10:00.000Z",
    });
    await service.arrivedPickup(assignment.taskId, {
      arrivedAt: "2026-04-29T12:20:00.000Z",
    });
    await service.startDriverTask(assignment.taskId, {
      startedAt: "2026-04-29T12:25:00.000Z",
    });

    try {
      await service.completeDriverTask(
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

    const replayed = await service.completeDriverTask(
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

  it("rejects tenant bookings for inactive service products from the registry", async () => {
    const { service } = createOwnedMobilityService({
      serviceProductOverrides: {
        serviceProductType: "credit_card_airport_transfer",
        displayName: "Airport transfer",
        timing: "reservation",
        active: false,
        defaultBillingMode: "fixed_fare",
        defaultProofRequirements: ["photo", "signoff"],
      },
    });

    expect(() =>
      service.createTenantBooking(
        {
          businessDispatchSubtype: "credit_card_airport_transfer",
          reservationWindowStart: "2026-06-05T10:00:00.000Z",
          reservationWindowEnd: "2026-06-05T11:00:00.000Z",
          pickup: { address: "台中市西屯區台灣大道 1 號" },
          dropoff: { address: "桃園機場第一航廈" },
          passenger: { name: "測試乘客", phone: "0911222333" },
          direction: "dropoff",
        },
        "tenant-demo-001",
      ),
    ).toThrowError(ApiRequestError);
  });

  it("rejects a public runtime-profile override on owned orders", () => {
    const { service } = createOwnedMobilityService();

    expect(() =>
      service.createPassengerOrder(
        {
          pickup: { address: "台北車站" },
          dropoff: { address: "松山機場" },
          passenger: { name: "測試乘客", phone: "0911222333" },
        },
        null,
        undefined,
        "multi_taxi_direct",
      ),
    ).toThrowError(ApiRequestError);

    try {
      service.createPassengerOrder(
        {
          pickup: { address: "台北車站" },
          dropoff: { address: "松山機場" },
          passenger: { name: "測試乘客", phone: "0911222333" },
        },
        null,
        undefined,
        "multi_taxi_direct",
      );
    } catch (error) {
      expect((error as ApiRequestError).getStatus()).toBe(403);
      expect((error as ApiRequestError).getResponse()).toMatchObject({
        error: {
          code: "PUBLIC_RUNTIME_PROFILE_OVERRIDE_FORBIDDEN",
        },
      });
    }
  });

  it("rejects a public runtime-profile override on tenant bookings", () => {
    const { service } = createOwnedMobilityService();

    expect(() =>
      service.createTenantBooking(
        {
          businessDispatchSubtype: "credit_card_airport_transfer",
          reservationWindowStart: "2026-06-05T10:00:00.000Z",
          reservationWindowEnd: "2026-06-05T11:00:00.000Z",
          pickup: { address: "台中市西屯區台灣大道 1 號" },
          dropoff: { address: "桃園機場第一航廈" },
          passenger: { name: "測試乘客", phone: "0911222333" },
          direction: "dropoff",
        },
        "tenant-demo-001",
        null,
        undefined,
        "multi_taxi_direct",
      ),
    ).toThrowError(ApiRequestError);

    try {
      service.createTenantBooking(
        {
          businessDispatchSubtype: "credit_card_airport_transfer",
          reservationWindowStart: "2026-06-05T10:00:00.000Z",
          reservationWindowEnd: "2026-06-05T11:00:00.000Z",
          pickup: { address: "台中市西屯區台灣大道 1 號" },
          dropoff: { address: "桃園機場第一航廈" },
          passenger: { name: "測試乘客", phone: "0911222333" },
          direction: "dropoff",
        },
        "tenant-demo-001",
        null,
        undefined,
        "multi_taxi_direct",
      );
    } catch (error) {
      expect((error as ApiRequestError).getStatus()).toBe(403);
      expect((error as ApiRequestError).getResponse()).toMatchObject({
        error: {
          code: "PUBLIC_RUNTIME_PROFILE_OVERRIDE_FORBIDDEN",
        },
      });
    }
  });

  it("creates on-demand and scheduled multi-taxi orders with canonical runtime context", () => {
    const { service } = createOwnedMobilityService({
      serviceProductOverrides: {
        serviceProductType: "taxi_reservation",
        displayName: "Multi-taxi reservation",
        timing: "reservation",
        active: true,
        defaultBillingMode: "meter",
        defaultProofRequirements: [],
      },
    });
    const authorization = {
      authorizationId: "auth-mtx-001",
      operatorId: "operator-001",
      authorityCode: "TPE-MTX-001",
      businessPlanVersion: "2026.1",
      status: "approved" as const,
      serviceAreaCodes: ["TPE"],
      activeFareVersionId: "fare-001",
      effectiveFrom: "2026-01-01T00:00:00.000Z",
      effectiveUntil: "2027-01-01T00:00:00.000Z",
      createdAt: "2026-01-01T00:00:00.000Z",
      updatedAt: "2026-01-01T00:00:00.000Z",
    };

    const onDemand = service.createMultiTaxiRide(
      {
        pickup: { address: "台北車站" },
        dropoff: { address: "松山機場" },
        passenger: { name: "測試乘客", phone: "0911222333" },
        requestedPickupAt: new Date().toISOString(),
        timingMode: "on_demand",
        paymentMethodTokenRef: "pm-token-001",
      },
      authorization,
    );
    const scheduled = service.createMultiTaxiRide(
      {
        pickup: { address: "台北車站" },
        dropoff: { address: "桃園機場" },
        passenger: { name: "預約乘客", phone: "0911000000" },
        requestedPickupAt: "2026-12-01T10:00:00.000Z",
        timingMode: "scheduled",
        paymentMethodTokenRef: null,
      },
      authorization,
    );

    expect(onDemand).toMatchObject({
      runtimeProfileCode: "multi_taxi_direct",
      serviceProductCode: "taxi_reservation",
      acquisitionMode: "platform_reserved",
      timingMode: "on_demand",
      dispatchSemantics: "realtime",
      operatingAuthorizationId: "auth-mtx-001",
      queueMode: "virtual_matching",
    });
    expect(scheduled).toMatchObject({
      timingMode: "scheduled",
      dispatchSemantics: "reservation",
      operatingAuthorizationId: "auth-mtx-001",
    });
  });

  it("denies client-supplied street-hail and other canonical context overrides on multi-taxi intake", () => {
    const { service } = createOwnedMobilityService({
      serviceProductOverrides: {
        serviceProductType: "taxi_reservation",
        displayName: "Multi-taxi reservation",
        timing: "reservation",
        active: true,
        defaultBillingMode: "meter",
        defaultProofRequirements: [],
      },
    });
    const authorization = {
      authorizationId: "auth-mtx-001",
      operatorId: "operator-001",
      authorityCode: "TPE-MTX-001",
      businessPlanVersion: "2026.1",
      status: "approved" as const,
      serviceAreaCodes: ["TPE"],
      activeFareVersionId: "fare-001",
      effectiveFrom: "2026-01-01T00:00:00.000Z",
      effectiveUntil: "2027-01-01T00:00:00.000Z",
      createdAt: "2026-01-01T00:00:00.000Z",
      updatedAt: "2026-01-01T00:00:00.000Z",
    };

    expect(() =>
      service.createMultiTaxiRide(
        {
          pickup: { address: "台北車站" },
          dropoff: { address: "松山機場" },
          passenger: { name: "測試乘客", phone: "0911222333" },
          requestedPickupAt: new Date().toISOString(),
          timingMode: "on_demand",
          paymentMethodTokenRef: null,
          acquisitionMode: "street_hail",
        } as never,
        authorization,
      ),
    ).toThrowError(ApiRequestError);

    try {
      service.createMultiTaxiRide(
        {
          pickup: { address: "台北車站" },
          dropoff: { address: "松山機場" },
          passenger: { name: "測試乘客", phone: "0911222333" },
          requestedPickupAt: new Date().toISOString(),
          timingMode: "on_demand",
          paymentMethodTokenRef: null,
          acquisitionMode: "street_hail",
        } as never,
        authorization,
      );
    } catch (error) {
      expect((error as ApiRequestError).getResponse()).toMatchObject({
        error: {
          code: "MULTI_TAXI_CANONICAL_CONTEXT_OVERRIDE_FORBIDDEN",
          details: { field: "acquisitionMode" },
        },
      });
    }
  });

  it("denies client-supplied physical-rank queue context on multi-taxi intake", () => {
    const { service } = createOwnedMobilityService({
      serviceProductOverrides: {
        serviceProductType: "taxi_reservation",
        displayName: "Multi-taxi reservation",
        timing: "reservation",
        active: true,
        defaultBillingMode: "meter",
        defaultProofRequirements: [],
      },
    });
    const authorization = {
      authorizationId: "auth-mtx-001",
      operatorId: "operator-001",
      authorityCode: "TPE-MTX-001",
      businessPlanVersion: "2026.1",
      status: "approved" as const,
      serviceAreaCodes: ["TPE"],
      activeFareVersionId: "fare-001",
      effectiveFrom: "2026-01-01T00:00:00.000Z",
      effectiveUntil: "2027-01-01T00:00:00.000Z",
      createdAt: "2026-01-01T00:00:00.000Z",
      updatedAt: "2026-01-01T00:00:00.000Z",
    };

    expect(() =>
      service.createMultiTaxiRide(
        {
          pickup: { address: "台北車站" },
          dropoff: { address: "松山機場" },
          passenger: { name: "測試乘客", phone: "0911222333" },
          requestedPickupAt: new Date().toISOString(),
          timingMode: "on_demand",
          paymentMethodTokenRef: null,
          queueMode: "physical_rank",
        } as never,
        authorization,
      ),
    ).toThrowError(ApiRequestError);

    try {
      service.createMultiTaxiRide(
        {
          pickup: { address: "台北車站" },
          dropoff: { address: "松山機場" },
          passenger: { name: "測試乘客", phone: "0911222333" },
          requestedPickupAt: new Date().toISOString(),
          timingMode: "on_demand",
          paymentMethodTokenRef: null,
          queueMode: "physical_rank",
        } as never,
        authorization,
      );
    } catch (error) {
      expect((error as ApiRequestError).getResponse()).toMatchObject({
        error: {
          code: "MULTI_TAXI_CANONICAL_CONTEXT_OVERRIDE_FORBIDDEN",
          details: { field: "queueMode" },
        },
      });
    }
  });

  it("allows only virtual matching for multi-taxi queue entries", () => {
    const { service } = createOwnedMobilityService();
    const authorization = {
      authorizationId: "auth-mtx-001",
      operatorId: "operator-001",
      authorityCode: "TPE-MTX-001",
      businessPlanVersion: "2026.1",
      status: "approved" as const,
      serviceAreaCodes: ["TPE"],
      activeFareVersionId: "fare-001",
      effectiveFrom: "2026-01-01T00:00:00.000Z",
      effectiveUntil: "2027-01-01T00:00:00.000Z",
      createdAt: "2026-01-01T00:00:00.000Z",
      updatedAt: "2026-01-01T00:00:00.000Z",
    };

    const virtualEntry = service.queueCheckInMultiTaxi(
      {
        vehicleId: "veh-demo-001",
        siteId: "virtual-tpe",
        queueMode: "virtual_matching",
      },
      authorization,
    );
    expect(virtualEntry).toMatchObject({
      runtimeProfileCode: "multi_taxi_direct",
      queueMode: "virtual_matching",
      operatingAuthorizationId: "auth-mtx-001",
    });

    expect(() =>
      service.queueCheckInMultiTaxi(
        {
          vehicleId: "veh-demo-001",
          siteId: "taxi-stand-tpe",
          queueMode: "taxi_stand",
        },
        authorization,
      ),
    ).toThrowError(ApiRequestError);
  });

  it("enforces MTX-QUEUE-001 queue semantics and independent ordinary_taxi configuration", () => {
    const { service } = createOwnedMobilityService();
    const authorization = {
      authorizationId: "auth-mtx-002",
      operatorId: "operator-001",
      authorityCode: "TPE-MTX-001",
      businessPlanVersion: "2026.1",
      status: "approved" as const,
      serviceAreaCodes: ["TPE"],
      activeFareVersionId: "fare-001",
      effectiveFrom: "2026-01-01T00:00:00.000Z",
      effectiveUntil: "2027-01-01T00:00:00.000Z",
      createdAt: "2026-01-01T00:00:00.000Z",
      updatedAt: "2026-01-01T00:00:00.000Z",
    };

    // 1. multi_taxi_direct + virtual_matching passes
    const virtualCheckIn = service.queueCheckInMultiTaxi(
      {
        vehicleId: "veh-demo-001",
        siteId: "virtual-site-01",
        queueMode: "virtual_matching",
      },
      authorization,
    );
    expect(virtualCheckIn.queueMode).toBe("virtual_matching");

    // 2. multi_taxi_direct + physical_rank denied
    expect(() =>
      service.queueCheckInMultiTaxi(
        {
          vehicleId: "veh-demo-001",
          siteId: "rank-site-01",
          queueMode: "physical_rank",
        },
        authorization,
      ),
    ).toThrowError(ApiRequestError);

    // 3. multi_taxi_direct + taxi_stand denied
    expect(() =>
      service.queueCheckInMultiTaxi(
        {
          vehicleId: "veh-demo-001",
          siteId: "stand-site-01",
          queueMode: "taxi_stand",
        },
        authorization,
      ),
    ).toThrowError(ApiRequestError);

    // Cannot loosen multi_taxi_direct policy via setProfileQueuePolicy
    expect(() =>
      service.setProfileQueuePolicy("multi_taxi_direct", [
        "virtual_matching",
        "physical_rank",
      ]),
    ).toThrowError(ApiRequestError);

    // 4. ordinary_taxi policy is independently configurable
    expect(service.getProfileQueuePolicy("ordinary_taxi")).toEqual([
      "virtual_matching",
      "physical_rank",
      "taxi_stand",
    ]);

    // Check-in ordinary_taxi under virtual_matching before policy change
    const priorVirtualCheckIn = service.queueCheckIn({
      vehicleId: "veh-demo-002",
      siteId: "virtual-site-02",
      queueMode: "virtual_matching",
    });
    expect(priorVirtualCheckIn.status).toBe("checked_in");

    // Reconfigure ordinary_taxi to disallow virtual_matching
    service.setProfileQueuePolicy("ordinary_taxi", [
      "physical_rank",
      "taxi_stand",
    ]);
    expect(service.getProfileQueuePolicy("ordinary_taxi")).toEqual([
      "physical_rank",
      "taxi_stand",
    ]);

    // New check-in for ordinary_taxi with virtual_matching should now be denied
    expect(() =>
      service.queueCheckIn({
        vehicleId: "veh-demo-001",
        siteId: "virtual-site-01",
        queueMode: "virtual_matching",
      }),
    ).toThrowError(ApiRequestError);

    // Existing entry checked in under virtual_matching can still check out successfully
    const virtualCheckOut = service.queueCheckOut({
      vehicleId: "veh-demo-002",
      siteId: "virtual-site-02",
      queueMode: "virtual_matching",
    });
    expect(virtualCheckOut.status).toBe("checked_out");

    // Check-in for ordinary_taxi with physical_rank should still work
    const ordinaryCheckIn = service.queueCheckIn({
      vehicleId: "veh-demo-001",
      siteId: "rank-site-01",
      queueMode: "physical_rank",
    });
    expect(ordinaryCheckIn.queueMode).toBe("physical_rank");
  });

  it("builds a P-5 disclosure snapshot as part of multi-taxi assignment", () => {
    const { service } = createOwnedMobilityService({
      candidates: [
        {
          driverId: "drv-demo-001",
          vehicleId: "veh-demo-001",
          etaMinutes: 4,
          operatingArea: "TPE",
          serviceBuckets: ["standard_taxi"],
        },
      ],
      serviceProductOverrides: {
        serviceProductType: "taxi_reservation",
        displayName: "Multi-taxi reservation",
        timing: "reservation",
        active: true,
        defaultBillingMode: "meter",
        defaultProofRequirements: [],
      },
      vehicleDisclosureProfile: {
        vehicleId: "veh-demo-001",
        make: "Toyota",
        model: "Sienta",
        modelYear: 2024,
        doorCount: 5,
        color: "Silver",
        status: "complete",
        missingFieldCodes: [],
        version: 2,
      },
      driverRegistrationCredential: {
        driverId: "drv-demo-001",
        effectiveUntil: "2027-01-01",
        status: "verified_active",
        maskedDisplay: "RE***01",
        version: 3,
      },
    });
    const authorization = {
      authorizationId: "auth-mtx-001",
      operatorId: "operator-001",
      authorityCode: "TPE-MTX-001",
      businessPlanVersion: "2026.1",
      status: "approved" as const,
      serviceAreaCodes: ["TPE"],
      activeFareVersionId: "fare-001",
      effectiveFrom: "2026-01-01T00:00:00.000Z",
      effectiveUntil: "2027-01-01T00:00:00.000Z",
      createdAt: "2026-01-01T00:00:00.000Z",
      updatedAt: "2026-01-01T00:00:00.000Z",
    };
    const order = service.createMultiTaxiRide(
      {
        pickup: { address: "台北車站", lat: 25.0478, lng: 121.517 },
        dropoff: { address: "松山機場", lat: 25.0697, lng: 121.5525 },
        passenger: {
          passengerId: "passenger-001",
          name: "測試乘客",
          phone: "0911222333",
        },
        requestedPickupAt: new Date().toISOString(),
        timingMode: "on_demand",
        paymentMethodTokenRef: null,
      },
      authorization,
    );
    const dispatch = service.dispatchOrder(order.orderId, { mode: "auto" });
    const assignment = service.assignDispatch({
      dispatchJobId: dispatch.dispatchJobId,
      vehicleId: "veh-demo-001",
      driverId: "drv-demo-001",
    });
    const snapshot = service.getPassengerAssignmentDisclosure(order.orderId);

    expect(snapshot).toMatchObject({
      assignmentId: assignment.assignmentId,
      assignmentVersion: 1,
      vehicle: { plateNo: "TAXI-001", doorCount: 5 },
      driver: {
        registrationMaskedDisplay: "RE***01",
        registrationStatus: "verified_active",
      },
      rating: { displayState: "new_driver" },
    });
  });

  it("persists one route_unresolved anomaly before failing assignment closed", async () => {
    const databaseService = {
      isEnabled: vi.fn(() => true),
      query: vi.fn(async () => ({ rows: [] })),
    };
    const fareAnomalyService =
      await createFareAnomalyAuthority(databaseService);
    const recordSpy = vi.spyOn(fareAnomalyService, "recordQuoteAnomaly");
    const service = createMultiTaxiFareProducerService(fareAnomalyService);
    const order = await createFareProducerOrder(service, {
      resolvedRoute: false,
    });
    const dispatch = service.dispatchOrder(order.orderId, { mode: "auto" });

    await expect(
      service.assignDispatch({
        dispatchJobId: dispatch.dispatchJobId,
        vehicleId: "veh-demo-001",
        driverId: "drv-demo-001",
      }),
    ).rejects.toMatchObject({
      status: HttpStatus.CONFLICT,
    });

    expect(recordSpy).toHaveBeenCalledTimes(1);
    expect(recordSpy).toHaveBeenCalledWith({
      reason: "route_unresolved",
      snapshot: expect.objectContaining({
        orderId: order.orderId,
        passengerConfirmedAt: null,
      }),
    });
    const insertCall = databaseService.query.mock.calls.find(([sql]) =>
      String(sql).includes("INSERT INTO ops.fare_quote_anomalies"),
    );
    expect(insertCall).toBeDefined();
    expect(insertCall?.[1]).toEqual(
      expect.arrayContaining([order.orderId, "route_unresolved"]),
    );
    const persistedRecord = JSON.parse(String(insertCall?.[1]?.[6]));
    expect(persistedRecord.snapshot).toMatchObject({
      pickup: { lat: null, lng: null, resolvedAt: null },
      dropoff: { lat: null, lng: null, resolvedAt: null },
      passengerConfirmedAt: null,
    });
    expect(fareAnomalyService.list()[0]?.snapshot).toMatchObject({
      pickup: { lat: null, lng: null, resolvedAt: null },
      dropoff: { lat: null, lng: null, resolvedAt: null },
    });
  });

  it("records fare_policy_missing instead of inventing a fallback policy", async () => {
    const fareAnomalyService = await createFareAnomalyAuthority();
    const recordSpy = vi.spyOn(fareAnomalyService, "recordQuoteAnomaly");
    const service = createMultiTaxiFareProducerService(fareAnomalyService);
    const order = await createFareProducerOrder(service, {
      activeFareVersionId: " ",
    });
    const dispatch = service.dispatchOrder(order.orderId, { mode: "auto" });

    await expect(
      service.assignDispatch({
        dispatchJobId: dispatch.dispatchJobId,
        vehicleId: "veh-demo-001",
        driverId: "drv-demo-001",
      }),
    ).rejects.toThrowError(ApiRequestError);

    expect(recordSpy).toHaveBeenCalledTimes(1);
    expect(fareAnomalyService.list()).toEqual([
      expect.objectContaining({
        reason: "fare_policy_missing",
        snapshot: expect.objectContaining({
          orderId: order.orderId,
          farePolicyVersion: "",
          passengerConfirmedAt: null,
        }),
      }),
    ]);
  });

  it("resolves prior order anomalies after a valid route and fare snapshot", async () => {
    const fareAnomalyService = await createFareAnomalyAuthority();
    const resolveSpy = vi.spyOn(fareAnomalyService, "resolveOrderAnomalies");
    const service = createMultiTaxiFareProducerService(fareAnomalyService);
    const order = await createFareProducerOrder(service);
    await fareAnomalyService.recordQuoteAnomaly({
      reason: "route_unresolved",
      snapshot: {
        routeSnapshotId: "route-prior-001",
        quoteSnapshotId: "quote-prior-001",
        orderId: order.orderId,
        pickup: {
          address: "台北車站",
          lat: 25.0478,
          lng: 121.517,
          coordinateSource: "legacy_text",
          geocodeConfidence: "unknown",
          resolvedAt: "2026-07-24T08:00:00.000Z",
        },
        dropoff: {
          address: "松山機場",
          lat: 25.0697,
          lng: 121.5525,
          coordinateSource: "legacy_text",
          geocodeConfidence: "unknown",
          resolvedAt: "2026-07-24T08:00:00.000Z",
        },
        estimatedDistanceMeters: null,
        estimatedDurationSeconds: null,
        encodedPolyline: null,
        chargingMode: "meter_estimate",
        estimatedFareMinor: null,
        payableFareMinor: null,
        currency: "NTD",
        farePolicyId: "auth-mtx-fare-producer-001",
        farePolicyVersion: "fare-2026-001",
        fareChangeRuleId: "multi_taxi_passenger_confirmation",
        fareChangeRuleVersion: "1",
        fareChangeRuleDisplayText:
          "Fare changes require passenger disclosure and confirmation.",
        passengerConfirmedAt: null,
        generatedAt: "2026-07-24T08:00:00.000Z",
      },
    });
    const dispatch = service.dispatchOrder(order.orderId, { mode: "auto" });

    const assignment = await service.assignDispatch({
      dispatchJobId: dispatch.dispatchJobId,
      vehicleId: "veh-demo-001",
      driverId: "drv-demo-001",
    });

    expect(assignment.status).toBe("assigned");
    expect(resolveSpy).toHaveBeenCalledWith(order.orderId, expect.any(String));
    expect(fareAnomalyService.list()).toHaveLength(0);
  });

  it("does not report a committed assignment as failed when anomaly cleanup is unavailable", async () => {
    const fareAnomalyService = await createFareAnomalyAuthority();
    vi.spyOn(fareAnomalyService, "resolveOrderAnomalies").mockRejectedValueOnce(
      new Error("fare anomaly store unavailable"),
    );
    const service = createMultiTaxiFareProducerService(fareAnomalyService);
    const order = await createFareProducerOrder(service);
    const dispatch = service.dispatchOrder(order.orderId, { mode: "auto" });

    await expect(
      service.assignDispatch({
        dispatchJobId: dispatch.dispatchJobId,
        vehicleId: "veh-demo-001",
        driverId: "drv-demo-001",
      }),
    ).resolves.toMatchObject({
      status: "assigned",
    });
    expect(service.getOrder(order.orderId).status).toBe("assigned");
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

  it("handles dispatch timeout and places order in redispatch priority queue", async () => {
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

    // No assignment has been made yet at this point (only `dispatchOrder`,
    // not `assignDispatch`, has run), so this is a matching-stage timeout --
    // `acceptance_timeout` now requires a `targetAssignmentId` (SD §7.6) and
    // there is no assignment yet for this test to name.
    const timeoutResult = await service.handleDispatchTimeout(
      order.orderId,
      "matching_timeout",
    );

    expect(timeoutResult.status).toBe("dispatch_timeout");
    expect(timeoutResult.timeoutReasonCode).toBe("matching_timeout");

    const updatedOrder = service.getOrder(order.orderId);
    expect(updatedOrder.status).toBe("dispatch_timeout");
    expect(updatedOrder.queueFamily).toBe("redispatch_priority_queue");
    expect(updatedOrder.queueEntryReason).toBe("dispatch_timeout_retry");
    expect(updatedOrder.dispatchTimeout).not.toBeNull();
    expect(updatedOrder.dispatchTimeout!.timeoutReasonCode).toBe(
      "matching_timeout",
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

describe("OwnedMobilityService referral attribution (CRC-BE-003)", () => {
  const baseCommand = {
    pickup: { address: "Taipei Main Station", lat: 25.0478, lng: 121.5319 },
    dropoff: { address: "Songshan Airport" },
    passenger: { name: "Rider One", phone: "0912000000" },
  };

  it("stamps partnerEntrySlug from the handoff session identity onto the order", () => {
    const { service } = createOwnedMobilityService();
    const order = service.createPassengerOrder(
      baseCommand as any,
      {
        partnerEntrySlug: "referral-demo-community",
        partnerId: "partner-referral-demo-001",
      } as any,
    );
    expect(order.partnerEntrySlug).toBe("referral-demo-community");
    expect(order.partnerId).toBe("partner-referral-demo-001");
  });

  it("leaves partnerEntrySlug null for non-referral passenger rides", () => {
    const { service } = createOwnedMobilityService();
    const order = service.createPassengerOrder(baseCommand as any);
    expect(order.partnerEntrySlug).toBeNull();
    const order2 = service.createPassengerOrder(baseCommand as any, null);
    expect(order2.partnerEntrySlug).toBeNull();
  });

  it("derives referral booking subtype from the verified partner entry", async () => {
    const tenantPartnerService = new TenantPartnerService(
      new AuditNotificationService(),
    );
    const { service } = createOwnedMobilityService({
      tenantPartnerService,
    });

    const booking = await service.createReferralPassengerBooking(
      {
        entrySlug: "yuhe-residence",
        pickupAddress: "Taipei Main Station",
        dropoffAddress: "Taoyuan Airport T2",
        // This is the UI's vehicle label and must never be treated as a
        // backend service-product identifier.
        vehicleType: "comfort",
      },
      {
        actorType: "referral_passenger",
        actorId: "referral-passenger-001",
        realm: "partner",
        tenantId: "tenant-demo-001",
        partnerId: "partner_ead6bf3d-e858-47cc-bfe1-5a3742524118",
        partnerProgramId: "program-referral-community",
        partnerEntrySlug: "yuhe-residence",
        drtsPassengerId: "referral-passenger-001",
      } as never,
    );

    expect(booking.businessDispatchSubtype).toBe("enterprise_dispatch");
    expect(service.getOrder(booking.orderId).businessDispatchSubtype).toBe(
      "enterprise_dispatch",
    );
    const cancelled = await service.cancelReferralPassengerTrip(
      booking.orderId,
      { orderId: booking.orderId, reason: "Passenger changed plans" },
      {
        actorType: "referral_passenger",
        actorId: "referral-passenger-001",
        realm: "partner",
        tenantId: "tenant-demo-001",
        partnerId: "partner_ead6bf3d-e858-47cc-bfe1-5a3742524118",
        partnerProgramId: "program-referral-community",
        partnerEntrySlug: "yuhe-residence",
        drtsPassengerId: "referral-passenger-001",
      } as never,
    );
    expect(cancelled.status).toBe("cancelled");
  });

  it("uses the requested referral schedule for the reservation window", async () => {
    const tenantPartnerService = new TenantPartnerService(
      new AuditNotificationService(),
    );
    const { service } = createOwnedMobilityService({ tenantPartnerService });
    const scheduledAt = new Date(Date.now() + 4 * 60 * 60_000).toISOString();
    const booking = await service.createReferralPassengerBooking(
      {
        entrySlug: "yuhe-residence",
        pickupAddress: "Taipei Main Station",
        dropoffAddress: "Taoyuan Airport T2",
        scheduledAt,
      },
      {
        actorType: "referral_passenger",
        actorId: "referral-passenger-002",
        realm: "partner",
        tenantId: "tenant-demo-001",
        partnerId: "partner_ead6bf3d-e858-47cc-bfe1-5a3742524118",
        partnerProgramId: "program-referral-community",
        partnerEntrySlug: "yuhe-residence",
        drtsPassengerId: "referral-passenger-002",
      } as never,
    );
    expect(service.getOrder(booking.orderId).reservationWindowStart).toBe(
      scheduledAt,
    );
  });
});

// P5-RATE-001 (Fleet D) acceptance. Three criteria had no test at any level
// before this suite: the disclosure gate, assignment rollback, and version-safe
// redispatch. "scarcity cannot bypass a legal gate" is already covered by
// "never offers an airport-permit-failing vehicle even under scarcity" above,
// and the rating criteria are covered by the multi-taxi rating governance suites.
//
// Every case below drives the real production path — createMultiTaxiRide →
// dispatchOrder → assignDispatch → redispatchOrder. None of them pushes a
// hand-built record into private service state, because a fabricated shape can
// make a guard look alive when production never produces the field it reads.
describe("P5-RATE-001: Fleet D assignment authority acceptance", () => {
  const COMPLETE_DISCLOSURE = {
    vehicleId: "veh-demo-001",
    make: "Toyota",
    model: "Sienta",
    modelYear: 2024,
    doorCount: 5,
    color: "Silver",
    status: "complete",
    missingFieldCodes: [] as string[],
    version: 2,
  };
  const ACTIVE_CREDENTIAL = {
    driverId: "drv-demo-001",
    effectiveUntil: "2027-01-01",
    status: "verified_active",
    maskedDisplay: "RE***01",
    version: 3,
  };

  function createFleetDService(options?: {
    vehicleDisclosureProfile?: Record<string, unknown> | null;
    repository?: NonNullable<
      Parameters<typeof createOwnedMobilityService>[0]
    >["repository"];
    fareAnomalyService?: FareAnomalyService;
  }) {
    return createOwnedMobilityService({
      candidates: [
        {
          driverId: "drv-demo-001",
          vehicleId: "veh-demo-001",
          etaMinutes: 4,
          operatingArea: "TPE",
          serviceBuckets: ["standard_taxi"],
        },
      ],
      serviceProductOverrides: {
        serviceProductType: "taxi_reservation",
        displayName: "Multi-taxi reservation",
        timing: "reservation",
        active: true,
        defaultBillingMode: "meter",
        defaultProofRequirements: [],
      },
      vehicleDisclosureProfile:
        options?.vehicleDisclosureProfile === undefined
          ? COMPLETE_DISCLOSURE
          : options.vehicleDisclosureProfile,
      driverRegistrationCredential: ACTIVE_CREDENTIAL,
      // Spread rather than assign: `exactOptionalPropertyTypes` rejects an
      // explicit `undefined` for an optional property.
      ...(options?.fareAnomalyService
        ? { fareAnomalyService: options.fareAnomalyService }
        : {}),
      ...(options?.repository ? { repository: options.repository } : {}),
    });
  }

  // Read-only view of state that has no public accessor. Asserting on it is not
  // the same as fabricating it: nothing here writes into the service.
  function readOutbox(service: OwnedMobilityService) {
    return (service as unknown as { consumerNotificationOutbox: unknown[] })
      .consumerNotificationOutbox;
  }

  async function assignOnce(
    service: OwnedMobilityService,
    orderId: string,
  ): Promise<void> {
    const dispatch = service.dispatchOrder(orderId, { mode: "auto" });
    await service.assignDispatch({
      dispatchJobId: dispatch.dispatchJobId,
      vehicleId: "veh-demo-001",
      driverId: "drv-demo-001",
    });
  }

  // `assignDispatch` returns MaybePromise: it throws synchronously on the
  // in-memory path and rejects on the transactional one. Capture both so each
  // assertion is about the gate that fired, not about which path ran.
  async function captureApiError(run: () => unknown): Promise<ApiRequestError> {
    let caught: unknown;
    let threw = false;
    try {
      await run();
    } catch (error) {
      threw = true;
      caught = error;
    }
    expect(threw, "expected the call to be rejected").toBe(true);
    expect(caught).toBeInstanceOf(ApiRequestError);
    return caught as ApiRequestError;
  }

  it("refuses assignment when the vehicle passenger disclosure is incomplete", async () => {
    const fareAnomalyService = await createFareAnomalyAuthority();
    const { service } = createFleetDService({
      fareAnomalyService,
      vehicleDisclosureProfile: {
        ...COMPLETE_DISCLOSURE,
        status: "incomplete",
        missingFieldCodes: ["color", "doorCount"],
      },
    });
    const order = await createFareProducerOrder(service);
    const dispatch = service.dispatchOrder(order.orderId, { mode: "auto" });

    const error = await captureApiError(() =>
      service.assignDispatch({
        dispatchJobId: dispatch.dispatchJobId,
        vehicleId: "veh-demo-001",
        driverId: "drv-demo-001",
      }),
    );

    expect(error.getStatus()).toBe(HttpStatus.CONFLICT);
    expect(error.getResponse()).toMatchObject({
      error: {
        code: "P5_VEHICLE_DISCLOSURE_INCOMPLETE",
        details: {
          vehicleId: "veh-demo-001",
          missingFieldCodes: ["color", "doorCount"],
        },
      },
    });
    // The gate is not advisory: the order stays unassigned.
    expect(service.getOrder(order.orderId).status).not.toBe("assigned");
  });

  it("leaves no partial snapshot, assignment, or outbox row when assignment rolls back", async () => {
    const fareAnomalyService = await createFareAnomalyAuthority();
    const repository = {
      isEnabled: () => true,
      persistChanges: vi.fn(async () => undefined),
      persistOrderWorkflow: vi.fn(async () => undefined),
      withTransaction: <T>(work: (tx: unknown) => Promise<T>) => work({}),
      reportPersistenceFailure: vi.fn(),
      isActiveMultiTaxiAuthorizedVehicle: vi.fn(async () => true),
      // Mirrors what the real repository's INSERT ... ON CONFLICT returns for a
      // driver with no ratings, so the rating authority is satisfied and the
      // disclosure gate below is the only thing that fails.
      getOrInitializeDriverRatingSummary: vi.fn(
        async (
          _tx: unknown,
          driverId: string,
          calculatedAt: string,
        ): Promise<DriverRatingSummary> => ({
          driverId,
          displayState: "new_driver",
          averageRating: null,
          ratingCount: 0,
          lastRatedAt: null,
          aggregateVersion: 1,
          calculatedAt,
        }),
      ),
    };
    const { service } = createFleetDService({
      fareAnomalyService,
      repository,
      // Fails inside buildPassengerAssignmentAuthority — i.e. after the order,
      // dispatch job, assignment, task, and trace logs for the bundle have all
      // been built. This is precisely the window where a partial write could
      // escape, so it is the right place to prove none does.
      vehicleDisclosureProfile: {
        ...COMPLETE_DISCLOSURE,
        status: "incomplete",
        missingFieldCodes: ["color"],
      },
    });
    const order = await createFareProducerOrder(service);
    const dispatch = service.dispatchOrder(order.orderId, { mode: "auto" });
    const outboxBefore = readOutbox(service).length;

    const error = await captureApiError(() =>
      service.assignDispatch({
        dispatchJobId: dispatch.dispatchJobId,
        vehicleId: "veh-demo-001",
        driverId: "drv-demo-001",
      }),
    );
    expect(error.getResponse()).toMatchObject({
      error: { code: "P5_VEHICLE_DISCLOSURE_INCOMPLETE" },
    });
    // The failure happened inside the transaction, which is the only window a
    // partial write could have escaped through.
    expect(repository.isActiveMultiTaxiAuthorizedVehicle).toHaveBeenCalledTimes(
      1,
    );

    // No disclosure snapshot.
    expect(service.findPassengerAssignmentDisclosure(order.orderId)).toBeNull();
    // No notification outbox row.
    expect(readOutbox(service)).toHaveLength(outboxBefore);
    // No assignment and no driver task.
    const snapshot = service.getReportingSnapshot();
    expect(
      snapshot.dispatchAssignments.filter(
        (assignment) => assignment.orderId === order.orderId,
      ),
    ).toHaveLength(0);
    expect(
      snapshot.driverTasks.filter((task) => task.orderId === order.orderId),
    ).toHaveLength(0);
    // The order never advanced to assigned.
    expect(service.getOrder(order.orderId).status).not.toBe("assigned");
    // Nothing was written through the transactional workflow path.
    expect(repository.persistOrderWorkflow).not.toHaveBeenCalled();
  });

  it("rejects a stale redispatch that would replace a newer assignment", async () => {
    const fareAnomalyService = await createFareAnomalyAuthority();
    const { service } = createFleetDService({ fareAnomalyService });
    const order = await createFareProducerOrder(service);

    // Assignment v1. The version the passenger is told is the one the guard
    // must compare against, so read it from the disclosure snapshot rather
    // than assuming it.
    await assignOnce(service, order.orderId);
    const firstVersion = service.findPassengerAssignmentDisclosure(
      order.orderId,
    )!.assignmentVersion;
    expect(firstVersion).toBe(1);

    // A caller holding v1 is current, so its redispatch is accepted.
    service.redispatchOrder(order.orderId, {
      reasonCode: "driver_unreachable",
      expectedAssignmentVersion: firstVersion,
    });

    // Assignment v2 supersedes it.
    await assignOnce(service, order.orderId);
    const secondVersion = service.findPassengerAssignmentDisclosure(
      order.orderId,
    )!.assignmentVersion;
    expect(secondVersion).toBe(2);

    const before = service.getOrder(order.orderId);
    expect(before.status).toBe("assigned");

    // The v1 event arrives late. It must not cancel the v2 assignment.
    expect(() =>
      service.redispatchOrder(order.orderId, {
        reasonCode: "driver_unreachable",
        expectedAssignmentVersion: firstVersion,
      }),
    ).toThrowError(ApiRequestError);

    try {
      service.redispatchOrder(order.orderId, {
        reasonCode: "driver_unreachable",
        expectedAssignmentVersion: firstVersion,
      });
      expect.unreachable("stale redispatch must be rejected");
    } catch (error) {
      expect(error).toBeInstanceOf(ApiRequestError);
      expect((error as ApiRequestError).getStatus()).toBe(HttpStatus.CONFLICT);
      expect((error as ApiRequestError).getResponse()).toMatchObject({
        error: {
          code: "STALE_REDISPATCH_EVENT",
          details: {
            orderId: order.orderId,
            currentAssignmentVersion: secondVersion,
            expectedAssignmentVersion: firstVersion,
          },
        },
      });
    }

    // The rejection is total: the guard runs before any mutation, so neither the
    // order nor the newer assignment moved.
    const after = service.getOrder(order.orderId);
    expect(after.status).toBe("assigned");
    expect(after.dispatchAttemptCount).toBe(before.dispatchAttemptCount);
    expect(after.updatedAt).toBe(before.updatedAt);
    expect(after.lastDispatchFailureReason).toBe(
      before.lastDispatchFailureReason,
    );
    const live = service
      .getReportingSnapshot()
      .dispatchAssignments.filter(
        (assignment) =>
          assignment.orderId === order.orderId &&
          ["assigned", "accepted"].includes(assignment.status),
      );
    expect(live).toHaveLength(1);
  });

  it("still redispatches unconditionally when no expected version is supplied", async () => {
    const fareAnomalyService = await createFareAnomalyAuthority();
    const { service } = createFleetDService({ fareAnomalyService });
    const order = await createFareProducerOrder(service);

    // Reach assignment version 2 the only way production allows: assign,
    // redispatch, assign again.
    await assignOnce(service, order.orderId);
    service.redispatchOrder(order.orderId, {
      reasonCode: "driver_unreachable",
    });
    await assignOnce(service, order.orderId);
    expect(
      service.findPassengerAssignmentDisclosure(order.orderId)!
        .assignmentVersion,
    ).toBe(2);

    // A caller still holding v1 is now stale...
    expect(() =>
      service.redispatchOrder(order.orderId, {
        reasonCode: "driver_unreachable",
        expectedAssignmentVersion: 1,
      }),
    ).toThrowError(ApiRequestError);

    // ...but omitting the version keeps the pre-existing unconditional
    // behaviour, so the guard is opt-in and cannot strand callers that were
    // written before it existed.
    service.redispatchOrder(order.orderId, {
      reasonCode: "driver_unreachable",
    });
    expect(service.getOrder(order.orderId).status).toBe("redispatch_required");
  });
});

describe("UV-EXEC-004: owned-order UoW / CAS transaction primitives", () => {
  async function captureApiError(run: () => unknown): Promise<ApiRequestError> {
    let caught: unknown;
    let threw = false;
    try {
      await run();
    } catch (error) {
      threw = true;
      caught = error;
    }
    expect(threw, "expected the call to be rejected").toBe(true);
    expect(caught).toBeInstanceOf(ApiRequestError);
    return caught as ApiRequestError;
  }

  function buildVoiceOrderFixture(
    service: OwnedMobilityService,
    overrides: Record<string, unknown> = {},
  ) {
    const created = service.createPassengerOrder({
      pickup: { address: "Voice pickup landmark" },
      dropoff: { address: "Voice dropoff landmark" },
      passenger: { name: "Voice Rider", phone: "0911000111" },
    });
    const order = service.getOrder(created.orderId);
    return {
      ...order,
      callId: "call-uv-exec-004-001",
      voiceIntentId: "11111111-1111-1111-1111-111111111111",
      ...overrides,
    };
  }

  it("fails closed for createVoiceOrder when durable storage is not configured", async () => {
    const { service } = createOwnedMobilityService({ candidates: [] });
    const order = buildVoiceOrderFixture(service);

    const error = await captureApiError(() =>
      service.createVoiceOrder(order, "test_create_voice_order"),
    );
    expect(error.getStatus()).toBe(HttpStatus.SERVICE_UNAVAILABLE);
    expect(error.code).toBe("OWNED_MOBILITY_DB_REQUIRED");
  });

  it("fails closed for commitVoiceOrderMutation when durable storage is not configured", async () => {
    const { service } = createOwnedMobilityService({ candidates: [] });
    const order = buildVoiceOrderFixture(service);

    const error = await captureApiError(() =>
      service.commitVoiceOrderMutation(
        order.orderId,
        "test_commit_mutation",
        (current) => ({
          order: { ...current, status: "cancelled" as const },
          result: undefined,
        }),
      ),
    );
    expect(error.getStatus()).toBe(HttpStatus.SERVICE_UNAVAILABLE);
    expect(error.code).toBe("OWNED_MOBILITY_DB_REQUIRED");
  });

  it("creates a durable voice order and applies the committed row to the in-memory projection", async () => {
    const repository = {
      isEnabled: () => true,
      persistChanges: vi.fn(async () => undefined),
      persistOrderWorkflow: vi.fn(async () => undefined),
      withTransaction: vi.fn(async (work: (tx: unknown) => Promise<unknown>) =>
        work({}),
      ),
      reportPersistenceFailure: vi.fn(),
      insertVoiceOrder: vi.fn(async () => 1),
    };
    const { service } = createOwnedMobilityService({
      candidates: [],
      repository: repository as never,
    });
    const order = buildVoiceOrderFixture(service);

    const committed = await service.createVoiceOrder(
      order,
      "test_create_voice_order",
    );

    expect(committed.aggregateVersion).toBe(1);
    expect(repository.insertVoiceOrder).toHaveBeenCalledTimes(1);
    // The commit already replaced the in-memory projection -- a reader does
    // not need a DB round trip to see the version this method just committed.
    expect(service.getOrder(order.orderId).aggregateVersion).toBe(1);
  });

  it("translates a duplicate voice_intent_id/call_id collision into 409 VOICE_ORDER_DUPLICATE_LINK", async () => {
    const repository = {
      isEnabled: () => true,
      persistChanges: vi.fn(async () => undefined),
      persistOrderWorkflow: vi.fn(async () => undefined),
      withTransaction: vi.fn(async (work: (tx: unknown) => Promise<unknown>) =>
        work({}),
      ),
      reportPersistenceFailure: vi.fn(),
      insertVoiceOrder: vi.fn(
        async (_tx: unknown, order: { orderId: string }) => {
          throw new OwnedOrderDuplicateVoiceLinkError(
            order.orderId,
            new Error("23505"),
          );
        },
      ),
    };
    const { service } = createOwnedMobilityService({
      candidates: [],
      repository: repository as never,
    });
    const order = buildVoiceOrderFixture(service);

    const error = await captureApiError(() =>
      service.createVoiceOrder(order, "test_create_voice_order"),
    );
    expect(error.getStatus()).toBe(HttpStatus.CONFLICT);
    expect(error.code).toBe("VOICE_ORDER_DUPLICATE_LINK");
  });

  it("commits a CAS-protected mutation and only then updates the in-memory projection", async () => {
    let stored = { status: "ready_for_dispatch", aggregateVersion: 1 };
    const repository = {
      isEnabled: () => true,
      persistChanges: vi.fn(async () => undefined),
      persistOrderWorkflow: vi.fn(async () => undefined),
      withTransaction: vi.fn(async (work: (tx: unknown) => Promise<unknown>) =>
        work({}),
      ),
      reportPersistenceFailure: vi.fn(),
      findOrderForUpdate: vi.fn(async (_tx: unknown, orderId: string) => ({
        order: { ...seededOrder, ...stored, orderId },
        aggregateVersion: stored.aggregateVersion,
      })),
      updateOrderWithCas: vi.fn(
        async (
          _tx: unknown,
          order: { status: string },
          expectedVersion: number,
        ) => {
          if (expectedVersion !== stored.aggregateVersion) {
            throw new OwnedOrderVersionConflictError(
              "order-id",
              expectedVersion,
            );
          }
          stored = {
            status: order.status,
            aggregateVersion: expectedVersion + 1,
          };
          return stored.aggregateVersion;
        },
      ),
    };
    const { service } = createOwnedMobilityService({
      candidates: [],
      repository: repository as never,
    });
    const seededOrder = buildVoiceOrderFixture(service);

    const result = await service.commitVoiceOrderMutation(
      seededOrder.orderId,
      "test_commit_mutation",
      (current, currentVersion) => ({
        order: { ...current, status: "cancelled" as const },
        result: { status: current.status, currentVersion },
      }),
    );

    expect(result).toEqual({ status: "ready_for_dispatch", currentVersion: 1 });
    expect(stored).toEqual({ status: "cancelled", aggregateVersion: 2 });
    // Post-commit, the in-memory projection reflects the durable write.
    expect(service.getOrder(seededOrder.orderId).status).toBe("cancelled");
    expect(service.getOrder(seededOrder.orderId).aggregateVersion).toBe(2);
  });

  it("rejects a stale-snapshot mutation with 409 and leaves the in-memory projection untouched", async () => {
    const repository = {
      isEnabled: () => true,
      persistChanges: vi.fn(async () => undefined),
      persistOrderWorkflow: vi.fn(async () => undefined),
      withTransaction: vi.fn(async (work: (tx: unknown) => Promise<unknown>) =>
        work({}),
      ),
      reportPersistenceFailure: vi.fn(),
      findOrderForUpdate: vi.fn(async (_tx: unknown, orderId: string) => ({
        order: { ...seededOrder, orderId, status: "ready_for_dispatch" },
        aggregateVersion: 2,
      })),
      updateOrderWithCas: vi.fn(
        async (_tx: unknown, order: { orderId: string }) => {
          // Someone else committed in between: the CAS write in the real
          // repository would see aggregate_version has already moved on.
          throw new OwnedOrderVersionConflictError(order.orderId, 1);
        },
      ),
    };
    const { service } = createOwnedMobilityService({
      candidates: [],
      repository: repository as never,
    });
    const seededOrder = buildVoiceOrderFixture(service);
    const beforeStatus = service.getOrder(seededOrder.orderId).status;

    const error = await captureApiError(() =>
      service.commitVoiceOrderMutation(
        seededOrder.orderId,
        "test_commit_mutation",
        (current) => ({
          order: { ...current, status: "cancelled" as const },
          result: undefined,
        }),
      ),
    );

    expect(error.getStatus()).toBe(HttpStatus.CONFLICT);
    expect(error.code).toBe("VOICE_ORDER_VERSION_CONFLICT");
    // A rejected CAS write must not have touched the in-memory projection:
    // no array pollution ahead of a commit that never happened (SD §7.5).
    expect(service.getOrder(seededOrder.orderId).status).toBe(beforeStatus);
  });

  it("does not mutate the in-memory projection when the transaction rolls back for any other reason", async () => {
    const repository = {
      isEnabled: () => true,
      persistChanges: vi.fn(async () => undefined),
      persistOrderWorkflow: vi.fn(async () => undefined),
      withTransaction: vi.fn(async (work: (tx: unknown) => Promise<unknown>) =>
        work({}),
      ),
      reportPersistenceFailure: vi.fn(),
      findOrderForUpdate: vi.fn(async (_tx: unknown, orderId: string) => ({
        order: { ...seededOrder, orderId },
        aggregateVersion: 1,
      })),
      updateOrderWithCas: vi.fn(async () => {
        throw new Error("connection reset");
      }),
    };
    const { service } = createOwnedMobilityService({
      candidates: [],
      repository: repository as never,
    });
    const seededOrder = buildVoiceOrderFixture(service);
    const beforeStatus = service.getOrder(seededOrder.orderId).status;

    await expect(
      service.commitVoiceOrderMutation(
        seededOrder.orderId,
        "test_commit_mutation",
        (current) => ({
          order: { ...current, status: "cancelled" as const },
          result: undefined,
        }),
      ),
    ).rejects.toThrow("connection reset");

    expect(service.getOrder(seededOrder.orderId).status).toBe(beforeStatus);
  });
});
