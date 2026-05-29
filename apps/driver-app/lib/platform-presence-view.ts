import type {
  EmptyReason,
  PlatformCode,
  PlatformPresenceAdapterStatusRecord,
  PlatformPresenceRecord,
  PlatformPresenceSummary,
  ResourceActionDescriptor,
} from "@drts/contracts";

export type ReauthMechanism =
  | "external_browser_oauth"
  | "native_app_deeplink"
  | "manual_credential"
  | "ops_managed";

export type PresenceFilter = "all" | "attention" | "ready" | "reauth";

export type PlatformPresenceViewRecord = PlatformPresenceRecord & {
  availableActions?: ResourceActionDescriptor[];
  reauthMechanism?: ReauthMechanism;
  reauthUrl?: string | null;
  nativeAppUrl?: string | null;
  supportRoute?: string | null;
  supportLabel?: string | null;
  eligibleServiceBuckets?: string[];
  ineligibleReasons?: string[];
  canReceiveOrders?: boolean;
  maskedAccountId?: string | null;
};

export type PlatformPresenceViewSummary = PlatformPresenceSummary & {
  emptyState?: {
    reason: EmptyReason;
    messageCode: string;
    nextAction?: ResourceActionDescriptor;
  };
  refreshTier?: "medium";
  refreshMeta?: {
    generatedAt?: string;
    staleAfterMs?: number;
    dataFreshness?: "fresh" | "stale" | "degraded" | "unknown";
    source?: "live" | "cache" | "sandbox" | "static";
  };
};

export function getPlatformReauthMechanism(
  record: PlatformPresenceViewRecord,
): ReauthMechanism {
  if (record.reauthMechanism) {
    return record.reauthMechanism;
  }

  switch (record.platformCode) {
    case "uber":
      return "external_browser_oauth";
    case "grab":
      return "native_app_deeplink";
    case "line-taxi":
      return "manual_credential";
    case "grab_taiwan":
      return "ops_managed";
    default:
      return "external_browser_oauth";
  }
}

export function getMechanismLabel(mechanism: ReauthMechanism): string {
  switch (mechanism) {
    case "external_browser_oauth":
      return "外部瀏覽器 OAuth";
    case "native_app_deeplink":
      return "平台 App 深連結";
    case "manual_credential":
      return "手動憑證輸入";
    case "ops_managed":
      return "派車台協助處理";
  }
}

export function getMechanismActionLabel(mechanism: ReauthMechanism): string {
  switch (mechanism) {
    case "external_browser_oauth":
      return "打開授權頁";
    case "native_app_deeplink":
      return "開啟平台 App";
    case "manual_credential":
      return "輸入驗證資料";
    case "ops_managed":
      return "聯絡派車台";
  }
}

export function findAction(
  record: PlatformPresenceViewRecord,
  candidates: string[],
): ResourceActionDescriptor | null {
  const actions = record.availableActions ?? [];
  return (
    actions.find((action: ResourceActionDescriptor) =>
      candidates.includes(action.action.toLowerCase().trim()),
    ) ?? null
  );
}

export function canReceiveOrders(
  record: PlatformPresenceViewRecord,
  adapterStatus?: PlatformPresenceAdapterStatusRecord,
): boolean {
  if (typeof record.canReceiveOrders === "boolean") {
    return record.canReceiveOrders;
  }

  if (!record.accountId) {
    return false;
  }
  if (record.status !== "online") {
    return false;
  }
  if (record.reauthRequired) {
    return false;
  }
  if (record.eligibility !== "eligible") {
    return false;
  }

  return (
    adapterStatus?.status !== "down" && adapterStatus?.status !== "degraded"
  );
}

export function deriveBlockingReasons(
  record: PlatformPresenceViewRecord,
  adapterStatus?: PlatformPresenceAdapterStatusRecord,
): string[] {
  const reasons: string[] = [];
  const expired =
    record.tokenExpiresAt != null &&
    Number.isFinite(new Date(record.tokenExpiresAt).getTime()) &&
    new Date(record.tokenExpiresAt).getTime() <= Date.now();

  if (!record.accountId) {
    reasons.push("尚未綁定平台帳號");
  }
  if (record.status !== "online") {
    reasons.push("平台目前為離線");
  }
  if (record.reauthRequired) {
    reasons.push("需要重新授權");
  }
  if (expired) {
    reasons.push("Token 已過期");
  }
  if (record.eligibility === "pending") {
    reasons.push("資格審核中");
  }
  if (record.eligibility === "ineligible") {
    reasons.push("目前不符合派單資格");
  }
  for (const reason of record.ineligibleReasons ?? []) {
    reasons.push(reason);
  }
  if (adapterStatus?.status === "degraded") {
    reasons.push(adapterStatus.blockingReason ?? "平台同步延遲");
  }
  if (adapterStatus?.status === "down") {
    reasons.push(adapterStatus.blockingReason ?? "平台轉接中斷");
  }

  return [...new Set(reasons)];
}

export function resolveEmptyReason(input: {
  isProvisioned: boolean;
  summary: PlatformPresenceViewSummary | null;
  filteredCount: number;
  permissionDenied?: boolean;
  fetchFailed?: boolean;
}): EmptyReason | null {
  const {
    isProvisioned,
    summary,
    filteredCount,
    permissionDenied,
    fetchFailed,
  } = input;

  if (!isProvisioned) {
    return "not_provisioned";
  }
  if (permissionDenied) {
    return "permission_denied";
  }
  if (fetchFailed && !summary) {
    return "fetch_failed";
  }
  if (!summary) {
    return null;
  }
  if (filteredCount === 0 && summary.presences.length > 0) {
    return "filtered_empty";
  }
  if (summary.presences.length === 0) {
    return summary.emptyState?.reason ?? "not_provisioned";
  }

  const externalPresences = summary.presences.filter(
    (record: PlatformPresenceViewRecord) =>
      record.platformCode !== ("drts" as PlatformCode),
  );
  if (
    externalPresences.length > 0 &&
    externalPresences.every((record: PlatformPresenceViewRecord) => {
      const adapter = summary.adapterStatuses?.find(
        (entry: PlatformPresenceAdapterStatusRecord) =>
          entry.platformCode === record.platformCode,
      );
      return adapter?.status === "degraded" || adapter?.status === "down";
    })
  ) {
    return "external_unavailable";
  }

  if (
    summary.presences.length > 0 &&
    summary.presences.every(
      (record: PlatformPresenceViewRecord) => record.eligibility !== "eligible",
    )
  ) {
    return "driver_not_eligible";
  }

  return "no_data";
}
