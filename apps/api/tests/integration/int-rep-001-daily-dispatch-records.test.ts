import { randomUUID } from "node:crypto";
import { afterEach, describe, expect, it, vi } from "vitest";

import { EventEmitter2 } from "@nestjs/event-emitter";
import type { DriverRegistryRecord } from "@drts/contracts";

import { DatabaseService } from "../../src/common/db";
import { OpsDispatchEventsService } from "../../src/common/ops-dispatch-events.service";
import { AuditNotificationService } from "../../src/modules/audit-notification/audit-notification.service";
import { CallcenterService } from "../../src/modules/callcenter/callcenter.service";
import { ComplaintRepository } from "../../src/modules/complaint/complaint.repository";
import { ComplaintService } from "../../src/modules/complaint/complaint.service";
import { DriverProfileService } from "../../src/modules/driver-profile/driver-profile.service";
import { OwnedMobilityRepository } from "../../src/modules/owned-mobility/owned-mobility.repository";
import { OwnedMobilityService } from "../../src/modules/owned-mobility/owned-mobility.service";
import { OwnedMobilityTaskEventsService } from "../../src/modules/owned-mobility/owned-mobility-task-events.service";
import { RegulatoryRegistryService } from "../../src/modules/regulatory-registry/regulatory-registry.service";
import type { PersistRegulatoryRegistryChanges } from "../../src/modules/regulatory-registry/regulatory-registry.repository";
import { ReportingRepository } from "../../src/modules/reporting/reporting.repository";
import { ReportingService } from "../../src/modules/reporting/reporting.service";
import { ReportingFilingService } from "../../src/modules/reporting-filing/reporting-filing.service";
import { VehicleEligibilityService } from "../../src/modules/vehicle-eligibility/vehicle-eligibility.service";
import { MultiTaxiRepository } from "../../src/modules/multi-taxi/multi-taxi.repository";

function flushBackgroundWork() {
  return new Promise((resolve) => setTimeout(resolve, 0));
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

describe("INT-REP-001 daily record joins dispatch/task data", () => {
  const cleanups: Array<() => Promise<void>> = [];

  afterEach(async () => {
    vi.useRealTimers();
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

    // Keep every dispatch mutation in the same millisecond. Source snapshots
    // are newest-first, so reporting must not let a timestamp tie select the
    // superseded assignment as the final trip.
    vi.useFakeTimers();
    vi.setSystemTime(new Date("2026-07-31T00:00:00.000Z"));

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
    await ownedMobilityService.assignDispatch(
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
    await ownedMobilityService.acceptDriverTask(
      completedTask!.taskId,
      { acceptedAt: "2026-06-20T01:00:00.000Z" },
      "req-int-rep-accept-001",
    );
    await ownedMobilityService.departDriverTask(
      completedTask!.taskId,
      { departedAt: "2026-06-20T01:05:00.000Z" },
      "req-int-rep-depart-001",
    );
    await ownedMobilityService.arrivedPickup(
      completedTask!.taskId,
      { arrivedAt: "2026-06-20T01:12:00.000Z" },
      "req-int-rep-arrive-001",
    );
    await ownedMobilityService.startDriverTask(
      completedTask!.taskId,
      { startedAt: "2026-06-20T01:15:00.000Z" },
      "req-int-rep-start-001",
    );
    await ownedMobilityService.completeDriverTask(
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
    await ownedMobilityService.assignDispatch(
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
    await ownedMobilityService.assignDispatch(
      {
        dispatchJobId: redispatchResult.dispatchJobId,
        vehicleId: "veh-demo-001",
        driverId: "drv-demo-001",
      },
      "req-int-rep-assign-003",
    );
    await ownedMobilityService.cancelOwnedOrder(
      redispatchedOrder.orderId,
      { reason: "passenger_cancelled" },
      "req-int-rep-cancel-001",
    );
    vi.useRealTimers();

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
        // Was "json", which is not a value ReportOutputFormat has ever had.
        // Nothing validated `format`, so the test passed on it. This case is
        // about the daily dispatch rows, not the rendering.
        format: "csv",
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

  it("captures supply snapshots with coverage-sensitive source health", async () => {
    const { reportingService, regulatoryRegistryService, cleanup } =
      createHarness();
    cleanups.push(cleanup);

    await regulatoryRegistryService.recordDriverLocation({
      driverId: "drv-demo-001",
      lat: 24.2668,
      lng: 120.6204,
      accuracyM: 25,
      recordedAt: "2026-06-20T01:04:40.000Z",
    });
    await regulatoryRegistryService.recordDriverLocation({
      driverId: "drv-demo-004",
      lat: 24.2668,
      lng: 120.6204,
      accuracyM: 150,
      recordedAt: "2026-06-20T01:04:45.000Z",
    });
    await regulatoryRegistryService.recordDriverLocation({
      driverId: "safety-op-001",
      lat: 24.2668,
      lng: 120.6204,
      accuracyM: 25,
      recordedAt: "2026-06-20T01:04:50.000Z",
    });

    const snapshot = await reportingService.captureDispatchableSupplySnapshot(
      new Date("2026-06-20T01:05:00.000Z"),
    );

    expect(snapshot.snapshotAt).toBe("2026-06-20T01:05:00.000Z");
    expect(snapshot.records).toEqual(
      expect.arrayContaining([
        expect.objectContaining({
          businessArea: "taichung-port",
          serviceProductCode: "taxi_realtime",
          dispatchableVehicleCount: 1,
          availableDriverCount: 1,
          sourceHealth: "complete",
        }),
        expect.objectContaining({
          businessArea: "taichung-port",
          serviceProductCode: "enterprise_dispatch",
          dispatchableVehicleCount: 2,
          availableDriverCount: 2,
          sourceHealth: "location_low_accuracy",
        }),
      ]),
    );
  });

  async function persistCompletedTripWithPairedReservations(
    ownedMobilityRepository: OwnedMobilityRepository,
    acceptedSnapshot: ReturnType<OwnedMobilityService["getReportingSnapshot"]>,
    completedSnapshot: ReturnType<OwnedMobilityService["getReportingSnapshot"]>,
    orderId: string,
  ) {
    const orderFilter = (item: { orderId: string }) => item.orderId === orderId;
    const acceptedAssignments =
      acceptedSnapshot.dispatchAssignments.filter(orderFilter);
    const completedAssignments =
      completedSnapshot.dispatchAssignments.filter(orderFilter);

    await ownedMobilityRepository.withTransaction(async (tx) => {
      await ownedMobilityRepository.persistOrderWorkflow(tx, {
        orders: acceptedSnapshot.orders.filter(orderFilter),
        dispatchJobs: acceptedSnapshot.dispatchJobs.filter(orderFilter),
        dispatchAssignments: acceptedAssignments,
        driverTasks: acceptedSnapshot.driverTasks.filter(orderFilter),
        dispatchTraceLogs:
          acceptedSnapshot.dispatchTraceLogs.filter(orderFilter),
      });
      for (const assignment of acceptedAssignments) {
        await ownedMobilityRepository.reserveDispatchResources(tx, {
          orderId: assignment.orderId,
          assignmentId: assignment.assignmentId,
          driverId: assignment.driverId,
          vehicleId: assignment.vehicleId,
          expiresAt: null,
        });
        await ownedMobilityRepository.occupyDispatchResourceReservations(
          assignment.assignmentId,
          tx,
        );
      }
    });

    await ownedMobilityRepository.withTransaction(async (tx) => {
      await ownedMobilityRepository.persistOrderWorkflow(tx, {
        orders: completedSnapshot.orders.filter(orderFilter),
        dispatchJobs: completedSnapshot.dispatchJobs.filter(orderFilter),
        dispatchAssignments: completedAssignments,
        driverTasks: completedSnapshot.driverTasks.filter(orderFilter),
        dispatchTraceLogs:
          completedSnapshot.dispatchTraceLogs.filter(orderFilter),
      });
      for (const assignment of completedAssignments) {
        await ownedMobilityRepository.releaseDispatchResourceReservations(
          assignment.assignmentId,
          tx,
        );
      }
    });
  }

  it("enforces V0091 paired dispatch_resource_reservations invariant and awaits async completeDriverTask before snapshotting", async () => {
    const {
      ownedMobilityService,
      complaintService,
      regulatoryRegistryService,
      cleanup,
    } = createHarness();
    cleanups.push(cleanup);

    const serviceDate = "2026-08-19";
    vi.useFakeTimers();
    vi.setSystemTime(new Date(`${serviceDate}T02:00:00.000Z`));

    const order = await ownedMobilityService.createCallCenterOrder({
      callId: "call-int-rep-v0091-001",
      agentId: "ops-agent-001",
      recordingId: "rec-int-rep-v0091-001",
      pickup: { address: "Taipei Main Station" },
      dropoff: { address: "Songshan Airport" },
      passenger: { name: "Fence Rider", phone: "0911777001" },
    });
    const dispatch = await ownedMobilityService.dispatchOrder(
      order.orderId,
      { mode: "auto" },
      "req-int-rep-v0091-dispatch",
    );
    await ownedMobilityService.assignDispatch(
      {
        dispatchJobId: dispatch.dispatchJobId,
        vehicleId: "veh-demo-001",
        driverId: "drv-demo-001",
      },
      "req-int-rep-v0091-assign",
    );
    const task = ownedMobilityService
      .getReportingSnapshot()
      .driverTasks.find((item) => item.orderId === order.orderId)!;

    await ownedMobilityService.acceptDriverTask(
      task.taskId,
      { acceptedAt: `${serviceDate}T02:03:00.000Z` },
      "req-int-rep-v0091-accept",
    );
    const acceptedSnapshot = ownedMobilityService.getReportingSnapshot();
    expect(
      acceptedSnapshot.dispatchAssignments.find(
        (item) => item.orderId === order.orderId,
      )?.status,
    ).toBe("accepted");

    await ownedMobilityService.departDriverTask(
      task.taskId,
      { departedAt: `${serviceDate}T02:05:00.000Z` },
      "req-int-rep-v0091-depart",
    );
    await ownedMobilityService.arrivedPickup(
      task.taskId,
      { arrivedAt: `${serviceDate}T02:12:00.000Z` },
      "req-int-rep-v0091-arrive",
    );
    await ownedMobilityService.startDriverTask(
      task.taskId,
      { startedAt: `${serviceDate}T02:15:00.000Z` },
      "req-int-rep-v0091-start",
    );

    // Calling completeDriverTask without awaiting leaves the snapshot in 'accepted'/'on_trip'
    // because captureCompletionIdentity yields before finalizeCompletion mutates status.
    const completionPromise = ownedMobilityService.completeDriverTask(
      task.taskId,
      {
        completedAt: `${serviceDate}T02:40:00.000Z`,
        actualDistanceKm: 12.4,
        actualDurationSec: 1500,
      },
      "req-int-rep-v0091-complete",
    );
    const prematureSnapshot = ownedMobilityService.getReportingSnapshot();
    expect(
      prematureSnapshot.dispatchAssignments.find(
        (item) => item.orderId === order.orderId,
      )?.status,
    ).toBe("accepted");
    expect(
      prematureSnapshot.driverTasks.find(
        (item) => item.orderId === order.orderId,
      )?.status,
    ).toBe("on_trip");

    await completionPromise;
    vi.useRealTimers();

    const completedSnapshot = ownedMobilityService.getReportingSnapshot();
    expect(
      completedSnapshot.dispatchAssignments.find(
        (item) => item.orderId === order.orderId,
      )?.status,
    ).toBe("completed");
    expect(
      completedSnapshot.driverTasks.find(
        (item) => item.orderId === order.orderId,
      )?.status,
    ).toBe("completed");

    // Simulate V0091 deferred commit trigger on ops.phase1_dispatch_assignments + ops.dispatch_resource_reservations
    const assignmentsTable = new Map<
      string,
      {
        assignmentId: string;
        orderId: string;
        status: string;
        driverId: string;
        vehicleId: string;
      }
    >();
    const reservationsTable = new Map<
      string,
      {
        reservationId: string;
        resourceType: string;
        resourceId: string;
        orderId: string;
        assignmentId: string | null;
        reservationGroupId: string;
        status: string;
        version: number;
      }
    >();

    const assertV0091CommitInvariant = () => {
      for (const assignment of assignmentsTable.values()) {
        if (
          assignment.status !== "assigned" &&
          assignment.status !== "accepted"
        ) {
          continue;
        }
        const activeForAssignment = [...reservationsTable.values()].filter(
          (row) =>
            row.assignmentId === assignment.assignmentId &&
            row.orderId === assignment.orderId &&
            (row.status === "held" || row.status === "occupied"),
        );
        const driverRes = activeForAssignment.find(
          (row) =>
            row.resourceType === "driver" &&
            row.resourceId === assignment.driverId,
        );
        const vehicleRes = activeForAssignment.find(
          (row) =>
            row.resourceType === "vehicle" &&
            row.resourceId === assignment.vehicleId &&
            row.reservationGroupId === driverRes?.reservationGroupId,
        );
        if (!driverRes || !vehicleRes) {
          throw new Error(
            `dispatch assignment ${assignment.assignmentId} lacks paired dispatch_resource_reservations; reconcile before releasing capacity`,
          );
        }
      }
    };

    const executeQuery = async (sql: string, params: unknown[] = []) => {
      const normalized = sql.replace(/\s+/g, " ").trim();
      if (
        normalized === "BEGIN" ||
        normalized.startsWith("SET LOCAL ") ||
        normalized === "ROLLBACK"
      ) {
        return { rows: [], rowCount: 0 };
      }
      if (normalized === "COMMIT") {
        assertV0091CommitInvariant();
        return { rows: [], rowCount: 0 };
      }
      if (normalized.includes("INSERT INTO ops.phase1_dispatch_assignments")) {
        const record = JSON.parse(String(params[7])) as {
          driverId: string;
          vehicleId: string;
        };
        assignmentsTable.set(String(params[0]), {
          assignmentId: String(params[0]),
          orderId: String(params[2]),
          status: String(params[4]),
          driverId: record.driverId,
          vehicleId: record.vehicleId,
        });
        return { rows: [], rowCount: 1 };
      }
      if (
        normalized.includes("INSERT INTO ops.dispatch_resource_reservations")
      ) {
        const reservationId = randomUUID();
        const row = {
          reservationId,
          resourceType: String(params[0]),
          resourceId: String(params[1]),
          orderId: String(params[2]),
          assignmentId: params[3] ? String(params[3]) : null,
          reservationGroupId: String(params[4]),
          status: "held",
          version: 1,
        };
        reservationsTable.set(reservationId, row);
        return {
          rows: [
            {
              reservation_id: row.reservationId,
              resource_type: row.resourceType,
              resource_id: row.resourceId,
              order_id: row.orderId,
              assignment_id: row.assignmentId,
              reservation_group_id: row.reservationGroupId,
              status: row.status,
              expires_at: null,
              version: row.version,
              created_at: `${serviceDate}T02:03:00.000Z`,
              updated_at: `${serviceDate}T02:03:00.000Z`,
            },
          ],
          rowCount: 1,
        };
      }
      if (
        normalized.includes(
          "UPDATE ops.dispatch_resource_reservations SET status = 'occupied'",
        )
      ) {
        const assignmentId = String(params[0]);
        let count = 0;
        for (const row of reservationsTable.values()) {
          if (row.assignmentId === assignmentId && row.status === "held") {
            row.status = "occupied";
            row.version += 1;
            count += 1;
          }
        }
        return { rows: [], rowCount: count };
      }
      if (
        normalized.includes(
          "UPDATE ops.dispatch_resource_reservations SET status = 'released'",
        )
      ) {
        const assignmentId = String(params[0]);
        let count = 0;
        for (const row of reservationsTable.values()) {
          if (
            row.assignmentId === assignmentId &&
            (row.status === "held" || row.status === "occupied")
          ) {
            row.status = "released";
            row.version += 1;
            count += 1;
          }
        }
        return { rows: [], rowCount: count };
      }
      return { rows: [], rowCount: 1 };
    };

    const mockDb = {
      isEnabled: () => true,
      query: async (sql: string, params?: unknown[]) => {
        const res = await executeQuery(sql, params);
        // Autocommit query checks deferred constraint immediately after statement
        assertV0091CommitInvariant();
        return res;
      },
      connect: async () => ({
        query: executeQuery,
        release: () => undefined,
      }),
    };
    const repo = new OwnedMobilityRepository(mockDb as never);

    // Old bare persistChanges with premature unawaited snapshot fails V0091 invariant
    await expect(
      repo.persistChanges({
        orders: prematureSnapshot.orders.filter(
          (item) => item.orderId === order.orderId,
        ),
        dispatchJobs: prematureSnapshot.dispatchJobs.filter(
          (item) => item.orderId === order.orderId,
        ),
        dispatchAssignments: prematureSnapshot.dispatchAssignments.filter(
          (item) => item.orderId === order.orderId,
        ),
        driverTasks: prematureSnapshot.driverTasks.filter(
          (item) => item.orderId === order.orderId,
        ),
      }),
    ).rejects.toThrow(
      /lacks paired dispatch_resource_reservations; reconcile before releasing capacity/,
    );

    assignmentsTable.clear();
    reservationsTable.clear();

    // Fixed two-phase transactional persistence with paired reservations + awaited completion succeeds
    await persistCompletedTripWithPairedReservations(
      repo,
      acceptedSnapshot,
      completedSnapshot,
      order.orderId,
    );
    expect([...assignmentsTable.values()][0]?.status).toBe("completed");
    expect(
      [...reservationsTable.values()].every((row) => row.status === "released"),
    ).toBe(true);
    expect(reservationsTable.size).toBe(2);

    // Verify ReportingService.listDailyDispatchRecords normalizes node-postgres DATE (OID 1082) Date instances to YYYY-MM-DD
    const pgDateDb = {
      isEnabled: () => true,
      query: async () => ({
        rows: [
          {
            service_date: new Date(2026, 7, 19, 0, 0, 0, 0) as unknown as string,
            order_id: order.orderId,
            order_no: order.orderNo,
            order_source: "phone" as const,
            tenant_id: null,
            partner_id: null,
            service_product_code: "taxi_realtime",
            requested_at: new Date(`${serviceDate}T02:00:00.000Z`),
            reservation_time: null,
            pickup_address_snapshot: "Taipei Main Station",
            dropoff_address_snapshot: "Songshan Airport",
            first_dispatch_at: new Date(`${serviceDate}T02:00:00.000Z`),
            first_assigned_at: new Date(`${serviceDate}T02:01:00.000Z`),
            final_driver_id: "drv-demo-001",
            final_vehicle_id: "veh-demo-001",
            final_plate_no: "ABC-1001",
            eta_seconds_at_assignment: 300,
            arrived_pickup_at: new Date(`${serviceDate}T02:12:00.000Z`),
            trip_started_at: new Date(`${serviceDate}T02:15:00.000Z`),
            trip_completed_at: new Date(`${serviceDate}T02:40:00.000Z`),
            final_status: "completed",
            redispatch_count: 0,
            cancellation_reason: null,
            complaint_count: 1,
            generated_at: new Date(`${serviceDate}T02:45:00.000Z`),
          },
        ],
      }),
    };
    const pgDateReader = new ReportingService(
      ownedMobilityService,
      complaintService,
      regulatoryRegistryService,
      undefined,
      new ReportingRepository(pgDateDb as never),
    );
    const pgDateReadback = await pgDateReader.listDailyDispatchRecords({
      serviceDate,
      orderId: order.orderId,
    });
    expect(pgDateReadback).toHaveLength(1);
    expect(pgDateReadback[0]?.serviceDate).toBe(serviceDate);
  });

  it("reconciles persisted legacy UTC-day daily_dispatch_records rows through real ReportingRepository and ReportingService with per-order transactional rollback on failure", async () => {
    const {
      ownedMobilityService,
      complaintService,
      regulatoryRegistryService,
      cleanup,
    } = createHarness();
    cleanups.push(cleanup);

    vi.useFakeTimers();
    vi.setSystemTime(new Date("2026-10-24T17:00:00.000Z"));
    const taipeiMidnightOrder = await ownedMobilityService.createCallCenterOrder({
      callId: "call-int-rep-rekey-unit-001",
      agentId: "ops-agent-001",
      recordingId: "rec-int-rep-rekey-unit-001",
      pickup: { address: "Taipei Main Station" },
      dropoff: { address: "Banqiao Station" },
      passenger: { name: "Taipei Midnight Rider", phone: "0911666001" },
    });

    vi.setSystemTime(new Date("2026-10-24T02:00:00.000Z"));
    const sameDayControlOrder = await ownedMobilityService.createCallCenterOrder({
      callId: "call-int-rep-rekey-unit-002",
      agentId: "ops-agent-001",
      recordingId: "rec-int-rep-rekey-unit-002",
      pickup: { address: "Ximen Station" },
      dropoff: { address: "Songshan Airport" },
      passenger: { name: "Control Day Rider", phone: "0911666002" },
    });
    vi.useRealTimers();

    const snapshot = ownedMobilityService.getReportingSnapshot();

    type StoredDailyRow = {
      service_date: string;
      order_id: string;
      order_no: string;
      order_source: string;
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

    const committedDailyTable = new Map<string, StoredDailyRow>();
    const seedLegacyUtcRow = () => {
      committedDailyTable.set(`2026-10-24:${taipeiMidnightOrder.orderId}`, {
        service_date: "2026-10-24",
        order_id: taipeiMidnightOrder.orderId,
        order_no: taipeiMidnightOrder.orderNo,
        order_source: "phone",
        tenant_id: taipeiMidnightOrder.tenantId,
        partner_id: taipeiMidnightOrder.partnerId,
        service_product_code: "taxi_realtime",
        requested_at: "2026-10-24T17:00:00.000Z",
        reservation_time: taipeiMidnightOrder.reservationWindowStart,
        pickup_address_snapshot: "Taipei Main Station",
        dropoff_address_snapshot: "Banqiao Station",
        first_dispatch_at: null,
        first_assigned_at: null,
        final_driver_id: null,
        final_vehicle_id: null,
        final_plate_no: null,
        eta_seconds_at_assignment: null,
        arrived_pickup_at: null,
        trip_started_at: null,
        trip_completed_at: null,
        final_status: "pending_review",
        redispatch_count: 0,
        cancellation_reason: null,
        complaint_count: 0,
        generated_at: "2026-10-24T17:01:00.000Z",
      });
      committedDailyTable.set(`2026-10-24:${sameDayControlOrder.orderId}`, {
        service_date: "2026-10-24",
        order_id: sameDayControlOrder.orderId,
        order_no: sameDayControlOrder.orderNo,
        order_source: "phone",
        tenant_id: sameDayControlOrder.tenantId,
        partner_id: sameDayControlOrder.partnerId,
        service_product_code: "taxi_realtime",
        requested_at: "2026-10-24T02:00:00.000Z",
        reservation_time: sameDayControlOrder.reservationWindowStart,
        pickup_address_snapshot: "Ximen Station",
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
        final_status: "pending_review",
        redispatch_count: 0,
        cancellation_reason: null,
        complaint_count: 0,
        generated_at: "2026-10-24T02:01:00.000Z",
      });
    };
    seedLegacyUtcRow();

    let failNextDelete = false;
    const toTaipeiDay = (iso: string) =>
      new Intl.DateTimeFormat("en-CA", {
        timeZone: "Asia/Taipei",
        year: "numeric",
        month: "2-digit",
        day: "2-digit",
      }).format(new Date(iso));

    const executeOnTable = (
      table: Map<string, StoredDailyRow>,
      sql: string,
      params: unknown[] = [],
    ) => {
      const normalized = sql.replace(/\s+/g, " ").trim();
      if (normalized.includes("FROM ops.phase1_owned_orders")) {
        return {
          rows: snapshot.orders.map((record) => ({
            record: structuredClone(record),
          })),
          rowCount: snapshot.orders.length,
        };
      }
      if (
        normalized.includes("FROM ops.phase1_dispatch_jobs") ||
        normalized.includes("FROM ops.phase1_dispatch_assignments") ||
        normalized.includes("FROM ops.phase1_driver_tasks") ||
        normalized.includes("FROM ops.phase1_dispatch_trace_logs") ||
        normalized.includes("FROM crm.phase1_complaint_cases")
      ) {
        return { rows: [], rowCount: 0 };
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
              order_source: String(params[3]),
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
        if (failNextDelete) {
          failNextDelete = false;
          throw new Error("simulated failure during stale day-key delete");
        }
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

    const transactionalDb = {
      isEnabled: () => true,
      query: async (sql: string, params?: unknown[]) =>
        executeOnTable(committedDailyTable, sql, params),
      connect: async () => {
        let workingCopy: Map<string, StoredDailyRow> | null = null;
        return {
          query: async (sql: string, params?: unknown[]) => {
            const normalized = sql.trim();
            if (normalized === "BEGIN") {
              workingCopy = new Map(structuredClone([...committedDailyTable]));
              return { rows: [], rowCount: 0 };
            }
            if (normalized === "COMMIT") {
              if (workingCopy) {
                committedDailyTable.clear();
                for (const [k, v] of workingCopy) {
                  committedDailyTable.set(k, v);
                }
                workingCopy = null;
              }
              return { rows: [], rowCount: 0 };
            }
            if (normalized === "ROLLBACK") {
              workingCopy = null;
              return { rows: [], rowCount: 0 };
            }
            if (normalized.includes("pg_advisory_xact_lock")) {
              return { rows: [], rowCount: 0 };
            }
            return executeOnTable(
              workingCopy ?? committedDailyTable,
              sql,
              params,
            );
          },
          release: () => undefined,
        };
      },
    };

    const repository = new ReportingRepository(transactionalDb as never);
    const service = new ReportingService(
      {
        getReportingSnapshot: () => {
          throw new Error("forbidden memory fallback");
        },
      } as never,
      {
        listComplaintCases: () => {
          throw new Error("forbidden memory fallback");
        },
      } as never,
      regulatoryRegistryService,
      undefined,
      repository,
    );

    // 1. Failed per-order rekey rolls back the transaction and preserves the prior durable 2026-10-24 row without creating a duplicate on 2026-10-25
    failNextDelete = true;
    await expect(
      service.rebuildDailyDispatchRecords({
        serviceDate: "2026-10-25",
        orderId: taipeiMidnightOrder.orderId,
      }),
    ).rejects.toMatchObject({
      status: 503,
      code: "REPORT_REBUILD_FAILED",
    });
    expect(
      committedDailyTable.has(`2026-10-24:${taipeiMidnightOrder.orderId}`),
    ).toBe(true);
    expect(
      committedDailyTable.has(`2026-10-25:${taipeiMidnightOrder.orderId}`),
    ).toBe(false);
    expect(
      committedDailyTable.has(`2026-10-24:${sameDayControlOrder.orderId}`),
    ).toBe(true);

    // 2. Retry succeeds idempotently: moves affected order to 2026-10-25, removes old 2026-10-24 key, preserves unrelated 2026-10-24 order
    const rebuilt = await service.rebuildDailyDispatchRecords({
      serviceDate: "2026-10-25",
      orderId: taipeiMidnightOrder.orderId,
    });
    expect(rebuilt.rebuiltCount).toBe(1);
    expect(rebuilt.records[0]?.serviceDate).toBe("2026-10-25");
    expect(
      committedDailyTable.has(`2026-10-24:${taipeiMidnightOrder.orderId}`),
    ).toBe(false);
    expect(
      committedDailyTable.has(`2026-10-25:${taipeiMidnightOrder.orderId}`),
    ).toBe(true);
    expect(
      committedDailyTable.has(`2026-10-24:${sameDayControlOrder.orderId}`),
    ).toBe(true);

    // 3. Out-of-order older rebuild does not overwrite a newer persisted record
    await repository.upsertDailyDispatchRecords([
      {
        ...rebuilt.records[0]!,
        finalStatus: "assigned",
        generatedAt: "2026-10-24T16:59:00.000Z",
      },
    ]);
    expect(
      committedDailyTable.get(`2026-10-25:${taipeiMidnightOrder.orderId}`)
        ?.final_status,
    ).toBe("ready_for_dispatch");

    // 4. Read-path cutover also reconciles a legacy UTC-keyed row directly
    committedDailyTable.clear();
    seedLegacyUtcRow();
    const readCutover = await service.listDailyDispatchRecords({
      serviceDate: "2026-10-25",
      orderId: taipeiMidnightOrder.orderId,
    });
    expect(readCutover).toHaveLength(1);
    expect(readCutover[0]?.serviceDate).toBe("2026-10-25");
    expect(
      committedDailyTable.has(`2026-10-24:${taipeiMidnightOrder.orderId}`),
    ).toBe(false);
    expect(
      committedDailyTable.has(`2026-10-25:${taipeiMidnightOrder.orderId}`),
    ).toBe(true);
  });

  // Official migrated PostgreSQL schema persistence and readback check.
  // Runs in authorized CI (product_api_unit after pnpm db:migrate) and skips on
  // the local VM where starting PostgreSQL/Docker is prohibited.
  it.skipIf(!process.env.DATABASE_URL)(
    "persists canonical daily dispatch records to reporting.dispatch_daily_records and reads back idempotently on the official PostgreSQL schema",
    async () => {
      const {
        ownedMobilityService,
        complaintService,
        regulatoryRegistryService,
        cleanup,
      } = createHarness();
      cleanups.push(cleanup);

      const database = new DatabaseService();
      cleanups.push(async () => {
        await database.onModuleDestroy();
      });
      const multiTaxiRepository = new MultiTaxiRepository(database);
      const ownedMobilityRepository = new OwnedMobilityRepository(
        database,
        multiTaxiRepository,
      );
      const complaintRepository = new ComplaintRepository(database);
      const reportingRepository = new ReportingRepository(database);

      const runId = randomUUID().slice(0, 8);
      const serviceDate = "2026-08-19";
      vi.useFakeTimers();
      vi.setSystemTime(new Date(`${serviceDate}T02:00:00.000Z`));

      const completedOrder = await ownedMobilityService.createCallCenterOrder({
        callId: `call-int-rep-pg-001-${runId}`,
        agentId: "ops-agent-001",
        recordingId: `rec-int-rep-pg-001-${runId}`,
        pickup: { address: "Taipei Main Station" },
        dropoff: { address: "Songshan Airport" },
        passenger: { name: "PG Rider One", phone: "0911888001" },
        notes: "pg daily persistence happy path",
      });
      const firstDispatch = await ownedMobilityService.dispatchOrder(
        completedOrder.orderId,
        { mode: "auto" },
        `req-int-rep-pg-dispatch-${runId}`,
      );
      await ownedMobilityService.assignDispatch(
        {
          dispatchJobId: firstDispatch.dispatchJobId,
          vehicleId: "veh-demo-001",
          driverId: "drv-demo-001",
        },
        `req-int-rep-pg-assign-${runId}`,
      );
      const completedTask = ownedMobilityService
        .getReportingSnapshot()
        .driverTasks.find((task) => task.orderId === completedOrder.orderId)!;
      await ownedMobilityService.acceptDriverTask(
        completedTask.taskId,
        { acceptedAt: `${serviceDate}T02:03:00.000Z` },
        `req-int-rep-pg-accept-${runId}`,
      );
      const acceptedSnapshot = ownedMobilityService.getReportingSnapshot();
      await ownedMobilityService.departDriverTask(
        completedTask.taskId,
        { departedAt: `${serviceDate}T02:05:00.000Z` },
        `req-int-rep-pg-depart-${runId}`,
      );
      await ownedMobilityService.arrivedPickup(
        completedTask.taskId,
        { arrivedAt: `${serviceDate}T02:12:00.000Z` },
        `req-int-rep-pg-arrive-${runId}`,
      );
      await ownedMobilityService.startDriverTask(
        completedTask.taskId,
        { startedAt: `${serviceDate}T02:15:00.000Z` },
        `req-int-rep-pg-start-${runId}`,
      );
      await ownedMobilityService.completeDriverTask(
        completedTask.taskId,
        {
          completedAt: `${serviceDate}T02:40:00.000Z`,
          actualDistanceKm: 12.4,
          actualDurationSec: 1500,
        },
        `req-int-rep-pg-complete-${runId}`,
      );
      const complaintCase = complaintService.createComplaintCase({
        caseSource: "ops_console",
        relatedOrderId: completedOrder.orderId,
        category: "late_arrival",
        severity: "normal",
        description: "PG late pickup follow-up",
      });
      vi.useRealTimers();

      const completedSnapshot = ownedMobilityService.getReportingSnapshot();

      try {
        await persistCompletedTripWithPairedReservations(
          ownedMobilityRepository,
          acceptedSnapshot,
          completedSnapshot,
          completedOrder.orderId,
        );
        await complaintRepository.persistChanges({
          complaintCases: [complaintCase],
        });

        // Fresh writer ReportingService bound to PostgreSQL; memory fallback is forbidden.
        const memoryFallbackSpy = vi.fn(() => {
          throw new Error("unexpected fallback to in-memory snapshot");
        });
        const writerService = new ReportingService(
          { getReportingSnapshot: memoryFallbackSpy } as never,
          { listComplaintCases: memoryFallbackSpy } as never,
          regulatoryRegistryService,
          undefined,
          reportingRepository,
        );

        const firstRebuild = await writerService.rebuildDailyDispatchRecords({
          serviceDate,
          orderId: completedOrder.orderId,
        });
        expect(firstRebuild.rebuiltCount).toBe(1);
        expect(memoryFallbackSpy).not.toHaveBeenCalled();

        // Separate reader ReportingService instance reads back from reporting.dispatch_daily_records
        const readerService = new ReportingService(
          { getReportingSnapshot: memoryFallbackSpy } as never,
          { listComplaintCases: memoryFallbackSpy } as never,
          regulatoryRegistryService,
          undefined,
          reportingRepository,
        );
        const readback = await readerService.listDailyDispatchRecords({
          serviceDate,
          orderId: completedOrder.orderId,
        });
        expect(readback).toHaveLength(1);
        expect(readback[0]).toMatchObject({
          serviceDate,
          orderId: completedOrder.orderId,
          orderNo: completedOrder.orderNo,
          orderSource: "phone",
          finalDriverId: "drv-demo-001",
          finalVehicleId: "veh-demo-001",
          finalPlateNo: "ABC-1001",
          arrivedPickupAt: `${serviceDate}T02:12:00.000Z`,
          tripStartedAt: `${serviceDate}T02:15:00.000Z`,
          tripCompletedAt: `${serviceDate}T02:40:00.000Z`,
          finalStatus: "completed",
          redispatchCount: 0,
          complaintCount: 1,
        });

        // Idempotent rerun on the same (service_date, order_id) updates in place without duplicating
        const secondRebuild = await writerService.rebuildDailyDispatchRecords({
          serviceDate,
          orderId: completedOrder.orderId,
        });
        expect(secondRebuild.rebuiltCount).toBe(1);
        const afterRerun = await readerService.listDailyDispatchRecords({
          serviceDate,
          orderId: completedOrder.orderId,
        });
        expect(afterRerun).toHaveLength(1);
        expect(afterRerun[0]?.orderId).toBe(completedOrder.orderId);
      } finally {
        await database.query(
          "DELETE FROM reporting.dispatch_daily_records WHERE order_id = $1",
          [completedOrder.orderId],
        );
        await database.query(
          "DELETE FROM crm.phase1_complaint_cases WHERE case_no = $1",
          [complaintCase.caseNo],
        );
        await database.query(
          "UPDATE ops.phase1_dispatch_assignments SET status = 'cancelled' WHERE order_id = $1 AND status IN ('assigned', 'accepted')",
          [completedOrder.orderId],
        );
        await database.query(
          "DELETE FROM ops.dispatch_resource_reservations WHERE order_id = $1",
          [completedOrder.orderId],
        );
        await database.query(
          "DELETE FROM ops.phase1_dispatch_trace_logs WHERE order_id = $1",
          [completedOrder.orderId],
        );
        await database.query(
          "DELETE FROM ops.phase1_driver_tasks WHERE order_id = $1",
          [completedOrder.orderId],
        );
        await database.query(
          "DELETE FROM ops.phase1_dispatch_assignments WHERE order_id = $1",
          [completedOrder.orderId],
        );
        await database.query(
          "DELETE FROM ops.phase1_dispatch_jobs WHERE order_id = $1",
          [completedOrder.orderId],
        );
        await database.query(
          "DELETE FROM ops.phase1_owned_orders WHERE order_id = $1",
          [completedOrder.orderId],
        );
      }
    },
  );

  it.skipIf(!process.env.DATABASE_URL)(
    "reconciles legacy UTC-keyed reporting.dispatch_daily_records rows to the Asia/Taipei service day without old-day duplicates and rolls back failed rekeys on the official PostgreSQL schema",
    async () => {
      const {
        ownedMobilityService,
        complaintService,
        regulatoryRegistryService,
        cleanup,
      } = createHarness();
      cleanups.push(cleanup);

      const database = new DatabaseService();
      cleanups.push(async () => {
        await database.onModuleDestroy();
      });
      const multiTaxiRepository = new MultiTaxiRepository(database);
      const ownedMobilityRepository = new OwnedMobilityRepository(
        database,
        multiTaxiRepository,
      );
      const complaintRepository = new ComplaintRepository(database);
      const reportingRepository = new ReportingRepository(database);

      const runId = randomUUID().slice(0, 8);
      const legacyUtcDay = "2026-10-24";
      const taipeiServiceDay = "2026-10-25";

      // 1. Create a completed order at 2026-10-24T17:00:00.000Z (legacy UTC day 2026-10-24, Asia/Taipei day 2026-10-25)
      vi.useFakeTimers();
      vi.setSystemTime(new Date("2026-10-24T17:00:00.000Z"));
      const taipeiMidnightOrder =
        await ownedMobilityService.createCallCenterOrder({
          callId: `call-int-rep-pg-rekey-${runId}`,
          agentId: "ops-agent-001",
          recordingId: `rec-int-rep-pg-rekey-${runId}`,
          pickup: { address: "Taipei Main Station" },
          dropoff: { address: "Songshan Airport" },
          passenger: { name: "PG Taipei Midnight Rider", phone: "0911999001" },
          notes: "pg legacy utc day-key reconciliation",
        });
      const dispatch = await ownedMobilityService.dispatchOrder(
        taipeiMidnightOrder.orderId,
        { mode: "auto" },
        `req-int-rep-pg-rekey-dispatch-${runId}`,
      );
      await ownedMobilityService.assignDispatch(
        {
          dispatchJobId: dispatch.dispatchJobId,
          vehicleId: "veh-demo-001",
          driverId: "drv-demo-001",
        },
        `req-int-rep-pg-rekey-assign-${runId}`,
      );
      const task = ownedMobilityService
        .getReportingSnapshot()
        .driverTasks.find(
          (item) => item.orderId === taipeiMidnightOrder.orderId,
        )!;
      await ownedMobilityService.acceptDriverTask(
        task.taskId,
        { acceptedAt: "2026-10-24T17:03:00.000Z" },
        `req-int-rep-pg-rekey-accept-${runId}`,
      );
      const acceptedSnapshot = ownedMobilityService.getReportingSnapshot();
      await ownedMobilityService.departDriverTask(
        task.taskId,
        { departedAt: "2026-10-24T17:05:00.000Z" },
        `req-int-rep-pg-rekey-depart-${runId}`,
      );
      await ownedMobilityService.arrivedPickup(
        task.taskId,
        { arrivedAt: "2026-10-24T17:12:00.000Z" },
        `req-int-rep-pg-rekey-arrive-${runId}`,
      );
      await ownedMobilityService.startDriverTask(
        task.taskId,
        { startedAt: "2026-10-24T17:15:00.000Z" },
        `req-int-rep-pg-rekey-start-${runId}`,
      );
      await ownedMobilityService.completeDriverTask(
        task.taskId,
        {
          completedAt: "2026-10-24T17:40:00.000Z",
          actualDistanceKm: 11.8,
          actualDurationSec: 1500,
        },
        `req-int-rep-pg-rekey-complete-${runId}`,
      );
      const complaintCase = complaintService.createComplaintCase({
        caseSource: "ops_console",
        relatedOrderId: taipeiMidnightOrder.orderId,
        category: "late_arrival",
        severity: "normal",
        description: "PG Taipei day rekey complaint",
      });

      // 2. Create an unrelated order on 2026-10-24T02:00:00.000Z (both UTC and Asia/Taipei day 2026-10-24)
      vi.setSystemTime(new Date("2026-10-24T02:00:00.000Z"));
      const controlDay24Order =
        await ownedMobilityService.createCallCenterOrder({
          callId: `call-int-rep-pg-ctrl-${runId}`,
          agentId: "ops-agent-001",
          recordingId: `rec-int-rep-pg-ctrl-${runId}`,
          pickup: { address: "Banqiao Station" },
          dropoff: { address: "Ximen Station" },
          passenger: { name: "PG Control Day 24 Rider", phone: "0911999002" },
          notes: "pg unrelated day 24 control",
        });
      vi.useRealTimers();

      const completedSnapshot = ownedMobilityService.getReportingSnapshot();

      const insertLegacyUtcRow = async () => {
        await database.query(
          `
            INSERT INTO reporting.dispatch_daily_records (
              service_date,
              order_id,
              order_no,
              order_source,
              tenant_id,
              partner_id,
              service_product_code,
              requested_at,
              reservation_time,
              pickup_address_snapshot,
              dropoff_address_snapshot,
              first_dispatch_at,
              first_assigned_at,
              final_driver_id,
              final_vehicle_id,
              final_plate_no,
              eta_seconds_at_assignment,
              arrived_pickup_at,
              trip_started_at,
              trip_completed_at,
              final_status,
              redispatch_count,
              cancellation_reason,
              complaint_count,
              generated_at
            ) VALUES (
              $1::date, $2, $3, 'phone', $4, $5, 'taxi_realtime',
              '2026-10-24T17:00:00.000Z'::timestamptz,
              $6::timestamptz,
              'Taipei Main Station',
              'Songshan Airport',
              '2026-10-24T17:00:00.000Z'::timestamptz,
              '2026-10-24T17:00:00.000Z'::timestamptz,
              'drv-demo-001',
              'veh-demo-001',
              'ABC-1001',
              300,
              '2026-10-24T17:12:00.000Z'::timestamptz,
              '2026-10-24T17:15:00.000Z'::timestamptz,
              '2026-10-24T17:40:00.000Z'::timestamptz,
              'completed',
              0,
              NULL,
              1,
              '2026-10-24T17:45:00.000Z'::timestamptz
            )
            ON CONFLICT (service_date, order_id) DO UPDATE SET
              generated_at = EXCLUDED.generated_at
          `,
          [
            legacyUtcDay,
            taipeiMidnightOrder.orderId,
            taipeiMidnightOrder.orderNo,
            taipeiMidnightOrder.tenantId,
            taipeiMidnightOrder.partnerId,
            taipeiMidnightOrder.reservationWindowStart,
          ],
        );
      };

      try {
        await persistCompletedTripWithPairedReservations(
          ownedMobilityRepository,
          acceptedSnapshot,
          completedSnapshot,
          taipeiMidnightOrder.orderId,
        );
        await ownedMobilityRepository.withTransaction(async (tx) => {
          await ownedMobilityRepository.persistOrderWorkflow(tx, {
            orders: completedSnapshot.orders.filter(
              (item) => item.orderId === controlDay24Order.orderId,
            ),
            dispatchJobs: [],
            dispatchAssignments: [],
            driverTasks: [],
            dispatchTraceLogs: [],
          });
        });
        await complaintRepository.persistChanges({
          complaintCases: [complaintCase],
        });

        const memoryFallbackSpy = vi.fn(() => {
          throw new Error("unexpected fallback to in-memory snapshot");
        });
        const writerService = new ReportingService(
          { getReportingSnapshot: memoryFallbackSpy } as never,
          { listComplaintCases: memoryFallbackSpy } as never,
          regulatoryRegistryService,
          undefined,
          reportingRepository,
        );
        const readerService = new ReportingService(
          { getReportingSnapshot: memoryFallbackSpy } as never,
          { listComplaintCases: memoryFallbackSpy } as never,
          regulatoryRegistryService,
          undefined,
          reportingRepository,
        );

        // Persist the unrelated 2026-10-24 control order and seed the legacy UTC row on 2026-10-24 for the 17:00Z order
        await writerService.rebuildDailyDispatchRecords({
          serviceDate: legacyUtcDay,
          orderId: controlDay24Order.orderId,
        });
        await insertLegacyUtcRow();

        // Verify both rows initially sit on 2026-10-24 in PG
        const initialRows = await database.query<{
          service_date: string;
          order_id: string;
        }>(
          `
            SELECT service_date::text AS service_date, order_id
            FROM reporting.dispatch_daily_records
            WHERE order_id = ANY($1::text[])
            ORDER BY order_id ASC, service_date ASC
          `,
          [[taipeiMidnightOrder.orderId, controlDay24Order.orderId]],
        );
        expect(initialRows.rows).toEqual(
          expect.arrayContaining([
            {
              service_date: legacyUtcDay,
              order_id: taipeiMidnightOrder.orderId,
            },
            {
              service_date: legacyUtcDay,
              order_id: controlDay24Order.orderId,
            },
          ]),
        );

        // 3. Simulate a per-order failure during the rekey transaction (after INSERT, on DELETE before COMMIT)
        // and verify PostgreSQL ROLLBACK preserves the prior durable 2026-10-24 row without leaving a 2026-10-25 duplicate
        const failingDbProxy = {
          isEnabled: () => database.isEnabled(),
          query: (sql: string, values?: readonly unknown[]) =>
            database.query(sql, values),
          connect: async () => {
            const rawClient = await database.connect();
            return {
              query: async (sql: string, values?: unknown[]) => {
                if (
                  sql.includes("DELETE FROM reporting.dispatch_daily_records")
                ) {
                  throw new Error(
                    "simulated PG failure during legacy UTC day-key cleanup",
                  );
                }
                return rawClient.query(sql, values);
              },
              release: () => rawClient.release(),
            };
          },
        };
        const failingService = new ReportingService(
          { getReportingSnapshot: memoryFallbackSpy } as never,
          { listComplaintCases: memoryFallbackSpy } as never,
          regulatoryRegistryService,
          undefined,
          new ReportingRepository(failingDbProxy as never),
        );

        await expect(
          failingService.rebuildDailyDispatchRecords({
            serviceDate: taipeiServiceDay,
            orderId: taipeiMidnightOrder.orderId,
          }),
        ).rejects.toMatchObject({
          status: 503,
          code: "REPORT_REBUILD_FAILED",
        });

        const rowsAfterFailedRekey = await database.query<{
          service_date: string;
          order_id: string;
        }>(
          `
            SELECT service_date::text AS service_date, order_id
            FROM reporting.dispatch_daily_records
            WHERE order_id = $1
          `,
          [taipeiMidnightOrder.orderId],
        );
        expect(rowsAfterFailedRekey.rows).toEqual([
          {
            service_date: legacyUtcDay,
            order_id: taipeiMidnightOrder.orderId,
          },
        ]);

        // Canonical order, assignment, and complaint history remain intact after failed rekey
        const canonicalOrderCheck = await database.query<{ order_id: string }>(
          "SELECT order_id FROM ops.phase1_owned_orders WHERE order_id = $1",
          [taipeiMidnightOrder.orderId],
        );
        expect(canonicalOrderCheck.rows).toHaveLength(1);

        // 4. Production rebuild moves the legacy UTC row to Taipei day 2026-10-25 and leaves 2026-10-24 empty for this order
        const rebuild25 = await writerService.rebuildDailyDispatchRecords({
          serviceDate: taipeiServiceDay,
          orderId: taipeiMidnightOrder.orderId,
        });
        expect(rebuild25.rebuiltCount).toBe(1);
        expect(rebuild25.records[0]?.serviceDate).toBe(taipeiServiceDay);
        expect(memoryFallbackSpy).not.toHaveBeenCalled();

        const readDay25 = await readerService.listDailyDispatchRecords({
          serviceDate: taipeiServiceDay,
          orderId: taipeiMidnightOrder.orderId,
        });
        expect(readDay25).toHaveLength(1);
        expect(readDay25[0]).toMatchObject({
          serviceDate: taipeiServiceDay,
          orderId: taipeiMidnightOrder.orderId,
          requestedAt: "2026-10-24T17:00:00.000Z",
          reservationTime: taipeiMidnightOrder.reservationWindowStart,
          finalStatus: "completed",
          complaintCount: 1,
        });

        const readOldDay24ForMovedOrder =
          await readerService.listDailyDispatchRecords({
            serviceDate: legacyUtcDay,
            orderId: taipeiMidnightOrder.orderId,
          });
        expect(readOldDay24ForMovedOrder).toEqual([]);

        // Unrelated order on 2026-10-24 is preserved
        const readControlDay24 = await readerService.listDailyDispatchRecords({
          serviceDate: legacyUtcDay,
          orderId: controlDay24Order.orderId,
        });
        expect(readControlDay24).toHaveLength(1);
        expect(readControlDay24[0]?.serviceDate).toBe(legacyUtcDay);

        // Direct SQL table check confirms exactly one row on 2026-10-25 and no duplicate on 2026-10-24
        const persistedAfterRebuild = await database.query<{
          service_date: string;
          order_id: string;
        }>(
          `
            SELECT service_date::text AS service_date, order_id
            FROM reporting.dispatch_daily_records
            WHERE order_id = $1
          `,
          [taipeiMidnightOrder.orderId],
        );
        expect(persistedAfterRebuild.rows).toEqual([
          {
            service_date: taipeiServiceDay,
            order_id: taipeiMidnightOrder.orderId,
          },
        ]);

        // 5. Replay is idempotent and an older rebuild cannot overwrite a newer persisted result
        const replay = await writerService.rebuildDailyDispatchRecords({
          serviceDate: taipeiServiceDay,
          orderId: taipeiMidnightOrder.orderId,
        });
        expect(replay.rebuiltCount).toBe(1);
        await reportingRepository.upsertDailyDispatchRecords([
          {
            ...readDay25[0]!,
            finalStatus: "assigned",
            generatedAt: "2026-10-24T17:00:01.000Z",
          },
        ]);
        const afterStaleAttempt = await readerService.listDailyDispatchRecords({
          serviceDate: taipeiServiceDay,
          orderId: taipeiMidnightOrder.orderId,
        });
        expect(afterStaleAttempt).toHaveLength(1);
        expect(afterStaleAttempt[0]?.finalStatus).toBe("completed");

        // 6. Read-path cutover: if a legacy UTC row exists before an explicit rebuild, listDailyDispatchRecords reconciles it to the Taipei day
        await database.query(
          "DELETE FROM reporting.dispatch_daily_records WHERE order_id = $1",
          [taipeiMidnightOrder.orderId],
        );
        await insertLegacyUtcRow();

        const readCutover25 = await readerService.listDailyDispatchRecords({
          serviceDate: taipeiServiceDay,
          orderId: taipeiMidnightOrder.orderId,
        });
        expect(readCutover25).toHaveLength(1);
        expect(readCutover25[0]?.serviceDate).toBe(taipeiServiceDay);

        const persistedAfterReadCutover = await database.query<{
          service_date: string;
          order_id: string;
        }>(
          `
            SELECT service_date::text AS service_date, order_id
            FROM reporting.dispatch_daily_records
            WHERE order_id = $1
          `,
          [taipeiMidnightOrder.orderId],
        );
        expect(persistedAfterReadCutover.rows).toEqual([
          {
            service_date: taipeiServiceDay,
            order_id: taipeiMidnightOrder.orderId,
          },
        ]);
      } finally {
        const cleanupOrderIds = [
          taipeiMidnightOrder.orderId,
          controlDay24Order.orderId,
        ];
        await database.query(
          "DELETE FROM reporting.dispatch_daily_records WHERE order_id = ANY($1::text[])",
          [cleanupOrderIds],
        );
        await database.query(
          "DELETE FROM crm.phase1_complaint_cases WHERE case_no = $1",
          [complaintCase.caseNo],
        );
        await database.query(
          "UPDATE ops.phase1_dispatch_assignments SET status = 'cancelled' WHERE order_id = ANY($1::text[]) AND status IN ('assigned', 'accepted')",
          [cleanupOrderIds],
        );
        await database.query(
          "DELETE FROM ops.dispatch_resource_reservations WHERE order_id = ANY($1::text[])",
          [cleanupOrderIds],
        );
        await database.query(
          "DELETE FROM ops.phase1_dispatch_trace_logs WHERE order_id = ANY($1::text[])",
          [cleanupOrderIds],
        );
        await database.query(
          "DELETE FROM ops.phase1_driver_tasks WHERE order_id = ANY($1::text[])",
          [cleanupOrderIds],
        );
        await database.query(
          "DELETE FROM ops.phase1_dispatch_assignments WHERE order_id = ANY($1::text[])",
          [cleanupOrderIds],
        );
        await database.query(
          "DELETE FROM ops.phase1_dispatch_jobs WHERE order_id = ANY($1::text[])",
          [cleanupOrderIds],
        );
        await database.query(
          "DELETE FROM ops.phase1_owned_orders WHERE order_id = ANY($1::text[])",
          [cleanupOrderIds],
        );
      }
    },
  );
});
