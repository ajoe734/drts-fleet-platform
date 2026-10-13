import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { EventEmitter } from "node:events";
import { resolve } from "node:path";
import { mkdtempSync, rmSync, readFileSync } from "node:fs";
import { tmpdir } from "node:os";
import {
  buildCapacityPlan,
  countsForDuration,
  type WorkloadFamily,
  type CapacityPlan,
  readBackBudgetedDispatchArrivals,
} from "../../../../tools/system-remediation/ops-capacity/plan-builder.mjs";

const boundary = vi.hoisted(() => ({ request: vi.fn(), offset: 0 }));
vi.mock("node:http", () => ({ request: boundary.request }));
vi.mock("node:perf_hooks", () => ({
  performance: { now: () => Date.now() + boundary.offset },
}));
// prettier-ignore
// @ts-expect-error -- TS7016: no declaration file for the allocated exact producer
import { runPlan, measure, prepareDispatchItem } from "../../../../tools/system-remediation/ops-proof/capacity.mjs";

// The real scheduler/measure functions run. Only external HTTP and clock/timer
// boundaries are controlled; no server is created and no scheduler is copied.
let directory: string;
let responseMode: "success" | "429" | "hang";
let responseDelay: number;
let nextResource: number;
let seedResponseDelay: number;
let activeSeeds: number;
let peakSeeds: number;
let nextSeed: number;
let rejectedSeed: number | null;
function plan(
  durationSeconds = 6,
  maxInFlight = 500,
  profile: CapacityPlan["profile"] = "uniform",
) {
  return buildCapacityPlan({
    origin: "http://127.0.0.1:4010/",
    durationSeconds,
    maxInFlight,
    profile,
    isolatedResourceId: "external-http-fixture",
    tenantId: "tenant",
    tenantJwt: "fixture",
    dispatchJwt: "fixture",
    reportJwt: "fixture",
    runTag: "scheduler-fixture",
    orderIds: Array.from(
      { length: countsForDuration(durationSeconds).dispatch },
      (_, i) => `order-${i}`,
    ),
  });
}
function stagedPlan(profile: CapacityPlan["profile"] = "concurrent") {
  return buildCapacityPlan({
    origin: "http://127.0.0.1:4010/",
    durationSeconds: 900,
    maxInFlight: 500,
    isolatedResourceId: "stage-http-boundary",
    tenantId: "tenant",
    tenantJwt: "fixture",
    dispatchJwt: "fixture",
    reportJwt: "fixture",
    runTag: "stage-fixture",
    profile,
    stagedDispatch: true,
    orderIds: Array.from({ length: 500 }, (_, i) => `actual-initial-${i}`),
  });
}
type Row = {
  workload: WorkloadFamily;
  sequence: number;
  launchedMs: number | null;
  attemptedMs: number;
  scheduledMs: number;
  error: string | null;
  requestId: string;
  profile: CapacityPlan["profile"];
  finishedMs: number | null;
};
type RecordedRow =
  | (Row & { kind: "capacity_request"; path: string })
  | {
      kind: "capacity_seed";
      sequence: number;
      error: string | null;
      startedMs: number;
      readyMs: number | null;
      resourceIds?: { orderId?: string };
    };
const readRecords = (output: string): RecordedRow[] =>
  readFileSync(output, "utf8")
    .trim()
    .split("\n")
    .map((line) => JSON.parse(line));
const read = (output: string): Row[] =>
  readFileSync(output, "utf8")
    .trim()
    .split("\n")
    .map((line) => JSON.parse(line));
const spacing: Record<WorkloadFamily, number> = {
  booking: 1000,
  dispatch: 200,
  report: 2000,
};
function assertUniformCadence(rows: Row[]) {
  for (const family of ["booking", "dispatch", "report"] as const) {
    const familyRows = rows
      .filter((row) => row.workload === family && row.launchedMs !== null)
      .sort((a, b) => a.sequence - b.sequence);
    expect(familyRows.length).toBeGreaterThanOrEqual(3);
    familyRows.forEach((row, i) => {
      expect(row.launchedMs!).toBeGreaterThanOrEqual(row.scheduledMs);
      if (i)
        expect(
          row.launchedMs! - familyRows[i - 1]!.launchedMs!,
        ).toBeGreaterThanOrEqual(spacing[family]);
    });
  }
}
beforeEach(() => {
  vi.useFakeTimers({ toFake: ["Date", "setTimeout", "clearTimeout"] });
  vi.setSystemTime(0);
  boundary.offset = 0;
  boundary.request.mockReset();
  directory = mkdtempSync(resolve(tmpdir(), "c123-scheduler-"));
  responseMode = "success";
  responseDelay = 5;
  nextResource = 0;
  seedResponseDelay = 5;
  activeSeeds = 0;
  peakSeeds = 0;
  nextSeed = 0;
  rejectedSeed = null;
  boundary.request.mockImplementation(
    (
      _url: URL,
      _options: unknown,
      callback: (response: EventEmitter & { statusCode: number }) => void,
    ) => {
      const req = new EventEmitter();
      const isSeed = _url.pathname === "/api/orders";
      let seedIndex: number | null = null;
      let seedSettled = false;
      const settleSeed = () => {
        if (isSeed && !seedSettled) {
          activeSeeds--;
          seedSettled = true;
        }
      };
      Object.assign(req, {
        end: () => {
          if (isSeed) {
            seedIndex = nextSeed++;
            activeSeeds++;
            peakSeeds = Math.max(peakSeeds, activeSeeds);
          }
          if (responseMode === "hang") return;
          setTimeout(
            () => {
              const response = Object.assign(new EventEmitter(), {
                statusCode:
                  responseMode === "429" ||
                  (isSeed && seedIndex === rejectedSeed)
                    ? 429
                    : 201,
              });
              settleSeed();
              callback(response);
              response.emit(
                "data",
                Buffer.from(
                  JSON.stringify({
                    data: {
                      order_id: `fixture-order-${nextResource++}`,
                      job_id: "fixture-job",
                    },
                  }),
                ),
              );
              response.emit("end");
            },
            isSeed ? seedResponseDelay : responseDelay,
          );
        },
        destroy: (error: Error) => {
          settleSeed();
          req.emit("error", error);
        },
      });
      return req;
    },
  );
});
afterEach(() => {
  vi.restoreAllMocks();
  vi.useRealTimers();
  rmSync(directory, { recursive: true, force: true });
});

describe("actual capacity scheduler boundaries across all families", () => {
  it.each([
    [0, 5],
    [0, 201],
    [2, 201],
  ])(
    "runs the separately named burst with variable0/%sms timer lateness and %sms real seed readiness",
    async (jitter, seedMs) => {
      seedResponseDelay = seedMs;
      const timer = globalThis.setTimeout;
      let wakes = 0;
      vi.spyOn(globalThis, "setTimeout").mockImplementation(((
        callback: () => void,
        ms: number,
      ) => timer(callback, ms + (++wakes % 2) * jitter)) as typeof setTimeout);
      const output = resolve(directory, "budgeted-burst.jsonl");
      const run = runPlan(stagedPlan("budgeted_dispatch_burst"), output, {});
      await vi.advanceTimersByTimeAsync(920000);
      const summary = await run;
      const allRows = readRecords(output);
      const requests = allRows.filter((row) => row.kind === "capacity_request");
      const seeds = allRows.filter((row) => row.kind === "capacity_seed");
      expect(requests).toHaveLength(5850);
      expect(seeds).toHaveLength(4000);
      expect(boundary.request).toHaveBeenCalledTimes(9850);
      expect(summary.profile).toBe("budgeted_dispatch_burst");
      expect(summary.result).toBe("measurements_within_targets");
      expect(summary.fullBurstSchedule).toBe(true);
      expect(summary.workflows.dispatch.arrivals.lastMs).toBeGreaterThanOrEqual(
        899800,
      );
      expect(summary.workflows.dispatch.arrivals.lastMs).toBeLessThan(900000);
      const dispatch = requests.filter((row) => row.workload === "dispatch");
      expect(new Set(dispatch.map((row) => row.path)).size).toBe(4500);
      for (const family of ["booking", "dispatch", "report"] as const) {
        const rows = requests
          .filter((row) => row.workload === family)
          .sort((a, b) => a.sequence - b.sequence);
        expect(rows).toHaveLength(
          { booking: 900, dispatch: 4500, report: 450 }[family],
        );
        let first = 0;
        rows.forEach((row, i) => {
          expect(row.error).toBeNull();
          expect(row.launchedMs).toBeGreaterThanOrEqual(row.scheduledMs);
          expect(row.launchedMs).toBeLessThan(900000);
          while (row.launchedMs! - rows[first]!.launchedMs! >= 60000) first++;
          expect(i - first + 1).toBeLessThanOrEqual(
            { booking: 60, dispatch: 300, report: 30 }[family],
          );
        });
      }
      for (const seed of seeds) {
        const request = dispatch.find((row) => row.sequence === seed.sequence)!;
        expect(request.launchedMs).toBeGreaterThanOrEqual(seed.readyMs!);
      }
      const intake = requests.filter((row) => row.workload === "booking");
      expect(intake.filter((row) => row.launchedMs === 0)).toHaveLength(50);
      expect(intake.slice(0, 50).every((row) => row.finishedMs! > 0)).toBe(
        true,
      );
      expect(readBackBudgetedDispatchArrivals(allRows)).toEqual({
        profile: "budgeted_dispatch_burst",
        finalArrivalMs: summary.workflows.dispatch.arrivals.lastMs,
        stagedCreations: 4000,
      });
      const laterIntake = structuredClone(allRows);
      laterIntake
        .filter((row) => row.kind === "capacity_request")
        .find(
          (row) => row.workload === "booking" && row.sequence === 900,
        )!.launchedMs = 899999;
      expect(readBackBudgetedDispatchArrivals(laterIntake).finalArrivalMs).toBe(
        summary.workflows.dispatch.arrivals.lastMs,
      );
      expect(() => readBackBudgetedDispatchArrivals(requests.slice(1))).toThrow(
        /5850/,
      );
      expect(() => readBackBudgetedDispatchArrivals(requests)).toThrow(/4000/);
      for (const fault of [
        "duplicate",
        "missing-ready",
        "late-ready",
        "foreign-order",
      ] as const) {
        const invalid = structuredClone(allRows);
        const seed = invalid
          .filter((row) => row.kind === "capacity_seed")
          .find((row) => row.sequence === 501)!;
        if (fault === "duplicate") seed.sequence = 502;
        if (fault === "missing-ready") seed.readyMs = null;
        if (fault === "late-ready") seed.readyMs = 900000;
        if (fault === "foreign-order")
          seed.resourceIds = { orderId: "unowned" };
        expect(() => readBackBudgetedDispatchArrivals(invalid)).toThrow(
          /seed readiness/,
        );
      }
      const changed = structuredClone(allRows);
      changed.filter((row) => row.kind === "capacity_request")[0]!.profile =
        "concurrent";
      expect(() => readBackBudgetedDispatchArrivals(changed)).toThrow(
        /invalid/,
      );
      const compressed = structuredClone(allRows);
      for (const row of compressed
        .filter((row) => row.kind === "capacity_request")
        .filter((row) => row.workload === "dispatch" && row.sequence <= 299))
        row.launchedMs = 100;
      expect(() => readBackBudgetedDispatchArrivals(compressed)).toThrow(
        /rolling budget/,
      );
      expect(peakSeeds).toBeLessThanOrEqual(8);
      expect(activeSeeds).toBe(0);
      expect(vi.getTimerCount()).toBe(0);
    },
  );

  it.each(["429", "overload", "seed-failure", "late"] as const)(
    "keeps every outcome and rejects the budgeted burst on %s",
    async (fault) => {
      const burst = stagedPlan("budgeted_dispatch_burst");
      if (fault === "429") responseMode = "429";
      if (fault === "overload") burst.maxInFlight = 1;
      if (fault === "seed-failure") rejectedSeed = 0;
      if (fault === "late") {
        const timer = globalThis.setTimeout;
        vi.spyOn(globalThis, "setTimeout").mockImplementation(((
          callback: () => void,
          ms: number,
        ) => timer(callback, ms + 250)) as typeof setTimeout);
      }
      const output = resolve(directory, `${fault}-budgeted-burst.jsonl`);
      const run = runPlan(burst, output, {});
      await vi.advanceTimersByTimeAsync(1000000);
      const summary = await run;
      const allRows = readRecords(output);
      const rows = allRows.filter((row) => row.kind === "capacity_request");
      expect(rows).toHaveLength(5850);
      expect(
        allRows.filter((row) => row.kind === "capacity_seed"),
      ).toHaveLength(4000);
      expect(rows.filter((row) => row.error).length).toBeGreaterThan(0);
      expect(summary.result).toBe("failed");
      expect(() => readBackBudgetedDispatchArrivals(allRows)).toThrow(
        /invalid/,
      );
      expect(
        rows
          .filter((row) => row.launchedMs !== null)
          .every((row) => row.launchedMs! < 900000),
      ).toBe(true);
      expect(peakSeeds).toBeLessThanOrEqual(8);
      expect(activeSeeds).toBe(0);
      expect(vi.getTimerCount()).toBe(0);
    },
  );
  it("refuses late admissions, preserves all 5850 outcomes and drains every sent request", async () => {
    const original = boundary.request.getMockImplementation()!;
    let first = true;
    boundary.request.mockImplementation((...args) => {
      if (first) {
        first = false;
        // Actual synchronous HTTP-boundary stall after t0, not setup lateness.
        boundary.offset += 1000;
      }
      return original(...args);
    });
    const output = resolve(directory, "late-baseline-arrivals.jsonl");
    const run = runPlan(plan(900), output, {});
    await vi.advanceTimersByTimeAsync(910000);
    const summary = await run;
    const rows = read(output);
    expect(rows).toHaveLength(5850);
    for (const row of rows)
      expect(row.requestId).toBe(
        `scheduler-fixture-${row.workload}-req-${row.sequence - 1}`,
      );
    const unsent = rows.filter((row) => row.launchedMs === null);
    expect(unsent).toHaveLength(5);
    expect(unsent.every((row) => row.attemptedMs >= 900000)).toBe(true);
    expect(
      unsent.every((row) => row.error?.includes("admission window elapsed")),
    ).toBe(true);
    expect(boundary.request).toHaveBeenCalledTimes(5850 - unsent.length);
    expect(
      rows
        .filter((row) => row.launchedMs !== null)
        .every((row) => row.launchedMs! < 900000),
    ).toBe(true);
    expect(summary.workflows.dispatch.arrivals.count).toBe(4495);
    expect(summary.workflows.dispatch.errors).toBe(5);
    expect(summary.workflows.dispatch.arrivals.late).toBe(5);
    expect(summary.result).toBe("failed");
    expect(summary.fullBurstSchedule).toBe(false);
    expect(vi.getTimerCount()).toBe(0);
  });

  it("allows responses after900s when all actual arrivals stay inside the original window", async () => {
    responseDelay = 250;
    const output = resolve(directory, "valid-arrivals-later-responses.jsonl");
    const run = runPlan(plan(900), output, {});
    await vi.advanceTimersByTimeAsync(910000);
    const summary = await run;
    const rows = read(output);
    expect(rows).toHaveLength(5850);
    expect(rows.every((row) => row.error === null)).toBe(true);
    expect(Math.max(...rows.map((row) => row.launchedMs!))).toBe(899800);
    expect(summary.elapsedMs).toBe(900050);
    expect(summary.result).toBe("measurements_within_targets");
    expect(summary.fullBurstSchedule).toBe(true);
    for (const family of ["booking", "dispatch", "report"] as const) {
      const launches = rows
        .filter((row) => row.workload === family)
        .map((row) => row.launchedMs!);
      expect(summary.workflows[family].arrivals).toEqual({
        count: launches.length,
        firstMs: Math.min(...launches),
        lastMs: Math.max(...launches),
        early: 0,
        late: 0,
      });
    }
  });

  it("records real readiness before one measured t0 and preserves every measured request", async () => {
    const output = resolve(directory, "baseline-initialize.jsonl");
    const initialize = vi.fn(async ({ startedAt }: { startedAt: string }) => {
      expect(startedAt).toBe(new Date(0).toISOString());
      expect(boundary.request).not.toHaveBeenCalled();
      await new Promise<void>((resolve) => setTimeout(resolve, 25));
    });
    const run = runPlan(plan(), output, {}, { initialize });
    await vi.advanceTimersByTimeAsync(20000);
    const summary = await run;
    const rows = read(output);
    expect(initialize).toHaveBeenCalledTimes(1);
    expect(Math.min(...rows.map((row) => row.launchedMs!))).toBe(0);
    expect(summary.preparationStartedAt).toBe(new Date(0).toISOString());
    expect(summary.startedAt).toBe(new Date(25).toISOString());
    assertUniformCadence(rows);
    expect(rows).toHaveLength(39);
    expect(summary.elapsedMs).toBe(5805);
    expect(Date.parse(summary.endedAt) - Date.parse(summary.startedAt)).toBe(
      summary.elapsedMs,
    );
  });

  it("retains raw preparation failure and never sends measured requests after it", async () => {
    const output = resolve(directory, "baseline-initialize-failed.jsonl");
    await expect(
      runPlan(
        plan(),
        output,
        {},
        {
          initialize: async () => {
            throw new Error("durable backlog commit failed");
          },
        },
      ),
    ).rejects.toThrow("durable backlog commit failed");
    expect(boundary.request).not.toHaveBeenCalled();
    expect(read(output)).toMatchObject([
      {
        kind: "capacity_preparation_failure",
        error: "durable backlog commit failed",
      },
    ]);
  });

  it.each([5, 200, 201])(
    "retains all 5850 requests/4000 seeds with bounded actual %sms seed readiness",
    async (seedMs) => {
      seedResponseDelay = seedMs;
      const staged = stagedPlan();
      const output = resolve(directory, "staged.jsonl");
      const run = runPlan(staged, output, {});
      await vi.advanceTimersByTimeAsync(910000);
      const summary = await run;
      const allRows = readRecords(output);
      const requests = allRows.filter((row) => row.kind === "capacity_request");
      expect(requests).toHaveLength(5850);
      expect(
        allRows.filter((row) => row.kind === "capacity_seed"),
      ).toHaveLength(4000);
      const dispatch = requests.filter((row) => row.workload === "dispatch");
      expect(new Set(dispatch.map((row) => row.path)).size).toBe(4500);
      expect(dispatch.at(-1)!.launchedMs).toBe(899800);
      expect(summary.workflows.dispatch.requests).toBe(4500);
      expect(summary.workflows.booking.requests).toBe(900);
      expect(summary.workflows.report.requests).toBe(450);
      expect(summary.result).toBe("measurements_within_targets");
      expect(boundary.request).toHaveBeenCalledTimes(9850);
      expect(peakSeeds).toBeLessThanOrEqual(8);
      expect(activeSeeds).toBe(0);
      const seeds = allRows.filter((row) => row.kind === "capacity_seed");
      for (const seed of seeds) {
        if (seed.readyMs === null)
          throw new Error("Expected successful real seed readiness");
        expect(seed.startedMs).toBeGreaterThanOrEqual(0);
        expect(seed.readyMs - seed.startedMs).toBe(seedMs);
        const dispatched = dispatch.find(
          (row) => row.sequence === seed.sequence,
        )!;
        expect(dispatched.launchedMs!).toBeGreaterThanOrEqual(seed.readyMs);
      }
      expect(vi.getTimerCount()).toBe(0);
    },
  );
  it("retains a failed staged seed without retrying or dispatching its uncreated order", async () => {
    rejectedSeed = 0;
    seedResponseDelay = 201;
    const output = resolve(directory, "seed-error.jsonl");
    const run = runPlan(stagedPlan(), output, {});
    await vi.advanceTimersByTimeAsync(910000);
    const summary = await run;
    const rows = readRecords(output);
    const seeds = rows.filter((row) => row.kind === "capacity_seed");
    const requests = rows.filter((row) => row.kind === "capacity_request");
    expect(seeds).toHaveLength(4000);
    expect(requests).toHaveLength(5850);
    expect(seeds.filter((row) => row.error)).toMatchObject([
      { error: "HTTP 429", readyMs: null },
    ]);
    expect(requests.filter((row) => row.error)).toMatchObject([
      { workload: "dispatch", error: "Dispatch stage failed: HTTP 429" },
    ]);
    expect(summary.workflows.dispatch.errors).toBe(1);
    expect(summary.result).toBe("failed");
    expect(boundary.request).toHaveBeenCalledTimes(9849);
    expect(peakSeeds).toBeLessThanOrEqual(8);
    expect(activeSeeds).toBe(0);
    expect(vi.getTimerCount()).toBe(0);
  });
  it("keeps slow readiness outside900s red instead of forging readiness or dropping requests", async () => {
    seedResponseDelay = 2001;
    const output = resolve(directory, "slow-seeds.jsonl");
    const run = runPlan(stagedPlan(), output, {});
    await vi.advanceTimersByTimeAsync(1400000);
    const summary = await run;
    const rows = readRecords(output);
    expect(rows.filter((row) => row.kind === "capacity_seed")).toHaveLength(
      4000,
    );
    expect(rows.filter((row) => row.kind === "capacity_request")).toHaveLength(
      5850,
    );
    expect(summary.workflows.dispatch.arrivals.late).toBeGreaterThan(0);
    expect(summary.fullBurstSchedule).toBe(false);
    expect(summary.result).toBe("failed");
    expect(peakSeeds).toBeLessThanOrEqual(8);
    expect(activeSeeds).toBe(0);
    expect(vi.getTimerCount()).toBe(0);
  });
  it("resolves a deferred dispatch through real HTTP measure and refuses a failed fixture seed", async () => {
    const deferred = {
      ...plan().workloads.dispatch[0],
      path: "/api/orders/{orderId}/dispatch",
      stageOrder: {
        method: "POST",
        path: "/api/orders",
        headers: { "idempotency-key": "stage-1" },
        body: {},
      },
    };
    const success = prepareDispatchItem("http://127.0.0.1:4010/", deferred);
    await vi.advanceTimersByTimeAsync(5);
    expect((await success).item.path).toBe(
      "/api/orders/fixture-order-0/dispatch",
    );
    responseMode = "429";
    const failed = prepareDispatchItem("http://127.0.0.1:4010/", deferred);
    await vi.advanceTimersByTimeAsync(5);
    expect(await failed).toMatchObject({
      error: "Dispatch stage failed: HTTP 429",
      seed: { error: "HTTP 429" },
    });
    expect(boundary.request).toHaveBeenCalledTimes(2);
  });
  it("actually launches 50 intake operations together without extending deadlines or exceeding minute budgets", async () => {
    const output = resolve(directory, "concurrent.jsonl");
    const run = runPlan(plan(60, 500, "concurrent"), output, {});
    await vi.advanceTimersByTimeAsync(90000);
    const summary = await run;
    const rows = read(output);
    const booking = rows.filter((row) => row.workload === "booking");
    expect(booking.filter((row) => row.launchedMs === 0)).toHaveLength(50);
    expect(
      booking.filter(
        (row) => row.launchedMs !== null && row.launchedMs < 50000,
      ),
    ).toHaveLength(50);
    expect(summary.workflows.booking.requests).toBe(60);
    expect(summary.workflows.dispatch.requests).toBe(300);
    expect(summary.workflows.report.requests).toBe(30);
    expect(summary.result).toBe("measurements_within_targets");
    expect(boundary.request).toHaveBeenCalledTimes(390);
  });
  it.each(["uniform", "concurrent"] as const)(
    "%s retains the full strict900s schedule under constant1ms timer lateness",
    async (profile) => {
      const timer = globalThis.setTimeout;
      vi.spyOn(globalThis, "setTimeout").mockImplementation(((
        callback: () => void,
        ms: number,
      ) => timer(callback, ms + 1)) as typeof setTimeout);
      const output = resolve(directory, "constant-lateness.jsonl");
      const run = runPlan(
        profile === "uniform" ? plan(900) : stagedPlan(),
        output,
        {},
      );
      await vi.advanceTimersByTimeAsync(910000);
      const summary = await run;
      const allRows = readRecords(output);
      const rows = allRows.filter((row) => row.kind === "capacity_request");
      expect(rows).toHaveLength(5850);
      expect(
        allRows.filter((row) => row.kind === "capacity_seed"),
      ).toHaveLength(profile === "concurrent" ? 4000 : 0);
      expect(summary.result).toBe("measurements_within_targets");
      expect(summary.fullBurstSchedule).toBe(true);
      expect(summary.workflows.dispatch.arrivals.lastMs).toBe(899801);
      for (const family of ["booking", "dispatch", "report"] as const) {
        const launches = rows
          .filter((row) => row.workload === family)
          .sort((a, b) => a.sequence - b.sequence)
          .map((row) => row.launchedMs!);
        let first = 0;
        launches.forEach((time, i) => {
          expect(time).toBeGreaterThanOrEqual(0);
          expect(time).toBeLessThan(900000);
          if (i && (profile === "uniform" || family === "dispatch"))
            expect(time - launches[i - 1]!).toBeGreaterThanOrEqual(
              spacing[family],
            );
          while (time - launches[first]! >= 60000) first++;
          expect(i - first + 1).toBeLessThanOrEqual(
            { booking: 60, dispatch: 300, report: 30 }[family],
          );
        });
      }
      expect(rows.every((row) => row.error === null)).toBe(true);
      expect(activeSeeds).toBe(0);
      expect(peakSeeds).toBeLessThanOrEqual(8);
      expect(vi.getTimerCount()).toBe(0);
    },
  );
  it("refuses infeasible variable timer lateness without weakening actual spacing or dropping outcomes", async () => {
    const timer = globalThis.setTimeout;
    let wakes = 0;
    vi.spyOn(globalThis, "setTimeout").mockImplementation(((
      callback: () => void,
      ms: number,
    ) => {
      const jitter = ms > 20 && ms < 30000 ? (++wakes % 2) * 250 : 0;
      return timer(callback, ms + jitter);
    }) as typeof setTimeout);
    const output = resolve(directory, "variable-lateness.jsonl");
    const run = runPlan(plan(900), output, {});
    await vi.advanceTimersByTimeAsync(950000);
    const summary = await run;
    const rows = read(output);
    expect(rows).toHaveLength(5850);
    expect(summary.result).toBe("failed");
    expect(summary.fullBurstSchedule).toBe(false);
    expect(
      rows.filter((row) => row.launchedMs === null).length,
    ).toBeGreaterThan(0);
    expect(
      rows
        .filter((row) => row.launchedMs !== null)
        .every((row) => row.launchedMs! < 900000),
    ).toBe(true);
    assertUniformCadence(rows);
    expect(
      boundary.request.mock.calls.length +
        rows.filter((row) => row.launchedMs === null).length,
    ).toBe(5850);
    expect(vi.getTimerCount()).toBe(0);
  });

  it("preserves exact minimum intervals and deadlines through early timer callbacks", async () => {
    const timer = globalThis.setTimeout;
    // A host timer can return early; scheduler must re-check its own clock.
    vi.spyOn(globalThis, "setTimeout").mockImplementation(((
      callback: () => void,
      ms: number,
    ) => timer(callback, Math.max(1, ms - 1))) as typeof setTimeout);
    const output = resolve(directory, "early.jsonl");
    const run = runPlan(plan(), output, {});
    await vi.advanceTimersByTimeAsync(20000);
    await run;
    assertUniformCadence(read(output));
    expect(vi.getTimerCount()).toBe(0);
  });

  it("does not compress any family's spacing after oversleep", async () => {
    const timer = globalThis.setTimeout;
    vi.spyOn(globalThis, "setTimeout").mockImplementation(((
      callback: () => void,
      ms: number,
    ) =>
      timer(() => {
        if (ms > 100 && ms < 30000) boundary.offset += 75;
        callback();
      }, ms)) as typeof setTimeout);
    const output = resolve(directory, "late.jsonl");
    const run = runPlan(plan(), output, {});
    await vi.advanceTimersByTimeAsync(20000);
    await run;
    assertUniformCadence(read(output));
  });

  it.each(["booking", "dispatch", "report"] as const)(
    "%s request reaches the actual 30s deadline and clears its timer",
    async (family) => {
      responseMode = "hang";
      const item = plan().workloads[family][0]!;
      let settled = false;
      const result = measure("http://127.0.0.1:4010/", item).then(
        (value: { error: string; latencyMs: number }) => {
          settled = true;
          return value;
        },
      );
      await vi.advanceTimersByTimeAsync(29999);
      expect(settled).toBe(false);
      await vi.advanceTimersByTimeAsync(1);
      expect(await result).toMatchObject({
        error: "Request deadline exceeded 30 seconds",
        latencyMs: 30000,
      });
      expect(vi.getTimerCount()).toBe(0);
    },
  );

  it("retains overload records and every planned request without retrying", async () => {
    responseDelay = 1000;
    const output = resolve(directory, "overload.jsonl");
    const run = runPlan(plan(1, 1), output, {});
    await vi.advanceTimersByTimeAsync(5000);
    const summary = await run;
    const rows = read(output);
    expect(rows).toHaveLength(7);
    expect(
      rows.filter((row) => row.error?.includes("maxInFlight exhausted")),
    ).toHaveLength(6);
    expect(boundary.request).toHaveBeenCalledTimes(1);
    expect(summary.result).toBe("failed");
  });

  it("retains every raw HTTP429 and marks all three families failed", async () => {
    responseMode = "429";
    const output = resolve(directory, "429.jsonl");
    const run = runPlan(plan(6), output, {});
    await vi.advanceTimersByTimeAsync(10000);
    const summary = await run;
    expect(read(output)).toHaveLength(39);
    expect(boundary.request).toHaveBeenCalledTimes(39);
    for (const family of ["booking", "dispatch", "report"] as const) {
      expect(summary.workflows[family].errors).toBe(
        summary.workflows[family].requests,
      );
      expect(
        read(output)
          .filter((row) => row.workload === family)
          .every((row) => row.error === "HTTP 429"),
      ).toBe(true);
    }
    expect(summary.result).toBe("failed");
  });
});
