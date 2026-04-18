import { randomUUID } from "node:crypto";

import { HttpStatus, Injectable, OnModuleInit, Optional } from "@nestjs/common";

import type {
  ActivateInsurancePolicyCommand,
  ActivateVehicleContractCommand,
  ApproveExclusivityCommand,
  CreateInsurancePolicyCommand,
  CreateVehicleContractCommand,
  DispatchExclusivityRecord,
  DriverEtaResponse,
  DriverLocationHeartbeatCommand,
  DriverLocationSnapshot,
  DriverRegistryRecord,
  InsurancePolicyRecord,
  Phase1ServiceBucket,
  SubmitExclusivityReviewCommand,
  UpdateDriverWorkStateCommand,
  UpdateVehicleComplianceCommand,
  VehicleContractRecord,
  VehicleRegistryRecord,
} from "@drts/contracts";

import { ApiRequestError } from "../../common/api-envelope";
import {
  RegulatoryRegistryRepository,
  type PersistRegulatoryRegistryChanges,
  type RegulatorySupplyPair,
} from "./regulatory-registry.repository";

const EARTH_RADIUS_KM = 6371;
const AVERAGE_SPEED_KMH = 30;

type EtaDestination = {
  lat: number;
  lng: number;
};

const VEHICLE_SEED: VehicleRegistryRecord[] = [
  {
    vehicleId: "veh-demo-001",
    plateNo: "ABC-1001",
    operatingArea: "taichung-port",
    supportedServiceBuckets: ["standard_taxi", "business_dispatch"],
    dispatchableFlag: true,
    exclusivityApproved: true,
    insuranceStatus: "valid",
  },
  {
    vehicleId: "veh-demo-002",
    plateNo: "ABC-1002",
    operatingArea: "taichung-port",
    supportedServiceBuckets: ["standard_taxi"],
    dispatchableFlag: false,
    exclusivityApproved: false,
    insuranceStatus: "valid",
  },
  {
    vehicleId: "veh-demo-003",
    plateNo: "ABC-1003",
    operatingArea: "taichung-port",
    supportedServiceBuckets: ["standard_taxi"],
    dispatchableFlag: true,
    exclusivityApproved: true,
    insuranceStatus: "expired",
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
    @Optional()
    private readonly regulatoryRegistryRepository?: RegulatoryRegistryRepository,
  ) {}

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
        this.vehicles = persistedState.vehicles.map((vehicle) => ({
          ...vehicle,
        }));
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
          this.cloneContract(contract),
        );
      }
      if (persistedState.policies.length > 0) {
        this.policies = persistedState.policies.map((policy) =>
          this.clonePolicy(policy),
        );
      }
      if (persistedState.exclusivities.length > 0) {
        this.exclusivities = persistedState.exclusivities.map((exclusivity) =>
          this.cloneExclusivity(exclusivity),
        );
      }
    } catch (error) {
      this.regulatoryRegistryRepository.reportPersistenceFailure(
        error,
        "module init",
      );
    }
  }

  listVehicles() {
    return this.vehicles.map((vehicle) => ({ ...vehicle }));
  }

  listDrivers() {
    return this.drivers.map((driver) => ({ ...driver }));
  }

  async recordDriverLocation(
    command: DriverLocationHeartbeatCommand,
  ): Promise<{ success: true }> {
    this.assertNonBlank(command.driverId, "driverId");
    this.assertCoordinate(command.lat, "lat", -90, 90);
    this.assertCoordinate(command.lng, "lng", -180, 180);
    this.assertOptionalNonNegativeNumber(command.accuracyM, "accuracyM");
    this.requireDriver(command.driverId);

    await this.requireLocationRepository().upsertDriverLocation({
      driverId: command.driverId.trim(),
      lat: command.lat,
      lng: command.lng,
      ...(command.accuracyM === undefined
        ? {}
        : { accuracyM: command.accuracyM }),
    });

    const recordedAt = new Date().toISOString();
    this.setLatestDriverLocation({
      driverId: command.driverId.trim(),
      lat: command.lat,
      lng: command.lng,
      accuracyM: command.accuracyM ?? null,
      recordedAt,
      updatedAt: recordedAt,
    });

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
    return this.contracts.map((contract) => this.cloneContract(contract));
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
      approvedBy: null,
      approvedAt: null,
      createdAt: now,
      updatedAt: now,
    };

    this.contracts = [this.cloneContract(contract), ...this.contracts];
    this.persistChanges(
      {
        contracts: [this.cloneContract(contract)],
      },
      "create_contract",
    );

    return this.cloneContract(contract);
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

    this.persistChanges(
      {
        contracts: [this.cloneContract(contract)],
      },
      "activate_contract",
    );

    return this.cloneContract(contract);
  }

  listPolicies() {
    return this.policies.map((policy) => this.clonePolicy(policy));
  }

  listExpiringPolicies(windowDays = 30) {
    const now = Date.now();
    const cutoff = now + windowDays * 24 * 60 * 60 * 1000;

    return this.policies
      .filter((policy) => policy.status === "active")
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
      createdAt: now,
      updatedAt: now,
    };

    this.policies = [this.clonePolicy(policy), ...this.policies];
    this.persistChanges(
      {
        policies: [this.clonePolicy(policy)],
      },
      "create_insurance_policy",
    );

    return this.clonePolicy(policy);
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

    const vehicle = this.requireVehicle(policy.vehicleId);
    vehicle.insuranceStatus = policy.status === "active" ? "valid" : "expired";

    this.persistChanges(
      {
        policies: [this.clonePolicy(policy)],
        vehicles: [{ ...vehicle }],
      },
      "activate_insurance_policy",
    );

    return this.clonePolicy(policy);
  }

  listExclusivities() {
    return this.exclusivities.map((exclusivity) =>
      this.cloneExclusivity(exclusivity),
    );
  }

  submitExclusivityReview(
    vehicleId: string,
    command: SubmitExclusivityReviewCommand,
  ) {
    const vehicle = this.requireVehicle(vehicleId);
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

    this.exclusivities = [
      this.cloneExclusivity(exclusivity),
      ...this.exclusivities.filter(
        (candidate) => candidate.vehicleId !== vehicleId,
      ),
    ];
    vehicle.exclusivityApproved = false;
    this.persistChanges(
      {
        exclusivities: [this.cloneExclusivity(exclusivity)],
        vehicles: [{ ...vehicle }],
      },
      "submit_exclusivity_review",
    );

    return this.cloneExclusivity(exclusivity);
  }

  approveExclusivity(vehicleId: string, command: ApproveExclusivityCommand) {
    const vehicle = this.requireVehicle(vehicleId);
    const reviewedAt = command.reviewedAt ?? new Date().toISOString();
    const exclusivity = this.exclusivities.find(
      (candidate) => candidate.vehicleId === vehicleId,
    ) ?? {
      vehicleId,
      declarationStatus: "submitted",
      declarationFileId: null,
      reviewStatus: "draft" as const,
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

    this.exclusivities = [
      this.cloneExclusivity(exclusivity),
      ...this.exclusivities.filter(
        (candidate) => candidate.vehicleId !== vehicleId,
      ),
    ];
    vehicle.exclusivityApproved = true;
    this.persistChanges(
      {
        exclusivities: [this.cloneExclusivity(exclusivity)],
        vehicles: [{ ...vehicle }],
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
    Object.assign(vehicle, {
      dispatchableFlag: command.dispatchableFlag ?? vehicle.dispatchableFlag,
      exclusivityApproved:
        command.exclusivityApproved ?? vehicle.exclusivityApproved,
      insuranceStatus: command.insuranceStatus ?? vehicle.insuranceStatus,
    });
    this.persistChanges(
      {
        vehicles: [{ ...vehicle }],
      },
      "update_vehicle_compliance",
    );
    return { ...vehicle };
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
          vehicle.dispatchableFlag &&
          vehicle.exclusivityApproved &&
          vehicle.insuranceStatus === "valid" &&
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
    const vehicle = this.requireVehicle(vehicleId);
    return (
      vehicle.dispatchableFlag &&
      vehicle.exclusivityApproved &&
      vehicle.insuranceStatus === "valid" &&
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
