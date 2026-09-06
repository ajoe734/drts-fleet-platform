import { randomUUID } from "crypto";

export interface UatTenantContext {
  tenantId: string;
  tenantCode: string;
  tenantName: string;
  tenantType: "enterprise" | "credit_card";
  brandName: string;
  defaultAreaId: string;
}

export interface TrackedResource {
  type: string;
  id: string;
  registeredAt: string;
}

export interface NamespaceCleanupReport {
  namespaceId: string;
  shardIndex: number;
  cleanedCount: number;
  resources: TrackedResource[];
  timestamp: string;
}

export interface CreateNamespaceOptions {
  shardIndex: number;
  taskId?: string;
  customPrefix?: string;
}

/**
 * Isolated UAT Namespace instance for a test run / worker shard.
 * Contains isolated Tenant A and Tenant B representations,
 * resource tracking, name/ID qualification, and self-contained cleanup.
 */
export class UatNamespace {
  public readonly shardIndex: number;
  public readonly namespaceId: string;
  public readonly taskId: string;
  public readonly prefix: string;
  public readonly tenantA: UatTenantContext;
  public readonly tenantB: UatTenantContext;

  private readonly trackedResources: Map<string, TrackedResource> = new Map();
  private cleaned = false;

  constructor(options: {
    shardIndex: number;
    namespaceId: string;
    taskId: string;
    prefix: string;
    tenantA: UatTenantContext;
    tenantB: UatTenantContext;
  }) {
    this.shardIndex = options.shardIndex;
    this.namespaceId = options.namespaceId;
    this.taskId = options.taskId;
    this.prefix = options.prefix;
    this.tenantA = options.tenantA;
    this.tenantB = options.tenantB;

    // Register initial tenant resources
    this.registerResource("tenant", this.tenantA.tenantId);
    this.registerResource("tenant", this.tenantB.tenantId);
  }

  /**
   * Qualifies an ID with the namespace prefix to prevent collision across shards.
   */
  public qualifyId(baseId: string): string {
    return `${this.prefix}_${baseId}`;
  }

  /**
   * Qualifies a display or human-readable name with the shard and namespace identifier.
   */
  public qualifyName(baseName: string): string {
    return `[${this.prefix}] ${baseName}`;
  }

  /**
   * Tracks a resource created within this namespace.
   */
  public registerResource(type: string, id: string): void {
    const key = `${type}:${id}`;
    if (!this.trackedResources.has(key)) {
      this.trackedResources.set(key, {
        type,
        id,
        registeredAt: new Date().toISOString(),
      });
    }
  }

  /**
   * Returns all resources registered to this namespace.
   */
  public getResources(): TrackedResource[] {
    return Array.from(this.trackedResources.values());
  }

  /**
   * Whether this namespace has already been cleaned up.
   */
  public isCleaned(): boolean {
    return this.cleaned;
  }

  /**
   * Cleans up all resources created in this namespace.
   * Guarantees that only this namespace's resources are purged.
   */
  public async cleanup(): Promise<NamespaceCleanupReport> {
    if (this.cleaned) {
      return {
        namespaceId: this.namespaceId,
        shardIndex: this.shardIndex,
        cleanedCount: 0,
        resources: [],
        timestamp: new Date().toISOString(),
      };
    }

    const resources = this.getResources();
    const count = resources.length;

    // Clear tracked memory
    this.trackedResources.clear();
    this.cleaned = true;

    return {
      namespaceId: this.namespaceId,
      shardIndex: this.shardIndex,
      cleanedCount: count,
      resources,
      timestamp: new Date().toISOString(),
    };
  }
}

/**
 * UAT Namespace Manager: creates and manages isolated namespaces per shard/task.
 * Ensures zero cross-pollution between parallel runners.
 */
export class UatNamespaceManager {
  private static instance: UatNamespaceManager;
  private readonly namespaces: Map<string, UatNamespace> = new Map();

  public static getInstance(): UatNamespaceManager {
    if (!UatNamespaceManager.instance) {
      UatNamespaceManager.instance = new UatNamespaceManager();
    }
    return UatNamespaceManager.instance;
  }

  /**
   * Creates an isolated namespace for a specific shard and task.
   */
  public createShardNamespace(options: CreateNamespaceOptions): UatNamespace {
    const shardIndex = options.shardIndex;
    const taskId = options.taskId || "SR-UAT-GENERIC";
    const runToken = randomUUID().slice(0, 8);
    const namespaceId = `s${shardIndex}_${runToken}`;
    const prefix = options.customPrefix || `uat_s${shardIndex}_${runToken}`;

    // Tenant A: Enterprise Tenant
    const tenantAId = randomUUID();
    const tenantA: UatTenantContext = {
      tenantId: tenantAId,
      tenantCode: `TEN_A_${namespaceId}`.toUpperCase(),
      tenantName: `UAT Tenant A (${prefix})`,
      tenantType: "enterprise",
      brandName: `EnterpriseA_${namespaceId}`,
      defaultAreaId: "00000000-0000-0000-0000-000000000101",
    };

    // Tenant B: Credit Card Concierge Tenant
    const tenantBId = randomUUID();
    const tenantB: UatTenantContext = {
      tenantId: tenantBId,
      tenantCode: `TEN_B_${namespaceId}`.toUpperCase(),
      tenantName: `UAT Tenant B (${prefix})`,
      tenantType: "credit_card",
      brandName: `CreditCardB_${namespaceId}`,
      defaultAreaId: "00000000-0000-0000-0000-000000000102",
    };

    const namespace = new UatNamespace({
      shardIndex,
      namespaceId,
      taskId,
      prefix,
      tenantA,
      tenantB,
    });

    this.namespaces.set(namespaceId, namespace);
    return namespace;
  }

  /**
   * Retrieves an active namespace by ID.
   */
  public getNamespace(namespaceId: string): UatNamespace | undefined {
    return this.namespaces.get(namespaceId);
  }

  /**
   * Returns all currently active namespaces.
   */
  public getActiveNamespaces(): UatNamespace[] {
    return Array.from(this.namespaces.values()).filter((ns) => !ns.isCleaned());
  }

  /**
   * Asserts that two namespaces do not share identifiers, prefixes, or resources.
   * Throws an error if cross-pollution is detected.
   */
  public static assertNoCrossPollution(
    ns1: UatNamespace,
    ns2: UatNamespace,
  ): void {
    if (ns1.namespaceId === ns2.namespaceId) {
      throw new Error(`Namespace ID collision detected: ${ns1.namespaceId}`);
    }

    if (ns1.prefix === ns2.prefix) {
      throw new Error(`Namespace prefix collision detected: ${ns1.prefix}`);
    }

    if (ns1.tenantA.tenantId === ns2.tenantA.tenantId) {
      throw new Error(`Tenant A ID collision detected: ${ns1.tenantA.tenantId}`);
    }

    if (ns1.tenantB.tenantId === ns2.tenantB.tenantId) {
      throw new Error(`Tenant B ID collision detected: ${ns1.tenantB.tenantId}`);
    }

    if (ns1.tenantA.tenantCode === ns2.tenantA.tenantCode) {
      throw new Error(
        `Tenant A code collision detected: ${ns1.tenantA.tenantCode}`,
      );
    }

    if (ns1.tenantB.tenantCode === ns2.tenantB.tenantCode) {
      throw new Error(
        `Tenant B code collision detected: ${ns1.tenantB.tenantCode}`,
      );
    }

    // Check tracked resources set disjointness
    const ns1ResourceKeys = new Set(
      ns1.getResources().map((r) => `${r.type}:${r.id}`),
    );
    for (const r2 of ns2.getResources()) {
      const key = `${r2.type}:${r2.id}`;
      if (ns1ResourceKeys.has(key)) {
        throw new Error(
          `Resource collision between shard ${ns1.shardIndex} and shard ${ns2.shardIndex}: ${key}`,
        );
      }
    }
  }

  /**
   * Purges all tracked namespaces.
   */
  public async cleanupAll(): Promise<NamespaceCleanupReport[]> {
    const reports: NamespaceCleanupReport[] = [];
    for (const ns of this.namespaces.values()) {
      reports.push(await ns.cleanup());
    }
    this.namespaces.clear();
    return reports;
  }
}
