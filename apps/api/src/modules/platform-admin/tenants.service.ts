import {
  HttpStatus,
  Injectable,
  Logger,
  OnModuleInit,
  Optional,
} from "@nestjs/common";

import type {
  AcknowledgeTenantRoleCommand,
  AuditLogRecord,
  CrossAppResourceLink,
  CreatePlatformTenantCommand,
  InviteTenantRoleCommand,
  PlatformAdminTenantRecord,
  PlatformAdminTenantListItem,
  PlatformAdminTenantListResponse,
  PlatformTenantBootstrapDefaults,
  PlatformTenantBootstrapRoleDefault,
  PlatformTenantGateStatus,
  PlatformTenantIntegrationMode,
  PlatformTenantIntegrationPackage,
  PlatformTenantLifecycleActionCommand,
  PlatformTenantModule,
  PlatformTenantQuotaSummary,
  PlatformTenantRolloutStage,
  PlatformTenantRolloutState,
  RefreshTier,
  ResourceActionDescriptor,
  SetPlatformTenantRolloutStageCommand,
  TenantNotificationSubscription,
  UiRefreshMetadata,
  UpdatePlatformTenantOnboardingCommand,
  UpdatePlatformTenantSettingsCommand,
} from "@drts/contracts";
import {
  PLATFORM_TENANT_GATE_STATUSES,
  PLATFORM_TENANT_MODULES,
  PLATFORM_TENANT_ROLLOUT_STAGES,
} from "@drts/contracts";

import { ApiRequestError } from "../../common/api-envelope";
import { AuditNotificationService } from "../audit-notification/audit-notification.service";
import {
  PlatformAdminRepository,
  type PersistPlatformAdminChanges,
} from "./platform-admin.repository";

export type TenantSummary = PlatformAdminTenantRecord;

const DEFAULT_QUOTAS: PlatformTenantQuotaSummary = {
  activeDrivers: 25,
  monthlyBookings: 500,
  monthlyApiCalls: 10000,
};

const DEFAULT_ROLE_DEFAULTS: PlatformTenantBootstrapRoleDefault[] = [
  {
    roleCode: "tenant_admin",
    displayName: "Tenant Admin",
    required: true,
    invitedAt: null,
    acknowledgedAt: null,
  },
  {
    roleCode: "tenant_ops_admin",
    displayName: "Tenant Ops Admin",
    required: true,
    invitedAt: null,
    acknowledgedAt: null,
  },
  {
    roleCode: "tenant_finance_admin",
    displayName: "Tenant Finance Admin",
    required: false,
    invitedAt: null,
    acknowledgedAt: null,
  },
  {
    roleCode: "tenant_viewer",
    displayName: "Tenant Viewer",
    required: false,
    invitedAt: null,
    acknowledgedAt: null,
  },
];

const DEFAULT_NOTIFICATION_SUBSCRIPTIONS: TenantNotificationSubscription[] = [
  {
    eventType: "reservation.failed",
    channel: "ops_console",
    enabled: true,
  },
  {
    eventType: "tenant.sla.threshold_breached",
    channel: "webhook",
    enabled: true,
  },
];

const DEFAULT_WEBHOOK_EVENTS = [
  "booking.created",
  "booking.updated",
  "dispatch.assigned",
  "invoice.issued",
];

const DEFAULT_API_KEY_SCOPES = [
  "tenant:bookings:write",
  "tenant:reports:read",
  "tenant:webhooks:write",
];

const DEMO_CREATED_AT = "2026-04-01T00:00:00.000Z";
const TENANT_LIST_REFRESH_TIER: RefreshTier = "medium_slow";
const TENANT_LIST_STALE_AFTER_MS = 30_000;

@Injectable()
export class TenantsService implements OnModuleInit {
  private readonly logger = new Logger(TenantsService.name);
  private readonly tenants: Map<string, PlatformAdminTenantRecord> = new Map();

  constructor(
    private readonly auditNotificationService: AuditNotificationService,
    @Optional()
    private readonly platformAdminRepository?: PlatformAdminRepository,
  ) {
    const seed = this.createSeedTenant();
    this.tenants.set(seed.id, seed);
  }

  async onModuleInit() {
    if (!this.platformAdminRepository) {
      return;
    }

    try {
      const persistedState = await this.platformAdminRepository.loadState();
      if (persistedState.platformTenants.length === 0) {
        this.persistChanges(
          {
            platformTenants: this.list(),
          },
          "module init bootstrap",
        );
        return;
      }

      this.tenants.clear();
      for (const tenant of persistedState.platformTenants) {
        this.tenants.set(tenant.id, this.cloneTenant(tenant));
      }
    } catch (error) {
      this.platformAdminRepository.reportPersistenceFailure(
        error,
        "tenant module init",
      );
    }
  }

  list(): TenantSummary[] {
    return Array.from(this.tenants.values()).map((tenant) =>
      this.cloneTenant(tenant),
    );
  }

  listRoster(): PlatformAdminTenantListResponse {
    const items = this.list().map((tenant) => this.toTenantListItem(tenant));
    const refresh: UiRefreshMetadata = {
      generatedAt: new Date().toISOString(),
      staleAfterMs: TENANT_LIST_STALE_AFTER_MS,
      dataFreshness: "fresh",
      source: "live",
    };
    const createAction = this.createActionDescriptor();
    const response: PlatformAdminTenantListResponse = {
      items,
      availableActions: [createAction],
      refresh,
      refreshTier: TENANT_LIST_REFRESH_TIER,
    };

    if (items.length === 0) {
      response.emptyState = {
        reason: "no_data",
        messageCode: "platformAdmin.tenants.empty.no_data",
        nextAction: createAction,
      };
    }

    return response;
  }

  get(tenantId: string): TenantSummary {
    return this.cloneTenant(this.requireTenant(tenantId));
  }

  create(
    input: CreatePlatformTenantCommand,
    requestId?: string,
  ): TenantSummary {
    const name = this.requireNonBlank(input.name, "name");
    const code = this.normalizeCode(input.code);
    this.assertCodeAvailable(code);

    const now = new Date().toISOString();
    const tenantId = this.buildTenantId(code);
    const created: PlatformAdminTenantRecord = {
      id: tenantId,
      code,
      name,
      status: input.status === "inactive" ? "paused" : "active",
      enabledModules: this.normalizeModules(input.enabledModules),
      quotas: this.mergeQuotas(DEFAULT_QUOTAS, input.quotas),
      bootstrapDefaults: this.createBootstrapDefaults(
        name,
        code,
        input.bootstrapAdminEmail,
      ),
      integrationPackage: this.createIntegrationPackage(
        input.integrationMode,
        input.sandboxBaseUrl,
      ),
      rollout: this.createRolloutState(),
      createdAt: now,
      updatedAt: now,
    };

    this.tenants.set(created.id, this.cloneTenant(created));
    this.logger.log(`Created tenant ${created.id} (${created.code})`);
    this.persistChanges(
      {
        platformTenants: [this.cloneTenant(created)],
      },
      "create tenant",
    );
    this.recordAudit(
      {
        actorId: null,
        actorType: "platform_admin",
        tenantId: null,
        moduleName: "platform-admin",
        actionName: "create_platform_tenant",
        resourceType: "platform_tenant",
        resourceId: created.id,
        newValuesSummary: {
          code: created.code,
          status: created.status,
          enabledModules: [...created.enabledModules],
          quotas: { ...created.quotas },
          integrationMode: created.integrationPackage.mode,
          rolloutStage: created.rollout.stage,
        },
      },
      requestId,
    );
    return this.cloneTenant(created);
  }

  updateSettings(
    tenantId: string,
    command: UpdatePlatformTenantSettingsCommand,
    requestId?: string,
  ): TenantSummary {
    const tenant = this.requireTenant(tenantId);
    const before = this.cloneTenant(tenant);

    if (typeof command.name === "string") {
      tenant.name = this.requireNonBlank(command.name, "name");
    }
    if (command.enabledModules) {
      tenant.enabledModules = this.normalizeModules(command.enabledModules);
    }
    if (command.quotas) {
      tenant.quotas = this.mergeQuotas(tenant.quotas, command.quotas);
    }
    tenant.updatedAt = new Date().toISOString();

    this.persistChanges(
      {
        platformTenants: [this.cloneTenant(tenant)],
      },
      "update tenant settings",
    );
    this.recordAudit(
      {
        actorId: null,
        actorType: "platform_admin",
        tenantId: null,
        moduleName: "platform-admin",
        actionName: "update_platform_tenant_settings",
        resourceType: "platform_tenant",
        resourceId: tenant.id,
        oldValuesSummary: {
          name: before.name,
          enabledModules: [...before.enabledModules],
          quotas: { ...before.quotas },
        },
        newValuesSummary: {
          name: tenant.name,
          enabledModules: [...tenant.enabledModules],
          quotas: { ...tenant.quotas },
        },
      },
      requestId,
    );

    return this.cloneTenant(tenant);
  }

  updateOnboarding(
    tenantId: string,
    command: UpdatePlatformTenantOnboardingCommand,
    requestId?: string,
  ): TenantSummary {
    const tenant = this.requireTenant(tenantId);
    const before = this.cloneTenant(tenant);

    if (command.billingBaseline) {
      tenant.bootstrapDefaults.billingBaseline = {
        invoiceTitle:
          typeof command.billingBaseline.invoiceTitle === "string"
            ? this.requireNonBlank(
                command.billingBaseline.invoiceTitle,
                "billingBaseline.invoiceTitle",
              )
            : tenant.bootstrapDefaults.billingBaseline.invoiceTitle,
        contactName:
          typeof command.billingBaseline.contactName === "string"
            ? this.requireNonBlank(
                command.billingBaseline.contactName,
                "billingBaseline.contactName",
              )
            : tenant.bootstrapDefaults.billingBaseline.contactName,
        email:
          typeof command.billingBaseline.email === "string"
            ? this.normalizeEmail(command.billingBaseline.email)
            : tenant.bootstrapDefaults.billingBaseline.email,
      };
    }

    if (command.roleDefaults) {
      tenant.bootstrapDefaults.roleDefaults = this.normalizeRoleDefaults(
        command.roleDefaults,
      );
    }

    if (command.notificationSubscriptions) {
      tenant.bootstrapDefaults.notificationSubscriptions =
        this.normalizeNotificationSubscriptions(
          command.notificationSubscriptions,
        );
    }

    if (command.webhookEvents) {
      tenant.bootstrapDefaults.webhookEvents = this.normalizeStringList(
        command.webhookEvents,
        "webhookEvents",
        true,
      );
    }

    if (command.integrationPackage) {
      tenant.integrationPackage = {
        mode: command.integrationPackage.mode ?? tenant.integrationPackage.mode,
        apiKeyScopes:
          command.integrationPackage.apiKeyScopes !== undefined
            ? this.normalizeStringList(
                command.integrationPackage.apiKeyScopes,
                "apiKeyScopes",
                true,
              )
            : [...tenant.integrationPackage.apiKeyScopes],
        sandboxBaseUrl:
          command.integrationPackage.sandboxBaseUrl !== undefined
            ? this.normalizeNullableText(
                command.integrationPackage.sandboxBaseUrl,
              )
            : tenant.integrationPackage.sandboxBaseUrl,
        productionBaseUrl:
          command.integrationPackage.productionBaseUrl !== undefined
            ? this.normalizeNullableText(
                command.integrationPackage.productionBaseUrl,
              )
            : tenant.integrationPackage.productionBaseUrl,
      };
    }

    if (command.rollout) {
      tenant.rollout = {
        ...tenant.rollout,
        sandboxStatus:
          command.rollout.sandboxStatus !== undefined
            ? this.normalizeGateStatus(command.rollout.sandboxStatus)
            : tenant.rollout.sandboxStatus,
        pilotStatus:
          command.rollout.pilotStatus !== undefined
            ? this.normalizeGateStatus(command.rollout.pilotStatus)
            : tenant.rollout.pilotStatus,
        productionStatus:
          command.rollout.productionStatus !== undefined
            ? this.normalizeGateStatus(command.rollout.productionStatus)
            : tenant.rollout.productionStatus,
        cutoverOwner:
          command.rollout.cutoverOwner !== undefined
            ? this.normalizeNullableText(command.rollout.cutoverOwner)
            : tenant.rollout.cutoverOwner,
        rollbackOwner:
          command.rollout.rollbackOwner !== undefined
            ? this.normalizeNullableText(command.rollout.rollbackOwner)
            : tenant.rollout.rollbackOwner,
        rollbackPrepared:
          command.rollout.rollbackPrepared !== undefined
            ? command.rollout.rollbackPrepared
            : tenant.rollout.rollbackPrepared,
        lastPromotedAt:
          command.rollout.lastPromotedAt !== undefined
            ? this.normalizeNullableText(command.rollout.lastPromotedAt)
            : tenant.rollout.lastPromotedAt,
        notes:
          command.rollout.notes !== undefined
            ? this.normalizeNullableText(command.rollout.notes)
            : tenant.rollout.notes,
      };
    }

    tenant.updatedAt = new Date().toISOString();
    this.persistChanges(
      {
        platformTenants: [this.cloneTenant(tenant)],
      },
      "update tenant onboarding",
    );
    this.recordAudit(
      {
        actorId: null,
        actorType: "platform_admin",
        tenantId: null,
        moduleName: "platform-admin",
        actionName: "update_platform_tenant_onboarding",
        resourceType: "platform_tenant",
        resourceId: tenant.id,
        oldValuesSummary: {
          bootstrapDefaults: before.bootstrapDefaults,
          integrationPackage: before.integrationPackage,
          rollout: before.rollout,
        },
        newValuesSummary: {
          bootstrapDefaults: tenant.bootstrapDefaults,
          integrationPackage: tenant.integrationPackage,
          rollout: tenant.rollout,
        },
      },
      requestId,
    );

    return this.cloneTenant(tenant);
  }

  inviteRole(
    tenantId: string,
    command: InviteTenantRoleCommand,
    requestId?: string,
  ): TenantSummary {
    const tenant = this.requireTenant(tenantId);
    const roleCode = this.requireNonBlank(command.roleCode, "roleCode");
    const role = tenant.bootstrapDefaults.roleDefaults.find(
      (r) => r.roleCode === roleCode,
    );
    if (!role) {
      throw new ApiRequestError(
        HttpStatus.NOT_FOUND,
        "TENANT_ROLE_NOT_FOUND",
        "Role not found in tenant bootstrap defaults.",
        { tenantId, roleCode },
      );
    }

    const now = new Date().toISOString();
    role.invitedAt = now;
    tenant.updatedAt = now;

    this.persistChanges(
      { platformTenants: [this.cloneTenant(tenant)] },
      "invite tenant role",
    );
    this.recordAudit(
      {
        actorId: null,
        actorType: "platform_admin",
        tenantId: null,
        moduleName: "platform-admin",
        actionName: "invite_tenant_role",
        resourceType: "platform_tenant",
        resourceId: tenant.id,
        newValuesSummary: {
          roleCode,
          invitedAt: now,
          inviteeEmail: command.inviteeEmail ?? null,
        },
      },
      requestId,
    );

    return this.cloneTenant(tenant);
  }

  acknowledgeRole(
    tenantId: string,
    command: AcknowledgeTenantRoleCommand,
    requestId?: string,
  ): TenantSummary {
    const tenant = this.requireTenant(tenantId);
    const roleCode = this.requireNonBlank(command.roleCode, "roleCode");
    const role = tenant.bootstrapDefaults.roleDefaults.find(
      (r) => r.roleCode === roleCode,
    );
    if (!role) {
      throw new ApiRequestError(
        HttpStatus.NOT_FOUND,
        "TENANT_ROLE_NOT_FOUND",
        "Role not found in tenant bootstrap defaults.",
        { tenantId, roleCode },
      );
    }
    if (!role.invitedAt) {
      throw new ApiRequestError(
        HttpStatus.CONFLICT,
        "TENANT_ROLE_NOT_INVITED",
        "Role must be invited before it can be acknowledged.",
        { tenantId, roleCode },
      );
    }

    const now = new Date().toISOString();
    role.acknowledgedAt = now;
    tenant.updatedAt = now;

    this.persistChanges(
      { platformTenants: [this.cloneTenant(tenant)] },
      "acknowledge tenant role",
    );
    this.recordAudit(
      {
        actorId: null,
        actorType: "platform_admin",
        tenantId: null,
        moduleName: "platform-admin",
        actionName: "acknowledge_tenant_role",
        resourceType: "platform_tenant",
        resourceId: tenant.id,
        newValuesSummary: { roleCode, acknowledgedAt: now },
      },
      requestId,
    );

    return this.cloneTenant(tenant);
  }

  setRollbackHold(
    tenantId: string,
    command?: PlatformTenantLifecycleActionCommand,
    requestId?: string,
  ): TenantSummary {
    const tenant = this.requireTenant(tenantId);
    const oldStatus = tenant.status;
    const now = new Date().toISOString();

    tenant.status = "rollback_hold";
    tenant.rollout.productionStatus = "blocked";
    tenant.updatedAt = now;

    this.logger.log(`Tenant ${tenantId} placed in rollback_hold`);
    this.persistChanges(
      { platformTenants: [this.cloneTenant(tenant)] },
      "set tenant rollback hold",
    );
    this.recordAudit(
      {
        actorId: null,
        actorType: "platform_admin",
        tenantId: null,
        moduleName: "platform-admin",
        actionName: "set_tenant_rollback_hold",
        resourceType: "platform_tenant",
        resourceId: tenant.id,
        oldValuesSummary: { status: oldStatus },
        newValuesSummary: {
          status: "rollback_hold",
          productionStatus: "blocked",
          ...(command?.reason ? { reason: command.reason } : {}),
        },
      },
      requestId,
    );

    return this.cloneTenant(tenant);
  }

  setRolloutStage(
    tenantId: string,
    command: SetPlatformTenantRolloutStageCommand,
    requestId?: string,
  ): TenantSummary {
    const tenant = this.requireTenant(tenantId);
    const oldRollout = { ...tenant.rollout };
    const nextStage = this.normalizeRolloutStage(command.stage);

    this.enforcePromotionGates(tenant, nextStage);

    tenant.rollout.stage = nextStage;
    tenant.rollout.lastPromotedAt = new Date().toISOString();
    tenant.rollout.notes = this.coalesceNullableText(
      command.notes,
      tenant.rollout.notes,
    );

    if (nextStage === "sandbox") {
      tenant.rollout.sandboxStatus = "approved";
    }
    if (nextStage === "pilot") {
      tenant.rollout.sandboxStatus = "approved";
      tenant.rollout.pilotStatus = "approved";
    }
    if (nextStage === "production") {
      tenant.rollout.sandboxStatus = "approved";
      tenant.rollout.pilotStatus = "approved";
      tenant.rollout.productionStatus = "approved";
    }

    tenant.updatedAt = new Date().toISOString();
    this.persistChanges(
      {
        platformTenants: [this.cloneTenant(tenant)],
      },
      "set tenant rollout stage",
    );
    this.recordAudit(
      {
        actorId: null,
        actorType: "platform_admin",
        tenantId: null,
        moduleName: "platform-admin",
        actionName: "update_platform_tenant_rollout",
        resourceType: "platform_tenant",
        resourceId: tenant.id,
        oldValuesSummary: { ...oldRollout },
        newValuesSummary: { ...tenant.rollout },
      },
      requestId,
    );

    return this.cloneTenant(tenant);
  }

  setStatus(
    tenantId: string,
    newStatus: "active" | "paused" | "rollback_hold",
    command?: PlatformTenantLifecycleActionCommand,
    requestId?: string,
  ): TenantSummary {
    const tenant = this.requireTenant(tenantId);
    const oldStatus = tenant.status;
    tenant.status = newStatus;
    tenant.updatedAt = new Date().toISOString();
    this.logger.log(`Tenant ${tenantId} status set to ${newStatus}`);
    this.persistChanges(
      {
        platformTenants: [this.cloneTenant(tenant)],
      },
      "set tenant status",
    );
    this.recordAudit(
      {
        actorId: null,
        actorType: "platform_admin",
        tenantId: null,
        moduleName: "platform-admin",
        actionName: "update_platform_tenant_status",
        resourceType: "platform_tenant",
        resourceId: tenant.id,
        oldValuesSummary: { status: oldStatus },
        newValuesSummary: {
          status: newStatus,
          ...(command?.reason ? { reason: command.reason } : {}),
        },
      },
      requestId,
    );
    return this.cloneTenant(tenant);
  }

  private enforcePromotionGates(
    tenant: PlatformAdminTenantRecord,
    nextStage: PlatformTenantRolloutStage,
  ) {
    if (tenant.status === "rollback_hold") {
      throw new ApiRequestError(
        HttpStatus.CONFLICT,
        "TENANT_IN_ROLLBACK_HOLD",
        "Tenant is in rollback hold. Resolve the hold before promoting.",
        { tenantId: tenant.id, status: tenant.status },
      );
    }

    const missing: string[] = [];

    if (nextStage === "pilot") {
      if (tenant.rollout.sandboxStatus !== "approved") {
        missing.push("sandboxStatus must be approved");
      }
    }

    if (nextStage === "production") {
      if (tenant.rollout.pilotStatus !== "approved") {
        missing.push("pilotStatus must be approved");
      }
      if (!tenant.rollout.cutoverOwner) {
        missing.push("cutoverOwner is required");
      }
      if (!tenant.rollout.rollbackOwner) {
        missing.push("rollbackOwner is required");
      }
      if (!tenant.rollout.rollbackPrepared) {
        missing.push("rollbackPrepared must be true");
      }

      const unacknowledgedRequired = tenant.bootstrapDefaults.roleDefaults
        .filter((r) => r.required && !r.acknowledgedAt)
        .map((r) => r.roleCode);
      if (unacknowledgedRequired.length > 0) {
        missing.push(
          `required roles not acknowledged: ${unacknowledgedRequired.join(", ")}`,
        );
      }
    }

    if (missing.length > 0) {
      throw new ApiRequestError(
        HttpStatus.CONFLICT,
        "TENANT_PROMOTION_GATE_BLOCKED",
        `Cannot promote to ${nextStage}: ${missing.join("; ")}.`,
        { tenantId: tenant.id, nextStage, missing },
      );
    }
  }

  private requireTenant(tenantId: string): PlatformAdminTenantRecord {
    const tenant = this.tenants.get(tenantId);
    if (!tenant) {
      throw new ApiRequestError(
        HttpStatus.NOT_FOUND,
        "TENANT_NOT_FOUND",
        "Tenant not found.",
        { tenantId },
      );
    }
    return tenant;
  }

  private createSeedTenant() {
    return {
      id: "tenant-demo-001",
      code: "demo",
      name: "Demo Tenant",
      status: "active",
      enabledModules: ["enterprise_dispatch", "billing", "reporting"],
      quotas: {
        activeDrivers: 50,
        monthlyBookings: 1200,
        monthlyApiCalls: 80000,
      },
      bootstrapDefaults: this.createBootstrapDefaults(
        "Demo Tenant",
        "demo",
        "admin@demo.example",
      ),
      integrationPackage: {
        mode: "api_key_and_webhook",
        apiKeyScopes: [...DEFAULT_API_KEY_SCOPES],
        sandboxBaseUrl: "https://sandbox.demo.drts.example",
        productionBaseUrl: "https://api.demo.drts.example",
      },
      rollout: {
        stage: "production",
        sandboxStatus: "approved",
        pilotStatus: "approved",
        productionStatus: "approved",
        cutoverOwner: "Platform Launch Lead",
        rollbackOwner: "Platform Operations",
        rollbackPrepared: true,
        lastPromotedAt: DEMO_CREATED_AT,
        notes:
          "Demo tenant already completed sandbox, pilot, and production promotion.",
      },
      createdAt: DEMO_CREATED_AT,
      updatedAt: DEMO_CREATED_AT,
    } satisfies PlatformAdminTenantRecord;
  }

  private buildTenantId(code: string) {
    return `tenant-${code.replace(/_/g, "-")}`;
  }

  private createBootstrapDefaults(
    tenantName: string,
    tenantCode: string,
    bootstrapAdminEmail?: string,
  ): PlatformTenantBootstrapDefaults {
    const normalizedCode = this.normalizeCode(tenantCode);
    const emailLocalPart = normalizedCode
      .replace(/_/g, "-")
      .replace(/^-+|-+$/g, "");
    return {
      roleDefaults: DEFAULT_ROLE_DEFAULTS.map((role) => ({ ...role })),
      billingBaseline: {
        invoiceTitle: tenantName,
        contactName: `${tenantName} Billing Owner`,
        email: this.normalizeEmail(
          bootstrapAdminEmail ?? `billing@${emailLocalPart}.example.com`,
        ),
      },
      notificationSubscriptions: DEFAULT_NOTIFICATION_SUBSCRIPTIONS.map(
        (subscription) => ({ ...subscription }),
      ),
      webhookEvents: [...DEFAULT_WEBHOOK_EVENTS],
    };
  }

  private createIntegrationPackage(
    mode?: PlatformTenantIntegrationMode,
    sandboxBaseUrl?: string | null,
  ): PlatformTenantIntegrationPackage {
    const resolvedMode = mode ?? "none";
    return {
      mode: resolvedMode,
      apiKeyScopes: resolvedMode === "none" ? [] : [...DEFAULT_API_KEY_SCOPES],
      sandboxBaseUrl: this.normalizeNullableText(sandboxBaseUrl),
      productionBaseUrl: null,
    };
  }

  private createRolloutState(): PlatformTenantRolloutState {
    return {
      stage: "sandbox",
      sandboxStatus: "ready",
      pilotStatus: "pending",
      productionStatus: "pending",
      cutoverOwner: null,
      rollbackOwner: null,
      rollbackPrepared: false,
      lastPromotedAt: null,
      notes:
        "Start in sandbox. Promote only after bootstrap defaults, billing baseline, notifications, and integration package are verified.",
    };
  }

  private assertCodeAvailable(code: string) {
    const duplicate = Array.from(this.tenants.values()).some(
      (tenant) => tenant.code === code,
    );
    if (duplicate) {
      throw new ApiRequestError(
        HttpStatus.CONFLICT,
        "TENANT_CODE_CONFLICT",
        "Tenant code already exists.",
        { code },
      );
    }
  }

  private normalizeCode(value: string) {
    const trimmed = this.requireNonBlank(value, "code").toLowerCase();
    const normalized = trimmed
      .replace(/[^a-z0-9]+/g, "_")
      .replace(/^_+|_+$/g, "");
    if (!normalized) {
      throw new ApiRequestError(
        HttpStatus.BAD_REQUEST,
        "TENANT_CODE_INVALID",
        "Tenant code must contain letters or numbers.",
        { code: value },
      );
    }
    return normalized;
  }

  private normalizeModules(
    modules?: readonly PlatformTenantModule[],
  ): PlatformTenantModule[] {
    if (!modules || modules.length === 0) {
      return ["enterprise_dispatch"];
    }
    const unique = new Set<PlatformTenantModule>();
    for (const moduleCode of modules) {
      if (!PLATFORM_TENANT_MODULES.includes(moduleCode)) {
        throw new ApiRequestError(
          HttpStatus.BAD_REQUEST,
          "TENANT_MODULE_INVALID",
          "Unknown tenant module.",
          { moduleCode },
        );
      }
      unique.add(moduleCode);
    }
    return Array.from(unique);
  }

  private mergeQuotas(
    base: PlatformTenantQuotaSummary,
    incoming?: Partial<PlatformTenantQuotaSummary>,
  ): PlatformTenantQuotaSummary {
    return {
      activeDrivers: this.normalizeQuota(
        incoming?.activeDrivers ?? base.activeDrivers,
        "activeDrivers",
      ),
      monthlyBookings: this.normalizeQuota(
        incoming?.monthlyBookings ?? base.monthlyBookings,
        "monthlyBookings",
      ),
      monthlyApiCalls: this.normalizeQuota(
        incoming?.monthlyApiCalls ?? base.monthlyApiCalls,
        "monthlyApiCalls",
      ),
    };
  }

  private normalizeQuota(value: number, field: string): number {
    if (!Number.isFinite(value) || value < 0) {
      throw new ApiRequestError(
        HttpStatus.BAD_REQUEST,
        "TENANT_QUOTA_INVALID",
        `Invalid quota value for ${field}.`,
        { field, value },
      );
    }
    return Math.floor(value);
  }

  private normalizeRoleDefaults(
    roles: readonly PlatformTenantBootstrapRoleDefault[],
  ) {
    if (roles.length === 0) {
      throw new ApiRequestError(
        HttpStatus.BAD_REQUEST,
        "TENANT_ROLE_DEFAULTS_REQUIRED",
        "At least one role default is required.",
      );
    }

    return roles.map((role) => ({
      roleCode: this.requireNonBlank(role.roleCode, "roleDefaults.roleCode"),
      displayName: this.requireNonBlank(
        role.displayName,
        "roleDefaults.displayName",
      ),
      required: Boolean(role.required),
      invitedAt: role.invitedAt ?? null,
      acknowledgedAt: role.acknowledgedAt ?? null,
    }));
  }

  private normalizeNotificationSubscriptions(
    subscriptions: readonly TenantNotificationSubscription[],
  ) {
    return subscriptions.map((subscription) => ({
      eventType: this.requireNonBlank(
        subscription.eventType,
        "notificationSubscriptions.eventType",
      ),
      channel: subscription.channel,
      enabled: Boolean(subscription.enabled),
    }));
  }

  private normalizeStringList(
    values: readonly string[],
    field: string,
    allowEmpty = false,
  ) {
    const normalized = Array.from(
      new Set(values.map((value) => this.requireNonBlank(value, field))),
    );
    if (normalized.length === 0 && !allowEmpty) {
      throw new ApiRequestError(
        HttpStatus.BAD_REQUEST,
        "FIELD_REQUIRED",
        `${field} must contain at least one value.`,
        { field },
      );
    }
    return normalized;
  }

  private normalizeRolloutStage(stage: PlatformTenantRolloutStage) {
    if (!PLATFORM_TENANT_ROLLOUT_STAGES.includes(stage)) {
      throw new ApiRequestError(
        HttpStatus.BAD_REQUEST,
        "TENANT_ROLLOUT_STAGE_INVALID",
        "Unknown rollout stage.",
        { stage },
      );
    }
    return stage;
  }

  private normalizeGateStatus(status: PlatformTenantGateStatus) {
    if (!PLATFORM_TENANT_GATE_STATUSES.includes(status)) {
      throw new ApiRequestError(
        HttpStatus.BAD_REQUEST,
        "TENANT_GATE_STATUS_INVALID",
        "Unknown rollout gate status.",
        { status },
      );
    }
    return status;
  }

  private normalizeEmail(value: string) {
    const normalized = this.requireNonBlank(value, "email").toLowerCase();
    if (!normalized.includes("@")) {
      throw new ApiRequestError(
        HttpStatus.BAD_REQUEST,
        "TENANT_EMAIL_INVALID",
        "A valid email is required.",
        { email: value },
      );
    }
    return normalized;
  }

  private normalizeNullableText(value: string | null | undefined) {
    const normalized = value?.trim();
    return normalized ? normalized : null;
  }

  private coalesceNullableText(
    value: string | null | undefined,
    fallback: string | null,
  ) {
    if (value === undefined) {
      return fallback;
    }
    return this.normalizeNullableText(value);
  }

  private requireNonBlank(value: string, field: string): string {
    const normalized = value.trim();
    if (!normalized) {
      throw new ApiRequestError(
        HttpStatus.BAD_REQUEST,
        "FIELD_REQUIRED",
        `${field} is required.`,
        { field },
      );
    }
    return normalized;
  }

  private toTenantListItem(
    tenant: PlatformAdminTenantRecord,
  ): PlatformAdminTenantListItem {
    return {
      ...this.cloneTenant(tenant),
      availableActions: this.getTenantAvailableActions(tenant),
      operationalViewLink: this.getOperationalViewLink(tenant),
    };
  }

  private createActionDescriptor(): ResourceActionDescriptor {
    return {
      action: "create",
      enabled: true,
      riskLevel: "medium",
    };
  }

  private getTenantAvailableActions(
    tenant: PlatformAdminTenantRecord,
  ): ResourceActionDescriptor[] {
    const activateDisabledReason =
      tenant.status === "active"
        ? "tenant_already_active"
        : tenant.status === "rollback_hold"
          ? "rollback_hold_requires_triage"
          : undefined;
    const suspendDisabledReason =
      tenant.status === "paused"
        ? "tenant_already_paused"
        : tenant.status === "rollback_hold"
          ? "rollback_hold_requires_triage"
          : tenant.status === "draft"
            ? "draft_tenant_not_activated"
            : undefined;
    const rollbackDisabledReason =
      tenant.status === "rollback_hold"
        ? "rollback_hold_already_enabled"
        : undefined;

    return [
      {
        action: "activate",
        enabled:
          tenant.status !== "active" && tenant.status !== "rollback_hold",
        ...(activateDisabledReason
          ? { disabledReasonCode: activateDisabledReason }
          : {}),
        riskLevel: "medium",
      },
      {
        action: "suspend",
        enabled: tenant.status === "active",
        ...(suspendDisabledReason
          ? { disabledReasonCode: suspendDisabledReason }
          : {}),
        requiresReason: true,
        riskLevel: "high",
      },
      {
        action: "rollback_hold",
        enabled: tenant.status !== "rollback_hold",
        ...(rollbackDisabledReason
          ? { disabledReasonCode: rollbackDisabledReason }
          : {}),
        requiresReason: true,
        riskLevel: "high",
      },
    ];
  }

  private getOperationalViewLink(
    tenant: PlatformAdminTenantRecord,
  ): CrossAppResourceLink {
    return {
      targetApp: "ops-console",
      route: `/dispatch?tenantId=${encodeURIComponent(tenant.id)}`,
      resourceType: "dispatch_board",
      resourceId: tenant.id,
      openMode: "new_tab",
      label: `Ops view · ${tenant.name}`,
    };
  }

  private cloneTenant(
    tenant: PlatformAdminTenantRecord,
  ): PlatformAdminTenantRecord {
    return {
      ...tenant,
      enabledModules: [...tenant.enabledModules],
      quotas: { ...tenant.quotas },
      bootstrapDefaults: {
        roleDefaults: tenant.bootstrapDefaults.roleDefaults.map((role) => ({
          ...role,
        })),
        billingBaseline: { ...tenant.bootstrapDefaults.billingBaseline },
        notificationSubscriptions:
          tenant.bootstrapDefaults.notificationSubscriptions.map(
            (subscription) => ({ ...subscription }),
          ),
        webhookEvents: [...tenant.bootstrapDefaults.webhookEvents],
      },
      integrationPackage: {
        ...tenant.integrationPackage,
        apiKeyScopes: [...tenant.integrationPackage.apiKeyScopes],
      },
      rollout: { ...tenant.rollout },
    };
  }

  private persistChanges(
    changes: PersistPlatformAdminChanges,
    context: string,
  ) {
    if (!this.platformAdminRepository) {
      return;
    }

    void this.platformAdminRepository
      .persistChanges(changes)
      .catch((error) =>
        this.platformAdminRepository?.reportPersistenceFailure(error, context),
      );
  }

  private recordAudit(
    input: Omit<AuditLogRecord, "auditId" | "createdAt" | "requestId">,
    requestId?: string,
  ) {
    this.auditNotificationService.recordAuditLog({
      ...input,
      ...(requestId ? { requestId } : {}),
    });
  }
}
