import * as SecureStore from "expo-secure-store";
import type { ImagePickerAsset } from "expo-image-picker";
import type {
  DriverSosEventType,
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
  addedAt: string;
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
  description: string;
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

function clampRetryDelayMs(attemptCount: number) {
  const rawDelay =
    DRIVER_SOS_RETRY_BASE_MS *
    2 ** Math.max(0, Math.min(attemptCount - 1, 5));
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
  asset: Pick<ImagePickerAsset, "uri" | "mimeType" | "fileName">,
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
    addedAt: now,
  };
}

export function createDriverSosActiveCase(params: {
  eventType: DriverSosEventType | null;
  description: string;
  attachments: DriverSosAttachmentDraft[];
  originalTriggeredAt: string;
  offlineAtTrigger: boolean;
  location: DriverSosLocationSnapshot | null;
  orderId: string | null;
  taskId: string | null;
}): DriverSosActiveCase {
  const now = new Date().toISOString();
  const baseCase: DriverSosActiveCase = {
    clientEventId: createLocalId("sos"),
    incidentId: null,
    eventNo: null,
    eventType: params.eventType,
    description: params.description.trim(),
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
      ? "裝置目前離線，事件已寫入本機 durable outbox。"
      : "事件已寫入本機 durable outbox，準備送往安全值班。",
    occurredAt: params.originalTriggeredAt,
    tone: "danger",
  });

  if (params.attachments.length > 0) {
    nextCase = appendTimelineEntry(nextCase, {
      kind: "attachment_added",
      title: "已附上現場附件",
      detail: `${params.attachments.length} 件附件已綁定到 SOS case。`,
      occurredAt: now,
      tone: "info",
    });
  }

  return nextCase;
}

export function buildDriverSosSubmitCommand(
  activeCase: DriverSosActiveCase,
): SubmitDriverSosEventCommand {
  return {
    clientEventId: activeCase.clientEventId,
    orderId: activeCase.orderId,
    taskId: activeCase.taskId,
    eventType: activeCase.eventType,
    severity: activeCase.eventType ? "major" : "normal",
    description: activeCase.description || null,
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
      detail: "App 正在將 SOS 事件送往 driver-sos 服務。",
      occurredAt: new Date().toISOString(),
      tone: "info",
    },
  );
}

export function markDriverSosCaseSubmitted(
  activeCase: DriverSosActiveCase,
  result: SubmitDriverSosEventResult,
): DriverSosActiveCase {
  const receivedAt = result.receipt.serverReceivedAt;
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
    title: result.receipt.duplicate ? "伺服器接受既有 SOS" : "已送達安全值班",
    detail: result.receipt.duplicate
      ? `同一 clientEventId 已存在，沿用事件編號 ${result.receipt.eventNo}。`
      : `事件編號 ${result.receipt.eventNo} 已建立並關聯 incident ${result.receipt.incidentId}。`,
    occurredAt: receivedAt,
    tone: "success",
  });

  nextCase = appendTimelineEntry(nextCase, {
    kind: "incident_created",
    title: "已建立 incident",
    detail: `incident ${result.receipt.incidentId} 已由 driver-sos domain 建立。`,
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
      detail: `${errorMessage} 系統會保留本機資料並允許重試。`,
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
      title: `已開啟 ${targetLabel}`,
      detail: `原生撥號已切到 ${params.phoneNumber}。`,
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
    detailParts.push(`${itemCount} 件附件待 evidence channel 補送`);
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
        detailParts.join("，") || "補充資料已寫入本機 case timeline，待後續補送。",
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
      detail:
        note.trim() || "司機已以二次確認方式標記本次 SOS 為誤觸。",
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
      attachments: Array.isArray(parsed.attachments) ? parsed.attachments : [],
      supplements: Array.isArray(parsed.supplements) ? parsed.supplements : [],
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
