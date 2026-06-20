import { describe, expect, it, vi } from "vitest";

import type { ResolvedRuntimeEligibilityContext } from "../../src/modules/vehicle-eligibility/eligibility-context-resolver.service";
import { RuntimeEligibilityEvaluator } from "../../src/modules/vehicle-eligibility/runtime-eligibility-evaluator.service";

function createResolvedContext(
  overrides?: Partial<ResolvedRuntimeEligibilityContext>,
): ResolvedRuntimeEligibilityContext {
  return {
    orderId: "ord-001",
    dispatchJobId: "job-001",
    driverId: "drv-001",
    vehicleId: "veh-001",
    serviceProductId: "svc-001",
    serviceProductCode: "enterprise_dispatch",
    sourcePlatform: null,
    policyVersion: "service:svc-001@2026-06-20T00:00:00.000Z|capability:cap-001@2026-06-20T00:00:00.000Z",
    evaluatedAt: "2026-06-20T12:00:00.000Z",
    driver: {
      driverId: "drv-001",
      name: "Driver One",
      supportedServiceBuckets: ["standard_taxi", "business_dispatch"],
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
    vehicle: {
      vehicleId: "veh-001",
      plateNo: "ABC-001",
      operatingArea: "taichung-port",
      supportedServiceBuckets: ["business_dispatch"],
      dispatchableFlag: true,
      exclusivityApproved: true,
      insuranceStatus: "valid",
      updatedAt: "2026-06-20T00:00:00.000Z",
      supplyLifecycle: {
        contract: {
          contractId: "contract-001",
          lifecycleStatus: "active",
          startAt: "2026-06-01T00:00:00.000Z",
          endAt: null,
          updatedAt: "2026-06-20T00:00:00.000Z",
        },
        insurance: {
          policyId: "policy-001",
          lifecycleStatus: "active",
          startAt: "2026-06-01T00:00:00.000Z",
          endAt: null,
          updatedAt: "2026-06-20T00:00:00.000Z",
        },
        exclusivity: {
          lifecycleStatus: "approved",
          declarationStatus: "submitted",
          declarationFileId: "decl-001",
          reviewStatus: "approved",
          providerName: "DRTS",
          effectiveStart: "2026-06-01T00:00:00.000Z",
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
    vehicleCapability: {
      capabilityId: "cap-001",
      vehicleId: "veh-001",
      licenseType: "business_vehicle",
      supportedProducts: [
        "enterprise_dispatch",
        "credit_card_airport_transfer",
      ],
      seatCount: 5,
      luggageCapacity: 4,
      airportPermit: true,
      businessDispatchEligible: true,
      taxiMeterRequired: false,
      fixedFareAllowed: true,
      conditionallyAllowed: false,
      requiredDocuments: [],
      trainingRequired: false,
      permitRequired: false,
      platformForwardingAllowed: false,
      active: true,
      effectiveFrom: "2026-06-01T00:00:00.000Z",
      effectiveUntil: null,
      createdAt: "2026-06-01T00:00:00.000Z",
      updatedAt: "2026-06-20T00:00:00.000Z",
    },
    serviceProduct: {
      serviceProduct: "enterprise_dispatch",
      displayName: "Enterprise Dispatch",
      timing: "reservation",
      active: true,
      serviceBucket: "business_dispatch",
      allowedLicenseTypes: [
        "taxi",
        "multi_purpose_taxi",
        "rental_car",
        "business_vehicle",
      ],
      meterRequired: false,
      fixedFareAllowed: true,
      requiresBusinessDispatchEligible: true,
      requiresAirportPermit: false,
      requiresPlatformForwardingAllowed: false,
      defaultProofRequirements: ["photo"],
    },
    currentLocation: {
      driverId: "drv-001",
      lat: 24.266,
      lng: 120.62,
      accuracyM: 30,
      recordedAt: "2026-06-20T11:59:00.000Z",
      updatedAt: "2026-06-20T11:59:00.000Z",
    },
    platformBindings: [],
    driverReadiness: {
      ready: true,
      reasonCodes: [],
    },
    vehicleReadiness: {
      ready: true,
      reasonCodes: [],
    },
    ...overrides,
  };
}

function createEvaluator(
  resolvedContext: ResolvedRuntimeEligibilityContext,
) {
  const eligibilityContextResolver = {
    resolve: vi.fn(() => resolvedContext),
  };
  const auditNotificationService = {
    recordAuditLog: vi.fn(),
  };
  const repository = {
    insertRuntimeEligibilityDecision: vi.fn(),
    reportPersistenceFailure: vi.fn(),
  };

  return {
    evaluator: new RuntimeEligibilityEvaluator(
      eligibilityContextResolver as never,
      auditNotificationService as never,
      repository as never,
    ),
    eligibilityContextResolver,
    auditNotificationService,
    repository,
  };
}

describe("RuntimeEligibilityEvaluator", () => {
  it("rejects airport transfers when airport eligibility is missing", async () => {
    const context = createResolvedContext({
      serviceProductCode: "credit_card_airport_transfer",
      serviceProduct: {
        ...createResolvedContext().serviceProduct,
        serviceProduct: "credit_card_airport_transfer",
        requiresAirportPermit: true,
      },
      vehicleCapability: {
        ...createResolvedContext().vehicleCapability,
        airportPermit: false,
      },
    });
    const { evaluator, repository } = createEvaluator(context);

    const result = await evaluator.evaluate({
      orderId: context.orderId,
      dispatchJobId: context.dispatchJobId,
      driverId: context.driverId,
      vehicleId: context.vehicleId,
      serviceProductCode: context.serviceProductCode,
      resolvedContext: context,
    });

    expect(result.decision).toBe("ineligible");
    expect(result.hardReasonCodes).toContain("MISSING_AIRPORT_ELIGIBILITY");
    expect(repository.insertRuntimeEligibilityDecision).toHaveBeenCalledOnce();
  });

  it("rejects candidates without the required source-platform binding", async () => {
    const context = createResolvedContext({
      sourcePlatform: "partner_x",
      platformBindings: ["drts"],
    });
    const { evaluator } = createEvaluator(context);

    const result = await evaluator.evaluate({
      orderId: context.orderId,
      dispatchJobId: context.dispatchJobId,
      driverId: context.driverId,
      vehicleId: context.vehicleId,
      serviceProductCode: context.serviceProductCode,
      resolvedContext: context,
    });

    expect(result.decision).toBe("ineligible");
    expect(result.hardReasonCodes).toContain("PLATFORM_BINDING_REQUIRED");
  });

  it("marks stale locations as conditionally eligible soft failures", async () => {
    const context = createResolvedContext({
      currentLocation: {
        ...createResolvedContext().currentLocation!,
        recordedAt: "2026-06-20T11:58:00.000Z",
      },
    });
    const { evaluator } = createEvaluator(context);

    const result = await evaluator.evaluate({
      orderId: context.orderId,
      dispatchJobId: context.dispatchJobId,
      driverId: context.driverId,
      vehicleId: context.vehicleId,
      serviceProductCode: context.serviceProductCode,
      resolvedContext: context,
    });

    expect(result.decision).toBe("conditionally_eligible");
    expect(result.locationState).toBe("stale");
    expect(result.softReasonCodes).toContain("STALE_LOCATION");
  });

  it("allows soft overrides to promote conditional decisions to eligible", async () => {
    const context = createResolvedContext({
      currentLocation: {
        ...createResolvedContext().currentLocation!,
        accuracyM: 150,
      },
    });
    const { evaluator, auditNotificationService } = createEvaluator(context);

    const result = await evaluator.evaluate({
      orderId: context.orderId,
      dispatchJobId: context.dispatchJobId,
      driverId: context.driverId,
      vehicleId: context.vehicleId,
      serviceProductCode: context.serviceProductCode,
      resolvedContext: context,
      overrideSoftEligibility: {
        actorId: "ops-001",
        actorType: "ops_user",
        reasonCode: "manual_dispatch_override",
      },
    });

    expect(result.decision).toBe("eligible");
    expect(result.softOverrideApplied).toBe(true);
    expect(auditNotificationService.recordAuditLog).toHaveBeenCalledWith(
      expect.objectContaining({
        actionName: "override_soft_eligibility",
      }),
    );
  });

  it("does not let soft overrides bypass hard failures", async () => {
    const context = createResolvedContext({
      driverReadiness: {
        ready: false,
        reasonCodes: ["DRIVER_NOT_READY"],
      },
    });
    const { evaluator, auditNotificationService } = createEvaluator(context);

    const result = await evaluator.evaluate({
      orderId: context.orderId,
      dispatchJobId: context.dispatchJobId,
      driverId: context.driverId,
      vehicleId: context.vehicleId,
      serviceProductCode: context.serviceProductCode,
      resolvedContext: context,
      overrideSoftEligibility: {
        actorId: "ops-001",
        actorType: "ops_user",
        reasonCode: "manual_dispatch_override",
      },
    });

    expect(result.decision).toBe("ineligible");
    expect(result.softOverrideApplied).toBe(false);
    expect(result.hardReasonCodes).toContain("DRIVER_NOT_READY");
    expect(auditNotificationService.recordAuditLog).not.toHaveBeenCalledWith(
      expect.objectContaining({
        actionName: "override_soft_eligibility",
      }),
    );
  });
});
