import type {
  PlatformAdminTenantRecord,
  ResourceActionDescriptor,
  TenantRolloutGateStatus,
  TenantRolloutStateMachineRecord,
  TenantRolloutStage,
  UiRefreshMetadata,
} from "@drts/contracts";

const SANDBOX_EVIDENCE = [
  "bootstrap_defaults_verified",
  "billing_baseline_configured",
  "notification_routing_verified",
  "integration_package_verified",
];

const PILOT_EVIDENCE = ["sandbox_gate_approved", "pilot_launch_reason"];

const PRODUCTION_EVIDENCE = [
  "pilot_gate_approved",
  "cutover_owner_assigned",
  "rollback_owner_assigned",
  "rollback_plan_verified",
  "required_roles_acknowledged",
];

const ROLLBACK_EVIDENCE = ["rollback_reason", "incident_or_regression_reference"];

export function buildTenantRolloutStateMachineRecord(
  tenant: PlatformAdminTenantRecord,
): TenantRolloutStateMachineRecord {
  const currentStage = deriveCurrentStage(tenant);
  const nextActions = buildNextActions(tenant, currentStage);
  const rollbackActions = buildRollbackActions(tenant, currentStage);

  return {
    tenantId: tenant.id,
    currentStage,
    gates: [
      {
        gateCode: "sandbox",
        label: "Sandbox readiness",
        status: tenant.rollout.sandboxStatus,
        requiredEvidence: SANDBOX_EVIDENCE,
        blockers: buildSandboxBlockers(tenant),
      },
      {
        gateCode: "pilot",
        label: "Pilot approval",
        status: tenant.rollout.pilotStatus,
        requiredEvidence: PILOT_EVIDENCE,
        blockers: buildPilotBlockers(tenant),
      },
      {
        gateCode: "production",
        label: "Production cutover",
        status: tenant.rollout.productionStatus,
        requiredEvidence: PRODUCTION_EVIDENCE,
        blockers: buildProductionBlockers(tenant),
      },
      {
        gateCode: "rollback_hold",
        label: "Rollback hold",
        status: buildRollbackGateStatus(tenant),
        requiredEvidence: ROLLBACK_EVIDENCE,
        blockers: buildRollbackBlockers(tenant),
      },
    ],
    nextActions,
    rollback: {
      rollbackPrepared: tenant.rollout.rollbackPrepared,
      cutoverOwner: tenant.rollout.cutoverOwner,
      rollbackOwner: tenant.rollout.rollbackOwner,
      ...(tenant.rollout.lastRollbackAt
        ? { lastRollbackAt: tenant.rollout.lastRollbackAt }
        : {}),
      rollbackActions,
    },
    refresh: buildRefreshMetadata(),
  };
}

function deriveCurrentStage(
  tenant: PlatformAdminTenantRecord,
): TenantRolloutStage {
  return tenant.status === "rollback_hold" ? "rollback_hold" : tenant.rollout.stage;
}

function buildRefreshMetadata(): UiRefreshMetadata {
  return {
    generatedAt: new Date().toISOString(),
    staleAfterMs: 30_000,
    dataFreshness: "fresh",
    source: "live",
  };
}

function buildNextActions(
  tenant: PlatformAdminTenantRecord,
  currentStage: TenantRolloutStage,
): ResourceActionDescriptor[] {
  if (currentStage === "sandbox") {
    return [
      {
        action: "tenant.rollout.advance.pilot",
        enabled: tenant.rollout.sandboxStatus === "approved",
        disabledReasonCode:
          tenant.rollout.sandboxStatus === "approved"
            ? undefined
            : "sandbox_gate_not_approved",
        riskLevel: "medium",
      },
      buildRollbackHoldAction(true),
    ];
  }

  if (currentStage === "pilot") {
    const blockers = buildProductionBlockers(tenant);
    return [
      {
        action: "tenant.rollout.advance.production",
        enabled: blockers.length === 0 && tenant.rollout.pilotStatus === "approved",
        disabledReasonCode:
          blockers.length === 0 && tenant.rollout.pilotStatus === "approved"
            ? undefined
            : "production_gate_blocked",
        requiresReason: true,
        riskLevel: "high",
      },
      buildRollbackHoldAction(true),
    ];
  }

  if (currentStage === "production") {
    return [buildRollbackHoldAction(true)];
  }

  return [
    {
      action: `tenant.rollout.resolve.${tenant.rollout.stage}`,
      enabled: true,
      requiresReason: true,
      riskLevel: "medium",
    },
  ];
}

function buildRollbackActions(
  tenant: PlatformAdminTenantRecord,
  currentStage: TenantRolloutStage,
): ResourceActionDescriptor[] {
  if (currentStage === "rollback_hold") {
    return [
      {
        action: `tenant.rollout.resolve.${tenant.rollout.stage}`,
        enabled: true,
        requiresReason: true,
        riskLevel: "medium",
      },
    ];
  }

  return [buildRollbackHoldAction(tenant.rollout.rollbackPrepared)];
}

function buildRollbackHoldAction(prepared: boolean): ResourceActionDescriptor {
  return {
    action: "tenant.rollout.advance.rollback_hold",
    enabled: true,
    requiresReason: true,
    riskLevel: prepared ? "high" : "medium",
  };
}

function buildRollbackGateStatus(
  tenant: PlatformAdminTenantRecord,
): TenantRolloutGateStatus {
  if (tenant.status === "rollback_hold") {
    return tenant.rollout.productionStatus;
  }
  return tenant.rollout.rollbackPrepared ? "ready" : "pending";
}

function buildSandboxBlockers(tenant: PlatformAdminTenantRecord): string[] {
  return tenant.rollout.sandboxStatus === "blocked"
    ? ["Sandbox rollout is explicitly blocked."]
    : [];
}

function buildPilotBlockers(tenant: PlatformAdminTenantRecord): string[] {
  const blockers: string[] = [];
  if (tenant.rollout.sandboxStatus !== "approved") {
    blockers.push("Sandbox gate must be approved before pilot.");
  }
  if (tenant.rollout.pilotStatus === "blocked") {
    blockers.push("Pilot gate is blocked.");
  }
  return blockers;
}

function buildProductionBlockers(tenant: PlatformAdminTenantRecord): string[] {
  const blockers: string[] = [];
  if (tenant.rollout.pilotStatus !== "approved") {
    blockers.push("Pilot gate must be approved before production.");
  }
  if (!tenant.rollout.cutoverOwner) {
    blockers.push("Cutover owner is required.");
  }
  if (!tenant.rollout.rollbackOwner) {
    blockers.push("Rollback owner is required.");
  }
  if (!tenant.rollout.rollbackPrepared) {
    blockers.push("Rollback plan must be prepared.");
  }

  const unacknowledgedRequired = tenant.bootstrapDefaults.roleDefaults
    .filter(
      (
        role: PlatformAdminTenantRecord["bootstrapDefaults"]["roleDefaults"][number],
      ) => role.required && !role.acknowledgedAt,
    )
    .map(
      (
        role: PlatformAdminTenantRecord["bootstrapDefaults"]["roleDefaults"][number],
      ) => role.roleCode,
    );
  if (unacknowledgedRequired.length > 0) {
    blockers.push(
      `Required roles not acknowledged: ${unacknowledgedRequired.join(", ")}.`,
    );
  }

  if (tenant.rollout.productionStatus === "blocked") {
    blockers.push("Production gate is blocked.");
  }

  return blockers;
}

function buildRollbackBlockers(tenant: PlatformAdminTenantRecord): string[] {
  const blockers: string[] = [];
  if (!tenant.rollout.rollbackPrepared) {
    blockers.push("Rollback plan has not been prepared.");
  }
  if (tenant.status === "rollback_hold") {
    blockers.push("Rollback hold is active until the tenant returns to a safe stage.");
  }
  return blockers;
}
