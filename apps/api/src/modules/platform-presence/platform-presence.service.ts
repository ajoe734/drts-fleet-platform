import { Injectable, Logger, Optional } from "@nestjs/common";
import type {
  PlatformEligibility,
  PlatformPresenceRecord,
  PlatformPresenceSummary,
} from "@drts/contracts";
import { PlatformPresenceRepository } from "./platform-presence.repository";

function isoNow() {
  return new Date().toISOString();
}

@Injectable()
export class PlatformPresenceService {
  private readonly logger = new Logger(PlatformPresenceService.name);

  // in-memory fallback storage: driverId -> platformCode -> record
  private memory: Map<string, Map<string, PlatformPresenceRecord>> = new Map();

  constructor(@Optional() private readonly repo?: PlatformPresenceRepository) {}

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
    platformCode: string,
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
    platformCode: string,
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

  async summary(driverId: string): Promise<PlatformPresenceSummary> {
    const presences = await this.listForDriver(driverId);
    return {
      driverId,
      presences,
      notes: [
        "Presence data uses DB when available; otherwise in-memory runtime.",
        "Use POST /api/platform-presence/online|offline to update per platform.",
      ],
    };
  }
}
