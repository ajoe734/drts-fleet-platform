import { useEffect, useMemo, useState } from "react";
import { Ionicons } from "@expo/vector-icons";
import { useIsFocused } from "@react-navigation/native";
import { useRouter } from "expo-router";
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
  EmptyReason,
  PlatformAuthMechanism,
  PlatformCode,
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
  getPlatformHealthSeverity,
  type PlatformHealthAssessment,
} from "@/components/platform-status-card";
import { getDriverClient, isDriverIdentityProvisioned } from "@/lib/api-client";

const THEME = driverCanvasTheme;
const PRESENCE_REFRESH_TIER: RefreshTier = "medium";
const POLL_INTERVAL_MS = 15_000;
const PLATFORM_RULES_COPY =
  "平台頁只顯示 runtime 回傳的平台帳號；綁定、重新授權與解除綁定的 CTA 以 availableActions 為準，不為未綁定 placeholder 自行推導操作。";

WebBrowser.maybeCompleteAuthSession();

type PresenceActionKey =
  | "bind"
  | "unbind"
  | "reauth"
  | "contact_ops"
  | "open_settings";

type PresenceActionDescriptor = ResourceActionDescriptor & {
  key: PresenceActionKey;
  label: string;
  icon: keyof typeof Ionicons.glyphMap;
};

type PendingPresenceAction = {
  platformCode: PlatformCode;
  action: PresenceActionDescriptor;
  reason: string;
  manualAccountId: string;
  manualTokenExpiresAt: string;
};

type PresenceRow = {
  record: PlatformPresenceRecord;
  adapterStatus: PlatformPresenceAdapterStatusRecord | null;
  assessment: PlatformHealthAssessment;
  displayName: string;
  isBound: boolean;
  isForwarded: boolean;
  accountDisplay: string;
  statusLabel: string;
  statusTone: "success" | "warn" | "danger" | "neutral";
  statusDetail: string;
  mechanismLabel: string;
  authMechanism: PlatformAuthMechanism | null;
  availableActions: PresenceActionDescriptor[];
  requiresAttention: boolean;
  hint: string;
};

const ACTION_UI: Record<
  string,
  Pick<PresenceActionDescriptor, "key" | "label" | "icon">
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
};

function toErrorMessage(error: unknown): string {
  if (error instanceof Error && error.message.trim()) {
    return error.message.trim();
  }
  return "要求失敗";
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

function formatTokenExpiry(value: string | null | undefined): string {
  if (!value) {
    return "長期有效";
  }

  const parsed = new Date(value);
  if (Number.isNaN(parsed.getTime())) {
    return value;
  }

  const remainingMs = parsed.getTime() - Date.now();
  if (remainingMs <= 0) {
    return "已過期";
  }

  const remainingMinutes = Math.max(1, Math.floor(remainingMs / 60000));
  if (remainingMinutes < 60) {
    return `${remainingMinutes} 分鐘後到期`;
  }

  const remainingHours = Math.floor(remainingMinutes / 60);
  if (remainingHours < 24) {
    return `${remainingHours} 小時 ${remainingMinutes % 60} 分鐘後到期`;
  }

  const remainingDays = Math.floor(remainingHours / 24);
  return `${remainingDays} 天後到期`;
}

function formatAccountDisplay(
  record: PlatformPresenceRecord,
  isBound: boolean,
) {
  if (!isBound) {
    return "尚未綁定";
  }
  if (!record.accountId) {
    return "已綁定（平台未提供識別）";
  }
  if (record.accountId.length <= 4) {
    return record.accountId;
  }
  return `${record.accountId.slice(0, 2)}•••${record.accountId.slice(-2)}`;
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

function getBindingActions(
  availableActions: ResourceActionDescriptor[] | undefined,
): PresenceActionDescriptor[] {
  if (!availableActions?.length) {
    return [];
  }

  return availableActions.flatMap((action) => {
    const ui = ACTION_UI[action.action];
    if (!ui) {
      return [];
    }
    return [{ ...action, ...ui }];
  });
}

function isOwnedPlatform(record: PlatformPresenceRecord): boolean {
  const normalizedCode = String(record.platformCode).toLowerCase();
  const displayName =
    PLATFORM_CODE_REGISTRY[record.platformCode]?.displayName.toLowerCase() ??
    "";

  return (
    normalizedCode === "drts" ||
    normalizedCode === "owned" ||
    normalizedCode.startsWith("drts-") ||
    displayName.includes("drts")
  );
}

function isBoundPresence(
  record: PlatformPresenceRecord,
  availableActions: PresenceActionDescriptor[],
): boolean {
  if (record.accountId) {
    return true;
  }

  return availableActions.some((action) =>
    [
      "unbind_platform_account",
      "reauth_platform_account",
      "contact_ops_for_reauth",
    ].includes(action.action),
  );
}

function isPlatformOnline(record: PlatformPresenceRecord, isBound: boolean) {
  return isBound && record.status === "online" && !record.reauthRequired;
}

function getStatusTone(row: PresenceRow) {
  if (!row.isBound) {
    return "neutral" as const;
  }
  if (row.record.reauthRequired) {
    return "warn" as const;
  }
  if (row.record.eligibility === "ineligible") {
    return "danger" as const;
  }
  if (row.record.status === "online" && row.assessment.canReceiveOrders) {
    return "success" as const;
  }
  if (
    row.adapterStatus?.status === "degraded" ||
    row.adapterStatus?.status === "down"
  ) {
    return "warn" as const;
  }
  return "neutral" as const;
}

function deriveStatusCopy(
  record: PlatformPresenceRecord,
  assessment: PlatformHealthAssessment,
  isBound: boolean,
) {
  if (!isBound) {
    return {
      label: "尚未綁定",
      detail: "此平台帳號尚未完成綁定，無法接收派單",
    };
  }
  if (record.reauthRequired) {
    return {
      label: "需重新授權",
      detail: "Token 已過期或平台要求重新登入",
    };
  }
  if (record.eligibility === "ineligible") {
    return {
      label: "資格受限",
      detail: assessment.readinessLabel,
    };
  }
  if (record.eligibility === "pending") {
    return {
      label: "資格審核中",
      detail: assessment.readinessLabel,
    };
  }
  if (record.status === "online" && assessment.canReceiveOrders) {
    return {
      label: "可接單",
      detail: "平台連線正常，允許接單",
    };
  }
  if (record.status === "offline") {
    return {
      label: "已離線",
      detail: "目前不接收此平台工作",
    };
  }
  return {
    label: assessment.statusLabel,
    detail: assessment.readinessLabel,
  };
}

function getBrowserAuthUrl(
  platformCode: PlatformCode,
  actionKey: "bind" | "reauth",
): string | null {
  const redirectUri = encodeURIComponent(
    Linking.createURL("/platform-presence"),
  );
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
  return Linking.createURL("/platform-presence", {
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
  const redirectUri = encodeURIComponent(
    Linking.createURL("/platform-presence"),
  );
  const context = `source=driver_app&intent=${actionKey}&redirect_uri=${redirectUri}`;

  switch (platformCode) {
    case "grab":
      return `grab://open?screen=identity-verification&platform=${platformCode}&${context}`;
    default:
      return null;
  }
}

function deriveRows(summary: PlatformPresenceSummary | null): PresenceRow[] {
  const adapterMap = new Map<
    PlatformCode,
    PlatformPresenceAdapterStatusRecord
  >();
  summary?.adapterStatuses?.forEach((status) => {
    adapterMap.set(status.platformCode, status);
  });

  return [...(summary?.presences ?? [])]
    .map((record): PresenceRow => {
      const adapterStatus = adapterMap.get(record.platformCode) ?? null;
      const availableActions = getBindingActions(record.availableActions);
      const isBound = isBoundPresence(record, availableActions);
      const assessment = assessPlatformHealth(record, adapterStatus);
      const statusCopy = deriveStatusCopy(record, assessment, isBound);
      const mechanismLabel = getMechanismLabel(record.authMechanism);
      const row: PresenceRow = {
        record,
        adapterStatus,
        assessment,
        displayName:
          PLATFORM_CODE_REGISTRY[record.platformCode]?.displayName ??
          record.platformCode,
        isBound,
        isForwarded: !isOwnedPlatform(record),
        accountDisplay: formatAccountDisplay(record, isBound),
        statusLabel: statusCopy.label,
        statusTone: "neutral",
        statusDetail: statusCopy.detail,
        mechanismLabel,
        authMechanism: record.authMechanism ?? null,
        availableActions,
        requiresAttention:
          record.reauthRequired ||
          record.eligibility !== "eligible" ||
          adapterStatus?.status === "degraded" ||
          adapterStatus?.status === "down" ||
          assessment.tokenInfo.urgency !== "safe",
        hint: !isBound
          ? record.authMechanism == null
            ? "runtime 尚未提供首次綁定所需的授權機制 capability。"
            : record.authMechanism === "ops_managed"
              ? "此平台需由派車台協助建立帳號連線。"
              : `可使用 ${mechanismLabel} 完成綁定。`
          : record.authMechanism == null
            ? "已綁定，但 runtime 尚未提供重新授權機制 capability。"
            : record.authMechanism === "ops_managed"
              ? "此平台帳號需由派車台協助維護。"
              : `重新授權方式：${mechanismLabel}`,
      };
      return { ...row, statusTone: getStatusTone(row) };
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

function deriveEmptyReason(
  summary: PlatformPresenceSummary | null,
  error: string | null,
  rows: PresenceRow[],
): EmptyReason | null {
  if (rows.length > 0) {
    return null;
  }
  if (error && !summary) {
    const normalized = error.toLowerCase();
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
  if (summary?.adapterStatuses?.length) {
    const allDown = summary.adapterStatuses.every(
      (item) => item.status === "degraded" || item.status === "down",
    );
    if (allDown) {
      return "external_unavailable";
    }
  }
  return "not_provisioned";
}

function buildReceipt(
  row: PresenceRow,
  action: PresenceActionDescriptor,
  status: ActionReceipt["status"],
  message: string,
): ActionReceipt {
  const timestamp = Date.now();
  return {
    actionId: `${action.action}-${row.record.platformCode}-${timestamp}`,
    auditId: `drv-${row.record.platformCode}-${timestamp}`,
    resourceType: "platform_presence",
    resourceId: row.record.platformCode,
    status,
    message,
  };
}

function ActionButton({
  action,
  busy,
  onPress,
}: {
  action: PresenceActionDescriptor;
  busy: boolean;
  onPress: () => void;
}) {
  const variant =
    action.riskLevel === "medium"
      ? "primary"
      : action.key === "unbind"
        ? "ghost"
        : "secondary";

  return (
    <View style={styles.actionWrap}>
      <Btn
        theme={THEME}
        variant={variant}
        size="sm"
        onPress={onPress}
        disabled={!action.enabled || busy}
        danger={action.riskLevel === "high"}
      >
        {busy ? "處理中…" : action.label}
      </Btn>
      {action.enabled && action.requiresReason ? (
        <Text style={styles.actionHint}>需填寫原因</Text>
      ) : null}
      {!action.enabled && action.disabledReasonCode ? (
        <Text style={styles.actionHint}>
          {getDisabledReasonLabel(action.disabledReasonCode)}
        </Text>
      ) : null}
    </View>
  );
}

function EmptyState({
  reason,
  onRetry,
  onOpenSettings,
}: {
  reason: EmptyReason;
  onRetry: () => void;
  onOpenSettings: () => void;
}) {
  const config = {
    not_provisioned: {
      tone: "warn" as const,
      icon: "link-outline" as const,
      title: "尚未綁定任何平台帳號",
      body: "平台健康中心目前沒有可顯示的帳號資料，請到設定頁完成綁定。",
      actionLabel: "前往設定",
      action: onOpenSettings,
    },
    fetch_failed: {
      tone: "danger" as const,
      icon: "cloud-offline-outline" as const,
      title: "平台資料同步失敗",
      body: "目前無法取得平台健康資料，請重新整理後再試。",
      actionLabel: "重新整理",
      action: onRetry,
    },
    permission_denied: {
      tone: "danger" as const,
      icon: "lock-closed-outline" as const,
      title: "目前沒有權限查看平台頁",
      body: "此裝置登入狀態已失效或權限不足，需要重新啟用或由派車台協助。",
      actionLabel: "重新整理",
      action: onRetry,
    },
    external_unavailable: {
      tone: "warn" as const,
      icon: "warning-outline" as const,
      title: "外部平台目前不可用",
      body: "轉接器或平台端服務正在降級，暫時無法取得健康資料。",
      actionLabel: "重新整理",
      action: onRetry,
    },
    no_data: {
      tone: "info" as const,
      icon: "layers-outline" as const,
      title: "目前沒有平台資料",
      body: "暫時沒有可顯示的健康中心內容。",
      actionLabel: "重新整理",
      action: onRetry,
    },
    driver_not_eligible: {
      tone: "warn" as const,
      icon: "ban-outline" as const,
      title: "目前沒有符合資格的平台",
      body: "所有平台都標記為資格受限，請先完成重新授權或聯絡派車台。",
      actionLabel: "前往設定",
      action: onOpenSettings,
    },
    filtered_empty: {
      tone: "info" as const,
      icon: "funnel-outline" as const,
      title: "目前沒有結果",
      body: "請稍後再試。",
      actionLabel: "重新整理",
      action: onRetry,
    },
  }[reason];

  return (
    <Banner
      theme={THEME}
      tone={config.tone}
      title={config.title}
      body={config.body}
      icon={<Ionicons name={config.icon} size={16} color={THEME.text} />}
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

export default function PlatformPresenceScreen() {
  const router = useRouter();
  const isFocused = useIsFocused();
  const isProvisioned = isDriverIdentityProvisioned();
  const [summary, setSummary] = useState<PlatformPresenceSummary | null>(null);
  const [loading, setLoading] = useState(true);
  const [refreshing, setRefreshing] = useState(false);
  const [busyPlatform, setBusyPlatform] = useState<PlatformCode | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [handoffNotice, setHandoffNotice] = useState<string | null>(null);
  const [actionReceipt, setActionReceipt] = useState<ActionReceipt | null>(
    null,
  );
  const [pendingAction, setPendingAction] =
    useState<PendingPresenceAction | null>(null);

  const loadPresence = async ({
    silent = false,
    keepSummaryOnError = false,
  }: {
    silent?: boolean;
    keepSummaryOnError?: boolean;
  } = {}) => {
    if (!isProvisioned) {
      setLoading(false);
      return;
    }

    try {
      const client = getDriverClient();
      const nextSummary = await client.getPlatformPresence();
      setSummary(nextSummary);
      setError(null);
    } catch (loadError) {
      const message = toErrorMessage(loadError);
      setError(`平台連線資料載入失敗：${message}`);
      if (!keepSummaryOnError) {
        setSummary(null);
      }
      if (!silent) {
        Alert.alert("無法載入平台資料", message);
      }
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    void loadPresence({ silent: true });
  }, [isProvisioned]);

  useEffect(() => {
    if (!isFocused || !isProvisioned) {
      return;
    }

    const intervalId = setInterval(() => {
      void loadPresence({ silent: true, keepSummaryOnError: true });
    }, POLL_INTERVAL_MS);

    return () => clearInterval(intervalId);
  }, [isFocused, isProvisioned]);

  useEffect(() => {
    if (!isFocused || !isProvisioned) {
      return;
    }
    void loadPresence({ silent: true, keepSummaryOnError: true });
  }, [isFocused, isProvisioned]);

  const rows = useMemo(() => deriveRows(summary), [summary]);
  const emptyReason = deriveEmptyReason(summary, error, rows);
  const pendingRow = useMemo(
    () =>
      pendingAction
        ? (rows.find(
            (row) => row.record.platformCode === pendingAction.platformCode,
          ) ?? null)
        : null,
    [pendingAction, rows],
  );

  const onRefresh = async () => {
    setRefreshing(true);
    await loadPresence({ silent: true, keepSummaryOnError: true });
    setRefreshing(false);
  };

  const onlineCount = rows.filter((row) =>
    isPlatformOnline(row.record, row.isBound),
  ).length;
  const availableCount = rows.filter(
    (row) => row.assessment.canReceiveOrders,
  ).length;
  const attentionCount = rows.filter((row) => row.requiresAttention).length;
  const headerSubtitle = `${rows.length} 個帳號 · ${onlineCount} 上線 · ${attentionCount} 需處理`;

  const handleTogglePresence = async (row: PresenceRow) => {
    if (!row.isBound) {
      Alert.alert(
        "尚未綁定平台帳號",
        "此平台帳號尚未完成綁定，請先到設定頁查看可用綁定動作。",
        [
          { text: "取消", style: "cancel" },
          { text: "前往設定", onPress: () => router.push("/settings") },
        ],
      );
      return;
    }

    if (row.record.reauthRequired) {
      Alert.alert(
        "需重新授權",
        "此平台目前要求重新授權，完成後才能切換上線狀態。",
      );
      return;
    }

    setBusyPlatform(row.record.platformCode);
    try {
      const client = getDriverClient();
      if (row.record.status === "online") {
        await client.setPlatformOffline({
          platformCode: row.record.platformCode,
        });
      } else {
        await client.setPlatformOnline({
          platformCode: row.record.platformCode,
        });
      }
      await loadPresence({ silent: true, keepSummaryOnError: true });
    } catch (toggleError) {
      Alert.alert("無法更新平台狀態", toErrorMessage(toggleError));
    } finally {
      setBusyPlatform(null);
    }
  };

  const handleAction = (row: PresenceRow, action: PresenceActionDescriptor) => {
    if (!action.enabled || busyPlatform) {
      return;
    }

    setPendingAction({
      platformCode: row.record.platformCode,
      action,
      reason: "",
      manualAccountId: row.record.accountId ?? "",
      manualTokenExpiresAt: row.record.tokenExpiresAt ?? "",
    });
  };

  const submitPendingAction = async () => {
    if (!pendingAction || !pendingRow || busyPlatform) {
      return;
    }

    const { action } = pendingAction;
    const reason = pendingAction.reason.trim();
    const manualAccountId = pendingAction.manualAccountId.trim();
    const manualTokenExpiresAt = pendingAction.manualTokenExpiresAt.trim();

    if (action.requiresReason && !reason) {
      return;
    }
    if (
      pendingRow.authMechanism === "manual_credential" &&
      (action.key === "bind" || action.key === "reauth") &&
      !manualAccountId
    ) {
      return;
    }
    if (
      (action.key === "bind" || action.key === "reauth") &&
      pendingRow.authMechanism == null
    ) {
      Alert.alert(
        `${action.label}暫時不可用`,
        "runtime 尚未提供此平台的授權機制 capability，請稍後重新整理或改到設定頁確認。",
      );
      return;
    }

    setBusyPlatform(pendingRow.record.platformCode);
    try {
      const client = getDriverClient();

      if (action.key === "contact_ops") {
        setActionReceipt(
          buildReceipt(
            pendingRow,
            action,
            "accepted",
            `已記錄 ${pendingRow.displayName} 的派車台處理請求，請聯絡 ops 協助重新授權或帳號維護。`,
          ),
        );
      } else if (action.key === "unbind") {
        await client.unbindPlatformAccount({
          platformCode: pendingRow.record.platformCode,
          reason,
        });
        setActionReceipt(
          buildReceipt(
            pendingRow,
            action,
            "completed",
            `已解除 ${pendingRow.displayName} 綁定。原因：${reason}`,
          ),
        );
      } else if (pendingRow.authMechanism === "manual_credential") {
        await client.setPlatformOnline({
          platformCode: pendingRow.record.platformCode,
          accountId: manualAccountId,
          tokenExpiresAt: manualTokenExpiresAt || null,
        });
        setActionReceipt(
          buildReceipt(
            pendingRow,
            action,
            "completed",
            `${pendingRow.displayName} 已送出手動帳密資料，請等待平台同步。`,
          ),
        );
      } else if (pendingRow.authMechanism === "external_browser_oauth") {
        const authIntent = action.key === "bind" ? "bind" : "reauth";
        const authUrl = getBrowserAuthUrl(
          pendingRow.record.platformCode,
          authIntent,
        );
        if (!authUrl) {
          throw new Error("此平台尚未配置外部瀏覽器授權入口。");
        }
        const authResult = await WebBrowser.openAuthSessionAsync(
          authUrl,
          getAuthSessionRedirectUrl(pendingRow.record.platformCode),
        );
        setActionReceipt(null);
        if (authResult.type === "success") {
          setHandoffNotice(
            `${pendingRow.displayName} 已完成外部瀏覽器授權回跳，平台頁會重新整理最新狀態。`,
          );
        } else if (authResult.type === "cancel") {
          setHandoffNotice(
            `${pendingRow.displayName} 的外部瀏覽器授權已取消，可稍後重新啟動。`,
          );
        } else {
          setHandoffNotice(
            `${pendingRow.displayName} 已啟動外部瀏覽器授權流程，完成後回到 Driver App 即可看到最新狀態。`,
          );
        }
      } else if (pendingRow.authMechanism === "native_app_deeplink") {
        const authIntent = action.key === "bind" ? "bind" : "reauth";
        const authUrl = getNativeAppAuthUrl(
          pendingRow.record.platformCode,
          authIntent,
        );
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
          `${pendingRow.displayName} 已切換到平台 App 驗證流程，完成後回到 Driver App 即可刷新狀態。`,
        );
      } else {
        throw new Error("此平台授權方式不支援於平台頁直接處理。");
      }

      if (
        pendingRow.authMechanism === "manual_credential" ||
        action.key === "unbind"
      ) {
        await loadPresence({ silent: true, keepSummaryOnError: true });
      }
      setPendingAction(null);
    } catch (submitError) {
      Alert.alert(`${action.label}失敗`, toErrorMessage(submitError));
    } finally {
      setBusyPlatform(null);
    }
  };

  if (!isProvisioned) {
    return (
      <Shell theme={THEME} contentContainerStyle={styles.shellContent}>
        <PageHeader
          theme={THEME}
          title="平台"
          subtitle="裝置尚未配置司機身份"
        />
        <Banner
          theme={THEME}
          tone="warn"
          title="裝置尚未配置"
          body="此裝置尚未分配司機身份，無法顯示平台連線狀態。"
          icon={
            <Ionicons
              name="phone-portrait-outline"
              size={16}
              color={THEME.warn}
            />
          }
        />
      </Shell>
    );
  }

  if (loading && !summary) {
    return (
      <Shell theme={THEME} contentContainerStyle={styles.loadingShellContent}>
        <PageHeader theme={THEME} title="平台" subtitle="載入中…" />
        <Card theme={THEME} padding={20}>
          <View style={styles.loadingCard}>
            <ActivityIndicator size="large" color={THEME.accent} />
            <Text style={styles.loadingLabel}>載入平台健康中心中…</Text>
          </View>
        </Card>
      </Shell>
    );
  }

  return (
    <Shell theme={THEME} contentContainerStyle={styles.shellContent}>
      <PageHeader
        theme={THEME}
        title="平台"
        subtitle={headerSubtitle}
        actions={
          <Btn
            theme={THEME}
            variant="ghost"
            size="xs"
            onPress={() => void onRefresh()}
            disabled={refreshing}
            icon={<Ionicons name="refresh" size={13} color={THEME.textMuted} />}
          >
            {refreshing ? "同步中" : "重新整理"}
          </Btn>
        }
      />

      <View style={styles.kpiRow}>
        <KPI theme={THEME} label="可接單" value={String(availableCount)} />
        <KPI theme={THEME} label="上線中" value={String(onlineCount)} />
        <KPI theme={THEME} label="需處理" value={String(attentionCount)} />
      </View>

      <Banner
        theme={THEME}
        tone="info"
        title="Refresh Tier"
        body={`平台頁使用 ${PRESENCE_REFRESH_TIER}：前景停留時每 15 秒輪詢一次，另外保留手動重新整理；推播要求重新授權後，回到頁面也會立刻刷新。`}
        icon={<Ionicons name="sync-outline" size={16} color={THEME.info} />}
      />

      {error ? (
        <Banner
          theme={THEME}
          tone="warn"
          title="資料不是最新"
          body={summary ? `${error}，目前先顯示上一份成功同步資料。` : error}
          icon={
            <Ionicons name="warning-outline" size={16} color={THEME.warn} />
          }
        />
      ) : null}
      {actionReceipt ? (
        <Banner
          theme={THEME}
          tone={actionReceipt.status === "failed" ? "danger" : "info"}
          title="動作回條"
          body={`${actionReceipt.message} · auditId ${actionReceipt.auditId}`}
          icon={
            <Ionicons
              name={
                actionReceipt.status === "completed"
                  ? "checkmark-circle-outline"
                  : "receipt-outline"
              }
              size={16}
              color={THEME.text}
            />
          }
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
          title="已啟動平台授權交接"
          body={handoffNotice}
          icon={<Ionicons name="open-outline" size={16} color={THEME.info} />}
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

      <Banner
        theme={THEME}
        tone="info"
        icon={
          <Ionicons name="information-circle" size={16} color={THEME.info} />
        }
        body={PLATFORM_RULES_COPY}
        actions={
          <Btn
            theme={THEME}
            variant="secondary"
            size="sm"
            onPress={() => router.push("/settings")}
          >
            帳號設定
          </Btn>
        }
      />

      {pendingAction ? (
        <Card theme={THEME} title="確認平台操作" padding={16}>
          <Text style={styles.draftTitle}>
            {pendingRow
              ? `${pendingRow.displayName} · ${pendingAction.action.label}`
              : pendingAction.action.label}
          </Text>
          <Text style={styles.draftBody}>
            {pendingRow
              ? pendingAction.action.key === "unbind"
                ? "這是高風險操作，解除綁定後平台將不再向此司機派送工作。"
                : pendingRow.authMechanism === "external_browser_oauth"
                  ? "將切換到外部瀏覽器完成授權，完成後回到 Driver App 重新整理狀態。"
                  : pendingRow.authMechanism === "native_app_deeplink"
                    ? "將切換到平台 App 完成驗證，回到 Driver App 後可查看最新狀態。"
                    : pendingRow.authMechanism === "manual_credential"
                      ? "請輸入平台帳號識別與憑證資訊，送出後等待平台同步。"
                      : "此平台採 ops-managed 機制，需聯絡派車台協助處理。"
              : "請確認此操作。"}
          </Text>

          {pendingAction.action.requiresReason ? (
            <View style={styles.inputWrap}>
              <Text style={styles.inputLabel}>原因</Text>
              <TextInput
                value={pendingAction.reason}
                onChangeText={(value) =>
                  setPendingAction((current) =>
                    current ? { ...current, reason: value } : current,
                  )
                }
                placeholder="請填寫此次操作原因"
                placeholderTextColor={THEME.textMuted}
                style={styles.textInput}
              />
            </View>
          ) : null}

          {pendingRow?.authMechanism === "manual_credential" &&
          (pendingAction.action.key === "bind" ||
            pendingAction.action.key === "reauth") ? (
            <View style={styles.manualFields}>
              <View style={styles.inputWrap}>
                <Text style={styles.inputLabel}>平台帳號識別</Text>
                <TextInput
                  value={pendingAction.manualAccountId}
                  onChangeText={(value) =>
                    setPendingAction((current) =>
                      current
                        ? { ...current, manualAccountId: value }
                        : current,
                    )
                  }
                  placeholder="輸入平台帳號、手機或 driver id"
                  placeholderTextColor={THEME.textMuted}
                  style={styles.textInput}
                />
              </View>
              <View style={styles.inputWrap}>
                <Text style={styles.inputLabel}>憑證到期時間（選填）</Text>
                <TextInput
                  value={pendingAction.manualTokenExpiresAt}
                  onChangeText={(value) =>
                    setPendingAction((current) =>
                      current
                        ? { ...current, manualTokenExpiresAt: value }
                        : current,
                    )
                  }
                  placeholder="例如 2026-05-31T08:30:00Z"
                  placeholderTextColor={THEME.textMuted}
                  autoCapitalize="none"
                  style={styles.textInput}
                />
              </View>
            </View>
          ) : null}

          <View style={styles.draftActions}>
            <Btn
              theme={THEME}
              variant="ghost"
              size="sm"
              onPress={() => setPendingAction(null)}
              disabled={busyPlatform === pendingAction.platformCode}
            >
              取消
            </Btn>
            <Btn
              theme={THEME}
              variant="primary"
              size="sm"
              danger={pendingAction.action.riskLevel === "high"}
              onPress={() => void submitPendingAction()}
              disabled={
                busyPlatform === pendingAction.platformCode ||
                (pendingAction.action.requiresReason &&
                  !pendingAction.reason.trim()) ||
                (pendingRow?.authMechanism === "manual_credential" &&
                  (pendingAction.action.key === "bind" ||
                    pendingAction.action.key === "reauth") &&
                  !pendingAction.manualAccountId.trim())
              }
            >
              {busyPlatform === pendingAction.platformCode
                ? "送出中…"
                : "確認執行"}
            </Btn>
          </View>
        </Card>
      ) : null}

      {emptyReason ? (
        <EmptyState
          reason={emptyReason}
          onRetry={() => void onRefresh()}
          onOpenSettings={() => router.push("/settings")}
        />
      ) : (
        <View style={styles.list}>
          {rows.map((row) => {
            const online = isPlatformOnline(row.record, row.isBound);
            const busy = busyPlatform === row.record.platformCode;
            const lastSyncSource =
              row.record.status === "online"
                ? (row.record.lastOnlineAt ?? row.record.updatedAt)
                : (row.record.lastOfflineAt ?? row.record.updatedAt);
            const lastSyncLabel = formatCompactDateTime(
              row.adapterStatus?.lastSyncAt ?? lastSyncSource,
            );

            return (
              <Card key={row.record.platformCode} theme={THEME} padding={16}>
                <View style={styles.cardTop}>
                  <View style={styles.platformBadge}>
                    <Text style={styles.platformBadgeText}>
                      {row.record.platformCode.slice(0, 3).toUpperCase()}
                    </Text>
                  </View>
                  <View style={styles.cardMain}>
                    <View style={styles.titleRow}>
                      <Text style={styles.platformName}>{row.displayName}</Text>
                      {row.isForwarded ? (
                        <Pill theme={THEME} tone="warn">
                          外部平台
                        </Pill>
                      ) : null}
                      <Pill theme={THEME} tone={row.statusTone}>
                        {row.statusLabel}
                      </Pill>
                    </View>
                    <Text style={styles.metaText}>
                      帳號 {row.accountDisplay} · {row.statusDetail}
                    </Text>
                    <View style={styles.metaRow}>
                      <Ionicons
                        name={getMechanismIcon(row.authMechanism)}
                        size={13}
                        color={THEME.textMuted}
                      />
                      <Text style={styles.metaDetail}>
                        {row.mechanismLabel}
                      </Text>
                      <Text style={styles.metaDivider}>·</Text>
                      <Text style={styles.metaDetail}>
                        Token {formatTokenExpiry(row.record.tokenExpiresAt)}
                      </Text>
                      <Text style={styles.metaDivider}>·</Text>
                      <Text style={styles.metaDetail}>
                        同步 {lastSyncLabel}
                      </Text>
                    </View>
                    <Text style={styles.hintText}>{row.hint}</Text>
                    {row.assessment.blockers.length > 0 ? (
                      <View style={styles.blockersRow}>
                        {row.assessment.blockers.map((blocker) => (
                          <Pill
                            key={`${row.record.platformCode}-${blocker}`}
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

                <View style={styles.toggleRow}>
                  <View style={styles.toggleCopy}>
                    <Text style={styles.toggleTitle}>接單開關</Text>
                    <Text style={styles.toggleHint}>
                      {!row.isBound
                        ? "未綁定時不可上線"
                        : row.record.reauthRequired
                          ? "需先完成重新授權"
                          : "切換此平台是否接收工作"}
                    </Text>
                  </View>
                  <View style={styles.toggleControl}>
                    {busy ? (
                      <ActivityIndicator size="small" color={THEME.accent} />
                    ) : null}
                    <Switch
                      accessibilityLabel={`${row.displayName} 平台上線切換`}
                      value={online}
                      onValueChange={() => void handleTogglePresence(row)}
                      disabled={
                        busy || !row.isBound || row.record.reauthRequired
                      }
                      trackColor={{
                        false: THEME.borderStrong,
                        true: THEME.accentHi,
                      }}
                      thumbColor={online ? THEME.accent : "#FFFFFF"}
                    />
                  </View>
                </View>

                <View style={styles.actionsRow}>
                  {row.availableActions.length > 0 ? (
                    row.availableActions.map((action) => (
                      <ActionButton
                        key={`${row.record.platformCode}-${action.key}`}
                        action={action}
                        busy={busy}
                        onPress={() => handleAction(row, action)}
                      />
                    ))
                  ) : (
                    <Text style={styles.noActionsText}>
                      runtime 未提供
                      `availableActions`，此卡片只顯示狀態，不自行推導綁定或重新授權
                      CTA。
                    </Text>
                  )}
                  <Pressable
                    onPress={() => router.push("/settings")}
                    style={styles.settingsLink}
                  >
                    <Ionicons
                      name="open-outline"
                      size={14}
                      color={THEME.textMuted}
                    />
                    <Text style={styles.settingsLinkText}>查看帳號設定</Text>
                  </Pressable>
                </View>
              </Card>
            );
          })}
        </View>
      )}
    </Shell>
  );
}

const styles = StyleSheet.create({
  shellContent: {
    paddingBottom: 28,
    gap: 14,
  },
  loadingShellContent: {
    flexGrow: 1,
    justifyContent: "center",
  },
  loadingCard: {
    minHeight: 180,
    alignItems: "center",
    justifyContent: "center",
    gap: 12,
  },
  loadingLabel: {
    color: THEME.textMuted,
    fontSize: 14,
  },
  kpiRow: {
    flexDirection: "row",
    gap: 8,
  },
  list: {
    gap: 12,
  },
  cardTop: {
    flexDirection: "row",
    gap: 12,
  },
  platformBadge: {
    width: 44,
    height: 44,
    borderRadius: 12,
    alignItems: "center",
    justifyContent: "center",
    backgroundColor: THEME.accentBg,
  },
  platformBadgeText: {
    color: THEME.accent,
    fontFamily: THEME.monoFamily,
    fontSize: 13,
    fontWeight: "800",
    letterSpacing: 0.5,
  },
  cardMain: {
    flex: 1,
    minWidth: 0,
    gap: 6,
  },
  titleRow: {
    flexDirection: "row",
    alignItems: "center",
    gap: 6,
    flexWrap: "wrap",
  },
  platformName: {
    color: THEME.text,
    fontSize: 15,
    fontWeight: "700",
    flexShrink: 1,
  },
  metaText: {
    color: THEME.textMuted,
    fontSize: 13,
    lineHeight: 18,
  },
  metaRow: {
    flexDirection: "row",
    alignItems: "center",
    gap: 6,
    flexWrap: "wrap",
  },
  metaDetail: {
    color: THEME.textMuted,
    fontSize: 12,
    lineHeight: 16,
  },
  metaDivider: {
    color: THEME.textMuted,
    fontSize: 12,
  },
  hintText: {
    color: THEME.text,
    fontSize: 12.5,
    lineHeight: 18,
  },
  blockersRow: {
    flexDirection: "row",
    flexWrap: "wrap",
    gap: 6,
    marginTop: 2,
  },
  toggleRow: {
    marginTop: 14,
    paddingTop: 14,
    borderTopWidth: 1,
    borderTopColor: THEME.border,
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "space-between",
    gap: 12,
  },
  toggleCopy: {
    flex: 1,
    gap: 2,
  },
  toggleTitle: {
    color: THEME.text,
    fontSize: 13,
    fontWeight: "700",
  },
  toggleHint: {
    color: THEME.textMuted,
    fontSize: 12,
    lineHeight: 16,
  },
  toggleControl: {
    alignItems: "center",
    justifyContent: "center",
    gap: 6,
  },
  actionsRow: {
    marginTop: 14,
    paddingTop: 14,
    borderTopWidth: 1,
    borderTopColor: THEME.border,
    gap: 10,
  },
  actionWrap: {
    gap: 4,
  },
  actionHint: {
    color: THEME.textMuted,
    fontSize: 11.5,
    lineHeight: 16,
  },
  noActionsText: {
    color: THEME.textMuted,
    fontSize: 12,
    lineHeight: 18,
  },
  settingsLink: {
    flexDirection: "row",
    alignItems: "center",
    gap: 6,
    alignSelf: "flex-start",
  },
  settingsLinkText: {
    color: THEME.textMuted,
    fontSize: 12,
    lineHeight: 16,
  },
  draftTitle: {
    color: THEME.text,
    fontSize: 15,
    fontWeight: "700",
  },
  draftBody: {
    color: THEME.textMuted,
    fontSize: 13,
    lineHeight: 19,
    marginTop: 6,
  },
  inputWrap: {
    gap: 6,
    marginTop: 12,
  },
  inputLabel: {
    color: THEME.text,
    fontSize: 12,
    fontWeight: "700",
  },
  textInput: {
    borderWidth: 1,
    borderColor: THEME.borderStrong,
    borderRadius: 12,
    paddingHorizontal: 12,
    paddingVertical: 10,
    color: THEME.text,
    backgroundColor: THEME.surface,
  },
  manualFields: {
    gap: 2,
  },
  draftActions: {
    marginTop: 16,
    flexDirection: "row",
    justifyContent: "flex-end",
    gap: 10,
  },
});
