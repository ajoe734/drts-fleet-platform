import { useEffect, useState } from "react";
import {
  View,
  Text,
  StyleSheet,
  TextInput,
  Alert,
  ActivityIndicator,
} from "react-native";
import { useRouter } from "expo-router";

import { getDriverClient } from "@/lib/api-client";

export default function IncidentScreen() {
  const [details, setDetails] = useState("");
  const [submitting, setSubmitting] = useState(false);
  const [incidentsEnabled, setIncidentsEnabled] = useState<boolean | null>(
    null,
  );
  const router = useRouter();

  useEffect(() => {
    const client = getDriverClient();
    client
      .isFeatureEnabled("driver-app.incidents")
      .then((enabled) => setIncidentsEnabled(enabled))
      .catch(() => setIncidentsEnabled(true));
  }, []);

  const handleSubmit = async () => {
    if (submitting) {
      return;
    }

    setSubmitting(true);
    const client = getDriverClient();
    try {
      const created = await client.createIncident({
        title: "司機 SOS 緊急通報",
        description: details.trim() || "已由司機 App 送出 SOS 緊急通報。",
        category: "safety",
        severity: "critical",
        reportedBy: "driver",
      });
      if (created?.incidentId) {
        await client.updateIncident(created.incidentId, {
          escalationTarget: "safety_officer",
        });
      }
      Alert.alert("已送出 SOS", "營運已收到你的重大安全警示，主管將優先處理。");
      setDetails("");
      router.replace("/trip");
    } catch (e: any) {
      Alert.alert("錯誤", e.message);
    } finally {
      setSubmitting(false);
    }
  };

  if (incidentsEnabled === null) {
    return (
      <View style={styles.center}>
        <ActivityIndicator size="large" />
        <Text style={styles.loadingLabel}>載入中…</Text>
      </View>
    );
  }

  if (!incidentsEnabled) {
    return (
      <View style={styles.center}>
        <Text style={styles.disabledTitle}>事件回報暫停提供</Text>
        <Text style={styles.empty}>此功能目前未啟用。</Text>
      </View>
    );
  }

  return (
    <View style={styles.container}>
      <View style={styles.heroCard}>
        <Text style={styles.eyebrow}>司機安全</Text>
        <Text style={styles.title}>SOS 緊急通報</Text>
        <Text style={styles.subtitle}>一鍵立即把重大安全事件通報給營運。</Text>
      </View>

      <View style={styles.noticeCard}>
        <Text style={styles.noticeTitle}>派遣處理說明</Text>
        <Text style={styles.noticeBody}>
          此畫面送出的事件會固定標記為安全類別與重大等級。營運主管將會收到升級通知並優先處理。
        </Text>
      </View>

      <Text style={styles.fieldLabel}>補充說明（選填）</Text>
      <TextInput
        style={styles.input}
        placeholder="可補充目前位置、乘客狀況或即時風險…"
        multiline
        numberOfLines={4}
        value={details}
        onChangeText={setDetails}
        editable={!submitting}
      />

      <Text
        style={[styles.sosButton, submitting && styles.submitBtnDisabled]}
        onPress={submitting ? undefined : handleSubmit}
      >
        {submitting ? "送出中…" : "送出 SOS 警示"}
      </Text>

      <View style={styles.footer}>
        <Text style={styles.link} onPress={() => router.replace("/trip")}>
          返回行程
        </Text>
      </View>
    </View>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1, padding: 16, backgroundColor: "#fff5f3" },
  center: { flex: 1, justifyContent: "center", alignItems: "center" },
  heroCard: {
    backgroundColor: "#8a0f19",
    borderRadius: 16,
    padding: 20,
    marginBottom: 16,
  },
  eyebrow: {
    color: "#ffd7dc",
    fontSize: 12,
    fontWeight: "700",
    letterSpacing: 1,
    textTransform: "uppercase",
    marginBottom: 8,
  },
  title: { fontSize: 30, fontWeight: "800", color: "#fff", marginBottom: 8 },
  subtitle: { fontSize: 15, color: "#ffe9ec", lineHeight: 22 },
  noticeCard: {
    backgroundColor: "#fff",
    borderRadius: 14,
    padding: 16,
    marginBottom: 16,
    borderWidth: 1,
    borderColor: "#f2c2c8",
  },
  noticeTitle: {
    color: "#8a0f19",
    fontSize: 14,
    fontWeight: "700",
    marginBottom: 6,
  },
  noticeBody: { color: "#5f2930", fontSize: 14, lineHeight: 20 },
  fieldLabel: {
    marginBottom: 8,
    color: "#5f2930",
    fontSize: 14,
    fontWeight: "600",
  },
  input: {
    borderWidth: 1,
    borderColor: "#e6b7be",
    borderRadius: 14,
    padding: 12,
    fontSize: 16,
    textAlignVertical: "top",
    minHeight: 100,
    marginBottom: 16,
    backgroundColor: "#fff",
  },
  sosButton: {
    backgroundColor: "#c21423",
    color: "#fff",
    textAlign: "center",
    paddingVertical: 16,
    borderRadius: 14,
    fontSize: 18,
    fontWeight: "800",
  },
  submitBtnDisabled: { opacity: 0.6 },
  footer: { marginTop: 24, alignItems: "center" },
  link: { color: "#8a0f19", fontSize: 16, fontWeight: "600" },
  loadingLabel: { marginTop: 8, color: "#666" },
  disabledTitle: { fontSize: 24, fontWeight: "bold", marginBottom: 4 },
  empty: { textAlign: "center", color: "#999", marginTop: 32 },
});
