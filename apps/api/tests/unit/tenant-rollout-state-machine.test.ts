import { describe, expect, it } from "vitest";

import type {
  TenantRolloutGateStatus,
  TenantRolloutStage,
} from "@drts/contracts";

import {
  buildTenantRolloutAuditSummary,
  createTenantRolloutState,
  listTenantRolloutAvailableActions,
  toTenantRolloutStateMachineRecord,
  transitionTenantRollbackHold,
  transitionTenantRolloutGate,
  transitionTenantRolloutStage,
} from "../../src/modules/tenant-rollout/tenant-rollout-state-machine";

const STAGES: TenantRolloutStage[] = [
  "sandbox",
  "pilot",
  "production",
  "rollback_hold",
];
const GATE_STATUSES: TenantRolloutGateStatus[] = [
  "pending",
  "ready",
  "approved",
  "blocked",
];

describe("tenant rollout state machine", () => {
  const getAction = (
    stage: TenantRolloutStage,
    gateStatus: TenantRolloutGateStatus,
    actionName: string,
  ) =>
    listTenantRolloutAvailableActions({
      stage,
      gateStatus,
    }).find((action) => action.action === actionName);

  it("creates bootstrap rollout storage with timestamps and actor", () => {
    const created = createTenantRolloutState(
      "2026-05-25T10:00:00.000Z",
      "Codex2",
    );

    expect(created).toMatchObject({
      stage: "sandbox",
      sandboxStatus: "ready",
      pilotStatus: "pending",
      productionStatus: "pending",
      enteredStageAt: "2026-05-25T10:00:00.000Z",
      enteredGateAt: "2026-05-25T10:00:00.000Z",
      lastUpdatedBy: "Codex2",
    });
  });

  it("covers availableActions for all 4 stages x 4 gate states", () => {
    for (const stage of STAGES) {
      for (const gateStatus of GATE_STATUSES) {
        const actions = listTenantRolloutAvailableActions({ stage, gateStatus });

        expect(actions.length).toBeGreaterThanOrEqual(6);
        expect(actions).toEqual(
          expect.arrayContaining([
            expect.objectContaining({ action: "mark_gate_pending" }),
            expect.objectContaining({ action: "mark_gate_ready" }),
            expect.objectContaining({ action: "approve_gate" }),
            expect.objectContaining({ action: "block_gate" }),
            expect.objectContaining({ action: "enter_rollback_hold" }),
            expect.objectContaining({ action: "resolve_rollback_hold" }),
          ]),
        );
        expect(
          actions.find((action) => action.action === "mark_gate_pending"),
        ).toMatchObject({
          enabled: stage !== "rollback_hold" && gateStatus !== "pending",
        });
        expect(
          actions.find((action) => action.action === "mark_gate_ready"),
        ).toMatchObject({
          enabled: stage !== "rollback_hold" && gateStatus !== "ready",
        });
        expect(actions.find((action) => action.action === "approve_gate")).toMatchObject(
          {
            enabled: stage !== "rollback_hold" && gateStatus !== "approved",
          },
        );
        expect(actions.find((action) => action.action === "block_gate")).toMatchObject(
          {
            enabled: stage !== "rollback_hold" && gateStatus !== "blocked",
          },
        );
      }
    }
  });

  it("enables promotion only when the current gate is approved", () => {
    expect(
      getAction("sandbox", "approved", "promote_to_pilot"),
    ).toMatchObject({ enabled: true });

    expect(getAction("sandbox", "ready", "promote_to_pilot")).toMatchObject({
      enabled: false,
      disabledReasonCode: "sandbox_gate_not_approved",
    });
    expect(getAction("pilot", "approved", "promote_to_production")).toMatchObject(
      {
        enabled: true,
      },
    );
    expect(getAction("pilot", "ready", "promote_to_production")).toMatchObject({
      enabled: false,
      disabledReasonCode: "pilot_gate_not_approved",
    });
  });

  it("only allows rollback hold actions in the intended stages", () => {
    expect(getAction("production", "approved", "enter_rollback_hold")).toMatchObject(
      { enabled: true },
    );
    expect(getAction("pilot", "approved", "enter_rollback_hold")).toMatchObject({
      enabled: false,
      disabledReasonCode: "rollback_hold_requires_production_cutover",
    });
    expect(
      getAction("rollback_hold", "blocked", "resolve_rollback_hold"),
    ).toMatchObject({ enabled: true });
  });

  it("transitions gate metadata for the active stage", () => {
    const updated = transitionTenantRolloutGate(
      createTenantRolloutState("2026-05-25T10:00:00.000Z"),
      {
        gateStatus: "approved",
        notes: "Sandbox verification complete.",
        occurredAt: "2026-05-25T10:05:00.000Z",
        actorLabel: "QA reviewer",
      },
    );

    expect(updated.sandboxStatus).toBe("approved");
    expect(updated.enteredGateAt).toBe("2026-05-25T10:05:00.000Z");
    expect(updated.lastUpdatedBy).toBe("QA reviewer");
    expect(updated.notes).toBe("Sandbox verification complete.");
  });

  it("transitions stage metadata without auto-approving the target gate", () => {
    const updated = transitionTenantRolloutStage(
      createTenantRolloutState("2026-05-25T10:00:00.000Z"),
      {
        stage: "production",
        notes: "Production approved.",
        occurredAt: "2026-05-25T11:00:00.000Z",
        actorLabel: "platform_admin",
      },
    );

    expect(updated).toMatchObject({
      stage: "production",
      sandboxStatus: "approved",
      pilotStatus: "approved",
      productionStatus: "pending",
      lastPromotedAt: "2026-05-25T11:00:00.000Z",
      enteredStageAt: "2026-05-25T11:00:00.000Z",
      enteredGateAt: "2026-05-25T11:00:00.000Z",
      lastUpdatedBy: "platform_admin",
      notes: "Production approved.",
    });
  });

  it("transitions rollback hold stage into blocked production state", () => {
    const updated = transitionTenantRollbackHold(
      createTenantRolloutState("2026-05-25T10:00:00.000Z"),
      {
        notes: "Rollback triggered after incident escalation.",
        occurredAt: "2026-05-25T11:00:00.000Z",
        actorLabel: "ops lead",
      },
    );

    expect(updated).toMatchObject({
      stage: "rollback_hold",
      productionStatus: "blocked",
      enteredStageAt: "2026-05-25T11:00:00.000Z",
      enteredGateAt: "2026-05-25T11:00:00.000Z",
      notes: "Rollback triggered after incident escalation.",
      lastUpdatedBy: "ops lead",
    });
  });

  it("derives rollback hold read model with blocked gate and actions", () => {
    const record = toTenantRolloutStateMachineRecord({
      id: "tenant-acme",
      status: "rollback_hold",
      createdAt: "2026-05-25T10:00:00.000Z",
      updatedAt: "2026-05-25T12:00:00.000Z",
      rollout: {
        ...createTenantRolloutState("2026-05-25T10:00:00.000Z"),
        stage: "production",
        productionStatus: "approved",
        cutoverOwner: "Launch Lead",
        rollbackOwner: "Ops Lead",
        rollbackPrepared: true,
      },
    });

    expect(record).toMatchObject({
      stage: "rollback_hold",
      gateStatus: "blocked",
      cutoverOwnerDisplayName: "Launch Lead",
      rollbackOwnerDisplayName: "Ops Lead",
      rollbackPrepared: true,
    });
    expect(
      record.availableActions.find(
        (action) => action.action === "resolve_rollback_hold",
      ),
    ).toMatchObject({ enabled: true });
    expect(
      record.availableActions.find(
        (action) => action.action === "enter_rollback_hold",
      ),
    ).toMatchObject({
      enabled: false,
      disabledReasonCode: "tenant_already_in_rollback_hold",
    });
  });

  it("builds audit summaries from rollout storage state", () => {
    expect(
      buildTenantRolloutAuditSummary({
        ...createTenantRolloutState("2026-05-25T10:00:00.000Z"),
        stage: "rollback_hold",
        productionStatus: "blocked",
      }),
    ).toMatchObject({
      stage: "rollback_hold",
      productionStatus: "blocked",
      rollbackPrepared: false,
    });
  });
});
