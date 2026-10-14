// SR-OPS-CAPACITY-RUNNER-20260911: exact-owned-resource polling. Query failures
// are evidence failures. The producer always joins this loop before returning.
export async function pollCapacityResources(pool, orderIds, reportIds) {
  const report = await pool.query(
    `SELECT count(*)::integer AS count FROM admin.phase1_report_jobs
     WHERE status IN ('queued', 'running') AND job_id = ANY($1::text[])`,
    [[...new Set(reportIds)]],
  );
  const dispatch = await pool.query(
    `SELECT count(*)::integer AS count FROM ops.phase1_owned_orders
     WHERE status IN ('ready_for_dispatch', 'redispatch_required', 'delayed_queue', 'exception_hold', 'preassigned')
       AND order_id = ANY($1::text[])`,
    [[...new Set(orderIds)]],
  );
  const count = (result) => {
    const value = result.rows[0]?.count;
    if (!Number.isInteger(value) || value < 0)
      throw new Error("Invalid capacity SQL count");
    return value;
  };
  return { report: count(report), dispatchable: count(dispatch) };
}

export async function runWithCapacityPolling(produce, poll, intervalMs = 2000) {
  let polling = true;
  let pollError;
  let pollFailed = false;
  const loop = (async () => {
    while (polling) {
      try {
        await poll();
      } catch (error) {
        pollFailed = true;
        pollError = error;
        break;
      }
      if (polling)
        await new Promise((resolve) => setTimeout(resolve, intervalMs));
    }
  })();
  let value;
  let producerError;
  let producerFailed = false;
  try {
    value = await produce();
  } catch (error) {
    producerFailed = true;
    producerError = error;
  } finally {
    polling = false;
    await loop;
  }
  if (producerFailed && pollFailed)
    throw new AggregateError(
      [producerError, pollError],
      "Capacity producer and SQL polling failed",
    );
  if (producerFailed) throw producerError;
  if (pollFailed) throw pollError;
  return value;
}
