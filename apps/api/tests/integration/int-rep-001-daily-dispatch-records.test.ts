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
    const { ownedMobilityService, cleanup } = createHarness();
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
});
