import { describe, expect, it, vi } from "vitest";

import { RegulatoryRegistryRepository } from "../../apps/api/src/modules/regulatory-registry/regulatory-registry.repository";
import { RegulatoryRegistryService } from "../../apps/api/src/modules/regulatory-registry/regulatory-registry.service";

describe("regulatory registry service", () => {
  it("creates regulatory source-of-truth records and updates vehicle eligibility from insurance and exclusivity", async () => {
    const persistChanges = vi.fn(async () => undefined);
    const repository = {
      loadState: vi.fn(async () => ({
        vehicles: [],
        drivers: [],
        supplyPairs: [],
        contracts: [],
        policies: [],
        exclusivities: [],
      })),
      persistChanges,
      reportPersistenceFailure: vi.fn(),
    } as unknown as RegulatoryRegistryRepository;
    const regulatoryRegistryService = new RegulatoryRegistryService(repository);

    await regulatoryRegistryService.onModuleInit();

    const contract = regulatoryRegistryService.createContract({
      vehicleId: "veh-demo-001",
      partnerId: "partner-demo-001",
      partnerType: "enterprise_partner",
      contractType: "service_fleet_contract",
      serviceScope: "standard_taxi",
      startAt: "2026-05-01T00:00:00Z",
      endAt: "2026-12-31T23:59:59Z",
    });
    const activatedContract = regulatoryRegistryService.activateContract(
      contract.contractId,
      {
        approvedBy: "platform-admin-001",
      },
    );
    const policy = regulatoryRegistryService.createInsurancePolicy({
      vehicleId: "veh-demo-001",
      policyNo: "POL-NEW-0001",
      insuranceType: "passenger_liability",
      insurerName: "Demo Insurance",
      coverageAmount: 5000000,
      startAt: "2026-05-01T00:00:00Z",
      endAt: "2026-12-31T23:59:59Z",
    });

    regulatoryRegistryService.submitExclusivityReview("veh-demo-001", {
      declarationFileId: "file-exclusivity-001",
      exclusiveProviderName: "Acme Dispatch",
      effectiveStart: "2026-05-01T00:00:00Z",
      effectiveEnd: "2026-12-31T23:59:59Z",
    });
    expect(
      regulatoryRegistryService.getVehicleDispatchability(
        "veh-demo-001",
        "standard_taxi",
      ),
    ).toBe(false);

    const activatedPolicy = regulatoryRegistryService.activateInsurancePolicy(
      policy.policyId,
      {},
    );
    const approvedExclusivity = regulatoryRegistryService.approveExclusivity(
      "veh-demo-001",
      {
        reviewerId: "platform-admin-001",
      },
    );

    await Promise.resolve();

    expect(activatedContract.status).toBe("active");
    expect(activatedPolicy.status).toBe("active");
    expect(approvedExclusivity.reviewStatus).toBe("approved");
    expect(
      regulatoryRegistryService.getVehicleDispatchability(
        "veh-demo-001",
        "standard_taxi",
      ),
    ).toBe(true);
    expect(persistChanges).toHaveBeenCalledWith(
      expect.objectContaining({
        contracts: [
          expect.objectContaining({
            contractId: contract.contractId,
            status: "active",
          }),
        ],
      }),
    );
    expect(persistChanges).toHaveBeenCalledWith(
      expect.objectContaining({
        policies: [
          expect.objectContaining({
            policyId: policy.policyId,
            status: "active",
          }),
        ],
      }),
    );
    expect(persistChanges).toHaveBeenCalledWith(
      expect.objectContaining({
        exclusivities: [
          expect.objectContaining({
            vehicleId: "veh-demo-001",
            reviewStatus: "approved",
          }),
        ],
        vehicles: [
          expect.objectContaining({
            vehicleId: "veh-demo-001",
            exclusivityApproved: true,
          }),
        ],
      }),
    );
  });

  it("rehydrates persisted registry state and writes compliance updates through the repository", async () => {
    const persistChanges = vi.fn(async () => undefined);
    const repository = {
      loadState: vi.fn(async () => ({
        vehicles: [
          {
            vehicleId: "veh-persisted-001",
            plateNo: "ABC-2001",
            operatingArea: "taichung-port",
            supportedServiceBuckets: ["standard_taxi"],
            dispatchableFlag: false,
            exclusivityApproved: true,
            insuranceStatus: "expired",
          },
        ],
        drivers: [
          {
            driverId: "drv-persisted-001",
            name: "Persisted Driver",
            supportedServiceBuckets: ["standard_taxi"],
            workState: "offline",
            licensesValid: true,
          },
        ],
        supplyPairs: [
          {
            vehicleId: "veh-persisted-001",
            driverId: "drv-persisted-001",
            etaMinutes: 6,
          },
        ],
        contracts: [
          {
            contractId: "contract-persisted-001",
            vehicleId: "veh-persisted-001",
            partnerId: "partner-persisted-001",
            partnerType: "enterprise_partner",
            contractType: "service_fleet_contract",
            operatingAreaId: "taichung-port",
            serviceScope: "standard_taxi",
            startAt: "2026-01-01T00:00:00Z",
            endAt: "2026-12-31T23:59:59Z",
            status: "active",
            approvedBy: "platform-admin-001",
            approvedAt: "2026-01-01T00:00:00Z",
            createdAt: "2026-01-01T00:00:00Z",
            updatedAt: "2026-01-01T00:00:00Z",
          },
        ],
        policies: [
          {
            policyId: "policy-persisted-001",
            vehicleId: "veh-persisted-001",
            policyNo: "POL-PERSISTED-001",
            insuranceType: "passenger_liability",
            insurerName: "Persisted Insurance",
            coverageAmount: 2500000,
            startAt: "2026-01-01T00:00:00Z",
            endAt: "2026-12-31T23:59:59Z",
            status: "active",
            createdAt: "2026-01-01T00:00:00Z",
            updatedAt: "2026-01-01T00:00:00Z",
          },
        ],
        exclusivities: [
          {
            vehicleId: "veh-persisted-001",
            declarationStatus: "submitted",
            declarationFileId: "file-persisted-001",
            reviewStatus: "approved",
            reviewerId: "platform-admin-001",
            reviewedAt: "2026-01-01T00:00:00Z",
            exclusiveProviderName: "Persisted Dispatch",
            effectiveStart: "2026-01-01T00:00:00Z",
            effectiveEnd: "2026-12-31T23:59:59Z",
            terminationReason: null,
            updatedAt: "2026-01-01T00:00:00Z",
          },
        ],
      })),
      persistChanges,
      reportPersistenceFailure: vi.fn(),
    } as unknown as RegulatoryRegistryRepository;

    const regulatoryRegistryService = new RegulatoryRegistryService(repository);

    await regulatoryRegistryService.onModuleInit();

    expect(regulatoryRegistryService.listVehicles()[0]?.plateNo).toBe(
      "ABC-2001",
    );

    regulatoryRegistryService.updateVehicleCompliance("veh-persisted-001", {
      dispatchableFlag: true,
      insuranceStatus: "valid",
    });
    regulatoryRegistryService.updateDriverWorkState("drv-persisted-001", {
      workState: "available",
    });

    await Promise.resolve();

    expect(
      regulatoryRegistryService.getEligibleCandidates("standard_taxi"),
    ).toEqual([
      expect.objectContaining({
        vehicleId: "veh-persisted-001",
        driverId: "drv-persisted-001",
      }),
    ]);
    expect(persistChanges).toHaveBeenCalledWith(
      expect.objectContaining({
        vehicles: [
          expect.objectContaining({
            vehicleId: "veh-persisted-001",
            dispatchableFlag: true,
            insuranceStatus: "valid",
          }),
        ],
      }),
    );
    expect(persistChanges).toHaveBeenCalledWith(
      expect.objectContaining({
        drivers: [
          expect.objectContaining({
            driverId: "drv-persisted-001",
            workState: "available",
          }),
        ],
      }),
    );
  });
});
