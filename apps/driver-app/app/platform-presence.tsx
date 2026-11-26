import { useEffect, useMemo, useState } from "react";
import { Ionicons } from "@expo/vector-icons";
import * as Linking from "expo-linking";
import { Redirect } from "expo-router";
import {
  ActivityIndicator,
  Alert,
  Pressable,
  StyleSheet,
  Text,
  View,
} from "react-native";
import {
  PLATFORM_CODE_REGISTRY,
  type EmptyReason,
  type PlatformPresenceAdapterStatusRecord,
  type PlatformPresenceRecord,
} from "@drts/contracts";

import {
  Banner,
  Btn,
  Card,
  DL,
  PageHeader,
  Pill,
  Shell,
  driverCanvasTheme,
} from "@/components/canvas-primitives";
import {
  formatDriverError,
  getDriverClient,
  isDriverIdentityProvisioned,
  registerProtectedCacheClearHandler,
} from "@/lib/api-client";
import {
  canReceiveOrders,
  deriveBlockingReasons,
  getEligibilityLabel,
  getPlatformReauthUrl,
  resolveEmptyReason,
  type PlatformPresenceViewRecord,
  type PlatformPresenceViewSummary,
  type PresenceFilter,
} from "@/lib/platform-presence-view";
import { driverStrings } from "@/lib/strings";

const THEME = driverCanvasTheme;
const REFRESH_INTERVAL_MS = 15_000;
const REFRESH_TIER_LABEL = "每 15 秒自動更新";
// Filters only help once there are more platforms than fit on one screen.
const FILTER_MIN_PLATFORMS = 4;
const DATA_SOURCE_LABELS: Record<string, string> = {
  live: "即時",
  cache: "快取",
  sandbox: "測試環境",
  static: "靜態資料",
};

type EnrichedPresence = {
  record: PlatformPresenceViewRecord;
  adapterStatus?: PlatformPresenceAdapterStatusRecord;
  displayName: string;
  forwarded: boolean;
  canReceive: boolean;
  blockingReasons: string[];
  reauthUrl: string | null;
  attention: boolean;
  statusTone: "success" | "warn" | "danger" | "info" | "neutral";
  statusLabel: string;
};

function toErrorMessage(error: unknown): string {
  return formatDriverError(error, driverStrings.common.requestFailed);
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
    return "—";
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
  if (item.record.status === "busy") {
    return "載客中";
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
} {
  switch (reason) {
    case "not_provisioned":
      // Drivers cannot bind a platform themselves; the fleet does it.
      return {
        title: "還沒有綁定外部平台",
        body: "車隊派單不用綁定，上班打卡後就能接單。外部平台帳號由車隊幫您綁定，需要請聯絡派車台。",
        tone: "info",
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
        body: "所有外部平台目前都無法正常運作，請先查看需處理平台或聯絡派車台。",
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
        body: "切換到「全部」查看其他平台。",
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

function PlatformCard({
  item,
  onReauth,
}: {
  item: EnrichedPresence;
  onReauth: (item: EnrichedPresence) => void;
}) {
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
                { color: item.forwarded ? THEME.warn : THEME.accentHi },
              ]}
            >
              {item.displayName.slice(0, 1)}
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
              最後同步 {lastSync}
            </Text>
          </View>
        </View>
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
              label: "授權期限",
              value: formatTokenExpiry(item.record.tokenExpiresAt),
            },
            {
              label: "資格",
              value: getEligibilityLabel(item.record.eligibility),
            },
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

      {/* Bindings are read-only here: the app does not report platform
          heartbeats, so a status the driver sets goes stale and then blocks
          the driver's own fleet dispatch. */}
      {item.record.reauthRequired ? (
        item.reauthUrl ? (
          <View style={styles.platformActions}>
            <Btn
              theme={THEME}
              variant="primary"
              size="sm"
              onPress={() => onReauth(item)}
            >
              {`重新登入${item.displayName}`}
            </Btn>
          </View>
        ) : (
          <Text style={[styles.reauthNote, { color: THEME.textMuted }]}>
            {reauthUnavailableMessage(item.displayName)}
          </Text>
        )
      ) : null}
    </Card>
  );
}

function reauthUnavailableMessage(displayName: string): string {
  return `暫時無法在 App 內重新登入${displayName}，請聯絡派車台。`;
}

export default function PlatformPresenceScreen() {
  const [summary, setSummary] = useState<PlatformPresenceViewSummary | null>(
    null,
  );
  const [loading, setLoading] = useState(true);
  const [refreshing, setRefreshing] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [filter, setFilter] = useState<PresenceFilter>("all");
  const [lastLoadedAt, setLastLoadedAt] = useState<string | null>(null);

  const isProvisioned = isDriverIdentityProvisioned();

  useEffect(() => {
    const unregister = registerProtectedCacheClearHandler(() => {
      setSummary(null);
    });
    return () => unregister();
  }, []);

  const loadPresence = async ({
    silent = false,
  }: { silent?: boolean } = {}) => {
    if (!isDriverIdentityProvisioned()) {
      setSummary(null);
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
    if (isProvisioned) {
      void loadPresence();
      const timer = setInterval(() => {
        void loadPresence({ silent: true });
      }, REFRESH_INTERVAL_MS);
      return () => clearInterval(timer);
    } else {
      setLoading(false);
    }
  }, [isProvisioned]);

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
          reauthUrl: getPlatformReauthUrl(record),
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
  const hasPlatforms = enrichedPresences.length > 0;
  const subtitle = hasPlatforms
    ? `${enrichedPresences.length} 個平台 · ${availableCount} 可接單 · ${attentionCount} 需處理`
    : undefined;
  const dataSource = summary?.refreshMeta?.source ?? "live";
  const refreshLine = [
    `最後更新 ${formatCompactDateTime(summary?.refreshMeta?.generatedAt ?? lastLoadedAt)}`,
    REFRESH_TIER_LABEL,
    dataSource === "live" ? null : (DATA_SOURCE_LABELS[dataSource] ?? null),
  ]
    .filter(Boolean)
    .join(" · ");
  // Never keep showing platform data the driver is no longer allowed to read.
  const showPlatformList =
    filteredPresences.length > 0 && emptyReason !== "permission_denied";

  const handleReauth = async (item: EnrichedPresence) => {
    if (!item.reauthUrl) {
      return;
    }
    try {
      await Linking.openURL(item.reauthUrl);
    } catch {
      Alert.alert(
        `無法開啟${item.displayName}`,
        reauthUnavailableMessage(item.displayName),
      );
    }
  };

  if (!isProvisioned) {
    return <Redirect href="/onboarding" />;
  }

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
            載入平台連線中…
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

      {/* Still say so when test or cached data shows no platforms. */}
      {hasPlatforms || dataSource !== "live" ? (
        <Text style={[styles.refreshLine, { color: THEME.textMuted }]}>
          {refreshLine}
        </Text>
      ) : null}

      {enrichedPresences.length >= FILTER_MIN_PLATFORMS ? (
        <PresenceFilterTabs activeFilter={filter} onChange={setFilter} />
      ) : null}

      {error && summary ? (
        <Banner
          theme={THEME}
          tone="danger"
          title="最近一次同步失敗"
          body={error}
          icon={<Ionicons name="alert-circle" size={16} color={THEME.danger} />}
        />
      ) : null}

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
        />
      ) : null}

      {/* A warning about every platform still lists them, so the driver can
          see which one and why. Summary notes are never shown to drivers. */}
      {showPlatformList ? (
        <View style={styles.platformList}>
          {filteredPresences.map((item) => (
            <PlatformCard
              key={item.record.platformCode}
              item={item}
              onReauth={(next) => void handleReauth(next)}
            />
          ))}
        </View>
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
  refreshLine: {
    fontSize: 12,
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
  reauthNote: {
    marginTop: 12,
    fontSize: 12.5,
    lineHeight: 18,
  },
  platformActions: {
    flexDirection: "row",
    flexWrap: "wrap",
    gap: 8,
    marginTop: 14,
  },
});
