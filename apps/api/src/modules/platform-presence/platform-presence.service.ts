import { Injectable, Logger, Optional } from "@nestjs/common";
import type {
  AdapterHealthRecord,
  PlatformEligibility,
  PlatformCode,
  PlatformPresenceAdapterStatusRecord,
  PlatformPresenceRecord,
  PlatformPresenceSummary,
  DriverAvailabilityResult,
} from "@drts/contracts";
import { PLATFORM_CODE_REGISTRY } from "@drts/contracts";
import { ForwarderService } from "../forwarder/forwarder.service";
import { PlatformPresenceRepository } from "./platform-presence.repository";

export const DEFAULT_MAX_HEARTBEAT_AGE_MS = 5 * 60 * 1000; // 5 minutes

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

  listForDriverSync(driverId: string): PlatformPresenceRecord[] {
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
    recordedAt?: string | null,
  ): Promise<PlatformPresenceRecord> {
    const existing = (await this.listForDriver(driverId)).find(
      (r) => r.platformCode === platformCode,
    );
    const effectiveTime = recordedAt ?? isoNow();

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
      lastOnlineAt: effectiveTime,
      lastOfflineAt: existing?.lastOfflineAt ?? null,
      lastHeartbeatAt: effectiveTime,
      updatedAt: effectiveTime,
    };

    if (this.dbEnabled()) {
      const persisted = await this.repo!.upsert(record);
      const bucket = this.getMemoryBucket(driverId);
      bucket.set(platformCode, persisted);
      return persisted;
    }
    const bucket = this.getMemoryBucket(driverId);
    bucket.set(platformCode, record);
    return record;
  }

  async setOffline(
    driverId: string,
    platformCode: PlatformCode,
    recordedAt?: string | null,
  ): Promise<PlatformPresenceRecord> {
    const existing = (await this.listForDriver(driverId)).find(
      (r) => r.platformCode === platformCode,
    );
    const effectiveTime = recordedAt ?? isoNow();

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
      lastOfflineAt: effectiveTime,
      lastHeartbeatAt: existing?.lastHeartbeatAt ?? null,
      updatedAt: effectiveTime,
    };

    if (this.dbEnabled()) {
      const persisted = await this.repo!.upsert(record);
      const bucket = this.getMemoryBucket(driverId);
      bucket.set(platformCode, persisted);
      return persisted;
    }
    const bucket = this.getMemoryBucket(driverId);
    bucket.set(platformCode, record);
    return record;
  }

  async setBusy(
    driverId: string,
    platformCode: PlatformCode,
    reason?: string | null,
    recordedAt?: string | null,
  ): Promise<PlatformPresenceRecord> {
    const existing = (await this.listForDriver(driverId)).find(
      (r) => r.platformCode === platformCode,
    );
    const effectiveTime = recordedAt ?? isoNow();

    const record: PlatformPresenceRecord = {
      driverId,
      platformCode,
      accountId: existing?.accountId ?? null,
      status: "busy",
      eligibility: existing?.eligibility ?? ("eligible" as PlatformEligibility),
      tokenExpiresAt: existing?.tokenExpiresAt ?? null,
      reauthRequired: this.computeReauthRequired(
        existing?.tokenExpiresAt ?? null,
      ),
      lastOnlineAt: existing?.lastOnlineAt ?? effectiveTime,
      lastOfflineAt: existing?.lastOfflineAt ?? null,
      lastHeartbeatAt: effectiveTime,
      updatedAt: effectiveTime,
    };

    if (this.dbEnabled()) {
      const persisted = await this.repo!.upsert(record);
      const bucket = this.getMemoryBucket(driverId);
      bucket.set(platformCode, persisted);
      return persisted;
    }
    const bucket = this.getMemoryBucket(driverId);
    bucket.set(platformCode, record);
    return record;
  }

  async recordHeartbeat(
    driverId: string,
    platformCode?: PlatformCode,
    recordedAt?: string | null,
  ): Promise<void> {
    const presences = await this.listForDriver(driverId);
    const effectiveTime = recordedAt ?? isoNow();

    const targets = platformCode
      ? presences.filter((p) => p.platformCode === platformCode)
      : presences;

    if (targets.length === 0 && platformCode) {
      await this.setOnline(driverId, platformCode, null, effectiveTime);
      return;
    }

    for (const target of targets) {
      const updated: PlatformPresenceRecord = {
        ...target,
        lastHeartbeatAt: effectiveTime,
        updatedAt: effectiveTime,
      };
      if (this.dbEnabled()) {
        await this.repo!.upsert(updated);
      }
      const bucket = this.getMemoryBucket(driverId);
      bucket.set(target.platformCode, updated);
    }
  }

  isDriverAvailableForDispatchSync(
    driverId: string,
    options?: { maxHeartbeatAgeMs?: number; now?: number },
  ): DriverAvailabilityResult {
    const presences = this.listForDriverSync(driverId);
    return this.evaluateAvailability(driverId, presences, options);
  }

  async isDriverAvailableForDispatch(
    driverId: string,
    options?: { maxHeartbeatAgeMs?: number; now?: number },
  ): Promise<DriverAvailabilityResult> {
    const presences = await this.listForDriver(driverId);
    return this.evaluateAvailability(driverId, presences, options);
  }

  private evaluateAvailability(
    driverId: string,
    presences: PlatformPresenceRecord[],
    options?: { maxHeartbeatAgeMs?: number; now?: number },
  ): DriverAvailabilityResult {
    if (!presences || presences.length === 0) {
      return { available: true, reason: "no_presence_records" };
    }

    // 1. Check if driver is busy on ANY platform
    const busyPresence = presences.find((p) => p.status === "busy");
    if (busyPresence) {
      return {
        available: false,
        reason: "busy_on_other_platform",
        details: {
          driverId,
          busyPlatform: busyPresence.platformCode,
          updatedAt: busyPresence.updatedAt,
        },
      };
    }

    // 2. Check if all platforms are offline
    const onlinePresences = presences.filter((p) => p.status === "online");
    if (onlinePresences.length === 0) {
      return {
        available: false,
        reason: "offline",
        details: {
          driverId,
          totalPlatforms: presences.length,
          allOffline: true,
        },
      };
    }

    // 3. Check heartbeat expiry for online platforms
    const maxHeartbeatAgeMs =
      options?.maxHeartbeatAgeMs ?? DEFAULT_MAX_HEARTBEAT_AGE_MS;
    const nowMs = options?.now ?? Date.now();

    let latestHeartbeatMs = 0;
    for (const presence of onlinePresences) {
      const hbTime =
        presence.lastHeartbeatAt ?? presence.lastOnlineAt ?? presence.updatedAt;
      if (hbTime) {
        const ms = new Date(hbTime).getTime();
        if (ms > latestHeartbeatMs) {
          latestHeartbeatMs = ms;
        }
      }
    }

    if (
      latestHeartbeatMs === 0 ||
      nowMs - latestHeartbeatMs > maxHeartbeatAgeMs
    ) {
      return {
        available: false,
        reason: "expired_heartbeat",
        details: {
          driverId,
          lastHeartbeatAt: latestHeartbeatMs
            ? new Date(latestHeartbeatMs).toISOString()
            : null,
          ageMs: latestHeartbeatMs ? nowMs - latestHeartbeatMs : null,
          maxHeartbeatAgeMs,
        },
      };
    }

    return { available: true };
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
