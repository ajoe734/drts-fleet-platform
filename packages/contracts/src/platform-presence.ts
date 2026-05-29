import type { PlatformCode } from "./platform-codes";
import type { ResourceActionDescriptor } from "./ui-runtime";

export type PlatformPresenceStatus = "online" | "offline";

export type PlatformEligibility = "eligible" | "ineligible" | "pending";

/**
 * Per-platform re-authentication mechanism (Q-DRV05). The driver app must
 * handle all four gracefully and must NOT default to an in-app webview:
 *   - external_browser_oauth  default preferred; open the platform's OAuth
 *                             flow in the system browser (AppAuth-style)
 *   - native_app_deeplink     deep-link into the platform's own native app
 *   - manual_credential       collect credentials in an in-app form
 *   - ops_managed             driver cannot self-reauth; ops handles it
 *
 * Delivered to the UI as a capability flag on `PlatformPresenceRecord`.
 */
export const PLATFORM_DRIVER_REAUTH_MECHANISMS = [
  "external_browser_oauth",
  "native_app_deeplink",
  "manual_credential",
  "ops_managed",
] as const;
export type PlatformDriverReauthMechanism =
  (typeof PLATFORM_DRIVER_REAUTH_MECHANISMS)[number];

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
  /**
   * Driver-facing capability metadata sourced from platform config. All
   * optional so existing producers stay valid; the driver-app settings /
   * platform-binding screen consumes them per packet §5.8 (Q-DRV05/06/13).
   */
  // Safely-displayed account identifier (masked when sensitive).
  accountIdMasked?: string | null;
  // Re-auth mechanism per Q-DRV05; defaults to external_browser_oauth.
  reauthMechanism?: PlatformDriverReauthMechanism;
  // Target URL for external_browser_oauth / native_app_deeplink mechanisms.
  reauthUrl?: string | null;
  // Q-DRV06: whether the driver may self-serve bind/unbind this platform.
  driverSelfServiceBinding?: boolean;
  // Q-DRV13: whether platform config permits auto-accept for this platform.
  autoAcceptAllowed?: boolean;
  // Current per-platform auto-accept state (only meaningful when allowed).
  autoAcceptEnabled?: boolean;
  // Q-DRV01 relay capability flags.
  canRelayAccept?: boolean;
  canRelayReject?: boolean;
  relayUnavailableReasonCode?: string | null;
  // Q-X13: backend-provided action descriptors for this binding.
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
}

export interface SetPlatformOnlineCommand {
  platformCode: PlatformCode;
  tokenExpiresAt?: string | null;
}

export interface SetPlatformOfflineCommand {
  platformCode: PlatformCode;
  // Optional audit reason; high-risk unbind requires one per packet §3.4.
  reason?: string;
}
