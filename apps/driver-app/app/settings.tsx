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
import { getDriverClient, getDriverId } from "@/lib/api-client";

function toErrorMessage(error: unknown): string {
  if (error instanceof Error && error.message.trim()) {
    return error.message.trim();
  }
  return "Request failed";
}

function formatSectionList(labels: string[]): string {
  if (labels.length <= 1) {
    return labels[0] ?? "";
  }
  if (labels.length === 2) {
    return `${labels[0]} and ${labels[1]}`;
  }
  return `${labels.slice(0, -1).join(", ")}, and ${labels.at(-1)}`;
}

export default function SettingsScreen() {
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [language, setLanguage] = useState("en");
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
  const driverId = getDriverId();

  useEffect(() => {
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
        setLanguage(settings.language ?? "en");
        setNotificationsEnabled(settings.notificationsEnabled ?? true);
        setAutoAcceptEnabled(settings.autoAcceptEnabled ?? false);
        setMaxAcceptRadius(
          settings.maxAcceptRadius != null
            ? String(settings.maxAcceptRadius)
            : "",
        );
      } else {
        loadFailures.push(`preferences (${toErrorMessage(settingsResult.reason)})`);
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
        loadFailures.push(`profile (${toErrorMessage(profileResult.reason)})`);
      }

      if (loadFailures.length > 0) {
        Alert.alert(
          "Some settings could not be loaded",
          `Using the available data. Failed to load ${formatSectionList(loadFailures)}.`,
        );
      }

      setLoading(false);
    };

    void loadSettings();

    return () => {
      isActive = false;
    };
  }, [driverId]);

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
      profileValidationError = "Name is required for the driver profile.";
    } else if (
      hasEmergencyContact &&
      (!trimmedEmergencyName || !trimmedEmergencyPhone)
    ) {
      profileValidationError =
        "Emergency contact name and phone are required when adding a contact.";
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
        savedSections.push("preferences");
      } else {
        failedSections.push(`preferences (${toErrorMessage(settingsResult.reason)})`);
      }

      if (profileResult.status === "fulfilled") {
        savedSections.push("profile");
      } else {
        failedSections.push(`profile (${toErrorMessage(profileResult.reason)})`);
      }

      if (failedSections.length === 0) {
        Alert.alert("Success", "Settings saved successfully.");
        return;
      }

      if (savedSections.length === 0) {
        Alert.alert(
          "Error",
          `Unable to save ${formatSectionList(failedSections)}.`,
        );
        return;
      }

      Alert.alert(
        "Partial success",
        `Saved ${formatSectionList(savedSections)}. Failed to save ${formatSectionList(failedSections)}.`,
      );
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
        <Text style={styles.sectionTitle}>Profile</Text>

        <View style={styles.field}>
          <Text style={styles.label}>Name</Text>
          <TextInput
            style={styles.fullInput}
            value={profileName}
            onChangeText={setProfileName}
            placeholder="Driver name"
          />
        </View>

        <View style={styles.field}>
          <Text style={styles.label}>Phone</Text>
          <TextInput
            style={styles.fullInput}
            value={profilePhone}
            onChangeText={setProfilePhone}
            placeholder="+886-900-000-000"
            keyboardType="phone-pad"
          />
        </View>

        <View style={styles.field}>
          <Text style={styles.label}>Email</Text>
          <TextInput
            style={styles.fullInput}
            value={profileEmail}
            onChangeText={setProfileEmail}
            placeholder="driver@example.com"
            keyboardType="email-address"
            autoCapitalize="none"
          />
        </View>

        <Text style={styles.sectionHint}>Emergency Contact</Text>

        <View style={styles.field}>
          <Text style={styles.label}>Contact Name</Text>
          <TextInput
            style={styles.fullInput}
            value={emergencyName}
            onChangeText={setEmergencyName}
            placeholder="Emergency contact"
          />
        </View>

        <View style={styles.field}>
          <Text style={styles.label}>Contact Phone</Text>
          <TextInput
            style={styles.fullInput}
            value={emergencyPhone}
            onChangeText={setEmergencyPhone}
            placeholder="+886-900-000-001"
            keyboardType="phone-pad"
          />
        </View>

        <View style={styles.field}>
          <Text style={styles.label}>Relationship</Text>
          <TextInput
            style={styles.fullInput}
            value={emergencyRelationship}
            onChangeText={setEmergencyRelationship}
            placeholder="Spouse, sibling, parent..."
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

      <View style={styles.section}>
        <PlatformBinding />
      </View>
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
});
