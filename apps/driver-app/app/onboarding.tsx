import { useEffect, useState } from "react";
import {
  View,
  Text,
  StyleSheet,
  ActivityIndicator,
  Pressable,
  ScrollView,
} from "react-native";
import { useRouter } from "expo-router";
import { getDriverClient } from "@/lib/api-client";

type ProbeKey = "featureFlags" | "identity";
type ProbeStatus = "checking" | "healthy" | "degraded";

interface ProbeState {
  status: ProbeStatus;
  detail: string;
}

const CHECKING_PROBE: ProbeState = {
  status: "checking",
  detail: "Checking connectivity...",
};

function toErrorDetail(error: unknown): string {
  if (error instanceof Error && error.message.trim()) {
    return error.message.trim();
  }
  return "Request failed";
}

function getStatusTone(status: ProbeStatus) {
  if (status === "healthy") {
    return {
      pill: styles.statusHealthy,
      text: styles.statusHealthyText,
      card: styles.probeCardHealthy,
    };
  }

  if (status === "degraded") {
    return {
      pill: styles.statusDegraded,
      text: styles.statusDegradedText,
      card: styles.probeCardDegraded,
    };
  }

  return {
    pill: styles.statusChecking,
    text: styles.statusCheckingText,
    card: styles.probeCardChecking,
  };
}

export default function OnboardingScreen() {
  const [featureFlags, setFeatureFlags] = useState<ProbeState>(CHECKING_PROBE);
  const [identity, setIdentity] = useState<ProbeState>(CHECKING_PROBE);
  const [refreshing, setRefreshing] = useState(false);
  const [lastCheckedAt, setLastCheckedAt] = useState<string | null>(null);
  const router = useRouter();

  const runChecks = async () => {
    const client = getDriverClient();
    setRefreshing(true);
    setFeatureFlags(CHECKING_PROBE);
    setIdentity(CHECKING_PROBE);

    const [flagsResult, identityResult] = await Promise.allSettled([
      client.getFeatureFlags(),
      client.getIdentityContext(),
    ]);

    setFeatureFlags(
      flagsResult.status === "fulfilled"
        ? {
            status: "healthy",
            detail: "Feature policy loaded successfully.",
          }
        : {
            status: "degraded",
            detail: toErrorDetail(flagsResult.reason),
          },
    );
    setIdentity(
      identityResult.status === "fulfilled"
        ? {
            status: "healthy",
            detail: "Driver identity verified for this session.",
          }
        : {
            status: "degraded",
            detail: toErrorDetail(identityResult.reason),
          },
    );
    setLastCheckedAt(new Date().toLocaleTimeString());
    setRefreshing(false);
  };

  useEffect(() => {
    void runChecks();
  }, []);

  const initialChecking =
    !lastCheckedAt &&
    (featureFlags.status === "checking" || identity.status === "checking");
  const fullyReady =
    featureFlags.status === "healthy" && identity.status === "healthy";
  const limitedModeAvailable =
    identity.status === "healthy" && featureFlags.status === "degraded";
  const settingsRecoveryAvailable = identity.status === "healthy";
  const degradedTitle =
    identity.status === "degraded"
      ? "Driver access needs recovery"
      : "Operating in degraded mode";
  const degradedSummary =
    identity.status === "degraded"
      ? "We could not confirm the driver identity context for this device. Keep the app in recovery mode until identity is restored."
      : "Core driver identity is available, but the feature policy service is unavailable. You can retry checks or continue with limited access.";
  const nextStepSummary =
    identity.status === "degraded"
      ? "Retry the health checks after restoring connectivity or confirming the driver session headers."
      : "Continue to settings or jobs only if the dispatcher confirms the current shift can proceed with reduced guidance.";

  if (initialChecking) {
    return (
      <View style={styles.center}>
        <ActivityIndicator size="large" />
        <Text style={styles.label}>Initializing driver app...</Text>
      </View>
    );
  }

  if (fullyReady) {
    return (
      <View style={styles.container}>
        <Text style={styles.title}>Multi-Platform Workstation</Text>
        <Text style={styles.subtitle}>
          API: connected | Feature flags: active
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

  return (
    <ScrollView contentContainerStyle={styles.degradedScroll}>
      <View style={styles.degradedCard}>
        <Text style={styles.eyebrow}>Operational recovery</Text>
        <Text style={styles.degradedTitle}>{degradedTitle}</Text>
        <Text style={styles.degradedDescription}>{degradedSummary}</Text>

        <View style={styles.probeList}>
          {[
            {
              key: "featureFlags" as ProbeKey,
              label: "Feature policy",
              state: featureFlags,
            },
            {
              key: "identity" as ProbeKey,
              label: "Driver identity",
              state: identity,
            },
          ].map(({ key, label, state }) => {
            const tone = getStatusTone(state.status);

            return (
              <View key={key} style={[styles.probeCard, tone.card]}>
                <View style={styles.probeHeader}>
                  <Text style={styles.probeLabel}>{label}</Text>
                  <View style={[styles.statusPill, tone.pill]}>
                    <Text style={[styles.statusPillText, tone.text]}>
                      {state.status}
                    </Text>
                  </View>
                </View>
                <Text style={styles.probeDetail}>{state.detail}</Text>
              </View>
            );
          })}
        </View>

        <View style={styles.recoveryPanel}>
          <Text style={styles.recoveryTitle}>Recovery guidance</Text>
          <Text style={styles.recoveryText}>{nextStepSummary}</Text>
          {lastCheckedAt ? (
            <Text style={styles.recoveryMeta}>
              Last checked at {lastCheckedAt}
            </Text>
          ) : null}
        </View>

        <View style={styles.actionGroup}>
          <Pressable
            style={[styles.primaryButton, refreshing && styles.buttonDisabled]}
            disabled={refreshing}
            onPress={() => void runChecks()}
          >
            {refreshing ? (
              <ActivityIndicator color="#f8fafc" />
            ) : (
              <Text style={styles.primaryButtonText}>Retry health checks</Text>
            )}
          </Pressable>

          {settingsRecoveryAvailable ? (
            <Pressable
              style={styles.secondaryButton}
              onPress={() => router.push("/settings")}
            >
              <Text style={styles.secondaryButtonText}>
                Open profile and settings
              </Text>
            </Pressable>
          ) : (
            <View style={styles.infoBanner}>
              <Text style={styles.infoBannerText}>
                Profile recovery stays locked until the driver identity context
                is restored.
              </Text>
            </View>
          )}

          {limitedModeAvailable ? (
            <Pressable
              style={styles.tertiaryButton}
              onPress={() => router.push("/jobs")}
            >
              <Text style={styles.tertiaryButtonText}>
                Continue to jobs with limited guidance
              </Text>
            </Pressable>
          ) : null}
        </View>
      </View>
    </ScrollView>
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
  degradedScroll: {
    flexGrow: 1,
    justifyContent: "center",
    padding: 20,
    backgroundColor: "#f3f7f6",
  },
  degradedCard: {
    borderRadius: 24,
    backgroundColor: "#ffffff",
    padding: 24,
    shadowColor: "#0f172a",
    shadowOpacity: 0.08,
    shadowRadius: 18,
    elevation: 4,
  },
  eyebrow: {
    color: "#0f766e",
    fontSize: 12,
    fontWeight: "700",
    letterSpacing: 1,
    marginBottom: 10,
    textTransform: "uppercase",
  },
  title: {
    fontSize: 28,
    fontWeight: "bold",
    marginBottom: 8,
    textAlign: "center",
  },
  degradedTitle: {
    fontSize: 28,
    fontWeight: "700",
    color: "#0f172a",
    marginBottom: 10,
  },
  subtitle: {
    fontSize: 14,
    color: "#666",
    marginBottom: 12,
    textAlign: "center",
  },
  degradedDescription: {
    fontSize: 15,
    lineHeight: 22,
    color: "#475569",
    marginBottom: 18,
  },
  description: {
    fontSize: 14,
    color: "#444",
    textAlign: "center",
    marginBottom: 24,
    lineHeight: 20,
  },
  probeList: {
    gap: 12,
  },
  probeCard: {
    borderRadius: 16,
    borderWidth: 1,
    padding: 14,
  },
  probeCardHealthy: {
    borderColor: "#bbf7d0",
    backgroundColor: "#f0fdf4",
  },
  probeCardDegraded: {
    borderColor: "#fecaca",
    backgroundColor: "#fff7ed",
  },
  probeCardChecking: {
    borderColor: "#cbd5e1",
    backgroundColor: "#f8fafc",
  },
  probeHeader: {
    flexDirection: "row",
    justifyContent: "space-between",
    alignItems: "center",
    marginBottom: 8,
  },
  probeLabel: {
    fontSize: 16,
    fontWeight: "600",
    color: "#0f172a",
  },
  probeDetail: {
    fontSize: 14,
    lineHeight: 20,
    color: "#475569",
  },
  statusPill: {
    borderRadius: 999,
    paddingHorizontal: 10,
    paddingVertical: 4,
  },
  statusPillText: {
    fontSize: 12,
    fontWeight: "700",
    textTransform: "capitalize",
  },
  statusHealthy: {
    backgroundColor: "#dcfce7",
  },
  statusHealthyText: {
    color: "#166534",
  },
  statusDegraded: {
    backgroundColor: "#fee2e2",
  },
  statusDegradedText: {
    color: "#b91c1c",
  },
  statusChecking: {
    backgroundColor: "#e2e8f0",
  },
  statusCheckingText: {
    color: "#334155",
  },
  recoveryPanel: {
    borderRadius: 16,
    backgroundColor: "#f8fafc",
    padding: 16,
    marginTop: 18,
  },
  recoveryTitle: {
    fontSize: 16,
    fontWeight: "700",
    color: "#0f172a",
    marginBottom: 6,
  },
  recoveryText: {
    fontSize: 14,
    lineHeight: 20,
    color: "#475569",
  },
  recoveryMeta: {
    fontSize: 12,
    color: "#64748b",
    marginTop: 8,
  },
  actionGroup: {
    gap: 12,
    marginTop: 18,
  },
  primaryButton: {
    alignItems: "center",
    backgroundColor: "#0f766e",
    borderRadius: 999,
    minHeight: 52,
    justifyContent: "center",
    paddingHorizontal: 20,
  },
  primaryButtonText: {
    color: "#f8fafc",
    fontSize: 16,
    fontWeight: "700",
  },
  secondaryButton: {
    alignItems: "center",
    borderColor: "#0f766e",
    borderRadius: 999,
    borderWidth: 1,
    justifyContent: "center",
    minHeight: 52,
    paddingHorizontal: 20,
  },
  secondaryButtonText: {
    color: "#0f766e",
    fontSize: 16,
    fontWeight: "700",
  },
  tertiaryButton: {
    alignItems: "center",
    justifyContent: "center",
    minHeight: 44,
  },
  tertiaryButtonText: {
    color: "#1d4ed8",
    fontSize: 15,
    fontWeight: "600",
  },
  infoBanner: {
    borderRadius: 16,
    backgroundColor: "#eff6ff",
    padding: 14,
  },
  infoBannerText: {
    color: "#1e3a8a",
    fontSize: 14,
    lineHeight: 20,
    textAlign: "center",
  },
  buttonDisabled: {
    opacity: 0.7,
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
