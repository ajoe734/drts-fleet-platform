import { useEffect, useState } from "react";
import { useRouter } from "expo-router";
import {
  ActivityIndicator,
  Alert,
  FlatList,
  RefreshControl,
  StyleSheet,
  Text,
  View,
} from "react-native";
import type {
  PlatformPresenceRecord,
  PlatformPresenceSummary,
} from "@drts/contracts";
import {
  PlatformStatusCard,
  assessPlatformHealth,
  getPlatformHealthSeverity,
  type PlatformStatusAction,
} from "@/components/platform-status-card";
import { ActionButton } from "@/components/ui/ActionButton";
import { EmptyState } from "@/components/ui/EmptyState";
import { ErrorBanner } from "@/components/ui/ErrorBanner";
import { PageHeader } from "@/components/ui/PageHeader";
import { StatusChip } from "@/components/ui/StatusChip";
import { Tokens } from "@/components/ui/tokens";
import { getDriverClient, isDriverIdentityProvisioned } from "@/lib/api-client";

function toErrorMessage(error: unknown): string {
  if (error instanceof Error && error.message.trim()) {
    return error.message.trim();
  }
  return "要求失敗";
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
      setError(`平台健康中心資料載入失敗：${toErrorMessage(loadError)}`);
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
      <View style={styles.center}>
        <ActivityIndicator size="large" />
        <Text style={styles.hintText}>載入平台健康中心中…</Text>
      </View>
    );
  }

  if (!isProvisioned) {
    return (
      <View style={styles.center}>
        <EmptyState
          title="裝置尚未配置"
          description="此裝置尚未分配司機身份，無法顯示平台健康中心。"
          icon="phone-portrait-outline"
        />
      </View>
    );
  }

  const presences = summary?.presences ?? [];
  const adapterStatusMap = new Map(
    (summary?.adapterStatuses ?? []).map((item) => [item.platformCode, item]),
  );
  const enrichedPresences = [...presences]
    .map((record) => {
      const assessment = assessPlatformHealth(
        record,
        adapterStatusMap.get(record.platformCode),
      );
      return { record, assessment };
    })
    .sort((left, right) => {
      const severityDelta =
        getPlatformHealthSeverity(right.assessment) -
        getPlatformHealthSeverity(left.assessment);
      if (severityDelta !== 0) {
        return severityDelta;
      }
      return left.record.platformCode.localeCompare(right.record.platformCode);
    });

  const readyCount = enrichedPresences.filter(
    (item) => item.assessment.canReceiveOrders,
  ).length;
  const actionCount = enrichedPresences.filter(
    (item) => item.assessment.statusTone === "warning",
  ).length;
  const blockedCount = enrichedPresences.filter(
    (item) => item.assessment.statusTone === "danger",
  ).length;

  return (
    <View style={styles.container}>
      <PageHeader
        title="平台健康中心"
        subtitle={`已連接 ${presences.length} 個平台`}
      />

      <FlatList
        data={enrichedPresences}
        keyExtractor={(item) => item.record.platformCode}
        renderItem={({ item }) => {
          const actions: PlatformStatusAction[] = [];

          if (item.record.reauthRequired) {
            actions.push({
              key: "reauth",
              icon: "refresh",
              label: "重新驗證",
              onPress: () => handleReauth(item.record),
              tone: "warning",
              disabled: busyPlatform === item.record.platformCode,
            });
          }

          actions.push({
            key: "toggle",
            icon: item.record.status === "online" ? "power" : "play",
            label: item.record.status === "online" ? "切換離線" : "切換上線",
            onPress: () => handleTogglePresence(item.record),
            tone: item.record.status === "online" ? "danger" : "primary",
            disabled: busyPlatform === item.record.platformCode,
          });

          actions.push({
            key: "binding",
            icon: "settings-outline",
            label: "查看綁定",
            onPress: () => router.push("/settings"),
            tone: "neutral",
            disabled: busyPlatform === item.record.platformCode,
          });

          return (
            <PlatformStatusCard
              record={item.record}
              actions={actions}
              adapterStatus={adapterStatusMap.get(item.record.platformCode)}
            />
          );
        }}
        refreshControl={
          <RefreshControl refreshing={refreshing} onRefresh={onRefresh} />
        }
        ListHeaderComponent={
          <View style={styles.headerContent}>
            <View style={styles.summaryCard}>
              <Text style={styles.summaryTitle}>今日平台可用性</Text>
              <Text style={styles.summaryBody}>
                這裡集中顯示每個平台目前能否接單，以及是被離線、憑證、重新驗證、資格或轉接器問題卡住。
              </Text>
              <View style={styles.summaryChips}>
                <StatusChip label={`可接單 ${readyCount}`} variant="success" />
                <StatusChip label={`需處理 ${actionCount}`} variant="warning" />
                <StatusChip label={`已阻塞 ${blockedCount}`} variant="danger" />
              </View>
              <ActionButton
                title="前往設定管理綁定"
                variant="secondary"
                icon="settings-outline"
                onPress={() => router.push("/settings")}
                style={styles.summaryAction}
              />
            </View>

            {error ? (
              <ErrorBanner message={error} style={styles.errorBanner} />
            ) : null}

            {summary?.notes?.length ? (
              <View style={styles.notesCard}>
                <Text style={styles.notesTitle}>同步說明</Text>
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
                description="先到設定完成平台帳號綁定，再回來檢查每個平台的接單健康狀態。"
                icon="link-outline"
                actionTitle="前往設定"
                onAction={() => router.push("/settings")}
                style={styles.emptyState}
              />
            ) : (
              <Text style={styles.listTitle}>逐平台健康狀態</Text>
            )}
          </View>
        }
        ListFooterComponent={<View style={styles.footerSpacing} />}
        contentContainerStyle={styles.listContent}
      />
    </View>
  );
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
    backgroundColor: Tokens.colors.appBg,
  },
  listContent: {
    paddingHorizontal: Tokens.layout.pagePadding,
    paddingTop: Tokens.spacing.md,
  },
  headerContent: {
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
  summaryCard: {
    padding: Tokens.spacing.lg,
    borderRadius: Tokens.radius.lg,
    borderWidth: 1,
    borderColor: Tokens.colors.border,
    backgroundColor: Tokens.colors.surface,
    gap: Tokens.spacing.md,
  },
  summaryTitle: {
    ...Tokens.type.sectionTitle,
    color: Tokens.colors.textStrong,
  },
  summaryBody: {
    ...Tokens.type.body,
    color: Tokens.colors.textMuted,
  },
  summaryChips: {
    flexDirection: "row",
    flexWrap: "wrap",
    gap: Tokens.spacing.sm,
  },
  summaryAction: {
    alignSelf: "flex-start",
  },
  notesCard: {
    padding: Tokens.spacing.md,
    borderRadius: Tokens.radius.md,
    backgroundColor: Tokens.colors.bgRaised,
    borderWidth: 1,
    borderColor: Tokens.colors.border,
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
  listTitle: {
    ...Tokens.type.label,
    color: Tokens.colors.textMuted,
  },
  errorBanner: {
    marginBottom: 0,
  },
  emptyState: {
    minHeight: 240,
  },
  hintText: {
    ...Tokens.type.body,
    color: Tokens.colors.textMuted,
    marginTop: Tokens.spacing.sm,
  },
  footerSpacing: {
    height: Tokens.spacing.xl,
  },
});
