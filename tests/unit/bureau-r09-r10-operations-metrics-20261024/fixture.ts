import type {
  ComplaintCaseRecord,
  ComplaintTimelineEntry,
  DispatchAssignmentRecord,
  DispatchJobRecord,
  DispatchTraceLogRecord,
  DriverTaskRecord,
  OwnedOrderRecord,
} from "@drts/contracts";
import type { DatabaseService } from "../../../apps/api/src/common/db";
import { ReportingRepository } from "../../../apps/api/src/modules/reporting/reporting.repository";
import { ReportingService } from "../../../apps/api/src/modules/reporting/reporting.service";

// Synthetic, clearly fictitious source rows. Only the canonical fields read
// by the reporting builders are populated; ids carry a `syn-` prefix.

export const AREA = "SYN-AREA";
export const PRODUCT = "enterprise_dispatch";

export type TripSpec = {
  orderId: string;
  semantics: "reservation" | "realtime";
  status: OwnedOrderRecord["status"];
  createdAt: string;
  reservationStart?: string | null;
  /** Omit for an order never assigned. */
  assignedAt?: string;
  etaMinutes?: number | null;
  /** Recorded `driver.arrived_pickup` trace + task timestamp. */
  arrivedAt?: string;
  cancelReason?: string | null;
  referralRatingCaseNo?: string;
};

export type Source = {
  orders: OwnedOrderRecord[];
  dispatchJobs: DispatchJobRecord[];
  dispatchAssignments: DispatchAssignmentRecord[];
  driverTasks: DriverTaskRecord[];
  dispatchTraceLogs: DispatchTraceLogRecord[];
  complaintCases: ComplaintCaseRecord[];
};

export function buildSource(trips: TripSpec[], cases: ComplaintCaseRecord[]) {
  const source: Source = {
    orders: [],
    dispatchJobs: [],
    dispatchAssignments: [],
    driverTasks: [],
    dispatchTraceLogs: [],
    complaintCases: cases,
  };
  for (const trip of trips) {
    const reservationStart =
      trip.semantics === "reservation"
        ? trip.reservationStart === undefined
          ? trip.createdAt
          : trip.reservationStart
        : null;
    source.orders.push({
      orderId: trip.orderId,
      orderNo: `NO-${trip.orderId}`,
      orderSource: "phone",
      tenantId: null,
      partnerId: null,
      serviceBucket: "business_dispatch",
      dispatchSemantics: trip.semantics,
      businessDispatchSubtype: PRODUCT,
      status: trip.status,
      pickup: { address: "synthetic pickup" },
      dropoff: { address: "synthetic dropoff" },
      reservationWindowStart: reservationStart,
      cancelReason: trip.cancelReason ?? null,
      ...(trip.referralRatingCaseNo
        ? {
            referralPassengerLifecycle: {
              rating: {
                orderId: trip.orderId,
                score: 1,
                tags: [],
                submittedAt: trip.createdAt,
                complaintCaseNo: trip.referralRatingCaseNo,
              },
            },
          }
        : {}),
      createdAt: trip.createdAt,
      updatedAt: trip.createdAt,
    } as unknown as OwnedOrderRecord);
    if (!trip.assignedAt) continue;
    const dispatchJobId = `job-${trip.orderId}`;
    const assignmentId = `asg-${trip.orderId}`;
    const taskId = `task-${trip.orderId}`;
    source.dispatchJobs.push({
      dispatchJobId,
      orderId: trip.orderId,
      latestEtaMinutes: trip.etaMinutes ?? null,
      createdAt: trip.assignedAt,
      updatedAt: trip.assignedAt,
    } as unknown as DispatchJobRecord);
    source.dispatchAssignments.push({
      assignmentId,
      dispatchJobId,
      orderId: trip.orderId,
      taskId,
      vehicleId: "syn-vehicle",
      driverId: "syn-driver",
      status: trip.status === "cancelled" ? "cancelled" : "completed",
      createdAt: trip.assignedAt,
      updatedAt: trip.assignedAt,
    } as unknown as DispatchAssignmentRecord);
    source.driverTasks.push({
      taskId,
      orderId: trip.orderId,
      dispatchJobId,
      assignmentId,
      driverId: "syn-driver",
      vehicleId: "syn-vehicle",
      status: trip.status === "cancelled" ? "cancelled" : "completed",
      acceptedAt: trip.assignedAt,
      arrivedPickupAt: trip.arrivedAt ?? null,
      startedAt: null,
      completedAt: null,
    } as unknown as DriverTaskRecord);
    if (trip.arrivedAt) {
      source.dispatchTraceLogs.push({
        traceId: `trace-${trip.orderId}`,
        orderId: trip.orderId,
        eventType: "driver.arrived_pickup",
        details: { taskId },
        createdAt: trip.arrivedAt,
      } as unknown as DispatchTraceLogRecord);
    }
  }
  return source;
}

export function complaintCase(
  caseNo: string,
  overrides: Partial<ComplaintCaseRecord>,
): ComplaintCaseRecord {
  return {
    caseNo,
    caseSource: "ops",
    relatedOrderId: "syn-order-on-time-exact",
    relatedCallId: null,
    relatedIncidentId: null,
    category: "driver_service",
    severity: "normal",
    description: "synthetic case",
    assigneeId: null,
    status: "new",
    slaDueAt: "2026-12-31T00:00:00.000Z",
    slaBreach: false,
    reopenCount: 0,
    resolutionCode: null,
    closingNote: null,
    createdAt: "2026-08-10T00:00:00.000Z",
    updatedAt: "2026-08-10T00:00:00.000Z",
    ...overrides,
  };
}

export function closedEntry(
  caseNo: string,
  at: string,
): ComplaintTimelineEntry {
  return {
    entryId: `tl-${caseNo}-${at}`,
    caseNo,
    action: "case_closed",
    note: "synthetic closure",
    createdAt: at,
  };
}

const registry = {
  listVehicles: () => [
    { vehicleId: "syn-vehicle", operatingArea: AREA, plateNo: "SYN-0001" },
  ],
};

/** In-memory runtime: no repository; the canonical snapshot ports only. */
export function memoryService(
  source: Source,
  timelines: ComplaintTimelineEntry[],
) {
  const ownedMobility = {
    getReportingSnapshot: () => structuredClone(source),
  };
  const complaints = {
    listComplaintCases: () => structuredClone(source.complaintCases),
    getComplaintTimeline: (caseNo: string) =>
      timelines.filter((entry) => entry.caseNo === caseNo),
  };
  return new ReportingService(
    ownedMobility as never,
    complaints as never,
    registry as never,
    undefined,
    undefined,
  );
}

type Row = Record<string, unknown>;

/**
 * Storage port for the production ReportingRepository. It answers the
 * repository's own SQL with the persisted rows of each canonical table; the
 * report logic and all mapping run in the production classes.
 */
export function persistedService(
  source: Source,
  provenance: { closures: unknown[]; lowRatingCaseNos: string[] },
) {
  const monthly = new Map<string, Row>();
  const statements: string[] = [];
  const tables: Record<string, unknown[]> = {
    "ops.phase1_owned_orders": source.orders,
    "ops.phase1_dispatch_jobs": source.dispatchJobs,
    "ops.phase1_dispatch_assignments": source.dispatchAssignments,
    "ops.phase1_driver_tasks": source.driverTasks,
    "ops.phase1_dispatch_trace_logs": source.dispatchTraceLogs,
    "crm.phase1_complaint_cases": source.complaintCases,
  };
  const run = async (sql: string, values: readonly unknown[] = []) => {
    statements.push(sql);
    if (sql === "BEGIN" || sql === "COMMIT" || sql === "ROLLBACK")
      return { rows: [], rowCount: 0 };
    if (sql.includes("pg_advisory_xact_lock")) return { rows: [], rowCount: 0 };
    if (sql.includes("'lowRatingCaseNos'")) {
      return {
        rows: [{ record: structuredClone(provenance) }],
        rowCount: 1,
      };
    }
    if (/DELETE FROM reporting\.monthly_operations_summaries/.test(sql)) {
      const periods = values[0] as string[];
      for (const [key, row] of monthly)
        if (periods.includes(String(row.period_month))) monthly.delete(key);
      return { rows: [], rowCount: 0 };
    }
    const insert =
      /INSERT INTO reporting\.monthly_operations_summaries\s*\(([^)]+)\)/.exec(
        sql,
      );
    if (insert) {
      const columns = insert[1]!.split(",").map((c) => c.trim());
      const row = Object.fromEntries(
        columns.map((column, i) => [
          column,
          column === "complaints_by_category"
            ? JSON.parse(String(values[i]))
            : values[i],
        ]),
      );
      monthly.set(
        `${row.period_month}:${row.business_area}:${row.service_product_code}`,
        row,
      );
      return { rows: [], rowCount: 1 };
    }
    const table = /FROM\s+([\w.]+)/i.exec(sql)?.[1] ?? "";
    if (table === "reporting.monthly_operations_summaries") {
      return { rows: structuredClone([...monthly.values()]), rowCount: 0 };
    }
    if (table === "reporting.dispatchable_supply_snapshots")
      return { rows: [], rowCount: 0 };
    if (tables[table]) {
      const rows = tables[table]!.map((record) => ({
        record: structuredClone(record),
      }));
      return { rows, rowCount: rows.length };
    }
    throw new Error(`Unexpected reporting SQL: ${sql.slice(0, 80)}`);
  };
  const database = {
    isEnabled: () => true,
    query: run,
    connect: async () => ({ query: run, release: () => undefined }),
  } as unknown as DatabaseService;
  const fallback = {
    listComplaintCases: () => {
      throw new Error("persisted runtime must read canonical CRM rows");
    },
    getComplaintTimeline: () => {
      throw new Error("persisted runtime must read canonical timelines");
    },
  };
  const ownedMobility = {
    getReportingSnapshot: () => {
      throw new Error("persisted runtime must read canonical order rows");
    },
  };
  const repository = new ReportingRepository(database);
  const service = new ReportingService(
    ownedMobility as never,
    fallback as never,
    registry as never,
    undefined,
    repository,
  );
  return { service, repository, statements };
}
