import { useEffect, useState } from "react";
import { Ionicons } from "@expo/vector-icons";
import { useRouter } from "expo-router";
import {
  ActivityIndicator,
  Alert,
  FlatList,
  RefreshControl,
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
import {
  assessPlatformHealth,
  getPlatformHealthSeverity,
  type PlatformHealthAssessment,
} from "@/components/platform-status-card";
import { ActionButton } from "@/components/ui/ActionButton";
import { EmptyState } from "@/components/ui/EmptyState";
import { ErrorBanner } from "@/components/ui/ErrorBanner";
import { IconButton } from "@/components/ui/IconButton";
import { PageHeader } from "@/components/ui/PageHeader";
import { PlatformBadge } from "@/components/ui/PlatformBadge";
import { StatusChip, type StatusChipVariant } from "@/components/ui/StatusChip";
import { Tokens } from "@/components/ui/tokens";
import { getDriverClient, isDriverIdentityProvisioned } from "@/lib/api-client";

type EnrichedPresence = {
  record: PlatformPresenceRecord;
  adapterStatus?: PlatformPresenceAdapterStatusRecord;
  assessment: PlatformHealthAssessment;
  displayName: string;
};

function toErrorMessage(error: unknown): string {
  if (error instanceof Error && error.message.trim()) {
    return error.message.trim();
  }
  return "要求失敗";
}

function formatCompactDateTime(value: string | null): string {
  if (!value) {
    return "尚無更新";
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

function getEligibilityLabel(
  eligibility: PlatformPresenceRecord["eligibility"],
): string {
  switch (eligibility) {
    case "eligible":
      return "可接單";
    case "pending":
      return "審核中";
    default:
      return "受限制";
  }
}

function getEligibilityVariant(
  eligibility: PlatformPresenceRecord["eligibility"],
): StatusChipVariant {
  switch (eligibility) {
    case "eligible":
      return "success";
    case "pending":
      return "warning";
    default:
      return "danger";
  }
}

function getAssessmentVariant(
  tone: PlatformHealthAssessment["statusTone"],
): StatusChipVariant {
  switch (tone) {
    case "healthy":
      return "success";
    case "warning":
      return "warning";
    case "danger":
      return "danger";
    default:
      return "default";
  }
}

function getAdapterVariant(
  tone: PlatformHealthAssessment["adapterTone"],
): StatusChipVariant {
  switch (tone) {
    case "healthy":
      return "success";
    case "warning":
      return "warning";
    case "danger":
      return "danger";
    default:
      return "default";
  }
}

function getTokenVariant(
  urgency: PlatformHealthAssessment["tokenInfo"]["urgency"],
): StatusChipVariant {
  switch (urgency) {
    case "safe":
      return "success";
    case "warning":
    case "urgent":
      return "warning";
    default:
      return "danger";
  }
}

function getAdapterChipLabel(
  adapterStatus?: PlatformPresenceAdapterStatusRecord,
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

function getConnectionLabel(
  record: PlatformPresenceRecord,
  assessment: PlatformHealthAssessment,
): string {
  if (record.reauthRequired) {
    return "需重新驗證";
  }

  if (record.status === "online") {
    return assessment.canReceiveOrders ? "上線中" : assessment.statusLabel;
  }

  return "離線";
}

function getConnectionTone(
  record: PlatformPresenceRecord,
  assessment: PlatformHealthAssessment,
): StatusChipVariant {
  if (record.reauthRequired) {
    return "warning";
  }

  if (record.status === "online") {
    return getAssessmentVariant(assessment.statusTone);
  }

  return "default";
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
    return "自營派單";
  }

  return (
    PLATFORM_CODE_REGISTRY[record.platformCode]?.displayName ??
    record.platformCode
  );
}

function KpiCard({
  label,
  value,
  tone = "default",
}: {
  label: string;
  value: string;
  tone?: StatusChipVariant;
}) {
  const toneStyle = kpiToneStyles[tone];

  return (
    <View
      style={[
        styles.kpiCard,
        {
          backgroundColor: toneStyle.backgroundColor,
          borderColor: toneStyle.borderColor,
        },
      ]}
    >
      <Text style={styles.kpiLabel}>{label}</Text>
      <Text style={[styles.kpiValue, { color: toneStyle.textColor }]}>
        {value}
      </Text>
    </View>
  );
}

function DetailField({
  label,
  value,
  valueColor = Tokens.colors.textStrong,
}: {
  label: string;
  value: string;
  valueColor?: string;
}) {
  return (
    <View style={styles.detailField}>
      <Text style={styles.detailLabel}>{label}</Text>
      <Text
        numberOfLines={2}
        style={[styles.detailValue, { color: valueColor }]}
      >
        {value}
      </Text>
    </View>
  );
}

function PlatformConnectionCard({
  item,
  busy,
  onToggle,
  onOpenBinding,
  onReauth,
}: {
  item: EnrichedPresence;
  busy: boolean;
  onToggle: () => void;
  onOpenBinding: () => void;
  onReauth: () => void;
}) {
  const { record, adapterStatus, assessment, displayName } = item;
  const forwarded = !isOwnedPlatform(record);
  const connectionLabel = getConnectionLabel(record, assessment);
  const latestStatusAt =
    record.status === "online"
      ? (record.lastOnlineAt ?? record.updatedAt)
      : (record.lastOfflineAt ?? record.updatedAt);
  const adapterSyncAt = adapterStatus?.lastSyncAt ?? record.updatedAt;
  const connectionVariant = getConnectionTone(record, assessment);
  const connectionColor = chipTextColors[connectionVariant];

  return (
    <View
      style={[
        styles.platformCard,
        record.reauthRequired && styles.platformCardWarning,
      ]}
    >
      <View style={styles.platformCardTopRow}>
        <View
          style={[
            styles.platformMark,
            forwarded ? styles.platformMarkForwarded : styles.platformMarkOwned,
          ]}
        >
          <Text
            style={[
              styles.platformMarkText,
              forwarded
                ? styles.platformMarkTextForwarded
                : styles.platformMarkTextOwned,
            ]}
          >
            {String(record.platformCode).slice(0, 3).toUpperCase()}
          </Text>
        </View>

        <View style={styles.platformMain}>
          <View style={styles.platformNameRow}>
            <Text style={styles.platformName}>{displayName}</Text>
            {forwarded ? (
              <StatusChip label="外部" variant="forwarded" />
            ) : (
              <StatusChip label="自營" variant="owned" />
            )}
          </View>

          <View style={styles.platformMetaRow}>
            <View
              style={[
                styles.platformMetaDot,
                { backgroundColor: connectionColor },
              ]}
            />
            <Text style={styles.platformMetaText}>{connectionLabel}</Text>
            <Text style={styles.platformMetaDivider}>•</Text>
            <Text style={styles.platformMetaText}>
              {record.reauthRequired
                ? `最近更新 ${formatCompactDateTime(record.updatedAt)}`
                : `${record.status === "online" ? "最近上線" : "最近離線"} ${formatCompactDateTime(
                    latestStatusAt,
                  )}`}
            </Text>
          </View>
        </View>

        <View style={styles.platformSwitchColumn}>
          {busy ? (
            <ActivityIndicator size="small" color={Tokens.colors.primary} />
          ) : null}
          <Switch
            accessibilityLabel={`${displayName} 平台上線切換`}
            value={record.status === "online"}
            onValueChange={onToggle}
            disabled={busy}
            trackColor={{
              false: Tokens.colors.borderStrong,
              true: Tokens.colors.brandHi,
            }}
          />
        </View>
      </View>

      <View style={styles.platformChipRow}>
        <PlatformBadge
          code={record.platformCode}
          name={forwarded ? "外部平台" : "自營派單"}
          forwarded={forwarded}
          size="sm"
        />
        <StatusChip
          label={assessment.statusLabel}
          variant={getAssessmentVariant(assessment.statusTone)}
        />
        <StatusChip
          label={getAdapterChipLabel(adapterStatus)}
          variant={getAdapterVariant(assessment.adapterTone)}
        />
        <StatusChip
          label={getEligibilityLabel(record.eligibility)}
          variant={getEligibilityVariant(record.eligibility)}
        />
      </View>

      {assessment.blockers.length > 0 ? (
        <View
          style={[
            styles.noticeBanner,
            assessment.statusTone === "danger"
              ? styles.noticeBannerDanger
              : styles.noticeBannerWarning,
          ]}
        >
          <Ionicons
            name={
              assessment.statusTone === "danger"
                ? "alert-circle"
                : "information-circle"
            }
            size={16}
            color={
              assessment.statusTone === "danger"
                ? Tokens.colors.danger
                : Tokens.colors.warning
            }
          />
          <Text
            style={[
              styles.noticeText,
              {
                color:
                  assessment.statusTone === "danger"
                    ? Tokens.colors.danger
                    : Tokens.colors.warning,
              },
            ]}
          >
            {assessment.readinessLabel}
          </Text>
        </View>
      ) : null}

      <View style={styles.detailGrid}>
        <DetailField
          label="平台憑證"
          value={assessment.tokenInfo.label}
          valueColor={
            chipTextColors[getTokenVariant(assessment.tokenInfo.urgency)]
          }
        />
        <DetailField
          label="最近同步"
          value={formatCompactDateTime(adapterSyncAt)}
          valueColor={chipTextColors[getAdapterVariant(assessment.adapterTone)]}
        />
        <DetailField label="綁定帳號" value={record.accountId ?? "尚未綁定"} />
        <DetailField label="轉接器" value={assessment.adapterLabel} />
      </View>

      <View style={styles.actionRow}>
        {record.reauthRequired ? (
          <ActionButton
            title="重新驗證"
            variant="primary"
            icon="refresh"
            onPress={onReauth}
            disabled={busy}
            style={styles.actionButton}
          />
        ) : null}
        <ActionButton
          title="查看綁定"
          variant="secondary"
          icon="settings-outline"
          onPress={onOpenBinding}
          style={styles.actionButton}
        />
      </View>
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

  if (loading) {
    return (
      <View style={styles.container}>
        <PageHeader title="平台連線" subtitle="檢查可接單平台狀態" />
        <View style={styles.center}>
          <ActivityIndicator size="large" color={Tokens.colors.primary} />
          <Text style={styles.hintText}>載入平台連線資料中…</Text>
        </View>
      </View>
    );
  }

  if (!isProvisioned) {
    return (
      <View style={styles.container}>
        <PageHeader title="平台連線" subtitle="檢查可接單平台狀態" />
        <View style={styles.center}>
          <EmptyState
            title="裝置尚未配置"
            description="此裝置尚未分配司機身份，無法顯示平台連線狀態。"
            icon="phone-portrait-outline"
          />
        </View>
      </View>
    );
  }

  if (error && !summary) {
    return (
      <View style={styles.container}>
        <PageHeader
          title="平台連線"
          subtitle="暫時無法取得平台資料"
          rightElement={
            <IconButton
              icon="refresh"
              onPress={() => void onRefresh()}
              disabled={refreshing}
              accessibilityLabel="重新整理平台連線資料"
            />
          }
        />
        <View style={styles.center}>
          <ErrorBanner message={error} style={styles.errorStateBanner} />
          <ActionButton
            title="重新整理"
            variant="secondary"
            icon="refresh"
            onPress={() => void onRefresh()}
            style={styles.retryButton}
          />
        </View>
      </View>
    );
  }

  const presences = summary?.presences ?? [];
  const adapterStatusMap = new Map(
    (summary?.adapterStatuses ?? []).map((item) => [item.platformCode, item]),
  );
  const enrichedPresences = [...presences]
    .map((record) => {
      const adapterStatus = adapterStatusMap.get(record.platformCode);
      return {
        record,
        adapterStatus,
        assessment: assessPlatformHealth(record, adapterStatus),
        displayName: getPlatformDisplayName(record),
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

  const onlineCount = enrichedPresences.filter(
    (item) => item.record.status === "online",
  ).length;
  const readyCount = enrichedPresences.filter(
    (item) => item.assessment.canReceiveOrders,
  ).length;
  const attentionCount = enrichedPresences.filter(
    (item) => !item.assessment.canReceiveOrders,
  ).length;
  const headerSubtitle = `${presences.length} 個平台 · ${onlineCount} 上線 · ${attentionCount} 需處理`;

  return (
    <View style={styles.container}>
      <PageHeader
        title="平台連線"
        subtitle={headerSubtitle}
        rightElement={
          <IconButton
            icon="refresh"
            onPress={() => void onRefresh()}
            disabled={refreshing}
            accessibilityLabel="重新整理平台連線資料"
          />
        }
      />

      <FlatList
        data={enrichedPresences}
        keyExtractor={(item) => item.record.platformCode}
        renderItem={({ item }) => (
          <PlatformConnectionCard
            item={item}
            busy={busyPlatform === item.record.platformCode}
            onToggle={() => void handleTogglePresence(item.record)}
            onOpenBinding={() => router.push("/settings")}
            onReauth={() => handleReauth(item.record)}
          />
        )}
        refreshControl={
          <RefreshControl refreshing={refreshing} onRefresh={onRefresh} />
        }
        contentContainerStyle={styles.listContent}
        ListHeaderComponent={
          <View style={styles.listHeader}>
            <View style={styles.heroCard}>
              <View style={styles.heroHeader}>
                <View style={styles.heroCopy}>
                  <Text style={styles.heroEyebrow}>Platform Presence</Text>
                  <Text style={styles.heroTitle}>
                    多平台接單狀態，一眼看清楚。
                  </Text>
                  <Text style={styles.heroBody}>
                    離線、憑證、資格與轉接器異常都會集中顯示在這裡。新版卡片保留既有資料判定，只調整為平台連線導向的視覺層級。
                  </Text>
                </View>
                <ActionButton
                  title="管理綁定"
                  variant="secondary"
                  icon="settings-outline"
                  onPress={() => router.push("/settings")}
                  style={styles.heroAction}
                />
              </View>

              <View style={styles.kpiRow}>
                <KpiCard
                  label="可接單"
                  value={String(readyCount)}
                  tone="success"
                />
                <KpiCard
                  label="上線中"
                  value={String(onlineCount)}
                  tone="brand"
                />
                <KpiCard
                  label="需動作"
                  value={String(attentionCount)}
                  tone={attentionCount > 0 ? "warning" : "default"}
                />
              </View>
            </View>

            {summary?.notes?.length ? (
              <View style={styles.notesCard}>
                <View style={styles.notesHeader}>
                  <Ionicons
                    name="sync-outline"
                    size={16}
                    color={Tokens.colors.info}
                  />
                  <Text style={styles.notesTitle}>同步說明</Text>
                </View>
                {summary.notes.map((note) => (
                  <Text key={note} style={styles.noteLine}>
                    • {note}
                  </Text>
                ))}
              </View>
            ) : null}

            {presences.length === 0 ? (
              <EmptyState
                title="尚未連接任何平台"
                description="先到設定完成平台帳號綁定，再回來檢查每個平台的接單狀態。"
                icon="link-outline"
                actionTitle="前往設定"
                onAction={() => router.push("/settings")}
                style={styles.emptyState}
              />
            ) : (
              <Text style={styles.sectionLabel}>逐平台狀態</Text>
            )}
          </View>
        }
        ListFooterComponent={
          presences.length > 0 ? (
            <View style={styles.infoCard}>
              <Ionicons
                name="information-circle-outline"
                size={18}
                color={Tokens.colors.info}
              />
              <Text style={styles.infoBody}>
                上線狀態會直接影響平台是否能將訂單發送給您。離線時不會收到該平台訂單；自營派單與外部平台可同時維持上線。
              </Text>
            </View>
          ) : (
            <View style={styles.footerSpacing} />
          )
        }
      />
    </View>
  );
}

const chipTextColors: Record<StatusChipVariant, string> = {
  default: Tokens.colors.textMuted,
  success: Tokens.colors.success,
  warning: Tokens.colors.warning,
  danger: Tokens.colors.danger,
  info: Tokens.colors.info,
  owned: Tokens.colors.owned,
  forwarded: Tokens.colors.forwarded,
  brand: Tokens.colors.brand,
};

const kpiToneStyles: Record<
  StatusChipVariant,
  { backgroundColor: string; borderColor: string; textColor: string }
> = {
  default: {
    backgroundColor: Tokens.colors.surfaceLo,
    borderColor: Tokens.colors.border,
    textColor: Tokens.colors.textStrong,
  },
  success: {
    backgroundColor: Tokens.colors.successBg,
    borderColor: `${Tokens.colors.success}30`,
    textColor: Tokens.colors.success,
  },
  warning: {
    backgroundColor: Tokens.colors.warningBg,
    borderColor: `${Tokens.colors.warning}30`,
    textColor: Tokens.colors.warning,
  },
  danger: {
    backgroundColor: Tokens.colors.dangerBg,
    borderColor: `${Tokens.colors.danger}30`,
    textColor: Tokens.colors.danger,
  },
  info: {
    backgroundColor: Tokens.colors.infoBg,
    borderColor: `${Tokens.colors.info}30`,
    textColor: Tokens.colors.info,
  },
  owned: {
    backgroundColor: Tokens.colors.ownedBg,
    borderColor: Tokens.colors.ownedBorder,
    textColor: Tokens.colors.owned,
  },
  forwarded: {
    backgroundColor: Tokens.colors.forwardedBg,
    borderColor: Tokens.colors.forwardedBorder,
    textColor: Tokens.colors.forwarded,
  },
  brand: {
    backgroundColor: Tokens.colors.brandBg,
    borderColor: `${Tokens.colors.brand}30`,
    textColor: Tokens.colors.brand,
  },
};

const styles = StyleSheet.create({
  container: {
    flex: 1,
    backgroundColor: Tokens.colors.appBg,
  },
  listContent: {
    paddingHorizontal: Tokens.layout.pagePadding,
    paddingTop: Tokens.spacing.md,
    paddingBottom: Tokens.spacing["3xl"],
    gap: Tokens.spacing.md,
  },
  listHeader: {
    gap: Tokens.spacing.md,
    paddingBottom: Tokens.spacing.md,
  },
  center: {
    flex: 1,
    justifyContent: "center",
    alignItems: "center",
    padding: Tokens.spacing.xxl,
    backgroundColor: Tokens.colors.appBg,
  },
  hintText: {
    ...Tokens.type.body,
    color: Tokens.colors.textMuted,
    marginTop: Tokens.spacing.sm,
  },
  heroCard: {
    padding: Tokens.spacing.lg,
    borderRadius: Tokens.radius.xl,
    borderWidth: 1,
    borderColor: Tokens.colors.border,
    backgroundColor: Tokens.colors.surface,
    gap: Tokens.spacing.lg,
    ...Tokens.shadows.md,
  },
  heroHeader: {
    gap: Tokens.spacing.md,
  },
  heroCopy: {
    gap: Tokens.spacing.xs,
  },
  heroEyebrow: {
    ...Tokens.type.micro,
    color: Tokens.colors.brand,
  },
  heroTitle: {
    ...Tokens.type.sectionTitle,
    color: Tokens.colors.textStrong,
  },
  heroBody: {
    ...Tokens.type.small,
    color: Tokens.colors.textMuted,
  },
  heroAction: {
    alignSelf: "flex-start",
  },
  kpiRow: {
    flexDirection: "row",
    flexWrap: "wrap",
    gap: Tokens.spacing.sm,
  },
  kpiCard: {
    flex: 1,
    minWidth: 96,
    borderRadius: Tokens.radius.lg,
    borderWidth: 1,
    paddingHorizontal: Tokens.spacing.md,
    paddingVertical: Tokens.spacing.md,
    gap: 2,
  },
  kpiLabel: {
    ...Tokens.type.micro,
    color: Tokens.colors.textMuted,
  },
  kpiValue: {
    ...Tokens.type.display,
    fontSize: 30,
    lineHeight: 34,
  },
  notesCard: {
    padding: Tokens.spacing.md,
    borderRadius: Tokens.radius.lg,
    backgroundColor: Tokens.colors.bgRaised,
    borderWidth: 1,
    borderColor: Tokens.colors.border,
    gap: Tokens.spacing.xs,
  },
  notesHeader: {
    flexDirection: "row",
    alignItems: "center",
    gap: Tokens.spacing.xs,
  },
  notesTitle: {
    ...Tokens.type.label,
    color: Tokens.colors.textStrong,
  },
  noteLine: {
    ...Tokens.type.small,
    color: Tokens.colors.textMuted,
  },
  sectionLabel: {
    ...Tokens.type.micro,
    color: Tokens.colors.textMuted,
  },
  emptyState: {
    minHeight: 260,
    backgroundColor: Tokens.colors.surface,
    borderRadius: Tokens.radius.xl,
    borderWidth: 1,
    borderColor: Tokens.colors.border,
  },
  platformCard: {
    padding: Tokens.spacing.lg,
    borderRadius: Tokens.radius.xl,
    borderWidth: 1,
    borderColor: Tokens.colors.border,
    backgroundColor: Tokens.colors.surface,
    gap: Tokens.spacing.md,
    ...Tokens.shadows.sm,
  },
  platformCardWarning: {
    borderColor: "#F5C26B",
  },
  platformCardTopRow: {
    flexDirection: "row",
    alignItems: "center",
    gap: Tokens.spacing.md,
  },
  platformMark: {
    width: 48,
    height: 48,
    borderRadius: 14,
    alignItems: "center",
    justifyContent: "center",
  },
  platformMarkOwned: {
    backgroundColor: Tokens.colors.ownedBg,
  },
  platformMarkForwarded: {
    backgroundColor: Tokens.colors.forwardedBg,
  },
  platformMarkText: {
    ...Tokens.type.code,
    letterSpacing: 0.5,
  },
  platformMarkTextOwned: {
    color: Tokens.colors.owned,
  },
  platformMarkTextForwarded: {
    color: Tokens.colors.forwarded,
  },
  platformMain: {
    flex: 1,
    gap: 4,
  },
  platformNameRow: {
    flexDirection: "row",
    alignItems: "center",
    flexWrap: "wrap",
    gap: Tokens.spacing.xs,
  },
  platformName: {
    ...Tokens.type.title,
    color: Tokens.colors.textStrong,
    fontWeight: "700",
    flexShrink: 1,
  },
  platformMetaRow: {
    flexDirection: "row",
    alignItems: "center",
    flexWrap: "wrap",
    gap: Tokens.spacing.xs,
  },
  platformMetaDot: {
    width: 8,
    height: 8,
    borderRadius: Tokens.radius.full,
  },
  platformMetaText: {
    ...Tokens.type.small,
    color: Tokens.colors.textMuted,
  },
  platformMetaDivider: {
    ...Tokens.type.small,
    color: Tokens.colors.borderStrong,
  },
  platformSwitchColumn: {
    alignItems: "flex-end",
    gap: Tokens.spacing.xs,
  },
  platformChipRow: {
    flexDirection: "row",
    flexWrap: "wrap",
    gap: Tokens.spacing.sm,
  },
  noticeBanner: {
    flexDirection: "row",
    alignItems: "flex-start",
    gap: Tokens.spacing.sm,
    paddingHorizontal: Tokens.spacing.sm,
    paddingVertical: Tokens.spacing.sm,
    borderRadius: Tokens.radius.md,
    borderWidth: 1,
  },
  noticeBannerWarning: {
    backgroundColor: Tokens.colors.surfaceWarning,
    borderColor: "#F5C26B",
  },
  noticeBannerDanger: {
    backgroundColor: Tokens.colors.surfaceDanger,
    borderColor: "#F0A7AF",
  },
  noticeText: {
    ...Tokens.type.label,
    flex: 1,
  },
  detailGrid: {
    flexDirection: "row",
    flexWrap: "wrap",
    gap: Tokens.spacing.sm,
  },
  detailField: {
    width: "48%",
    gap: 2,
  },
  detailLabel: {
    ...Tokens.type.micro,
    color: Tokens.colors.textMuted,
  },
  detailValue: {
    ...Tokens.type.label,
    color: Tokens.colors.textStrong,
    fontWeight: "600",
  },
  actionRow: {
    flexDirection: "row",
    flexWrap: "wrap",
    gap: Tokens.spacing.sm,
  },
  actionButton: {
    minWidth: 128,
  },
  infoCard: {
    flexDirection: "row",
    alignItems: "flex-start",
    gap: Tokens.spacing.sm,
    padding: Tokens.spacing.md,
    borderRadius: Tokens.radius.lg,
    borderWidth: 1,
    borderColor: `${Tokens.colors.info}24`,
    backgroundColor: Tokens.colors.infoBg,
  },
  infoBody: {
    ...Tokens.type.small,
    color: Tokens.colors.textBody,
    flex: 1,
  },
  footerSpacing: {
    height: Tokens.spacing.md,
  },
  errorStateBanner: {
    width: "100%",
    maxWidth: 420,
  },
  retryButton: {
    marginTop: Tokens.spacing.md,
  },
});
