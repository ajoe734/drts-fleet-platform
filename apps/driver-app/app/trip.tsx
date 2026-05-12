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

import { PlatformTaskBadge } from "@/components/platform-task-badge";
import RouteDisplay from "@/components/route-display";
import { ActionButton as SharedActionButton } from "@/components/ui/ActionButton";
import {
  AppScreen,
  BottomActionBar,
  EmptyState,
  ErrorBanner,
  FormField,
  IconButton,
  InfoTile,
  PageHeader,
  StatusChip,
  Tokens,
} from "@/components/ui";
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
import { formatDriverTaskStatusLabel } from "@/lib/operational-labels";
import {
  getTripExperienceState,
  getPrimaryTripAction,
  shouldShowTripCompletionProof,
  type TripExperienceState,
  type TripPrimaryActionKey,
} from "@/lib/trip-workflow";
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
  return (
    <SharedActionButton
      title={label}
      onPress={onPress}
      disabled={disabled}
      loading={loading}
      variant={variant}
    />
  );
}

function RouteLockedBadge() {
  return (
    <View style={styles.routeLockedBadge}>
      <Ionicons
        name="lock-closed-outline"
        size={12}
        color={Tokens.colors.warning}
      />
      <Text style={styles.routeLockedBadgeText}>路線鎖定</Text>
    </View>
  );
}

function isForwardedTask(task: DriverTaskRecord | null): boolean {
  return task?.sourcePlatform != null;
}

function formatTripActionSuccessLabel(action: TripPrimaryActionKey): string {
  switch (action) {
    case "accept":
      return "接受任務";
    case "depart":
      return "前往接送點";
    case "arrived":
      return "抵達上車點";
    case "start":
      return "開始行程";
    case "complete":
      return "完成行程";
  }
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

function getComplianceTone(state: string) {
  switch (state) {
    case "clear":
      return { bg: "#ecfdf5", border: "#86efac", text: "#166534" };
    case "blocked":
      return { bg: "#fff1f2", border: "#fda4af", text: "#9f1239" };
    case "review_required":
      return { bg: "#fffbeb", border: "#fcd34d", text: "#92400e" };
    default:
      return { bg: "#f8fafc", border: "#cbd5e1", text: "#334155" };
  }
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
    case "lost_race":
      return "forwarded_lost";
    case "cancelled_by_platform":
      return "forwarded_cancelled";
    case "sync_failed":
      return "sync_failed";
    case "rejected":
      return "forwarded_cancelled";
  }
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
}

function getForwardedActionCardCopy(state: TripExperienceState | null): {
  title: string;
  note: string;
} {
  switch (state) {
    case "forwarded_offered":
      return {
        title: "回覆來源平台派單",
        note: "接受後仍需等待平台完成確認，本地不會直接變更任務狀態。",
      };
    case "forwarded_pending":
      return {
        title: "等待來源平台同步",
        note: "平台確認前請暫勿開始行程，本地只會顯示最新同步結果。",
      };
    case "forwarded_confirmed":
      return {
        title: "來源平台已確認",
        note: "平台已確認此單，本地可依目前任務階段繼續後續流程。",
      };
    default:
      return {
        title: "平台同步結果",
        note: "本地只顯示同步結果與路線資訊，不會直接改寫平台任務。",
      };
  }
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
      if (task?.status === "on_trip" && locationTrackingState === "active") {
        return {
          label: "行程追蹤中",
          tone: "success",
          detail: locationTrackingMessage ?? "里程與時長正在即時更新。",
        };
      }
      return {
        label: formatDriverTaskStatusLabel(
          task?.status ?? "pending_acceptance",
        ),
        tone: task?.status === "pending_acceptance" ? "warning" : "success",
        detail: "請依行程階段完成本地操作與完單佐證。",
      };
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

function getTripAuthorityDescription(
  task: DriverTaskRecord | null,
  state: TripExperienceState | null,
): string {
  if (!task || !isForwardedTask(task)) {
    return "DRTS 在此頁負責行程狀態、定位追蹤與完單佐證；請依目前階段完成單一步驟。";
  }

  switch (state) {
    case "forwarded_offered":
      return "此任務仍由來源平台主導；目前僅可回覆是否承接平台派單，本地不直接切換行程狀態。";
    case "forwarded_pending":
      return "已送出接單要求，等待來源平台確認前，本地所有行程操作維持鎖定。";
    case "forwarded_confirmed":
      return "來源平台已確認任務，但平台仍掌管最終行程規則；此頁只保留鏡像狀態與路線資訊。";
    case "forwarded_lost":
      return "來源平台已將此訂單交給其他司機，本地僅保留結果供查閱。";
    case "forwarded_cancelled":
      return "來源平台已取消此訂單，本地不再提供任何行程操作。";
    case "sync_failed":
      return "平台同步異常時，派車台會接手處理；司機端只顯示安全可讀的同步摘要。";
    default:
      return "來源平台仍是此任務的操作權限來源，本地不直接處理平台生命周期。";
  }
}

function getTripCapabilityItems(
  task: DriverTaskRecord | null,
  state: TripExperienceState | null,
): string[] {
  if (!task || !isForwardedTask(task)) {
    return [
      "可在此頁依序執行接單、前往接送點、抵達、開始行程與完成行程。",
      "行程進行中會記錄本地定位追蹤、距離與時長。",
      "完單前需補齊照片、簽收或費用佐證需求。",
    ];
  }

  switch (state) {
    case "forwarded_offered":
      return [
        "可送出：接受平台訂單。",
        "可送出：婉拒平台訂單。",
        "不可用：前往、抵達、開始、完成等本地生命周期操作。",
      ];
    case "forwarded_pending":
      return ["目前沒有可用本地操作。", "系統正在等待來源平台確認接單結果。"];
    case "forwarded_confirmed":
      return [
        "此頁提供平台狀態、鏡像狀態與路線資訊。",
        "如需後續人工協調，請依派車台或來源平台指示處理。",
      ];
    case "forwarded_lost":
    case "forwarded_cancelled":
      return ["此任務已進入終態，本地不再提供操作。"];
    case "sync_failed":
      return [
        "平台同步異常時，本地會鎖定操作，避免司機端誤改狀態。",
        "派車台正在處理同步，請等待進一步指示。",
      ];
    default:
      return ["來源平台仍掌管此任務，本地僅顯示安全同步資訊。"];
  }
}

function getStatusToneStyles(tone: StatusTone) {
  switch (tone) {
    case "warning":
      return {
        dot: Tokens.colors.warning,
        background: Tokens.colors.warningBg,
        text: Tokens.colors.warning,
      };
    case "danger":
      return {
        dot: Tokens.colors.danger,
        background: Tokens.colors.dangerBg,
        text: Tokens.colors.danger,
      };
    case "neutral":
      return {
        dot: Tokens.colors.neutral,
        background: Tokens.colors.neutralBg,
        text: Tokens.colors.neutral,
      };
    default:
      return {
        dot: Tokens.colors.success,
        background: Tokens.colors.successBg,
        text: Tokens.colors.success,
      };
  }
}

function getStatusChipVariant(tone: StatusTone) {
  switch (tone) {
    case "warning":
      return "warning" as const;
    case "danger":
      return "danger" as const;
    case "neutral":
      return "default" as const;
    default:
      return "success" as const;
  }
}

function getTripSurfacePalette(
  task: DriverTaskRecord | null,
  state: TripExperienceState | null,
) {
  switch (state) {
    case "sync_failed":
      return {
        backgroundColor: Tokens.colors.surfaceDanger,
        borderColor: `${Tokens.colors.danger}33`,
        accentColor: Tokens.colors.danger,
      };
    case "forwarded_pending":
      return {
        backgroundColor: Tokens.colors.warningBg,
        borderColor: `${Tokens.colors.warning}33`,
        accentColor: Tokens.colors.warning,
      };
    case "forwarded_confirmed":
      return {
        backgroundColor: Tokens.colors.successBg,
        borderColor: `${Tokens.colors.success}33`,
        accentColor: Tokens.colors.success,
      };
    case "forwarded_lost":
    case "forwarded_cancelled":
      return {
        backgroundColor: Tokens.colors.surfaceLo,
        borderColor: Tokens.colors.borderStrong,
        accentColor: Tokens.colors.neutral,
      };
    case "forwarded_offered":
      return {
        backgroundColor: Tokens.colors.forwardedBg,
        borderColor: Tokens.colors.forwardedBorder,
        accentColor: Tokens.colors.forwarded,
      };
    default:
      if (task?.sourcePlatform) {
        return {
          backgroundColor: Tokens.colors.forwardedBg,
          borderColor: Tokens.colors.forwardedBorder,
          accentColor: Tokens.colors.forwarded,
        };
      }

      return {
        backgroundColor: Tokens.colors.ownedBg,
        borderColor: Tokens.colors.ownedBorder,
        accentColor: Tokens.colors.owned,
      };
  }
}

function getTripStateEyebrow(
  task: DriverTaskRecord | null,
  state: TripExperienceState | null,
) {
  if (state === "sync_failed") {
    return "平台同步異常";
  }

  if (task?.sourcePlatform) {
    switch (state) {
      case "forwarded_offered":
        return "來源平台派單";
      case "forwarded_pending":
        return "等待來源平台";
      case "forwarded_confirmed":
        return "來源平台已確認";
      case "forwarded_lost":
        return "平台已分配給他人";
      case "forwarded_cancelled":
        return "來源平台已取消";
      default:
        return "平台鏡像任務";
    }
  }

  return "本地行程流程";
}

function getIdleBottomActionLabel(state: TripExperienceState | null) {
  switch (state) {
    case "forwarded_pending":
      return "等待平台確認";
    case "forwarded_confirmed":
      return "來源平台已確認";
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
  const complianceGates = orderDetail?.complianceGates ?? [];
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
  const tripAuthorityDescription = getTripAuthorityDescription(
    taskDetail,
    tripExperienceState,
  );
  const tripCapabilityItems = getTripCapabilityItems(
    taskDetail,
    tripExperienceState,
  );
  const showCompletionProofCard = shouldShowTripCompletionProof(
    taskDetail,
    tripExperienceState,
  );
  const forwardedActionCardCopy =
    getForwardedActionCardCopy(tripExperienceState);
  const completionSubmitBlocker = getCompletionSubmitBlocker({
    proofRequirementsUnavailable,
    missingRequiredPhotos,
    signoffRequirementMissing,
    expenseRequirementMissing,
    expenseAmountInvalid,
    completionBlockedByTracking,
  });
  const statusToneStyles = getStatusToneStyles(tripStatusPresentation.tone);
  const tripStatusChipVariant = getStatusChipVariant(
    tripStatusPresentation.tone,
  );
  const tripSurfacePalette = getTripSurfacePalette(
    taskDetail,
    tripExperienceState,
  );
  const tripStateEyebrow = getTripStateEyebrow(taskDetail, tripExperienceState);
  const headerSubtitle = taskDetail
    ? taskDetail.orderId
      ? `${taskDetail.taskId} · ${taskDetail.orderId}`
      : taskDetail.taskId
    : "查看目前指派的行程與下一步操作";
  const forwardedOutcomeSummary = forwardedActionResult
    ? describeForwardedActionOutcome(
        forwardedActionResult.outcome,
        forwardedActionResult.action,
      )
    : null;
  const forwardedOutcomeToneStyles = forwardedOutcomeSummary
    ? getStatusToneStyles(forwardedOutcomeSummary.tone)
    : null;
  const bottomNotice =
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
                    ? forwardedActionCardCopy.note
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
      <AppScreen scrollable={false}>
        <PageHeader title="行程作業台" subtitle="同步目前指派的行程與狀態" />
        <View style={styles.loadingState}>
          <ActivityIndicator size="large" color={Tokens.colors.brand} />
          <Text style={styles.loadingLabel}>載入行程中…</Text>
        </View>
      </AppScreen>
    );
  }

  return (
    <>
      <AppScreen
        contentContainerStyle={styles.screenContent}
        backgroundColor={Tokens.colors.appBg}
      >
        <PageHeader
          title="行程作業台"
          subtitle={headerSubtitle}
          rightElement={
            <IconButton
              icon="refresh"
              onPress={() => void loadTrip(true)}
              disabled={submittingAction !== null}
              accessibilityLabel="重新整理行程"
            />
          }
        />

        {error ? <ErrorBanner message={`錯誤：${error}`} /> : null}

        {taskDetail ? (
          <>
            <View
              style={[
                styles.tripHero,
                {
                  backgroundColor: tripSurfacePalette.backgroundColor,
                  borderColor: tripSurfacePalette.borderColor,
                },
              ]}
            >
              <View style={styles.tripHeroHeader}>
                <View style={styles.tripHeroTitleBlock}>
                  <Text
                    style={[
                      styles.tripHeroEyebrow,
                      { color: tripSurfacePalette.accentColor },
                    ]}
                  >
                    {tripStateEyebrow}
                  </Text>
                  <Text style={styles.tripHeroTitle}>
                    {taskDetail.orderId
                      ? `訂單 ${taskDetail.orderId}`
                      : `任務 ${taskDetail.taskId}`}
                  </Text>
                  <Text style={styles.tripHeroDescription}>
                    {tripStatusPresentation.detail}
                  </Text>
                </View>
                <View style={styles.tripHeroBadges}>
                  <StatusChip
                    label={tripStatusPresentation.label}
                    variant={tripStatusChipVariant}
                    dot
                  />
                  {isForwardedTrip ? <RouteLockedBadge /> : null}
                  <PlatformTaskBadge platformCode={taskDetail.sourcePlatform} />
                </View>
              </View>

              <View style={styles.tripHeroMetaRow}>
                <StatusChip
                  label={`內部狀態：${formatDriverTaskStatusLabel(taskDetail.status)}`}
                  variant={isForwardedTrip ? "forwarded" : "owned"}
                />
                <StatusChip label={taskDetail.taskId} variant="brand" />
              </View>

              <View style={styles.tripStatusCallout}>
                <View
                  style={[
                    styles.tripStatusDot,
                    { backgroundColor: statusToneStyles.dot },
                  ]}
                />
                <Text
                  style={[
                    styles.tripStatusCalloutText,
                    { color: statusToneStyles.text },
                  ]}
                >
                  {tripAuthorityDescription}
                </Text>
              </View>

              {tripLockBody ? (
                <View style={styles.tripLockCard}>
                  <Ionicons
                    name={tripLockBody.icon}
                    size={18}
                    color={tripSurfacePalette.accentColor}
                  />
                  <View style={styles.tripLockCopy}>
                    <Text style={styles.tripLockTitle}>
                      {tripLockBody.title}
                    </Text>
                    <Text style={styles.tripLockDetail}>
                      {tripLockBody.detail}
                    </Text>
                  </View>
                </View>
              ) : null}

              {forwardedOutcomeSummary && forwardedOutcomeToneStyles ? (
                <View
                  style={[
                    styles.forwardedOutcomePanel,
                    {
                      backgroundColor: forwardedOutcomeToneStyles.background,
                      borderColor: `${forwardedOutcomeToneStyles.dot}33`,
                    },
                  ]}
                >
                  <View style={styles.forwardedOutcomeHeader}>
                    <View
                      style={[
                        styles.forwardedOutcomeDot,
                        { backgroundColor: forwardedOutcomeToneStyles.dot },
                      ]}
                    />
                    <Text
                      style={[
                        styles.forwardedOutcomeTitle,
                        { color: forwardedOutcomeToneStyles.text },
                      ]}
                    >
                      {forwardedOutcomeSummary.title}
                    </Text>
                  </View>
                  <Text style={styles.forwardedOutcomeDetail}>
                    {forwardedActionResult?.driverMessage}
                  </Text>
                  <Text style={styles.forwardedOutcomeMeta}>
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
              ) : null}
            </View>

            <View style={styles.infoTileRow}>
              <InfoTile
                label="操作模式"
                value={isForwardedTrip ? "平台主導" : "自營行程"}
              />
              <InfoTile
                label="定位追蹤"
                value={
                  isForwardedTrip
                    ? "未啟用"
                    : locationTrackingState === "active"
                      ? "追蹤中"
                      : locationTrackingState === "requesting_permission"
                        ? "等待授權"
                        : "需處理"
                }
              />
            </View>

            <View style={styles.sectionCard}>
              <Text style={styles.sectionEyebrow}>Workflow Boundaries</Text>
              <Text style={styles.sectionTitle}>可用操作與邊界</Text>
              {tripCapabilityItems.map((item) => (
                <Text key={item} style={styles.sectionListItem}>
                  • {item}
                </Text>
              ))}
            </View>

            <RouteDisplay
              task={taskDetail}
              order={orderDetail}
              showAuthorityBanner={false}
            />

            <View style={styles.sectionCard}>
              <Text style={styles.sectionEyebrow}>Trip Health</Text>
              <Text style={styles.sectionTitle}>行程狀態與度量</Text>
              <View style={styles.infoTileRow}>
                <InfoTile
                  label="距離"
                  value={
                    showTripMetrics ? formatTripDistance(liveDistanceKm) : "N/A"
                  }
                />
                <InfoTile
                  label="時長"
                  value={
                    showTripMetrics
                      ? formatTripDuration(liveDurationSec)
                      : "N/A"
                  }
                />
              </View>
              <Text style={styles.sectionBody}>
                {isForwardedTrip
                  ? "來源平台任務不在此端啟用本地距離/時長追蹤；若平台同步延遲，請以派車台指示為準。"
                  : locationTrackingState === "active"
                    ? (locationTrackingMessage ??
                      "此行程已啟用即時定位追蹤，距離與時長會持續更新。")
                    : locationTrackingState === "requesting_permission"
                      ? "請允許定位權限以啟動即時行程追蹤。"
                      : (locationTrackingMessage ??
                        "行程度量目前不可用；恢復定位追蹤後才能完成行程。")}
              </Text>
              {!isForwardedTrip &&
              isTripInProgress &&
              (locationTrackingState === "permission_denied" ||
                locationTrackingState === "error") ? (
                <View style={styles.inlineActionRow}>
                  <ActionButton
                    label="重試追蹤"
                    onPress={() =>
                      setTrackingRetryKey((current) => current + 1)
                    }
                    disabled={submittingAction !== null}
                    variant="secondary"
                  />
                </View>
              ) : null}
            </View>

            {complianceGates.length > 0 ? (
              <View style={styles.sectionCard}>
                <Text style={styles.sectionEyebrow}>Compliance</Text>
                <Text style={styles.sectionTitle}>合規檢查</Text>
                <View style={styles.complianceList}>
                  {complianceGates.map((gate) => {
                    const tone = getComplianceTone(gate.state);
                    return (
                      <View
                        key={gate.gateType}
                        style={[
                          styles.complianceGate,
                          {
                            backgroundColor: tone.bg,
                            borderColor: tone.border,
                          },
                        ]}
                      >
                        <View style={styles.complianceGateHeader}>
                          <Text
                            style={[
                              styles.complianceGateTitle,
                              { color: tone.text },
                            ]}
                          >
                            {gate.title}
                          </Text>
                          <Text
                            style={[
                              styles.complianceGateState,
                              { color: tone.text },
                            ]}
                          >
                            {gate.state}
                          </Text>
                        </View>
                        <Text style={styles.complianceGateAction}>
                          {gate.nextAction}
                        </Text>
                        {gate.missingItems.length > 0 ? (
                          <Text style={styles.complianceGateMeta}>
                            缺少項目：{gate.missingItems.join(", ")}
                          </Text>
                        ) : null}
                      </View>
                    );
                  })}
                </View>
              </View>
            ) : null}

            {!isForwardedTrip && showCompletionProofCard ? (
              <View style={styles.sectionCard}>
                <Text style={styles.sectionEyebrow}>Completion Proof</Text>
                <View style={styles.sectionHeaderRow}>
                  <Text style={styles.sectionTitle}>完單佐證</Text>
                  <StatusChip
                    label={`已附加 ${proofPhotos.length}/${MAX_COMPLETION_PROOF_PHOTOS}`}
                    variant="default"
                  />
                </View>
                <Text style={styles.sectionBody}>
                  最多可附加 5 張照片。每張佐證照片壓縮後需低於 600KB。
                </Text>

                {proofRequirementsUnavailable ? (
                  <ErrorBanner message="需待訂單詳情載入後才能確認佐證需求；請先重新整理行程，再完成任務。" />
                ) : null}

                {proofRequirements.minPhotoCount > 0 ? (
                  <Text style={styles.requirementNote}>
                    此行程至少需要 {proofRequirements.minPhotoCount}{" "}
                    張佐證照片。
                    {missingRequiredPhotos > 0
                      ? ` 完成前還需補上 ${missingRequiredPhotos} 張。`
                      : " 已達照片需求。"}
                  </Text>
                ) : null}

                {proofRequirements.signoffRequired ? (
                  <View style={styles.requirementCard}>
                    <Text style={styles.requirementCardTitle}>簽收佐證</Text>
                    <Text style={styles.requirementCardHint}>
                      完成行程前，請填寫乘客或現場簽收識別資料。
                    </Text>
                    <FormField
                      label="簽收識別"
                      value={signoffReference}
                      onChangeText={setSignoffReference}
                      editable={submittingAction === null}
                      placeholder="乘客簽收或簽收單號"
                      autoCapitalize="characters"
                      error={
                        signoffRequirementMissing
                          ? "尚未填寫簽收識別資料。"
                          : undefined
                      }
                      helpText={
                        signoffRequirementMissing
                          ? undefined
                          : "簽收需求已完成。"
                      }
                    />
                  </View>
                ) : null}

                {proofRequirements.expenseProofRequired ? (
                  <View style={styles.requirementCard}>
                    <Text style={styles.requirementCardTitle}>費用佐證</Text>
                    <Text style={styles.requirementCardHint}>
                      請填寫一筆可報銷費用，包含類型、金額與單據識別，供財務覆核。
                    </Text>
                    <FormField
                      label="費用類型"
                      value={expenseType}
                      onChangeText={setExpenseType}
                      editable={submittingAction === null}
                      placeholder="例如過路費或停車費"
                      autoCapitalize="none"
                    />
                    <FormField
                      label="金額"
                      value={expenseAmount}
                      onChangeText={setExpenseAmount}
                      editable={submittingAction === null}
                      placeholder="例如 40 或 40.50"
                      keyboardType="decimal-pad"
                      error={
                        expenseAmountInvalid
                          ? "請輸入有效的正數金額。"
                          : undefined
                      }
                    />
                    <FormField
                      label="單據識別"
                      value={expenseAttachmentRef}
                      onChangeText={setExpenseAttachmentRef}
                      editable={submittingAction === null}
                      placeholder="單據或附件識別"
                      autoCapitalize="characters"
                      helpText={
                        expenseRequirementMissing
                          ? "費用佐證資料尚未填完整。"
                          : expenseAttachmentId
                            ? `費用佐證已完成：${expenseAttachmentId}`
                            : "費用佐證已完成。"
                      }
                    />
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
                  <EmptyState
                    title="尚未選取佐證照片"
                    description="可從相機或相簿新增完單照片。"
                    icon="images-outline"
                    style={styles.compactEmptyState}
                  />
                )}
              </View>
            ) : null}

            <View style={styles.sosCard}>
              <Text style={styles.sectionEyebrow}>Safety Support</Text>
              <Text style={styles.sosTitle}>需要立即通報重大安全事件？</Text>
              <Text style={styles.sosNote}>
                開啟 SOS 緊急通報後，送出前仍需再確認一次。
              </Text>
              <SharedActionButton
                title="開啟 SOS 緊急通報"
                onPress={() => router.push("/incident")}
                variant="danger"
                icon="warning-outline"
                style={styles.sosButton}
              />
            </View>
          </>
        ) : (
          <EmptyState
            title="目前沒有進行中的行程"
            description="重新整理後可再次檢查是否有新任務同步進來。"
            actionTitle="重新整理"
            onAction={() => void loadTrip(true)}
          />
        )}
      </AppScreen>

      {taskDetail ? (
        <BottomActionBar
          notice={
            bottomPrimaryAction || bottomSecondaryAction
              ? bottomNotice
              : getIdleBottomActionLabel(tripExperienceState)
          }
          primaryAction={bottomPrimaryAction}
          secondaryAction={bottomSecondaryAction}
        />
      ) : null}
    </>
  );
}

const styles = StyleSheet.create({
  screenContent: {
    paddingBottom: Tokens.spacing["4xl"],
  },
  loadingState: {
    flex: 1,
    alignItems: "center",
    justifyContent: "center",
    gap: Tokens.spacing.md,
  },
  loadingLabel: {
    ...Tokens.type.label,
    color: Tokens.colors.textMuted,
  },
  tripHero: {
    borderRadius: Tokens.radius.xl,
    borderWidth: 1,
    padding: Tokens.spacing.lg,
    gap: Tokens.spacing.md,
    ...Tokens.shadows.md,
  },
  tripHeroHeader: {
    flexDirection: "row",
    justifyContent: "space-between",
    alignItems: "flex-start",
    gap: Tokens.spacing.md,
  },
  tripHeroTitleBlock: {
    flex: 1,
    gap: Tokens.spacing.xs,
  },
  tripHeroEyebrow: {
    ...Tokens.type.micro,
  },
  tripHeroTitle: {
    ...Tokens.type.screenTitle,
    color: Tokens.colors.text,
  },
  tripHeroDescription: {
    ...Tokens.type.body,
    color: Tokens.colors.textBody,
  },
  tripHeroBadges: {
    alignItems: "flex-end",
    gap: Tokens.spacing.xs,
    flexShrink: 1,
  },
  tripHeroMetaRow: {
    flexDirection: "row",
    flexWrap: "wrap",
    gap: Tokens.spacing.sm,
  },
  tripStatusCallout: {
    flexDirection: "row",
    alignItems: "flex-start",
    gap: Tokens.spacing.sm,
    padding: Tokens.spacing.md,
    borderRadius: Tokens.radius.lg,
    backgroundColor: Tokens.colors.bgRaised,
  },
  tripStatusDot: {
    width: 10,
    height: 10,
    borderRadius: Tokens.radius.full,
    marginTop: 6,
  },
  tripStatusCalloutText: {
    ...Tokens.type.body,
    flex: 1,
  },
  tripLockCard: {
    flexDirection: "row",
    alignItems: "flex-start",
    gap: Tokens.spacing.sm,
    borderRadius: Tokens.radius.lg,
    borderWidth: 1,
    borderColor: Tokens.colors.border,
    backgroundColor: Tokens.colors.bgRaised,
    padding: Tokens.spacing.md,
  },
  tripLockCopy: {
    flex: 1,
    gap: Tokens.spacing.xs,
  },
  tripLockTitle: {
    ...Tokens.type.label,
    color: Tokens.colors.textStrong,
  },
  tripLockDetail: {
    ...Tokens.type.small,
    color: Tokens.colors.textMuted,
  },
  routeLockedBadge: {
    flexDirection: "row",
    alignItems: "center",
    gap: 4,
    paddingHorizontal: Tokens.spacing.sm,
    paddingVertical: 5,
    borderRadius: Tokens.radius.pill,
    backgroundColor: Tokens.colors.warningBg,
    borderWidth: 1,
    borderColor: `${Tokens.colors.warning}33`,
  },
  routeLockedBadgeText: {
    ...Tokens.type.micro,
    color: Tokens.colors.warning,
  },
  infoTileRow: {
    flexDirection: "row",
    gap: Tokens.spacing.md,
  },
  sectionCard: {
    borderRadius: Tokens.radius.xl,
    borderWidth: 1,
    borderColor: Tokens.colors.border,
    backgroundColor: Tokens.colors.bgRaised,
    padding: Tokens.spacing.lg,
    gap: Tokens.spacing.sm,
    ...Tokens.shadows.sm,
  },
  sectionHeaderRow: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "space-between",
    gap: Tokens.spacing.sm,
  },
  sectionEyebrow: {
    ...Tokens.type.micro,
    color: Tokens.colors.textDim,
  },
  sectionTitle: {
    ...Tokens.type.sectionTitle,
    color: Tokens.colors.textStrong,
  },
  sectionBody: {
    ...Tokens.type.body,
    color: Tokens.colors.textMuted,
  },
  sectionListItem: {
    ...Tokens.type.body,
    color: Tokens.colors.textBody,
  },
  inlineActionRow: {
    flexDirection: "row",
    gap: Tokens.spacing.sm,
    flexWrap: "wrap",
  },
  complianceList: {
    gap: Tokens.spacing.sm,
  },
  complianceGate: {
    borderWidth: 1,
    borderRadius: Tokens.radius.lg,
    padding: Tokens.spacing.md,
    gap: Tokens.spacing.xs,
  },
  complianceGateHeader: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "space-between",
    gap: Tokens.spacing.sm,
  },
  complianceGateTitle: {
    ...Tokens.type.label,
    flex: 1,
  },
  complianceGateState: {
    ...Tokens.type.micro,
  },
  complianceGateAction: {
    ...Tokens.type.small,
    color: Tokens.colors.textBody,
  },
  complianceGateMeta: {
    ...Tokens.type.small,
    color: Tokens.colors.textDim,
  },
  requirementNote: {
    ...Tokens.type.small,
    color: Tokens.colors.warning,
  },
  requirementCard: {
    backgroundColor: Tokens.colors.surfaceLo,
    borderWidth: 1,
    borderColor: Tokens.colors.border,
    borderRadius: Tokens.radius.lg,
    padding: Tokens.spacing.md,
    gap: Tokens.spacing.xs,
  },
  requirementCardTitle: {
    ...Tokens.type.label,
    color: Tokens.colors.textStrong,
  },
  requirementCardHint: {
    ...Tokens.type.small,
    color: Tokens.colors.textMuted,
  },
  photoGrid: {
    flexDirection: "row",
    flexWrap: "wrap",
    gap: Tokens.spacing.md,
  },
  photoCard: {
    width: "47%",
    backgroundColor: Tokens.colors.surface,
    borderRadius: Tokens.radius.lg,
    padding: Tokens.spacing.sm,
    borderWidth: 1,
    borderColor: Tokens.colors.border,
    gap: Tokens.spacing.sm,
  },
  photoPreview: {
    width: "100%",
    aspectRatio: 1.2,
    borderRadius: Tokens.radius.md,
    backgroundColor: Tokens.colors.surfaceMuted,
  },
  photoMeta: {
    ...Tokens.type.small,
    color: Tokens.colors.textMuted,
    textAlign: "center",
  },
  compactEmptyState: {
    paddingHorizontal: 0,
    paddingVertical: Tokens.spacing.lg,
  },
  forwardedOutcomePanel: {
    borderRadius: Tokens.radius.lg,
    borderWidth: 1,
    padding: Tokens.spacing.md,
    gap: Tokens.spacing.xs,
  },
  forwardedOutcomeHeader: {
    flexDirection: "row",
    alignItems: "center",
    gap: Tokens.spacing.sm,
  },
  forwardedOutcomeDot: {
    width: 8,
    height: 8,
    borderRadius: Tokens.radius.full,
  },
  forwardedOutcomeTitle: {
    ...Tokens.type.label,
  },
  forwardedOutcomeDetail: {
    ...Tokens.type.body,
    color: Tokens.colors.textBody,
  },
  forwardedOutcomeMeta: {
    ...Tokens.type.small,
    color: Tokens.colors.textMuted,
  },
  sosCard: {
    padding: Tokens.spacing.lg,
    borderRadius: Tokens.radius.xl,
    backgroundColor: Tokens.colors.dangerBg,
    borderWidth: 1,
    borderColor: `${Tokens.colors.danger}22`,
    gap: Tokens.spacing.sm,
  },
  sosTitle: {
    ...Tokens.type.sectionTitle,
    color: Tokens.colors.danger,
  },
  sosNote: {
    ...Tokens.type.body,
    color: Tokens.colors.textBody,
  },
  sosButton: {
    marginTop: Tokens.spacing.xs,
  },
});
