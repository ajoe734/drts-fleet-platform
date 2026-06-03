import { HttpStatus, Injectable } from "@nestjs/common";

import { ApiRequestError } from "../../common/api-envelope";
import type { BootstrapRequestIdentity } from "../../common/auth";
import { AuditNotificationService } from "../audit-notification/audit-notification.service";
import { FeatureFlagsService } from "../feature-flags/feature-flags.service";
import { ForwarderService } from "../forwarder/forwarder.service";
import {
  authorizePlatformAdminAssistantToolCall,
  type PlatformAdminAssistantAuditToolResult,
  type PlatformAdminAssistantDataToolResult,
  type PlatformAdminAssistantRouteToolResult,
  type PlatformAdminAssistantToolResult,
} from "../platform-admin/platform-admin-assistant.policy";
import { listPlatformAdminAssistantTools } from "../platform-admin/platform-admin-assistant.tools";
import { PlatformAdminService } from "../platform-admin/platform-admin.service";
import { PlatformTenantGovernanceService } from "../platform-admin/tenant-governance.service";
import { TenantsService } from "../platform-admin/tenants.service";
import { TenantPartnerService } from "../tenant-partner/tenant-partner.service";

const PLATFORM_ADMIN_ASSISTANT_ROUTES = [
  { route: "/", label: "Home", section: "workspace" },
  { route: "/tenants", label: "Tenants", section: "tenant" },
  {
    route: "/tenant-governance",
    label: "Tenant Governance",
    section: "tenant",
  },
  { route: "/partners", label: "Partner Entries", section: "tenant" },
  { route: "/users", label: "Platform Staff", section: "tenant" },
  { route: "/fleet", label: "Fleet & Compliance", section: "fleet" },
  {
    route: "/switchboard",
    label: "Public Info & Placards",
    section: "commerce",
  },
  { route: "/pricing", label: "Pricing", section: "commerce" },
  { route: "/payments", label: "Payments", section: "commerce" },
  {
    route: "/payments/reimbursements",
    label: "Reimbursements",
    section: "commerce",
  },
  {
    route: "/adapter-registry",
    label: "Adapter Registry",
    section: "operations",
  },
  { route: "/health", label: "Health", section: "operations" },
  { route: "/notices", label: "Notices", section: "operations" },
  { route: "/audit", label: "Audit", section: "operations" },
  {
    route: "/feature-flags",
    label: "Feature Flags",
    section: "operations",
  },
] as const;

export interface PlatformAdminAssistantReadToolExecutionCommand {
  toolName: string;
  input?: Record<string, unknown>;
}

@Injectable()
export class PlatformAdminAssistantReadToolService {
  constructor(
    private readonly tenantsService: TenantsService,
    private readonly platformTenantGovernanceService: PlatformTenantGovernanceService,
    private readonly tenantPartnerService: TenantPartnerService,
    private readonly platformAdminService: PlatformAdminService,
    private readonly featureFlagsService: FeatureFlagsService,
    private readonly forwarderService: ForwarderService,
    private readonly auditNotificationService: AuditNotificationService,
  ) {}

  listDefinitions() {
    return listPlatformAdminAssistantTools();
  }

  async execute(
    identity: BootstrapRequestIdentity | null,
    command: PlatformAdminAssistantReadToolExecutionCommand,
  ): Promise<PlatformAdminAssistantToolResult> {
    const decision = authorizePlatformAdminAssistantToolCall(
      {
        toolName: command.toolName,
      },
      identity,
    );

    if (!decision.allowed) {
      throw this.toApiRequestError(decision.reasonCode, command.toolName);
    }

    switch (command.toolName) {
      case "route.list_navigation_nodes":
        return this.listNavigationNodes();
      case "route.get_route_details":
        return this.getRouteDetails(command.input);
      case "data.list_tenant_summaries":
        return this.listTenantSummaries(command.input);
      case "data.get_tenant_governance_summary":
        return this.getTenantGovernanceSummary(command.input);
      case "data.list_partner_entries":
        return this.listPartnerEntries(command.input);
      case "data.list_payment_records":
        return this.listPaymentRecords(command.input);
      case "data.list_pricing_rules":
        return this.listPricingRules(command.input);
      case "data.list_feature_flags":
        return await this.listFeatureFlags(command.input);
      case "data.list_adapter_health":
        return this.listAdapterHealth(command.input);
      case "audit.list_actor_audit_entries":
        return this.listActorAuditEntries(decision.executionIdentity.actorId);
      case "audit.list_platform_audit_entries":
        return this.listPlatformAuditEntries(command.input);
      case "audit.get_action_receipt_audit_entry":
        return this.getActionReceiptAuditEntry(command.input);
      default:
        throw new ApiRequestError(
          HttpStatus.NOT_IMPLEMENTED,
          "ASSISTANT_TOOL_NOT_IMPLEMENTED",
          "Platform Admin assistant tool is registered but not implemented.",
          { toolName: command.toolName },
        );
    }
  }

  private listNavigationNodes(): PlatformAdminAssistantRouteToolResult {
    return {
      toolName: "route.list_navigation_nodes",
      family: "route",
      outputType: "route_snapshot",
      items: PLATFORM_ADMIN_ASSISTANT_ROUTES.map((route) => ({
        route: route.route,
        label: route.label,
        allowed: true,
        reasonCode: route.section,
      })),
    };
  }

  private getRouteDetails(
    input?: Record<string, unknown>,
  ): PlatformAdminAssistantRouteToolResult {
    const routeId = this.readOptionalString(input, "routeId");
    const href = this.readOptionalString(input, "href");
    const route = PLATFORM_ADMIN_ASSISTANT_ROUTES.find((candidate) => {
      if (routeId) {
        return this.normalizeRouteId(candidate.route) === routeId;
      }
      return candidate.route === href;
    });

    if (!route) {
      throw new ApiRequestError(
        HttpStatus.NOT_FOUND,
        "ASSISTANT_ROUTE_NOT_FOUND",
        "Platform Admin route could not be found in the registered assistant route set.",
        { routeId: routeId ?? null, href: href ?? null },
      );
    }

    return {
      toolName: "route.get_route_details",
      family: "route",
      outputType: "route_snapshot",
      items: [
        {
          route: route.route,
          label: route.label,
          allowed: true,
          reasonCode: route.section,
        },
      ],
    };
  }

  private listTenantSummaries(
    input?: Record<string, unknown>,
  ): PlatformAdminAssistantDataToolResult {
    const tenantFilter = this.readOptionalString(input, "tenantId");
    const items = this.tenantsService
      .list()
      .filter((tenant) => (tenantFilter ? tenant.id === tenantFilter : true))
      .map((tenant) => ({
        recordId: tenant.id,
        title: tenant.name,
        summary: `${tenant.code} • ${tenant.status} • rollout ${tenant.rollout.stage}`,
        fields: {
          tenantId: tenant.id,
          tenantCode: tenant.code,
          tenantStatus: tenant.status,
          rolloutStage: tenant.rollout.stage,
          enabledModules: [...tenant.enabledModules],
          quotas: { ...tenant.quotas },
          integrationPackage: { ...tenant.integrationPackage },
          bootstrapDefaults: {
            ...tenant.bootstrapDefaults,
            roleDefaults: tenant.bootstrapDefaults.roleDefaults.map((role) => ({
              ...role,
            })),
            notificationSubscriptions:
              tenant.bootstrapDefaults.notificationSubscriptions.map(
                (subscription) => ({ ...subscription }),
              ),
            webhookEvents: [...tenant.bootstrapDefaults.webhookEvents],
            billingBaseline: { ...tenant.bootstrapDefaults.billingBaseline },
          },
          updatedAt: tenant.updatedAt,
        },
      }));

    return {
      toolName: "data.list_tenant_summaries",
      family: "data",
      outputType: "record_set",
      items,
    };
  }

  private getTenantGovernanceSummary(
    input?: Record<string, unknown>,
  ): PlatformAdminAssistantDataToolResult {
    const tenantId = this.requireString(input, "tenantId");
    const row =
      this.platformTenantGovernanceService
        .listSummary({ page: 1, pageSize: 100 })
        .items.find((candidate) => candidate.tenantId === tenantId) ?? null;

    if (!row) {
      throw new ApiRequestError(
        HttpStatus.NOT_FOUND,
        "ASSISTANT_TENANT_GOVERNANCE_NOT_FOUND",
        "Platform tenant governance summary could not be found.",
        { tenantId },
      );
    }

    return {
      toolName: "data.get_tenant_governance_summary",
      family: "data",
      outputType: "record_set",
      items: [
        {
          recordId: row.tenantId,
          title: row.tenantName,
          summary: `${row.pendingApprovalCount} pending approvals • ${row.monthlyQuotaPercentUsed}% quota used`,
          fields: { ...row, alertFlags: [...row.alertFlags] },
        },
      ],
    };
  }

  private listPartnerEntries(
    input?: Record<string, unknown>,
  ): PlatformAdminAssistantDataToolResult {
    const tenantId = this.readOptionalString(input, "tenantId");
    const status = this.readOptionalString(input, "status");
    const items = this.tenantPartnerService
      .listPlatformPartnerEntries()
      .filter((entry) => (tenantId ? entry.tenantId === tenantId : true))
      .filter((entry) => (status ? entry.status === status : true))
      .map((entry) => ({
        recordId: entry.entrySlug,
        title: entry.displayName,
        summary: `${entry.partnerCode} • ${entry.status} • tenant ${entry.tenantId}`,
        fields: {
          partnerId: entry.partnerId,
          partnerCode: entry.partnerCode,
          partnerType: entry.partnerType,
          tenantId: entry.tenantId,
          programId: entry.programId,
          programCode: entry.programCode,
          entrySlug: entry.entrySlug,
          authMode: entry.authMode,
          status: entry.status,
          activeFlag: entry.activeFlag,
          eligibilityMode: entry.eligibilityMode,
          updatedAt: entry.updatedAt,
        },
      }));

    return {
      toolName: "data.list_partner_entries",
      family: "data",
      outputType: "record_set",
      items,
    };
  }

  private listPaymentRecords(
    input?: Record<string, unknown>,
  ): PlatformAdminAssistantDataToolResult {
    const tenantId = this.readOptionalString(input, "tenantId");
    const status = this.readOptionalString(input, "status");
    const items = this.platformAdminService
      .listPlatformInvoices()
      .filter((invoice) => (tenantId ? invoice.tenantId === tenantId : true))
      .filter((invoice) => (status ? invoice.status === status : true))
      .map((invoice) => ({
        recordId: invoice.invoiceId,
        title: `Invoice ${invoice.invoiceId}`,
        summary: `${invoice.status} • ${invoice.amount.amountMinor} ${invoice.amount.currency} • tenant ${invoice.tenantId}`,
        fields: {
          invoiceId: invoice.invoiceId,
          tenantId: invoice.tenantId,
          status: invoice.status,
          amount: { ...invoice.amount },
          periodStart: invoice.periodStart,
          periodEnd: invoice.periodEnd,
          pricingVersionSnapshot: invoice.pricingVersionSnapshot,
          createdAt: invoice.createdAt,
          updatedAt: invoice.updatedAt,
        },
      }));

    return {
      toolName: "data.list_payment_records",
      family: "data",
      outputType: "record_set",
      items,
    };
  }

  private listPricingRules(
    input?: Record<string, unknown>,
  ): PlatformAdminAssistantDataToolResult {
    const applicableTo = this.readOptionalString(input, "applicableTo");
    const status = this.readOptionalString(input, "status");
    const items = this.platformAdminService
      .listPlatformPricingRules()
      .filter((rule) =>
        applicableTo ? rule.applicableTo === applicableTo : true,
      )
      .filter((rule) => (status ? rule.status === status : true))
      .map((rule) => ({
        recordId: rule.ruleId,
        title: rule.ruleName,
        summary: `${rule.status} • ${rule.version} • applies to ${rule.applicableTo}`,
        fields: {
          ...rule,
        },
      }));

    return {
      toolName: "data.list_pricing_rules",
      family: "data",
      outputType: "record_set",
      items,
    };
  }

  private async listFeatureFlags(
    input?: Record<string, unknown>,
  ): Promise<PlatformAdminAssistantDataToolResult> {
    const tenantId = this.readOptionalString(input, "tenantId");
    const items = (
      await this.featureFlagsService.getAll(tenantId ?? undefined)
    ).map((flag) => ({
      recordId: tenantId ? `${flag.key}:${tenantId}` : flag.key,
      title: flag.key,
      summary: `${flag.enabled ? "enabled" : "disabled"} • ${flag.tenantId ?? "global"}`,
      fields: {
        key: flag.key,
        enabled: flag.enabled,
        description: flag.description,
        tenantId: flag.tenantId ?? null,
        updatedAt: flag.updatedAt,
      },
    }));

    return {
      toolName: "data.list_feature_flags",
      family: "data",
      outputType: "record_set",
      items,
    };
  }

  private listAdapterHealth(
    input?: Record<string, unknown>,
  ): PlatformAdminAssistantDataToolResult {
    const platformCode = this.readOptionalString(input, "platformCode");
    const status = this.readOptionalString(input, "status");
    const items = this.forwarderService
      .listAdapterHealth()
      .filter((adapter) =>
        platformCode ? adapter.platformCode === platformCode : true,
      )
      .filter((adapter) => (status ? adapter.status === status : true))
      .map((adapter) => ({
        recordId: adapter.platformCode,
        title: adapter.platformCode,
        summary: `${adapter.status} • credentials ${adapter.credentialStatus} • webhook ${adapter.webhookStatus}`,
        fields: {
          ...adapter,
          capabilitySummary: {
            ...adapter.capabilitySummary,
            supportedWebhookEvents: [
              ...adapter.capabilitySummary.supportedWebhookEvents,
            ],
            notes: [...adapter.capabilitySummary.notes],
          },
        },
      }));

    return {
      toolName: "data.list_adapter_health",
      family: "data",
      outputType: "record_set",
      items,
    };
  }

  private listActorAuditEntries(
    actorId: string,
  ): PlatformAdminAssistantAuditToolResult {
    const items = this.auditNotificationService
      .getAuditLogsSnapshot()
      .filter((entry) => entry.actorId === actorId)
      .slice(0, 25)
      .map((entry) => this.toAuditEntry(entry));

    return {
      toolName: "audit.list_actor_audit_entries",
      family: "audit",
      outputType: "audit_entry_set",
      items,
    };
  }

  private listPlatformAuditEntries(
    input?: Record<string, unknown>,
  ): PlatformAdminAssistantAuditToolResult {
    const moduleName = this.readOptionalString(input, "moduleName");
    const resourceType = this.readOptionalString(input, "resourceType");
    const resourceId = this.readOptionalString(input, "resourceId");
    const items = this.auditNotificationService
      .getAuditLogsSnapshot()
      .filter((entry) => (moduleName ? entry.moduleName === moduleName : true))
      .filter((entry) =>
        resourceType ? entry.resourceType === resourceType : true,
      )
      .filter((entry) => (resourceId ? entry.resourceId === resourceId : true))
      .slice(0, 50)
      .map((entry) => this.toAuditEntry(entry));

    return {
      toolName: "audit.list_platform_audit_entries",
      family: "audit",
      outputType: "audit_entry_set",
      items,
    };
  }

  private getActionReceiptAuditEntry(
    input?: Record<string, unknown>,
  ): PlatformAdminAssistantAuditToolResult {
    const auditId = this.requireString(input, "auditId");
    const entry =
      this.auditNotificationService
        .getAuditLogsSnapshot()
        .find((candidate) => candidate.auditId === auditId) ?? null;

    if (!entry) {
      throw new ApiRequestError(
        HttpStatus.NOT_FOUND,
        "ASSISTANT_AUDIT_ENTRY_NOT_FOUND",
        "Requested action receipt audit entry could not be found.",
        { auditId },
      );
    }

    return {
      toolName: "audit.get_action_receipt_audit_entry",
      family: "audit",
      outputType: "audit_entry_set",
      items: [this.toAuditEntry(entry)],
    };
  }

  private toAuditEntry(
    entry: ReturnType<AuditNotificationService["getAuditLogsSnapshot"]>[number],
  ) {
    return {
      auditId: entry.auditId,
      action: entry.actionName,
      actorId: entry.actorId,
      occurredAt: entry.createdAt,
      summary: `${entry.moduleName}.${entry.actionName} on ${entry.resourceType}:${entry.resourceId ?? "n/a"}`,
      metadata: {
        moduleName: entry.moduleName,
        resourceType: entry.resourceType,
        resourceId: entry.resourceId,
        tenantId: entry.tenantId,
        oldValuesSummary: entry.oldValuesSummary ?? null,
        newValuesSummary: entry.newValuesSummary ?? null,
      },
    };
  }

  private toApiRequestError(reasonCode: string, toolName: string) {
    switch (reasonCode) {
      case "missing_identity":
        return new ApiRequestError(
          HttpStatus.UNAUTHORIZED,
          "ASSISTANT_TOOL_IDENTITY_REQUIRED",
          "Platform Admin assistant read tools require caller identity context.",
          { toolName },
        );
      case "permission_escalation":
        return new ApiRequestError(
          HttpStatus.FORBIDDEN,
          "ASSISTANT_TOOL_SCOPE_ESCALATION",
          "Platform Admin assistant tools cannot widen actor, tenant, or partner scope.",
          { toolName },
        );
      case "disallowed_execution_target":
        return new ApiRequestError(
          HttpStatus.BAD_REQUEST,
          "ASSISTANT_TOOL_EXECUTION_TARGET_DISALLOWED",
          "Platform Admin assistant tools only support registered typed execution targets.",
          { toolName },
        );
      case "unknown_tool":
      default:
        return new ApiRequestError(
          HttpStatus.NOT_FOUND,
          "ASSISTANT_TOOL_NOT_REGISTERED",
          "Platform Admin assistant tool is not registered.",
          { toolName },
        );
    }
  }

  private requireString(
    input: Record<string, unknown> | undefined,
    field: string,
  ) {
    const value = this.readOptionalString(input, field);
    if (value) {
      return value;
    }

    throw new ApiRequestError(
      HttpStatus.BAD_REQUEST,
      "ASSISTANT_TOOL_INPUT_INVALID",
      `Platform Admin assistant tool field '${field}' is required.`,
      { field },
    );
  }

  private readOptionalString(
    input: Record<string, unknown> | undefined,
    field: string,
  ) {
    const value = input?.[field];
    return typeof value === "string" && value.trim() ? value.trim() : null;
  }

  private normalizeRouteId(route: string) {
    return route === "/"
      ? "home"
      : route.replace(/^\//, "").replace(/\//g, "-");
  }
}
