import { describe, expect, it } from "vitest";
import {
  assertAcceptancePassed,
  summarizeDispatchEvidence,
} from "../../../../tools/system-remediation/ops-capacity/durable-readback.mjs";

describe("SR-OPS-CAPACITY-RUNNER-20260911 acceptance gate", () => {
  it("rejects a genuine 900s baseline payload that failed due to 112 HTTP 429s (24/74/14 error summary)", () => {
    const failedAcceptance = {
      taskId: "SR-OPS-CAPACITY-RUNNER-20260911",
      capability: "C123",
      runTag: "sr-ops-capacity-1791783190141",
      candidateSha: "73ba9d0084bd04a0c83f618554fecef1bc170230",
      workflowSha: "73ba9d0084bd04a0c83f618554fecef1bc170230",
      summary: {
        taskId: "SR-OPS-PROOF-001",
        kind: "capacity_summary",
        durationSeconds: 900,
        fullBurstSchedule: true,
        elapsedMs: 899813.017298,
        maxInFlight: 500,
        workflows: {
          booking: {
            requests: 900,
            errors: 24,
            p95Ms: 15.2,
            p99Ms: 22.4,
            targets: { perMinute: 60, p95Ms: 2000, p99Ms: 5000 },
            latencyTargetsMet: true,
          },
          dispatch: {
            requests: 4500,
            errors: 74,
            p95Ms: 18.5,
            p99Ms: 25.1,
            targets: { perMinute: 300, p95Ms: 10000 },
            latencyTargetsMet: true,
          },
          report: {
            requests: 450,
            errors: 14,
            p95Ms: 21.3,
            p99Ms: 28.7,
            targets: { perMinute: 30, p95Ms: 5000 },
            latencyTargetsMet: true,
          },
        },
        result: "failed",
        acceptance: "not_established",
      },
      readback: {
        booking: {
          expectedCount: 876,
          foundCount: 876,
          missing: [],
          matched: true,
        },
        dispatch: {
          expectedCount: 4426,
          foundCount: 4426,
          missing: [],
          matched: true,
        },
        report: {
          expectedCount: 436,
          foundCount: 436,
          missing: [],
          matched: true,
        },
      },
    };

    expect(() => assertAcceptancePassed(failedAcceptance)).toThrowError(
      /Workload failed: failed/,
    );
  });

  const validAcceptance = {
    runTag: "synthetic-valid-capacity",
    summary: {
      startedAt: "2026-10-12T00:00:00.000Z",
      endedAt: "2026-10-12T00:14:59.800Z",
      result: "measurements_within_targets",
      durationSeconds: 900,
      fullBurstSchedule: true,
      elapsedMs: 899800, // elapsedMs must be at least 899800 for a 900s run
      maxInFlight: 500, // Valid configuration value
      workflows: {
        booking: {
          requests: 900,
          errors: 0,
          arrivals: {
            count: 900,
            firstMs: 0,
            lastMs: 899000,
            early: 0,
            late: 0,
          },
          p95Ms: 15.2,
          p99Ms: 22.4,
          latencyTargetsMet: true,
        },
        dispatch: {
          requests: 4500,
          errors: 0,
          arrivals: {
            count: 4500,
            firstMs: 0,
            lastMs: 899800,
            early: 0,
            late: 0,
          },
          p95Ms: 18.5,
          p99Ms: 25.1,
          latencyTargetsMet: true,
        },
        report: {
          requests: 450,
          errors: 0,
          arrivals: {
            count: 450,
            firstMs: 0,
            lastMs: 898000,
            early: 0,
            late: 0,
          },
          p95Ms: 21.3,
          p99Ms: 28.7,
          latencyTargetsMet: true,
        },
      },
    },
    concurrency: {
      intake: 50,
      report: 50,
    },
    backlog: {
      dispatchable: 500,
    },
    degradation: {
      isLawful: true,
      reasons: [],
      unsafeOrderIds: [],
    },
    queueLag: {
      report: {
        count: 450,
        minMs: 1000,
        maxMs: 1000,
        avgMs: 1000,
        p95Ms: 1000,
      },
      dispatchOrderQueueLag: {
        count: 4500,
        minMs: 1000,
        maxMs: 1000,
        avgMs: 1000,
        p95Ms: 1000,
      },
    },
    dispatchOrderIds: Array.from({ length: 4500 }, (_, i) => `order-${i}`),
    dispatchEvidence: Array.from({ length: 4500 }, (_, i) => ({
      orderId: `order-${i}`,
      status: "completed",
      createdAt: "2026-10-12T00:00:00.000Z",
      authorityKnown: true,
      readyAt: "2026-10-12T00:00:00.000Z",
      readySource: "order.ready_for_dispatch",
      hasAttempt: true,
      firstAttemptAt: "2026-10-12T00:00:01.000Z",
      firstAttemptId: `attempt-${i}`,
      firstAttemptJobId: `job-${i}`,
      assignmentCount: 1,
      lagMs: 1000,
      record: {
        orderId: `order-${i}`,
        status: "completed",
        orderSource: "app",
        createdAt: "2026-10-12T00:00:00.000Z",
      },
      traces: [
        {
          orderId: `order-${i}`,
          traceId: `ready-${i}`,
          eventType: "order.ready_for_dispatch",
          createdAt: "2026-10-12T00:00:00.000Z",
          details: {},
        },
      ],
      attempts: [],
    })),
    dispatchOrderStatusDistribution: { completed: 4500 } as Record<
      string,
      number
    >,
    dispatchAttemptCoverage: {
      attempted: 4500,
      unattemptedLawful: 0,
      unattemptedUnlawful: 0,
      unattemptedLawfulReasons: [],
    },
    readback: {
      booking: {
        expectedCount: 900,
        foundCount: 900,
        missing: [],
        matched: true,
      },
      dispatch: {
        expectedCount: 4500,
        foundCount: 4500,
        missing: [],
        matched: true,
      },
      report: {
        expectedCount: 450,
        foundCount: 450,
        missing: [],
        matched: true,
      },
    },
    reportWorkload: {
      initialJobIds: Array.from(
        { length: 50 },
        (_, i) => `initial-report-${i}`,
      ),
      measuredJobIds: Array.from(
        { length: 450 },
        (_, i) => `measured-report-${i}`,
      ),
      initialSnapshotAt: "2026-10-12T00:00:00.500Z",
      initialSnapshot: Array.from({ length: 50 }, (_, i) => ({
        jobId: `initial-report-${i}`,
        status: "queued",
        createdAt: "2026-10-12T00:00:00.100Z",
        updatedAt: "2026-10-12T00:00:00.100Z",
        startedAt: null,
        queueLagMs: null,
        record: {
          jobId: `initial-report-${i}`,
          status: "queued",
          createdAt: "2026-10-12T00:00:00.100Z",
          updatedAt: "2026-10-12T00:00:00.100Z",
          filters: {
            runTag: "synthetic-valid-capacity",
            capacityRole: "initial_backlog",
          },
        },
      })),
      initialEvidence: Array.from({ length: 50 }, (_, i) => ({
        jobId: `initial-report-${i}`,
        status: "completed",
        createdAt: "2026-10-12T00:00:00.100Z",
        startedAt: "2026-10-12T00:00:01.100Z",
        updatedAt: "2026-10-12T00:00:02.100Z",
        queueLagMs: 1000,
        record: {
          jobId: `initial-report-${i}`,
          status: "completed",
          createdAt: "2026-10-12T00:00:00.100Z",
          startedAt: "2026-10-12T00:00:01.100Z",
          updatedAt: "2026-10-12T00:00:02.100Z",
          filters: {
            runTag: "synthetic-valid-capacity",
            capacityRole: "initial_backlog",
          },
          artifact: { artifactId: `initial-artifact-${i}` },
        },
      })),
      measuredEvidence: Array.from({ length: 450 }, (_, i) => ({
        jobId: `measured-report-${i}`,
        status: "completed",
        createdAt: "2026-10-12T00:00:00.100Z",
        startedAt: "2026-10-12T00:00:01.100Z",
        updatedAt: "2026-10-12T00:00:02.100Z",
        queueLagMs: 1000,
        record: {
          jobId: `measured-report-${i}`,
          status: "completed",
          createdAt: "2026-10-12T00:00:00.100Z",
          startedAt: "2026-10-12T00:00:01.100Z",
          updatedAt: "2026-10-12T00:00:02.100Z",
          filters: { runTag: "synthetic-valid-capacity" },
          artifact: { artifactId: `measured-artifact-${i}` },
        },
      })),
    },
  };

  it("passes a valid full schedule summary with zero errors and perfect readback", () => {
    expect(() => assertAcceptancePassed(validAcceptance)).not.toThrow();
  });

  it.each(["booking", "dispatch", "report"] as const)(
    "%s requires complete finite actual arrival measurements inside900s even with a green summary",
    (family) => {
      const valid = validAcceptance.summary.workflows[family].arrivals;
      for (const arrivals of [
        undefined,
        {},
        { ...valid, count: valid.count - 1 },
        { ...valid, firstMs: NaN },
        { ...valid, firstMs: -1 },
        { ...valid, firstMs: valid.lastMs + 1 },
        { ...valid, lastMs: Infinity },
        { ...valid, lastMs: 900000 },
        { ...valid, lastMs: 1800000 },
        { ...valid, early: 1 },
        { ...valid, late: 1 },
        { ...valid, late: NaN },
      ]) {
        const payload = {
          ...validAcceptance,
          summary: {
            ...validAcceptance.summary,
            workflows: {
              ...validAcceptance.summary.workflows,
              [family]: {
                ...validAcceptance.summary.workflows[family],
                arrivals,
              },
            },
          },
        };
        expect(() => assertAcceptancePassed(payload)).toThrow(
          /arrival measurements/,
        );
      }
    },
  );

  it("accepts lawful async processing after the900s arrival window within5min/30min job SLOs", () => {
    const valid = structuredClone(validAcceptance);
    const row = valid.reportWorkload.measuredEvidence[0]!;
    row.createdAt = row.record.createdAt = "2026-10-12T00:14:00.100Z";
    row.startedAt = row.record.startedAt = "2026-10-12T00:18:20.100Z";
    row.updatedAt = row.record.updatedAt = "2026-10-12T00:20:00.100Z";
    row.queueLagMs = 260000;
    valid.queueLag.report.maxMs = 260000;
    valid.queueLag.report.avgMs = (449 * 1000 + 260000) / 450;
    expect(() => assertAcceptancePassed(valid)).not.toThrow();
  });

  it.each([
    "missing",
    "foreign",
    "duplicate",
    "overlap",
    "drained",
    "unstarted",
    "failed",
    "late-start",
    "late-completion",
    "outside-window",
    "forged-lag",
    "summary-lag",
  ])(
    "rejects %s report backlog/processing evidence rather than trusting a50 count",
    (defect) => {
      const invalid = structuredClone(validAcceptance);
      const workload = invalid.reportWorkload;
      const row = workload.initialEvidence[0]!;
      if (defect === "missing") workload.initialEvidence.pop();
      if (defect === "foreign") row.record.filters.runTag = "another-run";
      if (defect === "duplicate")
        workload.initialEvidence[1] = structuredClone(row);
      if (defect === "overlap")
        workload.measuredJobIds[0] = workload.initialJobIds[0]!;
      if (defect === "drained") {
        workload.initialSnapshot[0]!.status = "completed";
        workload.initialSnapshot[0]!.record.status = "completed";
      }
      if (defect === "unstarted") {
        row.startedAt = "";
        row.record.startedAt = "";
      }
      if (defect === "failed") {
        row.status = "failed";
        row.record.status = "failed";
      }
      if (defect === "late-start") {
        row.startedAt = row.record.startedAt = "2026-10-12T00:06:00.100Z";
        row.updatedAt = row.record.updatedAt = "2026-10-12T00:06:01.100Z";
        row.queueLagMs = 360000;
      }
      if (defect === "late-completion")
        row.updatedAt = row.record.updatedAt = "2026-10-12T00:31:00.100Z";
      if (defect === "outside-window")
        workload.initialSnapshotAt = "2026-10-11T23:59:59.000Z";
      if (defect === "forged-lag") row.queueLagMs = 5;
      if (defect === "summary-lag") {
        // Internally consistent, but disagrees with all450 actual SQL rows.
        invalid.queueLag.report = {
          count: 450,
          minMs: 999,
          maxMs: 999,
          avgMs: 999,
          p95Ms: 999,
        };
      }
      expect(() => assertAcceptancePassed(invalid)).toThrow(/Report /);
    },
  );

  it("rejects when measurements are absent", () => {
    const invalid = structuredClone(validAcceptance);
    delete (invalid.summary as any).workflows;
    expect(() => assertAcceptancePassed(invalid)).toThrowError(
      /Workload failed: missing workload measurements for booking/,
    );
  });

  it("rejects when duration is not 900s", () => {
    const invalid = structuredClone(validAcceptance);
    invalid.summary.durationSeconds = 899;
    expect(() => assertAcceptancePassed(invalid)).toThrowError(
      /Workload failed: duration must be exactly 900s/,
    );
  });

  it("rejects when not a full burst schedule", () => {
    const invalid = structuredClone(validAcceptance);
    invalid.summary.fullBurstSchedule = false;
    expect(() => assertAcceptancePassed(invalid)).toThrowError(
      /Workload failed: must be full burst schedule/,
    );
  });

  it("rejects when request counts do not match requirements", () => {
    const invalid = structuredClone(validAcceptance);
    invalid.summary.workflows.booking.requests = 899;
    expect(() => assertAcceptancePassed(invalid)).toThrowError(
      /Workload failed: booking requires 900 requests/,
    );
  });

  it("rejects when readback counts do not match request counts", () => {
    const invalid = structuredClone(validAcceptance);
    invalid.readback.booking.expectedCount = 899;
    invalid.readback.booking.foundCount = 899;
    expect(() => assertAcceptancePassed(invalid)).toThrowError(
      /booking readback failed: expected and found count must be 900/,
    );
  });

  it("rejects when latency is null", () => {
    const invalid = structuredClone(validAcceptance);
    (invalid.summary.workflows.booking as any).p95Ms = null;
    expect(() => assertAcceptancePassed(invalid)).toThrowError(
      /Workload failed: booking p95 latency missing, invalid, or exceeded target/,
    );
  });

  it("rejects when latency is beyond target", () => {
    const invalid = structuredClone(validAcceptance);
    invalid.summary.workflows.booking.p95Ms = 2001;
    expect(() => assertAcceptancePassed(invalid)).toThrowError(
      /Workload failed: booking p95 latency missing, invalid, or exceeded target/,
    );
  });

  it("rejects when there are errors even if result is marked valid", () => {
    const invalid = structuredClone(validAcceptance);
    invalid.summary.workflows.booking.errors = 1;
    expect(() => assertAcceptancePassed(invalid)).toThrowError(
      /Workload failed: booking requires zero errors/,
    );
  });

  it("rejects when latencyTargetsMet is false", () => {
    const invalid = structuredClone(validAcceptance);
    invalid.summary.workflows.booking.latencyTargetsMet = false;
    expect(() => assertAcceptancePassed(invalid)).toThrowError(
      /Workload failed: booking latency targets not met/,
    );
  });

  it("rejects when readback has missing records", () => {
    const invalid = structuredClone(validAcceptance);
    (invalid.readback.booking as any).missing = ["some-id"];
    expect(() => assertAcceptancePassed(invalid)).toThrowError(
      /booking readback failed: missing 1 claimed success resources/,
    );
  });

  it("rejects when matched flag is false", () => {
    const invalid = structuredClone(validAcceptance);
    invalid.readback.booking.matched = false;
    expect(() => assertAcceptancePassed(invalid)).toThrowError(
      /booking readback failed: matched flag is false/,
    );
  });

  it("rejects when elapsedMs is absent or too low", () => {
    const invalid = structuredClone(validAcceptance);
    invalid.summary.elapsedMs = 1;
    expect(() => assertAcceptancePassed(invalid)).toThrowError(
      /invalid elapsedMs/,
    );
  });

  it("rejects when maxInFlight is zero", () => {
    const invalid = structuredClone(validAcceptance);
    invalid.summary.maxInFlight = 0;
    expect(() => assertAcceptancePassed(invalid)).toThrowError(
      /invalid maxInFlight/,
    );
  });

  it("rejects when queueLag is missing or avgMs is null", () => {
    const invalid = structuredClone(validAcceptance);
    (invalid.queueLag.report as any).avgMs = null;
    expect(() => assertAcceptancePassed(invalid)).toThrowError(
      /invalid or missing report queueLag measurements/,
    );
  });

  it("rejects when dispatchOrderStatusDistribution is empty", () => {
    const invalid = structuredClone(validAcceptance);
    invalid.dispatchOrderStatusDistribution = {} as any;
    expect(() => assertAcceptancePassed(invalid)).toThrowError(
      /dispatchOrderStatusDistribution is empty/,
    );
  });

  it("rejects negative latency measurements", () => {
    const invalid = structuredClone(validAcceptance);
    invalid.summary.workflows.booking.p95Ms = -1;
    expect(() => assertAcceptancePassed(invalid)).toThrowError(/invalid/);
  });

  it("rejects invented empty or unrelated lawful reasons from adjacent rejected candidates", () => {
    for (const reasons of [
      Array(4499).fill(""),
      Array(4499).fill("unrelated-id"),
    ]) {
      const degraded = structuredClone(validAcceptance);
      degraded.dispatchOrderStatusDistribution = {
        completed: 1,
        delayed_queue: 4499,
      };
      const invalid = {
        ...degraded,
        dispatchAttemptCoverage: {
          attempted: 1,
          unattemptedLawful: 4499,
          unattemptedUnlawful: 0,
          unattemptedLawfulReasons: reasons,
        },
      };
      invalid.queueLag.dispatchOrderQueueLag = {
        count: 1,
        minMs: 0,
        maxMs: 0,
        avgMs: 0,
        p95Ms: 0,
      };
      expect(() => assertAcceptancePassed(invalid)).toThrow(/resource|reason/);
    }
  });

  it("rejects a duplicate or unrelated resource even when all aggregate counts agree", () => {
    const invalid = structuredClone(validAcceptance);
    invalid.dispatchEvidence[1]!.orderId = invalid.dispatchEvidence[0]!.orderId;
    expect(() => assertAcceptancePassed(invalid)).toThrow(
      /duplicate or unrelated/,
    );
    invalid.dispatchEvidence[1]!.orderId = "outside-this-run";
    expect(() => assertAcceptancePassed(invalid)).toThrow(
      /duplicate or unrelated/,
    );
  });

  it("rejects missing readiness without relabeling an actual attempt as lawful unattempted", () => {
    const invalid = structuredClone(validAcceptance);
    Object.assign(invalid.dispatchEvidence[0]!, { readyAt: null, lagMs: null });
    expect(() => assertAcceptancePassed(invalid)).toThrow(/readiness/);
  });

  it("rejects fabricated ready authority, lag values, and an unrelated readiness trace", () => {
    for (const mutate of [
      (row: (typeof validAcceptance.dispatchEvidence)[number]) => {
        row.readySource = "unknown";
      },
      (row: (typeof validAcceptance.dispatchEvidence)[number]) => {
        row.lagMs = 1;
      },
      (row: (typeof validAcceptance.dispatchEvidence)[number]) => {
        row.traces[0]!.orderId = "unrelated-order";
      },
    ]) {
      const invalid = structuredClone(validAcceptance);
      mutate(invalid.dispatchEvidence[0]!);
      expect(() => assertAcceptancePassed(invalid)).toThrow(/readiness|safety/);
    }
  });

  it("accepts a correlated recording-gated remainder and rejects unsafe assignment or missing reason trace", () => {
    const evidence = structuredClone(validAcceptance.dispatchEvidence);
    Object.assign(evidence[0]!, {
      status: "recording_pending",
      hasAttempt: false,
      firstAttemptAt: null,
      firstAttemptId: null,
      firstAttemptJobId: null,
      readyAt: null,
      readySource: null,
      lagMs: null,
      assignmentCount: 0,
      record: {
        orderId: "order-0",
        createdAt: "2026-10-12T00:00:00.000Z",
        status: "recording_pending",
        orderSource: "phone",
        callId: "call-0",
        recordingId: null,
        complianceFlags: ["recording_pending"],
      },
      traces: [
        {
          orderId: "order-0",
          traceId: "gate-trace",
          eventType: "callcenter.order_created",
          createdAt: "2026-10-12T00:00:00.000Z",
          details: { callId: "call-0", recordingPending: true },
        },
      ],
    });
    const facts = summarizeDispatchEvidence(evidence);
    const degraded = {
      ...structuredClone(validAcceptance),
      dispatchEvidence: evidence,
      dispatchOrderStatusDistribution: facts.distribution,
      dispatchAttemptCoverage: facts.coverage,
      degradation: facts.degradation,
      queueLag: {
        ...validAcceptance.queueLag,
        dispatchOrderQueueLag: {
          count: 4499,
          minMs: 1000,
          maxMs: 1000,
          avgMs: 1000,
          p95Ms: 1000,
        },
      },
    };
    expect(() => assertAcceptancePassed(degraded)).not.toThrow();
    evidence[0]!.assignmentCount = 1;
    expect(() => assertAcceptancePassed(degraded)).toThrow(/reason|safety/);
    evidence[0]!.assignmentCount = 0;
    evidence[0]!.traces = [];
    expect(() => assertAcceptancePassed(degraded)).toThrow(/reason|safety/);
  });

  it("requires the no-supply trace, escalation, and actual attempt to describe the same resource", () => {
    const evidence = structuredClone(validAcceptance.dispatchEvidence);
    Object.assign(evidence[0]!, {
      status: "delayed_queue",
      assignmentCount: 0,
      record: {
        orderId: "order-0",
        createdAt: "2026-10-12T00:00:00.000Z",
        status: "delayed_queue",
        orderSource: "app",
        queueFamily: "delayed_retry_queue",
        queueEntryReason: "no_supply_delayed_retry",
        dispatchAttemptCount: 1,
        lastDispatchFailureReason: "no_eligible_supply",
        noSupplyEscalation: {
          orderId: "order-0",
          dispatchJobId: "job-0",
          attemptCount: 1,
          lastAttemptAt: "2026-10-12T00:00:01.000Z",
          escalationAction: "move_to_delayed_queue",
          resolvedAt: null,
        },
      },
      attempts: [
        {
          orderId: "order-0",
          dispatchJobId: "job-0",
          outcome: "failed",
          reasonCode: "no_eligible_supply",
          createdAt: "2026-10-12T00:00:01.000Z",
        },
      ],
      traces: [
        {
          orderId: "order-0",
          traceId: "ready-0",
          eventType: "order.ready_for_dispatch",
          createdAt: "2026-10-12T00:00:00.000Z",
          details: {},
        },
        {
          orderId: "order-0",
          traceId: "delayed-trace",
          eventType: "dispatch.no_supply_delayed",
          createdAt: "2026-10-12T00:00:01.001Z",
          details: {
            dispatchJobId: "job-0",
            reasonCode: "no_eligible_supply",
            escalationAction: "move_to_delayed_queue",
            attemptCount: 1,
          },
        },
      ],
    });
    const facts = summarizeDispatchEvidence(evidence);
    const degraded = {
      ...structuredClone(validAcceptance),
      dispatchEvidence: evidence,
      dispatchOrderStatusDistribution: facts.distribution,
      dispatchAttemptCoverage: facts.coverage,
      degradation: facts.degradation,
    };
    expect(() => assertAcceptancePassed(degraded)).not.toThrow();
    evidence[0]!.attempts = [];
    expect(() => assertAcceptancePassed(degraded)).toThrow(/safety/);
  });

  it("rejects when attempt coverage is missing or inconsistent", () => {
    const invalid = structuredClone(validAcceptance);
    invalid.dispatchAttemptCoverage.attempted = 4499;
    invalid.dispatchAttemptCoverage.unattemptedUnlawful = 1;
    expect(() => assertAcceptancePassed(invalid)).toThrowError(
      /Workload failed: 1 items missing attempts without lawful status/,
    );
  });
});
