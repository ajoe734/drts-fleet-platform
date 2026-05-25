import { HttpStatus, Injectable } from "@nestjs/common";

import type {
  PlatformAdminTenantRecord,
  ResourceActionDescriptor,
  TenantRolloutGateStatus,
  TenantRolloutStage,
  TenantRolloutStateMachineRecord,
} from "@drts/contracts";

import { ApiRequestError } from "../../common/api-envelope";
import type {
  PersistedTenantRolloutRecord,
  TenantRolloutStateMachineMeta,
} from "./tenant-rollout.types";

const DEFAULT_ACTOR_ID = "system:tenant-rollout";
const HOLD_STAGE_FALLBACK = "production";

type NonHoldStage = Exclude<TenantRolloutStage, "rollback_hold">;

@Injectable()
export class TenantRolloutService {
  hydrateTenant(
    tenant: PersistedTenantRolloutRecord,
    actorId = DEFAULT_ACTOR_ID,
  ) {
    const now = tenant.updatedAt ?? tenant.createdAt ?? new Date().toISOString();
    if (!tenant.rolloutStateMachine) {
      tenant.rolloutStateMachine = {
        tenantId: tenant.id,
        stage:
          tenant.status === "rollback_hold" ? "rollback_hold" : tenant.rollout.stage,
        gateStatus: this.resolveLegacyGateStatus(tenant),
        cutoverOwnerUserId: null,
        cutoverOwnerDisplayName: tenant.rollout.cutoverOwner,
        rollbackOwnerUserId: null,
        rollbackOwnerDisplayName: tenant.rollout.rollbackOwner,
        rollbackPrepared: tenant.rollout.rollbackPrepared,
        enteredStageAt: tenant.rollout.lastPromotedAt ?? now,
        enteredGateAt: tenant.rollout.lastPromotedAt ?? now,
        lastUpdatedBy: actorId,
        lastUpdatedAt: now,
        availableActions: [],
      };
    }

    tenant.rolloutStateMachineMeta ??= {
      previousStage:
        tenant.rolloutStateMachine.stage === "rollback_hold"
          ? tenant.rollout.stage
          : tenant.rolloutStateMachine.stage,
      previousTenantStatus:
        tenant.status === "rollback_hold"
          ? "active"
          : tenant.status === "paused"
            ? "paused"
            : "active",
    };

    tenant.rolloutStateMachine = {
      ...tenant.rolloutStateMachine,
      tenantId: tenant.id,
      cutoverOwnerDisplayName:
        tenant.rolloutStateMachine.cutoverOwnerDisplayName ??
        tenant.rollout.cutoverOwner,
      rollbackOwnerDisplayName:
        tenant.rolloutStateMachine.rollbackOwnerDisplayName ??
        tenant.rollout.rollbackOwner,
      rollbackPrepared: tenant.rolloutStateMachine.rollbackPrepared,
      lastUpdatedBy: tenant.rolloutStateMachine.lastUpdatedBy || actorId,
      lastUpdatedAt: tenant.rolloutStateMachine.lastUpdatedAt || now,
      availableActions: [],
    };

    this.syncLegacyProjection(tenant);
    this.refreshAvailableActions(tenant);
    return tenant;
  }

  getStateMachine(tenant: PersistedTenantRolloutRecord) {
    this.hydrateTenant(tenant);
    return this.cloneStateMachine(tenant.rolloutStateMachine!);
  }

  updateFromOnboarding(
    tenant: PersistedTenantRolloutRecord,
    rolloutPatch: Partial<PlatformAdminTenantRecord["rollout"]>,
    actorId = DEFAULT_ACTOR_ID,
  ) {
    this.hydrateTenant(tenant, actorId);

    const state = tenant.rolloutStateMachine!;
    const currentStage = this.currentProjectedStage(tenant);
    const now = new Date().toISOString();

    if (rolloutPatch.cutoverOwner !== undefined) {
      state.cutoverOwnerDisplayName = this.normalizeNullableText(
        rolloutPatch.cutoverOwner,
      );
      state.cutoverOwnerUserId = null;
    }
    if (rolloutPatch.rollbackOwner !== undefined) {
      state.rollbackOwnerDisplayName = this.normalizeNullableText(
        rolloutPatch.rollbackOwner,
      );
      state.rollbackOwnerUserId = null;
    }
    if (rolloutPatch.rollbackPrepared !== undefined) {
      state.rollbackPrepared = Boolean(rolloutPatch.rollbackPrepared);
    }

    const nextCurrentGate = this.extractCurrentStageGateStatus(
      currentStage,
      rolloutPatch,
    );
    if (nextCurrentGate) {
      state.gateStatus = nextCurrentGate;
      state.enteredGateAt = now;
    }

    state.lastUpdatedAt = now;
    state.lastUpdatedBy = actorId;
    this.syncLegacyProjection(tenant, rolloutPatch);
    this.refreshAvailableActions(tenant);
    return this.cloneStateMachine(state);
  }

  setGateStatus(
    tenant: PersistedTenantRolloutRecord,
    gateStatus: TenantRolloutGateStatus,
    actorId = DEFAULT_ACTOR_ID,
  ) {
    this.hydrateTenant(tenant, actorId);
    const state = tenant.rolloutStateMachine!;
    const current = state.gateStatus;

    if (current === gateStatus) {
      this.refreshAvailableActions(tenant);
      return this.cloneStateMachine(state);
    }

    if (gateStatus === "ready" && !["pending", "blocked"].includes(current)) {
      throw this.transitionError(
        "TENANT_ROLLOUT_GATE_TRANSITION_BLOCKED",
        `Cannot mark gate ready from ${current}.`,
        tenant.id,
      );
    }
    if (gateStatus === "approved" && current !== "ready") {
      throw this.transitionError(
        "TENANT_ROLLOUT_GATE_TRANSITION_BLOCKED",
        `Cannot approve gate from ${current}.`,
        tenant.id,
      );
    }

    const now = new Date().toISOString();
    state.gateStatus = gateStatus;
    state.enteredGateAt = now;
    state.lastUpdatedAt = now;
    state.lastUpdatedBy = actorId;

    this.syncLegacyProjection(tenant);
    this.refreshAvailableActions(tenant);
    return this.cloneStateMachine(state);
  }

  setStage(
    tenant: PersistedTenantRolloutRecord,
    nextStage: NonHoldStage,
    actorId = DEFAULT_ACTOR_ID,
  ) {
    this.hydrateTenant(tenant, actorId);
    const state = tenant.rolloutStateMachine!;
    const missingPrerequisites = this.productionPrerequisites(tenant);

    if (state.stage === nextStage) {
      this.refreshAvailableActions(tenant);
      return this.cloneStateMachine(state);
    }

    if (state.stage === "sandbox") {
      if (nextStage !== "pilot" || state.gateStatus !== "approved") {
        throw this.transitionError(
          "TENANT_ROLLOUT_STAGE_TRANSITION_BLOCKED",
          "Sandbox can only promote to pilot after the current gate is approved.",
          tenant.id,
        );
      }
    } else if (state.stage === "pilot") {
      if (nextStage !== "production") {
        throw this.transitionError(
          "TENANT_ROLLOUT_STAGE_TRANSITION_BLOCKED",
          "Pilot can only promote to production.",
          tenant.id,
        );
      }
      if (state.gateStatus !== "approved" || missingPrerequisites.length > 0) {
        throw this.transitionError(
          "TENANT_ROLLOUT_STAGE_TRANSITION_BLOCKED",
          `Production promotion is blocked: ${missingPrerequisites.join(", ") || "pilot gate must be approved"}.`,
          tenant.id,
        );
      }
    } else if (state.stage === "production") {
      throw this.transitionError(
        "TENANT_ROLLOUT_STAGE_TRANSITION_BLOCKED",
        "Production does not auto-regress; enter rollback hold first.",
        tenant.id,
      );
    } else if (state.stage === "rollback_hold") {
      const previousStage = tenant.rolloutStateMachineMeta?.previousStage ?? null;
      if (state.gateStatus !== "approved" || previousStage !== nextStage) {
        throw this.transitionError(
          "TENANT_ROLLOUT_STAGE_TRANSITION_BLOCKED",
          "Rollback hold can only resume to the recorded previous stage after approval.",
          tenant.id,
        );
      }
    }

    const now = new Date().toISOString();
    state.stage = nextStage;
    state.gateStatus = "pending";
    state.enteredStageAt = now;
    state.enteredGateAt = now;
    state.lastUpdatedAt = now;
    state.lastUpdatedBy = actorId;
    tenant.rolloutStateMachineMeta = {
      previousStage: nextStage,
      previousTenantStatus:
        tenant.status === "rollback_hold"
          ? tenant.rolloutStateMachineMeta?.previousTenantStatus ?? "active"
          : tenant.status === "paused"
            ? "paused"
            : "active",
    };

    this.syncLegacyProjection(tenant);
    this.refreshAvailableActions(tenant);
    return this.cloneStateMachine(state);
  }

  enterRollbackHold(
    tenant: PersistedTenantRolloutRecord,
    actorId = DEFAULT_ACTOR_ID,
  ) {
    this.hydrateTenant(tenant, actorId);
    const state = tenant.rolloutStateMachine!;
    const now = new Date().toISOString();

    const previousTenantStatus =
      tenant.status === "paused" ? "paused" : "active";
    const previousStage = state.stage === "rollback_hold"
      ? tenant.rolloutStateMachineMeta?.previousStage ?? HOLD_STAGE_FALLBACK
      : this.nonHoldStageFromState(state.stage);

    tenant.rolloutStateMachineMeta = {
      previousStage,
      previousTenantStatus,
    };

    state.stage = "rollback_hold";
    state.gateStatus = "blocked";
    state.enteredStageAt = now;
    state.enteredGateAt = now;
    state.lastUpdatedAt = now;
    state.lastUpdatedBy = actorId;

    this.syncLegacyProjection(tenant);
    this.refreshAvailableActions(tenant);
    return this.cloneStateMachine(state);
  }

  private resolveLegacyGateStatus(tenant: PersistedTenantRolloutRecord) {
    const stage = tenant.status === "rollback_hold" ? tenant.rollout.stage : tenant.rollout.stage;
    if (tenant.status === "rollback_hold") {
      return tenant.rollout.productionStatus;
    }

    if (stage === "sandbox") {
      return tenant.rollout.sandboxStatus;
    }
    if (stage === "pilot") {
      return tenant.rollout.pilotStatus;
    }
    return tenant.rollout.productionStatus;
  }

  private currentProjectedStage(tenant: PersistedTenantRolloutRecord): NonHoldStage {
    const stage = tenant.rolloutStateMachine?.stage;
    if (stage && stage !== "rollback_hold") {
      return stage;
    }
    return tenant.rolloutStateMachineMeta?.previousStage ?? tenant.rollout.stage;
  }

  private extractCurrentStageGateStatus(
    currentStage: NonHoldStage,
    rolloutPatch: Partial<PlatformAdminTenantRecord["rollout"]>,
  ): TenantRolloutGateStatus | null {
    if (currentStage === "sandbox" && rolloutPatch.sandboxStatus) {
      return rolloutPatch.sandboxStatus;
    }
    if (currentStage === "pilot" && rolloutPatch.pilotStatus) {
      return rolloutPatch.pilotStatus;
    }
    if (currentStage === "production" && rolloutPatch.productionStatus) {
      return rolloutPatch.productionStatus;
    }
    return null;
  }

  private refreshAvailableActions(tenant: PersistedTenantRolloutRecord) {
    const state = tenant.rolloutStateMachine!;
    const canResumeFromHold =
      state.stage === "rollback_hold" && state.gateStatus === "approved";
    const previousStage = tenant.rolloutStateMachineMeta?.previousStage ?? null;
    const productionPrerequisites = this.productionPrerequisites(tenant);

    state.availableActions = [
      this.actionDescriptor(
        "set_gate_pending",
        state.gateStatus !== "pending",
        "medium",
        state.gateStatus === "pending" ? "gate_already_pending" : undefined,
      ),
      this.actionDescriptor(
        "set_gate_ready",
        state.gateStatus === "pending" || state.gateStatus === "blocked",
        "medium",
        state.gateStatus === "ready"
          ? "gate_already_ready"
          : state.gateStatus === "approved"
            ? "approved_gate_must_reopen_first"
            : undefined,
      ),
      this.actionDescriptor(
        "approve_gate",
        state.gateStatus === "ready",
        "medium",
        state.gateStatus === "approved"
          ? "gate_already_approved"
          : "gate_must_be_ready",
      ),
      this.actionDescriptor(
        "block_gate",
        state.gateStatus !== "blocked",
        "high",
        state.gateStatus === "blocked" ? "gate_already_blocked" : undefined,
        true,
      ),
      this.actionDescriptor(
        "set_stage_sandbox",
        canResumeFromHold && previousStage === "sandbox",
        "medium",
        state.stage === "sandbox"
          ? "already_in_stage"
          : state.stage === "rollback_hold"
            ? "rollback_hold_not_approved"
            : "unsupported_stage_transition",
      ),
      this.actionDescriptor(
        "set_stage_pilot",
        (state.stage === "sandbox" && state.gateStatus === "approved") ||
          (canResumeFromHold && previousStage === "pilot"),
        "medium",
        state.stage === "pilot"
          ? "already_in_stage"
          : state.stage === "sandbox"
            ? "sandbox_gate_must_be_approved"
            : state.stage === "rollback_hold"
              ? "rollback_hold_not_approved"
              : "unsupported_stage_transition",
      ),
      this.actionDescriptor(
        "set_stage_production",
        ((state.stage === "pilot" && state.gateStatus === "approved") ||
          (canResumeFromHold && previousStage === "production")) &&
          productionPrerequisites.length === 0,
        "high",
        state.stage === "production"
          ? "already_in_stage"
          : productionPrerequisites.length > 0
            ? productionPrerequisites[0]
            : state.stage === "pilot"
              ? "pilot_gate_must_be_approved"
              : state.stage === "rollback_hold"
                ? "rollback_hold_not_approved"
                : "unsupported_stage_transition",
        true,
      ),
      this.actionDescriptor(
        "enter_rollback_hold",
        state.stage !== "rollback_hold",
        "high",
        state.stage === "rollback_hold" ? "rollback_hold_already_active" : undefined,
        true,
      ),
      this.actionDescriptor(
        "activate_tenant",
        tenant.status === "paused",
        "medium",
        tenant.status === "rollback_hold"
          ? "rollback_hold_must_clear_first"
          : "tenant_not_paused",
      ),
      this.actionDescriptor(
        "suspend_tenant",
        tenant.status === "active",
        "high",
        tenant.status === "rollback_hold"
          ? "rollback_hold_already_active"
          : "tenant_not_active",
        true,
      ),
    ];
  }

  private productionPrerequisites(tenant: PersistedTenantRolloutRecord) {
    const state = tenant.rolloutStateMachine!;
    const missing: string[] = [];
    if (!state.rollbackPrepared) {
      missing.push("rollback_prepared_required");
    }
    if (!state.cutoverOwnerDisplayName) {
      missing.push("cutover_owner_required");
    }
    if (!state.rollbackOwnerDisplayName) {
      missing.push("rollback_owner_required");
    }
    const missingRoles = tenant.bootstrapDefaults.roleDefaults.filter(
      (role) => role.required && !role.acknowledgedAt,
    );
    if (missingRoles.length > 0) {
      missing.push("required_roles_unacknowledged");
    }
    return missing;
  }

  private syncLegacyProjection(
    tenant: PersistedTenantRolloutRecord,
    rolloutPatch?: Partial<PlatformAdminTenantRecord["rollout"]>,
  ) {
    const state = tenant.rolloutStateMachine!;
    const meta = tenant.rolloutStateMachineMeta ?? {
      previousStage: HOLD_STAGE_FALLBACK,
      previousTenantStatus: "active",
    };
    const projectedStage =
      state.stage === "rollback_hold"
        ? meta.previousStage ?? HOLD_STAGE_FALLBACK
        : state.stage;

    tenant.rollout.cutoverOwner = state.cutoverOwnerDisplayName;
    tenant.rollout.rollbackOwner = state.rollbackOwnerDisplayName;
    tenant.rollout.rollbackPrepared = state.rollbackPrepared;
    tenant.rollout.stage = projectedStage;
    tenant.rollout.lastPromotedAt = state.enteredStageAt;

    if (rolloutPatch?.sandboxStatus !== undefined) {
      tenant.rollout.sandboxStatus = rolloutPatch.sandboxStatus;
    }
    if (rolloutPatch?.pilotStatus !== undefined) {
      tenant.rollout.pilotStatus = rolloutPatch.pilotStatus;
    }
    if (rolloutPatch?.productionStatus !== undefined) {
      tenant.rollout.productionStatus = rolloutPatch.productionStatus;
    }

    if (projectedStage === "sandbox") {
      tenant.rollout.sandboxStatus = state.gateStatus;
    }
    if (projectedStage === "pilot") {
      tenant.rollout.sandboxStatus = "approved";
      tenant.rollout.pilotStatus = state.gateStatus;
    }
    if (projectedStage === "production") {
      tenant.rollout.sandboxStatus = "approved";
      tenant.rollout.pilotStatus = "approved";
      tenant.rollout.productionStatus = state.gateStatus;
    }

    if (state.stage === "rollback_hold") {
      tenant.status = "rollback_hold";
      tenant.rollout.productionStatus = state.gateStatus;
    } else if (tenant.status === "rollback_hold") {
      tenant.status = meta.previousTenantStatus ?? "active";
    }

    tenant.updatedAt = state.lastUpdatedAt;
  }

  private actionDescriptor(
    action: string,
    enabled: boolean,
    riskLevel: ResourceActionDescriptor["riskLevel"],
    disabledReasonCode?: string,
    requiresReason?: boolean,
  ): ResourceActionDescriptor {
    const descriptor: ResourceActionDescriptor = {
      action,
      enabled,
      riskLevel,
    };

    if (!enabled && disabledReasonCode) {
      descriptor.disabledReasonCode = disabledReasonCode;
    }
    if (requiresReason) {
      descriptor.requiresReason = true;
    }

    return descriptor;
  }

  private normalizeNullableText(value: string | null | undefined) {
    const normalized = value?.trim();
    return normalized ? normalized : null;
  }

  private nonHoldStageFromState(stage: TenantRolloutStage): NonHoldStage {
    return stage === "rollback_hold" ? HOLD_STAGE_FALLBACK : stage;
  }

  private cloneStateMachine(state: TenantRolloutStateMachineRecord) {
    return {
      ...state,
      availableActions: state.availableActions.map((action) => ({ ...action })),
    };
  }

  private transitionError(code: string, message: string, tenantId: string) {
    return new ApiRequestError(HttpStatus.CONFLICT, code, message, { tenantId });
  }
}
