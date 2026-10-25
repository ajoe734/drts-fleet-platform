import { describe, expect, it, vi } from "vitest";

import type {
  DispatchDailyRecord,
  DriverRegistryRecord,
  InsurancePolicyRecord,
  MultiTaxiTripOperationalAdminView,
  SixMonthOperationsSummary,
  VehicleRegistryRecord,
} from "@drts/contracts";

import type { BootstrapRequestIdentity } from "../../../apps/api/src/common/auth/auth.types";
import { AgencyAccessAuditService } from "../../../apps/api/src/modules/agency-access/agency-access-audit.service";
import { AgencyAccessLogRepository } from "../../../apps/api/src/modules/agency-access/agency-access-log.repository";
import { AgencyPortalService } from "../../../apps/api/src/modules/agency-access/agency-portal.service";
import {
  computeExpiryStatus,
  filterAgencyExportRows,
  isWithinAgencyRetention,
  projectAgencyComplaintMonthlyStatistics,
  projectAgencyDailyDispatchRecord,
  projectAgencyDriverQualification,
  projectAgencyOperationsSummary,
  projectAgencyTripRecord,
  projectAgencyVehicleQualification,
} from "../../../apps/api/src/modules/agency-access/agency-projections";
import type { MonthlyOperationsSummaryRecord } from "../../../apps/api/src/modules/reporting/reporting.repository";

// BUREAU-R13 §4: every agency projection outputs only allowlisted fields,
// masks with the shared sensitive-data functions, keeps missing values null
// and excludes records outside the two-year retention boundary.
const DAY = 24 * 3600 * 1000;
const NOW = Date.parse("2026-10-25T00:00:00.000Z");

function tripRecord(
  overrides: Partial<MultiTaxiTripOperationalAdminView> = {},
): MultiTaxiTripOperationalAdminView {
  return {
    recordId: "mtr-order-1",
    orderId: "order-1",
    orderNo: "ORD-20261001-0001",
    tripId: "trip-1",
    assignmentId: "assignment-1",
    vehicleId: "vehicle-1",
    plateNo: "ABC-1234",
    reservedAt: "2026-10-01T01:00:00.000Z",
    pickupAt: "2026-10-01T01:05:00.000Z",
    dropoffAt: "2026-10-01T01:30:00.000Z",
    route: {
      encodedPolyline: "secret_polyline_encoding",
      pointCount: 1,
      distanceMeters: 5200,
      durationSeconds: 1500,
      source: "provider_route",
    },
    payableFareMinor: 320,
    actualFareMinor: 330,
    tollMinor: 0,
    currency: "TWD",
    farePolicyVersion: "fare-v3",
    chargingMode: "meter",
    generatedAt: "2026-10-01T01:30:00.000Z",
    retainUntil: "2028-09-30T01:30:00.000Z",
    legalHold: {
      state: "active",
      family: "proof_bundle",
      subjectId: "order-1",
      activeHoldCount: 1,
      activeHolds: [
        {
          holdId: "hold-1",
          caseNumber: "CASE-1",
          reasonCode: "regulatory_inquiry",
          reasonNote: "free text note",
          placedByActorId: "platform-admin-7",
          placedAt: "2026-10-02T00:00:00.000Z",
        },
      ],
    },
    ...overrides,
  } as MultiTaxiTripOperationalAdminView;
}

describe("BUREAU-R13 agency projections", () => {
  it("R11 list/detail projection exposes D4 statutory fields + provenance while withholding raw polyline and internal hold metadata", () => {
    const view = projectAgencyTripRecord(
      tripRecord({
        route: {
          encodedPolyline: "secret_polyline_encoding",
          pointCount: 1,
          distanceMeters: 5200,
          durationSeconds: 1500,
          source: "pickup_dropoff_summary",
          routeSummary: "台北車站 → 松山機場",
        },
        collectedFareMinor: 330,
        paymentStatus: "captured",
        tollMinor: 40,
        tollSource: "driver_proof",
      }),
    );
    expect(Object.keys(view).sort()).toEqual(
      [
        "recordId",
        "orderId",
        "tripId",
        "orderNoMasked",
        "plateNo",
        "plateNoMasked",
        "reservedAt",
        "pickupAt",
        "dropoffAt",
        "route",
        "payableFareMinor",
        "actualFareMinor",
        "collectedFareMinor",
        "paymentStatus",
        "tollMinor",
        "tollSource",
        "currency",
        "farePolicyVersion",
        "chargingMode",
        "generatedAt",
        "retainUntil",
        "legalHold",
      ].sort(),
    );
    expect(view.plateNo).toBe("ABC-1234");
    expect(view.plateNoMasked).not.toBe("ABC-1234");
    expect(view.route).toEqual({
      routeSummary: "台北車站 → 松山機場",
      source: "pickup_dropoff_summary",
      distanceMeters: 5200,
      durationSeconds: 1500,
    });
    expect(view.collectedFareMinor).toBe(330);
    expect(view.paymentStatus).toBe("captured");
    expect(view.tollMinor).toBe(40);
    expect(view.tollSource).toBe("driver_proof");
    expect(view.legalHold).toEqual({ state: "active" });
    expect(view.orderNoMasked).not.toContain("20261001");
    expect(view.orderNoMasked?.startsWith("ORD")).toBe(true);
    const serialized = JSON.stringify(view);
    for (const secret of [
      "secret_polyline_encoding",
      "platform-admin-7",
      "free text note",
      "vehicle-1",
      "assignment-1",
    ]) {
      expect(serialized).not.toContain(secret);
    }
  });

  it("keeps missing values null instead of inventing zero or fabricating collected fare", () => {
    const view = projectAgencyTripRecord(
      tripRecord({
        pickupAt: null,
        dropoffAt: null,
        route: {
          encodedPolyline: null,
          pointCount: 0,
          distanceMeters: null,
          durationSeconds: null,
          source: "unavailable",
          routeSummary: null,
        },
        paymentStatus: "authorized",
        collectedFareMinor: null,
        tollMinor: 0,
        tollSource: "unavailable",
      }),
    );
    expect(view.pickupAt).toBeNull();
    expect(view.dropoffAt).toBeNull();
    expect(view.route).toEqual({
      routeSummary: null,
      source: "unavailable",
      distanceMeters: null,
      durationSeconds: null,
    });
    expect(view.paymentStatus).toBe("authorized");
    expect(view.collectedFareMinor).toBeNull();
    expect(view.tollMinor).toBeNull();
    expect(view.tollSource).toBe("unavailable");

    const refundedView = projectAgencyTripRecord(
      tripRecord({
        paymentStatus: "refunded",
        collectedFareMinor: 0,
      }),
    );
    expect(refundedView.paymentStatus).toBe("refunded");
    expect(refundedView.collectedFareMinor).toBe(0);
  });

  it("applies the two-year retention boundary on retainUntil (not reservedAt)", () => {
    expect(
      isWithinAgencyRetention(new Date(NOW + DAY).toISOString(), NOW),
    ).toBe(true);
    expect(isWithinAgencyRetention(new Date(NOW).toISOString(), NOW)).toBe(
      true,
    );
    expect(isWithinAgencyRetention(new Date(NOW - 1).toISOString(), NOW)).toBe(
      false,
    );
    expect(isWithinAgencyRetention(null, NOW)).toBe(false);
    const rows = filterAgencyExportRows(
      [
        { retainUntil: new Date(NOW + DAY).toISOString() },
        { retainUntil: new Date(NOW - DAY).toISOString() },
      ].map((row) => ({
        orderNoMasked: "ORD***01",
        plateNoMasked: "AB***34",
        reservedAt: "2024-10-01T00:00:00.000Z",
        pickupAt: null,
        dropoffAt: null,
        payableFareMinor: 1,
        actualFareMinor: 1,
        tollMinor: 0,
        currency: "TWD" as const,
        farePolicyVersion: "v",
        chargingMode: "meter" as const,
        generatedAt: "2024-10-01T00:00:00.000Z",
        ...row,
      })),
      NOW,
    );
    expect(rows).toHaveLength(1);
  });

  it("R10 summary drops drilldown ids and shows coverage as unavailable when nothing was expected", () => {
    const summary = {
      from: "2026-05-01",
      to: "2026-10-31",
      businessArea: "north",
      serviceProductCode: "taxi",
      demandRequestCount: 10,
      actualDispatchCount: 8,
      completedTripCount: 7,
      cancelledOrderCount: 1,
      averageDispatchableVehicleCount: 3,
      validSnapshotCount: 0,
      expectedSnapshotCount: 0,
      snapshotCoverageRate: 0,
      complaintCount: 2,
      complaintsByCategory: { service_quality: 2 },
      drilldown: {
        punctuality: { onTimeOrderIds: ["order-secret-1"] },
        complaintMonthlyStatistics: [],
      },
      generatedAt: "2026-10-25T00:00:00.000Z",
    } as unknown as SixMonthOperationsSummary;
    const view = projectAgencyOperationsSummary(summary);
    expect(view.snapshotCoverageRate).toBeNull();
    expect(view).not.toHaveProperty("drilldown");
    expect(JSON.stringify(view)).not.toContain("order-secret-1");
    expect(view.complaintsByCategory).toEqual({ service_quality: 2 });
  });

  it("R12 masks order, plate, driver and addresses and withholds free-text cancellation reasons", () => {
    const record: DispatchDailyRecord = {
      serviceDate: "2026-10-01",
      orderId: "order-internal-1",
      orderNo: "ORD-20261001-0009",
      orderSource: "app",
      tenantId: "tenant-secret",
      partnerId: "partner-secret",
      serviceProductCode: "taxi",
      requestedAt: "2026-10-01T01:00:00.000Z",
      reservationTime: null,
      pickupAddressSnapshot: "台北市信義區市府路一號十樓",
      dropoffAddressSnapshot: null,
      firstDispatchAt: null,
      firstAssignedAt: null,
      finalDriverId: "driver-000123",
      finalVehicleId: "vehicle-internal",
      finalPlateNo: "XYZ-9876",
      etaSecondsAtAssignment: null,
      arrivedPickupAt: null,
      tripStartedAt: null,
      tripCompletedAt: null,
      finalStatus: "cancelled",
      redispatchCount: 0,
      cancellationReason: "Exception hold resolved: passenger phoned 0912",
      complaintCount: 0,
      generatedAt: "2026-10-02T00:00:00.000Z",
    };
    const view = projectAgencyDailyDispatchRecord(record);
    const serialized = JSON.stringify(view);
    for (const secret of [
      "order-internal-1",
      "tenant-secret",
      "partner-secret",
      "vehicle-internal",
      "XYZ-9876",
      "driver-000123",
      "市府路一號十樓",
      "0912",
    ]) {
      expect(serialized).not.toContain(secret);
    }
    expect(view.pickupAddressMasked).toBe("台北市信義區...");
    expect(view.dropoffAddressMasked).toBeNull();
    expect(view.cancellationReason).toBeNull();
    expect(
      projectAgencyDailyDispatchRecord({
        ...record,
        cancellationReason: "passenger_cancelled",
      }).cancellationReason,
    ).toBe("passenger_cancelled");
  });

  it("R09 complaint statistics expose counts only, never case numbers", () => {
    const monthly = [
      {
        periodMonth: "2026-09",
        businessArea: "north",
        serviceProductCode: "taxi",
        complaintCount: 3,
        complaintsByCategory: { late_arrival: 3 },
      },
    ] as unknown as MonthlyOperationsSummaryRecord[];
    const previews = [
      {
        businessArea: "north",
        serviceProductCode: "taxi",
        drilldown: {
          complaintMonthlyStatistics: [
            {
              periodMonth: "2026-09",
              timeZone: "Asia/Taipei",
              lowRatingAuto: {
                createdCount: 1,
                closedCount: 1,
                overdueCount: 0,
                createdCaseNos: ["CASE-SECRET-1"],
                closedCaseNos: ["CASE-SECRET-1"],
                overdueCaseNos: [],
              },
              manual: {
                createdCount: 2,
                closedCount: 0,
                overdueCount: 1,
                createdCaseNos: ["CASE-SECRET-2"],
                closedCaseNos: [],
                overdueCaseNos: ["CASE-SECRET-2"],
              },
              manualByCategory: [],
            },
          ],
        },
      },
    ] as unknown as SixMonthOperationsSummary[];
    const [row] = projectAgencyComplaintMonthlyStatistics(monthly, previews);
    expect(row).toMatchObject({
      periodMonth: "2026-09",
      complaintCount: 3,
      lowRatingAuto: { createdCount: 1, closedCount: 1, overdueCount: 0 },
      manual: { createdCount: 2, closedCount: 0, overdueCount: 1 },
    });
    expect(JSON.stringify(row)).not.toContain("CASE-SECRET");
    const [missing] = projectAgencyComplaintMonthlyStatistics(monthly, []);
    expect(missing?.lowRatingAuto).toBeNull();
    expect(missing?.manual).toBeNull();
  });

  it("R14 expiry status is inclusive at the window edge and unavailable when missing", () => {
    expect(computeExpiryStatus(new Date(NOW - 1).toISOString(), NOW, 30)).toBe(
      "expired",
    );
    expect(computeExpiryStatus(new Date(NOW).toISOString(), NOW, 30)).toBe(
      "expiring",
    );
    expect(
      computeExpiryStatus(new Date(NOW + 30 * DAY).toISOString(), NOW, 30),
    ).toBe("expiring");
    expect(
      computeExpiryStatus(new Date(NOW + 30 * DAY + 1).toISOString(), NOW, 30),
    ).toBe("valid");
    expect(computeExpiryStatus(null, NOW, 30)).toBe("unavailable");
    expect(computeExpiryStatus("not-a-date", NOW, 30)).toBe("unavailable");
  });

  it("R14 vehicle and driver projections mask identifiers and withhold commercial/location fields", () => {
    const vehicle = {
      vehicleId: "vehicle-internal-9",
      plateNo: "RAA-5566",
      createdAt: "2025-01-01T00:00:00.000Z",
      licenseType: null,
      operatingArea: "north",
      supportedServiceBuckets: [],
      dispatchableFlag: true,
      exclusivityApproved: true,
      insuranceStatus: "valid",
      updatedAt: "2026-01-01T00:00:00.000Z",
      supplyLifecycle: {
        insurance: {
          policyId: "policy-1",
          lifecycleStatus: "active",
          startAt: null,
          endAt: new Date(NOW + 10 * DAY).toISOString(),
          updatedAt: null,
        },
        dispatch: { eligible: true, blockedReasons: [], evaluatedAt: "x" },
        offboarding: { status: "none", requestedBy: "ops-secret-actor" },
      },
    } as unknown as VehicleRegistryRecord;
    const policy = {
      policyId: "policy-1",
      policyNo: "POL-998877",
      insurerName: "Secret Insurer Co",
      coverageAmount: 5_000_000,
    } as unknown as InsurancePolicyRecord;
    const vehicleView = projectAgencyVehicleQualification(
      vehicle,
      new Map([["policy-1", policy]]),
      NOW,
      30,
    );
    expect(vehicleView.insuranceExpiryStatus).toBe("expiring");
    expect(vehicleView.licenseType).toBeNull();
    expect(vehicleView.inspectionDueAt).toBeNull();
    expect(vehicleView.inspectionExpiryStatus).toBe("unavailable");
    const vehicleJson = JSON.stringify(vehicleView);
    for (const secret of [
      "RAA-5566",
      "POL-998877",
      "Secret Insurer Co",
      "5000000",
      "ops-secret-actor",
      "vehicle-internal-9",
    ]) {
      expect(vehicleJson).not.toContain(secret);
    }
    expect(
      projectAgencyVehicleQualification(vehicle, new Map(), NOW, 30)
        .policyNoMasked,
    ).toBeNull();

    const driver = {
      driverId: "driver-internal-42",
      name: "王小明",
      supportedServiceBuckets: [],
      workState: "online",
      licensesValid: true,
      licenseExpiry: new Date(NOW - DAY).toISOString(),
      professionalDriverLicenseExpiry: null,
      taxiDriverRegistrationExpiry: new Date(NOW + 400 * DAY).toISOString(),
      lifecycleStatus: "active",
      eligibilityBlockedReasons: [],
      dispatchEligible: true,
      deviceBindings: [{ deviceId: "device-secret" }],
    } as unknown as DriverRegistryRecord;
    const driverView = projectAgencyDriverQualification(driver, NOW, 30);
    expect(driverView).toMatchObject({
      nameMasked: "王*明",
      licenseExpiryStatus: "expired",
      professionalDriverLicenseExpiry: null,
      professionalDriverLicenseExpiryStatus: "unavailable",
      taxiDriverRegistrationExpiryStatus: "valid",
    });
    const driverJson = JSON.stringify(driverView);
    for (const secret of [
      "driver-internal-42",
      "王小明",
      "device-secret",
      "online",
    ]) {
      expect(driverJson).not.toContain(secret);
    }
  });
});

const agencyIdentity: BootstrapRequestIdentity = {
  authMode: "jwt_bearer",
  actorType: "agency_user",
  actorId: "principal_agency_1",
  principalId: "principal_agency_1",
  membershipId: "membership_agency_1",
  realm: "agency",
  tenantId: null,
  agencyId: "agency_a",
  sessionId: "sid_agency_1",
  roleFamilies: ["agency"],
  roles: ["agency_viewer"],
  scopes: ["agency:trip_records:read"],
  requestId: null,
};

function portal(options: {
  records: MultiTaxiTripOperationalAdminView[];
  accessActive?: boolean;
  logRepository?: AgencyAccessLogRepository;
}) {
  const logRepository =
    options.logRepository ?? new AgencyAccessLogRepository();
  const audit = new AgencyAccessAuditService(logRepository);
  const directory = {
    resolveActiveAccess: vi.fn(async () =>
      options.accessActive === false
        ? null
        : { agency: { agencyId: "agency_a" }, roleCode: "agency_viewer" },
    ),
  };
  const multiTaxi = {
    listTripOperationalRecords: vi.fn(async () => options.records),
  };
  const service = new AgencyPortalService(
    audit,
    directory as never,
    multiTaxi as never,
    {} as never,
    {} as never,
    {} as never,
  );
  return { service, logRepository, multiTaxi };
}

describe("BUREAU-R13 agency portal service access logging", () => {
  it("returns only retained, projected rows and records the access with row counts", async () => {
    const retained = tripRecord({
      recordId: "mtr-keep",
      retainUntil: new Date(Date.now() + DAY).toISOString(),
    });
    const expired = tripRecord({
      recordId: "mtr-expired",
      retainUntil: new Date(Date.now() - DAY).toISOString(),
    });
    const { service, logRepository, multiTaxi } = portal({
      records: [retained, expired],
    });
    const page = await service.listTripRecords(
      agencyIdentity,
      { month: "2026-10" },
      { requestId: "req-1", sourceIp: "203.0.113.7", userAgent: "UA" },
    );
    expect(page.items.map((item) => item.recordId)).toEqual(["mtr-keep"]);
    expect(page.total).toBe(1);
    expect(multiTaxi.listTripOperationalRecords).toHaveBeenCalledWith({
      month: "2026-10",
    });
    const logs = await logRepository.list({});
    expect(logs.items).toHaveLength(1);
    expect(logs.items[0]).toMatchObject({
      agencyId: "agency_a",
      principalId: "principal_agency_1",
      membershipId: "membership_agency_1",
      sessionId: "sid_agency_1",
      action: "list",
      resourceType: "trip_record",
      outcome: "success",
      rowCount: 1,
      totalCount: 1,
      requestId: "req-1",
      sourceIpPrefix: "203.0.113.0/24",
    });
    expect(logs.items[0]?.userAgentHash).toMatch(/^sha256:/);
  });

  it("rejects the unmasked free-text q parameter and logs the attempt as an error", async () => {
    const { service, logRepository } = portal({ records: [tripRecord()] });
    await expect(
      service.listTripRecords(agencyIdentity, { q: "ABC-1234" }, {}),
    ).rejects.toMatchObject({ code: "AGENCY_QUERY_PARAMETER_UNSUPPORTED" });
    const logs = await logRepository.list({});
    expect(logs.items[0]).toMatchObject({
      outcome: "error",
      rowCount: null,
      reasonCode: "AGENCY_QUERY_PARAMETER_UNSUPPORTED",
    });
  });

  it("passes exact plateNo and order/trip identifier filters to the R11 authority", async () => {
    const retained = tripRecord({
      recordId: "mtr-order-1",
      retainUntil: new Date(Date.now() + DAY).toISOString(),
    });
    const { service, multiTaxi } = portal({ records: [retained] });
    await service.listTripRecords(
      agencyIdentity,
      {
        month: "2026-10",
        plateNo: "ABC-1234",
        orderNo: "ORD-20261001-0001",
        orderId: "order-1",
        tripId: "trip-1",
        recordId: "mtr-order-1",
      },
      {},
    );
    expect(multiTaxi.listTripOperationalRecords).toHaveBeenCalledWith({
      month: "2026-10",
      plateNo: "ABC-1234",
      orderNo: "ORD-20261001-0001",
      orderId: "order-1",
      tripId: "trip-1",
      recordId: "mtr-order-1",
    });
  });

  it("denies and logs a request whose membership/agency/access period is no longer active", async () => {
    const { service, logRepository, multiTaxi } = portal({
      records: [tripRecord()],
      accessActive: false,
    });
    await expect(
      service.listTripRecords(agencyIdentity, {}, {}),
    ).rejects.toMatchObject({ code: "AGENCY_ACCESS_INACTIVE" });
    expect(multiTaxi.listTripOperationalRecords).not.toHaveBeenCalled();
    expect((await logRepository.list({})).items[0]).toMatchObject({
      outcome: "denied",
      reasonCode: "AGENCY_ACCESS_INACTIVE",
    });
  });

  it("fails closed with 503 and returns no data when the access log cannot be written", async () => {
    const failing = new AgencyAccessLogRepository();
    vi.spyOn(failing, "append").mockRejectedValue(new Error("db down"));
    const { service } = portal({
      records: [
        tripRecord({ retainUntil: new Date(Date.now() + DAY).toISOString() }),
      ],
      logRepository: failing,
    });
    const result = service.listTripRecords(agencyIdentity, {}, {});
    await expect(result).rejects.toMatchObject({
      code: "AGENCY_ACCESS_AUDIT_UNAVAILABLE",
    });
    await expect(result).rejects.toMatchObject({ status: 503 });
  });

  it("refuses non-agency identities before reading any data", async () => {
    const { service, multiTaxi } = portal({ records: [tripRecord()] });
    await expect(
      service.listTripRecords(
        { ...agencyIdentity, realm: "tenant", actorType: "tenant_admin" },
        {},
        {},
      ),
    ).rejects.toMatchObject({ code: "AGENCY_IDENTITY_INVALID" });
    expect(multiTaxi.listTripOperationalRecords).not.toHaveBeenCalled();
  });
});
