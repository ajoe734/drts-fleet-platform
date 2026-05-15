import { useEffect, useMemo, useState } from "react";
import { Redirect, useRouter } from "expo-router";
import { Ionicons } from "@expo/vector-icons";
import {
  ActivityIndicator,
  Pressable,
  StyleSheet,
  Text,
  View,
} from "react-native";
import {
  PLATFORM_CODE_REGISTRY,
  type OwnedOrderRecord,
  type PlatformPresenceRecord,
  type PlatformPresenceSummary,
  type ShiftRecord,
  type UnifiedDriverTaskView,
} from "@drts/contracts";
import type { CanvasTone } from "@drts/ui-web/canvas-tokens";

import {
  Banner,
  Btn,
  Card,
  DL,
  KPI,
  PageHeader,
  Pill,
  Shell,
  Table,
  driverCanvasTheme,
} from "@/components/canvas-primitives";
import {
  buildFallbackUnifiedDriverTaskView,
  hasUnifiedTaskSyncIssue,
  isOwnedUnifiedTask,
  summarizeWorkspaceTasks,
} from "@/lib/driver-workspace-cockpit";
import {
  getDriverClient,
  getDriverId,
  initializeDriverIdentity,
  isDriverIdentityProvisioned,
} from "@/lib/api-client";
import {
  formatAmountNumber,
  formatMoney,
  getCurrencyLabel,
  sumMoneyAmounts,
} from "@/lib/money";
import { formatDriverTaskStatusLabel } from "@/lib/operational-labels";
import { driverForwardedTaskStatusLabels, driverStrings } from "@/lib/strings";

type WorkspaceRoute =
  | "/jobs"
  | "/trip"
  | "/platform-presence"
  | "/earnings"
  | "/shift"
  | "/incident"
  | "/settings";

type WorkspaceLoadResult = {
  taskViews: UnifiedDriverTaskView[];
  orderMap: Record<string, OwnedOrderRecord>;
  taskFallbackMode: boolean;
  taskLoadError: string | null;
  platformSummary: PlatformPresenceSummary | null;
  platformLoadError: string | null;
  activeShift: ShiftRecord | null;
  shiftFeatureEnabled: boolean;
  shiftLoadError: boolean;
};

type UrgentItem = {
  key: string;
  tone: Exclude<CanvasTone, "neutral">;
  title: string;
  body: string;
  actionLabel: string;
  route: WorkspaceRoute;
  iconName: keyof typeof Ionicons.glyphMap;
};

type QuickTileTone = "accent" | "danger";

type PlatformWorkspaceRow = {
  code: string;
  name: string;
  detail: string;
  status: string;
  lastSync: string;
  tone: CanvasTone;
};

type TaskSnapshotRow = {
  taskId: string;
  platform: string;
  updated: string;
  status: string;
  tone: CanvasTone;
  owned: boolean;
};

const THEME = driverCanvasTheme;

const INITIAL_WORKSPACE: WorkspaceLoadResult = {
  taskViews: [],
  orderMap: {},
  taskFallbackMode: false,
  taskLoadError: null,
  platformSummary: null,
  platformLoadError: null,
  activeShift: null,
  shiftFeatureEnabled: true,
  shiftLoadError: false,
};

function toErrorMessage(error: unknown, fallback: string) {
  if (error instanceof Error && error.message.trim()) {
    return error.message.trim();
  }

  return fallback;
}

function formatClockLabel(value: string | null | undefined) {
  if (!value) {
    return "待同步";
  }

  const parsed = new Date(value);
  if (Number.isNaN(parsed.getTime())) {
    return value;
  }

  return parsed.toLocaleTimeString("zh-TW", {
    hour: "2-digit",
    minute: "2-digit",
  });
}

function formatCompactDateTime(value: string | null | undefined) {
  if (!value) {
    return driverStrings.common.notUpdatedYet;
  }

  const parsed = new Date(value);
  if (Number.isNaN(parsed.getTime())) {
    return value;
  }

  return parsed.toLocaleString("zh-TW", {
    month: "numeric",
    day: "numeric",
    hour: "2-digit",
    minute: "2-digit",
  });
}

function isSameLocalDay(value: string, reference: Date) {
  const parsed = new Date(value);
  if (Number.isNaN(parsed.getTime())) {
    return false;
  }

  return (
    parsed.getFullYear() === reference.getFullYear() &&
    parsed.getMonth() === reference.getMonth() &&
    parsed.getDate() === reference.getDate()
  );
}

function formatShiftDuration(shift: ShiftRecord | null) {
  if (!shift) {
    return "未上班";
  }

  if (
    typeof shift.totalHours === "number" &&
    Number.isFinite(shift.totalHours)
  ) {
    return `${shift.totalHours.toFixed(1)} 小時`;
  }

  const startedAt = new Date(shift.clockedInAt);
  if (Number.isNaN(startedAt.getTime())) {
    return "上班中";
  }

  const minutes = Math.max(
    0,
    Math.floor((Date.now() - startedAt.getTime()) / 60000),
  );
  const hours = Math.floor(minutes / 60);
  const remainder = minutes % 60;

  if (hours === 0) {
    return `${remainder} 分鐘`;
  }

  return `${hours} 小時 ${remainder} 分`;
}

function getPlatformTone(record: PlatformPresenceRecord): CanvasTone {
  if (record.reauthRequired) {
    return "warn";
  }

  if (record.eligibility === "ineligible") {
    return "danger";
  }

  if (record.status === "online") {
    return "success";
  }

  if (record.eligibility === "pending") {
    return "info";
  }

  return "neutral";
}

function getPlatformStatusLabel(record: PlatformPresenceRecord) {
  if (record.reauthRequired) {
    return "需授權";
  }

  if (record.eligibility === "ineligible") {
    return "不可接單";
  }

  if (record.status === "online") {
    return "上線";
  }

  if (record.eligibility === "pending") {
    return "待審核";
  }

  return "離線";
}

function getTaskTone(task: UnifiedDriverTaskView): CanvasTone {
  if (hasUnifiedTaskSyncIssue(task)) {
    return "danger";
  }

  switch (task.driverActionState) {
    case "action_required":
      return "warn";
    case "awaiting_platform":
      return "info";
    case "in_progress":
      return "success";
    case "completed":
      return "neutral";
    default:
      return "neutral";
  }
}

function formatForwardedStatus(status: string | null) {
  if (!status) {
    return null;
  }

  const key = status as keyof typeof driverForwardedTaskStatusLabels;
  return driverForwardedTaskStatusLabels[key] ?? status;
}

function formatWorkspaceTaskStatus(task: UnifiedDriverTaskView) {
  if (!isOwnedUnifiedTask(task)) {
    return (
      formatForwardedStatus(task.nativeStatus) ??
      formatDriverTaskStatusLabel(String(task.localStatus))
    );
  }

  return formatDriverTaskStatusLabel(String(task.localStatus));
}

function formatTaskHeadline(task: UnifiedDriverTaskView) {
  return task.dropoffSummary ?? task.pickupSummary ?? task.taskId;
}

function formatTaskRouteSummary(task: UnifiedDriverTaskView) {
  if (task.pickupSummary && task.dropoffSummary) {
    return `${task.pickupSummary} → ${task.dropoffSummary}`;
  }

  return task.pickupSummary ?? task.dropoffSummary ?? "開啟任務查看完整路線";
}

async function loadWorkspaceData(): Promise<WorkspaceLoadResult> {
  const client = getDriverClient();
  const driverId = getDriverId();

  const loadTaskViews = async (): Promise<{
    tasks: UnifiedDriverTaskView[];
    fallbackMode: boolean;
  }> => {
    try {
      const tasks = await client.listUnifiedDriverTasks();
      return { tasks, fallbackMode: false };
    } catch (unifiedError) {
      try {
        const legacyTasks = await client.listDriverTasks();
        return {
          tasks: legacyTasks.map(buildFallbackUnifiedDriverTaskView),
          fallbackMode: true,
        };
      } catch {
        throw unifiedError;
      }
    }
  };

  const [tasksResult, platformResult, shiftFlagResult] =
    await Promise.allSettled([
      loadTaskViews(),
      client.getPlatformPresence(),
      client.isFeatureEnabled("driver-app.shift"),
    ]);

  const next: WorkspaceLoadResult = { ...INITIAL_WORKSPACE };

  if (tasksResult.status === "fulfilled") {
    next.taskViews = tasksResult.value.tasks;
    next.taskFallbackMode = tasksResult.value.fallbackMode;

    const uniqueOrderIds = [
      ...new Set(
        tasksResult.value.tasks.map((task) => task.orderId).filter(Boolean),
      ),
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

    next.orderMap = orderResults.reduce<Record<string, OwnedOrderRecord>>(
      (map, entry) => {
        if (entry.order) {
          map[entry.orderId] = entry.order;
        }

        return map;
      },
      {},
    );
  } else {
    next.taskLoadError = toErrorMessage(
      tasksResult.reason,
      "任務狀態暫時無法同步。",
    );
  }

  if (platformResult.status === "fulfilled") {
    next.platformSummary = platformResult.value;
  } else {
    next.platformLoadError = toErrorMessage(
      platformResult.reason,
      "平台就緒狀態暫時無法同步。",
    );
  }

  next.shiftFeatureEnabled =
    shiftFlagResult.status === "fulfilled" ? shiftFlagResult.value : true;

  if (next.shiftFeatureEnabled) {
    try {
      const shifts = await client.listShifts(driverId);
      next.activeShift =
        shifts.find((shift) => shift.status === "active") ?? null;
    } catch {
      next.shiftLoadError = true;
    }
  }

  return next;
}

function LoadingState({ label }: { label: string }) {
  return (
    <Shell theme={THEME} contentContainerStyle={styles.loadingShellContent}>
      <Card theme={THEME}>
        <View style={styles.loadingCard}>
          <ActivityIndicator color={THEME.accent} size="large" />
          <Text style={styles.loadingLabel}>{label}</Text>
        </View>
      </Card>
    </Shell>
  );
}

function HeaderAlertButton({
  count,
  onPress,
}: {
  count: number;
  onPress: () => void;
}) {
  return (
    <Pressable
      accessibilityRole="button"
      accessibilityLabel="查看通知與緊急事件"
      onPress={onPress}
      style={({ pressed }) => [
        styles.headerAlertButton,
        pressed ? styles.headerAlertButtonPressed : null,
      ]}
    >
      <Ionicons name="notifications-outline" size={18} color={THEME.text} />
      {count > 0 ? <View style={styles.headerAlertDot} /> : null}
    </Pressable>
  );
}

function HeroCard({
  badge,
  badgeTone,
  title,
  detail,
  meta,
  primaryLabel,
  secondaryLabel,
  onPrimaryPress,
  onSecondaryPress,
}: {
  badge: string;
  badgeTone: CanvasTone;
  title: string;
  detail: string;
  meta: string;
  primaryLabel: string;
  secondaryLabel: string;
  onPrimaryPress: () => void;
  onSecondaryPress: () => void;
}) {
  return (
    <Card theme={THEME} padding={0} style={styles.heroCard}>
      <View style={styles.heroSurface}>
        <View style={styles.heroGlowLarge} />
        <View style={styles.heroGlowSmall} />
        <View style={styles.heroHeader}>
          <Text style={styles.heroEyebrow}>
            {driverStrings.onboarding.heroEyebrow}
          </Text>
          <Pill theme={THEME} tone={badgeTone} dot>
            {badge}
          </Pill>
        </View>
        <Text style={styles.heroTitle}>{title}</Text>
        <Text style={styles.heroDetail}>{detail}</Text>
        <Text style={styles.heroMeta}>{meta}</Text>
        <View style={styles.heroActionRow}>
          <Btn
            theme={THEME}
            variant="primary"
            size="md"
            onPress={onPrimaryPress}
          >
            {primaryLabel}
          </Btn>
          <Btn
            theme={THEME}
            variant="secondary"
            size="md"
            onPress={onSecondaryPress}
          >
            {secondaryLabel}
          </Btn>
        </View>
      </View>
    </Card>
  );
}

function PlatformTile({
  row,
  onPress,
}: {
  row: PlatformWorkspaceRow;
  onPress: () => void;
}) {
  return (
    <Pressable
      accessibilityRole="button"
      accessibilityLabel={`${row.name} 平台狀態`}
      onPress={onPress}
      style={({ pressed }) => [
        styles.platformTileWrap,
        pressed ? styles.tilePressed : null,
      ]}
    >
      <Card theme={THEME} padding={12} style={styles.platformTileCard}>
        <View style={styles.platformTileTopRow}>
          <Text
            style={[
              styles.platformTileCode,
              row.tone === "success"
                ? styles.platformCodeSuccess
                : row.tone === "warn"
                  ? styles.platformCodeWarn
                  : row.tone === "danger"
                    ? styles.platformCodeDanger
                    : styles.platformCodeNeutral,
            ]}
          >
            {row.code}
          </Text>
          <Pill theme={THEME} tone={row.tone} dot>
            {row.status}
          </Pill>
        </View>
        <Text style={styles.platformTileName}>{row.name}</Text>
        <Text style={styles.platformTileDetail}>{row.detail}</Text>
      </Card>
    </Pressable>
  );
}

function QuickLinkTile({
  iconName,
  label,
  helper,
  tone,
  onPress,
}: {
  iconName: keyof typeof Ionicons.glyphMap;
  label: string;
  helper: string;
  tone: QuickTileTone;
  onPress: () => void;
}) {
  const accentColor = tone === "danger" ? THEME.danger : THEME.accent;
  const accentBg = tone === "danger" ? THEME.dangerBg : THEME.accentBg;

  return (
    <Pressable
      accessibilityRole="button"
      onPress={onPress}
      style={({ pressed }) => [
        styles.quickTileWrap,
        pressed ? styles.tilePressed : null,
      ]}
    >
      <Card theme={THEME} padding={14}>
        <View style={styles.quickTileTopRow}>
          <View
            style={[styles.quickTileIconWrap, { backgroundColor: accentBg }]}
          >
            <Ionicons name={iconName} size={17} color={accentColor} />
          </View>
          <Ionicons name="chevron-forward" size={15} color={THEME.textMuted} />
        </View>
        <Text style={styles.quickTileLabel}>{label}</Text>
        <Text style={styles.quickTileHelper}>{helper}</Text>
      </Card>
    </Pressable>
  );
}

export default function WorkspaceIndex() {
  const router = useRouter();
  const [ready, setReady] = useState(false);
  const [identityIssue, setIdentityIssue] = useState<string | null>(null);
  const [provisioned, setProvisioned] = useState(false);
  const [workspace, setWorkspace] =
    useState<WorkspaceLoadResult>(INITIAL_WORKSPACE);
  const [loading, setLoading] = useState(false);
  const [refreshSeed, setRefreshSeed] = useState(0);

  useEffect(() => {
    let cancelled = false;

    void initializeDriverIdentity()
      .catch((error: unknown) => {
        if (cancelled) {
          return;
        }

        setIdentityIssue(
          error instanceof Error
            ? error.message
            : "裝置初始化失敗，請稍後再試。",
        );
      })
      .finally(() => {
        if (cancelled) {
          return;
        }

        setProvisioned(isDriverIdentityProvisioned());
        setReady(true);
      });

    return () => {
      cancelled = true;
    };
  }, []);

  useEffect(() => {
    if (!ready || !provisioned) {
      return;
    }

    let cancelled = false;
    setLoading(true);

    void loadWorkspaceData()
      .then((result) => {
        if (cancelled) {
          return;
        }

        setWorkspace(result);
      })
      .catch((error: unknown) => {
        if (cancelled) {
          return;
        }

        setWorkspace({
          ...INITIAL_WORKSPACE,
          taskLoadError: toErrorMessage(error, "工作台資料載入失敗。"),
          platformLoadError: "平台就緒狀態暫時無法同步。",
        });
      })
      .finally(() => {
        if (!cancelled) {
          setLoading(false);
        }
      });

    return () => {
      cancelled = true;
    };
  }, [provisioned, ready, refreshSeed]);

  const navigate = (route: WorkspaceRoute) => () => router.push(route);

  const isDriverOnShift = workspace.activeShift !== null;
  const taskSummary = useMemo(
    () => summarizeWorkspaceTasks(workspace.taskViews),
    [workspace.taskViews],
  );
  const externalPresences = workspace.platformSummary?.presences ?? [];
  const reauthPlatforms = useMemo(
    () => externalPresences.filter((record) => record.reauthRequired),
    [externalPresences],
  );

  const shiftStatus = useMemo(() => {
    if (!workspace.shiftFeatureEnabled) {
      return {
        tone: "neutral" as CanvasTone,
        pillLabel: "班次功能未啟用",
        summary: "排班功能關閉，本機只顯示多平台狀態。",
      };
    }

    if (workspace.shiftLoadError) {
      return {
        tone: "warn" as CanvasTone,
        pillLabel: "班次資料待確認",
        summary: "班次同步延遲，請前往班次頁重新整理。",
      };
    }

    if (isDriverOnShift) {
      return {
        tone: "success" as CanvasTone,
        pillLabel: `上班中 · ${formatClockLabel(workspace.activeShift?.clockedInAt)}`,
        summary: `${formatShiftDuration(workspace.activeShift)} · ${
          workspace.activeShift?.vehicleId ?? "待指派車輛"
        }`,
      };
    }

    return {
      tone: "warn" as CanvasTone,
      pillLabel: "尚未上班",
      summary: "先完成上班打卡，自營派單才會切到上線狀態。",
    };
  }, [
    isDriverOnShift,
    workspace.activeShift,
    workspace.shiftFeatureEnabled,
    workspace.shiftLoadError,
  ]);

  const platformRows = useMemo(() => {
    const ownedRow: PlatformWorkspaceRow = {
      code: "DRTS",
      name: "自營派單",
      detail: shiftStatus.summary,
      status: isDriverOnShift ? "上線" : "離線",
      lastSync: isDriverOnShift
        ? formatClockLabel(workspace.activeShift?.clockedInAt)
        : driverStrings.common.notUpdatedYet,
      tone: isDriverOnShift ? "success" : "neutral",
    };

    const externalRows = externalPresences
      .map<PlatformWorkspaceRow>((record) => {
        const latestAt =
          record.status === "online"
            ? record.lastOnlineAt
            : record.lastOfflineAt;
        return {
          code: record.platformCode.toUpperCase(),
          name:
            PLATFORM_CODE_REGISTRY[record.platformCode]?.displayName ??
            record.platformCode,
          detail: record.reauthRequired
            ? "Token 已過期，需重新授權"
            : record.eligibility === "pending"
              ? "等待平台完成資格審核"
              : record.eligibility === "ineligible"
                ? "平台資格異常，暫停接單"
                : "平台連線狀態正常",
          status: getPlatformStatusLabel(record),
          lastSync: formatCompactDateTime(latestAt ?? record.updatedAt),
          tone: getPlatformTone(record),
        };
      })
      .sort((left, right) => {
        const toneWeight = (tone: CanvasTone) => {
          switch (tone) {
            case "danger":
              return 3;
            case "warn":
              return 2;
            case "success":
              return 1;
            default:
              return 0;
          }
        };

        const delta = toneWeight(right.tone) - toneWeight(left.tone);
        if (delta !== 0) {
          return delta;
        }

        return left.name.localeCompare(right.name, "zh-TW");
      });

    return [ownedRow, ...externalRows];
  }, [
    externalPresences,
    isDriverOnShift,
    shiftStatus.summary,
    workspace.activeShift,
  ]);

  const onlinePlatformCount = useMemo(
    () => platformRows.filter((row) => row.tone === "success").length,
    [platformRows],
  );

  const todayNetSummary = useMemo(() => {
    const now = new Date();
    const completedTodayTasks = taskSummary.orderedTasks.filter(
      (task) =>
        task.driverActionState === "completed" &&
        isSameLocalDay(task.updatedAt, now),
    );
    const amount = sumMoneyAmounts(
      completedTodayTasks.map(
        (task) => workspace.orderMap[task.orderId]?.quotedFare ?? null,
      ),
    );

    return {
      count: completedTodayTasks.length,
      amount,
    };
  }, [taskSummary.orderedTasks, workspace.orderMap]);

  const urgentItems = useMemo(() => {
    const items: UrgentItem[] = [];

    for (const platform of reauthPlatforms) {
      const name =
        PLATFORM_CODE_REGISTRY[platform.platformCode]?.displayName ??
        platform.platformCode;

      items.push({
        key: `reauth-${platform.platformCode}`,
        tone: "warn",
        title: `${name} 需重新授權`,
        body: `Token 已過期 · 最近更新 ${formatCompactDateTime(platform.updatedAt)}`,
        actionLabel: "處理",
        route: "/platform-presence",
        iconName: "lock-closed-outline",
      });
    }

    const syncTasks = taskSummary.orderedTasks.filter(
      (task) => !isOwnedUnifiedTask(task) && hasUnifiedTaskSyncIssue(task),
    );

    for (const task of syncTasks.slice(0, 2)) {
      items.push({
        key: `sync-${task.taskId}`,
        tone: "danger",
        title: `${task.platformDisplayName} 同步異常`,
        body:
          task.syncIssueSummary?.trim() ||
          `${task.taskId} 需要派車台介入確認。`,
        actionLabel: "查看",
        route: "/jobs",
        iconName: "warning-outline",
      });
    }

    if (
      workspace.shiftFeatureEnabled &&
      !workspace.shiftLoadError &&
      !isDriverOnShift &&
      taskSummary.pendingCount > 0
    ) {
      items.push({
        key: "shift-not-started",
        tone: "info",
        title: "尚未上班",
        body: "請先打卡上線，自營派單才會切成可接單狀態。",
        actionLabel: "班次",
        route: "/shift",
        iconName: "time-outline",
      });
    }

    if (taskSummary.pendingPlatformCount > 0) {
      items.push({
        key: "awaiting-platform",
        tone: "info",
        title: `${taskSummary.pendingPlatformCount} 筆等待平台確認`,
        body: "來源平台尚未回覆前，請勿自行前往接送點。",
        actionLabel: "任務",
        route: "/jobs",
        iconName: "hourglass-outline",
      });
    }

    return items;
  }, [
    isDriverOnShift,
    reauthPlatforms,
    taskSummary.orderedTasks,
    taskSummary.pendingCount,
    taskSummary.pendingPlatformCount,
    workspace.shiftFeatureEnabled,
    workspace.shiftLoadError,
  ]);

  const heroAction = useMemo(() => {
    if (taskSummary.activeTripTask) {
      const task = taskSummary.activeTripTask;
      const fareLabel = workspace.orderMap[task.orderId]?.quotedFare
        ? formatMoney(workspace.orderMap[task.orderId]?.quotedFare)
        : "車資待確認";

      return {
        badge: task.platformDisplayName,
        badgeTone: getTaskTone(task),
        title: `繼續行程 · ${formatTaskHeadline(task)}`,
        detail: formatTaskRouteSummary(task),
        meta: `${task.taskId} · ${fareLabel} · ${formatCompactDateTime(task.updatedAt)}`,
        primaryLabel: "前往行程",
        primaryRoute: "/trip" as WorkspaceRoute,
        secondaryLabel: "查看任務",
        secondaryRoute: "/jobs" as WorkspaceRoute,
      };
    }

    if (taskSummary.actionRequiredTask) {
      const task = taskSummary.actionRequiredTask;

      return {
        badge: "待司機處理",
        badgeTone: "warn" as CanvasTone,
        title: `優先回應 · ${formatTaskHeadline(task)}`,
        detail: `${task.platformDisplayName} · ${formatTaskRouteSummary(task)}`,
        meta: `${task.taskId} · ${formatCompactDateTime(task.updatedAt)}`,
        primaryLabel: "打開任務",
        primaryRoute: "/jobs" as WorkspaceRoute,
        secondaryLabel: "平台中心",
        secondaryRoute: "/platform-presence" as WorkspaceRoute,
      };
    }

    if (reauthPlatforms.length > 0) {
      return {
        badge: "需重新授權",
        badgeTone: "warn" as CanvasTone,
        title: "處理平台重新授權",
        detail: `${reauthPlatforms.length} 個平台 Token 失效，接單權限暫停。`,
        meta: "完成重新授權後，工作台會恢復平台接單狀態。",
        primaryLabel: "平台中心",
        primaryRoute: "/platform-presence" as WorkspaceRoute,
        secondaryLabel: "班次",
        secondaryRoute: "/shift" as WorkspaceRoute,
      };
    }

    if (
      workspace.shiftFeatureEnabled &&
      !workspace.shiftLoadError &&
      !isDriverOnShift
    ) {
      return {
        badge: "未上班",
        badgeTone: "warn" as CanvasTone,
        title: "開始班次",
        detail: "先完成上班打卡，自營派單才會切換成上線狀態。",
        meta: "打卡後可同步檢查平台健康、班次與派單就緒度。",
        primaryLabel: "前往班次",
        primaryRoute: "/shift" as WorkspaceRoute,
        secondaryLabel: "平台中心",
        secondaryRoute: "/platform-presence" as WorkspaceRoute,
      };
    }

    return {
      badge: "待命中",
      badgeTone: "success" as CanvasTone,
      title: "檢查多平台就緒狀態",
      detail: "工作台已待命，可檢查平台健康、收入與班次摘要。",
      meta: "保持平台在線與班次正常，才能穩定接到自營與外部派單。",
      primaryLabel: "平台中心",
      primaryRoute: "/platform-presence" as WorkspaceRoute,
      secondaryLabel: "查看收入",
      secondaryRoute: "/earnings" as WorkspaceRoute,
    };
  }, [
    isDriverOnShift,
    reauthPlatforms.length,
    taskSummary.actionRequiredTask,
    taskSummary.activeTripTask,
    workspace.orderMap,
    workspace.shiftFeatureEnabled,
    workspace.shiftLoadError,
  ]);

  const shiftSummaryItems = useMemo(
    () => [
      {
        label: "司機",
        value: getDriverId(),
        mono: true,
      },
      {
        label: "車輛",
        value: workspace.activeShift?.vehicleId ?? "待指派",
        mono: true,
      },
      {
        label: "上班時間",
        value: workspace.activeShift
          ? formatClockLabel(workspace.activeShift.clockedInAt)
          : "未打卡",
      },
      {
        label: "值勤時長",
        value: formatShiftDuration(workspace.activeShift),
      },
      {
        label: "起點",
        value: workspace.activeShift?.startLocation ?? "待回填",
      },
      {
        label: "班次備註",
        value: workspace.activeShift?.notes ?? "目前無值勤備註",
      },
    ],
    [workspace.activeShift],
  );

  const taskSnapshotRows = useMemo(
    () =>
      taskSummary.orderedTasks.slice(0, 4).map<TaskSnapshotRow>((task) => ({
        taskId: task.taskId,
        platform: task.platformDisplayName,
        updated: formatClockLabel(task.updatedAt),
        status: formatWorkspaceTaskStatus(task),
        tone: getTaskTone(task),
        owned: isOwnedUnifiedTask(task),
      })),
    [taskSummary.orderedTasks],
  );

  const notificationCount = urgentItems.length + taskSummary.urgentCount;

  if (!ready) {
    return <LoadingState label="正在檢查裝置配置…" />;
  }

  if (!provisioned) {
    return <Redirect href="/onboarding" />;
  }

  if (
    loading &&
    workspace.platformSummary === null &&
    !workspace.taskLoadError
  ) {
    return <LoadingState label="正在載入工作台…" />;
  }

  return (
    <Shell theme={THEME} contentContainerStyle={styles.shellContent}>
      <PageHeader
        title={
          <View style={styles.headerTitleStack}>
            <Text style={styles.headerEyebrow}>
              {driverStrings.onboarding.workspaceGreetingEyebrow}
            </Text>
            <Text style={styles.headerTitle}>
              {driverStrings.onboarding.workspaceGreetingTitle}
            </Text>
          </View>
        }
        subtitle={
          <View style={styles.headerMetaRow}>
            <Pill theme={THEME} tone={shiftStatus.tone} dot>
              {shiftStatus.pillLabel}
            </Pill>
            <Text style={styles.headerMetaText}>{getDriverId()}</Text>
          </View>
        }
        actions={
          <HeaderAlertButton
            count={notificationCount}
            onPress={navigate("/incident")}
          />
        }
      />

      {identityIssue ? (
        <Banner
          theme={THEME}
          tone="danger"
          title="裝置身份異常"
          body={identityIssue}
        />
      ) : null}

      {workspace.taskFallbackMode ? (
        <Banner
          theme={THEME}
          tone="info"
          title="任務同步降級模式"
          body="目前改用舊版任務摘要，平台原生欄位可能延遲；如需完整狀態請前往任務頁。"
        />
      ) : null}

      {workspace.taskLoadError ? (
        <Banner
          theme={THEME}
          tone="danger"
          title="任務資料同步失敗"
          body={workspace.taskLoadError}
          actions={
            <Btn
              theme={THEME}
              variant="secondary"
              size="sm"
              onPress={() => setRefreshSeed((current) => current + 1)}
            >
              {driverStrings.common.retry}
            </Btn>
          }
        />
      ) : null}

      {workspace.platformLoadError ? (
        <Banner
          theme={THEME}
          tone="warn"
          title="平台就緒狀態待確認"
          body={workspace.platformLoadError}
        />
      ) : null}

      <HeroCard
        badge={heroAction.badge}
        badgeTone={heroAction.badgeTone}
        title={heroAction.title}
        detail={heroAction.detail}
        meta={heroAction.meta}
        primaryLabel={heroAction.primaryLabel}
        secondaryLabel={heroAction.secondaryLabel}
        onPrimaryPress={navigate(heroAction.primaryRoute)}
        onSecondaryPress={navigate(heroAction.secondaryRoute)}
      />

      <View style={styles.kpiRow}>
        <KPI
          theme={THEME}
          label="待處理"
          value={String(taskSummary.pendingCount)}
          sub={`${taskSummary.urgentCount} 件需回應`}
          hint={
            taskSummary.actionRequiredTask?.taskId ??
            taskSummary.activeTripTask?.taskId ??
            "工作台正常"
          }
        />
        <KPI
          theme={THEME}
          label="已上線"
          value={String(onlinePlatformCount)}
          sub={`/ ${platformRows.length} 平台`}
          hint={
            reauthPlatforms.length > 0
              ? `${reauthPlatforms.length} 需授權`
              : "全部平台可檢查"
          }
        />
        <KPI
          theme={THEME}
          label="今日淨收"
          value={formatAmountNumber(todayNetSummary.amount, {
            fractionDigits: 0,
          })}
          sub={getCurrencyLabel(todayNetSummary.amount.currency) || "NT$"}
          hint={`${todayNetSummary.count} 筆已完成`}
        />
      </View>

      <Card
        theme={THEME}
        title="班次狀態"
        subtitle={shiftStatus.summary}
        actions={
          <Pill theme={THEME} tone={shiftStatus.tone} dot>
            {isDriverOnShift ? "上班中" : "未上班"}
          </Pill>
        }
      >
        <DL theme={THEME} cols={2} items={shiftSummaryItems} />
      </Card>

      <Card
        theme={THEME}
        title="今日需處理"
        subtitle={`${urgentItems.length} 件等待回應`}
        actions={
          <Btn
            theme={THEME}
            variant="ghost"
            size="sm"
            onPress={navigate("/jobs")}
          >
            查看全部
          </Btn>
        }
      >
        <View style={styles.bannerStack}>
          {urgentItems.length > 0 ? (
            urgentItems.map((item) => (
              <Banner
                key={item.key}
                theme={THEME}
                tone={item.tone}
                title={item.title}
                body={item.body}
                icon={
                  <Ionicons
                    name={item.iconName}
                    size={15}
                    color={
                      item.tone === "danger"
                        ? THEME.danger
                        : item.tone === "warn"
                          ? THEME.warn
                          : THEME.info
                    }
                  />
                }
                actions={
                  <Btn
                    theme={THEME}
                    variant="secondary"
                    size="sm"
                    onPress={navigate(item.route)}
                  >
                    {item.actionLabel}
                  </Btn>
                }
              />
            ))
          ) : (
            <Banner
              theme={THEME}
              tone="success"
              title="今日沒有緊急待辦"
              body="班次、平台與任務同步正常，維持上線即可等待新派單。"
            />
          )}
        </View>
      </Card>

      <Card
        theme={THEME}
        title="平台連線"
        subtitle={`${onlinePlatformCount}/${platformRows.length} 已上線`}
        actions={
          <Btn
            theme={THEME}
            variant="ghost"
            size="sm"
            onPress={navigate("/platform-presence")}
          >
            平台中心
          </Btn>
        }
      >
        <View style={styles.platformTileGrid}>
          {platformRows.slice(0, 3).map((row) => (
            <PlatformTile
              key={row.code}
              row={row}
              onPress={navigate("/platform-presence")}
            />
          ))}
        </View>

        <Table
          theme={THEME}
          columns={[
            {
              h: "平台",
              w: 112,
              mono: true,
              r: (row: PlatformWorkspaceRow) => (
                <View style={styles.tablePlatformCell}>
                  <Text style={styles.tablePlatformCode}>{row.code}</Text>
                  <Text style={styles.tablePlatformName}>{row.name}</Text>
                </View>
              ),
            },
            {
              h: "狀態",
              w: 88,
              r: (row: PlatformWorkspaceRow) => (
                <Pill theme={THEME} tone={row.tone} dot>
                  {row.status}
                </Pill>
              ),
            },
            {
              h: "最近同步",
              k: "lastSync",
              w: 118,
              mono: true,
            },
            {
              h: "說明",
              k: "detail",
              w: 176,
            },
          ]}
          rows={platformRows}
        />
      </Card>

      <Card
        theme={THEME}
        title="今日任務快照"
        subtitle="保留 canvas 的密集狀態列與 mono task code"
        actions={
          <Btn
            theme={THEME}
            variant="ghost"
            size="sm"
            onPress={navigate("/jobs")}
          >
            任務頁
          </Btn>
        }
      >
        {taskSnapshotRows.length > 0 ? (
          <Table
            theme={THEME}
            columns={[
              {
                h: "任務",
                w: 98,
                mono: true,
                r: (row: TaskSnapshotRow) => (
                  <Text
                    style={[
                      styles.tableTaskCode,
                      row.owned
                        ? styles.tableTaskCodeOwned
                        : styles.tableTaskCodeForwarded,
                    ]}
                  >
                    {row.taskId}
                  </Text>
                ),
              },
              {
                h: "平台",
                k: "platform",
                w: 106,
              },
              {
                h: "狀態",
                w: 94,
                r: (row: TaskSnapshotRow) => (
                  <Pill theme={THEME} tone={row.tone} dot>
                    {row.status}
                  </Pill>
                ),
              },
              {
                h: "更新",
                k: "updated",
                w: 72,
                mono: true,
              },
            ]}
            rows={taskSnapshotRows}
          />
        ) : (
          <Banner
            theme={THEME}
            tone="info"
            title="目前沒有可顯示任務"
            body="前往任務頁重新整理，或等待派車台下發新工作。"
          />
        )}
      </Card>

      <View style={styles.quickTileGrid}>
        <QuickLinkTile
          iconName="briefcase-outline"
          label={driverStrings.onboarding.quickLinkLabels.jobs}
          helper={`${taskSummary.pendingCount} 筆未完成`}
          tone="accent"
          onPress={navigate("/jobs")}
        />
        <QuickLinkTile
          iconName="cash-outline"
          label={driverStrings.onboarding.quickLinkLabels.earnings}
          helper={`${getCurrencyLabel(todayNetSummary.amount.currency) || "NT$"} ${formatAmountNumber(
            todayNetSummary.amount,
            { fractionDigits: 0 },
          )}`}
          tone="accent"
          onPress={navigate("/earnings")}
        />
        <QuickLinkTile
          iconName="time-outline"
          label={driverStrings.onboarding.quickLinkLabels.shift}
          helper={shiftStatus.pillLabel}
          tone="accent"
          onPress={navigate("/shift")}
        />
        <QuickLinkTile
          iconName="alert-circle-outline"
          label="SOS"
          helper="安全求援"
          tone="danger"
          onPress={navigate("/incident")}
        />
      </View>

      <View style={styles.footerRow}>
        <Btn
          theme={THEME}
          variant="secondary"
          size="sm"
          onPress={() => setRefreshSeed((current) => current + 1)}
        >
          {loading ? "同步中…" : driverStrings.common.refresh}
        </Btn>
        <Btn
          theme={THEME}
          variant="secondary"
          size="sm"
          onPress={navigate("/settings")}
        >
          {driverStrings.onboarding.quickLinkLabels.settings}
        </Btn>
      </View>
    </Shell>
  );
}

const styles = StyleSheet.create({
  shellContent: {
    paddingBottom: 28,
    gap: 14,
  },
  loadingShellContent: {
    flexGrow: 1,
    justifyContent: "center",
    gap: 16,
  },
  loadingCard: {
    alignItems: "center",
    justifyContent: "center",
    gap: 12,
    minHeight: 180,
  },
  loadingLabel: {
    color: THEME.text,
    fontFamily: THEME.fontFamily,
    fontSize: 14,
  },
  headerTitleStack: {
    gap: 4,
  },
  headerEyebrow: {
    color: THEME.textMuted,
    fontFamily: THEME.fontFamily,
    fontSize: 12,
    fontWeight: "500",
  },
  headerTitle: {
    color: THEME.text,
    fontFamily: THEME.fontFamily,
    fontSize: 28,
    fontWeight: "700",
    letterSpacing: -0.5,
  },
  headerMetaRow: {
    flexDirection: "row",
    alignItems: "center",
    flexWrap: "wrap",
    gap: 8,
  },
  headerMetaText: {
    color: THEME.textDim,
    fontFamily: THEME.monoFamily,
    fontSize: 11.5,
  },
  headerAlertButton: {
    width: 38,
    height: 38,
    alignItems: "center",
    justifyContent: "center",
    borderRadius: 12,
    borderWidth: 1,
    borderColor: THEME.border,
    backgroundColor: THEME.surface,
    position: "relative",
  },
  headerAlertButtonPressed: {
    opacity: 0.86,
  },
  headerAlertDot: {
    position: "absolute",
    top: 9,
    right: 10,
    width: 8,
    height: 8,
    borderRadius: 4,
    backgroundColor: THEME.danger,
  },
  heroCard: {
    overflow: "hidden",
  },
  heroSurface: {
    padding: 16,
    borderRadius: 18,
    backgroundColor: THEME.accentBg,
    borderWidth: 1,
    borderColor: THEME.accentBorder,
    overflow: "hidden",
    gap: 8,
  },
  heroGlowLarge: {
    position: "absolute",
    top: -36,
    right: -18,
    width: 156,
    height: 156,
    borderRadius: 78,
    backgroundColor: "rgba(169, 214, 255, 0.10)",
  },
  heroGlowSmall: {
    position: "absolute",
    bottom: -22,
    left: -10,
    width: 120,
    height: 120,
    borderRadius: 60,
    backgroundColor: "rgba(123, 192, 255, 0.10)",
  },
  heroHeader: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "space-between",
    gap: 8,
  },
  heroEyebrow: {
    color: THEME.accentHi,
    fontFamily: THEME.fontFamily,
    fontSize: 11,
    fontWeight: "700",
    letterSpacing: 0.5,
    textTransform: "uppercase",
  },
  heroTitle: {
    color: THEME.text,
    fontFamily: THEME.fontFamily,
    fontSize: 22,
    fontWeight: "700",
    letterSpacing: -0.4,
    lineHeight: 28,
  },
  heroDetail: {
    color: THEME.text,
    fontFamily: THEME.fontFamily,
    fontSize: 13.5,
    lineHeight: 20,
  },
  heroMeta: {
    color: THEME.textMuted,
    fontFamily: THEME.monoFamily,
    fontSize: 11.5,
    lineHeight: 17,
  },
  heroActionRow: {
    flexDirection: "row",
    flexWrap: "wrap",
    gap: 8,
    marginTop: 4,
  },
  kpiRow: {
    gap: 8,
  },
  bannerStack: {
    gap: 10,
  },
  platformTileGrid: {
    flexDirection: "row",
    flexWrap: "wrap",
    gap: 8,
    marginBottom: 14,
  },
  platformTileWrap: {
    flexBasis: "31%",
    flexGrow: 1,
    minWidth: 96,
  },
  platformTileCard: {
    minHeight: 120,
  },
  platformTileTopRow: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "space-between",
    gap: 6,
    marginBottom: 8,
  },
  platformTileCode: {
    fontFamily: THEME.monoFamily,
    fontSize: 11.5,
    fontWeight: "700",
    letterSpacing: 0.5,
  },
  platformCodeSuccess: {
    color: THEME.success,
  },
  platformCodeWarn: {
    color: THEME.warn,
  },
  platformCodeDanger: {
    color: THEME.danger,
  },
  platformCodeNeutral: {
    color: THEME.accent,
  },
  platformTileName: {
    color: THEME.text,
    fontFamily: THEME.fontFamily,
    fontSize: 12.5,
    fontWeight: "700",
    marginBottom: 4,
  },
  platformTileDetail: {
    color: THEME.textMuted,
    fontFamily: THEME.fontFamily,
    fontSize: 11.5,
    lineHeight: 16,
  },
  tablePlatformCell: {
    gap: 3,
  },
  tablePlatformCode: {
    color: THEME.accent,
    fontFamily: THEME.monoFamily,
    fontSize: 11.5,
    fontWeight: "700",
    letterSpacing: 0.4,
  },
  tablePlatformName: {
    color: THEME.text,
    fontFamily: THEME.fontFamily,
    fontSize: 11.5,
  },
  tableTaskCode: {
    fontFamily: THEME.monoFamily,
    fontSize: 11.5,
    fontWeight: "700",
    letterSpacing: 0.4,
  },
  tableTaskCodeOwned: {
    color: THEME.accent,
  },
  tableTaskCodeForwarded: {
    color: THEME.info,
  },
  quickTileGrid: {
    flexDirection: "row",
    flexWrap: "wrap",
    gap: 8,
  },
  quickTileWrap: {
    flexBasis: "48%",
    flexGrow: 1,
  },
  quickTileTopRow: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "space-between",
    marginBottom: 12,
  },
  quickTileIconWrap: {
    width: 32,
    height: 32,
    borderRadius: 10,
    alignItems: "center",
    justifyContent: "center",
  },
  quickTileLabel: {
    color: THEME.text,
    fontFamily: THEME.fontFamily,
    fontSize: 13,
    fontWeight: "700",
    marginBottom: 4,
  },
  quickTileHelper: {
    color: THEME.textMuted,
    fontFamily: THEME.fontFamily,
    fontSize: 11.5,
    lineHeight: 16,
  },
  footerRow: {
    flexDirection: "row",
    justifyContent: "space-between",
    gap: 10,
    marginTop: 4,
  },
  tilePressed: {
    opacity: 0.88,
  },
});
