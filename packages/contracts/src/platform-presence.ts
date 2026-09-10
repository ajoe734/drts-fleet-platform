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
  lastHeartbeatAt?: string | null;
  updatedAt: string;
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
  recordedAt?: string;
}

export interface SetPlatformOfflineCommand {
  platformCode: PlatformCode;
  recordedAt?: string;
}

export interface SetPlatformBusyCommand {
  platformCode: PlatformCode;
  reason?: string;
  recordedAt?: string;
}

export interface DriverPresenceHeartbeatCommand {
  platformCode?: PlatformCode;
  recordedAt?: string;
}

export type DriverAvailabilityReason =
  | "busy_on_other_platform"
  | "offline"
  | "expired_heartbeat"
  | "no_presence_records";

export interface DriverAvailabilityResult {
  available: boolean;
  reason?: DriverAvailabilityReason;
  details?: Record<string, unknown>;
}
