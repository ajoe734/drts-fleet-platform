import { describe, expect, it, vi } from "vitest";

import { ApiRequestError } from "../../src/common/api-envelope";
import { AgencyAccessAuditService } from "../../src/modules/agency-access/agency-access-audit.service";
import { AgencyAccessLogRepository } from "../../src/modules/agency-access/agency-access-log.repository";
import { AgencyPortalService } from "../../src/modules/agency-access/agency-portal.service";
import {
  projectAgencyComplaintMonthlyStatistics,
  projectAgencyOperationsSummary,
} from "../../src/modules/agency-access/agency-projections";
import { ReportingService } from "../../src/modules/reporting/reporting.service";

function buildBoundaryHarness(options: {
  orderCreatedAt?: string;
  complaintCreatedAt?: string;
  snapshots?: Array<{
    snapshotAt: string;
    businessArea: string;
    serviceProductCode: string;
    dispatchableVehicleCount: number;
    availableDriverCount: number;
    sourceHealth:
      | "complete"
      | "location_missing"
      | "location_stale"
      | "location_low_accuracy";
    generatedAt: string;
  }>;
}) {
  const orderCreatedAt = options.orderCreatedAt ?? "2026-10-15T02:00:00.000Z";
  const complaintCreatedAt =
    options.complaintCreatedAt ?? "2026-10-31T16:30:00.000Z";
  const source = {
    orders: [
      {
        orderId: "order-r10-boundary-1",
        orderNo: "ORD-R10-BOUNDARY-1",
        orderSource: "phone",
        tenantId: null,
        partnerId: null,
        businessDispatchSubtype: "taxi_realtime",
        serviceBucket: "standard_taxi",
        dispatchSemantics: "realtime",
        createdAt: orderCreatedAt,
        updatedAt: orderCreatedAt,
        reservationWindowStart: null,
        pickup: { address: "台北市信義區市府路1號" },
        dropoff: { address: "台北市松山區敦化北路340號" },
        status: "completed",
        cancelReason: null,
      },
    ],
    dispatchJobs: [
      {
        dispatchJobId: "job-r10-boundary-1",
        orderId: "order-r10-boundary-1",
        status: "assigned",
        mode: "auto",
        latestEtaMinutes: 8,
        createdAt: orderCreatedAt,
        updatedAt: orderCreatedAt,
      },
    ],
    dispatchAssignments: [
      {
        assignmentId: "asg-r10-boundary-1",
        dispatchJobId: "job-r10-boundary-1",
        orderId: "order-r10-boundary-1",
        taskId: "task-r10-boundary-1",
        vehicleId: "veh-r10-1",
        driverId: "drv-r10-1",
        assignmentType: "metered",
        status: "completed",
        acceptedAt: orderCreatedAt,
        rejectedAt: null,
        rejectReasonCode: null,
        createdAt: orderCreatedAt,
        updatedAt: orderCreatedAt,
      },
    ],
    driverTasks: [
      {
        taskId: "task-r10-boundary-1",
        orderId: "order-r10-boundary-1",
        dispatchJobId: "job-r10-boundary-1",
        assignmentId: "asg-r10-boundary-1",
        driverId: "drv-r10-1",
        vehicleId: "veh-r10-1",
        sourcePlatform: null,
        routeProvided: false,
        waypoints: [],
        status: "completed",
        acceptedAt: orderCreatedAt,
        departedAt: orderCreatedAt,
        arrivedPickupAt: orderCreatedAt,
        startedAt: orderCreatedAt,
        completedAt: orderCreatedAt,
        actualDistanceKm: 5,
        actualDurationSec: 600,
        fare: null,
        proof: null,
      },
    ],
    dispatchTraceLogs: [
      {
        traceId: "trace-r10-arrived-1",
        orderId: "order-r10-boundary-1",
        eventType: "driver.arrived_pickup",
        message: "arrived",
        createdAt: orderCreatedAt,
        details: { taskId: "task-r10-boundary-1" },
      },
      {
        traceId: "trace-r10-completed-1",
        orderId: "order-r10-boundary-1",
        eventType: "driver.completed_trip",
        message: "completed",
        createdAt: orderCreatedAt,
        details: { taskId: "task-r10-boundary-1" },
      },
    ],
    complaintCases: [
      {
        caseNo: "CMP-R10-BOUNDARY-1",
        caseSource: "ops_console",
        relatedOrderId: "order-r10-boundary-1",
        relatedCallId: null,
        relatedIncidentId: null,
        category: "late_arrival",
        severity: "normal",
        description: "Cross-month Taipei boundary complaint",
        assigneeId: null,
        status: "new",
        slaDueAt: "2026-11-10T00:00:00.000Z",
        slaBreach: false,
        reopenCount: 0,
        resolutionCode: null,
        closingNote: null,
        createdAt: complaintCreatedAt,
        updatedAt: complaintCreatedAt,
      },
    ],
  };

  let persistedMonthly: unknown[] = [];
  const reportingRepository = {
    isEnabled: vi.fn(() => true),
    listDailyDispatchRecords: vi.fn(async () => []),
    listDispatchableSupplySnapshots: vi.fn(
      async () => options.snapshots ?? [],
    ),
    listMonthlyOperationsSummaries: vi.fn(
      async () => persistedMonthly as never,
    ),
    replaceMonthlyOperationsSummaries: vi.fn(async (records: unknown[]) => {
      persistedMonthly = records;
    }),
    upsertDailyDispatchRecords: vi.fn(async () => undefined),
    upsertDispatchableSupplySnapshots: vi.fn(async () => undefined),
    upsertMonthlyOperationsSummaries: vi.fn(async () => undefined),
    loadDailyDispatchRecordSource: vi.fn(async () => source as never),
    loadComplaintStatisticsSource: vi.fn(async () => ({
      closures: [],
      lowRatingCaseNos: [],
    })),
    reportPersistenceFailure: vi.fn(),
  };

  const regulatoryRegistryService = {
    listVehicles: vi.fn(() => [
      {
        vehicleId: "veh-r10-1",
        plateNo: "TDA-1001",
        operatingArea: "taipei",
        supportedServiceBuckets: ["standard_taxi"],
        supplyLifecycle: { dispatch: { eligible: true } },
      },
    ]),
    listDrivers: vi.fn(() => []),
    listSupplyPairs: vi.fn(() => []),
    listLatestDriverLocations: vi.fn(() => []),
  };

  const reportingService = new ReportingService(
    { getReportingSnapshot: vi.fn() } as never,
    { listComplaintCases: vi.fn(() => []), getComplaintTimeline: vi.fn(() => []) } as never,
    regulatoryRegistryService as never,
    undefined,
    reportingRepository as never,
  );

  const agencyPortalService = new AgencyPortalService(
    new AgencyAccessAuditService(new AgencyAccessLogRepository()),
    {
      resolveActiveAccess: vi.fn(async () => ({
        agency: { agencyId: "agency_tpe" },
        roleCode: "agency_viewer",
      })),
    } as never,
    {} as never,
    {} as never,
    reportingService,
    {} as never,
  );

  const agencyIdentity = {
    authMode: "jwt_bearer" as const,
    actorType: "agency_user" as const,
    actorId: "principal_agency_tpe",
    principalId: "principal_agency_tpe",
    membershipId: "membership_agency_tpe",
    realm: "agency" as const,
    sessionId: "session_agency_tpe",
    tenantId: null,
    partnerId: null,
    agencyId: "agency_tpe",
    roleFamilies: ["agency" as const],
    roles: ["agency_viewer"],
    scopes: ["agency:reports:read"],
    requestId: "req-r10-boundary",
  };

  return {
    reportingService,
    reportingRepository,
    agencyPortalService,
    agencyIdentity,
  };
}

describe("BUREAU-R10 Taipei calendar month boundaries, zero vs unknown snapshots, and month query precision", () => {
  it("attributes 2026-10-31T16:30:00.000Z complaint and supply snapshot to 2026-11 (Asia/Taipei), aligning R10 and R09", async () => {
    const { reportingService } = buildBoundaryHarness({
      // 2026-10-15 order in October, plus complaint and snapshot at 2026-10-31T16:30Z (2026-11-01 00:30 Taipei)
      orderCreatedAt: "2026-10-15T02:00:00.000Z",
      complaintCreatedAt: "2026-10-31T16:30:00.000Z",
      snapshots: [
        {
          snapshotAt: "2026-10-31T16:30:00.000Z",
          businessArea: "taipei",
          serviceProductCode: "taxi_realtime",
          dispatchableVehicleCount: 6,
          availableDriverCount: 6,
          sourceHealth: "complete",
          generatedAt: "2026-10-31T16:30:01.000Z",
        },
      ],
    });

    const summaries = await reportingService.previewSixMonthOperationsSummary({
      periodMonthFrom: "2026-10",
      periodMonthTo: "2026-11",
    });
    expect(summaries).toHaveLength(1);
    const summary = summaries[0]!;
    expect(summary.complaintCount).toBe(1);
    expect(summary.complaintsByCategory).toEqual({ late_arrival: 1 });
    expect(summary.complaintCreatedManualCount).toBe(1);

    const monthlies = summary.monthlySummaries ?? [];
    expect(monthlies.map((m) => m.periodMonth)).toEqual(["2026-10", "2026-11"]);
    const october = monthlies.find((m) => m.periodMonth === "2026-10")!;
    const november = monthlies.find((m) => m.periodMonth === "2026-11")!;

    // 2026-10 has the trip but NOT the 2026-10-31T16:30Z complaint or snapshot
    expect(october).toMatchObject({
      periodMonth: "2026-10",
      demandRequestCount: 1,
      actualDispatchCount: 1,
      complaintCount: 0,
      complaintsByCategory: {},
      validSnapshotCount: 0,
      averageDispatchableVehicleCount: null,
      complaintCreatedManualCount: 0,
    });

    // 2026-11 (Asia/Taipei) receives both the R10 complaint/category, the R09 manual created count, and the snapshot
    expect(november).toMatchObject({
      periodMonth: "2026-11",
      demandRequestCount: 0,
      actualDispatchCount: 0,
      complaintCount: 1,
      complaintsByCategory: { late_arrival: 1 },
      validSnapshotCount: 1,
      averageDispatchableVehicleCount: 6,
      complaintCreatedManualCount: 1,
    });

    const r09Compare = projectAgencyComplaintMonthlyStatistics(
      monthlies.map((m) => ({
        ...m,
        businessArea: m.businessArea ?? "unassigned",
        serviceProductCode: m.serviceProductCode ?? "unknown",
        averageDispatchableVehicleCount: m.averageDispatchableVehicleCount ?? 0,
      })),
      summaries,
    );
    const novAgencyR09 = r09Compare.find((r) => r.periodMonth === "2026-11")!;
    const octAgencyR09 = r09Compare.find((r) => r.periodMonth === "2026-10")!;
    expect(novAgencyR09.complaintCount).toBe(1);
    expect(novAgencyR09.manual?.createdCount).toBe(1);
    expect(octAgencyR09.complaintCount).toBe(0);
    expect(octAgencyR09.manual?.createdCount).toBe(0);
  });

  it("distinguishes validSnapshotCount = 0 (null / unknown) from a valid complete zero-vehicle snapshot (numeric 0)", async () => {
    const { reportingService, reportingRepository } = buildBoundaryHarness({
      orderCreatedAt: "2026-09-10T02:00:00.000Z",
      complaintCreatedAt: "2026-09-12T02:00:00.000Z",
      snapshots: [
        // 2026-09 has no valid snapshot (sourceHealth = location_missing)
        {
          snapshotAt: "2026-09-10T02:05:00.000Z",
          businessArea: "taipei",
          serviceProductCode: "taxi_realtime",
          dispatchableVehicleCount: 0,
          availableDriverCount: 0,
          sourceHealth: "location_missing",
          generatedAt: "2026-09-10T02:05:01.000Z",
        },
        // 2026-10 has 1 valid complete snapshot measuring 0 vehicles
        {
          snapshotAt: "2026-10-10T02:05:00.000Z",
          businessArea: "taipei",
          serviceProductCode: "taxi_realtime",
          dispatchableVehicleCount: 0,
          availableDriverCount: 0,
          sourceHealth: "complete",
          generatedAt: "2026-10-10T02:05:01.000Z",
        },
      ],
    });

    // Window with only 2026-09 (validSnapshotCount = 0) -> averageDispatchableVehicleCount is null
    const [sepOnly] = await reportingService.previewSixMonthOperationsSummary({
      periodMonthFrom: "2026-09",
      periodMonthTo: "2026-09",
    });
    expect(sepOnly!.validSnapshotCount).toBe(0);
    expect(sepOnly!.averageDispatchableVehicleCount).toBeNull();
    expect(
      projectAgencyOperationsSummary(sepOnly!).averageDispatchableVehicleCount,
    ).toBeNull();

    // Persisted DB read-model record keeps numeric 0 so NOT NULL schema is preserved
    const persisted = await reportingRepository.listMonthlyOperationsSummaries();
    expect(persisted[0]).toMatchObject({
      periodMonth: "2026-09",
      validSnapshotCount: 0,
      averageDispatchableVehicleCount: 0,
    });

    // Window spanning 2026-09..2026-10: 2026-09 monthly row is null, 2026-10 monthly row is numeric 0, summary is numeric 0
    const [twoMonths] = await reportingService.previewSixMonthOperationsSummary({
      periodMonthFrom: "2026-09",
      periodMonthTo: "2026-10",
    });
    const sepMonthly = twoMonths!.monthlySummaries!.find(
      (m) => m.periodMonth === "2026-09",
    )!;
    const octMonthly = twoMonths!.monthlySummaries!.find(
      (m) => m.periodMonth === "2026-10",
    )!;
    expect(sepMonthly.validSnapshotCount).toBe(0);
    expect(sepMonthly.averageDispatchableVehicleCount).toBeNull();
    expect(octMonthly.validSnapshotCount).toBe(1);
    expect(octMonthly.averageDispatchableVehicleCount).toBe(0);
    expect(twoMonths!.validSnapshotCount).toBe(1);
    expect(twoMonths!.averageDispatchableVehicleCount).toBe(0);
  });

  it("rejects arbitrary mid-month day precision (2026-10-15..2026-10-15), reversed windows, and >6-month windows", async () => {
    const { reportingService, agencyPortalService, agencyIdentity } =
      buildBoundaryHarness({});

    await expect(
      reportingService.previewSixMonthOperationsSummary({
        from: "2026-10-15",
        to: "2026-10-15",
      }),
    ).rejects.toThrow(ApiRequestError);

    await expect(
      agencyPortalService.previewOperationsSummary(
        agencyIdentity,
        { from: "2026-10-15", to: "2026-10-15" },
        {},
      ),
    ).rejects.toMatchObject({
      code: "AGENCY_QUERY_INVALID",
    });

    await expect(
      reportingService.previewSixMonthOperationsSummary({
        periodMonthFrom: "2026-10",
        periodMonthTo: "2026-08",
      }),
    ).rejects.toMatchObject({
      code: "REPORT_QUERY_INVALID",
    });

    await expect(
      reportingService.previewSixMonthOperationsSummary({
        periodMonthFrom: "2026-01",
        periodMonthTo: "2026-07",
      }),
    ).rejects.toMatchObject({
      code: "REPORT_WINDOW_TOO_LARGE",
    });

    const validBoundary = await agencyPortalService.previewOperationsSummary(
      agencyIdentity,
      { from: "2026-10-01", to: "2026-11-30" },
      {},
    );
    expect(validBoundary[0]).toMatchObject({
      from: "2026-10-01",
      to: "2026-11-30",
    });
  });
});
