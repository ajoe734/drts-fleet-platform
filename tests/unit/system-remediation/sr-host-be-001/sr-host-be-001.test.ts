import fs from "node:fs";
import path from "node:path";
import { beforeEach, describe, expect, it } from "vitest";

import {
  HostViewRepository,
  HostViewService,
  HostViewController,
  HostViewModule,
  maskVin,
  maskAreaSummary,
  mapComplaintCategory,
  mapComplaintStatus,
  mapMaintenanceStatus,
  extractResolutionSummary,
  HOST_ERROR_CODES,
} from "../../../../apps/api/src/modules/host-view";
import { createRequire } from "node:module";
const apiRequire = createRequire(
  path.resolve(__dirname, "../../../../apps/api/package.json"),
);
const { NestFactory } = apiRequire("@nestjs/core") as {
  NestFactory: {
    create(
      moduleCls: unknown,
      options?: { logger?: boolean },
    ): Promise<any>;
  };
};
import {
  evaluateTenantApprovalRules,
  TENANT_APPROVAL_RULE_CONDITION_FIELDS,
  CANONICAL_TENANT_APPROVAL_RULE_CONDITION_FIELDS,
} from "../../../../apps/api/src/modules/tenant-partner/tenant-approval-rule-evaluator";
import { ApiRequestError } from "../../../../apps/api/src/common/api-envelope";
import type { BootstrapRequestIdentity } from "../../../../apps/api/src/common/auth/auth.types";

function createMockIdentity(overrides?: Partial<BootstrapRequestIdentity>): BootstrapRequestIdentity {
  return {
    authMode: "bootstrap_headers",
    actorType: "partner_user",
    actorId: "partner_user_001",
    partnerId: "partner_host_a",
    realm: "partner",
    tenantId: "tenant_001",
    roleFamilies: ["partner"],
    roles: ["vehicle_owner"],
    scopes: ["owned:read", "reports:read", "maintenance:read"],
    requestId: "req_test_001",
    ...overrides,
  };
}

describe("SR-HOST-BE-001: Host Restricted Read Model & Vehicle Access Authorization", () => {
  let repository: HostViewRepository;
  let service: HostViewService;
  let controller: HostViewController;

  const HOST_A = "partner_host_a";
  const HOST_B = "partner_host_b";
  const HOST_C = "partner_host_c";

  const VEHICLE_A1 = "veh_host_a_001";
  const VEHICLE_A2 = "veh_host_a_002";
  const VEHICLE_B1 = "veh_host_b_001";

  beforeEach(() => {
    repository = new HostViewRepository();
    service = new HostViewService(repository);
    controller = new HostViewController(service);

    // Seed vehicles for Host A
    repository.seedVehicle({
      vehicleId: VEHICLE_A1,
      ownerPartnerId: HOST_A,
      plateNo: "TDC-1001",
      vin: "1HGCR2F83HA100101",
      vehicleForm: "sedan",
      licenseClass: "multi_taxi",
      energyType: "electric",
      currentStatus: "active",
      operatingFleetName: "Metro Fleet North",
      contractPeriod: {
        startAt: "2026-01-01T00:00:00.000Z",
        endAt: "2026-12-31T23:59:59.000Z",
        status: "active",
      },
    });

    repository.seedVehicle({
      vehicleId: VEHICLE_A2,
      ownerPartnerId: HOST_A,
      plateNo: "TDC-1002",
      vin: "1HGCR2F83HA100102",
      vehicleForm: "mpv",
      licenseClass: "taxi",
      energyType: "hybrid",
      currentStatus: "maintenance",
      operatingFleetName: "Metro Fleet South",
      contractPeriod: null,
    });

    // Seed vehicle for Host B
    repository.seedVehicle({
      vehicleId: VEHICLE_B1,
      ownerPartnerId: HOST_B,
      plateNo: "TDC-2001",
      vin: "2T1BURHE5JC200201",
      vehicleForm: "sedan",
      licenseClass: "multi_taxi",
      energyType: "fuel",
      currentStatus: "active",
      operatingFleetName: "City Cab East",
      contractPeriod: {
        startAt: "2026-03-01T00:00:00.000Z",
        endAt: "2027-02-28T23:59:59.000Z",
        status: "active",
      },
    });
  });

  // ==========================================================================
  // Suite 1: Database Migration V0096 Verification
  // ==========================================================================
  describe("Suite 1: Database Migration V0096 Specification", () => {
    const migrationPath = path.resolve(
      process.cwd(),
      "infra/migrations/V0096__sr_host_vehicle_access.sql",
    );

    it("V0096 migration file exists at allocated path", () => {
      expect(fs.existsSync(migrationPath)).toBe(true);
    });

    it("V0096 contains index on reg.vehicles(owner_partner_id)", () => {
      const sql = fs.readFileSync(migrationPath, "utf-8");
      expect(sql).toContain("idx_reg_vehicles_owner_partner_id");
      expect(sql).toContain("ON reg.vehicles(owner_partner_id)");
    });

    it("V0096 defines ops.phase1_host_vehicle_projections view with masked VIN and fleet join", () => {
      const sql = fs.readFileSync(migrationPath, "utf-8");
      expect(sql).toContain("ops.phase1_host_vehicle_projections");
      expect(sql).toContain("vin_masked");
      expect(sql).toContain("operating_fleet_name");
      expect(sql).toContain("contract_period");
      expect(sql).toContain("core.partners");
    });

    it("V0096 respects anti-collision invariants and schema-allocation.json boundaries", () => {
      const schemaAllocPath = path.resolve(
        process.cwd(),
        "docs/04-uat/system-remediation-20260906/schema-allocation.json",
      );
      if (fs.existsSync(schemaAllocPath)) {
        const alloc = JSON.parse(fs.readFileSync(schemaAllocPath, "utf-8"));
        const hostAlloc = alloc.allocations.find(
          (a: { task_id: string }) => a.task_id === "SR-HOST-BE-001",
        );
        expect(hostAlloc).toBeDefined();
        expect(hostAlloc.version).toBe("V0096");
        expect(hostAlloc.migration_filename).toBe("V0096__sr_host_vehicle_access.sql");
        expect(hostAlloc.target_schema).toBe("ops");
        expect(hostAlloc.primary_views_or_tables).toContain("ops.phase1_host_vehicle_projections");
      }
    });
  });

  // ==========================================================================
  // Suite 2: Host Vehicle List & Field Projection (AC-HOST-POS-1)
  // ==========================================================================
  describe("Suite 2: Host Vehicle List & Field Projection (AC-HOST-POS-1)", () => {
    it("Host A sees only Host A's vehicles and not Host B's vehicles", async () => {
      const identityA = createMockIdentity({ partnerId: HOST_A });
      const resultA = await service.listVehicles(identityA);

      expect(resultA.items.length).toBe(2);
      expect(resultA.items.map((v) => v.vehicleId)).toEqual([VEHICLE_A1, VEHICLE_A2]);
      expect(resultA.items.some((v) => v.vehicleId === VEHICLE_B1)).toBe(false);

      const identityB = createMockIdentity({ partnerId: HOST_B });
      const resultB = await service.listVehicles(identityB);
      expect(resultB.items.length).toBe(1);
      expect(resultB.items[0]!.vehicleId).toBe(VEHICLE_B1);
      expect(resultB.items.some((v) => v.vehicleId === VEHICLE_A1)).toBe(false);
    });

    it("VIN is masked to replace the trailing 6 characters with asterisks", async () => {
      const identityA = createMockIdentity({ partnerId: HOST_A });
      const result = await service.listVehicles(identityA);

      const v1 = result.items.find((v) => v.vehicleId === VEHICLE_A1);
      expect(v1).toBeDefined();
      expect(v1!.vinMasked).toBe("1HGCR2F83HA******");
      expect(v1!.vinMasked.endsWith("******")).toBe(true);
      expect(v1!.vinMasked).not.toContain("100101");
    });

    it("VIN mask helper handles edge cases safely", () => {
      expect(maskVin("1HGCR2F83HA123456")).toBe("1HGCR2F83HA******");
      expect(maskVin("SHORT1")).toBe("******");
      expect(maskVin("12345")).toBe("******");
      expect(maskVin("")).toBe("******");
      expect(maskVin(null)).toBe("******");
      expect(maskVin(undefined)).toBe("******");
    });

    it("Projects vehicle form, license class, energy type, current status, fleet name, and contract period", async () => {
      const identityA = createMockIdentity({ partnerId: HOST_A });
      const result = await service.listVehicles(identityA);

      const v1 = result.items.find((v) => v.vehicleId === VEHICLE_A1)!;
      expect(v1.vehicleForm).toBe("sedan");
      expect(v1.licenseClass).toBe("multi_taxi");
      expect(v1.energyType).toBe("electric");
      expect(v1.currentStatus).toBe("active");
      expect(v1.operatingFleetName).toBe("Metro Fleet North");
      expect(v1.contractPeriod).toEqual({
        startAt: "2026-01-01T00:00:00.000Z",
        endAt: "2026-12-31T23:59:59.000Z",
        status: "active",
      });

      const v2 = result.items.find((v) => v.vehicleId === VEHICLE_A2)!;
      expect(v2.contractPeriod).toBeNull();
    });

    it("Supports pagination query parameters", async () => {
      const identityA = createMockIdentity({ partnerId: HOST_A });
      const page1 = await service.listVehicles(identityA, { page: 1, pageSize: 1 });

      expect(page1.items.length).toBe(1);
      expect(page1.items[0]!.vehicleId).toBe(VEHICLE_A1);
      expect(page1.pageInfo).toEqual({
        page: 1,
        pageSize: 1,
        totalItems: 2,
        totalPages: 2,
      });

      const page2 = await service.listVehicles(identityA, { page: 2, pageSize: 1 });
      expect(page2.items.length).toBe(1);
      expect(page2.items[0]!.vehicleId).toBe(VEHICLE_A2);
    });
  });

  // ==========================================================================
  // Suite 3: Cross-Host Isolation & Anti-Enumeration (AC-HOST-NEG-1)
  // ==========================================================================
  describe("Suite 3: Cross-Host Isolation & Anti-Enumeration 404 (AC-HOST-NEG-1)", () => {
    it("Host A attempting to read Host B vehicle earnings returns 404 HOST_VEHICLE_NOT_FOUND (NOT 403)", async () => {
      const identityA = createMockIdentity({ partnerId: HOST_A });

      try {
        await service.getVehicleEarnings(VEHICLE_B1, identityA, "2026-08");
        expect.unreachable("Should have thrown 404");
      } catch (err) {
        expect(err).toBeInstanceOf(ApiRequestError);
        const apiErr = err as ApiRequestError;
        expect(apiErr.getStatus()).toBe(404);
        expect(apiErr.code).toBe(HOST_ERROR_CODES.VEHICLE_NOT_FOUND);
      }
    });

    it("Host A attempting to read Host B maintenance logs returns 404 HOST_VEHICLE_NOT_FOUND", async () => {
      const identityA = createMockIdentity({ partnerId: HOST_A });

      try {
        await service.listVehicleMaintenance(VEHICLE_B1, identityA);
        expect.unreachable("Should have thrown 404");
      } catch (err) {
        expect(err).toBeInstanceOf(ApiRequestError);
        const apiErr = err as ApiRequestError;
        expect(apiErr.getStatus()).toBe(404);
        expect(apiErr.code).toBe(HOST_ERROR_CODES.VEHICLE_NOT_FOUND);
      }
    });

    it("Host A attempting to read Host B trips returns 404 HOST_VEHICLE_NOT_FOUND", async () => {
      const identityA = createMockIdentity({ partnerId: HOST_A });

      try {
        await service.listVehicleTrips(VEHICLE_B1, identityA);
        expect.unreachable("Should have thrown 404");
      } catch (err) {
        expect(err).toBeInstanceOf(ApiRequestError);
        const apiErr = err as ApiRequestError;
        expect(apiErr.getStatus()).toBe(404);
        expect(apiErr.code).toBe(HOST_ERROR_CODES.VEHICLE_NOT_FOUND);
      }
    });

    it("Host A attempting to read Host B cases returns 404 HOST_VEHICLE_NOT_FOUND", async () => {
      const identityA = createMockIdentity({ partnerId: HOST_A });

      try {
        await service.listVehicleCases(VEHICLE_B1, identityA);
        expect.unreachable("Should have thrown 404");
      } catch (err) {
        expect(err).toBeInstanceOf(ApiRequestError);
        const apiErr = err as ApiRequestError;
        expect(apiErr.getStatus()).toBe(404);
        expect(apiErr.code).toBe(HOST_ERROR_CODES.VEHICLE_NOT_FOUND);
      }
    });

    it("Non-existent vehicle ID returns 404 HOST_VEHICLE_NOT_FOUND", async () => {
      const identityA = createMockIdentity({ partnerId: HOST_A });

      try {
        await service.getVehicleEarnings("veh_non_existent", identityA);
        expect.unreachable("Should have thrown 404");
      } catch (err) {
        expect(err).toBeInstanceOf(ApiRequestError);
        const apiErr = err as ApiRequestError;
        expect(apiErr.getStatus()).toBe(404);
        expect(apiErr.code).toBe(HOST_ERROR_CODES.VEHICLE_NOT_FOUND);
      }
    });
  });

  // ==========================================================================
  // Suite 4: Ownership Transfer and Lifecycle Revocation
  // ==========================================================================
  describe("Suite 4: Ownership Transfer & Access Revocation (離開所有權後即失效)", () => {
    it("Access immediately revokes (404) once vehicle ownership transfers to another host", async () => {
      const identityA = createMockIdentity({ partnerId: HOST_A });
      const identityC = createMockIdentity({ partnerId: HOST_C });

      // Before transfer: Host A can access VEHICLE_A1
      const earningsBefore = await service.getVehicleEarnings(VEHICLE_A1, identityA);
      expect(earningsBefore.vehicleId).toBe(VEHICLE_A1);

      // Transfer VEHICLE_A1 from Host A to Host C
      repository.transferVehicleOwnership(VEHICLE_A1, HOST_C);

      // After transfer: Host A must immediately receive 404 HOST_VEHICLE_NOT_FOUND on all endpoints
      await expect(service.getVehicleEarnings(VEHICLE_A1, identityA)).rejects.toThrow(
        expect.objectContaining({ code: HOST_ERROR_CODES.VEHICLE_NOT_FOUND }),
      );
      await expect(service.listVehicleMaintenance(VEHICLE_A1, identityA)).rejects.toThrow(
        expect.objectContaining({ code: HOST_ERROR_CODES.VEHICLE_NOT_FOUND }),
      );
      await expect(service.listVehicleTrips(VEHICLE_A1, identityA)).rejects.toThrow(
        expect.objectContaining({ code: HOST_ERROR_CODES.VEHICLE_NOT_FOUND }),
      );
      await expect(service.listVehicleCases(VEHICLE_A1, identityA)).rejects.toThrow(
        expect.objectContaining({ code: HOST_ERROR_CODES.VEHICLE_NOT_FOUND }),
      );

      // VEHICLE_A1 no longer appears in Host A list
      const listA = await service.listVehicles(identityA);
      expect(listA.items.some((v) => v.vehicleId === VEHICLE_A1)).toBe(false);

      // VEHICLE_A1 is now accessible by Host C
      const earningsC = await service.getVehicleEarnings(VEHICLE_A1, identityC);
      expect(earningsC.vehicleId).toBe(VEHICLE_A1);
      const listC = await service.listVehicles(identityC);
      expect(listC.items.some((v) => v.vehicleId === VEHICLE_A1)).toBe(true);
    });

    it("Deactivated/deregistered vehicle is excluded from host view and access returns 404", async () => {
      const identityA = createMockIdentity({ partnerId: HOST_A });
      repository.setVehicleActive(VEHICLE_A2, false);

      const listA = await service.listVehicles(identityA);
      expect(listA.items.some((v) => v.vehicleId === VEHICLE_A2)).toBe(false);

      await expect(service.getVehicleEarnings(VEHICLE_A2, identityA)).rejects.toThrow(
        expect.objectContaining({ code: HOST_ERROR_CODES.VEHICLE_NOT_FOUND }),
      );
    });
  });

  // ==========================================================================
  // Suite 5: Authoritative Earnings & Financial Policy Hold Rule
  // ==========================================================================
  describe("Suite 5: Authoritative Earnings & Financial Policy Hold Rule", () => {
    it("Calculates grossRevenue from completed trips, 15% platformFee, and leaves commission/net as null pending_policy", async () => {
      // Seed completed trips in 2026-08
      repository.seedTripItem({
        tripId: "trip_001",
        vehicleId: VEHICLE_A1,
        startedAt: "2026-08-05T09:00:00.000Z",
        completedAt: "2026-08-05T09:30:00.000Z",
        areaSummary: "大安區 → 信義區",
        distanceKm: 8.5,
        fareAmount: 500,
        status: "completed",
      });

      repository.seedTripItem({
        tripId: "trip_002",
        vehicleId: VEHICLE_A1,
        startedAt: "2026-08-05T14:00:00.000Z",
        completedAt: "2026-08-05T14:45:00.000Z",
        areaSummary: "中正區 → 南港區",
        distanceKm: 12.0,
        fareAmount: 700,
        status: "completed",
      });

      repository.seedTripItem({
        tripId: "trip_003",
        vehicleId: VEHICLE_A1,
        startedAt: "2026-08-12T10:00:00.000Z",
        completedAt: "2026-08-12T10:40:00.000Z",
        areaSummary: "中山區 → 內湖區",
        distanceKm: 9.2,
        fareAmount: 800,
        status: "completed",
      });

      // Seed a cancelled trip (should not count towards grossRevenue)
      repository.seedTripItem({
        tripId: "trip_004",
        vehicleId: VEHICLE_A1,
        startedAt: "2026-08-15T10:00:00.000Z",
        completedAt: null,
        areaSummary: "松山區 → 萬華區",
        distanceKm: 0,
        fareAmount: 400,
        status: "cancelled",
      });

      // Seed a trip in a different month (2026-09)
      repository.seedTripItem({
        tripId: "trip_005",
        vehicleId: VEHICLE_A1,
        startedAt: "2026-09-01T10:00:00.000Z",
        completedAt: "2026-09-01T10:30:00.000Z",
        areaSummary: "大安區 → 文山區",
        distanceKm: 7.0,
        fareAmount: 600,
        status: "completed",
      });

      const identityA = createMockIdentity({ partnerId: HOST_A });
      const earnings = await service.getVehicleEarnings(VEHICLE_A1, identityA, "2026-08");

      expect(earnings.vehicleId).toBe(VEHICLE_A1);
      expect(earnings.period).toBe("2026-08");
      expect(earnings.currency).toBe("TWD");

      // 500 + 700 + 800 = 2000
      expect(earnings.grossRevenue).toBe(2000);
      // 15% of 2000 = 300
      expect(earnings.platformFee).toBe(300);

      // Boundary invariant: financial_policy_hold_rule strictly mandates null
      expect(earnings.fleetCommission).toBeNull();
      expect(earnings.netEarnings).toBeNull();
      expect(earnings.settlementStatus).toBe("pending_policy");

      // 3 completed trips in 2026-08
      expect(earnings.tripsCount).toBe(3);
      // 2 distinct operating days (2026-08-05 and 2026-08-12)
      expect(earnings.operatingDays).toBe(2);
    });

    it("Zero revenue and empty data compatibility (AC-HOST-POS-3)", async () => {
      const identityA = createMockIdentity({ partnerId: HOST_A });
      const earnings = await service.getVehicleEarnings(VEHICLE_A2, identityA, "2026-08");

      expect(earnings.vehicleId).toBe(VEHICLE_A2);
      expect(earnings.period).toBe("2026-08");
      expect(earnings.currency).toBe("TWD");
      expect(earnings.grossRevenue).toBe(0);
      expect(earnings.platformFee).toBe(0);
      expect(earnings.fleetCommission).toBeNull();
      expect(earnings.netEarnings).toBeNull();
      expect(earnings.tripsCount).toBe(0);
      expect(earnings.operatingDays).toBe(0);
      expect(earnings.settlementStatus).toBe("pending_policy");
    });
  });

  // ==========================================================================
  // Suite 6: Trips Projection & PII Redaction (AC-HOST-POS-2)
  // ==========================================================================
  describe("Suite 6: Trips Projection & PII Redaction (AC-HOST-POS-2)", () => {
    it("Redacts passenger PII and projects high-level areaSummary", async () => {
      repository.seedTripItem({
        tripId: "trip_pii_001",
        vehicleId: VEHICLE_A1,
        startedAt: "2026-08-10T10:00:00.000Z",
        completedAt: "2026-08-10T10:30:00.000Z",
        areaSummary: maskAreaSummary(
          "台北市信義區忠孝東路五段100號3樓",
          "台北市內湖區瑞光路500號",
        ),
        distanceKm: 11.4,
        fareAmount: 620,
        status: "completed",
      });

      const identityA = createMockIdentity({ partnerId: HOST_A });
      const trips = await service.listVehicleTrips(VEHICLE_A1, identityA);

      expect(trips.items.length).toBe(1);
      const trip = trips.items[0]!;
      expect(trip.areaSummary).toBe("信義區 → 內湖區");
      // Assert no street names, numbers, or phone details in projection
      expect(trip.areaSummary).not.toContain("忠孝東路");
      expect(trip.areaSummary).not.toContain("100號");
      expect(trip.areaSummary).not.toContain("瑞光路");
      expect(trip.distanceKm).toBe(11.4);
      expect(trip.fareAmount).toBe(620);
    });

    it("maskAreaSummary helper extracts districts across various address formats", () => {
      expect(
        maskAreaSummary("新北市板橋區縣民大道二段7號", "新北市中和區中正路100號"),
      ).toBe("板橋區 → 中和區");
      expect(
        maskAreaSummary("台中市西屯區台灣大道三段99號", "台中市南屯區文心南路200號"),
      ).toBe("西屯區 → 南屯區");
      expect(maskAreaSummary(null, undefined)).toBe("市區 → 市區");
    });
  });

  // ==========================================================================
  // Suite 7: Maintenance Logs Projection
  // ==========================================================================
  describe("Suite 7: Maintenance Logs Projection", () => {
    it("Returns maintenance logs with aligned status values including overdue", async () => {
      repository.seedMaintenanceItem({
        maintenanceId: "maint_001",
        vehicleId: VEHICLE_A1,
        type: "regular_inspection",
        description: "50,000 km regular maintenance and battery health check",
        status: mapMaintenanceStatus("completed"),
        scheduledAt: "2026-07-01",
        completedAt: "2026-07-01",
        cost: 4500,
        notesSummary: "Brake pads replaced; battery SOH at 97%",
      });

      repository.seedMaintenanceItem({
        maintenanceId: "maint_002",
        vehicleId: VEHICLE_A1,
        type: "tire_rotation",
        description: "Tire rotation and pressure balancing",
        status: mapMaintenanceStatus("overdue"),
        scheduledAt: "2026-08-01",
        completedAt: null,
        cost: null,
        notesSummary: null,
      });

      const identityA = createMockIdentity({ partnerId: HOST_A });
      const result = await service.listVehicleMaintenance(VEHICLE_A1, identityA);

      expect(result.items.length).toBe(2);
      expect(result.items[0]!.status).toBe("completed");
      expect(result.items[0]!.cost).toBe(4500);
      expect(result.items[1]!.status).toBe("overdue");
      expect(result.items[1]!.cost).toBeNull();
    });
  });

  // ==========================================================================
  // Suite 8: Cases Projection & PII Redaction
  // ==========================================================================
  describe("Suite 8: Cases Projection & PII Redaction", () => {
    it("Redacts complainant info and projects de-identified cases", async () => {
      repository.seedCaseItem({
        caseId: "case_001",
        vehicleId: VEHICLE_A1,
        category: mapComplaintCategory("vehicle_condition"),
        status: mapComplaintStatus("resolved"),
        reportedAt: "2026-08-02T14:30:00.000Z",
        resolvedAt: "2026-08-03T10:00:00.000Z",
        resolutionSummary: extractResolutionSummary({
          closingNote: "Air conditioning filter cleaned and re-calibrated.",
        }),
      });

      repository.seedCaseItem({
        caseId: "case_002",
        vehicleId: VEHICLE_A1,
        category: mapComplaintCategory("safety_concern"),
        status: mapComplaintStatus("under_investigation"),
        reportedAt: "2026-08-15T18:00:00.000Z",
        resolvedAt: null,
        resolutionSummary: null,
      });

      const identityA = createMockIdentity({ partnerId: HOST_A });
      const result = await service.listVehicleCases(VEHICLE_A1, identityA);

      expect(result.items.length).toBe(2);
      expect(result.items[0]!.category).toBe("vehicle_condition");
      expect(result.items[0]!.status).toBe("resolved");
      expect(result.items[0]!.resolutionSummary).toBe(
        "Air conditioning filter cleaned and re-calibrated.",
      );

      expect(result.items[1]!.category).toBe("accident");
      expect(result.items[1]!.status).toBe("investigating");
      expect(result.items[1]!.resolvedAt).toBeNull();
      expect(result.items[1]!.resolutionSummary).toBeNull();
    });

    it("Case mapper helpers categorize complaints safely without leaking PII", () => {
      expect(mapComplaintCategory("safety_concern")).toBe("accident");
      expect(mapComplaintCategory("equipment")).toBe("equipment");
      expect(mapComplaintCategory("driver_service")).toBe("service_feedback");
      expect(mapComplaintCategory(null)).toBe("service_feedback");

      expect(mapComplaintStatus("under_investigation")).toBe("investigating");
      expect(mapComplaintStatus("closed")).toBe("closed");
      expect(mapComplaintStatus("new")).toBe("open");

      expect(
        extractResolutionSummary({ closingNote: "Resolved with refund", resolutionCode: "resolved_with_refund" }),
      ).toBe("Resolved with refund");
      expect(
        extractResolutionSummary({ closingNote: null, resolutionCode: "resolved_no_fault" }),
      ).toBe("resolved_no_fault");
      expect(extractResolutionSummary(null)).toBeNull();
    });
  });

  // ==========================================================================
  // Suite 9: Strict Read-Only Enforcement (AC-HOST-NEG-2)
  // ==========================================================================
  describe("Suite 9: Strict Read-Only Enforcement (AC-HOST-NEG-2)", () => {
    it("Controller rejects POST mutation with 405 Method Not Allowed", () => {
      try {
        controller.rejectPost();
        expect.unreachable("Should have thrown 405");
      } catch (err) {
        expect(err).toBeInstanceOf(ApiRequestError);
        const apiErr = err as ApiRequestError;
        expect(apiErr.getStatus()).toBe(405);
        expect(apiErr.code).toBe(HOST_ERROR_CODES.MUTATION_NOT_SUPPORTED);
      }
    });

    it("Controller rejects PUT mutation with 405 Method Not Allowed", () => {
      try {
        controller.rejectPut();
        expect.unreachable("Should have thrown 405");
      } catch (err) {
        expect(err).toBeInstanceOf(ApiRequestError);
        const apiErr = err as ApiRequestError;
        expect(apiErr.getStatus()).toBe(405);
        expect(apiErr.code).toBe(HOST_ERROR_CODES.MUTATION_NOT_SUPPORTED);
      }
    });

    it("Controller rejects PATCH mutation with 405 Method Not Allowed", () => {
      try {
        controller.rejectPatch();
        expect.unreachable("Should have thrown 405");
      } catch (err) {
        expect(err).toBeInstanceOf(ApiRequestError);
        const apiErr = err as ApiRequestError;
        expect(apiErr.getStatus()).toBe(405);
        expect(apiErr.code).toBe(HOST_ERROR_CODES.MUTATION_NOT_SUPPORTED);
      }
    });

    it("Controller rejects DELETE mutation with 405 Method Not Allowed", () => {
      try {
        controller.rejectDelete();
        expect.unreachable("Should have thrown 405");
      } catch (err) {
        expect(err).toBeInstanceOf(ApiRequestError);
        const apiErr = err as ApiRequestError;
        expect(apiErr.getStatus()).toBe(405);
        expect(apiErr.code).toBe(HOST_ERROR_CODES.MUTATION_NOT_SUPPORTED);
      }
    });
  });

  // ==========================================================================
  // Suite 10: Authentication & Realm Enforcement
  // ==========================================================================
  describe("Suite 10: Authentication & Realm Enforcement", () => {
    it("Throws 401 HOST_UNAUTHORIZED when no identity is provided", async () => {
      await expect(service.listVehicles(null)).rejects.toThrow(
        expect.objectContaining({
          status: 401,
          code: HOST_ERROR_CODES.UNAUTHORIZED,
        }),
      );
    });

    it("Throws 403 HOST_FORBIDDEN when identity realm is not partner", async () => {
      const driverIdentity = createMockIdentity({ realm: "driver", partnerId: null });
      await expect(service.listVehicles(driverIdentity)).rejects.toThrow(
        expect.objectContaining({
          status: 403,
          code: HOST_ERROR_CODES.FORBIDDEN,
        }),
      );
    });

    it("Throws 401 HOST_UNAUTHORIZED when partnerId is missing from partner claim", async () => {
      const invalidPartnerIdentity = createMockIdentity({
        realm: "partner",
        partnerId: null,
        actorId: null,
      });
      await expect(service.listVehicles(invalidPartnerIdentity)).rejects.toThrow(
        expect.objectContaining({
          status: 401,
          code: HOST_ERROR_CODES.UNAUTHORIZED,
        }),
      );
    });

    it("Throws 403 HOST_FORBIDDEN when required scope is absent", async () => {
      const limitedIdentity = createMockIdentity({
        scopes: ["other:read"],
      });
      await expect(service.listVehicles(limitedIdentity)).rejects.toThrow(
        expect.objectContaining({
          status: 403,
          code: HOST_ERROR_CODES.FORBIDDEN,
        }),
      );
    });
  });

  // ==========================================================================
  // Suite 11: Controller API Envelope Formatting
  // ==========================================================================
  describe("Suite 11: Controller API Envelope Formatting", () => {
    it("listVehicles wraps output in ApiSuccessEnvelope with requestId and timestamp", async () => {
      const identityA = createMockIdentity({ partnerId: HOST_A });
      const res = await controller.listVehicles(identityA, 1, 10, "req_custom_123");

      expect(res).toBeDefined();
      expect(res.meta.requestId).toBe("req_custom_123");
      expect(res.meta.timestamp).toBeDefined();
      expect(res.data.items.length).toBe(2);
      expect(res.data.pageInfo.totalItems).toBe(2);
    });

    it("getEarnings wraps output in ApiSuccessEnvelope", async () => {
      const identityA = createMockIdentity({ partnerId: HOST_A });
      const res = await controller.getEarnings(
        VEHICLE_A1,
        identityA,
        "2026-08",
        "req_earnings_001",
      );

      expect(res.meta.requestId).toBe("req_earnings_001");
      expect(res.data.vehicleId).toBe(VEHICLE_A1);
      expect(res.data.settlementStatus).toBe("pending_policy");
    });
  });

  // ==========================================================================
  // Suite 12: HostViewModule Bootstrap & Route Binding (SR-HOST-BE-001-POST-ACCEPTANCE-REPAIR-20260910)
  // ==========================================================================
  describe("Suite 12: HostViewModule Bootstrap & Route Binding", () => {
    it("successfully boots Nest application with HostViewModule under path-to-regexp@8.4.2", async () => {
      const app = await NestFactory.create(HostViewModule, { logger: false });
      app.setGlobalPrefix("api");
      await expect(app.init()).resolves.toBeDefined();

      const server = app.getHttpAdapter().getInstance();
      const routes = server.router.stack
        .filter((l: any) => l.route)
        .map((l: any) => ({
          path: l.route.path,
          methods: Object.keys(l.route.methods),
        }));

      // Verify that both exact vehicles path and wildcard subpath are registered for mutation rejections
      const postRoutes = routes.filter((r: any) => r.methods.includes("post"));
      const postPaths = postRoutes.map((r: any) => r.path);
      expect(postPaths).toContain("/api/host/vehicles");
      expect(postPaths).toContain("/api/host/vehicles/*splat");

      // Verify route matching for mutation layers
      const mutationLayers = server.router.stack.filter(
        (l: any) => l.route && l.route.methods.post,
      );
      expect(mutationLayers.some((l: any) => l.match("/api/host/vehicles"))).toBe(true);
      expect(mutationLayers.some((l: any) => l.match("/api/host/vehicles/"))).toBe(true);
      expect(mutationLayers.some((l: any) => l.match("/api/host/vehicles/veh_123"))).toBe(true);
      expect(mutationLayers.some((l: any) => l.match("/api/host/vehicles/veh_123/maintenance"))).toBe(true);
      expect(mutationLayers.some((l: any) => l.match("/api/host/other"))).toBe(false);

      await app.close();
    });
  });

  // ==========================================================================
  // Suite 13: Tenant Approval Rule Evaluator Contract & Bootstrap Resilience (SR-HOST-BE-001-POST-ACCEPTANCE-REPAIR-20260910)
  // ==========================================================================
  describe("Suite 13: Tenant Approval Rule Evaluator Contract & Bootstrap Resilience", () => {
    it("guarantees TENANT_APPROVAL_RULE_CONDITION_FIELDS is an iterable array with 13 canonical fields", () => {
      expect(Array.isArray(TENANT_APPROVAL_RULE_CONDITION_FIELDS)).toBe(true);
      expect(TENANT_APPROVAL_RULE_CONDITION_FIELDS.length).toBe(13);
      expect(Array.isArray(CANONICAL_TENANT_APPROVAL_RULE_CONDITION_FIELDS)).toBe(true);
      expect(CANONICAL_TENANT_APPROVAL_RULE_CONDITION_FIELDS.length).toBe(13);

      // Verify iterable via spread
      const set = new Set([...TENANT_APPROVAL_RULE_CONDITION_FIELDS]);
      expect(set.size).toBe(13);
      expect(set.has("booking.amount_minor")).toBe(true);
      expect(set.has("tenant.monthly_quota_remaining_percent")).toBe(true);
    });

    it("evaluates tenant approval rules cleanly using canonical condition fields", () => {
      const result = evaluateTenantApprovalRules({
        tenantId: "tenant_001",
        subject: {
          type: "booking_order",
          id: "ord_test_001",
          summary: "Test booking order",
        },
        inputSnapshot: {
          amountMinor: 50000,
          businessDispatchSubtype: "vip",
          vehiclePreference: "sedan",
          reservationWindowStart: "2026-09-10T12:00:00.000Z",
          passengerRole: "employee",
          passengerId: "usr_001",
          costCenterCode: "CC-01",
        },
        rules: [
          {
            ruleId: "rule_001",
            tenantId: "tenant_001",
            ruleName: "High amount rule",
            priority: 1,
            action: "require_approval",
            activeFlag: true,
            effectiveFrom: null,
            effectiveUntil: null,
            approvalMode: "any_of",
            approvers: [
              {
                principalType: "user",
                principalId: "approver_001",
                displayName: "Finance Approver",
              },
            ],
            conditions: [
              {
                field: "booking.amount_minor",
                operator: "gte",
                value: 30000,
              },
            ],
            createdAt: "2026-09-10T00:00:00.000Z",
            updatedAt: "2026-09-10T00:00:00.000Z",
          } as any,
        ],
        ruleVersionSnapshot: "v1",
      });

      expect(result).toBeDefined();
      expect(result.outcome.decision).toBe("require_approval");
      expect(result.matchedRules.length).toBe(1);
      expect(result.matchedRules[0].ruleId).toBe("rule_001");
    });
  });
});
