import { describe, expect, it, vi } from "vitest";

import { ApiRequestError } from "../../apps/api/src/common/api-envelope";
import { RegulatoryRegistryController } from "../../apps/api/src/modules/regulatory-registry/regulatory-registry.controller";
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

  it("writes driver location heartbeats through the repository", async () => {
    const upsertDriverLocation = vi.fn(async () => undefined);
    const repository = {
      isEnabled: vi.fn(() => true),
      upsertDriverLocation,
    } as unknown as RegulatoryRegistryRepository;
    const regulatoryRegistryService = new RegulatoryRegistryService(repository);

    await expect(
      regulatoryRegistryService.recordDriverLocation({
        driverId: "drv-demo-001",
        lat: 25.033964,
        lng: 121.564468,
        accuracyM: 6,
      }),
    ).resolves.toEqual({ success: true });

    expect(upsertDriverLocation).toHaveBeenCalledWith({
      driverId: "drv-demo-001",
      lat: 25.033964,
      lng: 121.564468,
      accuracyM: 6,
    });
  });

  it("rejects invalid heartbeat coordinates before persistence", async () => {
    const repository = {
      isEnabled: vi.fn(() => true),
      upsertDriverLocation: vi.fn(async () => undefined),
    } as unknown as RegulatoryRegistryRepository;
    const regulatoryRegistryService = new RegulatoryRegistryService(repository);

    await expect(
      regulatoryRegistryService.recordDriverLocation({
        driverId: "drv-demo-001",
        lat: 91,
        lng: 121.564468,
      }),
    ).rejects.toThrowError(ApiRequestError);
  });

  it("calculates haversine ETA from the latest persisted driver location", async () => {
    const repository = {
      isEnabled: vi.fn(() => true),
      findLatestDriverLocation: vi.fn(async () => ({
        driverId: "drv-demo-001",
        lat: 25.033964,
        lng: 121.564468,
        accuracyM: 5,
        recordedAt: "2026-04-18T06:00:00.000Z",
        updatedAt: "2026-04-18T06:00:00.000Z",
      })),
    } as unknown as RegulatoryRegistryRepository;
    const regulatoryRegistryService = new RegulatoryRegistryService(repository);

    const response = await regulatoryRegistryService.getDriverEta(
      "drv-demo-001",
      25.04776,
      121.51706,
    );

    expect(response.driverId).toBe("drv-demo-001");
    expect(response.etaMinutes).toBeGreaterThan(0);
    expect(response.destination).toEqual({
      lat: 25.04776,
      lng: 121.51706,
    });
    expect(response.driverLocation).toEqual(
      expect.objectContaining({
        lat: 25.033964,
        lng: 121.564468,
      }),
    );
  });

  it("recomputes candidate ETA from live driver locations when a destination is provided", async () => {
    const repository = {
      loadState: vi.fn(async () => ({
        vehicles: [],
        drivers: [],
        supplyPairs: [],
        contracts: [],
        policies: [],
        exclusivities: [],
      })),
      listLatestDriverLocations: vi.fn(async () => [
        {
          driverId: "drv-demo-001",
          lat: 25.033964,
          lng: 121.564468,
          accuracyM: 5,
          recordedAt: "2026-04-18T06:00:00.000Z",
          updatedAt: "2026-04-18T06:00:00.000Z",
        },
      ]),
      persistChanges: vi.fn(async () => undefined),
      reportPersistenceFailure: vi.fn(),
    } as unknown as RegulatoryRegistryRepository;
    const regulatoryRegistryService = new RegulatoryRegistryService(repository);

    await regulatoryRegistryService.onModuleInit();

    expect(
      regulatoryRegistryService.getEligibleCandidates("standard_taxi", {
        lat: 25.033964,
        lng: 121.564468,
      }),
    ).toEqual([
      expect.objectContaining({
        driverId: "drv-demo-001",
        vehicleId: "veh-demo-001",
        etaMinutes: 0,
      }),
    ]);
  });

  it("updates live candidate ETA after a new driver heartbeat is recorded", async () => {
    const repository = {
      isEnabled: vi.fn(() => true),
      loadState: vi.fn(async () => ({
        vehicles: [],
        drivers: [],
        supplyPairs: [],
        contracts: [],
        policies: [],
        exclusivities: [],
      })),
      listLatestDriverLocations: vi.fn(async () => []),
      upsertDriverLocation: vi.fn(async () => undefined),
      persistChanges: vi.fn(async () => undefined),
      reportPersistenceFailure: vi.fn(),
    } as unknown as RegulatoryRegistryRepository;
    const regulatoryRegistryService = new RegulatoryRegistryService(repository);

    await regulatoryRegistryService.onModuleInit();

    expect(
      regulatoryRegistryService.getEligibleCandidates("standard_taxi", {
        lat: 25.04776,
        lng: 121.51706,
      }),
    ).toEqual([]);

    await regulatoryRegistryService.recordDriverLocation({
      driverId: "drv-demo-001",
      lat: 25.04776,
      lng: 121.51706,
      accuracyM: 4,
    });

    expect(
      regulatoryRegistryService.getEligibleCandidates("standard_taxi", {
        lat: 25.04776,
        lng: 121.51706,
      }),
    ).toEqual([
      expect.objectContaining({
        driverId: "drv-demo-001",
        vehicleId: "veh-demo-001",
        etaMinutes: 0,
      }),
    ]);
  });

  it("returns 404 semantics when the latest driver location is missing", async () => {
    const repository = {
      isEnabled: vi.fn(() => true),
      findLatestDriverLocation: vi.fn(async () => null),
    } as unknown as RegulatoryRegistryRepository;
    const regulatoryRegistryService = new RegulatoryRegistryService(repository);

    await expect(
      regulatoryRegistryService.getDriverEta(
        "drv-demo-001",
        25.04776,
        121.51706,
      ),
    ).rejects.toMatchObject({
      response: expect.objectContaining({
        error: expect.objectContaining({
          code: "DRIVER_LOCATION_NOT_FOUND",
        }),
      }),
      status: 404,
    });
  });
});

describe("regulatory registry controller", () => {
  it("parses strict numeric ETA query parameters before delegating to the service", async () => {
    const getDriverEta = vi.fn(async () => ({
      driverId: "drv-demo-001",
      etaMinutes: 3,
      calculatedAt: "2026-04-18T06:00:00.000Z",
      driverLocation: {
        driverId: "drv-demo-001",
        lat: 25.033964,
        lng: 121.564468,
        accuracyM: 5,
        recordedAt: "2026-04-18T06:00:00.000Z",
        updatedAt: "2026-04-18T06:00:00.000Z",
      },
      destination: {
        lat: 25.04776,
        lng: 121.51706,
      },
    }));
    const controller = new RegulatoryRegistryController({
      getDriverEta,
    } as unknown as RegulatoryRegistryService);

    const response = await controller.getDriverEta(
      "drv-demo-001",
      "25.04776",
      "121.51706",
      "req-driver-eta",
    );

    expect(getDriverEta).toHaveBeenCalledWith(
      "drv-demo-001",
      25.04776,
      121.51706,
    );
    expect(response.meta.requestId).toBe("req-driver-eta");
    expect(response.data).toMatchObject({
      driverId: "drv-demo-001",
      etaMinutes: 3,
    });
  });

  it("rejects malformed ETA query coordinates instead of truncating them", async () => {
    const getDriverEta = vi.fn();
    const controller = new RegulatoryRegistryController({
      getDriverEta,
    } as unknown as RegulatoryRegistryService);

    await expect(
      controller.getDriverEta(
        "drv-demo-001",
        "25.04776foo",
        "121.51706",
        "req-driver-eta",
      ),
    ).rejects.toMatchObject({
      response: expect.objectContaining({
        error: expect.objectContaining({
          code: "INVALID_NUMBER",
          details: expect.objectContaining({
            field: "destLat",
          }),
        }),
      }),
      status: 400,
    });
    expect(getDriverEta).not.toHaveBeenCalled();
  });

  it("rejects missing ETA query coordinates without crashing on trim()", async () => {
    const getDriverEta = vi.fn();
    const controller = new RegulatoryRegistryController({
      getDriverEta,
    } as unknown as RegulatoryRegistryService);

    await expect(
      controller.getDriverEta(
        "drv-demo-001",
        undefined as unknown as string,
        "121.51706",
        "req-driver-eta",
      ),
    ).rejects.toMatchObject({
      response: expect.objectContaining({
        error: expect.objectContaining({
          code: "INVALID_NUMBER",
          details: expect.objectContaining({
            field: "destLat",
          }),
        }),
      }),
      status: 400,
    });
    expect(getDriverEta).not.toHaveBeenCalled();
  });
});
