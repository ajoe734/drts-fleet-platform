import { PlatformNoticeBanner } from "../components/platform-notice-banner";
import { loadDriverOrderSummaries } from "@/lib/task-order-summaries";
import { useEffect, useMemo, useRef, useState } from "react";
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
  type DriverTaskAction,
  type EmptyStateEnvelope,
  type NotificationRecord,
  PLATFORM_CODE_REGISTRY,
  type RefreshTier,
  type ResourceActionDescriptor,
  type EmptyReason,
  type DriverTaskOrderSummary,
  type PlatformPresenceAdapterStatusRecord,
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
  formatDriverError,
  getDriverClient,
  getDriverId,
  initializeDriverIdentity,
  isDriverIdentityProvisioned,
  registerProtectedCacheClearHandler,
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
  | "/sos"
  | "/incident"
  | "/settings";

type WorkspaceLoadResult = {
  taskViews: UnifiedDriverTaskView[];
  orderMap: Record<string, DriverTaskOrderSummary>;
  taskFallbackMode: boolean;
  taskLoadError: string | null;
  platformSummary: PlatformPresenceSummary | null;
  platformLoadError: string | null;
  activeShift: ShiftRecord | null;
  shiftFeatureEnabled: boolean;
  shiftLoadError: boolean;
  notifications: NotificationRecord[];
  notificationLoadError: string | null;
  loadedAt: string | null;
};

type HeroState =
  | "reauth"
  | "urgent_task"
  | "trip"
  | "go_online"
  | "off_shift"
  | "awaiting_platform"
  | "standing_by";

type HeroActionModel = {
  state: HeroState;
  tone: Exclude<CanvasTone, "neutral"> | "accent";
  eyebrow: string;
  title: string;
  detail: string;
  meta: string;
  primaryAction: WorkspaceActionModel;
  secondaryAction: WorkspaceActionModel | null;
};

type EmptyStateModel = {
  tone: Exclude<CanvasTone, "neutral">;
  title: string;
  body: string;
  action: WorkspaceActionModel;
  envelope: EmptyStateEnvelope;
};

type UrgentItem = {
  key: string;
  tone: Exclude<CanvasTone, "neutral">;
  title: string;
  body: string;
  action: WorkspaceActionModel;
  iconName: keyof typeof Ionicons.glyphMap;
};

type ActiveTripCardModel = {
  title: string;
  routeSummary: string;
  meta: string;
  fareLabel: string;
  platformLabel: string;
  primaryAction: WorkspaceActionModel;
  secondaryAction: WorkspaceActionModel;
};

type NotificationCardModel = {
  notificationId: string;
  title: string;
  body: string;
  createdAt: string;
  readAt: string | null;
  tone: Exclude<CanvasTone, "neutral">;
  // null when the notification does not point at a screen; the inbox then
  // offers no 開啟 button instead of guessing a destination.
  route: WorkspaceRoute | null;
  iconName: keyof typeof Ionicons.glyphMap;
  persistent: boolean;
};

type WorkspaceNotice = {
  noticeId: string;
  outcome: {
    outcomeId: string;
    notificationId: string | null;
    readAt: string | null;
    state: string;
  };
};

type PlatformWorkspaceRow = {
  key: string;
  name: string;
  summary: string;
  meta: string;
  tone: CanvasTone;
  forwarded: boolean;
};

type DeepLinkTileModel = {
  iconName: keyof typeof Ionicons.glyphMap;
  label: string;
  helper: string;
  action: WorkspaceActionModel;
  tone?: Exclude<CanvasTone, "neutral"> | "accent";
};

type WorkspaceActionModel = {
  route: WorkspaceRoute;
  descriptor: ResourceActionDescriptor;
  // What the button is about (a task or a platform). Buttons are only
  // treated as repeats when they open the same screen for the same subject.
  subject?: string;
};

const THEME = driverCanvasTheme;
const WORKSPACE_REFRESH_TIER: RefreshTier = "medium";
// Taiwan has no daylight saving, so a fixed UTC+8 offset gives Taiwan local
// time on any device without relying on the phone's own time zone.
const TAIWAN_UTC_OFFSET_MS = 8 * 60 * 60 * 1000;
const NOTICE_RECEIPT_MISSING_MESSAGE =
  "無法標示已讀，請按右上角重新整理後再試。";
const NOTICE_READ_FAILED_MESSAGE = "無法標示已讀，請稍後再試。";
const TASK_LOAD_FAILED_MESSAGE = "讀取失敗，請檢查網路後重新整理。";
const TASK_LOAD_DENIED_MESSAGE =
  "目前無法讀取任務資料，請確認帳號權限或聯繫管理員。";
const UNKNOWN_PLATFORM_NAME = "外部平台";
const REFRESH_TIER_INTERVAL_MS: Record<RefreshTier, number | null> = {
  urgent: 5_000,
  fast: 3_000,
  dispatch: 5_000,
  medium: 15_000,
  medium_slow: 30_000,
  slow: 30_000,
  manual: null,
};

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
  notifications: [],
  notificationLoadError: null,
  loadedAt: null,
};

function toErrorMessage(error: unknown, fallback: string) {
  return formatDriverError(error, fallback);
}

function createWorkspaceAction(
  route: WorkspaceRoute,
  action: string,
  enabled = true,
  disabledReasonCode?: string,
  riskLevel: ResourceActionDescriptor["riskLevel"] = "low",
): WorkspaceActionModel {
  return {
    route,
    descriptor: {
      action,
      enabled,
      disabledReasonCode,
      riskLevel,
    },
  };
}

function withSubject(
  action: WorkspaceActionModel,
  subject: string,
): WorkspaceActionModel {
  return { ...action, subject };
}

function getActionSubjectKey(action: WorkspaceActionModel) {
  return `${action.route}|${action.subject ?? ""}`;
}

function getPlatformName(platformCode: string) {
  return (
    PLATFORM_CODE_REGISTRY[platformCode as keyof typeof PLATFORM_CODE_REGISTRY]
      ?.displayName ?? UNKNOWN_PLATFORM_NAME
  );
}

function getActionLabel(action: string) {
  switch (action) {
    case "accept":
      return "接受任務";
    case "reject":
      return "婉拒任務";
    case "depart":
      return "前往上車點";
    case "arrived_pickup":
      return "已抵達上車點";
    case "start":
      return "開始行程";
    case "complete":
      return "完成行程";
    case "start_shift":
      return "前往打卡";
    case "go_online":
      return "前往平台連線";
    case "resolve_reauth":
      return "處理重新授權";
    case "return_to_trip":
      return "回到行程";
    case "review_urgent_task":
      return "審視任務";
    case "open_jobs":
      return "查看任務";
    case "open_trip":
      return "行程工作區";
    case "open_platform_presence":
      return "平台中心";
    case "open_earnings":
      return "查看收入";
    case "open_shift":
      return "查看班次";
    case "open_settings":
      return "前往設定";
    case "review_eligibility":
      return "檢查資格";
    case "manage_platform_binding":
      return "管理平台";
    case "review_sos":
      return "查看 SOS";
    default:
      return "查看詳情";
  }
}

function getActionDisabledReason(
  reasonCode: string | undefined,
  fallback = "目前無法執行此動作。",
) {
  switch (reasonCode) {
    case "feature_disabled":
      return "此功能目前未啟用。";
    case "no_platform_binding":
      return "尚未綁定任何平台帳號。";
    case "shift_data_unavailable":
      return "班次資料尚未同步完成。";
    case "permission_denied":
      return "目前帳號權限不足，請聯繫管理員。";
    case "external_unavailable":
      return "外部平台暫時不可用，請稍後再試。";
    case "not_provisioned":
      return "裝置或平台尚未完成設定。";
    case "no_active_trip":
      return "目前沒有進行中的行程。";
    default:
      return fallback;
  }
}

function getRefreshTierIntervalMs(tier: RefreshTier) {
  return REFRESH_TIER_INTERVAL_MS[tier];
}

// The task-load error is shown on the home screen, so it is always one of two
// fixed sentences; the raw text ("Network request failed", HTTP codes) is
// only used to tell a permission problem from everything else.
function describeTaskLoadError(error: unknown) {
  const statusCode =
    typeof error === "object" && error !== null && "statusCode" in error
      ? String((error as { statusCode?: unknown }).statusCode ?? "")
      : "";
  const raw = [
    error instanceof Error ? error.message : String(error ?? ""),
    toErrorMessage(error, ""),
    statusCode,
  ].join(" ");
  return classifyErrorReason(raw) === "permission_denied"
    ? TASK_LOAD_DENIED_MESSAGE
    : TASK_LOAD_FAILED_MESSAGE;
}

function classifyErrorReason(message: string | null): EmptyReason {
  const normalized = message?.trim().toLowerCase() ?? "";
  if (
    normalized.includes("403") ||
    normalized.includes("401") ||
    normalized.includes("forbidden") ||
    normalized.includes("unauthorized") ||
    normalized.includes("permission") ||
    normalized.includes("權限")
  ) {
    return "permission_denied";
  }

  return "fetch_failed";
}

function getNotificationHaystack(notification: NotificationRecord) {
  return `${notification.title} ${notification.message}`.trim().toLowerCase();
}

// NotificationRecord has no type or category field, so a notice counts as an
// SOS notice only when it says "SOS". Words such as 緊急 or incident also
// appear in ordinary notices (「緊急維護通知」) and must not open the SOS screen.
function isSosNotification(notification: NotificationRecord) {
  return /\bsos\b/.test(getNotificationHaystack(notification));
}

function mentionsPlatformAuthorization(haystack: string) {
  return haystack.includes("授權") || haystack.includes("reauth");
}

function getNotificationRoute(
  notification: NotificationRecord,
): WorkspaceRoute | null {
  const haystack = getNotificationHaystack(notification);
  if (isSosNotification(notification)) {
    return "/sos";
  }

  if (mentionsPlatformAuthorization(haystack)) {
    return "/platform-presence";
  }

  if (haystack.includes("任務") || haystack.includes("task")) {
    return "/jobs";
  }

  if (haystack.includes("平台")) {
    return "/platform-presence";
  }

  // A notification that names no task, platform or authorisation has no
  // screen to open. It used to fall through to /sos, so 開啟 on a plain
  // announcement opened the emergency screen.
  return null;
}

function getNotificationTone(
  notification: NotificationRecord,
): Exclude<CanvasTone, "neutral"> {
  const haystack = getNotificationHaystack(notification);
  if (isSosNotification(notification)) {
    return "danger";
  }

  if (
    haystack.includes("失敗") ||
    haystack.includes("異常") ||
    haystack.includes("緊急") ||
    haystack.includes("warning")
  ) {
    return "warn";
  }

  return "info";
}

function getNotificationIconName(
  notification: NotificationRecord,
): keyof typeof Ionicons.glyphMap {
  if (isSosNotification(notification)) {
    return "warning-outline";
  }

  const route = getNotificationRoute(notification);
  if (route === "/platform-presence") {
    return mentionsPlatformAuthorization(getNotificationHaystack(notification))
      ? "lock-closed-outline"
      : "layers-outline";
  }

  if (route === "/jobs") {
    return "notifications-outline";
  }

  return "chatbox-ellipses-outline";
}

// Returns a Date whose UTC fields read as Taiwan wall-clock time.
function toTaiwanWallClock(value: string | number): Date | null {
  const ms = typeof value === "number" ? value : Date.parse(value);
  if (!Number.isFinite(ms)) {
    return null;
  }
  return new Date(ms + TAIWAN_UTC_OFFSET_MS);
}

function padTwo(value: number) {
  return String(value).padStart(2, "0");
}

function formatTaiwanClock(value: string | number) {
  const wall = toTaiwanWallClock(value);
  if (!wall) {
    return "—";
  }
  return `${padTwo(wall.getUTCHours())}:${padTwo(wall.getUTCMinutes())}`;
}

function formatClockLabel(value: string | null | undefined) {
  if (!value) {
    return "—";
  }

  return formatTaiwanClock(value);
}

function formatCompactDateTime(value: string | null | undefined) {
  if (!value) {
    return driverStrings.common.notUpdatedYet;
  }

  const wall = toTaiwanWallClock(value);
  if (!wall) {
    return "—";
  }

  return `${wall.getUTCMonth() + 1}/${wall.getUTCDate()} ${formatTaiwanClock(value)}`;
}

function isSameTaiwanDay(value: string, reference: Date) {
  const wall = toTaiwanWallClock(value);
  const referenceWall = toTaiwanWallClock(reference.getTime());
  if (!wall || !referenceWall) {
    return false;
  }

  return (
    wall.getUTCFullYear() === referenceWall.getUTCFullYear() &&
    wall.getUTCMonth() === referenceWall.getUTCMonth() &&
    wall.getUTCDate() === referenceWall.getUTCDate()
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

function getPlatformTone(
  record: PlatformPresenceRecord,
  adapterStatus?: PlatformPresenceAdapterStatusRecord,
): CanvasTone {
  if (record.reauthRequired) {
    return "warn";
  }

  if (record.eligibility === "ineligible") {
    return "danger";
  }

  if (
    adapterStatus?.status === "degraded" ||
    adapterStatus?.status === "down"
  ) {
    return "warn";
  }

  if (record.status === "online") {
    return "success";
  }

  if (record.eligibility === "pending") {
    return "info";
  }

  return "neutral";
}

// Never fall back to the task ID: drivers cannot use it, and callers show
// their own Chinese fallback when there is no address yet.
function formatTaskHeadline(task: UnifiedDriverTaskView): string | null {
  return task.dropoffSummary ?? task.pickupSummary ?? null;
}

function getTaskPlatformLabel(task: UnifiedDriverTaskView) {
  return task.platformDisplayName?.trim() || UNKNOWN_PLATFORM_NAME;
}

function formatTaskRouteSummary(task: UnifiedDriverTaskView) {
  if (task.pickupSummary && task.dropoffSummary) {
    return `${task.pickupSummary} → ${task.dropoffSummary}`;
  }

  return task.pickupSummary ?? task.dropoffSummary ?? "開啟任務查看完整路線";
}

function formatTaskActionSummary(task: UnifiedDriverTaskView) {
  if (task.allowedActions.length > 0) {
    return `可執行 ${task.allowedActions.map(getActionLabel).join(" / ")}`;
  }

  if (task.blockingReason?.trim()) {
    return task.blockingReason.trim();
  }

  if (hasUnifiedTaskSyncIssue(task)) {
    return task.syncIssueSummary?.trim() ?? "需由派車台協助確認";
  }

  return "目前無可直接操作的任務動作";
}

function createEmptyStateEnvelope(
  reason: EmptyReason,
  action?: WorkspaceActionModel,
): EmptyStateEnvelope {
  return {
    reason,
    messageCode: `driver.workspace.${reason}`,
    nextAction: action?.descriptor,
  };
}

function getTaskActionRoute(task: UnifiedDriverTaskView): WorkspaceRoute {
  if (task.driverActionState === "in_progress") {
    return "/trip";
  }

  return "/jobs";
}

function getTaskOpenAction(task: UnifiedDriverTaskView): WorkspaceActionModel {
  return withSubject(
    createWorkspaceAction(
      getTaskActionRoute(task),
      task.driverActionState === "in_progress" ? "return_to_trip" : "open_jobs",
    ),
    `task:${task.taskId}`,
  );
}

function getTaskActionRiskLevel(
  action: DriverTaskAction,
): ResourceActionDescriptor["riskLevel"] {
  switch (action) {
    case "accept":
    case "reject":
    case "complete":
      return "medium";
    default:
      return "low";
  }
}

function getTaskAvailableActions(task: UnifiedDriverTaskView) {
  const taskActions = task.allowedActions.map((action) =>
    withSubject(
      createWorkspaceAction(
        getTaskActionRoute(task),
        action,
        true,
        undefined,
        getTaskActionRiskLevel(action),
      ),
      `task:${task.taskId}`,
    ),
  );

  return dedupeActions([
    ...taskActions,
    getTaskOpenAction(task),
    createWorkspaceAction("/platform-presence", "open_platform_presence"),
  ]);
}

function getPrimaryTaskAction(
  task: UnifiedDriverTaskView,
): WorkspaceActionModel {
  return getTaskAvailableActions(task)[0] ?? getTaskOpenAction(task);
}

function getSecondaryTaskAction(
  task: UnifiedDriverTaskView,
  primaryAction: WorkspaceActionModel,
): WorkspaceActionModel {
  return (
    getTaskAvailableActions(task).find(
      (candidate) =>
        !(
          candidate.route === primaryAction.route &&
          candidate.descriptor.action === primaryAction.descriptor.action
        ),
    ) ?? createWorkspaceAction("/platform-presence", "open_platform_presence")
  );
}

function dedupeActions(actions: WorkspaceActionModel[]) {
  const seen = new Set<string>();
  return actions.filter((action) => {
    const key = `${action.route}:${action.descriptor.action}`;
    if (seen.has(key)) {
      return false;
    }
    seen.add(key);
    return true;
  });
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

  const [tasksResult, platformResult, shiftFlagResult, notificationsResult] =
    await Promise.allSettled([
      loadTaskViews(),
      client.getPlatformPresence(),
      client.isFeatureEnabled("driver-app.shift"),
      client.getList<NotificationRecord>(
        "/api/driver/platform-notices/notifications",
      ),
    ]);

  const next: WorkspaceLoadResult = {
    ...INITIAL_WORKSPACE,
    loadedAt: new Date().toISOString(),
  };

  if (tasksResult.status === "fulfilled") {
    next.taskViews = tasksResult.value.tasks;
    next.taskFallbackMode = tasksResult.value.fallbackMode;

    next.orderMap = await loadDriverOrderSummaries(
      client,
      tasksResult.value.tasks,
    );
  } else {
    next.taskLoadError = describeTaskLoadError(tasksResult.reason);
  }

  // Platform and notification failures are shown as fixed copy: the raw
  // error text can be English or an HTTP status, which drivers cannot use.
  if (platformResult.status === "fulfilled") {
    next.platformSummary = platformResult.value;
  } else {
    next.platformLoadError = "平台狀態暫時無法更新，請稍後再試。";
  }

  if (notificationsResult.status === "fulfilled") {
    next.notifications = notificationsResult.value;
  } else {
    next.notificationLoadError = "通知暫時無法載入，請稍後再試。";
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

function HeaderActionButton({
  iconName,
  onPress,
  danger = false,
  withDot = false,
  label,
}: {
  iconName: keyof typeof Ionicons.glyphMap;
  onPress: () => void;
  danger?: boolean;
  withDot?: boolean;
  label: string;
}) {
  return (
    <Pressable
      accessibilityRole="button"
      accessibilityLabel={label}
      onPress={onPress}
      style={({ pressed }) => [
        styles.headerActionButton,
        danger ? styles.headerActionButtonDanger : null,
        pressed ? styles.headerActionButtonPressed : null,
      ]}
    >
      <Ionicons
        name={iconName}
        size={18}
        color={danger ? THEME.danger : THEME.text}
      />
      {withDot ? <View style={styles.headerActionDot} /> : null}
    </Pressable>
  );
}

// The workspace is always read live from the server (this screen keeps no
// offline copy), so the line only says when it was last updated.
function RefreshStamp({ loadedAt }: { loadedAt: string | null }) {
  return (
    <Text style={styles.refreshLabel}>
      {loadedAt ? `更新於 ${formatTaiwanClock(loadedAt)}` : "尚未更新"}
    </Text>
  );
}

function HeroActionCard({
  model,
  onPrimaryPress,
  onSecondaryPress,
}: {
  model: HeroActionModel;
  onPrimaryPress: () => void;
  onSecondaryPress: () => void;
}) {
  const accentPalette =
    model.tone === "warn"
      ? {
          bg: THEME.warnBg,
          border: THEME.warnBorder,
          title: THEME.warn,
          button: THEME.warn,
        }
      : model.tone === "danger"
        ? {
            bg: THEME.dangerBg,
            border: THEME.dangerBorder,
            title: THEME.danger,
            button: THEME.danger,
          }
        : model.tone === "info"
          ? {
              bg: THEME.infoBg,
              border: THEME.infoBorder,
              title: THEME.info,
              button: THEME.info,
            }
          : {
              bg: THEME.accentBg,
              border: THEME.accentBorder,
              title: "#FFFFFF",
              button: THEME.accent,
            };

  return (
    <Card
      theme={THEME}
      padding={0}
      style={[
        styles.heroCard,
        {
          backgroundColor: accentPalette.bg,
          borderColor: accentPalette.border,
        },
      ]}
    >
      <View style={styles.heroSurface}>
        <View style={styles.heroGlowLarge} />
        <View style={styles.heroGlowSmall} />
        <View style={styles.heroEyebrowRow}>
          <View style={styles.heroEyebrowDot} />
          <Text style={styles.heroEyebrow}>{model.eyebrow}</Text>
        </View>
        <Text style={[styles.heroTitle, { color: accentPalette.title }]}>
          {model.title}
        </Text>
        <Text style={styles.heroDetail}>{model.detail}</Text>
        {model.meta ? <Text style={styles.heroMeta}>{model.meta}</Text> : null}
        {model.primaryAction.descriptor.enabled ? null : (
          <Text style={styles.heroDisabledHint}>
            {getActionDisabledReason(
              model.primaryAction.descriptor.disabledReasonCode,
            )}
          </Text>
        )}
        <View style={styles.heroActionRow}>
          <Btn
            theme={THEME}
            variant="primary"
            size="md"
            onPress={onPrimaryPress}
            disabled={!model.primaryAction.descriptor.enabled}
            style={[
              styles.heroPrimaryButton,
              { backgroundColor: accentPalette.button },
            ]}
          >
            {getActionLabel(model.primaryAction.descriptor.action)}
          </Btn>
          {model.secondaryAction ? (
            <Btn
              theme={THEME}
              variant="secondary"
              size="md"
              onPress={onSecondaryPress}
              disabled={!model.secondaryAction.descriptor.enabled}
              style={styles.heroSecondaryButton}
            >
              {getActionLabel(model.secondaryAction.descriptor.action)}
            </Btn>
          ) : null}
        </View>
      </View>
    </Card>
  );
}

function FocusEmptyStateCard({
  state,
  showAction,
  onPress,
}: {
  state: EmptyStateModel;
  showAction: boolean;
  onPress: () => void;
}) {
  const palette =
    state.tone === "danger"
      ? {
          icon: THEME.danger,
          bg: THEME.dangerBg,
          border: THEME.dangerBorder,
        }
      : state.tone === "warn"
        ? {
            icon: THEME.warn,
            bg: THEME.warnBg,
            border: THEME.warnBorder,
          }
        : state.tone === "info"
          ? {
              icon: THEME.info,
              bg: THEME.infoBg,
              border: THEME.infoBorder,
            }
          : {
              icon: THEME.accent,
              bg: THEME.accentBg,
              border: THEME.accentBorder,
            };
  const iconName =
    state.envelope.reason === "permission_denied"
      ? "shield-outline"
      : state.envelope.reason === "fetch_failed"
        ? "cloud-offline-outline"
        : state.envelope.reason === "external_unavailable"
          ? "warning-outline"
          : state.envelope.reason === "driver_not_eligible"
            ? "ban-outline"
            : state.envelope.reason === "not_provisioned"
              ? "link-outline"
              : state.envelope.reason === "filtered_empty"
                ? "sparkles-outline"
                : "moon-outline";

  return (
    <Card
      theme={THEME}
      padding={14}
      style={[
        styles.emptyStateCard,
        { backgroundColor: palette.bg, borderColor: palette.border },
      ]}
    >
      <View style={styles.emptyStateHeader}>
        <View
          style={[
            styles.emptyStateIconWrap,
            { backgroundColor: `${palette.icon}22` },
          ]}
        >
          <Ionicons name={iconName} size={18} color={palette.icon} />
        </View>
        <View style={styles.emptyStateCopy}>
          <Text style={styles.emptyStateTitle}>{state.title}</Text>
          <Text style={styles.emptyStateBody}>{state.body}</Text>
        </View>
      </View>
      {showAction ? (
        <View style={styles.emptyStateFooter}>
          <Btn
            theme={THEME}
            variant="secondary"
            size="sm"
            disabled={!state.action.descriptor.enabled}
            onPress={onPress}
          >
            {getActionLabel(state.action.descriptor.action)}
          </Btn>
        </View>
      ) : null}
      {showAction && !state.action.descriptor.enabled ? (
        <Text style={styles.emptyStateDisabledHint}>
          {getActionDisabledReason(state.action.descriptor.disabledReasonCode)}
        </Text>
      ) : null}
    </Card>
  );
}

function UrgentSignalCard({
  item,
  showAction,
  onPress,
}: {
  item: UrgentItem;
  showAction: boolean;
  onPress: () => void;
}) {
  const palette =
    item.tone === "danger"
      ? {
          icon: THEME.danger,
          bg: THEME.dangerBg,
          border: THEME.dangerBorder,
        }
      : item.tone === "warn"
        ? {
            icon: THEME.warn,
            bg: THEME.warnBg,
            border: THEME.warnBorder,
          }
        : {
            icon: THEME.info,
            bg: THEME.infoBg,
            border: THEME.infoBorder,
          };

  return (
    <Card
      theme={THEME}
      padding={14}
      style={[
        styles.urgentCard,
        { backgroundColor: palette.bg, borderColor: palette.border },
      ]}
    >
      <View style={styles.urgentRow}>
        <View
          style={[
            styles.urgentIconWrap,
            { backgroundColor: `${palette.icon}22` },
          ]}
        >
          <Ionicons name={item.iconName} size={16} color={palette.icon} />
        </View>
        <View style={styles.urgentCopy}>
          <Text style={[styles.urgentTitle, { color: palette.icon }]}>
            {item.title}
          </Text>
          <Text style={styles.urgentBody}>{item.body}</Text>
        </View>
        {showAction ? (
          <Btn theme={THEME} variant="secondary" size="sm" onPress={onPress}>
            {getActionLabel(item.action.descriptor.action)}
          </Btn>
        ) : null}
      </View>
    </Card>
  );
}

function PlatformHealthCard({
  rows,
  onlineCount,
  totalCount,
  reauthCount,
  degradedCount,
  forwardedPendingCount,
  onPress,
}: {
  rows: PlatformWorkspaceRow[];
  onlineCount: number;
  totalCount: number;
  reauthCount: number;
  degradedCount: number;
  forwardedPendingCount: number;
  onPress: () => void;
}) {
  // Only counts above zero get a pill; a row of "0" pills says nothing.
  const summaryPills = [
    {
      key: "reauth",
      tone: "warn" as const,
      label: "重新授權",
      count: reauthCount,
    },
    {
      key: "unstable",
      tone: "warn" as const,
      label: "連線不穩",
      count: degradedCount,
    },
    {
      key: "forwarded-pending",
      tone: "info" as const,
      label: "待平台確認",
      count: forwardedPendingCount,
    },
  ].filter((pill) => pill.count > 0);

  return (
    <View style={styles.sectionBlock}>
      <View style={styles.sectionHeader}>
        <View>
          <Text style={styles.sectionEyebrow}>平台</Text>
          <Text style={styles.sectionTitle}>
            在線 {onlineCount}／{totalCount}
          </Text>
        </View>
      </View>
      <Card theme={THEME} padding={14}>
        {summaryPills.length > 0 ? (
          <View style={styles.platformSummaryRow}>
            {summaryPills.map((pill) => (
              <Pill key={pill.key} theme={THEME} tone={pill.tone} dot>
                {`${pill.label} ${pill.count}`}
              </Pill>
            ))}
          </View>
        ) : null}
        <View style={styles.platformList}>
          {rows.map((row) => (
            <Pressable
              key={row.key}
              accessibilityRole="button"
              accessibilityLabel={`${row.name} 平台摘要`}
              onPress={onPress}
              style={({ pressed }) => [
                styles.platformRow,
                pressed ? styles.tilePressed : null,
              ]}
            >
              <View style={styles.platformRowCopy}>
                <View style={styles.platformRowHeadline}>
                  <Text style={styles.platformRowName}>{row.name}</Text>
                  {row.forwarded ? (
                    <Pill theme={THEME} tone="info">
                      外部
                    </Pill>
                  ) : (
                    <Pill theme={THEME} tone="accent">
                      自營
                    </Pill>
                  )}
                </View>
                <Text style={styles.platformRowSummary}>{row.summary}</Text>
                <Text style={styles.platformRowMeta}>{row.meta}</Text>
              </View>
              <Pill theme={THEME} tone={row.tone} dot>
                {row.tone === "success"
                  ? "在線"
                  : row.tone === "warn"
                    ? "注意"
                    : row.tone === "danger"
                      ? "不可用"
                      : row.tone === "info"
                        ? "待審"
                        : "離線"}
              </Pill>
            </Pressable>
          ))}
        </View>
      </Card>
    </View>
  );
}

function DeepLinkTile({
  model,
  onPress,
}: {
  model: DeepLinkTileModel;
  onPress: () => void;
}) {
  const tone = model.tone ?? "accent";
  const palette =
    tone === "danger"
      ? { fg: THEME.danger, bg: THEME.dangerBg }
      : tone === "info"
        ? { fg: THEME.info, bg: THEME.infoBg }
        : tone === "warn"
          ? { fg: THEME.warn, bg: THEME.warnBg }
          : { fg: THEME.accent, bg: THEME.accentBg };

  return (
    <Pressable
      accessibilityRole="button"
      accessibilityLabel={model.label}
      disabled={!model.action.descriptor.enabled}
      onPress={model.action.descriptor.enabled ? onPress : undefined}
      style={({ pressed }) => [
        styles.deepLinkTileWrap,
        !model.action.descriptor.enabled ? styles.tileDisabled : null,
        pressed ? styles.tilePressed : null,
      ]}
    >
      <Card theme={THEME} padding={14}>
        <View style={styles.deepLinkTileRow}>
          <View
            style={[styles.deepLinkIconWrap, { backgroundColor: palette.bg }]}
          >
            <Ionicons name={model.iconName} size={17} color={palette.fg} />
          </View>
          <View style={styles.deepLinkCopy}>
            <Text style={styles.deepLinkLabel}>{model.label}</Text>
            <Text style={styles.deepLinkHelper}>{model.helper}</Text>
          </View>
        </View>
      </Card>
    </Pressable>
  );
}

function ActiveTripSummaryCard({
  model,
  showPrimary,
  showSecondary,
  onPrimaryPress,
  onSecondaryPress,
}: {
  model: ActiveTripCardModel;
  showPrimary: boolean;
  showSecondary: boolean;
  onPrimaryPress: () => void;
  onSecondaryPress: () => void;
}) {
  return (
    <Card theme={THEME} padding={14} style={styles.activeTripCard}>
      <View style={styles.sectionHeader}>
        <View>
          <Text style={styles.sectionEyebrow}>目前行程</Text>
          <Text style={styles.sectionTitle}>{model.title}</Text>
        </View>
        <Pill theme={THEME} tone="accent" dot>
          {model.platformLabel}
        </Pill>
      </View>
      <Text style={styles.sectionBody}>{model.routeSummary}</Text>
      <View style={styles.activeTripMetaRow}>
        <Pill theme={THEME} tone="info">
          {model.fareLabel}
        </Pill>
        <Text style={styles.platformRowMeta}>{model.meta}</Text>
      </View>
      {showPrimary || showSecondary ? (
        <View style={styles.activeTripActionRow}>
          {showPrimary ? (
            <Btn
              theme={THEME}
              variant="primary"
              size="sm"
              onPress={onPrimaryPress}
            >
              {getActionLabel(model.primaryAction.descriptor.action)}
            </Btn>
          ) : null}
          {showSecondary ? (
            <Btn
              theme={THEME}
              variant="secondary"
              size="sm"
              onPress={onSecondaryPress}
            >
              {getActionLabel(model.secondaryAction.descriptor.action)}
            </Btn>
          ) : null}
        </View>
      ) : null}
    </Card>
  );
}

function NotificationInboxCard({
  items,
  expanded,
  loading,
  error,
  onToggle,
  onOpen,
  onMarkRead,
  onMarkAllRead,
}: {
  items: NotificationCardModel[];
  expanded: boolean;
  loading: boolean;
  error: string | null;
  onToggle: () => void;
  onOpen: (route: WorkspaceRoute) => void;
  onMarkRead: (notificationId: string) => void;
  onMarkAllRead: () => void;
}) {
  const unreadCount = items.filter((item) => item.readAt === null).length;

  return (
    <View style={styles.sectionBlock}>
      <Pressable
        accessibilityRole="button"
        onPress={onToggle}
        style={({ pressed }) => [pressed ? styles.tilePressed : null]}
      >
        <Card theme={THEME} padding={14}>
          <View style={styles.sectionHeader}>
            <View>
              <Text style={styles.sectionEyebrow}>通知</Text>
              <Text style={styles.sectionTitle}>
                {unreadCount > 0 ? `${unreadCount} 則待讀通知` : "通知已清空"}
              </Text>
            </View>
            <Pill theme={THEME} tone={unreadCount > 0 ? "warn" : "neutral"} dot>
              {expanded ? "收合" : "展開"}
            </Pill>
          </View>
          {error ? <Text style={styles.sectionBody}>{error}</Text> : null}
        </Card>
      </Pressable>

      {expanded ? (
        <Card theme={THEME} padding={14}>
          <View style={styles.notificationActionRow}>
            <Btn
              theme={THEME}
              variant="secondary"
              size="sm"
              disabled={loading || unreadCount === 0}
              onPress={onMarkAllRead}
            >
              全部標記已讀
            </Btn>
          </View>
          <View style={styles.notificationList}>
            {items.length === 0 ? (
              <Text style={styles.sectionBody}>目前沒有通知。</Text>
            ) : (
              items.map((item) => (
                <View key={item.notificationId} style={styles.notificationRow}>
                  <View style={styles.notificationLead}>
                    <View
                      style={[
                        styles.notificationIconWrap,
                        {
                          backgroundColor:
                            item.tone === "danger"
                              ? THEME.dangerBg
                              : item.tone === "warn"
                                ? THEME.warnBg
                                : THEME.infoBg,
                        },
                      ]}
                    >
                      <Ionicons
                        name={item.iconName}
                        size={16}
                        color={
                          item.tone === "danger"
                            ? THEME.danger
                            : item.tone === "warn"
                              ? THEME.warn
                              : THEME.info
                        }
                      />
                    </View>
                    <View style={styles.notificationCopy}>
                      <View style={styles.notificationHeadline}>
                        <Text style={styles.notificationTitle}>
                          {item.title}
                        </Text>
                        <Pill
                          theme={THEME}
                          tone={item.readAt === null ? item.tone : "neutral"}
                          dot
                        >
                          {item.readAt === null ? "未讀" : "已讀"}
                        </Pill>
                      </View>
                      <Text style={styles.notificationBody}>{item.body}</Text>
                      <Text style={styles.platformRowMeta}>
                        {formatCompactDateTime(item.createdAt)}
                      </Text>
                    </View>
                  </View>
                  <View style={styles.notificationButtons}>
                    {item.route ? (
                      <Btn
                        theme={THEME}
                        variant="ghost"
                        size="xs"
                        onPress={() => item.route && onOpen(item.route)}
                      >
                        開啟
                      </Btn>
                    ) : null}
                    <Btn
                      theme={THEME}
                      variant="secondary"
                      size="xs"
                      disabled={loading || item.readAt !== null}
                      onPress={() => onMarkRead(item.notificationId)}
                    >
                      已讀
                    </Btn>
                  </View>
                </View>
              ))
            )}
          </View>
        </Card>
      ) : null}
    </View>
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
  const [notificationPanelOpen, setNotificationPanelOpen] = useState(false);
  const [markingNotificationsRead, setMarkingNotificationsRead] =
    useState(false);
  const notificationReadRequest = useRef<AbortController | null>(null);
  const [dismissedSosNotificationIds, setDismissedSosNotificationIds] =
    useState<string[]>([]);

  useEffect(() => {
    let cancelled = false;

    void initializeDriverIdentity()
      .catch((error: unknown) => {
        if (cancelled) {
          return;
        }

        setIdentityIssue(
          formatDriverError(error, "裝置初始化失敗，請稍後再試。"),
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
    const unregister = registerProtectedCacheClearHandler(() => {
      notificationReadRequest.current?.abort();
      notificationReadRequest.current = null;
      setMarkingNotificationsRead(false);
      setWorkspace(INITIAL_WORKSPACE);
      setProvisioned(false);
    });
    return () => {
      notificationReadRequest.current?.abort();
      notificationReadRequest.current = null;
      unregister();
    };
  }, []);

  useEffect(() => {
    if (!ready || !provisioned) {
      return;
    }

    const refreshIntervalMs = getRefreshTierIntervalMs(WORKSPACE_REFRESH_TIER);
    if (refreshIntervalMs === null) {
      return;
    }

    const timer = setInterval(() => {
      setRefreshSeed((current) => current + 1);
    }, refreshIntervalMs);

    return () => clearInterval(timer);
  }, [provisioned, ready]);

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
          taskLoadError: describeTaskLoadError(error),
          platformLoadError: "平台狀態暫時無法更新，請稍後再試。",
          loadedAt: new Date().toISOString(),
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
  const navigateTo = (route: WorkspaceRoute) => router.push(route);

  const isDriverOnShift = workspace.activeShift !== null;
  const taskSummary = useMemo(
    () => summarizeWorkspaceTasks(workspace.taskViews),
    [workspace.taskViews],
  );
  const externalPresences = workspace.platformSummary?.presences ?? [];
  const adapterStatuses = workspace.platformSummary?.adapterStatuses ?? [];
  const adapterStatusByCode = useMemo(
    () =>
      adapterStatuses.reduce<
        Partial<Record<string, PlatformPresenceAdapterStatusRecord>>
      >((map, status) => {
        map[status.platformCode] = status;
        return map;
      }, {}),
    [adapterStatuses],
  );
  const reauthPlatforms = useMemo(
    () => externalPresences.filter((record) => record.reauthRequired),
    [externalPresences],
  );

  const platformRows = useMemo(() => {
    const ownedRow: PlatformWorkspaceRow = {
      key: "owned-drts",
      name: "自營派單",
      summary: isDriverOnShift
        ? `已上線 · ${formatClockLabel(workspace.activeShift?.clockedInAt)} 起`
        : "離線 · 尚未上班",
      meta: workspace.shiftLoadError
        ? "班次同步延遲"
        : workspace.shiftFeatureEnabled
          ? `班次 ${formatShiftDuration(workspace.activeShift)}`
          : "班次功能未啟用",
      tone: isDriverOnShift ? "success" : "neutral",
      forwarded: false,
    };

    const forwardedRows = externalPresences
      .map<PlatformWorkspaceRow>((record) => {
        const adapter = adapterStatusByCode[record.platformCode];
        const latestAt =
          record.status === "online"
            ? record.lastOnlineAt
            : record.lastOfflineAt;
        return {
          key: `platform-${record.platformCode}`,
          name: getPlatformName(record.platformCode),
          summary: record.reauthRequired
            ? "需重新授權"
            : record.eligibility === "pending"
              ? "資格待審核"
              : record.eligibility === "ineligible"
                ? "目前不可接該平台任務"
                : `${
                    record.status === "online" ? "已上線" : "離線"
                  } · ${formatClockLabel(latestAt ?? record.updatedAt)}`,
          meta:
            adapter?.status === "degraded" || adapter?.status === "down"
              ? "平台連線不穩"
              : `更新於 ${formatCompactDateTime(record.updatedAt)}`,
          tone: getPlatformTone(record, adapter),
          forwarded: true,
        };
      })
      .sort((left, right) => {
        const weight = (tone: CanvasTone) => {
          switch (tone) {
            case "danger":
              return 4;
            case "warn":
              return 3;
            case "info":
              return 2;
            case "success":
              return 1;
            default:
              return 0;
          }
        };

        return (
          weight(right.tone) - weight(left.tone) ||
          left.name.localeCompare(right.name, "zh-TW")
        );
      });

    return [ownedRow, ...forwardedRows];
  }, [
    adapterStatusByCode,
    externalPresences,
    isDriverOnShift,
    workspace.activeShift,
    workspace.shiftFeatureEnabled,
    workspace.shiftLoadError,
  ]);

  const onlinePlatformCount = useMemo(
    () =>
      externalPresences.filter(
        (record) => record.status === "online" && !record.reauthRequired,
      ).length + (isDriverOnShift ? 1 : 0),
    [externalPresences, isDriverOnShift],
  );

  const degradedPlatformCount = useMemo(
    () =>
      externalPresences.filter((record) => {
        const adapter = adapterStatusByCode[record.platformCode];
        return adapter?.status === "degraded" || adapter?.status === "down";
      }).length,
    [adapterStatusByCode, externalPresences],
  );

  // Quoted fares of trips completed today (Taiwan time). This is an
  // estimate, not net or settled earnings; the earnings tab owns those.
  const todayFareEstimate = useMemo(() => {
    const now = new Date();
    const completedTodayTasks = taskSummary.orderedTasks.filter(
      (task) =>
        task.driverActionState === "completed" &&
        isSameTaiwanDay(task.updatedAt, now),
    );
    const quotedFares = completedTodayTasks
      .map((task) => workspace.orderMap[task.orderId]?.quotedFare ?? null)
      .filter((fare) => fare !== null);

    // Only trips with a known fare are counted, so the trip count matches
    // the amount next to it; without any known fare there is nothing to show.
    return {
      pricedTripCount: quotedFares.length,
      hasFare: quotedFares.length > 0,
      amount: sumMoneyAmounts(quotedFares),
    };
  }, [taskSummary.orderedTasks, workspace.orderMap]);

  const focusEmptyState = useMemo<EmptyStateModel | null>(() => {
    if (workspace.taskLoadError && workspace.taskViews.length === 0) {
      const reason = classifyErrorReason(workspace.taskLoadError);
      return {
        tone: reason === "permission_denied" ? "warn" : "danger",
        title: reason === "permission_denied" ? "權限不足" : "資料讀取失敗",
        // taskLoadError is already one of two fixed sentences.
        body: workspace.taskLoadError,
        action: createWorkspaceAction(
          "/settings",
          "open_settings",
          true,
          undefined,
          "medium",
        ),
        envelope: createEmptyStateEnvelope(
          reason,
          createWorkspaceAction(
            "/settings",
            "open_settings",
            true,
            undefined,
            "medium",
          ),
        ),
      };
    }

    if (
      workspace.platformSummary === null &&
      workspace.platformLoadError &&
      !workspace.taskLoadError
    ) {
      return {
        tone: "warn",
        title: "外部平台暫時不可用",
        body: workspace.platformLoadError,
        action: createWorkspaceAction(
          "/platform-presence",
          "open_platform_presence",
          true,
          undefined,
          "medium",
        ),
        envelope: createEmptyStateEnvelope(
          "external_unavailable",
          createWorkspaceAction(
            "/platform-presence",
            "open_platform_presence",
            true,
            undefined,
            "medium",
          ),
        ),
      };
    }

    if (
      externalPresences.length > 0 &&
      onlinePlatformCount === 0 &&
      degradedPlatformCount === externalPresences.length &&
      !taskSummary.activeTripTask &&
      !taskSummary.actionRequiredTask
    ) {
      return {
        tone: "warn",
        title: "平台連線不穩",
        body: "所有平台目前連線異常，請到平台頁查看。",
        action: createWorkspaceAction(
          "/platform-presence",
          "open_platform_presence",
          true,
          undefined,
          "medium",
        ),
        envelope: createEmptyStateEnvelope(
          "external_unavailable",
          createWorkspaceAction(
            "/platform-presence",
            "open_platform_presence",
            true,
            undefined,
            "medium",
          ),
        ),
      };
    }

    if (externalPresences.length === 0) {
      return {
        tone: "info",
        title: "尚未綁定平台帳號",
        body: "目前只有自營派單資訊，若要接收外部平台任務，請先完成平台綁定與授權。",
        action: createWorkspaceAction(
          "/platform-presence",
          "manage_platform_binding",
          true,
          undefined,
          "medium",
        ),
        envelope: createEmptyStateEnvelope(
          "not_provisioned",
          createWorkspaceAction(
            "/platform-presence",
            "manage_platform_binding",
            true,
            undefined,
            "medium",
          ),
        ),
      };
    }

    if (
      externalPresences.length > 0 &&
      externalPresences.every((record) => record.eligibility === "ineligible")
    ) {
      return {
        tone: "danger",
        title: "目前不具備接單資格",
        body: "所有外部平台都回報司機資格不符。請先前往平台頁檢查授權、資格或由派車台協助排除。",
        action: createWorkspaceAction(
          "/platform-presence",
          "review_eligibility",
          true,
          undefined,
          "medium",
        ),
        envelope: createEmptyStateEnvelope(
          "driver_not_eligible",
          createWorkspaceAction(
            "/platform-presence",
            "review_eligibility",
            true,
            undefined,
            "medium",
          ),
        ),
      };
    }

    if (
      taskSummary.pendingCount === 0 &&
      taskSummary.orderedTasks.length === 0 &&
      onlinePlatformCount > 0
    ) {
      return {
        tone: "info",
        title: "目前沒有新任務",
        body: "工作台已待命。保持平台在線與班次正常，新的派單或平台任務會優先出現在這裡。",
        action: createWorkspaceAction("/jobs", "open_jobs"),
        envelope: createEmptyStateEnvelope(
          "no_data",
          createWorkspaceAction("/jobs", "open_jobs"),
        ),
      };
    }

    if (
      taskSummary.pendingCount === 0 &&
      taskSummary.orderedTasks.length > 0 &&
      !taskSummary.activeTripTask &&
      !taskSummary.actionRequiredTask
    ) {
      return {
        tone: "info",
        title: "目前沒有需立即處理的項目",
        body: "目前沒有需要優先處理的任務，您可以查看今日收入、班次或維持平台在線待命。",
        action: createWorkspaceAction("/earnings", "open_earnings"),
        envelope: createEmptyStateEnvelope(
          "filtered_empty",
          createWorkspaceAction("/earnings", "open_earnings"),
        ),
      };
    }

    return null;
  }, [
    externalPresences,
    onlinePlatformCount,
    degradedPlatformCount,
    taskSummary.activeTripTask,
    taskSummary.actionRequiredTask,
    taskSummary.orderedTasks.length,
    taskSummary.pendingCount,
    workspace.platformLoadError,
    workspace.platformSummary,
    workspace.taskLoadError,
    workspace.taskViews.length,
  ]);

  const urgentItems = useMemo(() => {
    const items: UrgentItem[] = [];

    for (const platform of reauthPlatforms) {
      const name = getPlatformName(platform.platformCode);

      items.push({
        key: `reauth-${platform.platformCode}`,
        tone: "warn",
        title: `${name} 需重新授權`,
        body: `授權已過期 · 更新於 ${formatCompactDateTime(platform.updatedAt)}`,
        action: withSubject(
          createWorkspaceAction(
            "/platform-presence",
            "resolve_reauth",
            true,
            undefined,
            "medium",
          ),
          `platform:${platform.platformCode}`,
        ),
        iconName: "lock-closed-outline",
      });
    }

    if (taskSummary.actionRequiredTask) {
      const headline = formatTaskHeadline(taskSummary.actionRequiredTask);
      items.push({
        key: `urgent-${taskSummary.actionRequiredTask.taskId}`,
        tone: "info",
        title: headline ? `任務待回應 · ${headline}` : "任務待回應",
        body: formatTaskActionSummary(taskSummary.actionRequiredTask),
        action: getPrimaryTaskAction(taskSummary.actionRequiredTask),
        iconName: "timer-outline",
      });
    }

    if (
      taskSummary.syncIssueTask &&
      !isOwnedUnifiedTask(taskSummary.syncIssueTask)
    ) {
      items.push({
        key: `sync-${taskSummary.syncIssueTask.taskId}`,
        tone: "danger",
        title: `${taskSummary.syncIssueTask.platformDisplayName} 同步異常`,
        body:
          taskSummary.syncIssueTask.syncIssueSummary?.trim() ||
          "外部平台回傳狀態異常，需要派車台協助確認。",
        action: getTaskOpenAction(taskSummary.syncIssueTask),
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
        key: "off-shift-pending",
        tone: "info",
        title: "尚未上班",
        body: "仍有待處理任務，但自營派單尚未切成可接單狀態。",
        action: createWorkspaceAction("/shift", "open_shift"),
        iconName: "time-outline",
      });
    }

    return items.slice(0, 3);
  }, [
    isDriverOnShift,
    reauthPlatforms,
    taskSummary.actionRequiredTask,
    taskSummary.pendingCount,
    taskSummary.syncIssueTask,
    workspace.shiftFeatureEnabled,
    workspace.shiftLoadError,
  ]);

  const notificationItems = useMemo<NotificationCardModel[]>(
    () =>
      workspace.notifications
        .map((notification) => ({
          notificationId: notification.notificationId,
          title: notification.title,
          body: notification.message,
          createdAt: notification.createdAt,
          readAt: notification.readAt,
          tone: getNotificationTone(notification),
          route: getNotificationRoute(notification),
          iconName: getNotificationIconName(notification),
          persistent: isSosNotification(notification),
        }))
        .sort((left, right) => {
          const unreadWeight = left.readAt === null ? -1 : 1;
          const rightUnreadWeight = right.readAt === null ? -1 : 1;
          return (
            unreadWeight - rightUnreadWeight ||
            Date.parse(right.createdAt) - Date.parse(left.createdAt)
          );
        }),
    [workspace.notifications],
  );

  const persistentSosNotification = useMemo(
    () =>
      notificationItems.find(
        (item) =>
          item.persistent &&
          !dismissedSosNotificationIds.includes(item.notificationId),
      ) ?? null,
    [dismissedSosNotificationIds, notificationItems],
  );

  const heroAction = useMemo<HeroActionModel>(() => {
    if (reauthPlatforms.length > 0) {
      const platform = reauthPlatforms[0];
      const name = getPlatformName(platform.platformCode);

      return {
        state: "reauth",
        tone: "warn",
        eyebrow: "建議動作",
        title: `先恢復 ${name} 授權`,
        detail: "任何需重新授權的平台都應優先處理，否則該平台接單能力暫停。",
        meta: `更新於 ${formatCompactDateTime(platform.updatedAt)}`,
        primaryAction: withSubject(
          createWorkspaceAction(
            "/platform-presence",
            "resolve_reauth",
            true,
            undefined,
            "medium",
          ),
          `platform:${platform.platformCode}`,
        ),
        secondaryAction: createWorkspaceAction("/jobs", "open_jobs"),
      };
    }

    if (taskSummary.actionRequiredTask) {
      const task = taskSummary.actionRequiredTask;
      const primaryAction = getPrimaryTaskAction(task);
      const secondaryAction = getSecondaryTaskAction(task, primaryAction);
      const headline = formatTaskHeadline(task);
      return {
        state: "urgent_task",
        tone: "info",
        eyebrow: "建議動作",
        title: headline ? `優先回應 ${headline}` : "新任務",
        detail: formatTaskRouteSummary(task),
        meta: `${task.platformDisplayName} · ${formatTaskActionSummary(task)}`,
        primaryAction,
        secondaryAction,
      };
    }

    if (taskSummary.activeTripTask) {
      const task = taskSummary.activeTripTask;
      const fareLabel = workspace.orderMap[task.orderId]?.quotedFare
        ? formatMoney(workspace.orderMap[task.orderId]?.quotedFare)
        : "車資待確認";
      const primaryAction = getPrimaryTaskAction(task);
      const secondaryAction = getSecondaryTaskAction(task, primaryAction);

      return {
        state: "trip",
        tone: "accent",
        eyebrow: "建議動作",
        title:
          task.allowedActions.length > 0
            ? `下一步：${getActionLabel(primaryAction.descriptor.action)}`
            : "返回進行中的行程",
        detail: formatTaskRouteSummary(task),
        // The trip card is hidden while the top card shows the trip, so the
        // top card carries the source platform for external trips.
        meta: [
          isOwnedUnifiedTask(task) ? null : getTaskPlatformLabel(task),
          fareLabel,
          `更新於 ${formatCompactDateTime(task.updatedAt)}`,
        ]
          .filter(Boolean)
          .join(" · "),
        primaryAction,
        secondaryAction,
      };
    }

    if (
      workspace.shiftFeatureEnabled &&
      !workspace.shiftLoadError &&
      !isDriverOnShift
    ) {
      return {
        state: "off_shift",
        tone: "accent",
        eyebrow: "建議動作",
        title: "先開始班次",
        detail: "尚未開始班次時，最優先要做的是先啟動班次。",
        meta: "班次啟動後，自營派單會切換為可接單狀態。",
        primaryAction: createWorkspaceAction("/shift", "start_shift"),
        secondaryAction: createWorkspaceAction(
          "/platform-presence",
          "open_platform_presence",
        ),
      };
    }

    if (onlinePlatformCount === 0) {
      return {
        state: "go_online",
        tone: "info",
        eyebrow: "建議動作",
        title: "讓至少一個平台上線",
        detail: "目前沒有任何平台處於可接單狀態，新的派單不會送達。",
        meta: "平台健康與帳號授權狀態都可以在平台頁處理。",
        primaryAction: createWorkspaceAction(
          "/platform-presence",
          "go_online",
          externalPresences.length > 0,
          externalPresences.length > 0 ? undefined : "no_platform_binding",
          "medium",
        ),
        // No shift button when the shift feature is off, matching the tiles.
        secondaryAction: workspace.shiftFeatureEnabled
          ? createWorkspaceAction("/shift", "open_shift")
          : null,
      };
    }

    if (taskSummary.awaitingPlatformTask) {
      return {
        state: "awaiting_platform",
        tone: "info",
        eyebrow: "建議動作",
        title: "等待平台確認",
        detail: formatTaskRouteSummary(taskSummary.awaitingPlatformTask),
        meta: "來源平台尚未回覆前，請不要提前前往接送點。",
        primaryAction: getTaskOpenAction(taskSummary.awaitingPlatformTask),
        secondaryAction: createWorkspaceAction(
          "/platform-presence",
          "open_platform_presence",
        ),
      };
    }

    return {
      state: "standing_by",
      tone: "accent",
      eyebrow: "建議動作",
      title: "工作台待命中",
      detail:
        "沒有需要立即處理的任務，保持平台在線並留意新的派單或重新授權提醒。",
      meta: "",
      primaryAction: createWorkspaceAction("/jobs", "open_jobs"),
      secondaryAction: createWorkspaceAction("/earnings", "open_earnings"),
    };
  }, [
    isDriverOnShift,
    onlinePlatformCount,
    reauthPlatforms,
    taskSummary.actionRequiredTask,
    taskSummary.activeTripTask,
    taskSummary.awaitingPlatformTask,
    workspace.orderMap,
    workspace.shiftFeatureEnabled,
    workspace.shiftLoadError,
  ]);

  const activeTripCard = useMemo<ActiveTripCardModel | null>(() => {
    if (!taskSummary.activeTripTask) {
      return null;
    }

    const task = taskSummary.activeTripTask;
    const quotedFare = workspace.orderMap[task.orderId]?.quotedFare ?? null;
    const primaryAction = getPrimaryTaskAction(task);
    const secondaryAction = getSecondaryTaskAction(task, primaryAction);
    return {
      title: formatTaskHeadline(task) ?? "進行中的行程",
      routeSummary: formatTaskRouteSummary(task),
      meta: `更新於 ${formatCompactDateTime(task.updatedAt)}`,
      fareLabel: quotedFare ? formatMoney(quotedFare) : "車資待確認",
      platformLabel: getTaskPlatformLabel(task),
      primaryAction,
      secondaryAction,
    };
  }, [taskSummary.activeTripTask, workspace.orderMap]);

  const deepLinks = useMemo<DeepLinkTileModel[]>(() => {
    const activeTripHeadline = taskSummary.activeTripTask
      ? (formatTaskHeadline(taskSummary.activeTripTask) ?? "進行中的行程")
      : null;
    const tiles: DeepLinkTileModel[] = [
      {
        iconName: "briefcase-outline",
        label: "任務收件匣",
        helper:
          taskSummary.pendingCount > 0
            ? `${taskSummary.pendingCount} 件待處理`
            : "查看全部任務",
        action: createWorkspaceAction("/jobs", "open_jobs"),
      },
      {
        iconName: "car-sport-outline",
        label: "行程",
        helper: activeTripHeadline ?? "目前沒有行程",
        action: createWorkspaceAction(
          "/trip",
          "open_trip",
          activeTripHeadline !== null,
          activeTripHeadline !== null ? undefined : "no_active_trip",
        ),
      },
      {
        iconName: "layers-outline",
        label: "平台中心",
        helper:
          reauthPlatforms.length > 0
            ? `${reauthPlatforms.length} 個平台需重新授權`
            : onlinePlatformCount > 0
              ? `${onlinePlatformCount} 個平台在線`
              : "查看平台狀態",
        action: createWorkspaceAction(
          "/platform-presence",
          "open_platform_presence",
        ),
        tone: reauthPlatforms.length > 0 ? "warn" : "accent",
      },
      {
        iconName: "cash-outline",
        label: "收入",
        helper: "查看收入明細",
        action: createWorkspaceAction("/earnings", "open_earnings"),
      },
    ];

    // A disabled shift feature has nothing to open, so no tile for it.
    if (workspace.shiftFeatureEnabled) {
      tiles.push({
        iconName: "time-outline",
        label: "班次",
        helper: formatShiftDuration(workspace.activeShift),
        action: createWorkspaceAction("/shift", "open_shift"),
      });
    }

    tiles.push({
      iconName: "settings-outline",
      label: "設定",
      helper: "裝置身份、帳號與通知設定",
      action: createWorkspaceAction("/settings", "open_settings"),
    });

    return tiles;
  }, [
    onlinePlatformCount,
    reauthPlatforms.length,
    taskSummary.activeTripTask,
    taskSummary.pendingCount,
    workspace.activeShift,
    workspace.shiftFeatureEnabled,
  ]);

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

  // The bell's dot means unread notifications only. Urgent cards and identity
  // problems already have their own cards on this screen.
  const unreadNotificationCount = notificationItems.filter(
    (item) => item.readAt === null,
  ).length;

  // A button below the top card is hidden only when the top card already
  // opens the same screen for the same subject (the same task, the same
  // platform, or the same general screen), so 查看任務 / 查看收入 do not
  // repeat down the page while a card about another task keeps its button.
  const heroSubjectKeys = new Set<string>(
    [heroAction.primaryAction, heroAction.secondaryAction]
      .filter(
        (action): action is WorkspaceActionModel =>
          action !== null && action.descriptor.enabled,
      )
      .map(getActionSubjectKey),
  );
  const repeatsHeroAction = (action: WorkspaceActionModel) =>
    heroSubjectKeys.has(getActionSubjectKey(action));
  // When the top card is already the trip, the trip card would repeat it.
  const showActiveTripCard =
    activeTripCard !== null && heroAction.state !== "trip";
  // A standing-by top card already says there is nothing to do.
  const showFocusEmptyState =
    focusEmptyState !== null &&
    !(
      heroAction.state === "standing_by" &&
      (focusEmptyState.envelope.reason === "no_data" ||
        focusEmptyState.envelope.reason === "filtered_empty")
    );

  const markNotificationsRead = async (notificationIds: string[]) => {
    const ids = [...new Set(notificationIds.filter(Boolean))];
    if (ids.length === 0 || notificationReadRequest.current) {
      return;
    }

    const request = new AbortController();
    notificationReadRequest.current = request;
    setMarkingNotificationsRead(true);
    try {
      const client = getDriverClient();
      const notices = await client.getList<WorkspaceNotice>(
        "/api/driver/platform-notices",
        { signal: request.signal },
      );
      const selected = ids.map((id) => {
        const notice = notices.find((n) => n.outcome.notificationId === id);
        if (!notice) throw new Error(NOTICE_RECEIPT_MISSING_MESSAGE);
        return notice;
      });
      for (const notice of selected) {
        if (request.signal.aborted) return;
        const ack = await client.post<WorkspaceNotice["outcome"]>(
          `/api/driver/platform-notices/${encodeURIComponent(notice.noticeId)}/read`,
          {
            body: { outcomeId: notice.outcome.outcomeId },
            signal: request.signal,
          },
        );
        if (
          !ack?.readAt ||
          ack.state !== "read" ||
          ack.outcomeId !== notice.outcome.outcomeId ||
          ack.notificationId !== notice.outcome.notificationId
        )
          throw new Error("通知已讀未獲確認，請重試。");
      }
      if (request.signal.aborted) return;
      const notifications = await client.getList<NotificationRecord>(
        "/api/driver/platform-notices/notifications",
        { signal: request.signal },
      );
      if (request.signal.aborted) return;
      if (
        ids.some(
          (id) => !notifications.find((n) => n.notificationId === id)?.readAt,
        )
      )
        throw new Error("通知已讀未獲確認，請重試。");
      setWorkspace((current) => ({
        ...current,
        notifications,
        notificationLoadError: null,
      }));
    } catch (error) {
      if (request.signal.aborted) return;
      // Only our own receipt message is specific enough to show; anything
      // else (network, HTTP status) becomes one plain sentence.
      const message =
        error instanceof Error &&
        error.message === NOTICE_RECEIPT_MISSING_MESSAGE
          ? NOTICE_RECEIPT_MISSING_MESSAGE
          : NOTICE_READ_FAILED_MESSAGE;
      setWorkspace((current) => ({
        ...current,
        notificationLoadError: message,
      }));
    } finally {
      if (notificationReadRequest.current === request) {
        notificationReadRequest.current = null;
        setMarkingNotificationsRead(false);
      }
    }
  };

  if (!ready) {
    return <LoadingState label="正在檢查裝置配置…" />;
  }

  if (!provisioned) {
    return <Redirect href="/onboarding" />;
  }

  if (
    loading &&
    workspace.platformSummary === null &&
    !workspace.taskLoadError &&
    workspace.taskViews.length === 0
  ) {
    return <LoadingState label="正在載入工作台…" />;
  }

  return (
    <Shell theme={THEME} contentContainerStyle={styles.shellContent}>
      <PlatformNoticeBanner />
      <PageHeader
        title={
          <View style={styles.headerTitleStack}>
            <Text style={styles.headerTitle}>工作台</Text>
            <Text style={styles.headerSubtitle}>掌握任務、行程與平台狀態</Text>
          </View>
        }
        subtitle={
          <View style={styles.headerMetaWrap}>
            <View style={styles.headerMetaRow}>
              <View
                style={[
                  styles.headerStatusDot,
                  {
                    backgroundColor: isDriverOnShift
                      ? THEME.success
                      : THEME.textDim,
                  },
                ]}
              />
              <Text style={styles.headerStatusText}>{headerStatusLabel}</Text>
            </View>
            <RefreshStamp loadedAt={workspace.loadedAt} />
          </View>
        }
        actions={
          <View style={styles.headerActions}>
            <HeaderActionButton
              iconName="refresh-outline"
              label="重新整理"
              onPress={() => setRefreshSeed((current) => current + 1)}
            />
            <HeaderActionButton
              iconName="notifications-outline"
              label="查看通知"
              withDot={unreadNotificationCount > 0}
              onPress={() => setNotificationPanelOpen((current) => !current)}
            />
            <HeaderActionButton
              iconName="warning-outline"
              label="開啟 SOS"
              danger
              onPress={navigate("/sos")}
            />
          </View>
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
          title="任務資料可能不完整"
          body="請到任務頁確認最新狀態。"
        />
      ) : null}

      {workspace.platformLoadError && workspace.platformSummary !== null ? (
        <Banner
          theme={THEME}
          tone="warn"
          title="平台狀態更新延遲"
          body={workspace.platformLoadError}
        />
      ) : null}

      {persistentSosNotification ? (
        <Banner
          theme={THEME}
          tone="danger"
          title={persistentSosNotification.title}
          body={persistentSosNotification.body}
          actions={
            <View style={styles.bannerActionRow}>
              <Btn
                theme={THEME}
                variant="secondary"
                size="sm"
                onPress={() => navigateTo("/sos")}
              >
                查看 SOS
              </Btn>
              <Btn
                theme={THEME}
                variant="ghost"
                size="sm"
                onPress={() =>
                  setDismissedSosNotificationIds((current) => [
                    ...current,
                    persistentSosNotification.notificationId,
                  ])
                }
              >
                關閉
              </Btn>
            </View>
          }
        />
      ) : null}

      <HeroActionCard
        model={heroAction}
        onPrimaryPress={navigate(heroAction.primaryAction.route)}
        onSecondaryPress={() => {
          if (heroAction.secondaryAction) {
            navigateTo(heroAction.secondaryAction.route);
          }
        }}
      />

      {showActiveTripCard && activeTripCard ? (
        <ActiveTripSummaryCard
          model={activeTripCard}
          showPrimary={!repeatsHeroAction(activeTripCard.primaryAction)}
          showSecondary={
            !repeatsHeroAction(activeTripCard.secondaryAction) &&
            activeTripCard.secondaryAction.route !==
              activeTripCard.primaryAction.route
          }
          onPrimaryPress={navigate(activeTripCard.primaryAction.route)}
          onSecondaryPress={navigate(activeTripCard.secondaryAction.route)}
        />
      ) : null}

      {taskSummary.pendingCount > 0 || todayFareEstimate.hasFare ? (
        <View style={styles.kpiRow}>
          {taskSummary.pendingCount > 0 ? (
            <View style={styles.kpiCell}>
              <KPI
                theme={THEME}
                label="待處理"
                value={String(taskSummary.pendingCount)}
                sub={
                  taskSummary.urgentCount > 0
                    ? `${taskSummary.urgentCount} 件需立即回應`
                    : undefined
                }
              />
            </View>
          ) : null}
          {todayFareEstimate.hasFare ? (
            <View style={styles.kpiCell}>
              <KPI
                theme={THEME}
                label="今日預估車資"
                value={`${
                  getCurrencyLabel(todayFareEstimate.amount.currency) || "NT$"
                } ${formatAmountNumber(todayFareEstimate.amount, {
                  fractionDigits: 0,
                })}`}
                sub={`已完成 ${todayFareEstimate.pricedTripCount} 趟`}
              />
            </View>
          ) : null}
        </View>
      ) : null}

      {showFocusEmptyState && focusEmptyState ? (
        <FocusEmptyStateCard
          state={focusEmptyState}
          showAction={!repeatsHeroAction(focusEmptyState.action)}
          onPress={navigate(focusEmptyState.action.route)}
        />
      ) : null}

      {urgentItems.map((item) => (
        <UrgentSignalCard
          key={item.key}
          item={item}
          showAction={!repeatsHeroAction(item.action)}
          onPress={navigate(item.action.route)}
        />
      ))}

      <NotificationInboxCard
        items={notificationItems}
        expanded={notificationPanelOpen}
        loading={markingNotificationsRead}
        error={workspace.notificationLoadError}
        onToggle={() => setNotificationPanelOpen((current) => !current)}
        onOpen={(route) => navigateTo(route)}
        onMarkRead={(notificationId) =>
          void markNotificationsRead([notificationId])
        }
        onMarkAllRead={() =>
          void markNotificationsRead(
            notificationItems
              .filter((item) => item.readAt === null)
              .map((item) => item.notificationId),
          )
        }
      />

      <PlatformHealthCard
        rows={platformRows}
        onlineCount={onlinePlatformCount}
        totalCount={platformRows.length}
        reauthCount={reauthPlatforms.length}
        degradedCount={degradedPlatformCount}
        forwardedPendingCount={taskSummary.pendingPlatformCount}
        onPress={navigate("/platform-presence")}
      />

      <View style={styles.sectionBlock}>
        <Text style={styles.sectionTitle}>捷徑</Text>
        <View style={styles.deepLinkGrid}>
          {deepLinks.map((item) => (
            <DeepLinkTile
              key={`${item.action.route}-${item.label}`}
              model={item}
              onPress={navigate(item.action.route)}
            />
          ))}
        </View>
      </View>
    </Shell>
  );
}

const styles = StyleSheet.create({
  shellContent: {
    paddingBottom: 28,
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
  headerTitle: {
    color: THEME.text,
    fontFamily: THEME.fontFamily,
    fontSize: 18,
    fontWeight: "700",
    letterSpacing: -0.2,
  },
  headerSubtitle: {
    color: THEME.textDim,
    fontFamily: THEME.monoFamily,
    fontSize: 11,
  },
  headerMetaWrap: {
    gap: 6,
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
  },
  headerStatusText: {
    color: THEME.textDim,
    fontFamily: THEME.fontFamily,
    fontSize: 12,
  },
  headerActions: {
    flexDirection: "row",
    alignItems: "center",
    gap: 8,
  },
  headerActionButton: {
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
  headerActionButtonDanger: {
    backgroundColor: THEME.dangerBg,
    borderColor: THEME.dangerBorder,
  },
  headerActionButtonPressed: {
    opacity: 0.86,
  },
  headerActionDot: {
    position: "absolute",
    top: 9,
    right: 10,
    width: 8,
    height: 8,
    borderRadius: 4,
    backgroundColor: THEME.danger,
  },
  refreshLabel: {
    color: THEME.textDim,
    fontFamily: THEME.monoFamily,
    fontSize: 10.5,
  },
  heroCard: {
    overflow: "hidden",
  },
  heroSurface: {
    paddingHorizontal: 18,
    paddingTop: 16,
    paddingBottom: 18,
    borderRadius: 18,
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
    backgroundColor: "rgba(255,255,255,0.08)",
  },
  heroGlowSmall: {
    position: "absolute",
    bottom: -22,
    left: -10,
    width: 120,
    height: 120,
    borderRadius: 60,
    backgroundColor: "rgba(255,255,255,0.06)",
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
    color: "#FFFFFF",
    fontFamily: THEME.monoFamily,
    fontSize: 10.5,
    fontWeight: "700",
  },
  heroTitle: {
    fontFamily: THEME.fontFamily,
    fontSize: 24,
    fontWeight: "700",
    letterSpacing: -0.6,
  },
  heroDetail: {
    color: THEME.text,
    fontFamily: THEME.fontFamily,
    fontSize: 14,
    lineHeight: 20,
  },
  heroMeta: {
    color: THEME.textMuted,
    fontFamily: THEME.monoFamily,
    fontSize: 11,
    lineHeight: 16,
  },
  heroDisabledHint: {
    color: THEME.textMuted,
    fontFamily: THEME.fontFamily,
    fontSize: 11.5,
    lineHeight: 16,
    marginTop: 6,
  },
  heroActionRow: {
    flexDirection: "row",
    gap: 10,
    marginTop: 12,
  },
  heroPrimaryButton: {
    flex: 1,
  },
  heroSecondaryButton: {
    flex: 1,
  },
  bannerActionRow: {
    flexDirection: "row",
    gap: 8,
    flexWrap: "wrap",
  },
  kpiRow: {
    flexDirection: "row",
    gap: 10,
  },
  kpiCell: {
    flex: 1,
  },
  emptyStateCard: {
    overflow: "hidden",
  },
  emptyStateHeader: {
    flexDirection: "row",
    alignItems: "flex-start",
    gap: 12,
  },
  emptyStateIconWrap: {
    width: 38,
    height: 38,
    borderRadius: 19,
    alignItems: "center",
    justifyContent: "center",
  },
  emptyStateCopy: {
    flex: 1,
    gap: 4,
  },
  emptyStateTitle: {
    color: THEME.text,
    fontFamily: THEME.fontFamily,
    fontSize: 15,
    fontWeight: "700",
  },
  emptyStateBody: {
    color: THEME.text,
    fontFamily: THEME.fontFamily,
    fontSize: 12.5,
    lineHeight: 18,
  },
  emptyStateFooter: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "space-between",
    gap: 12,
    marginTop: 14,
  },
  emptyStateDisabledHint: {
    color: THEME.textMuted,
    fontFamily: THEME.fontFamily,
    fontSize: 11.5,
    lineHeight: 16,
    marginTop: 10,
  },
  urgentCard: {
    overflow: "hidden",
  },
  urgentRow: {
    flexDirection: "row",
    alignItems: "center",
    gap: 12,
  },
  urgentIconWrap: {
    width: 34,
    height: 34,
    borderRadius: 17,
    alignItems: "center",
    justifyContent: "center",
  },
  urgentCopy: {
    flex: 1,
    gap: 2,
  },
  urgentTitle: {
    fontFamily: THEME.fontFamily,
    fontSize: 13,
    fontWeight: "700",
  },
  urgentBody: {
    color: THEME.text,
    fontFamily: THEME.fontFamily,
    fontSize: 12,
    lineHeight: 17,
  },
  sectionBlock: {
    gap: 10,
  },
  sectionHeader: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "space-between",
    gap: 12,
  },
  sectionEyebrow: {
    color: THEME.textDim,
    fontFamily: THEME.monoFamily,
    fontSize: 10.5,
  },
  sectionTitle: {
    color: THEME.text,
    fontFamily: THEME.fontFamily,
    fontSize: 16,
    fontWeight: "700",
    letterSpacing: -0.2,
  },
  sectionBody: {
    color: THEME.textMuted,
    fontFamily: THEME.fontFamily,
    fontSize: 12.5,
    lineHeight: 18,
  },
  activeTripCard: {
    gap: 10,
  },
  activeTripMetaRow: {
    flexDirection: "row",
    alignItems: "center",
    gap: 8,
    flexWrap: "wrap",
  },
  activeTripActionRow: {
    flexDirection: "row",
    gap: 8,
  },
  notificationActionRow: {
    flexDirection: "row",
    justifyContent: "flex-end",
    marginBottom: 12,
  },
  notificationList: {
    gap: 10,
  },
  notificationRow: {
    gap: 10,
    paddingBottom: 10,
    borderBottomWidth: 1,
    borderBottomColor: THEME.border,
  },
  notificationLead: {
    flexDirection: "row",
    alignItems: "flex-start",
    gap: 12,
  },
  notificationIconWrap: {
    width: 32,
    height: 32,
    borderRadius: 16,
    alignItems: "center",
    justifyContent: "center",
  },
  notificationCopy: {
    flex: 1,
    gap: 4,
  },
  notificationHeadline: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "space-between",
    gap: 8,
  },
  notificationTitle: {
    color: THEME.text,
    fontFamily: THEME.fontFamily,
    fontSize: 13,
    fontWeight: "700",
    flex: 1,
  },
  notificationBody: {
    color: THEME.text,
    fontFamily: THEME.fontFamily,
    fontSize: 12,
    lineHeight: 17,
  },
  notificationButtons: {
    flexDirection: "row",
    justifyContent: "flex-end",
    gap: 8,
  },
  platformSummaryRow: {
    flexDirection: "row",
    alignItems: "center",
    flexWrap: "wrap",
    gap: 8,
    marginBottom: 14,
  },
  platformList: {
    gap: 10,
  },
  platformRow: {
    flexDirection: "row",
    alignItems: "flex-start",
    justifyContent: "space-between",
    gap: 12,
    paddingBottom: 10,
    borderBottomWidth: 1,
    borderBottomColor: THEME.border,
  },
  platformRowCopy: {
    flex: 1,
    gap: 4,
  },
  platformRowHeadline: {
    flexDirection: "row",
    alignItems: "center",
    gap: 8,
    flexWrap: "wrap",
  },
  platformRowName: {
    color: THEME.text,
    fontFamily: THEME.fontFamily,
    fontSize: 13,
    fontWeight: "700",
  },
  platformRowSummary: {
    color: THEME.text,
    fontFamily: THEME.fontFamily,
    fontSize: 12.5,
  },
  platformRowMeta: {
    color: THEME.textDim,
    fontFamily: THEME.monoFamily,
    fontSize: 10.5,
    lineHeight: 15,
  },
  deepLinkGrid: {
    flexDirection: "row",
    flexWrap: "wrap",
    gap: 10,
  },
  deepLinkTileWrap: {
    width: "48%",
  },
  tileDisabled: {
    opacity: 0.58,
  },
  deepLinkTileRow: {
    flexDirection: "row",
    alignItems: "center",
    gap: 12,
  },
  deepLinkIconWrap: {
    width: 34,
    height: 34,
    borderRadius: 17,
    alignItems: "center",
    justifyContent: "center",
  },
  deepLinkCopy: {
    flex: 1,
    gap: 2,
  },
  deepLinkLabel: {
    color: THEME.text,
    fontFamily: THEME.fontFamily,
    fontSize: 13,
    fontWeight: "700",
  },
  deepLinkHelper: {
    color: THEME.textMuted,
    fontFamily: THEME.fontFamily,
    fontSize: 11.5,
    lineHeight: 16,
  },
  tilePressed: {
    opacity: 0.86,
  },
});
