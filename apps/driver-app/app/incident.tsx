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
    setSubmitting(true);
    const client = getDriverClient();
    try {
      await client.createIncident({
        title: "Driver SOS emergency",
        description:
          details.trim() || "SOS alert triggered from the driver app.",
        category: "safety",
        severity: "critical",
        reportedBy: "driver",
      });
      Alert.alert(
        "SOS sent",
        "Operations has received your critical safety alert.",
      );
      setDetails("");
      router.replace("/trip");
    } catch (e: any) {
      Alert.alert("Error", e.message);
    } finally {
      setSubmitting(false);
    }
  };

  if (incidentsEnabled === null) {
    return (
      <View style={styles.center}>
        <ActivityIndicator size="large" />
        <Text style={styles.loadingLabel}>Loading...</Text>
      </View>
    );
  }

  if (!incidentsEnabled) {
    return (
      <View style={styles.center}>
        <Text style={styles.disabledTitle}>Incident Reporting Unavailable</Text>
        <Text style={styles.empty}>This feature is currently disabled.</Text>
      </View>
    );
  }

  return (
    <View style={styles.container}>
      <View style={styles.heroCard}>
        <Text style={styles.eyebrow}>Driver Safety</Text>
        <Text style={styles.title}>SOS Emergency</Text>
        <Text style={styles.subtitle}>
          One tap sends a critical safety incident to operations immediately.
        </Text>
      </View>

      <View style={styles.noticeCard}>
        <Text style={styles.noticeTitle}>Dispatch behavior</Text>
        <Text style={styles.noticeBody}>
          This screen always creates an incident with category safety and
          severity critical.
        </Text>
      </View>

      <Text style={styles.fieldLabel}>Additional details (optional)</Text>
      <TextInput
        style={styles.input}
        placeholder="Share location, passenger status, or immediate risk..."
        multiline
        numberOfLines={4}
        value={details}
        onChangeText={setDetails}
        editable={!submitting}
      />

      <Text
        style={[styles.sosButton, submitting && styles.submitBtnDisabled]}
        onPress={handleSubmit}
      >
        {submitting ? "Sending SOS..." : "Send SOS Alert"}
      </Text>

      <View style={styles.footer}>
        <Text style={styles.link} onPress={() => router.replace("/trip")}>
          Back to Trip
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
