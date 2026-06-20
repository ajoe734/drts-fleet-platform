import { afterEach, describe, expect, it } from "vitest";

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

function flushBackgroundWork() {
  return new Promise((resolve) => setTimeout(resolve, 0));
}

function createHarness() {
  const eventEmitter = new EventEmitter2();
  const auditNotificationService = new AuditNotificationService();
  const opsDispatchEventsService = new OpsDispatchEventsService(eventEmitter);
  const driverProfileService = new DriverProfileService(auditNotificationService);
  const regulatoryRegistryService = new RegulatoryRegistryService(
    opsDispatchEventsService,
    auditNotificationService,
    driverProfileService,
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
  const reportingService = new ReportingService(
    ownedMobilityService,
    complaintService,
    regulatoryRegistryService,
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

  return {
    ownedMobilityService,
    complaintService,
    reportingService,
    reportingFilingService,
    cleanup: async () => {
      await ownedMobilityTaskEventsService.onModuleDestroy();
      await opsDispatchEventsService.onModuleDestroy();
    },
  };
}

describe("INT-REP-001 daily record joins dispatch/task data", () => {
  const cleanups: Array<() => Promise<void>> = [];

  afterEach(async () => {
    while (cleanups.length > 0) {
      await cleanups.pop()?.();
    }
  });

  it("rebuilds one row per order from dispatch, assignment, task, and complaint facts", async () => {
    const {
      ownedMobilityService,
      complaintService,
      reportingService,
      reportingFilingService,
      cleanup,
    } = createHarness();
    cleanups.push(cleanup);

    const completedOrder = ownedMobilityService.createCallCenterOrder({
      callId: "call-int-rep-001",
      agentId: "ops-agent-001",
      recordingId: "rec-int-rep-001",
      pickup: { address: "Taipei Main Station" },
      dropoff: { address: "Songshan Airport" },
      passenger: { name: "Rider One", phone: "0911000001" },
      notes: "integration complete path",
    });
    const firstDispatch = ownedMobilityService.dispatchOrder(
      completedOrder.orderId,
      { mode: "auto" },
      "req-int-rep-dispatch-001",
    );
    ownedMobilityService.assignDispatch(
      {
        dispatchJobId: firstDispatch.dispatchJobId,
        vehicleId: "veh-demo-001",
        driverId: "drv-demo-001",
      },
      "req-int-rep-assign-001",
    );
    const completedTask = ownedMobilityService
      .getReportingSnapshot()
      .driverTasks.find((task) => task.orderId === completedOrder.orderId);
    expect(completedTask).toBeDefined();
    ownedMobilityService.acceptDriverTask(
      completedTask!.taskId,
      { acceptedAt: "2026-06-20T01:00:00.000Z" },
      "req-int-rep-accept-001",
    );
    ownedMobilityService.departDriverTask(
      completedTask!.taskId,
      { departedAt: "2026-06-20T01:05:00.000Z" },
      "req-int-rep-depart-001",
    );
    ownedMobilityService.arrivedPickup(
      completedTask!.taskId,
      { arrivedAt: "2026-06-20T01:12:00.000Z" },
      "req-int-rep-arrive-001",
    );
    ownedMobilityService.startDriverTask(
      completedTask!.taskId,
      { startedAt: "2026-06-20T01:15:00.000Z" },
      "req-int-rep-start-001",
    );
    ownedMobilityService.completeDriverTask(
      completedTask!.taskId,
      {
        completedAt: "2026-06-20T01:40:00.000Z",
        actualDistanceKm: 12.4,
        actualDurationSec: 1500,
      },
      "req-int-rep-complete-001",
    );
    complaintService.createComplaintCase({
      caseSource: "ops_console",
      relatedOrderId: completedOrder.orderId,
      category: "late_arrival",
      severity: "normal",
      description: "Late pickup follow-up",
    });

    const redispatchedOrder = ownedMobilityService.createCallCenterOrder({
      callId: "call-int-rep-002",
      agentId: "ops-agent-002",
      recordingId: "rec-int-rep-002",
      pickup: { address: "Banqiao Station" },
      dropoff: { address: "Taoyuan Airport" },
      passenger: { name: "Rider Two", phone: "0911000002" },
      notes: "integration redispatch path",
    });
    const secondDispatch = ownedMobilityService.dispatchOrder(
      redispatchedOrder.orderId,
      { mode: "auto" },
      "req-int-rep-dispatch-002",
    );
    ownedMobilityService.assignDispatch(
      {
        dispatchJobId: secondDispatch.dispatchJobId,
        vehicleId: "veh-demo-001",
        driverId: "drv-demo-001",
      },
      "req-int-rep-assign-002",
    );
    const redispatchResult = ownedMobilityService.redispatchOrder(
      redispatchedOrder.orderId,
      {
        reasonCode: "operator_redispatch",
        operatorId: "ops-supervisor-001",
      },
      "req-int-rep-redispatch-001",
    );
    ownedMobilityService.assignDispatch(
      {
        dispatchJobId: redispatchResult.dispatchJobId,
        vehicleId: "veh-demo-001",
        driverId: "drv-demo-001",
      },
      "req-int-rep-assign-003",
    );
    ownedMobilityService.cancelOwnedOrder(
      redispatchedOrder.orderId,
      { reason: "passenger_cancelled" },
      "req-int-rep-cancel-001",
    );

    const serviceDate = completedOrder.createdAt.slice(0, 10);
    const rebuild = await reportingService.rebuildDailyDispatchRecords({
      serviceDate,
    });
    expect(rebuild.rebuiltCount).toBe(2);

    const records = await reportingService.listDailyDispatchRecords({
      serviceDate,
    });
    expect(records).toHaveLength(2);

    const completedRecord = records.find(
      (record) => record.orderId === completedOrder.orderId,
    );
    const redispatchedRecord = records.find(
      (record) => record.orderId === redispatchedOrder.orderId,
    );

    expect(completedRecord).toMatchObject({
      serviceDate,
      orderId: completedOrder.orderId,
      orderSource: "phone",
      firstDispatchAt: expect.any(String),
      finalDriverId: "drv-demo-001",
      finalVehicleId: "veh-demo-001",
      finalPlateNo: "ABC-1001",
      arrivedPickupAt: "2026-06-20T01:12:00.000Z",
      tripStartedAt: "2026-06-20T01:15:00.000Z",
      tripCompletedAt: "2026-06-20T01:40:00.000Z",
      finalStatus: "completed",
      redispatchCount: 0,
      complaintCount: 1,
    });
    expect(redispatchedRecord).toMatchObject({
      serviceDate,
      orderId: redispatchedOrder.orderId,
      orderSource: "phone",
      finalDriverId: "drv-demo-001",
      finalVehicleId: "veh-demo-001",
      finalPlateNo: "ABC-1001",
      arrivedPickupAt: null,
      tripStartedAt: null,
      tripCompletedAt: null,
      finalStatus: "cancelled",
      redispatchCount: 1,
      cancellationReason: "passenger_cancelled",
      complaintCount: 0,
    });
    expect(redispatchedRecord?.firstAssignedAt).not.toBeNull();

    const accepted = reportingFilingService.createReportJob(
      {
        jobType: "daily_dispatch_record",
        format: "json",
        filters: { serviceDate },
      },
      "req-int-rep-report-job-001",
    );
    await flushBackgroundWork();

    const reportJob = reportingFilingService.getReportJob(
      accepted.jobId,
      "req-int-rep-report-open-001",
    );
    expect(reportJob.status).toBe("completed");
    expect(reportJob.rows).toHaveLength(2);
    expect(reportJob.rows).toEqual(
      expect.arrayContaining([
        expect.objectContaining({
          orderId: completedOrder.orderId,
          complaintCount: 1,
        }),
        expect.objectContaining({
          orderId: redispatchedOrder.orderId,
          redispatchCount: 1,
          arrivedPickupAt: null,
        }),
      ]),
    );
  });
});
