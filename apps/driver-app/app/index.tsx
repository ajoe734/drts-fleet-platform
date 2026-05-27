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
  KPI,
  PageHeader,
  Pill,
  Shell,
  driverCanvasTheme,
} from "@/components/canvas-primitives";
import {
  buildFallbackUnifiedDriverTaskView,
  hasUnifiedTaskSyncIssue,
  isOwnedUnifiedTask,
  summarizeWorkspaceTasks,
} from "@/lib/driver-workspace-cockpit";
import {
  dismissDriverSosAcknowledgement,
  getDriverSosAcknowledgement,
  getDriverClient,
  getDriverId,
  initializeDriverIdentity,
  isDriverIdentityProvisioned,
  type DriverSosAcknowledgement,
} from "@/lib/api-client";
import {
  formatAmountNumber,
  formatMoney,
  getCurrencyLabel,
  sumMoneyAmounts,
} from "@/lib/money";
import { driverStrings } from "@/lib/strings";

type WorkspaceRoute =
  | "/jobs"
  | "/trip"
  | "/platform-presence"
  | "/earnings"
  | "/shift"
  | "/incident"
  | "/settings";

type WorkspaceNavigationTarget =
  | WorkspaceRoute
  | {
      pathname: "/incident";
      params: {
        entry: "cockpit";
      };
    };

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
  summary: string;
  tone: CanvasTone;
  enabled: boolean;
  forwarded: boolean;
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

function getToneAccent(tone: Exclude<CanvasTone, "neutral">) {
  switch (tone) {
    case "danger":
      return {
        fg: THEME.danger,
        bg: THEME.dangerBg,
        border: THEME.dangerBorder,
      };
    case "warn":
      return {
        fg: THEME.warn,
        bg: THEME.warnBg,
        border: THEME.warnBorder,
      };
    case "info":
    default:
      return {
        fg: THEME.info,
        bg: THEME.infoBg,
        border: THEME.infoBorder,
      };
  }
}

function HeroActionButton({
  label,
  variant,
  onPress,
}: {
  label: string;
  variant: "primary" | "ghost";
  onPress: () => void;
}) {
  return (
    <Pressable
      accessibilityRole="button"
      accessibilityLabel={label}
      onPress={onPress}
      style={({ pressed }) => [
        styles.heroButton,
        variant === "primary"
          ? styles.heroButtonPrimary
          : styles.heroButtonSecondary,
        pressed ? styles.tilePressed : null,
      ]}
    >
      <Text
        style={[
          styles.heroButtonLabel,
          variant === "primary"
            ? styles.heroButtonLabelPrimary
            : styles.heroButtonLabelSecondary,
        ]}
      >
        {label}
      </Text>
    </Pressable>
  );
}

function HeroCard({
  title,
  detail,
  meta,
  primaryLabel,
  secondaryLabel,
  onPrimaryPress,
  onSecondaryPress,
}: {
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
        <View style={styles.heroEyebrowRow}>
          <View style={styles.heroEyebrowDot} />
          <Text style={styles.heroEyebrow}>
            {driverStrings.onboarding.heroEyebrow}
          </Text>
        </View>
        <Text style={styles.heroTitle}>{title}</Text>
        <Text style={styles.heroDetail}>{detail}</Text>
        <Text style={styles.heroMeta}>{meta}</Text>
        <View style={styles.heroActionRow}>
          <HeroActionButton
            label={primaryLabel}
            variant="primary"
            onPress={onPrimaryPress}
          />
          <HeroActionButton
            label={secondaryLabel}
            variant="ghost"
            onPress={onSecondaryPress}
          />
        </View>
      </View>
    </Card>
  );
}

function PrimaryAlertCard({
  item,
  onPress,
}: {
  item: UrgentItem;
  onPress: () => void;
}) {
  const accent = getToneAccent(item.tone);

  return (
    <Card
      theme={THEME}
      padding={0}
      style={[
        styles.alertCard,
        {
          backgroundColor: accent.bg,
          borderColor: accent.border,
        },
      ]}
    >
      <View style={styles.alertBodyRow}>
        <View
          style={[styles.alertIconWrap, { backgroundColor: `${accent.fg}25` }]}
        >
          <Ionicons name={item.iconName} size={16} color={accent.fg} />
        </View>
        <View style={styles.alertCopy}>
          <Text style={[styles.alertTitle, { color: accent.fg }]}>
            {item.title}
          </Text>
          <Text style={styles.alertDescription}>{item.body}</Text>
        </View>
        <Btn
          theme={THEME}
          variant="primary"
          size="sm"
          onPress={onPress}
          style={{
            backgroundColor: accent.fg,
            borderColor: accent.fg,
          }}
        >
          {item.actionLabel}
        </Btn>
      </View>
    </Card>
  );
}

function PlatformStatusSwitch({ enabled }: { enabled: boolean }) {
  return (
    <View
      style={[
        styles.platformSwitchTrack,
        enabled ? styles.platformSwitchTrackOn : styles.platformSwitchTrackOff,
      ]}
    >
      <View
        style={[
          styles.platformSwitchThumb,
          enabled
            ? styles.platformSwitchThumbOn
            : styles.platformSwitchThumbOff,
        ]}
      />
    </View>
  );
}

function PlatformPresenceRow({
  row,
  isLast,
  onPress,
}: {
  row: PlatformWorkspaceRow;
  isLast: boolean;
  onPress: () => void;
}) {
  return (
    <Pressable
      accessibilityRole="button"
      accessibilityLabel={`${row.name} 平台狀態`}
      onPress={onPress}
      style={({ pressed }) => [pressed ? styles.tilePressed : null]}
    >
      <View
        style={[styles.platformRow, !isLast ? styles.platformRowBorder : null]}
      >
        <View style={styles.platformRowCopy}>
          <Text style={styles.platformRowName}>{row.name}</Text>
          <Text style={styles.platformRowSummary}>{row.summary}</Text>
        </View>
        <View style={styles.platformRowRight}>
          {row.forwarded ? (
            <Pill theme={THEME} tone="info">
              外部
            </Pill>
          ) : null}
          <PlatformStatusSwitch enabled={row.enabled} />
        </View>
      </View>
    </Pressable>
  );
}

function SectionLink({
  label,
  onPress,
}: {
  label: string;
  onPress: () => void;
}) {
  return (
    <Pressable
      accessibilityRole="button"
      accessibilityLabel={label}
      onPress={onPress}
      style={({ pressed }) => [pressed ? styles.tilePressed : null]}
    >
      <Text style={styles.sectionLink}>{label}</Text>
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
        <View style={styles.quickTileRow}>
          <View
            style={[styles.quickTileIconWrap, { backgroundColor: accentBg }]}
          >
            <Ionicons name={iconName} size={17} color={accentColor} />
          </View>
          <View style={styles.quickTileCopy}>
            <Text style={styles.quickTileLabel}>{label}</Text>
            <Text style={styles.quickTileHelper}>{helper}</Text>
          </View>
        </View>
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
  const [sosAcknowledgement, setSosAcknowledgement] =
    useState<DriverSosAcknowledgement | null>(null);

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

  useEffect(() => {
    let active = true;
    void getDriverSosAcknowledgement().then((acknowledgement) => {
      if (!active || acknowledgement?.dismissedAt) {
        return;
      }

      setSosAcknowledgement(acknowledgement);
    });

    return () => {
      active = false;
    };
  }, []);

  const navigate = (route: WorkspaceNavigationTarget) => () =>
    router.push(route);

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

  const headerStatusLabel = useMemo(() => {
    if (!workspace.shiftFeatureEnabled) {
      return "班次功能未啟用";
    }

    if (workspace.shiftLoadError) {
      return "班次同步延遲";
    }

    if (isDriverOnShift) {
      return `上班中 · ${formatClockLabel(workspace.activeShift?.clockedInAt)} 起`;
    }

    return "尚未上班";
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
      summary: isDriverOnShift
        ? `已上線 · ${formatClockLabel(workspace.activeShift?.clockedInAt)} 起`
        : "離線 · 尚未上班",
      tone: isDriverOnShift ? "success" : "neutral",
      enabled: isDriverOnShift,
      forwarded: false,
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
          summary: record.reauthRequired
            ? "需重新授權"
            : record.eligibility === "pending"
              ? "待審核"
              : `${
                  record.status === "online" ? "已上線" : "離線"
                } · ${formatClockLabel(latestAt ?? record.updatedAt)}`,
          tone: getPlatformTone(record),
          enabled: record.status === "online" && !record.reauthRequired,
          forwarded: true,
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
  }, [externalPresences, isDriverOnShift, workspace.activeShift]);

  const onlinePlatformCount = useMemo(
    () => platformRows.filter((row) => row.enabled).length,
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
  const primaryAlert = useMemo<UrgentItem | null>(() => {
    if (reauthPlatforms.length > 0) {
      const platform = reauthPlatforms[0];
      const name =
        PLATFORM_CODE_REGISTRY[platform.platformCode]?.displayName ??
        platform.platformCode;

      return {
        key: `primary-reauth-${platform.platformCode}`,
        tone: "warn",
        title: `${name} 需重新授權`,
        body: "Token 已過期，無法接單",
        actionLabel: "處理",
        route: "/platform-presence",
        iconName: "lock-closed-outline",
      };
    }

    return urgentItems[0] ?? null;
  }, [reauthPlatforms, urgentItems]);

  const heroAction = useMemo(() => {
    if (taskSummary.activeTripTask) {
      const task = taskSummary.activeTripTask;
      const fareLabel = workspace.orderMap[task.orderId]?.quotedFare
        ? formatMoney(workspace.orderMap[task.orderId]?.quotedFare)
        : "車資待確認";

      return {
        title: `繼續行程 · ${formatTaskHeadline(task)}`,
        detail: formatTaskRouteSummary(task),
        meta: `${task.taskId} · ${fareLabel} · ${formatCompactDateTime(task.updatedAt)}`,
        primaryLabel: "前往行程",
        primaryRoute: "/trip" as WorkspaceRoute,
        secondaryLabel: "查看路線",
        secondaryRoute: "/trip" as WorkspaceRoute,
      };
    }

    if (taskSummary.actionRequiredTask) {
      const task = taskSummary.actionRequiredTask;

      return {
        title: `優先回應 · ${formatTaskHeadline(task)}`,
        detail: formatTaskRouteSummary(task),
        meta: `${task.taskId} · ${task.platformDisplayName} · ${formatCompactDateTime(task.updatedAt)}`,
        primaryLabel: "打開任務",
        primaryRoute: "/jobs" as WorkspaceRoute,
        secondaryLabel: "查看平台",
        secondaryRoute: "/platform-presence" as WorkspaceRoute,
      };
    }

    if (reauthPlatforms.length > 0) {
      return {
        title: "處理平台重新授權",
        detail: `${reauthPlatforms.length} 個平台 Token 已失效，接單權限暫停。`,
        meta: "完成重新授權後，工作台會恢復平台接單狀態。",
        primaryLabel: "平台中心",
        primaryRoute: "/platform-presence" as WorkspaceRoute,
        secondaryLabel: "查看路線",
        secondaryRoute: "/jobs" as WorkspaceRoute,
      };
    }

    if (
      workspace.shiftFeatureEnabled &&
      !workspace.shiftLoadError &&
      !isDriverOnShift
    ) {
      return {
        title: "開始班次",
        detail: "先完成上班打卡，自營派單才會切換成上線狀態。",
        meta: "打卡後可同步檢查平台健康、班次與派單就緒度。",
        primaryLabel: "前往班次",
        primaryRoute: "/shift" as WorkspaceRoute,
        secondaryLabel: "查看平台",
        secondaryRoute: "/platform-presence" as WorkspaceRoute,
      };
    }

    return {
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
          </View>
        }
        subtitle={
          <View style={styles.headerMetaRow}>
            <View style={styles.headerStatusDot} />
            <Text style={styles.headerStatusText}>{headerStatusLabel}</Text>
            <Text style={styles.headerMetaText}>{getDriverId()}</Text>
          </View>
        }
        actions={
          <HeaderAlertButton
            count={notificationCount}
            onPress={navigate({
              pathname: "/incident",
              params: { entry: "cockpit" },
            })}
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

      {sosAcknowledgement ? (
        <Banner
          theme={THEME}
          tone={sosAcknowledgement.status === "queued" ? "warn" : "danger"}
          title={
            sosAcknowledgement.status === "queued"
              ? "SOS 待重送"
              : "SOS 處理提醒"
          }
          body={sosAcknowledgement.message}
          actions={
            <Btn
              theme={THEME}
              variant="secondary"
              size="sm"
              onPress={() => {
                void dismissDriverSosAcknowledgement().then(() =>
                  setSosAcknowledgement(null),
                );
              }}
            >
              關閉
            </Btn>
          }
        />
      ) : null}

      <HeroCard
        title={heroAction.title}
        detail={heroAction.detail}
        meta={heroAction.meta}
        primaryLabel={heroAction.primaryLabel}
        secondaryLabel={heroAction.secondaryLabel}
        onPrimaryPress={navigate(heroAction.primaryRoute)}
        onSecondaryPress={navigate(heroAction.secondaryRoute)}
      />

      <View style={styles.kpiRow}>
        <View style={styles.kpiCell}>
          <KPI
            theme={THEME}
            label={driverStrings.onboarding.kpis.pending}
            value={String(taskSummary.pendingCount)}
            sub={`${taskSummary.urgentCount} 件需回應`}
          />
        </View>
        <View style={styles.kpiCell}>
          <KPI
            theme={THEME}
            label={driverStrings.onboarding.kpis.online}
            value={String(onlinePlatformCount)}
            sub={`/ ${platformRows.length}`}
          />
        </View>
        <View style={styles.kpiCell}>
          <KPI
            theme={THEME}
            label="今日淨收"
            value={formatAmountNumber(todayNetSummary.amount, {
              fractionDigits: 0,
            })}
            sub={getCurrencyLabel(todayNetSummary.amount.currency) || "NT$"}
          />
        </View>
      </View>

      {primaryAlert ? (
        <PrimaryAlertCard
          item={primaryAlert}
          onPress={navigate(primaryAlert.route)}
        />
      ) : null}

      <View style={styles.platformSection}>
        <View style={styles.sectionHeader}>
          <Text style={styles.sectionTitle}>
            {driverStrings.onboarding.platformSectionEyebrow}
          </Text>
          <SectionLink
            label={driverStrings.onboarding.seeAll}
            onPress={navigate("/platform-presence")}
          />
        </View>
        <Card theme={THEME} padding={0}>
          {platformRows.map((row, index) => (
            <PlatformPresenceRow
              key={`${row.code}-${index}`}
              row={row}
              isLast={index === platformRows.length - 1}
              onPress={navigate("/platform-presence")}
            />
          ))}
        </Card>
      </View>

      <View style={styles.quickTileGrid}>
        <QuickLinkTile
          iconName="briefcase-outline"
          label={driverStrings.onboarding.quickLinkLabels.jobs}
          helper={`${taskSummary.pendingCount} 待處理`}
          tone="accent"
          onPress={navigate("/jobs")}
        />
        <QuickLinkTile
          iconName="cash-outline"
          label={driverStrings.onboarding.quickLinkLabels.earnings}
          helper={`今日 ${getCurrencyLabel(todayNetSummary.amount.currency) || "NT$"} ${formatAmountNumber(
            todayNetSummary.amount,
            { fractionDigits: 0 },
          )}`}
          tone="accent"
          onPress={navigate("/earnings")}
        />
        <QuickLinkTile
          iconName="time-outline"
          label={driverStrings.onboarding.quickLinkLabels.shift}
          helper={formatShiftDuration(workspace.activeShift)}
          tone="accent"
          onPress={navigate("/shift")}
        />
        <QuickLinkTile
          iconName="alert-circle-outline"
          label={driverStrings.onboarding.footerActions.sos}
          helper="安全求援"
          tone="danger"
          onPress={navigate({
            pathname: "/incident",
            params: { entry: "cockpit" },
          })}
        />
      </View>
    </Shell>
  );
}

const styles = StyleSheet.create({
  shellContent: {
    paddingBottom: 24,
    gap: 12,
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
    gap: 2,
  },
  headerEyebrow: {
    color: THEME.text,
    fontFamily: THEME.fontFamily,
    fontSize: 17,
    fontWeight: "700",
    letterSpacing: -0.2,
  },
  headerMetaRow: {
    flexDirection: "row",
    alignItems: "center",
    flexWrap: "wrap",
    gap: 6,
  },
  headerStatusDot: {
    width: 7,
    height: 7,
    borderRadius: 4,
    backgroundColor: THEME.success,
  },
  headerStatusText: {
    color: THEME.textDim,
    fontFamily: THEME.fontFamily,
    fontSize: 12,
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
    paddingHorizontal: 18,
    paddingTop: 16,
    paddingBottom: 18,
    borderRadius: 18,
    backgroundColor: THEME.accent,
    overflow: "hidden",
    gap: 6,
  },
  heroGlowLarge: {
    position: "absolute",
    top: -30,
    right: -18,
    width: 160,
    height: 160,
    borderRadius: 80,
    backgroundColor: "rgba(255,255,255,0.10)",
  },
  heroGlowSmall: {
    position: "absolute",
    bottom: -22,
    left: -10,
    width: 120,
    height: 120,
    borderRadius: 60,
    backgroundColor: "rgba(255,255,255,0.08)",
  },
  heroEyebrowRow: {
    flexDirection: "row",
    alignItems: "center",
    gap: 6,
  },
  heroEyebrowDot: {
    width: 6,
    height: 6,
    borderRadius: 3,
    backgroundColor: "#FFFFFF",
  },
  heroEyebrow: {
    color: "rgba(255,255,255,0.85)",
    fontFamily: THEME.fontFamily,
    fontSize: 11,
    fontWeight: "700",
    letterSpacing: 0.6,
    textTransform: "uppercase",
  },
  heroTitle: {
    color: "#FFFFFF",
    fontFamily: THEME.fontFamily,
    fontSize: 22,
    fontWeight: "700",
    letterSpacing: -0.4,
    lineHeight: 28,
  },
  heroDetail: {
    color: "rgba(255,255,255,0.86)",
    fontFamily: THEME.fontFamily,
    fontSize: 13,
    lineHeight: 19,
  },
  heroMeta: {
    color: "rgba(255,255,255,0.72)",
    fontFamily: THEME.monoFamily,
    fontSize: 11,
    lineHeight: 16,
  },
  heroActionRow: {
    flexDirection: "row",
    flexWrap: "wrap",
    gap: 8,
    marginTop: 8,
  },
  heroButton: {
    minHeight: 34,
    borderRadius: 10,
    paddingHorizontal: 14,
    paddingVertical: 8,
    alignItems: "center",
    justifyContent: "center",
    minWidth: 104,
  },
  heroButtonPrimary: {
    backgroundColor: "#FFFFFF",
  },
  heroButtonSecondary: {
    backgroundColor: "rgba(255,255,255,0.16)",
  },
  heroButtonLabel: {
    fontFamily: THEME.fontFamily,
    fontSize: 13,
    fontWeight: "700",
  },
  heroButtonLabelPrimary: {
    color: THEME.accent,
  },
  heroButtonLabelSecondary: {
    color: "#FFFFFF",
  },
  kpiRow: {
    flexDirection: "row",
    gap: 8,
  },
  kpiCell: {
    flex: 1,
    minWidth: 0,
  },
  alertCard: {
    overflow: "hidden",
  },
  alertBodyRow: {
    flexDirection: "row",
    alignItems: "center",
    gap: 10,
    paddingHorizontal: 14,
    paddingVertical: 12,
  },
  alertIconWrap: {
    width: 32,
    height: 32,
    borderRadius: 10,
    alignItems: "center",
    justifyContent: "center",
  },
  alertCopy: {
    flex: 1,
    minWidth: 0,
  },
  alertTitle: {
    fontFamily: THEME.fontFamily,
    fontSize: 13,
    fontWeight: "700",
  },
  alertDescription: {
    color: THEME.textMuted,
    fontFamily: THEME.fontFamily,
    fontSize: 12,
    lineHeight: 16,
  },
  platformSection: {
    gap: 8,
  },
  sectionHeader: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "space-between",
    gap: 8,
  },
  sectionTitle: {
    color: THEME.text,
    fontFamily: THEME.fontFamily,
    fontSize: 14,
    fontWeight: "700",
  },
  sectionLink: {
    color: THEME.accent,
    fontFamily: THEME.fontFamily,
    fontSize: 12,
    fontWeight: "600",
  },
  platformRow: {
    flexDirection: "row",
    alignItems: "center",
    gap: 12,
    paddingHorizontal: 14,
    paddingVertical: 14,
  },
  platformRowBorder: {
    borderBottomWidth: 1,
    borderBottomColor: THEME.border,
  },
  platformRowCopy: {
    flex: 1,
    minWidth: 0,
  },
  platformRowName: {
    color: THEME.text,
    fontFamily: THEME.fontFamily,
    fontSize: 13,
    fontWeight: "700",
  },
  platformRowSummary: {
    color: THEME.textMuted,
    fontFamily: THEME.fontFamily,
    fontSize: 11.5,
    marginTop: 2,
  },
  platformRowRight: {
    flexDirection: "row",
    alignItems: "center",
    gap: 8,
  },
  platformSwitchTrack: {
    width: 34,
    height: 20,
    borderRadius: 999,
    borderWidth: 1,
    justifyContent: "center",
    paddingHorizontal: 2,
  },
  platformSwitchTrackOn: {
    backgroundColor: THEME.success,
    borderColor: THEME.success,
  },
  platformSwitchTrackOff: {
    backgroundColor: THEME.surfaceLo,
    borderColor: THEME.border,
  },
  platformSwitchThumb: {
    width: 14,
    height: 14,
    borderRadius: 7,
    backgroundColor: "#FFFFFF",
  },
  platformSwitchThumbOn: {
    alignSelf: "flex-end",
  },
  platformSwitchThumbOff: {
    alignSelf: "flex-start",
  },
  quickTileGrid: {
    flexDirection: "row",
    flexWrap: "wrap",
    gap: 8,
    paddingBottom: 4,
  },
  quickTileWrap: {
    flexBasis: "48%",
    flexGrow: 1,
  },
  quickTileRow: {
    flexDirection: "row",
    alignItems: "center",
    gap: 12,
  },
  quickTileIconWrap: {
    width: 36,
    height: 36,
    borderRadius: 10,
    alignItems: "center",
    justifyContent: "center",
  },
  quickTileCopy: {
    flex: 1,
    minWidth: 0,
  },
  quickTileLabel: {
    color: THEME.text,
    fontFamily: THEME.fontFamily,
    fontSize: 13,
    fontWeight: "700",
  },
  quickTileHelper: {
    color: THEME.textMuted,
    fontFamily: THEME.fontFamily,
    fontSize: 11.5,
    lineHeight: 16,
    marginTop: 2,
  },
  tilePressed: {
    opacity: 0.88,
  },
});
