// SR-OPS-CAPACITY-RUNNER-20260911 (C123): independent, direct-SQL durable
// readback for the resource IDs a capacity run's HTTP responses claimed to
// have created. This is deliberately separate from the HTTP load path: it
// proves the API's "success" responses correspond to rows the platform
// actually committed, rather than trusting the HTTP layer's own account of
// itself.

export async function readBackOwnedOrders(pool, orderIds) {
  const unique = [...new Set(orderIds)];
  if (unique.length === 0) {
    return [];
  }
  const { rows } = await pool.query(
    `SELECT
       o.order_id,
       o.status,
       o.created_at as order_created_at,
       j.created_at as job_created_at,
       j.updated_at as job_updated_at,
       (SELECT MIN(a.created_at) FROM ops.phase1_dispatch_attempts a WHERE a.dispatch_job_id = j.dispatch_job_id) as first_attempt_at,
       j.status as job_status
     FROM ops.phase1_owned_orders o
     LEFT JOIN (
       SELECT DISTINCT ON (order_id) dispatch_job_id, order_id, status, created_at, updated_at
       FROM ops.phase1_dispatch_jobs
       ORDER BY order_id, created_at ASC
     ) j ON o.order_id = j.order_id
     WHERE o.order_id = ANY($1::text[])`,
    [unique],
  );
  return rows.map((row) => {
    let lagMs = null;
    if (row.first_attempt_at && row.order_created_at) {
      lagMs = new Date(row.first_attempt_at).getTime() - new Date(row.order_created_at).getTime();
    }

    return {
      orderId: row.order_id,
      status: row.status,
      createdAt: row.order_created_at,
      lagMs,
    };
  });
}

export async function readBackReportJobs(pool, jobIds) {
  const unique = [...new Set(jobIds)];
  if (unique.length === 0) {
    return [];
  }
  // admin.phase1_report_jobs does not have an assignments table.
  // We'll read the startedAt or similar if it exists, or fallback to updated_at
  // only if status changed from 'pending' to 'processing' (which we can't easily query without history).
  // For now, if the job has a non-null updated_at and status is not pending, we use it,
  // but this is a known limitation. We'll extract 'startedAt' from record JSON if possible.
  const { rows } = await pool.query(
    `SELECT job_id, status, created_at, updated_at, record->>'startedAt' as started_at
       FROM admin.phase1_report_jobs
      WHERE job_id = ANY($1::text[])`,
    [unique],
  );
  return rows.map((row) => {
    let queueLagMs = null;
    if (row.started_at) {
      queueLagMs = new Date(row.started_at).getTime() - new Date(row.created_at).getTime();
    }
    return {
      jobId: row.job_id,
      status: row.status,
      createdAt: row.created_at,
      queueLagMs,
    };
  });
}

// Compares the resource IDs an HTTP response claimed as successfully created
// against what a direct, independent SQL read actually finds. `idOf` reads
// the correlation key off both the expected id (string) and a found row.
export function summarizeReadback(expectedIds, foundRows, idOf) {
  const expected = [...new Set(expectedIds)];
  const foundIds = new Set(foundRows.map((row) => idOf(row)));
  const missing = expected.filter((id) => !foundIds.has(id));
  return {
    expectedCount: expected.length,
    foundCount: foundRows.length,
    missing,
    matched: missing.length === 0 && expected.length === foundRows.length,
  };
}

export function summarizeLag(rows, lagKey) {
  const values = rows
    .map((row) => row[lagKey])
    .filter((value) => Number.isFinite(value))
    .sort((a, b) => a - b);
  if (values.length === 0) {
    return { count: 0, minMs: null, maxMs: null, avgMs: null, p95Ms: null };
  }
  const sum = values.reduce((acc, value) => acc + value, 0);
  const p95Index = Math.max(0, Math.ceil(values.length * 0.95) - 1);
  return {
    count: values.length,
    minMs: values[0],
    maxMs: values[values.length - 1],
    avgMs: sum / values.length,
    p95Ms: values[p95Index],
  };
}

export function assertAcceptancePassed(acceptance) {
  if (!acceptance?.summary) {
    throw new Error("Missing workload summary");
  }

  const { summary } = acceptance;

  if (summary.result !== "measurements_within_targets") {
    throw new Error(
      `Workload failed: ${summary.result}. Check error rows or latency targets.`,
    );
  }

  if (summary.durationSeconds !== 900) {
    throw new Error(
      `Workload failed: duration must be exactly 900s, got ${summary.durationSeconds}`,
    );
  }

  if (summary.fullBurstSchedule !== true) {
    throw new Error(`Workload failed: must be full burst schedule`);
  }

  // 4499 dispatches * 200ms spacing = 899800ms
  if (!Number.isFinite(summary.elapsedMs) || summary.elapsedMs < 899800) {
    throw new Error(
      `Workload failed: invalid elapsedMs, must be at least 899800 for a 900s run, got ${summary.elapsedMs}`,
    );
  }

  if (!Number.isFinite(summary.maxInFlight) || summary.maxInFlight <= 0) {
    throw new Error(`Workload failed: invalid maxInFlight`);
  }

  const requiredCounts = {
    booking: 900,
    dispatch: 4500,
    report: 450,
  };

  const expectedTargets = {
    booking: { p95Ms: 2000, p99Ms: 5000 },
    dispatch: { p95Ms: 10000 },
    report: { p95Ms: 5000 },
  };

  if (!acceptance.concurrency ||
      !Number.isFinite(acceptance.concurrency.intake) || acceptance.concurrency.intake < 50 ||
      !Number.isFinite(acceptance.concurrency.report) || acceptance.concurrency.report < 50 ||
      !acceptance.backlog ||
      !Number.isFinite(acceptance.backlog.dispatchable) || acceptance.backlog.dispatchable < 500 ||
      !acceptance.degradation || acceptance.degradation.isLawful !== true) {
    throw new Error(`Workload failed: missing genuine concurrency/backlog/degradation measurements or values insufficient`);
  }

  if (
    !acceptance.queueLag ||
    !acceptance.queueLag.report ||
    !acceptance.queueLag.dispatchOrderQueueLag
  ) {
    throw new Error(`Workload failed: missing queueLag evidence`);
  }

  const checkLagConsistency = (lag, exactCount) => {
    if (!Number.isInteger(lag.count) || lag.count < 0) return false;
    if (exactCount !== undefined && lag.count !== exactCount) return false;
    if (lag.count === 0) return true;
    return Number.isFinite(lag.minMs) && lag.minMs >= 0 &&
           Number.isFinite(lag.maxMs) && lag.maxMs >= 0 &&
           Number.isFinite(lag.avgMs) && lag.avgMs >= 0 &&
           Number.isFinite(lag.p95Ms) && lag.p95Ms >= 0 &&
           lag.minMs <= lag.maxMs &&
           lag.avgMs >= lag.minMs && lag.avgMs <= lag.maxMs &&
           lag.p95Ms >= lag.minMs && lag.p95Ms <= lag.maxMs;
  };

  // Report queue lag MUST be measurable and consistent for all reports.
  if (!checkLagConsistency(acceptance.queueLag.report, requiredCounts.report)) {
    throw new Error(`Workload failed: invalid or missing report queueLag measurements (expected ${requiredCounts.report}, got ${acceptance.queueLag.report.count})`);
  }
  if (acceptance.queueLag.report.maxMs > 300000) {
    throw new Error(`Workload failed: report queueLag maxMs exceeded 5m target, got ${acceptance.queueLag.report.maxMs}`);
  }

  if (!acceptance.dispatchOrderStatusDistribution) {
    throw new Error(`Workload failed: missing dispatchOrderStatusDistribution`);
  }

  const statuses = Object.keys(acceptance.dispatchOrderStatusDistribution);
  if (statuses.length === 0) {
    throw new Error(
      `Workload failed: dispatchOrderStatusDistribution is empty`,
    );
  }

  const validStatuses = new Set([
    "created",
    "recording_pending",
    "ready_for_dispatch",
    "preassigned",
    "assigned",
    "driver_accepted",
    "enroute_pickup",
    "arrived_pickup",
    "on_trip",
    "proof_pending",
    "completed",
    "cancelled",
    "redispatch_required",
    "dispatch_failed",
    "dispatch_timeout",
    "no_supply",
    "delayed_queue",
    "exception_hold"
  ]);
  let totalStatusCount = 0;
  let unattemptedLawfulCount = 0;
  for (const [status, count] of Object.entries(acceptance.dispatchOrderStatusDistribution)) {
    if (!validStatuses.has(status)) {
      throw new Error(`Workload failed: unlawful status in distribution: ${status}`);
    }
    if (!Number.isInteger(count) || count < 0) {
      throw new Error(`Workload failed: invalid count for status ${status}`);
    }
    totalStatusCount += count;
    if (status === "no_supply" || status === "delayed_queue") {
      unattemptedLawfulCount += count;
    }
  }
  if (totalStatusCount !== requiredCounts.dispatch) {
    throw new Error(`Workload failed: dispatchOrderStatusDistribution total count must be ${requiredCounts.dispatch}, got ${totalStatusCount}`);
  }

  const expectedDispatchLagCount = totalStatusCount - unattemptedLawfulCount;

  // Dispatch queue lag must have at least some samples, but may not be 4500 if some remain unassigned/queued lawfuly.
  if (
    acceptance.queueLag.dispatchOrderQueueLag.count <= 0 ||
    !checkLagConsistency(acceptance.queueLag.dispatchOrderQueueLag, expectedDispatchLagCount)
  ) {
    throw new Error(
      `Workload failed: invalid or missing dispatch queueLag measurements (expected ${expectedDispatchLagCount}, got ${acceptance.queueLag.dispatchOrderQueueLag.count})`,
    );
  }

  if (acceptance.queueLag.dispatchOrderQueueLag.p95Ms > 60000) {
    throw new Error(`Workload failed: dispatch queueLag p95Ms exceeded 60s target, got ${acceptance.queueLag.dispatchOrderQueueLag.p95Ms}`);
  }

  for (const family of ["booking", "dispatch", "report"]) {
    const workload = summary.workflows?.[family];
    if (!workload) {
      throw new Error(
        `Workload failed: missing workload measurements for ${family}`,
      );
    }

    if (workload.requests !== requiredCounts[family]) {
      throw new Error(
        `Workload failed: ${family} requires ${requiredCounts[family]} requests, got ${workload.requests}`,
      );
    }

    if (workload.errors !== 0) {
      throw new Error(
        `Workload failed: ${family} requires zero errors, got ${workload.errors}`,
      );
    }

    if (!workload.latencyTargetsMet) {
      throw new Error(`Workload failed: ${family} latency targets not met`);
    }

    if (
      !Number.isFinite(workload.p95Ms) ||
      workload.p95Ms <= 0 ||
      workload.p95Ms > expectedTargets[family].p95Ms
    ) {
      throw new Error(
        `Workload failed: ${family} p95 latency missing, invalid, or exceeded target`,
      );
    }

    // p99 presence must be verified as finite/valid regardless of whether it's an SLO
    if (!Number.isFinite(workload.p99Ms) || workload.p99Ms <= 0) {
      throw new Error(
        `Workload failed: ${family} p99 latency missing or invalid`,
      );
    }

    if (expectedTargets[family].p99Ms !== undefined) {
      if (workload.p99Ms > expectedTargets[family].p99Ms) {
        throw new Error(
          `Workload failed: ${family} p99 latency exceeded target`,
        );
      }
    }

    const readbackSummary = acceptance.readback?.[family];
    if (!readbackSummary) {
      throw new Error(`Missing readback summary for ${family}`);
    }

    if (readbackSummary.missing.length > 0) {
      throw new Error(
        `${family} readback failed: missing ${readbackSummary.missing.length} claimed success resources.`,
      );
    }

    if (!readbackSummary.matched) {
      throw new Error(`${family} readback failed: matched flag is false.`);
    }

    if (
      readbackSummary.expectedCount !== requiredCounts[family] ||
      readbackSummary.foundCount !== requiredCounts[family]
    ) {
      throw new Error(
        `${family} readback failed: expected and found count must be ${requiredCounts[family]}`,
      );
    }
  }
}
