import { describe, expect, it, vi } from "vitest";

import { ReportingService } from "../../src/modules/reporting/reporting.service";

function createOrder(overrides: Record<string, unknown> = {}) {
  return {
    orderId: "order-report-001",
    orderNo: "O-REPORT-001",
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

function createSource(overrides: Record<string, unknown> = {}) {
  const order = createOrder(overrides.order as Record<string, unknown>);
  const assignmentId = "assignment-report-001";
  const taskId = "task-report-001";

  return {
    orders: [order],
    dispatchJobs: [
      {
        dispatchJobId: "job-report-001",
        orderId: order.orderId,
        status: "assigned",
        mode: "auto",
        latestEtaMinutes: 9,
        createdAt: "2026-06-20T01:01:00.000Z",
        updatedAt: "2026-06-20T01:02:00.000Z",
      },
    ],
    dispatchAssignments: [
      {
        assignmentId,
        dispatchJobId: "job-report-001",
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
        dispatchJobId: "job-report-001",
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
        actualDistanceKm: 12.4,
        actualDurationSec: 1500,
        fare: null,
        proof: null,
      },
    ],
    dispatchTraceLogs: [
      {
        traceId: "trace-assigned-001",
        orderId: order.orderId,
        eventType: "dispatch.assigned",
        message: "assigned",
        createdAt: "2026-06-20T01:02:00.000Z",
        details: { taskId, assignmentId },
      },
      {
        traceId: "trace-started-001",
        orderId: order.orderId,
        eventType: "driver.started_trip",
        message: "started",
        createdAt: "2026-06-20T01:15:00.000Z",
        details: { taskId },
      },
      {
        traceId: "trace-completed-001",
        orderId: order.orderId,
        eventType: "driver.completed_trip",
        message: "completed",
        createdAt: "2026-06-20T01:40:00.000Z",
        details: { taskId },
      },
      ...((overrides.dispatchTraceLogs as unknown[]) ?? []),
    ],
    complaintCases: [
      {
        caseNo: "CMP-001",
        caseSource: "ops_console",
        relatedOrderId: order.orderId,
        relatedCallId: null,
        relatedIncidentId: null,
        category: "late_arrival",
        severity: "normal",
        description: "Late pickup",
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

function createService(sourceOverrides: Record<string, unknown> = {}) {
  const source = createSource(sourceOverrides);
  const reportingRepository = {
    isEnabled: vi.fn(() => true),
    listDailyDispatchRecords: vi.fn(async () => []),
    listDispatchableSupplySnapshots: vi.fn(async () => []),
    listMonthlyOperationsSummaries: vi.fn(async () => []),
    upsertDailyDispatchRecords: vi.fn(async () => undefined),
    upsertDispatchableSupplySnapshots: vi.fn(async () => undefined),
    upsertMonthlyOperationsSummaries: vi.fn(async () => undefined),
    loadDailyDispatchRecordSource: vi.fn(async () => source),
    reportPersistenceFailure: vi.fn(),
  };
  const ownedMobilityService = {
    getReportingSnapshot: vi.fn(() => {
      throw new Error("unexpected fallback to snapshot path");
    }),
  };
  const complaintService = {
    listComplaintCases: vi.fn(() => []),
  };
  const regulatoryRegistryService = {
    listVehicles: vi.fn(() => [
      {
        vehicleId: "vehicle-001",
        plateNo: "ABC-1001",
        operatingArea: "taipei",
        supportedServiceBuckets: ["standard_taxi"],
        supplyLifecycle: {
          dispatch: { eligible: true },
        },
      },
    ]),
    listDrivers: vi.fn(() => [
      {
        driverId: "driver-001",
        dispatchEligible: true,
        supportedServiceBuckets: ["standard_taxi"],
      },
    ]),
    listSupplyPairs: vi.fn(() => [
      {
        vehicleId: "vehicle-001",
        driverId: "driver-001",
      },
    ]),
    listLatestDriverLocations: vi.fn(() => [
      {
        driverId: "driver-001",
        lat: 25.0,
        lng: 121.5,
        accuracyM: 30,
        recordedAt: "2026-06-20T01:04:30.000Z",
        updatedAt: "2026-06-20T01:04:35.000Z",
      },
    ]),
  };
  const vehicleEligibilityService = {
    listActiveServiceProducts: vi.fn(() => [
      {
        serviceProduct: "taxi_realtime",
        serviceBucket: "standard_taxi",
        timing: "realtime",
      },
    ]),
    isVehicleEligibleForExactServiceProduct: vi.fn(() => true),
  };

  return {
    service: new ReportingService(
      ownedMobilityService as never,
      complaintService as never,
      regulatoryRegistryService as never,
      vehicleEligibilityService as never,
      reportingRepository as never,
    ),
    reportingRepository,
    regulatoryRegistryService,
    vehicleEligibilityService,
  };
}

describe("ReportingService", () => {
  it("returns rebuilt records when repository storage is enabled but the report table is empty", async () => {
    const { service, reportingRepository } = createService();

    const records = await service.listDailyDispatchRecords({
      serviceDate: "2026-06-20",
    });

    expect(records).toHaveLength(1);
    expect(records[0]).toMatchObject({
      orderId: "order-report-001",
      finalPlateNo: "ABC-1001",
      complaintCount: 1,
      arrivedPickupAt: null,
      tripStartedAt: "2026-06-20T01:15:00.000Z",
      tripCompletedAt: "2026-06-20T01:40:00.000Z",
    });
    expect(reportingRepository.upsertDailyDispatchRecords).toHaveBeenCalledTimes(
      1,
    );
  });

  it("keeps arrivedPickupAt null when no arrival trace exists even if the task snapshot carries a timestamp", async () => {
    const { service } = createService({
      dispatchTraceLogs: [],
    });

    const rebuild = await service.rebuildDailyDispatchRecords({
      serviceDate: "2026-06-20",
    });

    expect(rebuild.records).toHaveLength(1);
    expect(rebuild.records[0]).toMatchObject({
      orderId: "order-report-001",
      arrivedPickupAt: null,
      tripStartedAt: "2026-06-20T01:15:00.000Z",
      tripCompletedAt: "2026-06-20T01:40:00.000Z",
    });
  });

  it("captures dispatchable supply snapshots on 5-minute boundaries with complete source health", async () => {
    const { service, reportingRepository, vehicleEligibilityService } =
      createService();

    const result = await service.captureDispatchableSupplySnapshot(
      new Date("2026-06-20T01:06:41.000Z"),
    );

    expect(result.snapshotAt).toBe("2026-06-20T01:05:00.000Z");
    expect(result.records).toEqual([
      expect.objectContaining({
        businessArea: "taipei",
        serviceProductCode: "taxi_realtime",
        dispatchableVehicleCount: 1,
        availableDriverCount: 1,
        sourceHealth: "complete",
      }),
    ]);
    expect(
      reportingRepository.upsertDispatchableSupplySnapshots,
    ).toHaveBeenCalledTimes(1);
    expect(vehicleEligibilityService.listActiveServiceProducts).toHaveBeenCalled();
  });

  it("marks snapshot source health when eligible supply lacks a fresh location", async () => {
    const { service, regulatoryRegistryService } = createService();
    vi.spyOn(regulatoryRegistryService, "listLatestDriverLocations").mockReturnValue([
      {
        driverId: "driver-001",
        lat: 25.0,
        lng: 121.5,
        accuracyM: 120,
        recordedAt: "2026-06-20T01:04:30.000Z",
        updatedAt: "2026-06-20T01:04:35.000Z",
      },
    ]);

    const result = await service.captureDispatchableSupplySnapshot(
      new Date("2026-06-20T01:05:00.000Z"),
    );

    expect(result.records).toEqual([
      expect.objectContaining({
        dispatchableVehicleCount: 0,
        availableDriverCount: 0,
        sourceHealth: "location_low_accuracy",
      }),
    ]);
  });

  it("builds six-month summaries from monthly aggregates with weighted snapshot coverage", async () => {
    const { service, reportingRepository } = createService();
    vi.spyOn(service, "rebuildMonthlyOperationsSummaries").mockResolvedValue({
      rebuiltCount: 2,
      generatedAt: "2026-06-20T00:00:00.000Z",
      records: [],
    });
    reportingRepository.listMonthlyOperationsSummaries.mockResolvedValue([
      {
        periodMonth: "2026-01",
        businessArea: "taipei",
        serviceProductCode: "taxi_realtime",
        demandRequestCount: 3,
        actualDispatchCount: 2,
        completedTripCount: 1,
        cancelledOrderCount: 1,
        averageDispatchableVehicleCount: 4,
        validSnapshotCount: 2,
        expectedSnapshotCount: 10,
        snapshotCoverageRate: 0.2,
        complaintCount: 1,
        complaintsByCategory: { late_arrival: 1 },
        generatedAt: "2026-02-01T00:00:00.000Z",
      },
      {
        periodMonth: "2026-02",
        businessArea: "taipei",
        serviceProductCode: "taxi_realtime",
        demandRequestCount: 5,
        actualDispatchCount: 4,
        completedTripCount: 3,
        cancelledOrderCount: 2,
        averageDispatchableVehicleCount: 10,
        validSnapshotCount: 1,
        expectedSnapshotCount: 5,
        snapshotCoverageRate: 0.2,
        complaintCount: 2,
        complaintsByCategory: { no_show: 2 },
        generatedAt: "2026-03-01T00:00:00.000Z",
      },
    ]);

    const summary = await service.previewSixMonthOperationsSummary({
      from: "2026-01-01",
      to: "2026-02-28",
      businessArea: "taipei",
      serviceProductCode: "taxi_realtime",
    });

    expect(summary).toEqual([
      {
        from: "2026-01-01",
        to: "2026-02-28",
        businessArea: "taipei",
        serviceProductCode: "taxi_realtime",
        demandRequestCount: 8,
        actualDispatchCount: 6,
        completedTripCount: 4,
        cancelledOrderCount: 3,
        averageDispatchableVehicleCount: 6,
        validSnapshotCount: 3,
        expectedSnapshotCount: 15,
        snapshotCoverageRate: 0.2,
        complaintCount: 3,
        complaintsByCategory: {
          late_arrival: 1,
          no_show: 2,
        },
        generatedAt: "2026-03-01T00:00:00.000Z",
      },
    ]);
  });
});
