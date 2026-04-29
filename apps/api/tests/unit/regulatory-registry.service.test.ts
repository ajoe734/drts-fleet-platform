import { HttpStatus } from "@nestjs/common";
import { describe, expect, it, vi } from "vitest";

import { ApiRequestError } from "../../src/common/api-envelope";
import { RegulatoryRegistryService } from "../../src/modules/regulatory-registry/regulatory-registry.service";

function createService() {
  const opsDispatchEventsService = {
    publishDriverLocationUpdated: vi.fn(),
    publishSupplyLifecycleUpdated: vi.fn(),
  };
  const regulatoryRegistryRepository = {
    isEnabled: vi.fn(() => false),
    persistChanges: vi.fn().mockResolvedValue(undefined),
    reportPersistenceFailure: vi.fn(),
  };

  const service = new RegulatoryRegistryService(
    opsDispatchEventsService as never,
    regulatoryRegistryRepository as never,
  );

  return {
    service,
    opsDispatchEventsService,
    regulatoryRegistryRepository,
  };
}

describe("RegulatoryRegistryService", () => {
  it("rejects dispatch enable when exclusivity review is still pending", () => {
    const { service } = createService();

    const contract = service.createContract({
      vehicleId: "veh-demo-002",
      partnerId: "partner-demo-002",
      partnerType: "fleet_company_partner",
      contractType: "service_fleet_contract",
      serviceScope: "standard_taxi",
      startAt: "2026-01-01T00:00:00.000Z",
      endAt: "2026-12-31T23:59:59.000Z",
    });
    service.activateContract(contract.contractId, {
      approvedBy: "platform-admin-demo-002",
      approvedAt: "2026-01-01T00:00:00.000Z",
    });

    const policy = service.createInsurancePolicy({
      vehicleId: "veh-demo-002",
      policyNo: "POL-TAXI-0002",
      insuranceType: "passenger_liability",
      insurerName: "Demo Insurance",
      coverageAmount: 3000000,
      startAt: "2026-01-01T00:00:00.000Z",
      endAt: "2026-12-31T23:59:59.000Z",
    });
    service.activateInsurancePolicy(policy.policyId, {
      activatedAt: "2026-01-01T00:00:00.000Z",
    });

    expect(() =>
      service.updateVehicleCompliance("veh-demo-002", {
        dispatchableFlag: true,
      }),
    ).toThrowError(ApiRequestError);

    try {
      service.updateVehicleCompliance("veh-demo-002", {
        dispatchableFlag: true,
      });
    } catch (error) {
      expect(error).toBeInstanceOf(ApiRequestError);
      const apiError = error as ApiRequestError;
      const response = apiError.getResponse() as {
        error: { code: string; details?: Record<string, unknown> };
      };
      expect(apiError.getStatus()).toBe(HttpStatus.CONFLICT);
      expect(response.error.code).toBe("VEHICLE_NOT_DISPATCHABLE");
      expect(response.error.details).toMatchObject({
        blockedReasons: ["exclusivity_pending_review"],
      });
    }
  });

  it("invalidates active supply and emits a lifecycle event when insurance expires", () => {
    const { service, opsDispatchEventsService } = createService();

    const policy = (service as any).policies.find(
      (candidate: { policyId: string }) =>
        candidate.policyId === "policy-demo-001",
    );
    policy.endAt = "2026-03-31T23:59:59.000Z";

    const updatedPolicy = service.activateInsurancePolicy("policy-demo-001", {
      activatedAt: "2026-04-29T00:00:00.000Z",
    });
    const vehicle = service
      .listVehicles()
      .find((candidate) => candidate.vehicleId === "veh-demo-001");

    expect(updatedPolicy.lifecycleStatus).toBe("expired");
    expect(vehicle).toMatchObject({
      vehicleId: "veh-demo-001",
      dispatchableFlag: false,
      insuranceStatus: "expired",
      supplyLifecycle: {
        dispatch: {
          eligible: false,
          blockedReasons: ["insurance_expired"],
        },
        insurance: {
          lifecycleStatus: "expired",
        },
        lastTrace: {
          entityType: "insurance_policy",
          reasonCode: "insurance_expired",
        },
      },
    });
    expect(
      opsDispatchEventsService.publishSupplyLifecycleUpdated,
    ).toHaveBeenCalledWith(
      expect.objectContaining({
        vehicleId: "veh-demo-001",
        dispatchableFlag: false,
        supplyLifecycle: expect.objectContaining({
          dispatch: expect.objectContaining({
            blockedReasons: ["insurance_expired"],
          }),
        }),
      }),
    );
  });

  it("surfaces expired contract lifecycle in the registry list", () => {
    const { service } = createService();

    const contract = service.createContract({
      vehicleId: "veh-demo-002",
      partnerId: "partner-demo-002",
      partnerType: "fleet_company_partner",
      contractType: "service_fleet_contract",
      serviceScope: "standard_taxi",
      startAt: "2026-01-01T00:00:00.000Z",
      endAt: "2026-12-31T23:59:59.000Z",
    });
    service.activateContract(contract.contractId, {
      approvedAt: "2026-01-01T00:00:00.000Z",
    });

    const storedContract = (service as any).contracts.find(
      (candidate: { contractId: string }) =>
        candidate.contractId === contract.contractId,
    );
    storedContract.endAt = "2026-02-01T00:00:00.000Z";
    storedContract.updatedAt = "2026-04-29T00:00:00.000Z";

    const listedContract = service
      .listContracts()
      .find((candidate) => candidate.contractId === contract.contractId);

    expect(listedContract?.lifecycleStatus).toBe("expired");
  });

  it("keeps future-dated approvals non-dispatchable until the effective window starts", () => {
    const { service } = createService();

    const contract = service.createContract({
      vehicleId: "veh-demo-002",
      partnerId: "partner-demo-002",
      partnerType: "fleet_company_partner",
      contractType: "service_fleet_contract",
      serviceScope: "standard_taxi",
      startAt: "2099-05-01T00:00:00.000Z",
      endAt: "2099-12-31T23:59:59.000Z",
    });
    const policy = service.createInsurancePolicy({
      vehicleId: "veh-demo-002",
      policyNo: "POL-TAXI-FUTURE-0002",
      insuranceType: "passenger_liability",
      insurerName: "Demo Insurance",
      coverageAmount: 3000000,
      startAt: "2099-05-01T00:00:00.000Z",
      endAt: "2099-12-31T23:59:59.000Z",
    });

    service.submitExclusivityReview("veh-demo-002", {
      declarationFileId: "file-future-002",
      exclusiveProviderName: "Future Dispatch",
      effectiveStart: "2099-05-01T00:00:00.000Z",
      effectiveEnd: "2099-12-31T23:59:59.000Z",
    });

    const activatedContract = service.activateContract(contract.contractId, {
      approvedAt: "2099-04-01T00:00:00.000Z",
    });
    const activatedPolicy = service.activateInsurancePolicy(policy.policyId, {
      activatedAt: "2099-04-01T00:00:00.000Z",
    });
    const approvedExclusivity = service.approveExclusivity("veh-demo-002", {
      reviewerId: "platform-admin-demo-002",
      reviewedAt: "2099-04-01T00:00:00.000Z",
    });

    expect(activatedContract.lifecycleStatus).toBe("draft");
    expect(activatedPolicy.lifecycleStatus).toBe("pending");
    expect(approvedExclusivity.lifecycleStatus).toBe("pending_review");
    expect(
      service.getVehicleDispatchability("veh-demo-002", "standard_taxi"),
    ).toBe(false);

    const vehicle = service
      .listVehicles()
      .find((candidate) => candidate.vehicleId === "veh-demo-002");
    expect(vehicle?.supplyLifecycle.dispatch.blockedReasons).toEqual([
      "contract_draft",
      "insurance_pending",
      "exclusivity_pending_review",
    ]);
  });

  it("does not rewrite vehicle updatedAt during read-only lifecycle reconciliation", () => {
    const { service } = createService();

    const vehicleBeforeRead = service
      .listVehicles()
      .find((candidate) => candidate.vehicleId === "veh-demo-001");
    expect(vehicleBeforeRead?.updatedAt).toBe("2026-01-01T00:00:00.000Z");

    const storedPolicy = (service as any).policies.find(
      (candidate: { policyId: string }) =>
        candidate.policyId === "policy-demo-001",
    );
    storedPolicy.endAt = "2026-01-01T00:00:01.000Z";

    expect(
      service.getVehicleDispatchability("veh-demo-001", "standard_taxi"),
    ).toBe(false);

    const vehicleAfterRead = service
      .listVehicles()
      .find((candidate) => candidate.vehicleId === "veh-demo-001");
    expect(vehicleAfterRead?.updatedAt).toBe("2026-01-01T00:00:00.000Z");
    expect(vehicleAfterRead?.supplyLifecycle.dispatch.blockedReasons).toEqual([
      "insurance_expired",
    ]);
  });
});
