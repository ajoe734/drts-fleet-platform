import type { ReactNode } from "react";
import { useEffect, useState } from "react";
import { Ionicons } from "@expo/vector-icons";
import { useRouter } from "expo-router";
import {
  ActivityIndicator,
  Alert,
  Pressable,
  StyleSheet,
  Switch,
  Text,
  View,
} from "react-native";
import {
  PLATFORM_CODE_REGISTRY,
  type DriverProfileRecord,
  type DriverSettings,
  type EmptyReason,
  type PlatformCode,
  type PlatformPresenceAdapterStatusRecord,
  type PlatformPresenceRecord,
  type PlatformPresenceSummary,
  type ResourceActionDescriptor,
  type UiRefreshMetadata,
} from "@drts/contracts";
import type { CanvasTone } from "@drts/ui-web/canvas-tokens";

import {
  Banner,
  Btn,
  Card,
  DL,
  Field,
  Input,
  KPI,
  PageHeader,
  Pill,
  Shell,
  driverCanvasTheme,
} from "@/components/canvas-primitives";
import {
  assessPlatformHealth,
  getPlatformHealthSeverity,
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
import { driverSaveStatusLabels } from "@/lib/strings";

const THEME = driverCanvasTheme;

type BindingFilter = "all" | "attention" | "bound";
type PlatformAuthMechanism =
  | "external_browser_oauth"
  | "native_app_deeplink"
  | "manual_credential"
  | "ops_managed";
type BindingActionId = "bind" | "unbind" | "reauth" | "view_status";

type SettingsBindingRow = {
  record: PlatformPresenceRecord;
  adapterStatus?: PlatformPresenceAdapterStatusRecord;
  assessment: PlatformHealthAssessment;
  displayName: string;
  authMechanism: PlatformAuthMechanism;
  driverSelfServiceBinding: boolean;
  autoAcceptAllowed: boolean;
  availableActions: ResourceActionDescriptor[];
  relaySummary: string[];
  attention: boolean;
  accountLabel: string;
};

const PLATFORM_RULES: Partial<
  Record<
    PlatformCode,
    {
      authMechanism: PlatformAuthMechanism;
      driverSelfServiceBinding: boolean;
      autoAcceptAllowed: boolean;
      canRelayAccept: boolean;
      canRelayReject: boolean;
      relayUnavailableReasonCode?: string;
    }
  >
> = {
  uber: {
    authMechanism: "external_browser_oauth",
    driverSelfServiceBinding: true,
    autoAcceptAllowed: true,
    canRelayAccept: true,
    canRelayReject: true,
  },
  grab: {
    authMechanism: "native_app_deeplink",
    driverSelfServiceBinding: true,
    autoAcceptAllowed: false,
    canRelayAccept: true,
    canRelayReject: false,
    relayUnavailableReasonCode: "platform_reject_not_supported",
  },
  "line-taxi": {
    authMechanism: "manual_credential",
    driverSelfServiceBinding: true,
    autoAcceptAllowed: false,
    canRelayAccept: true,
    canRelayReject: true,
  },
  grab_taiwan: {
    authMechanism: "ops_managed",
    driverSelfServiceBinding: false,
    autoAcceptAllowed: false,
    canRelayAccept: false,
    canRelayReject: false,
    relayUnavailableReasonCode: "ops_managed_binding",
  },
  indriver: {
    authMechanism: "manual_credential",
    driverSelfServiceBinding: true,
    autoAcceptAllowed: false,
    canRelayAccept: true,
    canRelayReject: true,
  },
  forwarder_sandbox: {
    authMechanism: "ops_managed",
    driverSelfServiceBinding: false,
    autoAcceptAllowed: false,
    canRelayAccept: false,
    canRelayReject: false,
    relayUnavailableReasonCode: "sandbox_ops_only",
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

function formatCompactDateTime(value: string | null | undefined): string {
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

function createRefreshMetadata(
  state: UiRefreshMetadata["dataFreshness"],
): UiRefreshMetadata {
  return {
    generatedAt: new Date().toISOString(),
    staleAfterMs: 0,
    dataFreshness: state,
    source: "live",
  };
}

function toPageEmptyReason(loadError: string | null): EmptyReason {
  if (!loadError) {
    return "fetch_failed";
  }
  const lower = loadError.toLowerCase();
  if (
    lower.includes("403") ||
    lower.includes("permission") ||
    lower.includes("forbidden")
  ) {
    return "permission_denied";
  }
  return "fetch_failed";
}

function describeSaveStatus(state: SaveState) {
  switch (state) {
    case "saving":
      return driverSaveStatusLabels.saving;
    case "dirty":
      return driverSaveStatusLabels.dirty;
    case "saved":
      return driverSaveStatusLabels.saved;
    case "error":
      return driverSaveStatusLabels.error;
    default:
      return driverSaveStatusLabels.idle;
  }
}

function getBannerToneForEmptyReason(reason: EmptyReason): CanvasTone {
  switch (reason) {
    case "fetch_failed":
    case "permission_denied":
      return "danger";
    case "external_unavailable":
    case "driver_not_eligible":
      return "warn";
    default:
      return "info";
  }
}

function getEmptyReasonCopy(reason: EmptyReason): {
  title: string;
  body: string;
  icon: keyof typeof Ionicons.glyphMap;
} {
  switch (reason) {
    case "no_data":
      return {
        title: "尚未偵測到可顯示的平台資料",
        body: "目前沒有可呈現的平台帳號資訊。稍後重新整理，或等派車台完成平台開通。",
        icon: "albums-outline" as const,
      };
    case "not_provisioned":
      return {
        title: "此裝置尚未完成平台配置",
        body: "先完成裝置啟用與司機身份配置，設定與平台綁定才會開放。",
        icon: "lock-closed-outline" as const,
      };
    case "fetch_failed":
      return {
        title: "設定資料同步失敗",
        body: "目前無法取得最新設定。請手動重新整理；若持續失敗，改由派車台協助確認。",
        icon: "alert-circle-outline" as const,
      };
    case "permission_denied":
      return {
        title: "您目前沒有修改這份設定的權限",
        body: "這個司機身份或平台帳號不允許自助操作。請聯絡派車台或管理端協助處理。",
        icon: "shield-outline" as const,
      };
    case "external_unavailable":
      return {
        title: "外部平台暫時無法使用",
        body: "平台轉接器目前降級或中斷。您仍可查看本機設定，但綁定與驗證可能暫時無法完成。",
        icon: "cloud-offline-outline" as const,
      };
    case "driver_not_eligible":
      return {
        title: "目前沒有任何平台可以派單給您",
        body: "您的平台資格受限或仍在審核中。先查看原因，再決定要重新驗證或請派車台處理。",
        icon: "warning-outline" as const,
      };
    case "filtered_empty":
      return {
        title: "這個篩選條件下沒有項目",
        body: "切回全部平台，或先完成綁定與重新驗證後再查看。",
        icon: "funnel-outline" as const,
      };
    default:
      return {
        title: "設定資料暫時不可用",
        body: "請稍後重新整理，或改由派車台協助確認目前狀態。",
        icon: "help-circle-outline" as const,
      };
  }
}

function getAuthMechanismMeta(mechanism: PlatformAuthMechanism) {
  switch (mechanism) {
    case "external_browser_oauth":
      return {
        label: "OAuth · 外部瀏覽器",
        code: "external_browser_oauth",
        icon: "open-outline" as const,
      };
    case "native_app_deeplink":
      return {
        label: "原生 App 跳轉",
        code: "native_app_deeplink",
        icon: "phone-portrait-outline" as const,
      };
    case "manual_credential":
      return {
        label: "手動帳密驗證",
        code: "manual_credential",
        icon: "key-outline" as const,
      };
    case "ops_managed":
      return {
        label: "派車台協助處理",
        code: "ops_managed",
        icon: "call-outline" as const,
      };
    default:
      return {
        label: "OAuth · 外部瀏覽器",
        code: "external_browser_oauth",
        icon: "open-outline" as const,
      };
  }
}

function getDisplayName(platformCode: PlatformCode) {
  return PLATFORM_CODE_REGISTRY[platformCode]?.displayName ?? platformCode;
}

function buildCompatPresence(
  platformCode: PlatformCode,
  driverId: string,
): PlatformPresenceRecord {
  return {
    driverId,
    platformCode,
    accountId: null,
    status: "offline",
    eligibility: "pending",
    tokenExpiresAt: null,
    reauthRequired: false,
    lastOnlineAt: null,
    lastOfflineAt: null,
    updatedAt: new Date(0).toISOString(),
  };
}

function deriveBindingActions(
  record: PlatformPresenceRecord,
  driverSelfServiceBinding: boolean,
): ResourceActionDescriptor[] {
  const disabledReasonCode = driverSelfServiceBinding
    ? undefined
    : "driver_self_service_binding_disabled";
  const actions: ResourceActionDescriptor[] = [
    {
      action: "view_status",
      enabled: true,
      riskLevel: "low",
    },
  ];

  if (record.accountId) {
    actions.push({
      action: "unbind",
      enabled: driverSelfServiceBinding,
      disabledReasonCode,
      requiresReason: true,
      riskLevel: "high",
    });
  } else {
    actions.push({
      action: "bind",
      enabled: driverSelfServiceBinding,
      disabledReasonCode,
      riskLevel: "medium",
    });
  }

  if (record.accountId) {
    actions.push({
      action: "reauth",
      enabled: record.reauthRequired || record.status === "offline",
      disabledReasonCode:
        record.reauthRequired || record.status === "offline"
          ? undefined
          : "token_still_valid",
      riskLevel: "medium",
    });
  }

  return actions;
}

function deriveBindingRows(
  summary: PlatformPresenceSummary | null,
  driverId: string,
): SettingsBindingRow[] {
  const presenceMap = new Map<PlatformCode, PlatformPresenceRecord>(
    (summary?.presences ?? []).map((record: PlatformPresenceRecord) => [
      record.platformCode,
      record,
    ]),
  );
  const adapterMap = new Map<PlatformCode, PlatformPresenceAdapterStatusRecord>(
    (summary?.adapterStatuses ?? []).map(
      (record: PlatformPresenceAdapterStatusRecord) => [
        record.platformCode,
        record,
      ],
    ),
  );

  return Object.keys(PLATFORM_CODE_REGISTRY)
    .map((code) => code as PlatformCode)
    .map<SettingsBindingRow>((platformCode) => {
      const record =
        presenceMap.get(platformCode) ??
        buildCompatPresence(platformCode, driverId);
      const adapterStatus = adapterMap.get(platformCode);
      const assessment = assessPlatformHealth(record, adapterStatus);
      const rules = PLATFORM_RULES[platformCode] ?? {
        authMechanism: "external_browser_oauth",
        driverSelfServiceBinding: true,
        autoAcceptAllowed: false,
        canRelayAccept: true,
        canRelayReject: true,
      };
      const availableActions = deriveBindingActions(
        record,
        rules.driverSelfServiceBinding,
      );
      const relaySummary = [
        `relayAccept=${String(rules.canRelayAccept)}`,
        `relayReject=${String(rules.canRelayReject)}`,
        rules.relayUnavailableReasonCode
          ? `reason=${rules.relayUnavailableReasonCode}`
          : null,
      ].filter(Boolean) as string[];

      return {
        record,
        adapterStatus,
        assessment,
        displayName: getDisplayName(platformCode),
        authMechanism: rules.authMechanism,
        driverSelfServiceBinding: rules.driverSelfServiceBinding,
        autoAcceptAllowed: rules.autoAcceptAllowed,
        availableActions,
        relaySummary,
        attention:
          record.reauthRequired ||
          assessment.statusTone !== "healthy" ||
          adapterStatus?.status === "degraded" ||
          adapterStatus?.status === "down",
        accountLabel: record.accountId
          ? maskAccountId(record.accountId)
          : "未綁定",
      };
    })
    .sort((left, right) => {
      const severityDelta =
        getPlatformHealthSeverity(right.assessment) -
        getPlatformHealthSeverity(left.assessment);
      if (severityDelta !== 0) {
        return severityDelta;
      }
      return left.displayName.localeCompare(right.displayName, "zh-TW");
    });
}

function maskAccountId(accountId: string): string {
  if (accountId.length <= 6) {
    return accountId;
  }
  return `${accountId.slice(0, 3)}•••${accountId.slice(-3)}`;
}

function toBindingFilterLabel(filter: BindingFilter) {
  switch (filter) {
    case "attention":
      return "需處理";
    case "bound":
      return "已綁定";
    default:
      return "全部";
  }
}

function getActionLabel(action: BindingActionId) {
  switch (action) {
    case "bind":
      return "綁定";
    case "unbind":
      return "解除綁定";
    case "reauth":
      return "重新驗證";
    case "view_status":
      return "查看狀態";
  }
}

function getActionTone(action: BindingActionId): {
  variant: "primary" | "secondary" | "ghost";
  danger?: boolean;
} {
  switch (action) {
    case "bind":
    case "reauth":
      return { variant: "primary" };
    case "unbind":
      return { variant: "secondary", danger: true };
    default:
      return { variant: "secondary" };
  }
}

function BindingEmptyState({
  reason,
  action,
}: {
  reason: EmptyReason;
  action?: ReactNode;
}) {
  const copy = getEmptyReasonCopy(reason);
  const tone = getBannerToneForEmptyReason(reason);

  return (
    <Banner
      theme={THEME}
      tone={tone === "neutral" ? "info" : tone}
      title={copy.title}
      body={copy.body}
      icon={
        <Ionicons
          name={copy.icon}
          size={16}
          color={
            tone === "danger"
              ? THEME.danger
              : tone === "warn"
                ? THEME.warn
                : THEME.info
          }
        />
      }
      actions={action}
    />
  );
}

function SaveStatePill({ state }: { state: SaveState }) {
  const status = describeSaveStatus(state);
  const tone: CanvasTone =
    status.variant === "success"
      ? "success"
      : status.variant === "warning"
        ? "warn"
        : status.variant === "danger"
          ? "danger"
          : status.variant === "info"
            ? "info"
            : "neutral";

  return (
    <Pill theme={THEME} tone={tone}>
      {status.label}
    </Pill>
  );
}

function SectionTitle({
  title,
  subtitle,
  action,
}: {
  title: string;
  subtitle?: string;
  action?: React.ReactNode;
}) {
  return (
    <View style={styles.sectionTitleRow}>
      <View style={styles.sectionTitleCopy}>
        <Text style={[styles.sectionTitle, { color: THEME.text }]}>
          {title}
        </Text>
        {subtitle ? (
          <Text style={[styles.sectionSubtitle, { color: THEME.textMuted }]}>
            {subtitle}
          </Text>
        ) : null}
      </View>
      {action ? <View>{action}</View> : null}
    </View>
  );
}

function PlatformBindingRow({
  row,
  busy,
  onAction,
}: {
  row: SettingsBindingRow;
  busy: boolean;
  onAction: (action: BindingActionId, row: SettingsBindingRow) => void;
}) {
  const authMeta = getAuthMechanismMeta(row.authMechanism);
  const statusTone: CanvasTone =
    row.record.reauthRequired || row.assessment.statusTone === "warning"
      ? "warn"
      : row.assessment.statusTone === "danger"
        ? "danger"
        : row.record.accountId
          ? "success"
          : "neutral";

  return (
    <View
      style={[
        styles.bindingRow,
        {
          borderBottomColor: THEME.border,
        },
      ]}
    >
      <View style={styles.bindingRowTop}>
        <View
          style={[
            styles.bindingMark,
            {
              backgroundColor:
                statusTone === "success"
                  ? THEME.successBg
                  : statusTone === "warn"
                    ? THEME.warnBg
                    : statusTone === "danger"
                      ? THEME.dangerBg
                      : THEME.neutralBg,
            },
          ]}
        >
          <Text
            style={[
              styles.bindingMarkText,
              {
                color:
                  statusTone === "success"
                    ? THEME.success
                    : statusTone === "warn"
                      ? THEME.warn
                      : statusTone === "danger"
                        ? THEME.danger
                        : THEME.textMuted,
                fontFamily: THEME.monoFamily,
              },
            ]}
          >
            {row.record.platformCode.slice(0, 3).toUpperCase()}
          </Text>
        </View>
        <View style={styles.bindingMain}>
          <View style={styles.bindingNameRow}>
            <Text style={[styles.bindingName, { color: THEME.text }]}>
              {row.displayName}
            </Text>
            {row.record.reauthRequired ? (
              <Pill theme={THEME} tone="warn">
                需處理
              </Pill>
            ) : null}
          </View>
          <Text style={[styles.bindingMeta, { color: THEME.textMuted }]}>
            {row.record.accountId ? "已綁定" : "未綁定"} · {row.accountLabel}
          </Text>
          <Text
            style={[
              styles.bindingStatus,
              {
                color:
                  statusTone === "success"
                    ? THEME.success
                    : statusTone === "warn"
                      ? THEME.warn
                      : statusTone === "danger"
                        ? THEME.danger
                        : THEME.textMuted,
              },
            ]}
          >
            {row.assessment.readinessLabel}
          </Text>
        </View>
      </View>

      <View
        style={[
          styles.bindingMechanismBar,
          {
            backgroundColor: THEME.surfaceLo,
          },
        ]}
      >
        <Ionicons name={authMeta.icon} size={12} color={THEME.textMuted} />
        <Text
          style={[styles.bindingMechanismLabel, { color: THEME.textMuted }]}
        >
          {authMeta.label}
        </Text>
        <Text
          style={[
            styles.bindingMechanismCode,
            { color: THEME.textDim, fontFamily: THEME.monoFamily },
          ]}
        >
          {authMeta.code}
        </Text>
      </View>

      <View style={styles.bindingFacts}>
        <Pill
          theme={THEME}
          tone={row.driverSelfServiceBinding ? "success" : "warn"}
        >
          {row.driverSelfServiceBinding
            ? "driverSelfServiceBinding=true"
            : "driverSelfServiceBinding=false"}
        </Pill>
        {row.relaySummary.map((fact) => (
          <Pill
            key={`${row.record.platformCode}-${fact}`}
            theme={THEME}
            tone="neutral"
          >
            {fact}
          </Pill>
        ))}
      </View>

      <DL
        theme={THEME}
        cols={2}
        items={[
          {
            label: "授權狀態",
            value: row.record.reauthRequired ? "需重新驗證" : "正常",
          },
          {
            label: "最後同步",
            value: formatCompactDateTime(
              row.adapterStatus?.lastSyncAt ??
                row.record.lastOnlineAt ??
                row.record.updatedAt,
            ),
            mono: true,
          },
          {
            label: "平台資格",
            value:
              row.record.eligibility === "eligible"
                ? "可接單"
                : row.record.eligibility === "pending"
                  ? "審核中"
                  : "資格受限",
          },
          {
            label: "同步健康",
            value: row.adapterStatus?.status ?? "unknown",
            mono: true,
          },
        ]}
      />

      <View style={styles.bindingActionRow}>
        {row.availableActions.map((descriptor) => {
          const action = descriptor.action as BindingActionId;
          const palette = getActionTone(action);
          const disabled = busy || !descriptor.enabled;

          return (
            <Btn
              key={`${row.record.platformCode}-${descriptor.action}`}
              theme={THEME}
              variant={palette.variant}
              size="xs"
              danger={palette.danger}
              disabled={disabled}
              onPress={() => onAction(action, row)}
            >
              {getActionLabel(action)}
            </Btn>
          );
        })}
      </View>

      {row.availableActions.some(
        (item) => !item.enabled && item.disabledReasonCode,
      ) ? (
        <Text style={[styles.bindingHint, { color: THEME.textDim }]}>
          {row.availableActions
            .filter((item) => !item.enabled && item.disabledReasonCode)
            .map((item) => item.disabledReasonCode)
            .join(" · ")}
        </Text>
      ) : null}
    </View>
  );
}

export default function SettingsScreen() {
  const router = useRouter();
  const isProvisioned = isDriverIdentityProvisioned();
  const driverId = isProvisioned ? getDriverId() : "";

  const [loading, setLoading] = useState(true);
  const [refreshing, setRefreshing] = useState(false);
  const [saving, setSaving] = useState(false);
  const [busyPlatform, setBusyPlatform] = useState<PlatformCode | null>(null);
  const [loadError, setLoadError] = useState<string | null>(null);
  const [saveError, setSaveError] = useState<string | null>(null);
  const [lastResult, setLastResult] = useState<"success" | "error" | null>(
    null,
  );
  const [settingsLoaded, setSettingsLoaded] = useState(false);
  const [profileLoaded, setProfileLoaded] = useState(false);
  const [platformSummary, setPlatformSummary] =
    useState<PlatformPresenceSummary | null>(null);
  const [refreshMeta, setRefreshMeta] = useState<UiRefreshMetadata>(
    createRefreshMetadata("unknown"),
  );
  const [bindingFilter, setBindingFilter] = useState<BindingFilter>("all");

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

  const loadAll = async ({ silent = false }: { silent?: boolean } = {}) => {
    if (!isProvisioned) {
      setLoading(false);
      return;
    }

    const client = getDriverClient();
    const [settingsResult, profileResult, platformResult] =
      await Promise.allSettled([
        client.getDriverSettings(driverId) as Promise<DriverSettings>,
        client.getDriverProfile() as Promise<DriverProfileRecord>,
        client.getPlatformPresence(),
      ]);

    const failures: string[] = [];
    let freshness: UiRefreshMetadata["dataFreshness"] = "fresh";

    if (settingsResult.status === "fulfilled") {
      const next = settingsValuesFromRecord(settingsResult.value);
      setSettingsValues(next);
      setInitialSettings(next);
      setSettingsLoaded(true);
    } else {
      failures.push(`偏好設定（${toErrorMessage(settingsResult.reason)}）`);
      freshness = "degraded";
    }

    if (profileResult.status === "fulfilled") {
      const next = profileValuesFromRecord(profileResult.value);
      setProfileValues(next);
      setInitialProfile(next);
      setProfileLoaded(true);
    } else {
      failures.push(`個人資料（${toErrorMessage(profileResult.reason)}）`);
      freshness = "degraded";
    }

    if (platformResult.status === "fulfilled") {
      setPlatformSummary(platformResult.value);
    } else {
      failures.push(`平台綁定（${toErrorMessage(platformResult.reason)}）`);
      freshness = "degraded";
      if (!silent) {
        setPlatformSummary(null);
      }
    }

    setRefreshMeta(createRefreshMetadata(freshness));
    setLoadError(
      failures.length > 0
        ? `已載入可用資料。無法同步 ${formatSectionList(failures)}。`
        : null,
    );
    setLoading(false);
  };

  useEffect(() => {
    void loadAll({ silent: true });
  }, [driverId, isProvisioned]);

  const onRefresh = async () => {
    setRefreshing(true);
    await loadAll();
    setRefreshing(false);
  };

  const updateSettings = (patch: Partial<SettingsFormValues>) => {
    setSettingsValues((prev) => ({ ...prev, ...patch }));
    if (lastResult) {
      setLastResult(null);
    }
    if (saveError) {
      setSaveError(null);
    }
  };

  const updateProfile = (patch: Partial<ProfileFormValues>) => {
    setProfileValues((prev) => ({ ...prev, ...patch }));
    if (lastResult) {
      setLastResult(null);
    }
    if (saveError) {
      setSaveError(null);
    }
  };

  const handleSave = async () => {
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
        const sectionLabel =
          settingsDirty && index === 0 ? "偏好設定" : "個人資料";
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
        return;
      }

      setLastResult("error");
      setSaveError(
        saved.length === 0
          ? `無法儲存 ${formatSectionList(failed)}。`
          : `已儲存 ${formatSectionList(saved)}。無法儲存 ${formatSectionList(failed)}。`,
      );
    } finally {
      setSaving(false);
    }
  };

  const handleBindingAction = async (
    action: BindingActionId,
    row: SettingsBindingRow,
  ) => {
    if (action === "view_status") {
      router.push("/platform-presence");
      return;
    }

    if (action === "unbind") {
      Alert.prompt?.(
        "解除平台綁定",
        `請輸入解除「${row.displayName}」的原因。`,
        [
          { text: "取消", style: "cancel" },
          {
            text: "確認解除",
            style: "destructive",
            onPress: (reason?: string) => {
              if (!reason?.trim()) {
                Alert.alert("需要原因", "解除綁定前需要填寫原因。");
                return;
              }
              void submitBindingAction(action, row, reason.trim());
            },
          },
        ],
        "plain-text",
      );

      if (!Alert.prompt) {
        Alert.alert(
          "解除平台綁定",
          "此裝置需要原因才能解除綁定。請改到派車台或支援可輸入原因的裝置執行。",
        );
      }
      return;
    }

    void submitBindingAction(action, row);
  };

  const submitBindingAction = async (
    action: Exclude<BindingActionId, "view_status">,
    row: SettingsBindingRow,
    reason?: string,
  ) => {
    const client = getDriverClient();
    const authMeta = getAuthMechanismMeta(row.authMechanism);
    setBusyPlatform(row.record.platformCode);

    try {
      if (action === "bind" || action === "reauth") {
        await client.setPlatformOnline({
          platformCode: row.record.platformCode,
          tokenExpiresAt: null,
        });
        Alert.alert(
          action === "bind" ? "已送出平台綁定" : "已送出重新驗證",
          `請依 ${authMeta.label} 流程完成「${row.displayName}」驗證。`,
        );
      } else {
        await client.setPlatformOffline({
          platformCode: row.record.platformCode,
        });
        Alert.alert(
          "已解除平台綁定",
          `「${row.displayName}」已下線並解除綁定。原因：${reason ?? "未提供"}`,
        );
      }
      await onRefresh();
    } catch (error) {
      Alert.alert("平台操作失敗", toErrorMessage(error));
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
          subtitle="個人資料、偏好與平台綁定"
        />
        <BindingEmptyState
          reason="not_provisioned"
          action={
            <Btn
              theme={THEME}
              variant="primary"
              size="sm"
              onPress={() => router.push("/onboarding")}
            >
              前往裝置配置
            </Btn>
          }
        />
      </Shell>
    );
  }

  if (loading) {
    return (
      <Shell theme={THEME} contentContainerStyle={styles.loadingContent}>
        <PageHeader
          theme={THEME}
          title="設定"
          subtitle="個人資料、偏好與平台綁定"
        />
        <View style={styles.loadingState}>
          <ActivityIndicator size="large" color={THEME.accent} />
          <Text style={[styles.loadingLabel, { color: THEME.textMuted }]}>
            載入設定中…
          </Text>
        </View>
      </Shell>
    );
  }

  if (loadError && !settingsLoaded && !profileLoaded && !platformSummary) {
    const reason = toPageEmptyReason(loadError);
    return (
      <Shell theme={THEME} contentContainerStyle={styles.shellContent}>
        <PageHeader
          theme={THEME}
          title="設定"
          subtitle="個人資料、偏好與平台綁定"
          actions={
            <Btn
              theme={THEME}
              variant="secondary"
              size="sm"
              icon={<Ionicons name="refresh" size={13} color={THEME.text} />}
              onPress={() => void onRefresh()}
              disabled={refreshing}
            >
              重新整理
            </Btn>
          }
        />
        <BindingEmptyState reason={reason} />
      </Shell>
    );
  }

  const bindingRows = deriveBindingRows(platformSummary, driverId);
  const boundCount = bindingRows.filter((item) =>
    Boolean(item.record.accountId),
  ).length;
  const attentionCount = bindingRows.filter((item) => item.attention).length;
  const autoAcceptRows = bindingRows.filter((item) => item.autoAcceptAllowed);
  const currentAutoAcceptLabel =
    autoAcceptRows.length > 0
      ? `支援 ${autoAcceptRows.length} 個平台`
      : "目前無平台支援";
  const filteredRows = bindingRows.filter((item) => {
    if (bindingFilter === "attention") {
      return item.attention;
    }
    if (bindingFilter === "bound") {
      return Boolean(item.record.accountId);
    }
    return true;
  });
  const bindingEmptyReason: EmptyReason | null =
    filteredRows.length > 0
      ? null
      : bindingFilter !== "all"
        ? "filtered_empty"
        : bindingRows.length === 0
          ? "no_data"
          : bindingRows.every(
                (item) =>
                  item.adapterStatus?.status === "down" ||
                  item.adapterStatus?.status === "degraded",
              )
            ? "external_unavailable"
            : boundCount > 0 &&
                bindingRows
                  .filter((item) => item.record.accountId)
                  .every((item) => item.record.eligibility === "ineligible")
              ? "driver_not_eligible"
              : null;
  const profileInitial = profileValues.profileName.trim().charAt(0) || "司";
  const saveDisabled = !dirty || hasValidation || saving;
  const staleLabel =
    refreshMeta.dataFreshness === "degraded"
      ? "部分資料降級"
      : `最後同步 ${formatCompactDateTime(refreshMeta.generatedAt)}`;

  return (
    <Shell
      theme={THEME}
      contentContainerStyle={styles.shellContent}
      footer={
        <View style={styles.footerBar}>
          <View>
            <SaveStatePill state={saveState} />
            <Text style={[styles.footerMeta, { color: THEME.textDim }]}>
              {hasValidation ? "請先修正欄位錯誤" : staleLabel}
            </Text>
          </View>
          <Btn
            theme={THEME}
            variant="primary"
            size="md"
            disabled={saveDisabled}
            onPress={() => void handleSave()}
          >
            {saving ? "儲存中…" : "儲存設定"}
          </Btn>
        </View>
      }
    >
      <PageHeader
        theme={THEME}
        title="設定"
        subtitle="4 段設定 · 手動同步 · 平台綁定與健康中心對齊"
        actions={
          <Btn
            theme={THEME}
            variant="ghost"
            size="xs"
            icon={<Ionicons name="refresh" size={13} color={THEME.textMuted} />}
            onPress={() => void onRefresh()}
            disabled={refreshing}
          >
            {refreshing ? "同步中" : "重新整理"}
          </Btn>
        }
      />

      <View style={styles.kpiRow}>
        <KPI theme={THEME} label="已綁定平台" value={String(boundCount)} />
        <KPI theme={THEME} label="需處理" value={String(attentionCount)} />
        <KPI
          theme={THEME}
          label="Refresh tier"
          value="Manual"
          sub={staleLabel}
        />
      </View>

      {loadError ? (
        <Banner
          theme={THEME}
          tone="warn"
          title="部分資料同步失敗"
          body={loadError}
          icon={
            <Ionicons name="warning-outline" size={16} color={THEME.warn} />
          }
        />
      ) : null}
      {saveError ? (
        <Banner
          theme={THEME}
          tone="danger"
          title="儲存失敗"
          body={saveError}
          icon={
            <Ionicons
              name="alert-circle-outline"
              size={16}
              color={THEME.danger}
            />
          }
        />
      ) : null}
      {hasValidation ? (
        <Banner
          theme={THEME}
          tone="warn"
          title="還有欄位需要修正"
          body="請先修正標示欄位，再執行儲存。"
          icon={
            <Ionicons name="warning-outline" size={16} color={THEME.warn} />
          }
        />
      ) : null}

      <Card theme={THEME} padding={16}>
        <View style={styles.profileHero}>
          <View
            style={[styles.profileAvatar, { backgroundColor: THEME.accentBg }]}
          >
            <Text
              style={[styles.profileAvatarLabel, { color: THEME.accentHi }]}
            >
              {profileInitial}
            </Text>
          </View>
          <View style={styles.profileHeroCopy}>
            <Text style={[styles.profileHeroName, { color: THEME.text }]}>
              {profileValues.profileName.trim() || "尚未填寫司機姓名"}
            </Text>
            <Text style={[styles.profileHeroMeta, { color: THEME.textMuted }]}>
              {driverId ? `driverId · ${driverId}` : "未配置 driverId"}
            </Text>
          </View>
          <SaveStatePill state={saveState} />
        </View>
      </Card>

      <SectionTitle
        title="司機身份"
        subtitle="維持最新聯絡方式，派遣與行政才能正確找到您。"
      />
      <Card theme={THEME} padding={16}>
        <View style={styles.fieldStack}>
          <Field theme={THEME} label="姓名" required>
            <Input
              theme={THEME}
              value={profileValues.profileName}
              ph="司機姓名"
              editable={!saving}
              onChangeText={(value) => updateProfile({ profileName: value })}
            />
          </Field>
          {profileErrors.profileName ? (
            <Text style={[styles.fieldError, { color: THEME.danger }]}>
              {profileErrors.profileName}
            </Text>
          ) : null}

          <Field theme={THEME} label="電話">
            <Input
              theme={THEME}
              value={profileValues.profilePhone}
              ph="+886-900-000-000"
              editable={!saving}
              onChangeText={(value) => updateProfile({ profilePhone: value })}
            />
          </Field>

          <Field theme={THEME} label="電子郵件">
            <Input
              theme={THEME}
              value={profileValues.profileEmail}
              ph="driver@example.com"
              editable={!saving}
              autoCapitalize="none"
              autoCorrect={false}
              onChangeText={(value) => updateProfile({ profileEmail: value })}
            />
          </Field>
          {profileErrors.profileEmail ? (
            <Text style={[styles.fieldError, { color: THEME.danger }]}>
              {profileErrors.profileEmail}
            </Text>
          ) : null}
        </View>
      </Card>

      <SectionTitle
        title="緊急聯絡人"
        subtitle="任一欄位有內容時，姓名與電話必填。"
      />
      <Card theme={THEME} padding={16}>
        <View style={styles.fieldStack}>
          <Field theme={THEME} label="聯絡人姓名">
            <Input
              theme={THEME}
              value={profileValues.emergencyName}
              ph="緊急聯絡人姓名"
              editable={!saving}
              onChangeText={(value) => updateProfile({ emergencyName: value })}
            />
          </Field>
          {profileErrors.emergencyName ? (
            <Text style={[styles.fieldError, { color: THEME.danger }]}>
              {profileErrors.emergencyName}
            </Text>
          ) : null}

          <Field theme={THEME} label="聯絡人電話">
            <Input
              theme={THEME}
              value={profileValues.emergencyPhone}
              ph="+886-900-000-000"
              editable={!saving}
              onChangeText={(value) => updateProfile({ emergencyPhone: value })}
            />
          </Field>
          {profileErrors.emergencyPhone ? (
            <Text style={[styles.fieldError, { color: THEME.danger }]}>
              {profileErrors.emergencyPhone}
            </Text>
          ) : null}

          <Field theme={THEME} label="關係">
            <Input
              theme={THEME}
              value={profileValues.emergencyRelationship}
              ph="例如：配偶、家人、主管"
              editable={!saving}
              onChangeText={(value) =>
                updateProfile({ emergencyRelationship: value })
              }
            />
          </Field>
        </View>
      </Card>

      <SectionTitle
        title="偏好"
        subtitle="語言、通知、接單距離與 auto-accept 都在這裡。"
      />
      <Card theme={THEME} padding={16}>
        <View style={styles.preferenceStack}>
          <Field theme={THEME} label="語言" required>
            <View style={styles.segmentRow}>
              {[
                { label: "繁中", value: "zh-TW" },
                { label: "English", value: "en" },
              ].map((option) => (
                <Pressable
                  key={option.value}
                  onPress={() => updateSettings({ language: option.value })}
                  style={[
                    styles.segmentButton,
                    {
                      backgroundColor:
                        settingsValues.language === option.value
                          ? THEME.accentBg
                          : THEME.surfaceLo,
                      borderColor:
                        settingsValues.language === option.value
                          ? THEME.accent
                          : THEME.border,
                    },
                  ]}
                >
                  <Text
                    style={[
                      styles.segmentLabel,
                      {
                        color:
                          settingsValues.language === option.value
                            ? THEME.accentHi
                            : THEME.textMuted,
                      },
                    ]}
                  >
                    {option.label}
                  </Text>
                </Pressable>
              ))}
            </View>
          </Field>

          <Field
            theme={THEME}
            label="最大接單距離"
            hint="Q-DRV14：公里單位。外部平台若自有規則，可能僅作參考。"
          >
            <Input
              theme={THEME}
              value={settingsValues.maxAcceptRadius}
              ph="例如 8"
              editable={!saving}
              suffix="km"
              onChangeText={(value) =>
                updateSettings({ maxAcceptRadius: value })
              }
            />
          </Field>
          {settingsErrors.maxAcceptRadius ? (
            <Text style={[styles.fieldError, { color: THEME.danger }]}>
              {settingsErrors.maxAcceptRadius}
            </Text>
          ) : null}

          <View style={styles.switchRow}>
            <View style={styles.switchCopy}>
              <Text style={[styles.switchTitle, { color: THEME.text }]}>
                通知
              </Text>
              <Text style={[styles.switchHint, { color: THEME.textMuted }]}>
                推播與 in-app 事件通知。若系統停用通知，仍會保留關鍵車務提醒。
              </Text>
            </View>
            <Switch
              value={settingsValues.notificationsEnabled}
              onValueChange={(value) =>
                updateSettings({ notificationsEnabled: value })
              }
              disabled={saving}
            />
          </View>

          <View style={styles.switchRow}>
            <View style={styles.switchCopy}>
              <Text style={[styles.switchTitle, { color: THEME.text }]}>
                自動接單 · 自營
              </Text>
              <Text style={[styles.switchHint, { color: THEME.textMuted }]}>
                Q-DRV13：Phase 1 不允許全域
                auto-accept。此開關僅作自營/允許平台設定。
              </Text>
            </View>
            <Switch
              value={settingsValues.autoAcceptEnabled}
              onValueChange={(value) =>
                updateSettings({ autoAcceptEnabled: value })
              }
              disabled={saving || autoAcceptRows.length === 0}
            />
          </View>

          <Banner
            theme={THEME}
            tone="info"
            title="平台 auto-accept 範圍"
            body={currentAutoAcceptLabel}
            icon={
              <Ionicons name="flash-outline" size={16} color={THEME.info} />
            }
          />
        </View>
      </Card>

      <SectionTitle
        title="平台帳號綁定"
        subtitle="`availableActions` 驅動 CTA，並與平台健康中心的狀態語言一致。"
        action={
          <Btn
            theme={THEME}
            variant="secondary"
            size="xs"
            onPress={() => router.push("/platform-presence")}
          >
            前往平台中心
          </Btn>
        }
      />

      <View style={styles.filterRow}>
        {(["all", "attention", "bound"] as BindingFilter[]).map((filter) => (
          <Pressable
            key={filter}
            onPress={() => setBindingFilter(filter)}
            style={[
              styles.filterChip,
              {
                backgroundColor:
                  bindingFilter === filter ? THEME.accentBg : THEME.surfaceLo,
                borderColor:
                  bindingFilter === filter ? THEME.accent : THEME.border,
              },
            ]}
          >
            <Text
              style={[
                styles.filterChipLabel,
                {
                  color:
                    bindingFilter === filter ? THEME.accentHi : THEME.textMuted,
                },
              ]}
            >
              {toBindingFilterLabel(filter)}
            </Text>
          </Pressable>
        ))}
      </View>

      <Card theme={THEME} padding={0}>
        {bindingEmptyReason ? (
          <View style={styles.bindingEmptyWrap}>
            <BindingEmptyState reason={bindingEmptyReason} />
          </View>
        ) : (
          filteredRows.map((row, index) => (
            <View key={row.record.platformCode}>
              <PlatformBindingRow
                row={row}
                busy={busyPlatform === row.record.platformCode}
                onAction={handleBindingAction}
              />
              {index === filteredRows.length - 1 ? null : null}
            </View>
          ))
        )}
      </Card>

      <SectionTitle title="其他" subtitle="收益入口、裝置資訊與登出。" />
      <Card theme={THEME} padding={0}>
        <Pressable
          onPress={() => router.push("/earnings")}
          style={[styles.utilityRow, { borderBottomColor: THEME.border }]}
        >
          <View style={styles.utilityCopy}>
            <Text style={[styles.utilityTitle, { color: THEME.text }]}>
              查看收益
            </Text>
            <Text style={[styles.utilityHint, { color: THEME.textMuted }]}>
              前往收益頁查看今日、本週與本月的結算摘要。
            </Text>
          </View>
          <Ionicons name="chevron-forward" size={16} color={THEME.textDim} />
        </Pressable>

        <View style={[styles.utilityRow, { borderBottomColor: THEME.border }]}>
          <View style={styles.utilityCopy}>
            <Text style={[styles.utilityTitle, { color: THEME.text }]}>
              關於本機
            </Text>
            <Text style={[styles.utilityHint, { color: THEME.textMuted }]}>
              {driverId || "driver-unassigned"} · refresh tier manual
            </Text>
          </View>
        </View>

        <Pressable onPress={handleLogout} style={styles.utilityRow}>
          <View style={styles.utilityCopy}>
            <Text style={[styles.utilityTitle, { color: THEME.danger }]}>
              登出
            </Text>
            <Text style={[styles.utilityHint, { color: THEME.textMuted }]}>
              清除此裝置上的司機配置並返回 onboarding。
            </Text>
          </View>
          <Ionicons name="log-out-outline" size={16} color={THEME.danger} />
        </Pressable>
      </Card>
    </Shell>
  );
}

const styles = StyleSheet.create({
  shellContent: {
    paddingBottom: 24,
    gap: 14,
  },
  loadingContent: {
    flexGrow: 1,
    justifyContent: "center",
    gap: 14,
  },
  loadingState: {
    minHeight: 220,
    justifyContent: "center",
    alignItems: "center",
    gap: 12,
  },
  loadingLabel: {
    fontSize: 14,
  },
  kpiRow: {
    flexDirection: "row",
    gap: 8,
  },
  sectionTitleRow: {
    flexDirection: "row",
    alignItems: "flex-start",
    justifyContent: "space-between",
    gap: 12,
  },
  sectionTitleCopy: {
    flex: 1,
    gap: 4,
  },
  sectionTitle: {
    fontSize: 16,
    fontWeight: "700",
  },
  sectionSubtitle: {
    fontSize: 12.5,
    lineHeight: 18,
  },
  profileHero: {
    flexDirection: "row",
    alignItems: "center",
    gap: 12,
  },
  profileAvatar: {
    width: 52,
    height: 52,
    borderRadius: 26,
    alignItems: "center",
    justifyContent: "center",
  },
  profileAvatarLabel: {
    fontSize: 22,
    fontWeight: "700",
  },
  profileHeroCopy: {
    flex: 1,
    gap: 3,
  },
  profileHeroName: {
    fontSize: 17,
    fontWeight: "700",
  },
  profileHeroMeta: {
    fontSize: 11.5,
  },
  fieldStack: {
    gap: 10,
  },
  fieldError: {
    fontSize: 12,
    marginTop: -4,
  },
  preferenceStack: {
    gap: 14,
  },
  segmentRow: {
    flexDirection: "row",
    gap: 8,
  },
  segmentButton: {
    flex: 1,
    minHeight: 42,
    borderRadius: 12,
    borderWidth: 1,
    alignItems: "center",
    justifyContent: "center",
  },
  segmentLabel: {
    fontSize: 13,
    fontWeight: "600",
  },
  switchRow: {
    flexDirection: "row",
    alignItems: "center",
    gap: 16,
  },
  switchCopy: {
    flex: 1,
    gap: 4,
  },
  switchTitle: {
    fontSize: 14,
    fontWeight: "600",
  },
  switchHint: {
    fontSize: 12,
    lineHeight: 18,
  },
  filterRow: {
    flexDirection: "row",
    gap: 8,
  },
  filterChip: {
    paddingHorizontal: 12,
    paddingVertical: 8,
    borderRadius: 999,
    borderWidth: 1,
  },
  filterChipLabel: {
    fontSize: 12,
    fontWeight: "600",
  },
  bindingEmptyWrap: {
    padding: 14,
  },
  bindingRow: {
    padding: 14,
    borderBottomWidth: 1,
    gap: 10,
  },
  bindingRowTop: {
    flexDirection: "row",
    alignItems: "center",
    gap: 12,
  },
  bindingMark: {
    width: 42,
    height: 42,
    borderRadius: 12,
    alignItems: "center",
    justifyContent: "center",
  },
  bindingMarkText: {
    fontSize: 12,
    fontWeight: "800",
  },
  bindingMain: {
    flex: 1,
    gap: 3,
  },
  bindingNameRow: {
    flexDirection: "row",
    alignItems: "center",
    gap: 8,
  },
  bindingName: {
    fontSize: 14.5,
    fontWeight: "700",
  },
  bindingMeta: {
    fontSize: 11.5,
  },
  bindingStatus: {
    fontSize: 12,
    lineHeight: 17,
  },
  bindingMechanismBar: {
    flexDirection: "row",
    alignItems: "center",
    gap: 6,
    borderRadius: 8,
    paddingHorizontal: 10,
    paddingVertical: 8,
  },
  bindingMechanismLabel: {
    fontSize: 11.5,
  },
  bindingMechanismCode: {
    fontSize: 10,
  },
  bindingFacts: {
    flexDirection: "row",
    flexWrap: "wrap",
    gap: 6,
  },
  bindingActionRow: {
    flexDirection: "row",
    flexWrap: "wrap",
    gap: 8,
  },
  bindingHint: {
    fontSize: 11.5,
    lineHeight: 17,
  },
  utilityRow: {
    flexDirection: "row",
    alignItems: "center",
    gap: 12,
    paddingHorizontal: 16,
    paddingVertical: 14,
    borderBottomWidth: 1,
  },
  utilityCopy: {
    flex: 1,
    gap: 3,
  },
  utilityTitle: {
    fontSize: 14,
    fontWeight: "600",
  },
  utilityHint: {
    fontSize: 12,
    lineHeight: 18,
  },
  footerBar: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "space-between",
    gap: 12,
    paddingHorizontal: 20,
    paddingTop: 12,
    paddingBottom: 14,
    borderTopWidth: 1,
    borderTopColor: THEME.border,
    backgroundColor: THEME.bgRaised,
  },
  footerMeta: {
    marginTop: 6,
    fontSize: 11.5,
  },
});
