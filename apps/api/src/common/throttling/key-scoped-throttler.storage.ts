import { Injectable, type OnApplicationShutdown } from "@nestjs/common";
import type { ThrottlerStorage } from "@nestjs/throttler";
import type { ThrottlerStorageOptions } from "@nestjs/throttler/dist/throttler-storage-options.interface";
import type { ThrottlerStorageRecord } from "@nestjs/throttler/dist/throttler-storage-record.interface";

/** The 6.5.0 counter/block protocol, with expiration ownership per generated key. */
@Injectable()
export class KeyScopedThrottlerStorage
  implements ThrottlerStorage, OnApplicationShutdown
{
  private readonly entries = new Map<string, ThrottlerStorageOptions>();
  private readonly timers = new Map<
    string,
    Set<ReturnType<typeof setTimeout>>
  >();
  private readonly invalidKeys = new Set<string>();

  get storage(): Map<string, ThrottlerStorageOptions> {
    return this.entries;
  }

  private hits(
    key: string,
    name: string,
    entry: ThrottlerStorageOptions,
  ): number {
    const hits = entry.totalHits.get(name);
    if (
      this.invalidKeys.has(key) ||
      hits === undefined ||
      !Number.isSafeInteger(hits) ||
      hits < 0 ||
      !Number.isFinite(entry.expiresAt) ||
      !Number.isFinite(entry.blockExpiresAt) ||
      typeof entry.isBlocked !== "boolean"
    ) {
      throw new Error("Invalid throttle storage state");
    }
    return hits;
  }

  private countHit(
    key: string,
    name: string,
    entry: ThrottlerStorageOptions,
    ttl: number,
  ): void {
    const hits = this.hits(key, name, entry);
    if (hits === Number.MAX_SAFE_INTEGER) {
      throw new Error("Invalid throttle hit count");
    }
    entry.totalHits.set(name, hits + 1);
    let owned = this.timers.get(key);
    if (!owned) {
      owned = new Set();
      this.timers.set(key, owned);
    }
    const timeout = setTimeout(() => {
      // A cancelled/replaced timer must never decrement a later generation.
      if (this.entries.get(key) !== entry || !owned.has(timeout)) {
        return;
      }
      try {
        const current = this.hits(key, name, entry);
        if (current <= 0) {
          throw new Error("Invalid throttle expiration count");
        }
        entry.totalHits.set(name, current - 1);
      } catch {
        // Timer callbacks cannot reject a request. Keep the key fail-closed
        // until shutdown instead of silently repairing malformed counters.
        this.invalidKeys.add(key);
      } finally {
        owned.delete(timeout);
        clearTimeout(timeout);
        if (owned.size === 0) {
          this.timers.delete(key);
        }
      }
    }, ttl);
    owned.add(timeout);
  }

  private clearExpirations(key: string): void {
    this.timers.get(key)?.forEach(clearTimeout);
    this.timers.delete(key);
  }

  async increment(
    key: string,
    ttl: number,
    limit: number,
    blockDuration: number,
    throttlerName: string,
  ): Promise<ThrottlerStorageRecord> {
    let entry = this.entries.get(key);
    if (!entry) {
      if (this.invalidKeys.has(key)) {
        throw new Error("Invalid throttle storage state");
      }
      entry = {
        totalHits: new Map([[throttlerName, 0]]),
        expiresAt: Date.now() + ttl,
        blockExpiresAt: 0,
        isBlocked: false,
      };
      this.entries.set(key, entry);
    }
    this.hits(key, throttlerName, entry);
    let timeToExpire = Math.ceil((entry.expiresAt - Date.now()) / 1000);
    if (timeToExpire <= 0) {
      entry.expiresAt = Date.now() + ttl;
      timeToExpire = Math.ceil((entry.expiresAt - Date.now()) / 1000);
    }
    if (!entry.isBlocked) {
      this.countHit(key, throttlerName, entry, ttl);
    }
    if (this.hits(key, throttlerName, entry) > limit && !entry.isBlocked) {
      entry.isBlocked = true;
      entry.blockExpiresAt = Date.now() + blockDuration;
    }
    const timeToBlockExpire = Math.ceil(
      (entry.blockExpiresAt - Date.now()) / 1000,
    );
    if (timeToBlockExpire <= 0 && entry.isBlocked) {
      entry.isBlocked = false;
      entry.totalHits.set(throttlerName, 0);
      this.clearExpirations(key);
      this.countHit(key, throttlerName, entry, ttl);
    }
    return {
      totalHits: this.hits(key, throttlerName, entry),
      timeToExpire,
      isBlocked: entry.isBlocked,
      timeToBlockExpire,
    };
  }

  onApplicationShutdown(): void {
    this.timers.forEach((owned) => owned.forEach(clearTimeout));
    this.timers.clear();
    this.entries.clear();
    this.invalidKeys.clear();
  }
}
