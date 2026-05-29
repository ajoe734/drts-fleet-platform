import type { PlatformCode } from "./platform-codes";
import type {
  EmptyStateEnvelope,
  RefreshTier,
  ResourceActionDescriptor,
  UiRefreshMetadata,
} from "./ui-runtime";

export type PlatformPresenceStatus = "online" | "offline";

export type PlatformEligibility = "eligible" | "ineligible" | "pending";

export const PLATFORM_REAUTH_MECHANISMS = [
  "external_browser_oauth",
  "native_app_deeplink",
  "manual_credential",
  "ops_managed",
] as const;
export type PlatformReauthMechanism =
  (typeof PLATFORM_REAUTH_MECHANISMS)[number];

export const PLATFORM_PRESENCE_ACTIONS = [
  "go_online",
  "go_offline",
  "reauthenticate",
  "view_binding_details",
  "refresh",
] as const;
export type PlatformPresenceAction =
  (typeof PLATFORM_PRESENCE_ACTIONS)[number];

export interface PlatformIneligibleReason {
  bucket: string;
  reasonCode: string;
}

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
  platformDisplayName?: string;
  canReceiveOrders?: boolean;
  adapterStatus?: PlatformPresenceAdapterStatus;
  lastSyncAt?: string | null;
  blockingReason?: string | null;
  eligibleServiceBuckets?: string[];
  ineligibleReasons?: PlatformIneligibleReason[];
  reauthMechanism?: PlatformReauthMechanism | null;
  reauthTarget?: string | null;
  driverSelfServiceBinding?: boolean;
  availableActions?: ResourceActionDescriptor[];
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
  emptyState?: EmptyStateEnvelope | null;
  refreshMetadata?: UiRefreshMetadata;
  refreshTier?: RefreshTier;
  availableActions?: ResourceActionDescriptor[];
}

export interface SetPlatformOnlineCommand {
  platformCode: PlatformCode;
  tokenExpiresAt?: string | null;
}

export interface SetPlatformOfflineCommand {
  platformCode: PlatformCode;
}
