import { HttpStatus } from "@nestjs/common";
import { describe, expect, it, vi } from "vitest";

import { ApiRequestError } from "../../src/common/api-envelope";
import { AuditNotificationService } from "../../src/modules/audit-notification/audit-notification.service";
import { DriverProfileService } from "../../src/modules/driver-profile/driver-profile.service";
import { RegulatoryRegistryService } from "../../src/modules/regulatory-registry/regulatory-registry.service";

function createService(
  repositoryOverrides: Partial<{
    isEnabled: ReturnType<typeof vi.fn>;
    persistChanges: ReturnType<typeof vi.fn>;
    reportPersistenceFailure: ReturnType<typeof vi.fn>;
    upsertDriverLocation: ReturnType<typeof vi.fn>;
    recordDriverLocationEvent: ReturnType<typeof vi.fn>;
    findLatestDriverLocation: ReturnType<typeof vi.fn>;
    findLatestDriverHeartbeatEvent: ReturnType<typeof vi.fn>;
    findDriverHeartbeatEventByRecordedAt: ReturnType<typeof vi.fn>;
    listLatestDriverLocations: ReturnType<typeof vi.fn>;
    loadState: ReturnType<typeof vi.fn>;
  }> = {},
) {
  const opsDispatchEventsService = {
    publishDriverLocationUpdated: vi.fn(),
    publishSupplyLifecycleUpdated: vi.fn(),
  };
  const auditNotificationService = new AuditNotificationService();
  const driverProfileService = new DriverProfileService(
    auditNotificationService,
  );
  const regulatoryRegistryRepository = {
    isEnabled: vi.fn(() => false),
    persistChanges: vi.fn().mockResolvedValue(undefined),
    reportPersistenceFailure: vi.fn(),
    upsertDriverLocation: vi.fn(),
    recordDriverLocationEvent: vi.fn(),
    findLatestDriverLocation: vi.fn(),
    findLatestDriverHeartbeatEvent: vi.fn(),
    findDriverHeartbeatEventByRecordedAt: vi.fn(),
    listLatestDriverLocations: vi.fn().mockResolvedValue([]),
    loadState: vi.fn().mockResolvedValue({
      vehicles: [],
      drivers: [],
      supplyPairs: [],
      contracts: [],
      policies: [],
      exclusivities: [],
    }),
    ...repositoryOverrides,
  };

  const service = new RegulatoryRegistryService(
    opsDispatchEventsService as never,
    auditNotificationService,
    driverProfileService,
    regulatoryRegistryRepository as never,
  );

  return {
    service,
    auditNotificationService,
    driverProfileService,
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

  it("creates a driver master with linked profile and lifecycle audit metadata", () => {
    const { service, auditNotificationService } = createService();

    const created = service.createDriver(
      {
        name: "Driver Admin Created",
        phone: "+886-912-555-666",
        email: "driver.created@example.com",
        licensesValid: true,
      },
      "req-driver-create-001",
    );

    expect(created).toMatchObject({
      name: "Driver Admin Created",
      lifecycleStatus: "draft",
      workState: "offline",
      licensesValid: true,
      dispatchEligible: false,
      profileUpdatedAt: expect.any(String),
      eligibilityBlockedReasons: expect.arrayContaining(["lifecycle_draft"]),
    });

    const auditLog = auditNotificationService
      .listAuditLogs()
      .find((entry) => entry.actionName === "create_driver_master");
    expect(auditLog?.resourceId).toBe(created.driverId);
  });

  it("removes suspended and retired drivers from dispatch eligibility", () => {
    const { service } = createService();

    expect(service.getDriverAvailability("drv-demo-001", "standard_taxi")).toBe(
      true,
    );

    const suspended = service.updateDriverLifecycle("drv-demo-001", {
      lifecycleStatus: "suspended",
      reason: "manual compliance hold",
    });
    expect(suspended.dispatchEligible).toBe(false);
    expect(suspended.eligibilityBlockedReasons).toContain(
      "lifecycle_suspended",
    );
    expect(service.getDriverAvailability("drv-demo-001", "standard_taxi")).toBe(
      false,
    );

    const reactivated = service.updateDriverLifecycle("drv-demo-001", {
      lifecycleStatus: "active",
    });
    expect(reactivated.dispatchEligible).toBe(true);

    const retired = service.updateDriverLifecycle("drv-demo-001", {
      lifecycleStatus: "retired",
      reason: "driver retired",
    });
    expect(retired.dispatchEligible).toBe(false);
    expect(retired.eligibilityBlockedReasons).toContain("lifecycle_retired");
  });

  it("does not fabricate profile metadata for drivers without a stored profile", () => {
    const { service } = createService();

    (service as { drivers: Array<Record<string, unknown>> }).drivers.unshift({
      driverId: "drv-no-profile-001",
      name: "No Profile Driver",
      supportedServiceBuckets: ["standard_taxi"],
      workState: "offline",
      licensesValid: true,
      lifecycleStatus: "draft",
      eligibilityBlockedReasons: [],
      dispatchEligible: false,
      createdAt: "2026-04-29T00:00:00.000Z",
      updatedAt: "2026-04-29T00:00:00.000Z",
      activatedAt: null,
      suspendedAt: null,
      retiredAt: null,
      profileUpdatedAt: null,
      deviceBindings: [],
    });

    const listed = service
      .listDrivers()
      .find((candidate) => candidate.driverId === "drv-no-profile-001");

    expect(listed).toMatchObject({
      profileUpdatedAt: null,
      deviceBindings: [],
      eligibilityBlockedReasons: ["lifecycle_draft", "work_state_offline"],
    });
  });

  it("tracks debranding work during vehicle offboarding", () => {
    const { service } = createService();

    const offboarded = service.initiateVehicleOffboarding("veh-demo-001", {
      reason: "Partner exit",
      requestedBy: "ops-lead",
      debrandingRequired: true,
      debrandingDueAt: "2026-05-02T00:00:00.000Z",
      debrandingTicketId: "DEBRAND-001",
    });

    expect(offboarded).toMatchObject({
      dispatchableFlag: false,
      supplyLifecycle: {
        dispatch: {
          eligible: false,
          blockedReasons: expect.arrayContaining([
            "offboarding_pending_debranding",
          ]),
        },
        offboarding: {
          status: "debranding_required",
          debrandingStatus: "pending",
          debrandingTicketId: "DEBRAND-001",
        },
      },
    });

    const completed = service.completeVehicleDebranding("veh-demo-001", {
      debrandingTicketId: "DEBRAND-001",
      notes: "Branding removed at depot",
    });

    expect(completed.supplyLifecycle.offboarding).toMatchObject({
      status: "completed",
      debrandingStatus: "completed",
      debrandingTicketId: "DEBRAND-001",
    });
    expect(completed.supplyLifecycle.dispatch.blockedReasons).not.toContain(
      "offboarding_pending_debranding",
    );
  });

  it("surfaces rejected exclusivity in vehicle lifecycle", () => {
    const { service } = createService();

    const rejected = service.rejectExclusivity("veh-demo-002", {
      reviewerId: "platform-admin-demo-002",
      reason: "Missing declaration evidence",
      reviewedAt: "2026-04-30T00:00:00.000Z",
    });

    expect(rejected.lifecycleStatus).toBe("rejected");
    expect(
      service
        .listVehicles()
        .find((vehicle) => vehicle.vehicleId === "veh-demo-002"),
    ).toMatchObject({
      supplyLifecycle: {
        exclusivity: {
          lifecycleStatus: "rejected",
        },
        dispatch: {
          blockedReasons: expect.arrayContaining(["exclusivity_rejected"]),
        },
      },
    });
  });

  it("does not publish a legacy driver location update when the heartbeat is older than the stored snapshot", async () => {
    const { service, opsDispatchEventsService, regulatoryRegistryRepository } =
      createService({
        isEnabled: vi.fn(() => true),
        upsertDriverLocation: vi.fn().mockResolvedValue(false),
      });

    await expect(
      service.recordDriverLocation({
        driverId: "drv-demo-001",
        lat: 24.1477,
        lng: 120.6736,
        accuracyM: 8,
        recordedAt: "2026-01-01T00:00:00.000Z",
      }),
    ).resolves.toEqual({ success: true });

    expect(regulatoryRegistryRepository.upsertDriverLocation).toHaveBeenCalled();
    expect(
      opsDispatchEventsService.publishDriverLocationUpdated,
    ).not.toHaveBeenCalled();
  });

  it("does not let the legacy driver location endpoint regress the in-memory latest snapshot", async () => {
    const { service, opsDispatchEventsService, regulatoryRegistryRepository } =
      createService({
        isEnabled: vi.fn(() => true),
        upsertDriverLocation: vi.fn().mockResolvedValue(true),
      });

    await service.recordDriverLocation({
      driverId: "drv-demo-001",
      lat: 24.1477,
      lng: 120.6736,
      accuracyM: 6,
      recordedAt: "2026-06-20T06:00:00.000Z",
    });

    await service.recordDriverLocation({
      driverId: "drv-demo-001",
      lat: 24.147,
      lng: 120.67,
      accuracyM: 9,
      recordedAt: "2026-06-20T05:59:00.000Z",
    });

    expect(regulatoryRegistryRepository.upsertDriverLocation).toHaveBeenCalledTimes(2);
    expect(
      opsDispatchEventsService.publishDriverLocationUpdated,
    ).toHaveBeenCalledTimes(1);
    expect(service.listLatestDriverLocations()).toEqual([
      expect.objectContaining({
        driverId: "drv-demo-001",
        lat: 24.1477,
        lng: 120.6736,
        accuracyM: 6,
        recordedAt: "2026-06-20T06:00:00.000Z",
      }),
    ]);
  });

  it("does not let the legacy driver location endpoint overwrite the latest snapshot at the same recordedAt", async () => {
    const { service, opsDispatchEventsService } = createService({
      isEnabled: vi.fn(() => true),
      upsertDriverLocation: vi.fn().mockResolvedValue(true),
    });

    await service.recordDriverLocation({
      driverId: "drv-demo-001",
      lat: 24.1477,
      lng: 120.6736,
      accuracyM: 6,
      recordedAt: "2026-06-20T06:00:00.000Z",
    });

    await expect(
      service.recordDriverLocation({
        driverId: "drv-demo-001",
        lat: 24.1485,
        lng: 120.6744,
        accuracyM: 9,
        recordedAt: "2026-06-20T06:00:00.000Z",
      }),
    ).resolves.toEqual({ success: true });

    expect(
      opsDispatchEventsService.publishDriverLocationUpdated,
    ).toHaveBeenCalledTimes(1);
    expect(service.listLatestDriverLocations()).toEqual([
      expect.objectContaining({
        driverId: "drv-demo-001",
        lat: 24.1477,
        lng: 120.6736,
        accuracyM: 6,
        recordedAt: "2026-06-20T06:00:00.000Z",
      }),
    ]);
  });

  it("acknowledges duplicate heartbeats and only publishes newer current locations", async () => {
    const { service, opsDispatchEventsService, regulatoryRegistryRepository } =
      createService({
        isEnabled: vi.fn(() => true),
        recordDriverLocationEvent: vi
          .fn()
          .mockResolvedValueOnce({
            duplicate: false,
            currentLocationUpdated: true,
            serverReceivedAt: "2026-06-20T06:00:00.000Z",
          })
          .mockResolvedValueOnce({
            duplicate: true,
            currentLocationUpdated: false,
            serverReceivedAt: "2026-06-20T06:00:00.000Z",
          }),
      });

    const response = await service.recordDriverLocationBatch({
      items: [
        {
          eventId: "evt-001",
          deviceId: "device-001",
          driverId: "drv-demo-001",
          vehicleId: "veh-demo-001",
          taskId: null,
          sequenceNo: 1001,
          recordedAt: "2026-06-20T05:59:59.000Z",
          lat: 24.1477,
          lng: 120.6736,
          accuracyM: 6,
          workState: "available",
          appState: "foreground",
          transportMode: "foreground",
          networkType: "cellular",
        },
        {
          eventId: "evt-001-replay",
          deviceId: "device-001",
          driverId: "drv-demo-001",
          vehicleId: "veh-demo-001",
          taskId: null,
          sequenceNo: 1001,
          recordedAt: "2026-06-20T05:59:59.000Z",
          lat: 24.1477,
          lng: 120.6736,
          accuracyM: 6,
          workState: "available",
          appState: "foreground",
          transportMode: "foreground",
          networkType: "cellular",
        },
      ],
    });

    expect(response).toEqual({
      items: [
        {
          eventId: "evt-001",
          accepted: true,
          duplicate: false,
          currentLocationUpdated: true,
          serverReceivedAt: "2026-06-20T06:00:00.000Z",
        },
        {
          eventId: "evt-001-replay",
          accepted: true,
          duplicate: true,
          currentLocationUpdated: false,
          serverReceivedAt: "2026-06-20T06:00:00.000Z",
        },
      ],
    });
    expect(
      regulatoryRegistryRepository.recordDriverLocationEvent,
    ).toHaveBeenCalledTimes(2);
    expect(
      opsDispatchEventsService.publishDriverLocationUpdated,
    ).toHaveBeenCalledTimes(1);
    expect(service.listLatestDriverLocations()).toEqual([
      {
        driverId: "drv-demo-001",
        lat: 24.1477,
        lng: 120.6736,
        accuracyM: 6,
        recordedAt: "2026-06-20T05:59:59.000Z",
        updatedAt: "2026-06-20T06:00:00.000Z",
      },
    ]);
  });

  it("does not acknowledge an out-of-order batch heartbeat as a current location update", async () => {
    const { service, opsDispatchEventsService, regulatoryRegistryRepository } =
      createService({
        isEnabled: vi.fn(() => true),
        recordDriverLocationEvent: vi
          .fn()
          .mockResolvedValueOnce({
            duplicate: false,
            currentLocationUpdated: true,
            serverReceivedAt: "2026-06-20T06:00:00.000Z",
          })
          .mockResolvedValueOnce({
            duplicate: false,
            currentLocationUpdated: true,
            serverReceivedAt: "2026-06-20T06:00:05.000Z",
          }),
      });

    const response = await service.recordDriverLocationBatch({
      items: [
        {
          eventId: "evt-001",
          deviceId: "device-001",
          driverId: "drv-demo-001",
          vehicleId: "veh-demo-001",
          taskId: null,
          sequenceNo: 1001,
          recordedAt: "2026-06-20T06:00:00.000Z",
          lat: 24.1477,
          lng: 120.6736,
          accuracyM: 6,
          workState: "available",
          appState: "foreground",
          transportMode: "foreground",
          networkType: "cellular",
        },
        {
          eventId: "evt-002",
          deviceId: "device-001",
          driverId: "drv-demo-001",
          vehicleId: "veh-demo-001",
          taskId: null,
          sequenceNo: 1002,
          recordedAt: "2026-06-20T05:59:00.000Z",
          lat: 24.147,
          lng: 120.67,
          accuracyM: 9,
          workState: "available",
          appState: "foreground",
          transportMode: "foreground",
          networkType: "cellular",
        },
      ],
    });

    expect(response.items).toEqual([
      {
        eventId: "evt-001",
        accepted: true,
        duplicate: false,
        currentLocationUpdated: true,
        serverReceivedAt: "2026-06-20T06:00:00.000Z",
      },
      {
        eventId: "evt-002",
        accepted: true,
        duplicate: false,
        currentLocationUpdated: false,
        serverReceivedAt: "2026-06-20T06:00:05.000Z",
      },
    ]);
    expect(
      regulatoryRegistryRepository.recordDriverLocationEvent,
    ).toHaveBeenCalledTimes(2);
    expect(
      opsDispatchEventsService.publishDriverLocationUpdated,
    ).toHaveBeenCalledTimes(1);
    expect(service.listLatestDriverLocations()).toEqual([
      {
        driverId: "drv-demo-001",
        lat: 24.1477,
        lng: 120.6736,
        accuracyM: 6,
        recordedAt: "2026-06-20T06:00:00.000Z",
        updatedAt: "2026-06-20T06:00:00.000Z",
      },
    ]);
  });

  it("does not acknowledge a same-recordedAt batch heartbeat as a current location update", async () => {
    const { service, opsDispatchEventsService, regulatoryRegistryRepository } =
      createService({
        isEnabled: vi.fn(() => true),
        recordDriverLocationEvent: vi
          .fn()
          .mockResolvedValueOnce({
            duplicate: false,
            currentLocationUpdated: true,
            serverReceivedAt: "2026-06-20T06:00:00.000Z",
          })
          .mockResolvedValueOnce({
            duplicate: false,
            currentLocationUpdated: true,
            serverReceivedAt: "2026-06-20T06:00:05.000Z",
          }),
      });

    const response = await service.recordDriverLocationBatch({
      items: [
        {
          eventId: "evt-001",
          deviceId: "device-001",
          driverId: "drv-demo-001",
          vehicleId: "veh-demo-001",
          taskId: null,
          sequenceNo: 1001,
          recordedAt: "2026-06-20T06:00:00.000Z",
          lat: 24.1477,
          lng: 120.6736,
          accuracyM: 6,
          workState: "available",
          appState: "foreground",
          transportMode: "foreground",
          networkType: "cellular",
        },
        {
          eventId: "evt-002",
          deviceId: "device-001",
          driverId: "drv-demo-001",
          vehicleId: "veh-demo-001",
          taskId: "task-002",
          sequenceNo: 1002,
          recordedAt: "2026-06-20T06:00:00.000Z",
          lat: 24.148,
          lng: 120.674,
          accuracyM: 9,
          workState: "assigned",
          appState: "background",
          transportMode: "background",
          networkType: "wifi",
        },
      ],
    });

    expect(response.items).toEqual([
      {
        eventId: "evt-001",
        accepted: true,
        duplicate: false,
        currentLocationUpdated: true,
        serverReceivedAt: "2026-06-20T06:00:00.000Z",
      },
      {
        eventId: "evt-002",
        accepted: true,
        duplicate: false,
        currentLocationUpdated: false,
        serverReceivedAt: "2026-06-20T06:00:05.000Z",
      },
    ]);
    expect(
      regulatoryRegistryRepository.recordDriverLocationEvent,
    ).toHaveBeenCalledTimes(2);
    expect(
      opsDispatchEventsService.publishDriverLocationUpdated,
    ).toHaveBeenCalledTimes(1);
    expect(service.listLatestDriverLocations()).toEqual([
      {
        driverId: "drv-demo-001",
        lat: 24.1477,
        lng: 120.6736,
        accuracyM: 6,
        recordedAt: "2026-06-20T06:00:00.000Z",
        updatedAt: "2026-06-20T06:00:00.000Z",
      },
    ]);
    await expect(
      service.getDriverTrackingStatus("drv-demo-001"),
    ).resolves.toEqual(
      expect.objectContaining({
        currentLocation: expect.objectContaining({
          recordedAt: "2026-06-20T06:00:00.000Z",
        }),
        currentVehicleId: "veh-demo-001",
        currentTaskId: null,
        trackingState: "available",
        appState: "foreground",
        transportMode: "foreground",
        networkType: "cellular",
        lastEventId: "evt-002",
        lastSequenceNo: 1002,
        lastHeartbeatRecordedAt: "2026-06-20T06:00:00.000Z",
        lastHeartbeatReceivedAt: "2026-06-20T06:00:05.000Z",
        lastSuccessfulUploadAt: "2026-06-20T06:00:05.000Z",
      }),
    );
  });

  it("keeps lastHeartbeat metadata aligned to the latest upload when an older event arrives out of order", async () => {
    const { service } = createService({
      isEnabled: vi.fn(() => true),
      recordDriverLocationEvent: vi
        .fn()
        .mockResolvedValueOnce({
          duplicate: false,
          currentLocationUpdated: true,
          serverReceivedAt: "2026-06-20T06:00:00.000Z",
        })
        .mockResolvedValueOnce({
          duplicate: false,
          currentLocationUpdated: false,
          serverReceivedAt: "2026-06-20T06:00:05.000Z",
        }),
    });

    await service.recordDriverLocationBatch({
      items: [
        {
          eventId: "evt-newer",
          deviceId: "device-001",
          driverId: "drv-demo-001",
          vehicleId: "veh-demo-001",
          taskId: "task-newer",
          sequenceNo: 2002,
          recordedAt: "2026-06-20T06:00:00.000Z",
          lat: 24.1477,
          lng: 120.6736,
          accuracyM: 8,
          workState: "assigned",
          appState: "foreground",
          transportMode: "foreground",
          networkType: "cellular",
        },
        {
          eventId: "evt-older-uploaded-later",
          deviceId: "device-001",
          driverId: "drv-demo-001",
          vehicleId: "veh-demo-001",
          taskId: null,
          sequenceNo: 2003,
          recordedAt: "2026-06-20T05:59:00.000Z",
          lat: 24.147,
          lng: 120.673,
          accuracyM: 12,
          workState: "available",
          appState: "background",
          transportMode: "background",
          networkType: "wifi",
        },
      ],
    });

    await expect(
      service.getDriverTrackingStatus("drv-demo-001"),
    ).resolves.toEqual(
      expect.objectContaining({
        currentLocation: expect.objectContaining({
          recordedAt: "2026-06-20T06:00:00.000Z",
        }),
        currentTaskId: "task-newer",
        trackingState: "assigned",
        lastEventId: "evt-older-uploaded-later",
        lastSequenceNo: 2003,
        lastHeartbeatRecordedAt: "2026-06-20T05:59:00.000Z",
        lastHeartbeatReceivedAt: "2026-06-20T06:00:05.000Z",
        lastSuccessfulUploadAt: "2026-06-20T06:00:05.000Z",
      }),
    );
  });

  it("rejects heartbeat batches larger than 100 items", async () => {
    const { service } = createService({
      isEnabled: vi.fn(() => true),
      recordDriverLocationEvent: vi.fn(),
    });

    await expect(
      service.recordDriverLocationBatch({
        items: Array.from({ length: 101 }, (_, index) => ({
          eventId: `evt-${index}`,
          deviceId: "device-001",
          driverId: "drv-demo-001",
          vehicleId: null,
          taskId: null,
          sequenceNo: index,
          recordedAt: "2026-06-20T05:59:59.000Z",
          lat: 24.1477,
          lng: 120.6736,
          accuracyM: 6,
          workState: "available",
          appState: "foreground",
          transportMode: "foreground",
          networkType: "cellular",
        })),
      }),
    ).rejects.toMatchObject({
      response: expect.objectContaining({
        error: expect.objectContaining({
          code: "BATCH_LIMIT_EXCEEDED",
        }),
      }),
    });
  });

  it("classifies fresh tracking status from the latest current heartbeat context", async () => {
    const { service } = createService({
      isEnabled: vi.fn(() => true),
      recordDriverLocationEvent: vi.fn().mockResolvedValue({
        duplicate: false,
        currentLocationUpdated: true,
        serverReceivedAt: new Date().toISOString(),
      }),
    });

    await service.recordDriverLocationBatch({
      items: [
        {
          eventId: "evt-fresh",
          deviceId: "device-001",
          driverId: "drv-demo-001",
          vehicleId: "veh-demo-001",
          taskId: "task-001",
          sequenceNo: 2001,
          recordedAt: "2026-06-20T06:00:00.000Z",
          lat: 24.1477,
          lng: 120.6736,
          accuracyM: 8,
          workState: "assigned",
          appState: "foreground",
          transportMode: "foreground",
          networkType: "cellular",
        },
      ],
    });

    await expect(
      service.getDriverTrackingStatus("drv-demo-001"),
    ).resolves.toEqual(
      expect.objectContaining({
        driverId: "drv-demo-001",
        locationFreshness: "fresh",
        currentVehicleId: "veh-demo-001",
        currentTaskId: "task-001",
        trackingState: "assigned",
        lastEventId: "evt-fresh",
        lastSequenceNo: 2001,
      }),
    );
  });

  it("classifies missing tracking status when the driver has no known location", async () => {
    const { service } = createService();

    await expect(
      service.getDriverTrackingStatus("drv-demo-001"),
    ).resolves.toEqual(
      expect.objectContaining({
        driverId: "drv-demo-001",
        locationFreshness: "missing",
        currentLocation: null,
        trackingState: null,
        lastSuccessfulUploadAt: null,
      }),
    );
  });

  it("classifies stale and low-accuracy tracking status from persisted snapshots", async () => {
    const staleUpdatedAt = new Date(Date.now() - 120_000).toISOString();
    const { service, regulatoryRegistryRepository } = createService({
      isEnabled: vi.fn(() => true),
      findLatestDriverLocation: vi
        .fn()
        .mockResolvedValueOnce({
          driverId: "drv-demo-001",
          lat: 24.1477,
          lng: 120.6736,
          accuracyM: 12,
          recordedAt: "2026-06-20T05:58:00.000Z",
          updatedAt: staleUpdatedAt,
        })
        .mockResolvedValueOnce({
          driverId: "drv-demo-001",
          lat: 24.1477,
          lng: 120.6736,
          accuracyM: 150,
          recordedAt: "2026-06-20T06:00:00.000Z",
          updatedAt: new Date().toISOString(),
        }),
      findDriverHeartbeatEventByRecordedAt: vi.fn().mockResolvedValue({
        eventId: "evt-db",
        deviceId: "device-db",
        driverId: "drv-demo-001",
        vehicleId: null,
        taskId: null,
        sequenceNo: 3001,
        recordedAt: "2026-06-20T05:58:00.000Z",
        receivedAt: staleUpdatedAt,
        lat: 24.1477,
        lng: 120.6736,
        accuracyM: 12,
        workState: "available",
        appState: "background",
        transportMode: "background",
        networkType: "cellular",
      }),
      findLatestDriverHeartbeatEvent: vi.fn().mockResolvedValue({
        eventId: "evt-db",
        deviceId: "device-db",
        driverId: "drv-demo-001",
        vehicleId: null,
        taskId: null,
        sequenceNo: 3001,
        recordedAt: "2026-06-20T05:58:00.000Z",
        receivedAt: staleUpdatedAt,
        lat: 24.1477,
        lng: 120.6736,
        accuracyM: 12,
        workState: "available",
        appState: "background",
        transportMode: "background",
        networkType: "cellular",
      }),
    });

    await expect(
      service.getDriverTrackingStatus("drv-demo-001"),
    ).resolves.toEqual(
      expect.objectContaining({
        locationFreshness: "stale",
        lastEventId: "evt-db",
      }),
    );

    regulatoryRegistryRepository.findDriverHeartbeatEventByRecordedAt.mockResolvedValueOnce(
      {
        eventId: "evt-db-2",
        deviceId: "device-db",
        driverId: "drv-demo-001",
        vehicleId: null,
        taskId: null,
        sequenceNo: 3002,
        recordedAt: "2026-06-20T06:00:00.000Z",
        receivedAt: new Date().toISOString(),
        lat: 24.1477,
        lng: 120.6736,
        accuracyM: 150,
        workState: "available",
        appState: "background",
        transportMode: "background",
        networkType: "cellular",
      },
    );
    regulatoryRegistryRepository.findLatestDriverHeartbeatEvent.mockResolvedValueOnce(
      {
        eventId: "evt-db-2",
        deviceId: "device-db",
        driverId: "drv-demo-001",
        vehicleId: null,
        taskId: null,
        sequenceNo: 3002,
        recordedAt: "2026-06-20T06:00:00.000Z",
        receivedAt: new Date().toISOString(),
        lat: 24.1477,
        lng: 120.6736,
        accuracyM: 150,
        workState: "available",
        appState: "background",
        transportMode: "background",
        networkType: "cellular",
      },
    );

    await expect(
      service.getDriverTrackingStatus("drv-demo-001"),
    ).resolves.toEqual(
      expect.objectContaining({
        locationFreshness: "low_accuracy",
        lastEventId: "evt-db-2",
      }),
    );
  });
});
