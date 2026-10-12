import { describe, expect, it } from "vitest";
import { assertAcceptancePassed } from "../../../../tools/system-remediation/ops-capacity/durable-readback.mjs";

describe("SR-OPS-CAPACITY-RUNNER-20260911 acceptance gate", () => {
  it("rejects a genuine 900s baseline payload that failed due to 112 HTTP 429s (24/74/14 error summary)", () => {
    // This is the exact shape of the "false green" payload from the finding.
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
            latencyTargetsMet: true
          },
          dispatch: {
            requests: 4500,
            errors: 74,
            p95Ms: 18.5,
            p99Ms: 25.1,
            targets: { perMinute: 300, p95Ms: 10000 },
            latencyTargetsMet: true
          },
          report: {
            requests: 450,
            errors: 14,
            p95Ms: 21.3,
            p99Ms: 28.7,
            targets: { perMinute: 30, p95Ms: 5000 },
            latencyTargetsMet: true
          }
        },
        result: "failed",
        acceptance: "not_established"
      },
      readback: {
        booking: { expectedCount: 876, foundCount: 876, missing: [], matched: true },
        dispatch: { expectedCount: 4426, foundCount: 4426, missing: [], matched: true },
        report: { expectedCount: 436, foundCount: 436, missing: [], matched: true }
      }
    };

    expect(() => assertAcceptancePassed(failedAcceptance)).toThrowError(/Workload failed: failed/);
  });

  it("passes a valid full schedule summary with zero errors and perfect readback", () => {
    const passedAcceptance = {
      summary: {
        result: "measurements_within_targets"
      },
      readback: {
        booking: { expectedCount: 900, foundCount: 900, missing: [], matched: true },
        dispatch: { expectedCount: 4500, foundCount: 4500, missing: [], matched: true },
        report: { expectedCount: 450, foundCount: 450, missing: [], matched: true }
      }
    };
    expect(() => assertAcceptancePassed(passedAcceptance)).not.toThrow();
  });
});
