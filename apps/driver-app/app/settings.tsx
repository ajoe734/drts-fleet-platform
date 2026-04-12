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
import { getDriverClient } from "@/lib/api-client";

export default function SettingsScreen() {
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [language, setLanguage] = useState("en");
  const [notificationsEnabled, setNotificationsEnabled] = useState(true);
  const [autoAcceptEnabled, setAutoAcceptEnabled] = useState(false);
  const [maxAcceptRadius, setMaxAcceptRadius] = useState("");
  const router = useRouter();

  useEffect(() => {
    const client = getDriverClient();
    client
      .getDriverSettings("driver-demo-001")
      .then((settings: any) => {
        setLanguage(settings.language ?? "en");
        setNotificationsEnabled(settings.notificationsEnabled ?? true);
        setAutoAcceptEnabled(settings.autoAcceptEnabled ?? false);
        setMaxAcceptRadius(
          settings.maxAcceptRadius != null
            ? String(settings.maxAcceptRadius)
            : "",
        );
      })
      .catch(() => {
        // Defaults already set
      })
      .finally(() => setLoading(false));
  }, []);

  const handleSave = async () => {
    setSaving(true);
    const client = getDriverClient();
    try {
      await client.updateDriverSettings("driver-demo-001", {
        language,
        notificationsEnabled,
        autoAcceptEnabled,
        maxAcceptRadius: maxAcceptRadius ? Number(maxAcceptRadius) : null,
      });
      Alert.alert("Success", "Settings saved successfully");
    } catch (e: any) {
      Alert.alert("Error", e.message);
    } finally {
      setSaving(false);
    }
  };

  if (loading) {
    return (
      <View style={styles.center}>
        <ActivityIndicator size="large" />
        <Text style={styles.label}>Loading settings...</Text>
      </View>
    );
  }

  return (
    <ScrollView style={styles.container}>
      <Text style={styles.title}>Settings</Text>
      <Text style={styles.subtitle}>
        Profile, preferences, and academy surface.
      </Text>

      <View style={styles.section}>
        <Text style={styles.sectionTitle}>Preferences</Text>

        <View style={styles.row}>
          <Text style={styles.label}>Language</Text>
          <TextInput
            style={styles.input}
            value={language}
            onChangeText={setLanguage}
            placeholder="en"
          />
        </View>

        <View style={styles.row}>
          <Text style={styles.label}>Max Accept Radius (km)</Text>
          <TextInput
            style={styles.input}
            value={maxAcceptRadius}
            onChangeText={setMaxAcceptRadius}
            placeholder="e.g. 10"
            keyboardType="numeric"
          />
        </View>
      </View>

      <View style={styles.section}>
        <Text style={styles.sectionTitle}>Toggles</Text>

        <View style={styles.row}>
          <Text style={styles.label}>Notifications</Text>
          <Switch
            value={notificationsEnabled}
            onValueChange={setNotificationsEnabled}
          />
        </View>

        <View style={styles.row}>
          <Text style={styles.label}>Auto-Accept Jobs</Text>
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
        {saving ? "Saving..." : "Save Settings"}
      </Text>

      <View style={styles.footer}>
        <Text style={styles.link} onPress={() => router.push("/earnings")}>
          View Earnings →
        </Text>
      </View>
    </ScrollView>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1, padding: 16, backgroundColor: "#fff" },
  center: { flex: 1, justifyContent: "center", alignItems: "center" },
  title: { fontSize: 24, fontWeight: "bold", marginBottom: 4 },
  subtitle: { fontSize: 14, color: "#666", marginBottom: 24 },
  section: { marginBottom: 24 },
  sectionTitle: {
    fontSize: 18,
    fontWeight: "600",
    marginBottom: 12,
    color: "#333",
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
  input: {
    borderWidth: 1,
    borderColor: "#ccc",
    borderRadius: 6,
    padding: 8,
    fontSize: 14,
    width: 100,
    textAlign: "right",
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
});
