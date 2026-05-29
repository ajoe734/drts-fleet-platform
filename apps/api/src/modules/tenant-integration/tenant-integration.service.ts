import { Injectable } from "@nestjs/common";

import type {
  FeatureFlag,
  PartnerChannelEntryRecord,
  ResourceActionDescriptor,
  TenantApiKeyRecord,
  TenantIntegrationReadinessItem,
  TenantIntegrationReadinessSummary,
  TenantNotificationPreferences,
  TenantSlaProfile,
  TenantWebhookEndpoint,
} from "@drts/contracts";

import { FeatureFlagsService } from "../feature-flags/feature-flags.service";
import { TenantPartnerService } from "../tenant-partner/tenant-partner.service";

type ReadinessStatus = TenantIntegrationReadinessItem["status"];

/**
 * Aggregates tenant integration readiness across the seven integration
 * sub-systems into a single response (Q-TEN10).
 *
 * The tenant console previously would have had to orchestrate 6+ parallel
 * reads (api keys, webhooks, notifications, SLA, reports, modules, partner
 * entries) and derive readiness on the client. This service centralises that
 * derivation behind `/api/tenant/integration-governance/readiness` so the UI
 * issues exactly one request.
 *
 * All sub-system state is read through already-provisioned, tenant-scoped
 * services (`TenantPartnerService`, `FeatureFlagsService`); this service adds
 * no new persistence and performs no mutation.
 */
@Injectable()
export class TenantIntegrationService {
  constructor(
    private readonly tenantPartnerService: TenantPartnerService,
    private readonly featureFlagsService: FeatureFlagsService,
  ) {}

  async getReadinessSummary(
    tenantId: string,
  ): Promise<TenantIntegrationReadinessSummary> {
    const computedAt = new Date().toISOString();
    const referenceTime = Date.parse(computedAt);

    const apiKeys = this.tenantPartnerService.listApiKeys(tenantId);
    const webhooks = this.tenantPartnerService.listWebhookEndpoints(
      tenantId,
    ) as TenantWebhookEndpoint[];
    const notifications =
      this.tenantPartnerService.getNotificationPreferences(tenantId);
    const sla = this.tenantPartnerService.getSlaProfile(tenantId);
    const partnerEntries = this.tenantPartnerService
      .listPlatformPartnerEntries()
      .filter((entry) => entry.tenantId === tenantId);
    const featureFlags = await this.featureFlagsService.getAll(tenantId);

    const items: TenantIntegrationReadinessItem[] = [
      this.deriveApiKeysReadiness(apiKeys, referenceTime),
      this.deriveWebhooksReadiness(webhooks),
      this.deriveNotificationsReadiness(notifications),
      this.deriveSlaReadiness(sla),
      this.deriveReportsReadiness(apiKeys, referenceTime),
      this.deriveModulesReadiness(featureFlags),
      this.derivePartnerEntriesReadiness(partnerEntries),
    ];

    return {
      tenantId,
      items,
      computedAt,
    };
  }

  private isApiKeyActive(
    apiKey: TenantApiKeyRecord,
    referenceTime: number,
  ): boolean {
    if (apiKey.revokedAt) {
      return false;
    }
    if (!apiKey.expiresAt) {
      return true;
    }
    return Date.parse(apiKey.expiresAt) > referenceTime;
  }

  private deriveApiKeysReadiness(
    apiKeys: TenantApiKeyRecord[],
    referenceTime: number,
  ): TenantIntegrationReadinessItem {
    const issueAction = this.action("issue_api_key", "medium");

    if (apiKeys.length === 0) {
      return {
        subSystem: "api_keys",
        status: "not_provisioned",
        detail: "No API keys have been issued for this tenant.",
        nextAction: issueAction,
      };
    }

    const active = apiKeys.filter((key) =>
      this.isApiKeyActive(key, referenceTime),
    );
    if (active.length > 0) {
      return {
        subSystem: "api_keys",
        status: "ready",
        detail: `${active.length} active API key(s).`,
      };
    }

    const expired = apiKeys.filter(
      (key) =>
        !key.revokedAt &&
        key.expiresAt !== null &&
        Date.parse(key.expiresAt) <= referenceTime,
    );
    if (expired.length > 0) {
      return {
        subSystem: "api_keys",
        status: "partial",
        detail: "All API keys have expired; rotate to restore access.",
        nextAction: this.action("rotate_api_key", "medium"),
      };
    }

    // Keys exist but none are usable and none merely expired => all revoked.
    return {
      subSystem: "api_keys",
      status: "blocked",
      detail: "All API keys have been revoked.",
      nextAction: issueAction,
    };
  }

  private deriveWebhooksReadiness(
    webhooks: TenantWebhookEndpoint[],
  ): TenantIntegrationReadinessItem {
    if (webhooks.length === 0) {
      return {
        subSystem: "webhooks",
        status: "not_provisioned",
        detail: "No webhook endpoints have been registered.",
        nextAction: this.action("create_webhook", "medium"),
      };
    }

    const active = webhooks.filter((endpoint) => endpoint.status === "active");
    if (active.length > 0) {
      return {
        subSystem: "webhooks",
        status: "ready",
        detail: `${active.length} active webhook endpoint(s).`,
      };
    }

    const deliveryFailed = webhooks.some(
      (endpoint) =>
        endpoint.status === "disabled" &&
        endpoint.runtimeMetadata?.disableReason === "delivery_failed",
    );
    if (deliveryFailed) {
      return {
        subSystem: "webhooks",
        status: "blocked",
        detail:
          "A webhook endpoint was auto-disabled after repeated delivery failures.",
        nextAction: this.action("rotate_webhook_secret", "high"),
      };
    }

    return {
      subSystem: "webhooks",
      status: "partial",
      detail: "Webhook endpoints exist but none are active yet.",
      nextAction: this.action("send_test_webhook", "low"),
    };
  }

  private deriveNotificationsReadiness(
    notifications: TenantNotificationPreferences,
  ): TenantIntegrationReadinessItem {
    const subscriptions = notifications.subscriptions ?? [];
    if (subscriptions.length === 0) {
      return {
        subSystem: "notifications",
        status: "not_provisioned",
        detail: "No notification subscriptions are configured.",
        nextAction: this.action("update_notifications", "low"),
      };
    }

    const enabled = subscriptions.filter(
      (subscription) => subscription.enabled,
    );
    if (enabled.length > 0) {
      return {
        subSystem: "notifications",
        status: "ready",
        detail: `${enabled.length} active notification subscription(s).`,
      };
    }

    return {
      subSystem: "notifications",
      status: "partial",
      detail: "Notification subscriptions exist but all are disabled.",
      nextAction: this.action("update_notifications", "low"),
    };
  }

  private deriveSlaReadiness(
    sla: TenantSlaProfile,
  ): TenantIntegrationReadinessItem {
    const configured =
      sla.waitThresholdMin > 0 &&
      sla.arrivalThresholdMin > 0 &&
      sla.completionThresholdMin > 0;

    if (configured) {
      return {
        subSystem: "sla",
        status: "ready",
        detail: "SLA thresholds are configured.",
      };
    }

    return {
      subSystem: "sla",
      status: "not_provisioned",
      detail: "SLA thresholds are not configured.",
      nextAction: this.action("update_sla_profile", "medium"),
    };
  }

  /**
   * Report readiness is derived from the report-scoped grants on the tenant's
   * active API keys, which is the gate that actually controls report artifact
   * access. A key with `reports:write` can generate report jobs; a key with
   * only `reports:read` can fetch existing artifacts.
   */
  private deriveReportsReadiness(
    apiKeys: TenantApiKeyRecord[],
    referenceTime: number,
  ): TenantIntegrationReadinessItem {
    const activeScopes = new Set<string>();
    for (const key of apiKeys) {
      if (this.isApiKeyActive(key, referenceTime)) {
        for (const scope of key.scopes) {
          activeScopes.add(scope);
        }
      }
    }

    if (activeScopes.has("reports:write")) {
      return {
        subSystem: "reports",
        status: "ready",
        detail: "An active API key can generate and read report artifacts.",
      };
    }

    if (activeScopes.has("reports:read")) {
      return {
        subSystem: "reports",
        status: "partial",
        detail:
          "Report artifacts are readable but no key can generate new reports.",
        nextAction: this.action("rotate_api_key", "medium"),
      };
    }

    return {
      subSystem: "reports",
      status: "not_provisioned",
      detail: "No active API key grants report access.",
      nextAction: this.action("issue_api_key", "medium"),
    };
  }

  private deriveModulesReadiness(
    flags: FeatureFlag[],
  ): TenantIntegrationReadinessItem {
    if (flags.length === 0) {
      return {
        subSystem: "modules",
        status: "not_provisioned",
        detail: "No feature modules are available for this tenant.",
      };
    }

    const enabled = flags.filter((flag) => flag.enabled);
    if (enabled.length === 0) {
      return {
        subSystem: "modules",
        status: "not_provisioned",
        detail: "No feature modules are enabled for this tenant.",
        nextAction: this.action("enable_module", "medium"),
      };
    }

    if (enabled.length === flags.length) {
      return {
        subSystem: "modules",
        status: "ready",
        detail: `All ${flags.length} feature module(s) are enabled.`,
      };
    }

    return {
      subSystem: "modules",
      status: "partial",
      detail: `${enabled.length} of ${flags.length} feature module(s) enabled.`,
      nextAction: this.action("enable_module", "medium"),
    };
  }

  private derivePartnerEntriesReadiness(
    entries: PartnerChannelEntryRecord[],
  ): TenantIntegrationReadinessItem {
    if (entries.length === 0) {
      return {
        subSystem: "partner_entries",
        status: "not_provisioned",
        detail: "No partner channel entries are configured.",
        nextAction: this.action("create_partner_entry", "medium"),
      };
    }

    const active = entries.filter(
      (entry) => entry.activeFlag && entry.status === "active",
    );
    if (active.length > 0) {
      return {
        subSystem: "partner_entries",
        status: "ready",
        detail: `${active.length} active partner channel entry/entries.`,
      };
    }

    const live = entries.filter((entry) => entry.status !== "revoked");
    if (live.length > 0) {
      return {
        subSystem: "partner_entries",
        status: "partial",
        detail: "Partner channel entries exist but none are active.",
        nextAction: this.action("activate_partner_entry", "medium"),
      };
    }

    return {
      subSystem: "partner_entries",
      status: "blocked",
      detail: "All partner channel entries have been revoked.",
      nextAction: this.action("create_partner_entry", "medium"),
    };
  }

  private action(
    action: string,
    riskLevel: ResourceActionDescriptor["riskLevel"],
  ): ResourceActionDescriptor {
    return {
      action,
      enabled: true,
      riskLevel,
    };
  }
}

export type { ReadinessStatus };
