import { Injectable, Logger, Optional } from "@nestjs/common";

import type {
  CrossAppResourceLink,
  EmptyStateEnvelope,
  FeatureFlag,
  FeatureFlagVisibilityListResponse,
  FeatureFlagVisibilityRecord,
  ResourceActionDescriptor,
  UiRefreshMetadata,
} from "@drts/contracts";

import { FeatureFlagRepository } from "./feature-flag.repository";

export interface FeatureFlagSeed {
  key: string;
  enabled: boolean;
  description: string;
  tenantId?: string;
}

@Injectable()
export class FeatureFlagsService {
  private readonly logger = new Logger(FeatureFlagsService.name);
  private static readonly VIEW_CHANGE_HISTORY_ACTION: ResourceActionDescriptor =
    {
      action: "view_change_history",
      enabled: true,
      riskLevel: "low",
    };
  private static readonly SEARCH_ACTION: ResourceActionDescriptor = {
    action: "search",
    enabled: true,
    riskLevel: "low",
  };
  private static readonly OPEN_OWNER_APP_ACTION: ResourceActionDescriptor = {
    action: "open_platform_admin",
    enabled: true,
    riskLevel: "low",
  };

  // In-memory fallback (used when DB is not available)
  private inMemoryFlags: Map<string, FeatureFlag> = new Map();

  constructor(
    @Optional() private readonly featureFlagRepository?: FeatureFlagRepository,
  ) {
    this.seedDefaults();
  }

  private seedDefaults() {
    const now = new Date().toISOString();
    const defaultFlags: FeatureFlagSeed[] = [
      {
        key: "tenant-portal.booking",
        enabled: true,
        description: "Enable tenant portal booking management",
      },
      {
        key: "tenant-portal.billing",
        enabled: true,
        description: "Enable tenant portal billing views",
      },
      {
        key: "tenant-portal.reports",
        enabled: true,
        description: "Enable tenant portal report job submission",
      },
      {
        key: "tenant-portal.webhooks",
        enabled: true,
        description: "Enable tenant portal webhook management",
      },
      {
        key: "ops-console.dispatch",
        enabled: true,
        description: "Enable ops console dispatch board",
      },
      {
        key: "ops-console.complaint",
        enabled: true,
        description: "Enable ops console complaint case management",
      },
      {
        key: "ops-console.callcenter",
        enabled: true,
        description: "Enable ops console callcenter session views",
      },
      {
        key: "ops-console.reports",
        enabled: true,
        description: "Enable ops console report job management",
      },
      {
        key: "ops-console.reports",
        enabled: false,
        description:
          "Disable ops console report job management for pilot tenant",
        tenantId: "tenant-acme-mobility",
      },
      {
        key: "driver-app.tasks",
        enabled: true,
        description: "Enable driver app task lifecycle",
      },
      {
        key: "driver-app.earnings",
        enabled: true,
        description: "Enable driver app earnings read model",
      },
      {
        key: "driver-app.incidents",
        enabled: true,
        description: "Enable driver app incident reporting",
      },
      {
        key: "driver-app.shift",
        enabled: false,
        description: "Enable driver app shift/attendance tracking",
      },
      {
        key: "driver-app.shift",
        enabled: true,
        description:
          "Enable driver app shift/attendance tracking for beta tenant",
        tenantId: "tenant-beta-dispatch",
      },
      {
        key: "phase1.read-models",
        enabled: true,
        description: "Enable Phase 1 read model surfaces",
      },
      {
        key: "phase1.smoke-paths",
        enabled: true,
        description: "Enable Phase 1 smoke test endpoints",
      },
    ];

    for (const flag of defaultFlags) {
      const ff: FeatureFlag = {
        key: flag.key,
        enabled: flag.enabled,
        description: flag.description,
        updatedAt: now,
      };
      if (flag.tenantId) {
        ff.tenantId = flag.tenantId;
      }
      this.inMemoryFlags.set(
        flag.tenantId
          ? this.inMemoryOverrideKey(flag.key, flag.tenantId)
          : flag.key,
        ff,
      );
    }
  }

  private getDb(): boolean {
    return this.featureFlagRepository?.isEnabled() ?? false;
  }

  private inMemoryOverrideKey(key: string, tenantId: string): string {
    return `${key}:${tenantId}`;
  }

  private getInMemoryTenantOverride(
    key: string,
    tenantId?: string,
  ): FeatureFlag | undefined {
    if (!tenantId) {
      return undefined;
    }
    return this.inMemoryFlags.get(this.inMemoryOverrideKey(key, tenantId));
  }

  private async getRawFlags(): Promise<FeatureFlag[]> {
    if (this.getDb()) {
      return this.featureFlagRepository!.findAll();
    }

    return Array.from(this.inMemoryFlags.values());
  }

  private filterFlagsForTenant(
    flags: FeatureFlag[],
    tenantId: string,
  ): FeatureFlag[] {
    const tenantOverrides = new Map<string, FeatureFlag>();
    const globalFlags: FeatureFlag[] = [];

    for (const flag of flags) {
      if (flag.tenantId === tenantId) {
        tenantOverrides.set(flag.key, flag);
        continue;
      }

      if (!flag.tenantId) {
        globalFlags.push(flag);
      }
    }

    const mergedFlags = globalFlags.map(
      (flag) => tenantOverrides.get(flag.key) ?? flag,
    );

    for (const override of tenantOverrides.values()) {
      if (!mergedFlags.some((flag) => flag.key === override.key)) {
        mergedFlags.push(override);
      }
    }

    return mergedFlags;
  }

  private filterFlagsForOps(flags: FeatureFlag[]): FeatureFlag[] {
    return [...flags].sort((left, right) => {
      const keyCompare = left.key.localeCompare(right.key);
      if (keyCompare !== 0) {
        return keyCompare;
      }

      if (!!left.tenantId !== !!right.tenantId) {
        return left.tenantId ? 1 : -1;
      }

      return (left.tenantId ?? "").localeCompare(right.tenantId ?? "");
    });
  }

  private collectRelatedFlags(
    flags: FeatureFlag[],
  ): Map<string, { globalFlag?: FeatureFlag; tenantOverrides: FeatureFlag[] }> {
    const relatedByKey = new Map<
      string,
      { globalFlag?: FeatureFlag; tenantOverrides: FeatureFlag[] }
    >();

    for (const flag of flags) {
      const bucket = relatedByKey.get(flag.key) ?? {
        tenantOverrides: [],
      };

      if (flag.tenantId) {
        bucket.tenantOverrides.push(flag);
      } else {
        bucket.globalFlag = flag;
      }

      relatedByKey.set(flag.key, bucket);
    }

    return relatedByKey;
  }

  async getAll(tenantId?: string): Promise<FeatureFlag[]> {
    const flags = await this.getRawFlags();

    if (tenantId) {
      return this.filterFlagsForTenant(flags, tenantId);
    }

    return flags.filter((flag) => !flag.tenantId);
  }

  async getOpsSummary(
    tenantId?: string,
  ): Promise<FeatureFlagVisibilityListResponse> {
    const rawFlags = await this.getRawFlags();
    const flags = tenantId
      ? this.filterFlagsForTenant(rawFlags, tenantId)
      : this.filterFlagsForOps(rawFlags);
    const refresh = this.buildRefreshMetadata();
    const ownerAppLink = this.buildOwnerAppLink();
    const relatedByKey = this.collectRelatedFlags(rawFlags);

    if (flags.length === 0) {
      const emptyState: EmptyStateEnvelope = {
        reason: "no_data",
        messageCode: "ops_feature_flags.no_data",
      };

      return {
        items: [],
        refresh,
        emptyState,
        availableActions: [
          FeatureFlagsService.SEARCH_ACTION,
          FeatureFlagsService.OPEN_OWNER_APP_ACTION,
        ],
        ownerAppLink,
      };
    }

    return {
      items: flags.map((flag) =>
        this.toOpsFlagRecord(
          flag,
          ownerAppLink,
          relatedByKey.get(flag.key),
          tenantId,
        ),
      ),
      refresh,
      availableActions: [
        FeatureFlagsService.SEARCH_ACTION,
        FeatureFlagsService.OPEN_OWNER_APP_ACTION,
      ],
      ownerAppLink,
    };
  }

  async getByKey(
    key: string,
    tenantId?: string,
  ): Promise<FeatureFlag | undefined> {
    if (this.getDb()) {
      return this.featureFlagRepository!.findByKey(key, tenantId);
    }
    return (
      this.getInMemoryTenantOverride(key, tenantId) ??
      this.inMemoryFlags.get(key)
    );
  }

  async updateFlag(
    key: string,
    enabled: boolean,
  ): Promise<FeatureFlag | undefined> {
    if (this.getDb()) {
      return this.featureFlagRepository!.updateFlag(key, enabled);
    }
    const existing = this.inMemoryFlags.get(key);
    if (!existing) return undefined;
    const updated: FeatureFlag = {
      ...existing,
      enabled,
      updatedAt: new Date().toISOString(),
    };
    this.inMemoryFlags.set(key, updated);
    return updated;
  }

  async isEnabled(key: string, tenantId?: string): Promise<boolean> {
    const flag = await this.getByKey(key, tenantId);
    return flag?.enabled ?? false;
  }

  async upsertTenantOverride(
    key: string,
    tenantId: string,
    enabled: boolean,
    description?: string,
  ): Promise<FeatureFlag | undefined> {
    const globalFlag = await this.getByKey(key);
    const desc =
      description ?? globalFlag?.description ?? `Tenant override for ${key}`;

    if (this.getDb()) {
      return this.featureFlagRepository!.upsertTenantOverride(
        key,
        tenantId,
        enabled,
        desc,
      );
    }
    // In-memory fallback
    const updated: FeatureFlag = {
      key,
      enabled,
      description: desc,
      updatedAt: new Date().toISOString(),
      tenantId: tenantId,
    };
    this.inMemoryFlags.set(this.inMemoryOverrideKey(key, tenantId), updated);
    return updated;
  }

  private buildRefreshMetadata(): UiRefreshMetadata {
    return {
      generatedAt: new Date().toISOString(),
      staleAfterMs: 0,
      dataFreshness: this.getDb() ? "fresh" : "unknown",
      source: this.getDb() ? "live" : "static",
    };
  }

  private buildOwnerAppLink(): CrossAppResourceLink {
    return {
      targetApp: "platform-admin",
      route: "/feature-flags",
      resourceType: "feature_flag_registry",
      resourceId: "platform-defaults",
      openMode: "new_tab",
      label: "Platform Admin",
    };
  }

  private toOpsFlagRecord(
    flag: FeatureFlag,
    ownerAppLink: CrossAppResourceLink,
    related:
      | {
          globalFlag?: FeatureFlag;
          tenantOverrides: FeatureFlag[];
        }
      | undefined,
    filteredTenantId?: string,
  ): FeatureFlagVisibilityRecord {
    const scope = flag.tenantId ? "tenant" : "global";
    const visibleRelatedFlags = filteredTenantId
      ? [
          ...(related?.globalFlag ? [related.globalFlag] : []),
          ...(related?.tenantOverrides ?? []).filter(
            (item) => item.tenantId === filteredTenantId,
          ),
        ]
      : [
          ...(related?.globalFlag ? [related.globalFlag] : []),
          ...(related?.tenantOverrides ?? []),
        ];
    const distinctValues = new Set(
      visibleRelatedFlags.map((relatedFlag) => relatedFlag.enabled),
    );
    const rolloutState = distinctValues.size > 1 ? "partial" : "uniform";
    const divergingOverrides =
      related?.globalFlag == null
        ? 0
        : related.tenantOverrides.filter(
            (override) => override.enabled !== related.globalFlag!.enabled,
          ).length;
    const rolloutSummary =
      rolloutState === "partial"
        ? filteredTenantId && flag.tenantId === filteredTenantId
          ? "Tenant override differs from the platform default."
          : divergingOverrides > 0
            ? `${divergingOverrides} tenant override${
                divergingOverrides === 1 ? "" : "s"
              } differ from the platform default.`
            : "Visible scopes do not currently resolve to the same value."
        : null;

    return {
      key: flag.key,
      description: flag.description,
      enabled: flag.enabled,
      scope,
      tenantId: flag.tenantId ?? null,
      tenantLabel: flag.tenantId ?? null,
      rolloutState,
      rolloutSummary,
      lastChangedAt: flag.updatedAt,
      lastChangedBy: flag.tenantId
        ? `tenant:${flag.tenantId}`
        : "platform_admin",
      availableActions: [FeatureFlagsService.VIEW_CHANGE_HISTORY_ACTION],
      historyLink: {
        targetApp: "platform-admin",
        route: `/feature-flags?flag=${encodeURIComponent(flag.key)}${
          flag.tenantId ? `&tenantId=${encodeURIComponent(flag.tenantId)}` : ""
        }`,
        resourceType: "feature_flag",
        resourceId: flag.tenantId ? `${flag.key}:${flag.tenantId}` : flag.key,
        openMode: "new_tab",
        label: "Platform Admin",
      },
      ownerLink: ownerAppLink,
    };
  }
}
