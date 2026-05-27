import { useEffect, useMemo, useState } from "react";
import { Ionicons } from "@expo/vector-icons";
import * as Linking from "expo-linking";
import { useRouter } from "expo-router";
import {
  ActivityIndicator,
  Alert,
  Pressable,
  StyleSheet,
  Text,
  TextInput,
  View,
} from "react-native";
import {
  PLATFORM_CODE_REGISTRY,
  type EmptyReason,
  type PlatformPresenceAdapterStatusRecord,
  type PlatformPresenceRecord,
  type ResourceActionDescriptor,
} from "@drts/contracts";

import {
  Banner,
  Btn,
  Card,
  DL,
  KPI,
  PageHeader,
  Pill,
  Shell,
  driverCanvasTheme,
} from "@/components/canvas-primitives";
import { getDriverClient, isDriverIdentityProvisioned } from "@/lib/api-client";
import {
  canReceiveOrders,
  deriveBlockingReasons,
  findAction,
  getMechanismActionLabel,
  getMechanismLabel,
  getPlatformReauthMechanism,
  resolveEmptyReason,
  type PlatformPresenceViewRecord,
  type PlatformPresenceViewSummary,
  type PresenceFilter,
} from "@/lib/platform-presence-view";
import { driverStrings } from "@/lib/strings";

const THEME = driverCanvasTheme;
const REFRESH_INTERVAL_MS = 15_000;
const REFRESH_TIER_LABEL = "T3 · 每 15 秒輪詢";

type EnrichedPresence = {
  record: PlatformPresenceViewRecord;
  adapterStatus?: PlatformPresenceAdapterStatusRecord;
  displayName: string;
  forwarded: boolean;
  canReceive: boolean;
  blockingReasons: string[];
  mechanismLabel: string;
  actionLabel: string;
  attention: boolean;
  statusTone: "success" | "warn" | "danger" | "info" | "neutral";
  statusLabel: string;
};

type ManualReauthState = {
  platformCode: PlatformPresenceRecord["platformCode"];
  displayName: string;
  tokenExpiresAt: string;
};

function toErrorMessage(error: unknown): string {
  if (error instanceof Error && error.message.trim()) {
    return error.message.trim();
  }
  return driverStrings.common.requestFailed;
}

function isPermissionDeniedError(error: string | null): boolean {
  if (!error) {
    return false;
  }
  return /403|401|permission|權限|拒絕/i.test(error);
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
    return "未提供期限";
  }

  const parsed = new Date(value);
  if (Number.isNaN(parsed.getTime())) {
    return value;
  }

  const remainingMs = parsed.getTime() - Date.now();
  if (remainingMs <= 0) {
    return "已過期";
  }

  const remainingMinutes = Math.max(1, Math.floor(remainingMs / 60_000));
  if (remainingMinutes < 60) {
    return `${remainingMinutes} 分鐘後到期`;
  }

  const remainingHours = Math.floor(remainingMinutes / 60);
  if (remainingHours < 24) {
    return `${remainingHours} 小時後到期`;
  }

  return `${Math.floor(remainingHours / 24)} 天後到期`;
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

function getPlatformDisplayName(record: PlatformPresenceRecord): string {
  if (isOwnedPlatform(record)) {
    return driverStrings.platformPresence.managedByDrts;
  }
  return (
    PLATFORM_CODE_REGISTRY[record.platformCode]?.displayName ??
    record.platformCode
  );
}

function getStatusLabel(item: EnrichedPresence): string {
  if (item.record.reauthRequired) {
    return "需重新授權";
  }
  if (item.adapterStatus?.status === "down") {
    return "同步中斷";
  }
  if (item.adapterStatus?.status === "degraded") {
    return "同步延遲";
  }
  if (item.record.eligibility === "ineligible") {
    return "資格受限";
  }
  if (item.record.eligibility === "pending") {
    return "資格審核中";
  }
  if (item.canReceive) {
    return "可接單";
  }
  if (item.record.status === "online") {
    return "已上線";
  }
  return "離線";
}

function getStatusTone(item: EnrichedPresence): EnrichedPresence["statusTone"] {
  if (item.record.reauthRequired || item.adapterStatus?.status === "down") {
    return "danger";
  }
  if (
    item.record.eligibility !== "eligible" ||
    item.adapterStatus?.status === "degraded" ||
    item.blockingReasons.length > 0
  ) {
    return "warn";
  }
  if (item.canReceive) {
    return "success";
  }
  if (item.record.status === "online") {
    return "info";
  }
  return "neutral";
}

function toneColor(tone: EnrichedPresence["statusTone"]): string {
  switch (tone) {
    case "success":
      return THEME.success;
    case "warn":
      return THEME.warn;
    case "danger":
      return THEME.danger;
    case "info":
      return THEME.info;
    default:
      return THEME.textMuted;
  }
}

function buildActionState(
  record: PlatformPresenceViewRecord,
  actionCandidates: string[],
  fallback: ResourceActionDescriptor | null,
): ResourceActionDescriptor | null {
  const explicit = findAction(record, actionCandidates);
  if (record.availableActions) {
    return explicit;
  }
  return fallback;
}

function matchesFilter(
  item: EnrichedPresence,
  filter: PresenceFilter,
): boolean {
  switch (filter) {
    case "attention":
      return item.attention;
    case "ready":
      return item.canReceive;
    case "reauth":
      return item.record.reauthRequired;
    default:
      return true;
  }
}

function emptyStateCopy(reason: EmptyReason): {
  title: string;
  body: string;
  tone: "info" | "warn" | "danger";
  cta?: { label: string; route?: "/settings"; onPressHint?: string };
} {
  switch (reason) {
    case "not_provisioned":
      return {
        title: "尚未完成平台綁定",
        body: "先到設定綁定平台帳號後，才能查看各平台是否可接單。",
        tone: "warn",
        cta: { label: "前往設定", route: "/settings" },
      };
    case "fetch_failed":
      return {
        title: "平台資料同步失敗",
        body: "目前無法取得平台健康資訊，請稍後重新整理。",
        tone: "danger",
      };
    case "permission_denied":
      return {
        title: "目前沒有查看權限",
        body: "此裝置或司機身份無法讀取平台連線狀態，請聯絡派車台確認授權。",
        tone: "danger",
      };
    case "external_unavailable":
      return {
        title: "外部平台同步異常",
        body: "所有外部平台目前都處於 degraded/down，請先查看需處理平台或聯絡派車台。",
        tone: "warn",
      };
    case "driver_not_eligible":
      return {
        title: "目前不符合派單資格",
        body: "沒有平台能派送工作給您。請檢查資格原因、證件狀態或班次設定。",
        tone: "warn",
      };
    case "filtered_empty":
      return {
        title: "這個篩選沒有符合的平台",
        body: "切換到其他視角查看全部平台，或先處理需要重新授權的平台。",
        tone: "info",
      };
    case "no_data":
    default:
      return {
        title: "目前沒有可顯示的平台資料",
        body: "資料已同步，但此視角暫時沒有可顯示的項目。",
        tone: "info",
      };
  }
}

function PresenceFilterTabs({
  activeFilter,
  onChange,
}: {
  activeFilter: PresenceFilter;
  onChange: (next: PresenceFilter) => void;
}) {
  const tabs: Array<{ key: PresenceFilter; label: string }> = [
    { key: "all", label: "全部" },
    { key: "attention", label: "需處理" },
    { key: "ready", label: "可接單" },
    { key: "reauth", label: "重新授權" },
  ];

  return (
    <View style={styles.filterRow}>
      {tabs.map((tab) => {
        const selected = tab.key === activeFilter;
        return (
          <Pressable
            key={tab.key}
            accessibilityRole="button"
            onPress={() => onChange(tab.key)}
            style={[
              styles.filterChip,
              {
                backgroundColor: selected ? THEME.accentBg : THEME.surfaceLo,
                borderColor: selected ? THEME.accentBorder : THEME.border,
              },
            ]}
          >
            <Text
              style={[
                styles.filterChipText,
                { color: selected ? THEME.accentHi : THEME.textMuted },
              ]}
            >
              {tab.label}
            </Text>
          </Pressable>
        );
      })}
    </View>
  );
}

function MechanismLegend() {
  return (
    <Card
      theme={THEME}
      title="重新授權方式"
      subtitle="平台 capability flag 可配置 4 種處理流程"
    >
      <View style={styles.legendList}>
        {[
          "external_browser_oauth",
          "native_app_deeplink",
          "manual_credential",
          "ops_managed",
        ].map((key) => (
          <View key={key} style={styles.legendItem}>
            <Pill theme={THEME} tone="accent">
              {getMechanismLabel(
                key as ReturnType<typeof getPlatformReauthMechanism>,
              )}
            </Pill>
            <Text style={[styles.legendText, { color: THEME.textMuted }]}>
              {getMechanismActionLabel(
                key as ReturnType<typeof getPlatformReauthMechanism>,
              )}
            </Text>
          </View>
        ))}
      </View>
    </Card>
  );
}

function ManualReauthCard({
  state,
  busy,
  onChange,
  onCancel,
  onSubmit,
}: {
  state: ManualReauthState;
  busy: boolean;
  onChange: (next: string) => void;
  onCancel: () => void;
  onSubmit: () => void;
}) {
  return (
    <Card
      theme={THEME}
      title={`${state.displayName} 手動重新授權`}
      subtitle="依 Q-DRV05，這個平台使用 manual credential 流程"
    >
      <View style={styles.manualCardBody}>
        <Text style={[styles.manualHint, { color: THEME.textMuted }]}>
          本階段 API 僅提交重新驗證請求與選填 Token
          到期時間。若平台要求完整帳密，請依派車台流程補件。
        </Text>
        <View style={styles.fieldBlock}>
          <Text style={[styles.fieldLabel, { color: THEME.textMuted }]}>
            Token 到期時間（選填）
          </Text>
          <TextInput
            value={state.tokenExpiresAt}
            onChangeText={onChange}
            placeholder="例如 2026-06-01T12:00:00Z"
            placeholderTextColor={THEME.textDim}
            autoCapitalize="none"
            autoCorrect={false}
            style={[
              styles.textInput,
              {
                color: THEME.text,
                borderColor: THEME.border,
                backgroundColor: THEME.surfaceLo,
              },
            ]}
          />
        </View>
        <View style={styles.manualActions}>
          <Btn theme={THEME} variant="ghost" size="sm" onPress={onCancel}>
            取消
          </Btn>
          <Btn
            theme={THEME}
            variant="primary"
            size="sm"
            onPress={onSubmit}
            disabled={busy}
          >
            {busy ? "送出中" : "送出重新驗證"}
          </Btn>
        </View>
      </View>
    </Card>
  );
}

function PlatformCard({
  item,
  busy,
  onToggle,
  onReauth,
  onOpenBinding,
}: {
  item: EnrichedPresence;
  busy: boolean;
  onToggle: (item: EnrichedPresence) => void;
  onReauth: (item: EnrichedPresence) => void;
  onOpenBinding: () => void;
}) {
  const onlineAction = buildActionState(
    item.record,
    ["go_online", "set_online", "online"],
    item.record.status === "offline"
      ? {
          action: "go_online",
          enabled: !item.record.reauthRequired,
          disabledReasonCode: item.record.reauthRequired
            ? "reauth_required"
            : undefined,
          riskLevel: "medium",
        }
      : null,
  );
  const offlineAction = buildActionState(
    item.record,
    ["go_offline", "set_offline", "offline"],
    item.record.status === "online"
      ? {
          action: "go_offline",
          enabled: true,
          riskLevel: "medium",
        }
      : null,
  );
  const reauthAction = buildActionState(
    item.record,
    ["reauthenticate", "reauth", "resolve_reauth"],
    item.record.reauthRequired
      ? {
          action: "reauthenticate",
          enabled: true,
          riskLevel: "medium",
        }
      : null,
  );
  const bindingAction = buildActionState(
    item.record,
    ["view_binding_details", "manage_binding", "open_settings"],
    {
      action: "view_binding_details",
      enabled: true,
      riskLevel: "low",
    },
  );
  const lastSync = formatCompactDateTime(
    item.adapterStatus?.lastSyncAt ??
      item.record.lastOnlineAt ??
      item.record.lastOfflineAt ??
      item.record.updatedAt,
  );

  return (
    <Card
      theme={THEME}
      padding={14}
      style={[
        styles.platformCard,
        {
          borderColor:
            item.statusTone === "danger"
              ? THEME.dangerBorder
              : item.statusTone === "warn"
                ? THEME.warnBorder
                : THEME.border,
        },
      ]}
    >
      <View style={styles.platformHeader}>
        <View style={styles.platformIdentity}>
          <View
            style={[
              styles.platformMark,
              {
                backgroundColor: item.forwarded ? THEME.warnBg : THEME.accentBg,
              },
            ]}
          >
            <Text
              style={[
                styles.platformMarkText,
                {
                  color: item.forwarded ? THEME.warn : THEME.accentHi,
                  fontFamily: THEME.monoFamily,
                },
              ]}
            >
              {String(item.record.platformCode).slice(0, 3).toUpperCase()}
            </Text>
          </View>
          <View style={styles.platformNameBlock}>
            <View style={styles.platformNameRow}>
              <Text style={[styles.platformName, { color: THEME.text }]}>
                {item.displayName}
              </Text>
              <Pill theme={THEME} tone={item.forwarded ? "warn" : "accent"}>
                {item.forwarded
                  ? driverStrings.platformPresence.external
                  : driverStrings.platformPresence.owned}
              </Pill>
              <Pill theme={THEME} tone={item.statusTone} dot>
                {item.statusLabel}
              </Pill>
            </View>
            <Text style={[styles.platformSubline, { color: THEME.textMuted }]}>
              {item.record.platformCode} · 最後同步 {lastSync}
            </Text>
          </View>
        </View>
        {busy ? <ActivityIndicator size="small" color={THEME.accent} /> : null}
      </View>

      <View style={styles.cardSection}>
        <DL
          theme={THEME}
          cols={2}
          items={[
            {
              label: "接單狀態",
              value: item.canReceive ? "可以接單" : "暫停接單",
            },
            {
              label: "Token",
              value: formatTokenExpiry(item.record.tokenExpiresAt),
            },
            { label: "資格", value: item.record.eligibility },
            { label: "重新授權", value: item.mechanismLabel },
          ]}
        />
      </View>

      {item.blockingReasons.length > 0 ? (
        <View
          style={[
            styles.reasonPanel,
            {
              backgroundColor:
                item.statusTone === "danger" ? THEME.dangerBg : THEME.warnBg,
              borderColor:
                item.statusTone === "danger"
                  ? THEME.dangerBorder
                  : THEME.warnBorder,
            },
          ]}
        >
          <Text
            style={[styles.reasonTitle, { color: toneColor(item.statusTone) }]}
          >
            為何目前無法派單
          </Text>
          <View style={styles.reasonList}>
            {item.blockingReasons.map((reason) => (
              <Text
                key={reason}
                style={[styles.reasonItem, { color: THEME.text }]}
              >
                • {reason}
              </Text>
            ))}
          </View>
        </View>
      ) : null}

      {(item.record.eligibleServiceBuckets?.length ?? 0) > 0 ? (
        <View style={styles.bucketRow}>
          {(item.record.eligibleServiceBuckets ?? []).map((bucket: string) => (
            <Pill key={bucket} theme={THEME} tone="success">
              {bucket}
            </Pill>
          ))}
        </View>
      ) : null}

      <View style={styles.platformActions}>
        {reauthAction ? (
          <Btn
            theme={THEME}
            variant="primary"
            size="sm"
            disabled={busy || !reauthAction.enabled}
            onPress={() => onReauth(item)}
          >
            {item.actionLabel}
          </Btn>
        ) : null}
        {onlineAction ? (
          <Btn
            theme={THEME}
            variant="secondary"
            size="sm"
            disabled={busy || !onlineAction.enabled}
            onPress={() => onToggle(item)}
          >
            上線
          </Btn>
        ) : null}
        {offlineAction ? (
          <Btn
            theme={THEME}
            variant="secondary"
            size="sm"
            disabled={busy || !offlineAction.enabled}
            onPress={() => onToggle(item)}
          >
            下線
          </Btn>
        ) : null}
        {bindingAction ? (
          <Btn
            theme={THEME}
            variant="ghost"
            size="sm"
            disabled={busy || !bindingAction.enabled}
            onPress={onOpenBinding}
          >
            帳號詳情
          </Btn>
        ) : null}
      </View>
    </Card>
  );
}

export default function PlatformPresenceScreen() {
  const router = useRouter();
  const [summary, setSummary] = useState<PlatformPresenceViewSummary | null>(
    null,
  );
  const [loading, setLoading] = useState(true);
  const [refreshing, setRefreshing] = useState(false);
  const [busyPlatform, setBusyPlatform] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [filter, setFilter] = useState<PresenceFilter>("all");
  const [manualReauth, setManualReauth] = useState<ManualReauthState | null>(
    null,
  );
  const [lastLoadedAt, setLastLoadedAt] = useState<string | null>(null);

  const isProvisioned = isDriverIdentityProvisioned();

  const loadPresence = async ({
    silent = false,
  }: { silent?: boolean } = {}) => {
    if (!isProvisioned) {
      setLoading(false);
      return;
    }

    const client = getDriverClient();

    try {
      const nextSummary =
        (await client.getPlatformPresence()) as PlatformPresenceViewSummary;
      setSummary({
        ...nextSummary,
        refreshTier: nextSummary.refreshTier ?? "medium",
      });
      setError(null);
      setLastLoadedAt(new Date().toISOString());
    } catch (loadError) {
      const message = `平台連線資料載入失敗：${toErrorMessage(loadError)}`;
      setError(message);
      if (!silent) {
        setSummary(null);
      }
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    void loadPresence();
    const timer = setInterval(() => {
      void loadPresence({ silent: true });
    }, REFRESH_INTERVAL_MS);
    return () => clearInterval(timer);
  }, []);

  const onRefresh = async () => {
    setRefreshing(true);
    await loadPresence();
    setRefreshing(false);
  };

  const enrichedPresences = useMemo<EnrichedPresence[]>(() => {
    if (!summary) {
      return [];
    }

    const adapterMap = new Map<
      PlatformPresenceAdapterStatusRecord["platformCode"],
      PlatformPresenceAdapterStatusRecord
    >(
      (summary.adapterStatuses ?? []).map(
        (entry: PlatformPresenceAdapterStatusRecord) => [
          entry.platformCode,
          entry,
        ],
      ),
    );

    return [...summary.presences]
      .map<EnrichedPresence>((rawRecord) => {
        const record = rawRecord as PlatformPresenceViewRecord;
        const adapterStatus = adapterMap.get(record.platformCode);
        const canReceive = canReceiveOrders(record, adapterStatus);
        const blockingReasons = deriveBlockingReasons(record, adapterStatus);
        const mechanism = getPlatformReauthMechanism(record);
        const displayName = getPlatformDisplayName(record);
        const forwarded = !isOwnedPlatform(record);
        const attention =
          record.reauthRequired ||
          record.eligibility !== "eligible" ||
          adapterStatus?.status === "degraded" ||
          adapterStatus?.status === "down" ||
          !canReceive;

        const baseItem = {
          record,
          adapterStatus,
          displayName,
          forwarded,
          canReceive,
          blockingReasons,
          mechanismLabel: getMechanismLabel(mechanism),
          actionLabel: getMechanismActionLabel(mechanism),
          attention,
          statusTone: "neutral" as const,
          statusLabel: "",
        };

        const statusLabel = getStatusLabel(baseItem);
        const statusTone = getStatusTone({ ...baseItem, statusLabel });

        return {
          ...baseItem,
          statusLabel,
          statusTone,
        };
      })
      .sort((left, right) => {
        const attentionDelta = Number(right.attention) - Number(left.attention);
        if (attentionDelta !== 0) {
          return attentionDelta;
        }
        const readyDelta = Number(right.canReceive) - Number(left.canReceive);
        if (readyDelta !== 0) {
          return readyDelta;
        }
        return left.displayName.localeCompare(right.displayName, "zh-TW");
      });
  }, [summary]);

  const filteredPresences = useMemo(
    () => enrichedPresences.filter((item) => matchesFilter(item, filter)),
    [enrichedPresences, filter],
  );

  const emptyReason = resolveEmptyReason({
    isProvisioned,
    summary,
    filteredCount: filteredPresences.length,
    permissionDenied: isPermissionDeniedError(error),
    fetchFailed: Boolean(error),
  });

  const availableCount = enrichedPresences.filter(
    (item) => item.canReceive,
  ).length;
  const attentionCount = enrichedPresences.filter(
    (item) => item.attention,
  ).length;
  const reauthCount = enrichedPresences.filter(
    (item) => item.record.reauthRequired,
  ).length;
  const degradedCount = enrichedPresences.filter(
    (item) =>
      item.adapterStatus?.status === "degraded" ||
      item.adapterStatus?.status === "down",
  ).length;
  const subtitle = `${enrichedPresences.length} 個平台 · ${availableCount} 可接單 · ${attentionCount} 需處理`;

  const handleTogglePresence = async (item: EnrichedPresence) => {
    const nextAction = item.record.status === "online" ? "下線" : "上線";
    Alert.alert(
      `${item.displayName}${nextAction}`,
      `確定要將 ${item.displayName} 設為${nextAction}嗎？此操作會影響平台是否派單給您。`,
      [
        { text: "取消", style: "cancel" },
        {
          text: `確認${nextAction}`,
          onPress: async () => {
            setBusyPlatform(item.record.platformCode);
            try {
              const client = getDriverClient();
              if (item.record.status === "online") {
                await client.setPlatformOffline({
                  platformCode: item.record.platformCode,
                });
              } else {
                await client.setPlatformOnline({
                  platformCode: item.record.platformCode,
                });
              }
              await onRefresh();
            } catch (toggleError) {
              Alert.alert("無法更新平台狀態", toErrorMessage(toggleError));
            } finally {
              setBusyPlatform(null);
            }
          },
        },
      ],
    );
  };

  const openExternalTarget = async (
    url: string | null | undefined,
    fallback: string,
  ) => {
    if (!url) {
      Alert.alert("缺少跳轉目標", fallback);
      return;
    }
    try {
      await Linking.openURL(url);
    } catch (linkError) {
      Alert.alert("無法開啟目標", toErrorMessage(linkError));
    }
  };

  const handleReauth = async (item: EnrichedPresence) => {
    const mechanism = getPlatformReauthMechanism(item.record);

    switch (mechanism) {
      case "manual_credential":
        setManualReauth({
          platformCode: item.record.platformCode,
          displayName: item.displayName,
          tokenExpiresAt: "",
        });
        return;
      case "ops_managed":
        Alert.alert(
          "請聯絡派車台",
          `${item.displayName} 的重新授權由營運端處理。請透過設定頁或值班流程聯絡派車台。`,
          [
            { text: "稍後處理", style: "cancel" },
            { text: "前往設定", onPress: () => router.push("/settings") },
          ],
        );
        return;
      case "native_app_deeplink":
        await openExternalTarget(
          item.record.nativeAppUrl,
          `${item.displayName} 需要平台 App 深連結，但目前 API 尚未提供目標 URL。`,
        );
        return;
      case "external_browser_oauth":
      default:
        await openExternalTarget(
          item.record.reauthUrl,
          `${item.displayName} 需要外部瀏覽器 OAuth，但目前 API 尚未提供授權 URL。`,
        );
    }
  };

  const submitManualReauth = async () => {
    if (!manualReauth) {
      return;
    }

    setBusyPlatform(manualReauth.platformCode);
    try {
      const client = getDriverClient();
      await client.setPlatformOnline({
        platformCode: manualReauth.platformCode,
        tokenExpiresAt: manualReauth.tokenExpiresAt.trim() || null,
      });
      setManualReauth(null);
      await onRefresh();
      Alert.alert("已送出重新驗證", "請依平台規範完成後續人工審核或憑證補件。");
    } catch (submitError) {
      Alert.alert("無法送出重新驗證", toErrorMessage(submitError));
    } finally {
      setBusyPlatform(null);
    }
  };

  const emptyState = emptyReason ? emptyStateCopy(emptyReason) : null;

  if (loading && !summary && !emptyState) {
    return (
      <Shell theme={THEME} contentContainerStyle={styles.loadingShellContent}>
        <PageHeader
          theme={THEME}
          title={driverStrings.platformPresence.title}
          subtitle="載入中…"
        />
        <View style={styles.loadingCard}>
          <ActivityIndicator size="large" color={THEME.accent} />
          <Text style={[styles.loadingLabel, { color: THEME.textMuted }]}>
            載入平台健康中心…
          </Text>
        </View>
      </Shell>
    );
  }

  return (
    <Shell theme={THEME} contentContainerStyle={styles.shellContent}>
      <PageHeader
        theme={THEME}
        title={driverStrings.platformPresence.title}
        subtitle={subtitle}
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

      <Card
        theme={THEME}
        title="Platform Health Center"
        subtitle="依 spec §5.6 / Q-DRV05 / Q-DRV07 顯示平台派單可用性"
      >
        <DL
          theme={THEME}
          cols={2}
          items={[
            { label: "Refresh tier", value: REFRESH_TIER_LABEL },
            {
              label: "最後更新",
              value: formatCompactDateTime(
                summary?.refreshMeta?.generatedAt ?? lastLoadedAt,
              ),
            },
            {
              label: "資料來源",
              value: summary?.refreshMeta?.source ?? "live",
            },
            {
              label: "Binding 管理",
              value: "設定 / Settings",
            },
          ]}
        />
      </Card>

      <View style={styles.kpiRow}>
        <KPI theme={THEME} label="可接單" value={String(availableCount)} />
        <KPI theme={THEME} label="需重授權" value={String(reauthCount)} />
        <KPI theme={THEME} label="同步異常" value={String(degradedCount)} />
      </View>

      <PresenceFilterTabs activeFilter={filter} onChange={setFilter} />

      {error && summary ? (
        <Banner
          theme={THEME}
          tone="danger"
          title="最近一次同步失敗"
          body={error}
          icon={<Ionicons name="alert-circle" size={16} color={THEME.danger} />}
        />
      ) : null}

      {manualReauth ? (
        <ManualReauthCard
          state={manualReauth}
          busy={busyPlatform === manualReauth.platformCode}
          onChange={(next) =>
            setManualReauth((current) =>
              current ? { ...current, tokenExpiresAt: next } : current,
            )
          }
          onCancel={() => setManualReauth(null)}
          onSubmit={() => void submitManualReauth()}
        />
      ) : null}

      <MechanismLegend />

      {emptyState ? (
        <Banner
          theme={THEME}
          tone={emptyState.tone}
          title={emptyState.title}
          body={emptyState.body}
          icon={
            <Ionicons
              name={
                emptyState.tone === "danger"
                  ? "alert-circle"
                  : emptyState.tone === "warn"
                    ? "warning"
                    : "information-circle"
              }
              size={16}
              color={
                emptyState.tone === "danger"
                  ? THEME.danger
                  : emptyState.tone === "warn"
                    ? THEME.warn
                    : THEME.info
              }
            />
          }
          actions={
            emptyState.cta?.route ? (
              <Btn
                theme={THEME}
                variant="primary"
                size="sm"
                onPress={() =>
                  router.push(emptyState.cta?.route ?? "/settings")
                }
              >
                {emptyState.cta.label}
              </Btn>
            ) : undefined
          }
        />
      ) : (
        <View style={styles.platformList}>
          {filteredPresences.map((item) => (
            <PlatformCard
              key={item.record.platformCode}
              item={item}
              busy={busyPlatform === item.record.platformCode}
              onToggle={(next) => void handleTogglePresence(next)}
              onReauth={(next) => void handleReauth(next)}
              onOpenBinding={() => router.push("/settings")}
            />
          ))}
        </View>
      )}

      {summary?.notes?.length ? (
        <Card theme={THEME} title={driverStrings.platformPresence.notesTitle}>
          <View style={styles.notesList}>
            {summary.notes.map((note: string) => (
              <Text
                key={note}
                style={[styles.noteText, { color: THEME.textMuted }]}
              >
                • {note}
              </Text>
            ))}
          </View>
        </Card>
      ) : null}
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
    gap: 16,
  },
  loadingCard: {
    alignItems: "center",
    justifyContent: "center",
    gap: 12,
    minHeight: 180,
  },
  loadingLabel: {
    fontSize: 14,
  },
  kpiRow: {
    flexDirection: "row",
    gap: 8,
  },
  filterRow: {
    flexDirection: "row",
    flexWrap: "wrap",
    gap: 8,
  },
  filterChip: {
    borderWidth: 1,
    borderRadius: 999,
    paddingHorizontal: 12,
    paddingVertical: 7,
  },
  filterChipText: {
    fontSize: 12.5,
    fontWeight: "700",
  },
  platformList: {
    gap: 10,
  },
  platformCard: {
    borderWidth: 1,
  },
  platformHeader: {
    flexDirection: "row",
    justifyContent: "space-between",
    alignItems: "flex-start",
    gap: 10,
  },
  platformIdentity: {
    flexDirection: "row",
    flex: 1,
    gap: 12,
  },
  platformMark: {
    width: 44,
    height: 44,
    borderRadius: 14,
    alignItems: "center",
    justifyContent: "center",
  },
  platformMarkText: {
    fontSize: 13,
    fontWeight: "800",
    letterSpacing: 0.5,
  },
  platformNameBlock: {
    flex: 1,
    gap: 4,
  },
  platformNameRow: {
    flexDirection: "row",
    alignItems: "center",
    gap: 6,
    flexWrap: "wrap",
  },
  platformName: {
    fontSize: 15,
    fontWeight: "700",
  },
  platformSubline: {
    fontSize: 12,
    lineHeight: 17,
  },
  cardSection: {
    marginTop: 12,
  },
  reasonPanel: {
    marginTop: 12,
    borderWidth: 1,
    borderRadius: 12,
    padding: 12,
    gap: 8,
  },
  reasonTitle: {
    fontSize: 12.5,
    fontWeight: "700",
  },
  reasonList: {
    gap: 4,
  },
  reasonItem: {
    fontSize: 12.5,
    lineHeight: 18,
  },
  bucketRow: {
    flexDirection: "row",
    flexWrap: "wrap",
    gap: 6,
    marginTop: 12,
  },
  platformActions: {
    flexDirection: "row",
    flexWrap: "wrap",
    gap: 8,
    marginTop: 14,
  },
  legendList: {
    gap: 8,
  },
  legendItem: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "space-between",
    gap: 10,
  },
  legendText: {
    flex: 1,
    fontSize: 12,
    lineHeight: 17,
    textAlign: "right",
  },
  manualCardBody: {
    gap: 12,
  },
  manualHint: {
    fontSize: 12.5,
    lineHeight: 18,
  },
  fieldBlock: {
    gap: 6,
  },
  fieldLabel: {
    fontSize: 12,
    fontWeight: "600",
  },
  textInput: {
    minHeight: 42,
    borderWidth: 1,
    borderRadius: 12,
    paddingHorizontal: 12,
    paddingVertical: 10,
    fontSize: 13,
  },
  manualActions: {
    flexDirection: "row",
    justifyContent: "flex-end",
    gap: 8,
  },
  notesList: {
    gap: 8,
  },
  noteText: {
    fontSize: 12.5,
    lineHeight: 18,
  },
});
