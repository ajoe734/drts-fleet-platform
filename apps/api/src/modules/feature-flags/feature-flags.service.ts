import { Injectable, Logger, Optional } from "@nestjs/common";

import type { FeatureFlag } from "@drts/contracts";

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
      this.inMemoryFlags.set(flag.key, ff);
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

  private mergeGlobalFlagsWithTenantOverrides(
    flags: FeatureFlag[],
    tenantId: string,
  ): FeatureFlag[] {
    const tenantOverrides = flags.filter((flag) => flag.tenantId === tenantId);
    const globalFlags = flags.filter((flag) => !flag.tenantId);
    const globalKeys = new Set(globalFlags.map((flag) => flag.key));

    return [
      ...globalFlags,
      ...tenantOverrides.filter((override) => !globalKeys.has(override.key)),
      ...tenantOverrides.filter((override) => globalKeys.has(override.key)),
    ];
  }

  async getAll(tenantId?: string): Promise<FeatureFlag[]> {
    if (this.getDb()) {
      const dbFlags = await this.featureFlagRepository!.findAll();
      if (tenantId) {
        return this.mergeGlobalFlagsWithTenantOverrides(dbFlags, tenantId);
      }
      return dbFlags.filter((f) => !f.tenantId);
    }
    const flags = Array.from(this.inMemoryFlags.values());
    if (tenantId) {
      return this.mergeGlobalFlagsWithTenantOverrides(flags, tenantId);
    }
    return flags.filter((flag) => !flag.tenantId);
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
}
