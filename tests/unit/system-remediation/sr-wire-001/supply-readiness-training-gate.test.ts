import { describe, expect, it } from "vitest";

import type {
  DriverFleetAffiliationRecord,
  DriverRegistryRecord,
  FleetPartnerRecord,
} from "@drts/contracts";

import { SupplyReadinessService } from "../../../../apps/api/src/modules/fleet-partner/supply-readiness.service";
import type { AcademyService } from "../../../../apps/api/src/modules/driver-academy/academy.service";
import type { FleetPartnerService } from "../../../../apps/api/src/modules/fleet-partner/fleet-partner.service";
import type { RegulatoryRegistryService } from "../../../../apps/api/src/modules/regulatory-registry/regulatory-registry.service";
import type { VehicleEligibilityService } from "../../../../apps/api/src/modules/vehicle-eligibility/vehicle-eligibility.service";
import type { SupplySubmissionRepository } from "../../../../apps/api/src/modules/fleet-partner/supply-submission.repository";

const FIXED_NOW = "2026-06-20T10:00:00.000Z";

function createDriver(driverId: string): DriverRegistryRecord {
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
  };
}

function createDriverAffiliation(driverId: string): DriverFleetAffiliationRecord {
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

// Mirrors the real ModuleRef.get(token, { strict: false }) shape the
// production onModuleInit() call relies on -- see the comment on
// SupplyReadinessService.academyService.
function fakeModuleRef(academyService: AcademyService | undefined) {
  return {
    get: () => {
      if (!academyService) {
        throw new Error("no provider found (strict: false)");
      }
      return academyService;
    },
  } as unknown as import("@nestjs/core").ModuleRef;
}

function createReadinessServiceWithAcademy(
  driverId: string,
  academyService: AcademyService | undefined,
) {
  const partner: FleetPartnerRecord = {
    fleetPartnerId: "fleet-demo-001",
    legalName: "Demo Fleet",
    displayName: "Demo Fleet",
    businessRegistrationNo: "12345678",
    contactName: "Ops",
    contactPhone: "02-1234-5678",
    active: true,
    partnershipType: "fleet_management",
  };

  const service = new SupplyReadinessService(
    {
      getFleetPartner: () => ({ ...partner }),
      listFleetPartnerDrivers: () => [createDriverAffiliation(driverId)],
    } as unknown as FleetPartnerService,
    {
      listDrivers: () => [createDriver(driverId)],
      listVehicles: () => [],
      listSupplyPairs: () => [],
    } as unknown as RegulatoryRegistryService,
    {
      resolveRuntimeVehicleCapability: () => undefined,
    } as unknown as VehicleEligibilityService,
    {
      loadState: async () => ({
        submissions: [],
        driverDrafts: [],
        vehicleDrafts: [],
        documents: [],
        reviewEvents: [],
        vehicleAffiliations: [],
      }),
    } as unknown as SupplySubmissionRepository,
    fakeModuleRef(academyService),
  );
  service.onModuleInit();
  return service;
}

describe("SR-WIRE-001: driver-academy training wired into fleet-partner readiness", () => {
  it("pushes TRAINING_REQUIRED when a required course is not passed", async () => {
    const driverId = "drv-training-incomplete";
    const academyService = {
      listCourses: async () => [
        {
          courseId: "course-safety-101",
          courseCode: "SAFETY-101",
          title: "Safety Basics",
          category: "safety",
          isRequired: true,
          validityDays: 365,
          passingScore: 80,
          version: 1,
          modulesCount: 3,
          userStatus: "not_started",
        },
      ],
    } as unknown as AcademyService;

    const service = createReadinessServiceWithAcademy(driverId, academyService);
    const record = await service.getDriverReadiness("fleet-demo-001", driverId);

    expect(record.reasonCodes).toContain("TRAINING_REQUIRED");
    expect(record.state).toBe("not_ready");
  });

  it("does not push TRAINING_REQUIRED once every required course is passed", async () => {
    const driverId = "drv-training-complete";
    const academyService = {
      listCourses: async () => [
        {
          courseId: "course-safety-101",
          courseCode: "SAFETY-101",
          title: "Safety Basics",
          category: "safety",
          isRequired: true,
          validityDays: 365,
          passingScore: 80,
          version: 1,
          modulesCount: 3,
          userStatus: "passed",
        },
      ],
    } as unknown as AcademyService;

    const service = createReadinessServiceWithAcademy(driverId, academyService);
    const record = await service.getDriverReadiness("fleet-demo-001", driverId);

    expect(record.reasonCodes).not.toContain("TRAINING_REQUIRED");
    expect(record.state).toBe("ready");
  });

  it("is reversible: readiness re-evaluates per request, so completing the course later clears the reason", async () => {
    const driverId = "drv-training-reversible";
    let status: "not_started" | "passed" = "not_started";
    const academyService = {
      listCourses: async () => [
        {
          courseId: "course-safety-101",
          courseCode: "SAFETY-101",
          title: "Safety Basics",
          category: "safety",
          isRequired: true,
          validityDays: 365,
          passingScore: 80,
          version: 1,
          modulesCount: 3,
          userStatus: status,
        },
      ],
    } as unknown as AcademyService;

    const service = createReadinessServiceWithAcademy(driverId, academyService);
    const before = await service.getDriverReadiness("fleet-demo-001", driverId);
    expect(before.reasonCodes).toContain("TRAINING_REQUIRED");

    status = "passed";
    const after = await service.getDriverReadiness("fleet-demo-001", driverId);
    expect(after.reasonCodes).not.toContain("TRAINING_REQUIRED");
  });

  it("degrades gracefully (no crash, no false TRAINING_REQUIRED) when AcademyService is not registered in the module graph", async () => {
    const driverId = "drv-no-academy-provider";
    const service = createReadinessServiceWithAcademy(driverId, undefined);
    const record = await service.getDriverReadiness("fleet-demo-001", driverId);

    expect(record.reasonCodes).not.toContain("TRAINING_REQUIRED");
  });

  it("does not touch RegulatoryRegistryService's AV/vehicle dispatch-eligibility condition", async () => {
    const driverId = "drv-training-incomplete-2";
    let listDriversCallCount = 0;
    const academyService = {
      listCourses: async () => [
        {
          courseId: "course-safety-101",
          courseCode: "SAFETY-101",
          title: "Safety Basics",
          category: "safety",
          isRequired: true,
          validityDays: 365,
          passingScore: 80,
          version: 1,
          modulesCount: 3,
          userStatus: "not_started",
        },
      ],
    } as unknown as AcademyService;

    const partner: FleetPartnerRecord = {
      fleetPartnerId: "fleet-demo-001",
      legalName: "Demo Fleet",
      displayName: "Demo Fleet",
      businessRegistrationNo: "12345678",
      contactName: "Ops",
      contactPhone: "02-1234-5678",
      active: true,
      partnershipType: "fleet_management",
    };
    const driver = createDriver(driverId);
    const regulatoryRegistryService = {
      listDrivers: () => {
        listDriversCallCount += 1;
        // dispatchEligible/eligibilityBlockedReasons come straight from the
        // registry's own record, untouched by this readiness reason code.
        return [driver];
      },
      listVehicles: () => [],
      listSupplyPairs: () => [],
    } as unknown as RegulatoryRegistryService;

    const service = new SupplyReadinessService(
      {
        getFleetPartner: () => ({ ...partner }),
        listFleetPartnerDrivers: () => [createDriverAffiliation(driverId)],
      } as unknown as FleetPartnerService,
      regulatoryRegistryService,
      { resolveRuntimeVehicleCapability: () => undefined } as unknown as VehicleEligibilityService,
      {
        loadState: async () => ({
          submissions: [],
          driverDrafts: [],
          vehicleDrafts: [],
          documents: [],
          reviewEvents: [],
          vehicleAffiliations: [],
        }),
      } as unknown as SupplySubmissionRepository,
      fakeModuleRef(academyService),
    );
    service.onModuleInit();

    await service.getDriverReadiness("fleet-demo-001", driverId);

    expect(listDriversCallCount).toBeGreaterThan(0);
    expect(driver.dispatchEligible).toBe(true);
    expect(driver.eligibilityBlockedReasons).toEqual([]);
  });
});
