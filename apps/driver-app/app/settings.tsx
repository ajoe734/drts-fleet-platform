import { useEffect, useState } from "react";
import {
  View,
  Text,
  StyleSheet,
  Switch,
  TextInput,
  ActivityIndicator,
  Alert,
  ScrollView,
} from "react-native";
import { useRouter } from "expo-router";
import type {
  DriverSettings,
  DriverProfileRecord,
  UpdateDriverProfileCommand,
} from "@drts/contracts";
import { PlatformBinding } from "@/components/platform-binding";
import {
  getDriverClient,
  getDriverId,
  isDriverIdentityProvisioned,
} from "@/lib/api-client";

function toErrorMessage(error: unknown): string {
  if (error instanceof Error && error.message.trim()) {
    return error.message.trim();
  }
  return "要求失敗";
}

function formatSectionList(labels: string[]): string {
  if (labels.length <= 1) {
    return labels[0] ?? "";
  }
  if (labels.length === 2) {
    return `${labels[0]}和${labels[1]}`;
  }
  return `${labels.slice(0, -1).join("、")}和${labels.at(-1)}`;
}

export default function SettingsScreen() {
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [language, setLanguage] = useState("zh-TW");
  const [notificationsEnabled, setNotificationsEnabled] = useState(true);
  const [autoAcceptEnabled, setAutoAcceptEnabled] = useState(false);
  const [maxAcceptRadius, setMaxAcceptRadius] = useState("");
  const [profileName, setProfileName] = useState("");
  const [profilePhone, setProfilePhone] = useState("");
  const [profileEmail, setProfileEmail] = useState("");
  const [emergencyName, setEmergencyName] = useState("");
  const [emergencyPhone, setEmergencyPhone] = useState("");
  const [emergencyRelationship, setEmergencyRelationship] = useState("");
  const router = useRouter();

  // Provisioning check — must come after all hook declarations
  const isProvisioned = isDriverIdentityProvisioned();
  const driverId = isProvisioned ? getDriverId() : "";

  useEffect(() => {
    if (!isProvisioned) {
      setLoading(false);
      return;
    }

    let isActive = true;
    const client = getDriverClient();

    const loadSettings = async () => {
      const [settingsResult, profileResult] = await Promise.allSettled([
        client.getDriverSettings(driverId),
        client.getDriverProfile(),
      ]);
      const loadFailures: string[] = [];

      if (!isActive) {
        return;
      }

      if (settingsResult.status === "fulfilled") {
        const settings = settingsResult.value as DriverSettings;
        setLanguage(settings.language ?? "zh-TW");
        setNotificationsEnabled(settings.notificationsEnabled ?? true);
        setAutoAcceptEnabled(settings.autoAcceptEnabled ?? false);
        setMaxAcceptRadius(
          settings.maxAcceptRadius != null
            ? String(settings.maxAcceptRadius)
            : "",
        );
      } else {
        loadFailures.push(
          `偏好設定（${toErrorMessage(settingsResult.reason)}）`,
        );
      }

      if (profileResult.status === "fulfilled") {
        const driverProfile = profileResult.value as DriverProfileRecord;
        setProfileName(driverProfile.name ?? "");
        setProfilePhone(driverProfile.phone ?? "");
        setProfileEmail(driverProfile.email ?? "");
        setEmergencyName(driverProfile.emergencyContact?.name ?? "");
        setEmergencyPhone(driverProfile.emergencyContact?.phone ?? "");
        setEmergencyRelationship(
          driverProfile.emergencyContact?.relationship ?? "",
        );
      } else {
        loadFailures.push(
          `個人資料（${toErrorMessage(profileResult.reason)}）`,
        );
      }

      if (loadFailures.length > 0) {
        Alert.alert(
          "部分設定無法載入",
          `已使用可用資料。無法載入 ${formatSectionList(loadFailures)}。`,
        );
      }

      setLoading(false);
    };

    void loadSettings();

    return () => {
      isActive = false;
    };
  }, [driverId, isProvisioned]);

  const handleSave = async () => {
    const trimmedProfileName = profileName.trim();
    const trimmedEmergencyName = emergencyName.trim();
    const trimmedEmergencyPhone = emergencyPhone.trim();
    const trimmedEmergencyRelationship = emergencyRelationship.trim();
    const hasEmergencyContact =
      trimmedEmergencyName.length > 0 ||
      trimmedEmergencyPhone.length > 0 ||
      trimmedEmergencyRelationship.length > 0;
    let profileValidationError: string | null = null;

    if (!trimmedProfileName) {
      profileValidationError = "司機個人資料需要填寫姓名。";
    } else if (
      hasEmergencyContact &&
      (!trimmedEmergencyName || !trimmedEmergencyPhone)
    ) {
      profileValidationError = "新增緊急聯絡人時，姓名和電話為必填欄位。";
    }

    setSaving(true);
    const client = getDriverClient();
    try {
      const [settingsResult, profileResult] = await Promise.allSettled([
        client.updateDriverSettings(driverId, {
          language,
          notificationsEnabled,
          autoAcceptEnabled,
          maxAcceptRadius: maxAcceptRadius ? Number(maxAcceptRadius) : null,
        }),
        profileValidationError
          ? Promise.reject(new Error(profileValidationError))
          : client.updateDriverProfile({
              name: trimmedProfileName,
              phone: profilePhone.trim() || null,
              email: profileEmail.trim() || null,
              emergencyContact: hasEmergencyContact
                ? {
                    name: trimmedEmergencyName,
                    phone: trimmedEmergencyPhone,
                    relationship: trimmedEmergencyRelationship || null,
                  }
                : null,
            } satisfies UpdateDriverProfileCommand),
      ]);

      const savedSections: string[] = [];
      const failedSections: string[] = [];

      if (settingsResult.status === "fulfilled") {
        savedSections.push("偏好設定");
      } else {
        failedSections.push(
          `偏好設定（${toErrorMessage(settingsResult.reason)}）`,
        );
      }

      if (profileResult.status === "fulfilled") {
        savedSections.push("個人資料");
      } else {
        failedSections.push(
          `個人資料（${toErrorMessage(profileResult.reason)}）`,
        );
      }

      if (failedSections.length === 0) {
        Alert.alert("儲存成功", "設定已成功儲存。");
        return;
      }

      if (savedSections.length === 0) {
        Alert.alert("錯誤", `無法儲存 ${formatSectionList(failedSections)}。`);
        return;
      }

      Alert.alert(
        "部分儲存成功",
        `已儲存 ${formatSectionList(savedSections)}。無法儲存 ${formatSectionList(failedSections)}。`,
      );
    } finally {
      setSaving(false);
    }
  };

  // Guard: device not provisioned
  if (!isProvisioned) {
    return (
      <View style={styles.center}>
        <Text style={styles.errorTitle}>裝置尚未配置</Text>
        <Text style={styles.errorBody}>
          此裝置尚未分配司機身份，無法載入設定。
        </Text>
      </View>
    );
  }

  if (loading) {
    return (
      <View style={styles.center}>
        <ActivityIndicator size="large" />
        <Text style={styles.label}>載入設定中…</Text>
      </View>
    );
  }

  return (
    <ScrollView style={styles.container}>
      <Text style={styles.title}>設定</Text>
      <Text style={styles.subtitle}>個人資料、偏好設定。</Text>

      <View style={styles.section}>
        <Text style={styles.sectionTitle}>偏好設定</Text>

        <View style={styles.row}>
          <Text style={styles.label}>語言</Text>
          <TextInput
            style={styles.input}
            value={language}
            onChangeText={setLanguage}
            placeholder="zh-TW"
          />
        </View>

        <View style={styles.row}>
          <Text style={styles.label}>最大接單範圍（公里）</Text>
          <TextInput
            style={styles.input}
            value={maxAcceptRadius}
            onChangeText={setMaxAcceptRadius}
            placeholder="例如：10"
            keyboardType="numeric"
          />
        </View>
      </View>

      <View style={styles.section}>
        <Text style={styles.sectionTitle}>個人資料</Text>

        <View style={styles.field}>
          <Text style={styles.label}>姓名</Text>
          <TextInput
            style={styles.fullInput}
            value={profileName}
            onChangeText={setProfileName}
            placeholder="司機姓名"
          />
        </View>

        <View style={styles.field}>
          <Text style={styles.label}>電話</Text>
          <TextInput
            style={styles.fullInput}
            value={profilePhone}
            onChangeText={setProfilePhone}
            placeholder="+886-900-000-000"
            keyboardType="phone-pad"
          />
        </View>

        <View style={styles.field}>
          <Text style={styles.label}>電子郵件</Text>
          <TextInput
            style={styles.fullInput}
            value={profileEmail}
            onChangeText={setProfileEmail}
            placeholder="driver@example.com"
            keyboardType="email-address"
            autoCapitalize="none"
          />
        </View>

        <Text style={styles.sectionHint}>緊急聯絡人</Text>

        <View style={styles.field}>
          <Text style={styles.label}>聯絡人姓名</Text>
          <TextInput
            style={styles.fullInput}
            value={emergencyName}
            onChangeText={setEmergencyName}
            placeholder="緊急聯絡人姓名"
          />
        </View>

        <View style={styles.field}>
          <Text style={styles.label}>聯絡人電話</Text>
          <TextInput
            style={styles.fullInput}
            value={emergencyPhone}
            onChangeText={setEmergencyPhone}
            placeholder="+886-900-000-001"
            keyboardType="phone-pad"
          />
        </View>

        <View style={styles.field}>
          <Text style={styles.label}>關係</Text>
          <TextInput
            style={styles.fullInput}
            value={emergencyRelationship}
            onChangeText={setEmergencyRelationship}
            placeholder="配偶、兄弟姐妹、父母…"
          />
        </View>
      </View>

      <View style={styles.section}>
        <Text style={styles.sectionTitle}>開關設定</Text>

        <View style={styles.row}>
          <Text style={styles.label}>通知</Text>
          <Switch
            value={notificationsEnabled}
            onValueChange={setNotificationsEnabled}
          />
        </View>

        <View style={styles.row}>
          <Text style={styles.label}>自動接單</Text>
          <Switch
            value={autoAcceptEnabled}
            onValueChange={setAutoAcceptEnabled}
          />
        </View>
      </View>

      <Text
        style={[styles.saveBtn, saving && styles.saveBtnDisabled]}
        onPress={handleSave}
      >
        {saving ? "正在儲存…" : "儲存設定"}
      </Text>

      <View style={styles.section}>
        <PlatformBinding />
      </View>
      <View style={styles.footer}>
        <Text style={styles.link} onPress={() => router.push("/earnings")}>
          查看收益 →
        </Text>
      </View>
    </ScrollView>
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
  subtitle: { fontSize: 14, color: "#666", marginBottom: 24 },
  section: { marginBottom: 24 },
  sectionTitle: {
    fontSize: 18,
    fontWeight: "600",
    marginBottom: 12,
    color: "#333",
  },
  sectionHint: {
    fontSize: 14,
    fontWeight: "600",
    color: "#555",
    marginTop: 8,
    marginBottom: 8,
  },
  row: {
    flexDirection: "row",
    justifyContent: "space-between",
    alignItems: "center",
    paddingVertical: 12,
    borderBottomWidth: 1,
    borderBottomColor: "#eee",
  },
  label: { fontSize: 16, flex: 1 },
  field: {
    paddingVertical: 12,
    borderBottomWidth: 1,
    borderBottomColor: "#eee",
  },
  input: {
    borderWidth: 1,
    borderColor: "#ccc",
    borderRadius: 6,
    padding: 8,
    fontSize: 14,
    width: 100,
    textAlign: "right",
  },
  fullInput: {
    borderWidth: 1,
    borderColor: "#ccc",
    borderRadius: 6,
    padding: 10,
    fontSize: 14,
    marginTop: 8,
  },
  saveBtn: {
    backgroundColor: "#007AFF",
    color: "#fff",
    textAlign: "center",
    padding: 14,
    borderRadius: 8,
    fontSize: 16,
    fontWeight: "600",
    marginTop: 8,
  },
  saveBtnDisabled: { opacity: 0.6 },
  footer: { marginTop: 24, alignItems: "center" },
  link: { color: "#007AFF", fontSize: 16 },
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
