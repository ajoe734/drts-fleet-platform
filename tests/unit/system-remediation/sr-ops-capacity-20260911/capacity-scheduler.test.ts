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
    
    // We expect 1 + 5 + 1 = 7 requests
    expect(requestLogs.length).toBe(7);
    
    // Filter to just dispatch requests
    const dispatchLogs = requestLogs.filter(log => log.path.startsWith("/api/orders/"));
    expect(dispatchLogs.length).toBe(5);
    
    // Check spacing: dispatch is 300/min = 200ms spacing.
    const t0 = dispatchLogs[0]!.time;
    const t1 = dispatchLogs[1]!.time;
    const t2 = dispatchLogs[2]!.time;
    const t3 = dispatchLogs[3]!.time;
    const t4 = dispatchLogs[4]!.time;
    expect(t1 - t0).toBeGreaterThanOrEqual(180); // Allow slight jitter
    expect(t2 - t1).toBeGreaterThanOrEqual(180);
    expect(t3 - t2).toBeGreaterThanOrEqual(180);
    expect(t4 - t3).toBeGreaterThanOrEqual(180);
  });
});
