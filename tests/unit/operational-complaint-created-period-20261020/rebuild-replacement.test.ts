import { afterEach, expect, it, vi } from "vitest";
import { ApiRequestError } from "../../../apps/api/src/common/api-envelope";
import { ReportingService } from "../../../apps/api/src/modules/reporting/reporting.service";
import { ReportingRepository } from "../../../apps/api/src/modules/reporting/reporting.repository";
import type { MonthlyOperationsSummaryRecord } from "../../../apps/api/src/modules/reporting/reporting.repository";
import { reportFixture } from "./fixture";
afterEach(() => {
  vi.restoreAllMocks();
  vi.unstubAllGlobals();
});
const sum = (rows: readonly { complaintCount: number }[]) =>
  rows.reduce((n, r) => n + r.complaintCount, 0);
const ordered = (map: Map<string, Record<string, unknown>>) =>
  [...map].sort(([a], [b]) => a.localeCompare(b));

it("recomputing a changed area replaces its former rows rather than counting one real case twice", async () => {
  const f = await reportFixture();
  await f.service.rebuildMonthlyOperationsSummaries({ periodMonth: "2026-08" });
  f.vehicles[0]!.operatingArea = "TPE";
  await f.service.rebuildMonthlyOperationsSummaries({ periodMonth: "2026-08" });
  const rows = await f
    .makeService()
    .listMonthlyOperationsSummaries({ periodMonth: "2026-08" });
  expect(sum(rows)).toBe(1);
  expect(rows).toHaveLength(1);
  expect(rows[0]!.businessArea).toBe("TPE");
});
it("recomputing an empty former area clears only that selected report slice", async () => {
  const f = await reportFixture();
  await f.service.rebuildMonthlyOperationsSummaries({ periodMonth: "2026-08" });
  f.vehicles[0]!.operatingArea = "TPE";
  await f.service.rebuildMonthlyOperationsSummaries({
    periodMonth: "2026-08",
    businessArea: "NTP",
  });
  expect(f.monthly.size).toBe(0);
});
it("recomputing a memory-mode report replaces obsolete dimensions as well", async () => {
  const f = await reportFixture();
  const snapshot = () => ({
    orders: [...f.db.table("ops.phase1_owned_orders").values()],
    dispatchJobs: [...f.db.table("ops.phase1_dispatch_jobs").values()],
    dispatchAssignments: [
      ...f.db.table("ops.phase1_dispatch_assignments").values(),
    ],
    driverTasks: [...f.db.table("ops.phase1_driver_tasks").values()],
    dispatchTraceLogs: [
      ...f.db.table("ops.phase1_dispatch_trace_logs").values(),
    ],
  });
  const service = new ReportingService(
    { getReportingSnapshot: snapshot } as never,
    { listComplaintCases: () => [...f.complaintTable.values()] } as never,
    f.registry as never,
  );
  await service.rebuildMonthlyOperationsSummaries({ periodMonth: "2026-08" });
  f.vehicles[0]!.operatingArea = "TPE";
  await service.rebuildMonthlyOperationsSummaries({ periodMonth: "2026-08" });
  const rows = await service.listMonthlyOperationsSummaries({
    periodMonth: "2026-08",
  });
  expect(sum(rows)).toBe(1);
  expect(rows.map((r) => r.businessArea)).toEqual(["TPE"]);
});
it("a scoped month/area/product replacement preserves all other stored report slices", async () => {
  const f = await reportFixture();
  await f.service.rebuildMonthlyOperationsSummaries({ periodMonth: "2026-08" });
  const seed = [...f.monthly.values()][0]!;
  const extraRows: Array<Record<string, unknown>> = [
    { ...seed, period_month: "2026-07" },
    { ...seed, business_area: "TPE" },
    { ...seed, service_product_code: "taxi_realtime" },
  ];
  for (const row of extraRows)
    f.monthly.set(
      `${row.period_month}:${row.business_area}:${row.service_product_code}`,
      row,
    );
  const preserved = ordered(f.monthly).filter(
    ([, r]) =>
      r.period_month !== "2026-08" ||
      r.business_area !== "NTP" ||
      r.service_product_code !== "enterprise_dispatch",
  );
  f.vehicles[0]!.operatingArea = "TPE";
  await f.service.rebuildMonthlyOperationsSummaries({
    periodMonth: "2026-08",
    businessArea: "NTP",
    serviceProductCode: "enterprise_dispatch",
  });
  expect(ordered(f.monthly)).toEqual(preserved);
});
it("rebuilding the same canonical source repeatedly never accumulates report rows or cases", async () => {
  const f = await reportFixture();
  for (let i = 0; i < 3; i++)
    await f.service.rebuildMonthlyOperationsSummaries({
      periodMonthFrom: "2026-05",
      periodMonthTo: "2026-10",
    });
  const rows = await f.makeService().listMonthlyOperationsSummaries({
    periodMonthFrom: "2026-05",
    periodMonthTo: "2026-10",
  });
  expect(rows).toHaveLength(6);
  expect(sum(rows)).toBe(1);
});
it("readers retain the previous complete report while a replacement is not committed", async () => {
  const f = await reportFixture();
  await f.service.rebuildMonthlyOperationsSummaries({ periodMonth: "2026-08" });
  const before = structuredClone(ordered(f.monthly));
  let release: () => void = () => {},
    arrived: () => void = () => {};
  const held = new Promise<void>((r) => {
      release = r;
    }),
    reached = new Promise<void>((r) => {
      arrived = r;
    });
  f.transactions.holds.afterDelete = async () => {
    arrived();
    await held;
  };
  f.vehicles[0]!.operatingArea = "TPE";
  const pending = f.service.rebuildMonthlyOperationsSummaries({
    periodMonth: "2026-08",
  });
  await reached;
  expect(ordered(f.monthly)).toEqual(before);
  const peer = await f
    .makeService()
    .listMonthlyOperationsSummaries({ periodMonth: "2026-08" });
  expect(peer.map((r) => r.businessArea)).toEqual(["NTP"]);
  release();
  await pending;
  expect([...f.monthly.values()].map((r) => r.business_area)).toEqual(["TPE"]);
});
it.each(["delete", "commit", "connect"] as const)(
  "a %s failure reports rebuild failure and preserves the old committed report",
  async (kind) => {
    const f = await reportFixture();
    await f.service.rebuildMonthlyOperationsSummaries({
      periodMonth: "2026-08",
    });
    const before = structuredClone(ordered(f.monthly));
    f.vehicles[0]!.operatingArea = "TPE";
    f.transactions.faults[kind] = true;
    const error = await f.service
      .rebuildMonthlyOperationsSummaries({ periodMonth: "2026-08" })
      .then(
        () => null,
        (error: unknown) => error,
      );
    expect(error).toBeInstanceOf(ApiRequestError);
    if (!(error instanceof ApiRequestError)) throw error;
    expect(error.code).toBe("REPORT_REBUILD_FAILED");
    expect(error.getStatus()).toBe(503);
    expect(ordered(f.monthly)).toEqual(before);
  },
);
it("an insert failure after deletion rolls back the entire multi-month replacement and releases its client", async () => {
  const f = await reportFixture();
  await f.service.rebuildMonthlyOperationsSummaries({
    periodMonthFrom: "2026-05",
    periodMonthTo: "2026-10",
  });
  const before = structuredClone(ordered(f.monthly));
  f.vehicles[0]!.operatingArea = "TPE";
  f.transactions.faults.insertAt = 2;
  await expect(
    f.controller.rebuildMonthlyOperationsSummaries({
      periodMonthFrom: "2026-05",
      periodMonthTo: "2026-10",
    }),
  ).rejects.toBeInstanceOf(ApiRequestError);
  expect(ordered(f.monthly)).toEqual(before);
  expect(f.transactions.events.at(-2)).toMatch(/rollback$/);
  expect(f.transactions.events.at(-1)).toMatch(/release$/);
  f.transactions.faults.insertAt = 0;
  await f.service.rebuildMonthlyOperationsSummaries({
    periodMonthFrom: "2026-05",
    periodMonthTo: "2026-10",
  });
  expect(f.monthly.size).toBe(6);
  expect([...f.monthly.values()].every((r) => r.business_area === "TPE")).toBe(
    true,
  );
});
it("two complete repository replacements serialize and publish one full set rather than a union", async () => {
  const f = await reportFixture();
  const first = (
    await f.service.rebuildMonthlyOperationsSummaries({
      periodMonth: "2026-08",
    })
  ).records;
  const second: MonthlyOperationsSummaryRecord[] = first.map((row) => ({
    ...row,
    businessArea: "TPE",
    complaintCount: 2,
    complaintsByCategory: { driver_service: 2 },
  }));
  let release: () => void = () => {},
    arrived: () => void = () => {},
    count = 0;
  const held = new Promise<void>((r) => {
      release = r;
    }),
    got = new Promise<void>((r) => {
      arrived = r;
    });
  f.transactions.holds.afterDelete = async () => {
    if (count++ === 0) {
      arrived();
      await held;
    }
  };
  const repository = new ReportingRepository(f.database),
    a = repository.replaceMonthlyOperationsSummaries(first, ["2026-08"]);
  await got;
  const b = repository.replaceMonthlyOperationsSummaries(second, ["2026-08"]);
  await Promise.resolve();
  release();
  await Promise.all([a, b]);
  const rows = await f
    .makeService()
    .listMonthlyOperationsSummaries({ periodMonth: "2026-08" });
  expect(rows).toHaveLength(1);
  expect(rows[0]).toMatchObject({ businessArea: "TPE", complaintCount: 2 });
});
it("an empty normalized month list does not modify any stored report or open a transaction", async () => {
  const f = await reportFixture();
  await f.service.rebuildMonthlyOperationsSummaries({ periodMonth: "2026-08" });
  const before = structuredClone(ordered(f.monthly)),
    events = f.transactions.events.length;
  await new ReportingRepository(f.database).replaceMonthlyOperationsSummaries(
    [],
    [],
  );
  expect(ordered(f.monthly)).toEqual(before);
  expect(f.transactions.events).toHaveLength(events);
});
it("retains the original SQL upsert caller alongside the atomic rebuild operation", async () => {
  const f = await reportFixture(),
    rows = (
      await f.service.rebuildMonthlyOperationsSummaries({
        periodMonth: "2026-08",
      })
    ).records;
  f.monthly.clear();
  await new ReportingRepository(f.database).upsertMonthlyOperationsSummaries(
    rows,
  );
  expect(f.monthly.size).toBe(1);
  expect(
    sum(
      await f
        .makeService()
        .listMonthlyOperationsSummaries({ periodMonth: "2026-08" }),
    ),
  ).toBe(1);
});
it("rebuilding derived report rows never rewrites the canonical order, case or previously completed report artifact", async () => {
  const f = await reportFixture(),
    old = await f.job("csv");
  const order = await f.stored(),
    cases = structuredClone([...f.complaintTable]);
  const oldRows = structuredClone(old.job.rows),
    oldBytes = Buffer.from(old.artifact.buffer);
  f.vehicles[0]!.operatingArea = "TPE";
  await f.service.rebuildMonthlyOperationsSummaries({
    periodMonthFrom: "2026-05",
    periodMonthTo: "2026-10",
  });
  expect(await f.stored()).toEqual(order);
  expect([...f.complaintTable]).toEqual(cases);
  expect(f.filing.getReportJob(old.job.jobId).rows).toEqual(oldRows);
  expect((await f.filing.renderReportArtifact(old.job.jobId)).buffer).toEqual(
    oldBytes,
  );
});
