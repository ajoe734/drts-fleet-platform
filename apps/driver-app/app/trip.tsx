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
import { useRouter } from "expo-router";
import * as ImagePicker from "expo-image-picker";
import type {
  DriverTaskRecord,
  ForwardedDriverActionOutcome,
  ForwardedDriverActionResponse,
  OwnedOrderRecord,
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
import { formatMoney } from "@/lib/money";
import { formatDriverTaskStatusLabel } from "@/lib/operational-labels";
import {
  getTripExperienceState,
  getPrimaryTripAction,
  shouldShowTripCompletionProof,
  type TripExperienceState,
  type TripPrimaryActionKey,
} from "@/lib/trip-workflow";
import { driverStrings, driverTripActionSuccessLabels } from "@/lib/strings";
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
    case "sync_failed":
      return "等待派車台處理";
    default:
      return "目前沒有可執行動作";
  }
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
  const [taskDetail, setTaskDetail] = useState<DriverTaskRecord | null>(null);
  const [orderDetail, setOrderDetail] = useState<OwnedOrderRecord | null>(null);
  const [proofPhotos, setProofPhotos] = useState<ProofPhoto[]>([]);
  const [signoffReference, setSignoffReference] = useState("");
  const [expenseType, setExpenseType] = useState("");
  const [expenseAmount, setExpenseAmount] = useState("");
  const [expenseAttachmentRef, setExpenseAttachmentRef] = useState("");
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
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
  const baseTripExperienceState = getTripExperienceState(taskDetail);
  const tripExperienceState = applyForwardedActionExperienceState(
    baseTripExperienceState,
    forwardedActionResult,
  );
  const primaryTripAction = getPrimaryTripAction(
    taskDetail,
    tripExperienceState,
  );
  const tripStatusPresentation = getTripStatusPresentation(
    tripExperienceState,
    taskDetail,
    locationTrackingState,
    locationTrackingMessage,
  );
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
  const pickupAddress = orderDetail?.pickup.address ?? "待確認上車點";
  const dropoffAddress = orderDetail?.dropoff.address ?? "待確認下車點";
  const pickupTimeLabel = formatPickupStopTime(orderDetail);
  const dropoffTimeLabel = formatDropoffStopTime(orderDetail);
  const platformLabel = getPlatformDisplayLabel(taskDetail?.sourcePlatform);
  const recordingActive =
    Boolean(orderDetail?.recordingId) ||
    (!isForwardedTrip && locationTrackingState === "active");
  const trackingDescriptor = getTrackingDescriptor(
    isForwardedTrip,
    locationTrackingState,
    locationTrackingMessage,
    recordingActive,
  );
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
    : tripExperienceState === "forwarded_offered" &&
        forwardedActionResult === null
      ? {
          title: "接受平台訂單",
          onPress: () => void handleForwardedAccept(),
          loading: submittingAction === "forwarded_accept",
          disabled: submittingAction !== null,
        }
      : undefined;
  const bottomSecondaryAction =
    tripExperienceState === "forwarded_offered" &&
    forwardedActionResult === null
      ? {
          title: "婉拒平台訂單",
          onPress: () => void handleForwardedReject(),
          variant: "secondary" as const,
          loading: submittingAction === "forwarded_reject",
          disabled: submittingAction !== null,
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
      const tasks = await client.listDriverTasks();
      const firstTask = tasks[0] ?? null;
      setTaskDetail(firstTask);

      if (!firstTask?.orderId) {
        setOrderDetail(null);
        return;
      }

      try {
        const order = (await client.getOrder(
          firstTask.orderId,
        )) as OwnedOrderRecord;
        setOrderDetail(order);
      } catch {
        setOrderDetail(null);
      }
    } catch (loadError) {
      setError(getErrorMessage(loadError));
      setTaskDetail(null);
      setOrderDetail(null);
    } finally {
      setLoading(false);
    }
  }

  useEffect(() => {
    void loadTrip(true);
  }, []);

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
        <Card theme={driverCanvasTheme} padding={18}>
          <Text style={styles.emptyTitle}>目前沒有進行中的行程</Text>
          <Text style={styles.emptyBody}>
            重新整理後可再次檢查是否有新任務同步進來。
          </Text>
          <View style={styles.inlineActionRow}>
            <ActionButton
              label={driverStrings.common.refresh}
              onPress={() => void loadTrip(true)}
              disabled={submittingAction !== null}
            />
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
  emptyTitle: {
    fontSize: 16,
    lineHeight: 20,
    fontWeight: "700",
    color: driverCanvasTheme.text,
    fontFamily: driverCanvasTheme.fontFamily,
  },
  emptyBody: {
    marginTop: 6,
    fontSize: 12.5,
    lineHeight: 18,
    color: driverCanvasTheme.textMuted,
    fontFamily: driverCanvasTheme.fontFamily,
  },
});
