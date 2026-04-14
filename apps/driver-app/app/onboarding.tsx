import { useEffect, useState } from "react";
import { View, Text, StyleSheet, ActivityIndicator } from "react-native";
import { useRouter } from "expo-router";
import { getDriverClient } from "@/lib/api-client";
import { PlaceholderScreen } from "@/components/placeholder-screen";

export default function OnboardingScreen() {
  const [flagsOk, setFlagsOk] = useState<boolean | null>(null);
  const [identityOk, setIdentityOk] = useState<boolean | null>(null);
  const router = useRouter();

  useEffect(() => {
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
  }, []);

  const flagsStatus =
    flagsOk === null ? "checking" : flagsOk ? "active" : "fallback";
  const identityStatus =
    identityOk === null
      ? "checking"
      : identityOk
        ? "connected"
        : "disconnected";

  // If flags are still loading, show a loading state
  if (flagsOk === null || identityOk === null) {
    return (
      <View style={styles.center}>
        <ActivityIndicator size="large" />
        <Text style={styles.label}>Initializing driver app...</Text>
      </View>
    );
  }

  // If both checks pass, show the real onboarding
  if (flagsOk && identityOk) {
    return (
      <View style={styles.container}>
        <Text style={styles.title}>Multi-Platform Workstation</Text>
        <Text style={styles.subtitle}>
          API: {identityStatus} | Feature flags: {flagsStatus}
        </Text>
        <Text style={styles.description}>
          Manage tasks, earnings, and presence across all connected platforms
          from a single workspace.
        </Text>

        <View style={styles.navSection}>
          <Text style={styles.navLabel}>Quick Access:</Text>
          <Text style={styles.link} onPress={() => router.push("/jobs")}>
            Jobs Inbox →
          </Text>
          <Text style={styles.link} onPress={() => router.push("/earnings")}>
            Earnings Dashboard →
          </Text>
          <Text
            style={styles.link}
            onPress={() => router.push("/platform-presence")}
          >
            Platform Presence →
          </Text>
          <Text style={styles.link} onPress={() => router.push("/shift")}>
            Shift & Attendance →
          </Text>
        </View>
      </View>
    );
  }

  // Fallback: show placeholder
  return (
    <PlaceholderScreen
      title="Onboarding"
      description="Placeholder onboarding shell for drivers and safety operators. Identity checks, training gates, and provisioning rules are deferred."
      nextHref="/jobs"
      nextLabel="Go to Jobs"
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
});
