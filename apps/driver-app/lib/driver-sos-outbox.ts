import * as SecureStore from "expo-secure-store";
import type { ImagePickerAsset } from "expo-image-picker";
import type {
  DriverSosEventType,
  DriverSosAttachmentScanStatus,
  DriverSosLocationSnapshot,
  DriverSosSubmissionReceipt,
  PendingSosOutboxItem,
  SubmitDriverSosEventCommand,
  SubmitDriverSosEventResult,
} from "@drts/contracts";

const DRIVER_SOS_ACTIVE_CASE_KEY = "drts.driver.sos.activeCase";
const DRIVER_SOS_RETRY_BASE_MS = 60_000;
const DRIVER_SOS_RETRY_MAX_MS = 30 * 60_000;

export type DriverSosCaseState = PendingSosOutboxItem["state"];
export type DriverSosTimelineTone =
  | "danger"
  | "warn"
  | "info"
  | "success"
  | "neutral";
export type DriverSosDialTarget = "police" | "fire" | "fleet";

export interface DriverSosAttachmentDraft {
  id: string;
  uri: string;
  fileName: string;
  mimeType: string | null;
  fileSize: number | null;
  addedAt: string;
  uploadState:
    | "local"
    | "uploading"
    | "confirmed"
    | "unavailable"
    | "failed_retryable";
  serverAttachmentId: string | null;
  scanStatus: DriverSosAttachmentScanStatus | null;
  lastError: string | null;
}

export interface DriverSosSupplementDraft {
  id: string;
  note: string;
  attachments: DriverSosAttachmentDraft[];
  createdAt: string;
  state: "attachment_pending" | "complete" | "failed_retryable";
  lastError: string | null;
}

export interface DriverSosDialRecord {
  id: string;
  target: DriverSosDialTarget;
  phoneNumber: string;
  occurredAt: string;
}

export interface DriverSosTimelineRecord {
  id: string;
  kind: string;
  title: string;
  detail: string;
  occurredAt: string;
  tone: DriverSosTimelineTone;
}

export interface DriverSosActiveCase {
  clientEventId: string;
  incidentId: string | null;
  eventNo: string | null;
  eventType: DriverSosEventType | null;
  /**
   * The exact situation the driver picked. The platform only accepts the four
   * `DRIVER_SOS_EVENT_TYPES`, so the finer-grained choice is preserved here and
   * replayed to the platform as a structured prefix on the description.
   */
  situationId: string | null;
  situationLabel: string | null;
  description: string;
  vehicleId: string | null;
  plateNo: string | null;
  deviceId: string | null;
  attachments: DriverSosAttachmentDraft[];
  originalTriggeredAt: string;
  offlineAtTrigger: boolean;
  location: DriverSosLocationSnapshot | null;
  orderId: string | null;
  taskId: string | null;
  syncState: DriverSosCaseState;
  attemptCount: number;
  nextAttemptAt: string;
  lastError: string | null;
  receipt: DriverSosSubmissionReceipt | null;
  supplements: DriverSosSupplementDraft[];
  dialRecords: DriverSosDialRecord[];
  falseAlarm: {
    dismissed: boolean;
    dismissedAt: string | null;
    note: string | null;
  };
  timeline: DriverSosTimelineRecord[];
}

function createLocalId(prefix: string): string {
  if (
    typeof globalThis.crypto !== "undefined" &&
    typeof globalThis.crypto.randomUUID === "function"
  ) {
    return `${prefix}-${globalThis.crypto.randomUUID()}`;
  }

  return `${prefix}-${Date.now()}-${Math.random().toString(16).slice(2)}`;
}

function createClientEventId(): string {
  if (
    typeof globalThis.crypto !== "undefined" &&
    typeof globalThis.crypto.randomUUID === "function"
  ) {
    return globalThis.crypto.randomUUID();
  }

  return "xxxxxxxx-xxxx-4xxx-yxxx-xxxxxxxxxxxx".replace(
    /[xy]/g,
    (character) => {
      const random = Math.floor(Math.random() * 16);
      const value = character === "x" ? random : (random & 0x3) | 0x8;
      return value.toString(16);
    },
  );
}

function clampRetryDelayMs(attemptCount: number) {
  const rawDelay =
    DRIVER_SOS_RETRY_BASE_MS * 2 ** Math.max(0, Math.min(attemptCount - 1, 5));
  return Math.min(rawDelay, DRIVER_SOS_RETRY_MAX_MS);
}

function addMs(isoTimestamp: string, durationMs: number) {
  const parsed = Date.parse(isoTimestamp);
  const baseMs = Number.isNaN(parsed) ? Date.now() : parsed;
  return new Date(baseMs + durationMs).toISOString();
}

function cloneTimelineEntry(
  entry: DriverSosTimelineRecord,
): DriverSosTimelineRecord {
  return { ...entry };
}

function normalizeAttachmentDraft(
  attachment: DriverSosAttachmentDraft,
): DriverSosAttachmentDraft {
  return {
    ...attachment,
    fileSize: attachment.fileSize ?? null,
    uploadState: attachment.uploadState ?? "local",
    serverAttachmentId: attachment.serverAttachmentId ?? null,
    scanStatus: attachment.scanStatus ?? null,
    lastError: attachment.lastError ?? null,
  };
}

function appendTimelineEntry(
  activeCase: DriverSosActiveCase,
  entry: Omit<DriverSosTimelineRecord, "id">,
): DriverSosActiveCase {
  return {
    ...activeCase,
    timeline: [
      {
        id: createLocalId("sos-timeline"),
        ...entry,
      },
      ...activeCase.timeline,
    ],
  };
}

export function createDriverSosAttachmentDraft(
  asset: Pick<ImagePickerAsset, "uri" | "mimeType" | "fileName" | "fileSize">,
): DriverSosAttachmentDraft {
  const now = new Date().toISOString();
  return {
    id: createLocalId("sos-attachment"),
    uri: asset.uri,
    fileName:
      asset.fileName?.trim() ||
      asset.uri.split("/").pop()?.trim() ||
      `sos-${now}.jpg`,
    mimeType: asset.mimeType?.trim() || null,
    fileSize:
      typeof asset.fileSize === "number" && asset.fileSize > 0
        ? asset.fileSize
        : null,
    addedAt: now,
    uploadState: "local",
    serverAttachmentId: null,
    scanStatus: null,
    lastError: null,
  };
}

export function createDriverSosActiveCase(params: {
  eventType: DriverSosEventType | null;
  situationId?: string | null;
  situationLabel?: string | null;
  description: string;
  attachments: DriverSosAttachmentDraft[];
  originalTriggeredAt: string;
  offlineAtTrigger: boolean;
  location: DriverSosLocationSnapshot | null;
  orderId: string | null;
  taskId: string | null;
  vehicleId?: string | null;
  plateNo?: string | null;
  deviceId?: string | null;
}): DriverSosActiveCase {
  const now = new Date().toISOString();
  const baseCase: DriverSosActiveCase = {
    clientEventId: createClientEventId(),
    incidentId: null,
    eventNo: null,
    eventType: params.eventType,
    situationId: params.situationId ?? null,
    situationLabel: params.situationLabel ?? null,
    description: params.description.trim(),
    vehicleId: params.vehicleId ?? null,
    plateNo: params.plateNo ?? null,
    deviceId: params.deviceId ?? null,
    attachments: [...params.attachments],
    originalTriggeredAt: params.originalTriggeredAt,
    offlineAtTrigger: params.offlineAtTrigger,
    location: params.location,
    orderId: params.orderId,
    taskId: params.taskId,
    syncState: "pending",
    attemptCount: 0,
    nextAttemptAt: now,
    lastError: null,
    receipt: null,
    supplements: [],
    dialRecords: [],
    falseAlarm: {
      dismissed: false,
      dismissedAt: null,
      note: null,
    },
    timeline: [],
  };

  let nextCase = appendTimelineEntry(baseCase, {
    kind: "sos_local_triggered",
    title: "已觸發 SOS",
    detail: params.offlineAtTrigger
      ? "目前沒有網路，求援已保存在手機，恢復連線後會自動送出。"
      : "求援已保存在手機，正在送往車隊安全值班。",
    occurredAt: params.originalTriggeredAt,
    tone: "danger",
  });

  if (params.attachments.length > 0) {
    nextCase = appendTimelineEntry(nextCase, {
      kind: "attachment_added",
      title: "已附上現場附件",
      detail: `已附上 ${params.attachments.length} 件現場附件。`,
      occurredAt: now,
      tone: "info",
    });
  }

  return nextCase;
}

/**
 * Situations that are not immediately life-threatening. Everything else is
 * escalated as `major` so the duty desk triages it first.
 */
const DRIVER_SOS_NORMAL_SEVERITY_SITUATIONS = new Set([
  "vehicle_breakdown",
  "other",
]);

function resolveDriverSosSeverity(
  activeCase: DriverSosActiveCase,
): "major" | "normal" {
  if (activeCase.situationId) {
    return DRIVER_SOS_NORMAL_SEVERITY_SITUATIONS.has(activeCase.situationId)
      ? "normal"
      : "major";
  }

  return activeCase.eventType && activeCase.eventType !== "other"
    ? "major"
    : "normal";
}

/**
 * The platform contract only accepts four event types, while the driver picks
 * from six situations. The exact situation is therefore replayed as a
 * structured `[類別]` prefix so the duty desk still sees what the driver chose.
 * The device identifier has no dedicated command field either, so it rides
 * along on the same line — it is never rendered back to the driver.
 */
export function buildDriverSosSubmitCommand(
  activeCase: DriverSosActiveCase,
): SubmitDriverSosEventCommand {
  const descriptionParts: string[] = [];
  if (activeCase.situationLabel) {
    descriptionParts.push(`[${activeCase.situationLabel}]`);
  }
  if (activeCase.description.trim()) {
    descriptionParts.push(activeCase.description.trim());
  }

  let description = descriptionParts.join(" ");
  if (activeCase.deviceId) {
    description = description
      ? `${description}\n（裝置：${activeCase.deviceId}）`
      : `（裝置：${activeCase.deviceId}）`;
  }

  return {
    clientEventId: activeCase.clientEventId,
    orderId: activeCase.orderId,
    taskId: activeCase.taskId,
    vehicleId: activeCase.vehicleId,
    plateNo: activeCase.plateNo,
    eventType: activeCase.eventType,
    severity: resolveDriverSosSeverity(activeCase),
    description: description || null,
    location: activeCase.location,
    originalTriggeredAt: activeCase.originalTriggeredAt,
    offlineAtTrigger: activeCase.offlineAtTrigger,
  };
}

export function markDriverSosCaseSending(
  activeCase: DriverSosActiveCase,
): DriverSosActiveCase {
  return appendTimelineEntry(
    {
      ...activeCase,
      syncState: "sending",
      lastError: null,
    },
    {
      kind: "server_received",
      title: "正在送出",
      detail: "正在將求援送往車隊安全值班，尚未確認送達。",
      occurredAt: new Date().toISOString(),
      tone: "info",
    },
  );
}

export function markDriverSosCaseSubmitted(
  activeCase: DriverSosActiveCase,
  result: SubmitDriverSosEventResult,
): DriverSosActiveCase {
  const receivedAt = result.receipt.fleetReportConfirmedAt;
  let nextCase: DriverSosActiveCase = {
    ...activeCase,
    incidentId: result.receipt.incidentId,
    eventNo: result.receipt.eventNo,
    syncState: "submitted",
    lastError: null,
    receipt: result.receipt,
  };

  nextCase = appendTimelineEntry(nextCase, {
    kind: "fleet_report_confirmed",
    title: "平台已接收",
    detail: result.receipt.duplicate
      ? `平台已有同一筆求援，沿用事件編號 ${result.receipt.eventNo}。`
      : `平台已接收求援，事件編號 ${result.receipt.eventNo}。`,
    occurredAt: receivedAt,
    tone: "success",
  });

  nextCase = appendTimelineEntry(nextCase, {
    kind: "incident_created",
    title: "平台已建立案件",
    detail: "車隊安全值班已收到通知，並開始處理本次求援。",
    occurredAt: receivedAt,
    tone: "success",
  });

  if (activeCase.offlineAtTrigger) {
    nextCase = appendTimelineEntry(nextCase, {
      kind: "offline_replayed",
      title: "離線補送完成",
      detail: "沒有網路時建立的求援，已在恢復連線後成功送達平台。",
      occurredAt: receivedAt,
      tone: "success",
    });
  }

  return nextCase;
}

export function applyDriverSosAttachmentSyncResult(
  activeCase: DriverSosActiveCase,
  attachments: DriverSosAttachmentDraft[],
): DriverSosActiveCase {
  if (attachments.length === 0) {
    return activeCase;
  }

  const confirmedCount = attachments.filter(
    (attachment) => attachment.uploadState === "confirmed",
  ).length;
  const unavailableCount = attachments.filter(
    (attachment) => attachment.uploadState === "unavailable",
  ).length;
  const failedCount = attachments.filter(
    (attachment) => attachment.uploadState === "failed_retryable",
  ).length;
  const scanPendingCount = attachments.filter(
    (attachment) =>
      attachment.scanStatus === "unavailable" ||
      attachment.scanStatus === "error" ||
      attachment.scanStatus === "pending",
  ).length;
  const pending = unavailableCount + failedCount + scanPendingCount > 0;
  const now = new Date().toISOString();
  const attachmentById = new Map(
    attachments.map((attachment) => [attachment.id, attachment]),
  );
  const supplements = activeCase.supplements.map((supplement) => {
    const syncedAttachments = supplement.attachments.map(
      (attachment) => attachmentById.get(attachment.id) ?? attachment,
    );
    const supplementPending = syncedAttachments.some(
      (attachment) =>
        attachment.uploadState !== "confirmed" ||
        attachment.scanStatus === "pending" ||
        attachment.scanStatus === "unavailable" ||
        attachment.scanStatus === "error",
    );
    return {
      ...supplement,
      attachments: syncedAttachments,
      state: supplementPending
        ? ("attachment_pending" as const)
        : ("complete" as const),
      lastError:
        syncedAttachments.find((attachment) => attachment.lastError)
          ?.lastError ?? null,
    };
  });

  return appendTimelineEntry(
    {
      ...activeCase,
      attachments: activeCase.attachments.map(
        (attachment) => attachmentById.get(attachment.id) ?? attachment,
      ),
      supplements,
      syncState: pending ? "attachment_pending" : "complete",
      lastError: pending ? "平台已接收求援，部分附件仍在上傳中。" : null,
    },
    {
      kind: pending ? "attachment_sync_pending" : "attachment_sync_complete",
      title: pending ? "附件等待補送" : "附件處理完成",
      detail: pending
        ? `${confirmedCount} 件附件已完成上傳，${unavailableCount + failedCount} 件會自動重試。求援本身已不受影響。`
        : `${confirmedCount} 件附件已完成上傳。`,
      occurredAt: now,
      tone: pending ? "warn" : "success",
    },
  );
}

export function markDriverSosCaseFailed(
  activeCase: DriverSosActiveCase,
  errorMessage: string,
): DriverSosActiveCase {
  const now = new Date().toISOString();
  const nextAttemptCount = activeCase.attemptCount + 1;
  return appendTimelineEntry(
    {
      ...activeCase,
      syncState: "failed_retryable",
      attemptCount: nextAttemptCount,
      nextAttemptAt: addMs(now, clampRetryDelayMs(nextAttemptCount)),
      lastError: errorMessage,
    },
    {
      kind: "sync_failed",
      title: "送出失敗",
      detail: `${errorMessage} 求援仍保存在手機，會自動重試，也可以手動重新送出。`,
      occurredAt: now,
      tone: "warn",
    },
  );
}

export function addDriverSosDialRecord(
  activeCase: DriverSosActiveCase,
  params: {
    target: DriverSosDialTarget;
    phoneNumber: string;
  },
): DriverSosActiveCase {
  const occurredAt = new Date().toISOString();
  const dialRecord: DriverSosDialRecord = {
    id: createLocalId("sos-dial"),
    target: params.target,
    phoneNumber: params.phoneNumber,
    occurredAt,
  };
  const targetLabel =
    params.target === "police"
      ? "110 警政"
      : params.target === "fire"
        ? "119 消防"
        : "車隊值班";

  return appendTimelineEntry(
    {
      ...activeCase,
      dialRecords: [dialRecord, ...activeCase.dialRecords],
    },
    {
      kind: "native_dial_opened",
      title: `已撥打 ${targetLabel}`,
      detail: `已撥出 ${params.phoneNumber}。`,
      occurredAt,
      tone: "danger",
    },
  );
}

export function queueDriverSosSupplement(
  activeCase: DriverSosActiveCase,
  params: {
    note: string;
    attachments: DriverSosAttachmentDraft[];
  },
): DriverSosActiveCase {
  const createdAt = new Date().toISOString();
  const supplement: DriverSosSupplementDraft = {
    id: createLocalId("sos-supplement"),
    note: params.note.trim(),
    attachments: [...params.attachments],
    createdAt,
    state: "attachment_pending",
    lastError: null,
  };
  const itemCount = supplement.attachments.length;
  const detailParts = [];
  if (supplement.note) {
    detailParts.push("已加入補充說明");
  }
  if (itemCount > 0) {
    detailParts.push(`${itemCount} 件附件待連線後補送`);
  }

  return appendTimelineEntry(
    {
      ...activeCase,
      supplements: [supplement, ...activeCase.supplements],
    },
    {
      kind: "supplement_added",
      title: "已加入補充資料",
      detail:
        detailParts.join("，") ||
        "補充資料已保存在手機，待連線後補送。",
      occurredAt: createdAt,
      tone: "info",
    },
  );
}

export function markDriverSosFalseAlarm(
  activeCase: DriverSosActiveCase,
  note: string,
): DriverSosActiveCase {
  const dismissedAt = new Date().toISOString();
  return appendTimelineEntry(
    {
      ...activeCase,
      falseAlarm: {
        dismissed: true,
        dismissedAt,
        note: note.trim() || null,
      },
    },
    {
      kind: "false_alarm_dismissed",
      title: "已標記誤觸",
      detail: note.trim() || "駕駛已完成二次確認，將本次求援標記為誤觸。",
      occurredAt: dismissedAt,
      tone: "warn",
    },
  );
}

export async function loadDriverSosActiveCase(): Promise<DriverSosActiveCase | null> {
  const raw = await SecureStore.getItemAsync(DRIVER_SOS_ACTIVE_CASE_KEY);
  if (!raw) {
    return null;
  }

  try {
    const parsed = JSON.parse(raw) as DriverSosActiveCase;
    if (!parsed.clientEventId?.trim() || !parsed.originalTriggeredAt?.trim()) {
      throw new Error("Stored safety request record is incomplete.");
    }

    return {
      ...parsed,
      situationId: parsed.situationId ?? null,
      situationLabel: parsed.situationLabel ?? null,
      vehicleId: parsed.vehicleId ?? null,
      plateNo: parsed.plateNo ?? null,
      deviceId: parsed.deviceId ?? null,
      attachments: Array.isArray(parsed.attachments)
        ? parsed.attachments.map(normalizeAttachmentDraft)
        : [],
      supplements: Array.isArray(parsed.supplements)
        ? parsed.supplements.map((supplement) => ({
            ...supplement,
            attachments: Array.isArray(supplement.attachments)
              ? supplement.attachments.map(normalizeAttachmentDraft)
              : [],
          }))
        : [],
      dialRecords: Array.isArray(parsed.dialRecords) ? parsed.dialRecords : [],
      timeline: Array.isArray(parsed.timeline)
        ? parsed.timeline.map(cloneTimelineEntry)
        : [],
    };
  } catch {
    await SecureStore.deleteItemAsync(DRIVER_SOS_ACTIVE_CASE_KEY);
    return null;
  }
}

export async function saveDriverSosActiveCase(
  activeCase: DriverSosActiveCase | null,
): Promise<void> {
  if (!activeCase) {
    await SecureStore.deleteItemAsync(DRIVER_SOS_ACTIVE_CASE_KEY);
    return;
  }

  await SecureStore.setItemAsync(
    DRIVER_SOS_ACTIVE_CASE_KEY,
    JSON.stringify(activeCase),
  );
}
