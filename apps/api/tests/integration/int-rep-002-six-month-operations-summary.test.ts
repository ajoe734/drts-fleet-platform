import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

import { EventEmitter2 } from "@nestjs/event-emitter";
import type { DriverRegistryRecord } from "@drts/contracts";

import { OpsDispatchEventsService } from "../../src/common/ops-dispatch-events.service";
import { AuditNotificationService } from "../../src/modules/audit-notification/audit-notification.service";
import { CallcenterService } from "../../src/modules/callcenter/callcenter.service";
import { ComplaintService } from "../../src/modules/complaint/complaint.service";
import { DriverProfileService } from "../../src/modules/driver-profile/driver-profile.service";
import { OwnedMobilityService } from "../../src/modules/owned-mobility/owned-mobility.service";
import { OwnedMobilityTaskEventsService } from "../../src/modules/owned-mobility/owned-mobility-task-events.service";
import { RegulatoryRegistryService } from "../../src/modules/regulatory-registry/regulatory-registry.service";
import type { PersistRegulatoryRegistryChanges } from "../../src/modules/regulatory-registry/regulatory-registry.repository";
import { ReportingService } from "../../src/modules/reporting/reporting.service";
import { ReportingFilingService } from "../../src/modules/reporting-filing/reporting-filing.service";
import { VehicleEligibilityService } from "../../src/modules/vehicle-eligibility/vehicle-eligibility.service";

function flushBackgroundWork() {
  return vi.runAllTimersAsync();
}

function createHarness() {
  const eventEmitter = new EventEmitter2();
  const auditNotificationService = new AuditNotificationService();
  const opsDispatchEventsService = new OpsDispatchEventsService(eventEmitter);
  const driverProfileService = new DriverProfileService(
    auditNotificationService,
  );
  const driverRows = new Map<string, DriverRegistryRecord>();
  const regulatoryRegistryRepository = {
    isEnabled: () => true,
    loadDriverMatchingSuppressions: async () => [],
    upsertDriverLocation: async () => true,
    lockDriver: async (driverId: string) =>
      structuredClone(driverRows.get(driverId) ?? null),
    persistChanges: async (changes: PersistRegulatoryRegistryChanges) => {
      for (const driver of changes.drivers ?? [])
        driverRows.set(driver.driverId, structuredClone(driver));
    },
    reportPersistenceFailure: vi.fn(),
  };
  const regulatoryRegistryService = new RegulatoryRegistryService(
    opsDispatchEventsService,
    auditNotificationService,
    driverProfileService,
    regulatoryRegistryRepository as never,
  );
  for (const driver of regulatoryRegistryService.listDrivers())
    driverRows.set(driver.driverId, structuredClone(driver));
  const callcenterService = new CallcenterService(auditNotificationService);
  const ownedMobilityTaskEventsService = new OwnedMobilityTaskEventsService(
    eventEmitter,
  );
  const ownedMobilityService = new OwnedMobilityService(
    regulatoryRegistryService,
    auditNotificationService,
    callcenterService,
    ownedMobilityTaskEventsService,
    opsDispatchEventsService,
  );
  const complaintService = new ComplaintService(auditNotificationService);
  const vehicleEligibilityService = new VehicleEligibilityService(
    regulatoryRegistryService,
    auditNotificationService,
  );
  const reportingService = new ReportingService(
    ownedMobilityService,
    complaintService,
    regulatoryRegistryService,
    vehicleEligibilityService,
  );
  const reportingFilingService = new ReportingFilingService(
    auditNotificationService,
  );
  reportingFilingService.registerOrderFeedProvider(() =>
    ownedMobilityService.listOrders(),
  );
  reportingFilingService.registerDailyDispatchRecordProvider((filters) =>
    reportingService.listDailyDispatchRecords(filters),
  );
  reportingFilingService.registerSixMonthOperationsSummaryProvider((filters) =>
    reportingService.previewSixMonthOperationsSummary(filters),
  );

  return {
    ownedMobilityService,
    complaintService,
    reportingService,
    reportingFilingService,
    regulatoryRegistryService,
    cleanup: async () => {
      await ownedMobilityTaskEventsService.onModuleDestroy();
      await opsDispatchEventsService.onModuleDestroy();
    },
  };
}

describe("INT-REP-002 six-month summary aggregates snapshots", () => {
  const cleanups: Array<() => Promise<void>> = [];

  beforeEach(() => {
    vi.useFakeTimers();
  });

  afterEach(async () => {
    vi.useRealTimers();
    while (cleanups.length > 0) {
      await cleanups.pop()?.();
    }
  });

  it("combines monthly summaries into one fixed-definition operations summary", async () => {
    const {
      ownedMobilityService,
      complaintService,
      reportingService,
      reportingFilingService,
      regulatoryRegistryService,
      cleanup,
    } = createHarness();
    cleanups.push(cleanup);

    vi.setSystemTime(new Date("2026-01-10T01:00:00.000Z"));
    const januaryOrder = ownedMobilityService.createCallCenterOrder({
      callId: "call-int-rep-jan-001",
      agentId: "ops-agent-001",
      recordingId: "rec-int-rep-jan-001",
      pickup: { address: "Taichung Station" },
      dropoff: { address: "Port Terminal" },
      passenger: { name: "Rider Jan", phone: "0911000101" },
      notes: "completed january order",
    });
    const januaryDispatch = ownedMobilityService.dispatchOrder(
      januaryOrder.orderId,
      { mode: "auto" },
      "req-int-rep-jan-dispatch-001",
    );
    await ownedMobilityService.assignDispatch(
      {
        dispatchJobId: januaryDispatch.dispatchJobId,
        vehicleId: "veh-demo-001",
        driverId: "drv-demo-001",
      },
      "req-int-rep-jan-assign-001",
    );
    const januaryTask = ownedMobilityService
      .getReportingSnapshot()
      .driverTasks.find((task) => task.orderId === januaryOrder.orderId);
    ownedMobilityService.acceptDriverTask(
      januaryTask!.taskId,
      { acceptedAt: "2026-01-10T01:02:00.000Z" },
      "req-int-rep-jan-accept-001",
    );
    ownedMobilityService.arrivedPickup(
      januaryTask!.taskId,
      { arrivedAt: "2026-01-10T01:04:00.000Z" },
      "req-int-rep-jan-arrive-001",
    );
    ownedMobilityService.startDriverTask(
      januaryTask!.taskId,
      { startedAt: "2026-01-10T01:05:00.000Z" },
      "req-int-rep-jan-start-001",
    );
    ownedMobilityService.completeDriverTask(
      januaryTask!.taskId,
      {
        completedAt: "2026-01-10T01:25:00.000Z",
        actualDistanceKm: 8.2,
        actualDurationSec: 1200,
      },
      "req-int-rep-jan-complete-001",
    );
    complaintService.createComplaintCase({
      caseSource: "ops_console",
      relatedOrderId: januaryOrder.orderId,
      category: "late_arrival",
      severity: "normal",
      description: "January complaint",
    });
    await regulatoryRegistryService.recordDriverLocation({
      driverId: "drv-demo-001",
      lat: 24.2668,
      lng: 120.6204,
      accuracyM: 25,
      recordedAt: "2026-01-10T01:04:40.000Z",
    });
    await reportingService.captureDispatchableSupplySnapshot(
      new Date("2026-01-10T01:05:00.000Z"),
    );
    await regulatoryRegistryService.recordDriverLocation({
      driverId: "drv-demo-001",
      lat: 24.2668,
      lng: 120.6204,
      accuracyM: 30,
      recordedAt: "2026-01-10T01:09:40.000Z",
    });
    await reportingService.captureDispatchableSupplySnapshot(
      new Date("2026-01-10T01:10:00.000Z"),
    );
    await regulatoryRegistryService.recordDriverLocation({
      driverId: "drv-demo-001",
      lat: 24.2668,
      lng: 120.6204,
      accuracyM: 150,
      recordedAt: "2026-01-10T01:14:40.000Z",
    });
    await reportingService.captureDispatchableSupplySnapshot(
      new Date("2026-01-10T01:15:00.000Z"),
    );

    vi.setSystemTime(new Date("2026-02-12T01:00:00.000Z"));
    const februaryOrder = ownedMobilityService.createCallCenterOrder({
      callId: "call-int-rep-feb-001",
      agentId: "ops-agent-002",
      recordingId: "rec-int-rep-feb-001",
      pickup: { address: "Taichung Harbor" },
      dropoff: { address: "Airport Bus Stop" },
      passenger: { name: "Rider Feb", phone: "0911000102" },
      notes: "cancelled february order",
    });
    const februaryDispatch = ownedMobilityService.dispatchOrder(
      februaryOrder.orderId,
      { mode: "auto" },
      "req-int-rep-feb-dispatch-001",
    );
    await ownedMobilityService.assignDispatch(
      {
        dispatchJobId: februaryDispatch.dispatchJobId,
        vehicleId: "veh-demo-001",
        driverId: "drv-demo-001",
      },
      "req-int-rep-feb-assign-001",
    );
    ownedMobilityService.cancelOwnedOrder(
      februaryOrder.orderId,
      { reason: "passenger_cancelled" },
      "req-int-rep-feb-cancel-001",
    );
    complaintService.createComplaintCase({
      caseSource: "ops_console",
      relatedOrderId: februaryOrder.orderId,
      category: "no_arrival",
      severity: "normal",
      description: "February complaint",
    });
    await regulatoryRegistryService.recordDriverLocation({
      driverId: "drv-demo-001",
      lat: 24.2668,
      lng: 120.6204,
      accuracyM: 20,
      recordedAt: "2026-02-12T01:04:40.000Z",
    });
    await reportingService.captureDispatchableSupplySnapshot(
      new Date("2026-02-12T01:05:00.000Z"),
    );

    const januaryRebuild =
      await reportingService.rebuildMonthlyOperationsSummaries({
        periodMonth: "2026-01",
      });
    const februaryRebuild =
      await reportingService.rebuildMonthlyOperationsSummaries({
        periodMonth: "2026-02",
      });
    expect(januaryRebuild.rebuiltCount).toBeGreaterThan(0);
    expect(februaryRebuild.rebuiltCount).toBeGreaterThan(0);

    const summaries = await reportingService.previewSixMonthOperationsSummary({
      from: "2026-01-01",
      to: "2026-02-28",
      businessArea: "taichung-port",
      serviceProductCode: "taxi_realtime",
    });
    expect(summaries).toEqual([
      expect.objectContaining({
        from: "2026-01-01",
        to: "2026-02-28",
        businessArea: "taichung-port",
        serviceProductCode: "taxi_realtime",
        demandRequestCount: 2,
        actualDispatchCount: 2,
        completedTripCount: 1,
        cancelledOrderCount: 1,
        averageDispatchableVehicleCount: 1,
        validSnapshotCount: 3,
        expectedSnapshotCount: 16992,
        snapshotCoverageRate: 0.0002,
        complaintCount: 2,
        complaintsByCategory: {
          late_arrival: 1,
          no_arrival: 1,
        },
      }),
    ]);

    const accepted = reportingFilingService.createReportJob(
      {
        jobType: "six_month_operations_summary",
        // Was "json", which is not a value ReportOutputFormat has ever had.
        // Nothing validated `format`, so the test passed on it. This case is
        // about the six-month summary rows, not the rendering.
        format: "csv",
        filters: {
          from: "2026-01-01",
          to: "2026-02-28",
          businessArea: "taichung-port",
          serviceProductCode: "taxi_realtime",
        },
      },
      "req-int-rep-summary-job-001",
    );
    await flushBackgroundWork();

    const reportJob = reportingFilingService.getReportJob(
      accepted.jobId,
      "req-int-rep-summary-open-001",
    );
    expect(reportJob.status).toBe("completed");
    expect(reportJob.rows).toEqual([
      expect.objectContaining({
        periodMonth: "2026-01",
        businessArea: "taichung-port",
        serviceProductCode: "taxi_realtime",
        demandRequestCount: 1,
        complaintCount: 1,
      }),
      expect.objectContaining({
        periodMonth: "2026-02",
        businessArea: "taichung-port",
        serviceProductCode: "taxi_realtime",
        demandRequestCount: 1,
        complaintCount: 1,
      }),
    ]);

    const pdfAccepted = reportingFilingService.createReportJob(
      {
        jobType: "six_month_operations_summary",
        format: "pdf",
        filters: {
          from: "2026-01-01",
          to: "2026-02-28",
          businessArea: "taichung-port",
          serviceProductCode: "taxi_realtime",
        },
      },
      "req-int-rep-summary-pdf-001",
    );
    await flushBackgroundWork();
    const pdfJob = reportingFilingService.getReportJob(
      pdfAccepted.jobId,
      "req-int-rep-summary-pdf-open-001",
    );
    expect(pdfJob.rows).toEqual([
      expect.objectContaining({
        from: "2026-01-01",
        to: "2026-02-28",
        businessArea: "taichung-port",
        serviceProductCode: "taxi_realtime",
        demandRequestCount: 2,
        complaintCount: 2,
      }),
    ]);
  });

  it("produces six consecutive monthly rows including empty middle months, preserves snapshot-weighted denominator, and reruns without duplicate month keys", async () => {
    const {
      ownedMobilityService,
      complaintService,
      reportingService,
      reportingFilingService,
      regulatoryRegistryService,
      cleanup,
    } = createHarness();
    cleanups.push(cleanup);

    // Month 1 (2026-05): 1 completed trip, 1 complaint, 2 valid snapshots (1 vehicle each)
    vi.setSystemTime(new Date("2026-05-10T01:00:00.000Z"));
    const mayOrder = ownedMobilityService.createCallCenterOrder({
      callId: "call-int-rep-may-001",
      agentId: "ops-agent-001",
      recordingId: "rec-int-rep-may-001",
      pickup: { address: "Taichung Station" },
      dropoff: { address: "Port Terminal" },
      passenger: { name: "Rider May", phone: "0911000501" },
      notes: "may order",
    });
    const mayDispatch = ownedMobilityService.dispatchOrder(
      mayOrder.orderId,
      { mode: "auto" },
      "req-int-rep-may-dispatch-001",
    );
    await ownedMobilityService.assignDispatch(
      {
        dispatchJobId: mayDispatch.dispatchJobId,
        vehicleId: "veh-demo-001",
        driverId: "drv-demo-001",
      },
      "req-int-rep-may-assign-001",
    );
    const mayTask = ownedMobilityService
      .getReportingSnapshot()
      .driverTasks.find((task) => task.orderId === mayOrder.orderId)!;
    ownedMobilityService.acceptDriverTask(
      mayTask.taskId,
      { acceptedAt: "2026-05-10T01:02:00.000Z" },
      "req-int-rep-may-accept-001",
    );
    ownedMobilityService.arrivedPickup(
      mayTask.taskId,
      { arrivedAt: "2026-05-10T01:04:00.000Z" },
      "req-int-rep-may-arrive-001",
    );
    ownedMobilityService.startDriverTask(
      mayTask.taskId,
      { startedAt: "2026-05-10T01:05:00.000Z" },
      "req-int-rep-may-start-001",
    );
    ownedMobilityService.completeDriverTask(
      mayTask.taskId,
      {
        completedAt: "2026-05-10T01:25:00.000Z",
        actualDistanceKm: 8.2,
        actualDurationSec: 1200,
      },
      "req-int-rep-may-complete-001",
    );
    complaintService.createComplaintCase({
      caseSource: "ops_console",
      relatedOrderId: mayOrder.orderId,
      category: "late_arrival",
      severity: "normal",
      description: "May complaint",
    });
    await regulatoryRegistryService.recordDriverLocation({
      driverId: "drv-demo-001",
      lat: 24.2668,
      lng: 120.6204,
      accuracyM: 20,
      recordedAt: "2026-05-10T01:04:40.000Z",
    });
    await reportingService.captureDispatchableSupplySnapshot(
      new Date("2026-05-10T01:05:00.000Z"),
    );

    // Months 2-4 (2026-06, 2026-07, 2026-08): empty middle months for this observed dimension
    // Month 5 (2026-09): 1 cancelled order after assignment (no-show), 1 complaint
    vi.setSystemTime(new Date("2026-09-15T02:00:00.000Z"));
    const sepOrder = ownedMobilityService.createCallCenterOrder({
      callId: "call-int-rep-sep-001",
      agentId: "ops-agent-001",
      recordingId: "rec-int-rep-sep-001",
      pickup: { address: "Taichung Harbor" },
      dropoff: { address: "Airport Bus Stop" },
      passenger: { name: "Rider Sep", phone: "0911000901" },
      notes: "sep order",
    });
    const sepDispatch = ownedMobilityService.dispatchOrder(
      sepOrder.orderId,
      { mode: "auto" },
      "req-int-rep-sep-dispatch-001",
    );
    await ownedMobilityService.assignDispatch(
      {
        dispatchJobId: sepDispatch.dispatchJobId,
        vehicleId: "veh-demo-001",
        driverId: "drv-demo-001",
      },
      "req-int-rep-sep-assign-001",
    );
    ownedMobilityService.cancelOwnedOrder(
      sepOrder.orderId,
      { reason: "passenger_cancelled" },
      "req-int-rep-sep-cancel-001",
    );
    complaintService.createComplaintCase({
      caseSource: "ops_console",
      relatedOrderId: sepOrder.orderId,
      category: "no_arrival",
      severity: "normal",
      description: "Sep complaint",
    });

    // First preview and rerun over the 6-month window 2026-05..2026-10
    await reportingService.previewSixMonthOperationsSummary({
      periodMonthFrom: "2026-05",
      periodMonthTo: "2026-10",
      businessArea: "taichung-port",
      serviceProductCode: "taxi_realtime",
    });
    const summaries = await reportingService.previewSixMonthOperationsSummary({
      periodMonthFrom: "2026-05",
      periodMonthTo: "2026-10",
      businessArea: "taichung-port",
      serviceProductCode: "taxi_realtime",
    });

    expect(summaries).toHaveLength(1);
    const summary = summaries[0]!;
    expect(summary).toMatchObject({
      from: "2026-05-01",
      to: "2026-10-31",
      businessArea: "taichung-port",
      serviceProductCode: "taxi_realtime",
      demandRequestCount: 2,
      actualDispatchCount: 2,
      completedTripCount: 1,
      cancelledOrderCount: 1,
      averageDispatchableVehicleCount: 1,
      validSnapshotCount: 1,
      expectedSnapshotCount: (31 + 30 + 31 + 31 + 30 + 31) * 24 * 12,
      complaintCount: 2,
      onTimeTripCount: 1,
      noShowTripCount: 1,
    });

    const monthlies = summary.monthlySummaries ?? [];
    expect(monthlies.map((m) => m.periodMonth)).toEqual([
      "2026-05",
      "2026-06",
      "2026-07",
      "2026-08",
      "2026-09",
      "2026-10",
    ]);
    // Every monthly row shares the exact same generation timestamp as the six-month summary
    for (const m of monthlies) {
      expect(m.generatedAt).toBe(summary.generatedAt);
    }
    // Middle empty months have validSnapshotCount=0 and averageDispatchableVehicleCount=null
    const june = monthlies.find((m) => m.periodMonth === "2026-06")!;
    expect(june).toMatchObject({
      periodMonth: "2026-06",
      demandRequestCount: 0,
      actualDispatchCount: 0,
      validSnapshotCount: 0,
      averageDispatchableVehicleCount: null,
      complaintCount: 0,
    });

    // Rerun did not produce duplicate month keys in listMonthlyOperationsSummaries
    const listedMonths = await reportingService.listMonthlyOperationsSummaries({
      periodMonthFrom: "2026-05",
      periodMonthTo: "2026-10",
      businessArea: "taichung-port",
      serviceProductCode: "taxi_realtime",
    });
    expect(listedMonths).toHaveLength(6);
    expect(new Set(listedMonths.map((m) => m.periodMonth)).size).toBe(6);

    // CSV job contains the 6 monthly detail rows
    const csvJobAccepted = reportingFilingService.createReportJob(
      {
        jobType: "six_month_operations_summary",
        format: "csv",
        filters: {
          periodMonthFrom: "2026-05",
          periodMonthTo: "2026-10",
          businessArea: "taichung-port",
          serviceProductCode: "taxi_realtime",
        },
      },
      "req-int-rep-six-month-csv-001",
    );
    await flushBackgroundWork();
    const csvJob = reportingFilingService.getReportJob(csvJobAccepted.jobId);
    expect(csvJob.rows).toHaveLength(6);
  });

  it("computes the SA §7.4 six-month weighted snapshot average from the raw snapshot sum (1/12 -> 0.08, not 0.17*6/12 -> 0.09) and preserves single-batch source/snapshot reads", async () => {
    const {
      ownedMobilityService,
      reportingService,
      regulatoryRegistryService,
      cleanup,
    } = createHarness();
    cleanups.push(cleanup);

    // Ensure the taichung-port / taxi_realtime dimension has an order in 2026-06
    vi.setSystemTime(new Date("2026-06-05T01:00:00.000Z"));
    const juneOrder = ownedMobilityService.createCallCenterOrder({
      callId: "call-int-rep-raw-precision-001",
      agentId: "ops-agent-001",
      recordingId: "rec-int-rep-raw-precision-001",
      pickup: { address: "Taichung Station" },
      dropoff: { address: "Port Terminal" },
      passenger: { name: "Rider June", phone: "0911000601" },
      notes: "precision boundary order",
    });
    const juneDispatch = ownedMobilityService.dispatchOrder(
      juneOrder.orderId,
      { mode: "auto" },
      "req-int-rep-raw-precision-dispatch-001",
    );
    await ownedMobilityService.assignDispatch(
      {
        dispatchJobId: juneDispatch.dispatchJobId,
        vehicleId: "veh-demo-001",
        driverId: "drv-demo-001",
      },
      "req-int-rep-raw-precision-assign-001",
    );

    const runScenario = async (juneCounts: readonly number[]) => {
      // June: 6 complete snapshots; July: 6 complete snapshots of 0; Aug-Nov: empty
      const juneTimes = [
        "2026-06-05T01:05:00.000Z",
        "2026-06-05T01:10:00.000Z",
        "2026-06-05T01:15:00.000Z",
        "2026-06-05T01:20:00.000Z",
        "2026-06-05T01:25:00.000Z",
        "2026-06-05T01:30:00.000Z",
      ];
      const julyTimes = [
        "2026-07-05T01:05:00.000Z",
        "2026-07-05T01:10:00.000Z",
        "2026-07-05T01:15:00.000Z",
        "2026-07-05T01:20:00.000Z",
        "2026-07-05T01:25:00.000Z",
        "2026-07-05T01:30:00.000Z",
      ];
      const syntheticSnapshots = [
        ...juneTimes.map((snapshotAt, index) => ({
          snapshotAt,
          businessArea: "taichung-port",
          serviceProductCode: "taxi_realtime" as const,
          dispatchableVehicleCount: juneCounts[index] ?? 0,
          availableDriverCount: juneCounts[index] ?? 0,
          sourceHealth: "complete" as const,
          generatedAt: snapshotAt,
        })),
        ...julyTimes.map((snapshotAt) => ({
          snapshotAt,
          businessArea: "taichung-port",
          serviceProductCode: "taxi_realtime" as const,
          dispatchableVehicleCount: 0,
          availableDriverCount: 0,
          sourceHealth: "complete" as const,
          generatedAt: snapshotAt,
        })),
      ];

      let sourceReads = 0;
      let snapshotReads = 0;
      const controlledRepo = {
        isEnabled: () => true,
        loadDailyDispatchRecordSource: async () => {
          sourceReads += 1;
          const snapshot = ownedMobilityService.getReportingSnapshot();
          return {
            orders: snapshot.orders,
            dispatchJobs: snapshot.dispatchJobs,
            dispatchAssignments: snapshot.dispatchAssignments,
            driverTasks: snapshot.driverTasks,
            dispatchTraceLogs: snapshot.dispatchTraceLogs,
            complaintCases: [],
          };
        },
        listDispatchableSupplySnapshots: async () => {
          snapshotReads += 1;
          return structuredClone(syntheticSnapshots);
        },
        replaceMonthlyOperationsSummaries: async () => undefined,
        loadComplaintStatisticsSource: async () => ({
          closures: [],
          lowRatingCaseNos: [],
        }),
        reportPersistenceFailure: vi.fn(),
      };
      const service = new ReportingService(
        ownedMobilityService,
        {
          listComplaintCases: () => [],
          getComplaintTimeline: () => [],
        } as never,
        regulatoryRegistryService,
        undefined,
        controlledRepo as never,
      );
      const result = await service.previewSixMonthOperationsSummary({
        periodMonthFrom: "2026-06",
        periodMonthTo: "2026-11",
        businessArea: "taichung-port",
        serviceProductCode: "taxi_realtime",
      });
      expect(sourceReads).toBe(1);
      expect(snapshotReads).toBe(1);
      expect(result).toHaveLength(1);
      return result[0]!;
    };

    // Boundary counterexample: June [1,0,0,0,0,0] (raw sum 1, monthly rounded 0.17) + July 6 zeros -> raw 1/12 = 0.08 (not 0.09)
    const boundarySummary = await runScenario([1, 0, 0, 0, 0, 0]);
    expect(boundarySummary.validSnapshotCount).toBe(12);
    expect(boundarySummary.expectedSnapshotCount).toBe(
      (30 + 31 + 31 + 30 + 31 + 30) * 24 * 12,
    );
    expect(boundarySummary.averageDispatchableVehicleCount).toBe(0.08);
    expect(boundarySummary.monthlySummaries).toHaveLength(6);
    expect(
      boundarySummary.monthlySummaries?.map((m) => ({
        periodMonth: m.periodMonth,
        validSnapshotCount: m.validSnapshotCount,
        averageDispatchableVehicleCount: m.averageDispatchableVehicleCount,
      })),
    ).toEqual([
      {
        periodMonth: "2026-06",
        validSnapshotCount: 6,
        averageDispatchableVehicleCount: 0.17,
      },
      {
        periodMonth: "2026-07",
        validSnapshotCount: 6,
        averageDispatchableVehicleCount: 0,
      },
      {
        periodMonth: "2026-08",
        validSnapshotCount: 0,
        averageDispatchableVehicleCount: null,
      },
      {
        periodMonth: "2026-09",
        validSnapshotCount: 0,
        averageDispatchableVehicleCount: null,
      },
      {
        periodMonth: "2026-10",
        validSnapshotCount: 0,
        averageDispatchableVehicleCount: null,
      },
      {
        periodMonth: "2026-11",
        validSnapshotCount: 0,
        averageDispatchableVehicleCount: null,
      },
    ]);

    // Divisible control: June [1,1,1,1,1,1] + July 6 zeros -> raw 6/12 = 0.50
    const controlSummary = await runScenario([1, 1, 1, 1, 1, 1]);
    expect(controlSummary.validSnapshotCount).toBe(12);
    expect(controlSummary.averageDispatchableVehicleCount).toBe(0.5);
    expect(
      controlSummary.monthlySummaries?.find((m) => m.periodMonth === "2026-06")
        ?.averageDispatchableVehicleCount,
    ).toBe(1);
    expect(
      controlSummary.monthlySummaries?.find((m) => m.periodMonth === "2026-07")
        ?.averageDispatchableVehicleCount,
    ).toBe(0);
  });
});
