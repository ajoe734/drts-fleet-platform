import { useEffect, useMemo, useRef, useState } from "react";
import { Ionicons } from "@expo/vector-icons";
import { useRouter } from "expo-router";
import { useIsFocused } from "@react-navigation/native";
import * as Linking from "expo-linking";
import * as WebBrowser from "expo-web-browser";
import {
  ActivityIndicator,
  Alert,
  Pressable,
  StyleSheet,
  Switch,
  Text,
  TextInput,
  View,
} from "react-native";
import type {
  ActionReceipt,
  DriverProfileRecord,
  DriverSettings,
  EmptyReason,
  PlatformCode,
  PlatformAuthMechanism,
  PlatformPresenceAdapterStatusRecord,
  PlatformPresenceRecord,
  PlatformPresenceSummary,
  RefreshTier,
  ResourceActionDescriptor,
} from "@drts/contracts";
import { PLATFORM_CODE_REGISTRY } from "@drts/contracts";
import {
  Banner,
  Btn,
  Card,
  KPI,
  PageHeader,
  Pill,
  Shell,
  driverCanvasTheme,
} from "@/components/canvas-primitives";
import {
  assessPlatformHealth,
  type PlatformHealthAssessment,
} from "@/components/platform-status-card";
import {
  clearDriverProvisioning,
  getDriverClient,
  getDriverId,
  isDriverIdentityProvisioned,
} from "@/lib/api-client";
import {
  DEFAULT_PROFILE_VALUES,
  DEFAULT_SETTINGS_VALUES,
  buildProfileCommand,
  buildSettingsCommand,
  deriveSaveState,
  hasErrors,
  profileValuesEqual,
  profileValuesFromRecord,
  settingsValuesEqual,
  settingsValuesFromRecord,
  validateProfileValues,
  validateSettingsValues,
  type ProfileFormValues,
  type SaveState,
  type SettingsFormValues,
} from "@/lib/settings-form";

const THEME = driverCanvasTheme;
const SETTINGS_REFRESH_TIER: RefreshTier = "manual";
WebBrowser.maybeCompleteAuthSession();

type BindingFilter = "all" | "attention" | "available";

type LoadOutcome = {
  status: "success" | "partial" | "error";
  messages: string[];
};

type BindingActionKey =
  | "bind"
  | "unbind"
  | "reauth"
  | "contact_ops"
  | "open_presence";

type BindingActionDescriptor = ResourceActionDescriptor & {
  label: string;
  key: BindingActionKey;
  icon: keyof typeof Ionicons.glyphMap;
};

type PendingBindingAction = {
  platformCode: PlatformCode;
  action: BindingActionDescriptor;
  reason: string;
  manualAccountId: string;
  manualTokenExpiresAt: string;
};

type PlatformBindingRow = {
  platformCode: PlatformCode;
  displayName: string;
  record: PlatformPresenceRecord | null;
  adapterStatus: PlatformPresenceAdapterStatusRecord | null;
  assessment: PlatformHealthAssessment | null;
  authMechanism: PlatformAuthMechanism | null;
  driverSelfServiceBinding: boolean | null;
  autoAcceptAllowed: boolean | null;
  availableActions: BindingActionDescriptor[];
  accountDisplay: string;
  statusLabel: string;
  statusTone: "success" | "warn" | "danger" | "neutral";
  statusDetail: string;
  hint: string;
  requiresAttention: boolean;
  isBound: boolean;
};

const BINDING_ACTION_UI: Record<
  string,
  Pick<BindingActionDescriptor, "key" | "label" | "icon">
> = {
  bind_platform_account: {
    key: "bind",
    label: "綁定",
    icon: "add-circle-outline",
  },
  unbind_platform_account: {
    key: "unbind",
    label: "解除綁定",
    icon: "unlink-outline",
  },
  reauth_platform_account: {
    key: "reauth",
    label: "重新授權",
    icon: "refresh-outline",
  },
  contact_ops_for_reauth: {
    key: "contact_ops",
    label: "聯絡派車台",
    icon: "call-outline",
  },
  view_platform_presence: {
    key: "open_presence",
    label: "平台狀態",
    icon: "open-outline",
  },
};

function toErrorMessage(error: unknown): string {
  if (error instanceof Error && error.message.trim()) {
    return error.message.trim();
  }
  return "要求失敗";
}

function formatSectionList(labels: string[]): string {
  if (labels.length <= 1) {
    return labels[0] ?? "";
  }
  if (labels.length === 2) {
    return `${labels[0]}和${labels[1]}`;
  }
  return `${labels.slice(0, -1).join("、")}和${labels.at(-1)}`;
}

function formatRefreshTime(value: string | null): string {
  if (!value) {
    return "尚未同步";
  }

  const parsed = new Date(value);
  if (Number.isNaN(parsed.getTime())) {
    return value;
  }

  return parsed.toLocaleString("zh-TW", {
    month: "numeric",
    day: "numeric",
    hour: "2-digit",
    minute: "2-digit",
  });
}

function formatAccountDisplay(input: {
  accountId: string | null;
  isBound: boolean;
}): string {
  if (!input.isBound) {
    return "尚未綁定";
  }
  const { accountId: value } = input;
  if (!value) {
    return "已綁定（平台未提供識別）";
  }
  if (value.length <= 4) {
    return value;
  }
  return `${value.slice(0, 2)}•••${value.slice(-2)}`;
}

function describeSaveState(state: SaveState) {
  switch (state) {
    case "saving":
      return {
        label: "儲存中",
        tone: "info" as const,
        subtitle: "正在提交變更",
      };
    case "dirty":
      return {
        label: "尚有未儲存變更",
        tone: "warn" as const,
        subtitle: "請確認後送出",
      };
    case "saved":
      return {
        label: "已儲存",
        tone: "success" as const,
        subtitle: "設定已同步",
      };
    case "error":
      return {
        label: "儲存失敗",
        tone: "danger" as const,
        subtitle: "請稍後重試",
      };
    default:
      return {
        label: "未變更",
        tone: "neutral" as const,
        subtitle: "目前為最新設定",
      };
  }
}

function classifyErrorEmptyReason(message: string): EmptyReason {
  const normalized = message.toLowerCase();
  if (
    normalized.includes("401") ||
    normalized.includes("403") ||
    normalized.includes("permission") ||
    normalized.includes("權限")
  ) {
    return "permission_denied";
  }
  return "fetch_failed";
}

function getMechanismLabel(
  mechanism: PlatformAuthMechanism | null | undefined,
): string {
  switch (mechanism) {
    case "external_browser_oauth":
      return "OAuth · 外部瀏覽器";
    case "native_app_deeplink":
      return "Native App 跳轉";
    case "manual_credential":
      return "手動帳密";
    case "ops_managed":
      return "聯絡派車台";
    default:
      return "等待平台 capability";
  }
}

function getMechanismIcon(
  mechanism: PlatformAuthMechanism | null | undefined,
): keyof typeof Ionicons.glyphMap {
  switch (mechanism) {
    case "external_browser_oauth":
      return "open-outline";
    case "native_app_deeplink":
      return "link-outline";
    case "manual_credential":
      return "key-outline";
    case "ops_managed":
      return "call-outline";
    default:
      return "help-circle-outline";
  }
}

function getDisabledReasonLabel(code?: string): string {
  switch (code) {
    case "driver_self_service_binding_disabled":
      return "需由派車台處理綁定";
    case "ops_managed_reauth":
      return "需聯絡派車台協助重新授權";
    case "not_bound":
      return "尚未綁定平台帳號";
    case "reauth_required":
      return "需先完成重新授權";
    case "adapter_down":
      return "平台轉接服務目前不可用";
    default:
      return "目前不可執行";
  }
}

function getRiskLabel(
  riskLevel: ResourceActionDescriptor["riskLevel"],
): string {
  switch (riskLevel) {
    case "high":
      return "high risk";
    case "medium":
      return "medium risk";
    case "low":
    default:
      return "low risk";
  }
}

function getActionDialogTitle(
  row: PlatformBindingRow,
  action: BindingActionDescriptor,
): string {
  switch (action.key) {
    case "bind":
      return `綁定 ${row.displayName}`;
    case "reauth":
      return `${row.displayName} 重新授權`;
    case "unbind":
      return `解除 ${row.displayName} 綁定`;
    case "contact_ops":
      return `聯絡派車台處理 ${row.displayName}`;
    case "open_presence":
    default:
      return `${row.displayName} 平台狀態`;
  }
}

function getActionDialogBody(
  row: PlatformBindingRow,
  action: BindingActionDescriptor,
): string {
  if (action.key === "unbind") {
    return "這是高風險操作，解除綁定後平台將不再向此司機派送工作。";
  }

  switch (row.authMechanism) {
    case "external_browser_oauth":
      return "此平台使用外部瀏覽器 OAuth。確認後會提示你切換到外部授權流程，完成後再回到 App 重新整理狀態。";
    case "native_app_deeplink":
      return "此平台使用原生 App deep link。確認後會提示你切換到平台 App 完成驗證，再回來同步狀態。";
    case "manual_credential":
      return "此平台需要手動輸入帳號識別與憑證資訊。送出後會保留目前頁面狀態，等待平台同步。";
    case "ops_managed":
      return "此平台採 ops-managed 機制，司機端不能自行完成授權，需通知派車台協助處理。";
    default:
      return "runtime 尚未提供此平台的授權機制 capability；目前只能查看狀態或返回平台頁等待同步。";
  }
}

function getBindingActions(
  availableActions: ResourceActionDescriptor[] | undefined,
): BindingActionDescriptor[] {
  if (!availableActions?.length) {
    return [];
  }

  return availableActions.flatMap((action) => {
    const ui = BINDING_ACTION_UI[action.action];
    if (!ui) {
      return [];
    }
    return [{ ...action, ...ui }];
  });
}

function getBooleanFlag(value: boolean | null | undefined): boolean | null {
  if (typeof value === "boolean") {
    return value;
  }
  return null;
}

function deriveBoundState(
  record: PlatformPresenceRecord | null,
  availableActions: BindingActionDescriptor[],
): boolean {
  const hasBoundOnlyActions = availableActions.some(
    (action) =>
      action.action === "unbind_platform_account" ||
      action.action === "reauth_platform_account" ||
      action.action === "contact_ops_for_reauth",
  );

  if (!record) {
    return false;
  }
  if (record.accountId) {
    return true;
  }
  return hasBoundOnlyActions;
}

function getPresenceStatusCopy(
  record: PlatformPresenceRecord | null,
  assessment: PlatformHealthAssessment | null,
  isBound: boolean,
) {
  if (!record || !isBound) {
    return {
      label: "尚未綁定",
      tone: "neutral" as const,
      detail: "尚未建立平台帳號連線",
    };
  }

  if (record.reauthRequired) {
    return {
      label: "需重新授權",
      tone: "warn" as const,
      detail: "Token 已過期或被平台要求重新登入",
    };
  }

  if (record.eligibility === "ineligible") {
    return {
      label: "資格受限",
      tone: "danger" as const,
      detail: "目前不能接收該平台任務",
    };
  }

  if (record.status === "online" && assessment?.canReceiveOrders) {
    return {
      label: "可接單",
      tone: "success" as const,
      detail: "平台連線正常，允許接單",
    };
  }

  if (record.status === "offline") {
    return {
      label: "已離線",
      tone: "neutral" as const,
      detail: "此平台目前不接單",
    };
  }

  return {
    label: assessment?.statusLabel ?? "需處理",
    tone:
      assessment?.statusTone === "danger"
        ? ("danger" as const)
        : ("warn" as const),
    detail: assessment?.readinessLabel ?? "平台狀態需確認",
  };
}

function derivePlatformRows(
  summary: PlatformPresenceSummary | null,
): PlatformBindingRow[] {
  const adapterMap = new Map<
    PlatformCode,
    PlatformPresenceAdapterStatusRecord
  >();
  const presenceMap = new Map<PlatformCode, PlatformPresenceRecord>();

  summary?.adapterStatuses?.forEach((status) => {
    adapterMap.set(status.platformCode, status);
  });
  summary?.presences.forEach((record) => {
    presenceMap.set(record.platformCode, record);
  });

  return Array.from(presenceMap.keys())
    .map((platformCode) => {
      const record = presenceMap.get(platformCode) ?? null;
      const adapterStatus = adapterMap.get(platformCode) ?? null;
      const assessment = record
        ? assessPlatformHealth(record, adapterStatus)
        : null;
      const authMechanism = record?.authMechanism ?? null;
      const driverSelfServiceBinding = getBooleanFlag(
        record?.driverSelfServiceBinding,
      );
      const autoAcceptAllowed = getBooleanFlag(record?.autoAcceptAllowed);
      const availableActions = getBindingActions(record?.availableActions);
      const isBound = deriveBoundState(record, availableActions);
      const statusCopy = getPresenceStatusCopy(record, assessment, isBound);
      return {
        platformCode,
        displayName:
          PLATFORM_CODE_REGISTRY[platformCode]?.displayName ?? platformCode,
        record,
        adapterStatus,
        assessment,
        authMechanism,
        driverSelfServiceBinding,
        autoAcceptAllowed,
        accountDisplay: formatAccountDisplay({
          accountId: record?.accountId ?? null,
          isBound,
        }),
        statusLabel: statusCopy.label,
        statusTone: statusCopy.tone,
        statusDetail: statusCopy.detail,
        hint: !isBound
          ? authMechanism == null
            ? "尚未綁定；等待 runtime 提供首次綁定所需的授權機制 capability"
            : authMechanism === "ops_managed"
              ? "尚未綁定；需由派車台協助建立平台帳號連線"
              : `尚未綁定；可使用 ${getMechanismLabel(authMechanism)} 完成首次綁定`
          : authMechanism == null
            ? "已綁定，但 runtime 尚未提供重新授權機制 capability"
            : authMechanism === "ops_managed"
              ? "此平台帳號需由派車台協助維護"
              : `重新授權方式：${getMechanismLabel(authMechanism)}`,
        requiresAttention:
          Boolean(record?.reauthRequired) ||
          record?.eligibility === "ineligible" ||
          record?.eligibility === "pending" ||
          adapterStatus?.status === "degraded" ||
          adapterStatus?.status === "down" ||
          assessment?.statusTone === "warning" ||
          assessment?.statusTone === "danger",
        isBound,
        availableActions,
      };
    })
    .sort((left, right) => {
      const attentionDelta =
        Number(right.requiresAttention) - Number(left.requiresAttention);
      if (attentionDelta !== 0) {
        return attentionDelta;
      }
      return left.displayName.localeCompare(right.displayName, "zh-TW");
    });
}

function hasSummaryAdapterOutage(
  summary: PlatformPresenceSummary | null,
): boolean {
  const statuses = summary?.adapterStatuses ?? [];
  return (
    statuses.length > 0 &&
    statuses.every(
      (status) => status.status === "degraded" || status.status === "down",
    )
  );
}

function hasVisibleEligibilityLock(rows: PlatformBindingRow[]): boolean {
  return (
    rows.length > 0 &&
    rows.every(
      (row) =>
        row.record?.eligibility === "ineligible" ||
        row.record?.eligibility === "pending",
    )
  );
}

function hasVisibleBoundAccounts(rows: PlatformBindingRow[]): boolean {
  return rows.some((row) => row.isBound);
}

function getBrowserAuthUrl(
  platformCode: PlatformCode,
  actionKey: "bind" | "reauth",
): string | null {
  const redirectUri = encodeURIComponent(Linking.createURL("/settings"));
  const context = `source=driver_app&intent=${actionKey}&platform=${platformCode}&redirect_uri=${redirectUri}`;

  switch (platformCode) {
    case "uber":
      return `https://auth.uber.com/oauth/v2/authorize?${context}`;
    case "grab_taiwan":
      return `https://driver.grab.com/identity/oauth?${context}`;
    default:
      return null;
  }
}

function getAuthSessionRedirectUrl(platformCode: PlatformCode): string {
  return Linking.createURL("/settings", {
    queryParams: {
      auth: "callback",
      platform: platformCode,
    },
  });
}

function getNativeAppAuthUrl(
  platformCode: PlatformCode,
  actionKey: "bind" | "reauth",
): string | null {
  const redirectUri = encodeURIComponent(Linking.createURL("/settings"));
  const context = `source=driver_app&intent=${actionKey}&redirect_uri=${redirectUri}`;

  switch (platformCode) {
    case "grab":
      return `grab://open?screen=identity-verification&platform=${platformCode}&${context}`;
    default:
      return null;
  }
}

function deriveBindingEmptyReason(input: {
  rows: PlatformBindingRow[];
  visibleRows: PlatformBindingRow[];
  filter: BindingFilter;
  presenceError: string | null;
  summary: PlatformPresenceSummary | null;
}): EmptyReason | null {
  const { rows, visibleRows, filter, presenceError, summary } = input;
  if (visibleRows.length > 0) {
    return null;
  }
  if (presenceError && !summary) {
    return classifyErrorEmptyReason(presenceError);
  }
  if (filter !== "all") {
    return "filtered_empty";
  }
  if (hasVisibleEligibilityLock(rows)) {
    return "driver_not_eligible";
  }
  if (hasSummaryAdapterOutage(summary)) {
    return "external_unavailable";
  }
  if (summary && !hasVisibleBoundAccounts(rows)) {
    return "not_provisioned";
  }
  if (rows.length === 0) {
    return "no_data";
  }
  return "no_data";
}

function InfoField({
  label,
  value,
  onChangeText,
  placeholder,
  keyboardType,
  autoCapitalize,
  error,
  editable = true,
}: {
  label: string;
  value: string;
  onChangeText: (value: string) => void;
  placeholder: string;
  keyboardType?: "default" | "phone-pad" | "email-address" | "numeric";
  autoCapitalize?: "none" | "sentences" | "words";
  error?: string;
  editable?: boolean;
}) {
  return (
    <View style={styles.fieldBlock}>
      <Text style={styles.fieldLabel}>{label}</Text>
      <TextInput
        style={[
          styles.fieldInput,
          !editable ? styles.fieldInputDisabled : null,
          error ? styles.fieldInputError : null,
        ]}
        value={value}
        onChangeText={onChangeText}
        placeholder={placeholder}
        placeholderTextColor={THEME.textDim}
        keyboardType={keyboardType}
        autoCapitalize={autoCapitalize}
        editable={editable}
      />
      {error ? <Text style={styles.fieldError}>{error}</Text> : null}
    </View>
  );
}

function RowButton({
  label,
  value,
  hint,
  tone = "default",
  onPress,
}: {
  label: string;
  value?: string;
  hint?: string;
  tone?: "default" | "danger";
  onPress?: () => void;
}) {
  return (
    <Pressable
      onPress={onPress}
      disabled={!onPress}
      style={({ pressed }) => [
        styles.rowButton,
        pressed && onPress ? styles.rowButtonPressed : null,
      ]}
    >
      <View style={styles.rowButtonCopy}>
        <Text
          style={[
            styles.rowButtonLabel,
            tone === "danger" ? styles.rowButtonLabelDanger : null,
          ]}
        >
          {label}
        </Text>
        {hint ? <Text style={styles.rowButtonHint}>{hint}</Text> : null}
      </View>
      <View style={styles.rowButtonValueWrap}>
        {value ? <Text style={styles.rowButtonValue}>{value}</Text> : null}
        <Ionicons
          name="chevron-forward"
          size={16}
          color={tone === "danger" ? THEME.danger : THEME.textDim}
        />
      </View>
    </Pressable>
  );
}

function FilterChip({
  selected,
  label,
  onPress,
}: {
  selected: boolean;
  label: string;
  onPress: () => void;
}) {
  return (
    <Pressable
      onPress={onPress}
      style={[
        styles.filterChip,
        selected ? styles.filterChipSelected : styles.filterChipIdle,
      ]}
    >
      <Text
        style={[
          styles.filterChipLabel,
          selected && styles.filterChipLabelSelected,
        ]}
      >
        {label}
      </Text>
    </Pressable>
  );
}

function BindingEmptyState({
  reason,
  onRetry,
  onOpenPresence,
  onClearFilter,
}: {
  reason: EmptyReason;
  onRetry: () => void;
  onOpenPresence: () => void;
  onClearFilter: () => void;
}) {
  const config = {
    no_data: {
      tone: "info" as const,
      icon: "layers-outline" as const,
      title: "目前沒有可顯示的平台資料",
      body: "所有平台都已經整理完成，這個檢視目前沒有額外內容。",
      actionLabel: "前往平台頁",
      action: onOpenPresence,
    },
    not_provisioned: {
      tone: "warn" as const,
      icon: "link-outline" as const,
      title: "尚未綁定任何平台帳號",
      body: "可從下方綁定支援的平台，或前往平台頁確認目前車隊設定。",
      actionLabel: "前往平台頁",
      action: onOpenPresence,
    },
    fetch_failed: {
      tone: "danger" as const,
      icon: "cloud-offline-outline" as const,
      title: "平台資料同步失敗",
      body: "設定頁未能取得最新平台綁定資料，請重新整理後再試一次。",
      actionLabel: "重新整理",
      action: onRetry,
    },
    permission_denied: {
      tone: "danger" as const,
      icon: "lock-closed-outline" as const,
      title: "目前沒有權限查看平台綁定",
      body: "此裝置登入狀態已失效或權限不足，需要重新啟用或由派車台協助。",
      actionLabel: "重新整理",
      action: onRetry,
    },
    external_unavailable: {
      tone: "warn" as const,
      icon: "warning-outline" as const,
      title: "外部平台目前不可用",
      body: "轉接器或平台端服務正在降級，請先查看平台健康中心。",
      actionLabel: "查看平台頁",
      action: onOpenPresence,
    },
    driver_not_eligible: {
      tone: "warn" as const,
      icon: "ban-outline" as const,
      title: "目前沒有符合資格的平台",
      body: "所有綁定平台都標記為資格受限，請依平台規則完成重新驗證或聯絡派車台。",
      actionLabel: "查看平台頁",
      action: onOpenPresence,
    },
    filtered_empty: {
      tone: "info" as const,
      icon: "funnel-outline" as const,
      title: "這個篩選條件沒有結果",
      body: "目前沒有符合篩選條件的平台，可以切回全部平台檢視。",
      actionLabel: "查看全部",
      action: onClearFilter,
    },
  }[reason];

  return (
    <Banner
      theme={THEME}
      tone={config.tone}
      icon={<Ionicons name={config.icon} size={18} color={THEME.text} />}
      title={config.title}
      body={config.body}
      actions={
        <Btn
          theme={THEME}
          variant="secondary"
          size="sm"
          onPress={config.action}
        >
          {config.actionLabel}
        </Btn>
      }
    />
  );
}

function BindingActionButton({
  action,
  onPress,
  busy,
}: {
  action: BindingActionDescriptor;
  onPress: () => void;
  busy: boolean;
}) {
  const variant =
    action.riskLevel === "medium"
      ? "primary"
      : action.key === "unbind"
        ? "ghost"
        : "secondary";

  return (
    <View style={styles.bindingActionWrap}>
      <Btn
        theme={THEME}
        variant={variant}
        size="sm"
        onPress={onPress}
        danger={action.riskLevel === "high"}
        disabled={!action.enabled || busy}
      >
        {busy ? "處理中…" : action.label}
      </Btn>
      {action.enabled && action.requiresReason ? (
        <Text style={styles.bindingDisabledReason}>需填寫原因</Text>
      ) : null}
      {!action.enabled && action.disabledReasonCode ? (
        <Text style={styles.bindingDisabledReason}>
          {getDisabledReasonLabel(action.disabledReasonCode)}
        </Text>
      ) : null}
    </View>
  );
}

export default function SettingsScreen() {
  const router = useRouter();
  const isFocused = useIsFocused();
  const isProvisioned = isDriverIdentityProvisioned();
  const driverId = isProvisioned ? getDriverId() : "";

  const [loading, setLoading] = useState(true);
  const [refreshing, setRefreshing] = useState(false);
  const [saving, setSaving] = useState(false);
  const [loadError, setLoadError] = useState<string | null>(null);
  const [presenceError, setPresenceError] = useState<string | null>(null);
  const [saveError, setSaveError] = useState<string | null>(null);
  const [lastResult, setLastResult] = useState<"success" | "error" | null>(
    null,
  );

  const [settingsLoaded, setSettingsLoaded] = useState(false);
  const [profileLoaded, setProfileLoaded] = useState(false);
  const [settingsValues, setSettingsValues] = useState<SettingsFormValues>(
    DEFAULT_SETTINGS_VALUES,
  );
  const [profileValues, setProfileValues] = useState<ProfileFormValues>(
    DEFAULT_PROFILE_VALUES,
  );
  const [initialSettings, setInitialSettings] = useState<SettingsFormValues>(
    DEFAULT_SETTINGS_VALUES,
  );
  const [initialProfile, setInitialProfile] = useState<ProfileFormValues>(
    DEFAULT_PROFILE_VALUES,
  );
  const [presenceSummary, setPresenceSummary] =
    useState<PlatformPresenceSummary | null>(null);
  const [bindingFilter, setBindingFilter] = useState<BindingFilter>("all");
  const [busyPlatform, setBusyPlatform] = useState<PlatformCode | null>(null);
  const [pendingBindingAction, setPendingBindingAction] =
    useState<PendingBindingAction | null>(null);
  const [actionReceipt, setActionReceipt] = useState<ActionReceipt | null>(
    null,
  );
  const [handoffNotice, setHandoffNotice] = useState<string | null>(null);
  const [lastSyncedAt, setLastSyncedAt] = useState<string | null>(null);
  const hasFocusedOnceRef = useRef(false);

  const settingsErrors = validateSettingsValues(settingsValues);
  const profileErrors = profileLoaded
    ? validateProfileValues(profileValues)
    : {};

  const settingsDirty =
    settingsLoaded && !settingsValuesEqual(initialSettings, settingsValues);
  const profileDirty =
    profileLoaded && !profileValuesEqual(initialProfile, profileValues);
  const dirty = settingsDirty || profileDirty;
  const hasValidation =
    (settingsLoaded && hasErrors(settingsErrors)) ||
    (profileLoaded && hasErrors(profileErrors));
  const saveState = deriveSaveState({
    saving,
    dirty,
    hasValidation,
    lastResult,
  });
  const saveDescriptor = describeSaveState(saveState);

  const loadAll = async ({
    silent = false,
    allowFormReset = true,
  }: {
    silent?: boolean;
    allowFormReset?: boolean;
  } = {}): Promise<LoadOutcome> => {
    if (!isProvisioned) {
      setLoading(false);
      return { status: "error", messages: ["尚未完成裝置配置"] };
    }

    const client = getDriverClient();
    const [settingsResult, profileResult, presenceResult] =
      await Promise.allSettled([
        client.getDriverSettings(driverId),
        client.getDriverProfile(),
        client.getPlatformPresence(),
      ]);

    const failures: string[] = [];
    let hadSuccess = false;

    if (settingsResult.status === "fulfilled") {
      hadSuccess = true;
      const next = settingsValuesFromRecord(
        settingsResult.value as DriverSettings,
      );
      if (allowFormReset) {
        setSettingsValues(next);
        setInitialSettings(next);
      }
      setSettingsLoaded(true);
    } else {
      failures.push(`偏好設定（${toErrorMessage(settingsResult.reason)}）`);
    }

    if (profileResult.status === "fulfilled") {
      hadSuccess = true;
      const next = profileValuesFromRecord(
        profileResult.value as DriverProfileRecord,
      );
      if (allowFormReset) {
        setProfileValues(next);
        setInitialProfile(next);
      }
      setProfileLoaded(true);
    } else {
      failures.push(`個人資料（${toErrorMessage(profileResult.reason)}）`);
    }

    if (presenceResult.status === "fulfilled") {
      hadSuccess = true;
      setPresenceSummary(presenceResult.value as PlatformPresenceSummary);
      setPresenceError(null);
    } else {
      const message = toErrorMessage(presenceResult.reason);
      setPresenceError(message);
      if (!presenceSummary) {
        setPresenceSummary(null);
      }
      failures.push(`平台綁定（${message}）`);
    }

    if (failures.length === 0) {
      setLoadError(null);
      const syncedAt = new Date().toISOString();
      setLastSyncedAt(syncedAt);
      return { status: "success", messages: [] };
    }

    if (hadSuccess) {
      setLoadError(`已使用可用資料。無法載入 ${formatSectionList(failures)}。`);
      const syncedAt = new Date().toISOString();
      setLastSyncedAt(syncedAt);
      return { status: "partial", messages: failures };
    }

    const message = `無法載入 ${formatSectionList(failures)}。`;
    setLoadError(message);
    if (!silent) {
      Alert.alert("無法載入設定", message);
    }
    return { status: "error", messages: failures };
  };

  useEffect(() => {
    let active = true;
    if (!isProvisioned) {
      setLoading(false);
      return;
    }

    void loadAll().finally(() => {
      if (active) {
        setLoading(false);
      }
    });

    return () => {
      active = false;
    };
  }, [driverId, isProvisioned]);

  useEffect(() => {
    if (!isFocused || loading) {
      return;
    }
    if (!hasFocusedOnceRef.current) {
      hasFocusedOnceRef.current = true;
      return;
    }
    if (dirty || saving) {
      return;
    }
    void loadAll({ silent: true, allowFormReset: true });
  }, [dirty, isFocused, loading, saving]);

  const platformRows = useMemo(
    () => derivePlatformRows(presenceSummary),
    [presenceSummary],
  );
  const visiblePlatformRows = useMemo(() => {
    switch (bindingFilter) {
      case "attention":
        return platformRows.filter((row) => row.requiresAttention);
      case "available":
        return platformRows.filter((row) =>
          row.availableActions.some(
            (action) =>
              action.action === "bind_platform_account" && action.enabled,
          ),
        );
      default:
        return platformRows;
    }
  }, [bindingFilter, platformRows]);

  const bindingEmptyReason = deriveBindingEmptyReason({
    rows: platformRows,
    visibleRows: visiblePlatformRows,
    filter: bindingFilter,
    presenceError,
    summary: presenceSummary,
  });
  const pendingActionRow = useMemo(
    () =>
      pendingBindingAction
        ? (platformRows.find(
            (row) => row.platformCode === pendingBindingAction.platformCode,
          ) ?? null)
        : null,
    [pendingBindingAction, platformRows],
  );

  const readyPlatformCount = platformRows.filter(
    (row) =>
      row.record?.status === "online" && row.assessment?.canReceiveOrders,
  ).length;
  const attentionPlatformCount = platformRows.filter(
    (row) => row.requiresAttention,
  ).length;
  const selfBindableCount = platformRows.filter((row) =>
    row.availableActions.some(
      (action) => action.action === "bind_platform_account" && action.enabled,
    ),
  ).length;
  const autoAcceptPlatforms = platformRows.filter(
    (row) => row.autoAcceptAllowed === true,
  );
  const profileInitial = profileValues.profileName.trim().charAt(0) || "司";
  const identitySummary = [
    driverId ? `ID ${driverId}` : null,
    profileValues.profilePhone.trim() || null,
    profileValues.profileEmail.trim() || null,
  ]
    .filter(Boolean)
    .join(" · ");
  const emergencySummary = [
    profileValues.emergencyName.trim() || "尚未設定",
    profileValues.emergencyRelationship.trim() || null,
    profileValues.emergencyPhone.trim() || null,
  ]
    .filter(Boolean)
    .join(" · ");
  const refreshLabel = `${SETTINGS_REFRESH_TIER} · ${formatRefreshTime(lastSyncedAt)}`;
  const hasInlineStatus =
    Boolean(loadError) ||
    Boolean(saveError) ||
    Boolean(actionReceipt) ||
    Boolean(handoffNotice) ||
    hasValidation;

  const updateSettings = (patch: Partial<SettingsFormValues>) => {
    setSettingsValues((prev) => ({ ...prev, ...patch }));
    setLastResult(null);
    setSaveError(null);
    setHandoffNotice(null);
  };

  const updateProfile = (patch: Partial<ProfileFormValues>) => {
    setProfileValues((prev) => ({ ...prev, ...patch }));
    setLastResult(null);
    setSaveError(null);
    setHandoffNotice(null);
  };

  const handleRefresh = async () => {
    if (dirty || saving) {
      Alert.alert(
        "請先處理未儲存變更",
        "設定頁為手動刷新模式，未儲存變更時不會覆蓋表單內容。",
      );
      return;
    }

    setRefreshing(true);
    await loadAll({ silent: false, allowFormReset: true });
    setRefreshing(false);
  };

  const buildActionReceipt = (
    row: PlatformBindingRow,
    action: BindingActionDescriptor,
    status: ActionReceipt["status"],
    message: string,
  ): ActionReceipt => {
    const timestamp = Date.now();
    return {
      actionId: `${action.action}-${row.platformCode}-${timestamp}`,
      auditId: `drv-${row.platformCode}-${timestamp}`,
      resourceType: "platform_binding",
      resourceId: row.platformCode,
      status,
      message,
    };
  };

  const performSave = async () => {
    if (!dirty || hasValidation) {
      return;
    }

    setSaving(true);
    setSaveError(null);
    const client = getDriverClient();
    const tasks: Array<Promise<{ section: string }>> = [];

    if (settingsDirty) {
      tasks.push(
        client
          .updateDriverSettings(driverId, buildSettingsCommand(settingsValues))
          .then(() => ({ section: "偏好設定" })),
      );
    }
    if (profileDirty) {
      tasks.push(
        client
          .updateDriverProfile(buildProfileCommand(profileValues))
          .then(() => ({ section: "個人資料" })),
      );
    }

    try {
      const results = await Promise.allSettled(tasks);
      const saved: string[] = [];
      const failed: string[] = [];

      results.forEach((entry, index) => {
        const isSettingsTask = settingsDirty && index === 0;
        const sectionLabel = isSettingsTask ? "偏好設定" : "個人資料";
        if (entry.status === "fulfilled") {
          saved.push(entry.value.section);
        } else {
          failed.push(`${sectionLabel}（${toErrorMessage(entry.reason)}）`);
        }
      });

      if (saved.includes("偏好設定")) {
        setInitialSettings(settingsValues);
      }
      if (saved.includes("個人資料")) {
        setInitialProfile(profileValues);
      }

      if (failed.length === 0) {
        setLastResult("success");
        Alert.alert("儲存成功", "設定已成功儲存。");
        return;
      }

      const failureMessage =
        saved.length === 0
          ? `無法儲存 ${formatSectionList(failed)}。`
          : `已儲存 ${formatSectionList(saved)}。無法儲存 ${formatSectionList(failed)}。`;
      setLastResult("error");
      setSaveError(failureMessage);
      Alert.alert(
        saved.length === 0 ? "儲存失敗" : "部分儲存成功",
        failureMessage,
      );
    } finally {
      setSaving(false);
    }
  };

  const handleSave = () => {
    if (!dirty || hasValidation || saving) {
      return;
    }
    Alert.alert("儲存設定", "要提交個人資料、偏好與平台設定變更嗎？", [
      { text: "取消", style: "cancel" },
      { text: "確認送出", onPress: () => void performSave() },
    ]);
  };

  const handlePlatformAction = async (
    row: PlatformBindingRow,
    action: BindingActionDescriptor,
  ) => {
    if (!action.enabled || busyPlatform) {
      return;
    }

    if (action.key === "open_presence") {
      router.push("/platform-presence");
      return;
    }

    setPendingBindingAction({
      platformCode: row.platformCode,
      action,
      reason: "",
      manualAccountId: row.record?.accountId ?? "",
      manualTokenExpiresAt: row.record?.tokenExpiresAt ?? "",
    });
  };

  const submitPendingBindingAction = async () => {
    if (!pendingBindingAction || busyPlatform) {
      return;
    }

    const row = pendingActionRow;
    if (!row) {
      setPendingBindingAction(null);
      return;
    }

    const { action } = pendingBindingAction;
    const reason = pendingBindingAction.reason.trim();
    const manualAccountId = pendingBindingAction.manualAccountId.trim();
    const manualTokenExpiresAt =
      pendingBindingAction.manualTokenExpiresAt.trim();

    if (action.requiresReason && !reason) {
      return;
    }

    if (
      row.authMechanism === "manual_credential" &&
      (action.key === "bind" || action.key === "reauth") &&
      !manualAccountId
    ) {
      return;
    }
    if (
      (action.key === "bind" || action.key === "reauth") &&
      row.authMechanism == null
    ) {
      Alert.alert(
        `${action.label}暫時不可用`,
        "runtime 尚未提供此平台的授權機制 capability，請稍後重新整理或改到平台頁確認。",
      );
      return;
    }

    const client = getDriverClient();
    setBusyPlatform(row.platformCode);
    try {
      if (action.key === "contact_ops") {
        setActionReceipt(
          buildActionReceipt(
            row,
            action,
            "accepted",
            `已記錄 ${row.displayName} 的派車台處理請求，請聯絡 ops 協助重新授權或帳號維護。`,
          ),
        );
      } else if (action.key === "unbind") {
        await client.unbindPlatformAccount({
          platformCode: row.platformCode,
          reason,
        });
        setActionReceipt(
          buildActionReceipt(
            row,
            action,
            "completed",
            `已解除 ${row.displayName} 綁定。原因：${reason}`,
          ),
        );
      } else if (row.authMechanism === "manual_credential") {
        await client.setPlatformOnline({
          platformCode: row.platformCode,
          accountId: manualAccountId,
          tokenExpiresAt: manualTokenExpiresAt || null,
        });
        setActionReceipt(
          buildActionReceipt(
            row,
            action,
            "completed",
            `${row.displayName} 已送出手動帳密資料，帳號識別 ${formatAccountDisplay(
              {
                accountId: manualAccountId,
                isBound: true,
              },
            )}，請等待平台同步。`,
          ),
        );
      } else if (row.authMechanism === "external_browser_oauth") {
        const authIntent = action.key === "bind" ? "bind" : "reauth";
        const authUrl = getBrowserAuthUrl(row.platformCode, authIntent);
        if (!authUrl) {
          throw new Error("此平台尚未配置外部瀏覽器授權入口。");
        }
        const authSessionResult = await WebBrowser.openAuthSessionAsync(
          authUrl,
          getAuthSessionRedirectUrl(row.platformCode),
        );
        setActionReceipt(null);
        if (authSessionResult.type === "success") {
          setHandoffNotice(
            `${row.displayName} 已完成外部瀏覽器授權回跳，設定頁會在重新聚焦時刷新平台狀態。`,
          );
        } else if (authSessionResult.type === "cancel") {
          setHandoffNotice(
            `${row.displayName} 的外部瀏覽器授權已取消；若稍後重試，系統會再次啟動 AppAuth-style 流程。`,
          );
        } else {
          setHandoffNotice(
            `${row.displayName} 已啟動外部瀏覽器授權流程。完成後回到 Driver App，系統會在重新聚焦時刷新；若你仍在編輯表單，請手動按重新整理。`,
          );
        }
      } else if (row.authMechanism === "native_app_deeplink") {
        const authIntent = action.key === "bind" ? "bind" : "reauth";
        const authUrl = getNativeAppAuthUrl(row.platformCode, authIntent);
        if (!authUrl) {
          throw new Error("此平台尚未配置原生 App 驗證連結。");
        }
        const supported = await Linking.canOpenURL(authUrl);
        if (!supported) {
          throw new Error("裝置目前無法開啟此平台 App deep link。");
        }
        await Linking.openURL(authUrl);
        setActionReceipt(null);
        setHandoffNotice(
          `${row.displayName} 已切換到平台 App 驗證流程。完成後回到 Driver App，系統會在重新聚焦時刷新；若你仍在編輯表單，請手動按重新整理。`,
        );
      } else {
        throw new Error("此平台授權方式不支援於設定頁直接處理。");
      }

      if (
        row.authMechanism === "manual_credential" ||
        action.key === "unbind"
      ) {
        await loadAll({ silent: true, allowFormReset: false });
      }
      setPendingBindingAction(null);
    } catch (error) {
      Alert.alert(`${action.label}失敗`, toErrorMessage(error));
    } finally {
      setBusyPlatform(null);
    }
  };

  const handleLogout = () => {
    Alert.alert("登出裝置", "登出後需要重新完成裝置配置，確定要繼續嗎？", [
      { text: "取消", style: "cancel" },
      {
        text: "登出",
        style: "destructive",
        onPress: async () => {
          await clearDriverProvisioning();
          router.replace("/onboarding");
        },
      },
    ]);
  };

  if (!isProvisioned) {
    return (
      <Shell theme={THEME} contentContainerStyle={styles.shellContent}>
        <PageHeader theme={THEME} title="設定" subtitle="裝置尚未完成配置" />
        <Banner
          theme={THEME}
          tone="warn"
          icon={
            <Ionicons name="lock-closed-outline" size={18} color={THEME.warn} />
          }
          title="尚未完成裝置配置"
          body="此裝置尚未分配司機身份，無法管理設定與平台綁定。"
          actions={
            <Btn
              theme={THEME}
              variant="primary"
              size="sm"
              onPress={() => router.push("/onboarding")}
            >
              前往配置裝置
            </Btn>
          }
        />
      </Shell>
    );
  }

  if (loading && !settingsLoaded && !profileLoaded && !presenceSummary) {
    return (
      <Shell theme={THEME} contentContainerStyle={styles.loadingShellContent}>
        <PageHeader theme={THEME} title="設定" subtitle="載入中…" />
        <Card theme={THEME} padding={20}>
          <View style={styles.loadingWrap}>
            <ActivityIndicator size="large" color={THEME.accent} />
            <Text style={styles.loadingLabel}>載入設定與平台綁定資料中…</Text>
          </View>
        </Card>
      </Shell>
    );
  }

  const footer = (
    <View style={styles.footerBar}>
      <View style={styles.footerBarCopy}>
        <Text style={styles.footerBarTitle}>{saveDescriptor.label}</Text>
        <Text style={styles.footerBarNote}>{saveDescriptor.subtitle}</Text>
      </View>
      <Btn
        theme={THEME}
        variant="primary"
        size="md"
        onPress={handleSave}
        disabled={!dirty || hasValidation || saving}
        style={styles.footerBarButton}
      >
        {saving ? "儲存中…" : dirty ? "儲存變更" : "已是最新"}
      </Btn>
    </View>
  );

  return (
    <Shell
      theme={THEME}
      contentContainerStyle={styles.shellContent}
      footer={footer}
    >
      <PageHeader
        theme={THEME}
        title="設定"
        subtitle="個人資料、接單偏好與平台帳號綁定"
        actions={
          <Btn
            theme={THEME}
            variant="ghost"
            size="sm"
            onPress={() => void handleRefresh()}
            disabled={refreshing || saving}
          >
            {refreshing ? "同步中…" : "重新整理"}
          </Btn>
        }
      />

      <Card theme={THEME} padding={16}>
        <View style={styles.identityHero}>
          <View style={styles.avatarBubble}>
            <Text style={styles.avatarText}>{profileInitial}</Text>
          </View>
          <View style={styles.identityCopy}>
            <View style={styles.identityTitleRow}>
              <Text style={styles.identityName}>
                {profileValues.profileName.trim() || "尚未填寫司機姓名"}
              </Text>
              <Text style={styles.identityId}>· {driverId || "未指派"}</Text>
            </View>
            <Text style={styles.identityMeta}>
              {identitySummary || "尚未填寫聯絡資料"}
            </Text>
            <Text style={styles.identityMeta}>
              緊急聯絡人：{emergencySummary}
            </Text>
          </View>
          <Pill theme={THEME} tone={saveDescriptor.tone}>
            {saveDescriptor.label}
          </Pill>
        </View>
        <View style={styles.heroMetaRow}>
          <Pill theme={THEME} tone="info" dot>
            Refresh tier {SETTINGS_REFRESH_TIER}
          </Pill>
          <Pill theme={THEME} tone="neutral">
            {formatRefreshTime(lastSyncedAt)}
          </Pill>
          <Pill theme={THEME} tone="accent">
            可接單平台 {readyPlatformCount}
          </Pill>
        </View>
      </Card>

      <View style={styles.kpiRow}>
        <KPI
          theme={THEME}
          label="可接單平台"
          value={String(readyPlatformCount)}
          sub="綁定且健康"
          hint={refreshLabel}
        />
        <KPI
          theme={THEME}
          label="需處理"
          value={String(attentionPlatformCount)}
          sub="reauth / 資格 / adapter"
          hint="availableActions 驅動"
        />
        <KPI
          theme={THEME}
          label="可自助綁定"
          value={String(selfBindableCount)}
          sub="bind action enabled"
          hint="依 runtime action"
        />
      </View>

      {hasInlineStatus ? (
        <Card
          theme={THEME}
          title="同步與操作狀態"
          subtitle="手動頁面；重新聚焦時會 refresh on focus"
          padding={14}
        >
          <View style={styles.statusStack}>
            {loadError ? (
              <Banner
                theme={THEME}
                tone="warn"
                icon={
                  <Ionicons
                    name="warning-outline"
                    size={18}
                    color={THEME.warn}
                  />
                }
                title="部分資料暫時不可用"
                body={loadError}
              />
            ) : null}
            {saveError ? (
              <Banner
                theme={THEME}
                tone="danger"
                icon={
                  <Ionicons
                    name="alert-circle-outline"
                    size={18}
                    color={THEME.danger}
                  />
                }
                title="儲存未完成"
                body={saveError}
              />
            ) : null}
            {actionReceipt ? (
              <Banner
                theme={THEME}
                tone={actionReceipt.status === "failed" ? "danger" : "info"}
                icon={
                  <Ionicons
                    name={
                      actionReceipt.status === "completed"
                        ? "checkmark-circle-outline"
                        : "receipt-outline"
                    }
                    size={18}
                    color={
                      actionReceipt.status === "completed"
                        ? THEME.info
                        : THEME.text
                    }
                  />
                }
                title="平台操作回條"
                body={`${actionReceipt.message} · auditId ${actionReceipt.auditId}`}
                actions={
                  <Btn
                    theme={THEME}
                    variant="ghost"
                    size="sm"
                    onPress={() => setActionReceipt(null)}
                  >
                    關閉
                  </Btn>
                }
              />
            ) : null}
            {handoffNotice ? (
              <Banner
                theme={THEME}
                tone="info"
                icon={
                  <Ionicons name="open-outline" size={18} color={THEME.info} />
                }
                title="已啟動平台授權流程"
                body={handoffNotice}
                actions={
                  <Btn
                    theme={THEME}
                    variant="ghost"
                    size="sm"
                    onPress={() => setHandoffNotice(null)}
                  >
                    關閉
                  </Btn>
                }
              />
            ) : null}
            {hasValidation ? (
              <Banner
                theme={THEME}
                tone="warn"
                icon={
                  <Ionicons
                    name="create-outline"
                    size={18}
                    color={THEME.warn}
                  />
                }
                title="請先修正欄位"
                body="所有必填欄位有效後，底部儲存列才會開放送出。"
              />
            ) : null}
          </View>
        </Card>
      ) : null}

      <Card
        theme={THEME}
        title="司機身份"
        subtitle="更新司機姓名、電話與電子郵件"
        padding={16}
      >
        <InfoField
          label="姓名"
          value={profileValues.profileName}
          onChangeText={(value) => updateProfile({ profileName: value })}
          placeholder="司機姓名"
          editable={profileLoaded && !saving}
          error={profileErrors.profileName}
        />
        <InfoField
          label="電話"
          value={profileValues.profilePhone}
          onChangeText={(value) => updateProfile({ profilePhone: value })}
          placeholder="+886-900-000-000"
          keyboardType="phone-pad"
          editable={profileLoaded && !saving}
          error={profileErrors.profilePhone}
        />
        <InfoField
          label="電子郵件"
          value={profileValues.profileEmail}
          onChangeText={(value) => updateProfile({ profileEmail: value })}
          placeholder="driver@example.com"
          keyboardType="email-address"
          autoCapitalize="none"
          editable={profileLoaded && !saving}
          error={profileErrors.profileEmail}
        />
      </Card>

      <Card
        theme={THEME}
        title="緊急聯絡人"
        subtitle="任一欄位填寫後，姓名與電話為必填"
        padding={16}
      >
        <InfoField
          label="聯絡人姓名"
          value={profileValues.emergencyName}
          onChangeText={(value) => updateProfile({ emergencyName: value })}
          placeholder="聯絡人姓名"
          editable={profileLoaded && !saving}
          error={profileErrors.emergencyName}
        />
        <InfoField
          label="聯絡人電話"
          value={profileValues.emergencyPhone}
          onChangeText={(value) => updateProfile({ emergencyPhone: value })}
          placeholder="+886-900-000-000"
          keyboardType="phone-pad"
          editable={profileLoaded && !saving}
          error={profileErrors.emergencyPhone}
        />
        <InfoField
          label="關係"
          value={profileValues.emergencyRelationship}
          onChangeText={(value) =>
            updateProfile({ emergencyRelationship: value })
          }
          placeholder="例如：配偶、父母"
          editable={profileLoaded && !saving}
        />
      </Card>

      <Card
        theme={THEME}
        title="偏好"
        subtitle="語言、通知、接單距離與平台別 auto-accept"
        padding={16}
      >
        <View style={styles.preferenceRow}>
          <View style={styles.preferenceCopy}>
            <Text style={styles.preferenceLabel}>語言</Text>
            <Text style={styles.preferenceHint}>
              zh-TW 為主要語系，支援 English
            </Text>
          </View>
          <View style={styles.segmentWrap}>
            {["zh-TW", "en"].map((language) => (
              <Pressable
                key={language}
                onPress={() => updateSettings({ language })}
                style={[
                  styles.segmentButton,
                  settingsValues.language === language
                    ? styles.segmentButtonSelected
                    : null,
                ]}
              >
                <Text
                  style={[
                    styles.segmentLabel,
                    settingsValues.language === language
                      ? styles.segmentLabelSelected
                      : null,
                  ]}
                >
                  {language === "zh-TW" ? "繁中" : "EN"}
                </Text>
              </Pressable>
            ))}
          </View>
        </View>

        <InfoField
          label="最大接單距離"
          value={settingsValues.maxAcceptRadius}
          onChangeText={(value) => updateSettings({ maxAcceptRadius: value })}
          placeholder="公里數"
          keyboardType="numeric"
          editable={settingsLoaded && !saving}
          error={settingsErrors.maxAcceptRadius}
        />

        <View style={styles.preferenceRow}>
          <View style={styles.preferenceCopy}>
            <Text style={styles.preferenceLabel}>通知</Text>
            <Text style={styles.preferenceHint}>
              依系統 push 權限與事件類型同步
            </Text>
          </View>
          <Switch
            value={settingsValues.notificationsEnabled}
            onValueChange={(value) =>
              updateSettings({ notificationsEnabled: value })
            }
            disabled={!settingsLoaded || saving}
            trackColor={{ false: THEME.borderStrong, true: THEME.accentHi }}
            thumbColor={
              settingsValues.notificationsEnabled ? THEME.accent : "#fff"
            }
          />
        </View>

        <View style={styles.preferenceRow}>
          <View style={styles.preferenceCopy}>
            <Text style={styles.preferenceLabel}>平台別自動接單</Text>
            <Text style={styles.preferenceHint}>
              Phase 1 不提供全域 auto-accept；只有 `autoAcceptAllowed=true`
              的平台顯示控制位
            </Text>
          </View>
        </View>
        <View style={styles.autoAcceptList}>
          {autoAcceptPlatforms.length > 0 ? (
            autoAcceptPlatforms.map((row) => (
              <View
                key={`auto-accept-${row.platformCode}`}
                style={styles.autoAcceptRow}
              >
                <View style={styles.autoAcceptCopy}>
                  <Text style={styles.autoAcceptTitle}>{row.displayName}</Text>
                  <Text style={styles.autoAcceptHint}>
                    {row.isBound
                      ? "此平台允許自動接單，但目前 contract 僅提供 capability，尚未提供每平台開關寫入。"
                      : "平台支援 auto-accept；需先完成綁定後才會啟用此設定。"}
                  </Text>
                </View>
                <View style={styles.autoAcceptControl}>
                  <Switch
                    value={false}
                    disabled
                    trackColor={{
                      false: THEME.borderStrong,
                      true: THEME.accentHi,
                    }}
                    thumbColor="#fff"
                  />
                  <Pill theme={THEME} tone={row.isBound ? "info" : "neutral"}>
                    {row.isBound ? "read only" : "bind first"}
                  </Pill>
                </View>
              </View>
            ))
          ) : (
            <Text style={styles.preferenceHint}>
              目前 runtime 未標示任何 `autoAcceptAllowed=true` 的平台。
            </Text>
          )}
        </View>
      </Card>

      <Card
        theme={THEME}
        title="平台帳號綁定"
        subtitle="與平台頁對齊的 binding / reauth / unbind 狀態"
        actions={
          <Btn
            theme={THEME}
            variant="ghost"
            size="sm"
            onPress={() => router.push("/platform-presence")}
          >
            平台頁
          </Btn>
        }
        padding={16}
      >
        {pendingBindingAction ? (
          <View style={styles.bindingDraftCard}>
            <View style={styles.bindingDraftHeader}>
              <View style={styles.bindingDraftCopy}>
                <Text style={styles.bindingDraftTitle}>
                  {pendingActionRow
                    ? getActionDialogTitle(
                        pendingActionRow,
                        pendingBindingAction.action,
                      )
                    : "確認平台操作"}
                </Text>
                <Text style={styles.bindingDraftBody}>
                  {pendingActionRow
                    ? getActionDialogBody(
                        pendingActionRow,
                        pendingBindingAction.action,
                      )
                    : "請確認此動作。"}
                </Text>
              </View>
              <Pill
                theme={THEME}
                tone={
                  pendingBindingAction.action.riskLevel === "high"
                    ? "danger"
                    : pendingBindingAction.action.riskLevel === "medium"
                      ? "warn"
                      : "info"
                }
              >
                {getRiskLabel(pendingBindingAction.action.riskLevel)}
              </Pill>
            </View>

            {pendingBindingAction.action.requiresReason ? (
              <InfoField
                label="原因"
                value={pendingBindingAction.reason}
                onChangeText={(value) =>
                  setPendingBindingAction((prev) =>
                    prev ? { ...prev, reason: value } : prev,
                  )
                }
                placeholder="請填寫此次操作原因"
                editable={busyPlatform !== pendingBindingAction.platformCode}
              />
            ) : null}

            {pendingActionRow?.authMechanism === "manual_credential" &&
            (pendingBindingAction.action.key === "bind" ||
              pendingBindingAction.action.key === "reauth") ? (
              <View style={styles.bindingDraftFields}>
                <InfoField
                  label="平台帳號識別"
                  value={pendingBindingAction.manualAccountId}
                  onChangeText={(value) =>
                    setPendingBindingAction((prev) =>
                      prev ? { ...prev, manualAccountId: value } : prev,
                    )
                  }
                  placeholder="輸入平台帳號、手機或 driver id"
                  editable={busyPlatform !== pendingBindingAction.platformCode}
                />
                <InfoField
                  label="憑證到期時間（選填）"
                  value={pendingBindingAction.manualTokenExpiresAt}
                  onChangeText={(value) =>
                    setPendingBindingAction((prev) =>
                      prev ? { ...prev, manualTokenExpiresAt: value } : prev,
                    )
                  }
                  placeholder="例如 2026-05-31T08:30:00Z"
                  autoCapitalize="none"
                  editable={busyPlatform !== pendingBindingAction.platformCode}
                />
              </View>
            ) : null}

            <View style={styles.bindingDraftActions}>
              <Btn
                theme={THEME}
                variant="ghost"
                size="sm"
                onPress={() => setPendingBindingAction(null)}
                disabled={busyPlatform === pendingBindingAction.platformCode}
              >
                取消
              </Btn>
              <Btn
                theme={THEME}
                variant="primary"
                size="sm"
                danger={pendingBindingAction.action.riskLevel === "high"}
                onPress={() => void submitPendingBindingAction()}
                disabled={
                  busyPlatform === pendingBindingAction.platformCode ||
                  (pendingBindingAction.action.requiresReason &&
                    !pendingBindingAction.reason.trim()) ||
                  (pendingActionRow?.authMechanism === "manual_credential" &&
                    (pendingBindingAction.action.key === "bind" ||
                      pendingBindingAction.action.key === "reauth") &&
                    !pendingBindingAction.manualAccountId.trim())
                }
              >
                {busyPlatform === pendingBindingAction.platformCode
                  ? "送出中…"
                  : "確認執行"}
              </Btn>
            </View>
          </View>
        ) : null}

        <View style={styles.filterRow}>
          <FilterChip
            selected={bindingFilter === "all"}
            label="全部"
            onPress={() => setBindingFilter("all")}
          />
          <FilterChip
            selected={bindingFilter === "attention"}
            label="需處理"
            onPress={() => setBindingFilter("attention")}
          />
          <FilterChip
            selected={bindingFilter === "available"}
            label="可綁定"
            onPress={() => setBindingFilter("available")}
          />
        </View>

        {bindingEmptyReason ? (
          <BindingEmptyState
            reason={bindingEmptyReason}
            onRetry={() => void handleRefresh()}
            onOpenPresence={() => router.push("/platform-presence")}
            onClearFilter={() => setBindingFilter("all")}
          />
        ) : (
          <View style={styles.bindingList}>
            {visiblePlatformRows.map((row) => {
              const isBusy = busyPlatform === row.platformCode;
              return (
                <View key={row.platformCode} style={styles.bindingCard}>
                  <View style={styles.bindingTop}>
                    <View style={styles.bindingBadge}>
                      <Text style={styles.bindingBadgeText}>
                        {row.platformCode.slice(0, 3).toUpperCase()}
                      </Text>
                    </View>
                    <View style={styles.bindingMain}>
                      <View style={styles.bindingTitleRow}>
                        <Text style={styles.bindingTitle}>
                          {row.displayName}
                        </Text>
                        <Pill theme={THEME} tone={row.statusTone}>
                          {row.statusLabel}
                        </Pill>
                      </View>
                      <Text style={styles.bindingMeta}>
                        帳號 {row.accountDisplay} · {row.statusDetail}
                      </Text>
                      <View style={styles.bindingMechanismRow}>
                        <Ionicons
                          name={getMechanismIcon(row.authMechanism)}
                          size={13}
                          color={THEME.textMuted}
                        />
                        <Text style={styles.bindingMechanismText}>
                          {getMechanismLabel(row.authMechanism)}
                        </Text>
                        <Text style={styles.bindingDivider}>·</Text>
                        <Text style={styles.bindingMechanismText}>
                          {row.driverSelfServiceBinding == null
                            ? "綁定權限等待 runtime capability"
                            : row.driverSelfServiceBinding
                              ? "可自助綁定"
                              : "需由派車台處理"}
                        </Text>
                      </View>
                      <Text style={styles.bindingHint}>{row.hint}</Text>
                      {row.assessment?.blockers.length ? (
                        <View style={styles.bindingPillRow}>
                          {row.assessment.blockers.map((blocker) => (
                            <Pill
                              key={`${row.platformCode}-${blocker}`}
                              theme={THEME}
                              tone="warn"
                            >
                              {blocker}
                            </Pill>
                          ))}
                        </View>
                      ) : null}
                    </View>
                  </View>

                  {row.availableActions.length > 0 ? (
                    <View style={styles.bindingActionsRow}>
                      {row.availableActions.map((action) => (
                        <BindingActionButton
                          key={`${row.platformCode}-${action.key}`}
                          action={action}
                          busy={isBusy}
                          onPress={() => void handlePlatformAction(row, action)}
                        />
                      ))}
                    </View>
                  ) : (
                    <Text style={styles.bindingNoActions}>
                      runtime 未提供可執行動作；此卡片只顯示狀態，不自行推導
                      CTA。
                    </Text>
                  )}
                </View>
              );
            })}
          </View>
        )}
      </Card>

      <Card theme={THEME} title="其他" subtitle="裝置與帳號管理" padding={0}>
        <RowButton
          label="緊急聯絡人"
          value={emergencySummary}
          hint="更新緊急聯絡資訊"
        />
        <RowButton
          label="同步模式"
          value={refreshLabel}
          hint="進入頁面與回到前景時更新；也可手動重新整理"
        />
        <RowButton
          label="平台狀態中心"
          value="in-app link"
          hint="前往 /platform-presence 查看各平台接單狀態"
          onPress={() => router.push("/platform-presence")}
        />
        <RowButton
          label="授權方式"
          value="browser / app / manual / ops"
          hint="依平台機制啟動外部瀏覽器、原生 App、手動憑證或派車台協助"
        />
        <RowButton
          label="登出"
          hint="清除此裝置綁定並返回 onboarding"
          tone="danger"
          onPress={handleLogout}
        />
      </Card>
    </Shell>
  );
}

const styles = StyleSheet.create({
  shellContent: {
    gap: 14,
    paddingBottom: 14,
  },
  loadingShellContent: {
    flexGrow: 1,
    justifyContent: "center",
    gap: 16,
  },
  loadingWrap: {
    alignItems: "center",
    gap: 12,
  },
  loadingLabel: {
    color: THEME.textMuted,
    fontFamily: THEME.fontFamily,
    fontSize: 13,
  },
  identityHero: {
    flexDirection: "row",
    alignItems: "center",
    gap: 12,
  },
  heroMetaRow: {
    flexDirection: "row",
    flexWrap: "wrap",
    gap: 8,
    marginTop: 14,
  },
  avatarBubble: {
    width: 50,
    height: 50,
    borderRadius: 25,
    backgroundColor: THEME.accentBg,
    alignItems: "center",
    justifyContent: "center",
  },
  avatarText: {
    color: THEME.accentHi,
    fontFamily: THEME.fontFamily,
    fontSize: 18,
    fontWeight: "700",
  },
  identityCopy: {
    flex: 1,
    gap: 3,
  },
  identityTitleRow: {
    flexDirection: "row",
    alignItems: "baseline",
    gap: 6,
  },
  identityName: {
    color: THEME.text,
    fontFamily: THEME.fontFamily,
    fontSize: 16,
    fontWeight: "700",
  },
  identityId: {
    color: THEME.textMuted,
    fontFamily: THEME.monoFamily,
    fontSize: 11,
  },
  identityMeta: {
    color: THEME.textMuted,
    fontFamily: THEME.monoFamily,
    fontSize: 11,
  },
  kpiRow: {
    flexDirection: "row",
    gap: 10,
    flexWrap: "wrap",
  },
  fieldBlock: {
    gap: 6,
    marginBottom: 12,
  },
  fieldLabel: {
    color: THEME.textMuted,
    fontFamily: THEME.fontFamily,
    fontSize: 12,
  },
  fieldInput: {
    minHeight: 42,
    borderRadius: 10,
    borderWidth: 1,
    borderColor: THEME.border,
    backgroundColor: THEME.surfaceLo,
    color: THEME.text,
    paddingHorizontal: 12,
    paddingVertical: 10,
    fontFamily: THEME.fontFamily,
    fontSize: 14,
  },
  fieldInputDisabled: {
    opacity: 0.6,
  },
  fieldInputError: {
    borderColor: THEME.danger,
  },
  fieldError: {
    color: THEME.danger,
    fontFamily: THEME.fontFamily,
    fontSize: 11,
  },
  preferenceRow: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "space-between",
    gap: 12,
    paddingBottom: 12,
  },
  preferenceCopy: {
    flex: 1,
    gap: 3,
  },
  preferenceLabel: {
    color: THEME.text,
    fontFamily: THEME.fontFamily,
    fontSize: 14,
    fontWeight: "600",
  },
  preferenceHint: {
    color: THEME.textMuted,
    fontFamily: THEME.fontFamily,
    fontSize: 11,
  },
  autoAcceptList: {
    gap: 8,
  },
  autoAcceptRow: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "space-between",
    gap: 10,
    paddingTop: 2,
  },
  autoAcceptControl: {
    alignItems: "flex-end",
    gap: 8,
  },
  autoAcceptCopy: {
    flex: 1,
    gap: 2,
  },
  autoAcceptTitle: {
    color: THEME.text,
    fontFamily: THEME.fontFamily,
    fontSize: 13,
    fontWeight: "600",
  },
  autoAcceptHint: {
    color: THEME.textDim,
    fontFamily: THEME.fontFamily,
    fontSize: 11,
  },
  segmentWrap: {
    flexDirection: "row",
    gap: 8,
  },
  segmentButton: {
    minWidth: 54,
    borderRadius: 10,
    borderWidth: 1,
    borderColor: THEME.border,
    backgroundColor: THEME.surfaceLo,
    paddingHorizontal: 12,
    paddingVertical: 9,
    alignItems: "center",
  },
  segmentButtonSelected: {
    borderColor: THEME.accent,
    backgroundColor: THEME.accentBg,
  },
  segmentLabel: {
    color: THEME.textMuted,
    fontFamily: THEME.fontFamily,
    fontSize: 12,
    fontWeight: "600",
  },
  segmentLabelSelected: {
    color: THEME.accentHi,
  },
  filterRow: {
    flexDirection: "row",
    gap: 8,
    marginBottom: 12,
    flexWrap: "wrap",
  },
  statusStack: {
    gap: 10,
  },
  filterChip: {
    borderRadius: 999,
    borderWidth: 1,
    paddingHorizontal: 12,
    paddingVertical: 7,
  },
  filterChipIdle: {
    borderColor: THEME.border,
    backgroundColor: THEME.surfaceLo,
  },
  filterChipSelected: {
    borderColor: THEME.accent,
    backgroundColor: THEME.accentBg,
  },
  filterChipLabel: {
    color: THEME.textMuted,
    fontFamily: THEME.fontFamily,
    fontSize: 12,
    fontWeight: "600",
  },
  filterChipLabelSelected: {
    color: THEME.accentHi,
  },
  bindingList: {
    gap: 10,
  },
  bindingCard: {
    borderRadius: 14,
    borderWidth: 1,
    borderColor: THEME.border,
    backgroundColor: THEME.surfaceLo,
    padding: 12,
    gap: 10,
  },
  bindingTop: {
    flexDirection: "row",
    gap: 12,
  },
  bindingBadge: {
    width: 38,
    height: 38,
    borderRadius: 11,
    backgroundColor: THEME.accentBg,
    alignItems: "center",
    justifyContent: "center",
  },
  bindingBadgeText: {
    color: THEME.accentHi,
    fontFamily: THEME.monoFamily,
    fontSize: 11,
    fontWeight: "700",
  },
  bindingMain: {
    flex: 1,
    gap: 4,
  },
  bindingTitleRow: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "space-between",
    gap: 8,
  },
  bindingTitle: {
    color: THEME.text,
    fontFamily: THEME.fontFamily,
    fontSize: 14,
    fontWeight: "700",
  },
  bindingMeta: {
    color: THEME.textMuted,
    fontFamily: THEME.monoFamily,
    fontSize: 11,
  },
  bindingMechanismRow: {
    flexDirection: "row",
    alignItems: "center",
    gap: 6,
    flexWrap: "wrap",
  },
  bindingMechanismText: {
    color: THEME.textMuted,
    fontFamily: THEME.fontFamily,
    fontSize: 11,
  },
  bindingDivider: {
    color: THEME.textDim,
    fontFamily: THEME.fontFamily,
    fontSize: 10,
  },
  bindingHint: {
    color: THEME.textDim,
    fontFamily: THEME.fontFamily,
    fontSize: 11,
  },
  bindingPillRow: {
    flexDirection: "row",
    gap: 6,
    flexWrap: "wrap",
    marginTop: 2,
  },
  bindingActionsRow: {
    flexDirection: "row",
    flexWrap: "wrap",
    gap: 8,
  },
  bindingNoActions: {
    color: THEME.textDim,
    fontFamily: THEME.fontFamily,
    fontSize: 11,
  },
  bindingActionWrap: {
    gap: 4,
  },
  bindingDisabledReason: {
    color: THEME.textDim,
    fontFamily: THEME.fontFamily,
    fontSize: 10,
  },
  bindingDraftCard: {
    borderRadius: 12,
    borderWidth: 1,
    borderColor: THEME.accentBorder,
    backgroundColor: THEME.accentBg,
    padding: 12,
    gap: 10,
    marginBottom: 12,
  },
  bindingDraftHeader: {
    flexDirection: "row",
    alignItems: "flex-start",
    justifyContent: "space-between",
    gap: 10,
  },
  bindingDraftCopy: {
    flex: 1,
    gap: 4,
  },
  bindingDraftTitle: {
    color: THEME.text,
    fontFamily: THEME.fontFamily,
    fontSize: 13,
    fontWeight: "700",
  },
  bindingDraftBody: {
    color: THEME.textMuted,
    fontFamily: THEME.fontFamily,
    fontSize: 11,
    lineHeight: 17,
  },
  bindingDraftFields: {
    gap: 2,
  },
  bindingDraftActions: {
    flexDirection: "row",
    justifyContent: "flex-end",
    gap: 8,
  },
  rowButton: {
    minHeight: 54,
    paddingHorizontal: 14,
    paddingVertical: 12,
    borderBottomWidth: 1,
    borderBottomColor: THEME.border,
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "space-between",
    gap: 12,
  },
  rowButtonPressed: {
    opacity: 0.8,
  },
  rowButtonCopy: {
    flex: 1,
    gap: 3,
  },
  rowButtonLabel: {
    color: THEME.text,
    fontFamily: THEME.fontFamily,
    fontSize: 14,
    fontWeight: "600",
  },
  rowButtonLabelDanger: {
    color: THEME.danger,
  },
  rowButtonHint: {
    color: THEME.textMuted,
    fontFamily: THEME.fontFamily,
    fontSize: 11,
  },
  rowButtonValueWrap: {
    flexDirection: "row",
    alignItems: "center",
    gap: 6,
  },
  rowButtonValue: {
    color: THEME.textDim,
    fontFamily: THEME.monoFamily,
    fontSize: 11,
  },
  footerBar: {
    flexDirection: "row",
    alignItems: "center",
    gap: 12,
    paddingHorizontal: 16,
    paddingTop: 12,
    paddingBottom: 16,
    borderTopWidth: 1,
    borderTopColor: THEME.border,
    backgroundColor: THEME.bg,
  },
  footerBarCopy: {
    flex: 1,
    gap: 3,
  },
  footerBarTitle: {
    color: THEME.text,
    fontFamily: THEME.fontFamily,
    fontSize: 13,
    fontWeight: "700",
  },
  footerBarNote: {
    color: THEME.textMuted,
    fontFamily: THEME.fontFamily,
    fontSize: 11,
  },
  footerBarButton: {
    minWidth: 122,
  },
});
