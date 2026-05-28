import type { PlatformCode } from "./platform-codes";
import type { ResourceActionDescriptor } from "./ui-runtime";

export type PlatformPresenceStatus = "online" | "offline";

export type PlatformEligibility = "eligible" | "ineligible" | "pending";

export type PlatformAuthMechanism =
  | "external_browser_oauth"
  | "native_app_deeplink"
  | "manual_credential"
  | "ops_managed";

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
  availableActions?: ResourceActionDescriptor[];
  authMechanism?: PlatformAuthMechanism | null;
  driverSelfServiceBinding?: boolean;
  autoAcceptAllowed?: boolean;
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
  accountId?: string | null;
  tokenExpiresAt?: string | null;
}

export interface SetPlatformOfflineCommand {
  platformCode: PlatformCode;
  reason?: string | null;
}

export interface UnbindPlatformAccountCommand {
  platformCode: PlatformCode;
  reason: string;
}
