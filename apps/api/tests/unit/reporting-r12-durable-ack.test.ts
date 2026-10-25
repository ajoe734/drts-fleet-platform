import { readFileSync } from "node:fs";
import { resolve } from "node:path";
import { describe, expect, it, vi } from "vitest";

import { ApiRequestError } from "../../src/common/api-envelope";
import { projectAgencyDailyDispatchRecord } from "../../src/modules/agency-access/agency-projections";
import { ReportingRepository } from "../../src/modules/reporting/reporting.repository";
import { ReportingService } from "../../src/modules/reporting/reporting.service";

function createOrder(overrides: Record<string, unknown> = {}) {
  return {
    orderId: "order-r12-ack-001",
    orderNo: "O-R12-ACK-001",
    orderSource: "phone",
    tenantId: "tenant-001",
    partnerId: "partner-001",
    businessDispatchSubtype: "airport_transfer",
    serviceBucket: "airport_transfer",
    createdAt: "2026-06-20T01:00:00.000Z",
    updatedAt: "2026-06-20T01:40:00.000Z",
    reservationWindowStart: "2026-06-20T01:30:00.000Z",
    pickup: { address: "Taipei Main Station" },
    dropoff: { address: "Songshan Airport" },
    status: "completed",
    cancelReason: null,
    ...overrides,
  };
}

function createCanonicalSource(overrides: Record<string, unknown> = {}) {
  const order = createOrder(overrides.order as Record<string, unknown>);
  const assignmentId = "assignment-r12-ack-001";
  const taskId = "task-r12-ack-001";

  return {
    orders: [order],
    dispatchJobs: [
      {
        dispatchJobId: "job-r12-ack-001",
        orderId: order.orderId,
        status: "assigned",
        mode: "auto",
        latestEtaMinutes: 8,
        createdAt: "2026-06-20T01:01:00.000Z",
        updatedAt: "2026-06-20T01:02:00.000Z",
      },
    ],
    dispatchAssignments: [
      {
        assignmentId,
        dispatchJobId: "job-r12-ack-001",
        orderId: order.orderId,
        taskId,
        vehicleId: "vehicle-001",
        driverId: "driver-001",
        assignmentType: "metered",
        status: "completed",
        acceptedAt: "2026-06-20T01:03:00.000Z",
        rejectedAt: null,
        rejectReasonCode: null,
        createdAt: "2026-06-20T01:02:00.000Z",
        updatedAt: "2026-06-20T01:40:00.000Z",
      },
    ],
    driverTasks: [
      {
        taskId,
        orderId: order.orderId,
        dispatchJobId: "job-r12-ack-001",
        assignmentId,
        driverId: "driver-001",
        vehicleId: "vehicle-001",
        sourcePlatform: null,
        routeProvided: false,
        waypoints: [],
        status: "completed",
        acceptedAt: "2026-06-20T01:03:00.000Z",
        departedAt: "2026-06-20T01:05:00.000Z",
        arrivedPickupAt: "2026-06-20T01:12:00.000Z",
        startedAt: "2026-06-20T01:15:00.000Z",
        completedAt: "2026-06-20T01:40:00.000Z",
        actualDistanceKm: 11.2,
        actualDurationSec: 1500,
        fare: null,
        proof: null,
      },
    ],
    dispatchTraceLogs: [
      {
        traceId: "trace-r12-assigned-001",
        orderId: order.orderId,
        eventType: "dispatch.assigned",
        message: "assigned",
        createdAt: "2026-06-20T01:02:00.000Z",
        details: { taskId, assignmentId },
      },
      {
        traceId: "trace-r12-arrived-001",
        orderId: order.orderId,
        eventType: "driver.arrived_pickup",
        message: "arrived",
        createdAt: "2026-06-20T01:12:00.000Z",
        details: { taskId },
      },
      {
        traceId: "trace-r12-started-001",
        orderId: order.orderId,
        eventType: "driver.started_trip",
        message: "started",
        createdAt: "2026-06-20T01:15:00.000Z",
        details: { taskId },
      },
      {
        traceId: "trace-r12-completed-001",
        orderId: order.orderId,
        eventType: "driver.completed_trip",
        message: "completed",
        createdAt: "2026-06-20T01:40:00.000Z",
        details: { taskId },
      },
    ],
    complaintCases: [
      {
        caseNo: "CMP-R12-001",
        caseSource: "ops_console",
        relatedOrderId: order.orderId,
        relatedCallId: null,
        relatedIncidentId: null,
        category: "late_arrival",
        severity: "normal",
        description: "Late arrival",
        assigneeId: null,
        status: "new",
        slaDueAt: "2026-06-21T00:00:00.000Z",
        slaBreach: false,
        reopenCount: 0,
        resolutionCode: null,
        closingNote: null,
        createdAt: "2026-06-20T02:00:00.000Z",
        updatedAt: "2026-06-20T02:00:00.000Z",
      },
    ],
  };
}

function createDurableAckHarness(options: { dbEnabled?: boolean } = {}) {
  const dbEnabled = options.dbEnabled ?? true;
  const canonicalSource = createCanonicalSource();
  const memoryFallbackSource = createCanonicalSource({
    order: {
      orderId: "order-stale-memory-999",
      orderNo: "O-STALE-MEM-999",
    },
  });

  const reportingRepository = {
    isEnabled: vi.fn(() => dbEnabled),
    listDailyDispatchRecords: vi.fn(async () => []),
    listDispatchableSupplySnapshots: vi.fn(async () => []),
    listMonthlyOperationsSummaries: vi.fn(async () => []),
    replaceMonthlyOperationsSummaries: vi.fn(async () => undefined),
    upsertDailyDispatchRecords: vi.fn(async () => undefined),
    upsertDispatchableSupplySnapshots: vi.fn(async () => undefined),
    upsertMonthlyOperationsSummaries: vi.fn(async () => undefined),
    loadDailyDispatchRecordSource: vi.fn(async () => canonicalSource),
    loadComplaintStatisticsSource: vi.fn(async () => ({
      closures: [],
      lowRatingCaseNos: [],
    })),
    reportPersistenceFailure: vi.fn(),
  };

  const ownedMobilityService = {
    getReportingSnapshot: vi.fn(() => ({
      orders: memoryFallbackSource.orders,
      dispatchJobs: memoryFallbackSource.dispatchJobs,
      dispatchAssignments: memoryFallbackSource.dispatchAssignments,
      driverTasks: memoryFallbackSource.driverTasks,
      dispatchTraceLogs: memoryFallbackSource.dispatchTraceLogs,
    })),
  };

  const complaintService = {
    listComplaintCases: vi.fn(() => memoryFallbackSource.complaintCases),
    getComplaintTimeline: vi.fn(() => []),
  };

  const regulatoryRegistryService = {
    listVehicles: vi.fn(() => [
      {
        vehicleId: "vehicle-001",
        plateNo: "ABC-1001",
        operatingArea: "taipei",
        supportedServiceBuckets: ["airport_transfer"],
        supplyLifecycle: { dispatch: { eligible: true } },
      },
    ]),
    listDrivers: vi.fn(() => []),
    listSupplyPairs: vi.fn(() => []),
    listLatestDriverLocations: vi.fn(() => []),
  };

  const service = new ReportingService(
    ownedMobilityService as never,
    complaintService as never,
    regulatoryRegistryService as never,
    undefined,
    reportingRepository as never,
  );

  return {
    service,
    reportingRepository,
    ownedMobilityService,
    complaintService,
  };
}

describe("BUREAU-R12 ReportingService durable ACK and shared canonical source error propagation", () => {
  it("rejects rebuildDailyDispatchRecords when DB upsert fails instead of returning a false rebuiltCount ACK", async () => {
    const { service, reportingRepository, ownedMobilityService } =
      createDurableAckHarness({ dbEnabled: true });

    reportingRepository.upsertDailyDispatchRecords.mockImplementationOnce(
      async () => {
        await Promise.resolve();
        throw new Error("pg connection terminated during daily upsert");
      },
    );

    await expect(
      service.rebuildDailyDispatchRecords({ serviceDate: "2026-06-20" }),
    ).rejects.toMatchObject({
      status: 503,
      code: "REPORT_REBUILD_FAILED",
    });

    expect(reportingRepository.reportPersistenceFailure).toHaveBeenCalledWith(
      expect.any(Error),
      "upsert dispatch daily records",
    );
    expect(ownedMobilityService.getReportingSnapshot).not.toHaveBeenCalled();

    // Retry uses the existing order/day idempotent upsert and succeeds once DB recovers
    const retryResult = await service.rebuildDailyDispatchRecords({
      serviceDate: "2026-06-20",
    });
    expect(retryResult.rebuiltCount).toBe(1);
    expect(retryResult.records[0]?.orderId).toBe("order-r12-ack-001");
    expect(
      reportingRepository.upsertDailyDispatchRecords,
    ).toHaveBeenCalledTimes(2);
  });

  it("rejects daily rebuild and six-month summary preview when canonical DB source fails, without falling back to memory cache", async () => {
    const {
      service,
      reportingRepository,
      ownedMobilityService,
      complaintService,
    } = createDurableAckHarness({ dbEnabled: true });

    reportingRepository.loadDailyDispatchRecordSource.mockImplementation(
      async () => {
        await Promise.resolve();
        throw new Error("pg read timeout on canonical reporting source");
      },
    );

    await expect(
      service.rebuildDailyDispatchRecords({ serviceDate: "2026-06-20" }),
    ).rejects.toBeInstanceOf(ApiRequestError);

    await expect(
      service.previewSixMonthOperationsSummary({
        periodMonthFrom: "2026-05",
        periodMonthTo: "2026-10",
      }),
    ).rejects.toMatchObject({
      status: 503,
      code: "REPORT_SOURCE_UNAVAILABLE",
    });

    expect(ownedMobilityService.getReportingSnapshot).not.toHaveBeenCalled();
    expect(complaintService.listComplaintCases).not.toHaveBeenCalled();
    expect(
      reportingRepository.upsertDailyDispatchRecords,
    ).not.toHaveBeenCalled();
    expect(
      reportingRepository.replaceMonthlyOperationsSummaries,
    ).not.toHaveBeenCalled();
  });

  it("rejects listDailyDispatchRecords and listMonthlyOperationsSummaries when DB read fails instead of falling back to rebuild or memory cache", async () => {
    const { service, reportingRepository, ownedMobilityService } =
      createDurableAckHarness({ dbEnabled: true });

    reportingRepository.listDailyDispatchRecords.mockImplementationOnce(
      async () => {
        await Promise.resolve();
        throw new Error("pg query error on dispatch_daily_records");
      },
    );
    reportingRepository.listMonthlyOperationsSummaries.mockImplementationOnce(
      async () => {
        await Promise.resolve();
        throw new Error("pg query error on monthly_operations_summaries");
      },
    );

    await expect(
      service.listDailyDispatchRecords({ serviceDate: "2026-06-20" }),
    ).rejects.toMatchObject({
      status: 503,
      code: "REPORT_READ_FAILED",
    });

    await expect(
      service.listMonthlyOperationsSummaries({ periodMonth: "2026-06" }),
    ).rejects.toMatchObject({
      status: 503,
      code: "REPORT_READ_FAILED",
    });

    expect(reportingRepository.reportPersistenceFailure).toHaveBeenCalledWith(
      expect.any(Error),
      "list dispatch daily records",
    );
    expect(reportingRepository.reportPersistenceFailure).toHaveBeenCalledWith(
      expect.any(Error),
      "list monthly operations summaries",
    );
    expect(
      reportingRepository.loadDailyDispatchRecordSource,
    ).not.toHaveBeenCalled();
    expect(
      reportingRepository.upsertDailyDispatchRecords,
    ).not.toHaveBeenCalled();
    expect(ownedMobilityService.getReportingSnapshot).not.toHaveBeenCalled();
  });

  it("preserves legitimate empty DB read on-demand rebuild and no-DB sandbox controls", async () => {
    // 1. DB-enabled legitimate empty table triggers on-demand rebuild and returns empty array when no orders match
    const dbHarness = createDurableAckHarness({ dbEnabled: true });
    const emptyDateRecords = await dbHarness.service.listDailyDispatchRecords({
      serviceDate: "2026-06-21",
    });
    expect(emptyDateRecords).toEqual([]);
    expect(
      dbHarness.reportingRepository.loadDailyDispatchRecordSource,
    ).toHaveBeenCalledTimes(1);
    expect(
      dbHarness.reportingRepository.upsertDailyDispatchRecords,
    ).toHaveBeenCalledWith([]);
    expect(
      dbHarness.ownedMobilityService.getReportingSnapshot,
    ).not.toHaveBeenCalled();

    // 2. No-DB sandbox path uses in-memory snapshot and succeeds
    const sandboxHarness = createDurableAckHarness({ dbEnabled: false });
    const sandboxRebuild =
      await sandboxHarness.service.rebuildDailyDispatchRecords({
        serviceDate: "2026-06-20",
      });
    expect(sandboxRebuild.rebuiltCount).toBe(1);
    expect(sandboxRebuild.records[0]?.orderId).toBe("order-stale-memory-999");
    expect(
      sandboxHarness.ownedMobilityService.getReportingSnapshot,
    ).toHaveBeenCalledTimes(1);

    const sandboxListed = await sandboxHarness.service.listDailyDispatchRecords(
      {
        serviceDate: "2026-06-20",
      },
    );
    expect(sandboxListed).toHaveLength(1);
    expect(sandboxListed[0]?.orderId).toBe("order-stale-memory-999");
  });

  it("computes serviceDate as the Asia/Taipei calendar day of reservationWindowStart ?? createdAt across midnight, +08:00, fallback, and month/year boundaries while preserving UTC event timestamps", async () => {
    const orders = [
      createOrder({
        orderId: "order-tpe-before-midnight",
        orderNo: "O-TPE-BEFORE-MIDNIGHT",
        createdAt: "2026-10-24T15:00:00.000Z",
        reservationWindowStart: "2026-10-24T15:59:59.000Z",
      }),
      createOrder({
        orderId: "order-tpe-at-midnight",
        orderNo: "O-TPE-AT-MIDNIGHT",
        createdAt: "2026-10-24T15:30:00.000Z",
        reservationWindowStart: "2026-10-24T16:00:00.000Z",
      }),
      createOrder({
        orderId: "order-tpe-null-reservation-fallback",
        orderNo: "O-TPE-NULL-RES-FALLBACK",
        createdAt: "2026-10-24T16:00:00.000Z",
        reservationWindowStart: null,
      }),
      createOrder({
        orderId: "order-tpe-explicit-offset-next-day",
        orderNo: "O-TPE-OFFSET-NEXT",
        createdAt: "2026-10-24T23:50:00+08:00",
        reservationWindowStart: "2026-10-25T00:05:00+08:00",
      }),
      createOrder({
        orderId: "order-tpe-explicit-offset-same-day",
        orderNo: "O-TPE-OFFSET-SAME",
        createdAt: "2026-10-24T23:59:59+08:00",
        reservationWindowStart: null,
      }),
      createOrder({
        orderId: "order-tpe-month-boundary",
        orderNo: "O-TPE-MONTH-BOUNDARY",
        createdAt: "2026-10-31T15:00:00.000Z",
        reservationWindowStart: "2026-10-31T16:00:00.000Z",
      }),
      createOrder({
        orderId: "order-tpe-year-boundary",
        orderNo: "O-TPE-YEAR-BOUNDARY",
        createdAt: "2026-12-31T15:00:00.000Z",
        reservationWindowStart: "2026-12-31T16:00:00.000Z",
      }),
    ];

    const harness = createDurableAckHarness({ dbEnabled: false });
    harness.ownedMobilityService.getReportingSnapshot.mockReturnValue({
      orders,
      dispatchJobs: [
        {
          dispatchJobId: "job-tpe-at-midnight",
          orderId: "order-tpe-at-midnight",
          status: "assigned",
          mode: "auto",
          latestEtaMinutes: 8,
          createdAt: "2026-10-24T15:31:00.000Z",
          updatedAt: "2026-10-24T15:32:00.000Z",
        },
      ],
      dispatchAssignments: [
        {
          assignmentId: "assign-tpe-at-midnight",
          dispatchJobId: "job-tpe-at-midnight",
          orderId: "order-tpe-at-midnight",
          taskId: "task-tpe-at-midnight",
          vehicleId: "vehicle-001",
          driverId: "driver-001",
          assignmentType: "metered",
          status: "completed",
          acceptedAt: "2026-10-24T15:33:00.000Z",
          rejectedAt: null,
          rejectReasonCode: null,
          createdAt: "2026-10-24T15:32:00.000Z",
          updatedAt: "2026-10-24T16:25:00.000Z",
        },
      ],
      driverTasks: [
        {
          taskId: "task-tpe-at-midnight",
          orderId: "order-tpe-at-midnight",
          dispatchJobId: "job-tpe-at-midnight",
          assignmentId: "assign-tpe-at-midnight",
          driverId: "driver-001",
          vehicleId: "vehicle-001",
          sourcePlatform: null,
          routeProvided: false,
          waypoints: [],
          status: "completed",
          acceptedAt: "2026-10-24T15:33:00.000Z",
          departedAt: "2026-10-24T15:40:00.000Z",
          arrivedPickupAt: "2026-10-24T15:58:00.000Z",
          startedAt: "2026-10-24T16:02:00.000Z",
          completedAt: "2026-10-24T16:25:00.000Z",
          actualDistanceKm: 10.5,
          actualDurationSec: 1380,
          fare: null,
          proof: null,
        },
      ],
      dispatchTraceLogs: [
        {
          traceId: "trace-tpe-arrived",
          orderId: "order-tpe-at-midnight",
          eventType: "driver.arrived_pickup",
          message: "arrived",
          createdAt: "2026-10-24T15:58:00.000Z",
          details: { taskId: "task-tpe-at-midnight" },
        },
        {
          traceId: "trace-tpe-started",
          orderId: "order-tpe-at-midnight",
          eventType: "driver.started_trip",
          message: "started",
          createdAt: "2026-10-24T16:02:00.000Z",
          details: { taskId: "task-tpe-at-midnight" },
        },
        {
          traceId: "trace-tpe-completed",
          orderId: "order-tpe-at-midnight",
          eventType: "driver.completed_trip",
          message: "completed",
          createdAt: "2026-10-24T16:25:00.000Z",
          details: { taskId: "task-tpe-at-midnight" },
        },
      ],
    });
    harness.complaintService.listComplaintCases.mockReturnValue([]);

    const rebuilt = await harness.service.rebuildDailyDispatchRecords();
    const byId = new Map(
      rebuilt.records.map((record) => [record.orderId, record] as const),
    );

    expect(byId.get("order-tpe-before-midnight")?.serviceDate).toBe(
      "2026-10-24",
    );
    expect(byId.get("order-tpe-at-midnight")).toMatchObject({
      serviceDate: "2026-10-25",
      requestedAt: "2026-10-24T15:30:00.000Z",
      reservationTime: "2026-10-24T16:00:00.000Z",
      firstDispatchAt: "2026-10-24T15:31:00.000Z",
      firstAssignedAt: "2026-10-24T15:32:00.000Z",
      arrivedPickupAt: "2026-10-24T15:58:00.000Z",
      tripStartedAt: "2026-10-24T16:02:00.000Z",
      tripCompletedAt: "2026-10-24T16:25:00.000Z",
    });
    expect(byId.get("order-tpe-null-reservation-fallback")).toMatchObject({
      serviceDate: "2026-10-25",
      requestedAt: "2026-10-24T16:00:00.000Z",
      reservationTime: null,
    });
    expect(byId.get("order-tpe-explicit-offset-next-day")?.serviceDate).toBe(
      "2026-10-25",
    );
    expect(byId.get("order-tpe-explicit-offset-same-day")?.serviceDate).toBe(
      "2026-10-24",
    );
    expect(byId.get("order-tpe-month-boundary")?.serviceDate).toBe(
      "2026-11-01",
    );
    expect(byId.get("order-tpe-year-boundary")?.serviceDate).toBe("2027-01-01");
  });

  it("aligns Ops Reports formatDateTime and Agency displayDateTime on Asia/Taipei so 2026-10-24T17:00:00.000Z is serviceDate 2026-10-25 across query, projection, and display", async () => {
    const harness = createDurableAckHarness({ dbEnabled: false });
    harness.ownedMobilityService.getReportingSnapshot.mockReturnValue({
      orders: [
        createOrder({
          orderId: "order-r12-clock-20261025",
          orderNo: "O-R12-CLOCK-20261025",
          createdAt: "2026-10-24T17:00:00.000Z",
          reservationWindowStart: "2026-10-24T17:00:00.000Z",
        }),
      ],
      dispatchJobs: [],
      dispatchAssignments: [],
      driverTasks: [],
      dispatchTraceLogs: [],
    });
    harness.complaintService.listComplaintCases.mockReturnValue([]);

    await harness.service.rebuildDailyDispatchRecords();

    const day24Records = await harness.service.listDailyDispatchRecords({
      serviceDate: "2026-10-24",
    });
    const day25Records = await harness.service.listDailyDispatchRecords({
      serviceDate: "2026-10-25",
    });

    expect(day24Records).toHaveLength(0);
    expect(day25Records).toHaveLength(1);

    const record = day25Records[0]!;
    expect(record).toMatchObject({
      serviceDate: "2026-10-25",
      requestedAt: "2026-10-24T17:00:00.000Z",
      reservationTime: "2026-10-24T17:00:00.000Z",
    });

    const agencyView = projectAgencyDailyDispatchRecord(record);
    expect(agencyView).toMatchObject({
      serviceDate: "2026-10-25",
      requestedAt: "2026-10-24T17:00:00.000Z",
      reservationTime: "2026-10-24T17:00:00.000Z",
    });

    const agencyFormatSource = readFileSync(
      resolve(__dirname, "../../../agency-portal-web/lib/format.ts"),
      "utf8",
    );
    const displayDateTimeMatch =
      /export function displayDateTime\([\s\S]*?return new Date\(parsed\)\.toLocaleString\("zh-TW",\s*\{[\s\S]*?\}\);\s*\}/.exec(
        agencyFormatSource,
      );
    expect(displayDateTimeMatch).not.toBeNull();
    expect(displayDateTimeMatch![0]).toContain('timeZone: "Asia/Taipei"');

    const agencyFormatted = new Date(
      Date.parse(agencyView.requestedAt),
    ).toLocaleString("zh-TW", {
      timeZone: "Asia/Taipei",
      hour12: false,
    });
    expect(agencyFormatted).toContain("2026/10/25");
    expect(agencyFormatted).toContain("01:00:00");

    const opsReportsPageSource = readFileSync(
      resolve(__dirname, "../../../ops-console-web/app/reports/page.tsx"),
      "utf8",
    );
    const formatDateTimeMatch =
      /function formatDateTime\([\s\S]*?return formatted\.replace\(","\s*,\s*""\);\s*\}/.exec(
        opsReportsPageSource,
      );
    expect(formatDateTimeMatch).not.toBeNull();
    expect(formatDateTimeMatch![0]).not.toContain('timeZone: "UTC"');
    expect(
      formatDateTimeMatch![0].match(/timeZone:\s*"Asia\/Taipei"/g),
    ).toHaveLength(2);

    const opsLongFormatted = new Intl.DateTimeFormat("zh-TW", {
      year: "numeric",
      month: "2-digit",
      day: "2-digit",
      hour: "2-digit",
      minute: "2-digit",
      hour12: false,
      timeZone: "Asia/Taipei",
    })
      .format(new Date(record.requestedAt))
      .replace(",", "");
    expect(opsLongFormatted).toContain("2026/10/25");
    expect(opsLongFormatted).toContain("01:00");
  });

  it("re-keys a newer legacy UTC-day row (G2) to its Asia/Taipei calendar date before upsertSql + deleteStaleDaysSql so G2 survives an incoming stale G1 at Taipei service_date 2026-10-25", async () => {
    type StoredRow = {
      service_date: string;
      order_id: string;
      order_no: string;
      order_source: "phone";
      tenant_id: string | null;
      partner_id: string | null;
      service_product_code: string;
      requested_at: string;
      reservation_time: string | null;
      pickup_address_snapshot: string;
      dropoff_address_snapshot: string | null;
      first_dispatch_at: string | null;
      first_assigned_at: string | null;
      final_driver_id: string | null;
      final_vehicle_id: string | null;
      final_plate_no: string | null;
      eta_seconds_at_assignment: number | null;
      arrived_pickup_at: string | null;
      trip_started_at: string | null;
      trip_completed_at: string | null;
      final_status: string;
      redispatch_count: number;
      cancellation_reason: string | null;
      complaint_count: number;
      generated_at: string;
    };

    const toTaipeiDay = (iso: string) =>
      new Intl.DateTimeFormat("en-CA", {
        timeZone: "Asia/Taipei",
        year: "numeric",
        month: "2-digit",
        day: "2-digit",
      }).format(new Date(iso));

    const table = new Map<string, StoredRow>();
    const orderId = "order-r12-g2-survives-g1";
    const g2GeneratedAt = "2026-10-24T18:00:00.000Z";
    const g1GeneratedAt = "2026-10-24T17:05:00.000Z";

    // Seed legacy UTC-day row on 2026-10-24 (requested_at 17:00Z -> Taipei 2026-10-25) with newer G2
    table.set(`2026-10-24:${orderId}`, {
      service_date: "2026-10-24",
      order_id: orderId,
      order_no: "O-R12-G2-SURVIVES-G1",
      order_source: "phone",
      tenant_id: "tenant-001",
      partner_id: "partner-001",
      service_product_code: "airport_transfer",
      requested_at: "2026-10-24T17:00:00.000Z",
      reservation_time: "2026-10-24T17:00:00.000Z",
      pickup_address_snapshot: "Taipei Main Station",
      dropoff_address_snapshot: "Songshan Airport",
      first_dispatch_at: "2026-10-24T17:01:00.000Z",
      first_assigned_at: "2026-10-24T17:02:00.000Z",
      final_driver_id: "driver-001",
      final_vehicle_id: "vehicle-001",
      final_plate_no: "ABC-1001",
      eta_seconds_at_assignment: 480,
      arrived_pickup_at: "2026-10-24T17:10:00.000Z",
      trip_started_at: "2026-10-24T17:12:00.000Z",
      trip_completed_at: "2026-10-24T17:45:00.000Z",
      final_status: "completed",
      redispatch_count: 0,
      cancellation_reason: null,
      complaint_count: 1,
      generated_at: g2GeneratedAt,
    });

    const executedStatements: string[] = [];
    const executeQuery = async (sql: string, params: unknown[] = []) => {
      const normalized = sql.replace(/\s+/g, " ").trim();
      executedStatements.push(normalized);
      if (
        normalized.includes("INSERT INTO reporting.dispatch_daily_records") &&
        params.length === 1
      ) {
        const targetOrderId = String(params[0]);
        const newestExisting = [...table.values()]
          .filter((row) => row.order_id === targetOrderId)
          .sort(
            (a, b) =>
              b.generated_at.localeCompare(a.generated_at) ||
              b.service_date.localeCompare(a.service_date),
          )[0];
        if (newestExisting) {
          const taipeiDay = toTaipeiDay(
            newestExisting.reservation_time ?? newestExisting.requested_at,
          );
          if (newestExisting.service_date !== taipeiDay) {
            const targetKey = `${taipeiDay}:${targetOrderId}`;
            const existingOnTarget = table.get(targetKey);
            if (
              !existingOnTarget ||
              existingOnTarget.generated_at <= newestExisting.generated_at
            ) {
              table.set(targetKey, {
                ...newestExisting,
                service_date: taipeiDay,
              });
            }
          }
        }
        return { rows: [], rowCount: 1 };
      }
      if (normalized.includes("INSERT INTO reporting.dispatch_daily_records")) {
        const serviceDateParam = String(params[0]);
        const orderIdParam = String(params[1]);
        const generatedAtParam = String(params[24]);
        const hasNewerValidRow = [...table.values()].some(
          (existing) =>
            existing.order_id === orderIdParam &&
            existing.service_date ===
              toTaipeiDay(
                existing.reservation_time ?? existing.requested_at,
              ) &&
            existing.generated_at > generatedAtParam,
        );
        if (!hasNewerValidRow) {
          const key = `${serviceDateParam}:${orderIdParam}`;
          const existingOnSameKey = table.get(key);
          if (
            !existingOnSameKey ||
            existingOnSameKey.generated_at <= generatedAtParam
          ) {
            table.set(key, {
              service_date: serviceDateParam,
              order_id: orderIdParam,
              order_no: String(params[2]),
              order_source: "phone",
              tenant_id: params[4] ? String(params[4]) : null,
              partner_id: params[5] ? String(params[5]) : null,
              service_product_code: String(params[6]),
              requested_at: String(params[7]),
              reservation_time: params[8] ? String(params[8]) : null,
              pickup_address_snapshot: String(params[9]),
              dropoff_address_snapshot: params[10] ? String(params[10]) : null,
              first_dispatch_at: params[11] ? String(params[11]) : null,
              first_assigned_at: params[12] ? String(params[12]) : null,
              final_driver_id: params[13] ? String(params[13]) : null,
              final_vehicle_id: params[14] ? String(params[14]) : null,
              final_plate_no: params[15] ? String(params[15]) : null,
              eta_seconds_at_assignment:
                typeof params[16] === "number" ? params[16] : null,
              arrived_pickup_at: params[17] ? String(params[17]) : null,
              trip_started_at: params[18] ? String(params[18]) : null,
              trip_completed_at: params[19] ? String(params[19]) : null,
              final_status: String(params[20]),
              redispatch_count: Number(params[21]),
              cancellation_reason: params[22] ? String(params[22]) : null,
              complaint_count: Number(params[23]),
              generated_at: generatedAtParam,
            });
          }
        }
        return { rows: [], rowCount: 1 };
      }
      if (normalized.includes("DELETE FROM reporting.dispatch_daily_records")) {
        const orderIdParam = String(params[0]);
        const targetDateParam = String(params[1]);
        const generatedAtParam = String(params[2]);
        for (const [key, row] of table.entries()) {
          const rowTaipeiDay = toTaipeiDay(
            row.reservation_time ?? row.requested_at,
          );
          if (
            row.order_id === orderIdParam &&
            row.service_date !== targetDateParam &&
            (row.service_date !== rowTaipeiDay ||
              row.generated_at <= generatedAtParam)
          ) {
            table.delete(key);
          }
        }
        return { rows: [], rowCount: 1 };
      }
      if (normalized.includes("FROM reporting.dispatch_daily_records")) {
        const rows = [...table.values()].filter((row) => {
          const rowTaipeiDay = toTaipeiDay(
            row.reservation_time ?? row.requested_at,
          );
          let idx = 0;
          if (normalized.includes("service_date = $1::date")) {
            const target = String(params[idx++]);
            if (row.service_date !== target && rowTaipeiDay !== target) {
              return false;
            }
          }
          if (normalized.includes("order_id =")) {
            const targetOrder = String(params[idx++]);
            if (row.order_id !== targetOrder) {
              return false;
            }
          }
          return true;
        });
        return { rows: structuredClone(rows), rowCount: rows.length };
      }
      return { rows: [], rowCount: 0 };
    };

    const repository = new ReportingRepository({
      isEnabled: () => true,
      query: executeQuery,
      connect: async () => ({
        query: executeQuery,
        release: () => undefined,
      }),
    } as never);

    await repository.upsertDailyDispatchRecords([
      {
        serviceDate: "2026-10-25",
        orderId,
        orderNo: "O-R12-G2-SURVIVES-G1",
        orderSource: "phone",
        tenantId: "tenant-001",
        partnerId: "partner-001",
        serviceProductCode: "airport_transfer",
        requestedAt: "2026-10-24T17:00:00.000Z",
        reservationTime: "2026-10-24T17:00:00.000Z",
        pickupAddressSnapshot: "Taipei Main Station",
        dropoffAddressSnapshot: "Songshan Airport",
        firstDispatchAt: "2026-10-24T17:01:00.000Z",
        firstAssignedAt: "2026-10-24T17:02:00.000Z",
        finalDriverId: "driver-001",
        finalVehicleId: "vehicle-001",
        finalPlateNo: "ABC-1001",
        etaSecondsAtAssignment: 480,
        arrivedPickupAt: null,
        tripStartedAt: null,
        tripCompletedAt: null,
        finalStatus: "assigned",
        redispatchCount: 0,
        cancellationReason: null,
        complaintCount: 0,
        generatedAt: g1GeneratedAt,
      },
    ]);

    // Verify statement ordering: pre-rekey runs before incoming upsertSql and deleteStaleDaysSql
    const rekeyIndex = executedStatements.findIndex((sql) =>
      sql.includes("ORDER BY generated_at DESC, service_date DESC LIMIT 1"),
    );
    const incomingUpsertIndex = executedStatements.findIndex((sql) =>
      sql.includes("WHERE NOT EXISTS"),
    );
    const deleteStaleIndex = executedStatements.findIndex((sql) =>
      sql.includes("DELETE FROM reporting.dispatch_daily_records"),
    );
    expect(rekeyIndex).toBeGreaterThan(-1);
    expect(rekeyIndex).toBeLessThan(incomingUpsertIndex);
    expect(incomingUpsertIndex).toBeLessThan(deleteStaleIndex);

    // Newer legacy G2 survived stale G1 and was re-keyed to Taipei service_date 2026-10-25
    expect(table.has(`2026-10-24:${orderId}`)).toBe(false);
    expect(table.get(`2026-10-25:${orderId}`)).toMatchObject({
      service_date: "2026-10-25",
      order_id: orderId,
      final_status: "completed",
      complaint_count: 1,
      generated_at: g2GeneratedAt,
    });

    const readDay25 = await repository.listDailyDispatchRecords({
      serviceDate: "2026-10-25",
    });
    expect(readDay25).toHaveLength(1);
    expect(readDay25[0]).toMatchObject({
      serviceDate: "2026-10-25",
      orderId,
      finalStatus: "completed",
      complaintCount: 1,
      generatedAt: g2GeneratedAt,
    });
  });

  it("reconciles selected-day read when a rescheduled order has legacy correctly-keyed rows on both old (2026-11-25 G1) and new (2026-11-26 G2) Taipei service days", async () => {
    type StoredRow = {
      service_date: string;
      order_id: string;
      order_no: string;
      order_source: "phone";
      tenant_id: string | null;
      partner_id: string | null;
      service_product_code: string;
      requested_at: string;
      reservation_time: string | null;
      pickup_address_snapshot: string;
      dropoff_address_snapshot: string | null;
      first_dispatch_at: string | null;
      first_assigned_at: string | null;
      final_driver_id: string | null;
      final_vehicle_id: string | null;
      final_plate_no: string | null;
      eta_seconds_at_assignment: number | null;
      arrived_pickup_at: string | null;
      trip_started_at: string | null;
      trip_completed_at: string | null;
      final_status: string;
      redispatch_count: number;
      cancellation_reason: string | null;
      complaint_count: number;
      generated_at: string;
    };

    const toTaipeiDay = (iso: string) =>
      new Intl.DateTimeFormat("en-CA", {
        timeZone: "Asia/Taipei",
        year: "numeric",
        month: "2-digit",
        day: "2-digit",
      }).format(new Date(iso));

    const table = new Map<string, StoredRow>();
    const rescheduledOrderId = "same-existing-rescheduled-order";
    const unrelatedOrderId = "unrelated-order-2026-11-25";

    // G1: older generation on 2026-11-25 (valid Taipei day for its stored timestamp 2026-11-25T02:00:00.000Z)
    table.set(`2026-11-25:${rescheduledOrderId}`, {
      service_date: "2026-11-25",
      order_id: rescheduledOrderId,
      order_no: "O-RESCHED-001",
      order_source: "phone",
      tenant_id: "tenant-001",
      partner_id: "partner-001",
      service_product_code: "airport_transfer",
      requested_at: "2026-10-25T10:00:00.000Z",
      reservation_time: "2026-11-25T02:00:00.000Z",
      pickup_address_snapshot: "Taipei Main Station",
      dropoff_address_snapshot: "Songshan Airport",
      first_dispatch_at: null,
      first_assigned_at: null,
      final_driver_id: null,
      final_vehicle_id: null,
      final_plate_no: null,
      eta_seconds_at_assignment: null,
      arrived_pickup_at: null,
      trip_started_at: null,
      trip_completed_at: null,
      final_status: "created",
      redispatch_count: 0,
      cancellation_reason: null,
      complaint_count: 0,
      generated_at: "2026-10-25T10:01:00.000Z",
    });

    // G2: newer generation on 2026-11-26 after tenant booking update changed reservationWindowStart
    table.set(`2026-11-26:${rescheduledOrderId}`, {
      service_date: "2026-11-26",
      order_id: rescheduledOrderId,
      order_no: "O-RESCHED-001",
      order_source: "phone",
      tenant_id: "tenant-001",
      partner_id: "partner-001",
      service_product_code: "airport_transfer",
      requested_at: "2026-10-25T10:00:00.000Z",
      reservation_time: "2026-11-26T02:00:00.000Z",
      pickup_address_snapshot: "Taipei Main Station",
      dropoff_address_snapshot: "Songshan Airport",
      first_dispatch_at: null,
      first_assigned_at: null,
      final_driver_id: null,
      final_vehicle_id: null,
      final_plate_no: null,
      eta_seconds_at_assignment: null,
      arrived_pickup_at: null,
      trip_started_at: null,
      trip_completed_at: null,
      final_status: "created",
      redispatch_count: 0,
      cancellation_reason: null,
      complaint_count: 0,
      generated_at: "2026-10-25T10:02:00.000Z",
    });

    // Unrelated order on 2026-11-25 must remain intact
    table.set(`2026-11-25:${unrelatedOrderId}`, {
      service_date: "2026-11-25",
      order_id: unrelatedOrderId,
      order_no: "O-UNRELATED-1125",
      order_source: "phone",
      tenant_id: "tenant-001",
      partner_id: "partner-001",
      service_product_code: "airport_transfer",
      requested_at: "2026-10-25T09:00:00.000Z",
      reservation_time: "2026-11-25T03:00:00.000Z",
      pickup_address_snapshot: "Banqiao Station",
      dropoff_address_snapshot: "Ximen Station",
      first_dispatch_at: null,
      first_assigned_at: null,
      final_driver_id: null,
      final_vehicle_id: null,
      final_plate_no: null,
      eta_seconds_at_assignment: null,
      arrived_pickup_at: null,
      trip_started_at: null,
      trip_completed_at: null,
      final_status: "created",
      redispatch_count: 0,
      cancellation_reason: null,
      complaint_count: 0,
      generated_at: "2026-10-25T09:05:00.000Z",
    });

    const executeQuery = async (sql: string, params: unknown[] = []) => {
      const normalized = sql.replace(/\s+/g, " ").trim();
      if (
        normalized.includes("INSERT INTO reporting.dispatch_daily_records") &&
        params.length === 1
      ) {
        const targetOrderId = String(params[0]);
        const newestExisting = [...table.values()]
          .filter((row) => row.order_id === targetOrderId)
          .sort(
            (a, b) =>
              b.generated_at.localeCompare(a.generated_at) ||
              b.service_date.localeCompare(a.service_date),
          )[0];
        if (newestExisting) {
          const taipeiDay = toTaipeiDay(
            newestExisting.reservation_time ?? newestExisting.requested_at,
          );
          if (newestExisting.service_date !== taipeiDay) {
            const targetKey = `${taipeiDay}:${targetOrderId}`;
            const existingOnTarget = table.get(targetKey);
            if (
              !existingOnTarget ||
              existingOnTarget.generated_at <= newestExisting.generated_at
            ) {
              table.set(targetKey, {
                ...newestExisting,
                service_date: taipeiDay,
              });
            }
          }
        }
        return { rows: [], rowCount: 1 };
      }
      if (normalized.includes("INSERT INTO reporting.dispatch_daily_records")) {
        const serviceDateParam = String(params[0]);
        const orderIdParam = String(params[1]);
        const generatedAtParam = String(params[24]);
        const hasNewerValidRow = [...table.values()].some(
          (existing) =>
            existing.order_id === orderIdParam &&
            existing.service_date ===
              toTaipeiDay(
                existing.reservation_time ?? existing.requested_at,
              ) &&
            existing.generated_at > generatedAtParam,
        );
        if (!hasNewerValidRow) {
          const key = `${serviceDateParam}:${orderIdParam}`;
          const existingOnSameKey = table.get(key);
          if (
            !existingOnSameKey ||
            existingOnSameKey.generated_at <= generatedAtParam
          ) {
            table.set(key, {
              service_date: serviceDateParam,
              order_id: orderIdParam,
              order_no: String(params[2]),
              order_source: "phone",
              tenant_id: params[4] ? String(params[4]) : null,
              partner_id: params[5] ? String(params[5]) : null,
              service_product_code: String(params[6]),
              requested_at: String(params[7]),
              reservation_time: params[8] ? String(params[8]) : null,
              pickup_address_snapshot: String(params[9]),
              dropoff_address_snapshot: params[10] ? String(params[10]) : null,
              first_dispatch_at: params[11] ? String(params[11]) : null,
              first_assigned_at: params[12] ? String(params[12]) : null,
              final_driver_id: params[13] ? String(params[13]) : null,
              final_vehicle_id: params[14] ? String(params[14]) : null,
              final_plate_no: params[15] ? String(params[15]) : null,
              eta_seconds_at_assignment:
                typeof params[16] === "number" ? params[16] : null,
              arrived_pickup_at: params[17] ? String(params[17]) : null,
              trip_started_at: params[18] ? String(params[18]) : null,
              trip_completed_at: params[19] ? String(params[19]) : null,
              final_status: String(params[20]),
              redispatch_count: Number(params[21]),
              cancellation_reason: params[22] ? String(params[22]) : null,
              complaint_count: Number(params[23]),
              generated_at: generatedAtParam,
            });
          }
        }
        return { rows: [], rowCount: 1 };
      }
      if (normalized.includes("DELETE FROM reporting.dispatch_daily_records")) {
        const orderIdParam = String(params[0]);
        const targetDateParam = String(params[1]);
        const generatedAtParam = String(params[2]);
        for (const [key, row] of table.entries()) {
          const rowTaipeiDay = toTaipeiDay(
            row.reservation_time ?? row.requested_at,
          );
          if (
            row.order_id === orderIdParam &&
            row.service_date !== targetDateParam &&
            (row.service_date !== rowTaipeiDay ||
              row.generated_at <= generatedAtParam)
          ) {
            table.delete(key);
          }
        }
        return { rows: [], rowCount: 1 };
      }
      if (normalized.includes("FROM reporting.dispatch_daily_records")) {
        const rows = [...table.values()].filter((row) => {
          const rowTaipeiDay = toTaipeiDay(
            row.reservation_time ?? row.requested_at,
          );
          let idx = 0;
          if (normalized.includes("service_date = $1::date")) {
            const target = String(params[idx++]);
            if (row.service_date !== target && rowTaipeiDay !== target) {
              return false;
            }
          }
          if (normalized.includes("order_id =")) {
            const targetOrder = String(params[idx++]);
            if (row.order_id !== targetOrder) {
              return false;
            }
          }
          return true;
        });
        return { rows: structuredClone(rows), rowCount: rows.length };
      }
      return { rows: [], rowCount: 0 };
    };

    const repository = new ReportingRepository({
      isEnabled: () => true,
      query: executeQuery,
      connect: async () => ({
        query: executeQuery,
        release: () => undefined,
      }),
    } as never);

    // Direct selected-day read on old date 2026-11-25 before any unbounded read/rebuild
    const selectedDay25 = await repository.listDailyDispatchRecords({
      serviceDate: "2026-11-25",
      orderId: rescheduledOrderId,
    });
    expect(selectedDay25).toEqual([]);
    expect(table.has(`2026-11-25:${rescheduledOrderId}`)).toBe(false);
    expect(table.get(`2026-11-26:${rescheduledOrderId}`)).toMatchObject({
      service_date: "2026-11-26",
      order_id: rescheduledOrderId,
      reservation_time: "2026-11-26T02:00:00.000Z",
      generated_at: "2026-10-25T10:02:00.000Z",
    });
    expect(table.has(`2026-11-25:${unrelatedOrderId}`)).toBe(true);

    // Reading the new date 2026-11-26 returns the single final G2 record
    const selectedDay26 = await repository.listDailyDispatchRecords({
      serviceDate: "2026-11-26",
      orderId: rescheduledOrderId,
    });
    expect(selectedDay26).toHaveLength(1);
    expect(selectedDay26[0]).toMatchObject({
      serviceDate: "2026-11-26",
      orderId: rescheduledOrderId,
      reservationTime: "2026-11-26T02:00:00.000Z",
      generatedAt: "2026-10-25T10:02:00.000Z",
    });
  });
});
