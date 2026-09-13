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
    lagMs: new Date(row.updated_at).getTime() - new Date(row.created_at).getTime(),
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
    queueLagMs: new Date(row.updated_at).getTime() - new Date(row.created_at).getTime(),
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
