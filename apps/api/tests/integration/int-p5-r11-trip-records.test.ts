import { randomUUID } from "node:crypto";
import { EventEmitter2 } from "@nestjs/event-emitter";
import { afterAll, describe, expect, it, vi } from "vitest";

import type {
  BootstrapRequestIdentity,
  DriverTaskRecord,
  DispatchAssignmentRecord,
  DispatchJobRecord,
  OwnedOrderRecord,
} from "../../src/common/auth/auth.types";
import { ApiRequestError } from "../../src/common/api-envelope";
import { recordsToCsv } from "../../src/common/csv";
import { DatabaseService } from "../../src/common/db";
import { OpsDispatchEventsService } from "../../src/common/ops-dispatch-events.service";
import { AgencyAccessAuditService } from "../../src/modules/agency-access/agency-access-audit.service";
import { AgencyAccessLogRepository } from "../../src/modules/agency-access/agency-access-log.repository";
import { AgencyPortalService } from "../../src/modules/agency-access/agency-portal.service";
import { AuditNotificationService } from "../../src/modules/audit-notification/audit-notification.service";
import {
  MultiTaxiRepository,
  type StoredMultiTaxiTripOperationalRecord,
} from "../../src/modules/multi-taxi/multi-taxi.repository";
import { MultiTaxiService } from "../../src/modules/multi-taxi/multi-taxi.service";
import { OwnedMobilityTaskEventsService } from "../../src/modules/owned-mobility/owned-mobility-task-events.service";
import { OwnedMobilityService } from "../../src/modules/owned-mobility/owned-mobility.service";
import type {
  ReportingFilingState,
  StoredReportJobRecord,
} from "../../src/modules/reporting-filing/reporting-filing.repository";
import { ReportingFilingService } from "../../src/modules/reporting-filing/reporting-filing.service";
import { ServiceProductService } from "../../src/modules/service-product/service-product.service";

function flushBackgroundWork() {
  return new Promise((resolve) => setTimeout(resolve, 10));
}

interface SimulatedDbState {
  tripRecordsByOrderId: Map<string, Record<string, unknown>>;
  paymentsByOrderId: Map<
    string,
    { status: string; amount_minor: number | null }
  >;
  ordersByOrderId: Map<string, { order_no: string }>;
  activeDbHolds: Set<string>;
}

/**
 * Transactional SQL executor simulating the V0056 + V0135
 * `reporting.multi_taxi_trip_operational_records` + `billing.multi_taxi_passenger_payments`
 * tables with atomic transaction staging & rollback semantics.
 */
function createTransactionalDbHarness() {
  const committed: SimulatedDbState = {
    tripRecordsByOrderId: new Map(),
    paymentsByOrderId: new Map(),
    ordersByOrderId: new Map(),
    activeDbHolds: new Set(),
  };

  function executeQueryAgainstState(
    state: SimulatedDbState,
    allowPurge: boolean,
    sql: string,
    values: readonly unknown[] = [],
  ): { rows: any[]; rowCount: number } {
    const normalizedSql = sql.replace(/\s+/g, " ").trim();

    if (
      normalizedSql.includes(
        "INSERT INTO reporting.multi_taxi_trip_operational_records",
      )
    ) {
      const [
        recordId,
        orderId,
        orderNo,
        tripId,
        assignmentId,
        vehicleId,
        plateNo,
        reservedAt,
        pickupAt,
        dropoffAt,
        routeSummary,
        routeSource,
        distanceMeters,
        durationSeconds,
        payableFareMinor,
        actualFareMinor,
        paramCollectedFareMinor,
        paramPaymentStatus,
        tollMinor,
        tollSource,
        farePolicyVersion,
        chargingMode,
        currency,
        recordJson,
        generatedAt,
        retainUntil,
      ] = values as [
        string,
        string,
        string | null,
        string,
        string | null,
        string,
        string,
        string,
        string | null,
        string | null,
        string | null,
        string,
        number | null,
        number | null,
        number,
        number,
        number | null,
        string,
        number | null,
        string,
        string,
        string,
        string,
        string,
        string,
        string,
      ];

      if (
        Date.parse(retainUntil) <
        Date.parse(generatedAt) + 730 * 24 * 60 * 60 * 1000
      ) {
        throw new Error("multi_taxi_record_retention_chk violation");
      }

      const paymentRow = state.paymentsByOrderId.get(orderId);
      const resolvedPaymentStatus =
        paymentRow?.status || paramPaymentStatus || "unknown";
      const resolvedCollectedFareMinor =
        resolvedPaymentStatus === "captured"
          ? (paymentRow?.amount_minor ??
            paramCollectedFareMinor ??
            actualFareMinor ??
            0)
          : resolvedPaymentStatus === "refunded"
            ? 0
            : null;

      const parsedJson = JSON.parse(recordJson) as Record<string, unknown>;
      parsedJson.paymentStatus = resolvedPaymentStatus;
      parsedJson.collectedFareMinor = resolvedCollectedFareMinor;

      const existing = state.tripRecordsByOrderId.get(orderId);
      const row: Record<string, unknown> = existing
        ? {
            ...existing,
            order_no: orderNo ?? existing.order_no,
            trip_id: tripId,
            assignment_id: assignmentId ?? existing.assignment_id,
            vehicle_id: vehicleId,
            plate_no: plateNo,
            reserved_at: reservedAt,
            pickup_at: pickupAt ?? existing.pickup_at,
            dropoff_at: dropoffAt ?? existing.dropoff_at,
            route_summary: routeSummary ?? existing.route_summary,
            route_source:
              routeSource !== "unavailable"
                ? routeSource
                : existing.route_source,
            distance_meters: distanceMeters ?? existing.distance_meters,
            duration_seconds: durationSeconds ?? existing.duration_seconds,
            payable_fare_minor: payableFareMinor,
            actual_fare_minor: actualFareMinor,
            collected_fare_minor: resolvedCollectedFareMinor,
            payment_status: resolvedPaymentStatus,
            toll_minor: tollMinor ?? existing.toll_minor,
            toll_source:
              tollSource !== "unavailable" ? tollSource : existing.toll_source,
            fare_policy_version: farePolicyVersion,
            charging_mode: chargingMode,
            currency,
            record: { ...(existing.record as object), ...parsedJson },
            retain_until:
              Date.parse(retainUntil) > Date.parse(String(existing.retain_until))
                ? retainUntil
                : existing.retain_until,
          }
        : {
            record_id: recordId,
            order_id: orderId,
            order_no: orderNo,
            trip_id: tripId,
            assignment_id: assignmentId,
            vehicle_id: vehicleId,
            plate_no: plateNo,
            reserved_at: reservedAt,
            pickup_at: pickupAt,
            dropoff_at: dropoffAt,
            route_summary: routeSummary,
            route_source: routeSource,
            distance_meters: distanceMeters,
            duration_seconds: durationSeconds,
            payable_fare_minor: payableFareMinor,
            actual_fare_minor: actualFareMinor,
            collected_fare_minor: resolvedCollectedFareMinor,
            payment_status: resolvedPaymentStatus,
            toll_minor: tollMinor,
            toll_source: tollSource,
            fare_policy_version: farePolicyVersion,
            charging_mode: chargingMode,
            currency,
            record: parsedJson,
            generated_at: generatedAt,
            retain_until: retainUntil,
          };

      state.tripRecordsByOrderId.set(orderId, row);
      return { rows: [structuredClone(row)], rowCount: 1 };
    }

    if (
      normalizedSql.includes(
        "FROM reporting.multi_taxi_trip_operational_records r",
      ) &&
      normalizedSql.includes("WHERE r.retain_until <= $1::timestamptz")
    ) {
      const cutoffMs = Date.parse(String(values[0]));
      const rows = [...state.tripRecordsByOrderId.values()]
        .filter((row) => Date.parse(String(row.retain_until)) <= cutoffMs)
        .map((row) => ({
          record_id: row.record_id,
          order_id: row.order_id,
          trip_id: row.trip_id,
          has_db_hold:
            state.activeDbHolds.has(String(row.order_id)) ||
            state.activeDbHolds.has(String(row.record_id)) ||
            state.activeDbHolds.has(String(row.trip_id)),
        }));
      return { rows, rowCount: rows.length };
    }

    if (
      normalizedSql.includes(
        "DELETE FROM reporting.multi_taxi_trip_operational_records WHERE record_id = $1",
      )
    ) {
      const targetRecordId = String(values[0]);
      const entry = [...state.tripRecordsByOrderId.entries()].find(
        ([, row]) => row.record_id === targetRecordId,
      );
      if (!entry) {
        return { rows: [], rowCount: 0 };
      }
      const [orderId, row] = entry;
      if (Date.parse(String(row.retain_until)) > Date.now() && !allowPurge) {
        throw new Error(
          `R11 trip operational record ${targetRecordId} cannot be deleted before 2-year retention expiry`,
        );
      }
      if (!allowPurge) {
        throw new Error(
          `R11 trip operational record ${targetRecordId} deletion after expiry requires reporting.allow_trip_record_retention_purge = on`,
        );
      }
      if (
        state.activeDbHolds.has(orderId) ||
        state.activeDbHolds.has(targetRecordId) ||
        state.activeDbHolds.has(String(row.trip_id))
      ) {
        throw new Error(
          `R11 trip operational record ${targetRecordId} is under active legal hold and cannot be deleted`,
        );
      }
      state.tripRecordsByOrderId.delete(orderId);
      return { rows: [], rowCount: 1 };
    }

    if (
      normalizedSql.includes(
        "FROM reporting.multi_taxi_trip_operational_records r",
      )
    ) {
      const enrich = (row: Record<string, unknown>) => {
        const orderId = String(row.order_id);
        const payment = state.paymentsByOrderId.get(orderId);
        const orderMeta = state.ordersByOrderId.get(orderId);
        return {
          ...structuredClone(row),
          resolved_order_no:
            row.order_no ?? orderMeta?.order_no ?? row.order_id,
          live_payment_status: payment?.status ?? null,
          live_payment_amount_minor: payment?.amount_minor ?? null,
        };
      };

      if (
        normalizedSql.includes("WHERE r.record_id = $1 OR r.order_id = $1")
      ) {
        const needle = String(values[0]);
        const found = [...state.tripRecordsByOrderId.values()].find(
          (row) => row.record_id === needle || row.order_id === needle,
        );
        return { rows: found ? [enrich(found)] : [], rowCount: found ? 1 : 0 };
      }

      const rows = [...state.tripRecordsByOrderId.values()]
        .map(enrich)
        .sort((a, b) =>
          String(b.reserved_at).localeCompare(String(a.reserved_at)),
        );
      return { rows, rowCount: rows.length };
    }

    return { rows: [], rowCount: 0 };
  }

  const databaseService = {
    isEnabled: () => true,
    query: vi.fn(async (sql: string, values?: readonly unknown[]) =>
      executeQueryAgainstState(committed, false, sql, values),
    ),
    connect: vi.fn(async () => {
      let staged: SimulatedDbState = structuredClone(committed);
      let allowPurge = false;
      return {
        query: vi.fn(async (sql: string, values?: readonly unknown[]) => {
          const trimmed = sql.trim().toUpperCase();
          if (trimmed === "BEGIN") {
            staged = structuredClone(committed);
            allowPurge = false;
            return { rows: [], rowCount: 0 };
          }
          if (
            trimmed.includes(
              "SET LOCAL REPORTING.ALLOW_TRIP_RECORD_RETENTION_PURGE = 'ON'",
            )
          ) {
            allowPurge = true;
            return { rows: [], rowCount: 0 };
          }
          if (trimmed === "COMMIT") {
            committed.tripRecordsByOrderId = staged.tripRecordsByOrderId;
            committed.paymentsByOrderId = staged.paymentsByOrderId;
            committed.ordersByOrderId = staged.ordersByOrderId;
            committed.activeDbHolds = staged.activeDbHolds;
            return { rows: [], rowCount: 0 };
          }
          if (trimmed === "ROLLBACK") {
            staged = structuredClone(committed);
            allowPurge = false;
            return { rows: [], rowCount: 0 };
          }
          return executeQueryAgainstState(staged, allowPurge, sql, values);
        }),
        release: vi.fn(),
      };
    }),
  };

  function setPaymentOutcome(
    orderId: string,
    status:
      | "not_selected"
      | "authorized"
      | "captured"
      | "failed"
      | "refunded"
      | "manual_recovery",
    amountMinor: number | null,
  ) {
    committed.paymentsByOrderId.set(orderId, {
      status,
      amount_minor: amountMinor,
    });
    // Simulate V0135 trigger trg_sync_multi_taxi_trip_record_payment
    const existing = committed.tripRecordsByOrderId.get(orderId);
    if (existing) {
      const collected =
        status === "captured"
          ? (amountMinor ?? Number(existing.actual_fare_minor ?? 0))
          : status === "refunded"
            ? 0
            : null;
      existing.payment_status = status;
      existing.collected_fare_minor = collected;
      if (status === "captured" && amountMinor !== null) {
        existing.actual_fare_minor = amountMinor;
      }
      const rec = (existing.record ?? {}) as Record<string, unknown>;
      rec.paymentStatus = status;
      rec.collectedFareMinor = collected;
    }
  }

  return {
    committed,
    databaseService,
    setPaymentOutcome,
    executeDirectQuery: (sql: string, values?: readonly unknown[]) =>
      executeQueryAgainstState(committed, false, sql, values),
  };
}

describe("INT-P5-R11: Multi-taxi trip operational record truth, 730-day retention, and agency read/export closure", () => {
  function setupCompletionEnvironment(options?: {
    failOnCompletionOutbox?: boolean;
  }) {
    const db = createTransactionalDbHarness();
    const auditNotificationService = new AuditNotificationService();
    const serviceProductService = new ServiceProductService(
      auditNotificationService,
      undefined,
    );
    const multiTaxiRepository = new MultiTaxiRepository(
      db.databaseService as never,
    );

    const order: OwnedOrderRecord = {
      orderId: "order-r11-tx-001",
      orderNo: "MTX-20261025-001",
      tenantId: null,
      bookingId: null,
      passenger: {
        name: "林小華",
        phone: "0912345678",
        email: "passenger@example.com",
      },
      orderSource: "app",
      serviceBucket: "personal_immediate",
      serviceProductCode: "taxi_reservation",
      runtimeProfileCode: "multi_taxi_direct",
      dispatchSemantics: "immediate",
      status: "on_trip",
      pickup: {
        address: "台北市中正區北平西路3號（台北車站）",
        latitude: 25.0478,
        longitude: 121.517,
      },
      dropoff: {
        address: "台北市松山區敦化北路340之9號（松山機場）",
        latitude: 25.063,
        longitude: 121.5517,
      },
      reservationWindowStart: "2026-10-20T09:00:00.000Z",
      reservationWindowEnd: "2026-10-20T09:15:00.000Z",
      fixedPrice: false,
      quotedFare: { currency: "TWD", amountMinor: 32000 },
      quotedFareRuleVersion: "multi-taxi-v2026",
      proofRequirements: {
        photoRequired: false,
        signoffRequired: false,
        expenseProofRequired: false,
      },
      approvalState: "not_required",
      approvalRequestIds: [],
      complianceGates: [],
      complianceFlags: [],
      specialRequirements: [],
      notes: null,
      createdAt: "2026-10-20T08:50:00.000Z",
      updatedAt: "2026-10-20T09:05:00.000Z",
    };

    const dispatchJob: DispatchJobRecord = {
      dispatchJobId: "job-r11-tx-001",
      orderId: order.orderId,
      serviceBucket: order.serviceBucket,
      dispatchSemantics: order.dispatchSemantics,
      status: "assigned",
      assignedAssignmentId: "asg-r11-tx-001",
      latestAttemptNo: 1,
      candidateCount: 1,
      escalationState: "none",
      createdAt: "2026-10-20T08:51:00.000Z",
      updatedAt: "2026-10-20T09:05:00.000Z",
    };

    const assignment: DispatchAssignmentRecord = {
      assignmentId: "asg-r11-tx-001",
      dispatchJobId: dispatchJob.dispatchJobId,
      orderId: order.orderId,
      taskId: "task-r11-tx-001",
      assignmentType: "owned_driver",
      driverId: "driver-r11-001",
      vehicleId: "vehicle-r11-001",
      partnerId: null,
      status: "accepted",
      assignedAt: "2026-10-20T08:55:00.000Z",
      updatedAt: "2026-10-20T09:05:00.000Z",
    };

    const task: DriverTaskRecord = {
      taskId: "task-r11-tx-001",
      orderId: order.orderId,
      dispatchJobId: dispatchJob.dispatchJobId,
      assignmentId: assignment.assignmentId,
      driverId: "driver-r11-001",
      vehicleId: "vehicle-r11-001",
      status: "on_trip",
      acceptedAt: "2026-10-20T08:56:00.000Z",
      departedAt: "2026-10-20T08:57:00.000Z",
      arrivedPickupAt: "2026-10-20T09:01:00.000Z",
      startedAt: "2026-10-20T09:05:00.000Z",
      completedAt: null,
      actualDistanceKm: null,
      actualDurationSec: null,
      fare: null,
      proof: null,
      createdAt: "2026-10-20T08:55:00.000Z",
      updatedAt: "2026-10-20T09:05:00.000Z",
    };

    const traceRequests = new Set<string>();
    let committedBundle = {
      order: structuredClone(order),
      dispatchJob: structuredClone(dispatchJob),
      assignment: structuredClone(assignment),
      task: structuredClone(task),
    };

    const ownedMobilityRepository = {
      isEnabled: () => true,
      withTransaction: vi.fn(async (fn: (tx: any) => Promise<any>) => {
        const client = await db.databaseService.connect();
        const stagedBundle = structuredClone(committedBundle);
        const stagedTraces = new Set(traceRequests);
        try {
          await client.query("BEGIN");
          const tx = {
            query: client.query,
            __stagedBundle: stagedBundle,
            __stagedTraces: stagedTraces,
          };
          const out = await fn(tx);
          await client.query("COMMIT");
          committedBundle = stagedBundle;
          traceRequests.clear();
          for (const req of stagedTraces) traceRequests.add(req);
          return out;
        } catch (err) {
          await client.query("ROLLBACK");
          throw err;
        } finally {
          client.release();
        }
      }),
      loadDriverTaskCompletionBundleForUpdate: vi.fn(
        async (tx: any, taskId: string) => {
          if (tx.__stagedBundle.task.taskId !== taskId) return null;
          return structuredClone(tx.__stagedBundle);
        },
      ),
      hasDriverTaskTraceRequestId: vi.fn(
        async (
          tx: any,
          _orderId: string,
          _taskId: string,
          _eventType: string,
          requestId: string,
        ) => tx.__stagedTraces.has(requestId),
      ),
      persistOrderWorkflow: vi.fn(async (tx: any, payload: any) => {
        if (payload.orders?.[0]) {
          tx.__stagedBundle.order = structuredClone(payload.orders[0]);
        }
        if (payload.dispatchAssignments?.[0]) {
          tx.__stagedBundle.assignment = structuredClone(
            payload.dispatchAssignments[0],
          );
        }
        if (payload.driverTasks?.[0]) {
          tx.__stagedBundle.task = structuredClone(payload.driverTasks[0]);
        }
        for (const trace of payload.dispatchTraceLogs ?? []) {
          if (trace.details?.requestId) {
            tx.__stagedTraces.add(String(trace.details.requestId));
          }
        }
      }),
      releaseDispatchResourceReservations: vi.fn(async () => undefined),
      persistDriverCompletionOutbox: vi.fn(async () => {
        if (options?.failOnCompletionOutbox) {
          throw new Error("Simulated completion outbox database failure");
        }
      }),
      claimNextRecoverableDriverCompletionOutbox: vi.fn(async () => null),
      persistChanges: vi.fn(async () => undefined),
      reportPersistenceFailure: vi.fn(),
    };

    const regulatoryRegistryService = {
      listVehicles: () => [
        {
          vehicleId: "vehicle-r11-001",
          plateNo: "TPE-8899",
          dispatchableFlag: true,
        },
      ],
      listDrivers: () => [
        {
          driverId: "driver-r11-001",
          name: "陳司機",
        },
      ],
      getDriverCompletionReceiptIdentity: vi.fn(async () => ({
        surname: {
          driverDeclaredSurname: "陳",
          driverDeclaredSurnameCapturedAt: "2026-10-20T09:00:00.000Z",
        },
        driverRegistrationMasked: "北計***89",
      })),
    };

    const ownedMobilityService = new OwnedMobilityService(
      regulatoryRegistryService as never,
      auditNotificationService,
      undefined as never,
      new OwnedMobilityTaskEventsService(),
      new OpsDispatchEventsService(),
      ownedMobilityRepository as never,
      undefined,
      undefined,
      serviceProductService,
      new EventEmitter2(),
      undefined,
      undefined,
      undefined,
      undefined,
      undefined,
      undefined,
      undefined,
      undefined,
      undefined,
      undefined,
      undefined,
      undefined,
      undefined,
      undefined,
      undefined,
      undefined,
      undefined,
      multiTaxiRepository,
    );

    // Seed order, assignment, task, and disclosure snapshot in producer instance
    (ownedMobilityService as any).orders = [structuredClone(order)];
    (ownedMobilityService as any).dispatchJobs = [structuredClone(dispatchJob)];
    (ownedMobilityService as any).dispatchAssignments = [
      structuredClone(assignment),
    ];
    (ownedMobilityService as any).driverTasks = [structuredClone(task)];
    (ownedMobilityService as any).passengerDisclosureSnapshots = [
      {
        snapshotId: "snap-r11-001",
        orderId: order.orderId,
        dispatchJobId: dispatchJob.dispatchJobId,
        assignmentId: assignment.assignmentId,
        assignmentVersion: 1,
        vehicle: {
          vehicleId: "vehicle-r11-001",
          plateNo: "TPE-8899",
          vehicleClass: "sedan",
          brandModel: "Toyota Camry",
          color: "Black",
        },
        driver: {
          driverId: "driver-r11-001",
          displayName: "陳*機",
          professionalRegistrationNoMasked: "北計***89",
        },
        routeFare: {
          encodedPolyline: "secret_raw_polyline_points_xyz",
          estimatedDistanceMeters: 5000,
          estimatedDurationSeconds: 900,
          payableFareMinor: 32000,
          currency: "TWD",
          farePolicyVersion: "multi-taxi-v2026",
          chargingMode: "meter",
        },
        createdAt: "2026-10-20T08:55:00.000Z",
        supersededAt: null,
      },
    ];

    return {
      db,
      auditNotificationService,
      multiTaxiRepository,
      ownedMobilityService,
      task,
      order,
    };
  }

  it("writes the R11 record in the completion transaction, replays idempotently, and rolls back atomically on failure", async () => {
    // 1. Rollback verification: when completion transaction fails after R11 insert,
    //    the R11 record is rolled back together with completion.
    const failingEnv = setupCompletionEnvironment({
      failOnCompletionOutbox: true,
    });
    await expect(
      failingEnv.ownedMobilityService.completeDriverTask(
        failingEnv.task.taskId,
        {
          completedAt: "2026-10-20T09:32:00.000Z",
          actualDistanceKm: 6.45,
          actualDurationSec: 1620,
          fare: { currency: "TWD", amountMinor: 36500 },
          proof: {
            photos: [],
            signatureId: "sig-1",
            expenseItems: [{ type: "toll", amountMinor: 4000, note: "ETC" }],
          },
        },
        "req-complete-rollback-1",
      ),
    ).rejects.toThrow("Simulated completion outbox database failure");

    expect(await failingEnv.multiTaxiRepository.listTripOperationalRecords()).toEqual(
      [],
    );

    // 2. Successful completion writes the R11 row inside the same transaction
    const env = setupCompletionEnvironment();
    const completedTask = await env.ownedMobilityService.completeDriverTask(
      env.task.taskId,
      {
        completedAt: "2026-10-20T09:32:00.000Z",
        actualDistanceKm: 6.45,
        actualDurationSec: 1620,
        fare: { currency: "TWD", amountMinor: 36500 },
        proof: {
          photos: [],
          signatureId: "sig-1",
          expenseItems: [{ type: "toll", amountMinor: 4000, note: "ETC" }],
        },
      },
      "req-complete-success-1",
    );
    expect(completedTask.status).toBe("completed");

    // 3. Idempotent replay with the same requestId returns the completed task
    //    and keeps exactly one logical R11 record.
    const replayedTask = await env.ownedMobilityService.completeDriverTask(
      env.task.taskId,
      {
        completedAt: "2026-10-20T09:32:00.000Z",
        actualDistanceKm: 6.45,
        actualDurationSec: 1620,
        fare: { currency: "TWD", amountMinor: 36500 },
        proof: {
          photos: [],
          signatureId: "sig-1",
          expenseItems: [{ type: "toll", amountMinor: 4000, note: "ETC" }],
        },
      },
      "req-complete-success-1",
    );
    expect(replayedTask.taskId).toBe(env.task.taskId);

    const committedRows =
      await env.multiTaxiRepository.listTripOperationalRecords();
    expect(committedRows).toHaveLength(1);
    expect(committedRows[0]).toMatchObject({
      recordId: "mtr-order-r11-tx-001",
      orderId: "order-r11-tx-001",
      orderNo: "MTX-20261025-001",
      tripId: "task-r11-tx-001",
      assignmentId: "asg-r11-tx-001",
      vehicleId: "vehicle-r11-001",
      plateNo: "TPE-8899",
      reservedAt: "2026-10-20T09:00:00.000Z",
      pickupAt: "2026-10-20T09:05:00.000Z",
      dropoffAt: "2026-10-20T09:32:00.000Z",
      route: {
        distanceMeters: 6450,
        durationSeconds: 1620,
        source: "pickup_dropoff_summary",
        routeSummary:
          "台北市中正區北平西路3號（台北車站） → 台北市松山區敦化北路340之9號（松山機場）",
      },
      payableFareMinor: 32000,
      actualFareMinor: 36500,
      collectedFareMinor: null,
      paymentStatus: "unknown",
      tollMinor: 4000,
      tollSource: "driver_proof",
      currency: "TWD",
      farePolicyVersion: "multi-taxi-v2026",
      chargingMode: "meter",
      generatedAt: "2026-10-20T09:32:00.000Z",
      retainUntil: "2028-10-19T09:32:00.000Z",
    });

    // 4. Cross-instance read: a fresh MultiTaxiService whose OwnedMobilityService
    //    has an empty in-memory cache still reads the committed R11 record.
    const separateReaderMultiTaxiService = new MultiTaxiService(
      { listOrders: () => [] } as never,
      env.multiTaxiRepository,
      undefined,
      env.auditNotificationService,
    );
    const crossInstanceRecords =
      await separateReaderMultiTaxiService.listTripOperationalRecords({});
    expect(crossInstanceRecords).toHaveLength(1);
    expect(crossInstanceRecords[0]?.recordId).toBe("mtr-order-r11-tx-001");
  });

  it("synchronizes payable vs collected fare across pending/failed/captured/refunded payment outcomes and reconciles legacy rows honestly", async () => {
    const env = setupCompletionEnvironment();
    await env.ownedMobilityService.completeDriverTask(
      env.task.taskId,
      {
        completedAt: "2026-10-20T09:32:00.000Z",
        actualDistanceKm: 6.45,
        actualDurationSec: 1620,
        fare: { currency: "TWD", amountMinor: 36500 },
        proof: {
          photos: [],
          signatureId: "sig-1",
          expenseItems: [{ type: "toll", amountMinor: 4000, note: "ETC" }],
        },
      },
      "req-payment-sync-1",
    );

    const readerService = new MultiTaxiService(
      { listOrders: () => [] } as never,
      env.multiTaxiRepository,
      undefined,
      env.auditNotificationService,
    );

    // Case A: authorized (pending capture) -> collectedFareMinor must be null
    env.db.setPaymentOutcome(env.order.orderId, "authorized", 36500);
    let record = await readerService.getTripOperationalRecord(
      "mtr-order-r11-tx-001",
    );
    expect(record?.paymentStatus).toBe("authorized");
    expect(record?.payableFareMinor).toBe(32000);
    expect(record?.actualFareMinor).toBe(36500);
    expect(record?.collectedFareMinor).toBeNull();

    // Case B: failed -> collectedFareMinor must be null
    env.db.setPaymentOutcome(env.order.orderId, "failed", 36500);
    record = await readerService.getTripOperationalRecord(
      "mtr-order-r11-tx-001",
    );
    expect(record?.paymentStatus).toBe("failed");
    expect(record?.collectedFareMinor).toBeNull();

    // Case C: captured -> collectedFareMinor equals captured amount
    env.db.setPaymentOutcome(env.order.orderId, "captured", 36500);
    record = await readerService.getTripOperationalRecord(
      "mtr-order-r11-tx-001",
    );
    expect(record?.paymentStatus).toBe("captured");
    expect(record?.collectedFareMinor).toBe(36500);

    // Case D: refunded -> collectedFareMinor equals 0 (never positive)
    env.db.setPaymentOutcome(env.order.orderId, "refunded", 36500);
    record = await readerService.getTripOperationalRecord(
      "mtr-order-r11-tx-001",
    );
    expect(record?.paymentStatus).toBe("refunded");
    expect(record?.collectedFareMinor).toBe(0);

    // Case E: Legacy completed order without committed R11 row, without task.startedAt,
    // and without toll proof -> reconciles without inventing pickupAt or toll
    const legacyOrder: OwnedOrderRecord = {
      ...env.order,
      orderId: "order-legacy-002",
      orderNo: "MTX-LEGACY-002",
      status: "completed",
      updatedAt: "2026-10-18T11:20:00.000Z",
    };
    const legacyService = new MultiTaxiService(
      {
        listOrders: () => [legacyOrder],
        getDriverTasksForOrder: () => [],
        resolvePersistedPassengerAssignmentDisclosure: async () => ({
          assignmentId: "asg-legacy-002",
          createdAt: "2026-10-18T10:50:00.000Z",
          vehicle: { vehicleId: "veh-legacy-2", plateNo: "KHH-1122" },
          routeFare: {
            encodedPolyline: "est_poly",
            estimatedDistanceMeters: 8100,
            estimatedDurationSeconds: 1400,
            payableFareMinor: 29000,
            farePolicyVersion: "legacy-v1",
          },
        }),
      } as never,
      env.multiTaxiRepository,
      undefined,
      env.auditNotificationService,
    );

    const legacyRecord = await legacyService.getTripOperationalRecord(
      "mtr-order-legacy-002",
    );
    expect(legacyRecord).toMatchObject({
      recordId: "mtr-order-legacy-002",
      plateNo: "KHH-1122",
      pickupAt: null, // Never fabricated from assignment.createdAt!
      dropoffAt: "2026-10-18T11:20:00.000Z",
      route: {
        distanceMeters: 8100,
        durationSeconds: 1400,
        source: "provider_route", // Honestly labeled as estimated provider route
      },
      payableFareMinor: 29000,
      collectedFareMinor: null,
      paymentStatus: "unknown",
      tollSource: "unavailable",
    });
  });

  it("enforces 730-day retention floor, blocks early deletion, and respects active legal holds and deletion exceptions", async () => {
    const env = setupCompletionEnvironment();
    await env.ownedMobilityService.completeDriverTask(
      env.task.taskId,
      {
        completedAt: "2026-10-20T09:32:00.000Z",
        actualDistanceKm: 6.45,
        actualDurationSec: 1620,
        fare: { currency: "TWD", amountMinor: 36500 },
        proof: {
          photos: [],
          signatureId: "sig-1",
          expenseItems: [],
        },
      },
      "req-retention-1",
    );

    // 1. Direct early deletion before 2-year expiry is rejected by the DB guard
    expect(() =>
      env.db.executeDirectQuery(
        "DELETE FROM reporting.multi_taxi_trip_operational_records WHERE record_id = $1",
        ["mtr-order-r11-tx-001"],
      ),
    ).toThrow(/cannot be deleted before 2-year retention expiry/);

    // 2. Even if retention sweep runs before retainUntil (2028-10-19), row is not purged
    const multiTaxiService = new MultiTaxiService(
      { listOrders: () => [] } as never,
      env.multiTaxiRepository,
      undefined,
      env.auditNotificationService,
    );
    const earlySweep = await multiTaxiService.purgeExpiredTripOperationalRecords(
      "2027-10-20T00:00:00.000Z",
    );
    expect(earlySweep.purgedRecordIds).toEqual([]);
    expect(
      await multiTaxiService.getTripOperationalRecord("mtr-order-r11-tx-001"),
    ).not.toBeNull();

    // 3. After 2-year expiry (2028-11-01), an active legal hold blocks purge
    const platformIdentity: BootstrapRequestIdentity = {
      authMode: "jwt_bearer",
      actorType: "platform_admin",
      actorId: "admin-legal-001",
      realm: "platform",
      tenantId: null,
      roleFamilies: ["platform"],
      roles: ["platform_admin"],
      scopes: ["evidence_governance:write", "evidence_governance:read"],
      requestId: "req-hold-1",
    };
    const hold = await env.auditNotificationService.placeEvidenceLegalHold(
      {
        family: "proof_bundle",
        subjectId: env.order.orderId,
        caseNumber: "CASE-R11-2026-01",
        reasonCode: "regulatory_inquiry",
        reasonNote: "Traffic Bureau R11 investigation hold",
      },
      platformIdentity,
      "req-hold-1",
    );

    const heldSweep = await multiTaxiService.purgeExpiredTripOperationalRecords(
      "2028-11-01T00:00:00.000Z",
    );
    expect(heldSweep.purgedRecordIds).toEqual([]);
    expect(heldSweep.skippedHeldRecordIds).toEqual(["mtr-order-r11-tx-001"]);

    // 4. Releasing the legal hold allows the expired record to be lawfully purged
    await env.auditNotificationService.releaseEvidenceLegalHold(
      hold.holdId,
      { releaseReason: "Investigation closed" },
      platformIdentity,
      "req-hold-release-1",
    );

    const releasedSweep =
      await multiTaxiService.purgeExpiredTripOperationalRecords(
        "2028-11-01T00:00:00.000Z",
      );
    expect(releasedSweep.purgedRecordIds).toEqual(["mtr-order-r11-tx-001"]);
    expect(
      await multiTaxiService.getTripOperationalRecord("mtr-order-r11-tx-001"),
    ).toBeNull();
  });

  it("supports agency exact search, exposes all 9 statutory fields in list/detail/CSV, and enforces export permissions, ownership, and audit", async () => {
    const env = setupCompletionEnvironment();
    env.db.setPaymentOutcome(env.order.orderId, "captured", 36500);
    await env.ownedMobilityService.completeDriverTask(
      env.task.taskId,
      {
        completedAt: "2026-10-20T09:32:00.000Z",
        actualDistanceKm: 6.45,
        actualDurationSec: 1620,
        fare: { currency: "TWD", amountMinor: 36500 },
        proof: {
          photos: [],
          signatureId: "sig-1",
          expenseItems: [{ type: "toll", amountMinor: 4000, note: "ETC" }],
        },
      },
      "req-agency-e2e-1",
    );

    // Also insert an expired >2-year-old record to verify retention boundary filtering
    const expiredRecord: StoredMultiTaxiTripOperationalRecord = {
      recordId: "mtr-order-expired-old",
      orderId: "order-expired-old",
      orderNo: "MTX-20230101-OLD",
      tripId: "task-expired-old",
      assignmentId: "asg-expired-old",
      vehicleId: "vehicle-r11-001",
      plateNo: "TPE-8899",
      reservedAt: "2023-01-01T08:00:00.000Z",
      pickupAt: "2023-01-01T08:05:00.000Z",
      dropoffAt: "2023-01-01T08:30:00.000Z",
      route: {
        encodedPolyline: null,
        pointCount: 0,
        distanceMeters: 4000,
        durationSeconds: 1500,
        source: "pickup_dropoff_summary",
        routeSummary: "Old A → Old B",
      },
      payableFareMinor: 20000,
      actualFareMinor: 20000,
      collectedFareMinor: 20000,
      paymentStatus: "captured",
      tollMinor: 0,
      tollSource: "none",
      currency: "TWD",
      farePolicyVersion: "multi-taxi-v2023",
      chargingMode: "meter",
      generatedAt: "2023-01-01T08:30:00.000Z",
      retainUntil: "2025-01-01T08:30:00.000Z",
    };
    await env.multiTaxiRepository.upsertTripOperationalRecord(expiredRecord);

    const multiTaxiService = new MultiTaxiService(
      { listOrders: () => [] } as never,
      env.multiTaxiRepository,
      undefined,
      env.auditNotificationService,
    );

    const filingState: ReportingFilingState = {
      reportJobs: [],
      filingPackages: [],
    };
    const filingRepository = {
      loadState: vi.fn(async () => structuredClone(filingState)),
      persistChanges: vi.fn(
        async (changes: { reportJobs?: StoredReportJobRecord[] }) => {
          for (const job of changes.reportJobs ?? []) {
            const idx = filingState.reportJobs.findIndex(
              (c) => c.jobId === job.jobId,
            );
            if (idx >= 0) filingState.reportJobs[idx] = structuredClone(job);
            else filingState.reportJobs.push(structuredClone(job));
          }
        },
      ),
      reportPersistenceFailure: vi.fn(),
    };
    const reportingFilingService = new ReportingFilingService(
      env.auditNotificationService,
      filingRepository as never,
    );

    const accessLogs = new AgencyAccessLogRepository();
    const accessAudit = new AgencyAccessAuditService(accessLogs);
    const agencyDirectory = {
      resolveActiveAccess: vi.fn(
        async (subject: { agencyId?: string; roleCode?: string }) => ({
          agency: {
            agencyId: subject.agencyId ?? "agency_taipei",
            agencyCode: "TPE-DOT",
            displayName: "臺北市政府交通局",
            status: "active",
          },
          roleCode: subject.roleCode ?? "agency_exporter",
        }),
      ),
    };

    const agencyPortalService = new AgencyPortalService(
      accessAudit,
      agencyDirectory as never,
      multiTaxiService,
      reportingFilingService,
      {} as never,
      {} as never,
    );

    const exporterIdentity: BootstrapRequestIdentity = {
      authMode: "jwt_bearer",
      actorType: "agency_user",
      actorId: "principal-exporter-tpe",
      principalId: "principal-exporter-tpe",
      membershipId: "membership-exporter-tpe",
      sessionId: "sess-exporter-tpe",
      realm: "agency",
      tenantId: null,
      agencyId: "agency_taipei",
      roleFamilies: ["agency"],
      roles: ["agency_exporter"],
      scopes: ["agency:trip_records:read", "agency:trip_records:export"],
      requestId: "req-agency-list-1",
    };

    const otherAgencyIdentity: BootstrapRequestIdentity = {
      ...exporterIdentity,
      actorId: "principal-exporter-ntpc",
      principalId: "principal-exporter-ntpc",
      membershipId: "membership-exporter-ntpc",
      agencyId: "agency_new_taipei",
    };

    // 1. List with exact plateNo + date range + orderNo returns only the retained record
    const listPage = await agencyPortalService.listTripRecords(
      exporterIdentity,
      {
        reservedFrom: "2026-10-01",
        reservedTo: "2026-10-31",
        plateNo: "TPE-8899",
        orderNo: "MTX-20261025-001",
      },
      {
        requestId: "req-agency-list-1",
        sourceIp: "203.0.113.10",
        userAgent: "AgencyBrowser/1.0",
      },
    );

    expect(listPage.total).toBe(1);
    expect(listPage.items).toHaveLength(1);
    expect(listPage.items[0]).toMatchObject({
      recordId: "mtr-order-r11-tx-001",
      orderId: "order-r11-tx-001",
      tripId: "task-r11-tx-001",
      plateNo: "TPE-8899",
      reservedAt: "2026-10-20T09:00:00.000Z",
      pickupAt: "2026-10-20T09:05:00.000Z",
      dropoffAt: "2026-10-20T09:32:00.000Z",
      route: {
        routeSummary:
          "台北市中正區北平西路3號（台北車站） → 台北市松山區敦化北路340之9號（松山機場）",
        source: "pickup_dropoff_summary",
        distanceMeters: 6450,
        durationSeconds: 1620,
      },
      payableFareMinor: 32000,
      actualFareMinor: 36500,
      collectedFareMinor: 36500,
      paymentStatus: "captured",
      tollMinor: 4000,
      tollSource: "driver_proof",
    });
    expect(JSON.stringify(listPage.items[0])).not.toContain(
      "secret_raw_polyline_points_xyz",
    );

    // 2. Detail lookup returns the same statutory fields for retained record, 404 for expired
    const detail = await agencyPortalService.getTripRecord(
      exporterIdentity,
      "mtr-order-r11-tx-001",
      { requestId: "req-agency-detail-1" },
    );
    expect(detail.plateNo).toBe("TPE-8899");
    expect(detail.route.routeSummary).toContain("台北車站");
    expect(detail.collectedFareMinor).toBe(36500);
    expect(detail.tollMinor).toBe(4000);

    await expect(
      agencyPortalService.getTripRecord(
        exporterIdentity,
        "mtr-order-expired-old",
        { requestId: "req-agency-detail-expired" },
      ),
    ).rejects.toMatchObject({ code: "AGENCY_TRIP_RECORD_NOT_FOUND" });

    // 3. Export preview & create with the exact same filter range
    const exportScope = {
      reservedFrom: "2026-10-01",
      reservedTo: "2026-10-31",
      plateNo: "TPE-8899",
      orderNo: "MTX-20261025-001",
    };
    const preview = await agencyPortalService.previewTripExport(
      exporterIdentity,
      { scope: exportScope },
      { requestId: "req-agency-export-preview-1" },
    );
    expect(preview.recordCount).toBe(1);
    expect(preview.scope).toEqual(exportScope);

    const accepted = await agencyPortalService.createTripExport(
      exporterIdentity,
      {
        scope: exportScope,
        purpose: "臺北市政府交通局 R11 逐趟營運紀錄查核下載",
        idempotencyKey: "idem-r11-agency-export-001",
      },
      { requestId: "req-agency-export-create-1" },
    );
    await flushBackgroundWork();

    const jobView = await agencyPortalService.getTripExportJob(
      exporterIdentity,
      accepted.jobId,
      { requestId: "req-agency-export-status-1" },
    );
    expect(jobView.status).toBe("completed");
    expect(jobView.recordCount).toBe(1);

    // Cross-agency isolation: another agency cannot read or download this export job
    await expect(
      agencyPortalService.getTripExportJob(
        otherAgencyIdentity,
        accepted.jobId,
        { requestId: "req-other-agency-status" },
      ),
    ).rejects.toMatchObject({ code: "MULTI_TAXI_EXPORT_JOB_NOT_FOUND" });

    const download = await agencyPortalService.issueTripExportDownload(
      exporterIdentity,
      accepted.jobId,
      { requestId: "req-agency-export-download-1" },
    );
    expect(download.download.downloadUrl).toContain("sig=");

    // Verify rendered CSV contains all 9 statutory field categories and provenance
    const storedJob = filingState.reportJobs.find(
      (j) => j.jobId === accepted.jobId,
    );
    const csv = recordsToCsv(
      (storedJob?.rows ?? []) as unknown as Record<string, unknown>[],
    );
    expect(csv).toContain(
      '"recordId","orderId","tripId","orderNoMasked","plateNo","plateNoMasked","reservedAt","pickupAt","dropoffAt","routeSummary","routeSource","distanceMeters","durationSeconds","payableFareMinor","actualFareMinor","collectedFareMinor","paymentStatus","tollMinor","tollSource","currency","farePolicyVersion","chargingMode","generatedAt","retainUntil"',
    );
    expect(csv).toContain("TPE-8899");
    expect(csv).toContain(
      "台北市中正區北平西路3號（台北車站） → 台北市松山區敦化北路340之9號（松山機場）",
    );
    expect(csv).toContain("pickup_dropoff_summary");
    expect(csv).toContain("6450");
    expect(csv).toContain(
      '"32000","36500","36500","captured","4000","driver_proof"',
    );
    expect(csv).not.toContain("secret_raw_polyline_points_xyz");

    // Verify agency access audit log entries were recorded for list, detail, preview, create, status, download
    const loggedActions = (await accessLogs.list({})).items.map(
      (item) => `${item.action}:${item.outcome}`,
    );
    expect(loggedActions).toEqual(
      expect.arrayContaining([
        "list:success",
        "detail:success",
        "detail:denied",
        "export_preview:success",
        "export_create:success",
        "export_status:success",
        "export_status:denied",
        "export_download:success",
      ]),
    );
  });
});

// Formal PostgreSQL migration & trigger verification for V0135.
// Runs in CI Product smoke acceptance after db:migrate; skipped on local VM without DATABASE_URL.
describe.skipIf(!process.env.DATABASE_URL)(
  "INT-P5-R11 PostgreSQL schema & trigger verification (V0135)",
  () => {
    const database = new DatabaseService();
    const repository = new MultiTaxiRepository(database);
    const suffix = randomUUID().replace(/-/g, "").slice(0, 12);
    const orderId = `ord_r11_pg_${suffix}`;
    const recordId = `mtr-${orderId}`;
    const paymentId = `pay_r11_pg_${suffix}`;

    afterAll(async () => {
      try {
        const client = await database.connect();
        try {
          await client.query("BEGIN");
          await client.query(
            "DELETE FROM voice.legal_hold WHERE subject_ref = $1",
            [orderId],
          );
          await client.query(
            "DELETE FROM billing.multi_taxi_passenger_payments WHERE order_id = $1",
            [orderId],
          );
          await client.query("COMMIT");
        } catch {
          await client.query("ROLLBACK");
        } finally {
          client.release();
        }
      } finally {
        await database.onModuleDestroy();
      }
    });

    it("enforces payment collection synchronization, core immutability, and 730-day + legal-hold deletion guard in PostgreSQL", async () => {
      await repository.upsertTripOperationalRecord({
        recordId,
        orderId,
        orderNo: `MTX-PG-${suffix}`,
        tripId: `trip-${suffix}`,
        assignmentId: `asg-${suffix}`,
        vehicleId: `veh-${suffix}`,
        plateNo: "TPE-7788",
        reservedAt: "2026-10-20T08:00:00.000Z",
        pickupAt: "2026-10-20T08:05:00.000Z",
        dropoffAt: "2026-10-20T08:35:00.000Z",
        route: {
          encodedPolyline: null,
          pointCount: 0,
          distanceMeters: 7200,
          durationSeconds: 1800,
          source: "pickup_dropoff_summary",
          routeSummary: "PG Start → PG End",
        },
        payableFareMinor: 30000,
        actualFareMinor: 31000,
        collectedFareMinor: null,
        paymentStatus: "unknown",
        tollMinor: 2000,
        tollSource: "driver_proof",
        currency: "TWD",
        farePolicyVersion: "multi-taxi-v1",
        chargingMode: "meter",
        generatedAt: "2026-10-20T08:35:00.000Z",
        retainUntil: "2028-10-19T08:35:00.000Z",
      });

      // Insert captured payment -> trigger updates collected_fare_minor and payment_status
      await database.query(
        `
        INSERT INTO billing.multi_taxi_passenger_payments (
          payment_id, order_id, status, amount_minor, currency
        ) VALUES ($1, $2, 'captured', 31000, 'TWD')
        `,
        [paymentId, orderId],
      );
      const afterCapture =
        await repository.findTripOperationalRecordById(recordId);
      expect(afterCapture?.paymentStatus).toBe("captured");
      expect(afterCapture?.collectedFareMinor).toBe(31000);

      // Update payment to refunded -> trigger sets collected_fare_minor = 0
      await database.query(
        `
        UPDATE billing.multi_taxi_passenger_payments
        SET status = 'refunded'
        WHERE payment_id = $1
        `,
        [paymentId],
      );
      const afterRefund =
        await repository.findTripOperationalRecordById(recordId);
      expect(afterRefund?.paymentStatus).toBe("refunded");
      expect(afterRefund?.collectedFareMinor).toBe(0);

      // Attempt to shorten retain_until or delete before 2-year expiry -> rejected by DB trigger
      await expect(
        database.query(
          `UPDATE reporting.multi_taxi_trip_operational_records SET retain_until = generated_at + interval '10 days' WHERE record_id = $1`,
          [recordId],
        ),
      ).rejects.toThrow();

      await expect(
        database.query(
          `DELETE FROM reporting.multi_taxi_trip_operational_records WHERE record_id = $1`,
          [recordId],
        ),
      ).rejects.toThrow();
    });
  },
);
