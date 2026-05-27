import { Injectable } from "@nestjs/common";

import type {
  AdapterHealthRecord,
  PartnerChannelEntryRecord,
  PlatformAdminTenantRecord,
  UiHealthBlocker,
  UiHealthEnvelope,
  UiHealthIndicator,
  UiHealthStatus,
} from "@drts/contracts";

import { ForwarderService } from "../forwarder/forwarder.service";
import { TenantPartnerService } from "../tenant-partner/tenant-partner.service";
import { TenantsService } from "./tenants.service";

const UI_HEALTH_STALE_AFTER_MS = 60_000;

@Injectable()
export class PlatformAdminHealthService {
  constructor(
    private readonly tenantsService: TenantsService,
    private readonly tenantPartnerService: TenantPartnerService,
    private readonly forwarderService: ForwarderService,
  ) {}

  getUiHealth(now = new Date()): UiHealthEnvelope {
    const nowIso = now.toISOString();
    const tenants = this.tenantsService.list();
    const activePartnerEntries = this.tenantPartnerService
      .listPlatformPartnerEntries()
      .filter((entry) => this.isActivePartnerEntry(entry));
    const adapters = this.forwarderService.listAdapterHealth();

    const rolloutPendingTenants = tenants.filter((tenant) =>
      this.isRolloutPending(tenant),
    );
    const rolloutBlockedTenants = tenants.filter((tenant) =>
      this.isRolloutBlocked(tenant),
    );
    const partnerCredentialSignals = this.collectPartnerCredentialSignals(
      activePartnerEntries,
      adapters,
    );
    const unhealthyAdapters = adapters.filter((adapter) =>
      this.isAdapterUnhealthy(adapter),
    );
    const downAdapters = unhealthyAdapters.filter(
      (adapter) => adapter.status === "down",
    );

    const indicators: UiHealthIndicator[] = [
      {
        key: "rollout_pending",
        label: "Rollout governance",
        status: this.resolveRolloutIndicatorStatus(
          rolloutPendingTenants.length,
          rolloutBlockedTenants.length,
        ),
        value: rolloutPendingTenants.length,
        unit: "tenants",
        description:
          rolloutPendingTenants.length === 0
            ? "All tenants have cleared rollout governance gates."
            : `${rolloutPendingTenants.length} tenant rollout paths still require governance attention.`,
      },
      {
        key: "partner_credentials_expiring",
        label: "Partner credentials",
        status: this.resolvePartnerCredentialStatus(partnerCredentialSignals),
        value:
          partnerCredentialSignals.missingCount +
          partnerCredentialSignals.expiringCount +
          partnerCredentialSignals.expiredCount,
        unit: "entries",
        description:
          partnerCredentialSignals.missingCount +
            partnerCredentialSignals.expiringCount +
            partnerCredentialSignals.expiredCount ===
          0
            ? "No partner ingress or adapter credential risks are active."
            : "Partner ingress coverage or adapter credential health needs review.",
      },
      {
        key: "adapters_unhealthy",
        label: "Adapter health",
        status: this.resolveAdapterIndicatorStatus(
          unhealthyAdapters.length,
          downAdapters.length,
        ),
        value: unhealthyAdapters.length,
        unit: "adapters",
        description:
          unhealthyAdapters.length === 0
            ? "All adapter health checks are green."
            : `${unhealthyAdapters.length} adapters are reporting degraded or down health.`,
      },
    ];

    const blockers = this.buildBlockers(
      rolloutBlockedTenants,
      partnerCredentialSignals.missingEntries,
      downAdapters,
    );
    const status = this.resolveOverallStatus(indicators, blockers);

    return {
      status,
      summary: this.buildSummary(status, indicators, blockers),
      refresh: {
        generatedAt: nowIso,
        staleAfterMs: UI_HEALTH_STALE_AFTER_MS,
        dataFreshness: status === "healthy" ? "fresh" : "degraded",
        source: "live",
      },
      indicators,
      blockers,
    };
  }

  private isRolloutPending(tenant: PlatformAdminTenantRecord) {
    return (
      tenant.rollout.stage !== "production" ||
      tenant.rollout.sandboxStatus !== "approved" ||
      tenant.rollout.pilotStatus !== "approved" ||
      tenant.rollout.productionStatus !== "approved"
    );
  }

  private isRolloutBlocked(tenant: PlatformAdminTenantRecord) {
    return (
      tenant.rollout.sandboxStatus === "blocked" ||
      tenant.rollout.pilotStatus === "blocked" ||
      tenant.rollout.productionStatus === "blocked"
    );
  }

  private isActivePartnerEntry(entry: PartnerChannelEntryRecord) {
    return entry.activeFlag && entry.status === "active";
  }

  private collectPartnerCredentialSignals(
    activePartnerEntries: PartnerChannelEntryRecord[],
    adapters: AdapterHealthRecord[],
  ) {
    const missingEntries = activePartnerEntries.filter((entry) => {
      const credentials =
        this.tenantPartnerService.listPlatformPartnerIngressCredentials(
          entry.entrySlug,
        );
      return !credentials.some((credential) => credential.revokedAt === null);
    });

    let expiringCount = 0;
    let expiredCount = 0;
    for (const adapter of adapters) {
      if (adapter.authStatus === "reauth_required") {
        expiringCount += 1;
        continue;
      }
      if (
        adapter.credentialStatus === "expired" ||
        adapter.credentialStatus === "invalid" ||
        adapter.credentialStatus === "not_configured"
      ) {
        expiredCount += 1;
      }
    }

    return {
      missingCount: missingEntries.length,
      expiringCount,
      expiredCount,
      missingEntries,
    };
  }

  private isAdapterUnhealthy(adapter: AdapterHealthRecord) {
    return adapter.status !== "healthy";
  }

  private resolveRolloutIndicatorStatus(
    pendingCount: number,
    blockedCount: number,
  ): UiHealthStatus {
    if (blockedCount > 0) {
      return "unhealthy";
    }
    if (pendingCount > 0) {
      return "degraded";
    }
    return "healthy";
  }

  private resolvePartnerCredentialStatus(signals: {
    missingCount: number;
    expiringCount: number;
    expiredCount: number;
  }): UiHealthStatus {
    if (signals.missingCount > 0 || signals.expiredCount > 0) {
      return "unhealthy";
    }
    if (signals.expiringCount > 0) {
      return "degraded";
    }
    return "healthy";
  }

  private resolveAdapterIndicatorStatus(
    unhealthyCount: number,
    downCount: number,
  ): UiHealthStatus {
    if (downCount > 0) {
      return "unhealthy";
    }
    if (unhealthyCount > 0) {
      return "degraded";
    }
    return "healthy";
  }

  private buildBlockers(
    rolloutBlockedTenants: PlatformAdminTenantRecord[],
    entriesMissingCredentials: PartnerChannelEntryRecord[],
    downAdapters: AdapterHealthRecord[],
  ): UiHealthBlocker[] {
    const blockers: UiHealthBlocker[] = [];

    for (const tenant of rolloutBlockedTenants) {
      blockers.push({
        code: "tenant_rollout_blocked",
        message: `${tenant.name} has a blocked rollout gate.`,
        severity: "critical",
        resourceType: "platform_tenant",
        resourceId: tenant.id,
      });
    }

    for (const entry of entriesMissingCredentials) {
      blockers.push({
        code: "partner_credential_missing",
        message: `${entry.displayName} is active without a partner ingress credential.`,
        severity: "critical",
        resourceType: "partner_entry",
        resourceId: entry.entrySlug,
      });
    }

    for (const adapter of downAdapters) {
      blockers.push({
        code: "adapter_unhealthy",
        message: `${adapter.platformCode} adapter is down.`,
        severity: "critical",
        resourceType: "forwarder_adapter",
        resourceId: adapter.platformCode,
      });
    }

    return blockers;
  }

  private resolveOverallStatus(
    indicators: UiHealthIndicator[],
    blockers: UiHealthBlocker[],
  ): UiHealthStatus {
    if (
      indicators.some((indicator) => indicator.status === "unhealthy") ||
      blockers.some((blocker) => blocker.severity === "critical")
    ) {
      return "unhealthy";
    }
    if (
      indicators.some((indicator) => indicator.status === "degraded") ||
      blockers.some((blocker) => blocker.severity === "warning")
    ) {
      return "degraded";
    }
    return "healthy";
  }

  private buildSummary(
    status: UiHealthStatus,
    indicators: UiHealthIndicator[],
    blockers: UiHealthBlocker[],
  ) {
    const affectedIndicators = indicators.filter(
      (indicator) => indicator.status !== "healthy",
    ).length;

    if (status === "healthy") {
      return "Platform admin health is nominal.";
    }

    if (status === "unhealthy") {
      return `${blockers.length} critical blockers and ${affectedIndicators} unhealthy indicators require action.`;
    }

    return `${affectedIndicators} indicators are degraded and should be reviewed.`;
  }
}
