import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { EventEmitter } from "node:events";
import { resolve } from "node:path";
import { mkdtempSync, rmSync, readFileSync } from "node:fs";
import { tmpdir } from "node:os";
import {
  buildCapacityPlan,
  countsForDuration,
  type WorkloadFamily,
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
function plan(
  durationSeconds = 6,
  maxInFlight = 500,
  profile: "uniform" | "concurrent" = "uniform",
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
type Row = {
  workload: WorkloadFamily;
  sequence: number;
  launchedMs: number;
  scheduledMs: number;
  error: string | null;
};
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
      .filter((row) => row.workload === family)
      .sort((a, b) => a.sequence - b.sequence);
    expect(familyRows.length).toBeGreaterThanOrEqual(3);
    familyRows.forEach((row, i) => {
      expect(row.launchedMs).toBeGreaterThanOrEqual(row.scheduledMs);
      if (i)
        expect(
          row.launchedMs - familyRows[i - 1]!.launchedMs,
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
  boundary.request.mockImplementation(
    (
      _url: URL,
      _options: unknown,
      callback: (response: EventEmitter & { statusCode: number }) => void,
    ) => {
      const req = new EventEmitter();
      Object.assign(req, {
        end: () => {
          if (responseMode === "hang") return;
          setTimeout(() => {
            const response = Object.assign(new EventEmitter(), {
              statusCode: responseMode === "429" ? 429 : 201,
            });
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
          }, responseDelay);
        },
        destroy: (error: Error) => req.emit("error", error),
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
  it("rejects actual arrivals beyond 900s even when all 5850 responses meet their targets", async () => {
    const output = resolve(directory, "late-baseline-arrivals.jsonl");
    const run = runPlan(plan(900), output, {}, {
      initialize: () => new Promise<void>((resolve) => setTimeout(resolve, 1000)),
    });
    await vi.advanceTimersByTimeAsync(910000);
    const summary = await run;
    const rows = read(output);
    expect(rows).toHaveLength(5850);
    expect(rows.every((row) => row.error === null)).toBe(true);
    expect(Math.max(...rows.map((row) => row.launchedMs))).toBe(900800);
    for (const family of ["booking", "dispatch", "report"] as const) {
      expect(summary.workflows[family].errors).toBe(0);
      expect(summary.workflows[family].latencyTargetsMet).toBe(true);
    }
    expect(summary.result).toBe("failed");
    expect(summary.fullBurstSchedule).toBe(false);
  });

  it("includes actual preparation time in the original window and preserves every measured request", async () => {
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
    expect(Math.min(...rows.map((row) => row.launchedMs))).toBe(25);
    assertUniformCadence(rows);
    expect(rows).toHaveLength(39);
    expect(summary.elapsedMs).toBeGreaterThanOrEqual(25 + 5800);
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

  it("runs every scheduled stage through the actual producer and retains 5850 measured and 4000 seed records", async () => {
    const staged = buildCapacityPlan({
      origin: "http://127.0.0.1:4010/",
      durationSeconds: 900,
      maxInFlight: 500,
      isolatedResourceId: "stage-http-boundary",
      tenantId: "tenant",
      tenantJwt: "fixture",
      dispatchJwt: "fixture",
      reportJwt: "fixture",
      runTag: "stage-fixture",
      profile: "concurrent",
      stagedDispatch: true,
      orderIds: Array.from({ length: 500 }, (_, i) => `actual-initial-${i}`),
    });
    const output = resolve(directory, "staged.jsonl");
    const run = runPlan(staged, output, {});
    await vi.advanceTimersByTimeAsync(910000);
    const summary = await run;
    const allRows: (Row & { kind: string; path: string })[] = readFileSync(
      output,
      "utf8",
    )
      .trim()
      .split("\n")
      .map((line) => JSON.parse(line));
    const requests = allRows.filter((row) => row.kind === "capacity_request");
    expect(requests).toHaveLength(5850);
    expect(allRows.filter((row) => row.kind === "capacity_seed")).toHaveLength(
      4000,
    );
    const dispatch = requests.filter((row) => row.workload === "dispatch");
    expect(new Set(dispatch.map((row) => row.path)).size).toBe(4500);
    expect(dispatch.at(-1)!.launchedMs).toBe(899805);
    expect(summary.workflows.dispatch.requests).toBe(4500);
    expect(summary.workflows.booking.requests).toBe(900);
    expect(summary.workflows.report.requests).toBe(450);
    expect(summary.result).toBe("measurements_within_targets");
    expect(boundary.request).toHaveBeenCalledTimes(9850);
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
    expect(booking.filter((row) => row.launchedMs < 50000)).toHaveLength(50);
    expect(summary.workflows.booking.requests).toBe(60);
    expect(summary.workflows.dispatch.requests).toBe(300);
    expect(summary.workflows.report.requests).toBe(30);
    expect(summary.result).toBe("measurements_within_targets");
    expect(boundary.request).toHaveBeenCalledTimes(390);
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
