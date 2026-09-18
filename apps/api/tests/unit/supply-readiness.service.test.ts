import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

import type {
  DriverFleetAffiliationRecord,
  DriverRegistryRecord,
  FleetPartnerRecord,
  SupplyDocumentRecord,
  SupplySubmissionRecord,
  VehicleFleetAffiliationRecord,
  VehicleRegistryRecord,
} from "@drts/contracts";

import { SupplyReadinessService } from "../../src/modules/fleet-partner/supply-readiness.service";
import type { FleetPartnerService } from "../../src/modules/fleet-partner/fleet-partner.service";
import type { RegulatoryRegistryService } from "../../src/modules/regulatory-registry/regulatory-registry.service";
import type { VehicleEligibilityService } from "../../src/modules/vehicle-eligibility/vehicle-eligibility.service";
import type { SupplySubmissionRepository } from "../../src/modules/fleet-partner/supply-submission.repository";

const FIXED_NOW = "2026-06-20T10:00:00.000Z";
const POLICY_VERSION = "phase1-delta-supply-readiness-2026-06-19";

function createDriver(
  driverId: string,
  overrides: Partial<DriverRegistryRecord> = {},
): DriverRegistryRecord {
  return {
    driverId,
    name: driverId,
    supportedServiceBuckets: ["standard_taxi"],
    workState: "available",
    licensesValid: true,
    lifecycleStatus: "active",
    eligibilityBlockedReasons: [],
    dispatchEligible: true,
    createdAt: FIXED_NOW,
    updatedAt: FIXED_NOW,
    activatedAt: FIXED_NOW,
    suspendedAt: null,
    retiredAt: null,
    profileUpdatedAt: FIXED_NOW,
    deviceBindings: [],
    ...overrides,
  };
}

function createVehicle(
  vehicleId: string,
  overrides: Partial<VehicleRegistryRecord> = {},
): VehicleRegistryRecord {
  const supplyLifecycle =
    overrides.supplyLifecycle ?? {
      contract: {
        contractId: `contract-${vehicleId}`,
        lifecycleStatus: "active",
        startAt: "2026-01-01T00:00:00.000Z",
        endAt: "2099-12-31T23:59:59.000Z",
        updatedAt: FIXED_NOW,
      },
      insurance: {
        policyId: `policy-${vehicleId}`,
        lifecycleStatus: "active",
        startAt: "2026-01-01T00:00:00.000Z",
        endAt: "2099-12-31T23:59:59.000Z",
        updatedAt: FIXED_NOW,
      },
      exclusivity: {
        lifecycleStatus: "active",
        declarationStatus: "approved",
        declarationFileId: null,
        reviewStatus: "approved",
        providerName: null,
        effectiveStart: "2026-01-01T00:00:00.000Z",
        effectiveEnd: "2099-12-31T23:59:59.000Z",
        reviewedAt: FIXED_NOW,
        updatedAt: FIXED_NOW,
      },
      dispatch: {
        eligible: true,
        blockedReasons: [],
        evaluatedAt: FIXED_NOW,
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

  return {
    vehicleId,
    plateNo: vehicleId.toUpperCase(),
    operatingArea: "taipei",
    supportedServiceBuckets: ["standard_taxi"],
    dispatchableFlag: true,
    exclusivityApproved: true,
    insuranceStatus: "valid",
    updatedAt: FIXED_NOW,
    ...overrides,
    supplyLifecycle,
  };
}

function createDriverAffiliation(
  driverId: string,
): DriverFleetAffiliationRecord {
  return {
    affiliationId: `driver-aff-${driverId}`,
    driverId,
    fleetPartnerId: "fleet-demo-001",
    affiliationType: "managed_by",
    effectiveFrom: "2026-01-01T00:00:00.000Z",
    effectiveUntil: null,
    driverGroupId: null,
  };
}

function createVehicleAffiliation(
  vehicleId: string,
): VehicleFleetAffiliationRecord {
  return {
    affiliationId: `vehicle-aff-${vehicleId}`,
    vehicleId,
    fleetPartnerId: "fleet-demo-001",
    affiliationType: "managed_by",
    effectiveFrom: "2026-01-01T00:00:00.000Z",
    effectiveUntil: null,
    status: "active",
    sourceSubmissionId: `sub-${vehicleId}`,
    createdAt: FIXED_NOW,
    updatedAt: FIXED_NOW,
  };
}

function createApprovedSubmission(
  submissionId: string,
  input: {
    canonicalDriverId?: string | null;
    canonicalVehicleId?: string | null;
  },
): SupplySubmissionRecord {
  return {
    submissionId,
    fleetPartnerId: "fleet-demo-001",
    submissionType: input.canonicalVehicleId
      ? "vehicle_onboarding"
      : "driver_onboarding",
    status: "approved",
    revisionNo: 2,
    subjectDriverId: input.canonicalDriverId ?? null,
    subjectVehicleId: input.canonicalVehicleId ?? null,
    submittedBy: "fleet-user-001",
    submittedAt: "2026-06-01T00:00:00.000Z",
    reviewStartedBy: "platform-admin-001",
    reviewStartedAt: "2026-06-02T00:00:00.000Z",
    reviewedBy: "platform-admin-001",
    reviewedAt: "2026-06-03T00:00:00.000Z",
    reviewReasonCode: "approved",
    reviewComment: "approved",
    canonicalDriverId: input.canonicalDriverId ?? null,
    canonicalVehicleId: input.canonicalVehicleId ?? null,
    canonicalContractId: input.canonicalVehicleId
      ? `contract-${input.canonicalVehicleId}`
      : null,
    canonicalPolicyId: input.canonicalVehicleId
      ? `policy-${input.canonicalVehicleId}`
      : null,
    createdAt: "2026-06-01T00:00:00.000Z",
    updatedAt: "2026-06-03T00:00:00.000Z",
  };
}

function createDriverDocuments(
  submissionId: string,
  input: {
    includeLicense?: boolean;
    includeRegistration?: boolean;
  } = {},
): SupplyDocumentRecord[] {
  const includeLicense = input.includeLicense ?? true;
  const includeRegistration = input.includeRegistration ?? true;
  const documents: SupplyDocumentRecord[] = [];

  if (includeLicense) {
    documents.push({
      documentId: `${submissionId}-license`,
      fleetPartnerId: "fleet-demo-001",
      submissionId,
      documentType: "professional_driver_license",
      fileObjectKey: "files/license.pdf",
      originalFileName: "license.pdf",
      contentType: "application/pdf",
      fileSize: 1024,
      checksumSha256: "license",
      effectiveFrom: "2026-01-01",
      effectiveUntil: "2099-12-31",
      reviewStatus: "approved",
      reviewComment: null,
      uploadedBy: "fleet-user-001",
      uploadedAt: FIXED_NOW,
    });
  }

  if (includeRegistration) {
    documents.push({
      documentId: `${submissionId}-registration`,
      fleetPartnerId: "fleet-demo-001",
      submissionId,
      documentType: "taxi_driver_registration",
      fileObjectKey: "files/registration.pdf",
      originalFileName: "registration.pdf",
      contentType: "application/pdf",
      fileSize: 1024,
      checksumSha256: "registration",
      effectiveFrom: "2026-01-01",
      effectiveUntil: "2099-12-31",
      reviewStatus: "approved",
      reviewComment: null,
      uploadedBy: "fleet-user-001",
      uploadedAt: FIXED_NOW,
    });
  }

  return documents;
}

function createVehicleDocument(submissionId: string): SupplyDocumentRecord {
  return {
    documentId: `${submissionId}-vehicle-registration`,
    fleetPartnerId: "fleet-demo-001",
    submissionId,
    documentType: "vehicle_registration",
    fileObjectKey: "files/vehicle-registration.pdf",
    originalFileName: "vehicle-registration.pdf",
    contentType: "application/pdf",
    fileSize: 1024,
    checksumSha256: "vehicle-registration",
    effectiveFrom: "2026-01-01",
    effectiveUntil: "2099-12-31",
    reviewStatus: "approved",
    reviewComment: null,
    uploadedBy: "fleet-user-001",
    uploadedAt: FIXED_NOW,
  };
}

function createReadinessService(input: {
  partnerActive?: boolean;
  drivers?: DriverRegistryRecord[];
  vehicles?: VehicleRegistryRecord[];
  driverAffiliations?: DriverFleetAffiliationRecord[];
  vehicleAffiliations?: VehicleFleetAffiliationRecord[];
  submissions?: SupplySubmissionRecord[];
  driverDrafts?: Array<{
    submissionId: string;
    name: string;
    mobile: string;
    professionalDriverLicenseNo: string;
    professionalDriverLicenseExpiry: string;
    taxiDriverRegistrationNo: string;
    taxiDriverRegistrationArea: string;
    taxiDriverRegistrationExpiry: string;
    supportedServiceProductCodes: string[];
    preferredVehicleSubmissionId: string | null;
  }>;
  vehicleDrafts?: Array<{
    submissionId: string;
    plateNo: string;
    licenseType: string;
    brand: string | null;
    model: string | null;
    modelYear: number | null;
    seatCount: number;
    luggageCapacity: number;
    businessArea: string;
    supportedServiceProductCodes: string[];
    airportTransferEligible: boolean;
    fixedFareAllowed: boolean;
    currentDriverSubmissionId: string | null;
  }>;
  documents?: SupplyDocumentRecord[];
  supplyPairs?: Array<{ driverId: string; vehicleId: string; etaMinutes: number }>;
  trainingRequiredVehicleIds?: string[];
}) {
  const partner: FleetPartnerRecord = {
    fleetPartnerId: "fleet-demo-001",
    legalName: "Demo Fleet",
    displayName: "Demo Fleet",
    businessRegistrationNo: "12345678",
    contactName: "Ops",
    contactPhone: "02-1234-5678",
    active: input.partnerActive ?? true,
    partnershipType: "fleet_management",
  };
  const trainingRequiredVehicleIds = new Set(
    input.trainingRequiredVehicleIds ?? [],
  );
  const repositoryState = {
    submissions: input.submissions ?? [],
    driverDrafts: input.driverDrafts ?? [],
    vehicleDrafts: input.vehicleDrafts ?? [],
    documents: input.documents ?? [],
    reviewEvents: [],
    vehicleAffiliations: input.vehicleAffiliations ?? [],
  };

  return new SupplyReadinessService(
    {
      getFleetPartner: () => ({ ...partner }),
      listFleetPartnerDrivers: () =>
        (input.driverAffiliations ?? []).map((affiliation) => ({ ...affiliation })),
    } as unknown as FleetPartnerService,
    {
      listDrivers: () => (input.drivers ?? []).map((driver) => ({ ...driver })),
      listVehicles: () => (input.vehicles ?? []).map((vehicle) => ({ ...vehicle })),
      listSupplyPairs: () => (input.supplyPairs ?? []).map((pair) => ({ ...pair })),
    } as unknown as RegulatoryRegistryService,
    {
      resolveRuntimeVehicleCapability: (vehicleId: string) =>
        ({
          vehicleId,
          trainingRequired: trainingRequiredVehicleIds.has(vehicleId),
        } as never),
    } as unknown as VehicleEligibilityService,
    {
      loadState: vi.fn().mockResolvedValue(repositoryState),
    } as unknown as SupplySubmissionRepository,
  );
}

describe("SupplyReadinessService", () => {
  beforeEach(() => {
    vi.useFakeTimers();
    vi.setSystemTime(new Date(FIXED_NOW));
  });

  afterEach(() => {
    vi.useRealTimers();
  });

  it("maps the readiness catalog across driver and vehicle subjects", async () => {
    const driverLicenseMissingSubmission = createApprovedSubmission(
      "sub-drv-license-missing",
      { canonicalDriverId: "drv-license-missing" },
    );
    const driverLicenseExpiredSubmission = createApprovedSubmission(
      "sub-drv-license-expired",
      { canonicalDriverId: "drv-license-expired" },
    );
    const driverRegistrationMissingSubmission = createApprovedSubmission(
      "sub-drv-registration-missing",
      { canonicalDriverId: "drv-registration-missing" },
    );
    const driverRegistrationExpiredSubmission = createApprovedSubmission(
      "sub-drv-registration-expired",
      { canonicalDriverId: "drv-registration-expired" },
    );
    const driverAffMissingSubmission = createApprovedSubmission(
      "sub-drv-aff-missing",
      { canonicalDriverId: "drv-aff-missing" },
    );

    const vehicleReadySubmission = createApprovedSubmission("sub-veh-ready", {
      canonicalVehicleId: "veh-ready",
    });
    const vehicleDocMissingSubmission = createApprovedSubmission(
      "sub-veh-doc-missing",
      { canonicalVehicleId: "veh-doc-missing" },
    );
    const vehicleInsuranceMissingSubmission = createApprovedSubmission(
      "sub-veh-insurance-missing",
      { canonicalVehicleId: "veh-insurance-missing" },
    );
    const vehicleInsuranceExpiredSubmission = createApprovedSubmission(
      "sub-veh-insurance-expired",
      { canonicalVehicleId: "veh-insurance-expired" },
    );
    const vehicleContractMissingSubmission = createApprovedSubmission(
      "sub-veh-contract-missing",
      { canonicalVehicleId: "veh-contract-missing" },
    );
    const vehicleContractInactiveSubmission = createApprovedSubmission(
      "sub-veh-contract-inactive",
      { canonicalVehicleId: "veh-contract-inactive" },
    );
    const vehicleAffMissingSubmission = createApprovedSubmission(
      "sub-veh-aff-missing",
      { canonicalVehicleId: "veh-aff-missing" },
    );
    const vehicleNoSupportSubmission = createApprovedSubmission(
      "sub-veh-no-support",
      { canonicalVehicleId: "veh-no-support" },
    );
    const vehicleTrainingSubmission = createApprovedSubmission(
      "sub-veh-training",
      { canonicalVehicleId: "veh-training" },
    );
    const vehicleManualSubmission = createApprovedSubmission(
      "sub-veh-manual",
      { canonicalVehicleId: "veh-manual-suspended" },
    );

    const service = createReadinessService({
      drivers: [
        createDriver("drv-ready"),
        createDriver("drv-license-missing"),
        createDriver("drv-license-expired"),
        createDriver("drv-registration-missing"),
        createDriver("drv-registration-expired"),
        createDriver("drv-aff-missing"),
        createDriver("drv-no-support", { supportedServiceBuckets: [] }),
        createDriver("drv-manual-suspended", {
          lifecycleStatus: "suspended",
          eligibilityBlockedReasons: ["lifecycle_suspended"],
          dispatchEligible: false,
          suspendedAt: FIXED_NOW,
        }),
      ],
      vehicles: [
        createVehicle("veh-ready"),
        createVehicle("veh-doc-missing"),
        createVehicle("veh-insurance-missing", {
          supplyLifecycle: {
            ...createVehicle("veh-insurance-missing").supplyLifecycle,
            insurance: {
              ...createVehicle("veh-insurance-missing").supplyLifecycle.insurance,
              policyId: null,
              lifecycleStatus: "missing",
            },
          },
        }),
        createVehicle("veh-insurance-expired", {
          supplyLifecycle: {
            ...createVehicle("veh-insurance-expired").supplyLifecycle,
            insurance: {
              ...createVehicle("veh-insurance-expired").supplyLifecycle.insurance,
              lifecycleStatus: "expired",
            },
          },
        }),
        createVehicle("veh-contract-missing", {
          supplyLifecycle: {
            ...createVehicle("veh-contract-missing").supplyLifecycle,
            contract: {
              ...createVehicle("veh-contract-missing").supplyLifecycle.contract,
              contractId: null,
              lifecycleStatus: "missing",
            },
          },
        }),
        createVehicle("veh-contract-inactive", {
          supplyLifecycle: {
            ...createVehicle("veh-contract-inactive").supplyLifecycle,
            contract: {
              ...createVehicle("veh-contract-inactive").supplyLifecycle.contract,
              lifecycleStatus: "expired",
            },
          },
        }),
        createVehicle("veh-aff-missing"),
        createVehicle("veh-no-support", { supportedServiceBuckets: [] }),
        createVehicle("veh-training"),
        createVehicle("veh-manual-suspended", {
          dispatchableFlag: false,
          supplyLifecycle: {
            ...createVehicle("veh-manual-suspended").supplyLifecycle,
            dispatch: {
              eligible: false,
              blockedReasons: ["manual_hold"],
              evaluatedAt: FIXED_NOW,
            },
          },
        }),
      ],
      driverAffiliations: [
        createDriverAffiliation("drv-ready"),
        createDriverAffiliation("drv-license-missing"),
        createDriverAffiliation("drv-license-expired"),
        createDriverAffiliation("drv-registration-missing"),
        createDriverAffiliation("drv-registration-expired"),
        createDriverAffiliation("drv-no-support"),
        createDriverAffiliation("drv-manual-suspended"),
      ],
      vehicleAffiliations: [
        createVehicleAffiliation("veh-ready"),
        createVehicleAffiliation("veh-doc-missing"),
        createVehicleAffiliation("veh-insurance-missing"),
        createVehicleAffiliation("veh-insurance-expired"),
        createVehicleAffiliation("veh-contract-missing"),
        createVehicleAffiliation("veh-contract-inactive"),
        createVehicleAffiliation("veh-no-support"),
        createVehicleAffiliation("veh-training"),
        createVehicleAffiliation("veh-manual-suspended"),
      ],
      submissions: [
        driverLicenseMissingSubmission,
        driverLicenseExpiredSubmission,
        driverRegistrationMissingSubmission,
        driverRegistrationExpiredSubmission,
        driverAffMissingSubmission,
        vehicleReadySubmission,
        vehicleDocMissingSubmission,
        vehicleInsuranceMissingSubmission,
        vehicleInsuranceExpiredSubmission,
        vehicleContractMissingSubmission,
        vehicleContractInactiveSubmission,
        vehicleAffMissingSubmission,
        vehicleNoSupportSubmission,
        vehicleTrainingSubmission,
        vehicleManualSubmission,
      ],
      driverDrafts: [
        {
          submissionId: driverLicenseMissingSubmission.submissionId,
          name: "License Missing",
          mobile: "0912000001",
          professionalDriverLicenseNo: "",
          professionalDriverLicenseExpiry: "2099-12-31",
          taxiDriverRegistrationNo: "REG-001",
          taxiDriverRegistrationArea: "taipei",
          taxiDriverRegistrationExpiry: "2099-12-31",
          supportedServiceProductCodes: ["standard_taxi"],
          preferredVehicleSubmissionId: null,
        },
        {
          submissionId: driverLicenseExpiredSubmission.submissionId,
          name: "License Expired",
          mobile: "0912000002",
          professionalDriverLicenseNo: "PDL-002",
          professionalDriverLicenseExpiry: "2026-05-01",
          taxiDriverRegistrationNo: "REG-002",
          taxiDriverRegistrationArea: "taipei",
          taxiDriverRegistrationExpiry: "2099-12-31",
          supportedServiceProductCodes: ["standard_taxi"],
          preferredVehicleSubmissionId: null,
        },
        {
          submissionId: driverRegistrationMissingSubmission.submissionId,
          name: "Registration Missing",
          mobile: "0912000003",
          professionalDriverLicenseNo: "PDL-003",
          professionalDriverLicenseExpiry: "2099-12-31",
          taxiDriverRegistrationNo: "",
          taxiDriverRegistrationArea: "taipei",
          taxiDriverRegistrationExpiry: "2099-12-31",
          supportedServiceProductCodes: ["standard_taxi"],
          preferredVehicleSubmissionId: null,
        },
        {
          submissionId: driverRegistrationExpiredSubmission.submissionId,
          name: "Registration Expired",
          mobile: "0912000004",
          professionalDriverLicenseNo: "PDL-004",
          professionalDriverLicenseExpiry: "2099-12-31",
          taxiDriverRegistrationNo: "REG-004",
          taxiDriverRegistrationArea: "taipei",
          taxiDriverRegistrationExpiry: "2026-05-01",
          supportedServiceProductCodes: ["standard_taxi"],
          preferredVehicleSubmissionId: null,
        },
        {
          submissionId: driverAffMissingSubmission.submissionId,
          name: "Aff Missing",
          mobile: "0912000005",
          professionalDriverLicenseNo: "PDL-005",
          professionalDriverLicenseExpiry: "2099-12-31",
          taxiDriverRegistrationNo: "REG-005",
          taxiDriverRegistrationArea: "taipei",
          taxiDriverRegistrationExpiry: "2099-12-31",
          supportedServiceProductCodes: ["standard_taxi"],
          preferredVehicleSubmissionId: null,
        },
      ],
      documents: [
        ...createDriverDocuments(
          driverLicenseMissingSubmission.submissionId,
          { includeLicense: false },
        ),
        ...createDriverDocuments(driverLicenseExpiredSubmission.submissionId),
        ...createDriverDocuments(
          driverRegistrationMissingSubmission.submissionId,
          { includeRegistration: false },
        ),
        ...createDriverDocuments(
          driverRegistrationExpiredSubmission.submissionId,
        ),
        ...createDriverDocuments(driverAffMissingSubmission.submissionId),
        createVehicleDocument(vehicleReadySubmission.submissionId),
        createVehicleDocument(vehicleInsuranceMissingSubmission.submissionId),
        createVehicleDocument(vehicleInsuranceExpiredSubmission.submissionId),
        createVehicleDocument(vehicleContractMissingSubmission.submissionId),
        createVehicleDocument(vehicleContractInactiveSubmission.submissionId),
        createVehicleDocument(vehicleAffMissingSubmission.submissionId),
        createVehicleDocument(vehicleNoSupportSubmission.submissionId),
        createVehicleDocument(vehicleTrainingSubmission.submissionId),
        createVehicleDocument(vehicleManualSubmission.submissionId),
      ],
      trainingRequiredVehicleIds: ["veh-training"],
    });

    const readiness = await service.listFleetPartnerReadiness("fleet-demo-001");
    const bySubjectId = new Map(readiness.map((record) => [record.subjectId, record]));

    expect(bySubjectId.get("drv-ready")).toMatchObject({
      state: "ready",
      reasonCodes: [],
      policyVersion: POLICY_VERSION,
    });
    expect(bySubjectId.get("drv-license-missing")).toMatchObject({
      state: "not_ready",
      reasonCodes: ["DRIVER_LICENSE_MISSING"],
    });
    expect(bySubjectId.get("drv-license-expired")).toMatchObject({
      state: "not_ready",
      reasonCodes: ["DRIVER_LICENSE_EXPIRED"],
    });
    expect(bySubjectId.get("drv-registration-missing")).toMatchObject({
      state: "not_ready",
      reasonCodes: ["DRIVER_REGISTRATION_MISSING"],
    });
    expect(bySubjectId.get("drv-registration-expired")).toMatchObject({
      state: "not_ready",
      reasonCodes: ["DRIVER_REGISTRATION_EXPIRED"],
    });
    expect(bySubjectId.get("drv-aff-missing")).toMatchObject({
      state: "not_ready",
      reasonCodes: ["DRIVER_AFFILIATION_MISSING"],
    });
    expect(bySubjectId.get("drv-no-support")).toMatchObject({
      state: "not_ready",
      reasonCodes: ["SERVICE_PRODUCT_NOT_SUPPORTED"],
    });
    expect(bySubjectId.get("drv-manual-suspended")).toMatchObject({
      state: "suspended",
      reasonCodes: ["MANUALLY_SUSPENDED"],
    });

    expect(bySubjectId.get("veh-ready")).toMatchObject({
      state: "ready",
      reasonCodes: [],
    });
    expect(bySubjectId.get("veh-doc-missing")).toMatchObject({
      state: "not_ready",
      reasonCodes: ["VEHICLE_DOCUMENT_MISSING"],
    });
    expect(bySubjectId.get("veh-insurance-missing")).toMatchObject({
      state: "not_ready",
      reasonCodes: ["INSURANCE_MISSING"],
    });
    expect(bySubjectId.get("veh-insurance-expired")).toMatchObject({
      state: "not_ready",
      reasonCodes: ["INSURANCE_EXPIRED"],
    });
    expect(bySubjectId.get("veh-contract-missing")).toMatchObject({
      state: "not_ready",
      reasonCodes: ["CONTRACT_MISSING"],
    });
    expect(bySubjectId.get("veh-contract-inactive")).toMatchObject({
      state: "not_ready",
      reasonCodes: ["CONTRACT_INACTIVE"],
    });
    expect(bySubjectId.get("veh-aff-missing")).toMatchObject({
      state: "not_ready",
      reasonCodes: ["VEHICLE_AFFILIATION_MISSING"],
    });
    expect(bySubjectId.get("veh-no-support")).toMatchObject({
      state: "not_ready",
      reasonCodes: ["SERVICE_PRODUCT_NOT_SUPPORTED"],
    });
    expect(bySubjectId.get("veh-training")).toMatchObject({
      state: "not_ready",
      reasonCodes: ["TRAINING_REQUIRED"],
    });
    expect(bySubjectId.get("veh-manual-suspended")).toMatchObject({
      state: "suspended",
      reasonCodes: ["MANUALLY_SUSPENDED"],
    });
  });

  it("reports dangling canonical records without failing the fleet readiness list", async () => {
    const missingDriver = createApprovedSubmission("sub-orphan-driver", {
      canonicalDriverId: "drv-orphan",
    });
    const missingVehicle = createApprovedSubmission("sub-orphan-vehicle", {
      canonicalVehicleId: "veh-orphan",
    });
    const service = createReadinessService({
      submissions: [missingDriver, missingVehicle],
    });

    await expect(
      service.listFleetPartnerReadiness("fleet-demo-001"),
    ).resolves.toEqual(
      expect.arrayContaining([
        expect.objectContaining({
          subjectType: "driver",
          subjectId: "drv-orphan",
          state: "not_ready",
          reasonCodes: ["DRIVER_REGISTRY_MISSING"],
        }),
        expect.objectContaining({
          subjectType: "vehicle",
          subjectId: "veh-orphan",
          state: "not_ready",
          reasonCodes: ["VEHICLE_REGISTRY_MISSING"],
        }),
      ]),
    );
  });

  it("marks readiness suspended when the fleet partner is inactive", async () => {
    const inactiveDriverSubmission = createApprovedSubmission(
      "sub-drv-inactive",
      { canonicalDriverId: "drv-inactive" },
    );
    const inactiveVehicleSubmission = createApprovedSubmission(
      "sub-veh-inactive",
      { canonicalVehicleId: "veh-inactive" },
    );
    const service = createReadinessService({
      partnerActive: false,
      drivers: [createDriver("drv-inactive")],
      vehicles: [createVehicle("veh-inactive")],
      driverAffiliations: [createDriverAffiliation("drv-inactive")],
      vehicleAffiliations: [createVehicleAffiliation("veh-inactive")],
      submissions: [inactiveDriverSubmission, inactiveVehicleSubmission],
      driverDrafts: [
        {
          submissionId: inactiveDriverSubmission.submissionId,
          name: "Inactive Driver",
          mobile: "0912000100",
          professionalDriverLicenseNo: "PDL-100",
          professionalDriverLicenseExpiry: "2099-12-31",
          taxiDriverRegistrationNo: "REG-100",
          taxiDriverRegistrationArea: "taipei",
          taxiDriverRegistrationExpiry: "2099-12-31",
          supportedServiceProductCodes: ["standard_taxi"],
          preferredVehicleSubmissionId: null,
        },
      ],
      documents: [
        ...createDriverDocuments(inactiveDriverSubmission.submissionId),
        createVehicleDocument(inactiveVehicleSubmission.submissionId),
      ],
    });

    const readiness = await service.listFleetPartnerReadiness("fleet-demo-001");

    expect(readiness).toHaveLength(2);
    expect(
      readiness.every(
        (record) =>
          record.state === "suspended" &&
          record.reasonCodes.includes("FLEET_PARTNER_INACTIVE"),
      ),
    ).toBe(true);
  });

  it("evaluates driver-vehicle pair readiness with service-product mismatch", async () => {
    const pairVehicleSubmission = createApprovedSubmission("sub-veh-pair", {
      canonicalVehicleId: "veh-pair",
    });
    const service = createReadinessService({
      drivers: [
        createDriver("drv-pair", {
          supportedServiceBuckets: ["standard_taxi"],
        }),
      ],
      vehicles: [
        createVehicle("veh-pair", {
          supportedServiceBuckets: ["business_dispatch"],
        }),
      ],
      driverAffiliations: [createDriverAffiliation("drv-pair")],
      vehicleAffiliations: [createVehicleAffiliation("veh-pair")],
      submissions: [pairVehicleSubmission],
      documents: [createVehicleDocument(pairVehicleSubmission.submissionId)],
      supplyPairs: [{ driverId: "drv-pair", vehicleId: "veh-pair", etaMinutes: 5 }],
    });

    const readiness = await service.evaluateCanonicalSupply({
      fleetPartnerId: "fleet-demo-001",
      canonicalDriverId: "drv-pair",
      canonicalVehicleId: "veh-pair",
    });

    expect(readiness.driver).toMatchObject({
      subjectType: "driver",
      subjectId: "drv-pair",
      state: "ready",
      reasonCodes: [],
    });
    expect(readiness.vehicle).toMatchObject({
      subjectType: "vehicle",
      subjectId: "veh-pair",
      state: "ready",
      reasonCodes: [],
    });
    expect(readiness.pair).toMatchObject({
      subjectType: "driver_vehicle_pair",
      subjectId: "drv-pair:veh-pair",
      state: "not_ready",
      reasonCodes: ["SERVICE_PRODUCT_NOT_SUPPORTED"],
    });
  });
});
