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
    `SELECT order_id, status, created_at, updated_at
       FROM ops.phase1_owned_orders
      WHERE order_id = ANY($1::text[])`,
    [unique],
  );
  return rows.map((row) => ({
    orderId: row.order_id,
    status: row.status,
    createdAt: row.created_at,
    updatedAt: row.updated_at,
    lagMs:
      new Date(row.updated_at).getTime() - new Date(row.created_at).getTime(),
  }));
}

export async function readBackReportJobs(pool, jobIds) {
  const unique = [...new Set(jobIds)];
  if (unique.length === 0) {
    return [];
  }
  const { rows } = await pool.query(
    `SELECT job_id, status, created_at, updated_at
       FROM admin.phase1_report_jobs
      WHERE job_id = ANY($1::text[])`,
    [unique],
  );
  return rows.map((row) => ({
    jobId: row.job_id,
    status: row.status,
    createdAt: row.created_at,
    updatedAt: row.updated_at,
    queueLagMs:
      new Date(row.updated_at).getTime() - new Date(row.created_at).getTime(),
  }));
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

  if (typeof summary.elapsedMs !== "number" || summary.elapsedMs < 890000) {
    throw new Error(
      `Workload failed: invalid elapsedMs, must be at least 890000 for a 900s run, got ${summary.elapsedMs}`,
    );
  }

  if (typeof summary.maxInFlight !== "number" || summary.maxInFlight <= 0) {
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

  if (
    !acceptance.queueLag ||
    !acceptance.queueLag.report ||
    !acceptance.queueLag.dispatchOrderWriteLag
  ) {
    throw new Error(`Workload failed: missing queueLag evidence`);
  }

  if (
    typeof acceptance.queueLag.report.avgMs !== "number" ||
    acceptance.queueLag.report.avgMs < 0 ||
    typeof acceptance.queueLag.dispatchOrderWriteLag.avgMs !== "number" ||
    acceptance.queueLag.dispatchOrderWriteLag.avgMs < 0
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
      typeof workload.p95Ms !== "number" ||
      workload.p95Ms <= 0 ||
      workload.p95Ms > expectedTargets[family].p95Ms
    ) {
      throw new Error(
        `Workload failed: ${family} p95 latency missing, invalid, or exceeded target`,
      );
    }

    if (expectedTargets[family].p99Ms !== undefined) {
      if (
        typeof workload.p99Ms !== "number" ||
        workload.p99Ms <= 0 ||
        workload.p99Ms > expectedTargets[family].p99Ms
      ) {
        throw new Error(
          `Workload failed: ${family} p99 latency missing, invalid, or exceeded target`,
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
