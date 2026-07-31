import { useEffect, useMemo, useRef, useState } from "react";
import {
  Alert,
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
import {
  getDriverClient,
  recoverDriverSessionFromApiError,
} from "@/lib/api-client";
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
  crossPlatform: SosCrossPlatformContext | null;
};
type SyncChipModel = {
  tone: "danger" | "warn" | "info" | "success";
  label: string;
  detail: string;
};

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

async function resolveSosTaskContext(): Promise<SosTaskContext | null> {
  const client = getDriverClient();

  try {
    const unifiedTasks = await client.listUnifiedDriverTasks();
    return pickSosTaskContext(unifiedTasks);
  } catch {
    try {
      const legacyTasks = await client.listDriverTasks();
      return pickSosTaskContext(
        legacyTasks.map((task: DriverTaskRecord) =>
          buildFallbackUnifiedDriverTaskView(task),
        ),
      );
    } catch {
      return null;
    }
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

function getErrorMessage(error: unknown): string {
  if (error instanceof Error && error.message.trim()) {
    return error.message.trim();
  }

  return "SOS 送出失敗，請稍後再試。";
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

function getSyncChipModel(
  activeCase: DriverSosActiveCase | null,
  browserOnline: boolean | null,
): SyncChipModel {
  if (!activeCase) {
    if (browserOnline === false) {
      return {
        tone: "warn",
        label: "offline",
        detail: "offline · 裝置離線，SOS 會先留在本機 durable outbox。",
      };
    }

    return {
      tone: "info",
      label: "online",
      detail: "online · 可直接送往 driver-sos 服務。",
    };
  }

  if (activeCase.syncState === "sending") {
    return {
      tone: "info",
      label: "sending",
      detail: "sending · 正在送出 SOS 與 incident 關聯。",
    };
  }

  if (
    activeCase.syncState === "submitted" ||
    activeCase.syncState === "complete"
  ) {
    return {
      tone: "success",
      label: "submitted",
      detail: activeCase.receipt
        ? `submitted · ${activeCase.receipt.eventNo} 已送達安全值班。`
        : "submitted · 伺服器已接受 SOS。",
    };
  }

  if (activeCase.syncState === "attachment_pending") {
    return {
      tone: "warn",
      label: "attachment pending",
      detail: activeCase.receipt
        ? `SOS ${activeCase.receipt.eventNo} 已送達；附件等待儲存或掃描服務。`
        : "SOS 已送達；附件等待儲存或掃描服務。",
    };
  }

  return {
    tone: "warn",
    label: "offline",
    detail: "offline · 事件尚未送達，會保留在本機 outbox 並等待補送 / 重試。",
  };
}

function StatusChip({
  activeCase,
  browserOnline,
}: {
  activeCase: DriverSosActiveCase | null;
  browserOnline: boolean | null;
}) {
  const chip = getSyncChipModel(activeCase, browserOnline);
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
              {attachment.mimeType || "image/jpeg"} ·{" "}
              {formatAt(attachment.addedAt)}
            </Text>
            {attachment.uploadState !== "local" ? (
              <Text style={styles.attachmentMeta}>
                upload {attachment.uploadState}
                {attachment.scanStatus
                  ? ` · scan ${attachment.scanStatus}`
                  : ""}
                {attachment.lastError ? ` · ${attachment.lastError}` : ""}
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
      accessibilityHint="需長按 2 秒才會正式送出 SOS"
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
            ? "driver-sos 正在建立事件"
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

  const [browserOnline, setBrowserOnline] = useState<boolean | null>(() => {
    if (
      typeof navigator !== "undefined" &&
      typeof navigator.onLine === "boolean"
    ) {
      return navigator.onLine;
    }

    return null;
  });
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

  useEffect(() => {
    let cancelled = false;
    void (async () => {
      const [storedCase, taskContext] = await Promise.all([
        loadDriverSosActiveCase(),
        resolveSosTaskContext(),
      ]);
      if (cancelled) {
        return;
      }

      setActiveCase(storedCase);
      setContext(taskContext);
      setLoadingCase(false);
      setLoadingContext(false);
    })();

    return () => {
      cancelled = true;
      if (progressIntervalRef.current) {
        clearInterval(progressIntervalRef.current);
      }
    };
  }, []);

  useEffect(() => {
    if (typeof window === "undefined") {
      return;
    }

    const handleOnline = () => setBrowserOnline(true);
    const handleOffline = () => setBrowserOnline(false);

    window.addEventListener("online", handleOnline);
    window.addEventListener("offline", handleOffline);

    return () => {
      window.removeEventListener("online", handleOnline);
      window.removeEventListener("offline", handleOffline);
    };
  }, []);

  useEffect(() => {
    if (!activeCase) {
      return;
    }
    if (browserOnline !== true) {
      return;
    }
    if (
      activeCase.syncState !== "pending" &&
      activeCase.syncState !== "failed_retryable"
    ) {
      return;
    }

    void syncActiveCase(activeCase, false);
  }, [activeCase, browserOnline]);

  const syncChip = useMemo(
    () => getSyncChipModel(activeCase, browserOnline),
    [activeCase, browserOnline],
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
    const sendingCase = markDriverSosCaseSending(targetCase);
    setSubmitting(true);
    setScreenError(null);
    setUiNotice(
      manualRetry ? "重新嘗試送出 SOS…" : "正在將 SOS 送往 driver-sos 服務…",
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
      if (attachments.length === 0) {
        setUiNotice(`SOS ${result.receipt.eventNo} 已送達安全值班。`);
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
              throw new Error("無法讀取附件大小，附件保留於本機等待重試。");
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
              throw new Error(`附件上傳失敗 (${response.status})。`);
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
          ? `SOS ${result.receipt.eventNo} 已送達；附件服務未就緒，已保留供重試。`
          : `SOS ${result.receipt.eventNo} 與附件已由伺服器確認。`,
      );
    } catch (error) {
      await recoverDriverSessionFromApiError(error);
      const failedCase = markDriverSosCaseFailed(
        sendingCase,
        getErrorMessage(error),
      );
      await persistActiveCase(failedCase);
      setScreenError(getErrorMessage(error));
      setUiNotice("SOS 未送達，已保留在本機 outbox。");
    } finally {
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
        `每筆 SOS 合計最多附上 ${MAX_ATTACHMENTS} 件附件。`,
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
      Alert.alert("無法開啟原生撥號", getErrorMessage(error));
    }
  }

  async function handleSubmitSos() {
    if (submitting) {
      return;
    }

    if (activeCase && !activeCase.falseAlarm.dismissed) {
      setScreenError("目前已有一筆進行中的 SOS，請改用補充區更新資訊。");
      resetHoldProgress();
      return;
    }

    const description = details.trim();
    const location = getDriverSosLocationSnapshot();
    const nextCase = createDriverSosActiveCase({
      eventType: mapSituationToDriverSosEventType(selectedSituation),
      description,
      attachments: draftAttachments,
      originalTriggeredAt: new Date().toISOString(),
      offlineAtTrigger: browserOnline === false,
      location,
      orderId: context?.orderId ?? null,
      taskId: context?.taskId ?? null,
    });
    await persistActiveCase(nextCase);
    setUiNotice(
      browserOnline === false
        ? "裝置離線，SOS 已寫入本機 outbox，等待補送。"
        : "SOS 已寫入本機 outbox，正在送往安全值班。",
    );
    setDraftAttachments([]);
    setDetails("");
    setScreenError(null);

    if (browserOnline === false) {
      resetHoldProgress();
      return;
    }

    await syncActiveCase(nextCase, false);
  }

  async function handleRetry() {
    if (!activeCase || browserOnline !== true || submitting) {
      return;
    }

    await syncActiveCase(activeCase, true);
  }

  async function handleQueueSupplement() {
    if (!activeCase) {
      setScreenError("請先建立 SOS，再加入補充資料。");
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
      browserOnline === true
        ? "補充資料已加入本機 case timeline，正在送出。"
        : "補充資料已加入本機 case timeline，等待連線後送出。",
    );
    setScreenError(null);
    if (browserOnline === true && activeCase.receipt) {
      await syncActiveCase(nextCase, false);
    }
  }

  async function handleFalseAlarmConfirm() {
    if (!activeCase) {
      return;
    }

    Alert.alert(
      "二次確認誤觸",
      "這會把目前 SOS 標記成誤觸並留下時間線紀錄。確定要繼續嗎？",
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
              setUiNotice("本次 SOS 已標記為誤觸。");
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
  const currentLocation = getDriverSosLocationSnapshot();

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
              disabled={browserOnline !== true || submitting}
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
        subtitle="獨立 SOS surface · 2 秒長按 · 原生撥號 · 離線 durable outbox"
        actions={
          activeCase?.falseAlarm.dismissed ? (
            <Btn
              theme={THEME}
              variant="ghost"
              size="sm"
              onPress={() => void persistActiveCase(null)}
            >
              清除此 case
            </Btn>
          ) : null
        }
      />

      <StatusChip activeCase={activeCase} browserOnline={browserOnline} />

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
          title="SOS 需要處理"
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
              送出後會進入 driver-sos domain，建立 incident 關聯並抑制司機配對。
            </Text>
          </View>
        </View>
      </Card>

      <Card
        theme={THEME}
        title="原生緊急撥號"
        subtitle="不需網路，直接開啟裝置原生 dialer"
      >
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
          110 / 119 / 車隊值班分開撥打；這三個動作不依賴網路，且會寫入本機 SOS
          timeline。
        </Text>
      </Card>

      {loading ? (
        <Card theme={THEME} title="載入中">
          <Text style={styles.emptyCopy}>
            正在準備 SOS task context 與本機 outbox…
          </Text>
        </Card>
      ) : null}

      {!activeCase ? (
        <>
          <Card
            theme={THEME}
            title="情況"
            subtitle="視覺與文字皆標示目前選項，避免只靠顏色辨識"
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
                      {selected ? "目前選取" : humanizeCode(situation.id)}
                    </Text>
                  </Pressable>
                );
              })}
            </View>
          </Card>

          <Card
            theme={THEME}
            title="當前訂單情境"
            subtitle="獨立 SOS surface，不折疊到 incident route"
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
                      value: currentLocation
                        ? `${currentLocation.lat.toFixed(5)}, ${currentLocation.lng.toFixed(5)}`
                        : "尚無定位快照",
                      mono: true,
                    },
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
              <Text style={styles.emptyCopy}>
                目前沒有可帶入的行程脈絡，SOS 仍可建立為一般 driver safety
                事件。
              </Text>
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
              hint="可選填，例如乘客衝突、追撞、醫療急症或路線威脅。"
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
                每筆 SOS 合計最多 {MAX_ATTACHMENTS} 件。附件會跟著本機 case
                timeline 一起保留。
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
            title={activeCase.receipt?.eventNo ?? "本機 SOS case"}
            subtitle={`state · ${activeCase.syncState}`}
            actions={
              activeCase.receipt ? (
                <Pill theme={THEME} tone="success" dot>
                  incident {activeCase.receipt.incidentId}
                </Pill>
              ) : null
            }
          >
            <DL
              theme={THEME}
              cols={2}
              items={[
                {
                  label: "triggered at",
                  value: formatAt(activeCase.originalTriggeredAt),
                  mono: true,
                },
                {
                  label: "next retry",
                  value: formatAt(activeCase.nextAttemptAt),
                  mono: true,
                },
                {
                  label: "attempts",
                  value: String(activeCase.attemptCount),
                  mono: true,
                },
                {
                  label: "offline trigger",
                  value: activeCase.offlineAtTrigger ? "yes" : "no",
                },
                {
                  label: "task",
                  value: activeCase.taskId ?? context?.taskId ?? "—",
                  mono: Boolean(activeCase.taskId ?? context?.taskId),
                },
                {
                  label: "order",
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
              emptyLabel="初始 SOS 未附帶附件。"
            />
          </Card>

          <Card
            theme={THEME}
            title="補充說明 / 附件"
            subtitle="補充資料先寫入本機 case timeline，連線時使用同一附件驗證流程補送"
          >
            <Field theme={THEME} label="補充說明">
              <TextInput
                multiline
                onChangeText={setSupplementNote}
                placeholder="可補充車內狀況、對外撥號結果、現場照片說明…"
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
                加入本機 timeline
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
                      {formatAt(supplement.createdAt)} · {supplement.state}
                    </Text>
                  </View>
                ))}
              </View>
            ) : null}
          </Card>

          <Card
            theme={THEME}
            title="誤觸處理"
            subtitle="slide 解鎖後仍需第二次確認，避免單擊誤關閉"
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
            title="SOS timeline"
            subtitle="local durable timeline · a11y 以文字和 tone 雙重標示"
          >
            {activeCase.timeline.length === 0 ? (
              <Text style={styles.emptyCopy}>目前尚無 timeline。</Text>
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
                        {formatAt(entry.occurredAt)} · {entry.kind}
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
