import { afterEach, describe, expect, it, vi } from "vitest";
import type { DispatchableSupplySnapshotRecord } from "@drts/contracts";
import { summarizeSupplySnapshotsByMonth } from "../../../apps/api/src/modules/reporting/operations-metrics";
import { ReportingService } from "../../../apps/api/src/modules/reporting/reporting.service";
import {
  buildSource,
  type Source,
} from "../bureau-r09-r10-operations-metrics-20261024/fixture";

// The R09/R10 previews used to load every dispatchable supply snapshot row
// (one per 15 minutes per area and product, about 110 000 rows on shared dev)
// and reduce them in the API on every agency report read: about 5 s of each
// 8-10 s read. PostgreSQL now returns per-month totals. These tests pin that
// the totals give the same monthly and six-month figures as the per-row
// reduction did, with Asia/Taipei month boundaries, and that a report read
// never asks for the individual rows.

const AREA_A = "SYN-AREA-A";
const AREA_B = "SYN-AREA-B";
const SUPPLY_PRODUCT = "syn-supply-product";
const WINDOW = { periodMonthFrom: "2026-06", periodMonthTo: "2026-11" };

function snapshot(
  snapshotAt: string,
  businessArea: string,
  dispatchableVehicleCount: number,
  sourceHealth: DispatchableSupplySnapshotRecord["sourceHealth"] = "complete",
): DispatchableSupplySnapshotRecord {
  return {
    snapshotAt,
    businessArea,
    serviceProductCode: SUPPLY_PRODUCT,
    dispatchableVehicleCount,
    availableDriverCount: dispatchableVehicleCount,
    sourceHealth,
    generatedAt: snapshotAt,
  };
}

const SNAPSHOTS: DispatchableSupplySnapshotRecord[] = [
  // Taipei 2026-05-31 23:45: May, outside the window.
  snapshot("2026-05-31T15:45:00.000Z", AREA_A, 50),
  // Taipei 2026-06-01 00:00: the first instant of June.
  snapshot("2026-05-31T16:00:00.000Z", AREA_A, 5),
  snapshot("2026-07-10T02:00:00.000Z", AREA_A, 4),
  snapshot("2026-07-10T02:15:00.000Z", AREA_A, 6),
  snapshot("2026-07-10T02:30:00.000Z", AREA_A, 100, "location_stale"),
  // Taipei 2026-08-31 23:45: still August.
  snapshot("2026-08-31T15:45:00.000Z", AREA_A, 3),
  // Area B only ever had incomplete samples (September).
  snapshot("2026-09-02T04:00:00.000Z", AREA_B, 9, "location_missing"),
  // Taipei 2026-12-01 00:00: December, outside the window.
  snapshot("2026-11-30T16:00:00.000Z", AREA_A, 70),
];

function emptySource(): Source {
  return buildSource([], []);
}

function inMemoryService(snapshots: DispatchableSupplySnapshotRecord[]) {
  const source = emptySource();
  const service = new ReportingService(
    { getReportingSnapshot: () => structuredClone(source) } as never,
    {
      listComplaintCases: () => [],
      getComplaintTimeline: () => [],
    } as never,
    { listVehicles: () => [] } as never,
    undefined,
    undefined,
  );
  (
    service as unknown as {
      dispatchableSupplySnapshots: DispatchableSupplySnapshotRecord[];
    }
  ).dispatchableSupplySnapshots = structuredClone(snapshots);
  return service;
}

function databaseService(
  snapshots: DispatchableSupplySnapshotRecord[],
  options: { failSummary?: boolean } = {},
) {
  const source = emptySource();
  const repository = {
    isEnabled: () => true,
    loadDailyDispatchRecordSource: async () => structuredClone(source),
    loadComplaintStatisticsSource: async () => ({
      closures: [],
      lowRatingCaseNos: [],
    }),
    summarizeDispatchableSupplySnapshotsByMonth: vi.fn(
      async (
        periods: readonly string[],
        filter: { businessArea?: string; serviceProductCode?: string },
      ) => {
        if (options.failSummary) throw new Error("synthetic outage");
        return summarizeSupplySnapshotsByMonth(snapshots, periods, filter);
      },
    ),
    listDispatchableSupplySnapshots: vi.fn(async () => {
      throw new Error("a report read must not load every snapshot row");
    }),
    replaceMonthlyOperationsSummaries: vi.fn(async () => undefined),
    reportPersistenceFailure: vi.fn(),
  };
  const service = new ReportingService(
    { getReportingSnapshot: () => structuredClone(source) } as never,
    {
      listComplaintCases: () => [],
      getComplaintTimeline: () => [],
    } as never,
    { listVehicles: () => [] } as never,
    undefined,
    repository as never,
  );
  return { service, repository };
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

describe("dispatchable supply totals per Asia/Taipei month", () => {
  it("counts every snapshot, the complete ones and their vehicle sum by Taipei month, area and product", () => {
    const totals = summarizeSupplySnapshotsByMonth(
      SNAPSHOTS,
      ["2026-06", "2026-07", "2026-08", "2026-09", "2026-10", "2026-11"],
      {},
    );
    expect(
      totals.sort((left, right) =>
        `${left.periodMonth}${left.businessArea}`.localeCompare(
          `${right.periodMonth}${right.businessArea}`,
        ),
      ),
    ).toEqual([
      {
        periodMonth: "2026-06",
        businessArea: AREA_A,
        serviceProductCode: SUPPLY_PRODUCT,
        snapshotCount: 1,
        validSnapshotCount: 1,
        dispatchableVehicleSum: 5,
      },
      {
        periodMonth: "2026-07",
        businessArea: AREA_A,
        serviceProductCode: SUPPLY_PRODUCT,
        snapshotCount: 3,
        validSnapshotCount: 2,
        dispatchableVehicleSum: 10,
      },
      {
        periodMonth: "2026-08",
        businessArea: AREA_A,
        serviceProductCode: SUPPLY_PRODUCT,
        snapshotCount: 1,
        validSnapshotCount: 1,
        dispatchableVehicleSum: 3,
      },
      {
        periodMonth: "2026-09",
        businessArea: AREA_B,
        serviceProductCode: SUPPLY_PRODUCT,
        snapshotCount: 1,
        validSnapshotCount: 0,
        dispatchableVehicleSum: 0,
      },
    ]);
    expect(
      summarizeSupplySnapshotsByMonth(SNAPSHOTS, ["2026-09"], {
        businessArea: AREA_A,
      }),
    ).toEqual([]);
  });

  it("gives the six-month preview its sample-weighted average and coverage from the monthly totals", async () => {
    const { service, repository } = databaseService(SNAPSHOTS);
    const summaries = await service.previewSixMonthOperationsSummary(WINDOW);

    expect(
      repository.summarizeDispatchableSupplySnapshotsByMonth,
    ).toHaveBeenCalledTimes(1);
    expect(
      repository.summarizeDispatchableSupplySnapshotsByMonth,
    ).toHaveBeenCalledWith(
      ["2026-06", "2026-07", "2026-08", "2026-09", "2026-10", "2026-11"],
      {},
    );
    expect(repository.listDispatchableSupplySnapshots).not.toHaveBeenCalled();

    const byArea = new Map(
      summaries.map((summary) => [summary.businessArea, summary]),
    );
    const areaA = byArea.get(AREA_A)!;
    // June 5, July 4 + 6 (the stale-location 100 is no sample), August 3.
    expect(areaA.validSnapshotCount).toBe(4);
    expect(areaA.averageDispatchableVehicleCount).toBe(4.5);
    expect(areaA.snapshotCoverageRate).toBe(
      Math.round((4 / areaA.expectedSnapshotCount) * 10_000) / 10_000,
    );
    const july = (areaA.monthlySummaries ?? []).find(
      (month) => month.periodMonth === "2026-07",
    )!;
    expect(july).toMatchObject({
      validSnapshotCount: 2,
      averageDispatchableVehicleCount: 5,
    });
    // Incomplete samples still open the dimension, with no valid sample.
    expect(byArea.get(AREA_B)).toMatchObject({
      validSnapshotCount: 0,
      averageDispatchableVehicleCount: null,
    });
  });

  it("matches the in-process reduction of the same snapshots, with and without a filter", async () => {
    for (const filter of [{}, { businessArea: AREA_A }]) {
      const query = { ...WINDOW, ...filter };
      const fromDatabase =
        await databaseService(
          SNAPSHOTS,
        ).service.previewSixMonthOperationsSummary(query);
      const inMemory =
        await inMemoryService(SNAPSHOTS).previewSixMonthOperationsSummary(
          query,
        );
      expect(withoutClock(fromDatabase)).toEqual(withoutClock(inMemory));
    }
    const filtered = databaseService(SNAPSHOTS);
    await filtered.service.previewSixMonthOperationsSummary({
      ...WINDOW,
      businessArea: AREA_B,
      serviceProductCode: SUPPLY_PRODUCT,
    });
    expect(
      filtered.repository.summarizeDispatchableSupplySnapshotsByMonth,
    ).toHaveBeenCalledWith(expect.any(Array), {
      businessArea: AREA_B,
      serviceProductCode: SUPPLY_PRODUCT,
    });
  });

  it("falls back to the in-process snapshots when the database totals fail", async () => {
    const { service, repository } = databaseService(SNAPSHOTS, {
      failSummary: true,
    });
    (
      service as unknown as {
        dispatchableSupplySnapshots: DispatchableSupplySnapshotRecord[];
      }
    ).dispatchableSupplySnapshots = structuredClone(SNAPSHOTS);
    const summaries = await service.previewSixMonthOperationsSummary(WINDOW);
    expect(repository.reportPersistenceFailure).toHaveBeenCalledWith(
      expect.any(Error),
      "summarize dispatchable supply snapshots",
    );
    expect(repository.listDispatchableSupplySnapshots).not.toHaveBeenCalled();
    expect(
      summaries.find((summary) => summary.businessArea === AREA_A),
    ).toMatchObject({
      validSnapshotCount: 4,
      averageDispatchableVehicleCount: 4.5,
    });
  });
});
