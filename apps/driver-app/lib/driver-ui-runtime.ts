import { Ionicons } from "@expo/vector-icons";
import type {
  DriverProfileRecord,
  DriverSettings,
  EmptyReason,
  PlatformDriverReauthMechanism,
  PlatformPresenceRecord,
  RefreshTier,
  ResourceActionDescriptor,
} from "@drts/contracts";

export type IoniconName = keyof typeof Ionicons.glyphMap;

/**
 * The `/settings` screen sits in the Manual refresh tier per packet §3.2:
 * no polling, refresh on focus or pull-to-refresh.
 */
export const SETTINGS_REFRESH_TIER: RefreshTier = "manual";

// ─────────────────────────────────────────────────────────────────────────────
// EmptyReason (Q-X15) — six distinct, driver-facing treatments
// ─────────────────────────────────────────────────────────────────────────────

export interface EmptyReasonDescriptor {
  title: string;
  description: string;
  icon: IoniconName;
  tone: "default" | "warning" | "danger";
}

const EMPTY_REASON_DESCRIPTORS: Record<EmptyReason, EmptyReasonDescriptor> = {
  no_data: {
    title: "目前沒有資料",
    description: "尚無可顯示的內容，稍後再回來查看。",
    icon: "file-tray-outline",
    tone: "default",
  },
  not_provisioned: {
    title: "尚未設定",
    description: "此項目尚未完成設定。",
    icon: "lock-closed-outline",
    tone: "default",
  },
  fetch_failed: {
    title: "載入失敗",
    description: "資料同步發生問題，請重新整理再試一次。",
    icon: "cloud-offline-outline",
    tone: "danger",
  },
  permission_denied: {
    title: "權限不足",
    description: "目前的帳號沒有檢視此資料的權限。",
    icon: "shield-outline",
    tone: "warning",
  },
  external_unavailable: {
    title: "外部平台暫時無法連線",
    description: "外部平台介接目前中斷，恢復後會自動同步。",
    icon: "git-network-outline",
    tone: "warning",
  },
  driver_not_eligible: {
    title: "目前不符合接單資格",
    description: "您目前沒有任何平台的接單資格，請確認綁定與驗證狀態。",
    icon: "person-remove-outline",
    tone: "warning",
  },
  filtered_empty: {
    title: "沒有符合的項目",
    description: "目前的篩選條件下沒有資料，請調整篩選。",
    icon: "funnel-outline",
    tone: "default",
  },
};

export function describeEmptyReason(
  reason: EmptyReason,
  overrides?: Partial<EmptyReasonDescriptor>,
): EmptyReasonDescriptor {
  return { ...EMPTY_REASON_DESCRIPTORS[reason], ...overrides };
}

// ─────────────────────────────────────────────────────────────────────────────
// Re-auth mechanisms (Q-DRV05) — four, handled without an in-app webview
// ─────────────────────────────────────────────────────────────────────────────

export interface ReauthMechanismDescriptor {
  label: string;
  code: string;
  icon: IoniconName;
  /** CTA wording for "re-authenticate" with this mechanism. */
  actionLabel: string;
  /** Whether the driver can complete it themselves (false for ops_managed). */
  driverActionable: boolean;
}

export const DEFAULT_REAUTH_MECHANISM: PlatformDriverReauthMechanism =
  "external_browser_oauth";

const REAUTH_MECHANISM_DESCRIPTORS: Record<
  PlatformDriverReauthMechanism,
  ReauthMechanismDescriptor
> = {
  external_browser_oauth: {
    label: "OAuth · 外部瀏覽器",
    code: "external_browser_oauth",
    icon: "open-outline",
    actionLabel: "前往瀏覽器驗證",
    driverActionable: true,
  },
  native_app_deeplink: {
    label: "平台 App 跳轉",
    code: "native_app_deeplink",
    icon: "link-outline",
    actionLabel: "開啟平台 App",
    driverActionable: true,
  },
  manual_credential: {
    label: "手動帳密",
    code: "manual_credential",
    icon: "key-outline",
    actionLabel: "輸入帳密驗證",
    driverActionable: true,
  },
  ops_managed: {
    label: "由派車台處理",
    code: "ops_managed",
    icon: "call-outline",
    actionLabel: "聯絡派車台",
    driverActionable: false,
  },
};

export function describeReauthMechanism(
  mechanism: PlatformDriverReauthMechanism | undefined,
): ReauthMechanismDescriptor {
  return REAUTH_MECHANISM_DESCRIPTORS[mechanism ?? DEFAULT_REAUTH_MECHANISM];
}

export function getReauthMechanism(
  record: PlatformPresenceRecord,
): PlatformDriverReauthMechanism {
  return record.reauthMechanism ?? DEFAULT_REAUTH_MECHANISM;
}

// ─────────────────────────────────────────────────────────────────────────────
// availableActions (Q-X13) — CTAs are driven by ResourceActionDescriptor[]
// ─────────────────────────────────────────────────────────────────────────────

export function findAction(
  actions: ResourceActionDescriptor[] | undefined,
  action: string,
): ResourceActionDescriptor | undefined {
  return actions?.find((entry) => entry.action === action);
}

/**
 * Profile / emergency-contact / preferences are medium-risk editable resources
 * (packet §5.8). When the backend supplies `availableActions` we honour it;
 * otherwise we derive the Phase-1 default descriptors so the UI still renders
 * CTAs from a single uniform source.
 */
export function resolveProfileActions(
  record: DriverProfileRecord | null,
): ResourceActionDescriptor[] {
  if (record?.availableActions && record.availableActions.length > 0) {
    return record.availableActions;
  }
  return [
    { action: "update_profile", enabled: true, riskLevel: "medium" },
    { action: "update_emergency_contact", enabled: true, riskLevel: "medium" },
  ];
}

export function resolvePreferenceActions(
  settings: DriverSettings | null,
): ResourceActionDescriptor[] {
  if (settings?.availableActions && settings.availableActions.length > 0) {
    return settings.availableActions;
  }
  return [{ action: "update_preferences", enabled: true, riskLevel: "medium" }];
}

/**
 * Per-binding actions per packet §5.8 + §3.5. Backend `availableActions` win;
 * otherwise derive from the platform capability flags:
 *   - re-authenticate  appears whenever re-auth is required; disabled with
 *     reason when the mechanism is `ops_managed` (driver cannot self-serve)
 *   - unbind           high-risk, requires a reason; only when
 *     `driverSelfServiceBinding` is true (else show status only, never hide)
 */
export function resolveBindingActions(
  record: PlatformPresenceRecord,
): ResourceActionDescriptor[] {
  if (record.availableActions && record.availableActions.length > 0) {
    return record.availableActions;
  }

  const actions: ResourceActionDescriptor[] = [];
  const mechanism = getReauthMechanism(record);
  const selfService = record.driverSelfServiceBinding ?? false;

  if (record.reauthRequired) {
    const opsManaged = mechanism === "ops_managed";
    actions.push({
      action: "reauthenticate",
      enabled: !opsManaged,
      disabledReasonCode: opsManaged ? "ops_managed" : undefined,
      riskLevel: "medium",
    });
  }

  if (selfService) {
    actions.push({
      action: "unbind",
      enabled: true,
      requiresReason: true,
      riskLevel: "high",
    });
  }

  return actions;
}
