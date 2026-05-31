/**
 * Settings / platform-binding view model.
 *
 * Pure (RN-free) logic that turns a `PlatformPresenceSummary` into the
 * per-platform binding rows the `/settings` screen renders, resolves the CTA
 * set from backend `availableActions` (Q-X13) with capability-flag fallbacks
 * (Q-DRV01 / Q-DRV05 / Q-DRV06), and classifies the empty state (Q-X15).
 *
 * Behaviour follows packet §5.8 + §3.5 / §3.6 / §3.14; visuals live in the
 * consuming component.
 */
import {
  PLATFORM_CODE_REGISTRY,
  type ActionRiskLevel,
  type EmptyReason,
  type PlatformCode,
  type PlatformEligibility,
  type PlatformPresenceAdapterStatusRecord,
  type PlatformPresenceRecord,
  type PlatformPresenceSummary,
  type PlatformReauthMechanism,
  type ResourceActionDescriptor,
  type RefreshTier,
  type UiRefreshMetadata,
} from "@drts/contracts";

/** Per spec §3.2: `/settings` polls manually (refresh on focus / pull). */
export const PLATFORM_BINDING_REFRESH_TIER: RefreshTier = "manual";

/** Default mechanism per Q-DRV05 when a producer has not populated the field. */
export const DEFAULT_REAUTH_MECHANISM: PlatformReauthMechanism =
  "external_browser_oauth";

export type PlatformBindingActionKind = "reauth" | "bind" | "unbind";

const KNOWN_ACTION_KINDS = new Set<PlatformBindingActionKind>([
  "reauth",
  "bind",
  "unbind",
]);

const ACTION_DEFAULT_RISK: Record<PlatformBindingActionKind, ActionRiskLevel> = {
  reauth: "medium",
  bind: "medium",
  unbind: "high",
};

export interface PlatformBindingAction {
  kind: PlatformBindingActionKind;
  enabled: boolean;
  disabledReasonCode?: string;
  requiresReason: boolean;
  riskLevel: ActionRiskLevel;
}

export interface PlatformBindingView {
  record: PlatformPresenceRecord;
  platformCode: PlatformCode;
  displayName: string;
  owned: boolean;
  reauthRequired: boolean;
  linked: boolean;
  eligibility: PlatformEligibility;
  ineligibleReasons: string[];
  reauthMechanism: PlatformReauthMechanism;
  selfServiceBinding: boolean;
  autoAcceptAllowed: boolean;
  /** `null` = relay not applicable (owned dispatch) or producer omitted it. */
  canRelayAccept: boolean | null;
  canRelayReject: boolean | null;
  relayUnavailableReasonCode: string | null;
  actions: PlatformBindingAction[];
}

export function isOwnedPlatformCode(platformCode: PlatformCode): boolean {
  const normalized = String(platformCode).toLowerCase();
  const displayName =
    PLATFORM_CODE_REGISTRY[platformCode]?.displayName.toLowerCase() ?? "";
  return (
    normalized === "drts" ||
    normalized === "owned" ||
    normalized.startsWith("drts-") ||
    displayName.includes("drts")
  );
}

export function getPlatformDisplayName(platformCode: PlatformCode): string {
  return PLATFORM_CODE_REGISTRY[platformCode]?.displayName ?? platformCode;
}

function isBindingActionKind(value: string): value is PlatformBindingActionKind {
  return KNOWN_ACTION_KINDS.has(value as PlatformBindingActionKind);
}

function fromDescriptors(
  descriptors: ResourceActionDescriptor[],
): PlatformBindingAction[] {
  const actions: PlatformBindingAction[] = [];
  for (const descriptor of descriptors) {
    if (!isBindingActionKind(descriptor.action)) {
      continue;
    }
    actions.push({
      kind: descriptor.action,
      enabled: descriptor.enabled,
      disabledReasonCode: descriptor.disabledReasonCode,
      requiresReason:
        descriptor.requiresReason ?? descriptor.action === "unbind",
      riskLevel: descriptor.riskLevel,
    });
  }
  return actions;
}

/**
 * Fallback CTA synthesis when a producer has not yet emitted
 * `availableActions`. Mirrors the authority rules in packet §3.5:
 *   - reauth is offered only when `reauthRequired`, and is disabled for
 *     `ops_managed` platforms (driver cannot self-reauth — Q-DRV05).
 *   - unbind is offered only when the platform allows driver self-service
 *     binding and is not owned dispatch (Q-DRV06).
 */
function synthesizeActions(
  record: PlatformPresenceRecord,
  owned: boolean,
  selfServiceBinding: boolean,
  mechanism: PlatformReauthMechanism,
): PlatformBindingAction[] {
  const actions: PlatformBindingAction[] = [];

  if (record.reauthRequired) {
    const opsManaged = mechanism === "ops_managed";
    actions.push({
      kind: "reauth",
      enabled: !opsManaged,
      disabledReasonCode: opsManaged ? "ops_managed" : undefined,
      requiresReason: false,
      riskLevel: ACTION_DEFAULT_RISK.reauth,
    });
  }

  if (!owned && selfServiceBinding) {
    actions.push({
      kind: "unbind",
      enabled: true,
      requiresReason: true,
      riskLevel: ACTION_DEFAULT_RISK.unbind,
    });
  }

  return actions;
}

function toBindingView(
  record: PlatformPresenceRecord,
): PlatformBindingView {
  const owned = isOwnedPlatformCode(record.platformCode);
  const mechanism = record.reauthMechanism ?? DEFAULT_REAUTH_MECHANISM;
  // Q-DRV06: owned dispatch is never driver-self-service; external platforms
  // default to self-service unless the platform config opts out.
  const selfServiceBinding = owned
    ? false
    : (record.driverSelfServiceBinding ?? true);
  const actions = Array.isArray(record.availableActions)
    ? fromDescriptors(record.availableActions)
    : synthesizeActions(record, owned, selfServiceBinding, mechanism);

  return {
    record,
    platformCode: record.platformCode,
    displayName: owned
      ? "自營派單"
      : getPlatformDisplayName(record.platformCode),
    owned,
    reauthRequired: record.reauthRequired,
    linked: !record.reauthRequired,
    eligibility: record.eligibility,
    ineligibleReasons: record.ineligibleReasons ?? [],
    reauthMechanism: mechanism,
    selfServiceBinding,
    autoAcceptAllowed: record.autoAcceptAllowed ?? false,
    canRelayAccept: owned ? null : (record.canRelayAccept ?? null),
    canRelayReject: owned ? null : (record.canRelayReject ?? null),
    relayUnavailableReasonCode: record.relayUnavailableReasonCode ?? null,
    actions,
  };
}

function bindingSeverity(view: PlatformBindingView): number {
  if (view.reauthRequired) {
    return 3;
  }
  if (view.eligibility === "ineligible") {
    return 2;
  }
  if (view.eligibility === "pending") {
    return 1;
  }
  return 0;
}

/**
 * Build the ordered per-platform binding rows. Owned dispatch sinks to the
 * bottom (it cannot be unbound / re-authed); platforms needing attention rise
 * to the top so the driver acts on them first.
 */
export function buildPlatformBindingViews(
  summary: PlatformPresenceSummary | null | undefined,
): PlatformBindingView[] {
  if (!summary) {
    return [];
  }

  return [...summary.presences]
    .map(toBindingView)
    .sort((left, right) => {
      if (left.owned !== right.owned) {
        return left.owned ? 1 : -1;
      }
      const severityDelta = bindingSeverity(right) - bindingSeverity(left);
      if (severityDelta !== 0) {
        return severityDelta;
      }
      return left.displayName.localeCompare(right.displayName, "zh-TW");
    });
}

export interface BindingEmptyReasonInput {
  isProvisioned: boolean;
  loadFailed: boolean;
  permissionDenied: boolean;
  summary: PlatformPresenceSummary | null;
}

function allAdaptersUnavailable(
  adapterStatuses: PlatformPresenceAdapterStatusRecord[] | undefined,
): boolean {
  if (!adapterStatuses || adapterStatuses.length === 0) {
    return false;
  }
  return adapterStatuses.every(
    (entry) => entry.status === "down" || entry.status === "degraded",
  );
}

/**
 * Classify the binding-list empty state per Q-X15. Returns `null` when there
 * is data to render. Six reasons are reachable here — `filtered_empty` is not,
 * because `/settings` has no binding filters.
 */
export function derivePlatformBindingEmptyReason(
  input: BindingEmptyReasonInput,
): EmptyReason | null {
  const { isProvisioned, loadFailed, permissionDenied, summary } = input;

  if (!isProvisioned) {
    return "not_provisioned";
  }
  if (permissionDenied) {
    return "permission_denied";
  }
  if (loadFailed || !summary) {
    return "fetch_failed";
  }

  if (summary.presences.length > 0) {
    if (summary.presences.every((record) => record.eligibility === "ineligible")) {
      return "driver_not_eligible";
    }
    return null;
  }

  // Backend may classify the empty set authoritatively.
  if (summary.emptyState) {
    return summary.emptyState.reason;
  }
  if (allAdaptersUnavailable(summary.adapterStatuses)) {
    return "external_unavailable";
  }
  return "no_data";
}

export interface RefreshFreshness {
  label: string;
  stale: boolean;
}

/**
 * Reduce a `UiRefreshMetadata` envelope to a short freshness label + a stale
 * flag the header can render next to the manual-refresh affordance.
 */
export function describeRefreshFreshness(
  metadata: UiRefreshMetadata | null | undefined,
  now: number,
): RefreshFreshness | null {
  if (!metadata) {
    return null;
  }

  const generatedAt = new Date(metadata.generatedAt).getTime();
  const stale =
    metadata.dataFreshness === "stale" ||
    metadata.dataFreshness === "degraded" ||
    (Number.isFinite(generatedAt) &&
      metadata.staleAfterMs > 0 &&
      now - generatedAt > metadata.staleAfterMs);

  if (!Number.isFinite(generatedAt)) {
    return { label: "更新時間未知", stale };
  }

  const ageMs = Math.max(0, now - generatedAt);
  const ageMinutes = Math.floor(ageMs / 60000);
  const label =
    ageMinutes <= 0
      ? "剛剛更新"
      : ageMinutes < 60
        ? `${ageMinutes} 分鐘前更新`
        : `${Math.floor(ageMinutes / 60)} 小時前更新`;

  return { label, stale };
}
