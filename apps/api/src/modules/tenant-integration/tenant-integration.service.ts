import { Injectable } from "@nestjs/common";

import type {
  PlatformTenantModule,
  ResourceActionDescriptor,
  TenantIntegrationReadinessItem,
  TenantIntegrationReadinessSummary,
  TenantNotificationSubscription,
} from "@drts/contracts";
import { PLATFORM_TENANT_MODULES } from "@drts/contracts";

import { TenantsService } from "../platform-admin/tenants.service";
import {
  ReportingFilingService,
  type TenantReportReadinessSnapshot,
} from "../reporting-filing/reporting-filing.service";
import {
  TenantPartnerService,
  type TenantPartnerIntegrationReadinessSnapshot,
} from "../tenant-partner/tenant-partner.service";

const REQUIRED_API_KEY_SCOPES = [
  "tenant:write",
  "reports:read",
  "tenant:webhooks:write",
];

@Injectable()
export class TenantIntegrationService {
  constructor(
    private readonly tenantPartnerService: TenantPartnerService,
    private readonly reportingFilingService: ReportingFilingService,
    private readonly tenantsService: TenantsService,
  ) {}

  getTenantIntegrationReadiness(
    tenantId: string,
  ): TenantIntegrationReadinessSummary {
    const tenantSnapshot =
      this.tenantPartnerService.getTenantIntegrationReadinessSnapshot(tenantId);
    const reportSnapshot =
      this.reportingFilingService.getTenantReportReadinessSnapshot(tenantId);
    const tenant = this.tenantsService.find(tenantId);
    const governancePackage =
      this.tenantPartnerService.getIntegrationGovernancePackage(tenantId);
    const computedAt = new Date().toISOString();

    return {
      tenantId,
      computedAt,
      items: [
        this.buildApiKeysItem(tenantSnapshot),
        this.buildWebhooksItem(
          tenantSnapshot,
          governancePackage.baselineWebhookEvents,
        ),
        this.buildNotificationsItem(
          tenantSnapshot,
          governancePackage.baselineNotificationSubscriptions,
        ),
        this.buildSlaItem(tenantSnapshot),
        this.buildReportsItem(
          tenant?.enabledModules ?? [],
          tenant?.status ?? null,
          reportSnapshot,
        ),
        this.buildModulesItem(tenant?.enabledModules ?? [], tenant?.status),
        this.buildPartnerEntriesItem(tenantSnapshot),
      ],
    };
  }

  private buildApiKeysItem(
    snapshot: TenantPartnerIntegrationReadinessSnapshot,
  ): TenantIntegrationReadinessItem {
    const now = Date.now();
    const fourteenDaysFromNow = now + 14 * 24 * 60 * 60 * 1000;
    const activeKeys = snapshot.apiKeys.filter((apiKey) => {
      if (apiKey.revokedAt) {
        return false;
      }
      if (!apiKey.expiresAt) {
        return true;
      }
      return new Date(apiKey.expiresAt).getTime() > now;
    });
    const expiringSoonCount = activeKeys.filter(
      (apiKey) =>
        apiKey.expiresAt !== null &&
        new Date(apiKey.expiresAt).getTime() <= fourteenDaysFromNow,
    ).length;
    const coveredScopes = new Set(
      activeKeys.flatMap((apiKey) => apiKey.scopes.map((scope) => scope)),
    );
    const missingScopes = REQUIRED_API_KEY_SCOPES.filter(
      (scope) => !coveredScopes.has(scope),
    );

    if (snapshot.apiKeys.length === 0) {
      return this.buildItem(
        "api_keys",
        "not_provisioned",
        "No tenant API keys issued yet.",
        "issue_api_key",
      );
    }

    if (activeKeys.length === 0) {
      return this.buildItem(
        "api_keys",
        "blocked",
        `${snapshot.apiKeys.length} keys recorded but none are currently usable.`,
        "issue_api_key",
      );
    }

    if (missingScopes.length === 0 && expiringSoonCount === 0) {
      return this.buildItem(
        "api_keys",
        "ready",
        `${activeKeys.length} active keys with full scope coverage.`,
      );
    }

    return this.buildItem(
      "api_keys",
      "partial",
      `${activeKeys.length} active · ${expiringSoonCount} expiring soon · missing ${missingScopes.length} required scopes.`,
      "issue_api_key",
    );
  }

  private buildWebhooksItem(
    snapshot: TenantPartnerIntegrationReadinessSnapshot,
    requiredEvents: readonly string[],
  ): TenantIntegrationReadinessItem {
    const endpoints = snapshot.webhookEndpoints;
    const activeEndpoints = endpoints.filter(
      (endpoint) => endpoint.status === "active",
    );
    const failedDeliveryCount = endpoints.reduce(
      (count, endpoint) =>
        count + (endpoint.runtimeMetadata?.failedDeliveryCount ?? 0),
      0,
    );
    const missingEvents = requiredEvents.filter(
      (eventType) =>
        !activeEndpoints.some((endpoint) =>
          endpoint.events.includes(eventType),
        ),
    );
    const validationGaps = activeEndpoints.filter(
      (endpoint) => !endpoint.runtimeMetadata?.lastValidatedAt,
    ).length;

    if (endpoints.length === 0) {
      return this.buildItem(
        "webhooks",
        "not_provisioned",
        "No webhook endpoints configured.",
        "set_up_webhook",
      );
    }

    if (activeEndpoints.length === 0) {
      return this.buildItem(
        "webhooks",
        "blocked",
        `${endpoints.length} endpoints exist but none are active.`,
        "set_up_webhook",
      );
    }

    if (
      failedDeliveryCount === 0 &&
      missingEvents.length === 0 &&
      validationGaps === 0
    ) {
      return this.buildItem(
        "webhooks",
        "ready",
        `${activeEndpoints.length} active endpoints with full event coverage.`,
      );
    }

    return this.buildItem(
      "webhooks",
      "partial",
      `${activeEndpoints.length}/${endpoints.length} active · ${failedDeliveryCount} failed deliveries · ${missingEvents.length} events missing.`,
      "set_up_webhook",
    );
  }

  private buildNotificationsItem(
    snapshot: TenantPartnerIntegrationReadinessSnapshot,
    baselineSubscriptions: readonly TenantNotificationSubscription[],
  ): TenantIntegrationReadinessItem {
    if (
      !snapshot.hasNotificationPreferences ||
      snapshot.notificationPreferences === null
    ) {
      return this.buildItem(
        "notifications",
        "not_provisioned",
        "Notification routing has not been configured.",
        "configure_notifications",
      );
    }

    const enabledChannels = new Set(
      snapshot.notificationPreferences.subscriptions
        .filter((subscription) => subscription.enabled)
        .map((subscription) => subscription.channel),
    );
    const requiredChannels = new Set(
      baselineSubscriptions
        .filter((subscription) => subscription.enabled)
        .map((subscription) => subscription.channel),
    );
    const coveredRequiredChannelCount = Array.from(requiredChannels).filter(
      (channel) => enabledChannels.has(channel),
    ).length;
    const detail =
      requiredChannels.size > 0
        ? `${coveredRequiredChannelCount}/${requiredChannels.size} baseline channels enabled.`
        : `${enabledChannels.size} channels enabled.`;

    if (enabledChannels.size === 0) {
      return this.buildItem(
        "notifications",
        "blocked",
        "Notification preferences exist but no channels are enabled.",
        "configure_notifications",
      );
    }

    if (
      requiredChannels.size === 0 ||
      coveredRequiredChannelCount === requiredChannels.size
    ) {
      return this.buildItem("notifications", "ready", detail);
    }

    return this.buildItem(
      "notifications",
      "partial",
      detail,
      "configure_notifications",
    );
  }

  private buildSlaItem(
    snapshot: TenantPartnerIntegrationReadinessSnapshot,
  ): TenantIntegrationReadinessItem {
    if (!snapshot.hasSlaProfile || snapshot.slaProfile === null) {
      return this.buildItem(
        "sla",
        "not_provisioned",
        "SLA thresholds have not been configured.",
        "configure_sla",
      );
    }

    const configuredThresholdCount = [
      snapshot.slaProfile.waitThresholdMin,
      snapshot.slaProfile.arrivalThresholdMin,
      snapshot.slaProfile.completionThresholdMin,
    ].filter((value) => value > 0).length;

    if (configuredThresholdCount === 0) {
      return this.buildItem(
        "sla",
        "blocked",
        "SLA profile exists but all thresholds are unset.",
        "configure_sla",
      );
    }

    if (configuredThresholdCount === 3) {
      return this.buildItem("sla", "ready", "3/3 SLA thresholds configured.");
    }

    return this.buildItem(
      "sla",
      "partial",
      `${configuredThresholdCount}/3 SLA thresholds configured.`,
      "configure_sla",
    );
  }

  private buildReportsItem(
    enabledModules: readonly PlatformTenantModule[],
    tenantStatus: string | null,
    snapshot: TenantReportReadinessSnapshot,
  ): TenantIntegrationReadinessItem {
    if (!enabledModules.includes("reporting")) {
      return this.buildItem(
        "reports",
        "not_provisioned",
        "Reporting module is not enabled for this tenant.",
        "create_report_job",
      );
    }

    if (tenantStatus !== null && tenantStatus !== "active") {
      return this.buildItem(
        "reports",
        "blocked",
        `Tenant status is ${tenantStatus}; report operations are gated.`,
        "create_report_job",
      );
    }

    if (snapshot.jobCount === 0) {
      return this.buildItem(
        "reports",
        "not_provisioned",
        "Reporting is enabled but no report jobs have been created yet.",
        "create_report_job",
      );
    }

    if (snapshot.activeArtifactCount > 0) {
      return this.buildItem(
        "reports",
        "ready",
        `${snapshot.availableJobTypes.length} job types runnable · ${snapshot.activeArtifactCount} active artifacts available.`,
      );
    }

    if (snapshot.failedJobCount > 0 && snapshot.runningJobCount === 0) {
      return this.buildItem(
        "reports",
        "blocked",
        `${snapshot.failedJobCount} report jobs failed and no active artifacts are available.`,
        "create_report_job",
      );
    }

    return this.buildItem(
      "reports",
      "partial",
      `${snapshot.availableJobTypes.length} job types runnable · ${snapshot.jobCount} jobs tracked · 0 active artifacts.`,
      "create_report_job",
    );
  }

  private buildModulesItem(
    enabledModules: readonly PlatformTenantModule[],
    tenantStatus?: string,
  ): TenantIntegrationReadinessItem {
    if (enabledModules.length === 0) {
      return this.buildItem(
        "modules",
        "not_provisioned",
        "No tenant modules are enabled.",
      );
    }

    if (tenantStatus && tenantStatus !== "active") {
      return this.buildItem(
        "modules",
        "blocked",
        `${enabledModules.length}/${PLATFORM_TENANT_MODULES.length} modules enabled, but tenant status is ${tenantStatus}.`,
      );
    }

    if (enabledModules.length === PLATFORM_TENANT_MODULES.length) {
      return this.buildItem(
        "modules",
        "ready",
        `${enabledModules.length}/${PLATFORM_TENANT_MODULES.length} modules enabled.`,
      );
    }

    return this.buildItem(
      "modules",
      "partial",
      `${enabledModules.length}/${PLATFORM_TENANT_MODULES.length} modules enabled.`,
    );
  }

  private buildPartnerEntriesItem(
    snapshot: TenantPartnerIntegrationReadinessSnapshot,
  ): TenantIntegrationReadinessItem {
    const entries = snapshot.partnerEntries;
    const activeEntries = entries.filter(
      (entry) => entry.activeFlag && entry.status === "active",
    );
    const readyEntries = activeEntries.filter((entry) => {
      const hasRoute = Boolean(entry.entryHost || entry.entryPath);
      const hasBranding = entry.brandingMetadata !== null;
      const hasCredential =
        entry.authMode !== "partner_api_key" ||
        (snapshot.activePartnerCredentialCounts[entry.entrySlug] ?? 0) > 0;

      return hasRoute && hasBranding && hasCredential;
    });

    if (entries.length === 0) {
      return this.buildItem(
        "partner_entries",
        "not_provisioned",
        "No tenant partner entries have been provisioned.",
      );
    }

    if (activeEntries.length === 0) {
      return this.buildItem(
        "partner_entries",
        "blocked",
        `${entries.length} partner entries recorded but none are active.`,
        "review_partner_entries",
      );
    }

    if (readyEntries.length === entries.length) {
      return this.buildItem(
        "partner_entries",
        "ready",
        `${readyEntries.length}/${entries.length} partner entries launch-ready.`,
      );
    }

    return this.buildItem(
      "partner_entries",
      "partial",
      `${readyEntries.length}/${entries.length} partner entries launch-ready.`,
      "review_partner_entries",
    );
  }

  private buildItem(
    subSystem: TenantIntegrationReadinessItem["subSystem"],
    status: TenantIntegrationReadinessItem["status"],
    detail: string,
    action?: string,
  ): TenantIntegrationReadinessItem {
    if (action) {
      return {
        subSystem,
        status,
        detail,
        nextAction: this.buildAction(action),
      };
    }

    return {
      subSystem,
      status,
      detail,
    };
  }

  private buildAction(action: string): ResourceActionDescriptor {
    return {
      action,
      enabled: true,
      riskLevel: "low",
    };
  }
}
