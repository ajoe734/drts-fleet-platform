import { describe, expect, it } from "vitest";

import {
  buildCapacityPlan,
  countForFamily,
  countsForDuration,
} from "../../../../tools/system-remediation/ops-capacity/plan-builder.mjs";
import { validatePlan } from "../../../../tools/system-remediation/ops-proof/capacity.mjs";

// SR-OPS-CAPACITY-RUNNER-20260911 (C123) unit coverage: proves the plan this
// task builds is schema-valid against the reused SR-OPS-PROOF-001 (C122)
// load generator's own `validatePlan`, without needing a live server,
// Postgres, or real JWTs. The real HTTP/Postgres/JWT execution is exercised
// separately by the skipped-unless-configured integration acceptance test.

const ORIGIN = "http://127.0.0.1:4010/";

function buildPlan(durationSeconds: number) {
  const counts = countsForDuration(durationSeconds);
  const orderIds = Array.from(
    { length: counts.dispatch },
    (_, index) => `sr-ops-capacity-order-${index}`,
  );
  return buildCapacityPlan({
    origin: ORIGIN,
    durationSeconds,
    maxInFlight: 500,
    isolatedResourceId: "sr-ops-capacity-unit-test",
    tenantId: "tenant-demo-001",
    tenantJwt: "unit-test-tenant-jwt",
    dispatchJwt: "unit-test-dispatch-jwt",
    reportJwt: "unit-test-report-jwt",
    orderIds,
    runTag: `unit-${durationSeconds}`,
    windowStartMs: Date.parse("2026-09-11T12:00:00.000Z"),
  });
}

describe("SR-OPS-CAPACITY-RUNNER-20260911 plan-builder", () => {
  it("computes the accepted baseline per-family counts for the full 900s burst", () => {
    expect(countForFamily("booking", 900)).toBe(900);
    expect(countForFamily("dispatch", 900)).toBe(4500);
    expect(countForFamily("report", 900)).toBe(450);
    expect(countsForDuration(900)).toEqual({
      booking: 900,
      dispatch: 4500,
      report: 450,
    });
  });

  it("builds a plan that passes the reused capacity.mjs validatePlan for a short window", () => {
    const plan = buildPlan(60);
    expect(() => validatePlan(plan)).not.toThrow();
    expect(plan.workloads.booking).toHaveLength(60);
    expect(plan.workloads.dispatch).toHaveLength(300);
    expect(plan.workloads.report).toHaveLength(30);
  });

  it("builds a plan that passes validatePlan for the full 900s accepted baseline burst", () => {
    const plan = buildPlan(900);
    expect(plan.durationSeconds).toBe(900);
    expect(() => validatePlan(plan)).not.toThrow();
    expect(plan.workloads.booking).toHaveLength(900);
    expect(plan.workloads.dispatch).toHaveLength(4500);
    expect(plan.workloads.report).toHaveLength(450);
  });

  it("gives every write a unique idempotency key across the whole plan", () => {
    const plan = buildPlan(60);
    const keys = Object.values(plan.workloads)
      .flat()
      .map((item: { headers: Record<string, string> }) => item.headers["idempotency-key"]);
    expect(new Set(keys).size).toBe(keys.length);
  });

  it("never emits a header outside capacity.mjs's canonical allowlist", () => {
    const plan = buildPlan(60);
    const allowed = new Set([
      "authorization",
      "idempotency-key",
      "x-tenant-id",
      "x-request-id",
      "x-runtime-profile-code",
    ]);
    for (const item of Object.values(plan.workloads).flat() as Array<{
      headers: Record<string, string>;
    }>) {
      for (const key of Object.keys(item.headers)) {
        expect(allowed.has(key)).toBe(true);
      }
    }
  });

  it("never sends x-runtime-profile-code on tenant booking requests", () => {
    // owned-mobility.service.ts's assertRuntimeProfileAllowances forbids a
    // public caller from supplying this header on tenant bookings, even
    // though capacity.mjs's validator would otherwise permit it.
    const plan = buildPlan(60);
    for (const item of plan.workloads.booking) {
      expect(item.headers["x-runtime-profile-code"]).toBeUndefined();
    }
  });

  it("rejects a mismatched order ID count for the dispatch family", () => {
    expect(() =>
      buildCapacityPlan({
        origin: ORIGIN,
        durationSeconds: 60,
        maxInFlight: 500,
        isolatedResourceId: "sr-ops-capacity-unit-test",
        tenantId: "tenant-demo-001",
        tenantJwt: "unit-test-tenant-jwt",
        dispatchJwt: "unit-test-dispatch-jwt",
        reportJwt: "unit-test-report-jwt",
        orderIds: ["only-one-order"],
        runTag: "unit-mismatch",
      }),
    ).toThrow(/orderIds must contain exactly/);
  });

  it("keeps every dispatch order ID and request path independent", () => {
    const plan = buildPlan(60);
    const orderPaths = plan.workloads.dispatch.map(
      (item: { path: string }) => item.path,
    );
    expect(new Set(orderPaths).size).toBe(orderPaths.length);
    for (const item of plan.workloads.dispatch) {
      expect(item.body).toEqual({ mode: "auto" });
    }
  });

});
