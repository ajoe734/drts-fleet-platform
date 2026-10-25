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
import { recordsToCsv } from "../../src/common/csv";
import { DatabaseService } from "../../src/common/db";
import { OpsDispatchEventsService } from "../../src/common/ops-dispatch-events.service";
import { AgencyAccessAuditService } from "../../src/modules/agency-access/agency-access-audit.service";
import { AgencyAccessLogRepository } from "../../src/modules/agency-access/agency-access-log.repository";
import { AgencyPortalService } from "../../src/modules/agency-access/agency-portal.service";
import { AuditNotificationService } from "../../src/modules/audit-notification/audit-notification.service";
import {
  MultiTaxiRepository,
  computeTwoCalendarYearRetentionFloorIso,
  computeTwoCalendarYearRetentionFloorMs,
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

interface SimulatedTelemetrySample {
  event_id: string;
  driver_id: string;
  vehicle_id: string | null;
  task_id: string | null;
  latitude: number;
  longitude: number;
  accuracy_m: number | null;
  recorded_at: string;
  received_at: string;
  work_state: string;
  out_of_order: boolean;
}

interface SimulatedDbState {
  tripRecordsByOrderId: Map<string, Record<string, unknown>>;
  paymentsByOrderId: Map<
    string,
    { status: string; amount_minor: number | null }
  >;
  ordersByOrderId: Map<string, { order_no: string }>;
  driverTasksByTaskId: Map<
    string,
    {
      task_id: string;
      order_id: string;
      assignment_id: string | null;
      status: string;
      updated_at: string;
      record: { driverId?: string | null; vehicleId?: string | null };
    }
  >;
  telemetryEvents: SimulatedTelemetrySample[];
  activeDbHolds: Set<string>;
}

/**
 * Transactional SQL executor simulating the V0056 + V0135
 * `reporting.multi_taxi_trip_operational_records` + `billing.multi_taxi_passenger_payments`
 * + `ops.phase1_driver_tasks` + `telemetry.driver_location_events`
 * tables with atomic transaction staging & rollback semantics.
 */
function createTransactionalDbHarness() {
  const committed: SimulatedDbState = {
    tripRecordsByOrderId: new Map(),
    paymentsByOrderId: new Map(),
    ordersByOrderId: new Map(),
    driverTasksByTaskId: new Map(),
    telemetryEvents: [],
    activeDbHolds: new Set(),
  };

  function executeQueryAgainstState(
    state: SimulatedDbState,
    allowPurge: boolean,
    sql: string,
    values: readonly unknown[] = [],
    retentionNowIso?: string,
  ): { rows: any[]; rowCount: number } {
    const normalizedSql = sql.replace(/\s+/g, " ").trim();

    if (
      normalizedSql.includes("FROM ops.phase1_driver_tasks dt") &&
      normalizedSql.includes("LEFT JOIN telemetry.driver_location_events e")
    ) {
      const [orderId, fallbackDriverId, vehicleId, lookupId] = values as [
        string,
        string | null,
        string,
        string | null,
        string,
        string,
      ];
      const matchingTasks = [...state.driverTasksByTaskId.values()].filter(
        (dt) =>
          dt.order_id === orderId &&
          dt.status === "completed" &&
          (!lookupId ||
            dt.assignment_id === lookupId ||
            dt.task_id === lookupId) &&
          (!dt.record.vehicleId || dt.record.vehicleId === vehicleId),
      );
      const authTask = matchingTasks[0];
      if (!authTask) {
        return { rows: [], rowCount: 0 };
      }
      const authDriverId = authTask.record.driverId ?? fallbackDriverId ?? null;
      const authVehicleId = authTask.record.vehicleId ?? vehicleId;
      if (state.telemetryEvents.length === 0) {
        return {
          rows: [
            {
              authoritative_task_id: authTask.task_id,
              authoritative_driver_id: authDriverId,
              authoritative_vehicle_id: authVehicleId,
              event_id: null,
              driver_id: null,
              vehicle_id: null,
              task_id: null,
              latitude: null,
              longitude: null,
              accuracy_m: null,
              recorded_at: null,
              received_at: null,
              work_state: null,
              out_of_order: null,
            },
          ],
          rowCount: 1,
        };
      }
      const rows = state.telemetryEvents.map((e) => ({
        authoritative_task_id: authTask.task_id,
        authoritative_driver_id: authDriverId,
        authoritative_vehicle_id: authVehicleId,
        ...structuredClone(e),
      }));
      return { rows, rowCount: rows.length };
    }

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

      const retentionFloorMs = computeTwoCalendarYearRetentionFloorMs(generatedAt);
      if (Date.parse(retainUntil) < retentionFloorMs) {
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
      const preserveTelemetryRoute =
        existing &&
        (existing.route_source === "driver_gps" ||
          existing.route_source === "mixed") &&
        routeSource !== "driver_gps" &&
        routeSource !== "mixed";
      const existingRecordObj = (existing?.record ?? {}) as Record<
        string,
        unknown
      >;
      const mergedRecordObj = { ...existingRecordObj, ...parsedJson };
      if (preserveTelemetryRoute && existingRecordObj.route) {
        mergedRecordObj.route = existingRecordObj.route;
      }
      const existingGeneratedAt = String(existing?.generated_at ?? generatedAt);
      const effectiveFloorIso =
        computeTwoCalendarYearRetentionFloorIso(existingGeneratedAt);
      const effectiveRetainUntil = existing
        ? [retainUntil, String(existing.retain_until), effectiveFloorIso].reduce(
            (latest, candidate) =>
              Date.parse(candidate) > Date.parse(latest) ? candidate : latest,
            effectiveFloorIso,
          )
        : Date.parse(retainUntil) > Date.parse(effectiveFloorIso)
          ? retainUntil
          : effectiveFloorIso;

      if (existing) {
        const preservedTripId = String(existing.trip_id || tripId);
        const preservedVehicleId = String(existing.vehicle_id || vehicleId);
        const preservedPlateNo =
          existing.plate_no && existing.plate_no !== "UNRECORDED"
            ? String(existing.plate_no)
            : plateNo;
        const preservedReservedAt = String(existing.reserved_at || reservedAt);
        const preservedPickupAt = existing.pickup_at ?? pickupAt;
        const preservedDropoffAt = existing.dropoff_at ?? dropoffAt;
        mergedRecordObj.tripId = preservedTripId;
        mergedRecordObj.vehicleId = preservedVehicleId;
        mergedRecordObj.plateNo = preservedPlateNo;
        mergedRecordObj.reservedAt = preservedReservedAt;
        mergedRecordObj.pickupAt = preservedPickupAt;
        mergedRecordObj.dropoffAt = preservedDropoffAt;
        mergedRecordObj.retainUntil = effectiveRetainUntil;
      } else {
        parsedJson.retainUntil = effectiveRetainUntil;
      }

      const row: Record<string, unknown> = existing
        ? {
            ...existing,
            order_no: orderNo ?? existing.order_no,
            trip_id: existing.trip_id || tripId,
            assignment_id: assignmentId ?? existing.assignment_id,
            vehicle_id: existing.vehicle_id || vehicleId,
            plate_no:
              existing.plate_no && existing.plate_no !== "UNRECORDED"
                ? existing.plate_no
                : plateNo,
            reserved_at: existing.reserved_at || reservedAt,
            pickup_at: existing.pickup_at ?? pickupAt,
            dropoff_at: existing.dropoff_at ?? dropoffAt,
            route_summary: routeSummary ?? existing.route_summary,
            route_source:
              routeSource === "driver_gps" || routeSource === "mixed"
                ? routeSource
                : preserveTelemetryRoute
                  ? existing.route_source
                  : routeSource !== "unavailable"
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
            record: mergedRecordObj,
            retain_until: effectiveRetainUntil,
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
            retain_until: effectiveRetainUntil,
          };

      state.tripRecordsByOrderId.set(orderId, row);
      return { rows: [structuredClone(row)], rowCount: 1 };
    }

    if (
      normalizedSql.includes(
        "FROM reporting.multi_taxi_trip_operational_records r",
      ) &&
      normalizedSql.includes("<= $1::timestamptz")
    ) {
      const cutoffMs = Date.parse(String(values[0]));
      const rows = [...state.tripRecordsByOrderId.values()]
        .filter((row) => {
          const retainMs = Date.parse(String(row.retain_until));
          const floorMs = computeTwoCalendarYearRetentionFloorMs(
            String(row.generated_at),
          );
          return Math.max(retainMs, floorMs) <= cutoffMs;
        })
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
      const effectiveFloorMs = Math.max(
        Date.parse(String(row.retain_until)),
        computeTwoCalendarYearRetentionFloorMs(String(row.generated_at)),
      );
      const referenceNowMs =
        allowPurge &&
        retentionNowIso &&
        Number.isFinite(Date.parse(retentionNowIso))
          ? Date.parse(retentionNowIso)
          : Date.now();
      if (effectiveFloorMs > referenceNowMs) {
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
      let retentionNowIso: string | undefined;
      return {
        query: vi.fn(async (sql: string, values?: readonly unknown[]) => {
          const trimmed = sql.trim().toUpperCase();
          if (trimmed === "BEGIN") {
            staged = structuredClone(committed);
            allowPurge = false;
            retentionNowIso = undefined;
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
          if (
            trimmed.includes(
              "SELECT SET_CONFIG('REPORTING.TRIP_RECORD_RETENTION_NOW'",
            )
          ) {
            retentionNowIso =
              typeof values?.[0] === "string" ? values[0] : undefined;
            return { rows: [], rowCount: 1 };
          }
          if (trimmed === "COMMIT") {
            committed.tripRecordsByOrderId = staged.tripRecordsByOrderId;
            committed.paymentsByOrderId = staged.paymentsByOrderId;
            committed.ordersByOrderId = staged.ordersByOrderId;
            committed.driverTasksByTaskId = staged.driverTasksByTaskId;
            committed.telemetryEvents = staged.telemetryEvents;
            committed.activeDbHolds = staged.activeDbHolds;
            return { rows: [], rowCount: 0 };
          }
          if (trimmed === "__STAGE_DRIVER_TASK__") {
            const dt = values?.[0] as DriverTaskRecord;
            if (dt) {
              staged.driverTasksByTaskId.set(dt.taskId, {
                task_id: dt.taskId,
                order_id: dt.orderId,
                assignment_id: dt.assignmentId,
                status: dt.status,
                updated_at: dt.updatedAt,
                record: {
                  driverId: dt.driverId,
                  vehicleId: dt.vehicleId,
                },
              });
            }
            return { rows: [], rowCount: 1 };
          }
          if (trimmed === "ROLLBACK") {
            staged = structuredClone(committed);
            allowPurge = false;
            retentionNowIso = undefined;
            return { rows: [], rowCount: 0 };
          }
          return executeQueryAgainstState(
            staged,
            allowPurge,
            sql,
            values,
            retentionNowIso,
          );
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
          await tx.query("__STAGE_DRIVER_TASK__", [payload.driverTasks[0]]);
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
      retainUntil: "2028-10-20T09:32:00.000Z",
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

    // Case C: captured -> collectedFareMinor equals captured amount while actualFareMinor remains immutable
    env.db.setPaymentOutcome(env.order.orderId, "captured", 35000);
    record = await readerService.getTripOperationalRecord(
      "mtr-order-r11-tx-001",
    );
    expect(record?.paymentStatus).toBe("captured");
    expect(record?.payableFareMinor).toBe(32000);
    expect(record?.actualFareMinor).toBe(36500);
    expect(record?.collectedFareMinor).toBe(35000);

    // Case D: refunded -> collectedFareMinor equals 0 (never positive)
    env.db.setPaymentOutcome(env.order.orderId, "refunded", 35000);
    record = await readerService.getTripOperationalRecord(
      "mtr-order-r11-tx-001",
    );
    expect(record?.paymentStatus).toBe("refunded");
    expect(record?.actualFareMinor).toBe(36500);
    expect(record?.collectedFareMinor).toBe(0);

    // Case E: Legacy completed order without committed R11 row, without task.startedAt,
    // and without toll proof -> reconciles without inventing pickupAt or numeric 0 toll
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
        encodedPolyline: "est_poly",
        pointCount: 0,
        distanceMeters: 8100,
        durationSeconds: 1400,
        source: "provider_route", // Honestly labeled as estimated provider route
      },
      payableFareMinor: 29000,
      collectedFareMinor: null,
      paymentStatus: "unknown",
      tollMinor: null,
      tollSource: "unavailable",
    });
  });

  it("enforces two-calendar-year retention floor across leap years, blocks early deletion at the 730-day mark, preserves longer retainUntil and core facts, and respects active legal holds", async () => {
    const env = setupCompletionEnvironment();
    await env.ownedMobilityService.completeDriverTask(
      env.task.taskId,
      {
        completedAt: "2026-10-25T02:00:00.000Z",
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

    const multiTaxiService = new MultiTaxiService(
      { listOrders: () => [] } as never,
      env.multiTaxiRepository,
      undefined,
      env.auditNotificationService,
    );

    const committedRecord = await multiTaxiService.getTripOperationalRecord(
      "mtr-order-r11-tx-001",
    );
    expect(committedRecord?.generatedAt).toBe("2026-10-25T02:00:00.000Z");
    expect(committedRecord?.retainUntil).toBe("2028-10-25T02:00:00.000Z");
    expect(committedRecord?.tollMinor).toBe(0);
    expect(committedRecord?.tollSource).toBe("none");

    // 1. Direct early deletion before 2-year expiry is rejected by the DB guard
    expect(() =>
      env.db.executeDirectQuery(
        "DELETE FROM reporting.multi_taxi_trip_operational_records WHERE record_id = $1",
        ["mtr-order-r11-tx-001"],
      ),
    ).toThrow(/cannot be deleted before 2-year retention expiry/);

    // 2. At 2028-10-24T02:00:00.000Z (fixed 730d across 2028 leap year, 1 day short of 2 calendar years),
    //    the record is NOT expired, remains undeletable by retention sweep, and stays queryable.
    const fixed730Sweep =
      await multiTaxiService.purgeExpiredTripOperationalRecords(
        "2028-10-24T02:00:00.000Z",
      );
    expect(fixed730Sweep.purgedRecordIds).toEqual([]);
    expect(
      await multiTaxiService.getTripOperationalRecord("mtr-order-r11-tx-001"),
    ).not.toBeNull();

    // 2b. Verify non-leap control (2028-03-01 -> 2030-03-01), leap-day start (2028-02-29 -> 2030-03-01),
    //     longer existing retainUntil preservation, and core fact immutability on upsert.
    const nonLeapControl =
      await env.multiTaxiRepository.upsertTripOperationalRecord({
        ...committedRecord!,
        recordId: "mtr-order-r11-nonleap-ctrl",
        orderId: "order-r11-nonleap-ctrl",
        orderNo: "MTX-R11-NONLEAP",
        tripId: "task-r11-nonleap-ctrl",
        generatedAt: "2028-03-01T02:00:00.000Z",
        retainUntil: "2028-03-01T02:00:00.000Z",
      });
    expect(nonLeapControl.retainUntil).toBe("2030-03-01T02:00:00.000Z");

    const leapDayStart =
      await env.multiTaxiRepository.upsertTripOperationalRecord({
        ...committedRecord!,
        recordId: "mtr-order-r11-leapday-start",
        orderId: "order-r11-leapday-start",
        orderNo: "MTX-R11-LEAPDAY",
        tripId: "task-r11-leapday-start",
        generatedAt: "2028-02-29T02:00:00.000Z",
        retainUntil: "2030-02-28T02:00:00.000Z",
      });
    expect(leapDayStart.retainUntil).toBe("2030-03-01T02:00:00.000Z");

    const extendedRetention =
      await env.multiTaxiRepository.upsertTripOperationalRecord({
        ...committedRecord!,
        retainUntil: "2031-01-01T00:00:00.000Z",
      });
    expect(extendedRetention.retainUntil).toBe("2031-01-01T00:00:00.000Z");

    const shortenAndTamperAttempt =
      await env.multiTaxiRepository.upsertTripOperationalRecord({
        ...committedRecord!,
        plateNo: "TAMPER-9999",
        vehicleId: "veh-tamper-999",
        tripId: "task-tamper-999",
        reservedAt: "2020-01-01T00:00:00.000Z",
        pickupAt: "2020-01-01T00:05:00.000Z",
        dropoffAt: "2020-01-01T00:10:00.000Z",
        retainUntil: "2028-10-25T02:00:00.000Z",
      });
    expect(shortenAndTamperAttempt.retainUntil).toBe("2031-01-01T00:00:00.000Z");
    expect(shortenAndTamperAttempt.plateNo).toBe("TPE-8899");
    expect(shortenAndTamperAttempt.vehicleId).toBe("vehicle-r11-001");
    expect(shortenAndTamperAttempt.tripId).toBe("task-r11-tx-001");
    expect(shortenAndTamperAttempt.reservedAt).toBe("2026-10-20T09:00:00.000Z");
    expect(shortenAndTamperAttempt.pickupAt).toBe("2026-10-20T09:05:00.000Z");
    expect(shortenAndTamperAttempt.dropoffAt).toBe("2026-10-25T02:00:00.000Z");

    // 3. After extended retention expiry (2031-02-01), an active legal hold blocks purge
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
      "2031-02-01T00:00:00.000Z",
    );
    expect(heldSweep.purgedRecordIds).toEqual([
      "mtr-order-r11-nonleap-ctrl",
      "mtr-order-r11-leapday-start",
    ]);
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
        "2031-02-01T00:00:00.000Z",
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

  it("evaluates durable telemetry.driver_location_events for authoritative task/driver/vehicle/time-window/accuracy/gaps and retains the GPS snapshot across 730 days", async () => {
    // 1. Full sampled route (driver_gps): >= 2 valid samples within [pickupAt, dropoffAt] with max gap <= 180s
    //    Includes a null vehicle_id sample resolved from authoritative task ownership, while rejecting
    //    wrong driver_id, wrong task_id, conflicting vehicle_id, out-of-window, work_state != 'on_trip',
    //    out_of_order = true, and accuracy_m > 200.
    const fullGpsEnv = setupCompletionEnvironment();
    fullGpsEnv.task.startedAt = "2026-10-20T09:05:00.000Z";
    fullGpsEnv.db.committed.telemetryEvents = [
      // Valid #1: explicit matching vehicle_id
      {
        event_id: "evt-valid-1",
        driver_id: "driver-r11-001",
        vehicle_id: "vehicle-r11-001",
        task_id: "task-r11-tx-001",
        latitude: 25.0478,
        longitude: 121.517,
        accuracy_m: 12,
        recorded_at: "2026-10-20T09:05:30.000Z",
        received_at: "2026-10-20T09:05:31.000Z",
        work_state: "on_trip",
        out_of_order: false,
      },
      // Valid #2: null vehicle_id resolved from authoritative task ownership (vehicle-r11-001)
      {
        event_id: "evt-valid-2-null-veh",
        driver_id: "driver-r11-001",
        vehicle_id: null,
        task_id: "task-r11-tx-001",
        latitude: 25.055,
        longitude: 121.534,
        accuracy_m: 18,
        recorded_at: "2026-10-20T09:07:30.000Z",
        received_at: "2026-10-20T09:07:31.000Z",
        work_state: "on_trip",
        out_of_order: false,
      },
      // Valid #3: near dropoff (09:09:30, dropoff at 09:10:00 -> max gap 120s <= 180s)
      {
        event_id: "evt-valid-3",
        driver_id: "driver-r11-001",
        vehicle_id: "vehicle-r11-001",
        task_id: "task-r11-tx-001",
        latitude: 25.063,
        longitude: 121.5517,
        accuracy_m: 9,
        recorded_at: "2026-10-20T09:09:30.000Z",
        received_at: "2026-10-20T09:09:31.000Z",
        work_state: "on_trip",
        out_of_order: false,
      },
      // Rejected: conflicting vehicle_id
      {
        event_id: "evt-reject-conflict-vehicle",
        driver_id: "driver-r11-001",
        vehicle_id: "vehicle-other-999",
        task_id: "task-r11-tx-001",
        latitude: 24.999,
        longitude: 121.999,
        accuracy_m: 10,
        recorded_at: "2026-10-20T09:06:00.000Z",
        received_at: "2026-10-20T09:06:01.000Z",
        work_state: "on_trip",
        out_of_order: false,
      },
      // Rejected: wrong task_id
      {
        event_id: "evt-reject-wrong-task",
        driver_id: "driver-r11-001",
        vehicle_id: "vehicle-r11-001",
        task_id: "task-other-999",
        latitude: 24.888,
        longitude: 121.888,
        accuracy_m: 10,
        recorded_at: "2026-10-20T09:06:30.000Z",
        received_at: "2026-10-20T09:06:31.000Z",
        work_state: "on_trip",
        out_of_order: false,
      },
      // Rejected: out_of_order = true
      {
        event_id: "evt-reject-out-of-order",
        driver_id: "driver-r11-001",
        vehicle_id: "vehicle-r11-001",
        task_id: "task-r11-tx-001",
        latitude: 24.777,
        longitude: 121.777,
        accuracy_m: 10,
        recorded_at: "2026-10-20T09:07:00.000Z",
        received_at: "2026-10-20T09:08:00.000Z",
        work_state: "on_trip",
        out_of_order: true,
      },
      // Rejected: work_state != 'on_trip'
      {
        event_id: "evt-reject-work-state",
        driver_id: "driver-r11-001",
        vehicle_id: "vehicle-r11-001",
        task_id: "task-r11-tx-001",
        latitude: 24.666,
        longitude: 121.666,
        accuracy_m: 10,
        recorded_at: "2026-10-20T09:08:00.000Z",
        received_at: "2026-10-20T09:08:01.000Z",
        work_state: "available",
        out_of_order: false,
      },
      // Rejected: accuracy_m > 100
      {
        event_id: "evt-reject-low-accuracy",
        driver_id: "driver-r11-001",
        vehicle_id: "vehicle-r11-001",
        task_id: "task-r11-tx-001",
        latitude: 24.555,
        longitude: 121.555,
        accuracy_m: 150,
        recorded_at: "2026-10-20T09:08:30.000Z",
        received_at: "2026-10-20T09:08:31.000Z",
        work_state: "on_trip",
        out_of_order: false,
      },
      // Rejected: outside [pickupAt, dropoffAt] window
      {
        event_id: "evt-reject-before-pickup",
        driver_id: "driver-r11-001",
        vehicle_id: "vehicle-r11-001",
        task_id: "task-r11-tx-001",
        latitude: 24.444,
        longitude: 121.444,
        accuracy_m: 10,
        recorded_at: "2026-10-20T09:03:00.000Z",
        received_at: "2026-10-20T09:03:01.000Z",
        work_state: "on_trip",
        out_of_order: false,
      },
    ];

    await fullGpsEnv.ownedMobilityService.completeDriverTask(
      fullGpsEnv.task.taskId,
      {
        completedAt: "2026-10-20T09:10:00.000Z",
        actualDistanceKm: 6.45,
        actualDurationSec: 300,
        fare: { currency: "TWD", amountMinor: 25000 },
        proof: {
          photos: [],
          signatureId: "sig-gps-1",
          expenseItems: [],
        },
      },
      "req-complete-gps-full",
    );

    const [fullGpsRecord] =
      await fullGpsEnv.multiTaxiRepository.listTripOperationalRecords();
    expect(fullGpsRecord?.route).toMatchObject({
      source: "driver_gps",
      pointCount: 3,
      encodedPolyline:
        "25.047800,121.517000;25.055000,121.534000;25.063000,121.551700",
      distanceMeters: 6450,
      durationSeconds: 300,
      telemetryProvenance: {
        sampleTable: "telemetry.driver_location_events",
        driverId: "driver-r11-001",
        taskId: "task-r11-tx-001",
        vehicleId: "vehicle-r11-001",
        validSampleCount: 3,
        nullVehicleSampleCount: 1,
        maxGapSeconds: 120,
        coverage: "full_sampled",
      },
    });

    // Pruning raw telemetry.driver_location_events later and replaying upsert
    // must NOT downgrade the retained 730-day R11 GPS snapshot!
    fullGpsEnv.db.committed.telemetryEvents = [];
    const afterTelemetryPrune =
      await fullGpsEnv.multiTaxiRepository.upsertTripOperationalRecord({
        ...fullGpsRecord!,
        route: {
          ...fullGpsRecord!.route,
          source: "pickup_dropoff_summary",
          pointCount: 0,
          encodedPolyline: null,
          telemetryProvenance: undefined,
        },
      });
    expect(afterTelemetryPrune.route.source).toBe("driver_gps");
    expect(afterTelemetryPrune.route.pointCount).toBe(3);
    expect(afterTelemetryPrune.route.encodedPolyline).toBe(
      "25.047800,121.517000;25.055000,121.534000;25.063000,121.551700",
    );
    expect(afterTelemetryPrune.route.telemetryProvenance?.coverage).toBe(
      "full_sampled",
    );

    // 2. Single-point sample: labeled "mixed" with pointCount = 1 and encodedPolyline = null
    const singlePointEnv = setupCompletionEnvironment();
    singlePointEnv.db.committed.telemetryEvents = [
      {
        event_id: "evt-single-1",
        driver_id: "driver-r11-001",
        vehicle_id: "vehicle-r11-001",
        task_id: "task-r11-tx-001",
        latitude: 25.051,
        longitude: 121.525,
        accuracy_m: 15,
        recorded_at: "2026-10-20T09:15:00.000Z",
        received_at: "2026-10-20T09:15:01.000Z",
        work_state: "on_trip",
        out_of_order: false,
      },
    ];
    await singlePointEnv.ownedMobilityService.completeDriverTask(
      singlePointEnv.task.taskId,
      {
        completedAt: "2026-10-20T09:32:00.000Z",
        actualDistanceKm: 6.45,
        actualDurationSec: 1620,
        fare: { currency: "TWD", amountMinor: 36500 },
        proof: { photos: [], signatureId: "sig-single", expenseItems: [] },
      },
      "req-complete-gps-single",
    );
    const [singlePointRecord] =
      await singlePointEnv.multiTaxiRepository.listTripOperationalRecords();
    expect(singlePointRecord?.route).toMatchObject({
      source: "mixed",
      pointCount: 1,
      encodedPolyline: null,
      telemetryProvenance: {
        validSampleCount: 1,
        coverage: "single_point",
      },
    });

    // 3. Gapped samples (> 180s gap): labeled "mixed" (gapped_sampled), never claiming full-route driver_gps
    const gappedEnv = setupCompletionEnvironment();
    gappedEnv.db.committed.telemetryEvents = [
      {
        event_id: "evt-gap-1",
        driver_id: "driver-r11-001",
        vehicle_id: "vehicle-r11-001",
        task_id: "task-r11-tx-001",
        latitude: 25.048,
        longitude: 121.518,
        accuracy_m: 10,
        recorded_at: "2026-10-20T09:06:00.000Z",
        received_at: "2026-10-20T09:06:01.000Z",
        work_state: "on_trip",
        out_of_order: false,
      },
      {
        event_id: "evt-gap-2",
        driver_id: "driver-r11-001",
        vehicle_id: "vehicle-r11-001",
        task_id: "task-r11-tx-001",
        latitude: 25.062,
        longitude: 121.55,
        accuracy_m: 10,
        recorded_at: "2026-10-20T09:30:00.000Z",
        received_at: "2026-10-20T09:30:01.000Z",
        work_state: "on_trip",
        out_of_order: false,
      },
    ];
    await gappedEnv.ownedMobilityService.completeDriverTask(
      gappedEnv.task.taskId,
      {
        completedAt: "2026-10-20T09:32:00.000Z",
        actualDistanceKm: 6.45,
        actualDurationSec: 1620,
        fare: { currency: "TWD", amountMinor: 36500 },
        proof: { photos: [], signatureId: "sig-gap", expenseItems: [] },
      },
      "req-complete-gps-gapped",
    );
    const [gappedRecord] =
      await gappedEnv.multiTaxiRepository.listTripOperationalRecords();
    expect(gappedRecord?.route).toMatchObject({
      source: "mixed",
      pointCount: 2,
      encodedPolyline: "25.048000,121.518000;25.062000,121.550000",
      telemetryProvenance: {
        validSampleCount: 2,
        maxGapSeconds: 1440,
        coverage: "gapped_sampled",
      },
    });
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
    const nonLeapOrderId = `ord_r11_pg_nl_${suffix}`;
    const nonLeapRecordId = `mtr-${nonLeapOrderId}`;
    const leapDayOrderId = `ord_r11_pg_ld_${suffix}`;
    const leapDayRecordId = `mtr-${leapDayOrderId}`;
    const paymentId = `pay_r11_pg_${suffix}`;
    const taskId = `task_r11_pg_${suffix}`;
    const driverId = `drv_r11_pg_${suffix}`;
    const vehicleId = `veh_r11_pg_${suffix}`;
    const deviceId = `dev_pg_${suffix}`;

    afterAll(async () => {
      try {
        const client = await database.connect();
        try {
          await client.query("BEGIN");
          await client.query(
            "DELETE FROM telemetry.driver_location_events WHERE driver_id = $1",
            [driverId],
          );
          await client.query(
            "DELETE FROM ops.phase1_driver_tasks WHERE task_id = $1",
            [taskId],
          );
          await client.query(
            "DELETE FROM voice.legal_hold WHERE subject_ref = ANY($1::text[])",
            [[orderId, nonLeapOrderId, leapDayOrderId]],
          );
          await client.query(
            "DELETE FROM billing.multi_taxi_passenger_payments WHERE order_id = $1",
            [orderId],
          );
          await client.query(
            "SET LOCAL reporting.allow_trip_record_retention_purge = 'on'",
          );
          await client.query(
            "SELECT set_config('reporting.trip_record_retention_now', '2099-01-01T00:00:00.000Z', true)",
          );
          await client.query(
            "DELETE FROM reporting.multi_taxi_trip_operational_records WHERE record_id = ANY($1::text[])",
            [[recordId, nonLeapRecordId, leapDayRecordId]],
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

    it("enforces payment collection synchronization, telemetry.driver_location_events provenance, core immutability, and two-calendar-year + legal-hold deletion guard in PostgreSQL", async () => {
      await database.query(
        `
        INSERT INTO ops.phase1_driver_tasks (
          task_id, order_id, dispatch_job_id, assignment_id, status, created_at, updated_at, record
        ) VALUES (
          $1, $2, $3, $4, 'completed',
          '2026-10-25T01:55:00.000Z'::timestamptz,
          '2026-10-25T02:00:00.000Z'::timestamptz,
          $5::jsonb
        )
        `,
        [
          taskId,
          orderId,
          `job-${suffix}`,
          `asg-${suffix}`,
          JSON.stringify({
            taskId,
            orderId,
            driverId,
            vehicleId,
            status: "completed",
            startedAt: "2026-10-25T01:56:00.000Z",
            completedAt: "2026-10-25T02:00:00.000Z",
          }),
        ],
      );

      await database.query(
        `
        INSERT INTO telemetry.driver_location_events (
          event_id, device_id, driver_id, vehicle_id, task_id, sequence_no,
          recorded_at, received_at, lat, lng, accuracy_m,
          work_state, app_state, transport_mode, network_type, out_of_order
        ) VALUES
          ($1::uuid, $2, $3, $4, $5, 1, '2026-10-25T01:56:30.000Z'::timestamptz, '2026-10-25T01:56:31.000Z'::timestamptz, 25.0478, 121.5170, 12, 'on_trip', 'foreground', 'driving', '4g', false),
          ($6::uuid, $2, $3, NULL, $5, 2, '2026-10-25T01:58:00.000Z'::timestamptz, '2026-10-25T01:58:01.000Z'::timestamptz, 25.0550, 121.5340, 15, 'on_trip', 'foreground', 'driving', '4g', false),
          ($7::uuid, $2, $3, $4, $5, 3, '2026-10-25T01:59:30.000Z'::timestamptz, '2026-10-25T01:59:31.000Z'::timestamptz, 25.0630, 121.5517, 10, 'on_trip', 'foreground', 'driving', '4g', false),
          ($8::uuid, $2, $3, 'veh-conflict-wrong', $5, 4, '2026-10-25T01:57:00.000Z'::timestamptz, '2026-10-25T01:57:01.000Z'::timestamptz, 24.9000, 121.9000, 10, 'on_trip', 'foreground', 'driving', '4g', false),
          ($9::uuid, $2, $3, $4, $5, 5, '2026-10-25T01:58:30.000Z'::timestamptz, '2026-10-25T01:58:31.000Z'::timestamptz, 24.8500, 121.8500, 150, 'on_trip', 'foreground', 'driving', '4g', false)
        `,
        [
          randomUUID(),
          deviceId,
          driverId,
          vehicleId,
          taskId,
          randomUUID(),
          randomUUID(),
          randomUUID(),
          randomUUID(),
        ],
      );

      // Verify PostgreSQL two-calendar-year helper function across leap year, non-leap control, and Feb 29 start
      const floorCheck = await database.query<{
        leap_span: Date;
        non_leap: Date;
        leap_day: Date;
      }>(
        `
        SELECT
          reporting.multi_taxi_two_calendar_year_retention_floor('2026-10-25T02:00:00.000Z'::timestamptz) AS leap_span,
          reporting.multi_taxi_two_calendar_year_retention_floor('2028-03-01T02:00:00.000Z'::timestamptz) AS non_leap,
          reporting.multi_taxi_two_calendar_year_retention_floor('2028-02-29T02:00:00.000Z'::timestamptz) AS leap_day
        `,
      );
      expect(new Date(floorCheck.rows[0]!.leap_span).toISOString()).toBe(
        "2028-10-25T02:00:00.000Z",
      );
      expect(new Date(floorCheck.rows[0]!.non_leap).toISOString()).toBe(
        "2030-03-01T02:00:00.000Z",
      );
      expect(new Date(floorCheck.rows[0]!.leap_day).toISOString()).toBe(
        "2030-03-01T02:00:00.000Z",
      );

      // Even if caller passes fixed 730-day retainUntil (2028-10-24T02:00:00.000Z),
      // repository & DB enforce the two-calendar-year floor (2028-10-25T02:00:00.000Z).
      await repository.upsertTripOperationalRecord({
        recordId,
        orderId,
        orderNo: `MTX-PG-${suffix}`,
        tripId: taskId,
        assignmentId: `asg-${suffix}`,
        driverId,
        vehicleId,
        plateNo: "TPE-7788",
        reservedAt: "2026-10-25T01:50:00.000Z",
        pickupAt: "2026-10-25T01:56:00.000Z",
        dropoffAt: "2026-10-25T02:00:00.000Z",
        route: {
          encodedPolyline: null,
          pointCount: 0,
          distanceMeters: 7200,
          durationSeconds: 240,
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
        generatedAt: "2026-10-25T02:00:00.000Z",
        retainUntil: "2028-10-24T02:00:00.000Z",
      });

      // Also persist non-leap control (2028-03-01 -> 2030-03-01) and leap-day start (2028-02-29 -> 2030-03-01)
      await repository.upsertTripOperationalRecord({
        recordId: nonLeapRecordId,
        orderId: nonLeapOrderId,
        orderNo: `MTX-PG-NL-${suffix}`,
        tripId: `trip-nl-${suffix}`,
        assignmentId: `asg-nl-${suffix}`,
        driverId,
        vehicleId,
        plateNo: "TPE-7789",
        reservedAt: "2028-03-01T01:50:00.000Z",
        pickupAt: "2028-03-01T01:56:00.000Z",
        dropoffAt: "2028-03-01T02:00:00.000Z",
        route: {
          encodedPolyline: null,
          pointCount: 0,
          distanceMeters: 5100,
          durationSeconds: 240,
          source: "pickup_dropoff_summary",
          routeSummary: "NL Start → NL End",
        },
        payableFareMinor: 25000,
        actualFareMinor: 25000,
        collectedFareMinor: null,
        paymentStatus: "unknown",
        tollMinor: null,
        tollSource: "unavailable",
        currency: "TWD",
        farePolicyVersion: "multi-taxi-v1",
        chargingMode: "meter",
        generatedAt: "2028-03-01T02:00:00.000Z",
        retainUntil: "2030-02-28T02:00:00.000Z",
      });
      await repository.upsertTripOperationalRecord({
        recordId: leapDayRecordId,
        orderId: leapDayOrderId,
        orderNo: `MTX-PG-LD-${suffix}`,
        tripId: `trip-ld-${suffix}`,
        assignmentId: `asg-ld-${suffix}`,
        driverId,
        vehicleId,
        plateNo: "TPE-7790",
        reservedAt: "2028-02-29T01:50:00.000Z",
        pickupAt: "2028-02-29T01:56:00.000Z",
        dropoffAt: "2028-02-29T02:00:00.000Z",
        route: {
          encodedPolyline: null,
          pointCount: 0,
          distanceMeters: 5200,
          durationSeconds: 240,
          source: "pickup_dropoff_summary",
          routeSummary: "LD Start → LD End",
        },
        payableFareMinor: 26000,
        actualFareMinor: 26000,
        collectedFareMinor: null,
        paymentStatus: "unknown",
        tollMinor: null,
        tollSource: "unavailable",
        currency: "TWD",
        farePolicyVersion: "multi-taxi-v1",
        chargingMode: "meter",
        generatedAt: "2028-02-29T02:00:00.000Z",
        retainUntil: "2030-02-28T02:00:00.000Z",
      });

      const nonLeapPersisted =
        await repository.findTripOperationalRecordById(nonLeapRecordId);
      const leapDayPersisted =
        await repository.findTripOperationalRecordById(leapDayRecordId);
      expect(nonLeapPersisted?.retainUntil).toBe("2030-03-01T02:00:00.000Z");
      expect(nonLeapPersisted?.tollMinor).toBeNull();
      expect(leapDayPersisted?.retainUntil).toBe("2030-03-01T02:00:00.000Z");

      const initialPersisted =
        await repository.findTripOperationalRecordById(recordId);
      expect(initialPersisted?.retainUntil).toBe("2028-10-25T02:00:00.000Z");
      expect(initialPersisted?.route.source).toBe("driver_gps");
      expect(initialPersisted?.route.pointCount).toBe(3);
      expect(initialPersisted?.route.encodedPolyline).toBe(
        "25.047800,121.517000;25.055000,121.534000;25.063000,121.551700",
      );
      expect(initialPersisted?.route.telemetryProvenance).toMatchObject({
        sampleTable: "telemetry.driver_location_events",
        driverId,
        taskId,
        vehicleId,
        validSampleCount: 3,
        nullVehicleSampleCount: 1,
        coverage: "full_sampled",
      });

      // Collect any pre-existing unrelated record_ids in the shared CI DB so purge sweeps only affect our test rows
      const existingRows = await database.query<{ record_id: string }>(
        "SELECT record_id FROM reporting.multi_taxi_trip_operational_records WHERE record_id <> ALL($1::text[])",
        [[recordId, nonLeapRecordId, leapDayRecordId]],
      );
      const unrelatedHeldSet = new Set(
        existingRows.rows.map((r) => r.record_id),
      );

      // At 2028-10-24T02:00:00.000Z (730 days after 2026-10-25T02:00:00.000Z),
      // retention sweep must NOT consider the record expired, and record remains queryable.
      const sweepAt730d = await repository.purgeExpiredTripOperationalRecords({
        nowIso: "2028-10-24T02:00:00.000Z",
        heldSubjects: unrelatedHeldSet,
      });
      expect(sweepAt730d.purgedRecordIds).not.toContain(recordId);
      const allRecordsAt730d = await repository.listTripOperationalRecords();
      expect(allRecordsAt730d.some((r) => r.recordId === recordId)).toBe(true);

      // Prune raw telemetry.driver_location_events and replay upsert -> retained R11 GPS snapshot survives!
      await database.query(
        "DELETE FROM telemetry.driver_location_events WHERE driver_id = $1",
        [driverId],
      );
      await repository.upsertTripOperationalRecord({
        ...initialPersisted!,
        route: {
          ...initialPersisted!.route,
          source: "pickup_dropoff_summary",
          pointCount: 0,
          encodedPolyline: null,
          telemetryProvenance: undefined,
        },
      });
      const afterPruneReplay =
        await repository.findTripOperationalRecordById(recordId);
      expect(afterPruneReplay?.route.source).toBe("driver_gps");
      expect(afterPruneReplay?.route.pointCount).toBe(3);
      expect(afterPruneReplay?.route.encodedPolyline).toBe(
        "25.047800,121.517000;25.055000,121.534000;25.063000,121.551700",
      );

      // Insert captured payment (partial amount 29500) -> trigger updates collected_fare_minor and payment_status,
      // while preserving actual_fare_minor = 31000
      await database.query(
        `
        INSERT INTO billing.multi_taxi_passenger_payments (
          payment_id, order_id, status, amount_minor, currency
        ) VALUES ($1, $2, 'captured', 29500, 'TWD')
        `,
        [paymentId, orderId],
      );
      const afterCapture =
        await repository.findTripOperationalRecordById(recordId);
      expect(afterCapture?.paymentStatus).toBe("captured");
      expect(afterCapture?.actualFareMinor).toBe(31000);
      expect(afterCapture?.collectedFareMinor).toBe(29500);

      // Update payment to refunded -> trigger sets collected_fare_minor = 0 while preserving actual_fare_minor = 31000
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
      expect(afterRefund?.actualFareMinor).toBe(31000);
      expect(afterRefund?.collectedFareMinor).toBe(0);

      // Attempt to mutate populated core trip fact (plate_no) -> rejected by DB trigger
      await expect(
        database.query(
          `UPDATE reporting.multi_taxi_trip_operational_records SET plate_no = 'TAMPER-9999' WHERE record_id = $1`,
          [recordId],
        ),
      ).rejects.toThrow();

      // Attempt to shorten retain_until to 730 days (2028-10-24T02:00:00.000Z) or delete before 2-year expiry -> rejected by DB trigger
      await expect(
        database.query(
          `UPDATE reporting.multi_taxi_trip_operational_records SET retain_until = '2028-10-24T02:00:00.000Z'::timestamptz WHERE record_id = $1`,
          [recordId],
        ),
      ).rejects.toThrow();

      await expect(
        database.query(
          `DELETE FROM reporting.multi_taxi_trip_operational_records WHERE record_id = $1`,
          [recordId],
        ),
      ).rejects.toThrow();

      // Extending retain_until to a longer date (2031-01-01T00:00:00.000Z) succeeds, and subsequent upsert with shorter retainUntil preserves the longer retention
      await database.query(
        `UPDATE reporting.multi_taxi_trip_operational_records SET retain_until = '2031-01-01T00:00:00.000Z'::timestamptz WHERE record_id = $1`,
        [nonLeapRecordId],
      );
      await repository.upsertTripOperationalRecord({
        ...nonLeapPersisted!,
        retainUntil: "2030-03-01T02:00:00.000Z",
      });
      const preservedLonger =
        await repository.findTripOperationalRecordById(nonLeapRecordId);
      expect(preservedLonger?.retainUntil).toBe("2031-01-01T00:00:00.000Z");

      // Active legal hold in voice.legal_hold blocks both purgeExpiredTripOperationalRecords and direct DELETE after 2-year expiry (2028-10-26T00:00:00.000Z)
      await database.query(
        `
        INSERT INTO voice.legal_hold (
          case_number, evidence_family, subject_ref, reason_code, status, placed_by
        ) VALUES ($1, 'proof_bundle', $2, 'regulatory_inquiry', 'active', 'usr-admin-r11-pg')
        `,
        [`CASE-R11-${suffix}`, orderId],
      );

      const sweepUnderHold =
        await repository.purgeExpiredTripOperationalRecords({
          nowIso: "2028-10-26T00:00:00.000Z",
          heldSubjects: unrelatedHeldSet,
        });
      expect(sweepUnderHold.purgedRecordIds).not.toContain(recordId);
      expect(sweepUnderHold.skippedHeldRecordIds).toContain(recordId);

      // Releasing the legal hold allows controlled retention purge after expiry
      await database.query(
        `UPDATE voice.legal_hold SET status = 'released', released_by = 'usr-admin-r11-pg', released_at = now() WHERE subject_ref = $1`,
        [orderId],
      );
      const sweepAfterHoldRelease =
        await repository.purgeExpiredTripOperationalRecords({
          nowIso: "2028-10-26T00:00:00.000Z",
          heldSubjects: unrelatedHeldSet,
        });
      expect(sweepAfterHoldRelease.purgedRecordIds).toContain(recordId);
      expect(await repository.findTripOperationalRecordById(recordId)).toBeNull();
    });
  },
);
