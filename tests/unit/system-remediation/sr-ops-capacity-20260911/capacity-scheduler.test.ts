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
// @ts-expect-error -- owned allocation is this exact .mjs file; no shared declaration scope
import {
  runPlan,
  measure,
} from "../../../../tools/system-remediation/ops-proof/capacity.mjs";

// The real scheduler/measure functions run. Only external HTTP and clock/timer
// boundaries are controlled; no server is created and no scheduler is copied.
let directory: string;
let responseMode: "success" | "429" | "hang";
let responseDelay: number;
function plan(durationSeconds = 6, maxInFlight = 500) {
  return buildCapacityPlan({
    origin: "http://127.0.0.1:4010/",
    durationSeconds,
    maxInFlight,
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
                  data: { order_id: "fixture-order", job_id: "fixture-job" },
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
