import { Injectable, Logger, Optional } from "@nestjs/common";
import type {
  AdapterHealthRecord,
  PlatformEligibility,
  PlatformCode,
  PlatformPresenceAdapterStatusRecord,
  PlatformPresenceRecord,
  PlatformPresenceSummary,
} from "@drts/contracts";
import { PLATFORM_CODE_REGISTRY } from "@drts/contracts";
import { ForwarderService } from "../forwarder/forwarder.service";
import { PlatformPresenceRepository } from "./platform-presence.repository";

function isoNow() {
  return new Date().toISOString();
}

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

  async listForDriver(driverId: string): Promise<PlatformPresenceRecord[]> {
    if (this.dbEnabled()) {
      return this.repo!.listByDriver(driverId);
    }
    const map = this.memory.get(driverId);
    return map ? Array.from(map.values()) : [];
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
    tokenExpiresAt?: string | null,
  ): Promise<PlatformPresenceRecord> {
    const existing = (await this.listForDriver(driverId)).find(
      (r) => r.platformCode === platformCode,
    );

    const record: PlatformPresenceRecord = {
      driverId,
      platformCode,
      accountId: existing?.accountId ?? null,
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

    if (this.dbEnabled()) {
      return this.repo!.upsert(record);
    }
    const bucket = this.getMemoryBucket(driverId);
    bucket.set(platformCode, record);
    return record;
  }

  async setOffline(
    driverId: string,
    platformCode: PlatformCode,
  ): Promise<PlatformPresenceRecord> {
    const existing = (await this.listForDriver(driverId)).find(
      (r) => r.platformCode === platformCode,
    );

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

    if (this.dbEnabled()) {
      return this.repo!.upsert(record);
    }
    const bucket = this.getMemoryBucket(driverId);
    bucket.set(platformCode, record);
    return record;
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
    const presences = await this.listForDriver(driverId);
    const adapterHealth = this.listAdapterHealthSafely();
    return {
      driverId,
      presences,
      adapterStatuses: presences.map((presence) =>
        this.mapAdapterStatus(presence.platformCode, adapterHealth),
      ),
      notes: [
        "平台狀態會優先使用資料庫同步；若目前環境未啟用資料庫，會改用目前執行個體的暫存資料。",
        "可使用 POST /api/platform-presence/online 或 /api/platform-presence/offline 更新單一平台的綁定、上下線與重新驗證狀態。",
      ],
    };
  }
}
