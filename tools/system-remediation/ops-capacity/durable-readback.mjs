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
    `SELECT o.order_id, o.status, o.created_at, a.created_at as assigned_at
       FROM ops.phase1_owned_orders o
       LEFT JOIN ops.phase1_dispatch_assignments a ON o.order_id = a.order_id
      WHERE o.order_id = ANY($1::text[])`,
    [unique],
  );
  return rows.map((row) => ({
    orderId: row.order_id,
    status: row.status,
    createdAt: row.created_at,
    assignedAt: row.assigned_at,
    lagMs: row.assigned_at
      ? new Date(row.assigned_at).getTime() - new Date(row.created_at).getTime()
      : null,
  }));
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
    } else if (row.status !== 'pending') {
       // fallback if startedAt is not implemented yet
       queueLagMs = new Date(row.updated_at).getTime() - new Date(row.created_at).getTime();
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
    return { count: 0, minMs: null, maxMs: null, avgMs: null };
  }
  const sum = values.reduce((acc, value) => acc + value, 0);
  return {
    count: values.length,
    minMs: values[0],
    maxMs: values[values.length - 1],
    avgMs: sum / values.length,
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

  if (!acceptance.concurrency || !Number.isFinite(acceptance.concurrency.intake) || !Number.isFinite(acceptance.concurrency.report) ||
      !acceptance.backlog || !Number.isFinite(acceptance.backlog.dispatchable) ||
      !acceptance.degradation || acceptance.degradation.isLawful !== true) {
    throw new Error(`Workload failed: missing genuine concurrency/backlog/degradation measurements`);
  }

  if (
    !acceptance.queueLag ||
    !acceptance.queueLag.report ||
    !acceptance.queueLag.dispatchOrderQueueLag
  ) {
    throw new Error(`Workload failed: missing queueLag evidence`);
  }

  if (
    !Number.isFinite(acceptance.queueLag.report.avgMs) ||
    acceptance.queueLag.report.avgMs < 0 ||
    !Number.isFinite(acceptance.queueLag.dispatchOrderQueueLag.avgMs) ||
    acceptance.queueLag.dispatchOrderQueueLag.avgMs < 0 ||
    acceptance.queueLag.report.count !== requiredCounts.report ||
    acceptance.queueLag.dispatchOrderQueueLag.count !== requiredCounts.dispatch
  ) {
    throw new Error(
      `Workload failed: invalid or missing queueLag measurements`,
    );
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
  
  const validStatuses = new Set(["completed", "assigned", "unassigned", "cancelled"]);
  let totalStatusCount = 0;
  for (const [status, count] of Object.entries(acceptance.dispatchOrderStatusDistribution)) {
    if (!validStatuses.has(status)) {
      throw new Error(`Workload failed: unlawful status in distribution: ${status}`);
    }
    if (!Number.isFinite(count) || count < 0) {
      throw new Error(`Workload failed: invalid count for status ${status}`);
    }
    totalStatusCount += count;
  }
  if (totalStatusCount !== requiredCounts.dispatch) {
    throw new Error(`Workload failed: dispatchOrderStatusDistribution total count must be ${requiredCounts.dispatch}, got ${totalStatusCount}`);
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
