import { afterEach, describe, expect, it, vi } from "vitest";

import { EligibilityContextResolver } from "../../src/modules/vehicle-eligibility/eligibility-context-resolver.service";
import { RuntimeEligibilityEvaluator } from "../../src/modules/vehicle-eligibility/runtime-eligibility-evaluator.service";
import { ServiceProductService } from "../../src/modules/service-product/service-product.service";
import { VehicleEligibilityRepository } from "../../src/modules/vehicle-eligibility/vehicle-eligibility.repository";
import { VehicleEligibilityService } from "../../src/modules/vehicle-eligibility/vehicle-eligibility.service";

function createEvaluator(options?: {
  latestLocationUpdatedAt?: string | null;
  latestLocationAccuracyM?: number;
}) {
  const locationUpdatedAt =
    options?.latestLocationUpdatedAt ?? new Date().toISOString();
  const regulatoryRegistryService = {
    listDrivers: vi.fn(() => [
      {
        driverId: "drv-demo-001",
        name: "Driver Demo One",
        supportedServiceBuckets: ["standard_taxi", "business_dispatch"],
        workState: "available",
        licensesValid: true,
        lifecycleStatus: "active",
        eligibilityBlockedReasons: [],
        dispatchEligible: true,
        createdAt: locationUpdatedAt ?? "2026-06-20T00:00:00.000Z",
        updatedAt: locationUpdatedAt ?? "2026-06-20T00:00:00.000Z",
        activatedAt: locationUpdatedAt ?? "2026-06-20T00:00:00.000Z",
        suspendedAt: null,
        retiredAt: null,
        profileUpdatedAt: locationUpdatedAt ?? "2026-06-20T00:00:00.000Z",
        deviceBindings: [],
      },
    ]),
    listVehicles: vi.fn(() => [
      {
        vehicleId: "veh-demo-001",
        plateNo: "ABC-1001",
        operatingArea: "taichung-port",
        supportedServiceBuckets: ["standard_taxi", "business_dispatch"],
        dispatchableFlag: true,
        exclusivityApproved: true,
        insuranceStatus: "valid",
        updatedAt: "2026-06-20T00:00:00.000Z",
        supplyLifecycle: {
          contract: {
            ready: true,
            blockedReasons: [],
            evaluatedAt: "2026-06-20T00:00:00.000Z",
          },
          insurance: {
            ready: true,
            blockedReasons: [],
            evaluatedAt: "2026-06-20T00:00:00.000Z",
          },
          exclusivity: {
            ready: true,
            blockedReasons: [],
            evaluatedAt: "2026-06-20T00:00:00.000Z",
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
        vehicleId: "veh-demo-002",
        plateNo: "ABC-1002",
        operatingArea: "taichung-port",
        supportedServiceBuckets: ["standard_taxi"],
        dispatchableFlag: true,
        exclusivityApproved: true,
        insuranceStatus: "valid",
        updatedAt: "2026-06-20T00:00:00.000Z",
        supplyLifecycle: {
          contract: {
            ready: true,
            blockedReasons: [],
            evaluatedAt: "2026-06-20T00:00:00.000Z",
          },
          insurance: {
            ready: true,
            blockedReasons: [],
            evaluatedAt: "2026-06-20T00:00:00.000Z",
          },
          exclusivity: {
            ready: true,
            blockedReasons: [],
            evaluatedAt: "2026-06-20T00:00:00.000Z",
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
    ]),
    listLatestDriverLocations: vi.fn(() =>
      locationUpdatedAt
        ? [
            {
              driverId: "drv-demo-001",
              lat: 25.04,
              lng: 121.56,
              accuracyM: options?.latestLocationAccuracyM ?? 20,
              recordedAt: locationUpdatedAt,
              updatedAt: locationUpdatedAt,
            },
          ]
        : [],
    ),
  };

  const auditNotificationService = {
    recordAuditLog: vi.fn(),
  };
  const serviceProductService = new ServiceProductService(
    auditNotificationService as never,
    undefined,
  );
  const vehicleEligibilityService = new VehicleEligibilityService(
    regulatoryRegistryService as never,
    undefined,
    undefined,
    serviceProductService,
  );
  const repository = {
    saveRuntimeDecision: vi.fn().mockResolvedValue(undefined),
    reportPersistenceFailure: vi.fn(),
  };

  return {
    evaluator: new RuntimeEligibilityEvaluator(
      new EligibilityContextResolver(
        regulatoryRegistryService as never,
        vehicleEligibilityService,
        serviceProductService,
      ),
      repository as never as VehicleEligibilityRepository,
      auditNotificationService as never,
    ),
    repository,
    auditNotificationService,
  };
}

describe("RuntimeEligibilityEvaluator", () => {
  afterEach(() => {
    vi.useRealTimers();
  });

  it("rejects airport-transfer candidates without airport eligibility", () => {
    const { evaluator, repository } = createEvaluator();

    const [decision] = evaluator.evaluateOrderCandidates(
      {
        orderId: "order-airport",
        orderSource: "ops",
        serviceProductCode: "credit_card_airport_transfer",
        serviceProductId: "seed-credit-card-airport-transfer",
        serviceProductVersion: "2026-06-01T00:00:00.000Z",
        eligibilityPolicyVersion: "2026-06-01T00:00:00.000Z",
        serviceBucket: "business_dispatch",
        dispatchSemantics: "reservation",
      },
      "dispatch-airport",
      [
        {
          driverId: "drv-demo-001",
          vehicleId: "veh-demo-002",
          etaMinutes: 8,
          operatingArea: "taichung-port",
          serviceBuckets: ["standard_taxi"],
        },
      ],
    );

    expect(decision.eligibilityDecision).toBe("ineligible");
    expect(decision.hardReasonCodes).toContain("MISSING_AIRPORT_ELIGIBILITY");
    expect(repository.saveRuntimeDecision).toHaveBeenCalledTimes(1);
  });

  it("rejects forwarded candidates whose driver lacks the source-platform binding", () => {
    const { evaluator } = createEvaluator();

    const [decision] = evaluator.evaluateOrderCandidates(
      {
        orderId: "order-forwarded",
        orderSource: "partner-x",
        serviceProductCode: "third_party_forwarded_order",
        serviceProductId: "seed-third-party-forwarded-order",
        serviceProductVersion: "2026-06-01T00:00:00.000Z",
        eligibilityPolicyVersion: "2026-06-01T00:00:00.000Z",
        serviceBucket: "standard_taxi",
        dispatchSemantics: "external_defined",
      },
      "dispatch-forwarded",
      [
        {
          driverId: "drv-demo-001",
          vehicleId: "veh-demo-001",
          etaMinutes: 6,
          operatingArea: "taichung-port",
          serviceBuckets: ["standard_taxi"],
        },
      ],
      "partner-x",
    );

    expect(decision.eligibilityDecision).toBe("ineligible");
    expect(decision.hardReasonCodes).toContain("PLATFORM_BINDING_REQUIRED");
  });

  it("marks stale reservation supply as conditionally eligible with a soft reason", () => {
    const { evaluator, auditNotificationService } = createEvaluator({
      latestLocationUpdatedAt: "2026-06-20T00:00:00.000Z",
    });

    vi.useFakeTimers();
    vi.setSystemTime(new Date("2026-06-20T00:02:30.000Z"));

    const [decision] = evaluator.evaluateOrderCandidates(
      {
        orderId: "order-stale",
        orderSource: "ops",
        serviceProductCode: "enterprise_dispatch",
        serviceProductId: "seed-enterprise-dispatch",
        serviceProductVersion: "2026-06-01T00:00:00.000Z",
        eligibilityPolicyVersion: "2026-06-01T00:00:00.000Z",
        serviceBucket: "business_dispatch",
        dispatchSemantics: "reservation",
      },
      "dispatch-stale",
      [
        {
          driverId: "drv-demo-001",
          vehicleId: "veh-demo-001",
          etaMinutes: 3,
          operatingArea: "taichung-port",
          serviceBuckets: ["business_dispatch"],
        },
      ],
    );

    expect(decision.eligibilityDecision).toBe("conditionally_eligible");
    expect(decision.softReasonCodes).toContain("STALE_LOCATION");
    expect(decision.locationState).toBe("stale");
    expect(auditNotificationService.recordAuditLog).toHaveBeenCalledTimes(1);
  });

  it("allows assignment recheck to pass for conditional supply when a soft override is provided", () => {
    const { evaluator } = createEvaluator({
      latestLocationUpdatedAt: "2026-06-20T00:00:00.000Z",
    });

    vi.useFakeTimers();
    vi.setSystemTime(new Date("2026-06-20T00:02:30.000Z"));

    const decision = evaluator.assertAssignmentEligible(
      {
        orderId: "order-stale",
        orderSource: "ops",
        serviceProductCode: "enterprise_dispatch",
        serviceProductId: "seed-enterprise-dispatch",
        serviceProductVersion: "2026-06-01T00:00:00.000Z",
        eligibilityPolicyVersion: "2026-06-01T00:00:00.000Z",
        serviceBucket: "business_dispatch",
        dispatchSemantics: "reservation",
      },
      "dispatch-stale",
      "drv-demo-001",
      "veh-demo-001",
      undefined,
      {
        reason: "Ops accepted stale GPS during radio handoff",
        actorId: "ops-001",
        actorType: "ops_user",
      },
    );

    expect(decision.eligibilityDecision).toBe("conditionally_eligible");
    expect(decision.softReasonCodes).toContain("STALE_LOCATION");
  });
});
