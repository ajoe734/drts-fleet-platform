import * as SecureStore from "expo-secure-store";
import type { ImagePickerAsset } from "expo-image-picker";
import type {
  DriverSosEventType,
  DriverSosAttachmentScanStatus,
  DriverSosLocationSnapshot,
  DriverSosSeverity,
  DriverSosSubmissionReceipt,
  PendingSosOutboxItem,
  SubmitDriverSosEventCommand,
  SubmitDriverSosEventResult,
} from "@drts/contracts";

import { driverIncidentSituations } from "./strings";

const DRIVER_SOS_ACTIVE_CASE_KEY = "drts.driver.sos.activeCase";
const DRIVER_SOS_RETRY_BASE_MS = 60_000;
const DRIVER_SOS_RETRY_MAX_MS = 30 * 60_000;

export type SosSituationId = (typeof driverIncidentSituations)[number]["id"];

export type DriverSosCaseState = PendingSosOutboxItem["state"];
export type DriverSosTimelineTone =
  | "danger"
  | "warn"
  | "info"
  | "success"
  | "neutral";

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
  situation?: SosSituationId | null;
  severity?: DriverSosSeverity | null;
  description: string;
  driverId?: string | null;
  vehicleId?: string | null;
  plateNo?: string | null;
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
  dialRecords?: Array<{
    id: string;
    target: string;
    phoneNumber: string;
    occurredAt: string;
  }>;
  falseAlarm: {
    dismissed: boolean;
    dismissedAt: string | null;
    note: string | null;
  };
  timeline: DriverSosTimelineRecord[];
}

export function mapSituationToDriverSosEventType(
  situationId: SosSituationId | null | undefined,
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

export function getSituationLabel(
  situationId: SosSituationId | null | undefined,
): string | null {
  if (!situationId) {
    return null;
  }

  return (
    driverIncidentSituations.find((situation) => situation.id === situationId)
      ?.label ?? null
  );
}

export function formatSosDescription(params: {
  situationLabel?: string | null;
  details?: string | null;
  platformContext?: {
    platformLabel?: string | null;
    platformCode?: string | null;
    mirrorOrderId?: string | null;
    externalOrderId?: string | null;
    nativeStatusLabel?: string | null;
  } | null;
}): string {
  const lines: string[] = [];
  if (params.situationLabel) {
    lines.push(`事件情況：${params.situationLabel}`);
  }

  const detail = params.details?.trim();
  if (detail) {
    lines.push(detail);
  }

  if (params.platformContext && params.platformContext.platformCode) {
    lines.push(
      "",
      "[SOS 平台任務上下文]",
      `來源平台：${params.platformContext.platformLabel || params.platformContext.platformCode}（${params.platformContext.platformCode}）`,
    );
    if (params.platformContext.mirrorOrderId) {
      lines.push(`本地鏡像訂單：${params.platformContext.mirrorOrderId}`);
    }
    if (params.platformContext.externalOrderId) {
      lines.push(`外部訂單：${params.platformContext.externalOrderId}`);
    }
    if (params.platformContext.nativeStatusLabel) {
      lines.push(`目前平台狀態：${params.platformContext.nativeStatusLabel}`);
    }
  }

  return lines.join("\n").trim();
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
  eventType?: DriverSosEventType | null;
  situation?: SosSituationId | null;
  severity?: DriverSosSeverity | null;
  description: string;
  driverId?: string | null;
  vehicleId?: string | null;
  plateNo?: string | null;
  attachments?: DriverSosAttachmentDraft[];
  originalTriggeredAt?: string;
  offlineAtTrigger: boolean;
  location: DriverSosLocationSnapshot | null;
  orderId: string | null;
  taskId: string | null;
}): DriverSosActiveCase {
  const now = new Date().toISOString();
  const originalTriggeredAt = params.originalTriggeredAt || now;
  const eventType =
    params.eventType !== undefined
      ? params.eventType
      : mapSituationToDriverSosEventType(params.situation);
  const attachments = params.attachments ? [...params.attachments] : [];

  const baseCase: DriverSosActiveCase = {
    clientEventId: createClientEventId(),
    incidentId: null,
    eventNo: null,
    eventType,
    situation: params.situation ?? null,
    severity: params.severity ?? (eventType ? "major" : "normal"),
    description: params.description.trim(),
    driverId: params.driverId ?? null,
    vehicleId: params.vehicleId ?? null,
    plateNo: params.plateNo ?? null,
    attachments,
    originalTriggeredAt,
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
      ? "裝置目前離線，事件已保存於本機，連線後自動補送。"
      : "事件已保存於本機，準備送往車隊安全值班。",
    occurredAt: originalTriggeredAt,
    tone: "danger",
  });

  if (attachments.length > 0) {
    nextCase = appendTimelineEntry(nextCase, {
      kind: "attachment_added",
      title: "已附上現場附件",
      detail: `${attachments.length} 件附件已綁定到 SOS 事件。`,
      occurredAt: now,
      tone: "info",
    });
  }

  return nextCase;
}

export function buildDriverSosSubmitCommand(
  activeCase: DriverSosActiveCase,
): SubmitDriverSosEventCommand {
  const command: SubmitDriverSosEventCommand = {
    clientEventId: activeCase.clientEventId,
    orderId: activeCase.orderId,
    taskId: activeCase.taskId,
    eventType: activeCase.eventType,
    severity:
      activeCase.severity ?? (activeCase.eventType ? "major" : "normal"),
    description: activeCase.description || null,
    location: activeCase.location,
    originalTriggeredAt: activeCase.originalTriggeredAt,
    offlineAtTrigger: activeCase.offlineAtTrigger,
  };

  if (activeCase.driverId !== undefined && activeCase.driverId !== null) {
    command.driverId = activeCase.driverId;
  }
  if (activeCase.vehicleId !== undefined && activeCase.vehicleId !== null) {
    command.vehicleId = activeCase.vehicleId;
  }
  if (activeCase.plateNo !== undefined && activeCase.plateNo !== null) {
    command.plateNo = activeCase.plateNo;
  }

  return command;
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
      detail: "正在將 SOS 通報送往車隊安全值班。",
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
    title: result.receipt.duplicate ? "伺服器已確認既有 SOS" : "已送達安全值班",
    detail: result.receipt.duplicate
      ? `伺服器已確認既有通報，事件編號 ${result.receipt.eventNo}。`
      : `事件編號 ${result.receipt.eventNo} 已建立並指派值班人員（事件編號：${result.receipt.incidentId}）。`,
    occurredAt: receivedAt,
    tone: "success",
  });

  nextCase = appendTimelineEntry(nextCase, {
    kind: "incident_created",
    title: "已建立安全事件",
    detail: `安全事件 ${result.receipt.incidentId} 已由系統建立。`,
    occurredAt: receivedAt,
    tone: "success",
  });

  if (activeCase.offlineAtTrigger) {
    nextCase = appendTimelineEntry(nextCase, {
      kind: "offline_replayed",
      title: "離線補送完成",
      detail: "離線期間建立的 SOS 已於重新連線後成功送達。",
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
      lastError: pending ? "SOS 已送達；部分附件仍等待儲存或掃描服務。" : null,
    },
    {
      kind: pending ? "attachment_sync_pending" : "attachment_sync_complete",
      title: pending ? "附件等待補送" : "附件處理完成",
      detail: pending
        ? `${confirmedCount} 件已確認，${unavailableCount} 件服務未就緒，${failedCount} 件可重試。SOS 主事件不受影響。`
        : `${confirmedCount} 件附件已由伺服器確認。`,
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
      detail: `${errorMessage} 系統已保留本機資料，將於連線後重試。`,
      occurredAt: now,
      tone: "warn",
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
    detailParts.push(`${itemCount} 件附件待補送`);
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
        "補充資料已寫入本機紀錄，待後續補送。",
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
      detail: note.trim() || "司機已以二次確認方式標記本次 SOS 為誤觸。",
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
      throw new Error("Driver SOS local case payload is incomplete.");
    }

    return {
      ...parsed,
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

