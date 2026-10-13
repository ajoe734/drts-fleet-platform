import { request } from "node:http";
import { createHash } from "node:crypto";
import { appendFileSync, readFileSync, writeFileSync } from "node:fs";
import { performance } from "node:perf_hooks";
import { buildWorkloadSchedule } from "../ops-capacity/plan-builder.mjs";

const baselinePath =
  "docs/02-architecture/phase1-operational-workload-sla-degradation-baseline-20260430.md";
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
const object = (value) =>
  value && typeof value === "object" && !Array.isArray(value);

export function validatePlan(plan) {
  if (
    !object(plan) ||
    !Number.isFinite(plan.durationSeconds) ||
    plan.durationSeconds <= 0 ||
    plan.durationSeconds > 900
  ) {
    throw new Error(
      "durationSeconds must be > 0 and <= 900; only 900 seconds is the full baseline burst",
    );
  }
  if (
    !Number.isInteger(plan.maxInFlight) ||
    plan.maxInFlight < 1 ||
    plan.maxInFlight > 500
  ) {
    throw new Error("maxInFlight must be 1..500");
  }
  if (
    typeof plan.isolatedResourceId !== "string" ||
    !plan.isolatedResourceId.trim()
  ) {
    throw new Error(
      "isolatedResourceId is required; operator must exclude tunnels to shared resources",
    );
  }
  const origin = new URL(plan.origin);
  if (
    origin.protocol !== "http:" ||
    !["127.0.0.1", "localhost"].includes(origin.hostname) ||
    origin.username ||
    origin.password ||
    origin.pathname !== "/" ||
    origin.search ||
    origin.hash
  ) {
    throw new Error("origin must be a plain loopback HTTP origin");
  }
  const keys = new Set();
  const dispatchOrders = new Set();
  const profile = plan.profile ?? "uniform";
  const counts = Object.fromEntries(
    Object.entries(baseline).map(([family, targets]) => [
      family,
      Math.ceil((plan.durationSeconds * targets.perMinute) / 60),
    ]),
  );
  const canonicalSchedule = buildWorkloadSchedule(profile, counts);
  const schedule = plan.scheduleMs ?? canonicalSchedule;
  for (const family of Object.keys(baseline)) {
    const times = schedule[family];
    if (
      !Array.isArray(times) ||
      times.length !== counts[family] ||
      times.some(
        (value, i) =>
          !Number.isFinite(value) ||
          value < 0 ||
          value >= plan.durationSeconds * 1000 ||
          value !== canonicalSchedule[family][i],
      )
    )
      throw new Error(`Invalid ${family} profile schedule`);
    // Validate actual rolling minute budgets, including boundaries between cohorts.
    let first = 0;
    times.forEach((time, i) => {
      while (time - times[first] >= 60000) first++;
      if (i - first + 1 > baseline[family].perMinute)
        throw new Error(`${family} profile exceeds rolling minute budget`);
    });
  }
  for (const family of Object.keys(baseline)) {
    const items = plan.workloads?.[family];
    const count = Math.ceil(
      (plan.durationSeconds * baseline[family].perMinute) / 60,
    );
    if (!Array.isArray(items) || items.length !== count)
      throw new Error(
        `${family} requires exactly ${count} independent request payloads`,
      );
    for (const item of items) {
      if (
        !object(item) ||
        item.method !== "POST" ||
        !(
          routes[family].test(item.path) ||
          (family === "dispatch" &&
            item.path === "/api/orders/{orderId}/dispatch" &&
            object(item.stageOrder))
        ) ||
        !object(item.body) ||
        !object(item.headers)
      ) {
        throw new Error(
          `${family} requires authoritative POST route, body and headers`,
        );
      }
      const headers = Object.fromEntries(
        Object.entries(item.headers).map(([key, value]) => [
          key.toLowerCase(),
          value,
        ]),
      );
      if (
        Object.keys(headers).length !== Object.keys(item.headers).length ||
        Object.entries(headers).some(
          ([key, value]) =>
            ![
              "authorization",
              "idempotency-key",
              "x-tenant-id",
              "x-request-id",
              "x-runtime-profile-code",
            ].includes(key) ||
            typeof value !== "string" ||
            /[\r\n]/.test(value),
        )
      ) {
        throw new Error(
          "Only canonical auth, tenant, request and idempotency headers are permitted",
        );
      }
      const key = headers["idempotency-key"];
      if (
        !key ||
        keys.has(key) ||
        (item.body.idempotencyKey && item.body.idempotencyKey !== key)
      ) {
        throw new Error(
          "Every write must have a unique matching idempotency key; replay is not capacity evidence",
        );
      }
      keys.add(key);
      if (item.stageOrder) {
        const stage = item.stageOrder;
        if (
          family !== "dispatch" ||
          profile !== "concurrent" ||
          plan.durationSeconds !== 900 ||
          item.path !== "/api/orders/{orderId}/dispatch" ||
          stage.method !== "POST" ||
          stage.path !== "/api/orders" ||
          !object(stage.body) ||
          !object(stage.headers) ||
          !["pickup", "dropoff", "passenger"].every((field) =>
            object(stage.body[field]),
          ) ||
          !["pickup", "dropoff"].every(
            (field) =>
              typeof stage.body[field].address === "string" &&
              Number.isFinite(stage.body[field].lat) &&
              Number.isFinite(stage.body[field].lng),
          ) ||
          Object.entries(stage.headers).some(
            ([key, value]) =>
              ![
                "x-actor-type",
                "x-actor-id",
                "x-request-id",
                "idempotency-key",
              ].includes(key) ||
              typeof value !== "string" ||
              /[\r\n]/.test(value),
          ) ||
          stage.headers["x-actor-type"] !== "ops_user" ||
          !stage.headers["x-actor-id"] ||
          !stage.headers["idempotency-key"] ||
          keys.has(stage.headers["idempotency-key"])
        ) {
          throw new Error(
            "Dispatch stage requires the original isolated real HTTP fixture source and independent idempotency key",
          );
        }
        keys.add(stage.headers["idempotency-key"]);
      }
      if (
        family === "booking" &&
        (!headers["x-tenant-id"] ||
          ![
            "businessDispatchSubtype",
            "pickup",
            "dropoff",
            "reservationWindowStart",
            "reservationWindowEnd",
            "passenger",
          ].every((field) => item.body[field] != null))
      ) {
        throw new Error(
          "Booking requires tenant and CreateTenantBookingCommand fields",
        );
      }
      if (family === "dispatch") {
        if (
          item.body.mode !== "auto" ||
          dispatchOrders.has(
            item.stageOrder
              ? item.stageOrder.headers["idempotency-key"]
              : item.path,
          )
        )
          throw new Error(
            "Dispatch requires mode auto and independent pre-provisioned order IDs",
          );
        dispatchOrders.add(
          item.stageOrder
            ? item.stageOrder.headers["idempotency-key"]
            : item.path,
        );
      }
      if (family === "report" && (!item.body.jobType || !item.body.format))
        throw new Error(
          "Report requires CreateReportJobCommand jobType and format",
        );
    }
  }
  if (
    plan.workloads.dispatch.some((item) => item.stageOrder) &&
    (plan.workloads.dispatch.filter((item) => !item.stageOrder).length !==
      500 ||
      plan.workloads.dispatch.slice(0, 500).some((item) => item.stageOrder))
  ) {
    throw new Error(
      "Staged full baseline requires 500 actual initial backlog orders",
    );
  }
  return plan;
}

// Creation readiness comes from the production HTTP lifecycle. Never invent an
// order ID or timestamp for a deferred fixture, and never retry a failed seed.
export async function prepareDispatchItem(origin, item) {
  if (!item.stageOrder) return { item, seed: null };
  const seed = await measure(origin, item.stageOrder);
  const orderId = seed.resourceIds?.orderId;
  if (
    seed.error ||
    typeof orderId !== "string" ||
    !/^[a-zA-Z0-9_-]+$/.test(orderId)
  ) {
    return {
      item,
      seed,
      error: `Dispatch stage failed: ${seed.error ?? "missing real order ID"}`,
    };
  }
  return { item: { ...item, path: `/api/orders/${orderId}/dispatch` }, seed };
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
    const req = request(
      url,
      {
        method: "POST",
        headers: {
          ...item.headers,
          "content-type": "application/json",
          "content-length": Buffer.byteLength(body),
        },
      },
      (res) => {
        const chunks = [];
        let bytes = 0;
        res.on("data", (chunk) => {
          bytes += chunk.length;
          if (bytes > 2 * 1024 * 1024)
            req.destroy(new Error("Response exceeded 2 MiB"));
          else chunks.push(chunk);
        });
        res.on("error", (error) =>
          finish({ httpStatus: res.statusCode, error: error.message }),
        );
        res.on("end", () => {
          const raw = Buffer.concat(chunks).toString("utf8");
          let data;
          let error = null;
          try {
            const envelope = JSON.parse(raw);
            data = envelope.data;
            if (!object(data) || envelope.error)
              error = "Missing successful API data envelope";
          } catch {
            error = "Invalid JSON response";
          }
          if (res.statusCode < 200 || res.statusCode >= 300)
            error = `HTTP ${res.statusCode}`;
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
          finish({
            httpStatus: res.statusCode,
            responseSha256: digest(raw),
            resourceIds,
            error,
          });
        });
      },
    );
    const deadline = setTimeout(
      () => req.destroy(new Error("Request deadline exceeded 30 seconds")),
      30000,
    );
    req.on("error", (error) =>
      finish({ httpStatus: null, error: error.message }),
    );
    req.end(body);
  });
}

export async function runPlan(plan, output, provenance, lifecycle = {}) {
  validatePlan(plan);
  writeFileSync(output, "");
  const baselineSha256 = digest(readFileSync(baselinePath));
  const records = [];
  const active = new Set();
  const preparationStartedAt = new Date().toISOString();
  const profile = plan.profile ?? "uniform";
  const scheduleMs =
    plan.scheduleMs ??
    buildWorkloadSchedule(
      profile,
      Object.fromEntries(
        Object.keys(baseline).map((family) => [
          family,
          plan.workloads[family].length,
        ]),
      ),
    );
  const schedule = Object.keys(baseline)
    .flatMap((family) =>
      plan.workloads[family].map((item, index) => ({
        family,
        item,
        sequence: index + 1,
        scheduledMs: scheduleMs[family][index],
      })),
    )
    .sort((a, b) => a.scheduledMs - b.scheduledMs);
  const familyLastLaunch = {};
  const familyLaunches = Object.fromEntries(
    Object.keys(baseline).map((family) => [family, []]),
  );
  // Ready the actual durable worker before the measured admission window. This
  // is setup, never a measured request; retain its own wall-clock provenance.
  // The measured origin is established once, after successful readiness.
  if (lifecycle.initialize) {
    try {
      await lifecycle.initialize({ startedAt: preparationStartedAt });
    } catch (error) {
      try {
        appendFileSync(
          output,
          `${JSON.stringify({
            kind: "capacity_preparation_failure",
            ...provenance,
            isolatedResourceId: plan.isolatedResourceId,
            observedAt: new Date().toISOString(),
            error: error instanceof Error ? error.message : String(error),
          })}\n`,
        );
      } catch (writeError) {
        throw new AggregateError(
          [error, writeError],
          "Capacity preparation and evidence write failed",
        );
      }
      throw error;
    }
  }
  const start = performance.now();
  const startedAt = new Date().toISOString();
  // Keep real seed readiness inside the original clock, with at most eight
  // prepared/in-flight orders and a1600ms lookahead. Serial seed HTTP must not
  // block every next scheduled family. Each order is prepared once, never
  // retried, and dispatch still waits for its actual successful creation.
  const stagedEntries = schedule.filter((entry) => entry.item.stageOrder);
  const preparations = new Map();
  const producerFailures = [];
  let nextSeed = 0;
  const primeSeeds = (scheduledMs) => {
    while (
      preparations.size < 8 &&
      nextSeed < stagedEntries.length &&
      stagedEntries[nextSeed].scheduledMs <= scheduledMs + 1600
    ) {
      const entry = stagedEntries[nextSeed++];
      const startedMs = performance.now() - start;
      const preparation = prepareDispatchItem(plan.origin, entry.item)
        .catch((error) => {
          producerFailures.push(error);
          return {
            item: entry.item,
            error: `Dispatch stage failed: ${error?.message ?? String(error)}`,
            seed: {
              httpStatus: null,
              latencyMs: performance.now() - start - startedMs,
              error: error?.message ?? String(error),
            },
          };
        })
        .then((prepared) => {
          appendFileSync(
            output,
            `${JSON.stringify({
              taskId: "SR-OPS-PROOF-001",
              kind: "capacity_seed",
              ...provenance,
              isolatedResourceId: plan.isolatedResourceId,
              sequence: entry.sequence,
              method: "POST",
              path: "/api/orders",
              requestId: entry.item.stageOrder.headers["x-request-id"],
              requestSha256: digest(JSON.stringify(entry.item.stageOrder.body)),
              startedMs,
              clockOriginMs: start,
              readyMs: prepared.error ? null : performance.now() - start,
              scheduledDispatchMs: entry.scheduledMs,
              observedAt: new Date().toISOString(),
              ...prepared.seed,
            })}\n`,
          );
          return prepared;
        })
        .catch((error) => {
          // Evidence write failure is fatal, but do not leak other requests or
          // leave an unhandled prefetch rejection before this slot is consumed.
          producerFailures.push(error);
          return {
            item: entry.item,
            error: "Dispatch preparation evidence failed",
          };
        });
      preparations.set(entry.sequence, preparation);
    }
  };
  const sleepFor = async (wait, clock, compensate = false) => {
    // A floor re-check can otherwise add the same observed timer lateness to
    // every gap. Wake ahead using the previous real wake's latency, then check
    // the hard boundary again. A positive1us delay bias avoids arithmetic
    // rounding down; it never permits an early admission or a shorter gap.
    const delay = Math.max(
      1,
      compensate ? wait - clock.wakeLatenessMs + 0.001 : wait,
    );
    const before = performance.now();
    await new Promise((resolve) => setTimeout(resolve, delay));
    clock.wakeLatenessMs = Math.max(0, performance.now() - before - delay);
  };
  const waitUntil = async (targetMs, clock, compensate = false) => {
    while (true) {
      const wait = targetMs - (performance.now() - start);
      if (wait <= 0) return;
      // Pass the remaining absolute delay, without rounding it up on each
      // interval. Hosts may truncate or wake early: always re-check the actual
      // clock, with a minimum1ms sleep and no busy-spin.
      await sleepFor(wait, clock, compensate);
    }
  };
  // Independent family lanes share one actual t0 and one in-flight bound.
  // Awaiting a real dispatch seed must not hold up duly scheduled intake or
  // reports. Each family still admits sequentially under its own hard floors.
  const runFamily = async (family) => {
    const clock = { wakeLatenessMs: 0 };
    try {
      for (const entry of schedule.filter((row) => row.family === family)) {
        if (family === "dispatch") primeSeeds(entry.scheduledMs);
        const prepared = entry.item.stageOrder
          ? await preparations.get(entry.sequence)
          : { item: entry.item, seed: null };
        if (entry.item.stageOrder) preparations.delete(entry.sequence);
        // Wake for the absolute START due time first. Only then apply actual
        // spacing and rolling-budget floors. Anchoring every sleep to the prior
        // wakeup would accumulate even constant timer lateness across4500 starts.
        await waitUntil(entry.scheduledMs, clock);
        const spacing = 60000 / baseline[entry.family].perMinute;
        let targetMs = entry.scheduledMs;
        if (
          (profile === "uniform" || entry.family === "dispatch") &&
          familyLastLaunch[entry.family] !== undefined
        ) {
          targetMs = Math.max(
            targetMs,
            familyLastLaunch[entry.family] + spacing,
          );
        }
        const launches = familyLaunches[entry.family];
        if (launches.length >= baseline[entry.family].perMinute) {
          targetMs = Math.max(
            targetMs,
            launches[launches.length - baseline[entry.family].perMinute] +
              60000,
          );
        }
        await waitUntil(targetMs, clock, true);
        // Compare actual differences as well as absolute sums: floating-point
        // addition can round last+60000 down while now-last is still below60000.
        // Never tolerate even that early rolling boundary or spacing deficit.
        while (true) {
          const now = performance.now() - start;
          const prior = familyLastLaunch[entry.family];
          const spacingWait =
            (profile === "uniform" || entry.family === "dispatch") &&
            prior !== undefined
              ? spacing - (now - prior)
              : 0;
          const budgetWait =
            launches.length >= baseline[entry.family].perMinute
              ? 60000 -
                (now -
                  launches[launches.length - baseline[entry.family].perMinute])
              : 0;
          const wait = Math.max(spacingWait, budgetWait);
          if (wait <= 0) break;
          await sleepFor(wait, clock, true);
        }
        // Do not queue and then falsely report the requested arrival rate as met.
        const overloaded = active.size >= plan.maxInFlight;
        const attemptedMs = performance.now() - start;
        const late = attemptedMs >= plan.durationSeconds * 1000;
        const launchedMs =
          late || overloaded || prepared.error ? null : attemptedMs;
        if (launchedMs !== null) {
          familyLastLaunch[entry.family] = launchedMs;
          launches.push(launchedMs);
        }
        const job = (async () => {
          let result;
          try {
            result = late
              ? {
                  latencyMs: null,
                  httpStatus: null,
                  error:
                    "Load generator admission window elapsed; request not sent",
                }
              : overloaded
                ? {
                    latencyMs: null,
                    httpStatus: null,
                    error:
                      "Load generator maxInFlight exhausted; request not sent",
                  }
                : prepared.error
                  ? { latencyMs: null, httpStatus: null, error: prepared.error }
                  : await measure(plan.origin, prepared.item);
          } catch (error) {
            result = {
              latencyMs: null,
              httpStatus: null,
              error: error.message,
            };
          }
          const record = {
            taskId: "SR-OPS-PROOF-001",
            kind: "capacity_request",
            ...provenance,
            isolatedResourceId: plan.isolatedResourceId,
            baselinePath,
            baselineSha256,
            observedAt: new Date().toISOString(),
            workload: entry.family,
            sequence: entry.sequence,
            method: "POST",
            path: prepared.item.path,
            requestId: entry.item.headers["x-request-id"],
            requestSha256: digest(JSON.stringify(entry.item.body)),
            scheduledMs: entry.scheduledMs,
            clockOriginMs: start,
            attemptedMs,
            launchedMs,
            finishedMs: launchedMs === null ? null : performance.now() - start,
            schedulingLagMs: attemptedMs - entry.scheduledMs,
            profile,
            ...result,
          };
          records.push(record);
          appendFileSync(output, `${JSON.stringify(record)}\n`);
        })();
        active.add(job);
        job.then(
          () => active.delete(job),
          (error) => {
            producerFailures.push(error);
            active.delete(job);
          },
        );
      }
    } catch (error) {
      producerFailures.push(error);
    }
  };
  await Promise.all(Object.keys(baseline).map(runFamily));
  await Promise.allSettled([...preparations.values(), ...active]);
  if (producerFailures.length === 1) throw producerFailures[0];
  if (producerFailures.length)
    throw new AggregateError(
      producerFailures,
      "Capacity scheduling/evidence failed",
    );
  const workflows = Object.fromEntries(
    Object.entries(baseline).map(([family, targets]) => {
      const rows = records.filter((row) => row.workload === family);
      const latencies = rows
        .filter((row) => Number.isFinite(row.latencyMs))
        .map((row) => row.latencyMs)
        .sort((a, b) => a - b);
      const percentile = (p) =>
        latencies.length
          ? latencies[Math.ceil(latencies.length * p) - 1]
          : null;
      const p95Ms = percentile(0.95),
        p99Ms = percentile(0.99);
      const launches = rows
        .map((row) => row.launchedMs)
        .filter(Number.isFinite);
      const arrivals = {
        count: launches.length,
        firstMs: launches.length ? Math.min(...launches) : null,
        lastMs: launches.length ? Math.max(...launches) : null,
        early: rows.filter(
          (row) =>
            Number.isFinite(row.launchedMs) && row.launchedMs < row.scheduledMs,
        ).length,
        late: rows.filter(
          (row) => row.attemptedMs >= plan.durationSeconds * 1000,
        ).length,
      };
      return [
        family,
        {
          requests: rows.length,
          errors: rows.filter((row) => row.error).length,
          p95Ms,
          p99Ms,
          arrivals,
          targets,
          latencyTargetsMet:
            p95Ms !== null &&
            p95Ms <= targets.p95Ms &&
            (!targets.p99Ms || p99Ms <= targets.p99Ms),
        },
      ];
    }),
  );
  const summary = {
    taskId: "SR-OPS-PROOF-001",
    kind: "capacity_summary",
    ...provenance,
    isolatedResourceId: plan.isolatedResourceId,
    baselinePath,
    baselineSha256,
    durationSeconds: plan.durationSeconds,
    fullBurstSchedule:
      plan.durationSeconds === 900 &&
      Object.values(workflows).every(
        (row) =>
          row.arrivals.count === row.requests &&
          row.arrivals.early === 0 &&
          row.arrivals.late === 0,
      ),
    elapsedMs: performance.now() - start,
    startedAt,
    preparationStartedAt,
    endedAt: new Date().toISOString(),
    maxInFlight: plan.maxInFlight,
    profile,
    workflows,
    result: Object.values(workflows).every(
      (row) =>
        row.errors === 0 &&
        row.latencyTargetsMet &&
        row.arrivals.count === row.requests &&
        row.arrivals.early === 0 &&
        row.arrivals.late === 0,
    )
      ? "measurements_within_targets"
      : "failed",
    acceptance: "not_established",
    remainingEvidence: [
      "durable business write readback",
      "50 concurrent intake and reporting backlog",
      "500 dispatchable orders",
      "queue lag",
      "live authorization and resource isolation",
      "monthly availability is not inferred from this run",
    ],
  };
  writeFileSync(
    `${output}.summary.json`,
    `${JSON.stringify(summary, null, 2)}\n`,
  );
  return summary;
}

if (process.argv[1]?.endsWith("/capacity.mjs")) {
  const [planPath, output, baseSha, candidateSha] = process.argv.slice(2);
  try {
    const raw = readFileSync(planPath, "utf8");
    const summary = await runPlan(JSON.parse(raw), output, {
      baseSha,
      candidateSha,
      planSha256: digest(raw),
    });
    process.exitCode = summary.result === "failed" ? 1 : 0;
  } catch (error) {
    console.error(error.message);
    process.exitCode = 2;
  }
}
