import { useEffect, useMemo, useState } from "react";
import { Ionicons } from "@expo/vector-icons";
import { useRouter } from "expo-router";
import {
  ActivityIndicator,
  Alert,
  StyleSheet,
  Switch,
  Text,
  View,
} from "react-native";
import {
  PLATFORM_CODE_REGISTRY,
  type PlatformPresenceAdapterStatusRecord,
  type PlatformPresenceRecord,
  type PlatformPresenceSummary,
} from "@drts/contracts";
import type { CanvasTone } from "@drts/ui-web/canvas-tokens";

import {
  Banner,
  Btn,
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
import { driverStrings } from "@/lib/strings";

type EnrichedPresence = {
  record: PlatformPresenceRecord;
  adapterStatus?: PlatformPresenceAdapterStatusRecord;
  assessment: PlatformHealthAssessment;
  displayName: string;
  forwarded: boolean;
};

const THEME = driverCanvasTheme;
const PLATFORM_RULES_COPY =
  "上線狀態為平台是否可發送訂單給您的依據。離線時不會收到該平台訂單；自營派單與外部平台可同時上線。";

function toErrorMessage(error: unknown): string {
  if (error instanceof Error && error.message.trim()) {
    return error.message.trim();
  }
  return driverStrings.common.requestFailed;
}

function formatCompactDateTime(value: string | null | undefined): string {
  if (!value) {
    return driverStrings.common.notUpdatedYet;
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

function isPlatformSwitchOn(record: PlatformPresenceRecord): boolean {
  return record.status === "online" && !record.reauthRequired;
}

function getStatusTone(item: EnrichedPresence): CanvasTone {
  if (item.record.reauthRequired) {
    return "warn";
  }
  if (
    item.record.status === "online" &&
    (item.adapterStatus?.status === "degraded" ||
      item.adapterStatus?.status === "down" ||
      item.record.eligibility !== "eligible" ||
      item.assessment.tokenInfo.urgency === "warning" ||
      item.assessment.tokenInfo.urgency === "urgent" ||
      item.assessment.tokenInfo.urgency === "expired")
  ) {
    return "warn";
  }
  if (isPlatformSwitchOn(item.record)) {
    return "success";
  }
  return "neutral";
}

function getStatusToneColor(tone: CanvasTone): string {
  switch (tone) {
    case "success":
      return THEME.success;
    case "warn":
      return THEME.warn;
    case "danger":
      return THEME.danger;
    case "info":
      return THEME.info;
    case "accent":
      return THEME.accent;
    case "neutral":
    default:
      return THEME.textMuted;
  }
}

function getStatusLabel(item: EnrichedPresence): string {
  if (item.record.reauthRequired) {
    return "需重新授權";
  }
  return isPlatformSwitchOn(item.record) ? "上線中" : "離線";
}

function needsAttention(item: EnrichedPresence): boolean {
  if (item.record.reauthRequired) {
    return true;
  }
  if (item.record.eligibility !== "eligible") {
    return true;
  }
  if (
    item.adapterStatus?.status === "degraded" ||
    item.adapterStatus?.status === "down"
  ) {
    return true;
  }
  return (
    item.assessment.tokenInfo.urgency === "warning" ||
    item.assessment.tokenInfo.urgency === "urgent" ||
    item.assessment.tokenInfo.urgency === "expired"
  );
}

function getTodayTripCount(item: EnrichedPresence): number {
  return isPlatformSwitchOn(item.record) ? 1 : 0;
}

function PlatformCard({
  item,
  busy,
  onToggle,
  onReauth,
}: {
  item: EnrichedPresence;
  busy: boolean;
  onToggle: () => void;
  onReauth: () => void;
}) {
  const { record, adapterStatus, displayName, forwarded } = item;
  const isReauth = record.reauthRequired;
  const isOnline = isPlatformSwitchOn(record);
  const statusTone = getStatusTone(item);
  const statusColor = getStatusToneColor(statusTone);
  const lastSyncSource =
    record.status === "online"
      ? (record.lastOnlineAt ?? record.updatedAt)
      : (record.lastOfflineAt ?? record.updatedAt);
  const lastSyncCompact = formatCompactDateTime(
    adapterStatus?.lastSyncAt ?? lastSyncSource,
  );
  const tokenExpiry = formatTokenExpiry(record.tokenExpiresAt);
  const todayCount = getTodayTripCount(item);
  const codeColor = forwarded ? THEME.warn : THEME.accentHi;
  const codeBg = forwarded ? THEME.warnBg : THEME.accentBg;

  return (
    <View
      style={[
        styles.platformCard,
        {
          backgroundColor: THEME.surface,
          borderColor: isReauth ? `${THEME.warn}60` : THEME.border,
        },
      ]}
    >
      <View style={styles.platformCardRow}>
        <View style={[styles.platformMark, { backgroundColor: codeBg }]}>
          <Text
            style={[
              styles.platformMarkText,
              { color: codeColor, fontFamily: THEME.monoFamily },
            ]}
          >
            {String(record.platformCode).slice(0, 3).toUpperCase()}
          </Text>
        </View>

        <View style={styles.platformMain}>
          <View style={styles.platformNameRow}>
            <Text style={[styles.platformName, { color: THEME.text }]}>
              {displayName}
            </Text>
            {forwarded ? (
              <Pill theme={THEME} tone="warn">
                {driverStrings.platformPresence.external}
              </Pill>
            ) : null}
          </View>

          <View style={styles.platformMetaRow}>
            <View
              style={[styles.platformStatusDot, { backgroundColor: statusColor }]}
            />
            <Text style={[styles.platformMetaText, { color: THEME.textMuted }]}>
              {getStatusLabel(item)}
            </Text>
            <View
              style={[
                styles.platformMetaDivider,
                { backgroundColor: THEME.borderStrong },
              ]}
            />
            <Text
              style={[
                styles.platformMetaTime,
                { color: THEME.textMuted, fontFamily: THEME.monoFamily },
              ]}
            >
              {lastSyncCompact}
            </Text>
          </View>
        </View>

        <View style={styles.platformSwitchColumn}>
          {busy ? (
            <ActivityIndicator size="small" color={THEME.accent} />
          ) : null}
          <Switch
            accessibilityLabel={`${displayName} 平台上線切換`}
            value={isOnline}
            onValueChange={onToggle}
            disabled={busy || isReauth}
            trackColor={{
              false: THEME.borderStrong,
              true: THEME.accentHi,
            }}
            thumbColor={isOnline ? THEME.accent : "#FFFFFF"}
          />
        </View>
      </View>

      {isReauth ? (
        <View
          style={[
            styles.platformReauth,
            {
              backgroundColor: THEME.warnBg,
              borderTopColor: `${THEME.warn}30`,
            },
          ]}
        >
          <Ionicons name="lock-open-outline" size={14} color={THEME.warn} />
          <Text
            style={[
              styles.platformReauthText,
              { color: THEME.warn, fontFamily: THEME.fontFamily },
            ]}
          >
            Token 已過期，請重新授權
          </Text>
          <Btn
            theme={THEME}
            variant="primary"
            size="sm"
            onPress={onReauth}
            disabled={busy}
            style={{
              backgroundColor: THEME.warn,
              borderColor: THEME.warn,
            }}
          >
            重新授權
          </Btn>
        </View>
      ) : null}

      <View style={[styles.platformFooter, { borderTopColor: THEME.border }]}>
        <View style={styles.platformFooterToken}>
          <Text
            style={[styles.platformFooterLabel, { color: THEME.textMuted }]}
          >
            Token：
          </Text>
          <Text
            style={[
              styles.platformFooterValue,
              { color: THEME.textMuted, fontFamily: THEME.monoFamily },
            ]}
          >
            {tokenExpiry}
          </Text>
        </View>

        <View style={styles.platformFooterToday}>
          <Text
            style={[styles.platformFooterLabel, { color: THEME.textMuted }]}
          >
            今日
          </Text>
          <Text
            style={[
              styles.platformFooterTodayCount,
              { color: THEME.text, fontFamily: THEME.monoFamily },
            ]}
          >
            {todayCount}
          </Text>
          <Text
            style={[styles.platformFooterLabel, { color: THEME.textMuted }]}
          >
            單
          </Text>
        </View>
      </View>
    </View>
  );
}

function PlatformRulesBanner({ notes = [] }: { notes?: string[] }) {
  return (
    <Banner
      theme={THEME}
      tone="info"
      icon={
        <Ionicons name="information-circle" size={16} color={THEME.info} />
      }
      body={
        <View style={styles.infoBannerBody}>
          <Text
            style={[
              styles.infoBannerRule,
              { color: THEME.text, fontFamily: THEME.fontFamily },
            ]}
          >
            {PLATFORM_RULES_COPY}
          </Text>
          {notes.length > 0 ? (
            <View style={styles.infoBannerNotes}>
              {notes.map((note) => (
                <View key={note} style={styles.infoBannerNoteRow}>
                  <Ionicons name="sync-outline" size={12} color={THEME.info} />
                  <Text
                    style={[
                      styles.infoBannerNoteText,
                      { color: THEME.text, fontFamily: THEME.fontFamily },
                    ]}
                  >
                    {note}
                  </Text>
                </View>
              ))}
            </View>
          ) : null}
        </View>
      }
    />
  );
}

export default function PlatformPresenceScreen() {
  const router = useRouter();
  const [summary, setSummary] = useState<PlatformPresenceSummary | null>(null);
  const [loading, setLoading] = useState(true);
  const [refreshing, setRefreshing] = useState(false);
  const [busyPlatform, setBusyPlatform] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);

  const isProvisioned = isDriverIdentityProvisioned();

  const loadPresence = async () => {
    if (!isProvisioned) {
      setLoading(false);
      return;
    }

    const client = getDriverClient();

    try {
      const nextSummary = await client.getPlatformPresence();
      setSummary(nextSummary);
      setError(null);
    } catch (loadError) {
      setSummary(null);
      setError(`平台連線資料載入失敗：${toErrorMessage(loadError)}`);
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    void loadPresence();
  }, []);

  const onRefresh = async () => {
    setRefreshing(true);
    await loadPresence();
    setRefreshing(false);
  };

  const handleTogglePresence = async (record: PlatformPresenceRecord) => {
    setBusyPlatform(record.platformCode);
    const client = getDriverClient();

    try {
      if (record.status === "online") {
        await client.setPlatformOffline({ platformCode: record.platformCode });
      } else {
        await client.setPlatformOnline({ platformCode: record.platformCode });
      }
      await onRefresh();
    } catch (toggleError) {
      Alert.alert(
        "無法更新平台狀態",
        `「${record.platformCode}」狀態更新失敗：${toErrorMessage(toggleError)}`,
      );
    } finally {
      setBusyPlatform(null);
    }
  };

  const handleReauth = (record: PlatformPresenceRecord) => {
    Alert.alert(
      "重新驗證平台",
      `要為「${record.platformCode}」重新啟動平台驗證嗎？`,
      [
        { text: "取消", style: "cancel" },
        {
          text: "確認",
          onPress: async () => {
            setBusyPlatform(record.platformCode);
            try {
              const client = getDriverClient();
              await client.setPlatformOnline({
                platformCode: record.platformCode,
                tokenExpiresAt: null,
              });
              await onRefresh();
              Alert.alert(
                "已送出重新驗證",
                `請完成 ${record.platformCode} 的平台驗證流程。`,
              );
            } catch (reauthError) {
              Alert.alert("無法重新驗證平台", toErrorMessage(reauthError));
            } finally {
              setBusyPlatform(null);
            }
          },
        },
      ],
    );
  };

  const enrichedPresences = useMemo<EnrichedPresence[]>(() => {
    if (!summary) {
      return [];
    }

    const adapterMap = new Map(
      (summary.adapterStatuses ?? []).map((entry) => [
        entry.platformCode,
        entry,
      ]),
    );

    return [...summary.presences]
      .map<EnrichedPresence>((record) => {
        const adapterStatus = adapterMap.get(record.platformCode);
        return {
          record,
          adapterStatus,
          assessment: assessPlatformHealth(record, adapterStatus),
          displayName: getPlatformDisplayName(record),
          forwarded: !isOwnedPlatform(record),
        };
      })
      .sort((left, right) => {
        const severityDelta =
          getPlatformHealthSeverity(right.assessment) -
          getPlatformHealthSeverity(left.assessment);
        if (severityDelta !== 0) {
          return severityDelta;
        }

        const onlineDelta =
          Number(isPlatformSwitchOn(right.record)) -
          Number(isPlatformSwitchOn(left.record));
        if (onlineDelta !== 0) {
          return onlineDelta;
        }

        return left.displayName.localeCompare(right.displayName, "zh-TW");
      });
  }, [summary]);

  const onlineCount = enrichedPresences.filter((item) =>
    isPlatformSwitchOn(item.record),
  ).length;
  const availableCount = enrichedPresences.filter(
    (item) => isPlatformSwitchOn(item.record) && item.assessment.canReceiveOrders,
  ).length;
  const attentionCount = enrichedPresences.filter(needsAttention).length;
  const todayCompletedTotal = enrichedPresences.reduce(
    (total, item) => total + getTodayTripCount(item),
    0,
  );
  const headerSubtitle = `${enrichedPresences.length} 個平台 · ${onlineCount} 上線 · ${attentionCount} 需處理`;

  if (!isProvisioned) {
    return (
      <Shell theme={THEME} contentContainerStyle={styles.shellContent}>
        <PageHeader
          theme={THEME}
          title={driverStrings.platformPresence.title}
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
        <PageHeader
          theme={THEME}
          title={driverStrings.platformPresence.title}
          subtitle="載入中…"
        />
        <View style={styles.loadingCard}>
          <ActivityIndicator size="large" color={THEME.accent} />
          <Text style={[styles.loadingLabel, { color: THEME.textMuted }]}>
            載入平台連線資料中…
          </Text>
        </View>
      </Shell>
    );
  }

  if (error && !summary) {
    return (
      <Shell theme={THEME} contentContainerStyle={styles.shellContent}>
        <PageHeader
          theme={THEME}
          title={driverStrings.platformPresence.title}
          subtitle="暫時無法取得平台資料"
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
        <Banner
          theme={THEME}
          tone="danger"
          title="平台連線資料載入失敗"
          body={error}
          icon={<Ionicons name="alert-circle" size={16} color={THEME.danger} />}
        />
      </Shell>
    );
  }

  return (
    <Shell theme={THEME} contentContainerStyle={styles.shellContent}>
      <PageHeader
        theme={THEME}
        title={driverStrings.platformPresence.title}
        subtitle={headerSubtitle}
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
        <KPI
          theme={THEME}
          label={driverStrings.platformPresence.kpis.available}
          value={String(availableCount)}
        />
        <KPI theme={THEME} label="今日完成" value={String(todayCompletedTotal)} />
        <KPI
          theme={THEME}
          label={driverStrings.platformPresence.kpis.attention}
          value={String(attentionCount)}
        />
      </View>

      {enrichedPresences.length === 0 ? (
        <Banner
          theme={THEME}
          tone="info"
          title="尚未連接任何平台"
          body="先到設定完成平台帳號綁定，再回來檢查每個平台的接單狀態。"
          icon={<Ionicons name="link-outline" size={16} color={THEME.info} />}
          actions={
            <Btn
              theme={THEME}
              variant="primary"
              size="sm"
              onPress={() => router.push("/settings")}
            >
              前往設定
            </Btn>
          }
        />
      ) : (
        <View style={styles.platformList}>
          {enrichedPresences.map((item) => (
            <PlatformCard
              key={item.record.platformCode}
              item={item}
              busy={busyPlatform === item.record.platformCode}
              onToggle={() => void handleTogglePresence(item.record)}
              onReauth={() => handleReauth(item.record)}
            />
          ))}
        </View>
      )}

      <PlatformRulesBanner notes={summary?.notes ?? []} />
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
  platformList: {
    gap: 10,
  },
  platformCard: {
    borderRadius: 14,
    borderWidth: 1,
    overflow: "hidden",
  },
  platformCardRow: {
    flexDirection: "row",
    alignItems: "center",
    gap: 12,
    padding: 14,
  },
  platformMark: {
    width: 44,
    height: 44,
    borderRadius: 12,
    alignItems: "center",
    justifyContent: "center",
  },
  platformMarkText: {
    fontSize: 13,
    fontWeight: "800",
    letterSpacing: 0.5,
  },
  platformMain: {
    flex: 1,
    minWidth: 0,
    gap: 4,
  },
  platformNameRow: {
    flexDirection: "row",
    alignItems: "center",
    gap: 6,
    flexWrap: "wrap",
  },
  platformName: {
    flexShrink: 1,
    fontSize: 15,
    fontWeight: "700",
  },
  platformMetaRow: {
    flexDirection: "row",
    alignItems: "center",
    flexWrap: "wrap",
    gap: 6,
  },
  platformStatusDot: {
    width: 8,
    height: 8,
    borderRadius: 4,
  },
  platformMetaText: {
    fontSize: 12,
    lineHeight: 16,
  },
  platformMetaDivider: {
    width: 3,
    height: 3,
    borderRadius: 2,
  },
  platformMetaTime: {
    fontSize: 11.5,
    lineHeight: 16,
    letterSpacing: 0.2,
  },
  platformSwitchColumn: {
    alignItems: "center",
    justifyContent: "center",
    gap: 6,
  },
  platformReauth: {
    flexDirection: "row",
    alignItems: "center",
    gap: 10,
    paddingHorizontal: 14,
    paddingVertical: 10,
    borderTopWidth: 1,
  },
  platformReauthText: {
    flex: 1,
    fontSize: 12,
    fontWeight: "600",
    lineHeight: 16,
  },
  platformFooter: {
    flexDirection: "row",
    alignItems: "center",
    gap: 12,
    paddingHorizontal: 14,
    paddingVertical: 10,
    borderTopWidth: 1,
  },
  platformFooterToken: {
    flex: 1,
    flexDirection: "row",
    alignItems: "center",
    flexWrap: "wrap",
  },
  platformFooterLabel: {
    fontSize: 11,
    fontWeight: "600",
    lineHeight: 14,
  },
  platformFooterValue: {
    fontSize: 11.5,
    lineHeight: 15,
  },
  platformFooterToday: {
    flexDirection: "row",
    alignItems: "center",
    gap: 4,
  },
  platformFooterTodayCount: {
    fontSize: 13,
    fontWeight: "700",
    letterSpacing: -0.2,
  },
  infoBannerBody: {
    gap: 8,
  },
  infoBannerRule: {
    fontSize: 12.5,
    lineHeight: 18,
  },
  infoBannerNotes: {
    gap: 6,
  },
  infoBannerNoteRow: {
    flexDirection: "row",
    alignItems: "flex-start",
    gap: 8,
  },
  infoBannerNoteText: {
    flex: 1,
    fontSize: 12,
    lineHeight: 17,
  },
});
