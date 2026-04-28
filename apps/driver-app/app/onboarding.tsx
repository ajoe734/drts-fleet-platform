import { useEffect, useState } from "react";
import { View, Text, StyleSheet, ActivityIndicator } from "react-native";
import { useRouter } from "expo-router";
import { getDriverClient, isDriverIdentityProvisioned } from "@/lib/api-client";
import { PlaceholderScreen } from "@/components/placeholder-screen";

export default function OnboardingScreen() {
  const [flagsOk, setFlagsOk] = useState<boolean | null>(null);
  const [identityOk, setIdentityOk] = useState<boolean | null>(null);
  const router = useRouter();

  const provisioned = isDriverIdentityProvisioned();

  useEffect(() => {
    if (!provisioned) return;

    const client = getDriverClient();

    // Smoke test: feature flags connectivity
    client
      .getFeatureFlags()
      .then(() => setFlagsOk(true))
      .catch(() => setFlagsOk(false));

    // Smoke test: identity context
    client
      .getIdentityContext()
      .then(() => setIdentityOk(true))
      .catch(() => setIdentityOk(false));
  }, [provisioned]);

  // Device not provisioned — show degraded state instead of binding a demo actor
  if (!provisioned) {
    return (
      <View style={styles.center}>
        <Text style={styles.errorTitle}>裝置尚未配置</Text>
        <Text style={styles.errorBody}>
          此裝置尚未分配司機身份。請聯繫您的管理人員以配置存取權限。
        </Text>
        <Text style={styles.errorHint}>
          開發環境：設定 EXPO_PUBLIC_DRIVER_ID 環境變數後重新啟動應用程式。
        </Text>
      </View>
    );
  }

  // Smoke tests still running
  if (flagsOk === null || identityOk === null) {
    return (
      <View style={styles.center}>
        <ActivityIndicator size="large" />
        <Text style={styles.label}>正在初始化司機應用程式…</Text>
      </View>
    );
  }

  const flagsStatus = flagsOk ? "已啟用" : "降級";
  const identityStatus = identityOk ? "已連線" : "無法連線";

  // Both checks passed — show real onboarding
  if (flagsOk && identityOk) {
    return (
      <View style={styles.container}>
        <Text style={styles.title}>多平台工作站</Text>
        <Text style={styles.subtitle}>
          API：{identityStatus} ｜ 功能旗標：{flagsStatus}
        </Text>
        <Text style={styles.description}>
          在單一工作台管理所有已連接平台的任務、收益和上線狀態。
        </Text>

        <View style={styles.navSection}>
          <Text style={styles.navLabel}>快速存取：</Text>
          <Text style={styles.link} onPress={() => router.push("/jobs")}>
            任務收件匣 →
          </Text>
          <Text style={styles.link} onPress={() => router.push("/earnings")}>
            收益儀表板 →
          </Text>
          <Text
            style={styles.link}
            onPress={() => router.push("/platform-presence")}
          >
            平台上線狀態 →
          </Text>
          <Text style={styles.link} onPress={() => router.push("/shift")}>
            班次與出勤 →
          </Text>
        </View>
      </View>
    );
  }

  // Partial connectivity — show placeholder
  return (
    <PlaceholderScreen
      title="引導設定"
      description="身份驗證、訓練關卡及配置規則尚未完成。"
      nextHref="/jobs"
      nextLabel="前往任務"
    />
  );
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
    padding: 24,
    backgroundColor: "#fff",
    justifyContent: "center",
  },
  center: {
    flex: 1,
    justifyContent: "center",
    alignItems: "center",
    backgroundColor: "#fff",
    padding: 24,
  },
  title: {
    fontSize: 28,
    fontWeight: "bold",
    marginBottom: 8,
    textAlign: "center",
  },
  subtitle: {
    fontSize: 14,
    color: "#666",
    marginBottom: 12,
    textAlign: "center",
  },
  description: {
    fontSize: 14,
    color: "#444",
    textAlign: "center",
    marginBottom: 24,
    lineHeight: 20,
  },
  navSection: {
    padding: 16,
    backgroundColor: "#f5f5f5",
    borderRadius: 8,
  },
  navLabel: {
    fontSize: 16,
    fontWeight: "600",
    marginBottom: 12,
    textAlign: "center",
    color: "#333",
  },
  link: { color: "#007AFF", fontSize: 16, textAlign: "center", marginTop: 12 },
  label: { marginTop: 8, color: "#666" },
  errorTitle: {
    fontSize: 22,
    fontWeight: "bold",
    color: "#c0392b",
    marginBottom: 12,
    textAlign: "center",
  },
  errorBody: {
    fontSize: 15,
    color: "#444",
    textAlign: "center",
    lineHeight: 22,
    marginBottom: 16,
  },
  errorHint: {
    fontSize: 12,
    color: "#888",
    textAlign: "center",
    lineHeight: 18,
  },
});
