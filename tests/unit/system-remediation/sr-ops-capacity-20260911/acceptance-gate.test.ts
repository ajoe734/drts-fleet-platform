import { describe, expect, it } from "vitest";
import { assertAcceptancePassed } from "../../../../tools/system-remediation/ops-capacity/durable-readback.mjs";

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
    },
    queueLag: {
      report: { count: 450, minMs: 10, maxMs: 100, avgMs: 45 },
      dispatchOrderQueueLag: { count: 4500, minMs: 5, maxMs: 50, avgMs: 20 },
    },
    dispatchOrderStatusDistribution: {
      completed: 4500,
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
      /invalid report queueLag measurements/,
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
});
