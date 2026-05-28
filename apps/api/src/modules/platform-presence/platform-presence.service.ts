import { Injectable, Logger, Optional } from "@nestjs/common";
import type {
  AdapterHealthRecord,
  PlatformEligibility,
  PlatformAuthMechanism,
  PlatformCode,
  PlatformPresenceAdapterStatusRecord,
  PlatformPresenceRecord,
  PlatformPresenceSummary,
  ResourceActionDescriptor,
} from "@drts/contracts";
import { PLATFORM_CODE_REGISTRY } from "@drts/contracts";
import { ForwarderService } from "../forwarder/forwarder.service";
import { PlatformPresenceRepository } from "./platform-presence.repository";

function isoNow() {
  return new Date().toISOString();
}

type PlatformBindingCapability = {
  authMechanism: PlatformAuthMechanism;
  driverSelfServiceBinding: boolean;
  autoAcceptAllowed: boolean;
};

const PLATFORM_BINDING_CAPABILITIES: Record<
  PlatformCode,
  PlatformBindingCapability
> = {
  uber: {
    authMechanism: "external_browser_oauth",
    driverSelfServiceBinding: true,
    autoAcceptAllowed: true,
  },
  grab: {
    authMechanism: "native_app_deeplink",
    driverSelfServiceBinding: true,
    autoAcceptAllowed: true,
  },
  "line-taxi": {
    authMechanism: "manual_credential",
    driverSelfServiceBinding: true,
    autoAcceptAllowed: false,
  },
  grab_taiwan: {
    authMechanism: "external_browser_oauth",
    driverSelfServiceBinding: true,
    autoAcceptAllowed: false,
  },
  indriver: {
    authMechanism: "ops_managed",
    driverSelfServiceBinding: false,
    autoAcceptAllowed: false,
  },
  forwarder_sandbox: {
    authMechanism: "manual_credential",
    driverSelfServiceBinding: true,
    autoAcceptAllowed: false,
  },
};

@Injectable()
export class PlatformPresenceService {
  private readonly logger = new Logger(PlatformPresenceService.name);

  // in-memory fallback storage: driverId -> platformCode -> record
  private memory: Map<string, Map<string, PlatformPresenceRecord>> = new Map();

  constructor(
    @Optional() private readonly repo?: PlatformPresenceRepository,
    @Optional() private readonly forwarderService?: ForwarderService,
  ) {}

  private dbEnabled(): boolean {
    return this.repo?.isEnabled() ?? false;
  }

  private getPlatformBindingCapability(
    platformCode: PlatformCode,
  ): PlatformBindingCapability {
    return (
      PLATFORM_BINDING_CAPABILITIES[platformCode] ?? {
        authMechanism: "ops_managed",
        driverSelfServiceBinding: false,
        autoAcceptAllowed: false,
      }
    );
  }

  private buildAvailableActions(
    record: PlatformPresenceRecord,
    adapterStatus: PlatformPresenceAdapterStatusRecord | null,
  ): ResourceActionDescriptor[] {
    const capability = this.getPlatformBindingCapability(record.platformCode);
    const isBound = Boolean(record.accountId);
    const adapterDown =
      adapterStatus?.status === "degraded" || adapterStatus?.status === "down";
    const actions: ResourceActionDescriptor[] = [
      {
        action: "view_platform_presence",
        enabled: true,
        riskLevel: "low",
      },
    ];

    if (capability.driverSelfServiceBinding && !isBound) {
      actions.push({
        action: "bind_platform_account",
        enabled: !adapterDown && capability.authMechanism !== "ops_managed",
        disabledReasonCode: adapterDown
          ? "adapter_down"
          : capability.authMechanism === "ops_managed"
            ? "driver_self_service_binding_disabled"
            : undefined,
        riskLevel: "medium",
      });
    }

    if (capability.driverSelfServiceBinding && isBound) {
      actions.push({
        action: "unbind_platform_account",
        enabled: !adapterDown,
        disabledReasonCode: adapterDown ? "adapter_down" : undefined,
        requiresReason: true,
        riskLevel: "high",
      });
    }

    if (isBound) {
      if (capability.authMechanism === "ops_managed") {
        actions.push({
          action: "contact_ops_for_reauth",
          enabled: true,
          riskLevel: "medium",
        });
      } else {
        actions.push({
          action: "reauth_platform_account",
          enabled: record.reauthRequired && !adapterDown,
          disabledReasonCode: adapterDown
            ? "adapter_down"
            : !record.reauthRequired
              ? "reauth_required"
              : undefined,
          riskLevel: "medium",
        });
      }
    }

    return actions;
  }

  private enrichPresenceRecord(
    record: PlatformPresenceRecord,
    adapterStatus: PlatformPresenceAdapterStatusRecord | null = null,
  ): PlatformPresenceRecord {
    const capability = this.getPlatformBindingCapability(record.platformCode);
    return {
      ...record,
      authMechanism: capability.authMechanism,
      driverSelfServiceBinding: capability.driverSelfServiceBinding,
      autoAcceptAllowed: capability.autoAcceptAllowed,
      availableActions: this.buildAvailableActions(record, adapterStatus),
    };
  }

  private buildUnboundRecord(
    driverId: string,
    platformCode: PlatformCode,
  ): PlatformPresenceRecord {
    return this.enrichPresenceRecord({
      driverId,
      platformCode,
      accountId: null,
      status: "offline",
      eligibility: "eligible",
      tokenExpiresAt: null,
      reauthRequired: false,
      lastOnlineAt: null,
      lastOfflineAt: null,
      updatedAt: isoNow(),
    });
  }

  async listForDriver(driverId: string): Promise<PlatformPresenceRecord[]> {
    if (this.dbEnabled()) {
      return (await this.repo!.listByDriver(driverId)).map((record) =>
        this.enrichPresenceRecord(record),
      );
    }
    const map = this.memory.get(driverId);
    return map
      ? Array.from(map.values()).map((record) =>
          this.enrichPresenceRecord(record),
        )
      : [];
  }

  private getMemoryBucket(
    driverId: string,
  ): Map<string, PlatformPresenceRecord> {
    let bucket = this.memory.get(driverId);
    if (!bucket) {
      bucket = new Map<string, PlatformPresenceRecord>();
      this.memory.set(driverId, bucket);
    }
    return bucket;
  }

  private computeReauthRequired(tokenExpiresAt?: string | null): boolean {
    if (!tokenExpiresAt) return false;
    const now = Date.now();
    const expires = new Date(tokenExpiresAt).getTime();
    const thresholdMs = 72 * 60 * 60 * 1000; // 72h re-auth warning window
    return expires <= now + thresholdMs;
  }

  async setOnline(
    driverId: string,
    platformCode: PlatformCode,
    accountId?: string | null,
    tokenExpiresAt?: string | null,
  ): Promise<PlatformPresenceRecord> {
    const existing = (await this.listForDriver(driverId)).find(
      (r) => r.platformCode === platformCode,
    );

    const record: PlatformPresenceRecord = {
      driverId,
      platformCode,
      accountId: accountId?.trim() || existing?.accountId || null,
      status: "online",
      eligibility: existing?.eligibility ?? ("eligible" as PlatformEligibility),
      tokenExpiresAt: tokenExpiresAt ?? existing?.tokenExpiresAt ?? null,
      reauthRequired: this.computeReauthRequired(
        tokenExpiresAt ?? existing?.tokenExpiresAt ?? null,
      ),
      lastOnlineAt: isoNow(),
      lastOfflineAt: existing?.lastOfflineAt ?? null,
      updatedAt: isoNow(),
    };
    const enriched = this.enrichPresenceRecord(record);

    if (this.dbEnabled()) {
      return this.repo!.upsert(enriched);
    }
    const bucket = this.getMemoryBucket(driverId);
    bucket.set(platformCode, enriched);
    return enriched;
  }

  async setOffline(
    driverId: string,
    platformCode: PlatformCode,
    reason?: string | null,
  ): Promise<PlatformPresenceRecord> {
    const existing = (await this.listForDriver(driverId)).find(
      (r) => r.platformCode === platformCode,
    );

    if (reason?.trim()) {
      this.logger.log(
        `Driver ${driverId} unbound ${platformCode} with reason: ${reason.trim()}`,
      );
    }

    const record: PlatformPresenceRecord = {
      driverId,
      platformCode,
      accountId: existing?.accountId ?? null,
      status: "offline",
      eligibility: existing?.eligibility ?? ("eligible" as PlatformEligibility),
      tokenExpiresAt: existing?.tokenExpiresAt ?? null,
      reauthRequired: this.computeReauthRequired(
        existing?.tokenExpiresAt ?? null,
      ),
      lastOnlineAt: existing?.lastOnlineAt ?? null,
      lastOfflineAt: isoNow(),
      updatedAt: isoNow(),
    };
    const enriched = this.enrichPresenceRecord(record);

    if (this.dbEnabled()) {
      return this.repo!.upsert(enriched);
    }
    const bucket = this.getMemoryBucket(driverId);
    bucket.set(platformCode, enriched);
    return enriched;
  }

  async unbind(
    driverId: string,
    platformCode: PlatformCode,
    reason: string,
  ): Promise<PlatformPresenceRecord> {
    const existing = (await this.listForDriver(driverId)).find(
      (r) => r.platformCode === platformCode,
    );

    this.logger.log(
      `Driver ${driverId} unbound ${platformCode} with reason: ${reason.trim()}`,
    );

    const record: PlatformPresenceRecord = {
      driverId,
      platformCode,
      accountId: null,
      status: "offline",
      eligibility: existing?.eligibility ?? ("eligible" as PlatformEligibility),
      tokenExpiresAt: null,
      reauthRequired: false,
      lastOnlineAt: existing?.lastOnlineAt ?? null,
      lastOfflineAt: isoNow(),
      updatedAt: isoNow(),
    };
    const enriched = this.enrichPresenceRecord(record);

    if (this.dbEnabled()) {
      return this.repo!.upsert(enriched);
    }
    const bucket = this.getMemoryBucket(driverId);
    bucket.set(platformCode, enriched);
    return enriched;
  }

  private listAdapterHealthSafely(): AdapterHealthRecord[] {
    try {
      return this.forwarderService?.listAdapterHealth() ?? [];
    } catch (error) {
      this.logger.warn(
        `Failed to read forwarder adapter health for platform presence summary: ${error instanceof Error ? error.message : String(error)}`,
      );
      return [];
    }
  }

  private mapAdapterStatus(
    platformCode: PlatformCode,
    adapterHealth: AdapterHealthRecord[],
  ): PlatformPresenceAdapterStatusRecord {
    const adapterKey =
      PLATFORM_CODE_REGISTRY[platformCode]?.forwarderAdapterKey;
    if (!adapterKey) {
      return {
        platformCode,
        status: "unknown",
        blockingReason: null,
        lastSyncAt: null,
      };
    }

    const adapter = adapterHealth.find(
      (record) => record.platformCode === adapterKey,
    );

    if (!adapter) {
      return {
        platformCode,
        status: "unknown",
        blockingReason: null,
        lastSyncAt: null,
      };
    }

    return {
      platformCode,
      status: adapter.status,
      blockingReason:
        adapter.status === "healthy"
          ? null
          : adapter.status === "degraded"
            ? "平台連線異常，接單可能延遲"
            : "平台轉接服務中斷，暫時無法接單",
      lastSyncAt: adapter.lastCheckedAt,
    };
  }

  async summary(driverId: string): Promise<PlatformPresenceSummary> {
    const existingPresences = await this.listForDriver(driverId);
    const presenceMap = new Map<PlatformCode, PlatformPresenceRecord>();
    (Object.keys(PLATFORM_CODE_REGISTRY) as PlatformCode[]).forEach(
      (platformCode) => {
        presenceMap.set(
          platformCode,
          this.buildUnboundRecord(driverId, platformCode),
        );
      },
    );
    existingPresences.forEach((presence) => {
      presenceMap.set(presence.platformCode, presence);
    });
    const presences = Array.from(presenceMap.values());
    const adapterHealth = this.listAdapterHealthSafely();
    const adapterStatuses = presences.map((presence) =>
      this.mapAdapterStatus(presence.platformCode, adapterHealth),
    );
    return {
      driverId,
      presences: presences.map((presence, index) =>
        this.enrichPresenceRecord(presence, adapterStatuses[index] ?? null),
      ),
      adapterStatuses,
      notes: [
        "平台狀態會優先使用資料庫同步；若目前環境未啟用資料庫，會改用目前執行個體的暫存資料。",
        "可使用 POST /api/platform-presence/online、/offline、/unbind 更新單一平台的綁定、上下線與重新驗證狀態。",
      ],
    };
  }
}
