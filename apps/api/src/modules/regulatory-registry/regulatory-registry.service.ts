import { isDeepStrictEqual } from "node:util";
import { createHash, randomUUID } from "node:crypto";
import type { BootstrapRequestIdentity } from "../../common/auth/auth.types";
import {
  disclosureMissingFields,
  publicDisclosureRecord,
  type DisclosureSubjectType,
  type DisclosureRecord,
  type DisclosureReviewCommand,
  type DisclosureReviewDecision,
  type DisclosureReviewItem,
} from "./disclosure-review.types";

import {
  HttpStatus,
  Injectable,
  Logger,
  OnModuleDestroy,
  OnModuleInit,
  Optional,
} from "@nestjs/common";

import type {
  ActivateInsurancePolicyCommand,
  ActivateVehicleContractCommand,
  ApproveExclusivityCommand,
  AuditLogRecord,
  CompleteVehicleDebrandingCommand,
  CreateDriverMasterCommand,
  CreateInsurancePolicyCommand,
  CreateDriverProfileCommand,
  CreateVehicleContractCommand,
  DispatchExclusivityLifecycleStatus,
  DispatchExclusivityRecord,
  DriverDeclaredSurnameSnapshot,
  DriverEligibilityBlockReason,
  DriverEtaResponse,
  DriverLocationHeartbeatAck,
  DriverLocationHeartbeatBatchRequest,
  DriverLocationHeartbeatBatchResponse,
  DriverLocationHeartbeatEnvelope,
  DriverLocationHeartbeatCommand,
  DriverLocationFreshness,
  DriverLocationSnapshot,
  DriverTrackingStatus,
  DriverMasterLifecycleStatus,
  DriverRegistryRecord,
  InitiateVehicleOffboardingCommand,
  InsurancePolicyLifecycleStatus,
  InsurancePolicyRecord,
  Phase1ServiceBucket,
  RejectExclusivityCommand,
  SupplyDispatchBlockReason,
  SupplyDocumentRecord,
  SupplyLifecycleTraceRecord,
  SupplySubmissionRecord,
  SubmitExclusivityReviewCommand,
  UpdateDriverLicensesCommand,
  UpdateDriverMasterLifecycleCommand,
  UpdateDriverServiceBucketsCommand,
  UpdateDriverWorkStateCommand,
  UpdateVehicleComplianceCommand,
  VehicleContractLifecycleStatus,
  VehicleContractRecord,
  VehicleFleetAffiliationRecord,
  VehicleFleetAffiliationType,
  VehicleLicenseType,
  VehicleRegistryRecord,
  VehicleSupplyDraft,
  VehicleSupplyLifecycleRecord,
  DriverSupplyDraft,
  VehiclePassengerDisclosureProfile,
  DriverPublicRegistrationCredential,
} from "@drts/contracts";

import { PHASE1_SERVICE_BUCKETS } from "@drts/contracts";

import { ApiRequestError } from "../../common/api-envelope";
import {
  LIVE_MAP_FIXTURE_DRIVER_ID,
  isIsolatedLiveMapFixture,
  type LiveMapFixtureResult,
} from "./live-map-fixture";
import { OpsDispatchEventsService } from "../../common/ops-dispatch-events.service";
import { AuditNotificationService } from "../audit-notification/audit-notification.service";
import { DriverProfileService } from "../driver-profile/driver-profile.service";
import { AcademyService } from "../driver-academy/academy.service";
import { NotificationDeliveryService } from "../notification-delivery/notification-delivery.service";
import {
  RegulatoryRegistryRepository,
  RegulatoryCommandCommitUncertainError,
  PREEXPIRY_CREDENTIAL_FIELDS,
  parsePreexpiryCredentialFamily,
  parsePreexpiryRecordFamily,
  type RegulatoryRegistryQueryExecutor,
  type RegulatoryVehicleCommandState,
  type DriverHeartbeatEventSnapshot,
  type PersistRegulatoryRegistryChanges,
  type RegulatorySupplyPair,
  type ExpiryEntityType,
  type ExpiryEventStatus,
  type DeliveryIntentStatus,
  type RegistryExpiryEventRow,
  type RegistryExpiryDeliveryIntentRow,
  type RegistryExpiryEventWithIntent,
} from "./regulatory-registry.repository";

const EARTH_RADIUS_KM = 6371;
const AVERAGE_SPEED_KMH = 30;
const SEED_TIMESTAMP = "2026-01-01T00:00:00.000Z";

type EtaDestination = {
  lat: number;
  lng: number;
};

type DriverHeartbeatContext = DriverHeartbeatEventSnapshot;

type ProvisionFromSubmissionCommand = {
  submission: SupplySubmissionRecord;
  /** Resolved by the normal reviewer from the same fleet, never a client ID. */
  referencedDriverSubmission?: SupplySubmissionRecord | null;
  driverDraft: DriverSupplyDraft | null;
  vehicleDraft: VehicleSupplyDraft | null;
  documents: SupplyDocumentRecord[];
  approvedAt: string;
  reviewerId: string;
};

export type ProvisionedCanonicalRecordIds = {
  canonicalDriverId: string | null;
  canonicalVehicleId: string | null;
  canonicalContractId: string | null;
  canonicalPolicyId: string | null;
};

export type SubmissionProvisioningResult = ProvisionedCanonicalRecordIds & {
  vehicleAffiliation: VehicleFleetAffiliationRecord | null;
  supplyPair: RegulatorySupplyPair | null;
};

export type ReconcileExpiryCommand = {
  asOf?: string | undefined;
  scope?: string | undefined;
  limit?: number | undefined;
};

export type ReconcileExpiryResult = {
  preexpiry?: {
    eventsCreated: number;
    intentsCreated: number;
    recipientStatus: "configured" | "unavailable";
    deliveryStatus: "available" | "unavailable";
  };
  asOf: string;
  scope: string;
  scannedDrivers: number;
  scannedPolicies: number;
  expiredEventsCreated: number;
  expiredEventsSuperseded: number;
  deliveryIntentsCreated: number;
  deliveryIntentsEnqueued: number;
  events: RegistryExpiryEventWithIntent[];
};

function areDriverLicensesValid(
  driver: DriverRegistryRecord,
  referenceDateMs: number = Date.now(),
): boolean {
  if (driver.licensesValid === false) {
    return false;
  }
  const dates = [
    driver.licenseExpiry,
    driver.professionalDriverLicenseExpiry,
    driver.taxiDriverRegistrationExpiry,
  ];
  for (const d of dates) {
    if (d) {
      const time = Date.parse(d);
      if (!Number.isNaN(time) && time <= referenceDateMs) {
        return false;
      }
    }
  }
  return true;
}

function createSeedDriver(
  input: Pick<
    DriverRegistryRecord,
    | "driverId"
    | "name"
    | "supportedServiceBuckets"
    | "workState"
    | "licensesValid"
  > & {
    licenseExpiry?: string | null;
    professionalDriverLicenseExpiry?: string | null;
    taxiDriverRegistrationExpiry?: string | null;
  },
): DriverRegistryRecord {
  const licenseExpiry = input.licenseExpiry ?? "2027-12-31T23:59:59.000Z";
  const professionalDriverLicenseExpiry =
    input.professionalDriverLicenseExpiry ?? "2027-12-31T23:59:59.000Z";
  const taxiDriverRegistrationExpiry =
    input.taxiDriverRegistrationExpiry ?? "2027-12-31T23:59:59.000Z";
  const lifecycleStatus: DriverMasterLifecycleStatus =
    input.workState === "suspended" ? "suspended" : "active";
  const eligibilityBlockedReasons: DriverEligibilityBlockReason[] = [];
  if (lifecycleStatus !== "active") {
    eligibilityBlockedReasons.push("lifecycle_suspended");
  }
  if (!input.licensesValid) {
    eligibilityBlockedReasons.push("licenses_invalid");
  }
  if (input.workState !== "available") {
    eligibilityBlockedReasons.push(
      `work_state_${input.workState}` as DriverEligibilityBlockReason,
    );
  }

  return {
    ...input,
    licenseExpiry,
    professionalDriverLicenseExpiry,
    taxiDriverRegistrationExpiry,
    lifecycleStatus,
    eligibilityBlockedReasons,
    dispatchEligible: eligibilityBlockedReasons.length === 0,
    createdAt: SEED_TIMESTAMP,
    updatedAt: SEED_TIMESTAMP,
    activatedAt: lifecycleStatus === "active" ? SEED_TIMESTAMP : null,
    suspendedAt: lifecycleStatus === "suspended" ? SEED_TIMESTAMP : null,
    retiredAt: null,
    profileUpdatedAt: null,
    deviceBindings: [],
  };
}

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
  };
}

const VEHICLE_SEED: VehicleRegistryRecord[] = [
  {
    vehicleId: "veh-demo-001",
    plateNo: "ABC-1001",
    licenseType: "multi_purpose_taxi",
    operatingArea: "taichung-port",
    supportedServiceBuckets: ["standard_taxi", "business_dispatch"],
    dispatchableFlag: true,
    exclusivityApproved: true,
    insuranceStatus: "valid",
    createdAt: SEED_TIMESTAMP,
    updatedAt: SEED_TIMESTAMP,
    supplyLifecycle: createEmptySupplyLifecycle(SEED_TIMESTAMP),
  },
  {
    vehicleId: "veh-demo-002",
    plateNo: "ABC-1002",
    licenseType: "taxi",
    operatingArea: "taichung-port",
    supportedServiceBuckets: ["standard_taxi"],
    dispatchableFlag: false,
    exclusivityApproved: false,
    insuranceStatus: "valid",
    createdAt: SEED_TIMESTAMP,
    updatedAt: SEED_TIMESTAMP,
    supplyLifecycle: createEmptySupplyLifecycle(SEED_TIMESTAMP),
  },
  {
    vehicleId: "veh-demo-003",
    plateNo: "ABC-1003",
    licenseType: "taxi",
    operatingArea: "taichung-port",
    supportedServiceBuckets: ["standard_taxi"],
    dispatchableFlag: true,
    exclusivityApproved: true,
    insuranceStatus: "expired",
    createdAt: SEED_TIMESTAMP,
    updatedAt: "2026-03-31T23:59:59.000Z",
    supplyLifecycle: createEmptySupplyLifecycle("2026-03-31T23:59:59.000Z"),
  },
  {
    vehicleId: "veh-demo-004",
    plateNo: "ABC-1004",
    licenseType: "business_vehicle",
    operatingArea: "taichung-port",
    supportedServiceBuckets: ["business_dispatch"],
    dispatchableFlag: true,
    exclusivityApproved: true,
    insuranceStatus: "valid",
    createdAt: SEED_TIMESTAMP,
    updatedAt: SEED_TIMESTAMP,
    supplyLifecycle: createEmptySupplyLifecycle(SEED_TIMESTAMP),
  },
  {
    vehicleId: "veh-av-demo-001",
    plateNo: "ABC-AV01",
    licenseType: "business_vehicle",
    operatingArea: "taichung-port",
    supportedServiceBuckets: ["business_dispatch"],
    dispatchableFlag: true,
    exclusivityApproved: true,
    insuranceStatus: "valid",
    createdAt: SEED_TIMESTAMP,
    updatedAt: SEED_TIMESTAMP,
    supplyLifecycle: createEmptySupplyLifecycle(SEED_TIMESTAMP),
  },
];

const DRIVER_SEED: DriverRegistryRecord[] = [
  createSeedDriver({
    driverId: "drv-demo-001",
    name: "Driver Demo One",
    supportedServiceBuckets: ["standard_taxi", "business_dispatch"],
    workState: "available",
    licensesValid: true,
  }),
  createSeedDriver({
    driverId: "drv-demo-002",
    name: "Driver Demo Two",
    supportedServiceBuckets: ["standard_taxi"],
    workState: "offline",
    licensesValid: true,
  }),
  createSeedDriver({
    driverId: "drv-demo-003",
    name: "Driver Demo Three",
    supportedServiceBuckets: ["standard_taxi"],
    workState: "available",
    licensesValid: false,
  }),
  createSeedDriver({
    driverId: "drv-demo-004",
    name: "Driver Demo Four",
    supportedServiceBuckets: ["business_dispatch"],
    workState: "available",
    licensesValid: true,
  }),
  createSeedDriver({
    driverId: "safety-op-001",
    name: "Safety Operator Demo One",
    supportedServiceBuckets: ["business_dispatch"],
    workState: "available",
    licensesValid: true,
  }),
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
  {
    contractId: "contract-demo-004",
    vehicleId: "veh-demo-004",
    partnerId: "partner-demo-004",
    partnerType: "enterprise_partner",
    contractType: "service_fleet_contract",
    operatingAreaId: "taichung-port",
    serviceScope: "business_dispatch",
    startAt: "2026-01-01T00:00:00.000Z",
    endAt: "2026-12-31T23:59:59.000Z",
    status: "active",
    lifecycleStatus: "active",
    approvedBy: "platform-admin-demo-001",
    approvedAt: "2026-01-01T00:00:00.000Z",
    createdAt: "2026-01-01T00:00:00.000Z",
    updatedAt: "2026-01-01T00:00:00.000Z",
  },
  {
    contractId: "contract-av-demo-001",
    vehicleId: "veh-av-demo-001",
    partnerId: "partner-demo-004",
    partnerType: "enterprise_partner",
    contractType: "service_fleet_contract",
    operatingAreaId: "taichung-port",
    serviceScope: "business_dispatch",
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
  {
    policyId: "policy-demo-004",
    vehicleId: "veh-demo-004",
    policyNo: "POL-BIZ-0004",
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
    policyId: "policy-av-demo-001",
    vehicleId: "veh-av-demo-001",
    policyNo: "POL-BIZ-AV01",
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
  {
    vehicleId: "veh-demo-004",
    declarationStatus: "submitted",
    declarationFileId: "file-demo-004",
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
    vehicleId: "veh-av-demo-001",
    declarationStatus: "submitted",
    declarationFileId: "file-av-demo-001",
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
];

@Injectable()
export class RegulatoryRegistryService
  implements OnModuleInit, OnModuleDestroy
{
  private readonly logger = new Logger(RegulatoryRegistryService.name);
  private expiryReconciliationTimer: NodeJS.Timeout | null = null;
  private expiryReconciliationInFlight: Promise<unknown> | null = null;
  private reconciledEvaluationTime: string | null = null;

  private getEffectiveEvaluationTime(explicit?: string): string {
    if (explicit) return explicit;
    if (this.reconciledEvaluationTime) {
      return this.reconciledEvaluationTime;
    }
    return new Date().toISOString();
  }

  registerFleetPartnerContacts(
    partnerId: string,
    emails: readonly string[] | string,
  ): string[] {
    return (
      this.regulatoryRegistryRepository?.setFleetPartnerContacts(
        partnerId,
        emails,
      ) ?? []
    );
  }

  getFleetPartnerContacts(partnerId: string): string[] {
    return (
      this.regulatoryRegistryRepository?.getFleetPartnerContacts(partnerId) ??
      []
    );
  }

  private vehicles = VEHICLE_SEED.map((vehicle) => ({ ...vehicle }));

  private drivers = DRIVER_SEED.map((driver) => ({ ...driver }));

  // Preserve duplicate-create rejection while the linked profile save awaits.
  private readonly pendingDriverCreations = new Set<string>();

  // The four master commands build their snapshot from the last committed
  // row, after the preceding command's storage ACK (or rejection).
  private readonly driverMasterWrites = new Map<string, Promise<void>>();

  private readonly driverWorkStateChanges = new Map<
    string,
    Pick<DriverRegistryRecord, "workState" | "updatedAt"> & { revision: number }
  >();

  private latestDriverLocations = new Map<string, DriverLocationSnapshot>();

  private latestDriverHeartbeatUploads = new Map<
    string,
    Pick<
      DriverHeartbeatContext,
      | "eventId"
      | "deviceId"
      | "driverId"
      | "sequenceNo"
      | "recordedAt"
      | "receivedAt"
    >
  >();

  private currentDriverHeartbeatContexts = new Map<
    string,
    DriverHeartbeatContext
  >();

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
    {
      vehicleId: "veh-demo-004",
      driverId: "drv-demo-004",
      etaMinutes: 9,
    },
    {
      vehicleId: "veh-av-demo-001",
      driverId: "safety-op-001",
      etaMinutes: 9,
    },
  ];

  private contracts = CONTRACT_SEED.map((contract) =>
    this.cloneContract(contract),
  );

  private readonly finalExitWrites = new Map<string, Promise<unknown>>();

  private policies = POLICY_SEED.map((policy) => this.clonePolicy(policy));

  private exclusivities = EXCLUSIVITY_SEED.map((exclusivity) =>
    this.cloneExclusivity(exclusivity),
  );

  private disclosureProfiles: VehiclePassengerDisclosureProfile[] = [];

  private driverCredentials: DriverPublicRegistrationCredential[] = [];

  constructor(
    private readonly opsDispatchEventsService: OpsDispatchEventsService,
    private readonly auditNotificationService: AuditNotificationService,
    private readonly driverProfileService: DriverProfileService,
    @Optional()
    private readonly regulatoryRegistryRepository?: RegulatoryRegistryRepository,
    @Optional()
    private readonly notificationDeliveryService?: NotificationDeliveryService,
    @Optional()
    private readonly academyService?: AcademyService,
  ) {
    if (!this.regulatoryRegistryRepository) {
      this.regulatoryRegistryRepository = new RegulatoryRegistryRepository();
    }
    this.reconcileSupplyLifecycleForAll({
      emitEvent: false,
      persistContext: null,
    });
  }

  async onModuleInit() {
    if (!this.regulatoryRegistryRepository) {
      return;
    }

    let liveMapFixtureReady = false;
    try {
      const latestDriverLocations =
        (await this.regulatoryRegistryRepository.listLatestDriverLocations?.()) ??
        [];
      this.replaceLatestDriverLocations(latestDriverLocations);

      if (this.regulatoryRegistryRepository.isEnabled()) {
        await this.regulatoryRegistryRepository.runIdempotentBackfill?.();
      } else {
        this.runInMemoryIdempotentBackfill();
      }

      // The opted-in dev acceptance fixture is a convenience, never a startup
      // dependency: ensureLiveMapTestDriver resolves to "refused" rather than
      // throwing, so a refusal or failure here only gets recorded (it already
      // logs its own reason) and the test driver stays marked unavailable.
      const liveMapFixture: LiveMapFixtureResult | undefined =
        await this.regulatoryRegistryRepository.ensureLiveMapTestDriver?.();
      liveMapFixtureReady =
        liveMapFixture?.status === "created" ||
        liveMapFixture?.status === "unchanged";
      const persistedState =
        await this.regulatoryRegistryRepository.loadState();
      if (liveMapFixtureReady) {
        const fixtures = persistedState.drivers.filter(
          (driver) => driver.driverId === LIVE_MAP_FIXTURE_DRIVER_ID,
        );
        if (
          fixtures.length !== 1 ||
          !isIsolatedLiveMapFixture(fixtures[0]) ||
          persistedState.supplyPairs.some(
            (pair) => pair.driverId === LIVE_MAP_FIXTURE_DRIVER_ID,
          )
        ) {
          this.logger.warn("LIVE_MAP_FIXTURE_READBACK_UNSAFE");
          liveMapFixtureReady = false;
        }
      }
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
      if (
        persistedState.supplyPairs.length === 0 &&
        (liveMapFixture?.status === "created" ||
          liveMapFixture?.status === "unchanged")
      ) {
        // The durable check proved this fixture has no supply pair. Do not
        // invent one from the demo fallback when the stored pair list is empty.
        this.supplyPairs = this.supplyPairs.filter(
          (pair) => pair.driverId !== LIVE_MAP_FIXTURE_DRIVER_ID,
        );
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
      if (
        persistedState.disclosureProfiles &&
        persistedState.disclosureProfiles.length > 0
      ) {
        this.disclosureProfiles = persistedState.disclosureProfiles.map(
          (profile) => ({ ...profile }),
        );
      }
      if (
        persistedState.driverCredentials &&
        persistedState.driverCredentials.length > 0
      ) {
        this.driverCredentials = persistedState.driverCredentials.map(
          (cred) => ({ ...cred }),
        );
      }
      this.reconcileSupplyLifecycleForAll({
        emitEvent: false,
        persistContext: null,
      });

      // Bounded startup catch-up for expired credentials and policies
      try {
        if (
          typeof (this.regulatoryRegistryRepository as any)
            ?.scanExpiredDrivers === "function" &&
          typeof (this.regulatoryRegistryRepository as any)?.withTransaction ===
            "function"
        ) {
          await this.reconcileExpiredCredentials({ limit: 100 });
        }
      } catch (err) {
        this.logger.warn(
          `Startup credential expiry catch-up skipped or failed: ${err instanceof Error ? err.message : String(err)}`,
        );
      }

      if (
        process.env.NODE_ENV !== "test" &&
        process.env.ENABLE_EXPIRY_RECONCILIATION_LOOP === "true"
      ) {
        this.startExpiryReconciliationLoop();
      }
    } catch (error) {
      this.regulatoryRegistryRepository.reportPersistenceFailure?.(
        error,
        "module init",
      );
    }
  }

  async onModuleDestroy() {
    if (this.expiryReconciliationTimer) {
      clearInterval(this.expiryReconciliationTimer);
      this.expiryReconciliationTimer = null;
    }
    if (this.expiryReconciliationInFlight) {
      try {
        await this.expiryReconciliationInFlight;
      } catch {
        // ignore
      }
    }
  }

  private startExpiryReconciliationLoop() {
    if (this.expiryReconciliationTimer) return;
    const intervalMs =
      Number(process.env.EXPIRY_RECONCILIATION_INTERVAL_MS) || 60_000;
    this.expiryReconciliationTimer = setInterval(() => {
      if (this.expiryReconciliationInFlight) return;
      this.expiryReconciliationInFlight = this.reconcileExpiredCredentials({
        limit: 100,
      })
        .catch((err) => {
          this.logger.warn(
            `Periodic credential expiry reconciliation failed: ${err instanceof Error ? err.message : String(err)}`,
          );
        })
        .finally(() => {
          this.expiryReconciliationInFlight = null;
        });
    }, intervalMs);
    this.expiryReconciliationTimer.unref?.();
  }

  listVehicles() {
    this.reconcileSupplyLifecycleForAll({
      emitEvent: false,
      persistContext: null,
    });
    return this.vehicles.map((vehicle) => this.cloneVehicle(vehicle));
  }

  getVehicleLicenseType(vehicleId: string): VehicleLicenseType | null {
    const vehicle = this.vehicles.find(
      (candidateVehicle) => candidateVehicle.vehicleId === vehicleId,
    );
    return this.normalizeVehicleLicenseType(vehicle?.licenseType);
  }

  listDrivers() {
    return this.drivers.map((driver) =>
      this.cloneDriver(this.decorateDriver(driver)),
    );
  }

  listSupplyPairs() {
    return this.supplyPairs.map((pair) => ({ ...pair }));
  }

  async prepareDriverAuthority(driverId: string) {
    const repository = this.regulatoryRegistryRepository;
    if (!repository?.isEnabled()) return;
    await this.driverMasterWrites.get(driverId);
    const driver = await repository.lockDriver(driverId);
    this.drivers = this.drivers.filter((d) => d.driverId !== driverId);
    if (driver) this.drivers.unshift(driver);
    // Missing/error never falls back to the startup snapshot.
    this.requireDriver(driverId);
  }

  private matchingSuppressions = new Map<
    string,
    import("@drts/contracts").DriverMatchingSuppression[]
  >();

  prepareMatchingSuppressions(driverId?: string) {
    if (!this.regulatoryRegistryRepository?.isEnabled()) return;
    return this.regulatoryRegistryRepository
      .loadDriverMatchingSuppressions(driverId)
      .then((rows) => this.applyMatchingSuppressions(rows, driverId));
  }

  private applyMatchingSuppressions(
    rows: {
      driver_id: string;
      record: import("@drts/contracts").DriverMatchingSuppression;
    }[],
    driverId?: string,
  ) {
    if (driverId) this.matchingSuppressions.delete(driverId);
    else this.matchingSuppressions.clear();
    for (const row of rows) {
      const list = this.matchingSuppressions.get(row.driver_id) ?? [];
      list.push({ ...row.record });
      this.matchingSuppressions.set(row.driver_id, list);
    }
  }

  hasActiveMatchingSuppression(driverId: string, at = Date.now()) {
    return (this.matchingSuppressions.get(driverId) ?? []).some(
      (hold) =>
        hold.active &&
        hold.liftedAt === null &&
        Date.parse(hold.expiresAt) > at,
    );
  }

  assertCurrentMatchingSuppressionClear(
    driverId: string,
    executor?: Pick<import("../../common/db").DatabaseService, "query">,
  ) {
    const assertClear = () => {
      if (this.hasActiveMatchingSuppression(driverId))
        throw new ApiRequestError(
          HttpStatus.CONFLICT,
          "ELIGIBILITY_CHANGED_BEFORE_ASSIGNMENT",
          "Driver has an active incident matching suppression.",
          { driverId, reasonCodes: ["INCIDENT_MATCHING_SUPPRESSION"] },
        );
    };
    if (!this.regulatoryRegistryRepository?.isEnabled()) return assertClear();
    const read = executor
      ? this.regulatoryRegistryRepository.lockDriverMatchingAuthority(
          driverId,
          executor,
        )
      : this.regulatoryRegistryRepository.loadDriverMatchingSuppressions(
          driverId,
        );
    return read.then((rows) => {
      this.applyMatchingSuppressions(rows, driverId);
      assertClear();
    });
  }

  async prepareDispatchSupply(serviceBucket: Phase1ServiceBucket) {
    const repository = this.regulatoryRegistryRepository;
    if (!repository?.isEnabled()) return;
    await this.prepareMatchingSuppressions();
    await Promise.all(
      this.drivers
        .filter((d) => d.supportedServiceBuckets.includes(serviceBucket))
        .map((d) => this.driverMasterWrites.get(d.driverId)),
    );
    const { state, locations } =
      await repository.findDispatchSupplyContext(serviceBucket);
    const vehicleIds = new Set([
      ...this.vehicles
        .filter((v) => v.supportedServiceBuckets.includes(serviceBucket))
        .map((v) => v.vehicleId),
      ...state.vehicles.map((v) => v.vehicleId),
    ]);
    const driverIds = new Set([
      ...this.supplyPairs
        .filter((p) => vehicleIds.has(p.vehicleId))
        .map((p) => p.driverId),
      ...state.drivers.map((d) => d.driverId),
    ]);
    const vehicles = <T extends { vehicleId: string }>(
      current: T[],
      committed: T[],
    ) => [...committed, ...current.filter((r) => !vehicleIds.has(r.vehicleId))];
    const drivers = <T extends { driverId: string }>(
      current: T[],
      committed: T[],
    ) => [...committed, ...current.filter((r) => !driverIds.has(r.driverId))];
    this.vehicles = vehicles(
      this.vehicles,
      state.vehicles.map((v) => this.hydrateVehicleRecord(v)),
    );
    this.drivers = drivers(this.drivers, state.drivers);
    this.supplyPairs = vehicles(this.supplyPairs, state.supplyPairs);
    this.contracts = vehicles(
      this.contracts,
      state.contracts.map((c) => this.hydrateContract(c)),
    );
    this.policies = vehicles(
      this.policies,
      state.policies.map((p) => this.hydratePolicy(p)),
    );
    this.exclusivities = vehicles(
      this.exclusivities,
      state.exclusivities.map((e) => this.hydrateExclusivity(e)),
    );
    this.disclosureProfiles = vehicles(
      this.disclosureProfiles,
      state.disclosureProfiles,
    );
    this.driverCredentials = drivers(
      this.driverCredentials,
      state.driverCredentials,
    );
    for (const driverId of driverIds)
      this.latestDriverLocations.delete(driverId);
    for (const location of locations) this.applyLatestDriverLocation(location);
  }

  async updateDriverWorkStateFromPersistence(
    driverId: string,
    command: UpdateDriverWorkStateCommand,
  ) {
    await this.prepareDriverAuthority(driverId);
    const { updated, save } = this.setDriverWorkState(driverId, command);
    await save;
    return updated;
  }

  listLatestDriverLocations() {
    return Array.from(this.latestDriverLocations.values()).map((location) =>
      this.cloneDriverLocation(location),
    );
  }

  async provisionFromSubmission(
    executor: RegulatoryRegistryQueryExecutor | null,
    command: ProvisionFromSubmissionCommand,
  ): Promise<SubmissionProvisioningResult> {
    const current = command.submission;
    const pairedDriverId = await this.resolveApprovedSubmissionDriver(
      executor,
      command,
    );
    if (
      current.canonicalDriverId ||
      current.canonicalVehicleId ||
      current.canonicalContractId ||
      current.canonicalPolicyId
    ) {
      const supplyPair = await this.provisionApprovedSupplyPair(
        executor,
        current.canonicalVehicleId,
        pairedDriverId,
      );
      if (supplyPair) {
        await this.persistProvisionedSupplyPair(executor, supplyPair);
      }
      return {
        canonicalDriverId: current.canonicalDriverId,
        canonicalVehicleId: current.canonicalVehicleId,
        canonicalContractId: current.canonicalContractId,
        canonicalPolicyId: current.canonicalPolicyId,
        vehicleAffiliation: null,
        supplyPair,
      };
    }

    const changes: PersistRegulatoryRegistryChanges = {};
    const canonicalDriver = command.driverDraft
      ? this.provisionDriverFromDraft(command.driverDraft, command.approvedAt)
      : null;
    if (canonicalDriver) {
      changes.drivers = [this.cloneDriver(canonicalDriver)];
    }

    const canonicalVehicle = command.vehicleDraft
      ? this.provisionVehicleFromDraft(command.vehicleDraft, command.approvedAt)
      : null;
    if (canonicalVehicle) {
      changes.vehicles = [this.cloneVehicle(canonicalVehicle)];
    }

    const contract = canonicalVehicle
      ? this.provisionContractFromDocuments(
          canonicalVehicle.vehicleId,
          command,
          command.approvedAt,
        )
      : null;
    if (contract) {
      changes.contracts = [this.cloneContract(contract)];
    }

    const policy = canonicalVehicle
      ? this.provisionPolicyFromDocuments(
          canonicalVehicle.vehicleId,
          command,
          command.approvedAt,
        )
      : null;
    if (policy) {
      changes.policies = [this.clonePolicy(policy)];
    }

    const resolvedCanonicalDriverId =
      canonicalDriver?.driverId ?? current.subjectDriverId ?? null;
    const resolvedCanonicalVehicleId =
      canonicalVehicle?.vehicleId ?? current.subjectVehicleId ?? null;
    const supplyPair = await this.provisionApprovedSupplyPair(
      executor,
      resolvedCanonicalVehicleId,
      pairedDriverId,
    );
    if (supplyPair) changes.supplyPairs = [supplyPair];

    let disclosureProfile: VehiclePassengerDisclosureProfile | null = null;
    if (command.vehicleDraft && resolvedCanonicalVehicleId) {
      const draft = command.vehicleDraft;
      if (
        !draft.brand ||
        !draft.model ||
        draft.modelYear === null ||
        draft.doorCount === null
      ) {
        throw new ApiRequestError(
          HttpStatus.BAD_REQUEST,
          "DISCLOSURE_PROFILE_MISSING_REQUIRED_FIELDS",
          "Vehicle brand, model, modelYear, and doorCount are required to provision the passenger disclosure profile.",
        );
      }
      disclosureProfile = {
        vehicleId: resolvedCanonicalVehicleId,
        make: draft.brand.trim(),
        model: draft.model.trim(),
        modelYear: draft.modelYear,
        doorCount: draft.doorCount,
        color: draft.color ? draft.color.trim() : null,
        status: "complete",
        missingFieldCodes: [],
        verifiedByActorId: command.reviewerId,
        verifiedAt: command.approvedAt,
        sourceSubmissionId: current.submissionId,
        version: 1,
        updatedAt: command.approvedAt,
      };
      changes.disclosureProfiles = [disclosureProfile];

      this.disclosureProfiles = [
        ...this.disclosureProfiles.filter(
          (p) => p.vehicleId !== resolvedCanonicalVehicleId,
        ),
        disclosureProfile,
      ];
    }

    let driverCredential: DriverPublicRegistrationCredential | null = null;
    if (command.driverDraft && resolvedCanonicalDriverId) {
      const draft = command.driverDraft;
      const registrationNo = draft.taxiDriverRegistrationNo;
      const maskedDisplay =
        registrationNo.length <= 4
          ? "***"
          : `${registrationNo.slice(0, 2)}***${registrationNo.slice(-2)}`;
      driverCredential = {
        driverId: resolvedCanonicalDriverId,
        registrationNo: registrationNo,
        registrationArea: draft.taxiDriverRegistrationArea,
        effectiveFrom: null,
        effectiveUntil: draft.taxiDriverRegistrationExpiry,
        status: "unverified",
        maskedDisplay,
        verifiedByActorId: null,
        verifiedAt: null,
        sourceSubmissionId: current.submissionId,
        version: 1,
        updatedAt: command.approvedAt,
      };
      changes.driverCredentials = [driverCredential];

      this.driverCredentials = [
        ...this.driverCredentials.filter(
          (c) => c.driverId !== resolvedCanonicalDriverId,
        ),
        driverCredential,
      ];
    }

    const vehicleAffiliation = resolvedCanonicalVehicleId
      ? this.createVehicleFleetAffiliation(
          resolvedCanonicalVehicleId,
          command,
          command.approvedAt,
        )
      : null;

    if (
      resolvedCanonicalVehicleId &&
      this.vehicles.some(
        (candidate) => candidate.vehicleId === resolvedCanonicalVehicleId,
      )
    ) {
      const reconciledVehicle = this.reconcileVehicleLifecycle(
        resolvedCanonicalVehicleId,
        {
          entityType: "vehicle",
          message:
            "Vehicle canonical state provisioned from approved submission.",
          occurredAt: command.approvedAt,
          relatedEntityId: current.submissionId,
          emitEvent: false,
          persistContext: null,
          touchUpdatedAt: true,
        },
      );
      changes.vehicles = [this.cloneVehicle(reconciledVehicle)];
    }

    if (Object.keys(changes).length > 0) {
      if (executor && this.regulatoryRegistryRepository?.isEnabled()) {
        await this.regulatoryRegistryRepository.persistChangesWithExecutor(
          executor,
          changes,
        );
      } else {
        this.persistChanges(changes, "provision_from_submission");
      }
    }

    return {
      canonicalDriverId: resolvedCanonicalDriverId,
      canonicalVehicleId: resolvedCanonicalVehicleId,
      canonicalContractId: contract?.contractId ?? null,
      canonicalPolicyId: policy?.policyId ?? null,
      vehicleAffiliation,
      supplyPair,
    };
  }

  private async resolveApprovedSubmissionDriver(
    executor: RegulatoryRegistryQueryExecutor | null,
    command: ProvisionFromSubmissionCommand,
  ): Promise<string | null> {
    const reference = command.vehicleDraft?.currentDriverSubmissionId;
    if (!reference) return null;
    const driverSubmission = command.referencedDriverSubmission;
    const invalid = () =>
      new ApiRequestError(
        HttpStatus.CONFLICT,
        "APPROVED_DRIVER_REFERENCE_INVALID",
        "The vehicle requires an approved driver submission in the same fleet.",
      );
    if (
      !driverSubmission ||
      driverSubmission.submissionId !== reference ||
      driverSubmission.fleetPartnerId !== command.submission.fleetPartnerId ||
      driverSubmission.submissionType !== "driver_onboarding" ||
      driverSubmission.status !== "approved" ||
      !driverSubmission.canonicalDriverId
    )
      throw invalid();
    const driverId = driverSubmission.canonicalDriverId;
    if (this.regulatoryRegistryRepository?.isEnabled() && !executor) {
      throw new ApiRequestError(
        HttpStatus.SERVICE_UNAVAILABLE,
        "SUPPLY_APPROVAL_TRANSACTION_REQUIRED",
        "A persisted driver reference requires the approval transaction.",
      );
    }
    const driver = this.regulatoryRegistryRepository?.isEnabled()
      ? await this.regulatoryRegistryRepository.lockDriverForApproval(
          driverId,
          executor!,
        )
      : this.drivers.find((row) => row.driverId === driverId);
    if (!driver) throw invalid();
    return driverId;
  }

  private async provisionApprovedSupplyPair(
    executor: RegulatoryRegistryQueryExecutor | null,
    vehicleId: string | null,
    driverId: string | null,
  ): Promise<RegulatorySupplyPair | null> {
    if (!vehicleId || !driverId) return null;
    const existing =
      executor && this.regulatoryRegistryRepository?.isEnabled()
        ? await this.regulatoryRegistryRepository.findSupplyPairWithExecutor(
            executor,
            vehicleId,
            driverId,
          )
        : this.supplyPairs.find(
            (pair) =>
              pair.vehicleId === vehicleId && pair.driverId === driverId,
          );
    return existing
      ? { ...existing }
      : { vehicleId, driverId, etaMinutes: null };
  }

  private async persistProvisionedSupplyPair(
    executor: RegulatoryRegistryQueryExecutor | null,
    pair: RegulatorySupplyPair,
  ) {
    if (executor && this.regulatoryRegistryRepository?.isEnabled()) {
      await this.regulatoryRegistryRepository.persistChangesWithExecutor(
        executor,
        { supplyPairs: [pair] },
      );
    } else {
      this.persistChanges({ supplyPairs: [pair] }, "provision_supply_pair");
    }
  }

  /** The review caller invokes this only after its approval commit succeeds. */
  publishCommittedSupplyPair(pair: RegulatorySupplyPair | null) {
    if (!pair) return;
    this.supplyPairs = [
      { ...pair },
      ...this.supplyPairs.filter(
        (current) =>
          current.vehicleId !== pair.vehicleId ||
          current.driverId !== pair.driverId,
      ),
    ];
  }

  recordVehicleFleetAffiliationCreated(
    affiliation: VehicleFleetAffiliationRecord,
    reviewerId: string,
    requestId?: string,
  ) {
    this.recordAudit(
      {
        actorId: reviewerId,
        actorType: "platform_admin",
        tenantId: null,
        moduleName: "regulatory-registry",
        actionName: "create_vehicle_fleet_affiliation",
        resourceType: "vehicle_fleet_affiliation",
        resourceId: affiliation.affiliationId,
        newValuesSummary:
          this.buildVehicleFleetAffiliationAuditSummary(affiliation),
      },
      requestId,
    );
  }

  async createDriver(command: CreateDriverMasterCommand, requestId?: string) {
    const driverId = command.driverId?.trim() || `drv_${randomUUID()}`;
    this.assertNonBlank(driverId, "driverId");
    if (
      this.pendingDriverCreations.has(driverId) ||
      this.drivers.some((candidate) => candidate.driverId === driverId)
    ) {
      throw new ApiRequestError(
        HttpStatus.CONFLICT,
        "DRIVER_ALREADY_EXISTS",
        "A driver master record already exists for this driver.",
        { driverId },
      );
    }

    this.assertNonBlank(command.name, "name");
    const lifecycleStatus = command.lifecycleStatus ?? "draft";
    const now = new Date().toISOString();
    const created = this.decorateDriver({
      driverId,
      name: command.name.trim(),
      supportedServiceBuckets: command.supportedServiceBuckets?.length
        ? [...command.supportedServiceBuckets]
        : ["standard_taxi"],
      workState: lifecycleStatus === "active" ? "available" : "offline",
      licensesValid: command.licensesValid ?? false,
      licenseExpiry: command.licenseExpiry ?? null,
      professionalDriverLicenseExpiry:
        command.professionalDriverLicenseExpiry ?? null,
      taxiDriverRegistrationExpiry:
        command.taxiDriverRegistrationExpiry ?? null,
      lifecycleStatus,
      eligibilityBlockedReasons: [],
      dispatchEligible: false,
      createdAt: now,
      updatedAt: now,
      activatedAt: lifecycleStatus === "active" ? now : null,
      suspendedAt: lifecycleStatus === "suspended" ? now : null,
      retiredAt: lifecycleStatus === "retired" ? now : null,
      profileUpdatedAt: null,
      deviceBindings: [],
    });

    const profileCommand: CreateDriverProfileCommand = {
      name: command.name,
      ...(command.phone === undefined ? {} : { phone: command.phone }),
      ...(command.email === undefined ? {} : { email: command.email }),
      ...(command.photoUrl === undefined ? {} : { photoUrl: command.photoUrl }),
      ...(command.emergencyContact === undefined
        ? {}
        : { emergencyContact: command.emergencyContact }),
      ...(command.bankAccount === undefined
        ? {}
        : { bankAccount: command.bankAccount }),
    };
    this.pendingDriverCreations.add(driverId);
    try {
      // Preserve C060's caller ordering: enqueue the profile immediately,
      // before a later canonical profile/device caller can overtake it.
      const profileSave = this.driverProfileService.upsertAdminProfile(
        driverId,
        profileCommand,
        requestId,
      );
      return await this.enqueueDriverMasterWrite(driverId, async () => {
        const profile = await profileSave;
        created.profileUpdatedAt = profile.updatedAt;
        created.deviceBindings = profile.deviceBindings.map((binding) => ({
          ...binding,
        }));

        await this.saveDriverMaster(created, "create_driver");
        this.drivers = [this.cloneDriver(created), ...this.drivers];
        this.recordAudit(
          {
            actorId: "platform-admin",
            actorType: "platform_admin",
            tenantId: null,
            moduleName: "regulatory-registry",
            actionName: "create_driver_master",
            resourceType: "driver_master",
            resourceId: driverId,
            newValuesSummary: this.buildDriverAuditSummary(created, null),
          },
          requestId,
        );

        return this.cloneDriver(created);
      });
    } finally {
      this.pendingDriverCreations.delete(driverId);
    }
  }

  /**
   * Adjusts a driver's dispatchable service buckets after registration.
   *
   * Audited with old and new values, like `updateDriverLifecycle`, because this
   * changes what work the platform may send someone.
   */
  updateDriverServiceBuckets(
    driverId: string,
    command: UpdateDriverServiceBucketsCommand,
    requestId?: string,
  ) {
    return this.enqueueDriverMasterWrite(
      driverId,
      async (workStateRevision) => {
        const driver = this.stageDriverMaster(driverId);
        const previous = this.decorateDriver(driver);
        const buckets = command.supportedServiceBuckets;

        if (!Array.isArray(buckets) || buckets.length === 0) {
          throw new ApiRequestError(
            HttpStatus.BAD_REQUEST,
            "SERVICE_BUCKETS_REQUIRED",
            "At least one service bucket is required; a driver with none can never be dispatched.",
            { driverId },
          );
        }
        const unknown = buckets.filter(
          (bucket) => !PHASE1_SERVICE_BUCKETS.includes(bucket),
        );
        if (unknown.length > 0) {
          throw new ApiRequestError(
            HttpStatus.BAD_REQUEST,
            "SERVICE_BUCKET_UNKNOWN",
            `Unknown service bucket(s): ${unknown.join(", ")}.`,
            { driverId, unknown, supported: [...PHASE1_SERVICE_BUCKETS] },
          );
        }

        driver.supportedServiceBuckets = [...new Set(buckets)];
        driver.updatedAt = new Date().toISOString();

        let updated = this.decorateDriver(driver);
        await this.saveDriverMaster(updated, "update_driver_service_buckets");
        updated = this.decorateDriver(
          this.publishDriverMaster(driver, workStateRevision),
        );
        this.recordAudit(
          {
            actorId: "platform-admin",
            actorType: "platform_admin",
            tenantId: null,
            moduleName: "regulatory-registry",
            actionName: "update_driver_service_buckets",
            resourceType: "driver_master",
            resourceId: driverId,
            oldValuesSummary: {
              supportedServiceBuckets: [...previous.supportedServiceBuckets],
            },
            newValuesSummary: {
              supportedServiceBuckets: [...updated.supportedServiceBuckets],
              reason: command.reason ?? null,
            },
          },
          requestId,
        );

        return this.cloneDriver(updated);
      },
    );
  }

  updateDriverLifecycle(
    driverId: string,
    command: UpdateDriverMasterLifecycleCommand,
    requestId?: string,
  ) {
    return this.enqueueDriverMasterWrite(
      driverId,
      async (workStateRevision) => {
        const driver = this.stageDriverMaster(driverId);
        const previous = this.decorateDriver(driver);
        const now = new Date().toISOString();

        driver.lifecycleStatus = command.lifecycleStatus;
        driver.updatedAt = now;
        if (command.lifecycleStatus === "active") {
          driver.activatedAt = now;
          driver.suspendedAt = null;
          driver.retiredAt = null;
          if (
            driver.workState === "suspended" ||
            driver.workState === "offline"
          ) {
            driver.workState = "available";
          }
        } else if (command.lifecycleStatus === "suspended") {
          driver.suspendedAt = now;
          driver.retiredAt = null;
          driver.workState = "suspended";
        } else if (command.lifecycleStatus === "retired") {
          driver.suspendedAt = null;
          driver.retiredAt = now;
          driver.workState = "offline";
        } else {
          driver.workState = "offline";
          driver.activatedAt = null;
          driver.suspendedAt = null;
          driver.retiredAt = null;
        }

        if (command.licenseExpiry !== undefined) {
          driver.licenseExpiry = command.licenseExpiry;
        }
        if (command.professionalDriverLicenseExpiry !== undefined) {
          driver.professionalDriverLicenseExpiry =
            command.professionalDriverLicenseExpiry;
        }
        if (command.taxiDriverRegistrationExpiry !== undefined) {
          driver.taxiDriverRegistrationExpiry =
            command.taxiDriverRegistrationExpiry;
        }

        let updated = this.decorateDriver(driver);
        await this.saveDriverMaster(updated, "update_driver_lifecycle");
        updated = this.decorateDriver(
          this.publishDriverMaster(driver, workStateRevision),
        );
        this.recordAudit(
          {
            actorId: "platform-admin",
            actorType: "platform_admin",
            tenantId: null,
            moduleName: "regulatory-registry",
            actionName: "update_driver_master_lifecycle",
            resourceType: "driver_master",
            resourceId: driverId,
            oldValuesSummary: this.buildDriverAuditSummary(previous, null),
            newValuesSummary: this.buildDriverAuditSummary(
              updated,
              command.reason ?? null,
            ),
          },
          requestId,
        );

        return this.cloneDriver(updated);
      },
    );
  }

  updateDriverLicenses(
    driverId: string,
    command: UpdateDriverLicensesCommand,
    requestId?: string,
  ): Promise<DriverRegistryRecord> {
    return this.enqueueDriverMasterWrite(
      driverId,
      async (workStateRevision) => {
        const driver = this.stageDriverMaster(driverId);
        const previous = this.decorateDriver(driver);
        const now = new Date().toISOString();

        if (command.licenseExpiry !== undefined) {
          driver.licenseExpiry = command.licenseExpiry;
        }
        if (command.professionalDriverLicenseExpiry !== undefined) {
          driver.professionalDriverLicenseExpiry =
            command.professionalDriverLicenseExpiry;
        }
        if (command.taxiDriverRegistrationExpiry !== undefined) {
          driver.taxiDriverRegistrationExpiry =
            command.taxiDriverRegistrationExpiry;
        }
        if (command.licensesValid !== undefined) {
          driver.licensesValid = command.licensesValid;
        }
        driver.updatedAt = now;

        let updated = this.decorateDriver(driver);
        await this.saveDriverMaster(updated, "update_driver_licenses");
        updated = this.decorateDriver(
          this.publishDriverMaster(driver, workStateRevision),
        );
        this.recordAudit(
          {
            actorId: "platform-admin",
            actorType: "platform_admin",
            tenantId: null,
            moduleName: "regulatory-registry",
            actionName: "update_driver_licenses",
            resourceType: "driver_master",
            resourceId: driverId,
            oldValuesSummary: this.buildDriverAuditSummary(previous, null),
            newValuesSummary: this.buildDriverAuditSummary(
              updated,
              command.reason ?? null,
            ),
          },
          requestId,
        );

        if (this.regulatoryRegistryRepository) {
          // The master save above is already acknowledged. Renewal cleanup can
          // still fail; retain its durable pending work for the existing rescan
          // and observe the failure without claiming supersession or delivery.
          void this.handleDriverLicenseRenewal(driverId, command).catch(
            (error: unknown) => {
              this.regulatoryRegistryRepository!.reportPersistenceFailure(
                error,
                "driver_license_renewal_reconciliation",
              );
            },
          );
        }

        return this.cloneDriver(updated);
      },
    );
  }

  private enqueueDriverMasterWrite<T>(
    driverId: string,
    operation: (workStateRevision: number) => Promise<T>,
  ): Promise<T> {
    // Capture intent order, including a setter made while this command waits
    // behind an earlier master write, before its snapshot is even built.
    const workStateRevision =
      this.driverWorkStateChanges.get(driverId)?.revision ?? 0;
    const result = (
      this.driverMasterWrites.get(driverId) ?? Promise.resolve()
    ).then(() => operation(workStateRevision));
    const settled = result.then(
      () => {},
      () => {},
    );
    this.driverMasterWrites.set(driverId, settled);
    void settled.then(() => {
      if (this.driverMasterWrites.get(driverId) === settled) {
        this.driverMasterWrites.delete(driverId);
      }
    });
    return result;
  }

  private async saveDriverMaster(
    driver: DriverRegistryRecord,
    context: string,
  ) {
    const repository = this.regulatoryRegistryRepository;
    if (!repository?.isEnabled()) {
      throw new ApiRequestError(
        HttpStatus.SERVICE_UNAVAILABLE,
        "DRIVER_MASTER_STORAGE_UNAVAILABLE",
        "Driver master storage is unavailable.",
      );
    }
    try {
      await repository.persistChanges({ drivers: [this.cloneDriver(driver)] });
    } catch (error) {
      repository.reportPersistenceFailure(error, context);
      throw error;
    }
  }

  private publishDriverMaster(
    driver: DriverRegistryRecord,
    workStateRevision: number,
  ) {
    // Keep the declared validity flag in local master state; expiry validity
    // remains derived by decorateDriver, including after a later renewal.
    const local = this.driverWorkStateChanges.get(driver.driverId);
    // Only the inherited synchronous setter's fields may overlay a strict
    // master publication. Never spread a stale or failed master snapshot back.
    const published =
      local && local.revision > workStateRevision
        ? { ...driver, workState: local.workState, updatedAt: local.updatedAt }
        : driver;
    this.drivers = this.drivers.map((current) =>
      current.driverId === driver.driverId
        ? this.cloneDriver(published)
        : current,
    );
    return published;
  }

  private stageDriverMaster(driverId: string): DriverRegistryRecord {
    const committed = this.requireDriver(driverId);
    // Historical repository rows can predate derived arrays/profile metadata.
    // Use the existing decorator to fill those, while retaining the declared
    // license flag so expiry evaluation never becomes a permanent local flag.
    return {
      ...this.cloneDriver(this.decorateDriver(committed)),
      licensesValid: committed.licensesValid,
    };
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

    await this.prepareDriverAuthority(driverId);
    this.requireDriver(driverId);

    const locationRepository = this.getLocationRepository();
    const updatedAt = new Date().toISOString();
    const currentLocationUpdated =
      locationRepository === null
        ? true
        : await locationRepository.upsertDriverLocation({
            driverId,
            lat: command.lat,
            lng: command.lng,
            recordedAt,
            ...(command.accuracyM === undefined
              ? {}
              : { accuracyM: command.accuracyM }),
          });

    if (
      currentLocationUpdated &&
      this.applyLatestDriverLocation({
        driverId,
        lat: command.lat,
        lng: command.lng,
        accuracyM: command.accuracyM ?? null,
        recordedAt,
        updatedAt,
      })
    ) {
      const latestLocation = this.cloneDriverLocation(
        this.latestDriverLocations.get(driverId)!,
      );
      this.opsDispatchEventsService.publishDriverLocationUpdated(
        latestLocation,
        undefined,
      );
    }

    return { success: true };
  }

  async recordDriverLocationBatch(
    request: DriverLocationHeartbeatBatchRequest,
  ): Promise<DriverLocationHeartbeatBatchResponse> {
    if (!request || !Array.isArray(request.items)) {
      throw new ApiRequestError(
        HttpStatus.BAD_REQUEST,
        "FIELD_REQUIRED",
        "items is required.",
        {
          field: "items",
        },
      );
    }

    if (request.items.length > 100) {
      throw new ApiRequestError(
        HttpStatus.BAD_REQUEST,
        "BATCH_LIMIT_EXCEEDED",
        "A heartbeat batch can contain at most 100 items.",
        {
          field: "items",
          maxItems: 100,
          received: request.items.length,
        },
      );
    }

    const items: DriverLocationHeartbeatAck[] = [];
    for (const item of request.items) {
      items.push(await this.recordBatchHeartbeatItem(item));
    }

    return { items };
  }

  private async recordBatchHeartbeatItem(
    item: DriverLocationHeartbeatEnvelope,
  ): Promise<DriverLocationHeartbeatAck> {
    const heartbeat = await this.normalizeHeartbeatEnvelope(item);

    const locationRepository = this.getLocationRepository();
    const persistedResult =
      locationRepository === null
        ? {
            duplicate: false,
            currentLocationUpdated: true,
            serverReceivedAt: new Date().toISOString(),
          }
        : await locationRepository.recordDriverLocationEvent(heartbeat);

    const currentLocationUpdated =
      persistedResult.currentLocationUpdated &&
      this.applyLatestDriverLocation({
        driverId: heartbeat.driverId,
        lat: heartbeat.lat,
        lng: heartbeat.lng,
        accuracyM: heartbeat.accuracyM,
        recordedAt: heartbeat.recordedAt,
        updatedAt: persistedResult.serverReceivedAt,
      });

    this.setLatestDriverHeartbeatUpload({
      eventId: heartbeat.eventId,
      deviceId: heartbeat.deviceId,
      driverId: heartbeat.driverId,
      sequenceNo: heartbeat.sequenceNo,
      recordedAt: heartbeat.recordedAt,
      receivedAt: persistedResult.serverReceivedAt,
    });

    if (currentLocationUpdated) {
      this.setCurrentDriverHeartbeatContext({
        ...heartbeat,
        receivedAt: persistedResult.serverReceivedAt,
      });
    }

    if (currentLocationUpdated) {
      const latestLocation = this.cloneDriverLocation(
        this.latestDriverLocations.get(heartbeat.driverId)!,
      );
      this.opsDispatchEventsService.publishDriverLocationUpdated(
        latestLocation,
        undefined,
      );
    }

    return {
      eventId: heartbeat.eventId,
      accepted: true,
      duplicate: persistedResult.duplicate,
      currentLocationUpdated,
      serverReceivedAt: persistedResult.serverReceivedAt,
    };
  }

  async getDriverTrackingStatus(
    driverId: string,
  ): Promise<DriverTrackingStatus> {
    // Guard against a missing driverId query param: `driverId.trim()` on an
    // undefined value threw a TypeError -> 500. Normalize to "" so the
    // assertNonBlank guard returns a clean 400 FIELD_REQUIRED instead.
    const normalizedDriverId = (driverId ?? "").trim();
    this.assertNonBlank(normalizedDriverId, "driverId");
    await this.prepareDriverAuthority(normalizedDriverId);
    this.requireDriver(normalizedDriverId);

    const currentLocation =
      await this.resolveLatestDriverLocation(normalizedDriverId);
    const currentContext =
      (await this.resolveCurrentDriverHeartbeatContext(
        normalizedDriverId,
        currentLocation,
      )) ?? null;
    const latestUpload =
      this.latestDriverHeartbeatUploads.get(normalizedDriverId) ??
      (await this.regulatoryRegistryRepository?.findLatestDriverHeartbeatEvent?.(
        normalizedDriverId,
      )) ??
      null;
    const lastHeartbeat = latestUpload ?? currentContext;

    return {
      driverId: normalizedDriverId,
      locationFreshness: this.classifyDriverLocationFreshness(currentLocation),
      currentLocation: currentLocation
        ? this.cloneDriverLocation(currentLocation)
        : null,
      currentVehicleId: currentContext?.vehicleId ?? null,
      currentTaskId: currentContext?.taskId ?? null,
      trackingState: currentContext?.workState ?? null,
      appState: currentContext?.appState ?? null,
      transportMode: currentContext?.transportMode ?? null,
      networkType: currentContext?.networkType ?? null,
      lastEventId: lastHeartbeat?.eventId ?? null,
      lastDeviceId: lastHeartbeat?.deviceId ?? null,
      lastSequenceNo: lastHeartbeat?.sequenceNo ?? null,
      lastHeartbeatRecordedAt:
        lastHeartbeat?.recordedAt ?? currentLocation?.recordedAt ?? null,
      lastHeartbeatReceivedAt:
        lastHeartbeat?.receivedAt ?? currentLocation?.updatedAt ?? null,
      lastSuccessfulUploadAt:
        lastHeartbeat?.receivedAt ?? currentLocation?.updatedAt ?? null,
    };
  }

  private async normalizeHeartbeatEnvelope(
    item: DriverLocationHeartbeatEnvelope,
  ): Promise<DriverLocationHeartbeatEnvelope> {
    const eventId = item.eventId.trim();
    const deviceId = item.deviceId.trim();
    const driverId = item.driverId.trim();
    this.assertNonBlank(eventId, "eventId");
    this.assertNonBlank(deviceId, "deviceId");
    this.assertNonBlank(driverId, "driverId");
    this.assertSequenceNo(item.sequenceNo, "sequenceNo");
    this.assertCoordinate(item.lat, "lat", -90, 90);
    this.assertCoordinate(item.lng, "lng", -180, 180);
    this.assertOptionalNonNegativeNumber(
      item.accuracyM ?? undefined,
      "accuracyM",
    );
    this.assertAllowedValue(item.workState, "workState", [
      "offline",
      "available",
      "assigned",
      "enroute",
      "arrived",
      "on_trip",
      "incident",
    ]);
    this.assertAllowedValue(item.appState, "appState", [
      "foreground",
      "background",
    ]);
    this.assertAllowedValue(item.transportMode, "transportMode", [
      "foreground",
      "background",
    ]);
    this.assertAllowedValue(item.networkType, "networkType", [
      "wifi",
      "cellular",
      "offline",
      "unknown",
    ]);

    await this.prepareDriverAuthority(driverId);
    this.requireDriver(driverId);

    return {
      ...item,
      eventId,
      deviceId,
      driverId,
      vehicleId: this.normalizeNullableText(item.vehicleId),
      taskId: this.normalizeNullableText(item.taskId),
      recordedAt: this.normalizeHeartbeatRecordedAt(item.recordedAt),
    };
  }

  async getDriverEta(
    driverId: string,
    destLat: number,
    destLng: number,
  ): Promise<DriverEtaResponse> {
    this.assertNonBlank(driverId, "driverId");
    this.assertCoordinate(destLat, "destLat", -90, 90);
    this.assertCoordinate(destLng, "destLng", -180, 180);
    await this.prepareDriverAuthority(driverId.trim());
    this.requireDriver(driverId);

    const driverLocation = await this.resolveLatestDriverLocation(
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
    const evaluatedAt = this.getEffectiveEvaluationTime();
    return this.contracts.map((contract) =>
      this.cloneContract(this.applyContractLifecycle(contract, evaluatedAt)),
    );
  }

  listExpiringContracts(
    windowDays = 30,
    referenceDateMs: number = Date.parse(this.getEffectiveEvaluationTime()),
  ): VehicleContractRecord[] {
    const evaluatedAt = new Date(referenceDateMs).toISOString();
    const cutoff = referenceDateMs + windowDays * 24 * 60 * 60 * 1000;

    return this.contracts
      .map((contract) =>
        this.cloneContract(this.applyContractLifecycle(contract, evaluatedAt)),
      )
      .filter((contract) => contract.lifecycleStatus === "active")
      .filter((contract) => {
        const endAt = new Date(contract.endAt).getTime();
        return endAt >= referenceDateMs && endAt <= cutoff;
      });
  }

  async createContract(
    command: CreateVehicleContractCommand,
  ): Promise<VehicleContractRecord> {
    this.assertNonBlank(command.vehicleId, "vehicleId");
    this.assertNonBlank(command.partnerId, "partnerId");
    this.assertNonBlank(command.partnerType, "partnerType");
    this.assertNonBlank(command.contractType, "contractType");
    this.assertNonBlank(command.serviceScope, "serviceScope");
    this.assertTimeRange(command.startAt, command.endAt);

    return this.runVehicleSourceCommand(
      command.vehicleId,
      "contracts",
      "create_contract",
      (state) => this.stageCreateContract(command, state),
    );
  }

  async activateContract(
    contractId: string,
    command: ActivateVehicleContractCommand,
  ): Promise<VehicleContractRecord> {
    const existing = this.regulatoryRegistryRepository!.isEnabled()
      ? await this.regulatoryRegistryRepository!.findCommandContract(contractId)
      : this.requireContract(contractId);
    if (!existing)
      throw new ApiRequestError(
        HttpStatus.NOT_FOUND,
        "CONTRACT_NOT_FOUND",
        "The canonical record could not be found.",
        { contractId },
      );
    return this.runVehicleSourceCommand(
      existing.vehicleId,
      "contracts",
      "activate_contract",
      (state) => this.stageActivateContract(contractId, command, state),
    );
  }

  listPolicies() {
    const evaluatedAt = this.getEffectiveEvaluationTime();
    return this.policies.map((policy) =>
      this.clonePolicy(this.applyPolicyLifecycle(policy, evaluatedAt)),
    );
  }

  listExpiringPolicies(
    windowDays = 30,
    referenceDateMs: number = Date.parse(this.getEffectiveEvaluationTime()),
  ): InsurancePolicyRecord[] {
    const evaluatedAt = new Date(referenceDateMs).toISOString();
    const cutoff = referenceDateMs + windowDays * 24 * 60 * 60 * 1000;

    return this.policies
      .map((policy) =>
        this.clonePolicy(this.applyPolicyLifecycle(policy, evaluatedAt)),
      )
      .filter((policy) => policy.lifecycleStatus === "active")
      .filter((policy) => {
        const endAt = new Date(policy.endAt).getTime();
        return endAt >= referenceDateMs && endAt <= cutoff;
      });
  }

  listExpiringDriverLicenses(
    windowDays = 30,
    referenceDateMs: number = Date.now(),
  ): DriverRegistryRecord[] {
    const cutoff = referenceDateMs + windowDays * 24 * 60 * 60 * 1000;

    return this.drivers
      .filter((driver) => driver.lifecycleStatus === "active")
      .map((driver) => this.decorateDriver(driver, referenceDateMs))
      .filter((driver) => {
        const dates = [
          driver.licenseExpiry,
          driver.professionalDriverLicenseExpiry,
          driver.taxiDriverRegistrationExpiry,
        ]
          .filter((d): d is string => Boolean(d && typeof d === "string"))
          .map((d) => Date.parse(d))
          .filter((t) => !Number.isNaN(t));

        return dates.some((t) => t >= referenceDateMs && t <= cutoff);
      })
      .map((driver) => this.cloneDriver(driver));
  }

  async createInsurancePolicy(
    command: CreateInsurancePolicyCommand,
  ): Promise<InsurancePolicyRecord> {
    this.assertNonBlank(command.vehicleId, "vehicleId");
    this.assertNonBlank(command.policyNo, "policyNo");
    this.assertNonBlank(command.insuranceType, "insuranceType");
    this.assertNonBlank(command.insurerName, "insurerName");
    this.assertTimeRange(command.startAt, command.endAt);

    return this.runVehicleSourceCommand(
      command.vehicleId,
      "policies",
      "create_insurance_policy",
      (state) => this.stageCreateInsurancePolicy(command, state),
    );
  }

  async activateInsurancePolicy(
    policyId: string,
    command: ActivateInsurancePolicyCommand,
  ): Promise<InsurancePolicyRecord> {
    const existing = this.regulatoryRegistryRepository!.isEnabled()
      ? await this.regulatoryRegistryRepository!.lockPolicy(policyId)
      : this.requirePolicy(policyId);
    if (!existing)
      throw new ApiRequestError(
        HttpStatus.NOT_FOUND,
        "POLICY_NOT_FOUND",
        "The canonical record could not be found.",
        { policyId },
      );
    return this.runVehicleSourceCommand(
      existing.vehicleId,
      "policies",
      "activate_insurance_policy",
      (state) => this.stageActivateInsurancePolicy(policyId, command, state),
    );
  }

  listExclusivities() {
    const evaluatedAt = this.getEffectiveEvaluationTime();
    return this.exclusivities.map((exclusivity) =>
      this.cloneExclusivity(
        this.applyExclusivityLifecycle(exclusivity, evaluatedAt),
      ),
    );
  }

  async submitExclusivityReview(
    vehicleId: string,
    command: SubmitExclusivityReviewCommand,
  ): Promise<DispatchExclusivityRecord> {
    return this.runVehicleSourceCommand(
      vehicleId,
      "exclusivities",
      "submit_exclusivity_review",
      (state) => this.stageSubmitExclusivityReview(vehicleId, command, state),
    );
  }

  async approveExclusivity(
    vehicleId: string,
    command: ApproveExclusivityCommand,
  ): Promise<DispatchExclusivityRecord> {
    return this.runVehicleSourceCommand(
      vehicleId,
      "exclusivities",
      "approve_exclusivity",
      (state) => this.stageApproveExclusivity(vehicleId, command, state),
    );
  }

  async rejectExclusivity(
    vehicleId: string,
    command: RejectExclusivityCommand,
  ): Promise<DispatchExclusivityRecord> {
    return this.runVehicleSourceCommand(
      vehicleId,
      "exclusivities",
      "reject_exclusivity",
      (state) => this.stageRejectExclusivity(vehicleId, command, state),
    );
  }

  private stageCreateContract(
    command: CreateVehicleContractCommand,
    state: RegulatoryVehicleCommandState,
  ): VehicleContractRecord {
    this.assertNonBlank(command.vehicleId, "vehicleId");
    this.assertNonBlank(command.partnerId, "partnerId");
    this.assertNonBlank(command.partnerType, "partnerType");
    this.assertNonBlank(command.contractType, "contractType");
    this.assertNonBlank(command.serviceScope, "serviceScope");
    this.assertTimeRange(command.startAt, command.endAt);

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
    state.contracts = [this.cloneContract(nextContract), ...state.contracts];
    state.vehicle = this.reconcileVehicleLifecycle(
      nextContract.vehicleId,
      {
        entityType: "contract",
        message: "Vehicle contract created in draft state.",
        occurredAt: now,
        relatedEntityId: nextContract.contractId,
        persistContext: null,
        touchUpdatedAt: true,
        emitEvent: false,
      },
      state.vehicle,
      state,
    );

    return this.cloneContract(nextContract);
  }

  private stageActivateContract(
    contractId: string,
    command: ActivateVehicleContractCommand,
    state: RegulatoryVehicleCommandState,
  ): VehicleContractRecord {
    const contract = this.requireContract(contractId, state.contracts);
    const approvedAt =
      command.approvedAt ?? this.getEffectiveEvaluationTime();
    const renewalDates = command as ActivateVehicleContractCommand & {
      startAt?: string;
      endAt?: string;
    };
    if (renewalDates.startAt !== undefined) {
      contract.startAt = renewalDates.startAt;
    }
    if (renewalDates.endAt !== undefined) {
      contract.endAt = renewalDates.endAt;
    }
    if (
      renewalDates.startAt !== undefined ||
      renewalDates.endAt !== undefined
    ) {
      this.assertTimeRange(contract.startAt, contract.endAt);
    }
    contract.status = "active";
    contract.approvedBy = this.normalizeNullableText(command.approvedBy);
    contract.approvedAt = approvedAt;
    contract.updatedAt = approvedAt;
    this.applyContractLifecycle(contract, approvedAt);

    state.vehicle = this.reconcileVehicleLifecycle(
      contract.vehicleId,
      {
        entityType: "contract",
        message:
          contract.lifecycleStatus === "active"
            ? "Vehicle contract activated."
            : "Vehicle contract activation evaluated against its effective window.",
        occurredAt: approvedAt,
        relatedEntityId: contract.contractId,
        persistContext: null,
        touchUpdatedAt: true,
        emitEvent: false,
      },
      state.vehicle,
      state,
    );

    return this.cloneContract(contract);
  }

  private stageCreateInsurancePolicy(
    command: CreateInsurancePolicyCommand,
    state: RegulatoryVehicleCommandState,
  ): InsurancePolicyRecord {
    this.assertNonBlank(command.vehicleId, "vehicleId");
    this.assertNonBlank(command.policyNo, "policyNo");
    this.assertNonBlank(command.insuranceType, "insuranceType");
    this.assertNonBlank(command.insurerName, "insurerName");
    this.assertTimeRange(command.startAt, command.endAt);

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
    state.policies = [this.clonePolicy(nextPolicy), ...state.policies];
    state.vehicle = this.reconcileVehicleLifecycle(
      nextPolicy.vehicleId,
      {
        entityType: "insurance_policy",
        message: "Insurance policy created and awaiting activation.",
        occurredAt: now,
        relatedEntityId: nextPolicy.policyId,
        persistContext: null,
        touchUpdatedAt: true,
        emitEvent: false,
      },
      state.vehicle,
      state,
    );

    return this.clonePolicy(nextPolicy);
  }

  private stageActivateInsurancePolicy(
    policyId: string,
    command: ActivateInsurancePolicyCommand,
    state: RegulatoryVehicleCommandState,
  ): InsurancePolicyRecord {
    const policy = this.requirePolicy(policyId, state.policies);
    const activatedAt =
      command.activatedAt ?? this.getEffectiveEvaluationTime();
    const renewalDates = command as ActivateInsurancePolicyCommand & {
      startAt?: string;
      endAt?: string;
    };
    if (renewalDates.startAt !== undefined) {
      policy.startAt = renewalDates.startAt;
    }
    if (renewalDates.endAt !== undefined) {
      policy.endAt = renewalDates.endAt;
    }
    if (
      renewalDates.startAt !== undefined ||
      renewalDates.endAt !== undefined
    ) {
      this.assertTimeRange(policy.startAt, policy.endAt);
    }
    policy.status =
      new Date(policy.endAt).getTime() < new Date(activatedAt).getTime()
        ? "expired"
        : "active";
    policy.updatedAt = activatedAt;
    this.applyPolicyLifecycle(policy, activatedAt);
    state.vehicle = this.reconcileVehicleLifecycle(
      policy.vehicleId,
      {
        entityType: "insurance_policy",
        message:
          policy.lifecycleStatus === "active"
            ? "Insurance policy activated."
            : "Insurance policy is no longer valid for dispatch.",
        occurredAt: activatedAt,
        relatedEntityId: policy.policyId,
        persistContext: null,
        touchUpdatedAt: true,
        emitEvent: false,
      },
      state.vehicle,
      state,
    );

    return this.clonePolicy(policy);
  }

  private stageSubmitExclusivityReview(
    vehicleId: string,
    command: SubmitExclusivityReviewCommand,
    state: RegulatoryVehicleCommandState,
  ): DispatchExclusivityRecord {
    const now = new Date().toISOString();
    const existing = state.exclusivities.find(
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
    state.exclusivities = [
      this.cloneExclusivity(exclusivity),
      ...state.exclusivities.filter(
        (candidate) => candidate.vehicleId !== vehicleId,
      ),
    ];
    state.vehicle = this.reconcileVehicleLifecycle(
      vehicleId,
      {
        entityType: "exclusivity",
        message:
          "Exclusivity review submitted and vehicle is held pending approval.",
        occurredAt: now,
        relatedEntityId: vehicleId,
        persistContext: null,
        touchUpdatedAt: true,
        emitEvent: false,
      },
      state.vehicle,
      state,
    );

    return this.cloneExclusivity(exclusivity);
  }

  private stageApproveExclusivity(
    vehicleId: string,
    command: ApproveExclusivityCommand,
    state: RegulatoryVehicleCommandState,
  ): DispatchExclusivityRecord {
    const reviewedAt = command.reviewedAt ?? new Date().toISOString();
    const exclusivity = state.exclusivities.find(
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

    state.exclusivities = [
      this.cloneExclusivity(exclusivity),
      ...state.exclusivities.filter(
        (candidate) => candidate.vehicleId !== vehicleId,
      ),
    ];
    state.vehicle = this.reconcileVehicleLifecycle(
      vehicleId,
      {
        entityType: "exclusivity",
        message:
          exclusivity.lifecycleStatus === "active"
            ? "Exclusivity approved and supply may dispatch again."
            : "Exclusivity approval recorded, but the effective window is not dispatchable.",
        occurredAt: reviewedAt,
        relatedEntityId: vehicleId,
        persistContext: null,
        touchUpdatedAt: true,
        emitEvent: false,
      },
      state.vehicle,
      state,
    );

    return this.cloneExclusivity(exclusivity);
  }

  private stageRejectExclusivity(
    vehicleId: string,
    command: RejectExclusivityCommand,
    state: RegulatoryVehicleCommandState,
  ): DispatchExclusivityRecord {
    const reviewedAt = command.reviewedAt ?? new Date().toISOString();
    const exclusivity = state.exclusivities.find(
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
    exclusivity.reviewStatus = "rejected";
    exclusivity.reviewerId = this.normalizeNullableText(command.reviewerId);
    exclusivity.reviewedAt = reviewedAt;
    exclusivity.terminationReason = this.normalizeNullableText(command.reason);
    exclusivity.updatedAt = reviewedAt;
    this.applyExclusivityLifecycle(exclusivity, reviewedAt);

    state.exclusivities = [
      this.cloneExclusivity(exclusivity),
      ...state.exclusivities.filter(
        (candidate) => candidate.vehicleId !== vehicleId,
      ),
    ];
    state.vehicle = this.reconcileVehicleLifecycle(
      vehicleId,
      {
        entityType: "exclusivity",
        message: "Exclusivity was rejected and supply remains blocked.",
        occurredAt: reviewedAt,
        relatedEntityId: vehicleId,
        persistContext: null,
        touchUpdatedAt: true,
        emitEvent: false,
      },
      state.vehicle,
      state,
    );

    return this.cloneExclusivity(exclusivity);
  }

  /** Only ordinary C072 commands use this staged, acknowledged boundary. */
  private async runVehicleSourceCommand<
    T extends
      | VehicleContractRecord
      | InsurancePolicyRecord
      | DispatchExclusivityRecord,
  >(
    vehicleId: string,
    family: "contracts" | "policies" | "exclusivities",
    context: string,
    stage: (state: RegulatoryVehicleCommandState) => T,
  ): Promise<T> {
    return this.withFinalExitWrite(vehicleId, async () => {
      const repository = this.regulatoryRegistryRepository!;
      let prepared: RegulatoryVehicleCommandState | undefined;
      let result: T | undefined;
      const apply = (state: RegulatoryVehicleCommandState) => {
        state.vehicle = this.hydrateVehicleRecord(state.vehicle);
        state.contracts = state.contracts.map((record) =>
          this.hydrateContract(record),
        );
        state.policies = state.policies.map((record) =>
          this.hydratePolicy(record),
        );
        state.exclusivities = state.exclusivities.map((record) =>
          this.hydrateExclusivity(record),
        );
        result = stage(state);
        prepared = state;
        return {
          vehicles: [state.vehicle],
          [family]: [result],
        } as PersistRegulatoryRegistryChanges;
      };
      if (!repository.isEnabled()) {
        const state = {
          vehicle: this.cloneVehicle(this.requireVehicle(vehicleId)),
          contracts: this.contracts.map((c) => this.cloneContract(c)),
          policies: this.policies.map((p) => this.clonePolicy(p)),
          exclusivities: this.exclusivities.map((e) =>
            this.cloneExclusivity(e),
          ),
        };
        const changes = apply(state);
        await this.supersedeRenewedVehicleSourceEvents(
          context,
          result!,
          state,
        );
        this.publishVehicleSourceCommand(state, true);
        this.persistChanges(changes, context);
      } else {
        try {
          await repository.withVehicleCommandTransaction(async (client) => {
            const state = await repository.readVehicleCommandState(
              vehicleId,
              client,
            );
            if (!state)
              throw new ApiRequestError(
                HttpStatus.NOT_FOUND,
                "VEHICLE_NOT_FOUND",
                "The canonical vehicle could not be found.",
                { vehicleId },
              );
            await repository.persistChangesWithExecutor(client, apply(state));
            // Preserve the original B4 family and late-receipt semantics, in
            // the same transaction as the actual acknowledged renewal.
            await this.supersedeRenewedVehicleSourceEvents(
              context,
              result!,
              state,
              client,
            );
          });
        } catch (error) {
          repository.reportPersistenceFailure(error, context);
          // A rejected COMMIT is not proof of rollback. Read the exact prepared
          // IDs and vehicle from a new coherent canonical snapshot, not cache.
          let canonical: RegulatoryVehicleCommandState | null = null;
          try {
            canonical = await repository.withTransaction((client) =>
              repository.readVehicleCommandState(vehicleId, client),
            );
          } catch {
            /* unavailable remains an honest failed/unknown command */
          }
          const expected = prepared;
          const matches =
            error instanceof RegulatoryCommandCommitUncertainError &&
            canonical &&
            expected &&
            isDeepStrictEqual(canonical.vehicle, expected.vehicle) &&
            canonical[family].some((record) =>
              isDeepStrictEqual(record, result),
            );
          if (canonical)
            this.publishVehicleSourceCommand(canonical, Boolean(matches));
          if (!matches) {
            if (!prepared) throw error;
            const record = result as VehicleContractRecord &
              InsurancePolicyRecord;
            throw new ApiRequestError(
              HttpStatus.SERVICE_UNAVAILABLE,
              "REGISTRY_COMMAND_NOT_ACKNOWLEDGED",
              "The registry command was not acknowledged. Reload its canonical record before retrying.",
              {
                vehicleId,
                context,
                recordId: record.contractId ?? record.policyId ?? vehicleId,
              },
            );
          }
          return result!;
        }
        this.publishVehicleSourceCommand(prepared!, true);
      }
      return result!;
    });
  }

  private publishVehicleSourceCommand(
    state: RegulatoryVehicleCommandState,
    emitEvent: boolean,
  ) {
    state.vehicle = this.hydrateVehicleRecord(state.vehicle);
    const id = state.vehicle.vehicleId;
    const previous = this.cloneSupplyLifecycle(
      this.requireVehicle(id).supplyLifecycle,
    );
    const merge = <T extends { vehicleId: string }>(
      current: T[],
      saved: T[],
      key: (record: T) => string,
    ) => {
      const own = saved.filter((record) => record.vehicleId === id);
      const rows = new Map(own.map((record) => [key(record), record]));
      const existing = new Set(current.map(key));
      return [
        ...own.filter((record) => !existing.has(key(record))),
        ...current.flatMap((record) =>
          record.vehicleId !== id
            ? [record]
            : rows.has(key(record))
              ? [rows.get(key(record))!]
              : [],
        ),
      ];
    };
    this.contracts = merge(
      this.contracts,
      state.contracts.map((c) => this.cloneContract(c)),
      (c) => c.contractId,
    );
    this.policies = merge(
      this.policies,
      state.policies.map((p) => this.clonePolicy(p)),
      (p) => p.policyId,
    );
    this.exclusivities = merge(
      this.exclusivities,
      state.exclusivities.map((e) => this.cloneExclusivity(e)),
      (e) => e.vehicleId,
    );
    const current = this.requireVehicle(id);
    // Preserve a legitimate in-process manual hold or terminal C073 change
    // while this command awaited storage. Only compliance projection is ours.
    const saved = this.cloneVehicle(state.vehicle);
    if (current.supplyLifecycle.offboarding.status !== "none")
      saved.supplyLifecycle.offboarding = this.normalizeOffboarding(
        current.supplyLifecycle.offboarding,
      );
    const manualHold =
      current.supplyLifecycle.dispatch.blockedReasons.includes("manual_hold") ||
      saved.supplyLifecycle.dispatch.blockedReasons.includes("manual_hold");
    const updated = this.reconcileVehicleLifecycle(
      id,
      {
        emitEvent: false,
        persistContext: null,
        manualDispatchHold: manualHold,
        occurredAt: state.vehicle.updatedAt,
        ...(state.vehicle.supplyLifecycle.lastTrace
          ? {
              message: state.vehicle.supplyLifecycle.lastTrace.message,
              entityType: state.vehicle.supplyLifecycle.lastTrace.entityType,
              relatedEntityId:
                state.vehicle.supplyLifecycle.lastTrace.relatedEntityId,
            }
          : {}),
      },
      saved,
    );
    Object.assign(current, updated);
    updated.updatedAt = state.vehicle.updatedAt;
    if (emitEvent && this.didLifecycleChange(previous, updated.supplyLifecycle))
      this.opsDispatchEventsService.publishSupplyLifecycleUpdated(
        this.cloneVehicle(updated),
      );
  }

  async initiateVehicleOffboarding(
    vehicleId: string,
    command: InitiateVehicleOffboardingCommand,
  ): Promise<VehicleRegistryRecord> {
    return this.withFinalExitWrite(vehicleId, async () => {
      this.assertNonBlank(command.reason, "reason");
      const vehicle = this.cloneVehicle(this.requireVehicle(vehicleId));
      const occurredAt = new Date().toISOString();
      const effectiveAt = this.normalizeNullableText(command.effectiveAt);
      if (effectiveAt && Number.isNaN(new Date(effectiveAt).getTime())) {
        throw new ApiRequestError(
          HttpStatus.BAD_REQUEST,
          "INVALID_TIME_RANGE",
          "effectiveAt must be a valid ISO timestamp.",
          { field: "effectiveAt" },
        );
      }

      const debrandingDueAt = this.normalizeNullableText(
        command.debrandingDueAt,
      );
      if (
        debrandingDueAt &&
        Number.isNaN(new Date(debrandingDueAt).getTime())
      ) {
        throw new ApiRequestError(
          HttpStatus.BAD_REQUEST,
          "INVALID_TIME_RANGE",
          "debrandingDueAt must be a valid ISO timestamp.",
          { field: "debrandingDueAt" },
        );
      }

      const debrandingRequired = command.debrandingRequired ?? true;
      vehicle.dispatchableFlag = false;
      vehicle.supplyLifecycle = {
        ...this.cloneSupplyLifecycle(vehicle.supplyLifecycle),
        offboarding: {
          status: debrandingRequired ? "debranding_required" : "completed",
          reason: command.reason.trim(),
          requestedAt: occurredAt,
          effectiveAt,
          completedAt: debrandingRequired ? null : occurredAt,
          requestedBy: this.normalizeNullableText(command.requestedBy),
          debrandingRequired,
          debrandingStatus: debrandingRequired ? "pending" : "completed",
          debrandingDueAt,
          debrandingCompletedAt: debrandingRequired ? null : occurredAt,
          debrandingTicketId: this.normalizeNullableText(
            command.debrandingTicketId,
          ),
          notes: this.normalizeNullableText(command.notes),
        },
      };
      const updated = this.reconcileVehicleLifecycle(
        vehicleId,
        {
          entityType: "offboarding",
          message: debrandingRequired
            ? "Vehicle offboarding started and debranding work is now tracked."
            : "Vehicle offboarding completed without debranding work.",
          occurredAt,
          relatedEntityId: vehicleId,
          persistContext: null,
          touchUpdatedAt: true,
          emitEvent: false,
        },
        vehicle,
      );
      await this.persistFinalExitChangeOrThrow(
        {
          vehicles: [this.cloneVehicle(updated)],
        },
        "initiate_vehicle_offboarding",
      );

      return this.publishFinalExitChange(vehicleId, updated);
    });
  }

  async completeVehicleDebranding(
    vehicleId: string,
    command: CompleteVehicleDebrandingCommand,
  ): Promise<VehicleRegistryRecord> {
    return this.withFinalExitWrite(vehicleId, async () => {
      const vehicle = this.cloneVehicle(this.requireVehicle(vehicleId));
      const current = this.normalizeOffboarding(
        vehicle.supplyLifecycle.offboarding,
      );
      if (
        !current.debrandingRequired ||
        current.debrandingStatus !== "pending"
      ) {
        throw new ApiRequestError(
          HttpStatus.CONFLICT,
          "DEBRANDING_NOT_REQUIRED",
          "There is no pending debranding work for this vehicle.",
          { vehicleId },
        );
      }

      const completedAt = command.completedAt ?? new Date().toISOString();
      if (Number.isNaN(new Date(completedAt).getTime())) {
        throw new ApiRequestError(
          HttpStatus.BAD_REQUEST,
          "INVALID_TIME_RANGE",
          "completedAt must be a valid ISO timestamp.",
          { field: "completedAt" },
        );
      }

      vehicle.supplyLifecycle = {
        ...this.cloneSupplyLifecycle(vehicle.supplyLifecycle),
        offboarding: {
          ...current,
          status: "completed",
          completedAt,
          debrandingStatus: "completed",
          debrandingCompletedAt: completedAt,
          debrandingTicketId:
            this.normalizeNullableText(command.debrandingTicketId) ??
            current.debrandingTicketId,
          notes: this.normalizeNullableText(command.notes) ?? current.notes,
        },
      };
      const updated = this.reconcileVehicleLifecycle(
        vehicleId,
        {
          entityType: "offboarding",
          message:
            "Vehicle debranding work completed and offboarding is closed.",
          occurredAt: completedAt,
          relatedEntityId: vehicleId,
          persistContext: null,
          touchUpdatedAt: true,
          emitEvent: false,
        },
        vehicle,
      );
      await this.persistFinalExitChangeOrThrow(
        {
          vehicles: [this.cloneVehicle(updated)],
        },
        "complete_vehicle_debranding",
      );

      return this.publishFinalExitChange(vehicleId, updated);
    });
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
      ...(command.dispatchableFlag === undefined
        ? {}
        : { manualDispatchHold: command.dispatchableFlag === false }),
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
    return this.setDriverWorkState(driverId, command).updated;
  }

  private setDriverWorkState(
    driverId: string,
    command: UpdateDriverWorkStateCommand,
  ) {
    const driver = this.requireDriver(driverId);
    driver.workState = command.workState;
    driver.updatedAt = new Date().toISOString();
    const updated = this.decorateDriver(driver);
    const local = {
      workState: driver.workState,
      updatedAt: driver.updatedAt,
      revision: (this.driverWorkStateChanges.get(driverId)?.revision ?? 0) + 1,
    };
    this.driverWorkStateChanges.set(driverId, local);
    const repository = this.regulatoryRegistryRepository;
    let save: Promise<void> | undefined;
    if (repository) {
      save = this.enqueueDriverMasterWrite(driverId, async () => {
        // Keep the inherited synchronous local effect and best-effort error
        // policy; defer only storage, using the last committed master fields.
        const committed = this.stageDriverMaster(driverId);
        const snapshot = this.decorateDriver({
          ...committed,
          workState: local.workState,
          updatedAt: local.updatedAt,
        });
        await repository.persistChanges({
          drivers: [this.cloneDriver(snapshot)],
        });
      });
      void save.catch((error: unknown) => {
        repository.reportPersistenceFailure(error, "update_driver_work_state");
      });
    }
    return { updated: this.cloneDriver(updated), save };
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
        const decoratedDriver = this.decorateDriver(driver);
        const eligibleVehicle =
          vehicle.supplyLifecycle.dispatch.eligible &&
          vehicle.supportedServiceBuckets.includes(serviceBucket);
        const eligibleDriver =
          decoratedDriver.dispatchEligible &&
          decoratedDriver.supportedServiceBuckets.includes(serviceBucket);
        if (!eligibleVehicle || !eligibleDriver) {
          return null;
        }

        const etaMinutes = this.resolveCandidateEta(
          pair,
          decoratedDriver.driverId,
          destination ?? null,
        );
        if (etaMinutes === null) {
          return null;
        }

        return {
          vehicleId: vehicle.vehicleId,
          driverId: decoratedDriver.driverId,
          operatingArea: vehicle.operatingArea,
          serviceBuckets: [...vehicle.supportedServiceBuckets],
          etaMinutes,
          currentLocation:
            this.latestDriverLocations.get(decoratedDriver.driverId) ?? null,
        };
      })
      .filter((candidate): candidate is NonNullable<typeof candidate> =>
        Boolean(candidate),
      );
  }

  getVehicleDispatchability(
    vehicleId: string,
    serviceBucket?: Phase1ServiceBucket,
  ) {
    this.reconcileSupplyLifecycleForAll({
      emitEvent: false,
      persistContext: null,
    });
    const vehicle = this.requireVehicle(vehicleId);
    if (!vehicle.supplyLifecycle.dispatch.eligible) {
      return false;
    }
    if (serviceBucket) {
      return vehicle.supportedServiceBuckets.includes(serviceBucket);
    }
    return vehicle.supportedServiceBuckets.length > 0;
  }

  getDriverAvailability(driverId: string, serviceBucket: Phase1ServiceBucket) {
    const driver = this.decorateDriver(this.requireDriver(driverId));
    return (
      driver.dispatchEligible &&
      driver.supportedServiceBuckets.includes(serviceBucket)
    );
  }

  assertDriverAuthEligible(driverId: string) {
    const driver = this.decorateDriver(this.requireDriver(driverId));

    if (driver.lifecycleStatus === "suspended") {
      throw new ApiRequestError(
        HttpStatus.FORBIDDEN,
        "DRIVER_AUTH_SUSPENDED",
        "The driver account is suspended and cannot use authenticated driver sessions.",
        {
          driverId: driver.driverId,
          lifecycleStatus: driver.lifecycleStatus,
          eligibilityBlockedReasons: [...driver.eligibilityBlockedReasons],
        },
      );
    }

    if (driver.lifecycleStatus === "retired") {
      throw new ApiRequestError(
        HttpStatus.FORBIDDEN,
        "DRIVER_AUTH_REVOKED",
        "The driver account has been retired or revoked and cannot use authenticated driver sessions.",
        {
          driverId: driver.driverId,
          lifecycleStatus: driver.lifecycleStatus,
          eligibilityBlockedReasons: [...driver.eligibilityBlockedReasons],
        },
      );
    }

    if (!driver.licensesValid) {
      throw new ApiRequestError(
        HttpStatus.FORBIDDEN,
        "DRIVER_CERT_INVALID",
        "The driver certifications are invalid or expired and the driver cannot use authenticated driver sessions.",
        {
          driverId: driver.driverId,
          lifecycleStatus: driver.lifecycleStatus,
          eligibilityBlockedReasons: [...driver.eligibilityBlockedReasons],
        },
      );
    }
  }

  private async supersedeRenewedVehicleSourceEvents(
    context: string,
    result:
      | VehicleContractRecord
      | InsurancePolicyRecord
      | DispatchExclusivityRecord,
    state: RegulatoryVehicleCommandState,
    client?: import("pg").PoolClient,
  ): Promise<void> {
    const repository = this.regulatoryRegistryRepository;
    if (!repository) return;
    if (
      context === "activate_insurance_policy" &&
      (result as InsurancePolicyRecord).status === "active"
    ) {
      const policy = result as InsurancePolicyRecord;
      const newEndAtMs = Date.parse(policy.endAt);
      const vehiclePolicies = state.policies.filter(
        (p) => p.vehicleId === policy.vehicleId,
      );
      for (const candidate of vehiclePolicies) {
        const isCurrent = candidate.policyId === policy.policyId;
        await repository.supersedeActiveExpiryEventsForEntity?.(
          "policy",
          candidate.policyId,
          "insurance_policy",
          undefined,
          client,
        );
        for (const days of [30, 7] as const) {
          const family = `preexpiry:insurance_policy:${days}`;
          const active =
            (await repository.findActiveExpiryEventsForEntity?.(
              "policy",
              candidate.policyId,
              family,
              client,
            )) ?? [];
          const obsoleteIds = active
            .filter((e) => {
              if (!isCurrent) return true;
              const recorded =
                e.source_expiry_at instanceof Date
                  ? e.source_expiry_at.getTime()
                  : Date.parse(e.source_expiry_at ?? "");
              return recorded !== newEndAtMs;
            })
            .map((e) => e.event_id);
          if (obsoleteIds.length > 0) {
            await repository.supersedeExpiryEvents?.(
              obsoleteIds,
              undefined,
              client,
            );
          }
        }
      }
    } else if (
      context === "activate_contract" &&
      (result as VehicleContractRecord).status === "active"
    ) {
      const contract = result as VehicleContractRecord;
      const newEndAtMs = Date.parse(contract.endAt);
      const vehicleContracts = state.contracts.filter(
        (c) => c.vehicleId === contract.vehicleId,
      );
      for (const candidate of vehicleContracts) {
        const isCurrent = candidate.contractId === contract.contractId;
        await repository.supersedeActiveExpiryEventsForEntity?.(
          "policy",
          candidate.contractId,
          "vehicle_contract",
          undefined,
          client,
        );
        for (const days of [30, 7] as const) {
          const family = `preexpiry:vehicle_contract:${days}`;
          const active =
            (await repository.findActiveExpiryEventsForEntity?.(
              "policy",
              candidate.contractId,
              family,
              client,
            )) ?? [];
          const obsoleteIds = active
            .filter((e) => {
              if (!isCurrent) return true;
              const recorded =
                e.source_expiry_at instanceof Date
                  ? e.source_expiry_at.getTime()
                  : Date.parse(e.source_expiry_at ?? "");
              return recorded !== newEndAtMs;
            })
            .map((e) => e.event_id);
          if (obsoleteIds.length > 0) {
            await repository.supersedeExpiryEvents?.(
              obsoleteIds,
              undefined,
              client,
            );
          }
        }
      }
    }
  }

  private reconcileSupplyLifecycleForAll(options?: {
    emitEvent?: boolean;
    persistContext?: string | null;
    occurredAt?: string;
  }): void {
    const reconciledVehicles = this.vehicles.map((vehicle) =>
      this.reconcileVehicleLifecycle(vehicle.vehicleId, {
        entityType: "vehicle",
        ...(options?.emitEvent === undefined
          ? {}
          : { emitEvent: options.emitEvent }),
        ...(options?.occurredAt === undefined
          ? {}
          : { occurredAt: options.occurredAt }),
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

  private provisionDriverFromDraft(
    draft: DriverSupplyDraft,
    approvedAt: string,
  ): DriverRegistryRecord {
    const driverId = `drv_${randomUUID()}`;
    const created = this.decorateDriver({
      driverId,
      name: draft.name.trim(),
      supportedServiceBuckets: this.mapServiceBuckets(
        draft.supportedServiceProductCodes,
      ),
      workState: "available",
      licensesValid: true,
      licenseExpiry: draft.professionalDriverLicenseExpiry ?? null,
      professionalDriverLicenseExpiry:
        draft.professionalDriverLicenseExpiry ?? null,
      taxiDriverRegistrationExpiry: draft.taxiDriverRegistrationExpiry ?? null,
      lifecycleStatus: "active",
      eligibilityBlockedReasons: [],
      dispatchEligible: false,
      createdAt: approvedAt,
      updatedAt: approvedAt,
      activatedAt: approvedAt,
      suspendedAt: null,
      retiredAt: null,
      profileUpdatedAt: approvedAt,
      deviceBindings: [],
    });

    this.drivers = [this.cloneDriver(created), ...this.drivers];
    return created;
  }

  private provisionVehicleFromDraft(
    draft: VehicleSupplyDraft,
    approvedAt: string,
  ): VehicleRegistryRecord {
    const supplyLifecycle = createEmptySupplyLifecycle(approvedAt);
    supplyLifecycle.dispatch = {
      eligible: false,
      blockedReasons: [
        "contract_missing",
        "insurance_missing",
        "exclusivity_missing",
      ],
      evaluatedAt: approvedAt,
    };
    const created: VehicleRegistryRecord = {
      vehicleId: `veh_${randomUUID()}`,
      createdAt: approvedAt,
      plateNo: draft.plateNo.trim(),
      licenseType: this.normalizeVehicleLicenseType(draft.licenseType),
      operatingArea: draft.businessArea.trim(),
      supportedServiceBuckets: this.mapServiceBuckets(
        draft.supportedServiceProductCodes,
      ),
      dispatchableFlag: false,
      exclusivityApproved: false,
      insuranceStatus: "expired",
      updatedAt: approvedAt,
      supplyLifecycle,
    };

    this.vehicles = [this.cloneVehicle(created), ...this.vehicles];
    return created;
  }

  private provisionContractFromDocuments(
    vehicleId: string,
    command: ProvisionFromSubmissionCommand,
    approvedAt: string,
  ): VehicleContractRecord | null {
    const contractDocument = command.documents.find((document) =>
      [
        "fleet_participation_contract",
        "driver_management_contract",
        "vehicle_management_contract",
      ].includes(document.documentType),
    );
    if (!contractDocument) {
      return null;
    }

    const contract: VehicleContractRecord = this.applyContractLifecycle(
      {
        contractId: `contract_${randomUUID()}`,
        vehicleId,
        partnerId: command.submission.fleetPartnerId,
        partnerType: "fleet_partner",
        contractType: contractDocument.documentType,
        operatingAreaId: command.vehicleDraft?.businessArea ?? null,
        serviceScope: this.mapServiceBuckets(
          command.vehicleDraft?.supportedServiceProductCodes ??
            command.driverDraft?.supportedServiceProductCodes ??
            [],
        ).join(","),
        startAt:
          this.dateOnlyToIso(contractDocument.effectiveFrom) ?? approvedAt,
        endAt:
          this.dateOnlyToInclusiveIso(contractDocument.effectiveUntil) ??
          "2099-12-31T23:59:59.000Z",
        status: "active",
        lifecycleStatus: "draft",
        approvedBy: command.reviewerId,
        approvedAt,
        createdAt: approvedAt,
        updatedAt: approvedAt,
      },
      approvedAt,
    );

    this.contracts = [this.cloneContract(contract), ...this.contracts];
    return contract;
  }

  private provisionPolicyFromDocuments(
    vehicleId: string,
    command: ProvisionFromSubmissionCommand,
    approvedAt: string,
  ): InsurancePolicyRecord | null {
    const policyDocument = command.documents.find(
      (document) => document.documentType === "insurance_policy",
    );
    if (!policyDocument) {
      return null;
    }

    const policy: InsurancePolicyRecord = this.applyPolicyLifecycle(
      {
        policyId: `policy_${randomUUID()}`,
        vehicleId,
        policyNo: policyDocument.documentId,
        insuranceType: "passenger_liability",
        insurerName: "submission_provisioned",
        coverageAmount: 0,
        startAt: this.dateOnlyToIso(policyDocument.effectiveFrom) ?? approvedAt,
        endAt:
          this.dateOnlyToInclusiveIso(policyDocument.effectiveUntil) ??
          "2099-12-31T23:59:59.000Z",
        status: "active",
        lifecycleStatus: "pending",
        createdAt: approvedAt,
        updatedAt: approvedAt,
      },
      approvedAt,
    );

    this.policies = [this.clonePolicy(policy), ...this.policies];
    return policy;
  }

  private createVehicleFleetAffiliation(
    vehicleId: string,
    command: ProvisionFromSubmissionCommand,
    approvedAt: string,
  ): VehicleFleetAffiliationRecord {
    const basisDocument = this.selectVehicleAffiliationBasisDocument(
      command.documents,
    );

    return {
      affiliationId: randomUUID(),
      vehicleId,
      fleetPartnerId: command.submission.fleetPartnerId,
      affiliationType: this.mapVehicleAffiliationType(
        basisDocument?.documentType ?? null,
      ),
      effectiveFrom:
        this.dateOnlyToIso(basisDocument?.effectiveFrom ?? null) ?? approvedAt,
      effectiveUntil: this.dateOnlyToInclusiveIso(
        basisDocument?.effectiveUntil ?? null,
      ),
      status: "active",
      sourceSubmissionId: command.submission.submissionId,
      createdAt: approvedAt,
      updatedAt: approvedAt,
    };
  }

  private selectVehicleAffiliationBasisDocument(
    documents: readonly SupplyDocumentRecord[],
  ): SupplyDocumentRecord | null {
    return (
      documents.find(
        (document) => document.documentType === "vehicle_management_contract",
      ) ??
      documents.find(
        (document) => document.documentType === "driver_management_contract",
      ) ??
      documents.find(
        (document) => document.documentType === "fleet_participation_contract",
      ) ??
      null
    );
  }

  private mapVehicleAffiliationType(
    documentType: SupplyDocumentRecord["documentType"] | null,
  ): VehicleFleetAffiliationType {
    if (
      documentType === "vehicle_management_contract" ||
      documentType === "driver_management_contract"
    ) {
      return "managed_by";
    }
    if (documentType === "fleet_participation_contract") {
      return "contracted_under";
    }
    return "owned_by";
  }

  private mapServiceBuckets(
    serviceProductCodes: readonly string[],
  ): Phase1ServiceBucket[] {
    if (
      serviceProductCodes.some((code) =>
        /business|airport|premium|dispatch/i.test(code),
      )
    ) {
      return ["business_dispatch"];
    }

    return ["standard_taxi"];
  }

  private dateOnlyToIso(value: string | null): string | null {
    return value ? `${value}T00:00:00.000Z` : null;
  }

  private dateOnlyToInclusiveIso(value: string | null): string | null {
    return value ? `${value}T23:59:59.000Z` : null;
  }

  private buildVehicleFleetAffiliationAuditSummary(
    affiliation: VehicleFleetAffiliationRecord,
  ) {
    return {
      vehicleId: affiliation.vehicleId,
      fleetPartnerId: affiliation.fleetPartnerId,
      affiliationType: affiliation.affiliationType,
      effectiveFrom: affiliation.effectiveFrom,
      effectiveUntil: affiliation.effectiveUntil,
      status: affiliation.status,
      sourceSubmissionId: affiliation.sourceSubmissionId,
    };
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
      manualDispatchHold?: boolean;
    },
    stagedVehicle?: VehicleRegistryRecord,
    sources?: RegulatoryVehicleCommandState,
  ): VehicleRegistryRecord {
    const vehicle = stagedVehicle ?? this.requireVehicle(vehicleId);
    const occurredAt =
      options?.occurredAt ?? this.getEffectiveEvaluationTime();
    const previousLifecycle = this.cloneSupplyLifecycle(
      vehicle.supplyLifecycle,
    );

    // `dispatchableFlag` is the effective state, so a compliance failure also
    // clears it. Preserve the operator's intent separately in the lifecycle:
    // a manual hold is explicit, while an automatically-cleared flag has only
    // the real compliance reason. This lets a vehicle recover automatically
    // after contract / insurance / exclusivity is restored without overriding
    // a deliberate operator hold.
    const manualDispatchHold =
      options?.manualDispatchHold ??
      (!vehicle.dispatchableFlag &&
        previousLifecycle.dispatch.blockedReasons.includes("manual_hold"));

    const nextLifecycle = this.evaluateVehicleSupplyLifecycle(
      vehicle,
      !manualDispatchHold,
      occurredAt,
      sources,
    );

    const hasComplianceBlock = nextLifecycle.dispatch.blockedReasons.some(
      (reason) => reason !== "manual_hold",
    );
    vehicle.dispatchableFlag = !manualDispatchHold && !hasComplianceBlock;

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
    sources?: RegulatoryVehicleCommandState,
  ): VehicleSupplyLifecycleRecord {
    const contract = this.selectPrimaryContract(
      vehicle.vehicleId,
      evaluatedAt,
      sources?.contracts,
    );
    const policy = this.selectPrimaryPolicy(
      vehicle.vehicleId,
      evaluatedAt,
      sources?.policies,
    );
    const exclusivity = this.selectPrimaryExclusivity(
      vehicle.vehicleId,
      evaluatedAt,
      sources?.exclusivities,
    );
    const offboarding = this.normalizeOffboarding(
      vehicle.supplyLifecycle?.offboarding,
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

    // A final exit (offboarding closed out, with or without debranding work)
    // is terminal: nothing in this service ever resets offboarding.status
    // back to "none", so once it leaves "none" the vehicle must stay off
    // every dispatch/candidate path for good, not just while debranding is
    // still pending. This is distinct from the other blockedReasons above,
    // which are derived fresh from live contract/insurance/exclusivity state
    // and recover automatically once that state is restored.
    if (offboarding.status !== "none") {
      blockedReasons.push("offboarding_pending_debranding");
    }

    if (!dispatchableFlag) {
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
      offboarding,
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
      previous.offboarding.status !== next.offboarding.status ||
      previous.offboarding.debrandingStatus !==
        next.offboarding.debrandingStatus ||
      previous.dispatch.eligible !== next.dispatch.eligible ||
      previous.dispatch.blockedReasons.join("|") !==
        next.dispatch.blockedReasons.join("|")
    );
  }

  private selectPrimaryContract(
    vehicleId: string,
    evaluatedAt: string,
    records: VehicleContractRecord[] = this.contracts,
  ): VehicleContractRecord | null {
    const priority: Record<VehicleContractLifecycleStatus, number> = {
      missing: 0,
      terminated: 1,
      expired: 2,
      draft: 3,
      active: 4,
    };

    const candidates = records
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
    records: InsurancePolicyRecord[] = this.policies,
  ): InsurancePolicyRecord | null {
    const priority: Record<InsurancePolicyLifecycleStatus, number> = {
      missing: 0,
      cancelled: 1,
      expired: 2,
      pending: 3,
      active: 4,
    };

    const candidates = records
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
    records: DispatchExclusivityRecord[] = this.exclusivities,
  ): DispatchExclusivityRecord | null {
    const priority: Record<DispatchExclusivityLifecycleStatus, number> = {
      missing: 0,
      rejected: 1,
      revoked: 2,
      expired: 3,
      pending_review: 4,
      active: 5,
    };

    const candidates = records
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
    const lifecycle = vehicle.supplyLifecycle
      ? this.cloneSupplyLifecycle(vehicle.supplyLifecycle)
      : createEmptySupplyLifecycle(updatedAt);
    return {
      ...vehicle,
      licenseType: this.normalizeVehicleLicenseType(vehicle.licenseType),
      supportedServiceBuckets: [...vehicle.supportedServiceBuckets],
      // A row persisted before `createdAt` existed cannot tell us when the
      // vehicle joined. `updatedAt` is the earliest moment we can actually
      // evidence, so the monthly delta counts such a vehicle from then rather
      // than inventing a registration date it would report to a regulator.
      createdAt: vehicle.createdAt ?? updatedAt,
      updatedAt,
      supplyLifecycle: {
        ...lifecycle,
        offboarding: this.normalizeOffboarding(lifecycle.offboarding),
      },
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

  private cloneDriver(driver: DriverRegistryRecord): DriverRegistryRecord {
    return {
      ...driver,
      supportedServiceBuckets: [...driver.supportedServiceBuckets],
      eligibilityBlockedReasons: [...driver.eligibilityBlockedReasons],
      deviceBindings: driver.deviceBindings.map((binding) => ({ ...binding })),
    };
  }

  private decorateDriver(
    driver: DriverRegistryRecord,
    referenceDateMs: number = Date.now(),
  ): DriverRegistryRecord {
    const profile = this.driverProfileService.findProfileForDriver(
      driver.driverId,
    );
    const licensesValid =
      driver.licensesValid !== false &&
      areDriverLicensesValid(driver, referenceDateMs);
    const candidate: DriverRegistryRecord = {
      ...driver,
      licensesValid,
    };
    const eligibilityBlockedReasons =
      this.computeDriverEligibilityBlockedReasons(candidate);
    if (this.hasActiveMatchingSuppression(driver.driverId, referenceDateMs))
      eligibilityBlockedReasons.push("incident_matching_suppression");

    return {
      ...candidate,
      supportedServiceBuckets: [...driver.supportedServiceBuckets],
      eligibilityBlockedReasons,
      dispatchEligible: eligibilityBlockedReasons.length === 0,
      profileUpdatedAt: profile?.updatedAt ?? null,
      deviceBindings: profile
        ? profile.deviceBindings.map((binding) => ({ ...binding }))
        : [],
    };
  }

  private normalizeVehicleLicenseType(
    licenseType?: string | null,
  ): VehicleLicenseType | null {
    switch (licenseType) {
      case "taxi":
      case "multi_purpose_taxi":
      case "rental_car":
      case "business_vehicle":
      case "airport_transfer_vehicle":
        return licenseType;
      default:
        return null;
    }
  }

  private computeDriverEligibilityBlockedReasons(
    driver: DriverRegistryRecord,
  ): DriverEligibilityBlockReason[] {
    const blockedReasons: DriverEligibilityBlockReason[] = [];
    if (driver.lifecycleStatus === "draft") {
      blockedReasons.push("lifecycle_draft");
    } else if (driver.lifecycleStatus === "suspended") {
      blockedReasons.push("lifecycle_suspended");
    } else if (driver.lifecycleStatus === "retired") {
      blockedReasons.push("lifecycle_retired");
    }
    if (!driver.licensesValid) {
      blockedReasons.push("licenses_invalid");
    }
    if (driver.workState !== "available") {
      blockedReasons.push(
        `work_state_${driver.workState}` as DriverEligibilityBlockReason,
      );
    }
    return blockedReasons;
  }

  private buildDriverAuditSummary(
    driver: DriverRegistryRecord,
    reason: string | null,
  ) {
    return {
      driverId: driver.driverId,
      lifecycleStatus: driver.lifecycleStatus,
      workState: driver.workState,
      licensesValid: driver.licensesValid,
      dispatchEligible: driver.dispatchEligible,
      eligibilityBlockedReasons: [...driver.eligibilityBlockedReasons],
      serviceBuckets: [...driver.supportedServiceBuckets],
      deviceBindingCount: driver.deviceBindings.length,
      reason,
      updatedAt: driver.updatedAt,
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
      offboarding: this.normalizeOffboarding(lifecycle.offboarding),
      lastTrace: lifecycle.lastTrace
        ? this.cloneTrace(lifecycle.lastTrace)
        : null,
    };
  }

  private normalizeOffboarding(
    offboarding: VehicleSupplyLifecycleRecord["offboarding"] | undefined,
  ): VehicleSupplyLifecycleRecord["offboarding"] {
    return {
      status: offboarding?.status ?? "none",
      reason: offboarding?.reason ?? null,
      requestedAt: offboarding?.requestedAt ?? null,
      effectiveAt: offboarding?.effectiveAt ?? null,
      completedAt: offboarding?.completedAt ?? null,
      requestedBy: offboarding?.requestedBy ?? null,
      debrandingRequired: offboarding?.debrandingRequired ?? false,
      debrandingStatus: offboarding?.debrandingStatus ?? "not_required",
      debrandingDueAt: offboarding?.debrandingDueAt ?? null,
      debrandingCompletedAt: offboarding?.debrandingCompletedAt ?? null,
      debrandingTicketId: offboarding?.debrandingTicketId ?? null,
      notes: offboarding?.notes ?? null,
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

  private applyLatestDriverLocation(location: DriverLocationSnapshot): boolean {
    const existing = this.latestDriverLocations.get(location.driverId);
    if (
      existing &&
      Date.parse(existing.recordedAt) >= Date.parse(location.recordedAt)
    ) {
      return false;
    }

    this.setLatestDriverLocation(location);
    return true;
  }

  private setLatestDriverHeartbeatUpload(
    upload: Pick<
      DriverHeartbeatContext,
      | "eventId"
      | "deviceId"
      | "driverId"
      | "sequenceNo"
      | "recordedAt"
      | "receivedAt"
    >,
  ): void {
    const existing = this.latestDriverHeartbeatUploads.get(upload.driverId);
    if (
      existing &&
      Date.parse(existing.receivedAt) > Date.parse(upload.receivedAt)
    ) {
      return;
    }

    this.latestDriverHeartbeatUploads.set(upload.driverId, { ...upload });
  }

  private setCurrentDriverHeartbeatContext(
    context: DriverHeartbeatContext,
  ): void {
    const existing = this.currentDriverHeartbeatContexts.get(context.driverId);
    if (
      existing &&
      Date.parse(existing.recordedAt) > Date.parse(context.recordedAt)
    ) {
      return;
    }

    this.currentDriverHeartbeatContexts.set(context.driverId, { ...context });
  }

  private async resolveLatestDriverLocation(
    driverId: string,
  ): Promise<DriverLocationSnapshot | null> {
    const inMemory = this.latestDriverLocations.get(driverId);
    if (inMemory) {
      return this.cloneDriverLocation(inMemory);
    }

    return (
      (await this.regulatoryRegistryRepository?.findLatestDriverLocation?.(
        driverId,
      )) ?? null
    );
  }

  private async resolveCurrentDriverHeartbeatContext(
    driverId: string,
    currentLocation: DriverLocationSnapshot | null,
  ): Promise<DriverHeartbeatContext | null> {
    const inMemory = this.currentDriverHeartbeatContexts.get(driverId);
    if (
      inMemory &&
      (!currentLocation || inMemory.recordedAt === currentLocation.recordedAt)
    ) {
      return { ...inMemory };
    }

    if (!currentLocation) {
      return null;
    }

    const persisted =
      await this.regulatoryRegistryRepository?.findDriverHeartbeatEventByRecordedAt?.(
        driverId,
        currentLocation.recordedAt,
        currentLocation.updatedAt,
      );
    return persisted ? { ...persisted } : null;
  }

  private classifyDriverLocationFreshness(
    location: DriverLocationSnapshot | null,
  ): DriverLocationFreshness {
    if (!location) {
      return "missing";
    }

    if (Date.now() - Date.parse(location.updatedAt) > 90_000) {
      return "stale";
    }

    if (location.accuracyM !== null && location.accuracyM > 100) {
      return "low_accuracy";
    }

    return "fresh";
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
    if (!(value ?? "").trim()) {
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

  private assertSequenceNo(value: number, fieldName: string): void {
    if (!Number.isSafeInteger(value) || value < 0) {
      throw new ApiRequestError(
        HttpStatus.BAD_REQUEST,
        "INVALID_NUMBER",
        `${fieldName} must be a non-negative safe integer.`,
        {
          field: fieldName,
        },
      );
    }
  }

  private assertAllowedValue(
    value: string,
    fieldName: string,
    allowedValues: readonly string[],
  ): void {
    if (!allowedValues.includes(value)) {
      throw new ApiRequestError(
        HttpStatus.BAD_REQUEST,
        "FIELD_INVALID",
        `${fieldName} must be one of: ${allowedValues.join(", ")}.`,
        {
          field: fieldName,
          allowedValues,
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

  private getLocationRepository(): RegulatoryRegistryRepository | null {
    if (!this.regulatoryRegistryRepository?.isEnabled()) {
      return null;
    }

    return this.regulatoryRegistryRepository;
  }

  private requireContract(
    contractId: string,
    records: VehicleContractRecord[] = this.contracts,
  ) {
    const contract = records.find(
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

  private requirePolicy(
    policyId: string,
    records: InsurancePolicyRecord[] = this.policies,
  ) {
    const policy = records.find((candidate) => candidate.policyId === policyId);
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

  private withFinalExitWrite<T>(
    vehicleId: string,
    operation: () => Promise<T>,
  ): Promise<T> {
    const previous = this.finalExitWrites.get(vehicleId) ?? Promise.resolve();
    const current = previous.catch(() => undefined).then(operation);
    this.finalExitWrites.set(vehicleId, current);
    const release = () => {
      if (this.finalExitWrites.get(vehicleId) === current) {
        this.finalExitWrites.delete(vehicleId);
      }
    };
    void current.then(release, release);
    return current;
  }

  /** Publish only this acknowledged command's delta onto the current row. */
  private publishFinalExitChange(
    vehicleId: string,
    saved: VehicleRegistryRecord,
  ): VehicleRegistryRecord {
    const vehicle = this.requireVehicle(vehicleId);
    const previous = this.cloneSupplyLifecycle(vehicle.supplyLifecycle);
    // Do not replace the row with the pre-await snapshot: a legitimate peer
    // may have changed compliance or a manual hold while storage was pending.
    vehicle.supplyLifecycle = {
      ...vehicle.supplyLifecycle,
      offboarding: this.normalizeOffboarding(saved.supplyLifecycle.offboarding),
    };
    if (Date.parse(saved.updatedAt) > Date.parse(vehicle.updatedAt)) {
      vehicle.updatedAt = saved.updatedAt;
    }
    const updated = this.reconcileVehicleLifecycle(vehicleId, {
      entityType: "offboarding",
      ...(saved.supplyLifecycle.lastTrace
        ? { message: saved.supplyLifecycle.lastTrace.message }
        : {}),
      occurredAt: saved.updatedAt,
      relatedEntityId: vehicleId,
      emitEvent: false,
      persistContext: null,
    });
    if (this.didLifecycleChange(previous, updated.supplyLifecycle)) {
      this.opsDispatchEventsService.publishSupplyLifecycleUpdated(
        this.cloneVehicle(updated),
      );
    }
    return this.cloneVehicle(updated);
  }

  /**
   * Final-exit (offboarding/debranding) canonical writes must be confirmed,
   * not fire-and-forget: a success response here means the canonical
   * registry actually recorded the terminal state, and a storage failure
   * must reject the caller instead of only being logged.
   */
  private async persistFinalExitChangeOrThrow(
    changes: PersistRegulatoryRegistryChanges,
    context: string,
  ): Promise<void> {
    const repository = this.regulatoryRegistryRepository;
    if (!repository) {
      return;
    }
    try {
      await repository.persistChanges(changes);
    } catch (error) {
      repository.reportPersistenceFailure(error, context);
      throw error;
    }
  }

  private recordAudit(
    input: Omit<AuditLogRecord, "auditId" | "createdAt" | "requestId">,
    requestId?: string,
  ) {
    const log = { ...input };
    if (requestId) {
      (log as { requestId?: string }).requestId = requestId;
    }
    this.auditNotificationService.recordAuditLog(log);
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

  private readonly disclosureReviewWrites = new Map<string, Promise<unknown>>();
  private readonly disclosureReviewHistory: DisclosureReviewDecision[] = [];

  private assertDisclosureIdentity(
    identity: BootstrapRequestIdentity | null | undefined,
    write = false,
  ) {
    // Same scopes issued by the existing IAM catalogue/control-plane principal
    // and enforced by the original Registry route policy; reg.* UI labels are
    // not issued permissions and cannot authorize a canonical command.
    if (
      !identity?.actorId?.trim() ||
      !["platform", "ops"].includes(identity.realm ?? "") ||
      !identity.scopes.includes(write ? "regulatory:write" : "regulatory:read")
    ) {
      throw new ApiRequestError(
        403,
        "P5_REVIEW_AUTHORITY_REQUIRED",
        "Existing P5 reader/reviewer authority is required.",
      );
    }
    return identity as BootstrapRequestIdentity & { actorId: string };
  }

  private disclosureItem(
    type: DisclosureSubjectType,
    id: string,
    record: DisclosureRecord,
    history: DisclosureReviewDecision[],
    parent?: VehicleRegistryRecord | DriverRegistryRecord,
  ): DisclosureReviewItem {
    return {
      subjectType: type,
      subjectId: id,
      label:
        parent && "plateNo" in parent
          ? parent.plateNo
          : parent && "fullName" in parent
            ? String(parent.fullName)
            : id,
      sourceSubmissionId: record.sourceSubmissionId,
      version: record.version,
      record: publicDisclosureRecord(record, true),
      missingFieldCodes: disclosureMissingFields(record),
      history: history.map((decision) => ({
        ...structuredClone(decision),
        record: publicDisclosureRecord(decision.record),
      })),
    };
  }

  async listDisclosureReviews(
    identity: BootstrapRequestIdentity | null | undefined,
  ) {
    this.assertDisclosureIdentity(identity);
    const repository = this.regulatoryRegistryRepository;
    const records = repository?.isEnabled()
      ? await repository.listDisclosureReviewRecords()
      : {
          profiles: this.disclosureProfiles,
          credentials: this.driverCredentials,
        };
    const items: DisclosureReviewItem[] = [];
    for (const record of [...records.profiles, ...records.credentials]) {
      const type = "vehicleId" in record ? "vehicle" : "driver";
      const id = "vehicleId" in record ? record.vehicleId : record.driverId;
      items.push(await this.getDisclosureReview(type, id, identity));
    }
    return { items };
  }

  async getDisclosureReview(
    type: DisclosureSubjectType,
    id: string,
    identity: BootstrapRequestIdentity | null | undefined,
  ): Promise<DisclosureReviewItem> {
    this.assertDisclosureIdentity(identity);
    if (type !== "vehicle" && type !== "driver")
      throw new ApiRequestError(
        400,
        "INVALID_DISCLOSURE_SUBJECT",
        "Unknown review subject type.",
      );
    const repository = this.regulatoryRegistryRepository;
    if (repository?.isEnabled()) {
      const current = await repository.loadDisclosureReviewSubject(type, id);
      if (!current)
        throw new ApiRequestError(
          404,
          "DISCLOSURE_REVIEW_NOT_FOUND",
          "Canonical disclosure subject not found.",
        );
      return this.disclosureItem(
        type,
        id,
        current.record,
        await repository.loadDisclosureReviewHistory(type, id),
        current.parent,
      );
    }
    const record =
      type === "vehicle"
        ? this.getVehiclePassengerDisclosureProfile(id)
        : this.getDriverPublicRegistrationCredential(id);
    if (!record)
      throw new ApiRequestError(
        404,
        "DISCLOSURE_REVIEW_NOT_FOUND",
        "Canonical disclosure subject not found.",
      );
    const parent =
      type === "vehicle"
        ? this.vehicles.find((row) => row.vehicleId === id)
        : this.drivers.find((row) => row.driverId === id);
    if (!parent)
      throw new ApiRequestError(
        404,
        "DISCLOSURE_REVIEW_NOT_FOUND",
        "Canonical subject not found.",
      );
    return this.disclosureItem(
      type,
      id,
      record,
      this.disclosureReviewHistory.filter(
        (row) => row.subjectType === type && row.subjectId === id,
      ),
      parent,
    );
  }

  async reviewDisclosure(
    type: DisclosureSubjectType,
    id: string,
    command: DisclosureReviewCommand,
    operationKey: string | undefined,
    identity: BootstrapRequestIdentity | null | undefined,
  ) {
    const actor = this.assertDisclosureIdentity(identity, true);
    if (type !== "vehicle" && type !== "driver")
      throw new ApiRequestError(
        400,
        "INVALID_DISCLOSURE_SUBJECT",
        "Unknown review subject type.",
      );
    if (
      !operationKey?.trim() ||
      !["approve", "return"].includes(command?.action) ||
      !Number.isInteger(command.expectedVersion) ||
      command.expectedVersion < 1 ||
      !command.reason?.trim() ||
      !(
        command.sourceSubmissionId === null ||
        typeof command.sourceSubmissionId === "string"
      )
    )
      throw new ApiRequestError(
        400,
        "INVALID_DISCLOSURE_REVIEW",
        "A command key, current version/submission, action and review reason are required.",
      );
    const payloadHash = createHash("sha256")
      .update(
        JSON.stringify({
          type,
          id,
          actorId: actor.actorId,
          action: command.action,
          expectedVersion: command.expectedVersion,
          sourceSubmissionId: command.sourceSubmissionId,
          reason: command.reason.trim(),
        }),
      )
      .digest("hex");
    const subjectKey = `${type}:${id}`;
    const previous =
      this.disclosureReviewWrites.get(subjectKey) ?? Promise.resolve();
    const work = previous
      .catch(() => undefined)
      .then(async () => {
        const repository = this.regulatoryRegistryRepository!;
        const enabled = repository.isEnabled();
        const apply = async (executor?: RegulatoryRegistryQueryExecutor) => {
          const loaded = enabled
            ? await repository.loadDisclosureReviewSubject(
                type,
                id,
                executor,
                true,
              )
            : null;
          const current = enabled
            ? loaded?.record
            : type === "vehicle"
              ? this.getVehiclePassengerDisclosureProfile(id)
              : this.getDriverPublicRegistrationCredential(id);
          const parent = enabled
            ? loaded?.parent
            : type === "vehicle"
              ? this.vehicles.find((row) => row.vehicleId === id)
              : this.drivers.find((row) => row.driverId === id);
          if (!current || !parent)
            throw new ApiRequestError(
              404,
              "DISCLOSURE_REVIEW_NOT_FOUND",
              "Canonical subject and disclosure are required.",
            );
          const history = enabled
            ? await repository.loadDisclosureReviewHistory(type, id, executor)
            : this.disclosureReviewHistory.filter(
                (row) => row.subjectType === type && row.subjectId === id,
              );
          const replay = history.find(
            (row) => row.operationKey === operationKey,
          );
          if (replay) {
            if (replay.payloadHash !== payloadHash)
              throw new ApiRequestError(
                409,
                "IDEMPOTENCY_CONFLICT",
                "Review key is bound to a different command.",
              );
            return { decision: replay, parent };
          }
          if (
            current.version !== command.expectedVersion ||
            current.sourceSubmissionId !== command.sourceSubmissionId
          )
            throw new ApiRequestError(
              409,
              "DISCLOSURE_VERSION_CONFLICT",
              "The canonical submission/version changed; reload before reviewing.",
            );
          const missing = disclosureMissingFields(current);
          if (
            command.action === "approve" &&
            (missing.length ||
              ["suspended", "revoked"].includes(current.status))
          )
            throw new ApiRequestError(
              409,
              "DISCLOSURE_NOT_REVIEWABLE",
              "Required fields, source and current validity must be resolved before approval.",
              { missingFieldCodes: missing },
            );
          const now = new Date().toISOString();
          const updated = {
            ...structuredClone(current),
            version: current.version + 1,
            updatedAt: now,
            verifiedAt: command.action === "approve" ? now : null,
            verifiedByActorId:
              command.action === "approve" ? actor.actorId : null,
          } as DisclosureRecord;
          if ("vehicleId" in updated)
            updated.status =
              command.action === "approve"
                ? "complete"
                : current.status === "suspended"
                  ? "suspended"
                  : "incomplete";
          else
            updated.status =
              command.action === "approve"
                ? "verified_active"
                : ["revoked", "suspended", "expired"].includes(current.status)
                  ? (current.status as DriverPublicRegistrationCredential["status"])
                  : "unverified";
          const decision: DisclosureReviewDecision = {
            decisionId: randomUUID(),
            operationKey,
            payloadHash,
            actorId: actor.actorId,
            actorType:
              actor.actorType === "driver_user" ? "system" : actor.actorType,
            subjectType: type,
            subjectId: id,
            action: command.action,
            reason: command.reason.trim(),
            sourceSubmissionId: current.sourceSubmissionId,
            fromVersion: current.version,
            toVersion: updated.version,
            decidedAt: now,
            record: publicDisclosureRecord(updated),
            previousRecord: publicDisclosureRecord(current),
          };
          if (enabled) {
            const parentSnapshot = {
              ...structuredClone(parent),
              updatedAt: now,
            };
            await repository.persistChangesWithExecutor(
              executor!,
              type === "vehicle"
                ? {
                    disclosureProfiles: [
                      updated as VehiclePassengerDisclosureProfile,
                    ],
                    vehicles: [parentSnapshot as VehicleRegistryRecord],
                  }
                : {
                    driverCredentials: [
                      updated as DriverPublicRegistrationCredential,
                    ],
                    drivers: [parentSnapshot as DriverRegistryRecord],
                  },
            );
            await repository.appendDisclosureReview(executor!, decision);
          }
          return { decision, parent, updated };
        };
        const result = enabled
          ? await repository.withTransaction((client) => apply(client))
          : await apply();
        // Only the acknowledged review delta is published; never replace Registry state.
        if (result.updated) {
          const currentParent =
            type === "vehicle"
              ? this.vehicles.find((row) => row.vehicleId === id)
              : this.drivers.find((row) => row.driverId === id);
          if (
            currentParent &&
            Date.parse(result.decision.decidedAt) >
              Date.parse(currentParent.updatedAt)
          )
            currentParent.updatedAt = result.decision.decidedAt;
          if ("vehicleId" in result.updated)
            this.disclosureProfiles = [
              ...this.disclosureProfiles.filter((row) => row.vehicleId !== id),
              structuredClone(result.updated),
            ];
          else
            this.driverCredentials = [
              ...this.driverCredentials.filter((row) => row.driverId !== id),
              structuredClone(result.updated),
            ];
          if (!enabled)
            this.disclosureReviewHistory.push(structuredClone(result.decision));
          this.auditNotificationService.recordAuditLog({
            auditId: result.decision.decisionId,
            actorId: actor.actorId,
            actorType: result.decision.actorType,
            tenantId: null,
            moduleName: "regulatory-registry",
            actionName: "p5_disclosure_review",
            resourceType: `p5_disclosure_${type}`,
            resourceId: id,
            oldValuesSummary: { record: result.decision.previousRecord },
            newValuesSummary: { p5Review: result.decision },
            requestId: operationKey,
          });
        }
        return {
          decision: {
            ...structuredClone(result.decision),
            record: publicDisclosureRecord(result.decision.record),
          },
          subject: await this.getDisclosureReview(type, id, actor),
        };
      });
    this.disclosureReviewWrites.set(subjectKey, work);
    try {
      return await work;
    } finally {
      if (this.disclosureReviewWrites.get(subjectKey) === work)
        this.disclosureReviewWrites.delete(subjectKey);
    }
  }

  getVehiclePassengerDisclosureProfile(
    vehicleId: string,
  ): VehiclePassengerDisclosureProfile | null {
    const profile = this.disclosureProfiles.find(
      (p) => p.vehicleId === vehicleId,
    );
    return profile ? { ...profile } : null;
  }

  getDriverDeclaredSurnameSnapshot(
    driverId: string,
  ): DriverDeclaredSurnameSnapshot | null {
    // This is a declared profile-view snapshot, never an inferred surname or
    // proof of legal identity/current cross-replica database revision.
    const profile = this.driverProfileService.findProfileForDriver(driverId);
    if (
      !profile ||
      !Object.prototype.hasOwnProperty.call(profile, "driverSurname") ||
      typeof profile.driverSurname !== "string" ||
      !profile.driverSurname.trim() ||
      typeof profile.updatedAt !== "string" ||
      !profile.updatedAt.trim() ||
      !Number.isFinite(Date.parse(profile.updatedAt))
    ) {
      return null;
    }
    return {
      driverSurname: profile.driverSurname,
      driverSurnameSource: "driver_profile_declared",
      driverSurnameProfileUpdatedAt: profile.updatedAt,
    };
  }

  getDriverPublicRegistrationCredential(
    driverId: string,
  ): DriverPublicRegistrationCredential | null {
    const cred = this.driverCredentials.find((c) => c.driverId === driverId);
    return cred ? { ...cred } : null;
  }

  /** Refresh only this completion's declared profile and public credential.
   * Database absence is authoritative; never replace it with a startup seed. */
  async getDriverCompletionReceiptIdentity(driverId: string) {
    await this.driverProfileService.prepareProfileAuthority(driverId);
    const surname = this.getDriverDeclaredSurnameSnapshot(driverId);
    const repository = this.regulatoryRegistryRepository;
    const credential = repository?.isEnabled()
      ? await repository.findDriverPublicRegistrationCredential(driverId)
      : this.getDriverPublicRegistrationCredential(driverId);
    // Public display formats used elsewhere can contain prefixes. Preserve a
    // valid E04 mask; otherwise project only known trailing registration digits.
    const publicMask = credential?.maskedDisplay?.trim();
    const registrationSuffix = credential?.registrationNo
      ?.trim()
      .match(/([0-9]{1,4})$/)?.[1];
    const driverRegistrationMasked =
      publicMask && /^[•*●Xx]{4,}[0-9]{1,4}$/.test(publicMask)
        ? publicMask
        : registrationSuffix
          ? `••••${registrationSuffix}`
          : null;
    return {
      surname,
      driverRegistrationMasked,
    };
  }

  listVehiclePassengerDisclosureProfiles(): VehiclePassengerDisclosureProfile[] {
    return this.disclosureProfiles.map((p) => ({ ...p }));
  }

  listDriverPublicRegistrationCredentials(): DriverPublicRegistrationCredential[] {
    return this.driverCredentials.map((c) => ({ ...c }));
  }

  private runInMemoryIdempotentBackfill() {
    const regProfiles = [
      {
        driverId: "drv-demo-001",
        taxiRegistrationNo: "REG-TAXI-0001",
        taxiRegistrationExpiry: "2027-12-31",
      },
      {
        driverId: "drv-demo-002",
        taxiRegistrationNo: "REG-TAXI-0002",
        taxiRegistrationExpiry: "2027-12-31",
      },
      {
        driverId: "drv-demo-003",
        taxiRegistrationNo: "REG-BIZ-0001",
        taxiRegistrationExpiry: "2027-12-31",
      },
    ];

    for (const driver of this.drivers) {
      const exists = this.driverCredentials.some(
        (c) => c.driverId === driver.driverId,
      );
      if (!exists) {
        const profile = regProfiles.find((p) => p.driverId === driver.driverId);
        if (profile) {
          const registrationNo = profile.taxiRegistrationNo;
          const maskedDisplay =
            registrationNo.length <= 4
              ? "***"
              : `${registrationNo.slice(0, 2)}***${registrationNo.slice(-2)}`;
          this.driverCredentials.push({
            driverId: driver.driverId,
            registrationNo,
            registrationArea: null,
            effectiveFrom: null,
            effectiveUntil: profile.taxiRegistrationExpiry,
            status: "unverified",
            maskedDisplay,
            verifiedByActorId: null,
            verifiedAt: null,
            sourceSubmissionId: null,
            version: 1,
            updatedAt: new Date().toISOString(),
          });
        } else {
          this.driverCredentials.push({
            driverId: driver.driverId,
            registrationNo: null,
            registrationArea: null,
            effectiveFrom: null,
            effectiveUntil: null,
            status: "missing",
            maskedDisplay: "***",
            verifiedByActorId: null,
            verifiedAt: null,
            sourceSubmissionId: null,
            version: 1,
            updatedAt: new Date().toISOString(),
          });
        }
      }
    }
  }

  async handleDriverLicenseRenewal(
    driverId: string,
    command: UpdateDriverLicensesCommand,
  ): Promise<void> {
    if (
      !this.regulatoryRegistryRepository?.supersedeActiveExpiryEventsForEntity
    )
      return;
    const now = Date.now();
    if (command.licenseExpiry && Date.parse(command.licenseExpiry) > now) {
      await this.regulatoryRegistryRepository.supersedeActiveExpiryEventsForEntity(
        "driver",
        driverId,
        "driver_license",
      );
    }
    if (
      command.professionalDriverLicenseExpiry &&
      Date.parse(command.professionalDriverLicenseExpiry) > now
    ) {
      await this.regulatoryRegistryRepository.supersedeActiveExpiryEventsForEntity(
        "driver",
        driverId,
        "professional_driver_license",
      );
    }
    if (
      command.taxiDriverRegistrationExpiry &&
      Date.parse(command.taxiDriverRegistrationExpiry) > now
    ) {
      await this.regulatoryRegistryRepository.supersedeActiveExpiryEventsForEntity(
        "driver",
        driverId,
        "taxi_driver_registration",
      );
    }
    if (
      command.licenseExpiry !== undefined ||
      command.professionalDriverLicenseExpiry !== undefined ||
      command.taxiDriverRegistrationExpiry !== undefined
    ) {
      const repository = this.regulatoryRegistryRepository;
      await repository.withTransaction(async (client) => {
        const driver = repository.isEnabled()
          ? await repository.lockDriver(driverId, client)
          : this.drivers.find((d) => d.driverId === driverId);
        for (const [credential, field] of Object.entries(
          PREEXPIRY_CREDENTIAL_FIELDS,
        )) {
          for (const days of [30, 7]) {
            const previous = await repository.findActiveExpiryEventsForEntity(
              "driver",
              driverId,
              `preexpiry:${credential}:${days}`,
              client,
            );
            const changed = previous.filter((event) => {
              const expiry =
                event.source_expiry_at instanceof Date
                  ? event.source_expiry_at.getTime()
                  : Date.parse(event.source_expiry_at ?? "");
              return !driver || expiry !== Date.parse(driver[field] ?? "");
            });
            await repository.supersedeExpiryEvents(
              changed.map((e) => e.event_id),
              undefined,
              client,
            );
          }
        }
      });
    }
  }

  async getExpiryBacklog(filter?: {
    scope?: string | undefined;
    entityType?: ExpiryEntityType | undefined;
    status?: ExpiryEventStatus | undefined;
    limit?: number | undefined;
  }): Promise<RegistryExpiryEventWithIntent[]> {
    if (!this.regulatoryRegistryRepository?.listExpiryEvents) return [];
    return this.regulatoryRegistryRepository.listExpiryEvents(filter);
  }

  async getExpiryReceipts(filter?: {
    tenantId?: string | undefined;
    deliveryStatus?: DeliveryIntentStatus | undefined;
    limit?: number | undefined;
  }): Promise<RegistryExpiryDeliveryIntentRow[]> {
    if (!this.regulatoryRegistryRepository?.listDeliveryIntents) return [];
    return this.regulatoryRegistryRepository.listDeliveryIntents(filter);
  }

  async getExpiryEvent(
    eventId: string,
  ): Promise<RegistryExpiryEventWithIntent | null> {
    if (!this.regulatoryRegistryRepository?.getExpiryEventById) return null;
    return this.regulatoryRegistryRepository.getExpiryEventById(eventId);
  }

  /** Separate T30/T7 identities, using the existing event/immutable-intent tables.
   * Never changes a license, expiry/B4 identity, dispatch flag, or mail drain. */
  private async preparePreexpiryReminders(
    asOf: string,
    scope: string,
    limit: number,
  ) {
    const repository = this.regulatoryRegistryRepository!;
    const asOfMs = Date.parse(asOf);
    const isValidEmail = (value: string | undefined | null): value is string =>
      Boolean(
        value &&
          value.length <= 254 &&
          /^[A-Za-z0-9.!#$%&'*+/=?^_`{|}~-]+@[A-Za-z0-9.-]+$/.test(value),
      );
    const configured = process.env.REGULATORY_ALERT_RECIPIENT_EMAIL?.trim();
    // Same address syntax as existing NotificationDeliveryService, before freezing an intent.
    const platformRecipient = isValidEmail(configured) ? configured : null;
    const result: NonNullable<ReconcileExpiryResult["preexpiry"]> = {
      eventsCreated: 0,
      intentsCreated: 0,
      recipientStatus: platformRecipient ? "configured" : "unavailable",
      deliveryStatus:
        this.notificationDeliveryService?.availability() ?? "unavailable",
    };

    const resolveRecipients = async (
      partnerIds: readonly (string | undefined | null)[],
      directEmails: readonly (string | undefined | null)[] = [],
    ): Promise<string[]> => {
      const normalizedPartnerIds = [
        ...new Set(
          partnerIds
            .map((id) => id?.trim())
            .filter((id): id is string => Boolean(id)),
        ),
      ];
      const partnerEmails: string[] = [];
      if (normalizedPartnerIds.length > 0) {
        const repoEmails =
          (await repository.findFleetPartnerContactEmails?.(
            normalizedPartnerIds,
          )) ?? [];
        partnerEmails.push(...repoEmails);

        const envPartnerContacts =
          process.env.REGULATORY_FLEET_PARTNER_CONTACT_EMAILS?.trim();
        if (envPartnerContacts) {
          try {
            const parsed = JSON.parse(envPartnerContacts) as Record<
              string,
              string | string[]
            >;
            if (parsed && typeof parsed === "object" && !Array.isArray(parsed)) {
              for (const pid of normalizedPartnerIds) {
                const entry = parsed[pid];
                if (typeof entry === "string") partnerEmails.push(entry.trim());
                else if (Array.isArray(entry)) {
                  for (const addr of entry) {
                    if (typeof addr === "string")
                      partnerEmails.push(addr.trim());
                  }
                }
              }
            }
          } catch {
            for (const token of envPartnerContacts.split(/[,;]+/)) {
              const trimmed = token.trim();
              const eqIdx = trimmed.indexOf("=");
              const colonIdx = trimmed.indexOf(":");
              const sepIdx = eqIdx > 0 ? eqIdx : colonIdx;
              if (sepIdx > 0) {
                const pid = trimmed.slice(0, sepIdx).trim();
                const addr = trimmed.slice(sepIdx + 1).trim();
                if (normalizedPartnerIds.includes(pid)) {
                  partnerEmails.push(addr);
                }
              }
            }
          }
        }
      }
      for (const direct of directEmails) {
        if (typeof direct === "string" && direct.trim()) {
          partnerEmails.push(direct.trim());
        }
      }
      const recipients = [
        ...new Set([
          ...partnerEmails.filter(isValidEmail),
          ...(platformRecipient ? [platformRecipient] : []),
        ]),
      ];
      if (recipients.length > 0) {
        result.recipientStatus = "configured";
      }
      return recipients;
    };

    const vehiclePartnerIds = new Map<string, Set<string>>();
    const registerVehiclePartner = (
      vehicleId: string | undefined | null,
      partnerId: string | undefined | null,
    ) => {
      const vId = vehicleId?.trim();
      const pId = partnerId?.trim();
      if (!vId || !pId) return;
      const set = vehiclePartnerIds.get(vId) ?? new Set<string>();
      set.add(pId);
      vehiclePartnerIds.set(vId, set);
    };
    for (const contract of this.contracts) {
      if (contract.status !== "terminated") {
        registerVehiclePartner(contract.vehicleId, contract.partnerId);
      }
    }

    const fromEmail =
      process.env.NOTIFICATION_FROM_EMAIL?.trim() || "noreply@fleet.drts.local";

    const enabled = repository.isEnabled();
    const memoryDrivers = enabled
      ? []
      : [...this.drivers].sort((a, b) =>
          a.driverId < b.driverId ? -1 : a.driverId > b.driverId ? 1 : 0,
        );
    const memoryContracts = enabled
      ? []
      : [...this.contracts].sort((a, b) =>
          a.contractId < b.contractId ? -1 : a.contractId > b.contractId ? 1 : 0,
        );
    const memoryPolicies = enabled
      ? []
      : [...this.policies].sort((a, b) =>
          a.policyId < b.policyId ? -1 : a.policyId > b.policyId ? 1 : 0,
        );
    const upperBounds = enabled
      ? await repository.getExpiryScanUpperBounds()
      : {
          driverId: memoryDrivers.at(-1)?.driverId ?? null,
          policyId: null,
          preexpiryPolicyId: memoryPolicies.at(-1)?.policyId ?? null,
          preexpiryContractId: memoryContracts.at(-1)?.contractId ?? null,
        };

    // 1. Driver credential pre-expiry reminders (T-30 and T-7)
    const upperDriver = upperBounds.driverId;
    let afterDriverId: string | undefined;
    while (upperDriver !== null) {
      const page = enabled
        ? await repository.scanPreexpiryDrivers(asOf, limit, {
            ...(afterDriverId ? { afterId: afterDriverId } : {}),
            throughId: upperDriver,
          })
        : memoryDrivers
            .filter((d) => !afterDriverId || d.driverId > afterDriverId)
            .slice(0, limit);
      if (!page.length) break;
      await repository.withTransaction(async (client) => {
        for (const driverId of [
          ...new Set(page.map((d) => d.driverId)),
        ].sort()) {
          const driver = enabled
            ? await repository.lockDriver(driverId, client)
            : this.drivers.find((d) => d.driverId === driverId);
          if (!driver) continue;
          const driverPartnerIds: string[] = [];
          const directPartnerId = (driver as { partnerId?: string }).partnerId;
          if (directPartnerId) driverPartnerIds.push(directPartnerId);
          for (const pair of this.supplyPairs) {
            if (pair.driverId === driverId) {
              for (const pid of vehiclePartnerIds.get(pair.vehicleId) ?? []) {
                driverPartnerIds.push(pid);
              }
            }
          }
          const recipients = await resolveRecipients(driverPartnerIds);
          for (const [credential, field] of Object.entries(
            PREEXPIRY_CREDENTIAL_FIELDS,
          )) {
            const expiry = driver[field];
            const expiryMs = Date.parse(expiry ?? "");
            for (const days of [30, 7] as const) {
              const family = `preexpiry:${credential}:${days}`;
              const prior = await repository.findActiveExpiryEventsForEntity(
                "driver",
                driverId,
                family,
                client,
              );
              const obsolete = prior.filter((e) => {
                const recorded =
                  e.source_expiry_at instanceof Date
                    ? e.source_expiry_at.getTime()
                    : Date.parse(e.source_expiry_at ?? "");
                return (
                  recorded !== expiryMs ||
                  driver.lifecycleStatus !== "active" ||
                  (expiryMs <= asOfMs && e.status !== "completed")
                );
              });
              await repository.supersedeExpiryEvents(
                obsolete.map((e) => e.event_id),
                undefined,
                client,
              );
              if (
                !expiry ||
                !Number.isFinite(expiryMs) ||
                driver.lifecycleStatus !== "active" ||
                expiryMs <= asOfMs ||
                expiryMs - days * 86400000 > asOfMs
              )
                continue;
              const fingerprint = createHash("sha256")
                .update(
                  JSON.stringify([
                    "credential-preexpiry/v1",
                    scope,
                    "driver",
                    driverId,
                    field,
                    expiryMs,
                    days,
                  ]),
                )
                .digest("hex");
              let event = await repository.findExpiryEventByFingerprint(
                fingerprint,
                client,
              );
              if (!event) {
                const eventId = randomUUID();
                event = await repository.insertExpiryEvent(
                  {
                    eventId,
                    scope,
                    entityType: "driver",
                    entityId: driverId,
                    credentialType: family,
                    sourceFingerprint: fingerprint,
                    sourceExpiryAt: expiry,
                    status: "pending",
                  },
                  client,
                );
                if (event.event_id === eventId) result.eventsCreated++;
              }
              if (
                event.status === "superseded" ||
                recipients.length === 0 ||
                (await repository.getExpiryEventById(event.event_id, client))
                  ?.intent
              )
                continue;
              for (const recipientEmail of recipients) {
                const intentId = randomUUID();
                const intent = await repository.insertDeliveryIntent(
                  {
                    intentId,
                    eventId: event.event_id,
                    scope,
                    tenantId: scope,
                    idempotencyKey:
                      "credential-preexpiry-mail/v1:" +
                      createHash("sha256")
                        .update(
                          JSON.stringify([
                            scope,
                            event.event_id,
                            recipientEmail,
                          ]),
                        )
                        .digest("hex"),
                    recipientEmail,
                    fromEmail,
                    subject: `[DRTS Reminder] Credential T-${days}: ${credential} for driver ${driverId}`,
                    body: `Driver ${driverId}; credential ${credential}; source expiry ${new Date(expiryMs).toISOString()}; milestone T-${days}.`,
                  },
                  client,
                );
                if (intent.intent_id === intentId) result.intentsCreated++;
              }
            }
          }
        }
      });
      const next = page.at(-1)!.driverId;
      if (afterDriverId !== undefined && next <= afterDriverId)
        throw new Error("registry_preexpiry_scan_did_not_advance");
      afterDriverId = next;
      if (next === upperDriver) break;
    }

    // 2. Vehicle contract pre-expiry reminders (T-30 and T-7)
    const upperContract = upperBounds.preexpiryContractId ?? null;
    let afterContractId: string | undefined;
    while (upperContract !== null) {
      const page = enabled
        ? await repository.scanPreexpiryContracts(asOf, limit, {
            ...(afterContractId ? { afterId: afterContractId } : {}),
            throughId: upperContract,
          })
        : memoryContracts
            .filter(
              (c) => !afterContractId || c.contractId > afterContractId,
            )
            .slice(0, limit);
      if (!page.length) break;
      for (const item of page) {
        if (item.status !== "terminated") {
          registerVehiclePartner(item.vehicleId, item.partnerId);
        }
      }
      await repository.withTransaction(async (client) => {
        for (const contractId of [
          ...new Set(page.map((c) => c.contractId)),
        ].sort()) {
          const contract = enabled
            ? await repository.lockContract(contractId, client)
            : this.contracts.find((c) => c.contractId === contractId);
          if (!contract) continue;
          if (contract.status !== "terminated") {
            registerVehiclePartner(contract.vehicleId, contract.partnerId);
          }
          const evaluatedContract = this.applyContractLifecycle(
            this.cloneContract(contract),
            asOf,
          );
          const expiry = contract.endAt;
          const expiryMs = Date.parse(expiry ?? "");
          const isContractActive =
            contract.status === "active" &&
            evaluatedContract.lifecycleStatus === "active";
          const extraContractRecord = contract as VehicleContractRecord & {
            partnerContactEmail?: string;
            partnerContactEmails?: readonly string[];
          };
          const directContractEmails = [
            extraContractRecord.partnerContactEmail,
            ...(extraContractRecord.partnerContactEmails ?? []),
          ];
          const contractPartnerIds = [
            contract.partnerId,
            ...(vehiclePartnerIds.get(contract.vehicleId) ?? []),
          ];
          const recipients = await resolveRecipients(
            contractPartnerIds,
            directContractEmails,
          );

          for (const days of [30, 7] as const) {
            const family = `preexpiry:vehicle_contract:${days}`;
            const prior = await repository.findActiveExpiryEventsForEntity(
              "policy",
              contractId,
              family,
              client,
            );
            const obsolete = prior.filter((e) => {
              const recorded =
                e.source_expiry_at instanceof Date
                  ? e.source_expiry_at.getTime()
                  : Date.parse(e.source_expiry_at ?? "");
              return (
                recorded !== expiryMs ||
                !isContractActive ||
                (expiryMs <= asOfMs && e.status !== "completed")
              );
            });
            await repository.supersedeExpiryEvents(
              obsolete.map((e) => e.event_id),
              undefined,
              client,
            );
            if (
              !expiry ||
              !Number.isFinite(expiryMs) ||
              !isContractActive ||
              expiryMs <= asOfMs ||
              expiryMs - days * 86400000 > asOfMs
            )
              continue;
            const fingerprint = createHash("sha256")
              .update(
                JSON.stringify([
                  "credential-preexpiry/v1",
                  scope,
                  "policy",
                  contractId,
                  "endAt",
                  expiryMs,
                  days,
                ]),
              )
              .digest("hex");
            let event = await repository.findExpiryEventByFingerprint(
              fingerprint,
              client,
            );
            if (!event) {
              const eventId = randomUUID();
              event = await repository.insertExpiryEvent(
                {
                  eventId,
                  scope,
                  entityType: "policy",
                  entityId: contractId,
                  credentialType: family,
                  sourceFingerprint: fingerprint,
                  sourceExpiryAt: expiry,
                  status: "pending",
                },
                client,
              );
              if (event.event_id === eventId) result.eventsCreated++;
            }
            if (
              event.status === "superseded" ||
              recipients.length === 0 ||
              (await repository.getExpiryEventById(event.event_id, client))
                ?.intent
            )
              continue;
            for (const recipientEmail of recipients) {
              const intentId = randomUUID();
              const intent = await repository.insertDeliveryIntent(
                {
                  intentId,
                  eventId: event.event_id,
                  scope,
                  tenantId: scope,
                  idempotencyKey:
                    "credential-preexpiry-mail/v1:" +
                    createHash("sha256")
                      .update(
                        JSON.stringify([
                          scope,
                          event.event_id,
                          recipientEmail,
                        ]),
                      )
                      .digest("hex"),
                  recipientEmail,
                  fromEmail,
                  subject: `[DRTS Reminder] Vehicle Contract T-${days}: ${contract.contractId} for vehicle ${contract.vehicleId}`,
                  body: `Vehicle contract ${contract.contractId} (type: ${contract.contractType}, partner: ${contract.partnerId}) for vehicle ${contract.vehicleId}; source expiry ${new Date(expiryMs).toISOString()}; milestone T-${days}.`,
                },
                client,
              );
              if (intent.intent_id === intentId) result.intentsCreated++;
            }
          }
        }
      });
      const next = page.at(-1)!.contractId;
      if (afterContractId !== undefined && next <= afterContractId)
        throw new Error("registry_preexpiry_contract_scan_did_not_advance");
      afterContractId = next;
      if (next === upperContract) break;
    }

    // 3. Insurance policy pre-expiry reminders (T-30 and T-7)
    const upperPolicy = upperBounds.preexpiryPolicyId ?? null;
    let afterPolicyId: string | undefined;
    while (upperPolicy !== null) {
      const page = enabled
        ? await repository.scanPreexpiryPolicies(asOf, limit, {
            ...(afterPolicyId ? { afterId: afterPolicyId } : {}),
            throughId: upperPolicy,
          })
        : memoryPolicies
            .filter((p) => !afterPolicyId || p.policyId > afterPolicyId)
            .slice(0, limit);
      if (!page.length) break;
      await repository.withTransaction(async (client) => {
        for (const policyId of [
          ...new Set(page.map((p) => p.policyId)),
        ].sort()) {
          const policy = enabled
            ? await repository.lockPolicy(policyId, client)
            : this.policies.find((p) => p.policyId === policyId);
          if (!policy) continue;
          const evaluatedPolicy = this.applyPolicyLifecycle(
            this.clonePolicy(policy),
            asOf,
          );
          const expiry = policy.endAt;
          const expiryMs = Date.parse(expiry ?? "");
          const isPolicyActive =
            policy.status === "active" &&
            evaluatedPolicy.lifecycleStatus === "active";
          const extraPolicyRecord = policy as InsurancePolicyRecord & {
            partnerId?: string;
            partnerContactEmail?: string;
            partnerContactEmails?: readonly string[];
          };
          const directPolicyEmails = [
            extraPolicyRecord.partnerContactEmail,
            ...(extraPolicyRecord.partnerContactEmails ?? []),
          ];
          const policyPartnerIds = [
            extraPolicyRecord.partnerId,
            ...(vehiclePartnerIds.get(policy.vehicleId) ?? []),
          ];
          const recipients = await resolveRecipients(
            policyPartnerIds,
            directPolicyEmails,
          );

          for (const days of [30, 7] as const) {
            const family = `preexpiry:insurance_policy:${days}`;
            const prior = await repository.findActiveExpiryEventsForEntity(
              "policy",
              policyId,
              family,
              client,
            );
            const obsolete = prior.filter((e) => {
              const recorded =
                e.source_expiry_at instanceof Date
                  ? e.source_expiry_at.getTime()
                  : Date.parse(e.source_expiry_at ?? "");
              return (
                recorded !== expiryMs ||
                !isPolicyActive ||
                (expiryMs <= asOfMs && e.status !== "completed")
              );
            });
            await repository.supersedeExpiryEvents(
              obsolete.map((e) => e.event_id),
              undefined,
              client,
            );
            if (
              !expiry ||
              !Number.isFinite(expiryMs) ||
              !isPolicyActive ||
              expiryMs <= asOfMs ||
              expiryMs - days * 86400000 > asOfMs
            )
              continue;
            const fingerprint = createHash("sha256")
              .update(
                JSON.stringify([
                  "credential-preexpiry/v1",
                  scope,
                  "policy",
                  policyId,
                  "endAt",
                  expiryMs,
                  days,
                ]),
              )
              .digest("hex");
            let event = await repository.findExpiryEventByFingerprint(
              fingerprint,
              client,
            );
            if (!event) {
              const eventId = randomUUID();
              event = await repository.insertExpiryEvent(
                {
                  eventId,
                  scope,
                  entityType: "policy",
                  entityId: policyId,
                  credentialType: family,
                  sourceFingerprint: fingerprint,
                  sourceExpiryAt: expiry,
                  status: "pending",
                },
                client,
              );
              if (event.event_id === eventId) result.eventsCreated++;
            }
            if (
              event.status === "superseded" ||
              recipients.length === 0 ||
              (await repository.getExpiryEventById(event.event_id, client))
                ?.intent
            )
              continue;
            const policyNo = policy.policyNo || policyId;
            for (const recipientEmail of recipients) {
              const intentId = randomUUID();
              const intent = await repository.insertDeliveryIntent(
                {
                  intentId,
                  eventId: event.event_id,
                  scope,
                  tenantId: scope,
                  idempotencyKey:
                    "credential-preexpiry-mail/v1:" +
                    createHash("sha256")
                      .update(
                        JSON.stringify([
                          scope,
                          event.event_id,
                          recipientEmail,
                        ]),
                      )
                      .digest("hex"),
                  recipientEmail,
                  fromEmail,
                  subject: `[DRTS Reminder] Insurance Policy T-${days}: ${policyNo} for vehicle ${policy.vehicleId}`,
                  body: `Insurance policy ${policyNo} (type: ${policy.insuranceType}, insurer: ${policy.insurerName}) for vehicle ${policy.vehicleId}; source expiry ${new Date(expiryMs).toISOString()}; milestone T-${days}.`,
                },
                client,
              );
              if (intent.intent_id === intentId) result.intentsCreated++;
            }
          }
        }
      });
      const next = page.at(-1)!.policyId;
      if (afterPolicyId !== undefined && next <= afterPolicyId)
        throw new Error("registry_preexpiry_policy_scan_did_not_advance");
      afterPolicyId = next;
      if (next === upperPolicy) break;
    }

    return result;
  }

  async reconcileExpiredCredentials(
    command?: ReconcileExpiryCommand,
  ): Promise<ReconcileExpiryResult> {
    const asOf = command?.asOf
      ? new Date(command.asOf).toISOString()
      : new Date().toISOString();
    const asOfMs = Date.parse(asOf);
    const scope = command?.scope?.trim() || "default";
    const limit = command?.limit ?? 100;

    this.reconciledEvaluationTime = asOf;
    this.reconcileSupplyLifecycleForAll({
      occurredAt: asOf,
      emitEvent: false,
      persistContext: null,
    });

    let scannedDrivers = 0;
    let scannedPolicies = 0;
    let expiredEventsCreated = 0;
    let expiredEventsSuperseded = 0;
    let deliveryIntentsCreated = 0;
    let deliveryIntentsEnqueued = 0;

    const repository = this.regulatoryRegistryRepository!;
    if (typeof (repository as any)?.withTransaction !== "function") {
      return {
        asOf,
        scope,
        scannedDrivers: 0,
        scannedPolicies: 0,
        expiredEventsCreated: 0,
        expiredEventsSuperseded: 0,
        deliveryIntentsCreated: 0,
        deliveryIntentsEnqueued: 0,
        events: [],
      };
    }

    // Fix the source interval once. Each SQL page keeps the original limit;
    // subsequent invocations re-evaluate current sources/fingerprints from the start.
    const enabled = repository.isEnabled();
    const memoryDrivers = enabled
      ? []
      : this.drivers
          .filter((d) => {
            const dates = [
              d.licenseExpiry,
              d.professionalDriverLicenseExpiry,
              d.taxiDriverRegistrationExpiry,
            ];
            const datesExpired = dates.some((dt) => {
              if (!dt) return false;
              const ms = Date.parse(dt);
              return !Number.isNaN(ms) && ms <= asOfMs;
            });
            if (datesExpired) return true;
            if (this.academyService) return true;
            return false;
          })
          .sort((a, b) =>
            a.driverId < b.driverId ? -1 : a.driverId > b.driverId ? 1 : 0,
          );
    const memoryPolicies = enabled
      ? []
      : this.policies
          .filter((p) => {
            if (p.status === "cancelled") return false;
            const endAtMs = Date.parse(p.endAt);
            const startAtMs = Date.parse(p.startAt);
            return (
              !Number.isNaN(endAtMs) &&
              endAtMs < asOfMs &&
              !Number.isNaN(startAtMs) &&
              startAtMs <= asOfMs
            );
          })
          .sort((a, b) =>
            a.policyId < b.policyId ? -1 : a.policyId > b.policyId ? 1 : 0,
          );
    const upper = enabled
      ? await repository.getExpiryScanUpperBounds()
      : {
          driverId: memoryDrivers.at(-1)?.driverId ?? null,
          policyId: memoryPolicies.at(-1)?.policyId ?? null,
        };
    const processBatch = async (
      driverCandidates: DriverRegistryRecord[],
      policyCandidates: InsurancePolicyRecord[],
    ) => {
      // Strict multi-row locking order: sorted by entity ID ASC
      const sortedDriverIds = Array.from(
        new Set(driverCandidates.map((d) => d.driverId)),
      ).sort();
      const sortedPolicyIds = Array.from(
        new Set(policyCandidates.map((p) => p.policyId)),
      ).sort();

      // 2. Perform DB operations inside transaction
      await repository.withTransaction(async (client) => {
        // Process drivers
        for (const driverId of sortedDriverIds) {
          const locked = repository.isEnabled()
            ? await repository.lockDriver(driverId, client)
            : (this.drivers.find((d) => d.driverId === driverId) ?? null);
          if (!locked) continue;

          const checks: Array<{
            fieldName: string;
            expiry: string;
            credentialType: string;
          }> = [];

          if (locked.licenseExpiry) {
            const ms = Date.parse(locked.licenseExpiry);
            if (!Number.isNaN(ms) && ms <= asOfMs) {
              checks.push({
                fieldName: "licenseExpiry",
                expiry: locked.licenseExpiry,
                credentialType: "driver_license",
              });
            }
          }
          if (locked.professionalDriverLicenseExpiry) {
            const ms = Date.parse(locked.professionalDriverLicenseExpiry);
            if (!Number.isNaN(ms) && ms <= asOfMs) {
              checks.push({
                fieldName: "professionalDriverLicenseExpiry",
                expiry: locked.professionalDriverLicenseExpiry,
                credentialType: "professional_driver_license",
              });
            }
          }
          if (locked.taxiDriverRegistrationExpiry) {
            const ms = Date.parse(locked.taxiDriverRegistrationExpiry);
            if (!Number.isNaN(ms) && ms <= asOfMs) {
              checks.push({
                fieldName: "taxiDriverRegistrationExpiry",
                expiry: locked.taxiDriverRegistrationExpiry,
                credentialType: "taxi_driver_registration",
              });
            }
          }

          // Academy qualification check
          if (this.academyService) {
            try {
              const qual =
                await this.academyService.evaluateDriverQualification(
                  driverId,
                  new Date(asOf),
                );
              if (qual.regulatoryStatus === "expired") {
                const overdue = qual.records.find((r) => r.isOverdue);
                const expiry = overdue?.expiresAt ?? locked.updatedAt ?? asOf;
                checks.push({
                  fieldName: "academyTraining",
                  expiry:
                    typeof expiry === "string"
                      ? expiry
                      : new Date(expiry).toISOString(),
                  credentialType: "academy_qualification",
                });
              }
            } catch {
              // ignore Academy evaluation errors during driver expiry check
            }
          }

          for (const check of checks) {
            const fingerprintTuple = [
              "credential-expiry/v1",
              scope,
              "driver",
              driverId,
              check.fieldName,
              Date.parse(check.expiry),
            ];
            const fingerprint = createHash("sha256")
              .update(JSON.stringify(fingerprintTuple))
              .digest("hex");

            const existingEvent = await repository.findExpiryEventByFingerprint(
              fingerprint,
              client,
            );
            let event: RegistryExpiryEventRow;

            if (!existingEvent) {
              const eventId = randomUUID();
              event = await repository.insertExpiryEvent(
                {
                  eventId,
                  scope,
                  entityType: "driver",
                  entityId: driverId,
                  credentialType: check.credentialType,
                  sourceFingerprint: fingerprint,
                  sourceExpiryAt: check.expiry,
                  status: "pending",
                },
                client,
              );
              if (event.event_id === eventId) expiredEventsCreated++;

              const superseded =
                await repository.supersedeActiveExpiryEventsForEntity(
                  "driver",
                  driverId,
                  check.credentialType,
                  event.event_id,
                  client,
                );
              expiredEventsSuperseded += superseded;
            } else {
              event = existingEvent;
            }

            if (
              event.status !== "superseded" &&
              !(await repository.getExpiryEventById(event.event_id, client))
                ?.intent
            ) {
              const recipientEmail =
                process.env.REGULATORY_ALERT_RECIPIENT_EMAIL?.trim() ||
                `driver-${driverId}@alerts.drts.local`;
              const idempotencyKey = JSON.stringify([
                "credential-alert/v1",
                scope,
                event.event_id,
                recipientEmail,
              ]);
              const fromEmail =
                process.env.NOTIFICATION_FROM_EMAIL?.trim() ||
                "noreply@fleet.drts.local";
              const subject = `[DRTS Alert] Credential Expired: ${check.credentialType} for driver ${driverId}`;
              const body = `The credential ${check.credentialType} for driver ${driverId} expired at ${check.expiry}. Immediate renewal or suspension review required.`;

              const intentId = randomUUID();
              const intent = await repository.insertDeliveryIntent(
                {
                  intentId,
                  eventId: event.event_id,
                  scope,
                  idempotencyKey,
                  tenantId: scope,
                  recipientEmail,
                  fromEmail,
                  subject,
                  body,
                },
                client,
              );
              if (intent.intent_id === intentId) {
                deliveryIntentsCreated++;
              }
            }
          }
        }

        // Process policies
        for (const policyId of sortedPolicyIds) {
          const locked = repository.isEnabled()
            ? await repository.lockPolicy(policyId, client)
            : (this.policies.find((p) => p.policyId === policyId) ?? null);
          if (!locked) continue;

          const policyNo = locked.policyNo || policyId;
          const insuranceType = locked.insuranceType || "commercial_liability";
          const startAt = locked.startAt || locked.createdAt;
          const endAt = locked.endAt;
          const status = locked.status || "active";

          if (status === "cancelled") continue;
          const startAtMs = Date.parse(startAt);
          const endAtMs = Date.parse(endAt);
          if (Number.isNaN(endAtMs) || endAtMs >= asOfMs) continue;
          if (!Number.isNaN(startAtMs) && startAtMs > asOfMs) continue;

          const fingerprintTuple = [
            "credential-expiry/v1",
            scope,
            "policy",
            policyId,
            locked.vehicleId,
            policyNo,
            insuranceType,
            startAtMs,
            endAtMs,
            status,
          ];
          const fingerprint = createHash("sha256")
            .update(JSON.stringify(fingerprintTuple))
            .digest("hex");

          const existingEvent = await repository.findExpiryEventByFingerprint(
            fingerprint,
            client,
          );
          let event: RegistryExpiryEventRow;

          if (!existingEvent) {
            const eventId = randomUUID();
            event = await repository.insertExpiryEvent(
              {
                eventId,
                scope,
                entityType: "policy",
                entityId: policyId,
                credentialType: "insurance_policy",
                sourceFingerprint: fingerprint,
                sourceExpiryAt: endAt,
                status: "pending",
              },
              client,
            );
            if (event.event_id === eventId) expiredEventsCreated++;

            const superseded =
              await repository.supersedeActiveExpiryEventsForEntity(
                "policy",
                policyId,
                "insurance_policy",
                event.event_id,
                client,
              );
            expiredEventsSuperseded += superseded;
          } else {
            event = existingEvent;
          }

          if (
            event.status !== "superseded" &&
            !(await repository.getExpiryEventById(event.event_id, client))
              ?.intent
          ) {
            const recipientEmail =
              process.env.REGULATORY_ALERT_RECIPIENT_EMAIL?.trim() ||
              `policy-${policyId}@alerts.drts.local`;
            const idempotencyKey = JSON.stringify([
              "credential-alert/v1",
              scope,
              event.event_id,
              recipientEmail,
            ]);
            const fromEmail =
              process.env.NOTIFICATION_FROM_EMAIL?.trim() ||
              "noreply@fleet.drts.local";
            const subject = `[DRTS Alert] Insurance Policy Expired: policy ${policyNo} for vehicle ${locked.vehicleId}`;
            const body = `Insurance policy ${policyNo} (type: ${insuranceType}) for vehicle ${locked.vehicleId} expired at ${endAt}. Immediate renewal required.`;

            const intentId = randomUUID();
            const intent = await repository.insertDeliveryIntent(
              {
                intentId,
                eventId: event.event_id,
                scope,
                idempotencyKey,
                tenantId: scope,
                recipientEmail,
                fromEmail,
                subject,
                body,
              },
              client,
            );
            if (intent.intent_id === intentId) {
              deliveryIntentsCreated++;
            }
          }
        }
      });
    };
    let afterDriver: string | undefined;
    while (upper.driverId !== null) {
      const page = enabled
        ? await repository.scanExpiredDrivers(asOf, limit, undefined, {
            afterId: afterDriver,
            throughId: upper.driverId,
          })
        : memoryDrivers
            .filter(
              (d) => afterDriver === undefined || d.driverId > afterDriver,
            )
            .slice(0, limit);
      if (page.length === 0) break;
      scannedDrivers += page.length;
      await processBatch(page, []);
      const next = page.at(-1)!.driverId;
      if (afterDriver !== undefined && next <= afterDriver)
        throw new Error("registry_expiry_scan_did_not_advance");
      afterDriver = next;
      if (next === upper.driverId) break;
    }
    let afterPolicy: string | undefined;
    while (upper.policyId !== null) {
      const page = enabled
        ? await repository.scanExpiredPolicies(asOf, limit, undefined, {
            afterId: afterPolicy,
            throughId: upper.policyId,
          })
        : memoryPolicies
            .filter(
              (p) => afterPolicy === undefined || p.policyId > afterPolicy,
            )
            .slice(0, limit);
      if (page.length === 0) break;
      scannedPolicies += page.length;
      await processBatch([], page);
      const next = page.at(-1)!.policyId;
      if (afterPolicy !== undefined && next <= afterPolicy)
        throw new Error("registry_expiry_scan_did_not_advance");
      afterPolicy = next;
      if (next === upper.policyId) break;
    }

    const preexpiry = await this.preparePreexpiryReminders(asOf, scope, limit);

    // 3. Post-commit: delivery intent processing (one existing sender/drain).
    const pendingIntents = await repository.findPendingDeliveryIntents(limit);
    for (const intent of pendingIntents) {
      // Pre-send source re-check: verify event hasn't been superseded
      const eventWithIntent = await repository.getExpiryEventById(
        intent.event_id,
      );
      if (!eventWithIntent || eventWithIntent.status === "superseded") {
        await repository.updateDeliveryIntent({
          intentId: intent.intent_id,
          deliveryStatus: "superseded",
        });
        continue;
      }

      // The reminder's original source may have renewed since its intent commit.
      if (parsePreexpiryRecordFamily(eventWithIntent.credential_type)) {
        const current = await repository.recordExpiryDeliveryOutcome(
          intent,
          {
            deliveryStatus: "pending",
          },
          asOfMs,
        );
        if (!current || current.delivery_status === "superseded") continue;
      }
      if (this.notificationDeliveryService) {
        let outboxDeliveryId: string | undefined;
        try {
          const receipt = await this.notificationDeliveryService.enqueue({
            tenantId: intent.tenant_id,
            idempotencyKey: intent.idempotency_key,
            recipientEmail: intent.recipient_email,
            fromEmail: intent.from_email,
            subject: intent.subject,
            body: intent.body,
          });
          outboxDeliveryId = receipt.deliveryId;
          deliveryIntentsEnqueued++;
          // Store the receipt before awaiting external send; lawful renewal can
          // supersede state without losing a real accepted outbox identity.
          const linked = await repository.recordExpiryDeliveryOutcome(
            intent,
            {
              deliveryStatus: "enqueued",
              outboxDeliveryId,
            },
            asOfMs,
          );
          const current = await repository.getExpiryEventById(intent.event_id);
          if (
            linked &&
            current &&
            linked.delivery_status !== "superseded" &&
            current.status !== "superseded" &&
            this.notificationDeliveryService.availability() === "available"
          ) {
            try {
              await this.notificationDeliveryService.dispatch(
                intent.tenant_id,
                receipt.deliveryId,
              );
            } catch {
              /* Actual attempts/uncertainty remain owned by the existing outbox. */
            }
          }
        } catch (error: unknown) {
          const message =
            error instanceof Error ? error.message : String(error);
          const code = (error as NodeJS.ErrnoException | null)?.code;
          const causeCode = (error as { cause?: NodeJS.ErrnoException } | null)
            ?.cause?.code;
          const storageCodes = [
            "EIO",
            "EAGAIN",
            "EACCES",
            "EBUSY",
            "EMFILE",
            "ENFILE",
            "ENOSPC",
            "ECONNRESET",
            "ECONNREFUSED",
            "ETIMEDOUT",
            "40001",
            "40P01",
            "55P03",
            "08000",
            "08003",
            "08006",
            "57P01",
          ];
          const terminal =
            message === "notification_idempotency_conflict" ||
            message === "registry_expiry_receipt_link_conflict" ||
            message.startsWith("notification_invalid_");
          // pg-pool emits these acquisition timeouts without an errno code.
          const poolAcquisitionTimeout =
            error instanceof Error &&
            code === undefined &&
            causeCode === undefined &&
            (message === "timeout exceeded when trying to connect" ||
              message === "Connection terminated due to connection timeout");
          const recoverable =
            !terminal &&
            (outboxDeliveryId !== undefined ||
              poolAcquisitionTimeout ||
              storageCodes.includes(code ?? "") ||
              storageCodes.includes(causeCode ?? "") ||
              message === "notification_outbox_lock_timeout" ||
              message === "notification_outbox_lock_unavailable");
          // One bounded attempt per pending intent per invocation. Preserve the
          // original frozen payload and error; no new timer or provider retry loop.
          await repository.recordExpiryDeliveryOutcome(intent, {
            deliveryStatus: recoverable ? "pending" : "failed",
            lastError: message,
            ...(outboxDeliveryId === undefined ? {} : { outboxDeliveryId }),
          });
        }
      }
    }

    const events = await repository.listExpiryEvents({ scope, limit });

    return {
      preexpiry,
      asOf,
      scope,
      scannedDrivers,
      scannedPolicies,
      expiredEventsCreated,
      expiredEventsSuperseded,
      deliveryIntentsCreated,
      deliveryIntentsEnqueued,
      events,
    };
  }
}
