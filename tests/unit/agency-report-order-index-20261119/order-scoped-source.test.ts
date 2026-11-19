import { afterEach, describe, expect, it, vi } from "vitest";
import type {
  DispatchAssignmentRecord,
  DispatchJobRecord,
  DispatchTraceLogRecord,
  DriverTaskRecord,
} from "@drts/contracts";
import { ReportingService } from "../../../apps/api/src/modules/reporting/reporting.service";
import {
  buildSource,
  type Source,
  type TripSpec,
} from "../bureau-r09-r10-operations-metrics-20261024/fixture";

// R09/R10 previews and the daily dispatch rebuild build one record per order
// from the canonical jobs, assignments, tasks and trace logs. They used to
// scan every collection once per order (orders x trace logs per pass, about
// 10 s on shared dev for the agency reports). The collections are now grouped
// by order first; these tests pin that every order still sees exactly its own
// rows, in their source order, whatever the interleaving of the collections.

const AREA_A = "SYN-AREA-A";
const AREA_B = "SYN-AREA-B";
const VEHICLE_A = "syn-vehicle-a";
const VEHICLE_B = "syn-vehicle-b";
const WINDOW = { periodMonthFrom: "2026-06", periodMonthTo: "2026-11" };

type OrderRows = {
  dispatchJobs: DispatchJobRecord[];
  dispatchAssignments: DispatchAssignmentRecord[];
  driverTasks: DriverTaskRecord[];
  dispatchTraceLogs: DispatchTraceLogRecord[];
};

function at(day: number, minute: number) {
  return `2026-08-${String(day).padStart(2, "0")}T03:${String(minute).padStart(2, "0")}:00.000Z`;
}

/** Order i: (i % 3) + 1 dispatch rounds, i % 5 redispatch events, final vehicle by parity. */
function orderRows(index: number, orderId: string): OrderRows {
  const day = 1 + (index % 28);
  const rounds = (index % 3) + 1;
  const finalVehicle = index % 2 === 0 ? VEHICLE_A : VEHICLE_B;
  const otherVehicle = finalVehicle === VEHICLE_A ? VEHICLE_B : VEHICLE_A;
  const rows: OrderRows = {
    dispatchJobs: [],
    dispatchAssignments: [],
    driverTasks: [],
    dispatchTraceLogs: [],
  };
  for (let round = 0; round < rounds; round += 1) {
    const time = at(day, round * 5);
    const dispatchJobId = `job-${orderId}-${round}`;
    const assignmentId = `asg-${orderId}-${round}`;
    const taskId = `task-${orderId}-${round}`;
    const vehicleId = round === rounds - 1 ? finalVehicle : otherVehicle;
    rows.dispatchJobs.push({
      dispatchJobId,
      orderId,
      latestEtaMinutes: 8,
      createdAt: time,
      updatedAt: time,
    } as unknown as DispatchJobRecord);
    rows.dispatchAssignments.push({
      assignmentId,
      dispatchJobId,
      orderId,
      taskId,
      vehicleId,
      driverId: `syn-driver-${vehicleId}`,
      status: "completed",
      createdAt: time,
      updatedAt: time,
    } as unknown as DispatchAssignmentRecord);
    rows.driverTasks.push({
      taskId,
      orderId,
      dispatchJobId,
      assignmentId,
      driverId: `syn-driver-${vehicleId}`,
      vehicleId,
      status: "completed",
      acceptedAt: time,
      arrivedPickupAt: null,
      startedAt: null,
      completedAt: null,
    } as unknown as DriverTaskRecord);
  }
  for (let event = 0; event < index % 5; event += 1) {
    rows.dispatchTraceLogs.push({
      traceId: `trace-${orderId}-${event}`,
      orderId,
      eventType: "dispatch.redispatch_required",
      details: {},
      createdAt: at(day, 1),
    } as unknown as DispatchTraceLogRecord);
  }
  return rows;
}

/**
 * The same rows in two arrangements: grouped (all rows of one order, then the
 * next) and interleaved (round-robin across orders). Both keep each order's
 * own relative row order, so a correct per-order view must not tell them apart.
 */
function arrangedSources(count: number) {
  const trips: TripSpec[] = [];
  const perOrder: OrderRows[] = [];
  for (let index = 0; index < count; index += 1) {
    const orderId = `syn-ix-${index}`;
    trips.push({
      orderId,
      semantics: "realtime",
      status: index % 4 === 3 ? "cancelled" : "completed",
      createdAt: at(1 + (index % 28), 0),
    });
    perOrder.push(orderRows(index, orderId));
  }
  const base = buildSource(trips, []);
  const keys = [
    "dispatchJobs",
    "dispatchAssignments",
    "driverTasks",
    "dispatchTraceLogs",
  ] as const;
  const grouped: Source = structuredClone(base);
  const interleaved: Source = structuredClone(base);
  for (const key of keys) {
    (grouped[key] as unknown[]) = perOrder.flatMap((rows) => rows[key]);
    const longest = Math.max(...perOrder.map((rows) => rows[key].length));
    const mixed: unknown[] = [];
    for (let position = 0; position < longest; position += 1) {
      for (const rows of perOrder) {
        const row = rows[key][position];
        if (row) mixed.push(row);
      }
    }
    (interleaved[key] as unknown[]) = mixed;
  }
  return { grouped, interleaved };
}

function service(source: Source) {
  const ownedMobility = {
    getReportingSnapshot: () => structuredClone(source),
  };
  const complaints = {
    listComplaintCases: () => structuredClone(source.complaintCases),
    getComplaintTimeline: () => [],
  };
  const registry = {
    listVehicles: () => [
      { vehicleId: VEHICLE_A, operatingArea: AREA_A, plateNo: "SYN-A-0001" },
      { vehicleId: VEHICLE_B, operatingArea: AREA_B, plateNo: "SYN-B-0001" },
    ],
  };
  return new ReportingService(
    ownedMobility as never,
    complaints as never,
    registry as never,
    undefined,
    undefined,
  );
}

/** Drop the wall-clock stamps that differ between two runs. */
function withoutClock<T>(value: T): T {
  return JSON.parse(
    JSON.stringify(value, (key, item) =>
      key === "generatedAt" || key === "complaintStatisticsAsOf"
        ? undefined
        : item,
    ),
  ) as T;
}

afterEach(() => {
  vi.restoreAllMocks();
});

describe("reporting builds each order from its own canonical rows", () => {
  it("attributes jobs, assignments, tasks and trace logs to their own order when the collections are interleaved", async () => {
    const { interleaved } = arrangedSources(12);
    const { records } = await service(interleaved).rebuildDailyDispatchRecords(
      {},
    );
    expect(records).toHaveLength(12);
    for (const record of records) {
      const index = Number(record.orderId.replace("syn-ix-", ""));
      const day = 1 + (index % 28);
      expect(record.redispatchCount).toBe(index % 5);
      expect(record.finalVehicleId).toBe(
        index % 2 === 0 ? VEHICLE_A : VEHICLE_B,
      );
      expect(record.firstDispatchAt).toBe(at(day, 0));
      expect(record.firstAssignedAt).toBe(at(day, 0));
    }

    const summaries =
      await service(interleaved).previewSixMonthOperationsSummary(WINDOW);
    const demandByArea = Object.fromEntries(
      summaries.map((summary) => [
        summary.businessArea,
        summary.demandRequestCount,
      ]),
    );
    // The business area follows each order's own latest assignment vehicle.
    expect(demandByArea).toEqual({ [AREA_A]: 6, [AREA_B]: 6 });
    expect(
      summaries.reduce((sum, summary) => sum + summary.cancelledOrderCount, 0),
    ).toBe(3);
  });

  it("gives identical daily records and R09/R10 previews for grouped and interleaved collections", async () => {
    const { grouped, interleaved } = arrangedSources(30);
    const groupedDaily = await service(grouped).rebuildDailyDispatchRecords({});
    const interleavedDaily = await service(
      interleaved,
    ).rebuildDailyDispatchRecords({});
    expect(withoutClock(interleavedDaily.records)).toEqual(
      withoutClock(groupedDaily.records),
    );

    for (const preview of [
      "previewSixMonthOperationsSummary",
      "previewComplaintMonthlyStatistics",
    ] as const) {
      const fromGrouped = await service(grouped)[preview](WINDOW);
      const fromInterleaved = await service(interleaved)[preview](WINDOW);
      expect(withoutClock(fromInterleaved)).toEqual(withoutClock(fromGrouped));
    }
  });

  it("keeps a six-month preview over thousands of orders linear", async () => {
    const { interleaved } = arrangedSources(4000);
    const reporting = service(interleaved);
    const startedAt = performance.now();
    const summaries = await reporting.previewSixMonthOperationsSummary(WINDOW);
    const elapsedMs = performance.now() - startedAt;
    expect(
      summaries.reduce((sum, summary) => sum + summary.demandRequestCount, 0),
    ).toBe(4000);
    // About 0.5 s grouped; the per-order full scan took about 20 s here.
    expect(elapsedMs).toBeLessThan(6_000);
  }, 60_000);

  it("logs one timing line per preview with sizes and durations only", async () => {
    const lines: string[] = [];
    const { interleaved } = arrangedSources(5);
    const reporting = service(interleaved);
    const { logger } = reporting as unknown as {
      logger: { log: (message: unknown) => void };
    };
    vi.spyOn(logger, "log").mockImplementation((message) => {
      lines.push(String(message));
    });
    await reporting.previewSixMonthOperationsSummary(WINDOW);

    const timing = lines.filter((line) =>
      line.includes("reporting.operations_summary.timing"),
    );
    expect(timing).toHaveLength(1);
    const parsed = JSON.parse(timing[0]!) as Record<string, unknown>;
    expect(parsed).toMatchObject({
      event: "reporting.operations_summary.timing",
      maxMonths: 6,
      months: 6,
      orders: 5,
      dispatchJobs: interleaved.dispatchJobs.length,
      dispatchTraceLogs: interleaved.dispatchTraceLogs.length,
    });
    for (const phase of [
      "loadSourceMs",
      "loadSnapshotsMs",
      "buildMs",
      "persistMs",
      "rebuildMs",
      "attachMetricsMs",
      "totalMs",
    ]) {
      expect(typeof parsed[phase]).toBe("number");
    }
    // Sizes and durations only: no identifier or record value.
    expect(timing[0]).not.toMatch(/syn-|SYN-/);
  });
});
