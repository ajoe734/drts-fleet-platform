// SR-OPS-CAPACITY-RUNNER-20260911 (C123): builds the operator-supplied
// workload plan consumed by the reused SR-OPS-PROOF-001 (C122) load
// generator (`tools/system-remediation/ops-proof/capacity.mjs`). This module
// only assembles real, authoritative POST payloads and real JWT bearer
// headers for the three accepted baseline families -- it never invents a
// mocked response or bypasses `capacity.mjs`'s own plan validation.
//
// Counts mirror the accepted baseline in
// `docs/02-architecture/phase1-operational-workload-sla-degradation-baseline-20260430.md`:
// booking (intake) 60/min, dispatch 300/min, report 30/min, each sustained
// for the full 900-second (15 minute) burst window.

export const BASELINE_PER_MINUTE = {
  booking: 60,
  dispatch: 300,
  report: 30,
};

// Legacy profiles keep their original hard intervals. The separately named
// burst scenario uses the same rolling budgets, rather than claiming to meet
// the uniform dispatch interval. No caller can supply a custom interval.
export function minimumSpacingMs(profile, family) {
  if (!["uniform", "concurrent", "budgeted_dispatch_burst"].includes(profile))
    throw new Error("Unknown capacity profile");
  if (!Object.hasOwn(BASELINE_PER_MINUTE, family))
    throw new Error(`Unknown workload family: ${family}`);
  return profile === "uniform" ||
    (profile === "concurrent" && family === "dispatch")
    ? 60000 / BASELINE_PER_MINUTE[family]
    : 0;
}

// An explicit scenario, distinct from the ordinary uniform cadence. Intake
// launches 50 requests together and the remaining ten later in each minute;
// reports launch a budgeted cohort of 30. This can exercise intake overlap,
// but does not claim a measured 50-job running/queued report backlog.
export function buildWorkloadSchedule(profile, counts) {
  minimumSpacingMs(profile, "dispatch");
  if (
    profile === "budgeted_dispatch_burst" &&
    Object.entries(BASELINE_PER_MINUTE).some(
      ([family, perMinute]) => counts[family] !== perMinute * 15,
    )
  )
    throw new Error("budgeted_dispatch_burst requires the full 900s counts");
  return Object.fromEntries(
    Object.entries(BASELINE_PER_MINUTE).map(([family, perMinute]) => [
      family,
      Array.from({ length: counts[family] }, (_, index) => {
        if (
          profile === "uniform" ||
          (profile === "concurrent" && family === "dispatch")
        )
          return (index * 60000) / perMinute;
        const minute = Math.floor(index / perMinute) * 60000;
        const within = index % perMinute;
        // 299 genuine dispatch arrivals at each minute's start, then one at
        // 59800ms. The repeated offsets fit every rolling minute. Real seed
        // readiness/in-flight limits may delay or refuse these arrivals; the
        // scheduler must still check the actual rolling budget and window.
        // The final request is due at899800ms, never a filler sleep.
        if (family === "dispatch")
          return minute + (within === perMinute - 1 ? 59800 : 0);
        if (family === "report") return minute;
        return minute + (within < 50 ? 0 : 50000 + (within - 50) * 1000);
      }),
    ]),
  );
}

// Independently re-read actual producer rows for the additional burst profile.
// A valid nominal plan or a late response cannot substitute for real arrivals.
export function readBackBudgetedDispatchArrivals(records) {
  const profile = "budgeted_dispatch_burst";
  const counts = countsForDuration(900);
  const schedule = buildWorkloadSchedule(profile, counts);
  const requests = records.filter((row) => row.kind === "capacity_request");
  if (requests.length !== 5850)
    throw new Error("Budgeted burst requires all 5850 actual request records");
  let finalArrivalMs = 0;
  for (const [family, count] of Object.entries(counts)) {
    const rows = requests
      .filter((row) => row.workload === family)
      .sort((a, b) => a.sequence - b.sequence);
    if (rows.length !== count)
      throw new Error(`Budgeted burst missing ${family} arrivals`);
    let first = 0;
    for (const [index, row] of rows.entries()) {
      if (
        row.profile !== profile ||
        row.sequence !== index + 1 ||
        row.scheduledMs !== schedule[family][index] ||
        !Number.isFinite(row.launchedMs) ||
        row.launchedMs < row.scheduledMs ||
        row.launchedMs >= 900000 ||
        (index > 0 && row.launchedMs < rows[index - 1].launchedMs) ||
        row.error !== null
      )
        throw new Error(`Budgeted burst invalid ${family} arrival ${index + 1}`);
      while (row.launchedMs - rows[first].launchedMs >= 60000) first++;
      if (index - first + 1 > BASELINE_PER_MINUTE[family])
        throw new Error(`Budgeted burst ${family} exceeds actual rolling budget`);
      finalArrivalMs = Math.max(finalArrivalMs, row.launchedMs);
    }
  }
  if (finalArrivalMs < 899800)
    throw new Error("Budgeted burst missing genuine final admission at899800ms");
  return { profile, finalArrivalMs };
}

export function countForFamily(family, durationSeconds) {
  const perMinute = BASELINE_PER_MINUTE[family];
  if (!perMinute) {
    throw new Error(`Unknown workload family: ${family}`);
  }
  return Math.ceil((durationSeconds * perMinute) / 60);
}

function pad(value, length) {
  return String(value).padStart(length, "0");
}

export function buildBookingItems({
  count,
  tenantId,
  tenantJwt,
  runTag,
  windowStartMs,
}) {
  const items = [];
  for (let index = 0; index < count; index += 1) {
    // Stagger reservation windows so every booking is a distinct,
    // independently auditable reservation rather than a duplicate payload.
    const start = new Date(windowStartMs + index * 60_000);
    const end = new Date(start.getTime() + 45 * 60_000);
    items.push({
      method: "POST",
      path: "/api/tenant/bookings",
      headers: {
        authorization: `Bearer ${tenantJwt}`,
        "x-tenant-id": tenantId,
        "idempotency-key": `${runTag}-booking-${index}`,
        "x-request-id": `${runTag}-booking-req-${index}`,
      },
      body: {
        businessDispatchSubtype: "enterprise_dispatch",
        pickup: { address: `SR-OPS-CAPACITY pickup ${runTag} #${index}` },
        dropoff: { address: `SR-OPS-CAPACITY dropoff ${runTag} #${index}` },
        reservationWindowStart: start.toISOString(),
        reservationWindowEnd: end.toISOString(),
        passenger: {
          name: `SR-OPS-CAPACITY passenger ${index}`,
          phone: `09${pad(index % 100000000, 8)}`,
        },
      },
    });
  }
  return items;
}

export function buildDispatchItems({
  orderIds,
  dispatchJwt,
  runTag,
  count = orderIds.length,
  stagedDispatch = false,
}) {
  return Array.from({ length: count }, (_, index) => ({
    method: "POST",
    path: orderIds[index]
      ? `/api/orders/${orderIds[index]}/dispatch`
      : "/api/orders/{orderId}/dispatch",
    headers: {
      authorization: `Bearer ${dispatchJwt}`,
      "idempotency-key": `${runTag}-dispatch-${index}`,
      "x-request-id": `${runTag}-dispatch-req-${index}`,
    },
    body: {
      mode: "auto",
    },
    ...(!orderIds[index] && stagedDispatch
      ? {
          stageOrder: {
            method: "POST",
            path: "/api/orders",
            headers: {
              "x-actor-type": "ops_user",
              "x-actor-id": `sr-ops-capacity-seed-${index}`,
              "x-request-id": `${runTag}-seed-req-${index}`,
              "idempotency-key": `${runTag}-seed-${index}`,
            },
            body: {
              pickup: {
                address: `SR-OPS-CAPACITY seed pickup ${index}`,
                lat: 25.042,
                lng: 121.552,
              },
              dropoff: {
                address: `SR-OPS-CAPACITY seed dropoff ${index}`,
                lat: 25.045,
                lng: 121.555,
              },
              passenger: {
                name: `SR-OPS-CAPACITY seed passenger ${index}`,
                phone: `08${pad(index % 100000000, 8)}`,
              },
            },
          },
        }
      : {}),
  }));
}

export function buildReportItems({ count, reportJwt, runTag }) {
  const items = [];
  for (let index = 0; index < count; index += 1) {
    items.push({
      method: "POST",
      path: "/api/reports/jobs",
      headers: {
        authorization: `Bearer ${reportJwt}`,
        "idempotency-key": `${runTag}-report-${index}`,
        "x-request-id": `${runTag}-report-req-${index}`,
      },
      body: {
        jobType: "trip_summary",
        format: "csv",
        filters: { runTag },
      },
    });
  }
  return items;
}

// Builds the full plan object accepted by `ops-proof/capacity.mjs`'s
// `validatePlan`/`runPlan`. Every request in the plan targets a real,
// authoritative write route; the caller is responsible for supplying real
// JWTs minted by the running AppModule's own JwtAuthService and real,
// durably pre-provisioned dispatchable order IDs.
export function buildCapacityPlan({
  origin,
  durationSeconds,
  maxInFlight,
  isolatedResourceId,
  tenantId,
  tenantJwt,
  dispatchJwt,
  reportJwt,
  orderIds,
  runTag,
  profile = "uniform",
  stagedDispatch = false,
  windowStartMs = Date.now() + 2 * 60 * 60 * 1000,
}) {
  const bookingCount = countForFamily("booking", durationSeconds);
  const dispatchCount = countForFamily("dispatch", durationSeconds);
  const reportCount = countForFamily("report", durationSeconds);

  if (
    orderIds.length !== (stagedDispatch ? 500 : dispatchCount) ||
    (stagedDispatch &&
      (durationSeconds !== 900 ||
        !["concurrent", "budgeted_dispatch_burst"].includes(profile)))
  ) {
    throw new Error(
      `orderIds must contain exactly ${dispatchCount} pre-provisioned dispatchable order IDs for a ${durationSeconds}s burst; received ${orderIds.length}`,
    );
  }

  return {
    origin,
    durationSeconds,
    maxInFlight,
    isolatedResourceId,
    profile,
    scheduleMs: buildWorkloadSchedule(profile, {
      booking: bookingCount,
      dispatch: dispatchCount,
      report: reportCount,
    }),
    workloads: {
      booking: buildBookingItems({
        count: bookingCount,
        tenantId,
        tenantJwt,
        runTag,
        windowStartMs,
      }),
      dispatch: buildDispatchItems({
        orderIds,
        dispatchJwt,
        runTag,
        count: dispatchCount,
        stagedDispatch,
      }),
      report: buildReportItems({ count: reportCount, reportJwt, runTag }),
    },
  };
}

export function countsForDuration(durationSeconds) {
  return {
    booking: countForFamily("booking", durationSeconds),
    dispatch: countForFamily("dispatch", durationSeconds),
    report: countForFamily("report", durationSeconds),
  };
}
