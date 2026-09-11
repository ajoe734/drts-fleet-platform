import { spawn } from "node:child_process";
import { createServer } from "node:http";
import { mkdtempSync, readFileSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { resolve } from "node:path";
import { describe, expect, it } from "vitest";

const script = resolve(__dirname, "../../../../tools/system-remediation/ops-proof/ops-proof.sh");

describe("capacity harness mechanics, not business capacity acceptance", () => {
  it.each(["success", "http-error", "bad-envelope", "overload", "invalid-header", "remote", "replay"])("records %s", async (scenario) => {
    const directory = mkdtempSync(resolve(tmpdir(), "ops-capacity-"));
    const received: Array<{ method?: string | undefined; path?: string | undefined; body: string }> = [];
    const server = createServer((req, res) => {
      let body = "";
      req.on("data", (chunk) => { body += chunk; });
      req.on("end", () => {
        received.push({ method: req.method, path: req.url, body });
        setTimeout(() => {
          res.writeHead(scenario === "http-error" ? 503 : 200, { "content-type": "application/json" });
          res.end(JSON.stringify(scenario === "bad-envelope" ? {} : { data: { orderId: "mechanics-only" } }));
        }, scenario === "overload" ? 300 : 10);
      });
    });
    await new Promise<void>((done) => server.listen(0, "127.0.0.1", done));
    try {
      const address = server.address();
      if (!address || typeof address === "string") throw new Error("No test listener");
      const item = (path: string, body: object, key: string) => ({ method: "POST", path, body,
        headers: { "x-tenant-id": "test-tenant", "idempotency-key": scenario === "replay" ? "same" : key,
          authorization: scenario === "invalid-header" ? "invalid\u0000header" : "test-only" } });
      const plan = {
        origin: scenario === "remote" ? "http://example.com" : `http://127.0.0.1:${address.port}`,
        isolatedResourceId: "unit-test-loopback-listener", durationSeconds: 0.21,
        maxInFlight: scenario === "overload" ? 1 : 10,
        workloads: {
          booking: [item("/api/tenant/bookings", { businessDispatchSubtype: "test", pickup: {}, dropoff: {},
            reservationWindowStart: "test", reservationWindowEnd: "test", passenger: {} }, "booking")],
          dispatch: [item("/api/orders/one/dispatch", { mode: "auto" }, "dispatch-1"),
            item("/api/orders/two/dispatch", { mode: "auto" }, "dispatch-2")],
          report: [item("/api/reports/jobs", { jobType: "test", format: "csv" }, "report")],
        },
      };
      const planPath = resolve(directory, "plan.json"), output = resolve(directory, "raw.jsonl");
      writeFileSync(planPath, JSON.stringify(plan));
      const code = await new Promise<number | null>((done, reject) => {
        const child = spawn("bash", [script, "capacity", "--plan", planPath, "--output", output], { stdio: "ignore" });
        child.on("error", reject);
        child.on("close", done);
      });
      if (["remote", "replay"].includes(scenario)) {
        expect(code).toBe(2);
        expect(received).toHaveLength(0);
        return;
      }
      expect(code).toBe(scenario === "success" ? 0 : 1);
      const rows = readFileSync(output, "utf8").trim().split("\n").map((line) => JSON.parse(line));
      expect(rows).toHaveLength(4);
      expect(new Set(rows.map((row) => row.workload))).toEqual(new Set(["booking", "dispatch", "report"]));
      expect(rows.find((row) => row.workload === "dispatch" && row.sequence === 2).scheduledMs).toBe(200);
      expect(rows.every((row) => /^[a-f0-9]{40}$/.test(row.candidateSha))).toBe(true);
      expect(readFileSync(output, "utf8")).not.toContain("test-only");
      const summary = JSON.parse(readFileSync(`${output}.summary.json`, "utf8"));
      expect(summary.acceptance).toBe("not_established");
      expect(summary.fullBurstSchedule).toBe(false);
      if (scenario === "success") {
        expect(received).toHaveLength(4);
        expect(received.every((req) => req.method === "POST" && JSON.parse(req.body))).toBe(true);
        expect(rows.every((row) => row.error === null && row.latencyMs > 0)).toBe(true);
      } else {
        expect(rows.some((row) => row.error)).toBe(true);
      }
    } finally {
      await new Promise<void>((done) => server.close(() => done()));
      rmSync(directory, { recursive: true, force: true });
    }
  });
});
