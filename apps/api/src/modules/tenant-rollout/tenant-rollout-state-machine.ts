import type {
  PlatformAdminTenantRecord,
  PlatformTenantGateStatus,
  PlatformTenantRolloutState,
  PlatformTenantRolloutStage,
  ResourceActionDescriptor,
  TenantRolloutGateStatus,
  TenantRolloutStage,
  TenantRolloutStateMachineRecord,
} from "@drts/contracts";

const ROLLOUT_STAGES: readonly TenantRolloutStage[] = [
  "sandbox",
  "pilot",
  "production",
  "rollback_hold",
] as const;

const GATE_STATUSES: readonly TenantRolloutGateStatus[] = [
  "pending",
  "ready",
  "approved",
  "blocked",
] as const;

type RolloutAction =
  | "mark_gate_pending"
  | "mark_gate_ready"
  | "approve_gate"
  | "block_gate"
  | "promote_to_pilot"
  | "promote_to_production"
  | "enter_rollback_hold"
  | "resolve_rollback_hold";

type RolloutActionCatalogEntry = Omit<ResourceActionDescriptor, "enabled"> & {
  action: RolloutAction;
};

type RolloutTransitionMetadata = {
  actorId?: string | null;
  actorLabel?: string | null;
  occurredAt: string;
};

type RolloutStageTransitionInput = RolloutTransitionMetadata & {
  stage: PlatformTenantRolloutStage;
  notes?: string | null;
};

type RolloutGateTransitionInput = RolloutTransitionMetadata & {
  gateStatus: PlatformTenantGateStatus;
  stage?: PlatformTenantRolloutStage;
};

const ACTION_CATALOG: Readonly<Record<RolloutAction, RolloutActionCatalogEntry>> =
  {
    mark_gate_pending: {
      action: "mark_gate_pending",
      riskLevel: "medium",
    },
    mark_gate_ready: {
      action: "mark_gate_ready",
      riskLevel: "low",
    },
    approve_gate: {
      action: "approve_gate",
      riskLevel: "medium",
    },
    block_gate: {
      action: "block_gate",
      riskLevel: "high",
      requiresReason: true,
    },
    promote_to_pilot: {
      action: "promote_to_pilot",
      riskLevel: "high",
      requiresReason: true,
    },
    promote_to_production: {
      action: "promote_to_production",
      riskLevel: "high",
      requiresReason: true,
    },
    enter_rollback_hold: {
      action: "enter_rollback_hold",
      riskLevel: "high",
      requiresReason: true,
    },
    resolve_rollback_hold: {
      action: "resolve_rollback_hold",
      riskLevel: "high",
      requiresReason: true,
    },
  };

function assertStage(stage: string): TenantRolloutStage {
  if (ROLLOUT_STAGES.includes(stage as TenantRolloutStage)) {
    return stage as TenantRolloutStage;
  }

  throw new Error(`Unknown tenant rollout stage: ${stage}`);
}

function assertGateStatus(status: string): TenantRolloutGateStatus {
  if (GATE_STATUSES.includes(status as TenantRolloutGateStatus)) {
    return status as TenantRolloutGateStatus;
  }

  throw new Error(`Unknown tenant rollout gate status: ${status}`);
}

function currentGateStatusForStage(
  rollout: PlatformTenantRolloutState,
  stage: Exclude<TenantRolloutStage, "rollback_hold">,
) {
  if (stage === "sandbox") {
    return rollout.sandboxStatus;
  }
  if (stage === "pilot") {
    return rollout.pilotStatus;
  }
  return rollout.productionStatus;
}

function cloneActions(
  actions: ReadonlyArray<ResourceActionDescriptor>,
): ResourceActionDescriptor[] {
  return actions.map((action) => ({ ...action }));
}

function createAction(
  action: RolloutAction,
  enabled: boolean,
  disabledReasonCode?: string,
) {
  return {
    ...ACTION_CATALOG[action],
    enabled,
    ...(disabledReasonCode ? { disabledReasonCode } : {}),
  } satisfies ResourceActionDescriptor;
}

function actionSetFor(
  stage: TenantRolloutStage,
  gateStatus: TenantRolloutGateStatus,
) {
  const actions: ResourceActionDescriptor[] = [];
  const inRollbackHold = stage === "rollback_hold";

  actions.push(
    createAction(
      "mark_gate_pending",
      !inRollbackHold && gateStatus !== "pending",
      inRollbackHold
        ? "tenant_in_rollback_hold"
        : gateStatus === "pending"
          ? "gate_already_pending"
          : undefined,
    ),
    createAction(
      "mark_gate_ready",
      !inRollbackHold && gateStatus !== "ready",
      inRollbackHold
        ? "tenant_in_rollback_hold"
        : gateStatus === "ready"
          ? "gate_already_ready"
          : undefined,
    ),
    createAction(
      "approve_gate",
      !inRollbackHold && gateStatus !== "approved",
      inRollbackHold
        ? "tenant_in_rollback_hold"
        : gateStatus === "approved"
          ? "gate_already_approved"
          : undefined,
    ),
    createAction(
      "block_gate",
      !inRollbackHold && gateStatus !== "blocked",
      inRollbackHold
        ? "tenant_in_rollback_hold"
        : gateStatus === "blocked"
          ? "gate_already_blocked"
          : undefined,
    ),
  );

  if (stage === "sandbox") {
    actions.push(
      createAction(
        "promote_to_pilot",
        gateStatus === "approved",
        gateStatus === "approved" ? undefined : "sandbox_gate_not_approved",
      ),
    );
  }

  if (stage === "pilot") {
    actions.push(
      createAction(
        "promote_to_production",
        gateStatus === "approved",
        gateStatus === "approved" ? undefined : "pilot_gate_not_approved",
      ),
    );
  }

  actions.push(
    createAction(
      "enter_rollback_hold",
      stage === "production",
      stage === "rollback_hold"
        ? "tenant_already_in_rollback_hold"
        : "rollback_hold_requires_production_cutover",
    ),
    createAction(
      "resolve_rollback_hold",
      inRollbackHold,
      inRollbackHold ? undefined : "tenant_not_in_rollback_hold",
    ),
  );

  return actions;
}

function resolveActorLabel(
  actorLabel?: string | null,
  actorId?: string | null,
): string {
  return actorLabel?.trim() || actorId?.trim() || "platform_admin";
}

export function createTenantRolloutState(
  now: string,
  actorLabel = "platform_admin",
): PlatformTenantRolloutState {
  return {
    stage: "sandbox",
    sandboxStatus: "ready",
    pilotStatus: "pending",
    productionStatus: "pending",
    cutoverOwner: null,
    rollbackOwner: null,
    rollbackPrepared: false,
    lastPromotedAt: null,
    enteredStageAt: now,
    enteredGateAt: now,
    lastUpdatedBy: actorLabel,
    notes:
      "Start in sandbox. Promote only after bootstrap defaults, billing baseline, notifications, and integration package are verified.",
  };
}

export function toTenantRolloutStateMachineRecord(
  tenant: Pick<
    PlatformAdminTenantRecord,
    "id" | "status" | "createdAt" | "updatedAt" | "rollout"
  >,
): TenantRolloutStateMachineRecord {
  const stage =
    tenant.status === "rollback_hold"
      ? "rollback_hold"
      : assertStage(tenant.rollout.stage);
  const gateStatus =
    stage === "rollback_hold"
      ? "blocked"
      : assertGateStatus(currentGateStatusForStage(tenant.rollout, stage));

  return {
    tenantId: tenant.id,
    stage,
    gateStatus,
    cutoverOwnerUserId: null,
    cutoverOwnerDisplayName: tenant.rollout.cutoverOwner,
    rollbackOwnerUserId: null,
    rollbackOwnerDisplayName: tenant.rollout.rollbackOwner,
    rollbackPrepared: tenant.rollout.rollbackPrepared,
    enteredStageAt:
      tenant.rollout.enteredStageAt ??
      tenant.rollout.lastPromotedAt ??
      tenant.createdAt,
    enteredGateAt:
      tenant.rollout.enteredGateAt ??
      tenant.rollout.lastPromotedAt ??
      tenant.updatedAt,
    lastUpdatedBy: tenant.rollout.lastUpdatedBy ?? "platform_admin",
    lastUpdatedAt: tenant.updatedAt,
    availableActions: actionSetFor(stage, gateStatus),
  };
}

export function transitionTenantRolloutGate(
  rollout: PlatformTenantRolloutState,
  input: RolloutGateTransitionInput,
): PlatformTenantRolloutState {
  const next: PlatformTenantRolloutState = { ...rollout };
  const stage = assertStage(input.stage ?? next.stage);

  if (stage === "sandbox") {
    next.sandboxStatus = input.gateStatus;
  } else if (stage === "pilot") {
    next.pilotStatus = input.gateStatus;
  } else {
    next.productionStatus = input.gateStatus;
  }

  next.enteredGateAt = input.occurredAt;
  next.lastUpdatedBy = resolveActorLabel(input.actorLabel, input.actorId);
  return next;
}

export function transitionTenantRolloutStage(
  rollout: PlatformTenantRolloutState,
  input: RolloutStageTransitionInput,
): PlatformTenantRolloutState {
  const next: PlatformTenantRolloutState = {
    ...rollout,
    stage: input.stage,
    lastPromotedAt: input.occurredAt,
    enteredStageAt: input.occurredAt,
    lastUpdatedBy: resolveActorLabel(input.actorLabel, input.actorId),
  };

  if (input.notes !== undefined) {
    next.notes = input.notes?.trim() ? input.notes.trim() : null;
  }

  if (input.stage === "sandbox") {
    next.sandboxStatus = "approved";
    next.enteredGateAt = input.occurredAt;
  } else if (input.stage === "pilot") {
    next.sandboxStatus = "approved";
    next.pilotStatus = "approved";
    next.enteredGateAt = input.occurredAt;
  } else {
    next.sandboxStatus = "approved";
    next.pilotStatus = "approved";
    next.productionStatus = "approved";
    next.enteredGateAt = input.occurredAt;
  }

  return next;
}

export function listTenantRolloutAvailableActions(input: {
  stage: TenantRolloutStage;
  gateStatus: TenantRolloutGateStatus;
}) {
  return cloneActions(actionSetFor(input.stage, input.gateStatus));
}
