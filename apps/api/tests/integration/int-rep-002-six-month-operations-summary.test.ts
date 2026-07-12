import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

import { EventEmitter2 } from "@nestjs/event-emitter";

import { OpsDispatchEventsService } from "../../src/common/ops-dispatch-events.service";
import { AuditNotificationService } from "../../src/modules/audit-notification/audit-notification.service";
import { CallcenterService } from "../../src/modules/callcenter/callcenter.service";
import { ComplaintService } from "../../src/modules/complaint/complaint.service";
import { DriverProfileService } from "../../src/modules/driver-profile/driver-profile.service";
import { OwnedMobilityService } from "../../src/modules/owned-mobility/owned-mobility.service";
import { OwnedMobilityTaskEventsService } from "../../src/modules/owned-mobility/owned-mobility-task-events.service";
import { RegulatoryRegistryService } from "../../src/modules/regulatory-registry/regulatory-registry.service";
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
  const driverProfileService = new DriverProfileService(auditNotificationService);
  const regulatoryRegistryRepository = {
    isEnabled: () => true,
    upsertDriverLocation: async () => true,
  };
  const regulatoryRegistryService = new RegulatoryRegistryService(
    opsDispatchEventsService,
    auditNotificationService,
    driverProfileService,
    regulatoryRegistryRepository as never,
  );
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
    ownedMobilityService.assignDispatch(
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
    ownedMobilityService.assignDispatch(
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

    const januaryRebuild = await reportingService.rebuildMonthlyOperationsSummaries(
      { periodMonth: "2026-01" },
    );
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
        format: "json",
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
        businessArea: "taichung-port",
        serviceProductCode: "taxi_realtime",
        demandRequestCount: 2,
        complaintCount: 2,
      }),
    ]);
  });
});
