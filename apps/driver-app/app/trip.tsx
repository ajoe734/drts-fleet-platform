import { useEffect, useRef, useState } from "react";
import {
  ActivityIndicator,
  Alert,
  Image,
  StyleSheet,
  Text,
  View,
} from "react-native";
import { Ionicons } from "@expo/vector-icons";
import { useLocalSearchParams, useRouter } from "expo-router";
import * as ImagePicker from "expo-image-picker";
import type {
  DriverTaskAction,
  DriverTaskRecord,
  EmptyReason,
  ForwardedDriverActionOutcome,
  ForwardedDriverActionResponse,
  OwnedOrderRecord,
  UnifiedDriverTaskView,
} from "@drts/contracts";
import type { CanvasTone } from "@drts/ui-web/canvas-tokens";

import {
  Banner,
  Btn,
  Card,
  DL,
  Field,
  Input,
  PageHeader,
  Pill,
  Shell,
  driverCanvasTheme,
} from "@/components/canvas-primitives";
import { getPlatformDisplayLabel } from "@/components/platform-task-badge";
import {
  appendProofPhotos,
  buildCompletionExpenseItem,
  getCompletionProofRequirements,
  getCompletionSubmitBlocker,
  MAX_COMPLETION_PROOF_PHOTOS,
  normalizeCompletionProofText,
  parseCompletionExpenseAmountMinor,
  shouldDisableCompleteTripAction,
  shouldReloadTripAfterFailedAction,
  type ProofPhoto,
} from "@/lib/completion-proof";
import {
  acceptForwardedDriverOffer,
  getDriverClient,
  getDriverIdentityIssue,
  getPendingDriverTaskCompletion,
  rejectForwardedDriverOffer,
  replayPendingDriverTaskCompletion,
  submitDriverTaskCompletion,
} from "@/lib/api-client";
import {
  accumulateTripDistanceKm,
  calculateTripDurationSec,
  formatTripDistance,
  formatTripDuration,
  roundTripDistanceKm,
  type TripCoordinate,
} from "@/lib/trip-metrics";
import {
  getLatestDriverLocationUpdate,
  stopDriverLocationHeartbeat,
  subscribeToDriverLocationUpdates,
  syncDriverLocationHeartbeat,
} from "@/lib/driver-location-heartbeat";
import { resetDriverAppToOnboarding } from "@/lib/driver-identity-routing";
import {
  buildFallbackUnifiedDriverTaskView,
  hasUnifiedTaskSyncIssue,
  isOwnedUnifiedTask,
  sortUnifiedDriverTasks,
} from "@/lib/driver-workspace-cockpit";
import { formatMoney } from "@/lib/money";
import { formatDriverTaskStatusLabel } from "@/lib/operational-labels";
import {
  getTripExperienceState,
  getPrimaryTripAction,
  shouldShowTripCompletionProof,
  type TripExperienceState,
  type TripPrimaryActionKey,
} from "@/lib/trip-workflow";
import {
  driverForwardedTaskStatusLabels,
  driverStrings,
  driverTripActionSuccessLabels,
} from "@/lib/strings";
import { usePendingCompletionReplay } from "@/lib/use-pending-completion-replay";

function ActionButton({
  label,
  onPress,
  disabled = false,
  variant = "primary",
  loading = false,
}: {
  label: string;
  onPress: () => void;
  disabled?: boolean;
  variant?: "primary" | "secondary" | "danger";
  loading?: boolean;
}) {
  const isDanger = variant === "danger";

  return (
    <Btn
      theme={driverCanvasTheme}
      onPress={onPress}
      disabled={disabled}
      variant={variant === "primary" ? "primary" : "secondary"}
      danger={isDanger}
      size="md"
      icon={
        loading ? (
          <ActivityIndicator
            size="small"
            color={
              isDanger || variant === "primary"
                ? "#FFFFFF"
                : driverCanvasTheme.text
            }
          />
        ) : null
      }
      style={styles.actionButton}
    >
      {label}
    </Btn>
  );
}

function RouteMetricChip({
  label,
  value,
  mono = false,
}: {
  label: string;
  value: string;
  mono?: boolean;
}) {
  return (
    <View style={styles.routeMetricChip}>
      <Text style={styles.routeMetricLabel}>{label}</Text>
      <Text
        style={[
          styles.routeMetricValue,
          mono ? styles.routeMetricValueMono : null,
        ]}
      >
        {value}
      </Text>
    </View>
  );
}

function RouteStop({
  label,
  address,
  time,
  tone,
  last = false,
}: {
  label: string;
  address: string;
  time: string;
  tone: "pickup" | "dropoff";
  last?: boolean;
}) {
  const dotColor =
    tone === "pickup" ? driverCanvasTheme.success : driverCanvasTheme.danger;

  return (
    <View style={styles.routeStopRow}>
      <View style={styles.routeStopRail}>
        <View
          style={[
            styles.routeStopDot,
            {
              backgroundColor: dotColor,
              shadowColor: dotColor,
            },
          ]}
        />
        {last ? null : <View style={styles.routeStopConnector} />}
      </View>
      <View style={styles.routeStopCopy}>
        <Text style={styles.routeStopLabel}>{label}</Text>
        <Text style={styles.routeStopAddress}>{address}</Text>
        <Text style={styles.routeStopTime}>{time}</Text>
      </View>
    </View>
  );
}

function StatusDot({
  tone,
}: {
  tone: "success" | "warning" | "danger" | "neutral";
}) {
  const colorSet = getCanvasToneSet(toCanvasTone(tone));

  return (
    <View
      style={[
        styles.statusDot,
        {
          backgroundColor: colorSet.fg,
          shadowColor: colorSet.fg,
        },
      ]}
    />
  );
}

function RouteLockedBadge() {
  return (
    <Pill theme={driverCanvasTheme} tone="warn" dot>
      {driverStrings.trip.routeLocked}
    </Pill>
  );
}

function isForwardedTask(task: DriverTaskRecord | null): boolean {
  return task?.sourcePlatform != null;
}

function formatTripActionSuccessLabel(action: TripPrimaryActionKey): string {
  return driverTripActionSuccessLabels[action];
}

function getErrorMessage(error: unknown): string {
  if (error instanceof Error) {
    const apiMatch = /^API error \d+:\s*(.*)$/s.exec(error.message);
    if (apiMatch) {
      try {
        const payload = JSON.parse(apiMatch[1]) as {
          error?: { message?: string };
        };
        return payload.error?.message?.trim() || error.message;
      } catch {
        return error.message;
      }
    }
  }

  if (error instanceof Error) {
    return error.message;
  }

  return "Unknown error";
}

function getCanvasToneSet(tone: CanvasTone) {
  switch (tone) {
    case "success":
      return {
        fg: driverCanvasTheme.success,
        bg: driverCanvasTheme.successBg,
        bd: driverCanvasTheme.successBorder,
      };
    case "warn":
      return {
        fg: driverCanvasTheme.warn,
        bg: driverCanvasTheme.warnBg,
        bd: driverCanvasTheme.warnBorder,
      };
    case "danger":
      return {
        fg: driverCanvasTheme.danger,
        bg: driverCanvasTheme.dangerBg,
        bd: driverCanvasTheme.dangerBorder,
      };
    case "info":
      return {
        fg: driverCanvasTheme.info,
        bg: driverCanvasTheme.infoBg,
        bd: driverCanvasTheme.infoBorder,
      };
    case "accent":
      return {
        fg: driverCanvasTheme.accent,
        bg: driverCanvasTheme.accentBg,
        bd: driverCanvasTheme.accentBorder,
      };
    case "neutral":
    default:
      return {
        fg: driverCanvasTheme.textMuted,
        bg: driverCanvasTheme.neutralBg,
        bd: driverCanvasTheme.neutralBorder,
      };
  }
}

function toCanvasTone(tone: StatusTone): CanvasTone {
  switch (tone) {
    case "warning":
      return "warn";
    case "danger":
      return "danger";
    case "neutral":
      return "neutral";
    case "success":
    default:
      return "success";
  }
}

function toBannerTone(
  tone: StatusTone | CanvasTone,
): Exclude<CanvasTone, "neutral"> {
  if (tone === "warning" || tone === "warn") {
    return "warn";
  }
  if (tone === "danger") {
    return "danger";
  }
  if (tone === "success") {
    return "success";
  }
  if (tone === "accent") {
    return "accent";
  }
  return "info";
}

function formatShortTime(value: string | null | undefined): string | null {
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

function formatCompactDateTime(
  value: string | null | undefined,
): string | null {
  if (!value) {
    return null;
  }

  const parsed = new Date(value);
  if (Number.isNaN(parsed.getTime())) {
    return null;
  }

  return parsed.toLocaleString("zh-TW", {
    month: "numeric",
    day: "numeric",
    hour: "2-digit",
    minute: "2-digit",
  });
}

function formatPickupStopTime(order: OwnedOrderRecord | null): string {
  const start = formatShortTime(order?.reservationWindowStart);
  return start ? `預計 ${start}` : "時間待同步";
}

function formatDropoffStopTime(order: OwnedOrderRecord | null): string {
  const end = formatShortTime(order?.reservationWindowEnd);
  if (end) {
    return `預計 ${end}`;
  }
  if (order?.etaSnapshot?.etaMinutes != null) {
    return `約 ${order.etaSnapshot.etaMinutes} 分後`;
  }
  return "時間待同步";
}

function getTrackingDescriptor(
  isForwardedTrip: boolean,
  locationTrackingState: LocationTrackingState,
  locationTrackingMessage: string | null,
  recordingActive: boolean,
) {
  if (isForwardedTrip) {
    return {
      label: "未啟用",
      tone: "neutral" as const,
      detail: "來源平台任務不在此端啟用本地距離/時長追蹤。",
    };
  }

  if (recordingActive) {
    return {
      label: "錄製中",
      tone: "danger" as const,
      detail: locationTrackingMessage ?? "里程與時長正在即時更新。",
    };
  }

  if (locationTrackingState === "requesting_permission") {
    return {
      label: "等待授權",
      tone: "warning" as const,
      detail: "定位權限確認後，才會開始記錄實際里程與時長。",
    };
  }

  if (
    locationTrackingState === "permission_denied" ||
    locationTrackingState === "error"
  ) {
    return {
      label: "需處理",
      tone: "warning" as const,
      detail:
        locationTrackingMessage ??
        "定位追蹤暫時不可用，恢復後才能完整寫入行程資料。",
    };
  }

  return {
    label: "待開始",
    tone: "neutral" as const,
    detail: "開始行程後會切換為錄製中並持續更新度量。",
  };
}

type LocationTrackingState =
  | "idle"
  | "requesting_permission"
  | "active"
  | "permission_denied"
  | "error";

function parseStartedAtMs(task: DriverTaskRecord | null): number | null {
  if (!task?.startedAt) {
    return null;
  }

  const parsed = Date.parse(task.startedAt);
  return Number.isNaN(parsed) ? null : parsed;
}

function shouldShowTripMetrics(task: DriverTaskRecord | null): boolean {
  return Boolean(
    task?.status === "on_trip" ||
    task?.startedAt ||
    task?.actualDistanceKm != null ||
    task?.actualDurationSec != null,
  );
}

type StatusTone = "success" | "warning" | "danger" | "neutral";

function applyForwardedActionExperienceState(
  baseState: TripExperienceState | null,
  forwardedActionResult: ForwardedDriverActionResponse | null,
): TripExperienceState | null {
  if (!forwardedActionResult || baseState === "owned_active" || !baseState) {
    return baseState;
  }

  switch (forwardedActionResult.outcome) {
    case "accept_pending":
      return "forwarded_pending";
    case "confirmed_by_platform":
      return "forwarded_confirmed";
    case "completed_synced":
      return "forwarded_completed";
    case "lost_race":
      return "forwarded_lost";
    case "cancelled_by_platform":
      return "forwarded_cancelled";
    case "sync_failed":
      return "sync_failed";
    case "rejected":
      return "forwarded_cancelled";
  }

  return baseState;
}

function describeForwardedActionOutcome(
  outcome: ForwardedDriverActionOutcome,
  action: ForwardedDriverActionResponse["action"],
): { title: string; tone: StatusTone } {
  switch (outcome) {
    case "accept_pending":
      return { title: "已送出接單，等待平台確認", tone: "warning" };
    case "confirmed_by_platform":
      return { title: "平台已確認接單", tone: "success" };
    case "completed_synced":
      return { title: "平台已同步此訂單完成", tone: "neutral" };
    case "lost_race":
      return { title: "其他司機已被平台確認", tone: "neutral" };
    case "cancelled_by_platform":
      return { title: "來源平台已取消此訂單", tone: "neutral" };
    case "sync_failed":
      return { title: "平台同步異常，需派車台處理", tone: "danger" };
    case "rejected":
      return {
        title: action === "reject" ? "已婉拒此平台訂單" : "此訂單已不再可接單",
        tone: "neutral",
      };
  }

  return { title: "平台同步結果已更新", tone: "neutral" };
}

function getTripStatusPresentation(
  state: TripExperienceState | null,
  task: DriverTaskRecord | null,
  locationTrackingState: LocationTrackingState,
  locationTrackingMessage: string | null,
): {
  label: string;
  tone: StatusTone;
  detail: string;
} {
  switch (state) {
    case "forwarded_offered":
      return {
        label: "平台訂單可接單",
        tone: "warning",
        detail: "接受後將送交平台確認，可能被其他司機搶走。",
      };
    case "forwarded_pending":
      return {
        label: "等待平台確認",
        tone: "warning",
        detail: "已送出接單，請暫勿開始行程。",
      };
    case "forwarded_confirmed":
      return {
        label: "平台已確認",
        tone: "success",
        detail: "可依平台規則繼續本地行程流程。",
      };
    case "forwarded_completed":
      return {
        label: "平台已完成",
        tone: "neutral",
        detail: "此筆平台訂單已完結，本地僅保留同步結果。",
      };
    case "forwarded_lost":
      return {
        label: "其他司機已接",
        tone: "neutral",
        detail: "此筆平台訂單已結束，不需本地後續操作。",
      };
    case "forwarded_cancelled":
      return {
        label: "平台取消",
        tone: "neutral",
        detail: "來源平台已取消訂單，請等待下一筆任務。",
      };
    case "manual_fallback":
      return {
        label: "人工協調中",
        tone: "warning",
        detail: "派車台已發出即時指示，請依指示完成這筆平台任務。",
      };
    case "sync_failed":
      return {
        label: "同步異常",
        tone: "danger",
        detail: "需派車台處理，請等待指示。",
      };
    case "owned_active":
    default:
      switch (task?.status) {
        case "pending_acceptance":
          return {
            label: "待確認接單",
            tone: "warning",
            detail: "請先確認任務，接著前往取貨點。",
          };
        case "accepted":
        case "enroute_pickup":
          return {
            label: "前往取貨點",
            tone: "success",
            detail: "請依路線前往乘客或指定接送地點。",
          };
        case "arrived_pickup":
          return {
            label: "已抵達取貨點",
            tone: "success",
            detail: "確認乘客上車後即可開始行程。",
          };
        case "on_trip":
          if (locationTrackingState === "active") {
            return {
              label: "行程錄製中",
              tone: "success",
              detail: locationTrackingMessage ?? "里程與時長正在即時更新。",
            };
          }
          return {
            label: "行程進行中",
            tone: "success",
            detail: "定位追蹤啟用後，會持續寫入里程與時長。",
          };
        case "proof_pending":
          return {
            label: "待補完單佐證",
            tone: "warning",
            detail: "完單前需補齊照片、簽收或費用佐證。",
          };
        case "completed":
          return {
            label: "行程已完成",
            tone: "neutral",
            detail: "任務已完成，等待同步最新結果。",
          };
        default:
          return {
            label: formatDriverTaskStatusLabel(
              task?.status ?? "pending_acceptance",
            ),
            tone:
              String(task?.status ?? "") === "pending_acceptance"
                ? "warning"
                : "success",
            detail: "請依行程階段完成本地操作與完單佐證。",
          };
      }
  }
}

function getTripLockBody(state: TripExperienceState | null): {
  icon: keyof typeof Ionicons.glyphMap;
  title: string;
  detail: string;
} | null {
  switch (state) {
    case "forwarded_pending":
      return {
        icon: "time-outline",
        title: "正在等待平台確認…",
        detail: "平台回應前，請勿開始行程或手動變更狀態。",
      };
    case "forwarded_completed":
      return {
        icon: "checkmark-done-outline",
        title: "平台訂單已完成",
        detail: "此頁僅保留完結同步結果，本地不再提供後續操作。",
      };
    case "forwarded_lost":
      return {
        icon: "close-circle-outline",
        title: "未取得此訂單",
        detail: "平台已將訂單分配給其他司機，此頁僅保留同步結果。",
      };
    case "forwarded_cancelled":
      return {
        icon: "ban-outline",
        title: "平台已取消",
        detail: "此訂單不再有效，若資訊異常請聯繫派車台。",
      };
    case "manual_fallback":
      return null;
    case "sync_failed":
      return {
        icon: "alert-circle-outline",
        title: "同步異常",
        detail: "派車台正在處理平台同步，請等待進一步指示。",
      };
    default:
      return null;
  }
}

function getTripSurfacePalette(
  task: DriverTaskRecord | null,
  state: TripExperienceState | null,
) {
  switch (state) {
    case "manual_fallback":
      return {
        backgroundColor: driverCanvasTheme.warnBg,
        borderColor: driverCanvasTheme.warnBorder,
        accentColor: driverCanvasTheme.warn,
      };
    case "sync_failed":
      return {
        backgroundColor: driverCanvasTheme.dangerBg,
        borderColor: driverCanvasTheme.dangerBorder,
        accentColor: driverCanvasTheme.danger,
      };
    case "forwarded_pending":
      return {
        backgroundColor: driverCanvasTheme.warnBg,
        borderColor: driverCanvasTheme.warnBorder,
        accentColor: driverCanvasTheme.warn,
      };
    case "forwarded_confirmed":
      return {
        backgroundColor: driverCanvasTheme.successBg,
        borderColor: driverCanvasTheme.successBorder,
        accentColor: driverCanvasTheme.success,
      };
    case "forwarded_completed":
    case "forwarded_lost":
    case "forwarded_cancelled":
      return {
        backgroundColor: driverCanvasTheme.surfaceLo,
        borderColor: driverCanvasTheme.borderStrong,
        accentColor: driverCanvasTheme.textMuted,
      };
    case "forwarded_offered":
      return {
        backgroundColor: driverCanvasTheme.infoBg,
        borderColor: driverCanvasTheme.infoBorder,
        accentColor: driverCanvasTheme.info,
      };
    default:
      if (task?.sourcePlatform) {
        return {
          backgroundColor: driverCanvasTheme.infoBg,
          borderColor: driverCanvasTheme.infoBorder,
          accentColor: driverCanvasTheme.info,
        };
      }

      return {
        backgroundColor: driverCanvasTheme.accentBg,
        borderColor: driverCanvasTheme.accentBorder,
        accentColor: driverCanvasTheme.accent,
      };
  }
}

function getIdleBottomActionLabel(state: TripExperienceState | null) {
  switch (state) {
    case "forwarded_pending":
      return "等待平台確認";
    case "forwarded_confirmed":
      return "來源平台已確認";
    case "forwarded_completed":
      return "來源平台已完成";
    case "forwarded_lost":
      return "平台已交給其他司機";
    case "forwarded_cancelled":
      return "來源平台已取消";
    case "manual_fallback":
      return "依派車台指示處理";
    case "sync_failed":
      return "等待派車台處理";
    default:
      return "目前沒有可執行動作";
  }
}

type ManualFallbackRecord = {
  required?: boolean;
  reason?: string | null;
  requestedAt?: string | null;
  requestedBy?: string | null;
  notes?: string | null;
  issuedAt?: string | null;
  issuedBy?: string | null;
  expiresAt?: string | null;
};

function getManualFallbackRecord(
  task: DriverTaskRecord | null,
): ManualFallbackRecord | null {
  const record = (task as { manualFallback?: ManualFallbackRecord } | null)
    ?.manualFallback;
  if (!record) {
    return null;
  }

  return record;
}

function resolveUnifiedTripExperienceState(
  task: DriverTaskRecord | null,
  unifiedTask: UnifiedDriverTaskView | null,
): TripExperienceState | null {
  if (!task) {
    return null;
  }

  if (!unifiedTask) {
    return getTripExperienceState(task);
  }

  if (isOwnedUnifiedTask(unifiedTask)) {
    return "owned_active";
  }

  const nativeStatus = unifiedTask.nativeStatus?.trim().toLowerCase() ?? null;
  if (
    unifiedTask.requiresManualFallback ||
    getManualFallbackRecord(task)?.required ||
    nativeStatus === "manual_fallback"
  ) {
    return "manual_fallback";
  }
  if (hasUnifiedTaskSyncIssue(unifiedTask) || nativeStatus === "sync_failed") {
    return "sync_failed";
  }
  if (nativeStatus === "lost_race" || nativeStatus === "taken") {
    return "forwarded_lost";
  }
  if (
    nativeStatus === "cancelled" ||
    nativeStatus === "cancelled_by_platform"
  ) {
    return "forwarded_cancelled";
  }
  if (
    nativeStatus === "completed" ||
    nativeStatus === "completed_synced" ||
    task.status === "completed"
  ) {
    return "forwarded_completed";
  }

  switch (unifiedTask.driverActionState) {
    case "action_required":
      return "forwarded_offered";
    case "awaiting_platform":
      return "forwarded_pending";
    case "in_progress":
      return "forwarded_confirmed";
    case "completed":
      return "forwarded_completed";
    case "read_only":
      return "forwarded_cancelled";
    default:
      return getTripExperienceState(task);
  }
}

function formatCountdown(deadlineAt: string | null | undefined): string | null {
  if (!deadlineAt) {
    return null;
  }

  const remainingMs = Date.parse(deadlineAt) - Date.now();
  if (!Number.isFinite(remainingMs)) {
    return null;
  }

  const remainingSec = Math.max(0, Math.ceil(remainingMs / 1000));
  return `${String(remainingSec).padStart(2, "0")}s`;
}

function mapUnifiedTaskStatusToDriverTaskStatus(
  task: UnifiedDriverTaskView,
): DriverTaskRecord["status"] {
  if (task.orderDomain === "forwarded") {
    switch (task.driverActionState) {
      case "action_required":
        return "pending_acceptance";
      case "awaiting_platform":
        return "pending_acceptance";
      case "in_progress":
        return "accepted";
      case "completed":
        return "completed";
      case "read_only":
      case "blocked":
      default:
        return "pending_acceptance";
    }
  }

  switch (task.driverActionState) {
    case "action_required":
      return "pending_acceptance";
    case "in_progress":
      return "accepted";
    case "completed":
      return "completed";
    case "read_only":
    case "blocked":
    case "awaiting_platform":
    default:
      return "pending_acceptance";
  }
}

function buildSyntheticTaskFromUnifiedTask(
  task: UnifiedDriverTaskView,
): DriverTaskRecord {
  const status = mapUnifiedTaskStatusToDriverTaskStatus(task);
  const now = task.updatedAt;

  return {
    taskId: task.taskId,
    orderId: task.orderId,
    dispatchJobId: `unified-${task.taskId}`,
    assignmentId: `unified-${task.taskId}`,
    driverId: "unknown-driver",
    vehicleId: "unknown-vehicle",
    sourcePlatform: task.sourcePlatform === "drts" ? null : task.sourcePlatform,
    routeProvided: !task.routeLocked,
    waypoints: [],
    status,
    acceptedAt: status === "accepted" || status === "completed" ? now : null,
    departedAt: null,
    arrivedPickupAt: null,
    startedAt: status === "completed" ? now : null,
    completedAt: status === "completed" ? now : null,
    actualDistanceKm: null,
    actualDurationSec: null,
    fare: null,
    proof: null,
    forwardedStatus: task.nativeStatus,
  };
}

function getForwardedRelayUnavailableReason(
  task: UnifiedDriverTaskView | null,
  action: "accept" | "reject",
): string {
  if (task?.requiresReauth) {
    return "來源平台需要重新授權，恢復前無法 relay 司機操作。";
  }

  if (task?.blockingReason?.trim()) {
    return task.blockingReason.trim();
  }

  if (task?.syncIssueSummary?.trim()) {
    return task.syncIssueSummary.trim();
  }

  return action === "accept"
    ? "此來源平台目前不開放司機端 relay 接單。"
    : "此來源平台目前不開放司機端 relay 婉拒。";
}

function shouldOfferReturnToJobs(state: TripExperienceState | null): boolean {
  return (
    state === "forwarded_completed" ||
    state === "forwarded_lost" ||
    state === "forwarded_cancelled" ||
    state === "sync_failed"
  );
}

function mapPrimaryActionToUnifiedAction(
  action: TripPrimaryActionKey,
): DriverTaskAction {
  switch (action) {
    case "arrived":
      return "arrived_pickup";
    default:
      return action;
  }
}

function getEmptyStateCopy(reason: EmptyReason): {
  title: string;
  body: string;
} {
  switch (reason) {
    case "not_provisioned":
      return {
        title: "尚未完成司機綁定",
        body: "請先完成裝置註冊與司機綁定，才能查看行程作業。",
      };
    case "permission_denied":
      return {
        title: "目前無法讀取行程資料",
        body: "裝置登入或權限驗證已失效，請重新登入後再試。",
      };
    case "external_unavailable":
      return {
        title: "來源平台暫時不可用",
        body: "平台同步異常時，請等待派車台指示或稍後再重新整理。",
      };
    case "filtered_empty":
      return {
        title: "找不到指定任務",
        body: "這筆任務可能已結束、被其他流程接手，或不在目前同步範圍內。",
      };
    case "driver_not_eligible":
      return {
        title: "目前不可接這類任務",
        body: "平台資格或服務桶限制讓你暫時無法執行此行程。",
      };
    case "fetch_failed":
      return {
        title: "行程資料載入失敗",
        body: "請重新整理後再試；若持續失敗，請聯繫派車台。",
      };
    case "no_data":
    default:
      return {
        title: "目前沒有進行中的行程",
        body: "重新整理後可再次檢查是否有新任務同步進來。",
      };
  }
}

function getEmptyStateTone(
  reason: EmptyReason,
): Exclude<CanvasTone, "neutral"> {
  switch (reason) {
    case "permission_denied":
    case "fetch_failed":
      return "danger";
    case "external_unavailable":
    case "driver_not_eligible":
      return "warn";
    default:
      return "info";
  }
}

function getEmptyStateIcon(
  reason: EmptyReason,
): keyof typeof Ionicons.glyphMap {
  switch (reason) {
    case "not_provisioned":
      return "link-outline";
    case "permission_denied":
      return "lock-closed-outline";
    case "external_unavailable":
      return "cloud-offline-outline";
    case "filtered_empty":
      return "locate-outline";
    case "driver_not_eligible":
      return "ban-outline";
    case "fetch_failed":
      return "alert-circle-outline";
    case "no_data":
    default:
      return "car-sport-outline";
  }
}

function getActionDisplayLabel(action: string): string {
  switch (action) {
    case "accept":
      return "接受";
    case "reject":
      return "婉拒";
    case "depart":
      return "前往接送點";
    case "arrived_pickup":
      return "抵達上車點";
    case "start":
      return "開始行程";
    case "complete":
      return "完成行程";
    default:
      return action;
  }
}

function formatForwardedStatusLabel(status: string | null | undefined): string {
  if (!status?.trim()) {
    return "待同步";
  }

  const normalized = status.trim().toLowerCase();
  return (
    driverForwardedTaskStatusLabels[
      normalized as keyof typeof driverForwardedTaskStatusLabels
    ] ?? formatDriverTaskStatusLabel(status)
  );
}

type TripAuthorityBannerDescriptor = {
  title: string;
  authorityLabel: string;
  description: string;
  tone: Exclude<CanvasTone, "neutral">;
  icon: keyof typeof Ionicons.glyphMap;
};

function getTripAuthorityBannerProps(
  task: DriverTaskRecord | null,
  state: TripExperienceState | null,
): TripAuthorityBannerDescriptor {
  if (!task || !isForwardedTask(task)) {
    return {
      title: "自營派單",
      authorityLabel: "DRTS 行程主控",
      description:
        "完整本機操作權限。請依行程節點完成接單、接送、追蹤與完單佐證。",
      tone: "accent",
      icon: "shield-checkmark",
    };
  }

  switch (state) {
    case "forwarded_offered":
      return {
        title: "來源平台派單",
        authorityLabel: `平台 ${getPlatformDisplayLabel(task.sourcePlatform)}`,
        description:
          "此訂單由來源平台主導。接受後只會送出平台請求，仍可能被其他司機搶先確認。",
        tone: "info",
        icon: "swap-horizontal-outline",
      };
    case "forwarded_pending":
      return {
        title: "等待來源平台確認",
        authorityLabel: `平台 ${getPlatformDisplayLabel(task.sourcePlatform)}`,
        description:
          "已送出接單要求。平台回應前，司機端所有本地生命周期操作維持鎖定。",
        tone: "warn",
        icon: "time-outline",
      };
    case "forwarded_confirmed":
      return {
        title: "來源平台已確認",
        authorityLabel: `平台 ${getPlatformDisplayLabel(task.sourcePlatform)}`,
        description:
          "平台已確認此單。本地畫面會保留可讀的行程鏡像與後續節點，但仍需遵守平台規則。",
        tone: "success",
        icon: "checkmark-circle-outline",
      };
    case "forwarded_completed":
      return {
        title: "來源平台已完成",
        authorityLabel: `平台 ${getPlatformDisplayLabel(task.sourcePlatform)}`,
        description:
          "來源平台已完成此訂單。本地畫面只保留最終同步結果，不再開放操作。",
        tone: "info",
        icon: "checkmark-done-outline",
      };
    case "forwarded_lost":
      return {
        title: "平台已分配給其他司機",
        authorityLabel: `平台 ${getPlatformDisplayLabel(task.sourcePlatform)}`,
        description: "此筆平台訂單已結束，本地僅保留同步結果供查閱與追蹤。",
        tone: "warn",
        icon: "close-circle-outline",
      };
    case "forwarded_cancelled":
      return {
        title: "來源平台已取消",
        authorityLabel: `平台 ${getPlatformDisplayLabel(task.sourcePlatform)}`,
        description: "來源平台已取消訂單。本地不再提供任何後續行程操作。",
        tone: "warn",
        icon: "ban-outline",
      };
    case "manual_fallback":
      return {
        title: "平台人工協調中",
        authorityLabel: `平台 ${getPlatformDisplayLabel(task.sourcePlatform)}`,
        description:
          "平台同步改由派車台即時指示接手。請依 DriverOpsInstruction 完成安全必要步驟。",
        tone: "warn",
        icon: "construct-outline",
      };
    case "sync_failed":
      return {
        title: "平台同步異常",
        authorityLabel: `平台 ${getPlatformDisplayLabel(task.sourcePlatform)}`,
        description:
          "既有 sync_failed guardrail 保持鎖定；派車台接手處理前，司機端不開放本地狀態變更。",
        tone: "danger",
        icon: "alert-circle-outline",
      };
    default:
      return {
        title: "平台鏡像任務",
        authorityLabel: `平台 ${getPlatformDisplayLabel(task.sourcePlatform)}`,
        description: "來源平台仍是此任務的權限來源，本地只顯示安全同步資訊。",
        tone: "info",
        icon: "swap-horizontal-outline",
      };
  }
}

export default function TripScreen() {
  const params = useLocalSearchParams<{
    taskId?: string;
    emptyReason?: string;
  }>();
  const selectedTaskId =
    typeof params.taskId === "string" && params.taskId.trim()
      ? params.taskId.trim()
      : null;
  const forcedEmptyReason =
    typeof params.emptyReason === "string" && params.emptyReason.trim()
      ? (params.emptyReason.trim() as EmptyReason)
      : null;
  const [taskDetail, setTaskDetail] = useState<DriverTaskRecord | null>(null);
  const [unifiedTask, setUnifiedTask] = useState<UnifiedDriverTaskView | null>(
    null,
  );
  const [orderDetail, setOrderDetail] = useState<OwnedOrderRecord | null>(null);
  const [proofPhotos, setProofPhotos] = useState<ProofPhoto[]>([]);
  const [signoffReference, setSignoffReference] = useState("");
  const [expenseType, setExpenseType] = useState("");
  const [expenseAmount, setExpenseAmount] = useState("");
  const [expenseAttachmentRef, setExpenseAttachmentRef] = useState("");
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [emptyReason, setEmptyReason] = useState<EmptyReason | null>(null);
  const [lastRefreshedAt, setLastRefreshedAt] = useState<string | null>(null);
  const [submittingAction, setSubmittingAction] = useState<string | null>(null);
  const [forwardedActionResult, setForwardedActionResult] =
    useState<ForwardedDriverActionResponse | null>(null);
  const [liveDistanceKm, setLiveDistanceKm] = useState(0);
  const [liveDurationSec, setLiveDurationSec] = useState(0);
  const [locationTrackingState, setLocationTrackingState] =
    useState<LocationTrackingState>("idle");
  const [locationTrackingMessage, setLocationTrackingMessage] = useState<
    string | null
  >(null);
  const [trackingRetryKey, setTrackingRetryKey] = useState(0);
  const lastTrackedCoordinateRef = useRef<TripCoordinate | null>(null);
  const tripStartTimeRef = useRef<number | null>(null);
  const durationIntervalRef = useRef<ReturnType<typeof setInterval> | null>(
    null,
  );
  const router = useRouter();

  const proofRequirements = getCompletionProofRequirements(orderDetail);
  const proofRequirementsUnavailable = Boolean(
    taskDetail?.orderId && !orderDetail,
  );
  const remainingSlots = MAX_COMPLETION_PROOF_PHOTOS - proofPhotos.length;
  const missingRequiredPhotos = Math.max(
    proofRequirements.minPhotoCount - proofPhotos.length,
    0,
  );
  const isForwardedTrip = isForwardedTask(taskDetail);
  const isTripInProgress = !isForwardedTrip && taskDetail?.status === "on_trip";
  const showTripMetrics = !isForwardedTrip && shouldShowTripMetrics(taskDetail);
  const completionBlockedByTracking =
    isTripInProgress && locationTrackingState !== "active";
  const signoffRequirementMissing =
    proofRequirements.signoffRequired &&
    !normalizeCompletionProofText(signoffReference);
  const parsedExpenseAmountMinor =
    parseCompletionExpenseAmountMinor(expenseAmount);
  const expenseAttachmentId =
    normalizeCompletionProofText(expenseAttachmentRef);
  const expenseItem = buildCompletionExpenseItem({
    type: expenseType,
    amountText: expenseAmount,
    attachmentId: expenseAttachmentRef,
  });
  const expenseAmountInvalid =
    proofRequirements.expenseProofRequired &&
    expenseAmount.trim().length > 0 &&
    parsedExpenseAmountMinor == null;
  const expenseRequirementMissing =
    proofRequirements.expenseProofRequired && expenseItem == null;
  const proofBundleHasEvidence =
    proofPhotos.length > 0 ||
    Boolean(normalizeCompletionProofText(signoffReference)) ||
    Boolean(expenseItem);
  const baseTripExperienceState = resolveUnifiedTripExperienceState(
    taskDetail,
    unifiedTask,
  );
  const tripExperienceState = applyForwardedActionExperienceState(
    baseTripExperienceState,
    forwardedActionResult,
  );
  const rawPrimaryTripAction = getPrimaryTripAction(
    taskDetail,
    tripExperienceState,
  );
  const primaryTripAction =
    rawPrimaryTripAction &&
    (unifiedTask == null ||
      unifiedTask.allowedActions.includes(
        mapPrimaryActionToUnifiedAction(rawPrimaryTripAction.action),
      ))
      ? rawPrimaryTripAction
      : null;
  const tripStatusPresentation = getTripStatusPresentation(
    tripExperienceState,
    taskDetail,
    locationTrackingState,
    locationTrackingMessage,
  );
  const manualFallbackRecord = getManualFallbackRecord(taskDetail);
  const manualFallbackActive = Boolean(
    unifiedTask?.requiresManualFallback || manualFallbackRecord?.required,
  );
  const pendingCountdownLabel =
    tripExperienceState === "forwarded_pending"
      ? formatCountdown(unifiedTask?.deadlineAt)
      : null;
  const tripLockBody = getTripLockBody(tripExperienceState);
  const showCompletionProofCard = shouldShowTripCompletionProof(
    taskDetail,
    tripExperienceState,
  );
  const completionSubmitBlocker = getCompletionSubmitBlocker({
    proofRequirementsUnavailable,
    missingRequiredPhotos,
    signoffRequirementMissing,
    expenseRequirementMissing,
    expenseAmountInvalid,
    completionBlockedByTracking,
  });
  const tripSurfacePalette = getTripSurfacePalette(
    taskDetail,
    tripExperienceState,
  );
  const tripAuthorityBanner = getTripAuthorityBannerProps(
    taskDetail,
    tripExperienceState,
  );
  const headerSubtitle = taskDetail
    ? taskDetail.orderId
      ? `${taskDetail.taskId} · ${taskDetail.orderId}`
      : taskDetail.taskId
    : selectedTaskId
      ? `${driverStrings.trip.subtitle} · ${selectedTaskId}`
      : driverStrings.trip.subtitle;
  const forwardedOutcomeSummary = forwardedActionResult
    ? describeForwardedActionOutcome(
        forwardedActionResult.outcome,
        forwardedActionResult.action,
      )
    : null;
  const forwardedOutcomeTone = forwardedOutcomeSummary
    ? toBannerTone(forwardedOutcomeSummary.tone)
    : null;
  const pickupAddress =
    orderDetail?.pickup.address ?? unifiedTask?.pickupSummary ?? "待確認上車點";
  const dropoffAddress =
    orderDetail?.dropoff.address ??
    unifiedTask?.dropoffSummary ??
    "待確認下車點";
  const pickupTimeLabel = formatPickupStopTime(orderDetail);
  const dropoffTimeLabel = formatDropoffStopTime(orderDetail);
  const platformLabel = getPlatformDisplayLabel(taskDetail?.sourcePlatform);
  const nativeStatusLabel = isForwardedTrip
    ? formatForwardedStatusLabel(
        unifiedTask?.nativeStatus ?? taskDetail?.forwardedStatus ?? null,
      )
    : null;
  const localMirrorStatusLabel =
    unifiedTask != null
      ? formatDriverTaskStatusLabel(String(unifiedTask.localStatus))
      : taskDetail
        ? formatDriverTaskStatusLabel(taskDetail.status)
        : "待同步";
  const recordingActive =
    Boolean(orderDetail?.recordingId) ||
    (!isForwardedTrip && locationTrackingState === "active");
  const trackingDescriptor = getTrackingDescriptor(
    isForwardedTrip,
    locationTrackingState,
    locationTrackingMessage,
    recordingActive,
  );
  const allowedActions = unifiedTask?.allowedActions ?? [];
  const canRelayAccept =
    tripExperienceState === "forwarded_offered" &&
    allowedActions.includes("accept") &&
    forwardedActionResult === null;
  const canRelayReject =
    tripExperienceState === "forwarded_offered" &&
    allowedActions.includes("reject") &&
    forwardedActionResult === null;
  const relayAcceptUnavailableReason =
    tripExperienceState === "forwarded_offered" && !canRelayAccept
      ? getForwardedRelayUnavailableReason(unifiedTask, "accept")
      : null;
  const relayRejectUnavailableReason =
    tripExperienceState === "forwarded_offered" && !canRelayReject
      ? getForwardedRelayUnavailableReason(unifiedTask, "reject")
      : null;
  const emptyStateReason = emptyReason ?? "no_data";
  const emptyStateCopy = getEmptyStateCopy(emptyStateReason);
  const emptyStateTone = getEmptyStateTone(emptyStateReason);
  const emptyStateIcon = getEmptyStateIcon(emptyStateReason);
  const routeLocked = unifiedTask?.routeLocked ?? isForwardedTrip;
  const countdownExpired =
    tripExperienceState === "forwarded_pending" &&
    pendingCountdownLabel === "00s";
  const countdownTone = countdownExpired ? "danger" : "warn";
  const manualFallbackIssuedAt =
    formatCompactDateTime(manualFallbackRecord?.requestedAt) ??
    formatCompactDateTime(manualFallbackRecord?.issuedAt) ??
    formatCompactDateTime(
      (
        taskDetail as {
          manualFallbackInstruction?: { issuedAt?: string | null };
        } | null
      )?.manualFallbackInstruction?.issuedAt,
    );
  const manualFallbackExpiresAt =
    formatCompactDateTime(
      (
        taskDetail as {
          manualFallbackInstruction?: { expiresAt?: string | null };
        } | null
      )?.manualFallbackInstruction?.expiresAt,
    ) ?? formatCompactDateTime(manualFallbackRecord?.expiresAt);
  const manualFallbackIssuedBy =
    manualFallbackRecord?.requestedBy ??
    manualFallbackRecord?.issuedBy ??
    (
      taskDetail as {
        manualFallbackInstruction?: { issuedBy?: string | null };
      } | null
    )?.manualFallbackInstruction?.issuedBy ??
    "派車台";
  const availableActionSummary =
    allowedActions.length > 0
      ? allowedActions.map(getActionDisplayLabel).join(" / ")
      : "目前沒有本地可執行動作";
  const boundarySummaryItems = [
    {
      label: "可用操作",
      value: availableActionSummary,
    },
    ...(isForwardedTrip
      ? [
          {
            label: "平台狀態",
            value: nativeStatusLabel ?? "待同步",
          },
          {
            label: "本地鏡像",
            value: localMirrorStatusLabel,
          },
        ]
      : []),
    {
      label: "路線權限",
      value: routeLocked ? "來源平台鎖定" : "本地可執行",
    },
    {
      label: "同步頻率",
      value: "T1 · 3s",
      mono: true,
    },
    {
      label: "最近更新",
      value: formatCompactDateTime(lastRefreshedAt) ?? "待同步",
      mono: true,
    },
  ];
  const routeMetricDistance = showTripMetrics
    ? formatTripDistance(liveDistanceKm)
    : taskDetail?.actualDistanceKm != null
      ? formatTripDistance(taskDetail.actualDistanceKm)
      : "待同步";
  const routeMetricDuration = showTripMetrics
    ? formatTripDuration(liveDurationSec)
    : orderDetail?.etaSnapshot?.etaMinutes != null
      ? `${orderDetail.etaSnapshot.etaMinutes} 分`
      : isForwardedTrip
        ? "平台決定"
        : "開始行程後更新";
  const routeMetricFare = taskDetail?.fare
    ? formatMoney(taskDetail.fare)
    : orderDetail?.quotedFare
      ? formatMoney(orderDetail.quotedFare)
      : orderDetail?.fixedPrice
        ? "固定車資"
        : "金額待確認";
  const routeOverlayLabel =
    routeMetricDistance !== "待同步"
      ? `${routeMetricDistance} · ${routeMetricDuration}`
      : orderDetail?.etaSnapshot?.etaMinutes != null
        ? `ETA ${orderDetail.etaSnapshot.etaMinutes} 分`
        : routeMetricDuration;
  const footerNotice =
    completionSubmitBlocker === "proof_requirements_unavailable"
      ? "完單前需先載入訂單佐證需求，請重新整理後再送出。"
      : completionSubmitBlocker === "expense_amount_invalid"
        ? "費用金額格式無效，請輸入有效的正數後再完成行程。"
        : completionSubmitBlocker === "tracking_unavailable"
          ? (locationTrackingMessage ??
            "請先恢復定位追蹤，再完成行程並寫入距離與時長。")
          : proofRequirements.minPhotoCount > 0 && missingRequiredPhotos > 0
            ? `完單前仍需補上 ${missingRequiredPhotos} 張佐證照片。`
            : signoffRequirementMissing
              ? "此行程仍缺少簽收識別資料。"
              : expenseRequirementMissing
                ? "此行程仍缺少完整費用佐證。"
                : forwardedOutcomeSummary
                  ? (forwardedActionResult?.driverMessage ??
                    forwardedOutcomeSummary.title)
                  : manualFallbackActive
                    ? (manualFallbackRecord?.notes ??
                      manualFallbackRecord?.reason ??
                      unifiedTask?.syncIssueSummary ??
                      "請依派車台即時指示完成這筆平台任務。")
                    : relayAcceptUnavailableReason
                      ? relayAcceptUnavailableReason
                      : tripExperienceState === "forwarded_offered"
                        ? tripAuthorityBanner.description
                        : primaryTripAction
                          ? primaryTripAction.helperText
                          : tripStatusPresentation.detail;
  const completeActionDisabled =
    primaryTripAction?.action === "complete"
      ? shouldDisableCompleteTripAction({
          submittingAction,
          proofRequirementsUnavailable,
          missingRequiredPhotos,
          signoffRequirementMissing,
          expenseRequirementMissing,
          expenseAmountInvalid,
          completionBlockedByTracking,
        })
      : false;
  const returnToJobsAction = shouldOfferReturnToJobs(tripExperienceState)
    ? {
        title: "回任務清單",
        onPress: () => router.push("/jobs"),
      }
    : null;
  const bottomPrimaryAction = primaryTripAction
    ? {
        title:
          submittingAction === primaryTripAction.action &&
          primaryTripAction.action === "complete"
            ? "完成中…"
            : primaryTripAction.label,
        onPress: () => void handleAction(primaryTripAction.action),
        loading:
          submittingAction === primaryTripAction.action &&
          primaryTripAction.action !== "complete",
        disabled:
          primaryTripAction.action === "complete"
            ? completeActionDisabled
            : submittingAction !== null,
      }
    : tripExperienceState === "forwarded_offered"
      ? {
          title: canRelayAccept ? "接受平台訂單" : "平台接單受限",
          onPress: () =>
            canRelayAccept ? void handleForwardedAccept() : undefined,
          loading: canRelayAccept && submittingAction === "forwarded_accept",
          disabled: submittingAction !== null || !canRelayAccept,
        }
      : returnToJobsAction
        ? {
            title: returnToJobsAction.title,
            onPress: returnToJobsAction.onPress,
            loading: false,
            disabled: false,
          }
        : undefined;
  const bottomSecondaryAction =
    tripExperienceState === "forwarded_offered"
      ? {
          title: canRelayReject ? "婉拒平台訂單" : "婉拒不可用",
          onPress: () =>
            canRelayReject ? void handleForwardedReject() : undefined,
          variant: "secondary" as const,
          loading: canRelayReject && submittingAction === "forwarded_reject",
          disabled: submittingAction !== null || !canRelayReject,
        }
      : undefined;
  const statusPillTone = toCanvasTone(tripStatusPresentation.tone);
  const trackingPillTone = toCanvasTone(trackingDescriptor.tone);
  const trackingLabel = isForwardedTrip
    ? "追蹤 · 未啟用"
    : recordingActive
      ? "追蹤 · 開啟"
      : `追蹤 · ${trackingDescriptor.label}`;
  const proofSummaryItems = [
    {
      label: "照片需求",
      value: `${proofPhotos.length}/${Math.max(proofRequirements.minPhotoCount, 1)} 張`,
      mono: true,
    },
    {
      label: "簽收識別",
      value: proofRequirements.signoffRequired ? "需要" : "免附",
    },
    {
      label: "費用佐證",
      value: proofRequirements.expenseProofRequired ? "需要" : "免附",
    },
    {
      label: "送出狀態",
      value: completionSubmitBlocker ? "仍有缺口" : "可完成行程",
    },
  ];

  const emptyStatePrimaryAction =
    emptyStateReason === "not_provisioned"
      ? {
          label: "前往啟用",
          onPress: () => router.push("/onboarding"),
        }
      : emptyStateReason === "permission_denied"
        ? {
            label: "重新登入",
            onPress: () => void routeToOnboardingAfterSessionFailure(),
          }
        : emptyStateReason === "driver_not_eligible"
          ? {
              label: "查看平台狀態",
              onPress: () => router.push("/platform-presence"),
            }
          : emptyStateReason === "filtered_empty" ||
              emptyStateReason === "no_data"
            ? {
                label: "回任務清單",
                onPress: () => router.push("/jobs"),
              }
            : {
                label: driverStrings.common.refresh,
                onPress: () => void loadTrip(true),
              };

  function clearDurationTicker() {
    if (durationIntervalRef.current) {
      clearInterval(durationIntervalRef.current);
      durationIntervalRef.current = null;
    }
  }

  function syncTripMetricsFromTask(task: DriverTaskRecord | null) {
    tripStartTimeRef.current = parseStartedAtMs(task);
    setLiveDistanceKm(task?.actualDistanceKm ?? 0);
    setLiveDurationSec(
      task?.actualDurationSec ??
        calculateTripDurationSec(tripStartTimeRef.current),
    );
  }

  function resetCompletionDraft() {
    setProofPhotos([]);
    setSignoffReference("");
    setExpenseType("");
    setExpenseAmount("");
    setExpenseAttachmentRef("");
  }

  async function routeToOnboardingAfterSessionFailure() {
    await stopDriverLocationHeartbeat();
    clearDurationTicker();
    setLocationTrackingState("idle");
    setLocationTrackingMessage(null);
    lastTrackedCoordinateRef.current = null;
    resetDriverAppToOnboarding(router);
  }

  async function loadTrip(showSpinner: boolean) {
    if (showSpinner) {
      setLoading(true);
    }

    const client = getDriverClient();

    try {
      setError(null);
      setEmptyReason(null);

      let legacyTasks: DriverTaskRecord[] = [];
      let selectedUnifiedTask: UnifiedDriverTaskView | null = null;
      let unifiedTasksLoaded = false;

      try {
        const unifiedTasks = sortUnifiedDriverTasks(
          await client.listUnifiedDriverTasks(),
        );
        unifiedTasksLoaded = true;
        selectedUnifiedTask = selectedTaskId
          ? (unifiedTasks.find((task) => task.taskId === selectedTaskId) ??
            null)
          : (unifiedTasks[0] ?? null);
        setUnifiedTask(selectedUnifiedTask);
      } catch {
        setUnifiedTask(null);
      }

      legacyTasks = await client.listDriverTasks();
      const firstTask = selectedTaskId
        ? (legacyTasks.find((task) => task.taskId === selectedTaskId) ?? null)
        : (legacyTasks[0] ?? null);
      const resolvedTask =
        firstTask ??
        (selectedUnifiedTask
          ? buildSyntheticTaskFromUnifiedTask(selectedUnifiedTask)
          : null);
      setTaskDetail(resolvedTask);

      if (!selectedUnifiedTask && resolvedTask && firstTask) {
        setUnifiedTask(buildFallbackUnifiedDriverTaskView(resolvedTask));
      }

      if (!resolvedTask) {
        const nextEmptyReason =
          forcedEmptyReason ??
          (getDriverIdentityIssue()
            ? "permission_denied"
            : !unifiedTasksLoaded
              ? "external_unavailable"
              : selectedTaskId
                ? "filtered_empty"
                : "no_data");
        setEmptyReason(nextEmptyReason);
        setOrderDetail(null);
        setLastRefreshedAt(new Date().toISOString());
        return;
      }

      try {
        const order = (await client.getOrder(
          resolvedTask.orderId,
        )) as OwnedOrderRecord;
        setOrderDetail(order);
      } catch {
        setOrderDetail(null);
      }

      setLastRefreshedAt(new Date().toISOString());
    } catch (loadError) {
      setError(getErrorMessage(loadError));
      setTaskDetail(null);
      setUnifiedTask(null);
      setOrderDetail(null);
      setEmptyReason(forcedEmptyReason ?? "fetch_failed");
    } finally {
      setLoading(false);
    }
  }

  useEffect(() => {
    void loadTrip(true);
  }, [selectedTaskId, forcedEmptyReason]);

  useEffect(() => {
    if (loading) {
      return;
    }

    const intervalId = setInterval(() => {
      void loadTrip(false);
    }, 3000);

    return () => {
      clearInterval(intervalId);
    };
  }, [loading, selectedTaskId, forcedEmptyReason]);

  useEffect(() => {
    resetCompletionDraft();
    setForwardedActionResult(null);
  }, [taskDetail?.taskId]);

  useEffect(() => {
    syncTripMetricsFromTask(taskDetail);
  }, [
    taskDetail?.taskId,
    taskDetail?.actualDistanceKm,
    taskDetail?.actualDurationSec,
    taskDetail?.startedAt,
  ]);

  useEffect(() => {
    clearDurationTicker();

    if (!isTripInProgress) {
      return;
    }

    setLiveDurationSec(calculateTripDurationSec(tripStartTimeRef.current));
    durationIntervalRef.current = setInterval(() => {
      setLiveDurationSec(calculateTripDurationSec(tripStartTimeRef.current));
    }, 1000);

    return () => {
      clearDurationTicker();
    };
  }, [isTripInProgress, taskDetail?.taskId, taskDetail?.startedAt]);

  useEffect(() => {
    if (!isTripInProgress) {
      lastTrackedCoordinateRef.current = null;
      setLocationTrackingState("idle");
      setLocationTrackingMessage(null);
      void stopDriverLocationHeartbeat();
      return;
    }

    let cancelled = false;

    const beginLocationTracking = async () => {
      setLocationTrackingState("requesting_permission");
      setLocationTrackingMessage(null);

      try {
        const result = await syncDriverLocationHeartbeat(
          taskDetail
            ? {
                taskId: taskDetail.taskId,
                driverId: taskDetail.driverId,
              }
            : null,
        );

        if (cancelled) {
          return;
        }

        if (result.latestUpdate) {
          lastTrackedCoordinateRef.current = {
            latitude: result.latestUpdate.latitude,
            longitude: result.latestUpdate.longitude,
          };
        }

        setLocationTrackingState(result.status);
        setLocationTrackingMessage(result.message);
      } catch (trackingError) {
        if (cancelled) {
          return;
        }

        setLocationTrackingState("error");
        setLocationTrackingMessage(getErrorMessage(trackingError));
      }
    };

    void beginLocationTracking();

    return () => {
      cancelled = true;
    };
  }, [isTripInProgress, taskDetail?.taskId, trackingRetryKey]);

  useEffect(() => {
    if (!isTripInProgress) {
      lastTrackedCoordinateRef.current = null;
      return;
    }

    const seededUpdate = getLatestDriverLocationUpdate();
    if (seededUpdate) {
      lastTrackedCoordinateRef.current = {
        latitude: seededUpdate.latitude,
        longitude: seededUpdate.longitude,
      };
    }

    return subscribeToDriverLocationUpdates((update) => {
      const nextCoordinate = {
        latitude: update.latitude,
        longitude: update.longitude,
      };

      setLiveDistanceKm((currentDistanceKm) => {
        const updatedDistanceKm = accumulateTripDistanceKm(
          currentDistanceKm,
          lastTrackedCoordinateRef.current,
          nextCoordinate,
        );
        lastTrackedCoordinateRef.current = nextCoordinate;
        return updatedDistanceKm;
      });
    });
  }, [isTripInProgress, taskDetail?.taskId]);

  usePendingCompletionReplay({
    activeTaskId: taskDetail?.taskId ?? null,
    submittingAction,
    setSubmittingAction,
    getPendingCompletion: getPendingDriverTaskCompletion,
    replayPendingCompletion: replayPendingDriverTaskCompletion,
    getIdentityIssue: getDriverIdentityIssue,
    onReplayCompleted: async (replayedTask) => {
      if (replayedTask.status === "completed") {
        await stopDriverLocationHeartbeat();
        clearDurationTicker();
        setLocationTrackingState("idle");
        setLocationTrackingMessage(null);
        resetCompletionDraft();
        lastTrackedCoordinateRef.current = null;
      }

      await loadTrip(false);
    },
    onIdentityFailure: routeToOnboardingAfterSessionFailure,
    onReplayError: (error) => {
      setError(getErrorMessage(error));
    },
  });

  async function requestPhotoPermission(
    source: "camera" | "library",
  ): Promise<boolean> {
    const response =
      source === "camera"
        ? await ImagePicker.requestCameraPermissionsAsync()
        : await ImagePicker.requestMediaLibraryPermissionsAsync();

    if (response.granted) {
      return true;
    }

    Alert.alert(
      "需要權限",
      source === "camera"
        ? "需要相機權限才能拍攝行程佐證照片。"
        : "需要相簿權限才能附加行程佐證照片。",
    );
    return false;
  }

  async function pickProofPhotos(source: "camera" | "library") {
    if (remainingSlots <= 0) {
      Alert.alert(
        "已達照片上限",
        `最多只能附加 ${MAX_COMPLETION_PROOF_PHOTOS} 張佐證照片。`,
      );
      return;
    }

    const hasPermission = await requestPhotoPermission(source);
    if (!hasPermission) {
      return;
    }

    const result =
      source === "camera"
        ? await ImagePicker.launchCameraAsync({
            mediaTypes: ["images"],
            quality: 0.4,
            base64: true,
          })
        : await ImagePicker.launchImageLibraryAsync({
            mediaTypes: ["images"],
            quality: 0.4,
            base64: true,
            allowsMultipleSelection: true,
            selectionLimit: remainingSlots,
          });

    if (result.canceled || result.assets.length === 0) {
      return;
    }

    const { photos, rejected } = appendProofPhotos(proofPhotos, result.assets);
    setProofPhotos(photos);

    if (rejected.length > 0) {
      Alert.alert("部分照片已略過", rejected.join("\n"));
    }
  }

  function removeProofPhoto(index: number) {
    setProofPhotos((current) =>
      current.filter((_, currentIndex) => currentIndex !== index),
    );
  }

  async function handleAction(action: TripPrimaryActionKey) {
    if (!taskDetail?.taskId) {
      return;
    }

    const client = getDriverClient();
    const now = new Date().toISOString();

    try {
      setSubmittingAction(action);

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
          if (completionSubmitBlocker === "proof_requirements_unavailable") {
            Alert.alert(
              "行程資料暫時無法使用",
              "目前無法載入行程佐證需求，請先重新整理行程，再完成任務。",
            );
            return;
          }

          if (completionSubmitBlocker === "expense_amount_invalid") {
            Alert.alert(
              "費用金額無效",
              "請先輸入有效的正數費用金額，再完成此行程。",
            );
            return;
          }

          if (completionSubmitBlocker === "tracking_unavailable") {
            Alert.alert(
              "行程度量暫時無法使用",
              locationTrackingMessage ??
                (locationTrackingState === "requesting_permission"
                  ? "定位追蹤仍在啟動中，請稍候再試。"
                  : "請先啟用定位追蹤，再完成行程，才能記錄距離與時長。"),
            );
            return;
          }

          await submitDriverTaskCompletion(taskDetail.taskId, {
            completedAt: now,
            actualDistanceKm: roundTripDistanceKm(liveDistanceKm),
            actualDurationSec: calculateTripDurationSec(
              tripStartTimeRef.current,
            ),
            proof: proofBundleHasEvidence
              ? {
                  photos: proofPhotos.map((photo) => photo.base64),
                  signatureId:
                    normalizeCompletionProofText(signoffReference) ?? undefined,
                  expenseItems: expenseItem ? [expenseItem] : undefined,
                }
              : undefined,
          });
          break;
        default:
          return;
      }

      if (action === "complete") {
        await stopDriverLocationHeartbeat();
        clearDurationTicker();
        setLocationTrackingState("idle");
        setLocationTrackingMessage(null);
        resetCompletionDraft();
        lastTrackedCoordinateRef.current = null;
      }

      Alert.alert(
        "成功",
        `已完成操作：${formatTripActionSuccessLabel(action)}`,
      );
      await loadTrip(false);
    } catch (actionError) {
      const actionErrorMessage = getErrorMessage(actionError);

      if (getDriverIdentityIssue()) {
        await routeToOnboardingAfterSessionFailure();
        return;
      }

      if (shouldReloadTripAfterFailedAction(action)) {
        try {
          await loadTrip(false);
        } catch (reloadError) {
          console.warn(
            "Failed to refresh trip after a completion error.",
            reloadError,
          );
        }
      }

      Alert.alert("錯誤", actionErrorMessage);
    } finally {
      setSubmittingAction(null);
    }
  }

  async function handleForwardedAccept() {
    if (!taskDetail?.taskId) {
      return;
    }

    try {
      setSubmittingAction("forwarded_accept");
      const result = await acceptForwardedDriverOffer(taskDetail.taskId);
      setForwardedActionResult(result);
      setUnifiedTask(result.taskView ?? null);
      const summary = describeForwardedActionOutcome(result.outcome, "accept");
      Alert.alert(summary.title, result.driverMessage);
      await loadTrip(false);
    } catch (acceptError) {
      if (getDriverIdentityIssue()) {
        await routeToOnboardingAfterSessionFailure();
        return;
      }

      Alert.alert("錯誤", getErrorMessage(acceptError));
    } finally {
      setSubmittingAction(null);
    }
  }

  async function handleForwardedReject() {
    if (!taskDetail?.taskId) {
      return;
    }

    try {
      setSubmittingAction("forwarded_reject");
      const result = await rejectForwardedDriverOffer(
        taskDetail.taskId,
        "driver_declined_forwarded_offer",
      );
      setForwardedActionResult(result);
      setUnifiedTask(result.taskView ?? null);
      const summary = describeForwardedActionOutcome(result.outcome, "reject");
      Alert.alert(summary.title, result.driverMessage);
      await loadTrip(false);
    } catch (rejectError) {
      if (getDriverIdentityIssue()) {
        await routeToOnboardingAfterSessionFailure();
        return;
      }

      Alert.alert("錯誤", getErrorMessage(rejectError));
    } finally {
      setSubmittingAction(null);
    }
  }

  if (loading) {
    return (
      <Shell
        theme={driverCanvasTheme}
        contentContainerStyle={styles.shellContent}
      >
        <PageHeader title="進行中行程" subtitle="載入目前任務與路線狀態" />
        <Card theme={driverCanvasTheme}>
          <View style={styles.loadingState}>
            <ActivityIndicator size="large" color={driverCanvasTheme.accent} />
            <Text style={styles.loadingLabel}>載入行程中…</Text>
          </View>
        </Card>
      </Shell>
    );
  }

  return (
    <Shell
      theme={driverCanvasTheme}
      contentContainerStyle={styles.shellContent}
      footer={
        taskDetail ? (
          <View style={styles.footerBar}>
            <Text style={styles.footerNotice}>
              {bottomPrimaryAction || bottomSecondaryAction
                ? footerNotice
                : getIdleBottomActionLabel(tripExperienceState)}
            </Text>
            <View style={styles.footerButtons}>
              {bottomSecondaryAction ? (
                <ActionButton
                  label={bottomSecondaryAction.title}
                  onPress={bottomSecondaryAction.onPress}
                  disabled={bottomSecondaryAction.disabled}
                  loading={bottomSecondaryAction.loading}
                  variant="secondary"
                />
              ) : null}
              {bottomPrimaryAction ? (
                <ActionButton
                  label={bottomPrimaryAction.title}
                  onPress={bottomPrimaryAction.onPress}
                  disabled={bottomPrimaryAction.disabled}
                  loading={bottomPrimaryAction.loading}
                  variant="primary"
                />
              ) : (
                <ActionButton
                  label={getIdleBottomActionLabel(tripExperienceState)}
                  onPress={() => undefined}
                  disabled
                  variant="secondary"
                />
              )}
            </View>
          </View>
        ) : undefined
      }
    >
      <PageHeader
        title={driverStrings.trip.title}
        subtitle={headerSubtitle}
        actions={
          <View style={styles.headerActionRow}>
            <Btn
              theme={driverCanvasTheme}
              variant="ghost"
              size="sm"
              onPress={() => void loadTrip(true)}
              disabled={submittingAction !== null}
              icon={
                <Ionicons
                  name="refresh-outline"
                  size={14}
                  color={driverCanvasTheme.textMuted}
                />
              }
            >
              {driverStrings.common.refresh}
            </Btn>
            <Btn
              theme={driverCanvasTheme}
              variant="primary"
              size="sm"
              danger
              onPress={() => router.push("/incident")}
              icon={
                <Ionicons name="warning-outline" size={14} color="#FFFFFF" />
              }
            >
              SOS
            </Btn>
          </View>
        }
      />

      {error ? (
        <Banner
          theme={driverCanvasTheme}
          tone="danger"
          icon={
            <Ionicons
              name="alert-circle-outline"
              size={16}
              color={driverCanvasTheme.danger}
            />
          }
          title="資料同步異常"
          body={error}
        />
      ) : null}

      {taskDetail ? (
        <>
          <Banner
            theme={driverCanvasTheme}
            tone={tripAuthorityBanner.tone}
            icon={
              <Ionicons
                name={tripAuthorityBanner.icon}
                size={16}
                color={getCanvasToneSet(tripAuthorityBanner.tone).fg}
              />
            }
            title={
              <View style={styles.bannerTitleRow}>
                <Text style={styles.bannerTitleText}>
                  {tripAuthorityBanner.title}
                </Text>
                <Pill theme={driverCanvasTheme} tone="neutral">
                  {tripAuthorityBanner.authorityLabel}
                </Pill>
              </View>
            }
            body={tripAuthorityBanner.description}
          />

          <Card theme={driverCanvasTheme} padding={0} style={styles.mapCard}>
            <View
              style={[
                styles.mapSurface,
                {
                  backgroundColor: tripSurfacePalette.backgroundColor,
                  borderColor: tripSurfacePalette.borderColor,
                },
              ]}
            >
              <View
                style={[
                  styles.mapGlow,
                  {
                    backgroundColor: `${tripSurfacePalette.accentColor}1F`,
                  },
                ]}
              />
              <View style={styles.mapGrid} />
              <View
                style={[
                  styles.mapPath,
                  { borderColor: `${tripSurfacePalette.accentColor}80` },
                ]}
              />
              <View
                style={[
                  styles.mapMarker,
                  styles.mapMarkerPickup,
                  { backgroundColor: driverCanvasTheme.success },
                ]}
              />
              <View
                style={[
                  styles.mapMarker,
                  styles.mapMarkerDropoff,
                  { backgroundColor: driverCanvasTheme.danger },
                ]}
              />
              <View style={styles.mapBadge}>
                <Ionicons
                  name="location-outline"
                  size={12}
                  color={driverCanvasTheme.success}
                />
                <Text style={styles.mapBadgeText}>{routeOverlayLabel}</Text>
              </View>
            </View>
          </Card>

          <Card theme={driverCanvasTheme} padding={14} style={styles.routeCard}>
            <RouteStop
              label="取貨點"
              address={pickupAddress}
              time={pickupTimeLabel}
              tone="pickup"
            />
            <RouteStop
              label="送達點"
              address={dropoffAddress}
              time={dropoffTimeLabel}
              tone="dropoff"
              last
            />

            <View style={styles.routeMetricRow}>
              <RouteMetricChip label="距離" value={routeMetricDistance} />
              <RouteMetricChip label="時長" value={routeMetricDuration} />
              <RouteMetricChip label="車資" value={routeMetricFare} mono />
            </View>
          </Card>

          <Card
            theme={driverCanvasTheme}
            padding={14}
            style={styles.statusCard}
          >
            <View style={styles.statusHeaderRow}>
              <View style={styles.statusHeaderLead}>
                <StatusDot tone={tripStatusPresentation.tone} />
                <Text style={styles.statusHeaderText}>
                  {tripStatusPresentation.label}
                </Text>
              </View>
              <Text
                style={[
                  styles.statusHeaderMeta,
                  {
                    color: getCanvasToneSet(trackingPillTone).fg,
                  },
                ]}
              >
                {trackingLabel}
              </Text>
            </View>
            <View style={styles.statusPillRow}>
              <Pill theme={driverCanvasTheme} tone={statusPillTone} dot>
                {tripStatusPresentation.label}
              </Pill>
              <Pill
                theme={driverCanvasTheme}
                tone={isForwardedTrip ? "info" : "accent"}
              >
                {isForwardedTrip ? `平台 ${platformLabel}` : "自營派單"}
              </Pill>
              <Pill theme={driverCanvasTheme} tone="neutral">
                {formatDriverTaskStatusLabel(taskDetail.status)}
              </Pill>
              <Pill theme={driverCanvasTheme} tone="neutral">
                {taskDetail.taskId}
              </Pill>
              {isForwardedTrip ? <RouteLockedBadge /> : null}
              {recordingActive ? (
                <Pill theme={driverCanvasTheme} tone="danger" dot>
                  錄製中
                </Pill>
              ) : null}
            </View>
            <Text style={styles.statusDetailText}>
              {tripStatusPresentation.detail}
            </Text>
            <Text style={styles.statusMetaText}>
              {trackingDescriptor.detail}
            </Text>
            {!isForwardedTrip &&
            isTripInProgress &&
            (locationTrackingState === "permission_denied" ||
              locationTrackingState === "error") ? (
              <View style={styles.inlineActionRow}>
                <ActionButton
                  label="重試追蹤"
                  onPress={() => setTrackingRetryKey((current) => current + 1)}
                  disabled={submittingAction !== null}
                  variant="secondary"
                />
              </View>
            ) : null}
          </Card>

          {tripLockBody ? (
            <Card
              theme={driverCanvasTheme}
              padding={18}
              style={styles.lockCard}
            >
              <Ionicons
                name={tripLockBody.icon}
                size={28}
                color={tripSurfacePalette.accentColor}
              />
              <Text style={styles.lockCardTitle}>{tripLockBody.title}</Text>
              <Text style={styles.lockCardDetail}>{tripLockBody.detail}</Text>
            </Card>
          ) : null}

          {forwardedOutcomeSummary && forwardedOutcomeTone ? (
            <Banner
              theme={driverCanvasTheme}
              tone={forwardedOutcomeTone}
              icon={
                <Ionicons
                  name="checkmark-done-outline"
                  size={16}
                  color={getCanvasToneSet(forwardedOutcomeTone).fg}
                />
              }
              title={forwardedOutcomeSummary.title}
              body={
                <View style={styles.bannerBodyStack}>
                  <Text style={styles.bannerBodyText}>
                    {forwardedActionResult?.driverMessage}
                  </Text>
                  <Text style={styles.bannerMetaText}>
                    平台訂單編號：
                    {
                      forwardedActionResult?.managementCorrelationIds
                        .mirrorOrderId
                    }
                    {forwardedActionResult?.managementCorrelationIds
                      .reconciliationJobId
                      ? `／對帳工單 ${forwardedActionResult.managementCorrelationIds.reconciliationJobId}`
                      : ""}
                  </Text>
                </View>
              }
            />
          ) : null}

          {tripExperienceState === "forwarded_pending" ? (
            <Banner
              theme={driverCanvasTheme}
              tone={countdownTone}
              icon={
                <Ionicons
                  name={
                    countdownExpired ? "timer-outline" : "hourglass-outline"
                  }
                  size={16}
                  color={getCanvasToneSet(countdownTone).fg}
                />
              }
              title={
                countdownExpired
                  ? "平台尚未確認此單"
                  : `等待平台確認 · ${pendingCountdownLabel ?? "--"}`
              }
              body={
                countdownExpired
                  ? "平台未確認此單，請勿再回應，等待同步或派車台進一步指示。"
                  : "來源平台尚未完成確認。倒數期間請勿重複回應或手動變更本地狀態。"
              }
            />
          ) : null}

          {manualFallbackActive ? (
            <Banner
              theme={driverCanvasTheme}
              tone={tripExperienceState === "sync_failed" ? "danger" : "warn"}
              icon={
                <Ionicons
                  name="construct-outline"
                  size={16}
                  color={
                    getCanvasToneSet(
                      tripExperienceState === "sync_failed" ? "danger" : "warn",
                    ).fg
                  }
                />
              }
              title="派車台手動接手中"
              body={
                <View style={styles.bannerBodyStack}>
                  <Text style={styles.bannerBodyText}>
                    {manualFallbackRecord?.notes ??
                      manualFallbackRecord?.reason ??
                      unifiedTask?.syncIssueSummary ??
                      "請依派車台即時指示完成這筆平台任務。"}
                  </Text>
                  <Text style={styles.bannerMetaText}>
                    {`指派人員 ${manualFallbackIssuedBy}`}
                    {manualFallbackIssuedAt
                      ? ` · 發出 ${manualFallbackIssuedAt}`
                      : ""}
                    {manualFallbackExpiresAt
                      ? ` · 期限 ${manualFallbackExpiresAt}`
                      : ""}
                  </Text>
                </View>
              }
              actions={
                unifiedTask?.requiresReauth ? (
                  <Btn
                    theme={driverCanvasTheme}
                    variant="primary"
                    size="sm"
                    onPress={() => router.push("/platform-presence")}
                  >
                    處理授權
                  </Btn>
                ) : undefined
              }
            />
          ) : null}

          {unifiedTask?.requiresReauth && !manualFallbackActive ? (
            <Banner
              theme={driverCanvasTheme}
              tone="warn"
              icon={
                <Ionicons
                  name="key-outline"
                  size={16}
                  color={driverCanvasTheme.warn}
                />
              }
              title="來源平台需要重新授權"
              body="此平台目前需要重新授權，部分同步與 relay 動作可能受到限制。"
              actions={
                <Btn
                  theme={driverCanvasTheme}
                  variant="primary"
                  size="sm"
                  onPress={() => router.push("/platform-presence")}
                >
                  處理授權
                </Btn>
              }
            />
          ) : null}

          <Card
            theme={driverCanvasTheme}
            title={driverStrings.trip.sections.availableActions}
            subtitle="availableActions 與來源權限會一起決定這頁可做的事"
          >
            <DL
              theme={driverCanvasTheme}
              cols={2}
              items={boundarySummaryItems}
            />
            <View style={styles.boundaryPillRow}>
              {allowedActions.length > 0 ? (
                allowedActions.map((action) => (
                  <Pill
                    key={action}
                    theme={driverCanvasTheme}
                    tone="accent"
                    style={styles.boundaryActionPill}
                  >
                    {getActionDisplayLabel(action)}
                  </Pill>
                ))
              ) : (
                <Pill theme={driverCanvasTheme} tone="neutral">
                  無本地操作
                </Pill>
              )}
              {unifiedTask?.blockingReason ? (
                <Pill theme={driverCanvasTheme} tone="warn">
                  {unifiedTask.blockingReason}
                </Pill>
              ) : null}
              {unifiedTask?.requiresReauth ? (
                <Pill theme={driverCanvasTheme} tone="warn">
                  需重新授權
                </Pill>
              ) : null}
              {unifiedTask?.syncIssueSummary ? (
                <Pill theme={driverCanvasTheme} tone="danger">
                  需派車台處理
                </Pill>
              ) : null}
            </View>
            {unifiedTask?.syncIssueSummary ? (
              <Text style={styles.boundaryHintText}>
                {unifiedTask.syncIssueSummary}
              </Text>
            ) : null}
            {relayAcceptUnavailableReason ? (
              <Text style={styles.boundaryHintText}>
                Relay 接單受限：{relayAcceptUnavailableReason}
              </Text>
            ) : null}
            {relayRejectUnavailableReason &&
            relayRejectUnavailableReason !== relayAcceptUnavailableReason ? (
              <Text style={styles.boundaryHintText}>
                Relay 婉拒受限：{relayRejectUnavailableReason}
              </Text>
            ) : null}
          </Card>

          {!isForwardedTrip && showCompletionProofCard ? (
            <Card
              theme={driverCanvasTheme}
              title={driverStrings.trip.sections.completionProof}
              subtitle="照片、簽收與費用佐證"
            >
              {proofRequirementsUnavailable ? (
                <Banner
                  theme={driverCanvasTheme}
                  tone="danger"
                  title="需先載入訂單詳情"
                  body="確認完單 requirements 前，請先重新整理行程。"
                />
              ) : null}

              <DL
                theme={driverCanvasTheme}
                cols={2}
                items={proofSummaryItems}
              />

              {proofRequirements.minPhotoCount > 0 ? (
                <Banner
                  theme={driverCanvasTheme}
                  tone={missingRequiredPhotos > 0 ? "warn" : "success"}
                  title={`至少需要 ${proofRequirements.minPhotoCount} 張照片`}
                  body={
                    missingRequiredPhotos > 0
                      ? `完成前仍需補上 ${missingRequiredPhotos} 張佐證照片。`
                      : "已達照片需求。"
                  }
                />
              ) : null}

              {proofRequirements.signoffRequired ? (
                <View style={styles.fieldStack}>
                  <Field
                    theme={driverCanvasTheme}
                    label="簽收識別"
                    hint="乘客簽收或簽收單號"
                    required
                  >
                    <Input
                      theme={driverCanvasTheme}
                      value={signoffReference}
                      onChangeText={setSignoffReference}
                      editable={submittingAction === null}
                      ph="乘客簽收或簽收單號"
                      mono
                      autoCapitalize="characters"
                      autoCorrect={false}
                    />
                  </Field>
                  <Text style={styles.fieldFeedbackText}>
                    {signoffRequirementMissing
                      ? "尚未填寫簽收識別資料。"
                      : "簽收需求已完成。"}
                  </Text>
                </View>
              ) : null}

              {proofRequirements.expenseProofRequired ? (
                <View style={styles.fieldStack}>
                  <Field
                    theme={driverCanvasTheme}
                    label="費用類型"
                    hint="例如過路費或停車費"
                    required
                  >
                    <Input
                      theme={driverCanvasTheme}
                      value={expenseType}
                      onChangeText={setExpenseType}
                      editable={submittingAction === null}
                      ph="例如過路費或停車費"
                      autoCapitalize="none"
                      autoCorrect={false}
                    />
                  </Field>
                  <Field
                    theme={driverCanvasTheme}
                    label="金額"
                    hint="例如 40 或 40.50"
                    required
                  >
                    <Input
                      theme={driverCanvasTheme}
                      value={expenseAmount}
                      onChangeText={setExpenseAmount}
                      editable={submittingAction === null}
                      ph="例如 40 或 40.50"
                      mono
                      autoCapitalize="none"
                      autoCorrect={false}
                    />
                  </Field>
                  <Field
                    theme={driverCanvasTheme}
                    label="單據識別"
                    hint="單據或附件識別"
                    required
                  >
                    <Input
                      theme={driverCanvasTheme}
                      value={expenseAttachmentRef}
                      onChangeText={setExpenseAttachmentRef}
                      editable={submittingAction === null}
                      ph="單據或附件識別"
                      mono
                      autoCapitalize="characters"
                      autoCorrect={false}
                    />
                  </Field>
                  <Text style={styles.fieldFeedbackText}>
                    {expenseAmountInvalid
                      ? "請輸入有效的正數金額。"
                      : expenseRequirementMissing
                        ? "費用佐證資料尚未填完整。"
                        : expenseAttachmentId
                          ? `費用佐證已完成：${expenseAttachmentId}`
                          : "費用佐證已完成。"}
                  </Text>
                </View>
              ) : null}

              <View style={styles.inlineActionRow}>
                <ActionButton
                  label="拍照上傳"
                  onPress={() => void pickProofPhotos("camera")}
                  disabled={
                    submittingAction !== null ||
                    remainingSlots <= 0 ||
                    proofRequirementsUnavailable
                  }
                  variant="secondary"
                />
                <ActionButton
                  label="從相簿選取"
                  onPress={() => void pickProofPhotos("library")}
                  disabled={
                    submittingAction !== null ||
                    remainingSlots <= 0 ||
                    proofRequirementsUnavailable
                  }
                  variant="secondary"
                />
              </View>

              {proofPhotos.length > 0 ? (
                <View style={styles.photoGrid}>
                  {proofPhotos.map((photo, index) => (
                    <View
                      key={`${photo.uri}-${index}`}
                      style={styles.photoCard}
                    >
                      <Image
                        source={{ uri: photo.uri }}
                        style={styles.photoPreview}
                      />
                      <Text numberOfLines={1} style={styles.photoMeta}>
                        {Math.round(photo.estimatedBytes / 1024)} KB
                      </Text>
                      <ActionButton
                        label="移除"
                        onPress={() => removeProofPhoto(index)}
                        disabled={submittingAction !== null}
                        variant="secondary"
                      />
                    </View>
                  ))}
                </View>
              ) : (
                <View style={styles.emptyPhotoState}>
                  <Ionicons
                    name="images-outline"
                    size={20}
                    color={driverCanvasTheme.textDim}
                  />
                  <Text style={styles.emptyPhotoTitle}>尚未選取佐證照片</Text>
                  <Text style={styles.emptyPhotoBody}>
                    可從相機或相簿新增完單照片。
                  </Text>
                </View>
              )}
            </Card>
          ) : null}
        </>
      ) : (
        <Card theme={driverCanvasTheme} padding={18} style={styles.emptyCard}>
          <View
            style={[
              styles.emptyIconWrap,
              {
                backgroundColor: getCanvasToneSet(emptyStateTone).bg,
                borderColor: getCanvasToneSet(emptyStateTone).bd,
              },
            ]}
          >
            <Ionicons
              name={emptyStateIcon}
              size={24}
              color={getCanvasToneSet(emptyStateTone).fg}
            />
          </View>
          <Text style={styles.emptyEyebrow}>
            {emptyStateReason === "driver_not_eligible"
              ? "資格限制"
              : emptyStateReason === "external_unavailable"
                ? "平台同步"
                : emptyStateReason === "permission_denied"
                  ? "身份驗證"
                  : "行程作業"}
          </Text>
          <Text style={styles.emptyTitle}>{emptyStateCopy.title}</Text>
          <Text style={styles.emptyBody}>{emptyStateCopy.body}</Text>
          <Text style={styles.emptyMetaText}>
            Refresh tier: T1 / 3s
            {lastRefreshedAt
              ? ` · 最近更新 ${formatCompactDateTime(lastRefreshedAt)}`
              : ""}
          </Text>
          <View style={styles.inlineActionRow}>
            <ActionButton
              label={emptyStatePrimaryAction.label}
              onPress={emptyStatePrimaryAction.onPress}
              disabled={submittingAction !== null}
            />
            {emptyStateReason !== "fetch_failed" &&
            emptyStateReason !== "permission_denied" ? (
              <ActionButton
                label={driverStrings.common.refresh}
                onPress={() => void loadTrip(true)}
                disabled={submittingAction !== null}
                variant="secondary"
              />
            ) : null}
          </View>
        </Card>
      )}
    </Shell>
  );
}

const styles = StyleSheet.create({
  shellContent: {
    gap: 14,
    paddingBottom: 20,
  },
  actionButton: {
    flex: 1,
  },
  loadingState: {
    alignItems: "center",
    justifyContent: "center",
    minHeight: 220,
    gap: 12,
  },
  loadingLabel: {
    fontSize: 13,
    lineHeight: 18,
    color: driverCanvasTheme.textMuted,
    fontFamily: driverCanvasTheme.fontFamily,
  },
  headerActionRow: {
    flexDirection: "row",
    alignItems: "center",
    gap: 8,
  },
  bannerTitleRow: {
    flexDirection: "row",
    alignItems: "center",
    gap: 8,
    flexWrap: "wrap",
  },
  bannerTitleText: {
    fontSize: 13,
    lineHeight: 17,
    fontWeight: "700",
    color: driverCanvasTheme.text,
    fontFamily: driverCanvasTheme.fontFamily,
  },
  bannerBodyStack: {
    gap: 4,
  },
  bannerBodyText: {
    fontSize: 12.5,
    lineHeight: 18,
    color: driverCanvasTheme.text,
    fontFamily: driverCanvasTheme.fontFamily,
  },
  bannerMetaText: {
    fontSize: 11,
    lineHeight: 16,
    color: driverCanvasTheme.textMuted,
    fontFamily: driverCanvasTheme.monoFamily,
  },
  mapCard: {
    overflow: "hidden",
    borderRadius: 14,
  },
  mapSurface: {
    position: "relative",
    minHeight: 174,
    borderWidth: 1,
    borderColor: driverCanvasTheme.border,
    overflow: "hidden",
  },
  mapGlow: {
    position: "absolute",
    top: -68,
    right: -18,
    width: 200,
    height: 200,
    borderRadius: 999,
  },
  mapGrid: {
    ...StyleSheet.absoluteFillObject,
    margin: 10,
    borderRadius: 12,
    borderWidth: 1,
    borderStyle: "dashed",
    borderColor: "rgba(255,255,255,0.06)",
  },
  mapPath: {
    position: "absolute",
    top: 52,
    left: 54,
    width: 156,
    height: 68,
    borderWidth: 2,
    borderRadius: 30,
    transform: [{ rotate: "-12deg" }],
    opacity: 0.72,
  },
  mapMarker: {
    position: "absolute",
    width: 12,
    height: 12,
    borderRadius: 6,
    shadowOpacity: 0.38,
    shadowRadius: 6,
    shadowOffset: { width: 0, height: 0 },
    elevation: 2,
  },
  mapMarkerPickup: {
    top: 60,
    left: 66,
  },
  mapMarkerDropoff: {
    right: 56,
    bottom: 48,
  },
  mapBadge: {
    position: "absolute",
    bottom: 10,
    left: 10,
    flexDirection: "row",
    alignItems: "center",
    gap: 6,
    paddingHorizontal: 10,
    paddingVertical: 6,
    borderRadius: 8,
    backgroundColor: driverCanvasTheme.surface,
    borderWidth: 1,
    borderColor: driverCanvasTheme.border,
  },
  mapBadgeText: {
    fontSize: 11,
    lineHeight: 14,
    fontWeight: "700",
    color: driverCanvasTheme.text,
    fontFamily: driverCanvasTheme.monoFamily,
  },
  routeCard: {
    borderRadius: 14,
  },
  routeStopRow: {
    flexDirection: "row",
    gap: 10,
    alignItems: "flex-start",
  },
  routeStopRail: {
    width: 12,
    alignItems: "center",
    paddingTop: 4,
  },
  routeStopDot: {
    width: 12,
    height: 12,
    borderRadius: 6,
    shadowOpacity: 0.28,
    shadowRadius: 8,
    shadowOffset: { width: 0, height: 0 },
    elevation: 2,
  },
  routeStopConnector: {
    width: 1.5,
    minHeight: 26,
    marginVertical: 6,
    backgroundColor: driverCanvasTheme.border,
  },
  routeStopCopy: {
    flex: 1,
    minWidth: 0,
    marginBottom: 12,
  },
  routeStopLabel: {
    fontSize: 10.5,
    lineHeight: 14,
    fontWeight: "700",
    color: driverCanvasTheme.textMuted,
    letterSpacing: 0.4,
    textTransform: "uppercase",
    fontFamily: driverCanvasTheme.fontFamily,
  },
  routeStopAddress: {
    fontSize: 14,
    lineHeight: 18,
    fontWeight: "700",
    color: driverCanvasTheme.text,
    fontFamily: driverCanvasTheme.fontFamily,
  },
  routeStopTime: {
    fontSize: 11.5,
    lineHeight: 15,
    color: driverCanvasTheme.textDim,
    fontFamily: driverCanvasTheme.fontFamily,
  },
  routeMetricRow: {
    flexDirection: "row",
    gap: 10,
    marginTop: 6,
    paddingTop: 14,
    borderTopWidth: 1,
    borderTopColor: driverCanvasTheme.border,
  },
  routeMetricChip: {
    flex: 1,
    gap: 2,
  },
  routeMetricLabel: {
    fontSize: 10.5,
    lineHeight: 14,
    fontWeight: "700",
    color: driverCanvasTheme.textMuted,
    letterSpacing: 0.4,
    textTransform: "uppercase",
    fontFamily: driverCanvasTheme.fontFamily,
  },
  routeMetricValue: {
    fontSize: 13.5,
    lineHeight: 18,
    fontWeight: "700",
    color: driverCanvasTheme.text,
    fontFamily: driverCanvasTheme.fontFamily,
  },
  routeMetricValueMono: {
    fontFamily: driverCanvasTheme.monoFamily,
  },
  statusCard: {
    borderRadius: 14,
  },
  statusHeaderRow: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "space-between",
    gap: 10,
    marginBottom: 10,
  },
  statusHeaderLead: {
    flexDirection: "row",
    alignItems: "center",
    gap: 10,
    flex: 1,
  },
  statusHeaderText: {
    fontSize: 13.5,
    lineHeight: 18,
    fontWeight: "700",
    color: driverCanvasTheme.text,
    fontFamily: driverCanvasTheme.fontFamily,
  },
  statusHeaderMeta: {
    fontSize: 11,
    lineHeight: 15,
    fontFamily: driverCanvasTheme.monoFamily,
  },
  statusDot: {
    width: 10,
    height: 10,
    borderRadius: 5,
    shadowOpacity: 0.3,
    shadowRadius: 8,
    shadowOffset: { width: 0, height: 0 },
    elevation: 2,
  },
  statusPillRow: {
    flexDirection: "row",
    alignItems: "center",
    gap: 8,
    flexWrap: "wrap",
  },
  statusDetailText: {
    fontSize: 13,
    lineHeight: 18,
    color: driverCanvasTheme.text,
    fontFamily: driverCanvasTheme.fontFamily,
    marginTop: 10,
  },
  statusMetaText: {
    fontSize: 12.5,
    lineHeight: 18,
    color: driverCanvasTheme.textMuted,
    fontFamily: driverCanvasTheme.fontFamily,
    marginTop: 10,
  },
  lockCard: {
    borderRadius: 14,
    alignItems: "center",
    borderStyle: "dashed",
    borderWidth: 1,
    borderColor: driverCanvasTheme.borderStrong,
    backgroundColor: driverCanvasTheme.surface,
  },
  lockCardTitle: {
    fontSize: 15,
    lineHeight: 19,
    fontWeight: "700",
    color: driverCanvasTheme.text,
    textAlign: "center",
    fontFamily: driverCanvasTheme.fontFamily,
    marginTop: 10,
  },
  lockCardDetail: {
    fontSize: 12.5,
    lineHeight: 18,
    color: driverCanvasTheme.textMuted,
    textAlign: "center",
    fontFamily: driverCanvasTheme.fontFamily,
    marginTop: 4,
  },
  footerBar: {
    padding: 12,
    borderTopWidth: 1,
    borderTopColor: driverCanvasTheme.border,
    backgroundColor: driverCanvasTheme.bgRaised,
    gap: 10,
  },
  footerNotice: {
    fontSize: 12,
    lineHeight: 17,
    color: driverCanvasTheme.textMuted,
    fontFamily: driverCanvasTheme.fontFamily,
  },
  footerButtons: {
    flexDirection: "row",
    gap: 8,
    alignItems: "stretch",
  },
  boundaryPillRow: {
    flexDirection: "row",
    flexWrap: "wrap",
    gap: 8,
    marginTop: 12,
  },
  boundaryActionPill: {
    borderColor: driverCanvasTheme.accentBorder,
  },
  boundaryHintText: {
    fontSize: 12,
    lineHeight: 17,
    color: driverCanvasTheme.textMuted,
    fontFamily: driverCanvasTheme.fontFamily,
    marginTop: 12,
  },
  inlineActionRow: {
    flexDirection: "row",
    flexWrap: "wrap",
    gap: 10,
    marginTop: 12,
  },
  fieldStack: {
    gap: 10,
    marginTop: 12,
  },
  fieldFeedbackText: {
    fontSize: 11.5,
    lineHeight: 16,
    color: driverCanvasTheme.textMuted,
    fontFamily: driverCanvasTheme.fontFamily,
  },
  photoGrid: {
    flexDirection: "row",
    flexWrap: "wrap",
    gap: 12,
    marginTop: 12,
  },
  photoCard: {
    width: "47%",
    backgroundColor: driverCanvasTheme.surfaceLo,
    borderRadius: 10,
    padding: 10,
    borderWidth: 1,
    borderColor: driverCanvasTheme.border,
    gap: 10,
  },
  photoPreview: {
    width: "100%",
    aspectRatio: 1.2,
    borderRadius: 8,
    backgroundColor: driverCanvasTheme.bgRaised,
  },
  photoMeta: {
    fontSize: 11.5,
    lineHeight: 16,
    color: driverCanvasTheme.textMuted,
    textAlign: "center",
    fontFamily: driverCanvasTheme.monoFamily,
  },
  emptyPhotoState: {
    marginTop: 12,
    paddingVertical: 18,
    paddingHorizontal: 16,
    borderRadius: 10,
    borderWidth: 1,
    borderStyle: "dashed",
    borderColor: driverCanvasTheme.border,
    alignItems: "center",
    gap: 8,
  },
  emptyPhotoTitle: {
    fontSize: 13,
    lineHeight: 17,
    fontWeight: "700",
    color: driverCanvasTheme.text,
    fontFamily: driverCanvasTheme.fontFamily,
  },
  emptyPhotoBody: {
    fontSize: 12,
    lineHeight: 17,
    color: driverCanvasTheme.textMuted,
    textAlign: "center",
    fontFamily: driverCanvasTheme.fontFamily,
  },
  emptyCard: {
    alignItems: "center",
  },
  emptyIconWrap: {
    width: 56,
    height: 56,
    borderRadius: 18,
    alignItems: "center",
    justifyContent: "center",
    borderWidth: 1,
    marginBottom: 14,
  },
  emptyEyebrow: {
    fontSize: 11,
    lineHeight: 14,
    color: driverCanvasTheme.textMuted,
    fontFamily: driverCanvasTheme.fontFamily,
    letterSpacing: 0.5,
    textTransform: "uppercase",
  },
  emptyTitle: {
    fontSize: 16,
    lineHeight: 20,
    fontWeight: "700",
    color: driverCanvasTheme.text,
    fontFamily: driverCanvasTheme.fontFamily,
    textAlign: "center",
    marginTop: 8,
  },
  emptyBody: {
    marginTop: 8,
    fontSize: 12.5,
    lineHeight: 18,
    color: driverCanvasTheme.textMuted,
    fontFamily: driverCanvasTheme.fontFamily,
    textAlign: "center",
  },
  emptyMetaText: {
    marginTop: 10,
    fontSize: 11.5,
    lineHeight: 16,
    color: driverCanvasTheme.textDim,
    fontFamily: driverCanvasTheme.monoFamily,
    textAlign: "center",
  },
});
