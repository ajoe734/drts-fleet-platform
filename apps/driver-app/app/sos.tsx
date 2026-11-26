import { useEffect, useMemo, useRef, useState } from "react";
import {
  Alert,
  AppState,
  PanResponder,
  Pressable,
  StyleSheet,
  Text,
  TextInput,
  View,
  Vibration,
} from "react-native";
import { Ionicons } from "@expo/vector-icons";
import { Redirect, useRouter } from "expo-router";
import * as ImagePicker from "expo-image-picker";
import {
  type ConfirmDriverSosAttachmentUploadResult,
  type CreateDriverSosAttachmentUploadIntentResult,
  type DriverSosAttachmentRecord,
  type DriverSosEventRecord,
  PLATFORM_CODE_REGISTRY,
  type DriverTaskRecord,
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
  formatDriverError,
  getDriverClient,
  getDriverId,
  isDriverIdentityProvisioned,
  recoverDriverSessionFromApiError,
  registerProtectedCacheClearHandler,
} from "@/lib/api-client";
import { resetDriverAppToOnboarding } from "@/lib/driver-identity-routing";
import {
  applyDriverSosAttachmentSyncResult,
  applyDriverSosDutyReadback,
  buildDriverSosSubmitCommand,
  createDriverSosActiveCase,
  createDriverSosAttachmentDraft,
  formatSosDescription,
  getDriverSosLogoutGeneration,
  hasUndeliveredSosKeptThroughSignOut,
  noteDriverSosDelivered,
  noteDriverSosSessionCleared,
  sosSavedHereLabel,
  getSituationLabel,
  isDriverSosStatusTerminal,
  loadDriverSosActiveCase,
  mapSituationToDriverSosEventType,
  markDriverSosCaseFailed,
  markDriverSosCaseSending,
  markDriverSosCaseSubmitted,
  markDriverSosFalseAlarm,
  queueDriverSosSupplement,
  saveDriverSosActiveCase,
  type DriverSosActiveCase,
  type DriverSosAttachmentDraft,
  type SosSituationId,
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
// A stalled photo read or upload must not hold the single SOS send slot.
const ATTACHMENT_READ_TIMEOUT_MS = 30_000;
const ATTACHMENT_UPLOAD_TIMEOUT_MS = 60_000;
const CALL_NOW_ADVICE = "請直接打電話聯絡派車台；有立即危險請撥 110 或 119。";
// Automatic resend runs only while this screen is open in the foreground.
const STAY_ON_SCREEN_ADVICE =
  "請留在這個畫面，App 會自動再送；離開後不會自動送出。";
const SESSION_LOST_SOS_TITLE = "SOS 尚未送達";
const SESSION_LOST_SOS_BODY = `登入已失效，這筆 SOS 沒有送到車隊。${CALL_NOW_ADVICE}重新登入後打開 SOS 頁面，會再送出。`;
// An undelivered SOS older than this is not sent automatically: the driver
// is asked first (送出 / 不用了).
const STALE_SOS_AGE_MS = 30 * 60_000;
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
  return (
    task.orderDomain === "owned" || isOwnedPlatformCode(task.sourcePlatform)
  );
}

function pickSosTaskContext(
  tasks: ReadonlyArray<UnifiedDriverTaskView>,
): SosTaskContext | null {
  if (tasks.length === 0) {
    return null;
  }

  const aggregationForbidden =
    isDriverCapabilityForbidden("forwarded_order_ui");
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
  if (!isDriverIdentityProvisioned()) {
    return null;
  }

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

function formatAt(value: string | null) {
  if (!value) {
    return "—";
  }

  const parsed = Date.parse(value);
  if (Number.isNaN(parsed)) {
    return "—";
  }

  return new Date(parsed).toLocaleString("zh-TW", {
    timeZone: "Asia/Taipei",
    month: "numeric",
    day: "numeric",
    hour: "2-digit",
    minute: "2-digit",
  });
}

/**
 * Runs `run` with an abort signal and rejects after `timeoutMs` even if the
 * underlying fetch ignores the signal, so the send slot is always released.
 */
async function withTimeout<T>(
  timeoutMs: number,
  run: (signal: AbortSignal) => Promise<T>,
): Promise<T> {
  const controller = new AbortController();
  let timer: ReturnType<typeof setTimeout> | undefined;
  const timeout = new Promise<never>((_resolve, reject) => {
    timer = setTimeout(() => {
      controller.abort();
      reject(new Error("附件處理逾時。"));
    }, timeoutMs);
  });
  try {
    return await Promise.race([run(controller.signal), timeout]);
  } finally {
    clearTimeout(timer);
  }
}

/** The HTTP status of a failed request, or null (network error, timeout). */
function httpStatusOf(error: unknown): number | null {
  if (error && typeof error === "object") {
    const { statusCode, status } = error as {
      statusCode?: unknown;
      status?: unknown;
    };
    if (typeof statusCode === "number") return statusCode;
    if (typeof status === "number") return status;
  }
  const match =
    error instanceof Error ? /API error (\d{3})/.exec(error.message) : null;
  return match ? Number(match[1]) : null;
}

/**
 * Whether resending can help. A 4xx means the server refused this request
 * as sent, except 401 (handled as a sign-out), 408, 409 and 429.
 */
function isRetryableSendFailure(status: number | null): boolean {
  if (status === null || status < 400 || status >= 500) {
    return true;
  }
  return status === 401 || status === 408 || status === 409 || status === 429;
}

/**
 * A failed send. An SOS the server has already received (it has a receipt)
 * never goes back to "not delivered": only its attachments or supplements are
 * still owed, so it stays `attachment_pending` and 重新送出 stays available.
 * `blocked`: the server refused it for good; no automatic resend.
 */
function markSendFailed(
  baseCase: DriverSosActiveCase,
  message: string,
  options: { blocked?: boolean } = {},
): DriverSosActiveCase {
  if (baseCase.receipt) {
    return { ...baseCase, syncState: "attachment_pending", lastError: message };
  }
  const failed = markDriverSosCaseFailed(baseCase, message);
  if (!options.blocked) {
    return { ...failed, autoResendBlocked: false };
  }
  const [newestEntry, ...olderEntries] = failed.timeline;
  return {
    ...failed,
    autoResendBlocked: true,
    timeline: newestEntry
      ? [
          { ...newestEntry, detail: `${message} 不會自動再送。` },
          ...olderEntries,
        ]
      : failed.timeline,
  };
}

function isUndelivered(activeCase: DriverSosActiveCase): boolean {
  return !activeCase.receipt && !activeCase.falseAlarm.dismissed;
}

function isStaleUndelivered(activeCase: DriverSosActiveCase): boolean {
  const triggeredAt = Date.parse(activeCase.originalTriggeredAt);
  return (
    isUndelivered(activeCase) &&
    !Number.isNaN(triggeredAt) &&
    Date.now() - triggeredAt > STALE_SOS_AGE_MS
  );
}

/** Never for a delivered, dismissed (誤觸), refused or 30-minute-old SOS. */
function canAutoResend(activeCase: DriverSosActiveCase): boolean {
  return (
    isUndelivered(activeCase) &&
    !activeCase.autoResendBlocked &&
    (activeCase.syncState === "pending" ||
      activeCase.syncState === "failed_retryable") &&
    !isStaleUndelivered(activeCase)
  );
}

/**
 * A case belongs to the driver who raised it. Cases saved before the owner
 * was recorded predate this check; old versions deleted them at every
 * sign-out, so they can only belong to the current driver.
 */
function isOwnedBy(
  activeCase: DriverSosActiveCase,
  driverId: string | null,
): boolean {
  return activeCase.ownerDriverId
    ? activeCase.ownerDriverId === driverId
    : true;
}

/**
 * Supplement photos still to upload. Only photos are ever uploaded: there is
 * no API for supplement notes, so a note-only supplement stored by an older
 * app version is kept silently and never counts as pending.
 */
function hasPendingSupplementPhotos(activeCase: DriverSosActiveCase): boolean {
  return activeCase.supplements.some(
    (supplement) =>
      supplement.attachments.length > 0 && supplement.state !== "complete",
  );
}

/** A supplement added during the send still needs its own upload. */
function keepPendingSupplementsVisible(
  activeCase: DriverSosActiveCase,
): DriverSosActiveCase {
  return activeCase.syncState === "complete" &&
    hasPendingSupplementPhotos(activeCase)
    ? { ...activeCase, syncState: "attachment_pending" }
    : activeCase;
}

function currentDriverId(): string | null {
  try {
    return getDriverId();
  } catch {
    return null;
  }
}

/** Taiwan local clock time, e.g. "14:32:05", for the next automatic resend. */
function formatClock(value: string | null) {
  const parsed = value ? Date.parse(value) : Number.NaN;
  if (Number.isNaN(parsed)) {
    return null;
  }

  return new Date(parsed).toLocaleTimeString("zh-TW", {
    timeZone: "Asia/Taipei",
    hour: "2-digit",
    minute: "2-digit",
    second: "2-digit",
    hour12: false,
  });
}

/** When the next automatic resend will run, or null if it is due now. */
function describeNextResend(activeCase: DriverSosActiveCase): string | null {
  const dueAt = Date.parse(activeCase.nextAttemptAt);
  if (Number.isNaN(dueAt) || dueAt <= Date.now()) {
    return null;
  }
  const clock = formatClock(activeCase.nextAttemptAt);
  return clock ? `下次自動重送：${clock}` : null;
}

// A case stored as "sending" means the app stopped mid-send (closed, killed or
// crashed). Nothing is in flight on a fresh screen, so offer it for resend;
// the server dedupes on the case's idempotency key. A delivered case that was
// mid-photo-upload stays delivered with its photos pending.
function normalizeLoadedCase(
  storedCase: DriverSosActiveCase,
): DriverSosActiveCase {
  let loaded = storedCase;
  if (loaded.syncState === "sending") {
    loaded = {
      ...loaded,
      syncState: loaded.receipt ? "attachment_pending" : "pending",
    };
  }
  if (
    loaded.receipt &&
    (loaded.syncState === "submitted" || loaded.syncState === "complete") &&
    hasPendingSupplementPhotos(loaded)
  ) {
    loaded = { ...loaded, syncState: "attachment_pending" };
  }
  return loaded;
}

function getSyncChipModel(
  activeCase: DriverSosActiveCase | null,
  browserOnline: boolean | null,
): SyncChipModel {
  if (!activeCase) {
    if (browserOnline === false) {
      return {
        tone: "warn",
        label: "離線",
        detail: "SOS 會先保存起來，連線後自動送出。",
      };
    }

    if (browserOnline === true) {
      return {
        tone: "info",
        label: "連線正常",
        detail: "SOS 會直接送到車隊值班人員。",
      };
    }

    // Connectivity unknown (the phone app has no online flag): do not claim a
    // connection, say what happens either way.
    return {
      tone: "info",
      label: "可送出 SOS",
      detail: "沒有網路時會先保存起來，稍後自動再送。",
    };
  }

  if (activeCase.falseAlarm.dismissed) {
    return {
      tone: "info",
      label: "已標記誤觸",
      detail: activeCase.receipt
        ? "車隊不會自動收到這個標記，請打電話告知派車台。"
        : "這筆 SOS 不會再送出。",
    };
  }

  if (activeCase.syncState === "sending") {
    return {
      tone: "info",
      label: "送出中",
      detail: "正在通知車隊值班人員，請稍候。",
    };
  }

  if (
    activeCase.syncState === "submitted" ||
    activeCase.syncState === "complete"
  ) {
    return {
      tone: "success",
      label: "已送達",
      detail: "SOS 已通報車隊值班。",
    };
  }

  if (activeCase.syncState === "attachment_pending") {
    return {
      tone: "warn",
      label: "附件待補送",
      detail: "SOS 已通報車隊值班，部分附件還沒傳出。",
    };
  }

  if (activeCase.autoResendBlocked) {
    return {
      tone: "danger",
      label: "無法送出",
      detail: "不會自動再送，可按「重新送出」再試。",
    };
  }

  if (isStaleUndelivered(activeCase)) {
    return {
      tone: "warn",
      label: "尚未送達",
      detail: "已超過 30 分鐘，不會自動送出。",
    };
  }

  if (browserOnline === false) {
    return {
      tone: "warn",
      label: "尚未送達",
      detail: `${sosSavedHereLabel()}，連線後會自動送出。`,
    };
  }

  const nextResend = describeNextResend(activeCase);
  return {
    tone: "warn",
    label: "尚未送達",
    detail: nextResend
      ? `${nextResend}，也可按「重新送出」。`
      : `${sosSavedHereLabel()}，正在自動再送，也可按「重新送出」。`,
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

function formatUploadStateLabel(state: string): string {
  switch (state) {
    case "confirmed":
      return "已確認";
    case "uploading":
      return "上傳中";
    case "unavailable":
      return "稍後補送";
    case "failed_retryable":
      return "待重試";
    default:
      return "本機保存";
  }
}

function formatScanStatusLabel(status: string | null): string {
  if (!status) return "";
  switch (status) {
    case "clean":
      return " · 掃描通過";
    case "pending":
      return " · 掃描中";
    case "infected":
      return " · 檔案異常";
    default:
      return "";
  }
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
                上傳狀態：{formatUploadStateLabel(attachment.uploadState)}
                {formatScanStatusLabel(attachment.scanStatus)}
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
      <Text style={styles.falseAlarmText}>向右滑，標記為誤觸</Text>
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
  // At most one SOS send may be in flight. A ref, not `submitting`, because
  // the auto-resend effect and a handler can both start a send before React
  // has re-rendered with the new state.
  const sendInFlightRef = useRef(false);
  // A supplement queued while a send is running: re-sync once it finishes.
  const syncQueuedRef = useRef(false);
  // The newest in-memory case, so a send that started earlier applies its
  // result on top of what happened meanwhile (a queued supplement, a duty
  // readback) instead of overwriting it with its own older snapshot.
  const latestCaseRef = useRef<DriverSosActiveCase | null>(null);
  // Set when the session ended while an SOS was undelivered (see the catch
  // in syncActiveCase); the screen then explains that instead of redirecting.
  const [sessionLostWithSos, setSessionLostWithSos] = useState(false);
  const sessionLostAlertedRef = useRef(false);
  // Re-renders when a waiting resend turns out to be too old to send.
  const [, setStaleCheckTick] = useState(0);
  // Bumped when the app returns to the foreground so a resend that came due
  // while JS timers were paused is attempted straight away.
  const [foregroundTick, setForegroundTick] = useState(0);

  // `true`/`false` only where the platform reports connectivity (the web
  // build's navigator.onLine and online/offline events). React Native has no
  // navigator.onLine, so on the phone this stays `null` ("unknown"): the send
  // itself is the connectivity test, and a failure is retried with backoff.
  // Only an explicit `false` blocks a send.
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
  const [supplementAttachments, setSupplementAttachments] = useState<
    DriverSosAttachmentDraft[]
  >([]);
  const [falseAlarmNote, setFalseAlarmNote] = useState("");
  const [holdProgress, setHoldProgress] = useState(0);
  const [submitting, setSubmitting] = useState(false);
  const [screenError, setScreenError] = useState<string | null>(null);
  const [uiNotice, setUiNotice] = useState<string | null>(null);

  const isProvisioned = isDriverIdentityProvisioned();

  useEffect(() => {
    const unregister = registerProtectedCacheClearHandler((event) => {
      setContext(null);
      setDraftAttachments([]);
      setSupplementAttachments([]);
      const latest = latestCaseRef.current;
      // Any automatic sign-out (this send's 401, the location queue, a
      // failed token refresh) keeps an undelivered SOS and warns the driver.
      if (
        event?.reason === "session_ended" &&
        latest &&
        isUndelivered(latest)
      ) {
        keepThroughSignOut(latest);
        return;
      }
      latestCaseRef.current = null;
      setActiveCase(null);
    });
    return () => unregister();
  }, []);

  useEffect(() => {
    if (!isProvisioned) {
      setLoadingCase(false);
      setLoadingContext(false);
      return;
    }

    let cancelled = false;
    // The stored SOS loads on its own: it is local and quick, and it must not
    // wait for the task list (up to about a minute with the fallback), nor be
    // replaced by it.
    void (async () => {
      // A storage failure must not leave the screen loading forever.
      const storedCase = await loadDriverSosActiveCase().catch(() => null);
      if (cancelled) {
        return;
      }
      adoptStoredCase(storedCase);
      setLoadingCase(false);
    })();
    void (async () => {
      const taskContext = await resolveSosTaskContext();
      if (cancelled) {
        return;
      }
      setContext(taskContext);
      setLoadingContext(false);
    })();

    return () => {
      cancelled = true;
      if (progressIntervalRef.current) {
        clearInterval(progressIntervalRef.current);
      }
    };
  }, [isProvisioned]);

  useEffect(() => {
    if (
      typeof window === "undefined" ||
      typeof window.addEventListener !== "function" ||
      typeof window.removeEventListener !== "function"
    ) {
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
    const subscription = AppState.addEventListener("change", (nextState) => {
      if (nextState === "active") {
        setForegroundTick((tick) => tick + 1);
      }
    });
    return () => subscription.remove();
  }, []);

  // Automatic resend of a stored SOS that has not reached the server. It runs
  // once the case's backoff (`nextAttemptAt`, set by markDriverSosCaseFailed)
  // is due; before that it waits on a single timer. 重新送出 skips the wait.
  useEffect(() => {
    if (!activeCase || !isProvisioned) {
      return;
    }
    if (browserOnline === false) {
      return;
    }
    if (!canAutoResend(activeCase)) {
      return;
    }

    const dueAt = activeCase.nextAttemptAt
      ? Date.parse(activeCase.nextAttemptAt)
      : Number.NaN;
    const waitMs = Number.isNaN(dueAt) ? 0 : dueAt - Date.now();
    if (waitMs <= 0) {
      void syncActiveCase(activeCase, false);
      return;
    }

    const timer = setTimeout(() => {
      // It may have become too old (or been dismissed) while waiting.
      if (canAutoResend(latestCopyOf(activeCase))) {
        void syncActiveCase(latestCopyOf(activeCase), false);
      } else {
        setStaleCheckTick((tick) => tick + 1);
      }
    }, waitMs);
    return () => clearTimeout(timer);
  }, [activeCase, browserOnline, foregroundTick, isProvisioned]);

  // Honest duty-ack readback: poll the canonical server state rather than
  // ever inferring that a duty person has been assigned from submission
  // alone. Keeps polling past acknowledgment so later investigating /
  // resolved / closed transitions are still observed; only stops once the
  // server reports a terminal S-3 status.
  const sosEventIdForReadback = activeCase?.receipt?.sosEventId ?? null;
  const sosReadbackIsTerminal = isDriverSosStatusTerminal(
    activeCase?.status ?? null,
  );
  useEffect(() => {
    if (!sosEventIdForReadback || sosReadbackIsTerminal) {
      return;
    }

    let cancelled = false;
    const logoutGeneration = getDriverSosLogoutGeneration();

    async function pollDutyReadback() {
      try {
        const readback = await getDriverClient().get<{
          event: Pick<DriverSosEventRecord, "status" | "dutyAcknowledgement">;
        }>(
          `/api/driver/sos-events/${encodeURIComponent(sosEventIdForReadback!)}`,
        );
        if (cancelled) {
          return;
        }
        const current = latestCaseRef.current;
        if (current?.receipt?.sosEventId !== sosEventIdForReadback) {
          return;
        }
        await persistActiveCase(
          applyDriverSosDutyReadback(current, readback.event),
          logoutGeneration,
        );
      } catch {
        // Best-effort background readback; local outbox state is unaffected
        // and the next poll (or manual retry) will try again.
      }
    }

    void pollDutyReadback();
    const timer = setInterval(() => {
      void pollDutyReadback();
    }, 20_000);

    return () => {
      cancelled = true;
      clearInterval(timer);
    };
  }, [sosEventIdForReadback, sosReadbackIsTerminal]);

  // Not memoised: it depends on the clock (next resend, 30-minute limit).
  const syncChip = getSyncChipModel(activeCase, browserOnline);

  function resetHoldProgress() {
    if (progressIntervalRef.current) {
      clearInterval(progressIntervalRef.current);
      progressIntervalRef.current = null;
    }
    holdStartedAtRef.current = null;
    holdTriggeredRef.current = false;
    setHoldProgress(0);
  }

  // Local storage is best effort. A failed write (iOS can refuse keychain
  // writes just after the phone locks; Android Keystore errors; the web
  // build's storage) must never stop or skip sending the SOS: the case stays
  // in memory and the send goes ahead.
  // `logoutGeneration`: from when an async step started. If the driver has
  // logged out since, nothing is written back, so a late result cannot bring
  // the SOS back for the next driver.
  async function persistActiveCase(
    nextCase: DriverSosActiveCase | null,
    logoutGeneration?: number,
  ) {
    if (
      logoutGeneration !== undefined &&
      logoutGeneration !== getDriverSosLogoutGeneration()
    ) {
      return;
    }
    latestCaseRef.current = nextCase;
    setActiveCase(nextCase);
    try {
      await saveDriverSosActiveCase(nextCase);
    } catch (error) {
      console.warn(
        "Driver SOS case could not be saved on this device",
        formatDriverError(error, "儲存失敗"),
      );
    }
  }

  /**
   * Adopts the SOS stored on this device, unless a case was created or
   * changed on this screen after it opened (that one is newer), and never one
   * raised by a different driver.
   */
  function adoptStoredCase(storedCase: DriverSosActiveCase | null) {
    const driverId = currentDriverId();
    const latest = latestCaseRef.current;
    if (latest) {
      if (!isOwnedBy(latest, driverId)) {
        latestCaseRef.current = null;
        setActiveCase(null);
      }
      return;
    }
    if (!storedCase) {
      return;
    }
    if (!isOwnedBy(storedCase, driverId)) {
      // Another driver's SOS (a late save after logout, a failed delete):
      // never send it with this driver's sign-in.
      void saveDriverSosActiveCase(null).catch(() => undefined);
      return;
    }
    const restored = normalizeLoadedCase({
      ...storedCase,
      ownerDriverId: storedCase.ownerDriverId ?? driverId,
    });
    latestCaseRef.current = restored;
    setActiveCase(restored);
  }

  /**
   * The session ended while this SOS was undelivered: keep it (flagged, so
   * the screen keeps warning, also after signing back in) and tell the driver
   * once, before anything moves them to sign-in.
   */
  function keepThroughSignOut(
    baseCase: DriverSosActiveCase,
    logoutGeneration?: number,
  ) {
    const kept: DriverSosActiveCase = {
      ...baseCase,
      sessionLostAt: baseCase.sessionLostAt ?? new Date().toISOString(),
    };
    void persistActiveCase(kept, logoutGeneration);
    noteDriverSosSessionCleared({
      explicitLogout: false,
      keptUndeliveredSos: true,
    });
    setSessionLostWithSos(true);
    if (!sessionLostAlertedRef.current) {
      sessionLostAlertedRef.current = true;
      Alert.alert(SESSION_LOST_SOS_TITLE, SESSION_LOST_SOS_BODY);
    }
  }

  /** The newest in-memory copy of this same SOS, or `fallback`. */
  function latestCopyOf(fallback: DriverSosActiveCase): DriverSosActiveCase {
    const latest = latestCaseRef.current;
    return latest && latest.clientEventId === fallback.clientEventId
      ? latest
      : fallback;
  }

  async function syncActiveCase(
    targetCase: DriverSosActiveCase,
    manualRetry: boolean,
    options: { queueIfBusy?: boolean } = {},
  ) {
    if (targetCase.falseAlarm.dismissed) {
      // Marked 誤觸 or 不用了: never sent again.
      return;
    }
    if (!isOwnedBy(targetCase, currentDriverId())) {
      // Raised by a different driver: never send it with this sign-in.
      if (latestCaseRef.current?.clientEventId === targetCase.clientEventId) {
        latestCaseRef.current = null;
        setActiveCase(null);
      }
      return;
    }
    if (sendInFlightRef.current) {
      if (options.queueIfBusy) {
        syncQueuedRef.current = true;
      }
      return;
    }
    sendInFlightRef.current = true;
    const logoutGeneration = getDriverSosLogoutGeneration();
    const save = (nextCase: DriverSosActiveCase) =>
      persistActiveCase(nextCase, logoutGeneration);
    let sendingCase = targetCase;

    try {
      sendingCase = markDriverSosCaseSending(
        manualRetry ? { ...targetCase, autoResendBlocked: false } : targetCase,
      );
      setSubmitting(true);
      setScreenError(null);
      setUiNotice(manualRetry ? "重新送出 SOS…" : "正在送出 SOS…");
      await save(sendingCase);

      const result = await getDriverClient().submitDriverSosEvent(
        buildDriverSosSubmitCommand(sendingCase),
        {
          headers: {
            "Idempotency-Key": sendingCase.clientEventId,
            "X-Request-Id": sendingCase.clientEventId,
          },
        },
      );
      const submittedCase: DriverSosActiveCase = {
        ...markDriverSosCaseSubmitted(latestCopyOf(sendingCase), result),
        sessionLostAt: null,
        autoResendBlocked: false,
      };
      await save(submittedCase);
      if (logoutGeneration === getDriverSosLogoutGeneration()) {
        // Delivered after all (e.g. another request signed the driver out
        // while this send was already on its way): stop warning.
        noteDriverSosDelivered();
        setSessionLostWithSos(false);
      }
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
            return withTimeout(ATTACHMENT_READ_TIMEOUT_MS, async (signal) => {
              const response = await fetch(attachment.uri, { signal });
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
            });
          },
          createUploadIntent(sosEventId, command) {
            return client.post<CreateDriverSosAttachmentUploadIntentResult>(
              `/api/driver/sos-events/${encodeURIComponent(sosEventId)}/attachments/upload-intents`,
              { body: command },
            );
          },
          async upload(intent, prepared) {
            await withTimeout(ATTACHMENT_UPLOAD_TIMEOUT_MS, async (signal) => {
              const response = await fetch(intent.uploadUrl, {
                method: intent.method,
                headers: intent.headers,
                body: prepared.body,
                signal,
              });
              if (!response.ok) {
                throw new Error(`附件上傳失敗 (${response.status})。`);
              }
            });
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
      const completedCase = keepPendingSupplementsVisible(
        applyDriverSosAttachmentSyncResult(
          latestCopyOf(submittedCase),
          attachmentSync.attachments,
        ),
      );
      await save(completedCase);
      setUiNotice(
        attachmentSync.unavailableCount + attachmentSync.failedCount > 0
          ? `SOS ${result.receipt.eventNo} 已送達；附件暫時傳不出去，${sosSavedHereLabel()}，可稍後按「重新送出」。`
          : `SOS ${result.receipt.eventNo} 與附件都已送達。`,
      );
    } catch (error) {
      let sessionEnded = false;
      try {
        sessionEnded = await recoverDriverSessionFromApiError(error);
      } catch {
        // Clearing the session failed; treat it as an ordinary failed send.
      }
      if (sessionEnded) {
        // The session ended (expired or revoked) before this SOS reached the
        // server. Keep it on the device, due at once, so it is resent with
        // the same idempotency key when this driver signs back in, and tell
        // the driver plainly to call for help now.
        const keptCase: DriverSosActiveCase = {
          ...markSendFailed(
            latestCopyOf(sendingCase),
            "登入已失效，SOS 還沒送到。",
          ),
          nextAttemptAt: new Date().toISOString(),
        };
        if (keptCase.receipt) {
          await save(keptCase);
        } else {
          keepThroughSignOut(keptCase, logoutGeneration);
        }
        setUiNotice(null);
        return;
      }
      const sanitizedError = formatDriverError(
        error,
        "SOS 送出失敗，請稍後再試。",
      );
      const failedCase = markSendFailed(
        latestCopyOf(sendingCase),
        sanitizedError,
        { blocked: !isRetryableSendFailure(httpStatusOf(error)) },
      );
      await save(failedCase);
      // An undelivered SOS gets the "SOS 尚未送達" banner (call-now advice,
      // retry status); the reason stays in the progress list.
      setUiNotice(
        failedCase.receipt
          ? `附件還沒傳出，${sosSavedHereLabel()}，可稍後按「重新送出」。`
          : null,
      );
    } finally {
      sendInFlightRef.current = false;
      setSubmitting(false);
      resetHoldProgress();
      if (syncQueuedRef.current) {
        syncQueuedRef.current = false;
        const latest = latestCaseRef.current;
        if (
          latest?.receipt &&
          logoutGeneration === getDriverSosLogoutGeneration()
        ) {
          void syncActiveCase(latest, false);
        }
      }
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

  async function handleSubmitSos() {
    if (submitting) {
      return;
    }

    const existingCase = latestCaseRef.current ?? activeCase;
    if (existingCase && !existingCase.falseAlarm.dismissed) {
      setScreenError("目前已有一筆進行中的 SOS，請改用補充區更新資訊。");
      resetHoldProgress();
      return;
    }

    const description = formatSosDescription({
      situationLabel: selectedSituationLabel,
      details,
      platformContext: context?.crossPlatform
        ? {
            platformCode: context.crossPlatform.platformCode,
            platformLabel: context.crossPlatform.platformLabel,
            externalOrderId: context.crossPlatform.externalOrderId,
            nativeStatusLabel: formatPlatformStatusLabel(
              context.crossPlatform.platformStatus,
            ),
          }
        : null,
    });
    const location = getDriverSosLocationSnapshot();
    const isOffline = browserOnline === false;
    const nextCase = createDriverSosActiveCase({
      eventType: mapSituationToDriverSosEventType(selectedSituation),
      situation: selectedSituation,
      description,
      attachments: draftAttachments,
      originalTriggeredAt: new Date().toISOString(),
      offlineAtTrigger: isOffline,
      location,
      orderId: context?.orderId ?? null,
      taskId: context?.taskId ?? null,
      ownerDriverId: currentDriverId(),
    });
    // UI resets first: the auto-resend effect may start sending this case
    // while it is being saved, and its notices/errors must not be overwritten.
    setUiNotice(
      isOffline
        ? `裝置離線，SOS ${sosSavedHereLabel()}，連線後自動送出。`
        : "正在送出 SOS…",
    );
    setDraftAttachments([]);
    setDetails("");
    setScreenError(null);
    await persistActiveCase(nextCase);

    if (isOffline) {
      resetHoldProgress();
      return;
    }

    await syncActiveCase(nextCase, false);
  }

  async function handleRetry() {
    const latest = latestCaseRef.current ?? activeCase;
    if (
      !latest ||
      latest.falseAlarm.dismissed ||
      browserOnline === false ||
      submitting
    ) {
      return;
    }

    await syncActiveCase(latest, true);
  }

  /** 不用了: an old undelivered SOS the driver no longer wants sent. */
  async function handleDismissStaleSos() {
    const latest = latestCaseRef.current ?? activeCase;
    if (!latest) {
      return;
    }
    await persistActiveCase({
      ...latest,
      falseAlarm: {
        dismissed: true,
        dismissedAt: new Date().toISOString(),
        note: "司機選擇不送出這筆較早的 SOS。",
      },
    });
    setUiNotice("這筆 SOS 不會再送出。");
  }

  // Supplements are photos only. The server has no endpoint for supplement
  // notes, so a typed note would never reach ops; drivers are told to phone
  // the dispatcher instead.
  async function handleQueueSupplement() {
    if (!activeCase) {
      setScreenError("請先建立 SOS，再加入補充照片。");
      return;
    }
    if (supplementAttachments.length === 0) {
      setScreenError("請先加入照片。");
      return;
    }

    const queuedCase = queueDriverSosSupplement(latestCopyOf(activeCase), {
      note: "",
      attachments: supplementAttachments,
    });
    // On a delivered SOS the new photos are owed: show 重新送出 for them.
    const nextCase =
      queuedCase.receipt &&
      (queuedCase.syncState === "submitted" ||
        queuedCase.syncState === "complete")
        ? { ...queuedCase, syncState: "attachment_pending" as const }
        : queuedCase;
    await persistActiveCase(nextCase);
    setSupplementAttachments([]);
    setUiNotice(
      !nextCase.receipt
        ? `補充照片${sosSavedHereLabel()}，SOS 送達後會一起上傳。`
        : browserOnline !== false
          ? "補充照片已加入，正在上傳。"
          : `補充照片${sosSavedHereLabel()}，連線後按「重新送出」上傳。`,
    );
    setScreenError(null);
    if (browserOnline !== false && nextCase.receipt) {
      await syncActiveCase(nextCase, false, { queueIfBusy: true });
    }
  }

  async function handleFalseAlarmConfirm() {
    if (!activeCase) {
      return;
    }

    Alert.alert(
      "二次確認誤觸",
      "標記誤觸後，這筆 SOS 不會再自動送出。車隊不會自動收到這個標記，若 SOS 已送達，請打電話告知派車台。確定要繼續嗎？",
      [
        { text: "取消", style: "cancel" },
        {
          text: "確認標記誤觸",
          style: "destructive",
          onPress: () => {
            void (async () => {
              const nextCase = markDriverSosFalseAlarm(
                latestCopyOf(activeCase),
                falseAlarmNote,
              );
              await persistActiveCase(nextCase);
              setFalseAlarmNote("");
              setUiNotice(
                nextCase.receipt
                  ? "已標記誤觸。車隊不會自動收到這個標記，請打電話告知派車台。"
                  : "已標記誤觸，這筆 SOS 不會再送出。",
              );
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
  const selectedSituationLabel = getSituationLabel(selectedSituation);
  const currentLocation = getDriverSosLocationSnapshot();
  const undeliveredCase =
    activeCase && isUndelivered(activeCase) ? activeCase : null;
  const staleCase =
    undeliveredCase && isStaleUndelivered(undeliveredCase)
      ? undeliveredCase
      : null;
  // From the first failed send on, the driver is told to phone as well.
  let undeliveredAdvice: string | null = null;
  if (undeliveredCase && !staleCase) {
    if (undeliveredCase.autoResendBlocked) {
      undeliveredAdvice = `這筆 SOS 送不出去。${CALL_NOW_ADVICE}可以按「重新送出」再試一次。`;
    } else if (undeliveredCase.sessionLostAt) {
      undeliveredAdvice = `登入曾失效，這筆 SOS 還沒送到。${CALL_NOW_ADVICE}${STAY_ON_SCREEN_ADVICE}`;
    } else if (undeliveredCase.attemptCount > 0) {
      undeliveredAdvice = `${CALL_NOW_ADVICE}${STAY_ON_SCREEN_ADVICE}`;
    }
  }
  const showResendButton = Boolean(
    activeCase &&
    !activeCase.falseAlarm.dismissed &&
    !staleCase &&
    (activeCase.syncState === "pending" ||
      activeCase.syncState === "failed_retryable" ||
      activeCase.syncState === "attachment_pending"),
  );

  if (!isProvisioned) {
    if (sessionLostWithSos || hasUndeliveredSosKeptThroughSignOut()) {
      return (
        <Shell
          theme={THEME}
          footer={
            <View style={styles.footerBar}>
              <Btn
                theme={THEME}
                variant="primary"
                size="md"
                onPress={() => resetDriverAppToOnboarding(router)}
              >
                重新登入
              </Btn>
            </View>
          }
        >
          <PageHeader theme={THEME} title={driverRouteTitles.sos} />
          <Banner
            theme={THEME}
            tone="danger"
            title={SESSION_LOST_SOS_TITLE}
            body={SESSION_LOST_SOS_BODY}
          />
        </Shell>
      );
    }
    return <Redirect href="/onboarding" />;
  }

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
          {showResendButton ? (
            <Btn
              theme={THEME}
              variant="primary"
              size="md"
              danger
              disabled={browserOnline === false || submitting}
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
        subtitle="緊急求援 · 2 秒長按 · 離線自動保存與補送"
        actions={
          activeCase?.falseAlarm.dismissed ? (
            <Btn
              theme={THEME}
              variant="ghost"
              size="sm"
              onPress={() => void persistActiveCase(null)}
            >
              清除這筆紀錄
            </Btn>
          ) : null
        }
      />

      <StatusChip activeCase={activeCase} browserOnline={browserOnline} />

      {undeliveredAdvice ? (
        <Banner
          theme={THEME}
          tone="danger"
          title={SESSION_LOST_SOS_TITLE}
          body={undeliveredAdvice}
        />
      ) : null}

      {uiNotice ? (
        <Banner
          theme={THEME}
          tone={syncChip.tone}
          title="狀態"
          body={uiNotice}
        />
      ) : null}

      {staleCase ? (
        <Card theme={THEME} title="尚未送達的 SOS">
          <Text style={styles.staleCopy}>
            {`這筆 SOS 是 ${formatAt(staleCase.originalTriggeredAt)} 建立的，還沒送達。仍要送出嗎？`}
          </Text>
          <View style={styles.sectionActions}>
            <Btn
              theme={THEME}
              variant="primary"
              size="sm"
              danger
              disabled={browserOnline === false || submitting}
              onPress={() => void handleRetry()}
            >
              送出
            </Btn>
            <Btn
              theme={THEME}
              variant="secondary"
              size="sm"
              disabled={submitting}
              onPress={() => void handleDismissStaleSos()}
            >
              不用了
            </Btn>
          </View>
        </Card>
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
              送出後將立即通報車隊值班人員並建立安全事件。
            </Text>
          </View>
        </View>
      </Card>

      {loading ? (
        <Card theme={THEME} title="載入中">
          <Text style={styles.emptyCopy}>正在讀取目前行程…</Text>
        </Card>
      ) : null}

      {!activeCase ? (
        <>
          <Card theme={THEME} title="情況" subtitle="請選擇目前狀況">
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
                    {selected ? (
                      <Text
                        style={[
                          styles.situationMeta,
                          styles.situationMetaSelected,
                        ]}
                      >
                        目前選取
                      </Text>
                    ) : null}
                  </Pressable>
                );
              })}
            </View>
          </Card>

          <Card theme={THEME} title="當前訂單情境">
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
                    {
                      label: "行程編號",
                      value: context.orderId ?? "—",
                      mono: true,
                    },
                    {
                      label: "任務編號",
                      value: context.taskId ?? "—",
                      mono: true,
                    },
                    {
                      label: "目前狀態",
                      value: formatDriverTaskStatusLabel(context.localStatus),
                    },
                    {
                      label: "目前位置",
                      value: currentLocation
                        ? `${currentLocation.lat.toFixed(5)}, ${currentLocation.lng.toFixed(5)}`
                        : "—",
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
                            value:
                              context.crossPlatform.externalOrderId ?? "未提供",
                            mono: Boolean(
                              context.crossPlatform.externalOrderId,
                            ),
                          },
                        ]
                      : []),
                  ]}
                />
              </View>
            ) : (
              <Text style={styles.emptyCopy}>
                目前沒有進行中的行程，仍可直接送出 SOS。
              </Text>
            )}
          </Card>

          <Card theme={THEME} title="補充說明與附件">
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
                每筆 SOS 合計最多 {MAX_ATTACHMENTS}{" "}
                件。附件會跟著本機紀錄一起保留。
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
            title="本次 SOS"
            actions={
              activeCase.receipt ? (
                <>
                  <Pill theme={THEME} tone="success" dot>
                    事件編號 {activeCase.receipt.eventNo}
                  </Pill>
                  <Pill
                    theme={THEME}
                    tone={
                      activeCase.dutyAcknowledgement.acknowledgedByActorId
                        ? "success"
                        : "warn"
                    }
                    dot
                  >
                    {activeCase.dutyAcknowledgement.acknowledgedByActorId
                      ? "值班人員已收到"
                      : "等待值班人員回應"}
                  </Pill>
                </>
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
                  mono: true,
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
              emptyLabel="初始 SOS 未附帶附件。"
            />
          </Card>

          <Card
            theme={THEME}
            title="補充照片"
            subtitle="照片會先保存起來，再上傳給車隊。"
          >
            <Text style={styles.callDispatchCopy}>
              要補充說明請直接打電話給派車台。
            </Text>
            <View style={styles.sectionActions}>
              <Btn
                theme={THEME}
                variant="secondary"
                size="sm"
                onPress={() =>
                  void pickAttachments("supplement", supplementAttachments)
                }
              >
                加入照片
              </Btn>
              <Btn
                theme={THEME}
                variant="primary"
                size="sm"
                disabled={supplementAttachments.length === 0}
                onPress={() => void handleQueueSupplement()}
              >
                送出照片
              </Btn>
            </View>
            <AttachmentList
              attachments={supplementAttachments}
              emptyLabel="尚未加入照片。"
              onRemove={(attachmentId) =>
                setSupplementAttachments((current) =>
                  current.filter(
                    (attachment) => attachment.id !== attachmentId,
                  ),
                )
              }
            />
            {activeCase.supplements.some(
              (supplement) => supplement.attachments.length > 0,
            ) ? (
              <View style={styles.supplementHistory}>
                {activeCase.supplements
                  .filter((supplement) => supplement.attachments.length > 0)
                  .map((supplement) => (
                    <View key={supplement.id} style={styles.supplementRow}>
                      <Text style={styles.supplementTitle}>
                        {`補充照片 ${supplement.attachments.length} 張`}
                      </Text>
                      <Text style={styles.supplementMeta}>
                        {formatAt(supplement.createdAt)} ·{" "}
                        {supplement.state === "complete" ? "已上傳" : "待上傳"}
                      </Text>
                    </View>
                  ))}
              </View>
            ) : null}
          </Card>

          <Card
            theme={THEME}
            title="誤觸處理"
            subtitle="向右滑到底，再按一次確認。"
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

          <Card theme={THEME} title="求援進度紀錄">
            {activeCase.timeline.length === 0 ? (
              <Text style={styles.emptyCopy}>目前還沒有進度。</Text>
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
  staleCopy: {
    color: THEME.text,
    fontFamily: THEME.fontFamily,
    fontSize: 14,
    lineHeight: 20,
  },
  callDispatchCopy: {
    color: THEME.text,
    fontFamily: THEME.fontFamily,
    fontSize: 13,
    fontWeight: "600",
    lineHeight: 19,
    marginBottom: 4,
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
