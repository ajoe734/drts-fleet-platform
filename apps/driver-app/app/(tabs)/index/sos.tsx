import { useEffect, useMemo, useRef, useState } from "react";
import {
  Alert,
  AppState,
  Linking,
  PanResponder,
  Pressable,
  StyleSheet,
  Text,
  TextInput,
  View,
  Vibration,
} from "react-native";
import { Ionicons } from "@expo/vector-icons";
import { useRouter } from "expo-router";
import * as ImagePicker from "expo-image-picker";
import {
  type ConfirmDriverSosAttachmentUploadResult,
  type CreateDriverSosAttachmentUploadIntentResult,
  type DriverSosAttachmentRecord,
  PLATFORM_CODE_REGISTRY,
  type DriverTaskRecord,
  type DriverSosEventType,
  type DriverSosLocationSnapshot,
  type UnifiedDriverTaskView,
} from "@drts/contracts";

import {
  Banner,
  Btn,
  Card,
  DL,
  Field,
  PageHeader,
  Pill,
  Shell,
  driverCanvasTheme,
} from "@/components/canvas-primitives";
import * as Location from "expo-location";
import {
  formatDriverError,
  getDriverClient,
  getDriverDeviceId,
  recoverDriverSessionFromApiError,
} from "@/lib/api-client";
import { loadTrackingSessionMarker } from "@/lib/driver-tracking-recovery";
import { resetDriverAppToOnboarding } from "@/lib/driver-identity-routing";
import {
  applyDriverSosAttachmentSyncResult,
  addDriverSosDialRecord,
  buildDriverSosSubmitCommand,
  createDriverSosActiveCase,
  createDriverSosAttachmentDraft,
  loadDriverSosActiveCase,
  markDriverSosCaseFailed,
  markDriverSosCaseSending,
  markDriverSosCaseSubmitted,
  markDriverSosFalseAlarm,
  queueDriverSosSupplement,
  saveDriverSosActiveCase,
  type DriverSosActiveCase,
  type DriverSosAttachmentDraft,
} from "@/lib/driver-sos-outbox";
import { syncDriverSosAttachments } from "@/lib/driver-sos-attachment-upload";
import { getLatestDriverLocationUpdate } from "@/lib/driver-location-heartbeat";
import { isDriverCapabilityForbidden } from "@/lib/driver-runtime-profile";
import {
  buildFallbackUnifiedDriverTaskView,
  isUnifiedTaskPlatformClosed,
  summarizeWorkspaceTasks,
} from "@/lib/driver-workspace-cockpit";
import { formatDriverTaskStatusLabel } from "@/lib/operational-labels";
import {
  driverForwardedTaskStatusLabels,
  driverIncidentSituations,
  driverRouteTitles,
} from "@/lib/strings";

const THEME = driverCanvasTheme;
const HOLD_DURATION_MS = 2_000;
const HOLD_PROGRESS_INTERVAL_MS = 50;
const MAX_ATTACHMENTS = 4;
const FLEET_DUTY_PHONE_NUMBER = "02-2191-7788";
/**
 * Backoff for automatic re-delivery of a request that has not reached the
 * platform yet. React Native has no `navigator.onLine`, so the schedule runs
 * regardless of any guessed connectivity state and simply keeps trying; the
 * result of each attempt is what tells us whether the network is back.
 */
const AUTO_RETRY_DELAYS_MS = [1_000, 2_000, 5_000, 10_000, 10_000] as const;

type SosSituationId = (typeof driverIncidentSituations)[number]["id"];
// S3-FIX-DRIVER-SOS-VOCAB-001: the cross-platform fields live in their own
// optional group rather than inline on the context, so the multi_taxi_direct
// gate can drop them as a unit. When `crossPlatform` is null there is nothing
// for the card to render from — the rows cannot be reintroduced by accident.
type SosCrossPlatformContext = {
  platformCode: string | null;
  platformLabel: string;
  externalOrderId: string | null;
  platformStatus: string | null;
  aggregated: boolean;
};
type SosTaskContext = {
  taskId: string | null;
  orderId: string | null;
  localStatus: string | null;
  vehicleId: string | null;
  crossPlatform: SosCrossPlatformContext | null;
};
/** Connectivity is inferred from real request outcomes, never guessed. */
type SosConnectivity = "unknown" | "online" | "offline";
type SyncChipModel = {
  tone: "danger" | "warn" | "info" | "success";
  label: string;
  detail: string;
};

/**
 * A failure that carries an HTTP status proves the platform answered, so the
 * device is online; anything else (fetch/abort/DNS) is treated as no network.
 */
function classifyConnectivityFromError(error: unknown): SosConnectivity {
  const message =
    error instanceof Error
      ? error.message
      : typeof error === "string"
        ? error
        : "";
  return /^API error \d+/.test(message) ? "online" : "offline";
}

function humanizeCode(value: string) {
  return value
    .replace(/[_-]+/g, " ")
    .replace(/\b\w/g, (character) => character.toUpperCase());
}

function isOwnedPlatformCode(platformCode: string | null | undefined) {
  const normalized = platformCode?.trim().toLowerCase() ?? "drts";
  return (
    normalized === "drts" || normalized === "owned" || normalized === "direct"
  );
}

function getPlatformDisplayLabel(platformCode: string | null | undefined) {
  const normalized = platformCode?.trim().toLowerCase();
  if (!normalized || isOwnedPlatformCode(normalized)) {
    return "DRTS";
  }

  if (normalized in PLATFORM_CODE_REGISTRY) {
    return PLATFORM_CODE_REGISTRY[
      normalized as keyof typeof PLATFORM_CODE_REGISTRY
    ].displayName;
  }

  return humanizeCode(normalized);
}

function mapSituationToDriverSosEventType(
  situationId: SosSituationId | null,
): DriverSosEventType | null {
  switch (situationId) {
    case "traffic_collision":
      return "traffic_accident";
    case "medical_emergency":
      return "passenger_medical";
    case "passenger_conflict":
    case "route_threat":
      return "security_incident";
    case "vehicle_breakdown":
    case "other":
      return "other";
    default:
      return null;
  }
}

function getSituationLabel(situationId: SosSituationId | null): string | null {
  if (!situationId) {
    return null;
  }

  return (
    driverIncidentSituations.find((situation) => situation.id === situationId)
      ?.label ?? null
  );
}

function formatPlatformStatusLabel(status: string | null) {
  if (!status) {
    return null;
  }

  const normalized = status.trim().toLowerCase();
  return (
    driverForwardedTaskStatusLabels[
      normalized as keyof typeof driverForwardedTaskStatusLabels
    ] ?? formatDriverTaskStatusLabel(status)
  );
}

function isOwnedDomainTask(task: UnifiedDriverTaskView) {
  return task.orderDomain === "owned" || isOwnedPlatformCode(task.sourcePlatform);
}

function pickSosTaskContext(
  tasks: ReadonlyArray<UnifiedDriverTaskView>,
  vehicleIdByTaskId: ReadonlyMap<string, string> = new Map(),
): SosTaskContext | null {
  if (tasks.length === 0) {
    return null;
  }

  const aggregationForbidden = isDriverCapabilityForbidden("forwarded_order_ui");
  const summary = summarizeWorkspaceTasks(tasks);
  const prioritizedTasks = [
    summary.activeTripTask,
    summary.actionRequiredTask,
    summary.awaitingPlatformTask,
    ...summary.orderedTasks,
  ].filter(
    (task, index, list): task is UnifiedDriverTaskView =>
      task != null && list.indexOf(task) === index,
  );

  // S3-FIX-DRIVER-SOS-VOCAB-001: the selection itself is realm-conditional, not
  // just the labels. multi_taxi_direct declares orderDomains: ["owned"], so a
  // cross-platform task is not part of that realm and must never become the SOS
  // context — previously the screen actively PREFERRED one, which is what put
  // cross-platform identifiers in front of a multi_taxi_direct driver.
  const candidates = aggregationForbidden
    ? prioritizedTasks.filter(isOwnedDomainTask)
    : prioritizedTasks;

  const selectedTask = aggregationForbidden
    ? (candidates[0] ?? null)
    : (candidates.find(
        (task) =>
          !isOwnedDomainTask(task) && !isUnifiedTaskPlatformClosed(task),
      ) ??
      candidates[0] ??
      null);

  if (!selectedTask) {
    return null;
  }

  return {
    taskId: selectedTask.taskId,
    orderId: selectedTask.orderId,
    localStatus: selectedTask.localStatus,
    vehicleId: vehicleIdByTaskId.get(selectedTask.taskId) ?? null,
    crossPlatform:
      aggregationForbidden || isOwnedDomainTask(selectedTask)
        ? null
        : {
            platformCode: selectedTask.sourcePlatform,
            platformLabel:
              selectedTask.platformDisplayName ||
              getPlatformDisplayLabel(selectedTask.sourcePlatform),
            externalOrderId: selectedTask.externalOrderId,
            platformStatus: selectedTask.nativeStatus,
            aggregated: true,
          },
  };
}

/**
 * Resolves the trip/task/vehicle that the request should be attached to.
 * Everything here is best-effort: a driver in trouble must still be able to
 * send, so any failure degrades to a request without trip context rather than
 * bubbling up. `getDriverClient()` is inside the try because it throws when the
 * device is not bound yet.
 */
async function resolveSosTaskContext(): Promise<SosTaskContext | null> {
  try {
    const client = getDriverClient();
    const [unifiedResult, legacyResult] = await Promise.allSettled([
      client.listUnifiedDriverTasks(),
      client.listDriverTasks(),
    ]);

    const legacyTasks: DriverTaskRecord[] =
      legacyResult.status === "fulfilled" ? legacyResult.value : [];
    const vehicleIdByTaskId = new Map<string, string>();
    for (const task of legacyTasks) {
      if (task.taskId && task.vehicleId) {
        vehicleIdByTaskId.set(task.taskId, task.vehicleId);
      }
    }

    if (unifiedResult.status === "fulfilled") {
      return pickSosTaskContext(unifiedResult.value, vehicleIdByTaskId);
    }

    if (legacyTasks.length > 0) {
      return pickSosTaskContext(
        legacyTasks.map((task: DriverTaskRecord) =>
          buildFallbackUnifiedDriverTaskView(task),
        ),
        vehicleIdByTaskId,
      );
    }

    return null;
  } catch {
    return null;
  }
}

function getDriverSosLocationSnapshot(): DriverSosLocationSnapshot | null {
  const latestUpdate = getLatestDriverLocationUpdate();
  if (!latestUpdate) {
    return null;
  }

  return {
    lat: latestUpdate.latitude,
    lng: latestUpdate.longitude,
    accuracyM: latestUpdate.accuracyM,
    recordedAt: latestUpdate.recordedAt,
    reverseGeocodedAddress: null,
    geocodeProvider: null,
  };
}

/**
 * Takes one fresh fix when the screen opens instead of relying purely on the
 * heartbeat cache, which can be minutes old (or empty when the driver has not
 * been tracked yet). Never prompts for a permission here — a permission dialog
 * on top of an emergency screen would block the request — and never throws.
 */
async function refreshDriverSosLocationSnapshot(): Promise<DriverSosLocationSnapshot | null> {
  try {
    const permission = await Location.getForegroundPermissionsAsync();
    if (!permission.granted) {
      return getDriverSosLocationSnapshot();
    }

    const position = await Location.getCurrentPositionAsync({
      accuracy: Location.Accuracy.Balanced,
    });

    return {
      lat: position.coords.latitude,
      lng: position.coords.longitude,
      accuracyM: position.coords.accuracy ?? null,
      recordedAt: new Date(position.timestamp || Date.now()).toISOString(),
      reverseGeocodedAddress: null,
      geocodeProvider: null,
    };
  } catch {
    return getDriverSosLocationSnapshot();
  }
}

function getErrorMessage(error: unknown): string {
  return formatDriverError(error, "操作失敗，請稍後再試。");
}

function formatAttachmentUploadLabel(
  uploadState: DriverSosAttachmentDraft["uploadState"],
): string {
  switch (uploadState) {
    case "uploading":
      return "上傳中";
    case "confirmed":
      return "已上傳完成";
    case "unavailable":
      return "尚未上傳，稍後自動重試";
    case "failed_retryable":
      return "上傳失敗，將自動重試";
    default:
      return "保存在手機";
  }
}

function formatAt(value: string | null) {
  if (!value) {
    return "尚無更新";
  }

  const parsed = Date.parse(value);
  if (Number.isNaN(parsed)) {
    return value;
  }

  return new Date(parsed).toLocaleString("zh-TW", {
    month: "numeric",
    day: "numeric",
    hour: "2-digit",
    minute: "2-digit",
  });
}

/**
 * The only four states the driver ever sees. "平台已接收" is reachable ONLY from
 * a case that carries a server receipt, so a request that never left the phone
 * can never read as a success.
 */
function getSyncChipModel(
  activeCase: DriverSosActiveCase | null,
  connectivity: SosConnectivity,
): SyncChipModel {
  if (!activeCase) {
    return {
      tone: connectivity === "offline" ? "warn" : "info",
      label: "尚未送出",
      detail:
        connectivity === "offline"
          ? "目前沒有網路。仍可長按送出，求援會先保存在手機並自動補送。"
          : "長按下方按鈕 2 秒，即可將求援送到車隊安全值班。",
    };
  }

  if (activeCase.syncState === "sending") {
    return {
      tone: "info",
      label: "送出中",
      detail: "正在送往車隊安全值班，尚未確認送達。",
    };
  }

  if (
    activeCase.syncState === "submitted" ||
    activeCase.syncState === "complete"
  ) {
    return {
      tone: "success",
      label: "平台已接收",
      detail: activeCase.receipt
        ? `車隊安全值班已接收，事件編號 ${activeCase.receipt.eventNo}。`
        : "車隊安全值班已接收本次求援。",
    };
  }

  if (activeCase.syncState === "attachment_pending") {
    return {
      tone: "success",
      label: "平台已接收",
      detail: activeCase.receipt
        ? `車隊安全值班已接收，事件編號 ${activeCase.receipt.eventNo}；附件仍在上傳，會自動重試。`
        : "車隊安全值班已接收本次求援；附件仍在上傳，會自動重試。",
    };
  }

  if (activeCase.syncState === "failed_retryable") {
    return {
      tone: "danger",
      label: "送出失敗，將自動重試",
      detail: "求援尚未送達平台，已保留在手機，系統會自動重試，也可以手動重送。",
    };
  }

  return {
    tone: "warn",
    label: "尚未送達，已保留於本機",
    detail: "求援已保存在手機，恢復連線後會自動送出。",
  };
}

function StatusChip({
  activeCase,
  connectivity,
}: {
  activeCase: DriverSosActiveCase | null;
  connectivity: SosConnectivity;
}) {
  const chip = getSyncChipModel(activeCase, connectivity);
  return (
    <View style={styles.statusChipRow}>
      <Pill theme={THEME} tone={chip.tone} dot>
        {chip.label}
      </Pill>
      <Text style={styles.statusChipDetail}>{chip.detail}</Text>
    </View>
  );
}

function AttachmentList({
  attachments,
  emptyLabel,
  onRemove,
}: {
  attachments: DriverSosAttachmentDraft[];
  emptyLabel: string;
  onRemove?: (attachmentId: string) => void;
}) {
  if (attachments.length === 0) {
    return <Text style={styles.emptyCopy}>{emptyLabel}</Text>;
  }

  return (
    <View style={styles.attachmentList}>
      {attachments.map((attachment) => (
        <View key={attachment.id} style={styles.attachmentRow}>
          <View style={styles.attachmentCopy}>
            <Text style={styles.attachmentName}>{attachment.fileName}</Text>
            <Text style={styles.attachmentMeta}>
              {formatAt(attachment.addedAt)}
            </Text>
            {attachment.uploadState !== "local" ? (
              <Text style={styles.attachmentMeta}>
                {formatAttachmentUploadLabel(attachment.uploadState)}
              </Text>
            ) : null}
          </View>
          {onRemove ? (
            <Btn
              theme={THEME}
              variant="ghost"
              size="sm"
              onPress={() => onRemove(attachment.id)}
            >
              移除
            </Btn>
          ) : null}
        </View>
      ))}
    </View>
  );
}

function SosHoldButton({
  disabled,
  holdProgress,
  submitting,
  onPress,
  onPressIn,
  onPressOut,
}: {
  disabled: boolean;
  holdProgress: number;
  submitting: boolean;
  onPress: () => void;
  onPressIn: () => void;
  onPressOut: () => void;
}) {
  return (
    <Pressable
      accessibilityLabel="長按確認求援"
      accessibilityHint="需長按 2 秒才會正式送出求援"
      accessibilityRole="button"
      delayLongPress={HOLD_DURATION_MS}
      disabled={disabled}
      onLongPress={onPress}
      onPressIn={onPressIn}
      onPressOut={onPressOut}
      style={({ pressed }) => [
        styles.holdButton,
        disabled ? styles.holdButtonDisabled : null,
        pressed && !disabled ? styles.holdButtonPressed : null,
      ]}
    >
      <View
        style={[
          styles.holdButtonProgress,
          { width: `${Math.round(holdProgress * 100)}%` },
        ]}
      />
      <View style={styles.holdButtonContent}>
        <Text style={styles.holdButtonLabel}>
          {submitting ? "送出中…" : "長按 2 秒確認求援"}
        </Text>
        <Text style={styles.holdButtonHint}>
          {submitting
            ? "正在通報車隊安全值班"
            : `目前進度 ${Math.round(holdProgress * 100)}%`}
        </Text>
      </View>
    </Pressable>
  );
}

function FalseAlarmSlider({
  disabled,
  onComplete,
}: {
  disabled: boolean;
  onComplete: () => Promise<void> | void;
}) {
  const [trackWidth, setTrackWidth] = useState(0);
  const [offsetX, setOffsetX] = useState(0);
  const maxOffset = Math.max(0, trackWidth - 52);

  const responder = useMemo(
    () =>
      PanResponder.create({
        onMoveShouldSetPanResponder: (_, gestureState) =>
          !disabled &&
          Math.abs(gestureState.dx) > Math.abs(gestureState.dy) &&
          Math.abs(gestureState.dx) > 4,
        onPanResponderMove: (_, gestureState) => {
          if (disabled || maxOffset <= 0) {
            return;
          }
          setOffsetX(Math.max(0, Math.min(maxOffset, gestureState.dx)));
        },
        onPanResponderRelease: () => {
          if (disabled || maxOffset <= 0) {
            setOffsetX(0);
            return;
          }

          if (offsetX / maxOffset >= 0.84) {
            setOffsetX(maxOffset);
            void Promise.resolve(onComplete()).finally(() => setOffsetX(0));
            return;
          }

          setOffsetX(0);
        },
        onPanResponderTerminate: () => setOffsetX(0),
      }),
    [disabled, maxOffset, offsetX, onComplete],
  );

  return (
    <View
      onLayout={(event) => setTrackWidth(event.nativeEvent.layout.width)}
      style={[styles.falseAlarmTrack, disabled ? styles.sliderDisabled : null]}
    >
      <View
        style={[
          styles.falseAlarmFill,
          {
            width: maxOffset > 0 ? 52 + offsetX : 52,
          },
        ]}
      />
      <Text style={styles.falseAlarmText}>
        向右滑動後再二次確認，才會標記誤觸
      </Text>
      <View
        {...responder.panHandlers}
        style={[
          styles.falseAlarmThumb,
          {
            transform: [{ translateX: offsetX }],
          },
        ]}
      >
        <Ionicons name="chevron-forward" size={22} color="#FFFFFF" />
      </View>
    </View>
  );
}

export default function DriverSosScreen() {
  const router = useRouter();
  const progressIntervalRef = useRef<ReturnType<typeof setInterval> | null>(
    null,
  );
  const holdStartedAtRef = useRef<number | null>(null);
  const holdTriggeredRef = useRef(false);

  const [connectivity, setConnectivity] = useState<SosConnectivity>("unknown");
  const [context, setContext] = useState<SosTaskContext | null>(null);
  const [loadingContext, setLoadingContext] = useState(true);
  const [activeCase, setActiveCase] = useState<DriverSosActiveCase | null>(
    null,
  );
  const [loadingCase, setLoadingCase] = useState(true);
  const [selectedSituation, setSelectedSituation] =
    useState<SosSituationId | null>("passenger_conflict");
  const [details, setDetails] = useState("");
  const [draftAttachments, setDraftAttachments] = useState<
    DriverSosAttachmentDraft[]
  >([]);
  const [supplementNote, setSupplementNote] = useState("");
  const [supplementAttachments, setSupplementAttachments] = useState<
    DriverSosAttachmentDraft[]
  >([]);
  const [falseAlarmNote, setFalseAlarmNote] = useState("");
  const [holdProgress, setHoldProgress] = useState(0);
  const [submitting, setSubmitting] = useState(false);
  const [screenError, setScreenError] = useState<string | null>(null);
  const [uiNotice, setUiNotice] = useState<string | null>(null);
  const [location, setLocation] = useState<DriverSosLocationSnapshot | null>(
    () => getDriverSosLocationSnapshot(),
  );
  const [locationReady, setLocationReady] = useState(false);
  const [deviceId, setDeviceId] = useState<string | null>(null);
  const [fallbackVehicleId, setFallbackVehicleId] = useState<string | null>(
    null,
  );

  const activeCaseRef = useRef<DriverSosActiveCase | null>(null);
  activeCaseRef.current = activeCase;
  const syncingRef = useRef(false);
  const retryTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const autoRetryRef = useRef<{ clientEventId: string | null; fired: number }>({
    clientEventId: null,
    fired: 0,
  });

  useEffect(() => {
    let cancelled = false;
    const bootstrap = async () => {
      // Everything the request needs is gathered up front and in parallel, so
      // a slow task lookup never delays the local case being ready to send.
      const [storedCase, taskContext, snapshot, device, marker] =
        await Promise.all([
          loadDriverSosActiveCase(),
          resolveSosTaskContext(),
          refreshDriverSosLocationSnapshot(),
          getDriverDeviceId().catch(() => null),
          loadTrackingSessionMarker().catch(() => null),
        ]);
      if (cancelled) {
        return;
      }

      setActiveCase(storedCase);
      setContext(taskContext);
      setDeviceId(device);
      setFallbackVehicleId(marker?.vehicleId ?? null);
      if (snapshot) {
        setLocation(snapshot);
      }
      setLocationReady(true);
      setLoadingCase(false);
      setLoadingContext(false);
    };

    bootstrap().catch(() => {
      if (cancelled) {
        return;
      }
      setLocationReady(true);
      setLoadingCase(false);
      setLoadingContext(false);
    });

    return () => {
      cancelled = true;
      if (progressIntervalRef.current) {
        clearInterval(progressIntervalRef.current);
      }
    };
  }, []);

  // Automatic re-delivery. A request that has not reached the platform is
  // retried on a backoff no matter what we think the connection state is —
  // React Native gives no reliable online flag, and the previous
  // `navigator.onLine` gate meant a failed request was never retried on a real
  // handset.
  useEffect(() => {
    if (retryTimerRef.current) {
      clearTimeout(retryTimerRef.current);
      retryTimerRef.current = null;
    }

    if (!activeCase || submitting || activeCase.falseAlarm.dismissed) {
      return;
    }
    if (
      activeCase.syncState !== "pending" &&
      activeCase.syncState !== "failed_retryable"
    ) {
      return;
    }

    const tracker = autoRetryRef.current;
    if (tracker.clientEventId !== activeCase.clientEventId) {
      tracker.clientEventId = activeCase.clientEventId;
      tracker.fired = 0;
    }
    if (tracker.fired >= AUTO_RETRY_DELAYS_MS.length) {
      return;
    }

    const delayMs = AUTO_RETRY_DELAYS_MS[tracker.fired] ?? 10_000;
    retryTimerRef.current = setTimeout(() => {
      retryTimerRef.current = null;
      autoRetryRef.current.fired += 1;
      syncActiveCase(activeCase, false).catch(() => undefined);
    }, delayMs);

    return () => {
      if (retryTimerRef.current) {
        clearTimeout(retryTimerRef.current);
        retryTimerRef.current = null;
      }
    };
  }, [activeCase, submitting]);

  // Coming back to the foreground is the strongest hint that connectivity may
  // have returned (tunnel, lift, dead spot), so retry once immediately and let
  // the backoff start over.
  useEffect(() => {
    const subscription = AppState.addEventListener?.(
      "change",
      (nextState: string) => {
        if (nextState !== "active") {
          return;
        }

        const current = activeCaseRef.current;
        if (!current || current.falseAlarm.dismissed || syncingRef.current) {
          return;
        }
        if (
          current.syncState !== "pending" &&
          current.syncState !== "failed_retryable"
        ) {
          return;
        }

        autoRetryRef.current.fired = 0;
        syncActiveCase(current, false).catch(() => undefined);
      },
    );

    return () => {
      subscription?.remove?.();
    };
  }, []);

  const syncChip = useMemo(
    () => getSyncChipModel(activeCase, connectivity),
    [activeCase, connectivity],
  );

  function resetHoldProgress() {
    if (progressIntervalRef.current) {
      clearInterval(progressIntervalRef.current);
      progressIntervalRef.current = null;
    }
    holdStartedAtRef.current = null;
    holdTriggeredRef.current = false;
    setHoldProgress(0);
  }

  async function persistActiveCase(nextCase: DriverSosActiveCase | null) {
    setActiveCase(nextCase);
    await saveDriverSosActiveCase(nextCase);
  }

  async function syncActiveCase(
    targetCase: DriverSosActiveCase,
    manualRetry: boolean,
  ) {
    // One in-flight delivery at a time: the manual button, the backoff timer
    // and the foreground listener can all fire at once, and the platform
    // should only ever see one attempt per `clientEventId` in flight.
    if (syncingRef.current) {
      return;
    }
    syncingRef.current = true;

    const sendingCase = markDriverSosCaseSending(targetCase);
    setSubmitting(true);
    setScreenError(null);
    setUiNotice(
      manualRetry
        ? "正在重新送出求援，尚未確認送達。"
        : "正在送出求援，尚未確認送達。",
    );
    await persistActiveCase(sendingCase);

    try {
      const result = await getDriverClient().submitDriverSosEvent(
        buildDriverSosSubmitCommand(sendingCase),
        {
          headers: {
            "Idempotency-Key": sendingCase.clientEventId,
            "X-Request-Id": sendingCase.clientEventId,
          },
        },
      );
      const submittedCase = markDriverSosCaseSubmitted(sendingCase, result);
      await persistActiveCase(submittedCase);
      const attachments = [
        ...submittedCase.attachments,
        ...submittedCase.supplements.flatMap(
          (supplement) => supplement.attachments,
        ),
      ];
      setConnectivity("online");
      if (attachments.length === 0) {
        setUiNotice(
          `平台已接收，事件編號 ${result.receipt.eventNo}，接收時間 ${formatAt(result.receipt.fleetReportConfirmedAt)}。`,
        );
        return;
      }

      const client = getDriverClient();
      const attachmentSync = await syncDriverSosAttachments({
        sosEventId: result.receipt.sosEventId,
        attachments,
        transport: {
          async prepare(attachment) {
            const response = await fetch(attachment.uri);
            const body = await response.blob();
            const contentType =
              attachment.mimeType?.trim().toLowerCase() ||
              body.type?.trim().toLowerCase() ||
              "image/jpeg";
            const fileSize = attachment.fileSize ?? body.size;
            if (!Number.isSafeInteger(fileSize) || fileSize <= 0) {
              throw new Error("無法讀取附件，已保留在手機並稍後重試。");
            }
            return { body, contentType, fileSize };
          },
          createUploadIntent(sosEventId, command) {
            return client.post<CreateDriverSosAttachmentUploadIntentResult>(
              `/api/driver/sos-events/${encodeURIComponent(sosEventId)}/attachments/upload-intents`,
              { body: command },
            );
          },
          async upload(intent, prepared) {
            const response = await fetch(intent.uploadUrl, {
              method: intent.method,
              headers: intent.headers,
              body: prepared.body,
            });
            if (!response.ok) {
              // Never surface the raw HTTP status to a driver.
              throw new Error("附件上傳失敗，稍後會自動重試。");
            }
          },
          confirm(sosEventId, objectKey) {
            return client.post<ConfirmDriverSosAttachmentUploadResult>(
              `/api/driver/sos-events/${encodeURIComponent(sosEventId)}/attachments/confirm`,
              { body: { objectKey } },
            );
          },
          retryScan(sosEventId, attachmentId) {
            return client.post<DriverSosAttachmentRecord>(
              `/api/driver/sos-events/${encodeURIComponent(sosEventId)}/attachments/${encodeURIComponent(attachmentId)}/retry-scan`,
            );
          },
        },
      });
      const completedCase = applyDriverSosAttachmentSyncResult(
        submittedCase,
        attachmentSync.attachments,
      );
      await persistActiveCase(completedCase);
      setUiNotice(
        attachmentSync.unavailableCount + attachmentSync.failedCount > 0
          ? `平台已接收，事件編號 ${result.receipt.eventNo}。附件尚未上傳完成，會自動重試。`
          : `平台已接收，事件編號 ${result.receipt.eventNo}，附件也已上傳完成。`,
      );
    } catch (error) {
      setConnectivity(classifyConnectivityFromError(error));

      // An expired or revoked session means the platform did NOT receive the
      // request. Keep it on the device so it can be sent again after the
      // driver signs back in, and never let this path show a success state.
      if (await recoverDriverSessionFromApiError(error)) {
        const expiredCase = markDriverSosCaseFailed(
          sendingCase,
          "連線憑證已失效，求援尚未送達平台。",
        );
        await persistActiveCase(expiredCase);
        setScreenError(
          "連線憑證已失效，求援尚未送達。請重新完成裝置綁定後再送出一次。",
        );
        setUiNotice(null);
        resetDriverAppToOnboarding(router);
        return;
      }

      const sanitizedError = formatDriverError(
        error,
        "求援送出失敗，請稍後再試。",
      );
      const failedCase = markDriverSosCaseFailed(sendingCase, sanitizedError);
      await persistActiveCase(failedCase);
      setScreenError(sanitizedError);
      setUiNotice("求援尚未送達平台，已保留在手機，系統會自動重試。");
    } finally {
      syncingRef.current = false;
      setSubmitting(false);
      resetHoldProgress();
    }
  }

  async function pickAttachments(
    target: "initial" | "supplement",
    existing: DriverSosAttachmentDraft[],
  ) {
    const committedAttachmentCount =
      target === "supplement" && activeCase
        ? activeCase.attachments.length +
          activeCase.supplements.reduce(
            (count, supplement) => count + supplement.attachments.length,
            0,
          )
        : 0;
    const remaining =
      MAX_ATTACHMENTS - committedAttachmentCount - existing.length;
    if (remaining <= 0) {
      Alert.alert(
        "已達附件上限",
        `每筆求援最多附上 ${MAX_ATTACHMENTS} 件附件。`,
      );
      return;
    }

    const result = await ImagePicker.launchImageLibraryAsync({
      mediaTypes: ImagePicker.MediaTypeOptions.Images,
      allowsMultipleSelection: true,
      quality: 0.7,
      selectionLimit: remaining,
    });

    if (result.canceled) {
      return;
    }

    const nextAttachments = result.assets
      .slice(0, remaining)
      .map((asset) => createDriverSosAttachmentDraft(asset));

    if (target === "initial") {
      setDraftAttachments((current) => [...current, ...nextAttachments]);
      return;
    }

    setSupplementAttachments((current) => [...current, ...nextAttachments]);
  }

  async function openNativeDial(
    target: "police" | "fire" | "fleet",
    phoneNumber: string,
  ) {
    try {
      await Linking.openURL(`tel:${phoneNumber}`);
      if (activeCase) {
        const nextCase = addDriverSosDialRecord(activeCase, {
          target,
          phoneNumber,
        });
        await persistActiveCase(nextCase);
      }
    } catch (error) {
      Alert.alert("無法開啟撥號", getErrorMessage(error));
    }
  }

  async function handleSubmitSos() {
    if (submitting) {
      return;
    }

    if (activeCase && !activeCase.falseAlarm.dismissed) {
      setScreenError("目前已有一筆進行中的求援，請用下方補充區更新資訊。");
      resetHoldProgress();
      return;
    }

    const description = details.trim();
    // Prefer the freshest fix available at the moment of the trigger.
    const snapshot = getDriverSosLocationSnapshot() ?? location;
    const situationLabel = getSituationLabel(selectedSituation);
    const nextCase = createDriverSosActiveCase({
      eventType: mapSituationToDriverSosEventType(selectedSituation),
      situationId: selectedSituation,
      situationLabel,
      description,
      attachments: draftAttachments,
      originalTriggeredAt: new Date().toISOString(),
      offlineAtTrigger: connectivity === "offline",
      location: snapshot,
      orderId: context?.orderId ?? null,
      taskId: context?.taskId ?? null,
      vehicleId: context?.vehicleId ?? fallbackVehicleId,
      plateNo: null,
      deviceId,
    });
    autoRetryRef.current = { clientEventId: nextCase.clientEventId, fired: 0 };
    await persistActiveCase(nextCase);
    // Never claim delivery here: the case exists on the phone only.
    setUiNotice("求援已建立，正在送出中，尚未確認送達。");
    setDraftAttachments([]);
    setDetails("");
    setScreenError(null);

    // Always attempt the delivery. There is no reliable offline flag on a
    // handset, so the attempt itself is what tells us whether we are offline.
    await syncActiveCase(nextCase, false);
  }

  async function handleRetry() {
    if (!activeCase || submitting) {
      return;
    }

    autoRetryRef.current = {
      clientEventId: activeCase.clientEventId,
      fired: 0,
    };
    await syncActiveCase(activeCase, true);
  }

  async function handleQueueSupplement() {
    if (!activeCase) {
      setScreenError("請先送出求援，再加入補充資料。");
      return;
    }
    if (!supplementNote.trim() && supplementAttachments.length === 0) {
      setScreenError("請先輸入補充說明或加入附件。");
      return;
    }

    const nextCase = queueDriverSosSupplement(activeCase, {
      note: supplementNote,
      attachments: supplementAttachments,
    });
    await persistActiveCase(nextCase);
    setSupplementNote("");
    setSupplementAttachments([]);
    setUiNotice(
      activeCase.receipt
        ? "補充資料已保存在手機，正在送往平台。"
        : "補充資料已保存在手機，會與求援一起送出。",
    );
    setScreenError(null);
    if (activeCase.receipt) {
      await syncActiveCase(nextCase, false);
    }
  }

  async function handleFalseAlarmConfirm() {
    if (!activeCase) {
      return;
    }

    Alert.alert(
      "二次確認誤觸",
      "這會把目前這筆求援標記為誤觸，並在紀錄中留下時間。確定要繼續嗎？",
      [
        { text: "取消", style: "cancel" },
        {
          text: "確認標記誤觸",
          style: "destructive",
          onPress: () => {
            void (async () => {
              const nextCase = markDriverSosFalseAlarm(
                activeCase,
                falseAlarmNote,
              );
              await persistActiveCase(nextCase);
              setFalseAlarmNote("");
              setUiNotice("本次求援已標記為誤觸。");
            })();
          },
        },
      ],
    );
  }

  function startHoldProgress() {
    if (submitting) {
      return;
    }

    holdTriggeredRef.current = false;
    Vibration.vibrate(10);
    resetHoldProgress();
    holdStartedAtRef.current = Date.now();
    progressIntervalRef.current = setInterval(() => {
      if (!holdStartedAtRef.current) {
        return;
      }

      const elapsed = Date.now() - holdStartedAtRef.current;
      setHoldProgress(Math.min(1, elapsed / HOLD_DURATION_MS));
    }, HOLD_PROGRESS_INTERVAL_MS);
  }

  function stopHoldProgress() {
    if (holdTriggeredRef.current) {
      return;
    }

    resetHoldProgress();
  }

  function handleHoldLongPress() {
    holdTriggeredRef.current = true;
    Vibration.vibrate([0, 24, 36, 24]);
    void handleSubmitSos();
  }

  const loading = loadingCase || loadingContext;
  const activeStatus = syncChip.detail;
  const selectedSituationLabel = getSituationLabel(selectedSituation);
  const currentLocation = getDriverSosLocationSnapshot() ?? location;
  const locationLabel = currentLocation
    ? `${currentLocation.lat.toFixed(5)}, ${currentLocation.lng.toFixed(5)}`
    : locationReady
      ? "尚未取得定位，仍可送出求援"
      : "定位取得中…";
  const vehicleLabel = context?.vehicleId ?? fallbackVehicleId;

  return (
    <Shell
      theme={THEME}
      footer={
        <View style={styles.footerBar}>
          <Btn
            theme={THEME}
            variant="secondary"
            size="md"
            onPress={() => router.back()}
          >
            返回
          </Btn>
          {activeCase &&
          (activeCase.syncState === "pending" ||
            activeCase.syncState === "failed_retryable" ||
            activeCase.syncState === "attachment_pending") ? (
            <Btn
              theme={THEME}
              variant="primary"
              size="md"
              danger
              disabled={submitting}
              onPress={() => void handleRetry()}
            >
              重新送出
            </Btn>
          ) : (
            <SosHoldButton
              disabled={Boolean(activeCase && !activeCase.falseAlarm.dismissed)}
              holdProgress={holdProgress}
              submitting={submitting}
              onPress={handleHoldLongPress}
              onPressIn={startHoldProgress}
              onPressOut={stopHoldProgress}
            />
          )}
        </View>
      }
    >
      <PageHeader
        theme={THEME}
        title={driverRouteTitles.sos}
        subtitle="長按 2 秒送出，車隊安全值班會立即收到；亦可直接撥打緊急電話"
        actions={
          activeCase?.falseAlarm.dismissed ? (
            <Btn
              theme={THEME}
              variant="ghost"
              size="sm"
              onPress={() => void persistActiveCase(null)}
            >
              清除這筆求援
            </Btn>
          ) : null
        }
      />

      <StatusChip activeCase={activeCase} connectivity={connectivity} />

      {uiNotice ? (
        <Banner
          theme={THEME}
          tone={syncChip.tone}
          title="狀態"
          body={uiNotice}
        />
      ) : null}

      {screenError ? (
        <Banner
          theme={THEME}
          tone="danger"
          title="需要處理"
          body={screenError}
        />
      ) : null}

      <Card theme={THEME} padding={16}>
        <View style={styles.heroRow}>
          <View style={styles.heroIcon}>
            <Ionicons name="warning-outline" size={22} color="#FFFFFF" />
          </View>
          <View style={styles.heroCopy}>
            <Text style={styles.heroTitle}>緊急求援</Text>
            <Text style={styles.heroSubtitle}>
              送出後會直接通報車隊安全值班並成立案件，期間不會再派新的任務給你。
            </Text>
          </View>
        </View>
      </Card>

      <Card theme={THEME} title="緊急電話" subtitle="不需連網，直接撥號">
        <View style={styles.dialGrid}>
          <Btn
            theme={THEME}
            variant="primary"
            size="md"
            danger
            onPress={() => void openNativeDial("police", "110")}
          >
            110 警政
          </Btn>
          <Btn
            theme={THEME}
            variant="primary"
            size="md"
            danger
            onPress={() => void openNativeDial("fire", "119")}
          >
            119 消防
          </Btn>
          <Btn
            theme={THEME}
            variant="secondary"
            size="md"
            onPress={() =>
              void openNativeDial("fleet", FLEET_DUTY_PHONE_NUMBER)
            }
          >
            車隊值班
          </Btn>
        </View>
        <Text style={styles.supportingCopy}>
          110 / 119 / 車隊值班分開撥打；撥號不需要網路，撥打紀錄也會保留在這筆求援中。
        </Text>
      </Card>

      {loading ? (
        <Card theme={THEME} title="載入中">
          <Text style={styles.emptyCopy}>
            正在準備求援資料，緊急電話仍可直接撥打。
          </Text>
        </Card>
      ) : null}

      {!activeCase ? (
        <>
          <Card
            theme={THEME}
            title="請選擇目前狀況"
            subtitle="選項會同時以文字與顏色標示，不需只靠顏色辨識"
          >
            <View style={styles.situationGrid}>
              {driverIncidentSituations.map((situation) => {
                const selected = selectedSituation === situation.id;
                return (
                  <Pressable
                    key={situation.id}
                    accessibilityRole="button"
                    onPress={() => setSelectedSituation(situation.id)}
                    style={[
                      styles.situationTile,
                      selected ? styles.situationTileSelected : null,
                    ]}
                  >
                    <Text
                      style={[
                        styles.situationTitle,
                        selected ? styles.situationTitleSelected : null,
                      ]}
                    >
                      {situation.label}
                    </Text>
                    <Text
                      style={[
                        styles.situationMeta,
                        selected ? styles.situationMetaSelected : null,
                      ]}
                    >
                      {selected ? "已選取" : situation.hint}
                    </Text>
                  </Pressable>
                );
              })}
            </View>
          </Card>

          <Card
            theme={THEME}
            title="當前訂單情境"
            subtitle="以下資料會自動附在求援中，不需要自行填寫"
          >
            {context ? (
              <View style={styles.contextStack}>
                <View style={styles.contextPills}>
                  <Pill
                    theme={THEME}
                    tone={context.crossPlatform ? "warn" : "info"}
                    dot
                  >
                    {context.crossPlatform ? "聚合行程" : "本平台行程"}
                  </Pill>
                  {selectedSituationLabel ? (
                    <Pill theme={THEME} tone="danger">
                      {selectedSituationLabel}
                    </Pill>
                  ) : null}
                </View>
                <DL
                  theme={THEME}
                  cols={2}
                  items={[
                    // Owned-domain rows, per the S3-03 canvas
                    // (docs/05-ui/drts-design-canvas/driver-sos.jsx SosCtx).
                    { label: "行程編號", value: context.orderId ?? "—", mono: true },
                    { label: "任務編號", value: context.taskId ?? "—", mono: true },
                    {
                      label: "目前狀態",
                      value: formatDriverTaskStatusLabel(context.localStatus),
                    },
                    {
                      label: "目前位置",
                      value: locationLabel,
                      mono: Boolean(currentLocation),
                    },
                    { label: "駕駛", value: "已自動帶入" },
                    {
                      label: "車輛編號",
                      value: vehicleLabel ?? "未綁定",
                      mono: Boolean(vehicleLabel),
                    },
                    { label: "裝置", value: deviceId ? "已自動帶入" : "取得中" },
                    // S3-FIX-DRIVER-SOS-VOCAB-001: aggregation rows are SPREAD IN
                    // only for profiles that permit forwarded_order_ui. Under
                    // multi_taxi_direct `crossPlatform` is null, so these rows are
                    // never constructed — §1.3 forbids shipping them hidden
                    // ("不得以 CSS 隱藏既有多平台元件後交稿").
                    ...(context.crossPlatform
                      ? [
                          {
                            label: "來源平台",
                            value: context.crossPlatform.platformLabel,
                          },
                          {
                            label: "平台狀態",
                            value:
                              formatPlatformStatusLabel(
                                context.crossPlatform.platformStatus,
                              ) ?? "未提供",
                          },
                          {
                            label: "平台訂單編號",
                            value: context.crossPlatform.externalOrderId ?? "未提供",
                            mono: Boolean(context.crossPlatform.externalOrderId),
                          },
                        ]
                      : []),
                  ]}
                />
              </View>
            ) : (
              <View style={styles.contextStack}>
                <Text style={styles.emptyCopy}>
                  目前沒有進行中的行程，仍可送出求援；駕駛、車輛、裝置、時間與定位會自動附上。
                </Text>
                <DL
                  theme={THEME}
                  cols={2}
                  items={[
                    { label: "駕駛", value: "已自動帶入" },
                    {
                      label: "車輛編號",
                      value: fallbackVehicleId ?? "未綁定",
                      mono: Boolean(fallbackVehicleId),
                    },
                    {
                      label: "裝置",
                      value: deviceId ? "已自動帶入" : "取得中",
                    },
                    {
                      label: "目前位置",
                      value: locationLabel,
                      mono: Boolean(currentLocation),
                    },
                  ]}
                />
              </View>
            )}
          </Card>

          <Card
            theme={THEME}
            title="補充說明與附件"
            subtitle={`目前狀態：${activeStatus}`}
          >
            <Field
              theme={THEME}
              label="補充說明"
              hint="可不填。若能簡短說明現場狀況，值班人員會更快掌握。"
            >
              <TextInput
                multiline
                onChangeText={setDetails}
                placeholder="簡述現場狀況與立即需要的支援…"
                placeholderTextColor={THEME.textDim}
                style={styles.multilineInput}
                value={details}
              />
            </Field>

            <View style={styles.sectionActions}>
              <Btn
                theme={THEME}
                variant="secondary"
                size="sm"
                onPress={() =>
                  void pickAttachments("initial", draftAttachments)
                }
              >
                加入附件
              </Btn>
              <Text style={styles.supportingCopy}>
                每筆求援最多 {MAX_ATTACHMENTS} 件附件，會保存在手機並自動上傳。
              </Text>
            </View>

            <AttachmentList
              attachments={draftAttachments}
              emptyLabel="尚未附上附件。"
              onRemove={(attachmentId) =>
                setDraftAttachments((current) =>
                  current.filter(
                    (attachment) => attachment.id !== attachmentId,
                  ),
                )
              }
            />
          </Card>
        </>
      ) : (
        <>
          <Card
            theme={THEME}
            title={
              activeCase.receipt
                ? `事件編號 ${activeCase.receipt.eventNo}`
                : "尚未取得事件編號"
            }
            subtitle={syncChip.detail}
            actions={
              activeCase.receipt ? (
                <Pill theme={THEME} tone="success" dot>
                  平台已建立案件
                </Pill>
              ) : null
            }
          >
            <DL
              theme={THEME}
              cols={2}
              items={[
                {
                  label: "觸發時間",
                  value: formatAt(activeCase.originalTriggeredAt),
                },
                {
                  label: "平台接收時間",
                  value: activeCase.receipt
                    ? formatAt(activeCase.receipt.fleetReportConfirmedAt)
                    : "尚未送達",
                },
                {
                  label: "送出次數",
                  value: `${activeCase.attemptCount} 次`,
                },
                {
                  label: "觸發時網路",
                  value: activeCase.offlineAtTrigger ? "沒有連線" : "有連線",
                },
                {
                  label: "情況類別",
                  value: activeCase.situationLabel ?? "未選擇",
                },
                {
                  label: "車輛編號",
                  value: activeCase.vehicleId ?? vehicleLabel ?? "未綁定",
                  mono: Boolean(activeCase.vehicleId ?? vehicleLabel),
                },
                {
                  label: "任務編號",
                  value: activeCase.taskId ?? context?.taskId ?? "—",
                  mono: Boolean(activeCase.taskId ?? context?.taskId),
                },
                {
                  label: "行程編號",
                  value: activeCase.orderId ?? context?.orderId ?? "—",
                  mono: Boolean(activeCase.orderId ?? context?.orderId),
                },
              ]}
            />
            {activeCase.description ? (
              <Text style={styles.caseDescription}>
                {activeCase.description}
              </Text>
            ) : null}
            <AttachmentList
              attachments={activeCase.attachments}
              emptyLabel="這筆求援沒有附件。"
            />
          </Card>

          <Card
            theme={THEME}
            title="補充說明與附件"
            subtitle="補充資料會先保存在手機，連線後自動送到平台"
          >
            <Field theme={THEME} label="補充說明">
              <TextInput
                multiline
                onChangeText={setSupplementNote}
                placeholder="可補充車內狀況、撥打電話的結果或照片說明…"
                placeholderTextColor={THEME.textDim}
                style={styles.multilineInput}
                value={supplementNote}
              />
            </Field>
            <View style={styles.sectionActions}>
              <Btn
                theme={THEME}
                variant="secondary"
                size="sm"
                onPress={() =>
                  void pickAttachments("supplement", supplementAttachments)
                }
              >
                加入補充附件
              </Btn>
              <Btn
                theme={THEME}
                variant="primary"
                size="sm"
                onPress={() => void handleQueueSupplement()}
              >
                加入補充資料
              </Btn>
            </View>
            <AttachmentList
              attachments={supplementAttachments}
              emptyLabel="尚未附上補充附件。"
              onRemove={(attachmentId) =>
                setSupplementAttachments((current) =>
                  current.filter(
                    (attachment) => attachment.id !== attachmentId,
                  ),
                )
              }
            />
            {activeCase.supplements.length > 0 ? (
              <View style={styles.supplementHistory}>
                {activeCase.supplements.map((supplement) => (
                  <View key={supplement.id} style={styles.supplementRow}>
                    <Text style={styles.supplementTitle}>
                      {supplement.note || "附件補件"}
                    </Text>
                    <Text style={styles.supplementMeta}>
                      {formatAt(supplement.createdAt)} ·{" "}
                      {supplement.state === "complete"
                        ? "已送達平台"
                        : supplement.state === "failed_retryable"
                          ? "尚未送達，將自動重試"
                          : "附件上傳中"}
                    </Text>
                  </View>
                ))}
              </View>
            ) : null}
          </Card>

          <Card
            theme={THEME}
            title="誤觸處理"
            subtitle="需先向右滑動再做第二次確認，避免不小心關閉求援"
          >
            <Field
              theme={THEME}
              label="誤觸備註"
              hint="例如：口袋誤觸、裝置滑落、非真實危急情況。"
            >
              <TextInput
                onChangeText={setFalseAlarmNote}
                placeholder="補充誤觸原因"
                placeholderTextColor={THEME.textDim}
                style={styles.singleLineInput}
                value={falseAlarmNote}
              />
            </Field>
            <FalseAlarmSlider
              disabled={submitting}
              onComplete={() => handleFalseAlarmConfirm()}
            />
            {activeCase.falseAlarm.dismissed ? (
              <Text style={styles.supportingCopy}>
                已於 {formatAt(activeCase.falseAlarm.dismissedAt)} 標記誤觸。
              </Text>
            ) : null}
          </Card>

          <Card
            theme={THEME}
            title="求援紀錄"
            subtitle="保存在手機，狀態同時以文字與顏色標示"
          >
            {activeCase.timeline.length === 0 ? (
              <Text style={styles.emptyCopy}>目前尚無紀錄。</Text>
            ) : (
              <View style={styles.timelineList}>
                {activeCase.timeline.map((entry) => (
                  <View key={entry.id} style={styles.timelineRow}>
                    <View style={styles.timelineRail}>
                      <View
                        style={[
                          styles.timelineDot,
                          entry.tone === "danger"
                            ? styles.timelineDotDanger
                            : entry.tone === "warn"
                              ? styles.timelineDotWarn
                              : entry.tone === "success"
                                ? styles.timelineDotSuccess
                                : styles.timelineDotInfo,
                        ]}
                      />
                    </View>
                    <View style={styles.timelineCopy}>
                      <Text style={styles.timelineTitle}>{entry.title}</Text>
                      <Text style={styles.timelineDetail}>{entry.detail}</Text>
                      <Text style={styles.timelineMeta}>
                        {formatAt(entry.occurredAt)}
                      </Text>
                    </View>
                  </View>
                ))}
              </View>
            )}
          </Card>
        </>
      )}
    </Shell>
  );
}

const styles = StyleSheet.create({
  statusChipRow: {
    gap: 10,
    marginBottom: 12,
  },
  statusChipDetail: {
    color: THEME.textMuted,
    fontFamily: THEME.fontFamily,
    fontSize: 12,
    lineHeight: 18,
  },
  heroRow: {
    alignItems: "center",
    flexDirection: "row",
    gap: 12,
  },
  heroIcon: {
    alignItems: "center",
    backgroundColor: THEME.danger,
    borderRadius: 14,
    height: 44,
    justifyContent: "center",
    width: 44,
  },
  heroCopy: {
    flex: 1,
    gap: 4,
  },
  heroTitle: {
    color: THEME.danger,
    fontFamily: THEME.fontFamily,
    fontSize: 17,
    fontWeight: "700",
  },
  heroSubtitle: {
    color: THEME.textMuted,
    fontFamily: THEME.fontFamily,
    fontSize: 12,
    lineHeight: 18,
  },
  dialGrid: {
    flexDirection: "row",
    flexWrap: "wrap",
    gap: 10,
  },
  supportingCopy: {
    color: THEME.textMuted,
    fontFamily: THEME.fontFamily,
    fontSize: 12,
    lineHeight: 18,
    marginTop: 10,
  },
  situationGrid: {
    flexDirection: "row",
    flexWrap: "wrap",
    gap: 10,
  },
  situationTile: {
    backgroundColor: THEME.surfaceLo,
    borderColor: THEME.border,
    borderRadius: 14,
    borderWidth: 1,
    gap: 6,
    minWidth: "47%",
    paddingHorizontal: 14,
    paddingVertical: 14,
  },
  situationTileSelected: {
    backgroundColor: THEME.dangerBg,
    borderColor: THEME.danger,
  },
  situationTitle: {
    color: THEME.text,
    fontFamily: THEME.fontFamily,
    fontSize: 14,
    fontWeight: "600",
  },
  situationTitleSelected: {
    color: THEME.danger,
  },
  situationMeta: {
    color: THEME.textDim,
    fontFamily: THEME.monoFamily,
    fontSize: 11,
  },
  situationMetaSelected: {
    color: THEME.danger,
  },
  contextStack: {
    gap: 12,
  },
  contextPills: {
    flexDirection: "row",
    flexWrap: "wrap",
    gap: 8,
  },
  multilineInput: {
    backgroundColor: THEME.bgRaised,
    borderColor: THEME.border,
    borderRadius: 12,
    borderWidth: 1,
    color: THEME.text,
    fontFamily: THEME.fontFamily,
    fontSize: 14,
    lineHeight: 20,
    minHeight: 104,
    paddingHorizontal: 14,
    paddingVertical: 12,
    textAlignVertical: "top",
  },
  singleLineInput: {
    backgroundColor: THEME.bgRaised,
    borderColor: THEME.border,
    borderRadius: 12,
    borderWidth: 1,
    color: THEME.text,
    fontFamily: THEME.fontFamily,
    fontSize: 14,
    lineHeight: 20,
    minHeight: 48,
    paddingHorizontal: 14,
    paddingVertical: 12,
  },
  sectionActions: {
    alignItems: "center",
    flexDirection: "row",
    flexWrap: "wrap",
    gap: 10,
    marginTop: 8,
  },
  attachmentList: {
    gap: 10,
    marginTop: 12,
  },
  attachmentRow: {
    alignItems: "center",
    backgroundColor: THEME.surfaceLo,
    borderColor: THEME.border,
    borderRadius: 12,
    borderWidth: 1,
    flexDirection: "row",
    gap: 12,
    justifyContent: "space-between",
    paddingHorizontal: 12,
    paddingVertical: 10,
  },
  attachmentCopy: {
    flex: 1,
    gap: 4,
  },
  attachmentName: {
    color: THEME.text,
    fontFamily: THEME.fontFamily,
    fontSize: 13,
    fontWeight: "600",
  },
  attachmentMeta: {
    color: THEME.textDim,
    fontFamily: THEME.monoFamily,
    fontSize: 11,
  },
  emptyCopy: {
    color: THEME.textMuted,
    fontFamily: THEME.fontFamily,
    fontSize: 12,
    lineHeight: 18,
  },
  footerBar: {
    alignItems: "center",
    flexDirection: "row",
    gap: 10,
  },
  holdButton: {
    backgroundColor: THEME.danger,
    borderColor: THEME.danger,
    borderRadius: 16,
    borderWidth: 1,
    flex: 1,
    minHeight: 62,
    overflow: "hidden",
    position: "relative",
  },
  holdButtonPressed: {
    opacity: 0.92,
  },
  holdButtonDisabled: {
    opacity: 0.55,
  },
  holdButtonProgress: {
    backgroundColor: "rgba(255,255,255,0.18)",
    bottom: 0,
    left: 0,
    position: "absolute",
    top: 0,
  },
  holdButtonContent: {
    alignItems: "center",
    justifyContent: "center",
    minHeight: 62,
    paddingHorizontal: 16,
    paddingVertical: 10,
  },
  holdButtonLabel: {
    color: "#FFFFFF",
    fontFamily: THEME.fontFamily,
    fontSize: 15,
    fontWeight: "700",
  },
  holdButtonHint: {
    color: "rgba(255,255,255,0.82)",
    fontFamily: THEME.fontFamily,
    fontSize: 11,
    marginTop: 4,
  },
  caseDescription: {
    color: THEME.text,
    fontFamily: THEME.fontFamily,
    fontSize: 14,
    lineHeight: 20,
    marginTop: 12,
  },
  supplementHistory: {
    gap: 10,
    marginTop: 14,
  },
  supplementRow: {
    backgroundColor: THEME.surfaceLo,
    borderColor: THEME.border,
    borderRadius: 12,
    borderWidth: 1,
    gap: 4,
    paddingHorizontal: 12,
    paddingVertical: 10,
  },
  supplementTitle: {
    color: THEME.text,
    fontFamily: THEME.fontFamily,
    fontSize: 13,
    fontWeight: "600",
  },
  supplementMeta: {
    color: THEME.textDim,
    fontFamily: THEME.monoFamily,
    fontSize: 11,
  },
  falseAlarmTrack: {
    alignItems: "center",
    backgroundColor: THEME.surfaceLo,
    borderColor: THEME.border,
    borderRadius: 999,
    borderWidth: 1,
    height: 56,
    justifyContent: "center",
    marginTop: 8,
    overflow: "hidden",
    position: "relative",
  },
  falseAlarmFill: {
    backgroundColor: THEME.warnBg,
    bottom: 0,
    left: 0,
    position: "absolute",
    top: 0,
  },
  falseAlarmThumb: {
    alignItems: "center",
    backgroundColor: THEME.warn,
    borderRadius: 22,
    height: 44,
    justifyContent: "center",
    left: 4,
    position: "absolute",
    width: 44,
  },
  falseAlarmText: {
    color: THEME.text,
    fontFamily: THEME.fontFamily,
    fontSize: 13,
    fontWeight: "600",
    paddingHorizontal: 62,
    textAlign: "center",
  },
  sliderDisabled: {
    opacity: 0.55,
  },
  timelineList: {
    gap: 12,
  },
  timelineRow: {
    flexDirection: "row",
    gap: 12,
  },
  timelineRail: {
    alignItems: "center",
    width: 16,
  },
  timelineDot: {
    borderRadius: 5,
    height: 10,
    marginTop: 6,
    width: 10,
  },
  timelineDotDanger: {
    backgroundColor: THEME.danger,
  },
  timelineDotWarn: {
    backgroundColor: THEME.warn,
  },
  timelineDotSuccess: {
    backgroundColor: THEME.success,
  },
  timelineDotInfo: {
    backgroundColor: THEME.info,
  },
  timelineCopy: {
    borderBottomColor: THEME.border,
    borderBottomWidth: 1,
    flex: 1,
    gap: 4,
    paddingBottom: 12,
  },
  timelineTitle: {
    color: THEME.text,
    fontFamily: THEME.fontFamily,
    fontSize: 14,
    fontWeight: "700",
  },
  timelineDetail: {
    color: THEME.textMuted,
    fontFamily: THEME.fontFamily,
    fontSize: 12,
    lineHeight: 18,
  },
  timelineMeta: {
    color: THEME.textDim,
    fontFamily: THEME.monoFamily,
    fontSize: 11,
  },
});
