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

  it("upserts disclosure catalog entries on the message code and locale key", async () => {
    const query = vi.fn().mockResolvedValue({ rows: [] });
    const repository = new SandboxDispatchGateRepository({
      isEnabled: () => true,
      query,
    } as never);

    await repository.upsertPassengerDisclosureMessageCatalogEntry({
      entryId: "pdc-v1-av-en-us",
      catalogVersion: "passenger_disclosure.v1",
      messageCode: "sandbox_passenger_disclosure.av_program_notice",
      locale: "en-US",
      bodyText: "updated legal copy",
      legalApproved: true,
      createdAt: "2026-06-26T00:00:00.000Z",
      updatedAt: "2026-06-26T01:00:00.000Z",
    });

    expect(query).toHaveBeenCalledTimes(1);
    const [sql, params] = query.mock.calls[0] as [string, unknown[]];
    expect(sql).toContain("ON CONFLICT (message_code, locale) DO UPDATE SET");
    expect(sql).toContain("entry_id = EXCLUDED.entry_id");
    expect(params).toEqual([
      "pdc-v1-av-en-us",
      "passenger_disclosure.v1",
      "sandbox_passenger_disclosure.av_program_notice",
      "en-US",
      true,
      "updated legal copy",
      JSON.stringify({
        entryId: "pdc-v1-av-en-us",
        catalogVersion: "passenger_disclosure.v1",
        messageCode: "sandbox_passenger_disclosure.av_program_notice",
        locale: "en-US",
        bodyText: "updated legal copy",
        legalApproved: true,
        createdAt: "2026-06-26T00:00:00.000Z",
        updatedAt: "2026-06-26T01:00:00.000Z",
      }),
      "2026-06-26T00:00:00.000Z",
      "2026-06-26T01:00:00.000Z",
    ]);
  });
});
