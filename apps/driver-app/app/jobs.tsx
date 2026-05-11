import { useEffect, useState } from "react";
import {
  View,
  Text,
  SectionList,
  ScrollView,
  StyleSheet,
  ActivityIndicator,
  RefreshControl,
  Pressable,
} from "react-native";
import { Ionicons } from "@expo/vector-icons";
import { useRouter } from "expo-router";
import type {
  DriverTaskAction,
  DriverTaskRecord,
  OwnedOrderRecord,
  UnifiedDriverTaskView,
} from "@drts/contracts";
import {
  PlatformTaskBadge,
  getPlatformDisplayLabel,
} from "@/components/platform-task-badge";
import { getDriverClient } from "@/lib/api-client";
import { formatMoney } from "@/lib/money";
import {
  formatDriverTaskStatusLabel,
  formatDriverTaskTypeLabel,
} from "@/lib/operational-labels";
import {
  ActionButton,
  AuthorityBanner,
  BottomActionBar,
  EmptyState,
  ErrorBanner,
  IconButton,
  PageHeader,
  StatusChip,
  Tokens,
} from "@/components/ui";

type TaskFilterValue =
  | "all"
  | "needs_action"
  | "in_progress"
  | "platform_closed"
  | "sync_issue";

type TaskSection = {
  key: "tasks";
  data: UnifiedDriverTaskView[];
};

const FILTER_OPTIONS = [
  { label: "全部", value: "all" },
  { label: "待處理", value: "needs_action" },
  { label: "進行中", value: "in_progress" },
  { label: "平台結案", value: "platform_closed" },
  { label: "需同步", value: "sync_issue" },
] as const;

const ACTION_LABELS: Record<DriverTaskAction, string> = {
  accept: "接受任務",
  reject: "婉拒任務",
  depart: "前往接送點",
  arrived_pickup: "回報已抵達",
  start: "開始行程",
  complete: "完成行程",
};

function humanizeCode(value: string) {
  return value
    .replace(/[_-]+/g, " ")
    .replace(/\b\w/g, (char) => char.toUpperCase());
}

function formatStatusLabel(status: string | null) {
  if (!status) {
    return "待同步";
  }

  const knownForwardedStatuses: Record<string, string> = {
    offered: "可接單",
    broadcasted: "廣播中",
    accept_pending: "等待平台確認",
    confirmed: "平台已確認",
    confirmed_by_platform: "平台已確認",
    lost_race: "其他司機已接",
    taken: "其他司機已接",
    cancelled: "平台取消",
    cancelled_by_platform: "平台取消",
    sync_failed: "同步異常",
  };

  return knownForwardedStatuses[status] ?? formatDriverTaskStatusLabel(status);
}

function formatActionStateLabel(
  actionState: UnifiedDriverTaskView["driverActionState"],
) {
  switch (actionState) {
    case "action_required":
      return "待司機處理";
    case "awaiting_platform":
      return "等待平台回覆";
    case "in_progress":
      return "進行中";
    case "blocked":
      return "需派車台處理";
    case "completed":
      return "已完成";
    case "read_only":
      return "唯讀鏡像";
    default:
      return humanizeCode(actionState);
  }
}

function normalizeStateCode(value: string | null | undefined) {
  return value?.trim().toLowerCase() ?? null;
}

function isOwnedTask(task: UnifiedDriverTaskView) {
  return task.sourcePlatform === "drts";
}

function hasSyncIssue(task: UnifiedDriverTaskView) {
  return (
    task.requiresManualFallback ||
    task.requiresReauth ||
    Boolean(task.syncIssueSummary) ||
    normalizeStateCode(task.nativeStatus) === "sync_failed"
  );
}

function isPlatformClosed(task: UnifiedDriverTaskView) {
  if (isOwnedTask(task) || hasSyncIssue(task)) {
    return false;
  }

  const nativeStatus = normalizeStateCode(task.nativeStatus);
  const localStatus = normalizeStateCode(String(task.localStatus));
  return (
    nativeStatus === "lost_race" ||
    nativeStatus === "taken" ||
    nativeStatus === "cancelled" ||
    nativeStatus === "cancelled_by_platform" ||
    localStatus === "cancelled" ||
    localStatus === "rejected" ||
    task.driverActionState === "read_only"
  );
}

function matchesFilter(task: UnifiedDriverTaskView, filter: TaskFilterValue) {
  if (filter === "all") {
    return true;
  }

  if (filter === "sync_issue") {
    return hasSyncIssue(task);
  }

  if (filter === "platform_closed") {
    return isPlatformClosed(task);
  }

  if (filter === "needs_action") {
    return task.driverActionState === "action_required";
  }

  return (
    task.driverActionState === "in_progress" ||
    task.driverActionState === "awaiting_platform"
  );
}

function getStatusChipVariant(task: UnifiedDriverTaskView) {
  if (hasSyncIssue(task)) {
    return "warning" as const;
  }

  if (isPlatformClosed(task)) {
    return "danger" as const;
  }

  switch (task.driverActionState) {
    case "action_required":
      return "warning" as const;
    case "awaiting_platform":
    case "in_progress":
      return "info" as const;
    case "completed":
      return "success" as const;
    case "blocked":
      return "danger" as const;
    default:
      return "default" as const;
  }
}

function getActionPriority(task: UnifiedDriverTaskView) {
  if (hasSyncIssue(task)) {
    return 0;
  }

  switch (task.driverActionState) {
    case "action_required":
      return 1;
    case "awaiting_platform":
      return 2;
    case "in_progress":
      return 3;
    case "read_only":
      return 4;
    case "completed":
      return 5;
    default:
      return 6;
  }
}

function compareTasks(a: UnifiedDriverTaskView, b: UnifiedDriverTaskView) {
  const priorityDelta = getActionPriority(a) - getActionPriority(b);
  if (priorityDelta !== 0) {
    return priorityDelta;
  }

  const deadlineA = a.deadlineAt
    ? Date.parse(a.deadlineAt)
    : Number.POSITIVE_INFINITY;
  const deadlineB = b.deadlineAt
    ? Date.parse(b.deadlineAt)
    : Number.POSITIVE_INFINITY;
  if (deadlineA !== deadlineB) {
    return deadlineA - deadlineB;
  }

  return Date.parse(b.updatedAt) - Date.parse(a.updatedAt);
}

function formatTimestamp(value: string | null) {
  if (!value) {
    return null;
  }

  const parsed = new Date(value);
  if (Number.isNaN(parsed.getTime())) {
    return value;
  }

  return parsed.toISOString().replace("T", " ").slice(0, 16);
}

function buildAllowedActionSummary(task: UnifiedDriverTaskView) {
  if (hasSyncIssue(task)) {
    return task.requiresReauth
      ? "需重新登入或補授權後再同步"
      : "需派車台介入同步";
  }

  if (task.allowedActions.length > 0) {
    return task.allowedActions
      .map((action) => ACTION_LABELS[action])
      .join(" / ");
  }

  if (isPlatformClosed(task)) {
    return "來源平台已結案，僅供查閱";
  }

  if (task.driverActionState === "awaiting_platform") {
    return "等待來源平台確認接單";
  }

  if (task.driverActionState === "in_progress") {
    return "請前往行程作業查看下一步";
  }

  if (task.driverActionState === "completed") {
    return "任務已完成";
  }

  return task.blockingReason?.trim() || "目前無可執行操作";
}

function buildOperationalNote(task: UnifiedDriverTaskView) {
  if (hasSyncIssue(task)) {
    return (
      task.syncIssueSummary?.trim() ||
      "來源平台同步異常，需派車台處理；請勿依賴此卡片內容直接變更行程。"
    );
  }

  const nativeStatus = normalizeStateCode(task.nativeStatus);
  if (nativeStatus === "lost_race" || nativeStatus === "taken") {
    return "此派單已由其他司機接走，保留紀錄供查閱，無需再執行本地操作。";
  }

  if (
    nativeStatus === "cancelled" ||
    nativeStatus === "cancelled_by_platform"
  ) {
    return "來源平台已取消此任務；如車隊端資訊未更新，請聯繫派車台確認。";
  }

  if (!isOwnedTask(task) && task.driverActionState === "awaiting_platform") {
    return "已送出接單結果，等待來源平台確認；確認前請勿自行前往接送點。";
  }

  if (!isOwnedTask(task)) {
    return `${task.platformDisplayName} 控制派遣、路線與完單狀態；請依平台規則執行。`;
  }

  if (task.driverActionState === "action_required") {
    return "請優先處理此任務，避免影響派遣時效或後續補件。";
  }

  return "點擊任務卡可進入行程作業，查看最新狀態與可執行操作。";
}

function buildAuthorityBanner(task: UnifiedDriverTaskView) {
  if (hasSyncIssue(task)) {
    return {
      title: task.requiresReauth ? "同步需要重新授權" : "同步需人工處理",
      authorityLabel: task.requiresReauth ? "需重新登入" : "需派車台處理",
      description: buildAllowedActionSummary(task),
      tone: "warning" as const,
      icon: "alert-circle-outline" as const,
    };
  }

  if (isPlatformClosed(task)) {
    return {
      title: `${task.platformDisplayName} 已結案`,
      authorityLabel: "無本地修改權限",
      description: buildAllowedActionSummary(task),
      tone: "danger" as const,
      icon: "close-circle-outline" as const,
    };
  }

  if (isOwnedTask(task)) {
    return {
      title: "DRTS 自營任務",
      authorityLabel: "本地可直接操作",
      description: buildAllowedActionSummary(task),
      tone: "owned" as const,
      icon: "shield-checkmark-outline" as const,
    };
  }

  return {
    title: `${task.platformDisplayName} 平台任務`,
    authorityLabel: "來源平台規則生效",
    description: buildAllowedActionSummary(task),
    tone: "platform" as const,
    icon: "swap-horizontal-outline" as const,
  };
}

function buildTaskMeta(task: UnifiedDriverTaskView) {
  if (task.deadlineAt) {
    return `期限 ${formatTimestamp(task.deadlineAt)}`;
  }

  return `更新 ${formatTimestamp(task.updatedAt) ?? "剛剛"}`;
}

function buildFilterDescription(
  selectedFilter: TaskFilterValue,
  filteredCount: number,
) {
  switch (selectedFilter) {
    case "needs_action":
      return `待處理任務 ${filteredCount} 筆，優先確認接單、補件或需立即回應的派單。`;
    case "in_progress":
      return `進行中任務 ${filteredCount} 筆，包含平台確認中與已進入行程作業的任務。`;
    case "platform_closed":
      return `平台已結案任務 ${filteredCount} 筆，保留查閱，不提供本地變更。`;
    case "sync_issue":
      return `同步/授權異常 ${filteredCount} 筆，請依卡片指示聯繫派車台或重新登入。`;
    default:
      return `全部任務 ${filteredCount} 筆，依 owned 與 forwarded 分區檢視。`;
  }
}

function getFilterLabel(value: TaskFilterValue) {
  return (
    FILTER_OPTIONS.find((option) => option.value === value)?.label ?? "全部"
  );
}

function getAllowedActionsFromTask(
  task: DriverTaskRecord,
  forwarded: boolean,
): DriverTaskAction[] {
  if (forwarded) {
    if (task.status === "pending_acceptance") {
      return ["accept", "reject"];
    }
    return [];
  }

  switch (task.status) {
    case "pending_acceptance":
      return ["accept"];
    case "accepted":
      return ["depart"];
    case "enroute_pickup":
      return ["arrived_pickup"];
    case "arrived_pickup":
      return ["start"];
    case "on_trip":
    case "proof_pending":
      return ["complete"];
    default:
      return [];
  }
}

function buildFallbackUnifiedTaskView(
  task: DriverTaskRecord,
): UnifiedDriverTaskView {
  const forwarded = task.sourcePlatform != null;
  return {
    taskId: task.taskId,
    orderId: task.orderId,
    orderDomain: forwarded ? "forwarded" : "owned",
    sourcePlatform: forwarded
      ? (task.sourcePlatform as UnifiedDriverTaskView["sourcePlatform"])
      : "drts",
    platformDisplayName: forwarded
      ? getPlatformDisplayLabel(task.sourcePlatform)
      : "DRTS",
    externalOrderId: null,
    nativeStatus: null,
    localStatus: task.status,
    driverActionState:
      task.status === "pending_acceptance"
        ? "action_required"
        : task.status === "accepted" ||
            task.status === "enroute_pickup" ||
            task.status === "arrived_pickup" ||
            task.status === "on_trip" ||
            task.status === "proof_pending"
          ? "in_progress"
          : task.status === "completed"
            ? "completed"
            : forwarded
              ? "read_only"
              : "blocked",
    allowedActions: getAllowedActionsFromTask(task, forwarded),
    routeLocked: forwarded || !task.routeProvided,
    fareAuthority: forwarded ? "external_platform" : "drts",
    settlementAuthority: forwarded ? "external_platform" : "drts",
    driverPayoutAuthority: forwarded ? "external_platform" : "drts",
    requiresManualFallback: forwarded,
    requiresReauth: false,
    syncIssueSummary: forwarded
      ? "來源平台原生狀態暫不可用，目前先以本地鏡像資料呈現；若內容異常請聯繫派車台。"
      : null,
    blockingReason: null,
    pickupSummary: null,
    dropoffSummary: null,
    deadlineAt: null,
    updatedAt:
      task.completedAt ||
      task.startedAt ||
      task.arrivedPickupAt ||
      task.departedAt ||
      task.acceptedAt ||
      new Date().toISOString(),
  };
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

export default function JobsScreen() {
  const [tasks, setTasks] = useState<UnifiedDriverTaskView[]>([]);
  const [orderMap, setOrderMap] = useState<Record<string, OwnedOrderRecord>>(
    {},
  );
  const [loading, setLoading] = useState(true);
  const [refreshing, setRefreshing] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [tasksEnabled, setTasksEnabled] = useState(true);
  const [selectedFilter, setSelectedFilter] = useState<TaskFilterValue>("all");
  const [fallbackMode, setFallbackMode] = useState(false);
  const router = useRouter();

  const loadTasks = async () => {
    const client = getDriverClient();

    try {
      let fetchedTasks: UnifiedDriverTaskView[] = [];
      let degraded = false;

      try {
        fetchedTasks = await client.listUnifiedDriverTasks();
      } catch {
        const legacyTasks = await client.listDriverTasks();
        fetchedTasks = legacyTasks.map(buildFallbackUnifiedTaskView);
        degraded = true;
      }

      setTasks(fetchedTasks);
      setFallbackMode(degraded);

      const uniqueOrderIds = [
        ...new Set(fetchedTasks.map((task) => task.orderId).filter(Boolean)),
      ];
      const orderResults = await Promise.all(
        uniqueOrderIds.map(async (orderId) => {
          try {
            const order = (await client.getOrder(orderId)) as OwnedOrderRecord;
            return { orderId, order };
          } catch {
            return { orderId, order: null };
          }
        }),
      );

      const nextOrderMap: Record<string, OwnedOrderRecord> = {};
      orderResults.forEach(({ orderId, order }) => {
        if (order) {
          nextOrderMap[orderId] = order;
        }
      });

      setOrderMap(nextOrderMap);
      setError(null);
    } catch (nextError: unknown) {
      setFallbackMode(false);
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
  const forwardedCount = tasks.filter((task) => !isOwnedTask(task)).length;
  const needsActionCount = tasks.filter((task) =>
    matchesFilter(task, "needs_action"),
  ).length;
  const syncIssueCount = tasks.filter(hasSyncIssue).length;
  const filteredTasks = [
    ...tasks.filter((task) => matchesFilter(task, selectedFilter)),
  ].sort(compareTasks);
  const filterDescription = buildFilterDescription(
    selectedFilter,
    filteredTasks.length,
  );

  const sections = [
    { key: "tasks" as const, data: filteredTasks },
  ] satisfies TaskSection[];

  if (loading) {
    return (
      <View style={styles.screen}>
        <PageHeader title="任務" subtitle="同步收件匣" />
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
        <PageHeader title="任務" subtitle="同步收件匣" />
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
      <SectionList
        sections={sections}
        keyExtractor={(item) => item.taskId}
        stickySectionHeadersEnabled={false}
        renderSectionHeader={() => null}
        renderItem={({ item }) => {
          const order = orderMap[item.orderId] ?? null;
          const fixedPrice = order?.fixedPrice ?? false;
          const serviceBucket = order?.serviceBucket ?? null;
          const businessDispatchSubtype =
            order?.businessDispatchSubtype ?? null;
          const dispatchSemantics = order?.dispatchSemantics ?? null;
          const authorityBanner = buildAuthorityBanner(item);
          const syncIssue = hasSyncIssue(item);
          const platformClosed = isPlatformClosed(item);
          const dimmed =
            item.driverActionState === "completed" || platformClosed;
          const forwarded = !isOwnedTask(item);
          const nativeStatus = forwarded
            ? formatStatusLabel(item.nativeStatus)
            : null;
          const routeSummary =
            item.pickupSummary && item.dropoffSummary
              ? `${item.pickupSummary} → ${item.dropoffSummary}`
              : item.pickupSummary || item.dropoffSummary;
          const cardTitle = routeSummary || `訂單 ${item.orderId}`;
          const secondaryMeta = [
            `訂單 ${item.orderId}`,
            buildTaskMeta(item),
          ].join(" · ");
          const authoritySummary = syncIssue
            ? buildAllowedActionSummary(item)
            : isOwnedTask(item)
              ? "DRTS 本地可直接操作"
              : `${item.platformDisplayName} 規則生效`;
          const emphasisLabel = dimmed
            ? null
            : formatActionStateLabel(item.driverActionState);
          const fareLabel = order?.quotedFare
            ? formatMoney(order.quotedFare)
            : null;
          const deadlineLabel = item.deadlineAt
            ? formatTimestamp(item.deadlineAt)
            : null;
          const showFooterStrip = Boolean(fareLabel) || Boolean(deadlineLabel);

          return (
            <Pressable
              accessibilityRole="button"
              accessibilityHint="開啟目前任務的行程作業"
              onPress={() => router.push("/trip")}
              style={({ pressed }) => [
                styles.taskCard,
                forwarded && !dimmed && styles.forwardedTaskCard,
                platformClosed && styles.forwarderTerminalCard,
                syncIssue && styles.syncIssueCard,
                dimmed && styles.taskCardDim,
                pressed && styles.taskCardPressed,
              ]}
            >
              <View style={styles.taskCardTopRow}>
                <View style={styles.taskCardTopLead}>
                  <PlatformTaskBadge
                    platformCode={
                      isOwnedTask(item) ? "owned" : item.sourcePlatform
                    }
                  />
                  {emphasisLabel ? (
                    <StatusChip
                      label={emphasisLabel}
                      variant={getStatusChipVariant(item)}
                      dot
                    />
                  ) : (
                    <Text style={styles.taskInlineStatus}>
                      {formatActionStateLabel(item.driverActionState)}
                    </Text>
                  )}
                </View>
                <Text style={styles.taskCode}>{item.taskId}</Text>
              </View>

              <View style={styles.taskTitleBlock}>
                <Text style={styles.taskTitle} numberOfLines={2}>
                  {cardTitle}
                </Text>
                <Text style={styles.taskSubtitle} numberOfLines={2}>
                  {secondaryMeta}
                </Text>
              </View>

              <View style={styles.badgeRow}>
                {item.routeLocked ? <RouteLockBadge /> : null}
                <TaskTypeBadge
                  serviceBucket={serviceBucket}
                  businessDispatchSubtype={businessDispatchSubtype}
                  dispatchSemantics={dispatchSemantics}
                />
                {fixedPrice ? <FixedPriceBadge /> : null}
                <StatusChip
                  label={formatStatusLabel(String(item.localStatus))}
                  variant={getStatusChipVariant(item)}
                />
                {forwarded && nativeStatus ? (
                  <StatusChip
                    label={`平台：${nativeStatus}`}
                    variant={
                      syncIssue
                        ? "warning"
                        : platformClosed
                          ? "danger"
                          : "default"
                    }
                  />
                ) : null}
              </View>

              {showFooterStrip ? (
                <View style={styles.taskFareRow}>
                  {fareLabel ? (
                    <Text style={styles.taskFareValue}>{fareLabel}</Text>
                  ) : null}
                  {deadlineLabel ? (
                    <View style={styles.taskDeadlinePill}>
                      <Ionicons
                        name="time-outline"
                        size={12}
                        color={Tokens.colors.warning}
                      />
                      <Text style={styles.taskDeadlineText} numberOfLines={1}>
                        {deadlineLabel}
                      </Text>
                    </View>
                  ) : null}
                </View>
              ) : null}

              <View style={styles.taskMetaRow}>
                <View style={styles.taskMetaItem}>
                  <Ionicons
                    name={syncIssue ? "alert-circle-outline" : "shield-outline"}
                    size={14}
                    color={
                      syncIssue ? Tokens.colors.danger : Tokens.colors.textMuted
                    }
                  />
                  <Text
                    style={[
                      styles.taskMetaText,
                      syncIssue && styles.taskMetaTextDanger,
                    ]}
                    numberOfLines={1}
                  >
                    {authoritySummary}
                  </Text>
                </View>
                <View style={styles.taskMetaItem}>
                  <Ionicons
                    name="time-outline"
                    size={14}
                    color={
                      item.deadlineAt
                        ? Tokens.colors.warning
                        : Tokens.colors.textDim
                    }
                  />
                  <Text
                    style={[
                      styles.taskMetaText,
                      item.deadlineAt && styles.taskMetaTextWarn,
                    ]}
                    numberOfLines={1}
                  >
                    {buildTaskMeta(item)}
                  </Text>
                </View>
              </View>

              <View style={styles.cardActionRow}>
                <Text style={styles.cardActionLabel}>下一步</Text>
                <Text style={styles.cardActionValue} numberOfLines={2}>
                  {buildAllowedActionSummary(item)}
                </Text>
              </View>

              {syncIssue ? (
                <View style={styles.syncIssueRow}>
                  <Ionicons
                    name="alert-circle"
                    size={14}
                    color={Tokens.colors.danger}
                  />
                  <Text style={styles.syncIssueText} numberOfLines={2}>
                    需派車台處理，請等待指示
                  </Text>
                </View>
              ) : null}

              <AuthorityBanner
                title={authorityBanner.title}
                authorityLabel={authorityBanner.authorityLabel}
                description={authorityBanner.description}
                tone={authorityBanner.tone}
                icon={authorityBanner.icon}
                style={styles.authorityBanner}
              />

              <Text style={styles.operationalNote}>
                {buildOperationalNote(item)}
              </Text>

              <View style={styles.cardFooter}>
                <View style={styles.footerLead}>
                  <Text style={styles.affordanceLabel}>開啟行程作業</Text>
                  <Text style={styles.affordanceMeta}>
                    開啟行程作業，查看目前進度、權限與下一步操作
                  </Text>
                </View>
                <View style={styles.affordanceIcon}>
                  <Ionicons
                    name="arrow-forward"
                    size={18}
                    color={Tokens.colors.primary}
                  />
                </View>
              </View>
            </Pressable>
          );
        }}
        ListHeaderComponent={
          <View style={styles.listHeader}>
            <View style={styles.heroPanel}>
              <View style={styles.heroPanelGlow} />
              <View style={styles.heroHeader}>
                <View style={styles.heroTitleBlock}>
                  <Text style={styles.heroTitle}>任務</Text>
                  <Text style={styles.heroSubtitle}>
                    已指派 {assignedCount} 筆任務
                  </Text>
                </View>
                <IconButton
                  icon="refresh"
                  onPress={onRefresh}
                  disabled={refreshing}
                  accessibilityLabel="重新整理任務清單"
                />
              </View>

              <View style={styles.kpiRow}>
                <View style={styles.kpiTile}>
                  <Text style={styles.kpiLabel}>總計</Text>
                  <Text style={styles.kpiValue}>{assignedCount}</Text>
                </View>
                <View style={[styles.kpiTile, styles.kpiWarnTile]}>
                  <Text style={[styles.kpiLabel, styles.kpiWarnLabel]}>
                    需動作
                  </Text>
                  <Text style={[styles.kpiValue, styles.kpiWarnValue]}>
                    {needsActionCount}
                  </Text>
                </View>
                <View style={[styles.kpiTile, styles.kpiBrandTile]}>
                  <Text style={[styles.kpiLabel, styles.kpiBrandLabel]}>
                    外部平台
                  </Text>
                  <Text style={[styles.kpiValue, styles.kpiBrandValue]}>
                    {forwardedCount}
                  </Text>
                </View>
              </View>
            </View>

            <ScrollView
              horizontal
              showsHorizontalScrollIndicator={false}
              contentContainerStyle={styles.filterRow}
            >
              {FILTER_OPTIONS.map((option) => {
                const selected = option.value === selectedFilter;
                const count =
                  option.value === "all"
                    ? assignedCount
                    : tasks.filter((task) => matchesFilter(task, option.value))
                        .length;

                return (
                  <Pressable
                    key={option.value}
                    onPress={() => setSelectedFilter(option.value)}
                    style={[
                      styles.filterPill,
                      selected && styles.filterPillSelected,
                    ]}
                  >
                    <Text
                      style={[
                        styles.filterPillLabel,
                        selected && styles.filterPillLabelSelected,
                      ]}
                    >
                      {option.label}
                    </Text>
                    <Text
                      style={[
                        styles.filterPillCount,
                        selected && styles.filterPillCountSelected,
                      ]}
                    >
                      {count}
                    </Text>
                  </Pressable>
                );
              })}
            </ScrollView>

            {error ? (
              <View style={styles.errorPanel}>
                <ErrorBanner
                  message={`錯誤：${error}`}
                  style={styles.errorBanner}
                />
                <ActionButton
                  title="重新整理任務"
                  icon="refresh"
                  onPress={onRefresh}
                  style={styles.retryButton}
                />
              </View>
            ) : null}

            {fallbackMode ? (
              <AuthorityBanner
                title="目前使用本地鏡像備援"
                authorityLabel="來源平台原生欄位暫不可用"
                description="已退回舊任務 API；forwarded 任務仍會顯示，但平台原生狀態與同步摘要可能延後。"
                tone="warning"
                icon="cloud-offline-outline"
              />
            ) : null}

            <View style={styles.filterSummaryCard}>
              <Text style={styles.filterSummaryLabel}>
                目前檢視 · {getFilterLabel(selectedFilter)}
              </Text>
              <Text style={styles.filterSummaryText}>{filterDescription}</Text>
              <Text style={styles.filterSummaryMeta}>
                同步/授權異常 {syncIssueCount} 筆
              </Text>
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
        contentContainerStyle={styles.listContent}
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
  heroPanel: {
    position: "relative",
    overflow: "hidden",
    borderRadius: 24,
    backgroundColor: Tokens.colors.surface,
    borderWidth: 1,
    borderColor: Tokens.colors.border,
    paddingHorizontal: Tokens.spacing.lg,
    paddingTop: Tokens.spacing.lg,
    paddingBottom: Tokens.spacing.md,
    gap: Tokens.spacing.md,
    ...Tokens.shadows.sm,
  },
  heroPanelGlow: {
    position: "absolute",
    top: -48,
    right: -40,
    width: 180,
    height: 180,
    borderRadius: 90,
    backgroundColor: Tokens.colors.brandBg,
  },
  heroHeader: {
    flexDirection: "row",
    alignItems: "flex-end",
    justifyContent: "space-between",
    gap: Tokens.spacing.md,
  },
  heroTitleBlock: {
    flex: 1,
    gap: 2,
  },
  heroTitle: {
    ...Tokens.type.screenTitle,
    color: Tokens.colors.textStrong,
  },
  heroSubtitle: {
    ...Tokens.type.small,
    color: Tokens.colors.textMuted,
  },
  errorPanel: {
    gap: Tokens.spacing.sm,
  },
  errorBanner: {
    marginBottom: 0,
  },
  retryButton: {
    alignSelf: "flex-start",
  },
  kpiRow: {
    flexDirection: "row",
    gap: Tokens.spacing.sm,
  },
  kpiTile: {
    flex: 1,
    paddingHorizontal: Tokens.spacing.md,
    paddingVertical: Tokens.spacing.md,
    borderRadius: Tokens.radius.lg,
    backgroundColor: Tokens.colors.surfaceLo,
    borderWidth: 1,
    borderColor: Tokens.colors.border,
  },
  kpiWarnTile: {
    backgroundColor: Tokens.colors.warningBg,
    borderColor: `${Tokens.colors.warning}22`,
  },
  kpiBrandTile: {
    backgroundColor: Tokens.colors.ownedBg,
    borderColor: Tokens.colors.ownedBorder,
  },
  kpiLabel: {
    ...Tokens.type.micro,
    color: Tokens.colors.textMuted,
    marginBottom: Tokens.spacing.xs,
  },
  kpiValue: {
    ...Tokens.type.screenTitle,
    color: Tokens.colors.textStrong,
    fontSize: 26,
    lineHeight: 30,
  },
  kpiWarnLabel: {
    color: Tokens.colors.warning,
  },
  kpiWarnValue: {
    color: Tokens.colors.warning,
  },
  kpiBrandLabel: {
    color: Tokens.colors.owned,
  },
  kpiBrandValue: {
    color: Tokens.colors.owned,
  },
  filterRow: {
    flexDirection: "row",
    gap: Tokens.spacing.xs,
    paddingRight: Tokens.spacing.md,
  },
  filterPill: {
    flexDirection: "row",
    alignItems: "center",
    gap: Tokens.spacing.xs,
    paddingVertical: 7,
    paddingHorizontal: 14,
    borderRadius: Tokens.radius.full,
    borderWidth: 1,
    borderColor: Tokens.colors.border,
    backgroundColor: Tokens.colors.surface,
  },
  filterPillSelected: {
    backgroundColor: Tokens.colors.textStrong,
    borderColor: Tokens.colors.textStrong,
  },
  filterPillLabel: {
    ...Tokens.type.label,
    color: Tokens.colors.textMuted,
    fontWeight: "600",
  },
  filterPillLabelSelected: {
    color: Tokens.colors.textInverse,
  },
  filterPillCount: {
    ...Tokens.type.micro,
    color: Tokens.colors.textDim,
  },
  filterPillCountSelected: {
    color: "rgba(255,255,255,0.72)",
  },
  filterSummaryCard: {
    backgroundColor: Tokens.colors.surface,
    borderRadius: Tokens.radius.lg,
    borderWidth: 1,
    borderColor: Tokens.colors.border,
    paddingHorizontal: Tokens.spacing.md,
    paddingVertical: Tokens.spacing.md,
  },
  filterSummaryLabel: {
    ...Tokens.type.micro,
    color: Tokens.colors.textMuted,
    marginBottom: Tokens.spacing.xs,
  },
  filterSummaryText: {
    ...Tokens.type.label,
    color: Tokens.colors.textStrong,
  },
  filterSummaryMeta: {
    ...Tokens.type.small,
    color: Tokens.colors.textDim,
    marginTop: Tokens.spacing.xs,
  },
  emptyState: {
    paddingHorizontal: 0,
  },
  taskCard: {
    backgroundColor: Tokens.colors.surface,
    borderRadius: 14,
    borderWidth: 1,
    borderColor: Tokens.colors.border,
    paddingHorizontal: 14,
    paddingVertical: 14,
    marginBottom: 10,
    overflow: "hidden",
    ...Tokens.shadows.sm,
  },
  forwardedTaskCard: {
    borderColor: Tokens.colors.forwardedBorder,
    borderLeftWidth: 3,
    borderLeftColor: Tokens.colors.forwarded,
  },
  syncIssueCard: {
    borderColor: `${Tokens.colors.warning}55`,
  },
  taskCardDim: {
    opacity: 0.7,
  },
  taskCardPressed: {
    backgroundColor: "#FBFDFF",
    borderColor: "#B8D0F0",
  },
  taskCardTopRow: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "space-between",
    gap: Tokens.spacing.sm,
    marginBottom: Tokens.spacing.sm,
  },
  taskCardTopLead: {
    flexDirection: "row",
    alignItems: "center",
    flexWrap: "wrap",
    gap: Tokens.spacing.xs,
    flex: 1,
  },
  taskInlineStatus: {
    ...Tokens.type.small,
    color: Tokens.colors.textMuted,
    fontWeight: "600",
  },
  taskCode: {
    ...Tokens.type.code,
    color: Tokens.colors.textDim,
  },
  taskTitleBlock: {
    gap: Tokens.spacing.xs,
  },
  taskTitle: {
    ...Tokens.type.title,
    color: Tokens.colors.textStrong,
    fontWeight: "600",
  },
  taskSubtitle: {
    ...Tokens.type.small,
    color: Tokens.colors.textMuted,
  },
  badgeRow: {
    flexDirection: "row",
    flexWrap: "wrap",
    gap: Tokens.spacing.xs,
    marginTop: Tokens.spacing.md,
  },
  taskFareRow: {
    flexDirection: "row",
    alignItems: "center",
    gap: Tokens.spacing.md,
    marginTop: 10,
    paddingTop: 10,
    borderTopWidth: StyleSheet.hairlineWidth,
    borderStyle: "dashed",
    borderTopColor: Tokens.colors.border,
  },
  taskFareValue: {
    ...Tokens.type.code,
    fontSize: 13,
    fontWeight: "700",
    color: Tokens.colors.textStrong,
  },
  taskDeadlinePill: {
    flexDirection: "row",
    alignItems: "center",
    gap: 4,
  },
  taskDeadlineText: {
    ...Tokens.type.small,
    color: Tokens.colors.warning,
    fontWeight: "600",
  },
  syncIssueRow: {
    flexDirection: "row",
    alignItems: "center",
    gap: 6,
    marginTop: 10,
  },
  syncIssueText: {
    ...Tokens.type.small,
    color: Tokens.colors.danger,
    flexShrink: 1,
  },
  taskMetaRow: {
    flexDirection: "row",
    flexWrap: "wrap",
    gap: Tokens.spacing.sm,
    marginTop: Tokens.spacing.md,
  },
  taskMetaItem: {
    flexDirection: "row",
    alignItems: "center",
    gap: 6,
    minWidth: "46%",
    flexShrink: 1,
  },
  taskMetaText: {
    ...Tokens.type.small,
    color: Tokens.colors.textMuted,
    flexShrink: 1,
  },
  taskMetaTextDanger: {
    color: Tokens.colors.danger,
  },
  taskMetaTextWarn: {
    color: Tokens.colors.warning,
  },
  cardActionRow: {
    marginTop: Tokens.spacing.md,
    paddingTop: Tokens.spacing.md,
    borderTopWidth: 1,
    borderTopColor: Tokens.colors.border,
    gap: 2,
  },
  cardActionLabel: {
    ...Tokens.type.micro,
    color: Tokens.colors.textMuted,
  },
  cardActionValue: {
    ...Tokens.type.bodyStrong,
    color: Tokens.colors.textStrong,
  },
  authorityBanner: {
    marginTop: Tokens.spacing.md,
  },
  operationalNote: {
    ...Tokens.type.small,
    color: Tokens.colors.textMuted,
    marginTop: Tokens.spacing.md,
  },
  cardFooter: {
    marginTop: Tokens.spacing.md,
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "space-between",
    gap: Tokens.spacing.md,
    paddingTop: Tokens.spacing.md,
    borderTopWidth: 1,
    borderTopColor: Tokens.colors.border,
  },
  footerLead: {
    flex: 1,
  },
  affordanceLabel: {
    ...Tokens.type.micro,
    color: Tokens.colors.textMuted,
    fontWeight: "600",
  },
  affordanceMeta: {
    ...Tokens.type.label,
    color: Tokens.colors.primary,
    marginTop: Tokens.spacing.xs,
  },
  affordanceIcon: {
    width: 32,
    height: 32,
    borderRadius: Tokens.radius.full,
    alignItems: "center",
    justifyContent: "center",
    backgroundColor: "#E8F0FE",
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
