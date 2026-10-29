import fs from "node:fs";
import path from "node:path";
import { createHash } from "node:crypto";
import { createRequire } from "node:module";
import { afterEach, expect, it, vi } from "vitest";
const {
  of,
  lastValueFrom,
}: typeof import("../../../apps/api/node_modules/rxjs") = createRequire(
  path.resolve(process.cwd(), "apps/api/package.json"),
)("rxjs");
import { SnakeCaseInterceptor } from "../../../apps/api/src/common/snake-case.interceptor";
import { assertArtifactRecords } from "../report-job-artifact-dataflow-20261015/artifact-readers";
import { reportFixture } from "./fixture";

afterEach(() => {
  vi.restoreAllMocks();
  vi.unstubAllGlobals();
});
const total = (rows: ReadonlyArray<{ complaintCount: number }>) =>
  rows.reduce((n, row) => n + row.complaintCount, 0);
const digest = (data: unknown) =>
  createHash("sha256").update(JSON.stringify(data)).digest("hex");

it("a real persisted same-order passenger case belongs to its creation month even after the trip month", async () => {
  const f = await reportFixture();
  const result = await f.service.rebuildMonthlyOperationsSummaries({
    periodMonth: "2026-08",
  });
  expect(result.records).toHaveLength(1);
  expect(result.records[0]).toMatchObject({
    periodMonth: "2026-08",
    businessArea: "NTP",
    serviceProductCode: "enterprise_dispatch",
    complaintCount: 1,
    demandRequestCount: 0,
    completedTripCount: 0,
  });
  expect(result.records[0]!.complaintsByCategory).toEqual({
    [f.firstCase.category]: 1,
  });
});

it("a six-month summary includes a new complaint for an order older than the entire requested window", async () => {
  const f = await reportFixture({
    orderAt: "2026-04-12T08:00:00.000Z",
    caseAt: "2026-05-03T08:00:00.000Z",
  });
  const result = await f.service.previewSixMonthOperationsSummary({
    periodMonthFrom: "2026-05",
    periodMonthTo: "2026-10",
  });
  expect(total(result)).toBe(1);
  expect(result[0]).toMatchObject({
    demandRequestCount: 0,
    actualDispatchCount: 0,
    completedTripCount: 0,
  });
});

it("does not move later complaints back into their original service month or move trip totals forward", async () => {
  const f = await reportFixture();
  const june = await f.service.rebuildMonthlyOperationsSummaries({
    periodMonth: "2026-06",
  });
  expect(june.records).toHaveLength(1);
  expect(june.records[0]).toMatchObject({
    demandRequestCount: 1,
    completedTripCount: 1,
    complaintCount: 0,
  });
  const august = await f.service.rebuildMonthlyOperationsSummaries({
    periodMonth: "2026-08",
  });
  expect(total(august.records)).toBe(1);
  expect(august.records[0]!.demandRequestCount).toBe(0);
});

it("counts creation rather than later case status updates", async () => {
  const f = await reportFixture();
  const row = f.complaintTable.get(f.firstCase.caseNo)!;
  f.complaintTable.set(f.firstCase.caseNo, {
    ...row,
    updatedAt: "2026-09-12T08:00:00.000Z",
  });
  expect(
    total(
      (
        await f.service.rebuildMonthlyOperationsSummaries({
          periodMonth: "2026-08",
        })
      ).records,
    ),
  ).toBe(1);
  expect(
    total(
      (
        await f.service.rebuildMonthlyOperationsSummaries({
          periodMonth: "2026-09",
        })
      ).records,
    ),
  ).toBe(0);
});

it("counts distinct case numbers even when the source port repeats a canonical case row", async () => {
  const f = await reportFixture({ duplicateRows: true });
  const rows = (
    await f.service.rebuildMonthlyOperationsSummaries({
      periodMonth: "2026-08",
    })
  ).records;
  expect(total(rows)).toBe(1);
  expect(rows[0]!.complaintsByCategory).toEqual({ [f.firstCase.category]: 1 });
});

it("counts separate genuine CRM cases on one original passenger order and preserves each category", async () => {
  const f = await reportFixture();
  const second = await f.createCase("2026-08-08T08:00:00.000Z", "lost_item");
  expect(second.caseNo).not.toBe(f.firstCase.caseNo);
  const rows = (
    await f.service.rebuildMonthlyOperationsSummaries({
      periodMonth: "2026-08",
    })
  ).records;
  expect(total(rows)).toBe(2);
  expect(rows[0]!.complaintsByCategory).toEqual({
    [f.firstCase.category]: 1,
    [second.category]: 1,
  });
});

it.each([null, "unknown-order-record"])(
  "retains an unlinked/orphan case in unknown dimensions: %s",
  async (relatedOrderId) => {
    const f = await reportFixture();
    const row = f.complaintTable.get(f.firstCase.caseNo)!;
    f.complaintTable.set(f.firstCase.caseNo, { ...row, relatedOrderId });
    const rows = (
      await f.service.rebuildMonthlyOperationsSummaries({
        periodMonth: "2026-08",
      })
    ).records;
    expect(total(rows)).toBe(1);
    expect(rows[0]).toMatchObject({
      businessArea: "unassigned",
      serviceProductCode: "unknown",
      demandRequestCount: 0,
    });
    expect(
      total(
        (
          await f.service.rebuildMonthlyOperationsSummaries({
            periodMonth: "2026-08",
            businessArea: "NTP",
          })
        ).records,
      ),
    ).toBe(0);
  },
);

it.each([{ businessArea: "TPE" }, { serviceProductCode: "taxi_realtime" }])(
  "does not attribute a complaint to a different filtered dimension: %j",
  async (filter) => {
    const f = await reportFixture();
    expect(
      total(
        (
          await f.service.rebuildMonthlyOperationsSummaries({
            periodMonth: "2026-08",
            ...filter,
          })
        ).records,
      ),
    ).toBe(0);
  },
);

it("keeps a canonical order's area/product when its old trip lies outside the query period", async () => {
  const f = await reportFixture();
  const rows = (
    await f.service.rebuildMonthlyOperationsSummaries({
      periodMonth: "2026-08",
      businessArea: "NTP",
      serviceProductCode: "enterprise_dispatch",
    })
  ).records;
  expect(total(rows)).toBe(1);
});

it("does not include cases created outside the requested interval", async () => {
  const f = await reportFixture({ caseAt: "2026-04-01T08:00:00.000Z" });
  const rows = await f.service.previewSixMonthOperationsSummary({
    periodMonthFrom: "2026-05",
    periodMonthTo: "2026-10",
  });
  expect(total(rows)).toBe(0);
});

it("retains the complete requested monthly interval rather than only months with orders or cases", async () => {
  const f = await reportFixture();
  const result = await f.service.rebuildMonthlyOperationsSummaries({
    periodMonthFrom: "2026-05",
    periodMonthTo: "2026-10",
  });
  expect(result.records.map((row) => row.periodMonth)).toEqual([
    "2026-05",
    "2026-06",
    "2026-07",
    "2026-08",
    "2026-09",
    "2026-10",
  ]);
  expect(total(result.records)).toBe(1);
  expect(
    result.records.reduce((sum, row) => sum + row.demandRequestCount, 0),
  ).toBe(1);
});

it("six-month snapshot coverage uses the entire requested interval and retains the real sample-weighted average", async () => {
  const f = await reportFixture();
  f.snapshotRows.push({
    snapshot_at: "2026-08-02T08:00:00.000Z",
    business_area: "NTP",
    service_product_code: "enterprise_dispatch",
    dispatchable_vehicle_count: 4,
    available_driver_count: 4,
    source_health: "complete",
    generated_at: "2026-08-02T08:00:00.000Z",
  });
  const rows = await f.service.previewSixMonthOperationsSummary({
    periodMonthFrom: "2026-05",
    periodMonthTo: "2026-10",
  });
  expect(rows).toHaveLength(1);
  expect(rows[0]).toMatchObject({
    validSnapshotCount: 1,
    expectedSnapshotCount: (31 + 30 + 31 + 31 + 30 + 31) * 24 * 12,
    averageDispatchableVehicleCount: 4,
  });
});

it("persists the corrected monthly rows for a newly constructed reporting peer without mutating order/CRM records", async () => {
  const f = await reportFixture();
  const before = digest({
    order: await f.stored(),
    cases: [...f.complaintTable.values()],
  });
  await f.service.rebuildMonthlyOperationsSummaries({ periodMonth: "2026-08" });
  const peer = f.makeService(),
    rows = await peer.listMonthlyOperationsSummaries({
      periodMonth: "2026-08",
    });
  expect(total(rows)).toBe(1);
  expect(f.monthly.size).toBe(1);
  expect(
    digest({ order: await f.stored(), cases: [...f.complaintTable.values()] }),
  ).toBe(before);
  expect(
    f.calls.some((c) => c.sql.includes("FROM crm.phase1_complaint_cases")),
  ).toBe(true);
});

it("returns corrected persisted counts through the original controller and real snake serializer", async () => {
  const f = await reportFixture();
  await f.controller.rebuildMonthlyOperationsSummaries(
    { periodMonth: "2026-08" },
    "controlled-rebuild",
  );
  const envelope = await f.controller.listMonthlyOperationsSummaries(
    { periodMonth: "2026-08" },
    "controlled-read",
  );
  const wire = (await lastValueFrom(
    new SnakeCaseInterceptor().intercept({} as never, {
      handle: () => of(envelope),
    }),
  )) as { data: { items: Array<Record<string, unknown>> } };
  expect(wire.data.items).toHaveLength(1);
  expect(wire.data.items[0]).toMatchObject({
    period_month: "2026-08",
    complaint_count: 1,
    complaints_by_category: { [f.firstCase.category]: 1 },
  });
});

it.each(["csv", "xlsx", "pdf"] as const)(
  "the actual module/provider/job and %s artifact contain the late complaint count",
  async (format) => {
    const f = await reportFixture();
    const { job, artifact } = await f.job(format);
    const rows = job.rows;
    if (!rows) throw new Error("Actual completed report rows missing");
    if (format === "csv") {
      expect(rows).toHaveLength(6);
      expect(
        rows.map((row) => ("periodMonth" in row ? row.periodMonth : null)),
      ).toEqual([
        "2026-05",
        "2026-06",
        "2026-07",
        "2026-08",
        "2026-09",
        "2026-10",
      ]);
      for (const row of rows) {
        expect(row).toMatchObject({
          businessArea: "NTP",
          serviceProductCode: "enterprise_dispatch",
        });
      }
      const juneRow = rows.find(
        (row) => "periodMonth" in row && row.periodMonth === "2026-06",
      );
      expect(juneRow).toMatchObject({
        periodMonth: "2026-06",
        complaintCount: 0,
        demandRequestCount: 1,
        completedTripCount: 1,
        complaintsByCategory: {},
      });
      const augustRow = rows.find(
        (row) => "periodMonth" in row && row.periodMonth === "2026-08",
      );
      expect(augustRow).toMatchObject({
        periodMonth: "2026-08",
        complaintCount: 1,
        demandRequestCount: 0,
        completedTripCount: 0,
        complaintsByCategory: { [f.firstCase.category]: 1 },
      });
      for (const emptyMonth of ["2026-05", "2026-07", "2026-09", "2026-10"]) {
        const emptyRow = rows.find(
          (row) => "periodMonth" in row && row.periodMonth === emptyMonth,
        );
        expect(emptyRow).toMatchObject({
          periodMonth: emptyMonth,
          complaintCount: 0,
          demandRequestCount: 0,
          completedTripCount: 0,
          complaintsByCategory: {},
        });
      }
      expect(
        rows.reduce(
          (sum, row) => sum + ("complaintCount" in row ? row.complaintCount : 0),
          0,
        ),
      ).toBe(1);
      expect(
        rows.reduce(
          (sum, row) =>
            sum + ("demandRequestCount" in row ? row.demandRequestCount : 0),
          0,
        ),
      ).toBe(1);
      expect(
        rows.reduce(
          (sum, row) =>
            sum + ("completedTripCount" in row ? row.completedTripCount : 0),
          0,
        ),
      ).toBe(1);
    } else {
      expect(rows).toHaveLength(1);
      expect(rows[0]).toMatchObject({
        from: "2026-05-01",
        to: "2026-10-31",
        businessArea: "NTP",
        serviceProductCode: "enterprise_dispatch",
        complaintCount: 1,
        demandRequestCount: 1,
        completedTripCount: 1,
        complaintsByCategory: { [f.firstCase.category]: 1 },
      });
    }
    await assertArtifactRecords(artifact, format, rows);
    if (process.env.MONTHLY_REPORT_OUTPUT) {
      fs.mkdirSync(process.env.MONTHLY_REPORT_OUTPUT, { recursive: true });
      fs.writeFileSync(
        path.join(
          process.env.MONTHLY_REPORT_OUTPUT,
          `synthetic-late-complaint-six-month-summary.${format}`,
        ),
        artifact.buffer,
      );
    }
  },
);
