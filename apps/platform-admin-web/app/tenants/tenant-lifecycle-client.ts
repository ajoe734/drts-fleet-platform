import {
  PLATFORM_TENANT_GATE_STATUSES,
  PLATFORM_TENANT_INTEGRATION_MODES,
  PLATFORM_TENANT_MODULES,
  PLATFORM_TENANT_ROLLOUT_STAGES,
  type AcknowledgeTenantRoleCommand,
  type InviteTenantRoleCommand,
  type PlatformAdminTenantRecord,
  type PlatformTenantGateStatus,
  type PlatformTenantModule,
  type PlatformTenantRolloutStage,
  type ResourceActionDescriptor,
  type SetPlatformTenantRolloutStageCommand,
  type UpdatePlatformTenantOnboardingCommand,
  type UpdatePlatformTenantSettingsCommand,
} from "@drts/contracts";
import {
  parseCsv,
  toTenantOnboardingFormState,
  type OnboardingFormState,
  type TenantFormState,
} from "../../components/tenant-governance-shared";

export const TENANT_LIFECYCLE_WRITE_SCOPE = "foundation:write" as const;
export const TENANT_LIFECYCLE_READ_SCOPE = "foundation:read" as const;
export const TENANT_LIFECYCLE_ALLOWED_REALM = "platform" as const;
export const TENANT_LIFECYCLE_WRITE_ROLES = [
  "pa_tenant_mgr",
  "pa_super_admin",
  "platform_admin",
] as const;

export type TenantLifecycleActionCode =
  | "update_settings"
  | "update_onboarding"
  | "set_rollout_stage"
  | "suspend"
  | "activate"
  | "rollback_hold"
  | "invite_role"
  | "acknowledge_role";

export type TenantLifecycleAuthorityInput = {
  realm?: string | null;
  roles?: readonly string[] | null;
  scopes?: readonly string[] | null;
};

export type TenantOnboardingDraftState = OnboardingFormState & {
  sandboxStatus: PlatformTenantGateStatus;
  pilotStatus: PlatformTenantGateStatus;
  productionStatus: PlatformTenantGateStatus;
};

export type PlatformTenantLifecycleClientSurface = {
  getPlatformTenant: (tenantId: string) => Promise<PlatformAdminTenantRecord>;
  updatePlatformTenantSettings: (
    tenantId: string,
    input: UpdatePlatformTenantSettingsCommand,
  ) => Promise<PlatformAdminTenantRecord>;
  updatePlatformTenantOnboarding: (
    tenantId: string,
    input: UpdatePlatformTenantOnboardingCommand,
  ) => Promise<PlatformAdminTenantRecord>;
  setPlatformTenantRolloutStage: (
    tenantId: string,
    input: SetPlatformTenantRolloutStageCommand,
  ) => Promise<PlatformAdminTenantRecord>;
  inviteTenantRole: (
    tenantId: string,
    input: InviteTenantRoleCommand,
  ) => Promise<PlatformAdminTenantRecord>;
  acknowledgeTenantRole: (
    tenantId: string,
    input: AcknowledgeTenantRoleCommand,
  ) => Promise<PlatformAdminTenantRecord>;
  rollbackHoldTenant: (tenantId: string) => Promise<PlatformAdminTenantRecord>;
  suspendTenant?: (tenantId: string) => Promise<unknown>;
  activateTenant?: (tenantId: string) => Promise<unknown>;
  post?: <T>(path: string, options?: { body?: unknown }) => Promise<T>;
};

export type TenantLifecycleActionDescriptor = ResourceActionDescriptor & {
  reason: string | null;
  requiredScopes: readonly string[];
  confirmation: "low" | "medium" | "high";
};

export type TenantLifecycleMutationOutcome = {
  action: TenantLifecycleActionCode;
  ack: PlatformAdminTenantRecord;
  tenant: PlatformAdminTenantRecord;
  updatedAt: string;
  reason?: string;
};

export function hasTenantLifecycleWriteAuthority(
  authority: TenantLifecycleAuthorityInput | null | undefined,
): boolean {
  if (!authority) {
    return false;
  }

  if (
    authority.realm !== undefined &&
    authority.realm !== null &&
    authority.realm !== TENANT_LIFECYCLE_ALLOWED_REALM
  ) {
    return false;
  }

  const scopes = authority.scopes ?? [];
  if (!scopes.includes(TENANT_LIFECYCLE_WRITE_SCOPE)) {
    return false;
  }

  if (authority.roles !== undefined && authority.roles !== null) {
    const allowedRoleSet = new Set<string>(TENANT_LIFECYCLE_WRITE_ROLES);
    const hasAllowedRole = authority.roles.some((role) =>
      allowedRoleSet.has(role),
    );
    if (!hasAllowedRole) {
      return false;
    }
  }

  return true;
}

export function assertTenantLifecycleWriteAuthority(
  authority: TenantLifecycleAuthorityInput | null | undefined,
): void {
  if (!hasTenantLifecycleWriteAuthority(authority)) {
    throw new Error(
      "FORBIDDEN_TENANT_LIFECYCLE_WRITE: Requires platform realm with pa_tenant_mgr or pa_super_admin role and foundation:write scope.",
    );
  }
}

export function assertHighRiskReason(
  reason: string | null | undefined,
  action: "suspend" | "rollback_hold",
): string {
  const trimmed = reason?.trim() ?? "";
  if (!trimmed) {
    throw new Error(
      `HIGH_RISK_REASON_REQUIRED: Non-empty audit reason is required before executing ${action}.`,
    );
  }
  return trimmed;
}

export function assertCanonicalTenantRecord(
  candidate: unknown,
  expectedTenantId: string,
  source: string,
): PlatformAdminTenantRecord {
  if (!candidate || typeof candidate !== "object") {
    throw new Error(
      `INVALID_TENANT_ACK: ${source} did not return a canonical tenant object.`,
    );
  }

  const record = candidate as Partial<PlatformAdminTenantRecord>;
  if (typeof record.id !== "string" || !record.id.trim()) {
    throw new Error(
      `INVALID_TENANT_ACK: ${source} response is missing canonical tenant id.`,
    );
  }

  if (record.id !== expectedTenantId) {
    throw new Error(
      `CROSS_TENANT_REFUSED: ${source} returned tenant ${record.id} instead of requested tenant ${expectedTenantId}.`,
    );
  }

  if (
    typeof record.code !== "string" ||
    typeof record.name !== "string" ||
    typeof record.status !== "string" ||
    !record.quotas ||
    !Array.isArray(record.enabledModules) ||
    !record.rollout ||
    !record.bootstrapDefaults ||
    !record.integrationPackage ||
    typeof record.updatedAt !== "string"
  ) {
    throw new Error(
      `INVALID_TENANT_ACK: ${source} response is missing required canonical tenant fields.`,
    );
  }

  return record as PlatformAdminTenantRecord;
}

export function toTenantOnboardingDraftState(
  tenant: PlatformAdminTenantRecord,
): TenantOnboardingDraftState {
  return {
    ...toTenantOnboardingFormState(tenant),
    sandboxStatus: tenant.rollout.sandboxStatus,
    pilotStatus: tenant.rollout.pilotStatus,
    productionStatus: tenant.rollout.productionStatus,
  };
}

export function parseQuotaInput(raw: string, fieldName: string): number {
  const trimmed = String(raw ?? "").trim();
  if (!trimmed) {
    throw new Error(`INVALID_QUOTA: ${fieldName} is required.`);
  }
  const numeric = Number(trimmed);
  if (!Number.isFinite(numeric)) {
    throw new Error(`INVALID_QUOTA: ${fieldName} must be a finite number.`);
  }
  return Math.trunc(numeric);
}

export function buildUpdateTenantSettingsCommand(
  form: Pick<
    TenantFormState,
    | "name"
    | "activeDrivers"
    | "monthlyBookings"
    | "monthlyApiCalls"
    | "enabledModules"
  >,
): UpdatePlatformTenantSettingsCommand {
  const trimmedName = form.name.trim();
  if (!trimmedName) {
    throw new Error("INVALID_TENANT_NAME: Tenant name cannot be empty.");
  }

  return {
    name: trimmedName,
    enabledModules: [...form.enabledModules],
    quotas: {
      activeDrivers: parseQuotaInput(form.activeDrivers, "activeDrivers"),
      monthlyBookings: parseQuotaInput(form.monthlyBookings, "monthlyBookings"),
      monthlyApiCalls: parseQuotaInput(form.monthlyApiCalls, "monthlyApiCalls"),
    },
  };
}

export function assertValidTenantSettingsCommand(
  command: UpdatePlatformTenantSettingsCommand,
): void {
  const quotas = command.quotas;
  if (quotas) {
    const values = [
      quotas.activeDrivers,
      quotas.monthlyBookings,
      quotas.monthlyApiCalls,
    ];
    if (
      values.some(
        (value) =>
          value !== undefined && (!Number.isFinite(value) || value < 0),
      )
    ) {
      throw new Error("INVALID_QUOTA: Quota values must be zero or positive.");
    }
  }

  if (command.enabledModules !== undefined) {
    const validModules = new Set<string>(PLATFORM_TENANT_MODULES);
    if (
      command.enabledModules.length === 0 ||
      command.enabledModules.some(
        (moduleCode) => !validModules.has(moduleCode as PlatformTenantModule),
      )
    ) {
      throw new Error(
        "INVALID_TENANT_MODULES: enabledModules must contain only supported tenant modules.",
      );
    }
  }
}

export function buildUpdateTenantOnboardingCommand(
  form: TenantOnboardingDraftState,
): UpdatePlatformTenantOnboardingCommand {
  if (!PLATFORM_TENANT_INTEGRATION_MODES.includes(form.integrationMode)) {
    throw new Error(
      `INVALID_INTEGRATION_MODE: Unsupported integration mode ${String(form.integrationMode)}.`,
    );
  }

  const gateStatuses: PlatformTenantGateStatus[] = [
    form.sandboxStatus,
    form.pilotStatus,
    form.productionStatus,
  ];
  if (
    gateStatuses.some(
      (status) => !PLATFORM_TENANT_GATE_STATUSES.includes(status),
    )
  ) {
    throw new Error("INVALID_ROLLOUT_GATE: Unsupported rollout gate status.");
  }

  return {
    billingBaseline: {
      invoiceTitle: form.invoiceTitle.trim(),
      contactName: form.billingContactName.trim(),
      email: form.billingContactEmail.trim(),
    },
    webhookEvents: parseCsv(form.webhookEvents),
    integrationPackage: {
      mode: form.integrationMode,
      sandboxBaseUrl: form.sandboxBaseUrl.trim() || null,
      productionBaseUrl: form.productionBaseUrl.trim() || null,
      apiKeyScopes: parseCsv(form.apiKeyScopes),
    },
    rollout: {
      sandboxStatus: form.sandboxStatus,
      pilotStatus: form.pilotStatus,
      productionStatus: form.productionStatus,
      cutoverOwner: form.cutoverOwner.trim() || null,
      rollbackOwner: form.rollbackOwner.trim() || null,
      notes: form.notes.trim() || null,
      rollbackPrepared: Boolean(form.rollbackPrepared),
    },
  };
}

export function buildSetTenantRolloutStageCommand(
  stage: PlatformTenantRolloutStage,
  notes?: string | null,
): SetPlatformTenantRolloutStageCommand {
  if (!PLATFORM_TENANT_ROLLOUT_STAGES.includes(stage)) {
    throw new Error(
      `INVALID_ROLLOUT_STAGE: Unsupported rollout stage ${String(stage)}.`,
    );
  }

  const trimmedNotes = notes?.trim();
  return {
    stage,
    notes: trimmedNotes ? trimmedNotes : null,
  };
}

export function buildTenantLifecycleAvailableActions(
  tenant: PlatformAdminTenantRecord,
  authority: TenantLifecycleAuthorityInput | null | undefined,
): Record<TenantLifecycleActionCode, TenantLifecycleActionDescriptor> {
  const canWrite = hasTenantLifecycleWriteAuthority(authority);
  const authDeniedReason = canWrite
    ? null
    : "Requires platform realm with pa_tenant_mgr or pa_super_admin role and foundation:write scope.";

  const requiredRolesAcknowledged = tenant.bootstrapDefaults.roleDefaults
    .filter((role) => role.required)
    .every((role) => Boolean(role.acknowledgedAt));

  const rolloutReason =
    authDeniedReason ??
    (tenant.status === "rollback_hold"
      ? "Tenant is in rollback_hold; activate before promoting stage."
      : !requiredRolesAcknowledged
        ? "Production promotion requires all required bootstrap roles to be acknowledged."
        : null);

  const suspendReason =
    authDeniedReason ??
    (tenant.status === "paused" ? "Tenant is already paused." : null);

  const activateReason =
    authDeniedReason ??
    (tenant.status === "active" ? "Tenant is already active." : null);

  const rollbackHoldReason =
    authDeniedReason ??
    (tenant.status === "rollback_hold"
      ? "Tenant is already in rollback_hold."
      : !tenant.rollout.rollbackOwner?.trim()
        ? "Assign a rollbackOwner before entering rollback_hold."
        : null);

  return {
    update_settings: {
      action: "update_settings",
      enabled: canWrite,
      reason: authDeniedReason,
      ...(authDeniedReason ? { disabledReasonCode: authDeniedReason } : {}),
      requiredScopes: [TENANT_LIFECYCLE_WRITE_SCOPE],
      riskLevel: "medium",
      confirmation: "medium",
      requiresReason: false,
    },
    update_onboarding: {
      action: "update_onboarding",
      enabled: canWrite,
      reason: authDeniedReason,
      ...(authDeniedReason ? { disabledReasonCode: authDeniedReason } : {}),
      requiredScopes: [TENANT_LIFECYCLE_WRITE_SCOPE],
      riskLevel: "medium",
      confirmation: "medium",
      requiresReason: false,
    },
    set_rollout_stage: {
      action: "set_rollout_stage",
      enabled: canWrite && tenant.status !== "rollback_hold",
      reason: rolloutReason,
      ...(rolloutReason ? { disabledReasonCode: rolloutReason } : {}),
      requiredScopes: [TENANT_LIFECYCLE_WRITE_SCOPE],
      riskLevel: "medium",
      confirmation: "medium",
      requiresReason: false,
    },
    suspend: {
      action: "suspend",
      enabled: canWrite && tenant.status !== "paused",
      reason: suspendReason,
      ...(suspendReason ? { disabledReasonCode: suspendReason } : {}),
      requiredScopes: [TENANT_LIFECYCLE_WRITE_SCOPE],
      riskLevel: "high",
      confirmation: "high",
      requiresReason: true,
    },
    activate: {
      action: "activate",
      enabled: canWrite && tenant.status !== "active",
      reason: activateReason,
      ...(activateReason ? { disabledReasonCode: activateReason } : {}),
      requiredScopes: [TENANT_LIFECYCLE_WRITE_SCOPE],
      riskLevel: "medium",
      confirmation: "medium",
      requiresReason: false,
    },
    rollback_hold: {
      action: "rollback_hold",
      enabled:
        canWrite &&
        tenant.status !== "rollback_hold" &&
        Boolean(tenant.rollout.rollbackOwner?.trim()),
      reason: rollbackHoldReason,
      ...(rollbackHoldReason ? { disabledReasonCode: rollbackHoldReason } : {}),
      requiredScopes: [TENANT_LIFECYCLE_WRITE_SCOPE],
      riskLevel: "high",
      confirmation: "high",
      requiresReason: true,
    },
    invite_role: {
      action: "invite_role",
      enabled: canWrite,
      reason: authDeniedReason,
      ...(authDeniedReason ? { disabledReasonCode: authDeniedReason } : {}),
      requiredScopes: [TENANT_LIFECYCLE_WRITE_SCOPE],
      riskLevel: "medium",
      confirmation: "medium",
      requiresReason: false,
    },
    acknowledge_role: {
      action: "acknowledge_role",
      enabled: canWrite,
      reason: authDeniedReason,
      ...(authDeniedReason ? { disabledReasonCode: authDeniedReason } : {}),
      requiredScopes: [TENANT_LIFECYCLE_WRITE_SCOPE],
      riskLevel: "medium",
      confirmation: "medium",
      requiresReason: false,
    },
  };
}

export async function fetchAuthoritativeTenant(
  client: PlatformTenantLifecycleClientSurface,
  tenantId: string,
): Promise<PlatformAdminTenantRecord> {
  const record = await client.getPlatformTenant(tenantId);
  return assertCanonicalTenantRecord(
    record,
    tenantId,
    "getPlatformTenant.readback",
  );
}

async function commitWithAuthoritativeReadback(
  client: PlatformTenantLifecycleClientSurface,
  tenantId: string,
  action: TenantLifecycleActionCode,
  executeMutation: () => Promise<unknown>,
  reason?: string,
): Promise<TenantLifecycleMutationOutcome> {
  const rawAck = await executeMutation();
  const ack = assertCanonicalTenantRecord(rawAck, tenantId, `${action}.ack`);
  const tenant = await fetchAuthoritativeTenant(client, tenantId);

  return {
    action,
    ack,
    tenant,
    updatedAt: tenant.updatedAt,
    ...(reason !== undefined ? { reason } : {}),
  };
}

export async function updateTenantSettingsWithReadback(
  client: PlatformTenantLifecycleClientSurface,
  tenantId: string,
  form: Pick<
    TenantFormState,
    | "name"
    | "activeDrivers"
    | "monthlyBookings"
    | "monthlyApiCalls"
    | "enabledModules"
  >,
  authority?: TenantLifecycleAuthorityInput | null,
): Promise<TenantLifecycleMutationOutcome> {
  if (authority !== undefined) {
    assertTenantLifecycleWriteAuthority(authority);
  }

  const command = buildUpdateTenantSettingsCommand(form);

  return commitWithAuthoritativeReadback(
    client,
    tenantId,
    "update_settings",
    async () => {
      const result = await client.updatePlatformTenantSettings(
        tenantId,
        command,
      );
      assertValidTenantSettingsCommand(command);
      return result;
    },
  );
}

export async function updateTenantOnboardingWithReadback(
  client: PlatformTenantLifecycleClientSurface,
  tenantId: string,
  form: TenantOnboardingDraftState,
  authority?: TenantLifecycleAuthorityInput | null,
): Promise<TenantLifecycleMutationOutcome> {
  if (authority !== undefined) {
    assertTenantLifecycleWriteAuthority(authority);
  }

  const command = buildUpdateTenantOnboardingCommand(form);

  return commitWithAuthoritativeReadback(
    client,
    tenantId,
    "update_onboarding",
    () => client.updatePlatformTenantOnboarding(tenantId, command),
  );
}

export async function setTenantRolloutStageWithReadback(
  client: PlatformTenantLifecycleClientSurface,
  tenantId: string,
  input: SetPlatformTenantRolloutStageCommand,
  authority?: TenantLifecycleAuthorityInput | null,
): Promise<TenantLifecycleMutationOutcome> {
  if (authority !== undefined) {
    assertTenantLifecycleWriteAuthority(authority);
  }

  const command = buildSetTenantRolloutStageCommand(input.stage, input.notes);

  return commitWithAuthoritativeReadback(
    client,
    tenantId,
    "set_rollout_stage",
    () => client.setPlatformTenantRolloutStage(tenantId, command),
  );
}

export async function suspendTenantWithReadback(
  client: PlatformTenantLifecycleClientSurface,
  tenantId: string,
  reason: string,
  authority?: TenantLifecycleAuthorityInput | null,
): Promise<TenantLifecycleMutationOutcome> {
  if (authority !== undefined) {
    assertTenantLifecycleWriteAuthority(authority);
  }

  const trimmedReason = assertHighRiskReason(reason, "suspend");

  return commitWithAuthoritativeReadback(
    client,
    tenantId,
    "suspend",
    async () => {
      if (typeof client.suspendTenant === "function") {
        return client.suspendTenant(tenantId);
      }
      if (typeof client.post === "function") {
        return client.post<PlatformAdminTenantRecord>(
          `/api/platform-admin/tenants/${tenantId}/suspend`,
          { body: {} },
        );
      }
      throw new Error("CLIENT_METHOD_MISSING: suspendTenant is not available.");
    },
    trimmedReason,
  );
}

export async function activateTenantWithReadback(
  client: PlatformTenantLifecycleClientSurface,
  tenantId: string,
  authority?: TenantLifecycleAuthorityInput | null,
): Promise<TenantLifecycleMutationOutcome> {
  if (authority !== undefined) {
    assertTenantLifecycleWriteAuthority(authority);
  }

  return commitWithAuthoritativeReadback(
    client,
    tenantId,
    "activate",
    async () => {
      if (typeof client.activateTenant === "function") {
        return client.activateTenant(tenantId);
      }
      if (typeof client.post === "function") {
        return client.post<PlatformAdminTenantRecord>(
          `/api/platform-admin/tenants/${tenantId}/activate`,
          { body: {} },
        );
      }
      throw new Error(
        "CLIENT_METHOD_MISSING: activateTenant is not available.",
      );
    },
  );
}

export async function rollbackHoldTenantWithReadback(
  client: PlatformTenantLifecycleClientSurface,
  tenantId: string,
  reason: string,
  authority?: TenantLifecycleAuthorityInput | null,
): Promise<TenantLifecycleMutationOutcome> {
  if (authority !== undefined) {
    assertTenantLifecycleWriteAuthority(authority);
  }

  const trimmedReason = assertHighRiskReason(reason, "rollback_hold");

  return commitWithAuthoritativeReadback(
    client,
    tenantId,
    "rollback_hold",
    () => client.rollbackHoldTenant(tenantId),
    trimmedReason,
  );
}

export async function inviteTenantRoleWithReadback(
  client: PlatformTenantLifecycleClientSurface,
  tenantId: string,
  command: InviteTenantRoleCommand,
  authority?: TenantLifecycleAuthorityInput | null,
): Promise<TenantLifecycleMutationOutcome> {
  if (authority !== undefined) {
    assertTenantLifecycleWriteAuthority(authority);
  }

  return commitWithAuthoritativeReadback(
    client,
    tenantId,
    "invite_role",
    () => client.inviteTenantRole(tenantId, command),
  );
}

export async function acknowledgeTenantRoleWithReadback(
  client: PlatformTenantLifecycleClientSurface,
  tenantId: string,
  command: AcknowledgeTenantRoleCommand,
  authority?: TenantLifecycleAuthorityInput | null,
): Promise<TenantLifecycleMutationOutcome> {
  if (authority !== undefined) {
    assertTenantLifecycleWriteAuthority(authority);
  }

  return commitWithAuthoritativeReadback(
    client,
    tenantId,
    "acknowledge_role",
    () => client.acknowledgeTenantRole(tenantId, command),
  );
}
