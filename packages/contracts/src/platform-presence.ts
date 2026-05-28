import type { PlatformCode } from "./platform-codes";
import type {
  DriverMatchingSuppression,
  DriverOpsInstruction,
  UiHealthEnvelope,
  UiRefreshMetadata,
} from "./ui-runtime";

export type PlatformPresenceStatus = "online" | "offline";

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

export type DriverPlatformBindingState =
  | "not_bound"
  | "bound_offline"
  | "bound_online"
  | "reauth_required"
  | "suspended"
  | "incident_hold"
  | "degraded";

export interface DriverPlatformBindingSummary {
  platformCode: PlatformCode;
  displayName: string;
  bindingState: DriverPlatformBindingState;
  presence: PlatformPresenceRecord | null;
  adapterStatus: PlatformPresenceAdapterStatusRecord;
  outstandingInstructionCount: number;
}

export interface DriverPlatformPresenceSummary {
  driverId: string;
  bindings: DriverPlatformBindingSummary[];
  instructions: DriverOpsInstruction[];
  suppressions: DriverMatchingSuppression[];
  health: UiHealthEnvelope;
  refresh: UiRefreshMetadata;
}

export interface SetPlatformOnlineCommand {
  platformCode: PlatformCode;
  tokenExpiresAt?: string | null;
}

export interface SetPlatformOfflineCommand {
  platformCode: PlatformCode;
}
