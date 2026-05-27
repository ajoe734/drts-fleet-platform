import type { PlatformCode } from "./platform-codes";

export type PlatformPresenceStatus = "online" | "offline";

export type PlatformEligibility = "eligible" | "ineligible" | "pending";
export type PlatformPresenceEligibility = PlatformEligibility;

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
}

export interface SetPlatformOfflineCommand {
  platformCode: PlatformCode;
}
