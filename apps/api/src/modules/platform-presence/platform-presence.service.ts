import { Injectable, Logger, Optional } from "@nestjs/common";
import type {
  AdapterHealthRecord,
  PlatformEligibility,
  PlatformCode,
  PlatformPresenceAdapterStatusRecord,
  PlatformPresenceDispatchBlock,
  PlatformPresenceRecord,
  PlatformPresenceSummary,
} from "@drts/contracts";
import { PLATFORM_CODE_REGISTRY } from "@drts/contracts";
import { DriverLeaveService } from "../driver-leave/driver-leave.service";
import { ForwarderService } from "../forwarder/forwarder.service";
import { PlatformPresenceRepository } from "./platform-presence.repository";

function isoNow() {
  return new Date().toISOString();
}

// A platform-presence record claiming "online" (or "busy") with no heartbeat
// newer than this is treated as disconnected: the driver's app stopped
// reporting in without an explicit offline transition, so the last known
// status can no longer be trusted as a live signal.
const PRESENCE_HEARTBEAT_STALE_MS = 5 * 60 * 1000;

@Injectable()
export class PlatformPresenceService {
  private readonly logger = new Logger(PlatformPresenceService.name);

  // in-memory fallback storage: driverId -> platformCode -> record
  private memory: Map<string, Map<string, PlatformPresenceRecord>> = new Map();

  constructor(
    @Optional() private readonly repo?: PlatformPresenceRepository,
    @Optional() private readonly forwarderService?: ForwarderService,
    // Nest must resolve the leave authority in the application graph.
    private readonly driverLeaveService?: DriverLeaveService,
  ) {}

  private dbEnabled(): boolean {
    return this.repo?.isEnabled() ?? false;
  }

  private async listStoredForDriver(
    driverId: string,
  ): Promise<PlatformPresenceRecord[]> {
    const map = this.memory.get(driverId);
    const records = this.dbEnabled()
      ? await this.repo!.listByDriver(driverId)
      : map
        ? Array.from(map.values())
        : [];
    return records;
  }

  async listForDriver(driverId: string): Promise<PlatformPresenceRecord[]> {
    const records = await this.listStoredForDriver(driverId);
    const onLeave = await this.driverLeaveService?.isDriverOnLeave(driverId);
    // Read-time overlay preserves the platform's own eligibility and restores
    // it when leave ends or is cancelled, without writing a sticky flag.
    return onLeave
      ? records.map((record) => ({
          ...record,
          eligibility: "ineligible" as const,
        }))
      : records;
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
    await this.driverLeaveService?.assertDriverCanGoOnline(driverId);
    const existing = (await this.listStoredForDriver(driverId)).find(
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
      lastHeartbeatAt: isoNow(),
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
    const existing = (await this.listStoredForDriver(driverId)).find(
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
      lastHeartbeatAt: existing?.lastHeartbeatAt ?? null,
      updatedAt: isoNow(),
    };

    if (this.dbEnabled()) {
      return this.repo!.upsert(record);
    }
    const bucket = this.getMemoryBucket(driverId);
    bucket.set(platformCode, record);
    return record;
  }

  // Set when a forwarder-integrated platform reports the driver as actively
  // engaged (e.g. an accepted/in-progress trip on that platform). A busy
  // driver is physically committed elsewhere and must not also receive an
  // owned-fleet dispatch.
  async setBusy(
    driverId: string,
    platformCode: PlatformCode,
  ): Promise<PlatformPresenceRecord> {
    const existing = (await this.listStoredForDriver(driverId)).find(
      (r) => r.platformCode === platformCode,
    );

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
      lastOnlineAt: existing?.lastOnlineAt ?? isoNow(),
      lastOfflineAt: existing?.lastOfflineAt ?? null,
      lastHeartbeatAt: isoNow(),
      updatedAt: isoNow(),
    };

    if (this.dbEnabled()) {
      return this.repo!.upsert(record);
    }
    const bucket = this.getMemoryBucket(driverId);
    bucket.set(platformCode, record);
    return record;
  }

  // Liveness ping for a platform binding, independent of an online/offline
  // status transition. Lets a long-lived "online"/"busy" status stay
  // verifiably live instead of going stale the instant it is set.
  async recordHeartbeat(
    driverId: string,
    platformCode: PlatformCode,
  ): Promise<PlatformPresenceRecord | null> {
    const existing = (await this.listStoredForDriver(driverId)).find(
      (r) => r.platformCode === platformCode,
    );
    if (!existing) {
      return null;
    }

    const record: PlatformPresenceRecord = {
      ...existing,
      lastHeartbeatAt: isoNow(),
      updatedAt: isoNow(),
    };

    if (this.dbEnabled()) {
      return this.repo!.upsert(record);
    }
    const bucket = this.getMemoryBucket(driverId);
    bucket.set(platformCode, record);
    return record;
  }

  private isHeartbeatStale(
    record: PlatformPresenceRecord,
    nowMs: number,
  ): boolean {
    if (!record.lastHeartbeatAt) {
      return true;
    }
    return (
      nowMs - new Date(record.lastHeartbeatAt).getTime() >
      PRESENCE_HEARTBEAT_STALE_MS
    );
  }

  // Consulted by owned-fleet dispatch eligibility (listDispatchCandidates /
  // assertAssignmentEligibilityRecheck) so a driver who is busy or
  // disconnected on another bound platform is not also handed an owned
  // dispatch. A driver with no presence records at all (never bound to an
  // external platform) is never blocked here -- absence of data is not a
  // busy/offline signal.
  async findDispatchBlockingPresence(
    driverId: string,
    now: Date = new Date(),
  ): Promise<PlatformPresenceDispatchBlock | null> {
    const records = await this.listForDriver(driverId);
    if (records.length === 0) {
      return null;
    }

    const nowMs = now.getTime();

    const busy = records.find((r) => r.status === "busy");
    if (busy) {
      return { platformCode: busy.platformCode, reason: "busy" };
    }

    const liveOnline = records.find(
      (r) => r.status === "online" && !this.isHeartbeatStale(r, nowMs),
    );
    if (liveOnline) {
      return null;
    }

    // Every record is either explicitly offline, or claims "online" with a
    // heartbeat that has gone stale -- either way, nothing here confirms the
    // driver is currently live and reachable on any platform.
    const staleOnline = records.find(
      (r) => r.status === "online" && this.isHeartbeatStale(r, nowMs),
    );
    if (staleOnline) {
      return {
        platformCode: staleOnline.platformCode,
        reason: "heartbeat_expired",
      };
    }

    return { platformCode: records[0]!.platformCode, reason: "offline" };
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
