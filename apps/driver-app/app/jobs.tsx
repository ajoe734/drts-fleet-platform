import { useEffect, useMemo, useState } from "react";
import {
  ActivityIndicator,
  Pressable,
  ScrollView,
  StyleSheet,
  Text,
  View,
} from "react-native";
import { Ionicons } from "@expo/vector-icons";
import { useLocalSearchParams, useRouter } from "expo-router";
import type {
  DriverTaskAction,
  DriverTaskRecord,
  EmptyReason,
  EmptyStateEnvelope,
  OwnedOrderRecord,
  ResourceActionDescriptor,
  UiRefreshMetadata,
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

type NoticeTone = "success" | "warn" | "danger" | "info";

type InlineNotice = {
  tone: NoticeTone;
  title: string;
  body?: string;
};

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

type TaskInboxEnvelope = {
  items: UnifiedDriverTaskView[];
  refresh: UiRefreshMetadata;
  refreshTier: "medium";
  empty: EmptyStateEnvelope | null;
};

const THEME = driverCanvasTheme;
const FILTER_OPTIONS = driverJobFilterOptions;
const ACTION_LABELS: Record<DriverTaskAction, string> = driverTaskActionLabels;
const POLL_INTERVAL_MS = 15_000;

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

function isNeedsActionTask(task: UnifiedDriverTaskView) {
  return (
    hasSyncIssue(task) ||
    task.driverActionState === "action_required" ||
    task.driverActionState === "awaiting_platform"
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

function getActionPriority(task: UnifiedDriverTaskView) {
  switch (task.driverActionState) {
    case "action_required":
      return 0;
    case "awaiting_platform":
      return 1;
    case "in_progress":
      return 2;
    case "blocked":
      return hasSyncIssue(task) ? 3 : 4;
    case "completed":
      return 5;
    case "read_only":
      return 6;
    default:
      return 7;
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

function formatTimestamp(value: string | null | undefined) {
  if (!value) {
    return null;
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

function buildAllowedActionSummary(task: UnifiedDriverTaskView) {
  if (hasSyncIssue(task)) {
    return task.requiresReauth
      ? "需重新登入或補授權後再同步"
      : "需派車台介入同步";
  }

  if (task.allowedActions.length > 0) {
    return task.allowedActions
      .map((action: DriverTaskAction) => ACTION_LABELS[action])
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
  }

  return buildAllowedActionSummary(task);
}

function buildCardMeta(task: UnifiedDriverTaskView) {
  return [task.orderId, formatTimestamp(task.updatedAt)]
    .filter((value): value is string => Boolean(value))
    .join(" · ");
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
  action: "accept" | "reject",
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

function formatDisabledReasonCode(reason: string | undefined) {
  if (!reason) {
    return "目前暫不開放此操作";
  }

  switch (reason) {
    case "platform_accept_not_supported":
      return "此平台不支援司機端接單 relay";
    case "platform_reject_not_supported":
      return "此平台不支援司機端婉拒 relay";
    case "platform_reauth_required":
      return "平台需要重新授權後才能回覆";
    case "platform_sync_issue":
      return "平台同步異常，請依派車台指示處理";
    case "platform_mirror_only":
      return "此訂單目前僅提供鏡像查閱";
    default:
      return humanizeCode(reason);
  }
}

function buildActionDescriptors(
  task: UnifiedDriverTaskView,
): ResourceActionDescriptor[] {
  const descriptors: ResourceActionDescriptor[] = task.allowedActions.map(
    (action: DriverTaskAction) => ({
      action,
      enabled: true,
      riskLevel: action === "accept" || action === "reject" ? "medium" : "low",
    }),
  );

  if (!isOwnedTask(task) && task.driverActionState === "action_required") {
    const hasAccept = descriptors.some((item) => item.action === "accept");
    const hasReject = descriptors.some((item) => item.action === "reject");
    const disabledReasonCode = task.requiresReauth
      ? "platform_reauth_required"
      : hasSyncIssue(task)
        ? "platform_sync_issue"
        : "platform_mirror_only";

    if (!hasAccept) {
      descriptors.push({
        action: "accept",
        enabled: false,
        disabledReasonCode:
          disabledReasonCode === "platform_mirror_only"
            ? "platform_accept_not_supported"
            : disabledReasonCode,
        riskLevel: "medium",
      });
    }
    if (!hasReject) {
      descriptors.push({
        action: "reject",
        enabled: false,
        disabledReasonCode:
          disabledReasonCode === "platform_mirror_only"
            ? "platform_reject_not_supported"
            : disabledReasonCode,
        riskLevel: "medium",
      });
    }
  }

  return descriptors;
}

function getActionDescriptor(
  task: UnifiedDriverTaskView,
  action: DriverTaskAction,
) {
  return buildActionDescriptors(task).find((item) => item.action === action);
}

function inferEmptyReason(
  tasks: UnifiedDriverTaskView[],
  selectedFilter: TaskFilterValue,
): EmptyReason {
  if (selectedFilter !== "all") {
    return "filtered_empty";
  }

  if (tasks.some((task) => hasSyncIssue(task))) {
    return "external_unavailable";
  }

  return "no_data";
}

function buildRefreshMetadata(
  generatedAt: string,
  fallbackMode: boolean,
): UiRefreshMetadata {
  return {
    generatedAt,
    staleAfterMs: POLL_INTERVAL_MS,
    dataFreshness: fallbackMode ? "degraded" : "fresh",
    source: fallbackMode ? "cache" : "live",
  };
}

function parseTaskEnvelope(
  payload: unknown,
  selectedFilter: TaskFilterValue,
): TaskInboxEnvelope | null {
  if (!payload || typeof payload !== "object") {
    return null;
  }

  const record = payload as Record<string, unknown>;
  const items = Array.isArray(record.items)
    ? (record.items as UnifiedDriverTaskView[])
    : null;
  if (!items) {
    return null;
  }

  const generatedAt =
    typeof record.generatedAt === "string"
      ? record.generatedAt
      : typeof (record.refresh as Record<string, unknown> | undefined)
            ?.generatedAt === "string"
        ? ((record.refresh as Record<string, unknown>).generatedAt as string)
        : new Date().toISOString();

  const refresh = {
    ...buildRefreshMetadata(generatedAt, false),
    ...(record.refresh && typeof record.refresh === "object"
      ? (record.refresh as Partial<UiRefreshMetadata>)
      : null),
  };

  const empty =
    record.empty && typeof record.empty === "object"
      ? (record.empty as EmptyStateEnvelope)
      : items.length === 0
        ? {
            reason: inferEmptyReason(items, selectedFilter),
            messageCode: "driver.jobs.empty",
          }
        : null;

  return {
    items,
    refresh,
    refreshTier: "medium",
    empty,
  };
}

function getRefreshState(refresh: UiRefreshMetadata) {
  if (refresh.dataFreshness === "degraded") {
    return "degraded";
  }
  if (refresh.dataFreshness === "unknown") {
    return "unknown";
  }

  const generatedAt = Date.parse(refresh.generatedAt);
  if (Number.isNaN(generatedAt)) {
    return "unknown";
  }

  if (Date.now() - generatedAt > refresh.staleAfterMs) {
    return "stale";
  }

  return refresh.dataFreshness;
}

function EmptyStateCard({
  reason,
  onRetry,
  onOpenPlatform,
  onOpenTrip,
}: {
  reason: EmptyReason;
  onRetry: () => void;
  onOpenPlatform: () => void;
  onOpenTrip: () => void;
}) {
  const config: Record<
    EmptyReason,
    {
      icon: keyof typeof Ionicons.glyphMap;
      tone: "info" | "warn" | "danger";
      title: string;
      body: string;
      action: {
        label: string;
        onPress: () => void;
      };
    }
  > = {
    no_data: {
      icon: "moon-outline" as const,
      tone: "info" as const,
      title: "目前沒有任務",
      body: "現在沒有待處理或進行中的任務。保持在線，新的派單會透過 push 與收件匣同步進來。",
      action: {
        label: "重新整理",
        onPress: onRetry,
      },
    },
    filtered_empty: {
      icon: "funnel-outline" as const,
      tone: "info" as const,
      title: "此篩選下沒有任務",
      body: "目前沒有符合這個條件的任務。可切回其他分類，或等待下一次自動同步。",
      action: {
        label: "重新整理",
        onPress: onRetry,
      },
    },
    fetch_failed: {
      icon: "cloud-offline-outline" as const,
      tone: "danger" as const,
      title: "任務收件匣載入失敗",
      body: "目前無法取得最新任務。請重新整理；若持續失敗，請聯繫派車台確認平台狀態。",
      action: {
        label: "重新整理",
        onPress: onRetry,
      },
    },
    not_provisioned: {
      icon: "construct-outline" as const,
      tone: "warn" as const,
      title: "任務功能尚未啟用",
      body: "這台裝置或你的司機帳號尚未完成任務功能配置，暫時無法使用 unified inbox。",
      action: {
        label: "開啟行程",
        onPress: onOpenTrip,
      },
    },
    permission_denied: {
      icon: "lock-closed-outline" as const,
      tone: "danger" as const,
      title: "目前沒有權限查看任務",
      body: "帳號沒有存取這個收件匣所需的權限。請聯絡平台管理員或派車台確認司機配置。",
      action: {
        label: "重新整理",
        onPress: onRetry,
      },
    },
    external_unavailable: {
      icon: "alert-circle-outline" as const,
      tone: "warn" as const,
      title: "外部平台暫時不可用",
      body: "平台或同步適配器目前異常。你仍會看到安全鏡像，但後續動作需依派車台指示處理。",
      action: {
        label: "平台狀態",
        onPress: onOpenPlatform,
      },
    },
    driver_not_eligible: {
      icon: "ban-outline" as const,
      tone: "warn" as const,
      title: "你目前不符合接單資格",
      body: "目前沒有任何平台或服務桶可派單給你。請先檢查平台資格、授權或上線狀態。",
      action: {
        label: "檢查平台",
        onPress: onOpenPlatform,
      },
    },
  };

  const current = config[reason];

  return (
    <Card style={styles.emptyCard}>
      <View style={styles.emptyIconWrap}>
        <Ionicons
          name={current.icon}
          size={22}
          color={
            current.tone === "danger"
              ? THEME.danger
              : current.tone === "warn"
                ? THEME.warn
                : THEME.info
          }
        />
      </View>
      <Text style={styles.emptyTitle}>{current.title}</Text>
      <Text style={styles.emptyBody}>{current.body}</Text>
      <Btn variant="primary" size="sm" onPress={current.action.onPress}>
        {current.action.label}
      </Btn>
    </Card>
  );
}

function TaskCard({
  task,
  order,
  highlighted,
  busy,
  onOpen,
  onAccept,
  onReject,
}: {
  task: UnifiedDriverTaskView;
  order: OwnedOrderRecord | null;
  highlighted: boolean;
  busy: boolean;
  onOpen: () => void;
  onAccept: () => void;
  onReject: () => void;
}) {
  const forwarded = !isOwnedTask(task);
  const syncIssue = hasSyncIssue(task);
  const platformClosed = isPlatformClosed(task);
  const authority = buildTaskAuthorityDescriptor(task);
  const acceptAction = getActionDescriptor(task, "accept");
  const rejectAction = getActionDescriptor(task, "reject");
  const fareLabel = order?.quotedFare ? formatMoney(order.quotedFare) : null;
  const deadlineLabel = formatRelativeDeadline(task.deadlineAt);
  const typeLabel = buildTypeLabel(order);
  const disabledHint =
    formatDisabledReasonCode(acceptAction?.disabledReasonCode) ||
    task.blockingReason ||
    null;

  return (
    <Card
      style={[
        styles.taskCard,
        forwarded ? styles.taskCardForwarded : styles.taskCardOwned,
        syncIssue ? styles.taskCardSync : null,
        highlighted ? styles.taskCardHighlighted : null,
        platformClosed ? styles.taskCardClosed : null,
      ]}
      padding={16}
    >
      <Pressable onPress={onOpen}>
        <View style={styles.cardTopRow}>
          <View style={styles.cardTopLead}>
            <PlatformBadge
              code={getTaskPlatformCode(task)}
              name={getTaskPlatformName(task)}
              forwarded={forwarded}
              size="sm"
            />
            <Pill tone={getTaskPillTone(task)} dot>
              {syncIssue
                ? "同步異常"
                : task.nativeStatus
                  ? formatStatusLabel(task.nativeStatus)
                  : formatActionStateLabel(task.driverActionState)}
            </Pill>
          </View>
          <Text style={styles.cardTaskCode}>{task.taskId}</Text>
        </View>

        <View style={styles.cardCopy}>
          <Text style={styles.cardTitle}>{buildTaskTitle(task)}</Text>
          <Text style={styles.cardSubtitle}>{buildTaskSubtitle(task)}</Text>
          <Text style={styles.cardMeta}>{buildCardMeta(task)}</Text>
        </View>

        <View style={styles.cardPillRow}>
          <Pill tone={forwarded ? "accent" : "info"}>
            {forwarded ? "Forwarded" : "Owned"}
          </Pill>
          <Pill tone="neutral">{typeLabel}</Pill>
          {task.routeLocked ? <Pill tone="warn">路線鎖定</Pill> : null}
          {order?.fixedPrice ? <Pill tone="info">固定車資</Pill> : null}
        </View>

        <View style={styles.cardSummaryGrid}>
          <View style={styles.summaryChip}>
            <Text style={styles.summaryChipLabel}>狀態</Text>
            <Text style={styles.summaryChipValue}>
              {formatActionStateLabel(task.driverActionState)}
            </Text>
          </View>
          <View style={styles.summaryChip}>
            <Text style={styles.summaryChipLabel}>原生狀態</Text>
            <Text style={styles.summaryChipValue}>
              {task.nativeStatus
                ? formatStatusLabel(task.nativeStatus)
                : "DRTS 主控"}
            </Text>
          </View>
          <View style={styles.summaryChip}>
            <Text style={styles.summaryChipLabel}>車資</Text>
            <Text style={styles.summaryChipValue}>{fareLabel ?? "待同步"}</Text>
          </View>
          <View style={styles.summaryChip}>
            <Text style={styles.summaryChipLabel}>時效</Text>
            <Text style={styles.summaryChipValue}>
              {deadlineLabel ?? "一般"}
            </Text>
          </View>
        </View>

        <AuthorityBanner
          title={authority.title}
          authorityLabel={authority.authorityLabel}
          description={authority.description}
          tone={authority.tone}
          icon={authority.icon}
          style={styles.authorityCard}
        />

        <Text style={styles.cardHint}>
          下一步 · {buildAllowedActionSummary(task)}
        </Text>
        {disabledHint &&
        forwarded &&
        (acceptAction?.enabled === false || rejectAction?.enabled === false) ? (
          <Text style={styles.cardDisabledReason}>{disabledHint}</Text>
        ) : null}
      </Pressable>

      <View style={styles.cardFooter}>
        <Btn variant="secondary" size="sm" onPress={onOpen}>
          {driverStrings.jobs.openCurrentTrip}
        </Btn>

        {forwarded ? (
          <View style={styles.forwardedActionRow}>
            {rejectAction ? (
              <Btn
                variant="secondary"
                size="sm"
                disabled={busy || !rejectAction.enabled}
                onPress={onReject}
              >
                {busy ? "提交中…" : "婉拒"}
              </Btn>
            ) : null}
            {acceptAction ? (
              <Btn
                variant="primary"
                size="sm"
                disabled={busy || !acceptAction.enabled}
                onPress={onAccept}
              >
                {busy ? "提交中…" : "接受"}
              </Btn>
            ) : null}
          </View>
        ) : null}
      </View>
    </Card>
  );
}

export default function JobsScreen() {
  const router = useRouter();
  const params = useLocalSearchParams<{ taskId?: string | string[] }>();
  const highlightedTaskId = Array.isArray(params.taskId)
    ? params.taskId[0]
    : params.taskId;

  const [selectedFilter, setSelectedFilter] = useState<TaskFilterValue>("all");
  const [tasksEnabled, setTasksEnabled] = useState(true);
  const [loading, setLoading] = useState(true);
  const [refreshing, setRefreshing] = useState(false);
  const [fallbackMode, setFallbackMode] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [activeNotice, setActiveNotice] = useState<InlineNotice | null>(null);
  const [submittingTaskId, setSubmittingTaskId] = useState<string | null>(null);
  const [orderMap, setOrderMap] = useState<Record<string, OwnedOrderRecord>>(
    {},
  );
  const [envelope, setEnvelope] = useState<TaskInboxEnvelope>({
    items: [],
    refresh: buildRefreshMetadata(new Date().toISOString(), false),
    refreshTier: "medium",
    empty: null,
  });

  const filteredTasks = useMemo(
    () =>
      [
        ...envelope.items.filter((task) => matchesFilter(task, selectedFilter)),
      ].sort(compareTasks),
    [envelope.items, selectedFilter],
  );

  const summary = useMemo(() => {
    const tasks = envelope.items;
    return {
      total: tasks.length,
      needsAction: tasks.filter(isNeedsActionTask).length,
      external: tasks.filter((task) => !isOwnedTask(task)).length,
      syncIssue: tasks.filter(hasSyncIssue).length,
    };
  }, [envelope.items]);

  const refreshState = getRefreshState(envelope.refresh);

  const openTrip = (taskId?: string) => {
    const route = taskId
      ? (`/trip?taskId=${encodeURIComponent(taskId)}` as const)
      : "/trip";
    router.push(route);
  };

  const openPlatformPresence = () => {
    router.push("/platform-presence");
  };

  const loadTasks = async (nextFilter: TaskFilterValue) => {
    const client = getDriverClient();

    try {
      let nextEnvelope: TaskInboxEnvelope | null = null;
      let degraded = false;

      try {
        const payload = await client.get<unknown>("/api/driver/task-views");
        nextEnvelope = parseTaskEnvelope(payload, nextFilter);
      } catch {
        nextEnvelope = null;
      }

      if (!nextEnvelope) {
        try {
          const fetchedTasks = await client.listUnifiedDriverTasks();
          nextEnvelope = {
            items: fetchedTasks,
            refresh: buildRefreshMetadata(new Date().toISOString(), false),
            refreshTier: "medium",
            empty:
              fetchedTasks.length === 0
                ? {
                    reason: inferEmptyReason(fetchedTasks, nextFilter),
                    messageCode: "driver.jobs.empty",
                  }
                : null,
          };
        } catch {
          const legacyTasks = await client.listDriverTasks();
          const fallbackTasks = legacyTasks.map(buildFallbackUnifiedTaskView);
          degraded = true;
          nextEnvelope = {
            items: fallbackTasks,
            refresh: buildRefreshMetadata(new Date().toISOString(), true),
            refreshTier: "medium",
            empty:
              fallbackTasks.length === 0
                ? {
                    reason: inferEmptyReason(fallbackTasks, nextFilter),
                    messageCode: "driver.jobs.empty",
                  }
                : null,
          };
        }
      }

      const uniqueOrderIds = [
        ...new Set(
          nextEnvelope.items
            .map((task) => (isOwnedTask(task) ? task.orderId : null))
            .filter((value): value is string => Boolean(value)),
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

      const nextOrderMap: Record<string, OwnedOrderRecord> = {};
      orderResults.forEach(({ orderId, order }) => {
        if (order) {
          nextOrderMap[orderId] = order;
        }
      });

      setEnvelope(nextEnvelope);
      setOrderMap(nextOrderMap);
      setFallbackMode(degraded || nextEnvelope.refresh.source !== "live");
      setError(null);
    } catch (nextError: unknown) {
      setError(getErrorMessage(nextError) || "任務清單載入失敗。");
      setEnvelope((current) => ({
        ...current,
        empty: {
          reason: "fetch_failed",
          messageCode: "driver.jobs.fetch_failed",
        },
      }));
    }
  };

  useEffect(() => {
    const client = getDriverClient();

    client
      .isFeatureEnabled("driver-app.tasks")
      .then(async (enabled) => {
        setTasksEnabled(enabled);
        if (enabled) {
          await loadTasks(selectedFilter);
        } else {
          setEnvelope((current) => ({
            ...current,
            items: [],
            empty: {
              reason: "not_provisioned",
              messageCode: "driver.jobs.not_provisioned",
            },
          }));
        }
      })
      .catch(() => loadTasks(selectedFilter))
      .finally(() => setLoading(false));
  }, []);

  useEffect(() => {
    if (!tasksEnabled) {
      return;
    }

    const timer = setInterval(() => {
      void loadTasks(selectedFilter);
    }, POLL_INTERVAL_MS);

    return () => clearInterval(timer);
  }, [selectedFilter, tasksEnabled]);

  useEffect(() => {
    if (!loading) {
      setEnvelope((current) => ({
        ...current,
        empty:
          filteredTasks.length === 0
            ? {
                reason:
                  current.empty?.reason ??
                  inferEmptyReason(current.items, selectedFilter),
                messageCode: current.empty?.messageCode ?? "driver.jobs.empty",
              }
            : null,
      }));
    }
  }, [filteredTasks.length, loading, selectedFilter]);

  const onRefresh = async () => {
    setRefreshing(true);
    await loadTasks(selectedFilter);
    setRefreshing(false);
  };

  async function handleForwardedAction(
    task: UnifiedDriverTaskView,
    action: "accept" | "reject",
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
      await loadTasks(selectedFilter);
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

  function renderTopBanner() {
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
          title="目前顯示安全鏡像資料"
          body="已退回舊任務 API 或快取來源。forwarded 平台狀態可能較慢，請以派車台同步資訊為準。"
        />
      );
    }

    if (refreshState !== "fresh") {
      return (
        <Banner
          tone={refreshState === "stale" ? "warn" : "info"}
          icon={
            <Ionicons
              name="time-outline"
              size={15}
              color={refreshState === "stale" ? THEME.warn : THEME.info}
            />
          }
          title={
            refreshState === "stale" ? "任務資料可能已過期" : "任務資料等待同步"
          }
          body={`最近快照 ${formatTimestamp(envelope.refresh.generatedAt) ?? "未知"} · refresh tier T3 / 15s`}
          actions={
            <Btn variant="secondary" size="xs" onPress={() => void onRefresh()}>
              立即同步
            </Btn>
          }
        />
      );
    }

    return null;
  }

  return (
    <Shell contentContainerStyle={styles.shellContent}>
      <PageHeader
        title={driverStrings.jobs.title}
        subtitle="Unified task inbox"
        actions={
          <Btn
            variant="ghost"
            size="sm"
            icon={
              refreshing ? (
                <ActivityIndicator size="small" color={THEME.textMuted} />
              ) : (
                <Ionicons
                  name="refresh-outline"
                  size={14}
                  color={THEME.textMuted}
                />
              )
            }
            onPress={() => void onRefresh()}
            disabled={refreshing}
          >
            同步
          </Btn>
        }
      />

      {renderTopBanner()}

      <Card style={styles.heroCard}>
        <View style={styles.heroHeader}>
          <View style={styles.heroTitleWrap}>
            <Text style={styles.heroEyebrow}>T3 任務收件匣</Text>
            <Text style={styles.heroTitle}>跨自營與外部平台的下一步</Text>
            <Text style={styles.heroBody}>
              needs-action 會優先排序。來源平台任務保留 authority
              banner，接受/婉拒完全由 availableActions 決定。
            </Text>
          </View>
          <View style={styles.heroPillCol}>
            <Pill tone="accent">15s Poll</Pill>
            <Pill tone={refreshState === "fresh" ? "success" : "warn"}>
              {refreshState === "fresh" ? "Fresh" : "Stale"}
            </Pill>
          </View>
        </View>

        <View style={styles.kpiRow}>
          <KPI label={driverStrings.jobs.kpis.total} value={summary.total} />
          <KPI
            label={driverStrings.jobs.kpis.needsAction}
            value={summary.needsAction}
            deltaTone="neutral"
          />
          <KPI
            label={driverStrings.jobs.kpis.external}
            value={summary.external}
          />
          <KPI label="同步異常" value={summary.syncIssue} />
        </View>

        <View style={styles.heroMetaRow}>
          <Text style={styles.heroMetaText}>
            最近快照 {formatTimestamp(envelope.refresh.generatedAt) ?? "尚無"}
          </Text>
          <Text style={styles.heroMetaDivider}>·</Text>
          <Text style={styles.heroMetaText}>
            source {envelope.refresh.source}
          </Text>
        </View>
      </Card>

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
                styles.filterChip,
                selected ? styles.filterChipSelected : null,
              ]}
            >
              <Text
                style={[
                  styles.filterChipText,
                  selected ? styles.filterChipTextSelected : null,
                ]}
              >
                {option.label}
              </Text>
            </Pressable>
          );
        })}
      </ScrollView>

      {loading ? (
        <View style={styles.loadingState}>
          <ActivityIndicator size="large" color={THEME.accent} />
          <Text style={styles.loadingLabel}>載入任務中…</Text>
        </View>
      ) : !tasksEnabled || filteredTasks.length === 0 ? (
        <EmptyStateCard
          reason={envelope.empty?.reason ?? "no_data"}
          onRetry={() => void onRefresh()}
          onOpenPlatform={openPlatformPresence}
          onOpenTrip={() => openTrip()}
        />
      ) : (
        <View style={styles.taskStack}>
          {filteredTasks.map((task) => (
            <TaskCard
              key={task.taskId}
              task={task}
              order={orderMap[task.orderId] ?? null}
              highlighted={highlightedTaskId === task.taskId}
              busy={submittingTaskId === task.taskId}
              onOpen={() => openTrip(task.taskId)}
              onAccept={() => void handleForwardedAction(task, "accept")}
              onReject={() => void handleForwardedAction(task, "reject")}
            />
          ))}
        </View>
      )}

      {summary.syncIssue > 0 && !error ? (
        <Text style={styles.footerHint}>
          同步/授權異常 {summary.syncIssue}{" "}
          筆，請依卡片指示聯繫派車台或前往平台頁面重新授權。
        </Text>
      ) : null}
    </Shell>
  );
}

const styles = StyleSheet.create({
  shellContent: {
    gap: 12,
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
  heroCard: {
    borderRadius: 20,
    backgroundColor: "#EAF6FF",
    borderColor: "#CFE7FA",
  },
  heroHeader: {
    flexDirection: "row",
    gap: 12,
    alignItems: "flex-start",
  },
  heroTitleWrap: {
    flex: 1,
    gap: 4,
  },
  heroEyebrow: {
    fontSize: 11,
    lineHeight: 14,
    fontWeight: "700",
    letterSpacing: 0.6,
    color: "#2B6B94",
  },
  heroTitle: {
    fontSize: 20,
    lineHeight: 24,
    fontWeight: "700",
    color: THEME.text,
  },
  heroBody: {
    fontSize: 12.5,
    lineHeight: 18,
    color: THEME.textMuted,
  },
  heroPillCol: {
    gap: 6,
    alignItems: "flex-end",
  },
  kpiRow: {
    flexDirection: "row",
    flexWrap: "wrap",
    gap: 8,
    marginTop: 14,
  },
  heroMetaRow: {
    marginTop: 10,
    flexDirection: "row",
    flexWrap: "wrap",
    gap: 6,
    alignItems: "center",
  },
  heroMetaText: {
    fontSize: 11.5,
    lineHeight: 15,
    color: "#476A83",
    fontFamily: THEME.monoFamily,
  },
  heroMetaDivider: {
    fontSize: 11.5,
    lineHeight: 15,
    color: "#7E9CB0",
  },
  filterRow: {
    marginHorizontal: -2,
  },
  filterRowContent: {
    flexDirection: "row",
    gap: 8,
    paddingBottom: 2,
  },
  filterChip: {
    paddingHorizontal: 14,
    paddingVertical: 8,
    borderRadius: 999,
    backgroundColor: THEME.surface,
    borderWidth: 1,
    borderColor: THEME.border,
  },
  filterChipSelected: {
    backgroundColor: THEME.accent,
    borderColor: THEME.accent,
  },
  filterChipText: {
    fontSize: 12.5,
    lineHeight: 16,
    fontWeight: "600",
    color: THEME.textMuted,
  },
  filterChipTextSelected: {
    color: "#FFFFFF",
  },
  taskStack: {
    gap: 12,
  },
  taskCard: {
    borderRadius: 18,
  },
  taskCardOwned: {
    borderColor: "#CDE4F7",
  },
  taskCardForwarded: {
    borderColor: "#ADD7F6",
    backgroundColor: "#F4FAFF",
  },
  taskCardSync: {
    borderColor: THEME.warn,
  },
  taskCardHighlighted: {
    shadowColor: "#2C87C5",
    shadowOffset: { width: 0, height: 4 },
    shadowOpacity: 0.18,
    shadowRadius: 14,
    elevation: 4,
  },
  taskCardClosed: {
    opacity: 0.75,
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
  cardTaskCode: {
    fontSize: 11,
    lineHeight: 14,
    fontWeight: "600",
    fontFamily: THEME.monoFamily,
    color: THEME.textDim,
  },
  cardCopy: {
    marginTop: 10,
    gap: 4,
  },
  cardTitle: {
    fontSize: 17,
    lineHeight: 22,
    fontWeight: "700",
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
    marginTop: 12,
  },
  cardSummaryGrid: {
    marginTop: 12,
    flexDirection: "row",
    flexWrap: "wrap",
    gap: 8,
  },
  summaryChip: {
    minWidth: "47%",
    flexGrow: 1,
    paddingHorizontal: 10,
    paddingVertical: 9,
    borderRadius: 12,
    backgroundColor: "#FFFFFFA8",
    borderWidth: 1,
    borderColor: "#D8E7F5",
    gap: 2,
  },
  summaryChipLabel: {
    fontSize: 10.5,
    lineHeight: 13,
    fontWeight: "700",
    color: THEME.textDim,
  },
  summaryChipValue: {
    fontSize: 12,
    lineHeight: 16,
    color: THEME.text,
  },
  authorityCard: {
    marginTop: 12,
  },
  cardHint: {
    marginTop: 10,
    fontSize: 12,
    lineHeight: 17,
    color: THEME.textMuted,
  },
  cardDisabledReason: {
    marginTop: 6,
    fontSize: 11.5,
    lineHeight: 16,
    color: THEME.warn,
  },
  cardFooter: {
    marginTop: 14,
    paddingTop: 12,
    borderTopWidth: StyleSheet.hairlineWidth,
    borderTopColor: THEME.border,
    flexDirection: "row",
    gap: 8,
    alignItems: "center",
    justifyContent: "space-between",
  },
  forwardedActionRow: {
    flexDirection: "row",
    gap: 8,
    flexWrap: "wrap",
  },
  emptyCard: {
    minHeight: 260,
    alignItems: "center",
    justifyContent: "center",
    gap: 12,
    borderRadius: 18,
    paddingHorizontal: 24,
    paddingVertical: 28,
  },
  emptyIconWrap: {
    width: 52,
    height: 52,
    borderRadius: 26,
    alignItems: "center",
    justifyContent: "center",
    backgroundColor: THEME.surface,
  },
  emptyTitle: {
    fontSize: 18,
    lineHeight: 22,
    fontWeight: "700",
    color: THEME.text,
    textAlign: "center",
  },
  emptyBody: {
    fontSize: 13,
    lineHeight: 19,
    color: THEME.textMuted,
    textAlign: "center",
  },
  footerHint: {
    fontSize: 11.5,
    lineHeight: 17,
    color: THEME.textDim,
    paddingBottom: 6,
  },
});
