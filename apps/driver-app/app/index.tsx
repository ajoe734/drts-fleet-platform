import { useEffect, useMemo, useState } from "react";
import {
  ActivityIndicator,
  Pressable,
  StyleSheet,
  Text,
  View,
} from "react-native";
import { Redirect, useRouter } from "expo-router";
import { Ionicons } from "@expo/vector-icons";
import {
  PLATFORM_CODE_REGISTRY,
  type PlatformPresenceRecord,
  type PlatformPresenceSummary,
  type ShiftRecord,
  type UnifiedDriverTaskView,
} from "@drts/contracts";

import { AppScreen, ErrorBanner, StatusChip, Tokens } from "@/components/ui";
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
import { driverStrings } from "@/lib/strings";

type WorkspaceRoute =
  | "/jobs"
  | "/trip"
  | "/platform-presence"
  | "/earnings"
  | "/shift"
  | "/incident"
  | "/settings";

type WorkspaceTone = "success" | "warning" | "danger" | "neutral" | "brand";

const tokens = Tokens;

function formatClockLabel(value: string | null) {
  if (!value) {
    return null;
  }
  const parsed = new Date(value);
  if (Number.isNaN(parsed.getTime())) {
    return null;
  }
  return parsed.toLocaleTimeString("zh-TW", {
    hour: "2-digit",
    minute: "2-digit",
  });
}

function formatCompactDateTime(value: string | null) {
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

function toErrorMessage(error: unknown, fallback: string) {
  if (error instanceof Error && error.message.trim()) {
    return error.message.trim();
  }
  return fallback;
}

function LoadingState({ label }: { label: string }) {
  return (
    <AppScreen scrollable={false}>
      <View style={styles.loadingState}>
        <View style={styles.loadingPanel}>
          <ActivityIndicator color={tokens.colors.brand} size="large" />
          <Text style={styles.loadingLabel}>{label}</Text>
        </View>
      </View>
    </AppScreen>
  );
}

function StatusDot({ tone, pulse }: { tone: WorkspaceTone; pulse?: boolean }) {
  const palette =
    tone === "success"
      ? tokens.colors.success
      : tone === "warning"
        ? tokens.colors.warning
        : tone === "danger"
          ? tokens.colors.danger
          : tone === "brand"
            ? tokens.colors.brand
            : tokens.colors.textMuted;
  return (
    <View style={styles.statusDotWrap}>
      {pulse ? (
        <View
          style={[styles.statusDotPulse, { backgroundColor: `${palette}55` }]}
        />
      ) : null}
      <View style={[styles.statusDot, { backgroundColor: palette }]} />
    </View>
  );
}

function HeroCard({
  eyebrow,
  title,
  meta,
  primaryLabel,
  secondaryLabel,
  onPrimaryPress,
  onSecondaryPress,
}: {
  eyebrow: string;
  title: string;
  meta: string;
  primaryLabel: string;
  secondaryLabel: string;
  onPrimaryPress: () => void;
  onSecondaryPress: () => void;
}) {
  return (
    <View style={styles.heroCard}>
      <View pointerEvents="none" style={styles.heroGlow} />
      <View style={styles.heroEyebrowRow}>
        <View style={styles.heroEyebrowDot} />
        <Text style={styles.heroEyebrowText}>{eyebrow}</Text>
      </View>
      <Text style={styles.heroTitle}>{title}</Text>
      <Text style={styles.heroMeta}>{meta}</Text>
      <View style={styles.heroActionRow}>
        <Pressable
          accessibilityRole="button"
          onPress={onPrimaryPress}
          style={({ pressed }) => [
            styles.heroPrimaryButton,
            pressed ? styles.heroPrimaryButtonPressed : null,
          ]}
        >
          <Ionicons
            name="navigate"
            size={16}
            color={tokens.colors.brand}
            style={styles.heroButtonIcon}
          />
          <Text style={styles.heroPrimaryLabel}>{primaryLabel}</Text>
        </Pressable>
        <Pressable
          accessibilityRole="button"
          onPress={onSecondaryPress}
          style={({ pressed }) => [
            styles.heroSecondaryButton,
            pressed ? styles.heroSecondaryButtonPressed : null,
          ]}
        >
          <Text style={styles.heroSecondaryLabel}>{secondaryLabel}</Text>
        </Pressable>
      </View>
    </View>
  );
}

type KpiTone = "brand" | "success" | "warning" | "neutral";

function KpiTile({
  label,
  value,
  unit,
  tone,
  iconName,
}: {
  label: string;
  value: string;
  unit?: string;
  tone: KpiTone;
  iconName: keyof typeof Ionicons.glyphMap;
}) {
  const accent =
    tone === "brand"
      ? { color: tokens.colors.brand, bg: tokens.colors.brandBg }
      : tone === "success"
        ? { color: tokens.colors.success, bg: tokens.colors.successBg }
        : tone === "warning"
          ? { color: tokens.colors.warning, bg: tokens.colors.warningBg }
          : { color: tokens.colors.textBody, bg: tokens.colors.surfaceLo };
  return (
    <View style={styles.kpiTile}>
      <View style={[styles.kpiIcon, { backgroundColor: accent.bg }]}>
        <Ionicons name={iconName} size={16} color={accent.color} />
      </View>
      <Text style={styles.kpiLabel}>{label}</Text>
      <View style={styles.kpiValueRow}>
        <Text style={styles.kpiValue}>{value}</Text>
        {unit ? <Text style={styles.kpiUnit}>{unit}</Text> : null}
      </View>
    </View>
  );
}

function ReauthAlert({
  title,
  description,
  actionLabel,
  onPress,
}: {
  title: string;
  description: string;
  actionLabel: string;
  onPress: () => void;
}) {
  return (
    <View style={styles.reauthCard}>
      <View style={styles.reauthIcon}>
        <Ionicons name="lock-open" size={16} color={tokens.colors.warning} />
      </View>
      <View style={styles.reauthBody}>
        <Text style={styles.reauthTitle}>{title}</Text>
        <Text style={styles.reauthDescription}>{description}</Text>
      </View>
      <Pressable
        accessibilityRole="button"
        onPress={onPress}
        style={({ pressed }) => [
          styles.reauthAction,
          pressed ? styles.reauthActionPressed : null,
        ]}
      >
        <Text style={styles.reauthActionLabel}>{actionLabel}</Text>
      </Pressable>
    </View>
  );
}

type UrgentItem = {
  key: string;
  iconName: keyof typeof Ionicons.glyphMap;
  tone: "warning" | "danger" | "info";
  title: string;
  subtitle: string;
  cta: string;
  onPress: () => void;
};

function UrgentRow({ item }: { item: UrgentItem }) {
  const palette =
    item.tone === "danger"
      ? { fg: tokens.colors.danger, bg: tokens.colors.dangerBg }
      : item.tone === "info"
        ? { fg: tokens.colors.info, bg: tokens.colors.infoBg }
        : { fg: tokens.colors.warning, bg: tokens.colors.warningBg };
  return (
    <Pressable
      accessibilityRole="button"
      accessibilityLabel={item.title}
      onPress={item.onPress}
      style={({ pressed }) => [
        styles.urgentRow,
        pressed ? styles.urgentRowPressed : null,
      ]}
    >
      <View style={[styles.urgentIcon, { backgroundColor: palette.bg }]}>
        <Ionicons name={item.iconName} size={16} color={palette.fg} />
      </View>
      <View style={styles.urgentBody}>
        <Text style={styles.urgentTitle}>{item.title}</Text>
        <Text style={styles.urgentSubtitle}>{item.subtitle}</Text>
      </View>
      <View style={styles.urgentCta}>
        <Text style={styles.urgentCtaLabel}>{item.cta}</Text>
        <Ionicons
          name="chevron-forward"
          size={14}
          color={tokens.colors.textMuted}
        />
      </View>
    </Pressable>
  );
}

function PlatformRow({
  record,
  displayName,
  subtitle,
  statusLabel,
  statusVariant,
  isLast,
  onPress,
}: {
  record: PlatformPresenceRecord;
  displayName: string;
  subtitle: string;
  statusLabel: string;
  statusVariant: "success" | "warning" | "danger" | "default";
  isLast: boolean;
  onPress: () => void;
}) {
  return (
    <Pressable
      accessibilityRole="button"
      accessibilityLabel={`${displayName} 平台狀態`}
      onPress={onPress}
      style={[styles.platformRow, isLast ? null : styles.platformRowDivider]}
    >
      <View style={styles.platformBody}>
        <View style={styles.platformNameRow}>
          <Text style={styles.platformCode}>
            {record.platformCode.toUpperCase()}
          </Text>
          <Text style={styles.platformName}>{displayName}</Text>
        </View>
        <Text style={styles.platformSub}>{subtitle}</Text>
      </View>
      <View style={styles.platformControls}>
        <StatusChip label={statusLabel} variant={statusVariant} />
        <Ionicons
          name="chevron-forward"
          size={16}
          color={tokens.colors.textMuted}
        />
      </View>
    </Pressable>
  );
}

function QuickTile({
  label,
  helper,
  iconName,
  tone,
  onPress,
}: {
  label: string;
  helper: string;
  iconName: keyof typeof Ionicons.glyphMap;
  tone: "brand" | "danger";
  onPress: () => void;
}) {
  const accent =
    tone === "danger"
      ? { color: tokens.colors.danger, bg: tokens.colors.dangerBg }
      : { color: tokens.colors.brand, bg: tokens.colors.brandBg };
  return (
    <Pressable
      accessibilityRole="button"
      onPress={onPress}
      style={({ pressed }) => [
        styles.quickTile,
        pressed ? styles.quickTilePressed : null,
      ]}
    >
      <View style={[styles.quickTileIcon, { backgroundColor: accent.bg }]}>
        <Ionicons name={iconName} size={18} color={accent.color} />
      </View>
      <View style={styles.quickTileBody}>
        <Text style={styles.quickTileLabel}>{label}</Text>
        <Text style={styles.quickTileHelper}>{helper}</Text>
      </View>
    </Pressable>
  );
}

type WorkspaceLoadResult = {
  taskViews: UnifiedDriverTaskView[];
  taskFallbackMode: boolean;
  taskLoadError: string | null;
  platformSummary: PlatformPresenceSummary | null;
  platformLoadError: string | null;
  activeShift: ShiftRecord | null;
  shiftFeatureEnabled: boolean;
  shiftLoadError: boolean;
};

const INITIAL_WORKSPACE: WorkspaceLoadResult = {
  taskViews: [],
  taskFallbackMode: false,
  taskLoadError: null,
  platformSummary: null,
  platformLoadError: null,
  activeShift: null,
  shiftFeatureEnabled: true,
  shiftLoadError: false,
};

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
  }, [ready, provisioned, refreshSeed]);

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

  const readyExternalCount = useMemo(
    () =>
      externalPresences.filter(
        (record) =>
          record.status === "online" &&
          !record.reauthRequired &&
          record.eligibility === "eligible",
      ).length,
    [externalPresences],
  );

  const shiftStatusLine = useMemo(() => {
    if (!workspace.shiftFeatureEnabled) {
      return {
        tone: "neutral" as WorkspaceTone,
        label: "班次功能未啟用",
      };
    }
    if (workspace.shiftLoadError) {
      return {
        tone: "warning" as WorkspaceTone,
        label: "班次資料待確認",
      };
    }
    if (isDriverOnShift) {
      const start = formatClockLabel(
        workspace.activeShift?.clockedInAt ?? null,
      );
      return {
        tone: "success" as WorkspaceTone,
        label: start ? `上班中 · ${start} 起` : "上班中",
      };
    }
    return {
      tone: "warning" as WorkspaceTone,
      label: "尚未上班",
    };
  }, [
    isDriverOnShift,
    workspace.activeShift,
    workspace.shiftFeatureEnabled,
    workspace.shiftLoadError,
  ]);

  const platformRows = useMemo(() => {
    type PlatformStatusVariant = "success" | "warning" | "danger" | "default";
    type PlatformRowVm = {
      record: PlatformPresenceRecord;
      displayName: string;
      subtitle: string;
      statusLabel: string;
      statusVariant: PlatformStatusVariant;
    };
    const rows: PlatformRowVm[] = externalPresences.map((record) => {
      const displayName =
        PLATFORM_CODE_REGISTRY[record.platformCode]?.displayName ??
        record.platformCode;
      const latestAt =
        record.status === "online" ? record.lastOnlineAt : record.lastOfflineAt;
      const subtitle = record.reauthRequired
        ? `需重新授權 · 最近更新 ${formatCompactDateTime(record.updatedAt)}`
        : record.status === "online"
          ? `已上線 · ${formatCompactDateTime(latestAt ?? record.updatedAt)}`
          : `離線 · ${formatCompactDateTime(latestAt ?? record.updatedAt)}`;
      let statusVariant: PlatformStatusVariant = "default";
      let statusLabel = record.status === "online" ? "上線" : "離線";
      if (record.reauthRequired) {
        statusVariant = "warning";
        statusLabel = "需授權";
      } else if (record.eligibility === "ineligible") {
        statusVariant = "danger";
        statusLabel = "不可接單";
      } else if (record.status === "online") {
        statusVariant = "success";
      }
      return { record, displayName, subtitle, statusLabel, statusVariant };
    });
    const weight = (variant: PlatformStatusVariant) => {
      switch (variant) {
        case "danger":
          return 3;
        case "warning":
          return 2;
        case "success":
          return 1;
        default:
          return 0;
      }
    };
    return rows.sort((left, right) => {
      const delta = weight(right.statusVariant) - weight(left.statusVariant);
      if (delta !== 0) {
        return delta;
      }
      return left.displayName.localeCompare(right.displayName);
    });
  }, [externalPresences]);

  const urgentItems: UrgentItem[] = useMemo(() => {
    const items: UrgentItem[] = [];
    for (const platform of reauthPlatforms) {
      const name =
        PLATFORM_CODE_REGISTRY[platform.platformCode]?.displayName ??
        platform.platformCode;
      items.push({
        key: `reauth-${platform.platformCode}`,
        iconName: "lock-open-outline",
        tone: "warning",
        title: `${name} 需重新授權`,
        subtitle: `Token 已過期 · ${formatCompactDateTime(platform.updatedAt)}`,
        cta: "處理",
        onPress: () => router.push("/platform-presence"),
      });
    }
    const syncTasks = workspace.taskViews.filter(
      (task) => !isOwnedUnifiedTask(task) && hasUnifiedTaskSyncIssue(task),
    );
    for (const task of syncTasks.slice(0, 3)) {
      items.push({
        key: `sync-${task.taskId}`,
        iconName: "warning-outline",
        tone: "danger",
        title: `${task.platformDisplayName} 同步異常`,
        subtitle:
          task.syncIssueSummary?.trim() ||
          `${task.taskId} 需要派車台介入確認。`,
        cta: "查看",
        onPress: () => router.push("/jobs"),
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
        iconName: "time-outline",
        tone: "info",
        title: "尚未上班",
        subtitle: "請先打卡上線，自營派單才會啟動。",
        cta: "前往",
        onPress: () => router.push("/shift"),
      });
    }
    if (taskSummary.pendingPlatformCount > 0) {
      items.push({
        key: "awaiting-platform",
        iconName: "hourglass-outline",
        tone: "info",
        title: `${taskSummary.pendingPlatformCount} 筆等待平台確認`,
        subtitle: "來源平台尚未確認，確認前請勿自行前往接送點。",
        cta: "任務",
        onPress: () => router.push("/jobs"),
      });
    }
    return items;
  }, [
    isDriverOnShift,
    reauthPlatforms,
    router,
    taskSummary,
    workspace.shiftFeatureEnabled,
    workspace.shiftLoadError,
    workspace.taskViews,
  ]);

  const navigate = (route: WorkspaceRoute) => () => router.push(route);

  const notificationCount = taskSummary.urgentCount + reauthPlatforms.length;

  const heroAction = useMemo(() => {
    if (taskSummary.activeTripTask) {
      const task = taskSummary.activeTripTask;
      const routeSummary =
        task.pickupSummary && task.dropoffSummary
          ? `${task.pickupSummary} → ${task.dropoffSummary}`
          : task.pickupSummary ||
            task.dropoffSummary ||
            "打開行程作業查看下一步";
      return {
        title: `繼續行程 · ${task.taskId}`,
        meta: `${task.platformDisplayName} · ${routeSummary}`,
        primaryLabel: "前往行程",
        primaryRoute: "/trip" as WorkspaceRoute,
        secondaryLabel: "查看任務",
        secondaryRoute: "/jobs" as WorkspaceRoute,
      };
    }
    if (taskSummary.actionRequiredTask) {
      const task = taskSummary.actionRequiredTask;
      return {
        title: "優先處理待回應任務",
        meta: `${task.platformDisplayName} · ${task.taskId}`,
        primaryLabel: "打開任務",
        primaryRoute: "/jobs" as WorkspaceRoute,
        secondaryLabel: "查看平台",
        secondaryRoute: "/platform-presence" as WorkspaceRoute,
      };
    }
    if (reauthPlatforms.length > 0) {
      return {
        title: "處理平台重新授權",
        meta: `${reauthPlatforms.length} 個平台需要更新 Token。`,
        primaryLabel: "平台中心",
        primaryRoute: "/platform-presence" as WorkspaceRoute,
        secondaryLabel: "查看設定",
        secondaryRoute: "/settings" as WorkspaceRoute,
      };
    }
    if (
      workspace.shiftFeatureEnabled &&
      !workspace.shiftLoadError &&
      !isDriverOnShift
    ) {
      return {
        title: "開始班次",
        meta: "先完成上班打卡，DRTS 自營派單才會進入可接單狀態。",
        primaryLabel: "前往班次",
        primaryRoute: "/shift" as WorkspaceRoute,
        secondaryLabel: "查看平台",
        secondaryRoute: "/platform-presence" as WorkspaceRoute,
      };
    }
    return {
      title: "檢查多平台就緒狀態",
      meta: "工作台已待命，可查看平台健康、班次與設定。",
      primaryLabel: "平台中心",
      primaryRoute: "/platform-presence" as WorkspaceRoute,
      secondaryLabel: "查看設定",
      secondaryRoute: "/settings" as WorkspaceRoute,
    };
  }, [
    isDriverOnShift,
    reauthPlatforms.length,
    taskSummary,
    workspace.shiftFeatureEnabled,
    workspace.shiftLoadError,
  ]);

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

  const reauthPlatform =
    platformRows.find((row) => row.record.reauthRequired) ?? null;
  const reauthDisplayName = reauthPlatform?.displayName ?? null;

  return (
    <AppScreen contentContainerStyle={styles.cockpitContent}>
      <View style={styles.cockpitHeader}>
        <View style={styles.cockpitGreetingBlock}>
          <Text style={styles.cockpitGreetingEyebrow}>
            {driverStrings.onboarding.workspaceGreetingEyebrow}
          </Text>
          <Text style={styles.cockpitGreetingLabel}>
            {driverStrings.onboarding.workspaceGreetingTitle}
          </Text>
          <View style={styles.cockpitStatusRow}>
            <StatusDot
              tone={shiftStatusLine.tone}
              pulse={shiftStatusLine.tone === "success"}
            />
            <Text style={styles.cockpitStatusText}>
              {shiftStatusLine.label}
            </Text>
          </View>
        </View>
        <Pressable
          accessibilityLabel="安全事件"
          accessibilityRole="button"
          onPress={navigate("/incident")}
          style={({ pressed }) => [
            styles.cockpitBellButton,
            pressed ? styles.cockpitBellButtonPressed : null,
          ]}
        >
          <Ionicons
            name="notifications-outline"
            size={18}
            color={tokens.colors.text}
          />
          {notificationCount > 0 ? (
            <View style={styles.cockpitBellBadge} />
          ) : null}
        </Pressable>
      </View>

      {identityIssue ? <ErrorBanner message={identityIssue} /> : null}

      <HeroCard
        eyebrow={driverStrings.onboarding.heroEyebrow}
        title={heroAction.title}
        meta={heroAction.meta}
        primaryLabel={heroAction.primaryLabel}
        secondaryLabel={heroAction.secondaryLabel}
        onPrimaryPress={navigate(heroAction.primaryRoute)}
        onSecondaryPress={navigate(heroAction.secondaryRoute)}
      />

      <View style={styles.kpiRow}>
        <KpiTile
          iconName="list-outline"
          label={driverStrings.onboarding.kpis.pending}
          tone={taskSummary.pendingCount > 0 ? "brand" : "neutral"}
          value={String(taskSummary.pendingCount)}
        />
        <KpiTile
          iconName="power-outline"
          label={driverStrings.onboarding.kpis.online}
          tone={readyExternalCount > 0 ? "success" : "neutral"}
          unit={
            externalPresences.length > 0
              ? `/ ${externalPresences.length}`
              : undefined
          }
          value={String(readyExternalCount)}
        />
        <KpiTile
          iconName="time-outline"
          label={driverStrings.onboarding.kpis.shift}
          tone={isDriverOnShift ? "success" : "warning"}
          value={isDriverOnShift ? "上班中" : "未上班"}
        />
      </View>

      {reauthPlatform ? (
        <ReauthAlert
          actionLabel="處理"
          description="Token 已過期，無法接單"
          onPress={navigate("/platform-presence")}
          title={`${reauthDisplayName ?? "平台"} 需重新授權`}
        />
      ) : null}

      {urgentItems.length > 0 ? (
        <View style={styles.section}>
          <View style={styles.sectionHeader}>
            <Text style={styles.sectionTitle}>今日需處理</Text>
            <Text style={styles.sectionMeta}>{urgentItems.length} 件</Text>
          </View>
          <View style={styles.urgentList}>
            {urgentItems.map((item) => (
              <UrgentRow key={item.key} item={item} />
            ))}
          </View>
        </View>
      ) : null}

      <View style={styles.section}>
        <View style={styles.sectionHeader}>
          <Text style={styles.sectionTitle}>
            {driverStrings.onboarding.platformSectionEyebrow}
          </Text>
          <Pressable
            accessibilityRole="button"
            onPress={navigate("/platform-presence")}
          >
            <Text style={styles.sectionAction}>
              {driverStrings.onboarding.seeAll}
            </Text>
          </Pressable>
        </View>
        {platformRows.length > 0 ? (
          <View style={styles.platformList}>
            {platformRows.map((row, index) => (
              <PlatformRow
                key={row.record.platformCode}
                displayName={row.displayName}
                isLast={index === platformRows.length - 1}
                onPress={navigate("/platform-presence")}
                record={row.record}
                statusLabel={row.statusLabel}
                statusVariant={row.statusVariant}
                subtitle={row.subtitle}
              />
            ))}
          </View>
        ) : (
          <View style={styles.emptyPlatforms}>
            <Ionicons
              name="swap-horizontal-outline"
              size={16}
              color={tokens.colors.textMuted}
            />
            <Text style={styles.emptyPlatformsText}>
              {workspace.platformLoadError ??
                "目前尚未連接外部平台，可前往平台中心或設定確認綁定。"}
            </Text>
          </View>
        )}
      </View>

      <View style={styles.quickGrid}>
        <QuickTile
          helper={`${taskSummary.pendingCount} 筆未完成`}
          iconName="briefcase-outline"
          label={driverStrings.onboarding.quickLinkLabels.jobs}
          tone="brand"
          onPress={navigate("/jobs")}
        />
        <QuickTile
          helper={driverStrings.onboarding.quickLinkHelpers.earnings}
          iconName="cash-outline"
          label={driverStrings.onboarding.quickLinkLabels.earnings}
          tone="brand"
          onPress={navigate("/earnings")}
        />
        <QuickTile
          helper={driverStrings.onboarding.quickLinkHelpers.shift}
          iconName="time-outline"
          label={driverStrings.onboarding.quickLinkLabels.shift}
          tone="brand"
          onPress={navigate("/shift")}
        />
        <QuickTile
          helper="安全求援"
          iconName="alert-circle-outline"
          label="SOS"
          tone="danger"
          onPress={navigate("/incident")}
        />
      </View>

      <View style={styles.footerLinks}>
        <Pressable
          accessibilityRole="button"
          onPress={() => setRefreshSeed((current) => current + 1)}
          style={({ pressed }) => [
            styles.footerLink,
            pressed ? styles.footerLinkPressed : null,
          ]}
        >
          <Ionicons
            name="refresh-outline"
            size={14}
            color={tokens.colors.textMuted}
          />
          <Text style={styles.footerLinkText}>
            {driverStrings.onboarding.footerActions.refresh}
          </Text>
        </Pressable>
        <Pressable
          accessibilityRole="button"
          onPress={navigate("/settings")}
          style={({ pressed }) => [
            styles.footerLink,
            pressed ? styles.footerLinkPressed : null,
          ]}
        >
          <Ionicons
            name="settings-outline"
            size={14}
            color={tokens.colors.textMuted}
          />
          <Text style={styles.footerLinkText}>
            {driverStrings.onboarding.quickLinkLabels.settings}
          </Text>
        </Pressable>
      </View>
    </AppScreen>
  );
}

const styles = StyleSheet.create({
  loadingState: {
    flex: 1,
    alignItems: "center",
    justifyContent: "center",
    paddingHorizontal: tokens.spacing[24],
    gap: tokens.spacing[16],
  },
  loadingPanel: {
    minWidth: 220,
    alignItems: "center",
    justifyContent: "center",
    paddingHorizontal: tokens.spacing[20],
    paddingVertical: tokens.spacing[24],
    gap: tokens.spacing[12],
    backgroundColor: tokens.colors.surface,
    borderWidth: 1,
    borderColor: tokens.colors.border,
    borderRadius: tokens.radius.xl,
    ...tokens.shadows.sm,
  },
  loadingLabel: {
    ...tokens.type.body,
    color: tokens.colors.textBody,
    textAlign: "center",
  },

  cockpitContent: {
    paddingTop: tokens.spacing[12],
    gap: tokens.spacing[16],
  },
  cockpitHeader: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "space-between",
  },
  cockpitGreetingBlock: {
    flex: 1,
  },
  cockpitGreetingEyebrow: {
    ...tokens.type.label,
    color: tokens.colors.textMuted,
  },
  cockpitGreetingLabel: {
    ...tokens.type.display,
    fontSize: 26,
    color: tokens.colors.textStrong,
    marginTop: 2,
  },
  cockpitStatusRow: {
    flexDirection: "row",
    alignItems: "center",
    gap: tokens.spacing[8],
    marginTop: 4,
  },
  cockpitStatusText: {
    ...tokens.type.small,
    color: tokens.colors.textMuted,
  },
  cockpitBellButton: {
    width: 38,
    height: 38,
    borderRadius: 12,
    backgroundColor: tokens.colors.surface,
    borderWidth: 1,
    borderColor: tokens.colors.border,
    alignItems: "center",
    justifyContent: "center",
  },
  cockpitBellButtonPressed: {
    backgroundColor: tokens.colors.surfaceLo,
  },
  cockpitBellBadge: {
    position: "absolute",
    top: 9,
    right: 10,
    width: 7,
    height: 7,
    borderRadius: 4,
    backgroundColor: tokens.colors.danger,
  },

  statusDotWrap: {
    width: 10,
    height: 10,
    alignItems: "center",
    justifyContent: "center",
  },
  statusDot: {
    width: 8,
    height: 8,
    borderRadius: 4,
  },
  statusDotPulse: {
    position: "absolute",
    width: 14,
    height: 14,
    borderRadius: 7,
  },

  heroCard: {
    backgroundColor: tokens.colors.brand,
    borderRadius: 18,
    padding: tokens.spacing[16],
    overflow: "hidden",
    ...tokens.shadows.md,
  },
  heroGlow: {
    position: "absolute",
    top: -30,
    right: -20,
    width: 160,
    height: 160,
    borderRadius: 80,
    backgroundColor: "rgba(255,255,255,0.07)",
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
    backgroundColor: tokens.colors.textInverse,
  },
  heroEyebrowText: {
    ...tokens.type.micro,
    color: tokens.colors.textInverse,
    opacity: 0.9,
  },
  heroTitle: {
    fontSize: 22,
    lineHeight: 28,
    fontWeight: "700",
    letterSpacing: -0.3,
    color: tokens.colors.textInverse,
    marginTop: 6,
  },
  heroMeta: {
    ...tokens.type.small,
    color: tokens.colors.textInverse,
    opacity: 0.85,
    marginTop: 4,
  },
  heroActionRow: {
    flexDirection: "row",
    gap: tokens.spacing[8],
    marginTop: tokens.spacing[16],
  },
  heroPrimaryButton: {
    backgroundColor: tokens.colors.surface,
    borderRadius: 12,
    paddingHorizontal: tokens.spacing[16],
    paddingVertical: tokens.spacing[8],
    flexDirection: "row",
    alignItems: "center",
  },
  heroPrimaryButtonPressed: {
    opacity: 0.85,
  },
  heroPrimaryLabel: {
    ...tokens.type.label,
    color: tokens.colors.brand,
    fontWeight: "700",
  },
  heroButtonIcon: {
    marginRight: 6,
  },
  heroSecondaryButton: {
    borderRadius: 12,
    paddingHorizontal: tokens.spacing[16],
    paddingVertical: tokens.spacing[8],
    backgroundColor: "rgba(255,255,255,0.15)",
    flexDirection: "row",
    alignItems: "center",
  },
  heroSecondaryButtonPressed: {
    opacity: 0.7,
  },
  heroSecondaryLabel: {
    ...tokens.type.label,
    color: tokens.colors.textInverse,
    fontWeight: "600",
  },

  kpiRow: {
    flexDirection: "row",
    gap: tokens.spacing[8],
  },
  kpiTile: {
    flex: 1,
    backgroundColor: tokens.colors.surface,
    borderWidth: 1,
    borderColor: tokens.colors.border,
    borderRadius: 14,
    padding: tokens.spacing[12],
    gap: 6,
  },
  kpiIcon: {
    width: 28,
    height: 28,
    borderRadius: 8,
    alignItems: "center",
    justifyContent: "center",
  },
  kpiLabel: {
    ...tokens.type.micro,
    color: tokens.colors.textMuted,
    marginTop: 2,
  },
  kpiValueRow: {
    flexDirection: "row",
    alignItems: "baseline",
    gap: 2,
  },
  kpiValue: {
    ...tokens.type.sectionTitle,
    color: tokens.colors.textStrong,
  },
  kpiUnit: {
    ...tokens.type.micro,
    color: tokens.colors.textMuted,
  },

  reauthCard: {
    flexDirection: "row",
    alignItems: "center",
    gap: tokens.spacing[12],
    padding: tokens.spacing[12],
    backgroundColor: tokens.colors.warningBg,
    borderColor: `${tokens.colors.warning}40`,
    borderWidth: 1,
    borderRadius: 14,
  },
  reauthIcon: {
    width: 32,
    height: 32,
    borderRadius: 10,
    backgroundColor: `${tokens.colors.warning}25`,
    alignItems: "center",
    justifyContent: "center",
  },
  reauthBody: {
    flex: 1,
    minWidth: 0,
  },
  reauthTitle: {
    ...tokens.type.bodyStrong,
    color: tokens.colors.warning,
  },
  reauthDescription: {
    ...tokens.type.small,
    color: tokens.colors.textMuted,
    marginTop: 1,
  },
  reauthAction: {
    paddingHorizontal: tokens.spacing[12],
    paddingVertical: tokens.spacing[8],
    borderRadius: 10,
    backgroundColor: tokens.colors.warning,
  },
  reauthActionPressed: {
    opacity: 0.85,
  },
  reauthActionLabel: {
    ...tokens.type.label,
    color: "#1A1300",
    fontWeight: "700",
  },

  section: {
    gap: tokens.spacing[8],
  },
  sectionHeader: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "space-between",
  },
  sectionTitle: {
    ...tokens.type.sectionTitle,
    color: tokens.colors.textStrong,
  },
  sectionMeta: {
    ...tokens.type.small,
    color: tokens.colors.textMuted,
  },
  sectionAction: {
    ...tokens.type.label,
    color: tokens.colors.brand,
    fontWeight: "600",
  },

  urgentList: {
    gap: tokens.spacing[8],
  },
  urgentRow: {
    flexDirection: "row",
    alignItems: "center",
    gap: tokens.spacing[12],
    padding: tokens.spacing[12],
    backgroundColor: tokens.colors.surface,
    borderWidth: 1,
    borderColor: tokens.colors.border,
    borderRadius: 12,
  },
  urgentRowPressed: {
    backgroundColor: tokens.colors.surfaceLo,
  },
  urgentIcon: {
    width: 32,
    height: 32,
    borderRadius: 10,
    alignItems: "center",
    justifyContent: "center",
  },
  urgentBody: {
    flex: 1,
    minWidth: 0,
  },
  urgentTitle: {
    ...tokens.type.bodyStrong,
    color: tokens.colors.textStrong,
  },
  urgentSubtitle: {
    ...tokens.type.small,
    color: tokens.colors.textMuted,
    marginTop: 1,
  },
  urgentCta: {
    flexDirection: "row",
    alignItems: "center",
    gap: 4,
  },
  urgentCtaLabel: {
    ...tokens.type.label,
    color: tokens.colors.brand,
    fontWeight: "600",
  },

  platformList: {
    backgroundColor: tokens.colors.surface,
    borderWidth: 1,
    borderColor: tokens.colors.border,
    borderRadius: 14,
    overflow: "hidden",
  },
  platformRow: {
    flexDirection: "row",
    alignItems: "center",
    gap: tokens.spacing[12],
    paddingHorizontal: tokens.spacing[12],
    paddingVertical: tokens.spacing[12],
  },
  platformRowDivider: {
    borderBottomWidth: 1,
    borderBottomColor: tokens.colors.border,
  },
  platformBody: {
    flex: 1,
    minWidth: 0,
  },
  platformNameRow: {
    flexDirection: "row",
    alignItems: "center",
    gap: tokens.spacing[8],
  },
  platformCode: {
    ...tokens.type.code,
    color: tokens.colors.forwarded,
    fontWeight: "700",
  },
  platformName: {
    ...tokens.type.bodyStrong,
    color: tokens.colors.textStrong,
  },
  platformSub: {
    ...tokens.type.small,
    color: tokens.colors.textMuted,
    marginTop: 1,
  },
  platformControls: {
    flexDirection: "row",
    alignItems: "center",
    gap: tokens.spacing[8],
  },

  emptyPlatforms: {
    flexDirection: "row",
    alignItems: "flex-start",
    gap: tokens.spacing[8],
    padding: tokens.spacing[12],
    backgroundColor: tokens.colors.surface,
    borderWidth: 1,
    borderColor: tokens.colors.border,
    borderRadius: 12,
  },
  emptyPlatformsText: {
    ...tokens.type.small,
    color: tokens.colors.textMuted,
    flex: 1,
    lineHeight: 18,
  },

  quickGrid: {
    flexDirection: "row",
    flexWrap: "wrap",
    gap: tokens.spacing[8],
  },
  quickTile: {
    flexBasis: "48%",
    flexGrow: 1,
    flexDirection: "row",
    alignItems: "center",
    gap: tokens.spacing[12],
    padding: tokens.spacing[12],
    backgroundColor: tokens.colors.surface,
    borderWidth: 1,
    borderColor: tokens.colors.border,
    borderRadius: 12,
  },
  quickTilePressed: {
    backgroundColor: tokens.colors.surfaceLo,
  },
  quickTileIcon: {
    width: 36,
    height: 36,
    borderRadius: 10,
    alignItems: "center",
    justifyContent: "center",
  },
  quickTileBody: {
    flex: 1,
    minWidth: 0,
  },
  quickTileLabel: {
    ...tokens.type.bodyStrong,
    color: tokens.colors.textStrong,
  },
  quickTileHelper: {
    ...tokens.type.small,
    color: tokens.colors.textMuted,
    marginTop: 1,
  },

  footerLinks: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "center",
    gap: tokens.spacing[16],
    paddingTop: tokens.spacing[8],
  },
  footerLink: {
    flexDirection: "row",
    alignItems: "center",
    gap: 4,
    paddingHorizontal: tokens.spacing[12],
    paddingVertical: tokens.spacing[8],
  },
  footerLinkPressed: {
    opacity: 0.7,
  },
  footerLinkText: {
    ...tokens.type.small,
    color: tokens.colors.textMuted,
  },
});
