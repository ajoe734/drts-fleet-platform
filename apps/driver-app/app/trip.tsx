import { useEffect, useState } from "react";
import { View, Text, StyleSheet, ActivityIndicator, Alert } from "react-native";
import { useRouter } from "expo-router";
import type { DriverTaskRecord, OwnedOrderRecord } from "@drts/contracts";
import { getDriverClient } from "@/lib/api-client";
import RouteDisplay from "@/components/route-display";

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

function RouteLockedBadge() {
  return (
    <View style={[styles.badge, { backgroundColor: "#fff3e0" }]}>
      <Text style={[styles.badgeText, { color: "#e65100" }]}>route-locked</Text>
    </View>
  );
}

function isForwardedTask(task: DriverTaskRecord | null): boolean {
  return task?.sourcePlatform != null;
}

export default function TripScreen() {
  const [taskDetail, setTaskDetail] = useState<DriverTaskRecord | null>(null);
  const [orderDetail, setOrderDetail] = useState<OwnedOrderRecord | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const router = useRouter();

  useEffect(() => {
    const client = getDriverClient();
    // For demo: load first task and its order if present
    client
      .listDriverTasks()
      .then(async (tasks) => {
        if (tasks.length > 0) {
          const first = tasks[0];
          setTaskDetail(first);
          if (first.orderId) {
            try {
              const order = (await client.getOrder(
                first.orderId,
              )) as OwnedOrderRecord;
              setOrderDetail(order);
            } catch {
              // ignore order fetch errors in demo
            }
          }
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
          <View style={styles.cardHeader}>
            <Text style={styles.taskId}>Task: {taskDetail.taskId}</Text>
            <View style={styles.badgeRow}>
              {isForwardedTask(taskDetail) && <RouteLockedBadge />}
              <PlatformBadge platform={taskDetail.sourcePlatform} />
            </View>
          </View>
          <Text style={styles.taskStatus}>
            Status: {taskDetail.status ?? "unknown"}
          </Text>
          <Text style={styles.taskInfo}>
            {taskDetail.orderId
              ? `Order: ${taskDetail.orderId}`
              : "No order linked"}
          </Text>
          <RouteDisplay task={taskDetail} order={orderDetail} />
          {isForwardedTask(taskDetail) && (
            <Text style={styles.forwardedNote}>
              Dispatched by {taskDetail.sourcePlatform}. Dispatch rules are
              managed by the source platform.
            </Text>
          )}
        </View>
      ) : (
        <Text style={styles.empty}>No active trip.</Text>
      )}

      {!isForwardedTask(taskDetail) && taskDetail && (
        <View style={styles.actions}>
          <Text
            style={styles.actionLabel}
            onPress={() => handleAction("accept")}
          >
            Accept
          </Text>
          <Text
            style={styles.actionLabel}
            onPress={() => handleAction("depart")}
          >
            Depart
          </Text>
          <Text
            style={styles.actionLabel}
            onPress={() => handleAction("arrived")}
          >
            Arrived
          </Text>
          <Text
            style={styles.actionLabel}
            onPress={() => handleAction("start")}
          >
            Start Trip
          </Text>
          <Text
            style={styles.actionLabel}
            onPress={() => handleAction("complete")}
          >
            Complete
          </Text>
        </View>
      )}
      {taskDetail && isForwardedTask(taskDetail) && (
        <View style={styles.actions}>
          <Text style={styles.forwardedActionNote}>
            Actions are managed by {taskDetail.sourcePlatform}.
          </Text>
        </View>
      )}

      <View style={styles.footer}>
        <Text style={styles.link} onPress={() => router.push("/incident")}>
          SOS Emergency →
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
  cardHeader: {
    flexDirection: "row",
    justifyContent: "space-between",
    alignItems: "flex-start",
    marginBottom: 8,
  },
  badgeRow: { flexDirection: "row", alignItems: "center", flexShrink: 1 },
  badge: {
    paddingHorizontal: 8,
    paddingVertical: 2,
    borderRadius: 12,
    marginLeft: 4,
  },
  badgeText: { fontSize: 11, fontWeight: "600" },
  taskId: { fontSize: 18, fontWeight: "600", flex: 1 },
  taskStatus: { fontSize: 14, color: "#666", marginTop: 4 },
  taskInfo: { fontSize: 14, color: "#333", marginTop: 8 },
  forwardedNote: {
    fontSize: 11,
    color: "#666",
    marginTop: 8,
    fontStyle: "italic",
  },
  forwardedActionNote: {
    fontSize: 13,
    color: "#666",
    textAlign: "center",
    fontStyle: "italic",
  },
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
