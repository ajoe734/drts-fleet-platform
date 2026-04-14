import { useEffect, useState } from "react";
import {
  View,
  Text,
  FlatList,
  StyleSheet,
  ActivityIndicator,
  RefreshControl,
  TouchableOpacity,
} from "react-native";
import type {
  PlatformPresenceRecord,
  PlatformPresenceSummary,
} from "@drts/contracts";
import { getDriverClient } from "@/lib/api-client";

function StatusIndicator({ status }: { status: string }) {
  const isOnline = status === "online";
  return (
    <View
      style={[
        styles.statusDot,
        { backgroundColor: isOnline ? "#4caf50" : "#9e9e9e" },
      ]}
    />
  );
}

function PresenceCard({ record }: { record: PlatformPresenceRecord }) {
  const client = getDriverClient();
  const [toggling, setToggling] = useState(false);

  const handleToggle = async () => {
    setToggling(true);
    try {
      if (record.status === "online") {
        await client.setPlatformOffline({ platformCode: record.platformCode });
      } else {
        await client.setPlatformOnline({ platformCode: record.platformCode });
      }
    } catch (e: any) {
      console.error("Failed to toggle platform presence:", e.message);
    } finally {
      setToggling(false);
    }
  };

  const eligibilityColor =
    record.eligibility === "eligible"
      ? "#4caf50"
      : record.eligibility === "pending"
        ? "#ff9800"
        : "#f44336";

  return (
    <View style={styles.card}>
      <View style={styles.cardHeader}>
        <View style={styles.platformInfo}>
          <StatusIndicator status={record.status} />
          <Text style={styles.platformCode}>{record.platformCode}</Text>
        </View>
        <TouchableOpacity
          style={[styles.toggleBtn, toggling && styles.toggleBtnDisabled]}
          onPress={handleToggle}
          disabled={toggling}
        >
          <Text style={styles.toggleBtnText}>
            {toggling
              ? "..."
              : record.status === "online"
                ? "Go Offline"
                : "Go Online"}
          </Text>
        </TouchableOpacity>
      </View>

      <View style={styles.cardRow}>
        <Text style={styles.cardLabel}>Eligibility:</Text>
        <Text style={[styles.cardValue, { color: eligibilityColor }]}>
          {record.eligibility}
        </Text>
      </View>

      {record.tokenExpiresAt && (
        <View style={styles.cardRow}>
          <Text style={styles.cardLabel}>Token expires:</Text>
          <Text style={styles.cardValue}>
            {new Date(record.tokenExpiresAt).toLocaleString()}
          </Text>
        </View>
      )}

      {record.reauthRequired && (
        <View style={styles.cardRow}>
          <Text style={[styles.cardLabel, { color: "#f44336" }]}>
            Re-authentication required
          </Text>
        </View>
      )}

      {record.lastOnlineAt && (
        <View style={styles.cardRow}>
          <Text style={styles.cardLabel}>Last online:</Text>
          <Text style={styles.cardValue}>
            {new Date(record.lastOnlineAt).toLocaleString()}
          </Text>
        </View>
      )}
    </View>
  );
}

export default function PlatformPresenceScreen() {
  const [summary, setSummary] = useState<PlatformPresenceSummary | null>(null);
  const [loading, setLoading] = useState(true);
  const [refreshing, setRefreshing] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const loadPresence = async () => {
    const client = getDriverClient();
    try {
      const data = await client.getPlatformPresence();
      setSummary(data);
      setError(null);
    } catch (e: any) {
      setError(e.message);
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    loadPresence();
  }, []);

  const onRefresh = async () => {
    setRefreshing(true);
    await loadPresence();
    setRefreshing(false);
  };

  if (loading) {
    return (
      <View style={styles.center}>
        <ActivityIndicator size="large" />
        <Text style={styles.label}>Loading platform status...</Text>
      </View>
    );
  }

  return (
    <View style={styles.container}>
      <Text style={styles.title}>Platform Presence</Text>
      <Text style={styles.subtitle}>
        {summary?.presences.length ?? 0} platform(s) connected
      </Text>

      {error && <Text style={styles.error}>Error: {error}</Text>}

      {!summary || summary.presences.length === 0 ? (
        <Text style={styles.empty}>No platforms connected.</Text>
      ) : (
        <FlatList
          data={summary.presences}
          keyExtractor={(item) => item.platformCode}
          renderItem={({ item }) => <PresenceCard record={item} />}
          refreshControl={
            <RefreshControl refreshing={refreshing} onRefresh={onRefresh} />
          }
        />
      )}
    </View>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1, padding: 16, backgroundColor: "#fff" },
  center: { flex: 1, justifyContent: "center", alignItems: "center" },
  title: { fontSize: 24, fontWeight: "bold", marginBottom: 4 },
  subtitle: { fontSize: 14, color: "#666", marginBottom: 16 },
  error: { color: "red", marginBottom: 8 },
  empty: { textAlign: "center", color: "#999", marginTop: 32 },
  label: { marginTop: 8, color: "#666" },
  card: {
    padding: 12,
    marginBottom: 10,
    backgroundColor: "#fafafa",
    borderRadius: 8,
    borderWidth: 1,
    borderColor: "#e0e0e0",
  },
  cardHeader: {
    flexDirection: "row",
    justifyContent: "space-between",
    alignItems: "center",
    marginBottom: 8,
  },
  platformInfo: { flexDirection: "row", alignItems: "center" },
  statusDot: {
    width: 10,
    height: 10,
    borderRadius: 5,
    marginRight: 8,
  },
  platformCode: { fontSize: 16, fontWeight: "600" },
  toggleBtn: {
    paddingHorizontal: 12,
    paddingVertical: 6,
    backgroundColor: "#1976d2",
    borderRadius: 6,
  },
  toggleBtnDisabled: { backgroundColor: "#bdbdbd" },
  toggleBtnText: { color: "#fff", fontSize: 12, fontWeight: "600" },
  cardRow: {
    flexDirection: "row",
    justifyContent: "space-between",
    marginTop: 4,
  },
  cardLabel: { fontSize: 12, color: "#666" },
  cardValue: { fontSize: 12, fontWeight: "500" },
});
