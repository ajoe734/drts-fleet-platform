import { useEffect, useState } from "react";
import {
  View,
  Text,
  FlatList,
  StyleSheet,
  ActivityIndicator,
  RefreshControl,
  TouchableOpacity,
  Alert,
} from "react-native";
import type {
  PlatformPresenceRecord,
  PlatformPresenceSummary,
} from "@drts/contracts";
import { getDriverClient, isDriverIdentityProvisioned } from "@/lib/api-client";

/**
 * Calculate token expiry urgency level and remaining time display.
 * Returns: { label, urgency, isExpiring }
 * - urgent: < 1 hour remaining
 * - warning: < 24 hours remaining
 * - safe: >= 24 hours remaining
 * - expired: token already expired
 */
function getTokenExpiryInfo(tokenExpiresAt: string | null): {
  label: string;
  urgency: "expired" | "urgent" | "warning" | "safe";
  isExpiring: boolean;
} {
  if (!tokenExpiresAt) {
    return { label: "無到期時間", urgency: "safe", isExpiring: false };
  }

  const now = new Date().getTime();
  const expiresAt = new Date(tokenExpiresAt).getTime();
  const remainingMs = expiresAt - now;

  if (remainingMs <= 0) {
    return { label: "已到期", urgency: "expired", isExpiring: true };
  }

  const remainingMinutes = Math.floor(remainingMs / 60000);
  const remainingHours = Math.floor(remainingMinutes / 60);

  if (remainingHours < 1) {
    return {
      label: `剩餘 ${remainingMinutes} 分鐘`,
      urgency: "urgent",
      isExpiring: true,
    };
  }

  if (remainingHours < 24) {
    return {
      label: `剩餘 ${remainingHours} 小時 ${remainingMinutes % 60} 分鐘`,
      urgency: "warning",
      isExpiring: true,
    };
  }

  return {
    label: `剩餘 ${remainingHours} 小時`,
    urgency: "safe",
    isExpiring: false,
  };
}

function StatusIndicator({ status }: { status: string }) {
  const isOnline = status === "online";
  return (
    <View
      style={[
        styles.statusDot,
        { backgroundColor: isOnline ? "#4caf50" : "#9e9e9e" },
      ]}
    />
  );
}

function PresenceCard({
  record,
  onRefresh,
}: {
  record: PlatformPresenceRecord;
  onRefresh: () => void;
}) {
  const client = getDriverClient();
  const [toggling, setToggling] = useState(false);
  const [expiryInfo, setExpiryInfo] = useState(() =>
    getTokenExpiryInfo(record.tokenExpiresAt),
  );

  // Update countdown every minute
  useEffect(() => {
    const interval = setInterval(() => {
      setExpiryInfo(getTokenExpiryInfo(record.tokenExpiresAt));
    }, 60000);
    return () => clearInterval(interval);
  }, [record.tokenExpiresAt]);

  const handleToggle = async () => {
    setToggling(true);
    try {
      if (record.status === "online") {
        await client.setPlatformOffline({ platformCode: record.platformCode });
      } else {
        await client.setPlatformOnline({ platformCode: record.platformCode });
      }
      await onRefresh();
    } catch (e: any) {
      console.error("Failed to toggle platform presence:", e.message);
      Alert.alert(
        "錯誤",
        `無法切換 ${record.platformCode} 的狀態：${e.message}`,
      );
    } finally {
      setToggling(false);
    }
  };

  const handleReauth = () => {
    Alert.alert(
      "重新驗證平台",
      `即將為「${record.platformCode}」啟動重新驗證。您將被引導完成驗證流程。`,
      [
        { text: "取消", style: "cancel" },
        {
          text: "繼續",
          onPress: async () => {
            try {
              await client.setPlatformOnline({
                platformCode: record.platformCode,
                tokenExpiresAt: null,
              });
              await onRefresh();
              Alert.alert(
                "重新驗證已啟動",
                `請完成 ${record.platformCode} 的驗證流程。`,
              );
            } catch (e: any) {
              Alert.alert("錯誤", e.message);
            }
          },
        },
      ],
    );
  };

  const eligibilityColor =
    record.eligibility === "eligible"
      ? "#4caf50"
      : record.eligibility === "pending"
        ? "#ff9800"
        : "#f44336";

  const expiryColor =
    expiryInfo.urgency === "expired"
      ? "#f44336"
      : expiryInfo.urgency === "urgent"
        ? "#ff5722"
        : expiryInfo.urgency === "warning"
          ? "#ff9800"
          : "#4caf50";

  return (
    <View style={styles.card}>
      <View style={styles.cardHeader}>
        <View style={styles.platformInfo}>
          <StatusIndicator status={record.status} />
          <Text style={styles.platformCode}>{record.platformCode}</Text>
        </View>
        <View style={styles.headerActions}>
          {record.reauthRequired && (
            <TouchableOpacity
              style={[styles.iconBtn, styles.reauthBtn]}
              onPress={handleReauth}
            >
              <Text style={styles.iconBtnText}>🔄</Text>
            </TouchableOpacity>
          )}
          <TouchableOpacity
            style={[styles.toggleBtn, toggling && styles.toggleBtnDisabled]}
            onPress={handleToggle}
            disabled={toggling}
          >
            <Text style={styles.toggleBtnText}>
              {toggling ? "…" : record.status === "online" ? "下線" : "上線"}
            </Text>
          </TouchableOpacity>
        </View>
      </View>

      <View style={styles.cardRow}>
        <Text style={styles.cardLabel}>資格狀態：</Text>
        <Text style={[styles.cardValue, { color: eligibilityColor }]}>
          {record.eligibility}
        </Text>
      </View>

      {record.tokenExpiresAt && (
        <View style={styles.cardRow}>
          <Text style={styles.cardLabel}>存取令牌：</Text>
          <Text style={[styles.cardValue, { color: expiryColor }]}>
            {expiryInfo.label}
          </Text>
        </View>
      )}

      {record.reauthRequired && (
        <TouchableOpacity style={styles.reauthBanner} onPress={handleReauth}>
          <Text style={styles.reauthBannerText}>
            ⚠️ 需要重新驗證 — 點擊繼續
          </Text>
        </TouchableOpacity>
      )}

      {record.lastOnlineAt && (
        <View style={styles.cardRow}>
          <Text style={styles.cardLabel}>上次上線：</Text>
          <Text style={styles.cardValue}>
            {new Date(record.lastOnlineAt).toLocaleString()}
          </Text>
        </View>
      )}
    </View>
  );
}

export default function PlatformPresenceScreen() {
  const [summary, setSummary] = useState<PlatformPresenceSummary | null>(null);
  const [loading, setLoading] = useState(true);
  const [refreshing, setRefreshing] = useState(false);
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
    } catch (e: any) {
      setError(e.message);
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    loadPresence();
  }, []);

  const onRefresh = async () => {
    setRefreshing(true);
    await loadPresence();
    setRefreshing(false);
  };

  if (loading) {
    return (
      <View style={styles.center}>
        <ActivityIndicator size="large" />
        <Text style={styles.label}>載入平台狀態中…</Text>
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

  return (
    <View style={styles.container}>
      <Text style={styles.title}>平台上線狀態</Text>
      <Text style={styles.subtitle}>
        已連接 {summary?.presences.length ?? 0} 個平台
      </Text>

      {error && <Text style={styles.error}>錯誤：{error}</Text>}

      {!summary || summary.presences.length === 0 ? (
        <Text style={styles.empty}>尚未連接任何平台。</Text>
      ) : (
        <FlatList
          data={summary.presences}
          keyExtractor={(item) => item.platformCode}
          renderItem={({ item }) => (
            <PresenceCard record={item} onRefresh={onRefresh} />
          )}
          refreshControl={
            <RefreshControl refreshing={refreshing} onRefresh={onRefresh} />
          }
        />
      )}
    </View>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1, padding: 16, backgroundColor: "#fff" },
  center: {
    flex: 1,
    justifyContent: "center",
    alignItems: "center",
    padding: 24,
  },
  title: { fontSize: 24, fontWeight: "bold", marginBottom: 4 },
  subtitle: { fontSize: 14, color: "#666", marginBottom: 16 },
  error: { color: "red", marginBottom: 8 },
  empty: { textAlign: "center", color: "#999", marginTop: 32 },
  label: { marginTop: 8, color: "#666" },
  card: {
    padding: 12,
    marginBottom: 10,
    backgroundColor: "#fafafa",
    borderRadius: 8,
    borderWidth: 1,
    borderColor: "#e0e0e0",
  },
  cardHeader: {
    flexDirection: "row",
    justifyContent: "space-between",
    alignItems: "center",
    marginBottom: 8,
  },
  platformInfo: { flexDirection: "row", alignItems: "center" },
  statusDot: {
    width: 10,
    height: 10,
    borderRadius: 5,
    marginRight: 8,
  },
  platformCode: { fontSize: 16, fontWeight: "600" },
  headerActions: { flexDirection: "row", alignItems: "center", gap: 8 },
  toggleBtn: {
    paddingHorizontal: 12,
    paddingVertical: 6,
    backgroundColor: "#1976d2",
    borderRadius: 6,
  },
  toggleBtnDisabled: { backgroundColor: "#bdbdbd" },
  toggleBtnText: { color: "#fff", fontSize: 12, fontWeight: "600" },
  iconBtn: {
    width: 32,
    height: 32,
    borderRadius: 6,
    backgroundColor: "#fff",
    borderWidth: 1,
    borderColor: "#e0e0e0",
    justifyContent: "center",
    alignItems: "center",
  },
  reauthBtn: { backgroundColor: "#fff3e0", borderColor: "#ff9800" },
  iconBtnText: { fontSize: 16 },
  reauthBanner: {
    marginTop: 8,
    padding: 10,
    backgroundColor: "#fff3e0",
    borderRadius: 6,
    borderWidth: 1,
    borderColor: "#ff9800",
  },
  reauthBannerText: {
    color: "#e65100",
    fontSize: 12,
    fontWeight: "600",
    textAlign: "center",
  },
  cardRow: {
    flexDirection: "row",
    justifyContent: "space-between",
    marginTop: 4,
  },
  cardLabel: { fontSize: 12, color: "#666" },
  cardValue: { fontSize: 12, fontWeight: "500" },
  errorTitle: {
    fontSize: 20,
    fontWeight: "bold",
    color: "#c0392b",
    marginBottom: 12,
    textAlign: "center",
  },
  errorBody: {
    fontSize: 14,
    color: "#444",
    textAlign: "center",
    lineHeight: 20,
  },
});
