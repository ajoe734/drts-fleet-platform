import { EventEmitter } from "node:events";
import {
  copyFileSync,
  mkdirSync,
  mkdtempSync,
  readFileSync,
  rmSync,
  writeFileSync,
} from "node:fs";
import { tmpdir } from "node:os";
import { resolve } from "node:path";
import { afterEach, beforeEach, expect, it, vi } from "vitest";
import { production } from "../../sr-api-throttle-key-isolation-20261013/production-loader";
import {
  BASELINE_PER_MINUTE,
  buildCapacityPlan,
  countsForDuration,
  readBackBudgetedDispatchArrivals,
  type CapacityPlan,
  type WorkloadFamily,
} from "../../../../tools/system-remediation/ops-capacity/plan-builder.mjs";
import { observeCapacityThrottle } from "../../../../tools/system-remediation/ops-capacity/throttle-observation.mjs";

const boundary = vi.hoisted(() => ({ request: vi.fn() }));
vi.mock("node:http", () => ({ request: boundary.request }));
vi.mock("node:perf_hooks", () => ({ performance: { now: () => Date.now() } }));
// prettier-ignore
// @ts-expect-error -- TS7016: the allocated producer has no shared declaration
import { runPlan } from "../../../../tools/system-remediation/ops-proof/capacity.mjs";

const { KeyScopedThrottlerStorage } = production<
  typeof import("../../../../apps/api/src/common/throttling/key-scoped-throttler.storage")
>("apps/api/src/common/throttling/key-scoped-throttler.storage.ts");
let storage: InstanceType<typeof KeyScopedThrottlerStorage>;
let observer: ReturnType<typeof observeCapacityThrottle>;
let directory: string;
let expirationDelay: number;
let omitGuard: boolean;
let extraIngressDelay: number;
let rawError: "429" | "deadline" | null;
let rotateKey: boolean;
const guards: { family: WorkloadFamily; at: number; blocked: boolean }[] = [];
const runTag = "guard-fixture";

function plan(
  durationSeconds = 61,
  profile: CapacityPlan["profile"] = "uniform",
) {
  const staged = profile === "budgeted_dispatch_burst";
  return buildCapacityPlan({
    origin: "http://127.0.0.1:4010/",
    durationSeconds,
    profile,
    maxInFlight: 500,
    isolatedResourceId: "controlled-transport-genuine-storage",
    tenantId: "tenant",
    tenantJwt: "fixture",
    dispatchJwt: "fixture",
    reportJwt: "fixture",
    runTag,
    stagedDispatch: staged,
    orderIds: Array.from(
      { length: staged ? 500 : countsForDuration(durationSeconds).dispatch },
      (_, index) => `owned-${index}`,
    ),
  });
}
type RequestRow = {
  kind: string;
  workload: WorkloadFamily;
  sequence: number;
  launchedMs: number | null;
  error: string | null;
  httpStatus: number | null;
};
const rows = (output: string): RequestRow[] =>
  readFileSync(output, "utf8")
    .trim()
    .split("\n")
    .map((line) => JSON.parse(line));
function capture(output: string) {
  const target = process.env.C123_ADMISSION_EVIDENCE_DIR;
  if (!target) return;
  mkdirSync(target, { recursive: true });
  const name = output.split("/").at(-1)!;
  copyFileSync(output, resolve(target, name));
  copyFileSync(
    `${output}.summary.json`,
    resolve(target, `${name}.summary.json`),
  );
  writeFileSync(
    resolve(target, `${name}.guard.json`),
    JSON.stringify({ guards, observation: observer.snapshot() }),
  );
}

beforeEach(() => {
  vi.useFakeTimers({ toFake: ["Date", "setTimeout", "clearTimeout"] });
  vi.setSystemTime(0);
  directory = mkdtempSync(resolve(tmpdir(), "c123-guard-admission-"));
  storage = new KeyScopedThrottlerStorage();
  observer = observeCapacityThrottle(storage, runTag);
  expirationDelay = 25;
  omitGuard = false;
  extraIngressDelay = 0;
  rawError = null;
  rotateKey = false;
  guards.length = 0;
  boundary.request.mockReset();
  boundary.request.mockImplementation((url, options, callback) => {
    const req = new EventEmitter();
    let destroyed = false;
    Object.assign(req, {
      destroy: (error: Error) => {
        destroyed = true;
        req.emit("error", error);
      },
      end: () => {
        const seed = url.pathname === "/api/orders";
        const family: WorkloadFamily = url.pathname.includes("bookings")
          ? "booking"
          : url.pathname.includes("reports")
            ? "report"
            : "dispatch";
        const sequence = Number(
          options.headers["x-request-id"].split("-").at(-1),
        );
        const limit = BASELINE_PER_MINUTE[family];
        // First minute arrives 50ms later than the next minute. Dispatch's
        // last request retains its real 59800ms tail. This compresses genuine
        // guard arrivals even though runPlan's client rolling budgets pass.
        const ingressDelay = seed
          ? 5
          : sequence < limit && sequence !== limit - 1
            ? 50
            : 0;
        setTimeout(async () => {
          if (destroyed) return;
          const response = Object.assign(new EventEmitter(), {
            statusCode: 201,
          });
          if (!seed && !omitGuard) {
            const timer = globalThis.setTimeout;
            // Control only actual storage timer scheduling, leaving countHit,
            // increment and expiration callback bodies completely unmocked.
            const timerHook = vi
              .spyOn(globalThis, "setTimeout")
              .mockImplementation(((fn: () => void, ms: number) =>
                timer(fn, Number(ms) + expirationDelay)) as typeof setTimeout);
            let result;
            try {
              result = observer.middleware(
                {
                  headers: options.headers,
                  url: url.pathname,
                  identity: {
                    realm: "tenant",
                    actorType: "user",
                    actorId: family,
                    tenantId: "tenant",
                  },
                },
                response,
                () =>
                  storage.increment(
                    `genuine-${family}${rotateKey && sequence === 1 ? "-changed" : ""}`,
                    60000,
                    limit,
                    1000,
                    "default",
                  ),
              );
            } finally {
              timerHook.mockRestore();
            }
            const decision = (await result) as { isBlocked: boolean };
            guards.push({
              family,
              at: Date.now(),
              blocked: decision.isBlocked,
            });
            response.statusCode = decision.isBlocked ? 429 : 201;
          }
          if (rawError === "deadline") return;
          if (rawError === "429") response.statusCode = 429;
          callback(response);
          response.emit(
            "data",
            Buffer.from(
              JSON.stringify({
                data: {
                  order_id: `seed-${sequence}`,
                  job_id: `job-${sequence}`,
                },
              }),
            ),
          );
          response.emit("end");
          response.emit("finish");
        }, ingressDelay + extraIngressDelay);
      },
    });
    return req;
  });
});
afterEach(() => {
  observer.stop();
  storage.onApplicationShutdown();
  expect(vi.getTimerCount()).toBe(0);
  vi.restoreAllMocks();
  vi.useRealTimers();
  rmSync(directory, { recursive: true, force: true });
});

it.each(["uniform", "concurrent"] as const)(
  "%s uses actual guard/expiry feedback across the minimal second-minute boundary",
  async (profile) => {
    const output = resolve(directory, `${profile}.jsonl`);
    const run = runPlan(
      plan(61, profile),
      output,
      {},
      { admission: observer.admission },
    );
    await vi.advanceTimersByTimeAsync(125000);
    const summary = await run;
    const actual = rows(output);
    capture(output);
    expect(actual).toHaveLength(397);
    expect(actual.filter((row) => row.httpStatus === 429)).toHaveLength(0);
    expect(summary.result).toBe("measurements_within_targets");
    for (const family of ["booking", "dispatch", "report"] as const) {
      const hits = guards.filter((row) => row.family === family);
      expect(hits.every((row) => !row.blocked)).toBe(true);
      expect(
        hits[BASELINE_PER_MINUTE[family]]!.at - hits[0]!.at,
      ).toBeGreaterThanOrEqual(60025);
    }
  },
);

it("retains all5850/4000 and the genuine899800ms tail with variable ingress and delayed expiry", async () => {
  expirationDelay = 7;
  const output = resolve(directory, "full.jsonl");
  const run = runPlan(
    plan(900, "budgeted_dispatch_burst"),
    output,
    {},
    { admission: observer.admission },
  );
  await vi.advanceTimersByTimeAsync(1000000);
  const summary = await run;
  const actual = rows(output);
  capture(output);
  expect(actual.filter((row) => row.kind === "capacity_request")).toHaveLength(
    5850,
  );
  expect(actual.filter((row) => row.kind === "capacity_seed")).toHaveLength(
    4000,
  );
  expect(boundary.request).toHaveBeenCalledTimes(9850);
  expect(summary.result).toBe("measurements_within_targets");
  expect(
    readBackBudgetedDispatchArrivals(actual).finalArrivalMs,
  ).toBeGreaterThanOrEqual(899800);
  expect(summary.workflows.dispatch.arrivals.lastMs).toBeLessThan(900000);
  for (const family of ["booking", "dispatch", "report"] as const) {
    const hits = guards.filter((row) => row.family === family);
    let first = 0;
    hits.forEach((row, index) => {
      while (row.at - hits[first]!.at >= 60000) first++;
      expect(index - first + 1).toBeLessThanOrEqual(
        BASELINE_PER_MINUTE[family],
      );
      expect(row.blocked).toBe(false);
    });
  }
}, 30000);

it("refuses infeasible expiration delay inside900s and retains every unsent outcome", async () => {
  expirationDelay = 2000;
  const output = resolve(directory, "infeasible.jsonl");
  const run = runPlan(
    plan(900, "budgeted_dispatch_burst"),
    output,
    {},
    { admission: observer.admission },
  );
  await vi.advanceTimersByTimeAsync(1100000);
  const summary = await run;
  const actual = rows(output).filter((row) => row.kind === "capacity_request");
  capture(output);
  expect(actual).toHaveLength(5850);
  expect(summary.result).toBe("failed");
  expect(
    actual.filter((row) => row.launchedMs === null).length,
  ).toBeGreaterThan(0);
  expect(
    actual.every((row) => row.launchedMs === null || row.launchedMs < 900000),
  ).toBe(true);
  expect(guards.every((row) => !row.blocked)).toBe(true);
}, 30000);

it("rejects successful HTTP without genuine matching guard observation", async () => {
  omitGuard = true;
  const output = resolve(directory, "missing.jsonl");
  const run = runPlan(plan(2), output, {}, { admission: observer.admission });
  await vi.advanceTimersByTimeAsync(35000);
  const summary = await run;
  capture(output);
  expect(rows(output)).toHaveLength(13);
  expect(summary.result).toBe("failed");
  expect(rows(output).some((row) => row.error?.includes("admission"))).toBe(
    true,
  );
});

it.each(["429", "deadline"] as const)(
  "preserves every raw %s refusal without retry or filtering",
  async (error) => {
    rawError = error;
    const output = resolve(directory, `raw-${error}.jsonl`);
    const run = runPlan(plan(2), output, {}, { admission: observer.admission });
    await vi.advanceTimersByTimeAsync(95000);
    const summary = await run;
    const actual = rows(output);
    capture(output);
    expect(actual).toHaveLength(13);
    expect(boundary.request).toHaveBeenCalledTimes(13);
    expect(summary.result).toBe("failed");
    expect(
      actual.every(
        (row) =>
          row.error ===
          (error === "429"
            ? "HTTP 429"
            : "Request deadline exceeded 30 seconds"),
      ),
    ).toBe(true);
  },
);

it("rejects a guard arrival after the original window even when the client launch was timely", async () => {
  extraIngressDelay = 250;
  const output = resolve(directory, "late-guard.jsonl");
  const run = runPlan(plan(2), output, {}, { admission: observer.admission });
  await vi.advanceTimersByTimeAsync(65000);
  const summary = await run;
  const actual = rows(output);
  capture(output);
  expect(actual).toHaveLength(13);
  expect(boundary.request).toHaveBeenCalledTimes(13);
  expect(
    actual.every((row) => row.launchedMs !== null && row.launchedMs < 2000),
  ).toBe(true);
  expect(
    actual.some(
      (row) =>
        row.error === "Genuine guard admission outside the original window",
    ),
  ).toBe(true);
  expect(summary.result).toBe("failed");
});

it("refuses measured key rotation rather than gaining a fresh admission budget", async () => {
  rotateKey = true;
  const output = resolve(directory, "changed-key.jsonl");
  const run = runPlan(plan(2), output, {}, { admission: observer.admission });
  await vi.advanceTimersByTimeAsync(65000);
  const summary = await run;
  const actual = rows(output);
  capture(output);
  expect(actual).toHaveLength(13);
  expect(
    actual.some((row) =>
      row.error?.includes("key, identity or policy changed"),
    ),
  ).toBe(true);
  expect(summary.result).toBe("failed");
});

it("timestamps the genuine count after variable observation work before increment", async () => {
  const requestId = `${runTag}-booking-prefix`;
  expect(observer.admission.tryReserve("booking", requestId).allowed).toBe(
    true,
  );
  let reads = 0;
  const request = {
    headers: { "x-request-id": requestId },
    url: "/api/tenant/bookings",
    get identity() {
      // External clock boundary: synchronous identity observation delays the
      // real native increment. No count, expiry or admission logic is mocked.
      if (++reads === 3) vi.setSystemTime(25);
      return {
        realm: "tenant",
        actorType: "user",
        actorId: "booking",
        tenantId: "tenant",
      };
    },
  };
  const response = Object.assign(new EventEmitter(), { statusCode: 201 });
  await observer.middleware(request, response, () =>
    storage.increment("native-key", 60000, 60, 1000, "default"),
  );
  response.emit("finish");
  const feedback = observer.admission.complete(requestId);
  expect(storage.storage.get("native-key")!.expiresAt).toBe(60025);
  expect(feedback).toMatchObject({
    guardMs: 25,
    guardCountedMs: 25,
    error: null,
    result: { totalHits: 1, isBlocked: false },
  });
});
