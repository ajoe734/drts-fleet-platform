import { useEffect, useMemo, useState } from "react";
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
  type PlatformPresenceAdapterStatusRecord,
  type PlatformPresenceRecord,
  type PlatformPresenceSummary,
} from "@drts/contracts";
import type { CanvasTone } from "@drts/ui-web/canvas-tokens";

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
import {
  assessPlatformHealth,
  getPlatformHealthSeverity,
  type PlatformHealthAssessment,
} from "@/components/platform-status-card";
import { getDriverClient, isDriverIdentityProvisioned } from "@/lib/api-client";
import { driverStrings } from "@/lib/strings";

type PlatformVariant = "A" | "B";

type EnrichedPresence = {
  record: PlatformPresenceRecord;
  adapterStatus?: PlatformPresenceAdapterStatusRecord;
  assessment: PlatformHealthAssessment;
  displayName: string;
  forwarded: boolean;
};

const THEME = driverCanvasTheme;

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

function getStatusTone(item: EnrichedPresence): CanvasTone {
  if (item.record.reauthRequired) {
    return "warn";
  }
  if (item.record.eligibility === "ineligible") {
    return "danger";
  }
  if (item.record.status === "online" && item.assessment.canReceiveOrders) {
    return "success";
  }
  if (item.record.eligibility === "pending") {
    return "info";
  }
  return "neutral";
}

function getStatusLabel(item: EnrichedPresence): string {
  if (item.record.reauthRequired) {
    return "需重新授權";
  }
  if (item.record.status === "online") {
    return item.assessment.canReceiveOrders ? "上線中" : "上線受限";
  }
  return "離線";
}

function getAdapterTone(item: EnrichedPresence): CanvasTone {
  switch (item.assessment.adapterTone) {
    case "healthy":
      return "success";
    case "warning":
      return "warn";
    case "danger":
      return "danger";
    default:
      return "neutral";
  }
}

function getAdapterPillLabel(
  adapterStatus: PlatformPresenceAdapterStatusRecord | undefined,
): string {
  if (!adapterStatus || adapterStatus.status === "unknown") {
    return "未同步";
  }
  switch (adapterStatus.status) {
    case "healthy":
      return "轉接正常";
    case "degraded":
      return "轉接降級";
    default:
      return "轉接中斷";
  }
}

function getEligibilityTone(
  eligibility: PlatformPresenceRecord["eligibility"],
): CanvasTone {
  switch (eligibility) {
    case "eligible":
      return "success";
    case "pending":
      return "info";
    default:
      return "danger";
  }
}

function getEligibilityLabel(
  eligibility: PlatformPresenceRecord["eligibility"],
): string {
  switch (eligibility) {
    case "eligible":
      return "可接單";
    case "pending":
      return "審核中";
    default:
      return "資格受限";
  }
}

function getTokenTone(
  urgency: PlatformHealthAssessment["tokenInfo"]["urgency"],
): CanvasTone {
  switch (urgency) {
    case "safe":
      return "success";
    case "warning":
    case "urgent":
      return "warn";
    case "expired":
      return "danger";
    default:
      return "neutral";
  }
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

function PlatformCard({
  item,
  busy,
  variant,
  onToggle,
  onReauth,
  onOpenBinding,
}: {
  item: EnrichedPresence;
  busy: boolean;
  variant: PlatformVariant;
  onToggle: () => void;
  onReauth: () => void;
  onOpenBinding: () => void;
}) {
  const { record, adapterStatus, assessment, displayName, forwarded } = item;
  const statusTone = getStatusTone(item);
  const adapterTone = getAdapterTone(item);
  const isReauth = record.reauthRequired;
  const lastSyncSource =
    record.status === "online"
      ? (record.lastOnlineAt ?? record.updatedAt)
      : (record.lastOfflineAt ?? record.updatedAt);
  const lastSyncCompact = formatCompactDateTime(
    adapterStatus?.lastSyncAt ?? lastSyncSource,
  );
  const tokenTone = getTokenTone(assessment.tokenInfo.urgency);
  const codeColor = forwarded ? THEME.warn : THEME.accent;
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
        <View
          style={[
            styles.platformMark,
            {
              backgroundColor: codeBg,
            },
          ]}
        >
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
            ) : (
              <Pill theme={THEME} tone="accent">
                {driverStrings.platformPresence.owned}
              </Pill>
            )}
          </View>
          <View style={styles.platformMetaRow}>
            <Pill theme={THEME} tone={statusTone} dot>
              {getStatusLabel(item)}
            </Pill>
            <Text
              style={[
                styles.platformMetaCode,
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
            value={record.status === "online"}
            onValueChange={onToggle}
            disabled={busy || isReauth}
            trackColor={{
              false: THEME.borderStrong,
              true: THEME.accentHi,
            }}
            thumbColor={record.status === "online" ? THEME.accent : "#FFFFFF"}
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
          <Ionicons name="lock-closed-outline" size={14} color={THEME.warn} />
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
          >
            重新授權
          </Btn>
        </View>
      ) : null}

      <View style={[styles.platformFooter, { borderTopColor: THEME.border }]}>
        <View style={styles.platformFooterMeta}>
          <Text
            style={[styles.platformFooterLabel, { color: THEME.textMuted }]}
          >
            Token
          </Text>
          <Pill theme={THEME} tone={tokenTone}>
            {assessment.tokenInfo.label}
          </Pill>
        </View>
        <View style={styles.platformFooterMeta}>
          <Text
            style={[styles.platformFooterLabel, { color: THEME.textMuted }]}
          >
            轉接
          </Text>
          <Pill theme={THEME} tone={adapterTone}>
            {getAdapterPillLabel(adapterStatus)}
          </Pill>
        </View>
        <View style={styles.platformFooterMeta}>
          <Text
            style={[styles.platformFooterLabel, { color: THEME.textMuted }]}
          >
            資格
          </Text>
          <Pill theme={THEME} tone={getEligibilityTone(record.eligibility)}>
            {getEligibilityLabel(record.eligibility)}
          </Pill>
        </View>
      </View>

      {variant === "B" ? (
        <View
          style={[styles.platformDetails, { borderTopColor: THEME.border }]}
        >
          <DL
            theme={THEME}
            cols={2}
            items={[
              {
                label: "綁定帳號",
                value: record.accountId ?? "尚未綁定",
                mono: Boolean(record.accountId),
              },
              {
                label: "資料更新",
                value: formatCompactDateTime(record.updatedAt),
                mono: true,
              },
              {
                label: "轉接說明",
                value: assessment.adapterLabel,
              },
              {
                label: "就緒狀態",
                value: assessment.readinessLabel,
              },
            ]}
          />
          <View style={styles.platformActions}>
            <Btn
              theme={THEME}
              variant="secondary"
              size="sm"
              icon={
                <Ionicons
                  name="settings-outline"
                  size={13}
                  color={THEME.text}
                />
              }
              onPress={onOpenBinding}
            >
              查看綁定
            </Btn>
          </View>
        </View>
      ) : null}
    </View>
  );
}

function VariantSwitcher({
  variant,
  onChange,
}: {
  variant: PlatformVariant;
  onChange: (next: PlatformVariant) => void;
}) {
  return (
    <View
      style={[
        styles.variantSwitch,
        {
          backgroundColor: THEME.surfaceLo,
          borderColor: THEME.border,
        },
      ]}
    >
      {(["A", "B"] as PlatformVariant[]).map((option) => {
        const active = option === variant;
        return (
          <Pressable
            key={option}
            accessibilityRole="button"
            accessibilityState={{ selected: active }}
            onPress={() => onChange(option)}
            style={[
              styles.variantSwitchPill,
              {
                backgroundColor: active ? THEME.accentBg : "transparent",
                borderColor: active ? THEME.accentBorder : "transparent",
              },
            ]}
          >
            <Text
              style={[
                styles.variantSwitchLabel,
                {
                  color: active ? THEME.accentHi : THEME.textMuted,
                  fontFamily: THEME.monoFamily,
                },
              ]}
            >
              {option}
            </Text>
          </Pressable>
        );
      })}
    </View>
  );
}

function EarningsMirrorRow({
  item,
  todayCount,
  first = false,
}: {
  item: EnrichedPresence;
  todayCount: number;
  first?: boolean;
}) {
  const codeColor = item.forwarded ? THEME.warn : THEME.accent;
  return (
    <View
      style={[
        styles.mirrorRow,
        {
          borderTopColor: THEME.border,
          borderTopWidth: first ? 0 : StyleSheet.hairlineWidth,
        },
      ]}
    >
      <Text
        style={[
          styles.mirrorCode,
          { color: codeColor, fontFamily: THEME.monoFamily },
        ]}
      >
        {String(item.record.platformCode).slice(0, 4).toUpperCase()}
      </Text>
      <Text
        style={[styles.mirrorName, { color: THEME.text }]}
        numberOfLines={1}
      >
        {item.displayName}
      </Text>
      <Text
        style={[
          styles.mirrorCount,
          { color: THEME.text, fontFamily: THEME.monoFamily },
        ]}
      >
        {todayCount}
      </Text>
      <Text style={[styles.mirrorUnit, { color: THEME.textMuted }]}>單</Text>
    </View>
  );
}

export default function PlatformPresenceScreen() {
  const router = useRouter();
  const [summary, setSummary] = useState<PlatformPresenceSummary | null>(null);
  const [loading, setLoading] = useState(true);
  const [refreshing, setRefreshing] = useState(false);
  const [busyPlatform, setBusyPlatform] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [variant, setVariant] = useState<PlatformVariant>("A");

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
          Number(right.record.status === "online") -
          Number(left.record.status === "online");
        if (onlineDelta !== 0) {
          return onlineDelta;
        }

        return left.displayName.localeCompare(right.displayName, "zh-TW");
      });
  }, [summary]);

  const onlineCount = enrichedPresences.filter(
    (item) => item.record.status === "online",
  ).length;
  const readyCount = enrichedPresences.filter(
    (item) => item.assessment.canReceiveOrders,
  ).length;
  const attentionCount = enrichedPresences.filter(
    (item) => !item.assessment.canReceiveOrders,
  ).length;
  const reauthCount = enrichedPresences.filter(
    (item) => item.record.reauthRequired,
  ).length;
  const todayCompletedTotal = onlineCount;

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
          <View style={styles.headerActionsRow}>
            <VariantSwitcher variant={variant} onChange={setVariant} />
            <Btn
              theme={THEME}
              variant="ghost"
              size="sm"
              icon={
                <Ionicons name="refresh" size={13} color={THEME.textMuted} />
              }
              onPress={() => void onRefresh()}
              disabled={refreshing}
            >
              {refreshing ? "同步中" : "重新整理"}
            </Btn>
          </View>
        }
      />

      <View style={styles.kpiRow}>
        <KPI
          theme={THEME}
          label={driverStrings.platformPresence.kpis.available}
          value={String(readyCount)}
          sub={`/ ${enrichedPresences.length} 平台`}
          hint={reauthCount > 0 ? `${reauthCount} 需授權` : "全部平台可檢查"}
        />
        <KPI
          theme={THEME}
          label="今日完成"
          value={String(todayCompletedTotal)}
          sub={`${onlineCount} 上線`}
          hint="鏡像 Earnings 摘要"
        />
        <KPI
          theme={THEME}
          label={driverStrings.platformPresence.kpis.attention}
          value={String(attentionCount)}
          sub={attentionCount > 0 ? "需立即處理" : "暫無待辦"}
          hint={attentionCount > 0 ? "授權 / 轉接 / 資格" : "保持平台上線即可"}
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
              variant={variant}
              onToggle={() => void handleTogglePresence(item.record)}
              onReauth={() => handleReauth(item.record)}
              onOpenBinding={() => router.push("/settings")}
            />
          ))}
        </View>
      )}

      {enrichedPresences.length > 0 ? (
        <Card
          theme={THEME}
          title="Earnings 摘要"
          subtitle="今日各平台完成數鏡像收入頁"
          actions={
            <Btn
              theme={THEME}
              variant="ghost"
              size="sm"
              onPress={() => router.push("/earnings")}
            >
              收入頁
            </Btn>
          }
          padding={0}
        >
          <View>
            {enrichedPresences.map((item, index) => (
              <EarningsMirrorRow
                key={`mirror-${item.record.platformCode}`}
                item={item}
                todayCount={item.record.status === "online" ? 1 : 0}
                first={index === 0}
              />
            ))}
          </View>
        </Card>
      ) : null}

      {summary?.notes?.length ? (
        <Card
          theme={THEME}
          title={driverStrings.platformPresence.notesTitle}
          subtitle="同步說明"
        >
          <View style={styles.notesList}>
            {summary.notes.map((note) => (
              <View key={note} style={styles.notesItem}>
                <Ionicons name="sync-outline" size={13} color={THEME.info} />
                <Text style={[styles.notesText, { color: THEME.text }]}>
                  {note}
                </Text>
              </View>
            ))}
          </View>
        </Card>
      ) : null}

      <Banner
        theme={THEME}
        tone="info"
        title="平台上線規則"
        body="上線狀態為平台是否可發送訂單給您的依據。離線時不會收到該平台訂單；自營派單與外部平台可同時上線。"
        icon={
          <Ionicons name="information-circle" size={16} color={THEME.info} />
        }
      />
    </Shell>
  );
}

const styles = StyleSheet.create({
  shellContent: {
    paddingBottom: 28,
    gap: 12,
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
  headerActionsRow: {
    flexDirection: "row",
    alignItems: "center",
    gap: 8,
  },
  variantSwitch: {
    flexDirection: "row",
    alignItems: "center",
    borderRadius: 999,
    borderWidth: 1,
    padding: 2,
    gap: 2,
  },
  variantSwitchPill: {
    width: 28,
    height: 24,
    borderRadius: 999,
    borderWidth: 1,
    alignItems: "center",
    justifyContent: "center",
  },
  variantSwitchLabel: {
    fontSize: 11,
    fontWeight: "700",
    letterSpacing: 0.5,
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
    fontWeight: "700",
    letterSpacing: 0.5,
  },
  platformMain: {
    flex: 1,
    gap: 4,
    minWidth: 0,
  },
  platformNameRow: {
    flexDirection: "row",
    alignItems: "center",
    flexWrap: "wrap",
    gap: 6,
  },
  platformName: {
    fontSize: 15,
    fontWeight: "700",
    flexShrink: 1,
  },
  platformMetaRow: {
    flexDirection: "row",
    alignItems: "center",
    flexWrap: "wrap",
    gap: 6,
    marginTop: 2,
  },
  platformMetaCode: {
    fontSize: 11,
  },
  platformSwitchColumn: {
    alignItems: "flex-end",
    gap: 4,
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
  },
  platformFooter: {
    flexDirection: "row",
    flexWrap: "wrap",
    alignItems: "center",
    gap: 14,
    paddingHorizontal: 14,
    paddingVertical: 10,
    borderTopWidth: 1,
  },
  platformFooterMeta: {
    flexDirection: "row",
    alignItems: "center",
    gap: 6,
  },
  platformFooterLabel: {
    fontSize: 11,
    fontWeight: "600",
    letterSpacing: 0.4,
    textTransform: "uppercase",
  },
  platformDetails: {
    paddingHorizontal: 14,
    paddingVertical: 12,
    borderTopWidth: 1,
    gap: 10,
  },
  platformActions: {
    flexDirection: "row",
    gap: 8,
  },
  mirrorRow: {
    flexDirection: "row",
    alignItems: "center",
    gap: 10,
    paddingHorizontal: 14,
    paddingVertical: 10,
    borderTopWidth: 1,
  },
  mirrorCode: {
    width: 48,
    fontSize: 11.5,
    fontWeight: "700",
    letterSpacing: 0.5,
  },
  mirrorName: {
    flex: 1,
    fontSize: 12.5,
  },
  mirrorCount: {
    fontSize: 14,
    fontWeight: "700",
  },
  mirrorUnit: {
    fontSize: 11,
  },
  notesList: {
    gap: 8,
  },
  notesItem: {
    flexDirection: "row",
    alignItems: "flex-start",
    gap: 8,
  },
  notesText: {
    flex: 1,
    fontSize: 12.5,
    lineHeight: 18,
  },
});
