import { useEffect, useRef, useState } from "react";
import {
  ActivityIndicator,
  Alert,
  Image,
  ScrollView,
  StyleSheet,
  Text,
  TextInput,
  View,
} from "react-native";
import { Ionicons } from "@expo/vector-icons";
import { useRouter } from "expo-router";
import * as ImagePicker from "expo-image-picker";
import type { DriverTaskRecord, OwnedOrderRecord } from "@drts/contracts";

import { PlatformTaskBadge } from "@/components/platform-task-badge";
import RouteDisplay from "@/components/route-display";
import { ActionButton as SharedActionButton } from "@/components/ui/ActionButton";
import { Tokens } from "@/components/ui";
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
  getDriverClient,
  getDriverIdentityIssue,
  getPendingDriverTaskCompletion,
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
    <View style={[styles.badge, { backgroundColor: "#fff3e0" }]}>
      <Text style={[styles.badgeText, { color: "#e65100" }]}>路線鎖定</Text>
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

function getTripLockBody(
  state: TripExperienceState | null,
): {
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
  const isTripInProgress = taskDetail?.status === "on_trip";
  const showTripMetrics = shouldShowTripMetrics(taskDetail);
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
  const tripExperienceState = getTripExperienceState(taskDetail);
  const primaryTripAction = getPrimaryTripAction(taskDetail);
  const tripStatusPresentation = getTripStatusPresentation(
    tripExperienceState,
    taskDetail,
    locationTrackingState,
    locationTrackingMessage,
  );
  const tripLockBody = getTripLockBody(tripExperienceState);
  const showCompletionProofCard = shouldShowTripCompletionProof(taskDetail);
  const completionSubmitBlocker = getCompletionSubmitBlocker({
    proofRequirementsUnavailable,
    missingRequiredPhotos,
    signoffRequirementMissing,
    expenseRequirementMissing,
    expenseAmountInvalid,
    completionBlockedByTracking,
  });

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

  async function handleForwardedReject() {
    if (!taskDetail?.taskId) {
      return;
    }

    try {
      setSubmittingAction("reject");
      await getDriverClient().rejectTask(taskDetail.taskId, {
        reasonCode: "driver_declined_forwarded_offer",
        reasonNote:
          "Driver declined forwarded platform offer from trip screen.",
      });
      Alert.alert("已拒絕", "已回覆不接受此平台訂單。");
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
      <View style={styles.center}>
        <ActivityIndicator size="large" />
        <Text style={styles.label}>載入行程中…</Text>
      </View>
    );
  }

  return (
    <ScrollView style={styles.container} contentContainerStyle={styles.content}>
      <Text style={styles.title}>行程作業台</Text>

      {error && <Text style={styles.error}>錯誤：{error}</Text>}

      {taskDetail ? (
        <View style={styles.card}>
          <View style={styles.cardHeader}>
            <Text style={styles.taskId}>任務：{taskDetail.taskId}</Text>
            <View style={styles.badgeRow}>
              {isForwardedTask(taskDetail) && <RouteLockedBadge />}
              <PlatformTaskBadge platformCode={taskDetail.sourcePlatform} />
            </View>
          </View>
          <Text style={styles.taskStatus}>
            狀態：{formatDriverTaskStatusLabel(taskDetail.status)}
          </Text>
          <View
            style={[
              styles.tripStatusPanel,
              {
                backgroundColor: getStatusToneStyles(
                  tripStatusPresentation.tone,
                ).background,
              },
            ]}
          >
            <View style={styles.tripStatusHeader}>
              <View
                style={[
                  styles.tripStatusDot,
                  {
                    backgroundColor: getStatusToneStyles(
                      tripStatusPresentation.tone,
                    ).dot,
                  },
                ]}
              />
              <Text
                style={[
                  styles.tripStatusLabel,
                  {
                    color: getStatusToneStyles(tripStatusPresentation.tone)
                      .text,
                  },
                ]}
              >
                {tripStatusPresentation.label}
              </Text>
            </View>
            <Text style={styles.tripStatusDetail}>
              {tripStatusPresentation.detail}
            </Text>
          </View>
          {tripLockBody && (
            <View style={styles.tripLockCard}>
              <Ionicons
                name={tripLockBody.icon}
                size={18}
                color={Tokens.colors.warning}
              />
              <View style={styles.tripLockCopy}>
                <Text style={styles.tripLockTitle}>{tripLockBody.title}</Text>
                <Text style={styles.tripLockDetail}>{tripLockBody.detail}</Text>
              </View>
            </View>
          )}
          <Text style={styles.taskInfo}>
            {taskDetail.orderId
              ? `訂單：${taskDetail.orderId}`
              : "尚未關聯訂單"}
          </Text>
          <RouteDisplay task={taskDetail} order={orderDetail} />
          {showTripMetrics && (
            <View style={styles.metricsCard}>
              <View style={styles.metricsHeader}>
                <Text style={styles.metricsTitle}>行程度量</Text>
                {isTripInProgress && (
                  <Text style={styles.metricsStatusPill}>
                    {locationTrackingState === "active" ? "追蹤中" : "需處理"}
                  </Text>
                )}
              </View>
              <View style={styles.metricsGrid}>
                <View style={styles.metricTile}>
                  <Text style={styles.metricLabel}>距離</Text>
                  <Text style={styles.metricValue}>
                    {formatTripDistance(liveDistanceKm)}
                  </Text>
                </View>
                <View style={styles.metricTile}>
                  <Text style={styles.metricLabel}>時長</Text>
                  <Text style={styles.metricValue}>
                    {formatTripDuration(liveDurationSec)}
                  </Text>
                </View>
              </View>
              {isTripInProgress && locationTrackingState === "active" && (
                <Text style={styles.metricHint}>
                  {locationTrackingMessage ?? "此行程已啟用即時定位追蹤。"}
                </Text>
              )}
              {isTripInProgress &&
                locationTrackingState === "requesting_permission" && (
                  <Text style={styles.metricWarning}>
                    請允許定位權限以啟動即時行程追蹤。
                  </Text>
                )}
              {isTripInProgress &&
                (locationTrackingState === "permission_denied" ||
                  locationTrackingState === "error") && (
                  <>
                    <Text style={styles.metricWarning}>
                      {locationTrackingMessage ??
                        "行程度量無法啟動。請先恢復定位追蹤，再完成行程。"}
                    </Text>
                    <ActionButton
                      label="重試追蹤"
                      onPress={() =>
                        setTrackingRetryKey((current) => current + 1)
                      }
                      disabled={submittingAction !== null}
                      variant="secondary"
                    />
                  </>
                )}
            </View>
          )}
          {complianceGates.length > 0 && (
            <View style={styles.complianceCard}>
              <Text style={styles.complianceTitle}>合規檢查</Text>
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
                    <Text
                      style={[styles.complianceGateTitle, { color: tone.text }]}
                    >
                      {gate.title}
                    </Text>
                    <Text
                      style={[styles.complianceGateState, { color: tone.text }]}
                    >
                      {gate.state}
                    </Text>
                    <Text style={styles.complianceGateAction}>
                      {gate.nextAction}
                    </Text>
                    {gate.missingItems.length > 0 && (
                      <Text style={styles.complianceGateMeta}>
                        缺少項目：{gate.missingItems.join(", ")}
                      </Text>
                    )}
                  </View>
                );
              })}
            </View>
          )}
          {isForwardedTask(taskDetail) && (
            <Text style={styles.forwardedNote}>
              此任務由 {taskDetail.sourcePlatform}{" "}
              派發，派遣規則由來源平台管理。
            </Text>
          )}
        </View>
      ) : (
        <Text style={styles.empty}>目前沒有進行中的行程。</Text>
      )}

      {!isForwardedTask(taskDetail) && taskDetail && (
        <>
          {showCompletionProofCard && (
            <View style={styles.proofCard}>
              <View style={styles.proofHeader}>
                <Text style={styles.proofTitle}>完單佐證</Text>
                <Text style={styles.proofCounter}>
                  已附加 {proofPhotos.length}/{MAX_COMPLETION_PROOF_PHOTOS}
                </Text>
              </View>

              <Text style={styles.proofHint}>
                最多可附加 5 張照片。每張佐證照片壓縮後需低於 600KB。
              </Text>

              {proofRequirementsUnavailable && (
                <Text style={styles.unsupportedNote}>
                  需待訂單詳情載入後才能確認佐證需求；請先重新整理行程，再完成任務。
                </Text>
              )}

              {proofRequirements.minPhotoCount > 0 && (
                <Text style={styles.requirementNote}>
                  此行程至少需要 {proofRequirements.minPhotoCount} 張佐證照片。
                  {missingRequiredPhotos > 0
                    ? ` 完成前還需補上 ${missingRequiredPhotos} 張。`
                    : " 已達照片需求。"}
                </Text>
              )}

              {proofRequirements.signoffRequired && (
                <View style={styles.requirementCard}>
                  <Text style={styles.requirementCardTitle}>
                    必須提供簽收佐證
                  </Text>
                  <Text style={styles.requirementCardHint}>
                    完成行程前，請填寫乘客或現場簽收識別資料。
                  </Text>
                  <TextInput
                    style={styles.proofInput}
                    value={signoffReference}
                    onChangeText={setSignoffReference}
                    editable={submittingAction === null}
                    placeholder="乘客簽收或簽收單號"
                    autoCapitalize="characters"
                  />
                  <Text style={styles.requirementStatus}>
                    {signoffRequirementMissing
                      ? "尚未填寫簽收識別資料。"
                      : "簽收需求已完成。"}
                  </Text>
                </View>
              )}

              {proofRequirements.expenseProofRequired && (
                <View style={styles.requirementCard}>
                  <Text style={styles.requirementCardTitle}>
                    必須提供費用佐證
                  </Text>
                  <Text style={styles.requirementCardHint}>
                    請填寫一筆可報銷費用，包含類型、金額與單據識別，供財務覆核。
                  </Text>
                  <TextInput
                    style={styles.proofInput}
                    value={expenseType}
                    onChangeText={setExpenseType}
                    editable={submittingAction === null}
                    placeholder="費用類型，例如過路費或停車費"
                    autoCapitalize="none"
                  />
                  <TextInput
                    style={styles.proofInput}
                    value={expenseAmount}
                    onChangeText={setExpenseAmount}
                    editable={submittingAction === null}
                    placeholder="金額，例如 40 或 40.50"
                    keyboardType="decimal-pad"
                  />
                  <TextInput
                    style={styles.proofInput}
                    value={expenseAttachmentRef}
                    onChangeText={setExpenseAttachmentRef}
                    editable={submittingAction === null}
                    placeholder="單據或附件識別"
                    autoCapitalize="characters"
                  />
                  <Text style={styles.requirementStatus}>
                    {expenseAmountInvalid
                      ? "請輸入有效的正數金額。"
                      : expenseRequirementMissing
                        ? "費用佐證資料尚未填完整。"
                        : expenseAttachmentId
                          ? `費用佐證已完成：${expenseAttachmentId}`
                          : "費用佐證已完成。"}
                  </Text>
                </View>
              )}

              <View style={styles.proofActions}>
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
                <Text style={styles.emptyProofState}>尚未選取佐證照片。</Text>
              )}
            </View>
          )}

          {primaryTripAction && (
            <View style={styles.primaryActionCard}>
              <Text style={styles.primaryActionEyebrow}>主要動作</Text>
              <Text style={styles.primaryActionTitle}>
                {primaryTripAction.title}
              </Text>
              <Text style={styles.primaryActionHint}>
                {primaryTripAction.helperText}
              </Text>
              <ActionButton
                label={
                  submittingAction === primaryTripAction.action &&
                  primaryTripAction.action === "complete"
                    ? "完成中…"
                    : primaryTripAction.label
                }
                onPress={() => void handleAction(primaryTripAction.action)}
                disabled={
                  primaryTripAction.action === "complete"
                    ? shouldDisableCompleteTripAction({
                        submittingAction,
                        proofRequirementsUnavailable,
                        missingRequiredPhotos,
                        signoffRequirementMissing,
                        expenseRequirementMissing,
                        expenseAmountInvalid,
                        completionBlockedByTracking,
                      })
                    : submittingAction !== null
                }
              />
            </View>
          )}
        </>
      )}

      {taskDetail && isForwardedTask(taskDetail) && (
        <View style={styles.primaryActionCard}>
          <Text style={styles.primaryActionEyebrow}>主要動作</Text>
          <Text style={styles.primaryActionTitle}>等待來源平台同步</Text>
          <Text style={styles.forwardedActionNote}>
            任務操作由 {taskDetail.sourcePlatform}{" "}
            管理，本地只顯示同步結果與路線資訊，不會變更任務狀態。
          </Text>
          {taskDetail.status === "pending_acceptance" && (
            <ActionButton
              label={submittingAction === "reject" ? "拒絕中…" : "拒絕平台訂單"}
              onPress={() => void handleForwardedReject()}
              disabled={submittingAction !== null}
              variant="secondary"
            />
          )}
        </View>
      )}

      <View style={styles.footer}>
        <View style={styles.sosCard}>
          <Text style={styles.sosEyebrow}>安全支援</Text>
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
      </View>
    </ScrollView>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1, padding: 16, backgroundColor: "#fff" },
  content: { paddingBottom: 24 },
  center: { flex: 1, justifyContent: "center", alignItems: "center" },
  title: { fontSize: 24, fontWeight: "bold", marginBottom: 12 },
  error: { color: "red", marginBottom: 8 },
  empty: { textAlign: "center", color: "#999", marginTop: 32 },
  card: {
    padding: 16,
    backgroundColor: "#f0f7ff",
    borderRadius: 8,
    marginBottom: 16,
  },
  cardHeader: {
    flexDirection: "row",
    justifyContent: "space-between",
    alignItems: "flex-start",
    marginBottom: 8,
  },
  badgeRow: { flexDirection: "row", alignItems: "center", flexShrink: 1 },
  badge: {
    paddingHorizontal: 8,
    paddingVertical: 2,
    borderRadius: 12,
    marginLeft: 4,
  },
  badgeText: { fontSize: 11, fontWeight: "600" },
  taskId: { fontSize: 18, fontWeight: "600", flex: 1 },
  taskStatus: { fontSize: 14, color: "#666", marginTop: 4 },
  tripStatusPanel: {
    borderRadius: 12,
    padding: 12,
    marginTop: 10,
    gap: 6,
  },
  tripStatusHeader: {
    flexDirection: "row",
    alignItems: "center",
    gap: 8,
  },
  tripStatusDot: {
    width: 8,
    height: 8,
    borderRadius: 4,
  },
  tripStatusLabel: {
    fontSize: 14,
    fontWeight: "700",
  },
  tripStatusDetail: {
    fontSize: 12,
    color: "#334155",
    lineHeight: 18,
  },
  tripLockCard: {
    flexDirection: "row",
    alignItems: "flex-start",
    gap: 10,
    borderRadius: 12,
    borderWidth: 1,
    borderColor: "#fcd34d",
    backgroundColor: "#fffbeb",
    padding: 12,
    marginTop: 10,
  },
  tripLockCopy: {
    flex: 1,
    gap: 2,
  },
  tripLockTitle: {
    fontSize: 13,
    fontWeight: "700",
    color: "#92400e",
  },
  tripLockDetail: {
    fontSize: 12,
    color: "#92400e",
    lineHeight: 17,
  },
  taskInfo: { fontSize: 14, color: "#333", marginTop: 8 },
  forwardedNote: {
    fontSize: 11,
    color: "#666",
    marginTop: 8,
    fontStyle: "italic",
  },
  metricsCard: {
    marginTop: 12,
    padding: 12,
    borderRadius: 8,
    backgroundColor: "#fff",
    borderWidth: 1,
    borderColor: "#d9e7f5",
    gap: 10,
  },
  metricsHeader: {
    flexDirection: "row",
    justifyContent: "space-between",
    alignItems: "center",
    gap: 8,
  },
  metricsTitle: { fontSize: 16, fontWeight: "600", color: "#0f3554" },
  metricsStatusPill: {
    fontSize: 11,
    fontWeight: "600",
    color: "#0f6cbd",
    backgroundColor: "#e8f3fc",
    paddingHorizontal: 8,
    paddingVertical: 4,
    borderRadius: 999,
  },
  metricsGrid: {
    flexDirection: "row",
    gap: 12,
  },
  metricTile: {
    flex: 1,
    backgroundColor: "#f7fbff",
    borderRadius: 8,
    padding: 12,
    borderWidth: 1,
    borderColor: "#d9e7f5",
  },
  metricLabel: { fontSize: 12, color: "#4f6b85", marginBottom: 4 },
  metricValue: { fontSize: 20, fontWeight: "700", color: "#0f3554" },
  metricHint: { fontSize: 12, color: "#0f6cbd" },
  metricWarning: { fontSize: 12, color: "#b42318" },
  complianceCard: {
    marginTop: 12,
    padding: 12,
    borderRadius: 8,
    backgroundColor: "#fff",
    borderWidth: 1,
    borderColor: "#d9e7f5",
    gap: 10,
  },
  complianceTitle: { fontSize: 16, fontWeight: "600", color: "#0f3554" },
  complianceGate: {
    borderWidth: 1,
    borderRadius: 8,
    padding: 10,
    gap: 4,
  },
  complianceGateTitle: { fontSize: 14, fontWeight: "600" },
  complianceGateState: {
    fontSize: 11,
    fontWeight: "700",
    textTransform: "uppercase",
  },
  complianceGateAction: { fontSize: 12, color: "#334155" },
  complianceGateMeta: { fontSize: 12, color: "#64748b" },
  proofCard: {
    backgroundColor: "#faf7ef",
    borderRadius: 8,
    padding: 16,
    marginBottom: 16,
    borderWidth: 1,
    borderColor: "#f0dcc0",
  },
  proofHeader: {
    flexDirection: "row",
    justifyContent: "space-between",
    alignItems: "center",
    marginBottom: 8,
    gap: 8,
  },
  proofTitle: { fontSize: 18, fontWeight: "600", color: "#5a420c" },
  proofCounter: { fontSize: 12, color: "#7d6842" },
  proofHint: { fontSize: 12, color: "#7d6842", marginBottom: 8 },
  requirementNote: {
    fontSize: 12,
    color: "#8a5b00",
    marginBottom: 8,
  },
  requirementCard: {
    backgroundColor: "#fffdf7",
    borderWidth: 1,
    borderColor: "#ead7b5",
    borderRadius: 8,
    padding: 12,
    gap: 8,
    marginBottom: 12,
  },
  requirementCardTitle: {
    fontSize: 14,
    fontWeight: "600",
    color: "#5a420c",
  },
  requirementCardHint: {
    fontSize: 12,
    color: "#7d6842",
  },
  proofInput: {
    borderWidth: 1,
    borderColor: "#d8c49f",
    borderRadius: 8,
    backgroundColor: "#fff",
    paddingHorizontal: 12,
    paddingVertical: 10,
    fontSize: 14,
    color: "#1f2937",
  },
  requirementStatus: {
    fontSize: 12,
    color: "#7d6842",
  },
  unsupportedNote: {
    fontSize: 12,
    color: "#b42318",
    marginBottom: 8,
  },
  proofActions: {
    flexDirection: "row",
    gap: 8,
    marginBottom: 12,
  },
  photoGrid: {
    flexDirection: "row",
    flexWrap: "wrap",
    gap: 12,
  },
  photoCard: {
    width: "47%",
    backgroundColor: "#fff",
    borderRadius: 8,
    padding: 8,
    borderWidth: 1,
    borderColor: "#e8d7bb",
    gap: 8,
  },
  photoPreview: {
    width: "100%",
    aspectRatio: 1.2,
    borderRadius: 6,
    backgroundColor: "#f1f1f1",
  },
  photoMeta: { fontSize: 12, color: "#666", textAlign: "center" },
  emptyProofState: {
    fontSize: 13,
    color: "#666",
    fontStyle: "italic",
  },
  primaryActionCard: {
    marginBottom: 16,
    padding: 16,
    borderRadius: 8,
    backgroundColor: "#f3f7fb",
    borderWidth: 1,
    borderColor: "#d4e2f0",
    gap: 8,
  },
  primaryActionEyebrow: {
    fontSize: 11,
    fontWeight: "700",
    letterSpacing: 0.8,
    color: "#45627d",
  },
  primaryActionTitle: {
    fontSize: 18,
    fontWeight: "700",
    color: "#0f3554",
  },
  primaryActionHint: {
    fontSize: 13,
    color: "#45627d",
    marginBottom: 4,
  },
  actionButton: {
    minHeight: 44,
    borderRadius: 8,
    alignItems: "center",
    justifyContent: "center",
    paddingHorizontal: 12,
    paddingVertical: 10,
  },
  actionButtonPrimary: {
    backgroundColor: "#0f6cbd",
  },
  actionButtonSecondary: {
    backgroundColor: "#fff",
    borderWidth: 1,
    borderColor: "#c7d7ea",
  },
  actionButtonDisabled: {
    opacity: 0.45,
  },
  actionButtonPressed: {
    opacity: 0.85,
  },
  actionButtonText: {
    fontSize: 16,
    fontWeight: "600",
  },
  actionButtonTextPrimary: {
    color: "#fff",
  },
  actionButtonTextSecondary: {
    color: "#0f6cbd",
  },
  forwardedActionNote: {
    fontSize: 13,
    color: "#45627d",
  },
  footer: { marginTop: 8 },
  sosCard: {
    padding: 16,
    borderRadius: 12,
    backgroundColor: "#fff1f2",
    borderWidth: 1,
    borderColor: "#f6c7cd",
    gap: 8,
  },
  sosEyebrow: {
    fontSize: 11,
    fontWeight: "700",
    letterSpacing: 0.8,
    color: "#8a0f19",
  },
  sosTitle: {
    fontSize: 18,
    fontWeight: "700",
    color: "#6b0f17",
  },
  sosNote: {
    fontSize: 13,
    color: "#8a3b44",
  },
  sosButton: {
    marginTop: 4,
  },
  label: { marginTop: 8, color: "#666" },
});
