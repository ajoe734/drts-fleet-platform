import { describe, expect, it, vi } from "vitest";

import { SandboxDispatchGateRepository } from "../../src/modules/sandbox-dispatch-gate/sandbox-dispatch-gate.repository";

describe("SandboxDispatchGateRepository", () => {
  it("upserts release audit data when the decision row already exists", async () => {
    const query = vi.fn().mockResolvedValue({ rows: [] });
    const repository = new SandboxDispatchGateRepository({
      isEnabled: () => true,
      query,
    } as never);

    await repository.persistEvaluation({
      decision: {
        decisionId: "dec-001",
        orderId: "order-001",
        dispatchJobId: "job-001",
        vehicleId: "veh-av-001",
        sandboxProgramId: "sandbox-program-001",
        decision: "block",
        oddInBounds: false,
        hardReasonCodes: ["REGULATORY_APPROVAL_MISSING"],
        softReasonCodes: [],
        requiredSafetyOperatorId: null,
        policyVersion: "sandbox-dispatch-gate.v1",
        evaluatedAt: "2026-06-26T00:00:00.000Z",
      },
      evaluationSnapshot: {
        orderId: "order-001",
        dispatchJobId: "job-001",
        vehicleId: "veh-av-001",
        sandboxProgramId: "sandbox-program-001",
        policyVersion: "sandbox-dispatch-gate.v1",
      },
      releaseAudit: {
        actorId: "ops-001",
        actorType: "ops_user",
        reason: "Supervisor release",
      },
    });

    expect(query).toHaveBeenCalledTimes(1);
    const [sql, params] = query.mock.calls[0] as [string, unknown[]];
    expect(sql).toContain("ON CONFLICT (decision_id) DO UPDATE SET");
    expect(sql).toContain("release_audit = CASE");
    expect(params[13]).toBe(
      JSON.stringify({
        actorId: "ops-001",
        actorType: "ops_user",
        reason: "Supervisor release",
      }),
    );
  });

  it("updates release audit in place for an existing decision row", async () => {
    const query = vi.fn().mockResolvedValue({ rows: [] });
    const repository = new SandboxDispatchGateRepository({
      isEnabled: () => true,
      query,
    } as never);

    await repository.updateReleaseAudit("dec-002", {
      actorId: "ops-002",
      actorType: "ops_user",
      reason: "In-place release update",
    });

    expect(query).toHaveBeenCalledTimes(1);
    const [sql, params] = query.mock.calls[0] as [string, unknown[]];
    expect(sql).toContain("UPDATE av_sandbox.sandbox_dispatch_decisions");
    expect(sql).toContain("SET release_audit = $2::jsonb");
    expect(sql).toContain("WHERE decision_id = $1");
    expect(params).toEqual([
      "dec-002",
      JSON.stringify({
        actorId: "ops-002",
        actorType: "ops_user",
        reason: "In-place release update",
      }),
    ]);
  });
});
