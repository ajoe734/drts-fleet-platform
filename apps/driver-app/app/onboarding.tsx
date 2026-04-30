import { useEffect, useState } from "react";
import {
  ActivityIndicator,
  Pressable,
  StyleSheet,
  Text,
  TextInput,
  View,
} from "react-native";
import { useRouter } from "expo-router";

import {
  getDriverIdentityIssue,
  getDriverClient,
  hasDriverDevOverride,
  initializeDriverIdentity,
  isDriverIdentityProvisioned,
  registerDriverDevice,
} from "@/lib/api-client";
import { PlaceholderScreen } from "@/components/placeholder-screen";

export default function OnboardingScreen() {
  const [ready, setReady] = useState(false);
  const [flagsOk, setFlagsOk] = useState<boolean | null>(null);
  const [identityOk, setIdentityOk] = useState<boolean | null>(null);
  const [registrationCode, setRegistrationCode] = useState("");
  const [deviceLabel, setDeviceLabel] = useState("");
  const [provisioningError, setProvisioningError] = useState<string | null>(
    null,
  );
  const [submitting, setSubmitting] = useState(false);
  const router = useRouter();

  useEffect(() => {
    let cancelled = false;

    initializeDriverIdentity()
      .catch((error: unknown) => {
        if (cancelled) {
          return;
        }
        setProvisioningError(
          error instanceof Error
            ? error.message
            : "裝置初始化失敗，請稍後再試。",
        );
      })
      .finally(() => {
        if (!cancelled) {
          const identityIssue = getDriverIdentityIssue();
          if (identityIssue) {
            setProvisioningError(identityIssue);
          }
          setReady(true);
        }
      });

    return () => {
      cancelled = true;
    };
  }, []);

  const provisioned = ready && isDriverIdentityProvisioned();

  useEffect(() => {
    if (!provisioned) {
      return;
    }

    const client = getDriverClient();

    client
      .getFeatureFlags()
      .then(() => setFlagsOk(true))
      .catch(() => setFlagsOk(false));

    client
      .getIdentityContext()
      .then(() => setIdentityOk(true))
      .catch(() => setIdentityOk(false));
  }, [provisioned]);

  const handleRegister = async () => {
    const normalizedCode = registrationCode.trim();
    if (!normalizedCode) {
      setProvisioningError("請輸入裝置註冊碼。");
      return;
    }

    setSubmitting(true);
    setProvisioningError(null);
    try {
      await registerDriverDevice(normalizedCode, deviceLabel);
      setFlagsOk(null);
      setIdentityOk(null);
    } catch (error) {
      setProvisioningError(
        error instanceof Error ? error.message : "裝置配置失敗，請稍後再試。",
      );
    } finally {
      setSubmitting(false);
    }
  };

  if (!ready) {
    return (
      <View style={styles.center}>
        <ActivityIndicator size="large" />
        <Text style={styles.label}>正在檢查裝置配置…</Text>
      </View>
    );
  }

  if (!provisioned) {
    return (
      <View style={styles.provisioningCard}>
        <Text style={styles.errorTitle}>裝置尚未配置</Text>
        <Text style={styles.errorBody}>
          請輸入管理人員提供的註冊碼，向後端註冊此裝置並取得司機存取權限。
        </Text>
        <TextInput
          autoCapitalize="none"
          editable={!submitting}
          onChangeText={setRegistrationCode}
          placeholder="註冊碼"
          style={styles.input}
          value={registrationCode}
        />
        <TextInput
          editable={!submitting}
          onChangeText={setDeviceLabel}
          placeholder="裝置名稱（選填）"
          style={styles.input}
          value={deviceLabel}
        />
        <Pressable
          disabled={submitting}
          onPress={() => {
            void handleRegister();
          }}
          style={({ pressed }) => [
            styles.primaryButton,
            (pressed || submitting) && styles.primaryButtonPressed,
          ]}
        >
          <Text style={styles.primaryButtonLabel}>
            {submitting ? "配置中…" : "註冊此裝置"}
          </Text>
        </Pressable>
        {provisioningError ? (
          <Text style={styles.inlineError}>{provisioningError}</Text>
        ) : null}
        <Text style={styles.errorHint}>
          開發環境可用 `EXPO_PUBLIC_DRIVER_ID` 明確覆寫身份
          {hasDriverDevOverride() ? "（目前已設定）" : "。"}
        </Text>
      </View>
    );
  }

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
  provisioningCard: {
    flex: 1,
    justifyContent: "center",
    backgroundColor: "#fff",
    padding: 24,
    gap: 12,
  },
  input: {
    borderWidth: 1,
    borderColor: "#d0d7de",
    borderRadius: 10,
    paddingHorizontal: 14,
    paddingVertical: 12,
    fontSize: 16,
    backgroundColor: "#f8fafc",
  },
  primaryButton: {
    backgroundColor: "#0f172a",
    borderRadius: 10,
    paddingVertical: 14,
    alignItems: "center",
  },
  primaryButtonPressed: {
    opacity: 0.8,
  },
  primaryButtonLabel: {
    color: "#fff",
    fontSize: 16,
    fontWeight: "600",
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
    marginBottom: 4,
    textAlign: "center",
  },
  errorBody: {
    fontSize: 15,
    color: "#444",
    textAlign: "center",
    lineHeight: 22,
  },
  errorHint: {
    fontSize: 12,
    color: "#888",
    textAlign: "center",
    lineHeight: 18,
    marginTop: 8,
  },
  inlineError: {
    color: "#c0392b",
    fontSize: 13,
    textAlign: "center",
    lineHeight: 18,
  },
});
