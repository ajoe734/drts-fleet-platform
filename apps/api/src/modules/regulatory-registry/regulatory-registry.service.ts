import { randomUUID } from "node:crypto";

import { HttpStatus, Injectable, OnModuleInit, Optional } from "@nestjs/common";

import type {
  ActivateInsurancePolicyCommand,
  ActivateVehicleContractCommand,
  ApproveExclusivityCommand,
  CreateInsurancePolicyCommand,
  CreateVehicleContractCommand,
  DispatchExclusivityLifecycleStatus,
  DispatchExclusivityRecord,
  DriverEtaResponse,
  DriverLocationHeartbeatCommand,
  DriverLocationSnapshot,
  DriverRegistryRecord,
  InsurancePolicyLifecycleStatus,
  InsurancePolicyRecord,
  Phase1ServiceBucket,
  SupplyDispatchBlockReason,
  SupplyLifecycleTraceRecord,
  SubmitExclusivityReviewCommand,
  UpdateDriverWorkStateCommand,
  UpdateVehicleComplianceCommand,
  VehicleContractLifecycleStatus,
  VehicleContractRecord,
  VehicleRegistryRecord,
  VehicleSupplyLifecycleRecord,
} from "@drts/contracts";

import { ApiRequestError } from "../../common/api-envelope";
import { OpsDispatchEventsService } from "../../common/ops-dispatch-events.service";
import {
  RegulatoryRegistryRepository,
  type PersistRegulatoryRegistryChanges,
  type RegulatorySupplyPair,
} from "./regulatory-registry.repository";

const EARTH_RADIUS_KM = 6371;
const AVERAGE_SPEED_KMH = 30;
const SEED_TIMESTAMP = "2026-01-01T00:00:00.000Z";

type EtaDestination = {
  lat: number;
  lng: number;
};

function createEmptySupplyLifecycle(
  evaluatedAt: string,
): VehicleSupplyLifecycleRecord {
  return {
    contract: {
      contractId: null,
      lifecycleStatus: "missing",
      startAt: null,
      endAt: null,
      updatedAt: null,
    },
    insurance: {
      policyId: null,
      lifecycleStatus: "missing",
      startAt: null,
      endAt: null,
      updatedAt: null,
    },
    exclusivity: {
      lifecycleStatus: "missing",
      declarationStatus: "missing",
      declarationFileId: null,
      reviewStatus: "draft",
      providerName: null,
      effectiveStart: null,
      effectiveEnd: null,
      reviewedAt: null,
      updatedAt: null,
    },
    dispatch: {
      eligible: false,
      blockedReasons: ["manual_hold"],
      evaluatedAt,
    },
    lastTrace: null,
  };
}

const VEHICLE_SEED: VehicleRegistryRecord[] = [
  {
    vehicleId: "veh-demo-001",
    plateNo: "ABC-1001",
    operatingArea: "taichung-port",
    supportedServiceBuckets: ["standard_taxi", "business_dispatch"],
    dispatchableFlag: true,
    exclusivityApproved: true,
    insuranceStatus: "valid",
    updatedAt: SEED_TIMESTAMP,
    supplyLifecycle: createEmptySupplyLifecycle(SEED_TIMESTAMP),
  },
  {
    vehicleId: "veh-demo-002",
    plateNo: "ABC-1002",
    operatingArea: "taichung-port",
    supportedServiceBuckets: ["standard_taxi"],
    dispatchableFlag: false,
    exclusivityApproved: false,
    insuranceStatus: "valid",
    updatedAt: SEED_TIMESTAMP,
    supplyLifecycle: createEmptySupplyLifecycle(SEED_TIMESTAMP),
  },
  {
    vehicleId: "veh-demo-003",
    plateNo: "ABC-1003",
    operatingArea: "taichung-port",
    supportedServiceBuckets: ["standard_taxi"],
    dispatchableFlag: true,
    exclusivityApproved: true,
    insuranceStatus: "expired",
    updatedAt: "2026-03-31T23:59:59.000Z",
    supplyLifecycle: createEmptySupplyLifecycle("2026-03-31T23:59:59.000Z"),
  },
];

const DRIVER_SEED: DriverRegistryRecord[] = [
  {
    driverId: "drv-demo-001",
    name: "Driver Demo One",
    supportedServiceBuckets: ["standard_taxi", "business_dispatch"],
    workState: "available",
    licensesValid: true,
  },
  {
    driverId: "drv-demo-002",
    name: "Driver Demo Two",
    supportedServiceBuckets: ["standard_taxi"],
    workState: "offline",
    licensesValid: true,
  },
  {
    driverId: "drv-demo-003",
    name: "Driver Demo Three",
    supportedServiceBuckets: ["standard_taxi"],
    workState: "available",
    licensesValid: false,
  },
];

const CONTRACT_SEED: VehicleContractRecord[] = [
  {
    contractId: "contract-demo-001",
    vehicleId: "veh-demo-001",
    partnerId: "partner-demo-001",
    partnerType: "enterprise_partner",
    contractType: "service_fleet_contract",
    operatingAreaId: "taichung-port",
    serviceScope: "standard_taxi",
    startAt: "2026-01-01T00:00:00.000Z",
    endAt: "2026-12-31T23:59:59.000Z",
    status: "active",
    lifecycleStatus: "active",
    approvedBy: "platform-admin-demo-001",
    approvedAt: "2026-01-01T00:00:00.000Z",
    createdAt: "2026-01-01T00:00:00.000Z",
    updatedAt: "2026-01-01T00:00:00.000Z",
  },
];

const POLICY_SEED: InsurancePolicyRecord[] = [
  {
    policyId: "policy-demo-001",
    vehicleId: "veh-demo-001",
    policyNo: "POL-TAXI-0001",
    insuranceType: "passenger_liability",
    insurerName: "Demo Insurance",
    coverageAmount: 3000000,
    startAt: "2026-01-01T00:00:00.000Z",
    endAt: "2026-12-31T23:59:59.000Z",
    status: "active",
    lifecycleStatus: "active",
    createdAt: "2026-01-01T00:00:00.000Z",
    updatedAt: "2026-01-01T00:00:00.000Z",
  },
  {
    policyId: "policy-demo-002",
    vehicleId: "veh-demo-003",
    policyNo: "POL-TAXI-EXPIRED-0001",
    insuranceType: "passenger_liability",
    insurerName: "Demo Insurance",
    coverageAmount: 2500000,
    startAt: "2025-01-01T00:00:00.000Z",
    endAt: "2026-03-31T23:59:59.000Z",
    status: "expired",
    lifecycleStatus: "expired",
    createdAt: "2025-01-01T00:00:00.000Z",
    updatedAt: "2026-03-31T23:59:59.000Z",
  },
];

const EXCLUSIVITY_SEED: DispatchExclusivityRecord[] = [
  {
    vehicleId: "veh-demo-001",
    declarationStatus: "submitted",
    declarationFileId: "file-demo-001",
    reviewStatus: "approved",
    lifecycleStatus: "active",
    reviewerId: "platform-admin-demo-001",
    reviewedAt: "2026-01-01T00:00:00.000Z",
    exclusiveProviderName: "Acme Dispatch",
    effectiveStart: "2026-01-01T00:00:00.000Z",
    effectiveEnd: "2026-12-31T23:59:59.000Z",
    terminationReason: null,
    updatedAt: "2026-01-01T00:00:00.000Z",
  },
  {
    vehicleId: "veh-demo-002",
    declarationStatus: "submitted",
    declarationFileId: "file-demo-002",
    reviewStatus: "pending",
    lifecycleStatus: "pending_review",
    reviewerId: null,
    reviewedAt: null,
    exclusiveProviderName: "Acme Dispatch",
    effectiveStart: "2026-04-01T00:00:00.000Z",
    effectiveEnd: "2026-12-31T23:59:59.000Z",
    terminationReason: null,
    updatedAt: "2026-04-01T00:00:00.000Z",
  },
];

@Injectable()
export class RegulatoryRegistryService implements OnModuleInit {
  private vehicles = VEHICLE_SEED.map((vehicle) => ({ ...vehicle }));

  private drivers = DRIVER_SEED.map((driver) => ({ ...driver }));

  private latestDriverLocations = new Map<string, DriverLocationSnapshot>();

  private supplyPairs: RegulatorySupplyPair[] = [
    {
      vehicleId: "veh-demo-001",
      driverId: "drv-demo-001",
      etaMinutes: 8,
    },
    {
      vehicleId: "veh-demo-002",
      driverId: "drv-demo-002",
      etaMinutes: 11,
    },
    {
      vehicleId: "veh-demo-003",
      driverId: "drv-demo-003",
      etaMinutes: 13,
    },
  ];

  private contracts = CONTRACT_SEED.map((contract) =>
    this.cloneContract(contract),
  );

  private policies = POLICY_SEED.map((policy) => this.clonePolicy(policy));

  private exclusivities = EXCLUSIVITY_SEED.map((exclusivity) =>
    this.cloneExclusivity(exclusivity),
  );

  constructor(
    private readonly opsDispatchEventsService: OpsDispatchEventsService,
    @Optional()
    private readonly regulatoryRegistryRepository?: RegulatoryRegistryRepository,
  ) {
    this.reconcileSupplyLifecycleForAll({
      emitEvent: false,
      persistContext: null,
    });
  }

  async onModuleInit() {
    if (!this.regulatoryRegistryRepository) {
      return;
    }

    try {
      const latestDriverLocations =
        (await this.regulatoryRegistryRepository.listLatestDriverLocations?.()) ??
        [];
      this.replaceLatestDriverLocations(latestDriverLocations);

      const persistedState =
        await this.regulatoryRegistryRepository.loadState();
      const hasPersistedState =
        persistedState.vehicles.length > 0 ||
        persistedState.drivers.length > 0 ||
        persistedState.supplyPairs.length > 0 ||
        persistedState.contracts.length > 0 ||
        persistedState.policies.length > 0 ||
        persistedState.exclusivities.length > 0;

      if (!hasPersistedState) {
        this.persistChanges(
          {
            vehicles: this.vehicles.map((vehicle) => ({ ...vehicle })),
            drivers: this.drivers.map((driver) => ({ ...driver })),
            supplyPairs: this.supplyPairs.map((pair) => ({ ...pair })),
            contracts: this.contracts.map((contract) =>
              this.cloneContract(contract),
            ),
            policies: this.policies.map((policy) => this.clonePolicy(policy)),
            exclusivities: this.exclusivities.map((exclusivity) =>
              this.cloneExclusivity(exclusivity),
            ),
          },
          "module init bootstrap",
        );
        return;
      }

      if (persistedState.vehicles.length > 0) {
        this.vehicles = persistedState.vehicles.map((vehicle) =>
          this.hydrateVehicleRecord(vehicle),
        );
      }
      if (persistedState.drivers.length > 0) {
        this.drivers = persistedState.drivers.map((driver) => ({ ...driver }));
      }
      if (persistedState.supplyPairs.length > 0) {
        this.supplyPairs = persistedState.supplyPairs.map((pair) => ({
          ...pair,
        }));
      }
      if (persistedState.contracts.length > 0) {
        this.contracts = persistedState.contracts.map((contract) =>
          this.hydrateContract(contract),
        );
      }
      if (persistedState.policies.length > 0) {
        this.policies = persistedState.policies.map((policy) =>
          this.hydratePolicy(policy),
        );
      }
      if (persistedState.exclusivities.length > 0) {
        this.exclusivities = persistedState.exclusivities.map((exclusivity) =>
          this.hydrateExclusivity(exclusivity),
        );
      }
      this.reconcileSupplyLifecycleForAll({
        emitEvent: false,
        persistContext: null,
      });
    } catch (error) {
      this.regulatoryRegistryRepository.reportPersistenceFailure(
        error,
        "module init",
      );
    }
  }

  listVehicles() {
    this.reconcileSupplyLifecycleForAll({
      emitEvent: false,
      persistContext: null,
    });
    return this.vehicles.map((vehicle) => this.cloneVehicle(vehicle));
  }

  listDrivers() {
    return this.drivers.map((driver) => ({ ...driver }));
  }

  async recordDriverLocation(
    command: DriverLocationHeartbeatCommand,
  ): Promise<{ success: true }> {
    const driverId = command.driverId.trim();
    this.assertNonBlank(driverId, "driverId");
    this.assertCoordinate(command.lat, "lat", -90, 90);
    this.assertCoordinate(command.lng, "lng", -180, 180);
    this.assertOptionalNonNegativeNumber(command.accuracyM, "accuracyM");
    const recordedAt = this.normalizeHeartbeatRecordedAt(command.recordedAt);

    this.requireDriver(driverId);

    await this.requireLocationRepository().upsertDriverLocation({
      driverId,
      lat: command.lat,
      lng: command.lng,
      recordedAt,
      ...(command.accuracyM === undefined
        ? {}
        : { accuracyM: command.accuracyM }),
    });

    const updatedAt = new Date().toISOString();
    this.setLatestDriverLocation({
      driverId,
      lat: command.lat,
      lng: command.lng,
      accuracyM: command.accuracyM ?? null,
      recordedAt,
      updatedAt,
    });
    this.opsDispatchEventsService.publishDriverLocationUpdated(
      {
        driverId,
        lat: command.lat,
        lng: command.lng,
        accuracyM: command.accuracyM ?? null,
        recordedAt,
        updatedAt,
      },
      undefined,
    );

    return { success: true };
  }

  async getDriverEta(
    driverId: string,
    destLat: number,
    destLng: number,
  ): Promise<DriverEtaResponse> {
    this.assertNonBlank(driverId, "driverId");
    this.assertCoordinate(destLat, "destLat", -90, 90);
    this.assertCoordinate(destLng, "destLng", -180, 180);
    this.requireDriver(driverId);

    const driverLocation =
      await this.requireLocationRepository().findLatestDriverLocation(
        driverId.trim(),
      );

    if (!driverLocation) {
      throw new ApiRequestError(
        HttpStatus.NOT_FOUND,
        "DRIVER_LOCATION_NOT_FOUND",
        "The driver's latest location could not be found.",
        {
          driverId,
        },
      );
    }

    const distanceKm = this.calculateHaversineDistanceKm(
      driverLocation.lat,
      driverLocation.lng,
      destLat,
      destLng,
    );
    const etaMinutes = Math.round((distanceKm / AVERAGE_SPEED_KMH) * 60);

    return {
      driverId: driverLocation.driverId,
      etaMinutes,
      calculatedAt: new Date().toISOString(),
      driverLocation: this.cloneDriverLocation(driverLocation),
      destination: {
        lat: destLat,
        lng: destLng,
      },
    };
  }

  listContracts() {
    const evaluatedAt = new Date().toISOString();
    return this.contracts.map((contract) =>
      this.cloneContract(this.applyContractLifecycle(contract, evaluatedAt)),
    );
  }

  createContract(command: CreateVehicleContractCommand) {
    this.assertNonBlank(command.vehicleId, "vehicleId");
    this.assertNonBlank(command.partnerId, "partnerId");
    this.assertNonBlank(command.partnerType, "partnerType");
    this.assertNonBlank(command.contractType, "contractType");
    this.assertNonBlank(command.serviceScope, "serviceScope");
    this.assertTimeRange(command.startAt, command.endAt);
    this.requireVehicle(command.vehicleId);

    const now = new Date().toISOString();
    const contract: VehicleContractRecord = {
      contractId: `contract_${randomUUID()}`,
      vehicleId: command.vehicleId.trim(),
      partnerId: command.partnerId.trim(),
      partnerType: command.partnerType.trim(),
      contractType: command.contractType.trim(),
      operatingAreaId: this.normalizeNullableText(command.operatingAreaId),
      serviceScope: command.serviceScope.trim(),
      startAt: command.startAt,
      endAt: command.endAt,
      status: "draft",
      lifecycleStatus: "draft",
      approvedBy: null,
      approvedAt: null,
      createdAt: now,
      updatedAt: now,
    };

    const nextContract = this.applyContractLifecycle(contract, now);
    this.contracts = [this.cloneContract(nextContract), ...this.contracts];
    const vehicle = this.reconcileVehicleLifecycle(nextContract.vehicleId, {
      entityType: "contract",
      message: "Vehicle contract created in draft state.",
      occurredAt: now,
      relatedEntityId: nextContract.contractId,
      persistContext: null,
      touchUpdatedAt: true,
    });
    this.persistChanges(
      {
        contracts: [this.cloneContract(nextContract)],
        vehicles: [this.cloneVehicle(vehicle)],
      },
      "create_contract",
    );

    return this.cloneContract(nextContract);
  }

  activateContract(
    contractId: string,
    command: ActivateVehicleContractCommand,
  ) {
    const contract = this.requireContract(contractId);
    const approvedAt = command.approvedAt ?? new Date().toISOString();
    contract.status = "active";
    contract.approvedBy = this.normalizeNullableText(command.approvedBy);
    contract.approvedAt = approvedAt;
    contract.updatedAt = approvedAt;
    this.applyContractLifecycle(contract, approvedAt);

    const vehicle = this.reconcileVehicleLifecycle(contract.vehicleId, {
      entityType: "contract",
      message:
        contract.lifecycleStatus === "active"
          ? "Vehicle contract activated."
          : "Vehicle contract activation evaluated against its effective window.",
      occurredAt: approvedAt,
      relatedEntityId: contract.contractId,
      persistContext: null,
      touchUpdatedAt: true,
    });

    this.persistChanges(
      {
        contracts: [this.cloneContract(contract)],
        vehicles: [this.cloneVehicle(vehicle)],
      },
      "activate_contract",
    );

    return this.cloneContract(contract);
  }

  listPolicies() {
    const evaluatedAt = new Date().toISOString();
    return this.policies.map((policy) =>
      this.clonePolicy(this.applyPolicyLifecycle(policy, evaluatedAt)),
    );
  }

  listExpiringPolicies(windowDays = 30) {
    const now = Date.now();
    const cutoff = now + windowDays * 24 * 60 * 60 * 1000;

    return this.policies
      .filter((policy) => policy.lifecycleStatus === "active")
      .filter((policy) => {
        const endAt = new Date(policy.endAt).getTime();
        return endAt >= now && endAt <= cutoff;
      })
      .map((policy) => this.clonePolicy(policy));
  }

  createInsurancePolicy(command: CreateInsurancePolicyCommand) {
    this.assertNonBlank(command.vehicleId, "vehicleId");
    this.assertNonBlank(command.policyNo, "policyNo");
    this.assertNonBlank(command.insuranceType, "insuranceType");
    this.assertNonBlank(command.insurerName, "insurerName");
    this.assertTimeRange(command.startAt, command.endAt);
    this.requireVehicle(command.vehicleId);

    const now = new Date().toISOString();
    const policy: InsurancePolicyRecord = {
      policyId: `policy_${randomUUID()}`,
      vehicleId: command.vehicleId.trim(),
      policyNo: command.policyNo.trim(),
      insuranceType: command.insuranceType.trim(),
      insurerName: command.insurerName.trim(),
      coverageAmount: command.coverageAmount,
      startAt: command.startAt,
      endAt: command.endAt,
      status: "pending",
      lifecycleStatus: "pending",
      createdAt: now,
      updatedAt: now,
    };

    const nextPolicy = this.applyPolicyLifecycle(policy, now);
    this.policies = [this.clonePolicy(nextPolicy), ...this.policies];
    const vehicle = this.reconcileVehicleLifecycle(nextPolicy.vehicleId, {
      entityType: "insurance_policy",
      message: "Insurance policy created and awaiting activation.",
      occurredAt: now,
      relatedEntityId: nextPolicy.policyId,
      persistContext: null,
      touchUpdatedAt: true,
    });
    this.persistChanges(
      {
        policies: [this.clonePolicy(nextPolicy)],
        vehicles: [this.cloneVehicle(vehicle)],
      },
      "create_insurance_policy",
    );

    return this.clonePolicy(nextPolicy);
  }

  activateInsurancePolicy(
    policyId: string,
    command: ActivateInsurancePolicyCommand,
  ) {
    const policy = this.requirePolicy(policyId);
    const activatedAt = command.activatedAt ?? new Date().toISOString();
    policy.status =
      new Date(policy.endAt).getTime() < new Date(activatedAt).getTime()
        ? "expired"
        : "active";
    policy.updatedAt = activatedAt;
    this.applyPolicyLifecycle(policy, activatedAt);
    const vehicle = this.reconcileVehicleLifecycle(policy.vehicleId, {
      entityType: "insurance_policy",
      message:
        policy.lifecycleStatus === "active"
          ? "Insurance policy activated."
          : "Insurance policy is no longer valid for dispatch.",
      occurredAt: activatedAt,
      relatedEntityId: policy.policyId,
      persistContext: null,
      touchUpdatedAt: true,
    });

    this.persistChanges(
      {
        policies: [this.clonePolicy(policy)],
        vehicles: [this.cloneVehicle(vehicle)],
      },
      "activate_insurance_policy",
    );

    return this.clonePolicy(policy);
  }

  listExclusivities() {
    const evaluatedAt = new Date().toISOString();
    return this.exclusivities.map((exclusivity) =>
      this.cloneExclusivity(
        this.applyExclusivityLifecycle(exclusivity, evaluatedAt),
      ),
    );
  }

  submitExclusivityReview(
    vehicleId: string,
    command: SubmitExclusivityReviewCommand,
  ) {
    this.requireVehicle(vehicleId);
    const now = new Date().toISOString();
    const existing = this.exclusivities.find(
      (exclusivity) => exclusivity.vehicleId === vehicleId,
    );
    const exclusivity: DispatchExclusivityRecord = existing
      ? {
          ...existing,
          declarationStatus: "submitted",
          declarationFileId:
            this.normalizeNullableText(command.declarationFileId) ??
            existing.declarationFileId,
          reviewStatus: "pending",
          lifecycleStatus: "pending_review",
          reviewerId: null,
          reviewedAt: null,
          exclusiveProviderName:
            this.normalizeNullableText(command.exclusiveProviderName) ??
            existing.exclusiveProviderName,
          effectiveStart:
            this.normalizeNullableText(command.effectiveStart) ??
            existing.effectiveStart,
          effectiveEnd:
            this.normalizeNullableText(command.effectiveEnd) ??
            existing.effectiveEnd,
          terminationReason: null,
          updatedAt: now,
        }
      : {
          vehicleId,
          declarationStatus: "submitted",
          declarationFileId: this.normalizeNullableText(
            command.declarationFileId,
          ),
          reviewStatus: "pending",
          lifecycleStatus: "pending_review",
          reviewerId: null,
          reviewedAt: null,
          exclusiveProviderName: this.normalizeNullableText(
            command.exclusiveProviderName,
          ),
          effectiveStart: this.normalizeNullableText(command.effectiveStart),
          effectiveEnd: this.normalizeNullableText(command.effectiveEnd),
          terminationReason: null,
          updatedAt: now,
        };

    this.applyExclusivityLifecycle(exclusivity, now);
    this.exclusivities = [
      this.cloneExclusivity(exclusivity),
      ...this.exclusivities.filter(
        (candidate) => candidate.vehicleId !== vehicleId,
      ),
    ];
    const vehicle = this.reconcileVehicleLifecycle(vehicleId, {
      entityType: "exclusivity",
      message:
        "Exclusivity review submitted and vehicle is held pending approval.",
      occurredAt: now,
      relatedEntityId: vehicleId,
      persistContext: null,
      touchUpdatedAt: true,
    });
    this.persistChanges(
      {
        exclusivities: [this.cloneExclusivity(exclusivity)],
        vehicles: [this.cloneVehicle(vehicle)],
      },
      "submit_exclusivity_review",
    );

    return this.cloneExclusivity(exclusivity);
  }

  approveExclusivity(vehicleId: string, command: ApproveExclusivityCommand) {
    this.requireVehicle(vehicleId);
    const reviewedAt = command.reviewedAt ?? new Date().toISOString();
    const exclusivity = this.exclusivities.find(
      (candidate) => candidate.vehicleId === vehicleId,
    ) ?? {
      vehicleId,
      declarationStatus: "submitted",
      declarationFileId: null,
      reviewStatus: "draft" as const,
      lifecycleStatus: "missing" as const,
      reviewerId: null,
      reviewedAt: null,
      exclusiveProviderName: null,
      effectiveStart: null,
      effectiveEnd: null,
      terminationReason: null,
      updatedAt: reviewedAt,
    };

    exclusivity.declarationStatus = "submitted";
    exclusivity.reviewStatus = "approved";
    exclusivity.reviewerId = this.normalizeNullableText(command.reviewerId);
    exclusivity.reviewedAt = reviewedAt;
    exclusivity.updatedAt = reviewedAt;
    this.applyExclusivityLifecycle(exclusivity, reviewedAt);

    this.exclusivities = [
      this.cloneExclusivity(exclusivity),
      ...this.exclusivities.filter(
        (candidate) => candidate.vehicleId !== vehicleId,
      ),
    ];
    const vehicle = this.reconcileVehicleLifecycle(vehicleId, {
      entityType: "exclusivity",
      message:
        exclusivity.lifecycleStatus === "active"
          ? "Exclusivity approved and supply may dispatch again."
          : "Exclusivity approval recorded, but the effective window is not dispatchable.",
      occurredAt: reviewedAt,
      relatedEntityId: vehicleId,
      persistContext: null,
      touchUpdatedAt: true,
    });
    this.persistChanges(
      {
        exclusivities: [this.cloneExclusivity(exclusivity)],
        vehicles: [this.cloneVehicle(vehicle)],
      },
      "approve_exclusivity",
    );

    return this.cloneExclusivity(exclusivity);
  }

  updateVehicleCompliance(
    vehicleId: string,
    command: UpdateVehicleComplianceCommand,
  ) {
    const vehicle = this.requireVehicle(vehicleId);
    const evaluatedAt = new Date().toISOString();
    const lifecycle = this.evaluateVehicleSupplyLifecycle(
      vehicle,
      command.dispatchableFlag ?? vehicle.dispatchableFlag,
      evaluatedAt,
    );
    if (
      command.dispatchableFlag === true &&
      lifecycle.dispatch.blockedReasons.length > 0
    ) {
      throw new ApiRequestError(
        HttpStatus.CONFLICT,
        "VEHICLE_NOT_DISPATCHABLE",
        "The vehicle cannot be marked dispatchable until contract, insurance, and exclusivity requirements are satisfied.",
        {
          vehicleId,
          blockedReasons: lifecycle.dispatch.blockedReasons,
        },
      );
    }

    if (command.dispatchableFlag !== undefined) {
      vehicle.dispatchableFlag = command.dispatchableFlag;
    }
    this.reconcileVehicleLifecycle(vehicleId, {
      entityType: "vehicle",
      message: vehicle.dispatchableFlag
        ? "Vehicle manually marked dispatchable."
        : "Vehicle manually placed on dispatch hold.",
      occurredAt: evaluatedAt,
      relatedEntityId: vehicleId,
      persistContext: null,
      touchUpdatedAt: true,
    });
    this.persistChanges(
      {
        vehicles: [this.cloneVehicle(vehicle)],
      },
      "update_vehicle_compliance",
    );
    return this.cloneVehicle(vehicle);
  }

  updateDriverWorkState(
    driverId: string,
    command: UpdateDriverWorkStateCommand,
  ) {
    const driver = this.requireDriver(driverId);
    driver.workState = command.workState;
    this.persistChanges(
      {
        drivers: [{ ...driver }],
      },
      "update_driver_work_state",
    );
    return { ...driver };
  }

  getEligibleCandidates(
    serviceBucket: Phase1ServiceBucket,
    destination?: EtaDestination | null,
  ) {
    this.reconcileSupplyLifecycleForAll({
      emitEvent: false,
      persistContext: null,
    });
    return this.supplyPairs
      .map((pair) => {
        const vehicle = this.vehicles.find(
          (candidateVehicle) => candidateVehicle.vehicleId === pair.vehicleId,
        );
        const driver = this.drivers.find(
          (candidateDriver) => candidateDriver.driverId === pair.driverId,
        );
        if (!vehicle || !driver) {
          return null;
        }
        const eligibleVehicle =
          vehicle.supplyLifecycle.dispatch.eligible &&
          vehicle.supportedServiceBuckets.includes(serviceBucket);
        const eligibleDriver =
          driver.licensesValid &&
          driver.workState === "available" &&
          driver.supportedServiceBuckets.includes(serviceBucket);
        if (!eligibleVehicle || !eligibleDriver) {
          return null;
        }

        const etaMinutes = this.resolveCandidateEta(
          pair,
          driver.driverId,
          destination ?? null,
        );
        if (etaMinutes === null) {
          return null;
        }

        return {
          vehicleId: vehicle.vehicleId,
          driverId: driver.driverId,
          operatingArea: vehicle.operatingArea,
          serviceBuckets: [...vehicle.supportedServiceBuckets],
          etaMinutes,
        };
      })
      .filter((candidate): candidate is NonNullable<typeof candidate> =>
        Boolean(candidate),
      );
  }

  getVehicleDispatchability(
    vehicleId: string,
    serviceBucket: Phase1ServiceBucket,
  ) {
    this.reconcileSupplyLifecycleForAll({
      emitEvent: false,
      persistContext: null,
    });
    const vehicle = this.requireVehicle(vehicleId);
    return (
      vehicle.supplyLifecycle.dispatch.eligible &&
      vehicle.supportedServiceBuckets.includes(serviceBucket)
    );
  }

  getDriverAvailability(driverId: string, serviceBucket: Phase1ServiceBucket) {
    const driver = this.requireDriver(driverId);
    return (
      driver.licensesValid &&
      driver.workState === "available" &&
      driver.supportedServiceBuckets.includes(serviceBucket)
    );
  }

  private reconcileSupplyLifecycleForAll(options?: {
    emitEvent?: boolean;
    persistContext?: string | null;
  }): void {
    const reconciledVehicles = this.vehicles.map((vehicle) =>
      this.reconcileVehicleLifecycle(vehicle.vehicleId, {
        entityType: "vehicle",
        ...(options?.emitEvent === undefined
          ? {}
          : { emitEvent: options.emitEvent }),
        persistContext: null,
      }),
    );

    if (options?.persistContext) {
      this.persistChanges(
        {
          vehicles: reconciledVehicles.map((vehicle) =>
            this.cloneVehicle(vehicle),
          ),
        },
        options.persistContext,
      );
    }
  }

  private reconcileVehicleLifecycle(
    vehicleId: string,
    options?: {
      entityType?: SupplyLifecycleTraceRecord["entityType"];
      message?: string;
      occurredAt?: string;
      relatedEntityId?: string | null;
      emitEvent?: boolean;
      persistContext?: string | null;
      touchUpdatedAt?: boolean;
    },
  ): VehicleRegistryRecord {
    const vehicle = this.requireVehicle(vehicleId);
    const occurredAt = options?.occurredAt ?? new Date().toISOString();
    const previousLifecycle = this.cloneSupplyLifecycle(
      vehicle.supplyLifecycle,
    );

    let nextLifecycle = this.evaluateVehicleSupplyLifecycle(
      vehicle,
      vehicle.dispatchableFlag,
      occurredAt,
    );

    const hasComplianceBlock = nextLifecycle.dispatch.blockedReasons.some(
      (reason) => reason !== "manual_hold",
    );
    if (vehicle.dispatchableFlag && hasComplianceBlock) {
      vehicle.dispatchableFlag = false;
      nextLifecycle = this.evaluateVehicleSupplyLifecycle(
        vehicle,
        vehicle.dispatchableFlag,
        occurredAt,
      );
    }

    const lifecycleChanged = this.didLifecycleChange(
      previousLifecycle,
      nextLifecycle,
    );
    const nextTrace =
      lifecycleChanged || options?.message
        ? {
            entityType: options?.entityType ?? "vehicle",
            status: nextLifecycle.dispatch.eligible
              ? "dispatchable"
              : "blocked",
            reasonCode: nextLifecycle.dispatch.blockedReasons[0] ?? null,
            message:
              options?.message ??
              (nextLifecycle.dispatch.eligible
                ? "Vehicle supply lifecycle restored to dispatchable."
                : "Vehicle supply lifecycle is blocking dispatch."),
            occurredAt,
            relatedEntityId: options?.relatedEntityId ?? vehicleId,
          }
        : previousLifecycle.lastTrace;

    vehicle.exclusivityApproved =
      nextLifecycle.exclusivity.lifecycleStatus === "active";
    vehicle.insuranceStatus =
      nextLifecycle.insurance.lifecycleStatus === "active"
        ? "valid"
        : "expired";
    if (options?.touchUpdatedAt) {
      vehicle.updatedAt = occurredAt;
    }
    vehicle.supplyLifecycle = {
      ...nextLifecycle,
      lastTrace: nextTrace,
    };

    if (lifecycleChanged && options?.emitEvent !== false) {
      this.opsDispatchEventsService.publishSupplyLifecycleUpdated(
        this.cloneVehicle(vehicle),
      );
    }

    if (options?.persistContext) {
      this.persistChanges(
        {
          vehicles: [this.cloneVehicle(vehicle)],
        },
        options.persistContext,
      );
    }

    return vehicle;
  }

  private evaluateVehicleSupplyLifecycle(
    vehicle: VehicleRegistryRecord,
    dispatchableFlag = vehicle.dispatchableFlag,
    evaluatedAt = new Date().toISOString(),
  ): VehicleSupplyLifecycleRecord {
    const contract = this.selectPrimaryContract(vehicle.vehicleId, evaluatedAt);
    const policy = this.selectPrimaryPolicy(vehicle.vehicleId, evaluatedAt);
    const exclusivity = this.selectPrimaryExclusivity(
      vehicle.vehicleId,
      evaluatedAt,
    );

    const blockedReasons: SupplyDispatchBlockReason[] = [];
    if (!contract || contract.lifecycleStatus === "missing") {
      blockedReasons.push("contract_missing");
    } else if (contract.lifecycleStatus === "draft") {
      blockedReasons.push("contract_draft");
    } else if (contract.lifecycleStatus === "expired") {
      blockedReasons.push("contract_expired");
    } else if (contract.lifecycleStatus === "terminated") {
      blockedReasons.push("contract_terminated");
    }

    if (!policy || policy.lifecycleStatus === "missing") {
      blockedReasons.push("insurance_missing");
    } else if (policy.lifecycleStatus === "pending") {
      blockedReasons.push("insurance_pending");
    } else if (policy.lifecycleStatus === "expired") {
      blockedReasons.push("insurance_expired");
    } else if (policy.lifecycleStatus === "cancelled") {
      blockedReasons.push("insurance_cancelled");
    }

    if (!exclusivity || exclusivity.lifecycleStatus === "missing") {
      blockedReasons.push("exclusivity_missing");
    } else if (exclusivity.lifecycleStatus === "pending_review") {
      blockedReasons.push("exclusivity_pending_review");
    } else if (exclusivity.lifecycleStatus === "expired") {
      blockedReasons.push("exclusivity_expired");
    } else if (exclusivity.lifecycleStatus === "revoked") {
      blockedReasons.push("exclusivity_revoked");
    } else if (exclusivity.lifecycleStatus === "rejected") {
      blockedReasons.push("exclusivity_rejected");
    }

    if (blockedReasons.length === 0 && !dispatchableFlag) {
      blockedReasons.push("manual_hold");
    }

    return {
      contract: {
        contractId: contract?.contractId ?? null,
        lifecycleStatus: contract?.lifecycleStatus ?? "missing",
        startAt: contract?.startAt ?? null,
        endAt: contract?.endAt ?? null,
        updatedAt: contract?.updatedAt ?? null,
      },
      insurance: {
        policyId: policy?.policyId ?? null,
        lifecycleStatus: policy?.lifecycleStatus ?? "missing",
        startAt: policy?.startAt ?? null,
        endAt: policy?.endAt ?? null,
        updatedAt: policy?.updatedAt ?? null,
      },
      exclusivity: {
        lifecycleStatus: exclusivity?.lifecycleStatus ?? "missing",
        declarationStatus: exclusivity?.declarationStatus ?? "missing",
        declarationFileId: exclusivity?.declarationFileId ?? null,
        reviewStatus: exclusivity?.reviewStatus ?? "draft",
        providerName: exclusivity?.exclusiveProviderName ?? null,
        effectiveStart: exclusivity?.effectiveStart ?? null,
        effectiveEnd: exclusivity?.effectiveEnd ?? null,
        reviewedAt: exclusivity?.reviewedAt ?? null,
        updatedAt: exclusivity?.updatedAt ?? null,
      },
      dispatch: {
        eligible: blockedReasons.length === 0,
        blockedReasons,
        evaluatedAt,
      },
      lastTrace: vehicle.supplyLifecycle?.lastTrace
        ? this.cloneTrace(vehicle.supplyLifecycle.lastTrace)
        : null,
    };
  }

  private didLifecycleChange(
    previous: VehicleSupplyLifecycleRecord,
    next: VehicleSupplyLifecycleRecord,
  ): boolean {
    return (
      previous.contract.contractId !== next.contract.contractId ||
      previous.contract.lifecycleStatus !== next.contract.lifecycleStatus ||
      previous.insurance.policyId !== next.insurance.policyId ||
      previous.insurance.lifecycleStatus !== next.insurance.lifecycleStatus ||
      previous.exclusivity.lifecycleStatus !==
        next.exclusivity.lifecycleStatus ||
      previous.exclusivity.reviewStatus !== next.exclusivity.reviewStatus ||
      previous.dispatch.eligible !== next.dispatch.eligible ||
      previous.dispatch.blockedReasons.join("|") !==
        next.dispatch.blockedReasons.join("|")
    );
  }

  private selectPrimaryContract(
    vehicleId: string,
    evaluatedAt: string,
  ): VehicleContractRecord | null {
    const priority: Record<VehicleContractLifecycleStatus, number> = {
      missing: 0,
      terminated: 1,
      expired: 2,
      draft: 3,
      active: 4,
    };

    const candidates = this.contracts
      .filter((contract) => contract.vehicleId === vehicleId)
      .map((contract) => this.applyContractLifecycle(contract, evaluatedAt))
      .sort((left, right) => {
        const priorityDelta =
          priority[right.lifecycleStatus] - priority[left.lifecycleStatus];
        if (priorityDelta !== 0) {
          return priorityDelta;
        }
        return (
          new Date(right.updatedAt).getTime() -
          new Date(left.updatedAt).getTime()
        );
      });

    return candidates[0] ? this.cloneContract(candidates[0]) : null;
  }

  private selectPrimaryPolicy(
    vehicleId: string,
    evaluatedAt: string,
  ): InsurancePolicyRecord | null {
    const priority: Record<InsurancePolicyLifecycleStatus, number> = {
      missing: 0,
      cancelled: 1,
      expired: 2,
      pending: 3,
      active: 4,
    };

    const candidates = this.policies
      .filter((policy) => policy.vehicleId === vehicleId)
      .map((policy) => this.applyPolicyLifecycle(policy, evaluatedAt))
      .sort((left, right) => {
        const priorityDelta =
          priority[right.lifecycleStatus] - priority[left.lifecycleStatus];
        if (priorityDelta !== 0) {
          return priorityDelta;
        }
        return (
          new Date(right.updatedAt).getTime() -
          new Date(left.updatedAt).getTime()
        );
      });

    return candidates[0] ? this.clonePolicy(candidates[0]) : null;
  }

  private selectPrimaryExclusivity(
    vehicleId: string,
    evaluatedAt: string,
  ): DispatchExclusivityRecord | null {
    const priority: Record<DispatchExclusivityLifecycleStatus, number> = {
      missing: 0,
      rejected: 1,
      revoked: 2,
      expired: 3,
      pending_review: 4,
      active: 5,
    };

    const candidates = this.exclusivities
      .filter((exclusivity) => exclusivity.vehicleId === vehicleId)
      .map((exclusivity) =>
        this.applyExclusivityLifecycle(exclusivity, evaluatedAt),
      )
      .sort((left, right) => {
        const priorityDelta =
          priority[right.lifecycleStatus] - priority[left.lifecycleStatus];
        if (priorityDelta !== 0) {
          return priorityDelta;
        }
        return (
          new Date(right.updatedAt).getTime() -
          new Date(left.updatedAt).getTime()
        );
      });

    return candidates[0] ? this.cloneExclusivity(candidates[0]) : null;
  }

  private applyContractLifecycle(
    contract: VehicleContractRecord,
    evaluatedAt: string,
  ): VehicleContractRecord {
    const evaluatedAtMs = new Date(evaluatedAt).getTime();
    if (contract.status === "terminated") {
      contract.lifecycleStatus = "terminated";
      return contract;
    }
    if (new Date(contract.startAt).getTime() > evaluatedAtMs) {
      contract.lifecycleStatus = "draft";
      return contract;
    }
    if (new Date(contract.endAt).getTime() < evaluatedAtMs) {
      contract.lifecycleStatus = "expired";
      return contract;
    }
    contract.lifecycleStatus =
      contract.status === "active" ? "active" : "draft";
    return contract;
  }

  private applyPolicyLifecycle(
    policy: InsurancePolicyRecord,
    evaluatedAt: string,
  ): InsurancePolicyRecord {
    const evaluatedAtMs = new Date(evaluatedAt).getTime();
    if (policy.status === "cancelled") {
      policy.lifecycleStatus = "cancelled";
      return policy;
    }
    if (new Date(policy.startAt).getTime() > evaluatedAtMs) {
      policy.lifecycleStatus = "pending";
      return policy;
    }
    if (new Date(policy.endAt).getTime() < evaluatedAtMs) {
      policy.lifecycleStatus = "expired";
      return policy;
    }
    policy.lifecycleStatus = policy.status === "active" ? "active" : "pending";
    return policy;
  }

  private applyExclusivityLifecycle(
    exclusivity: DispatchExclusivityRecord,
    evaluatedAt: string,
  ): DispatchExclusivityRecord {
    const evaluatedAtMs = new Date(evaluatedAt).getTime();
    if (exclusivity.reviewStatus === "rejected") {
      exclusivity.lifecycleStatus = "rejected";
      return exclusivity;
    }
    if (exclusivity.terminationReason) {
      exclusivity.lifecycleStatus = "revoked";
      return exclusivity;
    }
    if (exclusivity.reviewStatus !== "approved") {
      exclusivity.lifecycleStatus =
        exclusivity.declarationStatus === "submitted"
          ? "pending_review"
          : "missing";
      return exclusivity;
    }
    if (
      exclusivity.effectiveStart &&
      new Date(exclusivity.effectiveStart).getTime() > evaluatedAtMs
    ) {
      exclusivity.lifecycleStatus = "pending_review";
      return exclusivity;
    }
    if (
      exclusivity.effectiveEnd &&
      new Date(exclusivity.effectiveEnd).getTime() < evaluatedAtMs
    ) {
      exclusivity.lifecycleStatus = "expired";
      return exclusivity;
    }
    exclusivity.lifecycleStatus = "active";
    return exclusivity;
  }

  private hydrateVehicleRecord(
    vehicle: VehicleRegistryRecord,
  ): VehicleRegistryRecord {
    const updatedAt = vehicle.updatedAt ?? SEED_TIMESTAMP;
    return {
      ...vehicle,
      supportedServiceBuckets: [...vehicle.supportedServiceBuckets],
      updatedAt,
      supplyLifecycle: vehicle.supplyLifecycle
        ? this.cloneSupplyLifecycle(vehicle.supplyLifecycle)
        : createEmptySupplyLifecycle(updatedAt),
    };
  }

  private hydrateContract(
    contract: VehicleContractRecord,
  ): VehicleContractRecord {
    return this.applyContractLifecycle(
      {
        ...contract,
        lifecycleStatus: contract.lifecycleStatus ?? "draft",
      },
      contract.updatedAt ?? SEED_TIMESTAMP,
    );
  }

  private hydratePolicy(policy: InsurancePolicyRecord): InsurancePolicyRecord {
    return this.applyPolicyLifecycle(
      {
        ...policy,
        lifecycleStatus: policy.lifecycleStatus ?? "pending",
      },
      policy.updatedAt ?? SEED_TIMESTAMP,
    );
  }

  private hydrateExclusivity(
    exclusivity: DispatchExclusivityRecord,
  ): DispatchExclusivityRecord {
    return this.applyExclusivityLifecycle(
      {
        ...exclusivity,
        lifecycleStatus: exclusivity.lifecycleStatus ?? "missing",
      },
      exclusivity.updatedAt ?? SEED_TIMESTAMP,
    );
  }

  private cloneVehicle(vehicle: VehicleRegistryRecord): VehicleRegistryRecord {
    return {
      ...vehicle,
      supportedServiceBuckets: [...vehicle.supportedServiceBuckets],
      supplyLifecycle: this.cloneSupplyLifecycle(vehicle.supplyLifecycle),
    };
  }

  private cloneSupplyLifecycle(
    lifecycle: VehicleSupplyLifecycleRecord,
  ): VehicleSupplyLifecycleRecord {
    return {
      contract: { ...lifecycle.contract },
      insurance: { ...lifecycle.insurance },
      exclusivity: { ...lifecycle.exclusivity },
      dispatch: {
        ...lifecycle.dispatch,
        blockedReasons: [...lifecycle.dispatch.blockedReasons],
      },
      lastTrace: lifecycle.lastTrace
        ? this.cloneTrace(lifecycle.lastTrace)
        : null,
    };
  }

  private cloneTrace(
    trace: SupplyLifecycleTraceRecord,
  ): SupplyLifecycleTraceRecord {
    return {
      ...trace,
    };
  }

  private cloneContract(
    contract: VehicleContractRecord,
  ): VehicleContractRecord {
    return {
      ...contract,
    };
  }

  private clonePolicy(policy: InsurancePolicyRecord): InsurancePolicyRecord {
    return {
      ...policy,
    };
  }

  private cloneExclusivity(
    exclusivity: DispatchExclusivityRecord,
  ): DispatchExclusivityRecord {
    return {
      ...exclusivity,
    };
  }

  private cloneDriverLocation(
    location: DriverLocationSnapshot,
  ): DriverLocationSnapshot {
    return {
      ...location,
    };
  }

  private replaceLatestDriverLocations(
    locations: readonly DriverLocationSnapshot[],
  ): void {
    this.latestDriverLocations = new Map(
      locations.map((location) => [
        location.driverId,
        this.cloneDriverLocation(location),
      ]),
    );
  }

  private setLatestDriverLocation(location: DriverLocationSnapshot): void {
    this.latestDriverLocations.set(
      location.driverId,
      this.cloneDriverLocation(location),
    );
  }

  private resolveCandidateEta(
    pair: RegulatorySupplyPair,
    driverId: string,
    destination: EtaDestination | null,
  ): number | null {
    if (!destination) {
      return pair.etaMinutes;
    }

    const driverLocation = this.latestDriverLocations.get(driverId);
    if (!driverLocation) {
      return null;
    }

    const distanceKm = this.calculateHaversineDistanceKm(
      driverLocation.lat,
      driverLocation.lng,
      destination.lat,
      destination.lng,
    );
    return Math.round((distanceKm / AVERAGE_SPEED_KMH) * 60);
  }

  private normalizeNullableText(value: string | null | undefined) {
    const normalized = value?.trim();
    return normalized ? normalized : null;
  }

  private normalizeHeartbeatRecordedAt(recordedAt: string | undefined): string {
    if (!recordedAt) {
      return new Date().toISOString();
    }

    const normalized = recordedAt.trim();
    if (!normalized) {
      throw new ApiRequestError(
        HttpStatus.BAD_REQUEST,
        "FIELD_REQUIRED",
        "recordedAt is required.",
        {
          field: "recordedAt",
        },
      );
    }

    const parsed = Date.parse(normalized);
    if (Number.isNaN(parsed)) {
      throw new ApiRequestError(
        HttpStatus.BAD_REQUEST,
        "FIELD_INVALID",
        "recordedAt must be a valid ISO-8601 timestamp.",
        {
          field: "recordedAt",
        },
      );
    }

    return new Date(parsed).toISOString();
  }

  private assertNonBlank(value: string, fieldName: string) {
    if (!value.trim()) {
      throw new ApiRequestError(
        HttpStatus.BAD_REQUEST,
        "FIELD_REQUIRED",
        `${fieldName} is required.`,
        {
          field: fieldName,
        },
      );
    }
  }

  private assertCoordinate(
    value: number,
    fieldName: string,
    min: number,
    max: number,
  ): void {
    if (!Number.isFinite(value)) {
      throw new ApiRequestError(
        HttpStatus.BAD_REQUEST,
        "INVALID_NUMBER",
        `${fieldName} must be a finite number.`,
        {
          field: fieldName,
        },
      );
    }
    if (value < min || value > max) {
      throw new ApiRequestError(
        HttpStatus.BAD_REQUEST,
        "INVALID_COORDINATE",
        `${fieldName} must be between ${min} and ${max}.`,
        {
          field: fieldName,
          min,
          max,
        },
      );
    }
  }

  private assertOptionalNonNegativeNumber(
    value: number | undefined,
    fieldName: string,
  ): void {
    if (value === undefined) {
      return;
    }
    if (!Number.isFinite(value) || value < 0) {
      throw new ApiRequestError(
        HttpStatus.BAD_REQUEST,
        "INVALID_NUMBER",
        `${fieldName} must be a non-negative finite number.`,
        {
          field: fieldName,
        },
      );
    }
  }

  private assertTimeRange(startAt: string, endAt: string) {
    if (
      Number.isNaN(new Date(startAt).getTime()) ||
      Number.isNaN(new Date(endAt).getTime())
    ) {
      throw new ApiRequestError(
        HttpStatus.BAD_REQUEST,
        "INVALID_TIME_RANGE",
        "startAt and endAt must be valid ISO timestamps.",
      );
    }
    if (new Date(endAt).getTime() <= new Date(startAt).getTime()) {
      throw new ApiRequestError(
        HttpStatus.BAD_REQUEST,
        "INVALID_TIME_RANGE",
        "endAt must be later than startAt.",
      );
    }
  }

  private requireVehicle(vehicleId: string) {
    const vehicle = this.vehicles.find(
      (candidateVehicle) => candidateVehicle.vehicleId === vehicleId,
    );
    if (!vehicle) {
      throw new ApiRequestError(
        HttpStatus.NOT_FOUND,
        "VEHICLE_NOT_FOUND",
        "The vehicle could not be found.",
        {
          vehicleId,
        },
      );
    }
    return vehicle;
  }

  private requireDriver(driverId: string) {
    const driver = this.drivers.find(
      (candidateDriver) => candidateDriver.driverId === driverId,
    );
    if (!driver) {
      throw new ApiRequestError(
        HttpStatus.NOT_FOUND,
        "DRIVER_NOT_FOUND",
        "The driver could not be found.",
        {
          driverId,
        },
      );
    }
    return driver;
  }

  private requireLocationRepository(): RegulatoryRegistryRepository {
    if (!this.regulatoryRegistryRepository?.isEnabled()) {
      throw new ApiRequestError(
        HttpStatus.SERVICE_UNAVAILABLE,
        "DRIVER_LOCATION_STORAGE_UNAVAILABLE",
        "Driver location storage is not available.",
      );
    }

    return this.regulatoryRegistryRepository;
  }

  private requireContract(contractId: string) {
    const contract = this.contracts.find(
      (candidate) => candidate.contractId === contractId,
    );
    if (!contract) {
      throw new ApiRequestError(
        HttpStatus.NOT_FOUND,
        "CONTRACT_NOT_FOUND",
        "The vehicle contract could not be found.",
        {
          contractId,
        },
      );
    }
    return contract;
  }

  private requirePolicy(policyId: string) {
    const policy = this.policies.find(
      (candidate) => candidate.policyId === policyId,
    );
    if (!policy) {
      throw new ApiRequestError(
        HttpStatus.NOT_FOUND,
        "POLICY_NOT_FOUND",
        "The insurance policy could not be found.",
        {
          policyId,
        },
      );
    }
    return policy;
  }

  private persistChanges(
    changes: PersistRegulatoryRegistryChanges,
    context: string,
  ) {
    if (!this.regulatoryRegistryRepository) {
      return;
    }

    void this.regulatoryRegistryRepository
      .persistChanges(changes)
      .catch((error: unknown) => {
        this.regulatoryRegistryRepository!.reportPersistenceFailure(
          error,
          context,
        );
      });
  }

  private calculateHaversineDistanceKm(
    originLat: number,
    originLng: number,
    destinationLat: number,
    destinationLng: number,
  ): number {
    if (originLat === destinationLat && originLng === destinationLng) {
      return 0;
    }

    const latDelta = this.degreesToRadians(destinationLat - originLat);
    const lngDelta = this.degreesToRadians(destinationLng - originLng);
    const normalizedOriginLat = this.degreesToRadians(originLat);
    const normalizedDestinationLat = this.degreesToRadians(destinationLat);

    const haversineTerm =
      Math.sin(latDelta / 2) ** 2 +
      Math.cos(normalizedOriginLat) *
        Math.cos(normalizedDestinationLat) *
        Math.sin(lngDelta / 2) ** 2;
    const angularDistance =
      2 * Math.atan2(Math.sqrt(haversineTerm), Math.sqrt(1 - haversineTerm));

    return EARTH_RADIUS_KM * angularDistance;
  }

  private degreesToRadians(value: number): number {
    return (value * Math.PI) / 180;
  }
}
