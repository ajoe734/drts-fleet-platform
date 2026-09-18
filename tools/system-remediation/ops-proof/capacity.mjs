import { request } from "node:http";
import { createHash } from "node:crypto";
import { appendFileSync, readFileSync, writeFileSync } from "node:fs";
import { performance } from "node:perf_hooks";

const baselinePath = "docs/02-architecture/phase1-operational-workload-sla-degradation-baseline-20260430.md";
// Accepted baseline, Workflow capacity table and SLA and Latency Targets.
const baseline = {
  booking: { perMinute: 60, p95Ms: 2000, p99Ms: 5000 },
  dispatch: { perMinute: 300, p95Ms: 10000 },
  report: { perMinute: 30, p95Ms: 5000 },
};
const routes = {
  booking: /^\/api\/tenant\/bookings$/,
  dispatch: /^\/api\/orders\/[a-zA-Z0-9_-]+\/dispatch$/,
  report: /^\/api\/reports\/jobs$/,
};
const digest = (value) => createHash("sha256").update(value).digest("hex");
const object = (value) => value && typeof value === "object" && !Array.isArray(value);

export function validatePlan(plan) {
  if (!object(plan) || !Number.isFinite(plan.durationSeconds) || plan.durationSeconds <= 0 || plan.durationSeconds > 900) {
    throw new Error("durationSeconds must be > 0 and <= 900; only 900 seconds is the full baseline burst");
  }
  if (!Number.isInteger(plan.maxInFlight) || plan.maxInFlight < 1 || plan.maxInFlight > 500) {
    throw new Error("maxInFlight must be 1..500");
  }
  if (typeof plan.isolatedResourceId !== "string" || !plan.isolatedResourceId.trim()) {
    throw new Error("isolatedResourceId is required; operator must exclude tunnels to shared resources");
  }
  const origin = new URL(plan.origin);
  if (origin.protocol !== "http:" || !["127.0.0.1", "localhost"].includes(origin.hostname) ||
      origin.username || origin.password || origin.pathname !== "/" || origin.search || origin.hash) {
    throw new Error("origin must be a plain loopback HTTP origin");
  }
  const keys = new Set();
  const dispatchOrders = new Set();
  for (const family of Object.keys(baseline)) {
    const items = plan.workloads?.[family];
    const count = Math.ceil(plan.durationSeconds * baseline[family].perMinute / 60);
    if (!Array.isArray(items) || items.length !== count) throw new Error(`${family} requires exactly ${count} independent request payloads`);
    for (const item of items) {
      if (!object(item) || item.method !== "POST" || !routes[family].test(item.path) || !object(item.body) || !object(item.headers)) {
        throw new Error(`${family} requires authoritative POST route, body and headers`);
      }
      const headers = Object.fromEntries(Object.entries(item.headers).map(([key, value]) => [key.toLowerCase(), value]));
      if (Object.keys(headers).length !== Object.keys(item.headers).length ||
          Object.entries(headers).some(([key, value]) => !["authorization", "idempotency-key", "x-tenant-id", "x-request-id", "x-runtime-profile-code"].includes(key) || typeof value !== "string" || /[\r\n]/.test(value))) {
        throw new Error("Only canonical auth, tenant, request and idempotency headers are permitted");
      }
      const key = headers["idempotency-key"];
      if (!key || keys.has(key) || (item.body.idempotencyKey && item.body.idempotencyKey !== key)) {
        throw new Error("Every write must have a unique matching idempotency key; replay is not capacity evidence");
      }
      keys.add(key);
      if (family === "booking" && (!headers["x-tenant-id"] ||
          !["businessDispatchSubtype", "pickup", "dropoff", "reservationWindowStart", "reservationWindowEnd", "passenger"].every((field) => item.body[field] != null))) {
        throw new Error("Booking requires tenant and CreateTenantBookingCommand fields");
      }
      if (family === "dispatch") {
        if (item.body.mode !== "auto" || dispatchOrders.has(item.path)) throw new Error("Dispatch requires mode auto and independent pre-provisioned order IDs");
        dispatchOrders.add(item.path);
      }
      if (family === "report" && (!item.body.jobType || !item.body.format)) throw new Error("Report requires CreateReportJobCommand jobType and format");
    }
  }
  return plan;
}

export function measure(origin, item) {
  return new Promise((resolve) => {
    const started = performance.now();
    const body = JSON.stringify(item.body);
    let settled = false;
    const finish = (value) => {
      if (settled) return;
      settled = true;
      clearTimeout(deadline);
      resolve({ latencyMs: performance.now() - started, ...value });
    };
    const url = new URL(item.path, origin);
    // Pin loopback; no DNS, redirects, proxy env, or shell command execution.
    url.hostname = "127.0.0.1";
    const req = request(url, { method: "POST", headers: {
      ...item.headers, "content-type": "application/json", "content-length": Buffer.byteLength(body),
    } }, (res) => {
      const chunks = [];
      let bytes = 0;
      res.on("data", (chunk) => {
        bytes += chunk.length;
        if (bytes > 2 * 1024 * 1024) req.destroy(new Error("Response exceeded 2 MiB"));
        else chunks.push(chunk);
      });
      res.on("error", (error) => finish({ httpStatus: res.statusCode, error: error.message }));
      res.on("end", () => {
        const raw = Buffer.concat(chunks).toString("utf8");
        let data;
        let error = null;
        try {
          const envelope = JSON.parse(raw);
          data = envelope.data;
          if (!object(data) || envelope.error) error = "Missing successful API data envelope";
        } catch { error = "Invalid JSON response"; }
        if (res.statusCode < 200 || res.statusCode >= 300) error = `HTTP ${res.statusCode}`;
        // The live API's global response interceptor
        // (apps/api/src/common/snake-case.interceptor.ts) rewrites every
        // body key to snake_case on the wire, so `data` carries `order_id`,
        // not the service layer's in-code `orderId`. Accept both so a
        // resource id is recorded regardless of which convention the caller
        // is on; callers of `resourceIds` keep reading the camelCase key.
        const resourceIds = Object.fromEntries(
          [
            ["bookingId", "booking_id"],
            ["orderId", "order_id"],
            ["dispatchJobId", "dispatch_job_id"],
            ["jobId", "job_id"],
          ]
            .map(([camel, snake]) => [camel, data?.[camel] ?? data?.[snake]])
            .filter(([, value]) => typeof value === "string"),
        );
        finish({ httpStatus: res.statusCode, responseSha256: digest(raw), resourceIds, error });
      });
    });
    const deadline = setTimeout(() => req.destroy(new Error("Request deadline exceeded 30 seconds")), 30000);
    req.on("error", (error) => finish({ httpStatus: null, error: error.message }));
    req.end(body);
  });
}

export async function runPlan(plan, output, provenance) {
  validatePlan(plan);
  writeFileSync(output, "");
  const baselineSha256 = digest(readFileSync(baselinePath));
  const records = [];
  const active = new Set();
  const start = performance.now();
  const schedule = Object.keys(baseline).flatMap((family) => plan.workloads[family].map((item, index) => ({
    family, item, sequence: index + 1, scheduledMs: index * 60000 / baseline[family].perMinute,
  }))).sort((a, b) => a.scheduledMs - b.scheduledMs);
  for (const entry of schedule) {
    const wait = entry.scheduledMs - (performance.now() - start);
    if (wait > 0) await new Promise((resolve) => setTimeout(resolve, wait));
    // Do not queue and then falsely report the requested arrival rate as met.
    const overloaded = active.size >= plan.maxInFlight;
    const launchedMs = performance.now() - start;
    const job = (async () => {
      let result;
      try {
        result = overloaded ? { latencyMs: null, httpStatus: null, error: "Load generator maxInFlight exhausted; request not sent" }
          : await measure(plan.origin, entry.item);
      } catch (error) {
        result = { latencyMs: null, httpStatus: null, error: error.message };
      }
      const record = { taskId: "SR-OPS-PROOF-001", kind: "capacity_request", ...provenance,
        isolatedResourceId: plan.isolatedResourceId, baselinePath, baselineSha256,
        observedAt: new Date().toISOString(), workload: entry.family, sequence: entry.sequence,
        method: "POST", path: entry.item.path, requestSha256: digest(JSON.stringify(entry.item.body)),
        scheduledMs: entry.scheduledMs, launchedMs, schedulingLagMs: launchedMs - entry.scheduledMs, ...result };
      records.push(record);
      appendFileSync(output, `${JSON.stringify(record)}\n`);
    })();
    active.add(job);
    job.finally(() => active.delete(job));
  }
  await Promise.all(active);
  const workflows = Object.fromEntries(Object.entries(baseline).map(([family, targets]) => {
    const rows = records.filter((row) => row.workload === family);
    const latencies = rows.filter((row) => Number.isFinite(row.latencyMs)).map((row) => row.latencyMs).sort((a, b) => a - b);
    const percentile = (p) => latencies.length ? latencies[Math.ceil(latencies.length * p) - 1] : null;
    const p95Ms = percentile(0.95), p99Ms = percentile(0.99);
    return [family, { requests: rows.length, errors: rows.filter((row) => row.error).length,
      p95Ms, p99Ms, targets, latencyTargetsMet: p95Ms !== null && p95Ms <= targets.p95Ms && (!targets.p99Ms || p99Ms <= targets.p99Ms) }];
  }));
  const summary = { taskId: "SR-OPS-PROOF-001", kind: "capacity_summary", ...provenance,
    isolatedResourceId: plan.isolatedResourceId, baselinePath, baselineSha256,
    durationSeconds: plan.durationSeconds, fullBurstSchedule: plan.durationSeconds === 900,
    elapsedMs: performance.now() - start, maxInFlight: plan.maxInFlight, workflows,
    result: Object.values(workflows).every((row) => row.errors === 0 && row.latencyTargetsMet) ? "measurements_within_targets" : "failed",
    acceptance: "not_established",
    remainingEvidence: ["durable business write readback", "50 concurrent intake and reporting backlog", "500 dispatchable orders", "queue lag", "live authorization and resource isolation", "monthly availability is not inferred from this run"] };
  writeFileSync(`${output}.summary.json`, `${JSON.stringify(summary, null, 2)}\n`);
  return summary;
}

if (process.argv[1]?.endsWith("/capacity.mjs")) {
  const [planPath, output, baseSha, candidateSha] = process.argv.slice(2);
  try {
    const raw = readFileSync(planPath, "utf8");
    const summary = await runPlan(JSON.parse(raw), output, { baseSha, candidateSha, planSha256: digest(raw) });
    process.exitCode = summary.result === "failed" ? 1 : 0;
  } catch (error) {
    console.error(error.message);
    process.exitCode = 2;
  }
}
