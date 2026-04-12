import { useEffect, useState } from "react";
import { View, Text, StyleSheet, ActivityIndicator, Alert } from "react-native";
import { useRouter } from "expo-router";
import type { DriverTaskRecord } from "@drts/contracts";
import { getDriverClient } from "@/lib/api-client";

export default function TripScreen() {
  const [taskDetail, setTaskDetail] = useState<DriverTaskRecord | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const router = useRouter();

  useEffect(() => {
    const client = getDriverClient();
    // For demo: try to get the first task, or show empty state
    client
      .listDriverTasks()
      .then((tasks) => {
        if (tasks.length > 0) {
          const first = tasks[0];
          setTaskDetail(first);
        }
        setLoading(false);
      })
      .catch((e) => {
        setError(e.message);
        setLoading(false);
      });
  }, []);

  const handleAction = async (action: string) => {
    if (!taskDetail?.taskId) return;
    const client = getDriverClient();
    const now = new Date().toISOString();
    try {
      switch (action) {
        case "accept":
          await client.acceptTask(taskDetail.taskId, { acceptedAt: now });
          break;
        case "depart":
          await client.departTask(taskDetail.taskId, { departedAt: now });
          break;
        case "arrived":
          await client.arrivedPickupTask(taskDetail.taskId, { arrivedAt: now });
          break;
        case "start":
          await client.startTask(taskDetail.taskId, { startedAt: now });
          break;
        case "complete":
          await client.completeTask(taskDetail.taskId, {
            completedAt: now,
            actualDistanceKm: 0,
            actualDurationSec: 0,
          });
          break;
      }
      Alert.alert("Success", `Task ${action} successful`);
      // Refresh task detail
      const tasks = await client.listDriverTasks();
      if (tasks.length > 0) {
        setTaskDetail(tasks[0]);
      }
    } catch (e: any) {
      Alert.alert("Error", e.message);
    }
  };

  if (loading) {
    return (
      <View style={styles.center}>
        <ActivityIndicator size="large" />
        <Text style={styles.label}>Loading trip...</Text>
      </View>
    );
  }

  return (
    <View style={styles.container}>
      <Text style={styles.title}>Trip Detail</Text>

      {error && <Text style={styles.error}>Error: {error}</Text>}

      {taskDetail ? (
        <View style={styles.card}>
          <Text style={styles.taskId}>Task: {taskDetail.taskId}</Text>
          <Text style={styles.taskStatus}>
            Status: {taskDetail.status ?? "unknown"}
          </Text>
          <Text style={styles.taskInfo}>
            {taskDetail.orderId
              ? `Order: ${taskDetail.orderId}`
              : "No order linked"}
          </Text>
        </View>
      ) : (
        <Text style={styles.empty}>No active trip.</Text>
      )}

      <View style={styles.actions}>
        <Text style={styles.actionLabel} onPress={() => handleAction("accept")}>
          Accept
        </Text>
        <Text style={styles.actionLabel} onPress={() => handleAction("depart")}>
          Depart
        </Text>
        <Text
          style={styles.actionLabel}
          onPress={() => handleAction("arrived")}
        >
          Arrived
        </Text>
        <Text style={styles.actionLabel} onPress={() => handleAction("start")}>
          Start Trip
        </Text>
        <Text
          style={styles.actionLabel}
          onPress={() => handleAction("complete")}
        >
          Complete
        </Text>
      </View>

      <View style={styles.footer}>
        <Text style={styles.link} onPress={() => router.push("/incident")}>
          Report Incident →
        </Text>
      </View>
    </View>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1, padding: 16, backgroundColor: "#fff" },
  center: { flex: 1, justifyContent: "center", alignItems: "center" },
  title: { fontSize: 24, fontWeight: "bold", marginBottom: 12 },
  error: { color: "red", marginBottom: 8 },
  empty: { textAlign: "center", color: "#999", marginTop: 32 },
  card: {
    padding: 16,
    backgroundColor: "#f0f7ff",
    borderRadius: 8,
    marginBottom: 16,
  },
  taskId: { fontSize: 18, fontWeight: "600" },
  taskStatus: { fontSize: 14, color: "#666", marginTop: 4 },
  taskInfo: { fontSize: 14, color: "#333", marginTop: 8 },
  actions: { marginBottom: 16 },
  actionLabel: {
    color: "#007AFF",
    fontSize: 16,
    paddingVertical: 8,
    borderBottomWidth: 1,
    borderBottomColor: "#eee",
  },
  footer: { alignItems: "center" },
  link: { color: "#007AFF", fontSize: 16 },
  label: { marginTop: 8, color: "#666" },
});
