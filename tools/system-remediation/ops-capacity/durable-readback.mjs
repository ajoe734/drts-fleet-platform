// SR-OPS-CAPACITY-RUNNER-20260911 (C123): independent, direct-SQL durable
// readback for the resource IDs a capacity run's HTTP responses claimed to
// have created. This is deliberately separate from the HTTP load path: it
// proves the API's "success" responses correspond to rows the platform
// actually committed, rather than trusting the HTTP layer's own account of
// itself.

const nonblank = (value) =>
  typeof value === "string" && value.trim().length > 0;
const instant = (value) =>
  value != null && Number.isFinite(new Date(value).getTime())
    ? new Date(value).toISOString()
    : null;

// Read evidence, not a derived queue projection. V0011 stores exact production
// records; jobs, attempts and traces must all belong to the same order.
export async function readBackOwnedOrders(pool, orderIds) {
  const unique = [...new Set(orderIds)];
  if (!unique.length) return [];
  const { rows } = await pool.query(
    `SELECT o.order_id, o.status, o.created_at AS order_created_at, o.record,
       a.attempt_id AS first_attempt_id, a.dispatch_job_id AS first_attempt_job_id,
       a.created_at AS first_attempt_at,
       COALESCE((SELECT jsonb_agg(x.record ORDER BY x.created_at, x.attempt_id)
         FROM ops.phase1_dispatch_attempts x JOIN ops.phase1_dispatch_jobs j
           ON j.dispatch_job_id = x.dispatch_job_id AND j.order_id = x.order_id
         WHERE x.order_id = o.order_id), '[]'::jsonb) AS attempts,
       (SELECT count(*)::integer FROM ops.phase1_dispatch_assignments x
        WHERE x.order_id = o.order_id) AS assignment_count,
       COALESCE((SELECT jsonb_agg(t.record ORDER BY t.created_at, t.trace_id)
        FROM ops.phase1_dispatch_trace_logs t WHERE t.order_id = o.order_id), '[]'::jsonb) AS traces,
       EXISTS (SELECT 1 FROM voice.command_receipt c
         JOIN voice.booking_audit_intent b ON b.command_id = c.command_id AND b.order_id = c.order_id
         WHERE c.command_id::text = o.record->>'commandId' AND c.order_id = o.order_id
           AND c.intent_id::text = o.record->>'voiceIntentId' AND c.status = 'succeeded'
           AND b.record->>'checkpointId' = o.record->>'recordingEvidenceRef') AS voice_creation_verified
     FROM ops.phase1_owned_orders o
     LEFT JOIN LATERAL (
       SELECT a.attempt_id, a.dispatch_job_id, a.created_at
       FROM ops.phase1_dispatch_attempts a
       JOIN ops.phase1_dispatch_jobs j ON j.dispatch_job_id = a.dispatch_job_id AND j.order_id = a.order_id
       WHERE a.order_id = o.order_id ORDER BY a.created_at, a.attempt_id LIMIT 1
     ) a ON true
     WHERE o.order_id = ANY($1::text[])`,
    [unique],
  );
  return rows.map((row) => {
    const attempts =
      typeof row.attempts === "string"
        ? JSON.parse(row.attempts)
        : row.attempts;
    const record =
      typeof row.record === "string" ? JSON.parse(row.record) : row.record;
    const traces =
      typeof row.traces === "string" ? JSON.parse(row.traces) : row.traces;
    const authorityKnown =
      record?.orderId === row.order_id &&
      record?.status === row.status &&
      instant(record?.createdAt) === instant(row.order_created_at) &&
      instant(row.order_created_at) !== null;
    const relevantTraces = Array.isArray(traces)
      ? traces.filter(
          (t) =>
            t.orderId === row.order_id &&
            nonblank(t.traceId) &&
            instant(t.createdAt) &&
            new Date(t.createdAt) >= new Date(row.order_created_at),
        )
      : [];
    let ready = null;
    if (authorityKnown) {
      if (record.voiceIntentId) {
        // prepareVoiceOrder is creation-ready only after the confirmed voice
        // command transaction commits. A generic recording callback is not it.
        if (
          row.voice_creation_verified === true &&
          nonblank(record.recordingId) &&
          nonblank(record.recordingEvidenceRef) &&
          nonblank(record.customerConfirmationId)
        ) {
          ready = {
            createdAt: row.order_created_at,
            eventType: "voice.booking.created",
          };
        }
      } else {
        ready = relevantTraces.find(
          (t) =>
            (t.eventType === "order.ready_for_dispatch" &&
              record.orderSource === "app") ||
            (t.eventType === "multi_taxi.order.ready_for_dispatch" &&
              record.orderSource === "app") ||
            (t.eventType === "callcenter.order_created" &&
              t.details?.recordingPending === false &&
              nonblank(t.details?.recordingId) &&
              t.details?.callId === record.callId) ||
            (t.eventType === "callcenter.recording_bound" &&
              nonblank(t.details?.recordingId) &&
              t.details?.callId === record.callId),
        );
      }
    }
    const readyAt = instant(ready?.createdAt);
    const firstAttemptAt = instant(row.first_attempt_at);
    const hasAttempt =
      nonblank(row.first_attempt_id) && nonblank(row.first_attempt_job_id);
    const lagMs =
      hasAttempt && readyAt && firstAttemptAt
        ? new Date(firstAttemptAt).getTime() - new Date(readyAt).getTime()
        : null;
    return {
      orderId: row.order_id,
      status: row.status,
      createdAt: instant(row.order_created_at),
      authorityKnown,
      readyAt,
      readySource: ready?.eventType ?? null,
      hasAttempt,
      firstAttemptAt,
      firstAttemptId: row.first_attempt_id ?? null,
      firstAttemptJobId: row.first_attempt_job_id ?? null,
      assignmentCount: row.assignment_count,
      attempts: attempts ?? [],
      record,
      traces: relevantTraces,
      lagMs,
    };
  });
}

// A reason is valid only when the durable lifecycle record and the correlated
// production trace agree. Status alone (or an ID string) is never a reason.
export function lawfulReasonForOrder(row) {
  if (
    !row.authorityKnown ||
    row.record?.orderId !== row.orderId ||
    row.record?.status !== row.status ||
    !Array.isArray(row.traces) ||
    !Number.isInteger(row.assignmentCount) ||
    row.assignmentCount !== 0
  )
    return null;
  const order = row.record;
  if (
    row.status === "recording_pending" &&
    !row.hasAttempt &&
    !row.readyAt &&
    order.orderSource === "phone" &&
    !order.voiceIntentId &&
    !order.recordingId &&
    Array.isArray(order.complianceFlags) &&
    order.complianceFlags.includes("recording_pending")
  ) {
    const trace = row.traces.find(
      (t) =>
        t.orderId === row.orderId &&
        nonblank(t.traceId) &&
        instant(t.createdAt) &&
        t.eventType === "callcenter.order_created" &&
        t.details?.recordingPending === true &&
        t.details?.callId === order.callId &&
        nonblank(order.callId),
    );
    if (trace)
      return {
        orderId: row.orderId,
        status: row.status,
        reasonCode: "recording_pending",
        traceId: trace.traceId,
        source: trace.eventType,
        observedAt: instant(trace.createdAt),
      };
  }
  if (
    ["delayed_queue", "no_supply"].includes(row.status) &&
    row.hasAttempt &&
    row.readyAt &&
    row.firstAttemptAt &&
    Number.isFinite(row.lagMs) &&
    row.lagMs >= 0
  ) {
    const escalation = order.noSupplyEscalation;
    const delayed = row.status === "delayed_queue";
    const source = delayed
      ? "dispatch.no_supply_delayed"
      : "dispatch.no_supply_escalated";
    const action = delayed ? "move_to_delayed_queue" : "escalate_to_ops";
    const queue = delayed ? "delayed_retry_queue" : "manual_review_queue";
    const reason = delayed
      ? "no_supply_delayed_retry"
      : "no_supply_escalated_to_ops";
    const trace = row.traces.find(
      (t) =>
        t.orderId === row.orderId &&
        nonblank(t.traceId) &&
        instant(t.createdAt) &&
        t.eventType === source &&
        t.details?.dispatchJobId === escalation?.dispatchJobId &&
        t.details?.reasonCode === order.lastDispatchFailureReason &&
        nonblank(t.details?.reasonCode) &&
        t.details?.escalationAction === action &&
        t.details?.attemptCount === escalation?.attemptCount,
    );
    if (
      trace &&
      escalation?.orderId === row.orderId &&
      nonblank(escalation.dispatchJobId) &&
      escalation.escalationAction === action &&
      escalation.resolvedAt === null &&
      Number.isInteger(escalation.attemptCount) &&
      escalation.attemptCount > 0 &&
      order.dispatchAttemptCount === escalation.attemptCount &&
      order.queueFamily === queue &&
      order.queueEntryReason === reason &&
      instant(escalation.lastAttemptAt) &&
      new Date(trace.createdAt) >= new Date(escalation.lastAttemptAt) &&
      row.attempts?.some(
        (a) =>
          a.orderId === row.orderId &&
          a.dispatchJobId === escalation.dispatchJobId &&
          a.outcome === "failed" &&
          a.reasonCode === order.lastDispatchFailureReason &&
          instant(a.createdAt) === instant(escalation.lastAttemptAt),
      )
    ) {
      return {
        orderId: row.orderId,
        status: row.status,
        reasonCode: order.lastDispatchFailureReason,
        traceId: trace.traceId,
        dispatchJobId: escalation.dispatchJobId,
        source,
        observedAt: instant(trace.createdAt),
      };
    }
  }
  if (
    row.status === "exception_hold" &&
    row.hasAttempt &&
    row.readyAt &&
    row.assignmentCount === 0 &&
    order.reservationHoldStatus === "exception_hold" &&
    order.exceptionHold?.resolvedAt == null
  ) {
    const hold = order.exceptionHold;
    const trace = row.traces.find(
      (t) =>
        t.orderId === row.orderId &&
        nonblank(t.traceId) &&
        instant(t.createdAt) &&
        t.eventType === "order.exception_hold" &&
        t.details?.dispatchJobId === hold?.dispatchJobId &&
        t.details?.reasonCode === hold?.reasonCode &&
        nonblank(hold?.reasonCode) &&
        t.details?.exceptionHoldCriteria?.isReservation === true &&
        t.details?.exceptionHoldCriteria?.isWithinConfirmationWindow === true &&
        t.details?.exceptionHoldCriteria?.hasEligibleSupply === false,
    );
    if (trace)
      return {
        orderId: row.orderId,
        status: row.status,
        reasonCode: hold.reasonCode,
        traceId: trace.traceId,
        dispatchJobId: hold.dispatchJobId,
        source: trace.eventType,
        observedAt: instant(trace.createdAt),
      };
  }
  return null;
}

export function summarizeDispatchEvidence(rows) {
  const coverage = {
    attempted: 0,
    unattemptedLawful: 0,
    unattemptedUnlawful: 0,
    unattemptedLawfulReasons: [],
  };
  const distribution = {};
  const reasons = [];
  const unsafeOrderIds = [];
  for (const row of rows) {
    distribution[row.status] = (distribution[row.status] ?? 0) + 1;
    const reason = lawfulReasonForOrder(row);
    if (row.hasAttempt) coverage.attempted++;
    else if (reason) {
      coverage.unattemptedLawful++;
      coverage.unattemptedLawfulReasons.push(reason);
    } else coverage.unattemptedUnlawful++;
    if (reason) reasons.push(reason);
    if (
      !row.authorityKnown ||
      row.record?.orderId !== row.orderId ||
      row.record?.status !== row.status ||
      row.hasAttempt !==
        (nonblank(row.firstAttemptId) && nonblank(row.firstAttemptJobId)) ||
      (!row.hasAttempt && row.firstAttemptAt != null) ||
      ([
        "recording_pending",
        "delayed_queue",
        "no_supply",
        "exception_hold",
      ].includes(row.status) &&
        !reason) ||
      (row.hasAttempt &&
        (!nonblank(row.readySource) ||
          !row.readyAt ||
          !row.firstAttemptAt ||
          !Number.isFinite(row.lagMs) ||
          row.lagMs < 0))
    ) {
      unsafeOrderIds.push(row.orderId);
    }
  }
  return {
    coverage,
    distribution,
    degradation: {
      isLawful: unsafeOrderIds.length === 0,
      reasons,
      unsafeOrderIds,
    },
  };
}

export async function readBackReportJobs(pool, jobIds) {
  const unique = [...new Set(jobIds)];
  if (unique.length === 0) {
    return [];
  }
  // Only the first actual worker start is queue-lag authority; legacy absence stays missing.
  const { rows } = await pool.query(
    `SELECT job_id, status, created_at, updated_at, record->>'startedAt' as started_at
       FROM admin.phase1_report_jobs
      WHERE job_id = ANY($1::text[])`,
    [unique],
  );
  return rows.map((row) => {
    let queueLagMs = null;
    if (row.started_at) {
      queueLagMs =
        new Date(row.started_at).getTime() - new Date(row.created_at).getTime();
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

  if (
    !acceptance.concurrency ||
    !Number.isInteger(acceptance.concurrency.intake) ||
    acceptance.concurrency.intake < 50 ||
    !Number.isInteger(acceptance.concurrency.report) ||
    acceptance.concurrency.report < 50 ||
    !acceptance.backlog ||
    !Number.isInteger(acceptance.backlog.dispatchable) ||
    acceptance.backlog.dispatchable < 500 ||
    !acceptance.degradation ||
    acceptance.degradation.isLawful !== true
  ) {
    throw new Error(
      `Workload failed: missing genuine concurrency/backlog/degradation measurements or values insufficient`,
    );
  }

  if (
    !acceptance.queueLag ||
    !acceptance.queueLag.report ||
    !acceptance.queueLag.dispatchOrderQueueLag
  ) {
    throw new Error(`Workload failed: missing queueLag evidence`);
  }

  const checkLagConsistency = (lag, exactCount) => {
    if (!Number.isInteger(lag.count) || lag.count <= 0) return false;
    if (exactCount !== undefined && lag.count !== exactCount) return false;
    return (
      Number.isFinite(lag.minMs) &&
      lag.minMs >= 0 &&
      Number.isFinite(lag.maxMs) &&
      lag.maxMs >= 0 &&
      Number.isFinite(lag.avgMs) &&
      lag.avgMs >= 0 &&
      Number.isFinite(lag.p95Ms) &&
      lag.p95Ms >= 0 &&
      lag.minMs <= lag.maxMs &&
      lag.avgMs >= lag.minMs &&
      lag.avgMs <= lag.maxMs &&
      lag.p95Ms >= lag.minMs &&
      lag.p95Ms <= lag.maxMs
    );
  };

  // Report queue lag MUST be measurable and consistent for all reports.
  if (!checkLagConsistency(acceptance.queueLag.report, requiredCounts.report)) {
    throw new Error(
      `Workload failed: invalid or missing report queueLag measurements (expected ${requiredCounts.report}, got ${acceptance.queueLag.report.count})`,
    );
  }
  if (acceptance.queueLag.report.maxMs > 300000) {
    throw new Error(
      `Workload failed: report queueLag maxMs exceeded 5m target, got ${acceptance.queueLag.report.maxMs}`,
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
    "exception_hold",
  ]);
  let totalStatusCount = 0;
  for (const [status, count] of Object.entries(
    acceptance.dispatchOrderStatusDistribution,
  )) {
    if (!validStatuses.has(status)) {
      throw new Error(
        `Workload failed: unlawful status in distribution: ${status}`,
      );
    }
    if (!Number.isInteger(count) || count < 0) {
      throw new Error(`Workload failed: invalid count for status ${status}`);
    }
    totalStatusCount += count;
  }
  if (totalStatusCount !== requiredCounts.dispatch) {
    throw new Error(
      `Workload failed: dispatchOrderStatusDistribution total count must be ${requiredCounts.dispatch}, got ${totalStatusCount}`,
    );
  }

  if (!acceptance.dispatchAttemptCoverage) {
    throw new Error(`Workload failed: missing dispatchAttemptCoverage`);
  }
  const {
    attempted,
    unattemptedLawful,
    unattemptedUnlawful,
    unattemptedLawfulReasons,
  } = acceptance.dispatchAttemptCoverage;

  if (!Number.isInteger(unattemptedUnlawful) || unattemptedUnlawful < 0) {
    throw new Error(`Workload failed: invalid unattemptedUnlawful count`);
  }
  if (!Number.isInteger(unattemptedLawful) || unattemptedLawful < 0) {
    throw new Error(`Workload failed: invalid unattemptedLawful count`);
  }
  if (!Number.isInteger(attempted) || attempted < 0) {
    throw new Error(`Workload failed: invalid attempted count`);
  }

  if (unattemptedUnlawful > 0) {
    throw new Error(
      `Workload failed: ${unattemptedUnlawful} items missing attempts without lawful status`,
    );
  }
  if (attempted + unattemptedLawful !== totalStatusCount) {
    throw new Error(
      `Workload failed: attempt coverage does not match total status count`,
    );
  }

  const ids = acceptance.dispatchOrderIds;
  const evidence = acceptance.dispatchEvidence;
  if (
    !Array.isArray(ids) ||
    ids.length !== requiredCounts.dispatch ||
    ids.some((id) => !nonblank(id)) ||
    new Set(ids).size !== ids.length ||
    !Array.isArray(evidence) ||
    evidence.length !== ids.length ||
    new Set(evidence.map((row) => row.orderId)).size !== ids.length ||
    evidence.some((row) => !ids.includes(row.orderId))
  ) {
    throw new Error(
      "Workload failed: missing, duplicate or unrelated dispatch resource evidence",
    );
  }
  const observed = summarizeDispatchEvidence(evidence);
  const equal = (a, b) => JSON.stringify(a) === JSON.stringify(b);
  for (const status of new Set([
    ...Object.keys(observed.distribution),
    ...statuses,
  ])) {
    if (
      (observed.distribution[status] ?? 0) !==
      (acceptance.dispatchOrderStatusDistribution[status] ?? 0)
    ) {
      throw new Error(
        "Workload failed: resource statuses conflict with distribution",
      );
    }
  }
  if (
    attempted !== observed.coverage.attempted ||
    unattemptedLawful !== observed.coverage.unattemptedLawful ||
    unattemptedUnlawful !== observed.coverage.unattemptedUnlawful ||
    !equal(unattemptedLawfulReasons, observed.coverage.unattemptedLawfulReasons)
  ) {
    throw new Error(
      "Workload failed: purported lawful remainders lack correlated resource reason evidence",
    );
  }
  if (
    !observed.degradation.isLawful ||
    !equal(acceptance.degradation, observed.degradation)
  ) {
    throw new Error(
      "Workload failed: unlawful or unknown resource readiness/safety/degradation evidence",
    );
  }
  if (
    !equal(
      acceptance.queueLag.dispatchOrderQueueLag,
      summarizeLag(evidence, "lagMs"),
    )
  ) {
    throw new Error(
      "Workload failed: dispatch lag does not match actual resource measurements",
    );
  }

  const expectedDispatchLagCount = attempted;

  // Dispatch queue lag must have at least some samples, but may not be 4500 if some remain unassigned/queued lawfully.
  if (
    (expectedDispatchLagCount > 0 &&
      acceptance.queueLag.dispatchOrderQueueLag.count <= 0) ||
    !checkLagConsistency(
      acceptance.queueLag.dispatchOrderQueueLag,
      expectedDispatchLagCount,
    )
  ) {
    throw new Error(
      `Workload failed: invalid or missing dispatch queueLag measurements (expected ${expectedDispatchLagCount}, got ${acceptance.queueLag.dispatchOrderQueueLag.count})`,
    );
  }

  if (acceptance.queueLag.dispatchOrderQueueLag.p95Ms > 60000) {
    throw new Error(
      `Workload failed: dispatch queueLag p95Ms exceeded 60s target, got ${acceptance.queueLag.dispatchOrderQueueLag.p95Ms}`,
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
