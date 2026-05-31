import type { PlatformCode } from "./platform-codes";
import type {
  EmptyStateEnvelope,
  ResourceActionDescriptor,
  UiRefreshMetadata,
} from "./ui-runtime";

export type PlatformPresenceStatus = "online" | "offline";

export type PlatformEligibility = "eligible" | "ineligible" | "pending";

/**
 * Q-DRV05 — platform-configured re-authentication mechanism. The driver UI
 * must handle all four gracefully and must NOT default to an in-app webview
 * (security concern). `external_browser_oauth` is the default preferred
 * mechanism when a producer has not yet populated the field.
 */
export type PlatformReauthMechanism =
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
  updatedAt: string;
  /**
   * Q-DRV05 — re-auth mechanism configured for this platform. Optional so
   * existing producers stay valid; consumers default to
   * `external_browser_oauth` when absent.
   */
  reauthMechanism?: PlatformReauthMechanism;
  /**
   * Q-DRV06 — whether the driver may self-serve bind/unbind for this
   * platform. When `false` (or for owned dispatch) the UI shows binding
   * status only, with no bind/unbind affordance.
   */
  driverSelfServiceBinding?: boolean;
  /**
   * Q-DRV13 — whether platform config permits driver auto-accept for this
   * platform. Global auto-accept is NOT allowed in Phase 1, so the toggle is
   * only offered where this is `true`.
   */
  autoAcceptAllowed?: boolean;
  /**
   * Q-DRV01 — relay capability flags. When a relay action is unsupported the
   * UI disables the CTA with `relayUnavailableReasonCode` rather than hiding
   * the platform.
   */
  canRelayAccept?: boolean;
  canRelayReject?: boolean;
  relayUnavailableReasonCode?: string | null;
  /**
   * Q-DRV07 — human-facing reasons the driver is ineligible on this platform,
   * surfaced instead of silently hiding unavailable work.
   */
  ineligibleReasons?: string[];
  /**
   * Q-X13 — backend-resolved CTAs for this platform binding (`reauth`,
   * `bind`, `unbind`, …). A zero-length array means read-only for the current
   * actor. The UI renders affordances from this list rather than hard-coding
   * status → action mapping. Optional so existing producers stay valid.
   */
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
  /**
   * Q-X01 — freshness envelope for this snapshot so the UI can render a
   * stale indicator and refresh affordance without inventing its own
   * staleness heuristic. Optional so existing producers stay valid.
   */
  refreshMetadata?: UiRefreshMetadata;
  /**
   * Q-X15 — why `presences` is empty, so the UI can render a distinct
   * empty-state (not provisioned vs adapter down vs not eligible) instead of
   * a single generic "no platforms" message.
   */
  emptyState?: EmptyStateEnvelope;
}

export interface SetPlatformOnlineCommand {
  platformCode: PlatformCode;
  tokenExpiresAt?: string | null;
}

export interface SetPlatformOfflineCommand {
  platformCode: PlatformCode;
  /**
   * Q-DRV06 / Q-X10 — required reason captured by the high-risk unbind
   * confirmation before invoking. Optional so existing callers (e.g. a plain
   * go-offline toggle) stay valid.
   */
  reason?: string | null;
}
