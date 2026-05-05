import { useEffect, useState } from "react";
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
  type PlatformStatusAction,
} from "@/components/platform-status-card";
import { Tokens } from "@/components/ui/tokens";
import { getDriverClient, isDriverIdentityProvisioned } from "@/lib/api-client";

function toErrorMessage(error: unknown): string {
  if (error instanceof Error && error.message.trim()) {
    return error.message.trim();
  }
  return "要求失敗";
}

export default function PlatformPresenceScreen() {
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
      const data = await client.getPlatformPresence();
      setSummary(data);
      setError(null);
    } catch (loadError) {
      setError(toErrorMessage(loadError));
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
        <Text style={styles.hintText}>載入平台狀態中…</Text>
      </View>
    );
  }

  if (!isProvisioned) {
    return (
      <View style={styles.center}>
        <Text style={styles.errorTitle}>裝置尚未配置</Text>
        <Text style={styles.errorBody}>
          此裝置尚未分配司機身份，無法顯示平台上線狀態。
        </Text>
      </View>
    );
  }

  const presences = summary?.presences ?? [];

  return (
    <View style={styles.container}>
      <Text style={styles.title}>平台上線狀態</Text>
      <Text style={styles.subtitle}>已連接 {presences.length} 個平台</Text>

      {error ? <Text style={styles.errorText}>載入失敗：{error}</Text> : null}

      {presences.length === 0 ? (
        <Text style={styles.emptyText}>尚未連接任何平台。</Text>
      ) : (
        <FlatList
          data={presences}
          keyExtractor={(item) => item.platformCode}
          renderItem={({ item }) => {
            const actions: PlatformStatusAction[] = [];

            if (item.reauthRequired) {
              actions.push({
                key: "reauth",
                icon: "refresh",
                label: `重新驗證 ${item.platformCode}`,
                onPress: () => handleReauth(item),
                tone: "warning",
                disabled: busyPlatform === item.platformCode,
              });
            }

            actions.push({
              key: "toggle",
              icon: item.status === "online" ? "power" : "play",
              label:
                item.status === "online"
                  ? `讓 ${item.platformCode} 下線`
                  : `讓 ${item.platformCode} 上線`,
              onPress: () => handleTogglePresence(item),
              tone: item.status === "online" ? "danger" : "primary",
              disabled: busyPlatform === item.platformCode,
            });

            return <PlatformStatusCard record={item} actions={actions} />;
          }}
          refreshControl={
            <RefreshControl refreshing={refreshing} onRefresh={onRefresh} />
          }
        />
      )}
    </View>
  );
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
    padding: Tokens.layout.pagePadding,
    backgroundColor: Tokens.colors.appBg,
  },
  center: {
    flex: 1,
    justifyContent: "center",
    alignItems: "center",
    padding: Tokens.spacing.xxl,
    backgroundColor: Tokens.colors.appBg,
  },
  title: {
    ...Tokens.type.screenTitle,
    color: Tokens.colors.textStrong,
    marginBottom: Tokens.spacing.xs,
  },
  subtitle: {
    ...Tokens.type.body,
    color: Tokens.colors.textMuted,
    marginBottom: Tokens.spacing.lg,
  },
  hintText: {
    ...Tokens.type.body,
    color: Tokens.colors.textMuted,
    marginTop: Tokens.spacing.sm,
  },
  errorText: {
    ...Tokens.type.label,
    color: Tokens.colors.danger,
    marginBottom: Tokens.spacing.sm,
  },
  emptyText: {
    ...Tokens.type.body,
    textAlign: "center",
    color: Tokens.colors.textMuted,
    marginTop: Tokens.spacing.xxl,
  },
  errorTitle: {
    ...Tokens.type.sectionTitle,
    color: Tokens.colors.danger,
    textAlign: "center",
    marginBottom: Tokens.spacing.sm,
  },
  errorBody: {
    ...Tokens.type.body,
    color: Tokens.colors.textBody,
    textAlign: "center",
  },
});
