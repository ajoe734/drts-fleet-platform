import { useEffect, useMemo, useRef, useState } from "react";
import { Ionicons } from "@expo/vector-icons";
import { useRouter } from "expo-router";
import { useIsFocused } from "@react-navigation/native";
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
  CrossAppResourceLink,
  DriverProfileRecord,
  DriverSettings,
  EmptyReason,
  PlatformCode,
  PlatformPresenceAdapterStatusRecord,
  PlatformPresenceRecord,
  PlatformPresenceSummary,
  RefreshTier,
  ResourceActionDescriptor,
} from "@drts/contracts";
import { PLATFORM_CODES, PLATFORM_CODE_REGISTRY } from "@drts/contracts";
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

type PlatformAuthMechanism =
  | "external_browser_oauth"
  | "native_app_deeplink"
  | "manual_credential"
  | "ops_managed";

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

type PlatformBindingRow = {
  platformCode: PlatformCode;
  displayName: string;
  record: RuntimePlatformPresenceRecord | null;
  adapterStatus: PlatformPresenceAdapterStatusRecord | null;
  assessment: PlatformHealthAssessment | null;
  authMechanism: PlatformAuthMechanism;
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
  isEligible: boolean;
};

type RuntimePlatformPresenceRecord = PlatformPresenceRecord & {
  availableActions?: ResourceActionDescriptor[];
  authMechanism?: PlatformAuthMechanism;
  driverSelfServiceBinding?: boolean;
  autoAcceptAllowed?: boolean;
};

type RuntimePlatformPresenceSummary = PlatformPresenceSummary & {
  crossAppLinks?: CrossAppResourceLink[];
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

function maskAccountId(value: string | null): string {
  if (!value) {
    return "尚未綁定";
  }
  if (value.length <= 4) {
    return value;
  }
  return `${value.slice(0, 2)}•••${value.slice(-2)}`;
}

function describeSaveState(state: SaveState) {
  switch (state) {
    case "saving":
      return { label: "儲存中", tone: "info" as const, subtitle: "正在提交變更" };
    case "dirty":
      return { label: "尚有未儲存變更", tone: "warn" as const, subtitle: "請確認後送出" };
    case "saved":
      return { label: "已儲存", tone: "success" as const, subtitle: "設定已同步" };
    case "error":
      return { label: "儲存失敗", tone: "danger" as const, subtitle: "請稍後重試" };
    default:
      return { label: "未變更", tone: "neutral" as const, subtitle: "目前為最新設定" };
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

function getAuthMechanism(platformCode: PlatformCode): PlatformAuthMechanism {
  switch (platformCode) {
    case "uber":
      return "external_browser_oauth";
    case "grab":
      return "native_app_deeplink";
    case "line-taxi":
      return "manual_credential";
    case "indriver":
      return "ops_managed";
    case "grab_taiwan":
      return "external_browser_oauth";
    case "forwarder_sandbox":
    default:
      return "manual_credential";
  }
}

function getMechanismLabel(mechanism: PlatformAuthMechanism): string {
  switch (mechanism) {
    case "external_browser_oauth":
      return "OAuth · 外部瀏覽器";
    case "native_app_deeplink":
      return "Native App 跳轉";
    case "manual_credential":
      return "手動帳密";
    case "ops_managed":
    default:
      return "聯絡派車台";
  }
}

function getMechanismIcon(
  mechanism: PlatformAuthMechanism,
): keyof typeof Ionicons.glyphMap {
  switch (mechanism) {
    case "external_browser_oauth":
      return "open-outline";
    case "native_app_deeplink":
      return "link-outline";
    case "manual_credential":
      return "key-outline";
    case "ops_managed":
    default:
      return "call-outline";
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
    default:
      return "目前不可執行";
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

function getBooleanFlag(
  value: boolean | null | undefined,
): boolean | null {
  if (typeof value === "boolean") {
    return value;
  }
  return null;
}

function getPresenceStatusCopy(
  record: PlatformPresenceRecord | null,
  assessment: PlatformHealthAssessment | null,
) {
  if (!record) {
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
  summary: RuntimePlatformPresenceSummary | null,
): PlatformBindingRow[] {
  const adapterMap = new Map<PlatformCode, PlatformPresenceAdapterStatusRecord>();
  const presenceMap = new Map<PlatformCode, RuntimePlatformPresenceRecord>();

  summary?.adapterStatuses?.forEach((status) => {
    adapterMap.set(status.platformCode, status);
  });
  summary?.presences.forEach((record) => {
    presenceMap.set(record.platformCode, record);
  });

  return PLATFORM_CODES.map((platformCode) => {
    const record = presenceMap.get(platformCode) ?? null;
    const adapterStatus = adapterMap.get(platformCode) ?? null;
    const assessment = record
      ? assessPlatformHealth(record, adapterStatus)
      : null;
    const availableActions = getBindingActions(record?.availableActions);
    const authMechanism = record?.authMechanism ?? getAuthMechanism(platformCode);
    const driverSelfServiceBinding = getBooleanFlag(
      record?.driverSelfServiceBinding,
    );
    const autoAcceptAllowed = getBooleanFlag(record?.autoAcceptAllowed);
    const statusCopy = getPresenceStatusCopy(record, assessment);
    return {
      platformCode,
      displayName: PLATFORM_CODE_REGISTRY[platformCode].displayName,
      record,
      adapterStatus,
      assessment,
      authMechanism,
      driverSelfServiceBinding,
      autoAcceptAllowed,
      accountDisplay: maskAccountId(record?.accountId ?? null),
      statusLabel: statusCopy.label,
      statusTone: statusCopy.tone,
      statusDetail: statusCopy.detail,
      hint:
        authMechanism === "ops_managed"
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
      isBound: Boolean(record?.accountId),
      isEligible: record?.eligibility !== "ineligible",
      availableActions,
    };
  }).sort((left, right) => {
    const attentionDelta =
      Number(right.requiresAttention) - Number(left.requiresAttention);
    if (attentionDelta !== 0) {
      return attentionDelta;
    }
    return left.displayName.localeCompare(right.displayName, "zh-TW");
  });
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
  if (rows.length === 0) {
    return "no_data";
  }
  if (rows.every((row) => !row.isBound)) {
    return "not_provisioned";
  }
  if (rows.every((row) => row.record && !row.isEligible)) {
    return "driver_not_eligible";
  }
  if (
    rows.every(
      (row) =>
        row.adapterStatus &&
        (row.adapterStatus.status === "degraded" ||
          row.adapterStatus.status === "down"),
    )
  ) {
    return "external_unavailable";
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
      <Text style={[styles.filterChipLabel, selected && styles.filterChipLabelSelected]}>
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
        <Btn theme={THEME} variant="secondary" size="sm" onPress={config.action}>
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
    action.key === "unbind"
      ? "ghost"
      : action.key === "reauth" || action.key === "contact_ops"
        ? "secondary"
        : "primary";

  return (
    <View style={styles.bindingActionWrap}>
      <Btn
        theme={THEME}
        variant={variant}
        size="sm"
        onPress={onPress}
        disabled={!action.enabled || busy}
      >
        {busy ? "處理中…" : action.label}
      </Btn>
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
  const [lastResult, setLastResult] = useState<"success" | "error" | null>(null);

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
    useState<RuntimePlatformPresenceSummary | null>(null);
  const [bindingFilter, setBindingFilter] = useState<BindingFilter>("all");
  const [busyPlatform, setBusyPlatform] = useState<PlatformCode | null>(null);
  const [unbindPlatform, setUnbindPlatform] = useState<PlatformCode | null>(null);
  const [unbindReason, setUnbindReason] = useState("");
  const [lastSyncedAt, setLastSyncedAt] = useState<string | null>(null);
  const hasFocusedOnceRef = useRef(false);

  const settingsErrors = validateSettingsValues(settingsValues);
  const profileErrors = profileLoaded ? validateProfileValues(profileValues) : {};

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
      const next = settingsValuesFromRecord(settingsResult.value as DriverSettings);
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
      setPresenceSummary(presenceResult.value as RuntimePlatformPresenceSummary);
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

    void loadAll()
      .finally(() => {
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

  const readyPlatformCount = platformRows.filter(
    (row) => row.record?.status === "online" && row.assessment?.canReceiveOrders,
  ).length;
  const attentionPlatformCount = platformRows.filter(
    (row) => row.requiresAttention,
  ).length;
  const selfBindableCount = platformRows.filter(
    (row) =>
      row.availableActions.some(
        (action) =>
          action.action === "bind_platform_account" && action.enabled,
      ),
  ).length;
  const autoAcceptPlatforms = platformRows.filter(
    (row) => row.autoAcceptAllowed === true,
  );
  const crossAppLinks = presenceSummary?.crossAppLinks ?? [];
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

  const updateSettings = (patch: Partial<SettingsFormValues>) => {
    setSettingsValues((prev) => ({ ...prev, ...patch }));
    setLastResult(null);
    setSaveError(null);
  };

  const updateProfile = (patch: Partial<ProfileFormValues>) => {
    setProfileValues((prev) => ({ ...prev, ...patch }));
    setLastResult(null);
    setSaveError(null);
  };

  const handleRefresh = async () => {
    if (dirty || saving) {
      Alert.alert("請先處理未儲存變更", "設定頁為手動刷新模式，未儲存變更時不會覆蓋表單內容。");
      return;
    }

    setRefreshing(true);
    await loadAll({ silent: false, allowFormReset: true });
    setRefreshing(false);
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
      Alert.alert(saved.length === 0 ? "儲存失敗" : "部分儲存成功", failureMessage);
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

    if (action.key === "contact_ops") {
      Alert.alert(
        "聯絡派車台",
        `${row.displayName} 使用 ops-managed 重新授權機制，請通知派車台或平台管理員協助處理。`,
      );
      return;
    }

    const client = getDriverClient();
    setBusyPlatform(row.platformCode);
    try {
      if (action.key === "bind") {
        await client.setPlatformOnline({
          platformCode: row.platformCode,
          tokenExpiresAt: null,
        });
        Alert.alert(
          "已送出綁定",
          `請依 ${getMechanismLabel(row.authMechanism)} 完成 ${row.displayName} 綁定流程。`,
        );
      } else if (action.key === "reauth") {
        await client.setPlatformOnline({
          platformCode: row.platformCode,
          tokenExpiresAt: null,
        });
        Alert.alert(
          "已送出重新授權",
          `${row.displayName} 已重啟驗證流程，請完成 ${getMechanismLabel(row.authMechanism)}。`,
        );
      } else if (action.key === "unbind") {
        setUnbindPlatform(row.platformCode);
        setBusyPlatform(null);
        return;
      }

      await loadAll({ silent: true, allowFormReset: false });
    } catch (error) {
      Alert.alert(`${action.label}失敗`, toErrorMessage(error));
    } finally {
      setBusyPlatform(null);
    }
  };

  const confirmUnbind = async (platformCode: PlatformCode) => {
    if (!unbindReason.trim()) {
      return;
    }

    setBusyPlatform(platformCode);
    try {
      const client = getDriverClient();
      await client.setPlatformOffline({ platformCode });
      setUnbindPlatform(null);
      setUnbindReason("");
      await loadAll({ silent: true, allowFormReset: false });
      Alert.alert("已解除綁定", "平台帳號已改為離線並解除綁定。");
    } catch (error) {
      Alert.alert("解除綁定失敗", toErrorMessage(error));
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
        <PageHeader
          theme={THEME}
          title="設定"
          subtitle="裝置尚未完成配置"
        />
        <Banner
          theme={THEME}
          tone="warn"
          icon={<Ionicons name="lock-closed-outline" size={18} color={THEME.warn} />}
          title="尚未完成裝置配置"
          body="此裝置尚未分配司機身份，無法管理設定與平台綁定。"
          actions={
            <Btn theme={THEME} variant="primary" size="sm" onPress={() => router.push("/onboarding")}>
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

  return (
    <Shell theme={THEME} contentContainerStyle={styles.shellContent}>
      <PageHeader
        theme={THEME}
        title="設定"
        subtitle="個人資料、偏好與平台帳號綁定"
        actions={
          <Btn
            theme={THEME}
            variant="secondary"
            size="sm"
            onPress={() => void handleRefresh()}
            disabled={refreshing || saving}
          >
            {refreshing ? "重新整理中…" : "重新整理"}
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
            <Text style={styles.identityMeta}>{identitySummary || "尚未填寫聯絡資料"}</Text>
            <Text style={styles.identityMeta}>緊急聯絡人：{emergencySummary}</Text>
          </View>
          <Pill theme={THEME} tone={saveDescriptor.tone}>
            {saveDescriptor.label}
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
          hint={`cross-app: ${crossAppLinks.length}`}
        />
      </View>

      {loadError ? (
        <Banner
          theme={THEME}
          tone="warn"
          icon={<Ionicons name="warning-outline" size={18} color={THEME.warn} />}
          title="部分資料暫時不可用"
          body={loadError}
        />
      ) : null}
      {saveError ? (
        <Banner
          theme={THEME}
          tone="danger"
          icon={<Ionicons name="alert-circle-outline" size={18} color={THEME.danger} />}
          title="儲存未完成"
          body={saveError}
        />
      ) : null}
      {hasValidation ? (
        <Banner
          theme={THEME}
          tone="warn"
          icon={<Ionicons name="create-outline" size={18} color={THEME.warn} />}
          title="請先修正欄位"
          body="設定頁只有在所有必填欄位有效時才可儲存。"
        />
      ) : null}
      <Banner
        theme={THEME}
        tone="info"
        icon={<Ionicons name="sync-outline" size={18} color={THEME.info} />}
        title="Refresh Tier"
        body={`設定頁依 spec 使用 ${SETTINGS_REFRESH_TIER} refresh tier：進入頁面時 refresh on focus，另外提供手動重新整理。`}
      />
      <Banner
        theme={THEME}
        tone="info"
        icon={<Ionicons name="git-branch-outline" size={18} color={THEME.info} />}
        title="Deep Link 邊界"
        body={
          crossAppLinks.length === 0
            ? "Driver App Phase 1 不提供跨 App deep link。平台相關操作只會留在本 App，必要時導向平台頁或提示聯絡派車台。"
            : `runtime 提供 ${crossAppLinks.length} 個跨 App deep link；目前設定頁僅顯示數量並維持本 App 導覽。`
        }
      />

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
        subtitle="語言、通知、接單距離與自動接單"
        padding={16}
      >
        <View style={styles.preferenceRow}>
          <View style={styles.preferenceCopy}>
            <Text style={styles.preferenceLabel}>語言</Text>
            <Text style={styles.preferenceHint}>zh-TW 為主要語系，支援 English</Text>
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
            <Text style={styles.preferenceHint}>依系統 push 權限與事件類型同步</Text>
          </View>
          <Switch
            value={settingsValues.notificationsEnabled}
            onValueChange={(value) =>
              updateSettings({ notificationsEnabled: value })
            }
            disabled={!settingsLoaded || saving}
            trackColor={{ false: THEME.borderStrong, true: THEME.accentHi }}
            thumbColor={settingsValues.notificationsEnabled ? THEME.accent : "#fff"}
          />
        </View>

        <View style={styles.preferenceRow}>
          <View style={styles.preferenceCopy}>
            <Text style={styles.preferenceLabel}>自動接單 · 平台別</Text>
            <Text style={styles.preferenceHint}>
              Phase 1 不允許全域 auto-accept，只能由支援平台提供各自切換
            </Text>
          </View>
        </View>
        <View style={styles.autoAcceptList}>
          {autoAcceptPlatforms.length > 0 ? (
            autoAcceptPlatforms.map((row) => (
              <View key={`auto-accept-${row.platformCode}`} style={styles.autoAcceptRow}>
                <View style={styles.autoAcceptCopy}>
                  <Text style={styles.autoAcceptTitle}>{row.displayName}</Text>
                  <Text style={styles.autoAcceptHint}>
                    {row.record?.accountId
                      ? "平台支援 auto-accept；待 runtime preference contract 提供實際切換狀態。"
                      : "平台支援 auto-accept；需先完成綁定後才可設定。"}
                  </Text>
                </View>
                <Pill theme={THEME} tone={row.record?.accountId ? "info" : "neutral"}>
                  {row.record?.accountId ? "supported" : "bind first"}
                </Pill>
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
        subtitle="與平台頁對齊的綁定 / reauth / unbind 狀態"
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
              const isPendingUnbind = unbindPlatform === row.platformCode;
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
                        <Text style={styles.bindingTitle}>{row.displayName}</Text>
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
                            ? "driverSelfServiceBinding=runtime-missing"
                            : row.driverSelfServiceBinding
                              ? "driverSelfServiceBinding=true"
                              : "driverSelfServiceBinding=false"}
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
                          busy={isBusy && action.key !== "unbind"}
                          onPress={() => void handlePlatformAction(row, action)}
                        />
                      ))}
                    </View>
                  ) : (
                    <Text style={styles.bindingNoActions}>
                      runtime 未提供 `availableActions`，此卡片目前只顯示狀態，不自行推導 CTA。
                    </Text>
                  )}

                  {isPendingUnbind ? (
                    <View style={styles.unbindBox}>
                      <Text style={styles.unbindTitle}>解除綁定原因</Text>
                      <TextInput
                        style={styles.unbindInput}
                        value={unbindReason}
                        onChangeText={setUnbindReason}
                        placeholder="例如：暫停跑此平台 / 帳號異常"
                        placeholderTextColor={THEME.textDim}
                      />
                      <View style={styles.unbindActions}>
                        <Btn
                          theme={THEME}
                          variant="ghost"
                          size="sm"
                          onPress={() => {
                            setUnbindPlatform(null);
                            setUnbindReason("");
                          }}
                        >
                          取消
                        </Btn>
                        <Btn
                          theme={THEME}
                          variant="primary"
                          size="sm"
                          onPress={() => void confirmUnbind(row.platformCode)}
                          disabled={!unbindReason.trim() || busyPlatform === row.platformCode}
                        >
                          {busyPlatform === row.platformCode ? "送出中…" : "確認解除"}
                        </Btn>
                      </View>
                    </View>
                  ) : null}
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
          label="關於本機"
          value={driverId || "未指派"}
          hint={`refresh tier ${SETTINGS_REFRESH_TIER}`}
        />
        <RowButton
          label="查看平台狀態"
          value="本 App 內部 deep link"
          hint="前往 /platform-presence"
          onPress={() => router.push("/platform-presence")}
        />
        <RowButton
          label="登出"
          hint="清除此裝置綁定並返回 onboarding"
          tone="danger"
          onPress={handleLogout}
        />
      </Card>

      <View style={styles.footerActions}>
        <Text style={styles.footerNote}>{saveDescriptor.subtitle}</Text>
        <Btn
          theme={THEME}
          variant="primary"
          size="md"
          onPress={handleSave}
          disabled={!dirty || hasValidation || saving}
        >
          {saving ? "儲存中…" : "儲存設定"}
        </Btn>
      </View>
    </Shell>
  );
}

const styles = StyleSheet.create({
  shellContent: {
    gap: 14,
    paddingBottom: 28,
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
  unbindBox: {
    borderRadius: 12,
    borderWidth: 1,
    borderColor: THEME.warnBorder,
    backgroundColor: THEME.warnBg,
    padding: 10,
    gap: 8,
  },
  unbindTitle: {
    color: THEME.warn,
    fontFamily: THEME.fontFamily,
    fontSize: 12,
    fontWeight: "700",
  },
  unbindInput: {
    minHeight: 40,
    borderRadius: 10,
    borderWidth: 1,
    borderColor: THEME.warnBorder,
    backgroundColor: THEME.surface,
    color: THEME.text,
    paddingHorizontal: 12,
    paddingVertical: 9,
    fontFamily: THEME.fontFamily,
    fontSize: 13,
  },
  unbindActions: {
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
  footerActions: {
    gap: 10,
    paddingBottom: 8,
  },
  footerNote: {
    color: THEME.textMuted,
    fontFamily: THEME.fontFamily,
    fontSize: 12,
  },
});
