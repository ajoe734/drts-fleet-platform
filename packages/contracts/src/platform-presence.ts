import type { PlatformCode } from "./platform-codes";

export type PlatformPresenceStatus = "online" | "offline" | "busy";

export type PlatformEligibility = "eligible" | "ineligible" | "pending";

export interface PlatformPresenceRecord {
  driverId: string;
  platformCode: PlatformCode;
  accountId: string | null;
  status: PlatformPresenceStatus;
  eligibility: PlatformEligibility;
  tokenExpiresAt: string | null;
  reauthRequired: boolean;
  lastOnlineAt: string | null;
  lastOfflineAt: string | null;
  /** Last liveness ping for this platform binding; used to detect a stale
   * "online"/"busy" status whose app has stopped reporting in. */
  lastHeartbeatAt: string | null;
  updatedAt: string;
}

/** Reason a driver's cross-platform presence blocks a new owned-fleet
 * dispatch: actively busy elsewhere, or disconnected (explicitly offline, or
 * an "online"/"busy" record whose heartbeat has gone stale). */
export type PlatformPresenceDispatchBlockReason =
  | "busy"
  | "offline"
  | "heartbeat_expired";

export interface PlatformPresenceDispatchBlock {
  platformCode: PlatformCode;
  reason: PlatformPresenceDispatchBlockReason;
}

export type PlatformPresenceAdapterStatus =
  | "healthy"
  | "degraded"
  | "down"
  | "unknown";

export interface PlatformPresenceAdapterStatusRecord {
  platformCode: PlatformCode;
  status: PlatformPresenceAdapterStatus;
  blockingReason: string | null;
  lastSyncAt: string | null;
}

export interface PlatformPresenceSummary {
  driverId: string;
  presences: PlatformPresenceRecord[];
  adapterStatuses?: PlatformPresenceAdapterStatusRecord[];
  notes?: string[];
}

export interface SetPlatformOnlineCommand {
  platformCode: PlatformCode;
  tokenExpiresAt?: string | null;
}

export interface SetPlatformOfflineCommand {
  platformCode: PlatformCode;
}

export interface SetPlatformBusyCommand {
  platformCode: PlatformCode;
}

export interface RecordPlatformHeartbeatCommand {
  platformCode: PlatformCode;
}
