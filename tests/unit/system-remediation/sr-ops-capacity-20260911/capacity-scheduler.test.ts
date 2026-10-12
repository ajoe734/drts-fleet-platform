import { describe, expect, it, beforeAll, afterAll } from "vitest";
import { createServer } from "node:http";
import { resolve } from "node:path";
import { mkdtempSync, rmSync, readFileSync } from "node:fs";
import { tmpdir } from "node:os";

// @ts-expect-error -- TS7016: no declaration file for capacity.mjs
import { runPlan } from "../../../../tools/system-remediation/ops-proof/capacity.mjs";

describe("capacity.mjs scheduler", () => {
  let server: ReturnType<typeof createServer>;
  let origin: string;
  let tmpDir: string;
  let requestLogs: Array<{ path: string; time: number }> = [];

  beforeAll(async () => {
    tmpDir = mkdtempSync(resolve(tmpdir(), "capacity-test-"));
    server = createServer((req, res) => {
      requestLogs.push({ path: req.url!, time: performance.now() });
      res.writeHead(200, { "Content-Type": "application/json" });
      res.end(JSON.stringify({ data: { orderId: "dummy" } }));
    });
    await new Promise<void>((resolve) => server.listen(0, "127.0.0.1", resolve));
    origin = `http://127.0.0.1:${(server.address() as any).port}`;
  });

  afterAll(() => {
    server.close();
    rmSync(tmpDir, { recursive: true, force: true });
  });

  it("enforces minimum spacing, all-family cadence, and launched >= scheduled", async () => {
    requestLogs = [];
    const bookingBody = { businessDispatchSubtype: 1, pickup: 1, dropoff: 1, reservationWindowStart: 1, reservationWindowEnd: 1, passenger: 1 };
    const plan = {
      origin,
      durationSeconds: 2,
      maxInFlight: 50,
      isolatedResourceId: "test",
      workloads: {
        booking: [
          { method: "POST", path: "/api/tenant/bookings", headers: { "idempotency-key": "b1", "x-tenant-id": "t" }, body: bookingBody },
          { method: "POST", path: "/api/tenant/bookings", headers: { "idempotency-key": "b2", "x-tenant-id": "t" }, body: bookingBody }
        ],
        dispatch: Array.from({ length: 10 }, (_, i) => ({ method: "POST", path: `/api/orders/${i}/dispatch`, headers: { "idempotency-key": `d${i}` }, body: { mode: "auto" } })),
        report: [
          { method: "POST", path: "/api/reports/jobs", headers: { "idempotency-key": "r1" }, body: { jobType: "x", format: "y" } }
        ]
      }
    };

    const outputPath = resolve(tmpDir, "output.jsonl");
    const summary = await runPlan(plan, outputPath, { baseSha: "a", candidateSha: "b", planSha256: "c" });

    expect(summary.workflows.dispatch.requests).toBe(10);
    expect(summary.workflows.booking.requests).toBe(2);
    expect(summary.workflows.report.requests).toBe(1);

    const records = readFileSync(outputPath, "utf8")
      .trim()
      .split("\n")
      .map((line) => JSON.parse(line));

    const dispatchRecords = records.filter(log => log.workload === "dispatch");
    const bookingRecords = records.filter(log => log.workload === "booking");

    expect(dispatchRecords[1]!.launchedMs - dispatchRecords[0]!.launchedMs).toBeGreaterThanOrEqual(199);
    expect(bookingRecords[1]!.launchedMs - bookingRecords[0]!.launchedMs).toBeGreaterThanOrEqual(999);

    for (const record of records) {
      expect(record.launchedMs).toBeGreaterThanOrEqual(record.scheduledMs);
    }
  }, 10000);

  it("retains overload errors when maxInFlight is exceeded", async () => {
    let resolveRequest: (() => void) | null = null;
    const requestPromise = new Promise<void>((resolve) => { resolveRequest = resolve; });

    const originalListeners = server.listeners('request');
    server.removeAllListeners('request');
    server.on('request', async (req, res) => {
      await requestPromise; // Block response until resolved
      res.writeHead(200, { "Content-Type": "application/json" });
      res.end(JSON.stringify({ data: { orderId: "dummy" } }));
    });

    const bookingBody = { businessDispatchSubtype: 1, pickup: 1, dropoff: 1, reservationWindowStart: 1, reservationWindowEnd: 1, passenger: 1 };
    const plan = {
      origin,
      durationSeconds: 1,
      maxInFlight: 1,
      isolatedResourceId: "test",
      workloads: {
        booking: [
          { method: "POST", path: "/api/tenant/bookings", headers: { "idempotency-key": "b1", "x-tenant-id": "t" }, body: bookingBody }
        ],
        dispatch: Array.from({ length: 5 }, (_, i) => ({ method: "POST", path: `/api/orders/${i}/dispatch`, headers: { "idempotency-key": `d${i}` }, body: { mode: "auto" } })),
        report: [
          { method: "POST", path: "/api/reports/jobs", headers: { "idempotency-key": "r1" }, body: { jobType: "x", format: "y" } }
        ]
      }
    };
    const outputPath = resolve(tmpDir, "output_overload.jsonl");
    const runPromise = runPlan(plan, outputPath, { baseSha: "a", candidateSha: "b", planSha256: "c" });

    // Wait slightly to let requests pile up
    await new Promise(r => setTimeout(r, 500));
    resolveRequest!();
    const summary = await runPromise;

    // The requests after the first should be marked as overloaded
    expect(summary.workflows.dispatch.requests).toBe(5);
    expect(summary.workflows.dispatch.errors).toBeGreaterThan(0);

    const records = readFileSync(outputPath, "utf8")
      .trim()
      .split("\n")
      .map((line) => JSON.parse(line));

    const overloadRecord = records.find(r => r.error && r.error.includes("maxInFlight exhausted"));
    expect(overloadRecord).toBeDefined();

    server.removeAllListeners('request');
    for (const listener of originalListeners) {
      server.on('request', listener as any);
    }
  }, 10000);

  it("propagates errors and HTTP 429s correctly without suppression", async () => {
    // Override the mock server to return 429 for a specific request
    const originalListeners = server.listeners('request');
    server.removeAllListeners('request');
    server.on('request', (req, res) => {
      if (req.url && req.url.includes("/api/orders/fail")) {
        res.writeHead(429, { "Content-Type": "application/json" });
        res.end(JSON.stringify({ message: "Too Many Requests" }));
      } else {
        res.writeHead(200, { "Content-Type": "application/json" });
        res.end(JSON.stringify({ data: { orderId: "dummy" } }));
      }
    });

    const plan = {
      origin,
      durationSeconds: 1,
      maxInFlight: 50,
      isolatedResourceId: "test",
      workloads: {
        booking: [
          { method: "POST", path: "/api/tenant/bookings", headers: { "idempotency-key": "b1", "x-tenant-id": "t", "authorization": "Bearer token" }, body: { businessDispatchSubtype: 1, pickup: 1, dropoff: 1, reservationWindowStart: 1, reservationWindowEnd: 1, passenger: 1 } }
        ],
        dispatch: [
          { method: "POST", path: "/api/orders/fail1/dispatch", headers: { "idempotency-key": "d_fail1", "authorization": "Bearer token" }, body: { mode: "auto" } },
          { method: "POST", path: "/api/orders/fail2/dispatch", headers: { "idempotency-key": "d_fail2", "authorization": "Bearer token" }, body: { mode: "auto" } },
          { method: "POST", path: "/api/orders/fail3/dispatch", headers: { "idempotency-key": "d_fail3", "authorization": "Bearer token" }, body: { mode: "auto" } },
          { method: "POST", path: "/api/orders/fail4/dispatch", headers: { "idempotency-key": "d_fail4", "authorization": "Bearer token" }, body: { mode: "auto" } },
          { method: "POST", path: "/api/orders/fail5/dispatch", headers: { "idempotency-key": "d_fail5", "authorization": "Bearer token" }, body: { mode: "auto" } }
        ],
        report: [
          { method: "POST", path: "/api/reports/jobs", headers: { "idempotency-key": "r1", "authorization": "Bearer token" }, body: { jobType: "x", format: "y" } }
        ]
      }
    };

    const outputPath = resolve(tmpDir, "output_fail.jsonl");
    const summary = await runPlan(plan, outputPath, { baseSha: "a", candidateSha: "b", planSha256: "c" });

    // The runPlan returns "failed" if there are errors
    expect(summary.result).toBe("failed");
    expect(summary.workflows.dispatch.requests).toBe(5);
    expect(summary.workflows.dispatch.errors).toBe(5);

    const records = readFileSync(outputPath, "utf8")
      .trim()
      .split("\n")
      .map((line) => JSON.parse(line));
    const dispatchRecord = records.find(r => r.workload === "dispatch");
    expect(dispatchRecord.error).toContain("429"); // Should contain the HTTP status or error message

    // Restore server
    server.removeAllListeners('request');
    for (const listener of originalListeners) {
      server.on('request', listener as any);
    }
  });
});
