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
    summary: {
      result: "measurements_within_targets",
      durationSeconds: 900,
      fullBurstSchedule: true,
      elapsedMs: 899800, // elapsedMs must be at least 899800 for a 900s run
      maxInFlight: 500, // Valid configuration value
      workflows: {
        booking: {
          requests: 900,
          errors: 0,
          p95Ms: 15.2,
          p99Ms: 22.4,
          latencyTargetsMet: true,
        },
        dispatch: {
          requests: 4500,
          errors: 0,
          p95Ms: 18.5,
          p99Ms: 25.1,
          latencyTargetsMet: true,
        },
        report: {
          requests: 450,
          errors: 0,
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
      report: { count: 450, minMs: 10, maxMs: 100, avgMs: 45, p95Ms: 90 },
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
      },
      traces: [],
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
  };

  it("passes a valid full schedule summary with zero errors and perfect readback", () => {
    expect(() => assertAcceptancePassed(validAcceptance)).not.toThrow();
  });

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
      degraded.dispatchAttemptCoverage = {
        attempted: 1,
        unattemptedLawful: 4499,
        unattemptedUnlawful: 0,
        unattemptedLawfulReasons: reasons,
      };
      degraded.queueLag.dispatchOrderQueueLag = {
        count: 1,
        minMs: 0,
        maxMs: 0,
        avgMs: 0,
        p95Ms: 0,
      };
      expect(() => assertAcceptancePassed(degraded)).toThrow(/resource|reason/);
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
