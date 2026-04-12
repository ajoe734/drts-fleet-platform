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
  const [description, setDescription] = useState("");
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
    if (!description.trim()) {
      Alert.alert("Error", "Description is required");
      return;
    }

    setSubmitting(true);
    const client = getDriverClient();
    try {
      await client.createIncident({
        title: "Driver-reported incident",
        description: description.trim(),
        category: "operational",
        severity: "medium",
        reportedBy: "driver",
        caseSource: "app",
      });
      Alert.alert("Success", "Incident reported successfully");
      setDescription("");
      router.push("/earnings");
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
        <Text style={styles.label}>Loading...</Text>
      </View>
    );
  }

  if (!incidentsEnabled) {
    return (
      <View style={styles.center}>
        <Text style={styles.title}>Incident Reporting Unavailable</Text>
        <Text style={styles.empty}>This feature is currently disabled.</Text>
      </View>
    );
  }

  return (
    <View style={styles.container}>
      <Text style={styles.title}>Report Incident</Text>
      <Text style={styles.subtitle}>
        Submit safety events and operational escalation.
      </Text>

      <TextInput
        style={styles.input}
        placeholder="Describe the incident..."
        multiline
        numberOfLines={4}
        value={description}
        onChangeText={setDescription}
        editable={!submitting}
      />

      <Text
        style={[styles.submitBtn, submitting && styles.submitBtnDisabled]}
        onPress={handleSubmit}
      >
        {submitting ? "Submitting..." : "Submit Report"}
      </Text>

      <View style={styles.footer}>
        <Text style={styles.link} onPress={() => router.push("/earnings")}>
          View Earnings →
        </Text>
      </View>
    </View>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1, padding: 16, backgroundColor: "#fff" },
  center: { flex: 1, justifyContent: "center", alignItems: "center" },
  title: { fontSize: 24, fontWeight: "bold", marginBottom: 4 },
  subtitle: { fontSize: 14, color: "#666", marginBottom: 16 },
  input: {
    borderWidth: 1,
    borderColor: "#ccc",
    borderRadius: 8,
    padding: 12,
    fontSize: 16,
    textAlignVertical: "top",
    minHeight: 100,
    marginBottom: 16,
  },
  submitBtn: {
    backgroundColor: "#007AFF",
    color: "#fff",
    textAlign: "center",
    padding: 14,
    borderRadius: 8,
    fontSize: 16,
    fontWeight: "600",
  },
  submitBtnDisabled: { opacity: 0.6 },
  footer: { marginTop: 24, alignItems: "center" },
  link: { color: "#007AFF", fontSize: 16 },
  label: { marginTop: 8, color: "#666" },
  empty: { textAlign: "center", color: "#999", marginTop: 32 },
});
