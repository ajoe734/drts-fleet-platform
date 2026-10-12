import { describe, expect, it, beforeAll, afterAll } from "vitest";
import { createServer } from "node:http";
import { resolve } from "node:path";
import { mkdtempSync, rmSync, readFileSync, writeFileSync } from "node:fs";
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

  it("enforces minimum spacing and actual cadence without error suppression", async () => {
    requestLogs = [];
    const plan = {
      origin,
      durationSeconds: 1, // Short duration
      maxInFlight: 50,
      isolatedResourceId: "test",
      workloads: {
        booking: [
          { method: "POST", path: "/api/tenant/bookings", headers: { "idempotency-key": "b1", "x-tenant-id": "t", "authorization": "Bearer token" }, body: { businessDispatchSubtype: 1, pickup: 1, dropoff: 1, reservationWindowStart: 1, reservationWindowEnd: 1, passenger: 1 } }
        ],
        dispatch: [
          { method: "POST", path: "/api/orders/1/dispatch", headers: { "idempotency-key": "d1", "authorization": "Bearer token" }, body: { mode: "auto" } },
          { method: "POST", path: "/api/orders/2/dispatch", headers: { "idempotency-key": "d2", "authorization": "Bearer token" }, body: { mode: "auto" } },
          { method: "POST", path: "/api/orders/3/dispatch", headers: { "idempotency-key": "d3", "authorization": "Bearer token" }, body: { mode: "auto" } },
          { method: "POST", path: "/api/orders/4/dispatch", headers: { "idempotency-key": "d4", "authorization": "Bearer token" }, body: { mode: "auto" } },
          { method: "POST", path: "/api/orders/5/dispatch", headers: { "idempotency-key": "d5", "authorization": "Bearer token" }, body: { mode: "auto" } }
        ],
        report: [
          { method: "POST", path: "/api/reports/jobs", headers: { "idempotency-key": "r1", "authorization": "Bearer token" }, body: { jobType: "x", format: "y" } }
        ]
      }
    };
    
    const outputPath = resolve(tmpDir, "output.jsonl");
    const summary = await runPlan(plan, outputPath, { baseSha: "a", candidateSha: "b", planSha256: "c" });
    
    expect(summary.workflows.dispatch.requests).toBe(5);
    expect(summary.workflows.dispatch.errors).toBe(0);
    
    const records = readFileSync(outputPath, "utf8")
      .trim()
      .split("\n")
      .map((line) => JSON.parse(line));
    
    // We expect 1 + 5 + 1 = 7 requests
    expect(records.length).toBe(7);
    
    // Filter to just dispatch requests
    const dispatchRecords = records.filter(log => log.workload === "dispatch");
    expect(dispatchRecords.length).toBe(5);
    
    // Check exact launch pacing from records: dispatch is 300/min = 200ms spacing.
    // Minimum spacing must be >= 199ms (allowing 1ms precision float jitter, but not 180ms slack).
    const t0 = dispatchRecords[0]!.launchedMs;
    const t1 = dispatchRecords[1]!.launchedMs;
    const t2 = dispatchRecords[2]!.launchedMs;
    const t3 = dispatchRecords[3]!.launchedMs;
    const t4 = dispatchRecords[4]!.launchedMs;
    expect(t1 - t0).toBeGreaterThanOrEqual(199);
    expect(t2 - t1).toBeGreaterThanOrEqual(199);
    expect(t3 - t2).toBeGreaterThanOrEqual(199);
    expect(t4 - t3).toBeGreaterThanOrEqual(199);
    // Booking: 1 per sec (900/15m = 1/s), but here duration is 1 sec, so just 1 request.
    const bookingRecords = records.filter(log => log.workload === "booking");
    expect(bookingRecords.length).toBe(1);

    // Report: 0.5 per sec (450/15m = 0.5/s), so 1 request.
    const reportRecords = records.filter(log => log.workload === "report");
    expect(reportRecords.length).toBe(1);
  });

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
