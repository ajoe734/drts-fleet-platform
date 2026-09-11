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

export function buildBookingItems({ count, tenantId, tenantJwt, runTag, windowStartMs }) {
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

export function buildDispatchItems({ orderIds, dispatchJwt, runTag }) {
  return orderIds.map((orderId, index) => ({
    method: "POST",
    path: `/api/orders/${orderId}/dispatch`,
    headers: {
      authorization: `Bearer ${dispatchJwt}`,
      "idempotency-key": `${runTag}-dispatch-${index}`,
      "x-request-id": `${runTag}-dispatch-req-${index}`,
    },
    body: {
      mode: "auto",
    },
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
  windowStartMs = Date.now() + 2 * 60 * 60 * 1000,
}) {
  const bookingCount = countForFamily("booking", durationSeconds);
  const dispatchCount = countForFamily("dispatch", durationSeconds);
  const reportCount = countForFamily("report", durationSeconds);

  if (orderIds.length !== dispatchCount) {
    throw new Error(
      `orderIds must contain exactly ${dispatchCount} pre-provisioned dispatchable order IDs for a ${durationSeconds}s burst; received ${orderIds.length}`,
    );
  }

  return {
    origin,
    durationSeconds,
    maxInFlight,
    isolatedResourceId,
    workloads: {
      booking: buildBookingItems({ count: bookingCount, tenantId, tenantJwt, runTag, windowStartMs }),
      dispatch: buildDispatchItems({ orderIds, dispatchJwt, runTag }),
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
