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
import { Ionicons } from "@expo/vector-icons";
import { useRouter } from "expo-router";
import type { DriverTaskRecord, OwnedOrderRecord } from "@drts/contracts";
import { PlatformTaskBadge } from "@/components/platform-task-badge";
import { getDriverClient } from "@/lib/api-client";
import {
  formatDriverTaskStatusLabel,
  formatDriverTaskTypeLabel,
} from "@/lib/operational-labels";
import {
  ActionButton,
  BottomActionBar,
  EmptyState,
  ErrorBanner,
  IconButton,
  InfoTile,
  PageHeader,
  SegmentedControl,
  StatusChip,
  Tokens,
} from "@/components/ui";

type TaskFilterValue =
  | "all"
  | "needs_action"
  | "in_progress"
  | "platform_closed";

const FILTER_OPTIONS = [
  { label: "全部", value: "all" },
  { label: "待處理", value: "needs_action" },
  { label: "進行中", value: "in_progress" },
  { label: "平台結案", value: "platform_closed" },
] as const;

function isForwardedTask(task: DriverTaskRecord): boolean {
  return task.sourcePlatform != null;
}

function isForwarderTerminalTask(task: DriverTaskRecord): boolean {
  return isForwardedTask(task) && task.status === "cancelled";
}

function matchesFilter(
  task: DriverTaskRecord,
  filter: TaskFilterValue,
): boolean {
  if (filter === "all") {
    return true;
  }

  if (filter === "platform_closed") {
    return isForwarderTerminalTask(task);
  }

  if (filter === "needs_action") {
    return (
      task.status === "pending_acceptance" || task.status === "proof_pending"
    );
  }

  return (
    task.status === "accepted" ||
    task.status === "enroute_pickup" ||
    task.status === "arrived_pickup" ||
    task.status === "on_trip"
  );
}

function getStatusChipVariant(task: DriverTaskRecord) {
  if (isForwarderTerminalTask(task)) {
    return "danger" as const;
  }

  switch (task.status) {
    case "pending_acceptance":
    case "proof_pending":
      return "warning" as const;
    case "accepted":
    case "enroute_pickup":
    case "arrived_pickup":
    case "on_trip":
      return "info" as const;
    case "completed":
      return "success" as const;
    case "rejected":
    case "cancelled":
      return "danger" as const;
    default:
      return "default" as const;
  }
}

function RouteLockBadge() {
  return (
    <View style={styles.routeLockBadge}>
      <Ionicons
        name="lock-closed"
        size={12}
        color={Tokens.colors.warning}
        style={styles.routeLockIcon}
      />
      <Text style={styles.routeLockText}>路線鎖定</Text>
    </View>
  );
}

function FixedPriceBadge() {
  return <StatusChip label="固定車資" variant="info" />;
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
  return (
    <StatusChip
      label={formatDriverTaskTypeLabel({
        serviceBucket,
        businessDispatchSubtype,
        dispatchSemantics,
      })}
      variant="default"
    />
  );
}

function ForwarderTerminalBadge() {
  return <StatusChip label="平台已結案" variant="danger" />;
}

function buildOperationalNote(task: DriverTaskRecord) {
  if (isForwarderTerminalTask(task)) {
    return "來源平台已結案，無需本地後續操作；若資訊有誤，請聯繫派車台。";
  }

  if (isForwardedTask(task)) {
    return `由 ${task.sourcePlatform} 管理派遣、路線與完單狀態；若同步停滯，請聯繫派車台。`;
  }

  if (task.status === "pending_acceptance") {
    return "請儘速確認是否接受此任務，避免錯過派遣時效。";
  }

  if (task.status === "proof_pending") {
    return "此任務待補完單憑證，補件後才會進入後續結算流程。";
  }

  return "點擊任務卡進入行程作業，查看目前進度與下一步操作。";
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
  const [selectedFilter, setSelectedFilter] = useState<TaskFilterValue>("all");
  const router = useRouter();

  const loadTasks = async () => {
    const client = getDriverClient();
    try {
      const fetchedTasks = await client.listDriverTasks();
      setTasks(fetchedTasks);

      const orderPromises = fetchedTasks
        .filter((task) => task.orderId)
        .map(
          async (
            task,
          ): Promise<{ orderId: string; order: OwnedOrderRecord | null }> => {
            try {
              const order = (await client.getOrder(
                task.orderId,
              )) as OwnedOrderRecord;
              return { orderId: task.orderId, order };
            } catch {
              return { orderId: task.orderId, order: null };
            }
          },
        );

      const orderResults = await Promise.all(orderPromises);
      const nextOrderMap: Record<string, OwnedOrderRecord> = {};
      orderResults.forEach(({ orderId, order }) => {
        if (order) {
          nextOrderMap[orderId] = order;
        }
      });

      setOrderMap(nextOrderMap);
      setError(null);
    } catch (nextError: unknown) {
      if (nextError instanceof Error && nextError.message.trim()) {
        setError(nextError.message.trim());
      } else {
        setError("任務清單載入失敗。");
      }
    }
  };

  useEffect(() => {
    const client = getDriverClient();

    client
      .isFeatureEnabled("driver-app.tasks")
      .then((enabled) => {
        setTasksEnabled(enabled);
        if (enabled) {
          return loadTasks();
        }
        return undefined;
      })
      .catch(() => loadTasks())
      .finally(() => setLoading(false));
  }, []);

  const onRefresh = async () => {
    setRefreshing(true);
    await loadTasks();
    setRefreshing(false);
  };

  const assignedCount = tasks.length;
  const forwardedCount = tasks.filter(isForwardedTask).length;
  const filteredTasks = tasks.filter((task) =>
    matchesFilter(task, selectedFilter),
  );

  if (loading) {
    return (
      <View style={styles.screen}>
        <PageHeader title="任務收件匣" />
        <View style={styles.centerState}>
          <ActivityIndicator size="large" color={Tokens.colors.primary} />
          <Text style={styles.loadingLabel}>載入任務中…</Text>
        </View>
      </View>
    );
  }

  if (!tasksEnabled) {
    return (
      <View style={styles.screen}>
        <PageHeader title="任務收件匣" />
        <EmptyState
          title="任務清單暫停提供"
          description="此功能目前未啟用，請稍後再試或改從行程作業查看目前任務。"
          icon="briefcase-outline"
          actionTitle="開啟行程作業"
          onAction={() => router.push("/trip")}
          style={styles.fillState}
        />
      </View>
    );
  }

  return (
    <View style={styles.screen}>
      <PageHeader
        title="任務收件匣"
        subtitle={`已指派 ${assignedCount} 筆任務`}
        rightElement={
          <IconButton
            icon="refresh"
            onPress={onRefresh}
            disabled={refreshing}
            accessibilityLabel="重新整理任務清單"
          />
        }
      />

      <FlatList
        data={filteredTasks}
        keyExtractor={(item) => item.taskId}
        renderItem={({ item }) => {
          const forwarded = isForwardedTask(item);
          const forwarderTerminal = isForwarderTerminalTask(item);
          const order = item.orderId ? orderMap[item.orderId] : null;
          const fixedPrice = order?.fixedPrice ?? false;
          const serviceBucket = order?.serviceBucket ?? null;
          const businessDispatchSubtype =
            order?.businessDispatchSubtype ?? null;
          const dispatchSemantics = order?.dispatchSemantics ?? null;

          return (
            <TouchableOpacity
              activeOpacity={0.85}
              onPress={() => router.push("/trip")}
              style={[
                styles.taskCard,
                forwarderTerminal && styles.forwarderTerminalCard,
              ]}
            >
              <View style={styles.taskCardHeader}>
                <Text style={styles.taskId} numberOfLines={1}>
                  {item.taskId}
                </Text>
                <StatusChip
                  label={formatDriverTaskStatusLabel(item.status)}
                  variant={getStatusChipVariant(item)}
                />
              </View>

              <Text style={styles.orderId}>訂單 {item.orderId}</Text>

              <View style={styles.badgeRow}>
                {forwarded ? <RouteLockBadge /> : null}
                <PlatformTaskBadge platformCode={item.sourcePlatform} />
                <TaskTypeBadge
                  serviceBucket={serviceBucket}
                  businessDispatchSubtype={businessDispatchSubtype}
                  dispatchSemantics={dispatchSemantics}
                />
                {fixedPrice ? <FixedPriceBadge /> : null}
                {forwarderTerminal ? <ForwarderTerminalBadge /> : null}
              </View>

              <Text style={styles.operationalNote}>
                {buildOperationalNote(item)}
              </Text>

              <View style={styles.cardFooter}>
                <Text style={styles.affordanceLabel}>查看行程作業</Text>
                <Ionicons
                  name="chevron-forward"
                  size={18}
                  color={Tokens.colors.borderStrong}
                />
              </View>
            </TouchableOpacity>
          );
        }}
        contentContainerStyle={styles.listContent}
        ListHeaderComponent={
          <View style={styles.listHeader}>
            {error ? <ErrorBanner message={`錯誤：${error}`} /> : null}

            <SegmentedControl
              options={FILTER_OPTIONS.map((option) => ({
                label: option.label,
                value: option.value,
              }))}
              selectedValue={selectedFilter}
              onValueChange={(value) =>
                setSelectedFilter(value as TaskFilterValue)
              }
            />

            <View style={styles.summaryRow}>
              <InfoTile label="指派任務" value={String(assignedCount)} />
              <InfoTile label="來源平台任務" value={String(forwardedCount)} />
            </View>
          </View>
        }
        ListEmptyComponent={
          <EmptyState
            title={
              selectedFilter === "all"
                ? "目前沒有可執行的任務"
                : "此篩選條件下沒有任務"
            }
            description={
              selectedFilter === "all"
                ? "重新整理後仍無資料時，請稍後再試或改至行程作業確認。"
                : "請切換其他篩選條件，或重新整理任務清單。"
            }
            icon="file-tray-outline"
            actionTitle="重新整理"
            onAction={onRefresh}
            style={styles.emptyState}
          />
        }
        refreshControl={
          <RefreshControl
            refreshing={refreshing}
            onRefresh={onRefresh}
            tintColor={Tokens.colors.primary}
          />
        }
      />

      <BottomActionBar>
        <ActionButton
          title="開啟目前行程"
          icon="navigate"
          onPress={() => router.push("/trip")}
          style={styles.bottomAction}
        />
      </BottomActionBar>
    </View>
  );
}

const styles = StyleSheet.create({
  screen: {
    flex: 1,
    backgroundColor: Tokens.colors.appBg,
  },
  centerState: {
    flex: 1,
    alignItems: "center",
    justifyContent: "center",
    paddingHorizontal: Tokens.spacing.xl,
  },
  fillState: {
    flex: 1,
  },
  loadingLabel: {
    ...Tokens.type.label,
    color: Tokens.colors.textMuted,
    marginTop: Tokens.spacing.md,
  },
  listContent: {
    paddingHorizontal: Tokens.layout.pagePadding,
    paddingTop: Tokens.spacing.md,
    paddingBottom: Tokens.spacing.lg,
    flexGrow: 1,
  },
  listHeader: {
    marginBottom: Tokens.spacing.md,
    gap: Tokens.spacing.md,
  },
  summaryRow: {
    flexDirection: "row",
    gap: Tokens.spacing.sm,
  },
  emptyState: {
    paddingHorizontal: 0,
  },
  taskCard: {
    backgroundColor: Tokens.colors.surface,
    borderRadius: Tokens.radius.md,
    borderWidth: 1,
    borderColor: Tokens.colors.border,
    padding: Tokens.spacing.md,
    marginBottom: Tokens.spacing.sm,
    minHeight: 148,
  },
  taskCardHeader: {
    flexDirection: "row",
    alignItems: "flex-start",
    justifyContent: "space-between",
    gap: Tokens.spacing.sm,
  },
  taskId: {
    ...Tokens.type.body,
    color: Tokens.colors.textStrong,
    fontWeight: "600",
    flex: 1,
  },
  orderId: {
    ...Tokens.type.label,
    color: Tokens.colors.textBody,
    marginTop: Tokens.spacing.xs,
  },
  badgeRow: {
    flexDirection: "row",
    flexWrap: "wrap",
    gap: Tokens.spacing.xs,
    marginTop: Tokens.spacing.md,
  },
  operationalNote: {
    ...Tokens.type.micro,
    color: Tokens.colors.textMuted,
    marginTop: Tokens.spacing.md,
  },
  cardFooter: {
    marginTop: Tokens.spacing.md,
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "space-between",
  },
  affordanceLabel: {
    ...Tokens.type.label,
    color: Tokens.colors.primary,
    fontWeight: "600",
  },
  forwarderTerminalCard: {
    borderColor: "#F2B8BE",
    backgroundColor: "#FFF7F8",
  },
  bottomAction: {
    flex: 1,
  },
  routeLockBadge: {
    flexDirection: "row",
    alignItems: "center",
    alignSelf: "flex-start",
    paddingHorizontal: Tokens.spacing.sm,
    paddingVertical: 2,
    borderRadius: Tokens.radius.xs,
    backgroundColor: Tokens.colors.surfaceWarning,
  },
  routeLockIcon: {
    marginRight: 4,
  },
  routeLockText: {
    ...Tokens.type.micro,
    color: Tokens.colors.warning,
    fontWeight: "600",
  },
});
