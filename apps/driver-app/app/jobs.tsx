import { useEffect, useRef, useState } from "react";
import {
  ActivityIndicator,
  Animated,
  PanResponder,
  Pressable,
  ScrollView,
  StyleSheet,
  Text,
  View,
} from "react-native";
import { Ionicons } from "@expo/vector-icons";
import { useRouter } from "expo-router";
import type {
  DriverTaskAction,
  DriverTaskRecord,
  OwnedOrderRecord,
  UnifiedDriverTaskView,
} from "@drts/contracts";

import { getPlatformDisplayLabel } from "@/components/platform-task-badge";
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
import { AuthorityBanner, PlatformBadge } from "@/components/ui";
import {
  acceptForwardedDriverOffer,
  getDriverClient,
  getDriverIdentityIssue,
  rejectForwardedDriverOffer,
} from "@/lib/api-client";
import { formatMoney } from "@/lib/money";
import {
  formatDriverTaskStatusLabel,
  formatDriverTaskTypeLabel,
} from "@/lib/operational-labels";
import {
  driverForwardedTaskStatusLabels,
  driverJobFilterOptions,
  driverStrings,
  driverTaskActionLabels,
} from "@/lib/strings";

type TaskFilterValue =
  | "all"
  | "needs_action"
  | "in_progress"
  | "platform_closed"
  | "sync_issue";

type LayoutVariant = "A" | "B";

type NoticeTone = "success" | "warn" | "danger" | "info";

type InlineNotice = {
  tone: NoticeTone;
  title: string;
  body?: string;
};

type SwipeActionDirection = "accept" | "reject";

type TaskVisualState =
  | "needs_action"
  | "in_progress"
  | "offered"
  | "accept_pending"
  | "confirmed"
  | "completed"
  | "lost_race"
  | "cancelled"
  | "read_only"
  | "sync_failed";

type TaskAuthorityDescriptor = {
  title: string;
  authorityLabel: string;
  description: string;
  tone: "owned" | "platform" | "warning" | "danger";
  icon: keyof typeof Ionicons.glyphMap;
};

const THEME = driverCanvasTheme;
const FILTER_OPTIONS = driverJobFilterOptions;
const ACTION_LABELS: Record<DriverTaskAction, string> = driverTaskActionLabels;
const SWIPE_LIMIT = 124;
const SWIPE_TRIGGER = 78;

function humanizeCode(value: string) {
  return value
    .replace(/[_-]+/g, " ")
    .replace(/\b\w/g, (char) => char.toUpperCase());
}

function formatStatusLabel(status: string | null) {
  if (!status) {
    return "待同步";
  }

  return (
    driverForwardedTaskStatusLabels[
      status as keyof typeof driverForwardedTaskStatusLabels
    ] ?? formatDriverTaskStatusLabel(status)
  );
}

function formatActionStateLabel(
  actionState: UnifiedDriverTaskView["driverActionState"],
) {
  switch (actionState) {
    case "action_required":
      return driverStrings.jobs.actionStateLabels.action_required;
    case "awaiting_platform":
      return driverStrings.jobs.actionStateLabels.awaiting_platform;
    case "in_progress":
      return driverStrings.jobs.actionStateLabels.in_progress;
    case "blocked":
      return driverStrings.jobs.actionStateLabels.blocked;
    case "completed":
      return driverStrings.jobs.actionStateLabels.completed;
    case "read_only":
      return driverStrings.jobs.actionStateLabels.read_only;
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
    return isNeedsActionTask(task);
  }

  return task.driverActionState === "in_progress";
}

function isNeedsActionTask(task: UnifiedDriverTaskView) {
  return (
    hasSyncIssue(task) ||
    task.driverActionState === "action_required" ||
    task.driverActionState === "awaiting_platform"
  );
}

function getActionPriority(task: UnifiedDriverTaskView) {
  switch (task.driverActionState) {
    case "in_progress":
      return 0;
    case "action_required":
      return 1;
    case "awaiting_platform":
      return 2;
    case "completed":
      return 3;
    case "read_only":
      return 4;
    case "blocked":
      return hasSyncIssue(task) ? 5 : 4;
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

function formatRelativeDeadline(value: string | null) {
  if (!value) {
    return null;
  }

  const deadlineAt = Date.parse(value);
  if (Number.isNaN(deadlineAt)) {
    return formatTimestamp(value);
  }

  const deltaMs = deadlineAt - Date.now();
  if (deltaMs <= 0) {
    return "已逾時";
  }

  const seconds = Math.ceil(deltaMs / 1000);
  if (seconds < 60) {
    return `${seconds} 秒可接單`;
  }

  const minutes = Math.ceil(seconds / 60);
  if (minutes < 60) {
    return `${minutes} 分鐘內出發`;
  }

  const hours = Math.ceil(minutes / 60);
  return `${hours} 小時內處理`;
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

function getErrorMessage(error: unknown) {
  if (error instanceof Error && error.message.trim()) {
    const apiMatch = /^API error \d+:\s*(.*)$/s.exec(error.message);
    if (!apiMatch) {
      return error.message.trim();
    }

    try {
      const payload = JSON.parse(apiMatch[1]) as {
        error?: { message?: string };
      };
      return payload.error?.message?.trim() || error.message.trim();
    } catch {
      return error.message.trim();
    }
  }

  return driverStrings.common.requestFailed;
}

function getTaskPillTone(task: UnifiedDriverTaskView) {
  if (hasSyncIssue(task)) {
    return "danger" as const;
  }

  if (isPlatformClosed(task)) {
    return "neutral" as const;
  }

  switch (task.driverActionState) {
    case "action_required":
      return isOwnedTask(task) ? "warn" : "accent";
    case "awaiting_platform":
      return "warn" as const;
    case "in_progress":
      return "success" as const;
    case "completed":
      return "neutral" as const;
    default:
      return "danger" as const;
  }
}

function isEmphasizedStatus(task: UnifiedDriverTaskView) {
  return (
    !hasSyncIssue(task) &&
    !isPlatformClosed(task) &&
    task.driverActionState !== "completed"
  );
}

function canSwipeForwardedTask(task: UnifiedDriverTaskView) {
  return (
    !isOwnedTask(task) &&
    !hasSyncIssue(task) &&
    task.driverActionState === "action_required" &&
    task.allowedActions.includes("accept") &&
    task.allowedActions.includes("reject")
  );
}

function buildTaskTitle(task: UnifiedDriverTaskView) {
  const routeSummary = [task.pickupSummary, task.dropoffSummary]
    .filter((value): value is string => Boolean(value))
    .join(" → ");

  if (routeSummary) {
    return routeSummary;
  }

  if (!isOwnedTask(task)) {
    return `${task.platformDisplayName} 平台訂單`;
  }

  return `訂單 ${task.orderId}`;
}

function buildTaskSubtitle(task: UnifiedDriverTaskView) {
  if (hasSyncIssue(task)) {
    return task.syncIssueSummary ?? "來源平台同步異常，需派車台處理";
  }

  if (!isOwnedTask(task) && task.driverActionState === "awaiting_platform") {
    return "等待平台確認 · 已送出接單結果";
  }

  if (isPlatformClosed(task)) {
    return `平台結案 · ${formatStatusLabel(task.nativeStatus)}`;
  }

  if (task.pickupSummary || task.dropoffSummary) {
    const points = [task.pickupSummary, task.dropoffSummary].filter(
      (value): value is string => Boolean(value),
    );
    if (points.length > 1) {
      return `${points[0]} · ${points[1]}`;
    }
    if (points.length === 1) {
      const singlePoint = points[0];
      return singlePoint === buildTaskTitle(task)
        ? buildAllowedActionSummary(task)
        : singlePoint;
    }
  }

  return buildAllowedActionSummary(task);
}

function buildCardMeta(task: UnifiedDriverTaskView) {
  return [task.orderId, formatTimestamp(task.updatedAt)]
    .filter((value): value is string => Boolean(value))
    .join(" · ");
}

function buildDenseStatusText(task: UnifiedDriverTaskView) {
  if (hasSyncIssue(task)) {
    return "同步異常";
  }

  if (isPlatformClosed(task)) {
    const nativeStatus = normalizeStateCode(task.nativeStatus);
    if (nativeStatus === "lost_race" || nativeStatus === "taken") {
      return "已失去";
    }
    if (
      nativeStatus === "cancelled" ||
      nativeStatus === "cancelled_by_platform"
    ) {
      return "平台取消";
    }
    return "平台結案";
  }

  switch (task.driverActionState) {
    case "action_required": {
      const deadlineLabel = formatRelativeDeadline(task.deadlineAt);
      if (!isOwnedTask(task)) {
        return deadlineLabel ? `可接 · ${deadlineLabel}` : "可接單";
      }
      return "待司機處理";
    }
    case "awaiting_platform":
      return "等候確認";
    case "in_progress":
      return "進行中";
    case "completed":
      return "已完成";
    case "blocked":
      return "需派車台處理";
    case "read_only":
      return "唯讀鏡像";
    default:
      return formatActionStateLabel(task.driverActionState);
  }
}

function buildCardStatusLabel(task: UnifiedDriverTaskView) {
  if (hasSyncIssue(task)) {
    return "同步異常";
  }

  if (isPlatformClosed(task)) {
    return formatStatusLabel(task.nativeStatus);
  }

  if (!isOwnedTask(task) && task.nativeStatus) {
    return formatStatusLabel(task.nativeStatus);
  }

  switch (task.driverActionState) {
    case "action_required":
      return isOwnedTask(task) ? "待司機處理" : "可接單";
    case "awaiting_platform":
      return "等待平台確認";
    case "in_progress":
      return "進行中";
    case "completed":
      return "已完成";
    case "blocked":
      return "需派車台處理";
    case "read_only":
      return "唯讀鏡像";
    default:
      return formatActionStateLabel(task.driverActionState);
  }
}

function getDenseStatusColor(task: UnifiedDriverTaskView) {
  if (hasSyncIssue(task)) {
    return THEME.danger;
  }
  if (isPlatformClosed(task)) {
    return THEME.textDim;
  }
  switch (task.driverActionState) {
    case "action_required":
      return isOwnedTask(task) ? THEME.warn : THEME.accent;
    case "awaiting_platform":
      return THEME.warn;
    case "in_progress":
      return THEME.success;
    case "completed":
      return THEME.textDim;
    default:
      return THEME.textMuted;
  }
}

function buildTypeLabel(order: OwnedOrderRecord | null) {
  return formatDriverTaskTypeLabel({
    serviceBucket: order?.serviceBucket ?? null,
    businessDispatchSubtype: order?.businessDispatchSubtype ?? null,
    dispatchSemantics: order?.dispatchSemantics ?? null,
  });
}

function getTaskPlatformCode(task: UnifiedDriverTaskView) {
  if (isOwnedTask(task)) {
    return "DR";
  }

  switch (task.sourcePlatform) {
    case "uber":
      return "UB";
    case "grab":
      return "GR";
    case "line-taxi":
      return "LT";
    case "grab_taiwan":
      return "GT";
    case "indriver":
      return "IN";
    default:
      return task.sourcePlatform
        .replace(/[^a-z0-9]/gi, "")
        .slice(0, 2)
        .toUpperCase();
  }
}

function getTaskPlatformName(task: UnifiedDriverTaskView) {
  return isOwnedTask(task)
    ? "自營派單"
    : task.platformDisplayName || getPlatformDisplayLabel(task.sourcePlatform);
}

function getTaskVisualState(task: UnifiedDriverTaskView): TaskVisualState {
  if (hasSyncIssue(task)) {
    return "sync_failed";
  }

  const nativeStatus = normalizeStateCode(task.nativeStatus);
  if (nativeStatus === "lost_race" || nativeStatus === "taken") {
    return "lost_race";
  }

  if (
    nativeStatus === "cancelled" ||
    nativeStatus === "cancelled_by_platform"
  ) {
    return "cancelled";
  }

  if (
    nativeStatus === "confirmed" ||
    nativeStatus === "confirmed_by_platform"
  ) {
    return "confirmed";
  }

  switch (task.driverActionState) {
    case "action_required":
      return isOwnedTask(task) ? "needs_action" : "offered";
    case "awaiting_platform":
      return "accept_pending";
    case "completed":
      return "completed";
    case "read_only":
      return "read_only";
    case "in_progress":
    case "blocked":
    default:
      return "in_progress";
  }
}

function buildTaskAuthorityDescriptor(
  task: UnifiedDriverTaskView,
): TaskAuthorityDescriptor {
  const platformLabel = isOwnedTask(task)
    ? "DRTS"
    : getPlatformDisplayLabel(task.sourcePlatform);

  switch (getTaskVisualState(task)) {
    case "sync_failed":
      return {
        title: "平台同步異常",
        authorityLabel: `平台 ${platformLabel}`,
        description:
          "平台同步或授權失敗；派車台接手前，司機端不開放本地生命周期變更。",
        tone: "danger",
        icon: "alert-circle-outline",
      };
    case "offered":
      return {
        title: "來源平台派單",
        authorityLabel: `平台 ${platformLabel}`,
        description:
          "此訂單由來源平台主導。接受後只會送出平台請求，仍可能被其他司機搶先確認。",
        tone: "platform",
        icon: "swap-horizontal-outline",
      };
    case "accept_pending":
      return {
        title: "等待來源平台確認",
        authorityLabel: `平台 ${platformLabel}`,
        description:
          "已送出接單要求。平台回應前，本地只保留安全鏡像與查閱能力。",
        tone: "warning",
        icon: "time-outline",
      };
    case "confirmed":
      return {
        title: "來源平台已確認",
        authorityLabel: `平台 ${platformLabel}`,
        description:
          "平台已確認此單。後續節點仍需遵守來源平台規則，本地僅同步顯示安全資訊。",
        tone: "platform",
        icon: "checkmark-circle-outline",
      };
    case "completed":
      return isOwnedTask(task)
        ? {
            title: "任務已完成",
            authorityLabel: "DRTS 任務主控",
            description:
              "本地任務已結案，畫面保留完成結果與最後同步資訊供查閱。",
            tone: "owned",
            icon: "checkmark-done-outline",
          }
        : {
            title: "來源平台已完成",
            authorityLabel: `平台 ${platformLabel}`,
            description:
              "來源平台已完成此訂單。本地只保留最終同步結果，不再開放操作。",
            tone: "platform",
            icon: "checkmark-done-outline",
          };
    case "lost_race":
      return {
        title: "平台已分配給其他司機",
        authorityLabel: `平台 ${platformLabel}`,
        description: "此筆平台訂單已結束，本地僅保留同步結果供查閱與追蹤。",
        tone: "warning",
        icon: "close-circle-outline",
      };
    case "cancelled":
      return {
        title: "來源平台已取消",
        authorityLabel: `平台 ${platformLabel}`,
        description: "來源平台已取消此訂單。本地不再提供任何後續任務操作。",
        tone: "warning",
        icon: "ban-outline",
      };
    case "read_only":
      return {
        title: "平台鏡像任務",
        authorityLabel: `平台 ${platformLabel}`,
        description: "來源平台仍是此任務的權限來源，本地僅提供同步鏡像供查閱。",
        tone: "platform",
        icon: "eye-outline",
      };
    case "needs_action":
      return {
        title: "待司機處理",
        authorityLabel: "DRTS 任務主控",
        description: "完整本地操作權限維持開放，請直接從行程作業台接手下一步。",
        tone: "owned",
        icon: "alert-circle-outline",
      };
    case "in_progress":
    default:
      return isOwnedTask(task)
        ? {
            title: "自營派單",
            authorityLabel: "DRTS 任務主控",
            description:
              "完整本地任務操作權限。請依任務節點完成出發、抵達、接送與完單佐證。",
            tone: "owned",
            icon: "shield-checkmark",
          }
        : {
            title: "來源平台鏡像進行中",
            authorityLabel: `平台 ${platformLabel}`,
            description:
              "來源平台仍是此任務的權限來源。本地保留安全同步鏡像與查閱資訊。",
            tone: "platform",
            icon: "navigate-outline",
          };
  }
}

function describeForwardedActionOutcome(
  outcome: string,
  action: SwipeActionDirection,
): InlineNotice {
  switch (outcome) {
    case "accept_pending":
      return {
        tone: "warn",
        title: "已送出接單，等待平台確認",
      };
    case "confirmed_by_platform":
      return {
        tone: "success",
        title: "平台已確認接單",
      };
    case "lost_race":
      return {
        tone: "info",
        title: "其他司機已被平台確認",
      };
    case "cancelled_by_platform":
      return {
        tone: "info",
        title: "來源平台已取消此訂單",
      };
    case "sync_failed":
      return {
        tone: "danger",
        title: "平台同步異常，需派車台處理",
      };
    case "rejected":
      return {
        tone: "info",
        title: action === "reject" ? "已婉拒此平台訂單" : "此訂單已不再可接單",
      };
    default:
      return {
        tone: "info",
        title: "平台回覆已更新",
      };
  }
}

function noticeToneToBannerTone(tone: NoticeTone) {
  switch (tone) {
    case "success":
      return "success" as const;
    case "warn":
      return "warn" as const;
    case "danger":
      return "danger" as const;
    default:
      return "info" as const;
  }
}

function noticeToneToIcon(tone: NoticeTone) {
  switch (tone) {
    case "success":
      return "checkmark-circle-outline" as const;
    case "warn":
      return "time-outline" as const;
    case "danger":
      return "alert-circle-outline" as const;
    default:
      return "information-circle-outline" as const;
  }
}

function LayoutToggle({
  layout,
  onRefresh,
  refreshing,
  onToggle,
}: {
  layout: LayoutVariant;
  onRefresh: () => void;
  refreshing: boolean;
  onToggle: () => void;
}) {
  return (
    <View style={styles.headerActions}>
      <Btn
        variant="ghost"
        size="sm"
        icon={
          <Ionicons name="refresh-outline" size={14} color={THEME.textMuted} />
        }
        onPress={onRefresh}
        disabled={refreshing}
      >
        同步
      </Btn>
      <Btn
        variant="secondary"
        size="sm"
        icon={
          <Ionicons
            name={layout === "A" ? "reorder-three-outline" : "grid-outline"}
            size={14}
            color={THEME.text}
          />
        }
        onPress={onToggle}
      >
        {layout === "A" ? "佇列" : "卡片"}
      </Btn>
    </View>
  );
}

function DriverBottomTabs({
  active,
  jobsBadge,
  onNavigate,
}: {
  active: "jobs" | "home" | "trip" | "platform" | "settings";
  jobsBadge: number;
  onNavigate: (route: string) => void;
}) {
  const items = [
    { id: "home", label: "工作台", icon: "home-outline", route: "/" },
    { id: "jobs", label: "任務", icon: "list-outline", route: "/jobs" },
    { id: "trip", label: "行程", icon: "car-outline", route: "/trip" },
    {
      id: "platform",
      label: "平台",
      icon: "layers-outline",
      route: "/platform-presence",
      dot: true,
    },
    {
      id: "settings",
      label: "設定",
      icon: "person-outline",
      route: "/settings",
    },
  ] as const;

  return (
    <View style={styles.bottomTabs}>
      {items.map((item) => {
        const selected = item.id === active;
        const hasDot = "dot" in item && Boolean(item.dot);
        return (
          <Pressable
            key={item.id}
            accessibilityRole="button"
            onPress={() => onNavigate(item.route)}
            style={styles.bottomTabItem}
          >
            <View style={styles.bottomTabIconWrap}>
              <Ionicons
                name={item.icon}
                size={22}
                color={selected ? THEME.accent : THEME.textDim}
              />
              {item.id === "jobs" && jobsBadge > 0 ? (
                <View style={styles.bottomTabBadge}>
                  <Text style={styles.bottomTabBadgeText}>{jobsBadge}</Text>
                </View>
              ) : null}
              {hasDot ? <View style={styles.bottomTabDot} /> : null}
            </View>
            <Text
              style={[
                styles.bottomTabLabel,
                selected && styles.bottomTabLabelActive,
              ]}
            >
              {item.label}
            </Text>
          </Pressable>
        );
      })}
    </View>
  );
}

function TaskCard({
  task,
  order,
  onOpen,
  onAccept,
  accepting,
}: {
  task: UnifiedDriverTaskView;
  order: OwnedOrderRecord | null;
  onOpen: (taskId: string) => void;
  onAccept: () => void;
  accepting: boolean;
}) {
  const forwarded = !isOwnedTask(task);
  const platformClosed = isPlatformClosed(task);
  const syncIssue = hasSyncIssue(task);
  const visualState = getTaskVisualState(task);
  const authority = buildTaskAuthorityDescriptor(task);
  const dimmed = visualState === "completed" || platformClosed;
  const fareLabel = order?.quotedFare ? formatMoney(order.quotedFare) : null;
  const deadlineLabel = formatRelativeDeadline(task.deadlineAt);
  const typeLabel = buildTypeLabel(order);
  const showPrimaryAction = canSwipeForwardedTask(task);
  const showOpenAction =
    !showPrimaryAction &&
    !syncIssue &&
    !platformClosed &&
    (visualState === "needs_action" ||
      visualState === "in_progress" ||
      visualState === "confirmed");
  const actionLabel = showPrimaryAction
    ? "接受平台訂單"
    : showOpenAction
      ? driverStrings.jobs.openCurrentTrip
      : null;
  const nextStepText = buildAllowedActionSummary(task);
  const showFooter = Boolean(fareLabel || deadlineLabel || actionLabel);

  return (
    <Card
      style={[
        styles.taskCard,
        forwarded && !dimmed ? styles.taskCardForwarded : null,
        dimmed ? styles.taskCardDimmed : null,
        syncIssue ? styles.taskCardSync : null,
      ]}
      padding={14}
    >
      <View>
        <Pressable
          accessibilityRole="button"
          onPress={() => onOpen(task.taskId)}
        >
          <View style={styles.cardTopRow}>
            <View style={styles.cardTopLead}>
              <PlatformBadge
                code={getTaskPlatformCode(task)}
                name={getTaskPlatformName(task)}
                forwarded={forwarded}
                size="sm"
              />
              {isEmphasizedStatus(task) ? (
                <Pill tone={getTaskPillTone(task)} dot>
                  {buildCardStatusLabel(task)}
                </Pill>
              ) : (
                <Text style={styles.cardInlineStatus}>
                  {buildCardStatusLabel(task)}
                </Text>
              )}
            </View>
            <Text style={styles.cardTaskCode}>{task.taskId}</Text>
          </View>

          <View style={styles.cardCopy}>
            <Text style={styles.cardTitle} numberOfLines={2}>
              {buildTaskTitle(task)}
            </Text>
            <Text style={styles.cardSubtitle} numberOfLines={2}>
              {buildTaskSubtitle(task)}
            </Text>
            <Text style={styles.cardMeta} numberOfLines={1}>
              {buildCardMeta(task)}
            </Text>
          </View>

          <View style={styles.cardPillRow}>
            <Pill tone="neutral">{typeLabel}</Pill>
            {task.routeLocked ? <Pill tone="warn">路線鎖定</Pill> : null}
            {order?.fixedPrice ? <Pill tone="info">固定車資</Pill> : null}
          </View>

          <View style={styles.cardAuthorityWrap}>
            <AuthorityBanner
              title={authority.title}
              authorityLabel={authority.authorityLabel}
              description={authority.description}
              tone={authority.tone}
              icon={authority.icon}
            />
          </View>

          <Text
            style={[styles.cardHint, syncIssue ? styles.cardHintDanger : null]}
            numberOfLines={2}
          >
            下一步 · {nextStepText}
          </Text>
        </Pressable>

        {showFooter ? (
          <View style={styles.cardFooterRow}>
            <View style={styles.cardFooterStats}>
              {fareLabel ? (
                <Text style={styles.cardFare}>{fareLabel}</Text>
              ) : null}
              {deadlineLabel ? (
                <View style={styles.deadlineRow}>
                  <Ionicons
                    name="time-outline"
                    size={12}
                    color={syncIssue ? THEME.danger : THEME.warn}
                  />
                  <Text
                    style={[
                      styles.deadlineText,
                      syncIssue ? styles.deadlineDanger : null,
                    ]}
                  >
                    {deadlineLabel}
                  </Text>
                </View>
              ) : null}
            </View>
            {actionLabel ? (
              <Btn
                variant="primary"
                size="sm"
                disabled={accepting}
                onPress={
                  showPrimaryAction ? onAccept : () => onOpen(task.taskId)
                }
              >
                {accepting ? "提交中…" : actionLabel}
              </Btn>
            ) : null}
          </View>
        ) : null}
      </View>
    </Card>
  );
}

function DenseTaskRow({
  task,
  order,
  busy,
  onOpen,
  onAccept,
  onReject,
}: {
  task: UnifiedDriverTaskView;
  order: OwnedOrderRecord | null;
  busy: boolean;
  onOpen: (taskId: string) => void;
  onAccept: () => void;
  onReject: () => void;
}) {
  const actionable = canSwipeForwardedTask(task);
  const translateX = useRef(new Animated.Value(0)).current;
  const dimmed =
    task.driverActionState === "completed" || isPlatformClosed(task);
  const forwarded = !isOwnedTask(task);
  const fareLabel = order?.quotedFare ? formatMoney(order.quotedFare) : null;
  const deadlineLabel = formatRelativeDeadline(task.deadlineAt);

  const resetSwipe = () => {
    Animated.spring(translateX, {
      toValue: 0,
      useNativeDriver: true,
      tension: 140,
      friction: 14,
    }).start();
  };

  const triggerAction = (direction: SwipeActionDirection) => {
    Animated.sequence([
      Animated.timing(translateX, {
        toValue: direction === "accept" ? SWIPE_LIMIT : -SWIPE_LIMIT,
        duration: 110,
        useNativeDriver: true,
      }),
      Animated.timing(translateX, {
        toValue: 0,
        duration: 130,
        useNativeDriver: true,
      }),
    ]).start(({ finished }) => {
      if (!finished) {
        return;
      }
      if (direction === "accept") {
        onAccept();
      } else {
        onReject();
      }
    });
  };

  const panResponder = useRef(
    PanResponder.create({
      onMoveShouldSetPanResponder: (_, gestureState) =>
        actionable &&
        !busy &&
        Math.abs(gestureState.dx) > 6 &&
        Math.abs(gestureState.dx) > Math.abs(gestureState.dy),
      onPanResponderGrant: () => {
        translateX.stopAnimation();
      },
      onPanResponderMove: (_, gestureState) => {
        const clamped = Math.max(
          -SWIPE_LIMIT,
          Math.min(SWIPE_LIMIT, gestureState.dx),
        );
        translateX.setValue(clamped);
      },
      onPanResponderRelease: (_, gestureState) => {
        if (gestureState.dx >= SWIPE_TRIGGER) {
          triggerAction("accept");
          return;
        }
        if (gestureState.dx <= -SWIPE_TRIGGER) {
          triggerAction("reject");
          return;
        }
        resetSwipe();
      },
      onPanResponderTerminate: resetSwipe,
      onPanResponderTerminationRequest: () => true,
    }),
  ).current;

  return (
    <View style={[styles.denseRowWrap, dimmed ? styles.taskCardDimmed : null]}>
      {actionable ? (
        <View style={styles.swipeActionLayer}>
          <View style={[styles.swipeActionPanel, styles.swipeActionAccept]}>
            <Ionicons name="checkmark" size={18} color="#FFFFFF" />
            <Text style={styles.swipeActionLabel}>接受</Text>
          </View>
          <View style={[styles.swipeActionPanel, styles.swipeActionReject]}>
            <Ionicons name="close" size={18} color="#FFFFFF" />
            <Text style={styles.swipeActionLabel}>婉拒</Text>
          </View>
        </View>
      ) : null}

      <Animated.View
        style={[
          styles.denseRowSurface,
          { transform: [{ translateX }] },
          forwarded ? styles.denseRowForwarded : null,
          hasSyncIssue(task) ? styles.taskCardSync : null,
        ]}
        {...(actionable ? panResponder.panHandlers : {})}
      >
        <Pressable
          accessibilityRole="button"
          disabled={busy}
          onPress={() => onOpen(task.taskId)}
          style={({ pressed }) => [
            styles.denseRowPressable,
            pressed && !busy ? styles.denseRowPressed : null,
          ]}
        >
          <View
            style={[
              styles.denseAccentBar,
              forwarded ? styles.denseAccentForwarded : styles.denseAccentOwned,
            ]}
          />
          <View style={styles.denseCopy}>
            <View style={styles.denseMetaRow}>
              <Text
                style={[
                  styles.densePlatformCode,
                  forwarded
                    ? styles.densePlatformCodeForwarded
                    : styles.densePlatformCodeOwned,
                ]}
              >
                {getTaskPlatformCode(task)}
              </Text>
              <View style={styles.denseMetaDot} />
              <Text style={styles.denseTaskCode}>{task.taskId}</Text>
            </View>
            <Text style={styles.denseTitle} numberOfLines={1}>
              {buildTaskTitle(task)}
            </Text>
            <Text
              style={[
                styles.denseStatusText,
                { color: getDenseStatusColor(task) },
              ]}
              numberOfLines={1}
            >
              {busy ? "正在提交平台回覆…" : buildDenseStatusText(task)}
            </Text>
            {actionable && !busy ? (
              <Text style={styles.denseSwipeHint}>右滑接受 · 左滑婉拒</Text>
            ) : null}
          </View>
          <View style={styles.denseAside}>
            {fareLabel ? (
              <Text style={styles.denseFare}>{fareLabel}</Text>
            ) : null}
            {deadlineLabel ? (
              <Text
                style={[
                  styles.denseDeadline,
                  hasSyncIssue(task) ? styles.deadlineDanger : null,
                ]}
              >
                {deadlineLabel}
              </Text>
            ) : null}
          </View>
        </Pressable>
      </Animated.View>
    </View>
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
  const [fallbackMode, setFallbackMode] = useState(false);
  const [selectedFilter, setSelectedFilter] = useState<TaskFilterValue>("all");
  const [layoutVariant, setLayoutVariant] = useState<LayoutVariant>("A");
  const [activeNotice, setActiveNotice] = useState<InlineNotice | null>(null);
  const [submittingTaskId, setSubmittingTaskId] = useState<string | null>(null);
  const [lastSyncedAt, setLastSyncedAt] = useState<string | null>(null);
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
      setLastSyncedAt(new Date().toISOString());
    } catch (nextError: unknown) {
      setFallbackMode(false);
      setError(getErrorMessage(nextError) || "任務清單載入失敗。");
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
  const needsActionCount = tasks.filter(isNeedsActionTask).length;
  const syncIssueCount = tasks.filter(hasSyncIssue).length;
  const filteredTasks = [
    ...tasks.filter((task) => matchesFilter(task, selectedFilter)),
  ].sort(compareTasks);

  async function handleSwipeAction(
    task: UnifiedDriverTaskView,
    action: SwipeActionDirection,
  ) {
    if (submittingTaskId) {
      return;
    }

    try {
      setSubmittingTaskId(task.taskId);
      setActiveNotice(null);
      const result =
        action === "accept"
          ? await acceptForwardedDriverOffer(task.taskId)
          : await rejectForwardedDriverOffer(
              task.taskId,
              "driver_declined_forwarded_offer",
            );
      const summary = describeForwardedActionOutcome(result.outcome, action);
      setActiveNotice({
        tone: summary.tone,
        title: summary.title,
        body: result.driverMessage?.trim() || undefined,
      });
      await loadTasks();
    } catch (actionError) {
      if (getDriverIdentityIssue()) {
        router.replace("/onboarding");
        return;
      }

      setActiveNotice({
        tone: "danger",
        title: "平台回覆失敗",
        body: getErrorMessage(actionError),
      });
    } finally {
      setSubmittingTaskId(null);
    }
  }

  function openTripWorkspace(taskId?: string) {
    if (taskId) {
      router.push({
        pathname: "/trip",
        params: { taskId },
      });
      return;
    }

    router.push("/trip");
  }

  function renderNoticeBanner() {
    if (error) {
      return (
        <Banner
          tone="danger"
          icon={
            <Ionicons
              name="alert-circle-outline"
              size={15}
              color={THEME.danger}
            />
          }
          title="任務收件匣載入失敗"
          body={error}
          actions={
            <Btn variant="secondary" size="xs" onPress={() => void onRefresh()}>
              重新整理
            </Btn>
          }
        />
      );
    }

    if (activeNotice) {
      return (
        <Banner
          tone={noticeToneToBannerTone(activeNotice.tone)}
          icon={
            <Ionicons
              name={noticeToneToIcon(activeNotice.tone)}
              size={15}
              color={
                activeNotice.tone === "success"
                  ? THEME.success
                  : activeNotice.tone === "warn"
                    ? THEME.warn
                    : activeNotice.tone === "danger"
                      ? THEME.danger
                      : THEME.info
              }
            />
          }
          title={activeNotice.title}
          body={activeNotice.body}
        />
      );
    }

    if (fallbackMode) {
      return (
        <Banner
          tone="warn"
          icon={
            <Ionicons
              name="cloud-offline-outline"
              size={15}
              color={THEME.warn}
            />
          }
          title="目前使用本地鏡像備援"
          body="已退回舊任務 API；forwarded 任務仍會顯示，但平台原生狀態與同步摘要可能延後。"
        />
      );
    }

    return null;
  }

  function renderContent() {
    if (loading) {
      return (
        <View style={styles.loadingState}>
          <ActivityIndicator size="large" color={THEME.accent} />
          <Text style={styles.loadingLabel}>載入任務中…</Text>
        </View>
      );
    }

    if (!tasksEnabled) {
      return (
        <Card style={styles.emptyCard}>
          <Text style={styles.emptyTitle}>任務清單暫停提供</Text>
          <Text style={styles.emptyBody}>
            此功能目前未啟用，請稍後再試或改從行程作業查看目前任務。
          </Text>
          <View style={styles.emptyActionRow}>
            <Btn variant="primary" size="sm" onPress={openTripWorkspace}>
              {driverStrings.jobs.openTripWorkspace}
            </Btn>
          </View>
        </Card>
      );
    }

    if (layoutVariant === "A") {
      return (
        <>
          <View style={styles.kpiRow}>
            <KPI label={driverStrings.jobs.kpis.total} value={assignedCount} />
            <KPI
              label={driverStrings.jobs.kpis.needsAction}
              value={needsActionCount}
              deltaTone="neutral"
            />
            <KPI
              label={driverStrings.jobs.kpis.external}
              value={forwardedCount}
            />
          </View>

          <ScrollView
            horizontal
            showsHorizontalScrollIndicator={false}
            style={styles.filterRow}
            contentContainerStyle={styles.filterRowContent}
          >
            {FILTER_OPTIONS.map((option) => {
              const selected = option.value === selectedFilter;

              return (
                <Pressable
                  key={option.value}
                  onPress={() => setSelectedFilter(option.value)}
                  style={[
                    styles.filterPillWrap,
                    selected ? styles.filterPillWrapSelected : null,
                  ]}
                >
                  <Pill tone={selected ? "accent" : "neutral"}>
                    {option.label}
                  </Pill>
                </Pressable>
              );
            })}
          </ScrollView>

          <View style={styles.taskStack}>
            {filteredTasks.length === 0 ? (
              <Card style={styles.emptyCard}>
                <Text style={styles.emptyTitle}>此篩選條件下沒有任務</Text>
                <Text style={styles.emptyBody}>
                  請切換其他篩選條件，或重新整理任務清單。
                </Text>
              </Card>
            ) : (
              filteredTasks.map((task) => (
                <TaskCard
                  key={task.taskId}
                  task={task}
                  order={orderMap[task.orderId] ?? null}
                  accepting={submittingTaskId === task.taskId}
                  onAccept={() => void handleSwipeAction(task, "accept")}
                  onOpen={openTripWorkspace}
                />
              ))
            )}
          </View>
        </>
      );
    }

    return (
      <>
        <View style={styles.variantSummaryRow}>
          <Text style={styles.variantSummaryText}>
            {filteredTasks.length} 筆任務
          </Text>
          <Text style={styles.variantSummaryWarn}>
            {needsActionCount} 需動作
          </Text>
          <View style={styles.variantSummarySpacer} />
          <Text style={styles.variantSummaryMeta}>排序：時效 ▾</Text>
        </View>

        <Card style={styles.denseListCard} padding={0}>
          {filteredTasks.length === 0 ? (
            <View style={styles.emptyDenseState}>
              <Text style={styles.emptyTitle}>此篩選條件下沒有任務</Text>
              <Text style={styles.emptyBody}>
                請切換其他篩選條件或重新整理。
              </Text>
            </View>
          ) : (
            filteredTasks.map((task) => (
              <DenseTaskRow
                key={task.taskId}
                task={task}
                order={orderMap[task.orderId] ?? null}
                busy={submittingTaskId === task.taskId}
                onOpen={openTripWorkspace}
                onAccept={() => void handleSwipeAction(task, "accept")}
                onReject={() => void handleSwipeAction(task, "reject")}
              />
            ))
          )}
        </Card>
      </>
    );
  }

  return (
    <Shell
      contentContainerStyle={styles.shellContent}
      footer={
        <DriverBottomTabs
          active="jobs"
          jobsBadge={needsActionCount}
          onNavigate={(route) => router.push(route)}
        />
      }
    >
      <PageHeader
        title={layoutVariant === "A" ? driverStrings.jobs.title : "任務佇列"}
        subtitle={
          layoutVariant === "B"
            ? lastSyncedAt
              ? `最近同步 ${formatTimestamp(lastSyncedAt)}`
              : "高密度任務佇列"
            : undefined
        }
        actions={
          <LayoutToggle
            layout={layoutVariant}
            onRefresh={() => void onRefresh()}
            refreshing={refreshing}
            onToggle={() =>
              setLayoutVariant((current) => (current === "A" ? "B" : "A"))
            }
          />
        }
      />

      {renderNoticeBanner()}
      {renderContent()}

      {layoutVariant === "B" && selectedFilter !== "all" ? (
        <Text style={styles.activeFilterHint}>
          目前篩選：
          {FILTER_OPTIONS.find((item) => item.value === selectedFilter)?.label}
        </Text>
      ) : null}

      {syncIssueCount > 0 && !error ? (
        <Text style={styles.footerHint}>
          同步/授權異常 {syncIssueCount} 筆，請依卡片指示聯繫派車台或重新登入。
        </Text>
      ) : null}
    </Shell>
  );
}

const styles = StyleSheet.create({
  shellContent: {
    gap: 12,
  },
  headerActions: {
    flexDirection: "row",
    alignItems: "center",
    gap: 8,
  },
  loadingState: {
    minHeight: 360,
    alignItems: "center",
    justifyContent: "center",
    gap: 12,
  },
  loadingLabel: {
    fontSize: 13,
    lineHeight: 18,
    fontWeight: "500",
    color: THEME.textMuted,
  },
  kpiRow: {
    flexDirection: "row",
    gap: 8,
  },
  filterRow: {
    marginHorizontal: -2,
  },
  filterRowContent: {
    flexDirection: "row",
    gap: 6,
    paddingBottom: 4,
  },
  filterPillWrap: {
    borderRadius: 999,
  },
  filterPillWrapSelected: {
    shadowColor: "#000000",
    shadowOffset: { width: 0, height: 2 },
    shadowOpacity: 0.18,
    shadowRadius: 6,
    elevation: 2,
  },
  taskStack: {
    gap: 10,
  },
  taskCard: {
    borderRadius: 14,
  },
  taskCardForwarded: {
    borderLeftWidth: 3,
    borderLeftColor: THEME.accent,
  },
  taskCardDimmed: {
    opacity: 0.72,
  },
  taskCardSync: {
    borderColor: THEME.warnBorder,
  },
  cardTopRow: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "space-between",
    gap: 10,
  },
  cardTopLead: {
    flexDirection: "row",
    alignItems: "center",
    flexWrap: "wrap",
    gap: 8,
    flex: 1,
  },
  cardInlineStatus: {
    fontSize: 11,
    lineHeight: 14,
    fontWeight: "500",
    color: THEME.textMuted,
  },
  cardTaskCode: {
    fontSize: 11,
    lineHeight: 14,
    fontWeight: "600",
    fontFamily: THEME.monoFamily,
    color: THEME.textDim,
  },
  cardCopy: {
    marginTop: 8,
    gap: 3,
  },
  cardTitle: {
    fontSize: 16,
    lineHeight: 21,
    fontWeight: "600",
    color: THEME.text,
  },
  cardSubtitle: {
    fontSize: 12.5,
    lineHeight: 18,
    color: THEME.textMuted,
  },
  cardMeta: {
    fontSize: 11,
    lineHeight: 14,
    color: THEME.textDim,
    fontFamily: THEME.monoFamily,
  },
  cardPillRow: {
    flexDirection: "row",
    flexWrap: "wrap",
    gap: 6,
    marginTop: 10,
  },
  cardAuthorityWrap: {
    marginTop: 10,
  },
  cardFooterRow: {
    marginTop: 12,
    paddingTop: 10,
    borderTopWidth: StyleSheet.hairlineWidth,
    borderTopColor: THEME.border,
    borderStyle: "dashed",
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "space-between",
    gap: 10,
  },
  cardFooterStats: {
    flexDirection: "row",
    alignItems: "center",
    gap: 10,
    flexWrap: "wrap",
    flex: 1,
  },
  cardFare: {
    fontSize: 13,
    lineHeight: 16,
    fontWeight: "700",
    color: THEME.text,
    fontFamily: THEME.monoFamily,
  },
  deadlineRow: {
    flexDirection: "row",
    alignItems: "center",
    gap: 4,
  },
  deadlineText: {
    fontSize: 11.5,
    lineHeight: 16,
    fontWeight: "500",
    color: THEME.warn,
  },
  deadlineDanger: {
    color: THEME.danger,
  },
  cardHint: {
    marginTop: 10,
    fontSize: 12,
    lineHeight: 17,
    color: THEME.textMuted,
  },
  cardHintDanger: {
    color: THEME.danger,
  },
  variantSummaryRow: {
    flexDirection: "row",
    alignItems: "center",
    gap: 10,
    paddingHorizontal: 2,
  },
  variantSummaryText: {
    fontSize: 12,
    lineHeight: 16,
    color: THEME.textMuted,
  },
  variantSummaryWarn: {
    fontSize: 12,
    lineHeight: 16,
    fontWeight: "600",
    color: THEME.warn,
  },
  variantSummarySpacer: {
    flex: 1,
  },
  variantSummaryMeta: {
    fontSize: 12,
    lineHeight: 16,
    fontWeight: "600",
    color: THEME.accent,
  },
  denseListCard: {
    overflow: "hidden",
  },
  denseRowWrap: {
    overflow: "hidden",
    borderBottomWidth: StyleSheet.hairlineWidth,
    borderBottomColor: THEME.border,
  },
  swipeActionLayer: {
    ...StyleSheet.absoluteFillObject,
    flexDirection: "row",
  },
  swipeActionPanel: {
    flex: 1,
    alignItems: "center",
    justifyContent: "center",
    gap: 6,
  },
  swipeActionAccept: {
    backgroundColor: THEME.success,
  },
  swipeActionReject: {
    backgroundColor: THEME.danger,
  },
  swipeActionLabel: {
    fontSize: 12,
    lineHeight: 16,
    fontWeight: "700",
    color: "#FFFFFF",
  },
  denseRowSurface: {
    backgroundColor: THEME.surface,
  },
  denseRowForwarded: {
    borderLeftWidth: 2,
    borderLeftColor: THEME.accent,
  },
  denseRowPressable: {
    flexDirection: "row",
    alignItems: "center",
    gap: 12,
    paddingHorizontal: 14,
    paddingVertical: 12,
  },
  denseRowPressed: {
    backgroundColor: THEME.rowHover,
  },
  denseAccentBar: {
    width: 4,
    alignSelf: "stretch",
    borderRadius: 3,
  },
  denseAccentOwned: {
    backgroundColor: THEME.info,
  },
  denseAccentForwarded: {
    backgroundColor: THEME.accent,
  },
  denseCopy: {
    flex: 1,
    minWidth: 0,
  },
  denseMetaRow: {
    flexDirection: "row",
    alignItems: "center",
    gap: 6,
    marginBottom: 3,
  },
  densePlatformCode: {
    fontSize: 10,
    lineHeight: 12,
    fontWeight: "700",
    fontFamily: THEME.monoFamily,
    letterSpacing: 0.4,
  },
  densePlatformCodeOwned: {
    color: THEME.info,
  },
  densePlatformCodeForwarded: {
    color: THEME.accent,
  },
  denseMetaDot: {
    width: 3,
    height: 3,
    borderRadius: 2,
    backgroundColor: THEME.borderStrong,
  },
  denseTaskCode: {
    fontSize: 10,
    lineHeight: 12,
    color: THEME.textDim,
    fontFamily: THEME.monoFamily,
  },
  denseTitle: {
    fontSize: 14,
    lineHeight: 18,
    fontWeight: "600",
    color: THEME.text,
  },
  denseStatusText: {
    marginTop: 2,
    fontSize: 11.5,
    lineHeight: 15,
    fontWeight: "500",
  },
  denseSwipeHint: {
    marginTop: 3,
    fontSize: 10.5,
    lineHeight: 14,
    color: THEME.textDim,
  },
  denseAside: {
    alignItems: "flex-end",
    minWidth: 72,
    gap: 3,
  },
  denseFare: {
    fontSize: 13,
    lineHeight: 16,
    fontWeight: "700",
    color: THEME.text,
    fontFamily: THEME.monoFamily,
  },
  denseDeadline: {
    fontSize: 10.5,
    lineHeight: 14,
    fontWeight: "600",
    color: THEME.warn,
    textAlign: "right",
  },
  emptyCard: {
    paddingVertical: 18,
  },
  emptyTitle: {
    fontSize: 15,
    lineHeight: 20,
    fontWeight: "700",
    color: THEME.text,
  },
  emptyBody: {
    marginTop: 6,
    fontSize: 12.5,
    lineHeight: 18,
    color: THEME.textMuted,
  },
  emptyActionRow: {
    marginTop: 14,
    flexDirection: "row",
  },
  emptyDenseState: {
    paddingHorizontal: 14,
    paddingVertical: 18,
  },
  activeFilterHint: {
    fontSize: 11.5,
    lineHeight: 16,
    color: THEME.textDim,
  },
  footerHint: {
    fontSize: 11.5,
    lineHeight: 16,
    color: THEME.textDim,
  },
  bottomTabs: {
    flexDirection: "row",
    justifyContent: "space-around",
    backgroundColor: THEME.bgRaised,
    borderTopWidth: 1,
    borderTopColor: THEME.border,
    paddingTop: 6,
    paddingBottom: 8,
    paddingHorizontal: 4,
  },
  bottomTabItem: {
    flex: 1,
    alignItems: "center",
    gap: 3,
    paddingVertical: 6,
  },
  bottomTabIconWrap: {
    position: "relative",
  },
  bottomTabBadge: {
    position: "absolute",
    top: -4,
    right: -8,
    minWidth: 16,
    paddingHorizontal: 5,
    paddingVertical: 2,
    borderRadius: 8,
    backgroundColor: THEME.danger,
    alignItems: "center",
  },
  bottomTabBadgeText: {
    fontSize: 10,
    lineHeight: 10,
    fontWeight: "700",
    color: "#FFFFFF",
  },
  bottomTabDot: {
    position: "absolute",
    top: -2,
    right: -2,
    width: 7,
    height: 7,
    borderRadius: 4,
    backgroundColor: THEME.success,
    borderWidth: 1,
    borderColor: THEME.bgRaised,
  },
  bottomTabLabel: {
    fontSize: 10.5,
    lineHeight: 13,
    fontWeight: "500",
    color: THEME.textDim,
  },
  bottomTabLabelActive: {
    fontWeight: "700",
    color: THEME.accent,
  },
});
