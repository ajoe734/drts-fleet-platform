import { describe, expect, it } from "vitest";

import type {
  TenantRolloutGateStatus,
  TenantRolloutStage,
} from "@drts/contracts";

import {
  createTenantRolloutState,
  listTenantRolloutAvailableActions,
  toTenantRolloutStateMachineRecord,
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
        const actions = listTenantRolloutAvailableActions({
          stage,
          gateStatus,
        });

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
      }
    }
  });

  it("enables promotion only when the current gate is approved", () => {
    expect(
      listTenantRolloutAvailableActions({
        stage: "sandbox",
        gateStatus: "approved",
      }).find((action) => action.action === "promote_to_pilot"),
    ).toMatchObject({ enabled: true });

    expect(
      listTenantRolloutAvailableActions({
        stage: "pilot",
        gateStatus: "ready",
      }).find((action) => action.action === "promote_to_production"),
    ).toMatchObject({
      enabled: false,
      disabledReasonCode: "pilot_gate_not_approved",
    });
  });

  it("transitions gate metadata for the active stage", () => {
    const updated = transitionTenantRolloutGate(
      createTenantRolloutState("2026-05-25T10:00:00.000Z"),
      {
        gateStatus: "approved",
        occurredAt: "2026-05-25T10:05:00.000Z",
        actorLabel: "QA reviewer",
      },
    );

    expect(updated.sandboxStatus).toBe("approved");
    expect(updated.enteredGateAt).toBe("2026-05-25T10:05:00.000Z");
    expect(updated.lastUpdatedBy).toBe("QA reviewer");
  });

  it("transitions stage metadata and approves prerequisite gates", () => {
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
      productionStatus: "approved",
      lastPromotedAt: "2026-05-25T11:00:00.000Z",
      enteredStageAt: "2026-05-25T11:00:00.000Z",
      enteredGateAt: "2026-05-25T11:00:00.000Z",
      lastUpdatedBy: "platform_admin",
      notes: "Production approved.",
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
});
