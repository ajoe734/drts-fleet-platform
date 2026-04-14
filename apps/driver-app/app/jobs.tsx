import { useEffect, useState } from "react";
import {
  View,
  Text,
  FlatList,
  StyleSheet,
  ActivityIndicator,
  RefreshControl,
} from "react-native";
import { useRouter } from "expo-router";
import type { DriverTaskRecord } from "@drts/contracts";
import { getDriverClient } from "@/lib/api-client";

function PlatformBadge({ platform }: { platform: string | null }) {
  const label = platform ?? "direct";
  const bgColor = platform ? "#e0f7fa" : "#e8f5e9";
  const textColor = platform ? "#006064" : "#1b5e20";
  return (
    <View style={[styles.badge, { backgroundColor: bgColor }]}>
      <Text style={[styles.badgeText, { color: textColor }]}>{label}</Text>
    </View>
  );
}

export default function JobsScreen() {
  const [tasks, setTasks] = useState<DriverTaskRecord[]>([]);
  const [loading, setLoading] = useState(true);
  const [refreshing, setRefreshing] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [tasksEnabled, setTasksEnabled] = useState(true);
  const router = useRouter();

  const loadTasks = async () => {
    const client = getDriverClient();
    try {
      setTasks(await client.listDriverTasks());
      setError(null);
    } catch (e: any) {
      setError(e.message);
    }
  };

  useEffect(() => {
    const client = getDriverClient();

    // Check feature flag
    client
      .isFeatureEnabled("driver-app.tasks")
      .then((enabled) => {
        setTasksEnabled(enabled);
        if (enabled) {
          loadTasks();
        } else {
          setLoading(false);
        }
      })
      .catch(() => {
        // If flag check fails, assume enabled
        loadTasks();
      })
      .finally(() => setLoading(false));
  }, []);

  const onRefresh = async () => {
    setRefreshing(true);
    await loadTasks();
    setRefreshing(false);
  };

  if (loading) {
    return (
      <View style={styles.center}>
        <ActivityIndicator size="large" />
        <Text style={styles.label}>Loading tasks...</Text>
      </View>
    );
  }

  if (!tasksEnabled) {
    return (
      <View style={styles.center}>
        <Text style={styles.title}>Tasks Unavailable</Text>
        <Text style={styles.empty}>
          The task lifecycle feature is currently disabled.
        </Text>
      </View>
    );
  }

  return (
    <View style={styles.container}>
      <Text style={styles.title}>Jobs Inbox</Text>
      <Text style={styles.subtitle}>{tasks.length} task(s) assigned</Text>

      {error && <Text style={styles.error}>Error: {error}</Text>}

      {tasks.length === 0 ? (
        <Text style={styles.empty}>No tasks available.</Text>
      ) : (
        <FlatList
          data={tasks}
          keyExtractor={(item, i) => item.taskId ?? String(i)}
          renderItem={({ item }) => (
            <View style={styles.taskCard}>
              <View style={styles.taskHeader}>
                <Text style={styles.taskId}>{item.taskId}</Text>
                <PlatformBadge platform={item.sourcePlatform} />
              </View>
              <Text style={styles.taskStatus}>{item.status ?? "unknown"}</Text>
              {item.orderId && (
                <Text style={styles.taskOrder}>Order: {item.orderId}</Text>
              )}
            </View>
          )}
          refreshControl={
            <RefreshControl refreshing={refreshing} onRefresh={onRefresh} />
          }
        />
      )}

      <View style={styles.footer}>
        <Text style={styles.link} onPress={() => router.push("/trip")}>
          Open Trip →
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
  error: { color: "red", marginBottom: 8 },
  empty: { textAlign: "center", color: "#999", marginTop: 32 },
  taskCard: {
    padding: 12,
    marginBottom: 8,
    backgroundColor: "#f5f5f5",
    borderRadius: 8,
  },
  taskHeader: {
    flexDirection: "row",
    justifyContent: "space-between",
    alignItems: "center",
    marginBottom: 4,
  },
  taskId: { fontSize: 16, fontWeight: "600", flex: 1 },
  taskStatus: { fontSize: 12, color: "#666", marginTop: 4 },
  taskOrder: { fontSize: 12, color: "#333", marginTop: 2 },
  footer: { marginTop: 16, alignItems: "center" },
  link: { color: "#007AFF", fontSize: 16 },
  label: { marginTop: 8, color: "#666" },
  badge: {
    paddingHorizontal: 8,
    paddingVertical: 2,
    borderRadius: 12,
    marginLeft: 8,
  },
  badgeText: { fontSize: 11, fontWeight: "600" },
});
