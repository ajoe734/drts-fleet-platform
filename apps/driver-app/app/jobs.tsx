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
import type { DriverTaskRecord, OwnedOrderRecord } from "@drts/contracts";
import { getDriverClient } from "@/lib/api-client";
import { PlatformTaskBadge } from "@/components/platform-task-badge";

function RouteLockedIcon() {
  return <Text style={styles.lockIcon}>🔒</Text>;
}

function FixedPriceBadge() {
  return (
    <View style={[styles.badge, { backgroundColor: "#e3f2fd" }]}>
      <Text style={[styles.badgeText, { color: "#0d47a1" }]}>fixed price</Text>
    </View>
  );
}

function TaskTypeBadge({
  serviceBucket,
  businessDispatchSubtype,
  dispatchSemantics,
}: {
  serviceBucket: string | null;
  businessDispatchSubtype: string | null;
  dispatchSemantics: string | null;
}) {
  let label = "platform_dispatch";
  let bgColor = "#f3e5f5";
  let textColor = "#4a148c";

  if (businessDispatchSubtype === "enterprise_dispatch") {
    label = "enterprise_shuttle";
    bgColor = "#e8eaf6";
    textColor = "#1a237e";
  } else if (businessDispatchSubtype === "credit_card_airport_transfer") {
    label = "airport_pickup";
    bgColor = "#e0f2f1";
    textColor = "#004d40";
  } else if (dispatchSemantics === "forwarder_broadcast") {
    label = "auto_assigned";
    bgColor = "#fff3e0";
    textColor = "#e65100";
  } else if (serviceBucket === "standard_taxi") {
    label = "platform_dispatch";
    bgColor = "#f3e5f5";
    textColor = "#4a148c";
  }

  return (
    <View style={[styles.badge, { backgroundColor: bgColor }]}>
      <Text style={[styles.badgeText, { color: textColor }]}>{label}</Text>
    </View>
  );
}

function isForwardedTask(task: DriverTaskRecord): boolean {
  return task.sourcePlatform != null;
}

export default function JobsScreen() {
  const [tasks, setTasks] = useState<DriverTaskRecord[]>([]);
  const [orderMap, setOrderMap] = useState<Record<string, OwnedOrderRecord>>(
    {},
  );
  const [loading, setLoading] = useState(true);
  const [refreshing, setRefreshing] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [tasksEnabled, setTasksEnabled] = useState(true);
  const router = useRouter();

  const loadTasks = async () => {
    const client = getDriverClient();
    try {
      const fetchedTasks = await client.listDriverTasks();
      setTasks(fetchedTasks);

      // Fetch order details for fixedPrice and task type info
      const orderPromises = fetchedTasks
        .filter((t) => t.orderId)
        .map(
          async (
            t,
          ): Promise<{ orderId: string; order: OwnedOrderRecord | null }> => {
            try {
              const order = (await client.getOrder(
                t.orderId!,
              )) as OwnedOrderRecord;
              return { orderId: t.orderId!, order };
            } catch {
              return { orderId: t.orderId!, order: null };
            }
          },
        );

      const orderResults = await Promise.all(orderPromises);
      const newOrderMap: Record<string, OwnedOrderRecord> = {};
      orderResults.forEach(({ orderId, order }) => {
        if (order && orderId) {
          newOrderMap[orderId] = order;
        }
      });
      setOrderMap(newOrderMap);

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
          renderItem={({ item }) => {
            const forwarded = isForwardedTask(item);
            const order = item.orderId ? orderMap[item.orderId] : null;
            const fixedPrice = order?.fixedPrice ?? false;
            const serviceBucket = order?.serviceBucket ?? null;
            const businessDispatchSubtype =
              order?.businessDispatchSubtype ?? null;
            const dispatchSemantics = order?.dispatchSemantics ?? null;

            return (
              <View style={styles.taskCard}>
                <View style={styles.taskHeader}>
                  <Text style={styles.taskId}>{item.taskId}</Text>
                  <View style={styles.badgeRow}>
                    {forwarded && <RouteLockedIcon />}
                    <PlatformTaskBadge platformCode={item.sourcePlatform} />
                    <TaskTypeBadge
                      serviceBucket={serviceBucket}
                      businessDispatchSubtype={businessDispatchSubtype}
                      dispatchSemantics={dispatchSemantics}
                    />
                    {fixedPrice && <FixedPriceBadge />}
                  </View>
                </View>
                <Text style={styles.taskStatus}>
                  {item.status ?? "unknown"}
                </Text>
                {item.orderId && (
                  <Text style={styles.taskOrder}>Order: {item.orderId}</Text>
                )}
                {forwarded && (
                  <Text style={styles.forwardedNote}>
                    Dispatched by {item.sourcePlatform}. Rules cannot be
                    overridden locally.
                  </Text>
                )}
              </View>
            );
          }}
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
  badgeRow: { flexDirection: "row", alignItems: "center" },
  badgeText: { fontSize: 11, fontWeight: "600" },
  lockIcon: { marginLeft: 6, fontSize: 12 },
  forwardedNote: {
    fontSize: 11,
    color: "#666",
    marginTop: 6,
    fontStyle: "italic",
  },
});
