import { randomUUID, createHmac, timingSafeEqual } from "node:crypto";
import { HttpStatus, Injectable, Optional } from "@nestjs/common";
import type {
  ComplaintCaseRecord,
  ComplaintCaseStatus,
  ResourceActionDescriptor,
} from "@drts/contracts";

import { ApiRequestError } from "../../common/api-envelope";
import { AuditNotificationService } from "../audit-notification/audit-notification.service";
import { CallcenterService } from "../callcenter/callcenter.service";
import { ComplaintService } from "../complaint/complaint.service";
import {
  FleetDocumentStorageService,
  MAX_FLEET_DOCUMENT_BYTES,
} from "./fleet-document-storage.service";
import { FleetPartnerService } from "./fleet-partner.service";

export interface FleetCaseItem {
  id: string;
  caseNo: string;
  type: "complaint" | "incident";
  cat: string;
  desc: string;
  driver: string;
  driverId: string;
  severity: "high" | "normal" | "medium" | "low" | "critical";
  // The existing Ops/Fleet consumer contract only has these three wire
  // values, and only "platform" yields its read-only (no fleet reply)
  // behavior. Projecting an unattributed ordinary complaint onto
  // "platform" to get that same read-only handling does NOT mean a
  // canonical platform business responsibility was ever determined for
  // it -- see mapComplaintToFleetCase. A dedicated consumer-contract value
  // for "no fleet identified" (distinct from a genuine platform-owned
  // case) would need the Fleet portal consumer (apps/fleet-partner-portal-web,
  // outside this task's write_scopes) updated too; that is a seam to
  // coordinate, not invent unilaterally here.
  responsibility: "fleet" | "shared" | "platform";
  fleetPartnerId: string;
  status: ComplaintCaseStatus;
  slaDueAt: string;
  slaBreachedAt: string | null;
  slaBreach: boolean;
  slaTone: "danger" | "success" | "neutral";
  slaLabel: string;
  reopenCount: number;
  relatedOrder: string | null;
  relatedCall: string | null;
  assignee: string;
  openedAt: string;
  updatedAt: string;
  closedAt?: string | null;
  actionDescriptor: ResourceActionDescriptor;
}

export interface FleetCaseTimelineAttachment {
  attachmentId?: string;
  name: string;
  size: string;
  fileSize?: number;
  downloadUrl?: string;
}

export interface FleetCaseTimelineEvent {
  entryId: string;
  caseId: string;
  at: string;
  tone: "accent" | "warn" | "danger" | "success";
  t: string;
  actor: string;
  actorRealm: "ops" | "tenant" | "system";
  body: string;
  attachments?: FleetCaseTimelineAttachment[] | undefined;
}

export interface FleetCaseAttachmentRecord {
  attachmentId: string;
  caseId: string;
  fleetPartnerId: string;
  name: string;
  size: string;
  fileSize: number;
  contentType: string;
  state: "done" | "uploading" | "fail";
  pct?: number;
  uploadedAt: string;
  uploadedBy: string;
  objectKey: string;
}

export interface FleetCaseReplyRecord {
  replyId: string;
  caseId: string;
  fleetPartnerId: string;
  idempotencyKey: string;
  content: string;
  actorId: string;
  repliedAt: string;
  attachments: FleetCaseTimelineAttachment[];
  deduplicated?: boolean;
}

export interface SubmitFleetCaseReplyCommand {
  content: string;
  idempotencyKey?: string;
  attachmentIds?: string[];
}

export interface CreateCaseAttachmentUploadUrlCommand {
  fileName: string;
  fileSize: number;
  contentType: string;
}

export interface ConfirmCaseAttachmentUploadCommand {
  attachmentId: string;
  objectKey: string;
  fileName: string;
  fileSize: number;
  contentType: string;
  checksumSha256?: string;
}

const READBACK_SECRET =
  process.env.DRTS_READBACK_SECRET || "drts-fleet-case-attachment-secret-2026";
const MAX_ATTACHMENT_SIZE = MAX_FLEET_DOCUMENT_BYTES;

// A committed Complaint note is the only channel another already-warm
// instance (which never ran this reply's createReply locally) can read the
// reply back from. This marker lets that instance recover the real
// structured attachment relation instead of only the human-readable
// filenames already appended to the note text. A plain `\n` + ASCII token
// (no control bytes) keeps the note a normal Postgres text value.
const FLEET_REPLY_ATTACHMENT_MANIFEST_MARKER =
  "\n<<fleet-reply-attachments>>";

function appendAttachmentManifest(
  note: string,
  attachments: readonly FleetCaseTimelineAttachment[],
): string {
  if (!attachments.length) {
    return note;
  }
  const manifest = attachments.map((attachment) => ({
    attachmentId: attachment.attachmentId,
    name: attachment.name,
    size: attachment.size,
    fileSize: attachment.fileSize,
  }));
  return `${note}${FLEET_REPLY_ATTACHMENT_MANIFEST_MARKER}${JSON.stringify(manifest)}`;
}

/**
 * A legitimate human reply body can itself contain this literal marker
 * string (quoted, pasted, or coincidentally typed), with or without
 * trailing text that merely looks like JSON, and never have had a real
 * manifest appended. A real manifest is always appended last (see
 * appendAttachmentManifest), so only the *last* occurrence is a truncation
 * candidate. Even then, the suffix is trusted as a real attachment
 * relation only when every attachmentId it names is verified against this
 * same case's actual confirmed stored attachments (verifyAttachment) --
 * never from JSON shape alone, since a human can type a convincing but
 * never-uploaded manifest. Anything that fails verification leaves the
 * note untouched: no truncation, no fabricated attachment relation.
 */
function splitAttachmentManifest(
  note: string,
  verifyAttachment: (attachmentId: string) => boolean,
): {
  body: string;
  attachments: FleetCaseTimelineAttachment[];
} {
  const markerIndex = note.lastIndexOf(FLEET_REPLY_ATTACHMENT_MANIFEST_MARKER);
  if (markerIndex === -1) {
    return { body: note, attachments: [] };
  }
  const body = note.slice(0, markerIndex);
  const raw = note.slice(
    markerIndex + FLEET_REPLY_ATTACHMENT_MANIFEST_MARKER.length,
  );
  let parsed: unknown;
  try {
    parsed = JSON.parse(raw);
  } catch {
    return { body: note, attachments: [] };
  }
  if (!Array.isArray(parsed) || parsed.length === 0) {
    return { body: note, attachments: [] };
  }
  const attachments: FleetCaseTimelineAttachment[] = [];
  for (const item of parsed) {
    if (
      !item ||
      typeof item !== "object" ||
      typeof (item as Record<string, unknown>).attachmentId !== "string" ||
      typeof (item as Record<string, unknown>).name !== "string" ||
      !verifyAttachment((item as Record<string, unknown>).attachmentId as string)
    ) {
      // All-or-nothing: a single unverifiable entry means this suffix is
      // not actually a server-appended manifest, so the whole note
      // (marker included) is literal text.
      return { body: note, attachments: [] };
    }
    const record = item as Record<string, unknown>;
    attachments.push({
      attachmentId: record.attachmentId as string,
      name: record.name as string,
      size: typeof record.size === "string" ? record.size : "",
      ...(typeof record.fileSize === "number"
        ? { fileSize: record.fileSize }
        : {}),
    });
  }
  return { body, attachments };
}

function formatFileSize(bytes: number): string {
  if (bytes < 1024) return `${bytes} B`;
  if (bytes < 1024 * 1024) return `${(bytes / 1024).toFixed(1)} KB`;
  return `${(bytes / (1024 * 1024)).toFixed(1)} MB`;
}

function signAttachmentToken(
  fleetPartnerId: string,
  caseId: string,
  attachmentId: string,
  expiresAt: number,
): string {
  const payload = `${fleetPartnerId}:${caseId}:${attachmentId}:${expiresAt}`;
  return createHmac("sha256", READBACK_SECRET).update(payload).digest("hex");
}

function verifyAttachmentToken(
  fleetPartnerId: string,
  caseId: string,
  attachmentId: string,
  expiresAt: number,
  signature: string,
): boolean {
  if (!Number.isFinite(expiresAt) || Date.now() >= expiresAt) {
    return false;
  }
  const expected = signAttachmentToken(
    fleetPartnerId,
    caseId,
    attachmentId,
    expiresAt,
  );
  try {
    return timingSafeEqual(
      Buffer.from(signature, "hex"),
      Buffer.from(expected, "hex"),
    );
  } catch {
    return false;
  }
}

@Injectable()
export class FleetPartnerCaseService {
  // In-memory canonical case registry
  private cases = new Map<string, FleetCaseItem>();
  private timelines = new Map<string, FleetCaseTimelineEvent[]>();
  private attachments = new Map<string, FleetCaseAttachmentRecord>();
  private replies = new Map<string, FleetCaseReplyRecord>();
  private repliesByIdempotencyKey = new Map<string, FleetCaseReplyRecord>();
  private pendingSettlementReplies = new Map<
    string,
    Promise<FleetCaseReplyRecord>
  >();

  constructor(
    @Optional() private readonly complaintService?: ComplaintService,
    @Optional() private readonly fleetPartnerService?: FleetPartnerService,
    @Optional()
    private readonly auditNotificationService?: AuditNotificationService,
    @Optional()
    private readonly storage: FleetDocumentStorageService = new FleetDocumentStorageService(),
    @Optional() private readonly callcenterService?: CallcenterService,
  ) {
    this.seedCases();
  }

  private seedCases() {
    // cmp_0908: open, fleet responsibility, reopened, SLA breached
    const cmp0908: FleetCaseItem = {
      id: "cmp_0908",
      caseNo: "C-20260520-000001",
      type: "complaint",
      cat: "driver_conduct",
      desc: "乘客反映司機言語不當，已上傳影片證據。",
      driver: "黃文豪",
      driverId: "d_8851",
      severity: "high",
      responsibility: "fleet",
      fleetPartnerId: "METRO_FLEET",
      status: "reopened",
      slaDueAt: "2026-05-22 14:30",
      slaBreachedAt: "2026-05-22 14:31",
      slaBreach: true,
      slaTone: "danger",
      slaLabel: "SLA breached",
      reopenCount: 1,
      relatedOrder: "ord_8175",
      relatedCall: "call_2014",
      assignee: "陳維 (ops_compliance)",
      openedAt: "2026-05-20 14:30",
      updatedAt: "2026-05-22 15:00",
      actionDescriptor: {
        action: "respond",
        enabled: true,
        riskLevel: "medium",
      },
    };

    // cmp_0912: platform responsibility, under_investigation, SLA on track
    const cmp0912: FleetCaseItem = {
      id: "cmp_0912",
      caseNo: "C-20260518-000001",
      type: "complaint",
      cat: "pricing_dispute",
      desc: "乘客反映車資與預估不符，屬平台計價規則爭議。",
      driver: "林志偉",
      driverId: "d_7702",
      severity: "normal",
      responsibility: "platform",
      fleetPartnerId: "METRO_FLEET",
      status: "under_investigation",
      slaDueAt: "2026-05-20 09:40",
      slaBreachedAt: null,
      slaBreach: false,
      slaTone: "success",
      slaLabel: "on track",
      reopenCount: 0,
      relatedOrder: "ord_7960",
      relatedCall: null,
      assignee: "王芳 (ops_billing)",
      openedAt: "2026-05-18 09:40",
      updatedAt: "2026-05-18 11:20",
      actionDescriptor: {
        action: "respond",
        enabled: false,
        disabledReasonCode: "platform_owned",
        riskLevel: "medium",
      },
    };

    // cmp_closed_001: closed case
    const cmpClosed: FleetCaseItem = {
      id: "cmp_closed_001",
      caseNo: "C-20260521-000002",
      type: "complaint",
      cat: "route_issue",
      desc: "行車路線爭議已調閱 GPS 記錄並結案。",
      driver: "黃文豪",
      driverId: "d_8851",
      severity: "normal",
      responsibility: "fleet",
      fleetPartnerId: "METRO_FLEET",
      status: "closed",
      slaDueAt: "2026-05-23 10:00",
      slaBreachedAt: null,
      slaBreach: false,
      slaTone: "neutral",
      slaLabel: "closed",
      reopenCount: 0,
      relatedOrder: "ord_8100",
      relatedCall: null,
      assignee: "陳維 (ops_compliance)",
      openedAt: "2026-05-21 10:00",
      updatedAt: "2026-05-24 10:05",
      closedAt: "2026-05-24 10:05",
      actionDescriptor: {
        action: "respond",
        enabled: false,
        disabledReasonCode: "case_closed",
        riskLevel: "medium",
      },
    };

    // cmp_other_fleet: other fleet case (for cross-fleet testing)
    const cmpOther: FleetCaseItem = {
      id: "cmp_9999",
      caseNo: "C-20260525-000099",
      type: "complaint",
      cat: "driver_service",
      desc: "其他車行司機服務態度申訴案件。",
      driver: "外行司機",
      driverId: "d_9999",
      severity: "high",
      responsibility: "fleet",
      fleetPartnerId: "other-fleet-partner-xyz",
      status: "under_investigation",
      slaDueAt: "2026-05-27 12:00",
      slaBreachedAt: null,
      slaBreach: false,
      slaTone: "success",
      slaLabel: "on track",
      reopenCount: 0,
      relatedOrder: "ord_9999",
      relatedCall: null,
      assignee: "王芳 (ops_billing)",
      openedAt: "2026-05-25 12:00",
      updatedAt: "2026-05-25 12:00",
      actionDescriptor: {
        action: "respond",
        enabled: true,
        riskLevel: "medium",
      },
    };

    this.cases.set(cmp0908.id, cmp0908);
    this.cases.set(cmp0908.caseNo, cmp0908);

    this.cases.set(cmp0912.id, cmp0912);
    this.cases.set(cmp0912.caseNo, cmp0912);

    this.cases.set(cmpClosed.id, cmpClosed);
    this.cases.set(cmpClosed.caseNo, cmpClosed);

    this.cases.set(cmpOther.id, cmpOther);
    this.cases.set(cmpOther.caseNo, cmpOther);

    // Initial timeline for cmp_0908
    const tl0908: FleetCaseTimelineEvent[] = [
      {
        entryId: "tl-0908-1",
        caseId: "cmp_0908",
        at: "2026-05-20 14:30",
        tone: "accent",
        t: "建立",
        actor: "eva.wang@yamato.tw",
        actorRealm: "tenant",
        body: "乘客反映司機言語不當，已上傳影片證據。",
      },
      {
        entryId: "tl-0908-2",
        caseId: "cmp_0908",
        at: "2026-05-20 14:42",
        tone: "accent",
        t: "指派",
        actor: "王芳 → 陳維",
        actorRealm: "ops",
        body: "由 ops_compliance 接手。",
      },
      {
        entryId: "tl-0908-3",
        caseId: "cmp_0908",
        at: "2026-05-20 16:00",
        tone: "warn",
        t: "評論",
        actor: "陳維",
        actorRealm: "ops",
        body: "已聯絡乘客，安排與司機對證。",
      },
      {
        entryId: "tl-0908-4",
        caseId: "cmp_0908",
        at: "2026-05-22 14:31",
        tone: "danger",
        t: "SLA breach",
        actor: "system.sla",
        actorRealm: "system",
        body: "超出 48h 處理時限。",
      },
      {
        entryId: "tl-0908-5",
        caseId: "cmp_0908",
        at: "2026-05-22 15:00",
        tone: "warn",
        t: "reopen",
        actor: "陳維",
        actorRealm: "ops",
        body: "乘客回報相同司機再次違規。",
      },
    ];
    this.timelines.set("cmp_0908", tl0908);
    this.timelines.set("C-20260520-000001", tl0908);

    // Initial timeline for cmp_0912
    const tl0912: FleetCaseTimelineEvent[] = [
      {
        entryId: "tl-0912-1",
        caseId: "cmp_0912",
        at: "2026-05-18 09:40",
        tone: "accent",
        t: "建立",
        actor: "lin.zhiwei@yamato.tw",
        actorRealm: "tenant",
        body: "乘客反映車資與預估不符。",
      },
      {
        entryId: "tl-0912-2",
        caseId: "cmp_0912",
        at: "2026-05-18 10:05",
        tone: "accent",
        t: "指派",
        actor: "系統 → 王芳",
        actorRealm: "ops",
        body: "依平台計價規則爭議路由至 ops_billing。",
      },
      {
        entryId: "tl-0912-3",
        caseId: "cmp_0912",
        at: "2026-05-18 11:20",
        tone: "accent",
        t: "責任判定",
        actor: "王芳",
        actorRealm: "ops",
        body: "計價規則由平台端設定，責任歸屬 platform；車行對此案唯讀。",
      },
    ];
    this.timelines.set("cmp_0912", tl0912);
    this.timelines.set("C-20260518-000001", tl0912);

    // Initial timeline for cmp_closed_001
    const tlClosed: FleetCaseTimelineEvent[] = [
      {
        entryId: "tl-closed-1",
        caseId: "cmp_closed_001",
        at: "2026-05-21 10:00",
        tone: "accent",
        t: "建立",
        actor: "system",
        actorRealm: "system",
        body: "系統建立行車路線爭議申訴。",
      },
      {
        entryId: "tl-closed-2",
        caseId: "cmp_closed_001",
        at: "2026-05-24 10:05",
        tone: "success",
        t: "結案",
        actor: "陳維",
        actorRealm: "ops",
        body: "已審閱車行回覆與附件，責任處置完成，案件結案。",
      },
    ];
    this.timelines.set("cmp_closed_001", tlClosed);
    this.timelines.set("C-20260521-000002", tlClosed);

    // Initial attachments
    const att1: FleetCaseAttachmentRecord = {
      attachmentId: "att-001",
      caseId: "cmp_0908",
      fleetPartnerId: "METRO_FLEET",
      name: "training_ack_20260523.pdf",
      size: "482 KB",
      fileSize: 493568,
      contentType: "application/pdf",
      state: "done",
      uploadedAt: "2026-05-23T09:10:00.000Z",
      uploadedBy: "陳家豪",
      objectKey: "fleet-cases/cmp_0908/training_ack_20260523.pdf",
    };
    const att2: FleetCaseAttachmentRecord = {
      attachmentId: "att-002",
      caseId: "cmp_0908",
      fleetPartnerId: "METRO_FLEET",
      name: "dashcam_clip_0908.mp4",
      size: "18.4 MB",
      fileSize: 19293798,
      contentType: "video/mp4",
      state: "uploading",
      pct: 62,
      uploadedAt: "2026-05-23T09:11:00.000Z",
      uploadedBy: "陳家豪",
      objectKey: "fleet-cases/cmp_0908/dashcam_clip_0908.mp4",
    };
    const att3: FleetCaseAttachmentRecord = {
      attachmentId: "att-003",
      caseId: "cmp_0908",
      fleetPartnerId: "METRO_FLEET",
      name: "driver_statement.jpg",
      size: "2.1 MB",
      fileSize: 2202009,
      contentType: "image/jpeg",
      state: "fail",
      uploadedAt: "2026-05-23T09:11:30.000Z",
      uploadedBy: "陳家豪",
      objectKey: "fleet-cases/cmp_0908/driver_statement.jpg",
    };

    const attClosed: FleetCaseAttachmentRecord = {
      attachmentId: "att-closed-1",
      caseId: "cmp_closed_001",
      fleetPartnerId: "METRO_FLEET",
      name: "training_ack_20260523.pdf",
      size: "482 KB",
      fileSize: 493568,
      contentType: "application/pdf",
      state: "done",
      uploadedAt: "2026-05-22T10:00:00.000Z",
      uploadedBy: "陳家豪",
      objectKey: "fleet-cases/cmp_closed_001/training_ack_20260523.pdf",
    };

    this.attachments.set(att1.attachmentId, att1);
    this.attachments.set(att2.attachmentId, att2);
    this.attachments.set(att3.attachmentId, att3);
    this.attachments.set(attClosed.attachmentId, attClosed);
  }

  private isFleetScopeMatch(
    caseFleetPartnerId: string,
    requestFleetPartnerId: string,
  ): boolean {
    // Partner identifiers are authoritative IDs, not demo aliases.
    return caseFleetPartnerId === requestFleetPartnerId;
  }

  private assertFleetScope(caseItem: FleetCaseItem, fleetPartnerId: string) {
    if (!this.isFleetScopeMatch(caseItem.fleetPartnerId, fleetPartnerId)) {
      throw new ApiRequestError(
        HttpStatus.FORBIDDEN,
        "CASE_NOT_FLEET_SCOPED",
        "嘗試開啟非本車行案件：僅能存取本車行旗下司機 / 車輛案件；案件不在清單中。",
        {
          caseId: caseItem.id,
          requestedFleetPartnerId: fleetPartnerId,
        },
      );
    }
  }

  private async resolveCase(caseId: string): Promise<FleetCaseItem> {
    const item = this.cases.get(caseId);
    if (item) {
      return item;
    }

    // Check if complaintService has this case, preferring the canonical Ops
    // readback: it reconciles against the durable repository when the case
    // was created or updated on a different already-warm API instance and
    // is therefore absent from this instance's optimistic in-memory cache.
    if (this.complaintService) {
      let complaint: ComplaintCaseRecord | undefined;
      try {
        complaint =
          typeof this.complaintService.getComplaintCaseForOps === "function"
            ? await this.complaintService.getComplaintCaseForOps(caseId)
            : this.complaintService.getComplaintCase(caseId);
      } catch (error) {
        // A pending-commit/refresh failure is a real, distinct outcome from
        // "case not found" and must not be disguised as either a 404 or a
        // false success.
        if (
          error instanceof ApiRequestError &&
          error.code === "IDEMPOTENCY_IN_PROGRESS"
        ) {
          throw error;
        }
        if (!(error instanceof ApiRequestError && error.code === "NOT_FOUND")) {
          // A genuine lookup failure (e.g. the durable store errored) is
          // likewise distinct from "this case does not exist" and must
          // propagate as itself rather than becoming a false 404.
          throw error;
        }
        complaint = undefined;
      }
      if (complaint) {
        // Deliberately outside the try block above: a real attribution
        // refresh failure here must propagate as itself, not be disguised
        // as "case not found".
        return this.mapComplaintToFleetCase(complaint);
      }
    }

    throw new ApiRequestError(
      HttpStatus.NOT_FOUND,
      "CASE_NOT_FOUND",
      "案件不存在或已被移除。",
      { caseId },
    );
  }

  /**
   * Derives the actual driver/fleet attribution for an ordinary (non
   * settlement_dispute) complaint from its real source order, via the
   * injected FleetPartnerService (order -> driver -> driver-fleet
   * affiliation, refreshed from the canonical repository). Returns null
   * when the complaint has no related order, no resolvable driver, or no
   * single unambiguous current affiliation — callers must treat that as
   * unattributed rather than guessing a fleet. A genuine refresh failure
   * (not a mere absence) propagates instead, since it must not be
   * disguised as an unattributed case.
   */
  private async resolveComplaintFleetAttribution(
    complaint: ComplaintCaseRecord,
  ): Promise<{
    driverId: string;
    driverName: string;
    fleetPartnerId: string;
  } | null> {
    if (!this.fleetPartnerService) {
      return null;
    }
    const orderId =
      complaint.relatedOrderId ||
      (await this.resolveOrderIdFromRelatedCall(complaint.relatedCallId));
    if (!orderId) {
      return null;
    }
    return this.fleetPartnerService.resolveOrderDriverFleetAttribution(
      orderId,
    );
  }

  /**
   * A legitimate case can carry only a `relatedCallId` (no direct
   * `relatedOrderId` of its own) while the persisted call it came from
   * already has a canonical `linkedOrderId` — e.g. when the complaint was
   * created through a path other than `transferCallToComplaint`'s own
   * `command.relatedOrderId ?? session.linkedOrderId` resolution. Fall back
   * to that call's canonical linkage rather than leaving it unattributed.
   * A missing call/order is honest non-attribution; any other read failure
   * propagates.
   */
  private async resolveOrderIdFromRelatedCall(
    relatedCallId: string | null | undefined,
  ): Promise<string | null> {
    if (!relatedCallId || !this.callcenterService) {
      return null;
    }
    try {
      const session =
        await this.callcenterService.getCallSessionForRead(relatedCallId);
      return session.linkedOrderId ?? null;
    } catch (error) {
      if (
        error instanceof ApiRequestError &&
        error.code === "CALL_SESSION_NOT_FOUND"
      ) {
        return null;
      }
      throw error;
    }
  }

  private async mapComplaintToFleetCase(
    complaint: ComplaintCaseRecord,
  ): Promise<FleetCaseItem> {
    const isClosed = complaint.status === "closed";
    const isSettlement = complaint.category === "settlement_dispute";
    const attribution = isSettlement
      ? null
      : await this.resolveComplaintFleetAttribution(complaint);
    return {
      id: complaint.caseNo,
      caseNo: complaint.caseNo,
      type: "complaint",
      cat: complaint.category,
      desc: complaint.description,
      driver: isSettlement ? "—" : attribution?.driverName ?? "未歸屬",
      driverId: isSettlement ? "" : attribution?.driverId ?? "",
      severity: complaint.severity,
      // Fleet responsibility can only be asserted when a real driver/fleet
      // attribution is resolved. An unresolved ordinary complaint is NOT a
      // determined platform business responsibility -- it is simply not
      // attributable to any specific fleet right now -- but is projected
      // onto the existing "platform" wire value anyway (see the field
      // comment above), since that is the only value the current Fleet/Ops
      // consumer contract has for read-only, no-fleet-reply handling.
      responsibility: isSettlement
        ? "shared"
        : attribution
          ? "fleet"
          : "platform",
      fleetPartnerId: isSettlement
        ? (complaint.fleetPartnerId ?? "")
        : attribution?.fleetPartnerId ?? "",
      status: complaint.status,
      slaDueAt: complaint.slaDueAt,
      slaBreachedAt: complaint.slaBreach ? complaint.updatedAt : null,
      slaBreach: complaint.slaBreach,
      slaTone: isClosed
        ? "neutral"
        : complaint.slaBreach
          ? "danger"
          : "success",
      slaLabel: isClosed
        ? "closed"
        : complaint.slaBreach
          ? "SLA breached"
          : "on track",
      reopenCount: complaint.reopenCount ?? 0,
      relatedOrder: complaint.relatedOrderId,
      relatedCall: complaint.relatedCallId,
      // A resolved fleet attribution says nothing about who is actually
      // assigned to work the case; project the real assigneeId honestly
      // rather than inventing a named owner when none is assigned.
      assignee: complaint.assigneeId || "—",
      openedAt: complaint.createdAt,
      updatedAt: complaint.updatedAt,
      actionDescriptor: {
        action: "respond",
        enabled: !isClosed,
        ...(isClosed ? { disabledReasonCode: "case_closed" } : {}),
        riskLevel: "medium",
      },
    };
  }

  async listCases(fleetPartnerId: string): Promise<FleetCaseItem[]> {
    await this.complaintService?.refreshSettlementCases?.();
    const result: FleetCaseItem[] = [];
    const seen = new Set<string>();

    for (const item of this.cases.values()) {
      if (seen.has(item.id)) continue;
      if (this.isFleetScopeMatch(item.fleetPartnerId, fleetPartnerId)) {
        seen.add(item.id);
        result.push({ ...item });
      }
    }

    if (this.complaintService) {
      // Prefer the canonical ordinary-case refresh so a warm instance that
      // never itself created or updated a given complaint still lists it
      // (same guarantee refreshSettlementCases already gives settlement
      // cases above). A real refresh failure here must propagate, not be
      // disguised as "no ordinary complaints exist".
      const complaints =
        typeof this.complaintService.listComplaintCasesForFleetOps ===
        "function"
          ? await this.complaintService.listComplaintCasesForFleetOps()
          : typeof this.complaintService.listComplaintCases === "function"
            ? this.complaintService.listComplaintCases()
            : [];
      for (const c of complaints) {
        if (seen.has(c.caseNo)) continue;
        const mapped = await this.mapComplaintToFleetCase(c);
        // Ordinary complaints must be isolated to their actually
        // attributed fleet, same as settlement_dispute cases above; an
        // unattributed or foreign-fleet complaint must not leak into
        // this list.
        if (!this.isFleetScopeMatch(mapped.fleetPartnerId, fleetPartnerId))
          continue;
        seen.add(c.caseNo);
        result.push(mapped);
      }
    }

    return result;
  }

  async getCaseDetail(
    fleetPartnerId: string,
    caseId: string,
  ): Promise<{
    caseDetail: FleetCaseItem;
    attachments: FleetCaseAttachmentRecord[];
  }> {
    await this.complaintService?.refreshSettlementCases?.();
    const caseItem = await this.resolveCase(caseId);
    this.assertFleetScope(caseItem, fleetPartnerId);

    await this.loadStoredAttachments(caseItem.id);
    // Resolve attachments
    const caseAttachments: FleetCaseAttachmentRecord[] = [];
    for (const att of this.attachments.values()) {
      if (att.caseId === caseItem.id || att.caseId === caseItem.caseNo) {
        if (this.isFleetScopeMatch(att.fleetPartnerId, fleetPartnerId)) {
          caseAttachments.push({ ...att });
        }
      }
    }

    // Closed cases only expose done attachments
    const effectiveAttachments =
      caseItem.status === "closed"
        ? caseAttachments.filter((a) => a.state === "done")
        : caseAttachments;

    return {
      caseDetail: { ...caseItem },
      attachments: effectiveAttachments,
    };
  }

  async getCaseTimeline(
    fleetPartnerId: string,
    caseId: string,
  ): Promise<FleetCaseTimelineEvent[]> {
    await this.complaintService?.refreshSettlementCases?.();
    const caseItem = await this.resolveCase(caseId);
    this.assertFleetScope(caseItem, fleetPartnerId);

    const tl =
      this.timelines.get(caseItem.id) ||
      this.timelines.get(caseItem.caseNo) ||
      [];

    // A parsed attachment manifest is only ever trusted once it is tied to
    // this same case's real confirmed stored attachments (see
    // splitAttachmentManifest). Only load them when some note actually
    // contains the marker: most notes have no attachments at all, and
    // this stays a no-op for callers whose storage is not configured.
    let attachmentsLoaded = false;
    const verifyAttachment = (attachmentId: string): boolean => {
      const att = this.attachments.get(attachmentId);
      return (
        !!att &&
        att.state === "done" &&
        (att.caseId === caseItem.id || att.caseId === caseItem.caseNo) &&
        this.isFleetScopeMatch(att.fleetPartnerId, fleetPartnerId)
      );
    };

    // If complaint service has entries, synthesize any notes. Prefers the
    // canonical (repository-backed) Ops readback so a case created or
    // updated on a different warm instance still surfaces its real
    // timeline here.
    if (this.complaintService) {
      try {
        const compTl =
          typeof this.complaintService.getComplaintTimelineForOps ===
          "function"
            ? await this.complaintService.getComplaintTimelineForOps(
                caseItem.caseNo,
                { includeAttachmentManifest: true },
              )
            : this.complaintService.getComplaintTimeline(caseItem.caseNo, {
                includeAttachmentManifest: true,
              });
        if (
          !attachmentsLoaded &&
          compTl.some((entry) =>
            entry.note.includes(FLEET_REPLY_ATTACHMENT_MANIFEST_MARKER),
          )
        ) {
          attachmentsLoaded = true;
          await this.loadStoredAttachments(caseItem.id);
        }
        for (const entry of compTl) {
          const exists = tl.some((t) => t.entryId === entry.entryId);
          if (
            !exists &&
            (entry.action === "case_note_added" ||
              (caseItem.cat === "settlement_dispute" &&
                entry.action === "case_created"))
          ) {
            const isFleetReply = entry.note.includes("[車行回覆");
            const { body, attachments } = splitAttachmentManifest(
              entry.note,
              verifyAttachment,
            );
            tl.push({
              entryId: entry.entryId,
              caseId: caseItem.id,
              at: entry.createdAt,
              tone: isFleetReply ? "accent" : "warn",
              t:
                entry.action === "case_created"
                  ? "對帳爭議已建立"
                  : isFleetReply
                    ? "車行回覆"
                    : "評論",
              // The canonical ComplaintTimelineEntry contract has no
              // per-note actor field; the case's real current assignee is
              // the same honest signal already used as this action's audit
              // actorId (see addComplaintCaseNoteInternal). Project that
              // instead of inventing a named ops owner.
              actor: isFleetReply ? "車行負責人" : caseItem.assignee,
              actorRealm: isFleetReply ? "tenant" : "ops",
              body,
              ...(attachments.length ? { attachments } : {}),
            });
          }
        }
      } catch (error) {
        if (!(error instanceof ApiRequestError && error.code === "NOT_FOUND")) {
          // This case has no corresponding ComplaintService record (e.g. a
          // fleet seed case) is the only expected absence here; anything
          // else is a genuine canonical-read failure and must not be
          // silently returned as a (possibly incomplete) success.
          throw error;
        }
      }
    }

    // Sort chronologically
    return [...tl].sort((a, b) => a.at.localeCompare(b.at));
  }

  async submitReply(
    fleetPartnerId: string,
    caseId: string,
    actorId: string,
    command: SubmitFleetCaseReplyCommand,
    requestId?: string,
  ): Promise<FleetCaseReplyRecord> {
    await this.complaintService?.refreshSettlementCases?.();
    const caseItem = await this.resolveCase(caseId);
    this.assertFleetScope(caseItem, fleetPartnerId);

    // Check responsibility: platform owned cannot be replied to by fleet
    if (caseItem.responsibility === "platform") {
      throw new ApiRequestError(
        HttpStatus.CONFLICT,
        "CASE_PLATFORM_OWNED",
        "案件責任歸屬 platform，唯讀檢視；回覆按鈕停用，車行無法處理。",
        { caseId, responsibility: caseItem.responsibility },
      );
    }

    // Check closed status: closed cannot be replied to
    if (caseItem.status === "closed") {
      throw new ApiRequestError(
        HttpStatus.CONFLICT,
        "CASE_CLOSED_NO_REPLY",
        "案件已 closed 仍嘗試回覆：需請 Ops 執行 reopen 才能再次回覆。",
        { caseId, status: caseItem.status },
      );
    }

    const content = command.content?.trim();
    if (!content) {
      throw new ApiRequestError(
        HttpStatus.BAD_REQUEST,
        "VALIDATION_ERROR",
        "回覆內容不得為空。",
      );
    }

    // Idempotency check: deduplicate if same idempotency-key resubmitted
    const idempotencyKey = command.idempotencyKey?.trim() || "";
    if (idempotencyKey) {
      const dedupKey = `${caseItem.id}:${idempotencyKey}`;
      const existing = this.repliesByIdempotencyKey.get(dedupKey);
      if (existing) {
        // Return existing receipt without creating a new timeline entry
        return {
          ...existing,
          deduplicated: true,
        };
      }
    }

    const pendingKey =
      caseItem.cat === "settlement_dispute" && idempotencyKey
        ? `${caseItem.id}:${idempotencyKey}`
        : null;
    if (pendingKey) {
      const pending = this.pendingSettlementReplies.get(pendingKey);
      if (pending) return { ...(await pending), deduplicated: true };
    }
    const reply = this.createReply(
      fleetPartnerId,
      caseItem,
      actorId,
      command,
      content,
      idempotencyKey,
      requestId,
    );
    if (!pendingKey) return reply;
    this.pendingSettlementReplies.set(pendingKey, reply);
    try {
      return await reply;
    } finally {
      if (this.pendingSettlementReplies.get(pendingKey) === reply) {
        this.pendingSettlementReplies.delete(pendingKey);
      }
    }
  }

  private async createReply(
    fleetPartnerId: string,
    caseItem: FleetCaseItem,
    actorId: string,
    command: SubmitFleetCaseReplyCommand,
    content: string,
    idempotencyKey: string,
    requestId?: string,
  ): Promise<FleetCaseReplyRecord> {
    const now = new Date().toISOString();
    const replyId = `reply-${randomUUID()}`;

    // Resolve attachments for timeline
    const resolvedAttachments: FleetCaseTimelineAttachment[] = [];
    if (command.attachmentIds?.length) {
      await this.loadStoredAttachments(caseItem.id);
      for (const attId of command.attachmentIds) {
        const att = this.attachments.get(attId);
        if (
          !att ||
          att.state !== "done" ||
          (att.caseId !== caseItem.id && att.caseId !== caseItem.caseNo) ||
          !this.isFleetScopeMatch(att.fleetPartnerId, fleetPartnerId)
        )
          throw new ApiRequestError(
            403,
            "FLEET_SCOPE_DENIED",
            "Reply attachment is outside this case scope.",
          );
        await this.storage.read(att.objectKey, att);
        {
          resolvedAttachments.push({
            attachmentId: att.attachmentId,
            name: att.name,
            size: att.size,
            fileSize: att.fileSize,
          });
        }
      }
    }

    const replyRecord: FleetCaseReplyRecord = {
      replyId,
      caseId: caseItem.id,
      fleetPartnerId,
      idempotencyKey: idempotencyKey || replyId,
      content,
      actorId,
      repliedAt: now,
      attachments: resolvedAttachments,
      deduplicated: false,
    };

    const attsNote = resolvedAttachments.length
      ? ` (附件: ${resolvedAttachments.map((a) => a.name).join(", ")})`
      : "";
    // The attachment manifest is embedded (not just human-readable names) so
    // another already-warm instance, which only has this committed
    // Complaint note to read back, can still reconstruct the same
    // structured attachment relation for this reply event.
    const notePayload = appendAttachmentManifest(
      `[車行回覆 · ${fleetPartnerId}] ${content}${attsNote}`,
      resolvedAttachments,
    );
    let settlementTimelineEntryId: string | undefined;
    let ordinaryReplyTimelineEntryId: string | undefined;
    if (caseItem.cat === "settlement_dispute") {
      if (!this.complaintService) {
        throw new ApiRequestError(
          HttpStatus.SERVICE_UNAVAILABLE,
          "SETTLEMENT_REPLY_UNAVAILABLE",
          "Settlement case replies require complaint persistence.",
        );
      }
      this.complaintService.addFleetSettlementCaseNote(
        caseItem.caseNo,
        { note: notePayload },
        requestId,
      );
      settlementTimelineEntryId = this.complaintService
        .getComplaintTimeline(caseItem.caseNo)
        .at(-1)?.entryId;
      await this.complaintService.awaitSettlementPersistence(caseItem.caseNo);
    } else if (this.complaintService) {
      // Synchronize to authoritative ComplaintService timeline before this
      // reply is published: a failed canonical write must not leave a
      // deduplicated-but-never-recorded receipt behind for an idempotency
      // retry to find.
      try {
        await this.complaintService.addComplaintCaseNote(
          caseItem.caseNo,
          { note: notePayload },
          requestId,
          {
            captureAudit: true,
            ...(idempotencyKey
              ? {
                  commandIdentity: {
                    scope: `fleet:${fleetPartnerId}:complaint:${caseItem.caseNo}:reply`,
                    key: idempotencyKey,
                  },
                }
              : {}),
          },
        );
        await this.complaintService.awaitSettlementPersistence(caseItem.caseNo);
        // Keep the local timeline entry's id aligned with the canonical
        // Complaint note's entryId so a later reload on this same instance
        // (or a fresh read on another warm instance) recognizes it as the
        // same event instead of duplicating it.
        ordinaryReplyTimelineEntryId = this.complaintService
          .getComplaintTimeline(caseItem.caseNo)
          .at(-1)?.entryId;
      } catch (error) {
        if (error instanceof ApiRequestError && error.code === "NOT_FOUND") {
          // ComplaintService has no record of this caseNo; the fleet-side
          // timeline below already holds the authoritative record.
        } else {
          // A real canonical write failure must not be swallowed as success.
          throw error;
        }
      }
    }

    // Publish a reply receipt only after its CRM note has committed (or is
    // known absent from ComplaintService).
    this.replies.set(replyId, replyRecord);
    if (idempotencyKey) {
      this.repliesByIdempotencyKey.set(
        `${caseItem.id}:${idempotencyKey}`,
        replyRecord,
      );
    }

    // Append to timeline
    const timelineEntry: FleetCaseTimelineEvent = {
      entryId:
        settlementTimelineEntryId ?? ordinaryReplyTimelineEntryId ?? `tl-${replyId}`,
      caseId: caseItem.id,
      at: now,
      tone: "accent",
      t: "車行回覆",
      actor: `${actorId} (${fleetPartnerId})`,
      actorRealm: "tenant",
      body: content,
      ...(resolvedAttachments.length > 0
        ? { attachments: resolvedAttachments }
        : {}),
    };

    const currentTl =
      this.timelines.get(caseItem.id) ||
      this.timelines.get(caseItem.caseNo) ||
      [];
    const updatedTl = [...currentTl, timelineEntry];
    this.timelines.set(caseItem.id, updatedTl);
    this.timelines.set(caseItem.caseNo, updatedTl);

    // Record audit
    if (this.auditNotificationService) {
      this.auditNotificationService.recordAuditLog({
        actorId,
        actorType: "partner_api_key",
        tenantId: null,
        moduleName: "fleet-partner",
        actionName: "submit_fleet_case_reply",
        resourceType: "fleet_case",
        resourceId: caseItem.id,
        newValuesSummary: {
          replyId,
          content,
          attachmentCount: resolvedAttachments.length,
        },
      });
    }

    return replyRecord;
  }

  private async loadStoredAttachments(caseId: string) {
    const records =
      await this.storage.getCaseRecords<FleetCaseAttachmentRecord>(caseId);
    for (const record of records)
      this.attachments.set(record.attachmentId, record);
  }

  async uploadAttachmentContent(
    fleetPartnerId: string,
    caseId: string,
    objectKey: string,
    stream: AsyncIterable<Uint8Array>,
    contentType: string,
  ) {
    await this.complaintService?.refreshSettlementCases?.();
    const caseItem = await this.resolveCase(caseId);
    this.assertFleetScope(caseItem, fleetPartnerId);
    if (caseItem.status === "closed")
      throw new ApiRequestError(
        409,
        "CASE_CLOSED_NO_REPLY",
        "Closed cases are read-only.",
      );
    const intent = await this.storage.intent(
      objectKey,
      "case",
      fleetPartnerId,
      caseItem.id,
    );
    return this.storage.upload(intent, stream, contentType);
  }

  async downloadAttachmentForReview(caseId: string, attachmentId: string) {
    await this.complaintService?.refreshSettlementCases?.();
    const caseItem = await this.resolveCase(caseId);
    await this.loadStoredAttachments(caseItem.id);
    const attachment = this.attachments.get(attachmentId);
    if (
      !attachment ||
      (attachment.caseId !== caseItem.id &&
        attachment.caseId !== caseItem.caseNo) ||
      !this.isFleetScopeMatch(
        attachment.fleetPartnerId,
        caseItem.fleetPartnerId,
      )
    )
      throw new ApiRequestError(
        404,
        "ATTACHMENT_NOT_FOUND",
        "Attachment not found.",
      );
    const { bytes: fileContent } = await this.storage.read(
      attachment.objectKey,
      attachment,
    );
    return { attachment, fileContent };
  }

  async createAttachmentUploadUrl(
    fleetPartnerId: string,
    caseId: string,
    actorId: string,
    command: CreateCaseAttachmentUploadUrlCommand,
  ): Promise<{
    attachmentId: string;
    objectKey: string;
    uploadUrl: string;
    expiresAt: string;
    method: string;
    headers: Record<string, string>;
  }> {
    await this.complaintService?.refreshSettlementCases?.();
    const caseItem = await this.resolveCase(caseId);
    this.assertFleetScope(caseItem, fleetPartnerId);

    // Closed cases cannot upload new attachments
    if (caseItem.status === "closed") {
      throw new ApiRequestError(
        HttpStatus.CONFLICT,
        "CASE_CLOSED_NO_REPLY",
        "案件已 closed，附件唯讀，僅授權回讀，不可再上傳或重試。",
        { caseId },
      );
    }

    if (command.fileSize > MAX_ATTACHMENT_SIZE) {
      throw new ApiRequestError(
        HttpStatus.BAD_REQUEST,
        "CASE_ATTACHMENT_TOO_LARGE",
        "附件超過大小限制（上限 10 MiB），請壓縮或分件上傳。",
        { fileSize: command.fileSize, maxSize: MAX_ATTACHMENT_SIZE },
      );
    }

    const attachmentId = `att-${randomUUID()}`;
    const sanitizedName = command.fileName
      .trim()
      .replace(/[^a-zA-Z0-9._-]+/g, "-");
    const objectKey = `fleet-partner/${fleetPartnerId}/cases/${caseItem.id}/${attachmentId}-${sanitizedName}`;
    const expiresAt = new Date(Date.now() + 15 * 60 * 1000).toISOString();

    await this.storage.createIntent({
      family: "case",
      attachmentId,
      parentId: caseItem.id,
      fleetPartnerId,
      objectKey,
      fileName: command.fileName.trim(),
      fileSize: command.fileSize,
      contentType: command.contentType.trim(),
      expiresAt,
    });

    return {
      attachmentId,
      objectKey,
      uploadUrl: `/api/fleet-partner/cases/${encodeURIComponent(caseItem.id)}/attachments/content?objectKey=${encodeURIComponent(objectKey)}`,
      expiresAt,
      method: "PUT",
      headers: { "content-type": "application/octet-stream" },
    };
  }

  async confirmAttachmentUpload(
    fleetPartnerId: string,
    caseId: string,
    actorId: string,
    command: ConfirmCaseAttachmentUploadCommand,
  ): Promise<FleetCaseAttachmentRecord> {
    await this.complaintService?.refreshSettlementCases?.();
    const caseItem = await this.resolveCase(caseId);
    this.assertFleetScope(caseItem, fleetPartnerId);

    if (caseItem.status === "closed") {
      throw new ApiRequestError(
        HttpStatus.CONFLICT,
        "CASE_CLOSED_NO_REPLY",
        "案件已 closed，無法確認新附件。",
        { caseId },
      );
    }

    const uploadIntent = await this.storage.intent(
      command.objectKey,
      "case",
      fleetPartnerId,
      caseItem.id,
    );
    if (
      uploadIntent.attachmentId !== command.attachmentId ||
      uploadIntent.fileName !== command.fileName.trim() ||
      uploadIntent.fileSize !== command.fileSize ||
      uploadIntent.contentType !== command.contentType.trim()
    ) {
      throw new ApiRequestError(
        409,
        "UPLOAD_URL_INVALID",
        "Confirmation metadata does not match the upload intent.",
      );
    }
    await this.storage.read(command.objectKey, command);

    const record: FleetCaseAttachmentRecord = {
      attachmentId: command.attachmentId,
      caseId: caseItem.id,
      fleetPartnerId,
      name: command.fileName.trim(),
      size: formatFileSize(command.fileSize),
      fileSize: command.fileSize,
      contentType: command.contentType.trim(),
      state: "done",
      uploadedAt: new Date().toISOString(),
      uploadedBy: actorId,
      objectKey: command.objectKey,
    };

    const saved = await this.storage.saveCaseRecord(caseItem.id, record);
    this.attachments.set(saved.attachmentId, saved);
    return saved;
  }

  async getAttachmentReadUrl(
    fleetPartnerId: string,
    caseId: string,
    attachmentId: string,
  ): Promise<{
    attachmentId: string;
    name: string;
    downloadUrl: string;
    expiresAt: string;
    authorized: boolean;
  }> {
    await this.complaintService?.refreshSettlementCases?.();
    const caseItem = await this.resolveCase(caseId);
    this.assertFleetScope(caseItem, fleetPartnerId);

    await this.loadStoredAttachments(caseItem.id);
    const att = this.attachments.get(attachmentId);
    if (
      !att ||
      (att.caseId !== caseItem.id && att.caseId !== caseItem.caseNo)
    ) {
      throw new ApiRequestError(
        HttpStatus.NOT_FOUND,
        "ATTACHMENT_NOT_FOUND",
        "附件不存在或已被移除。",
        { attachmentId },
      );
    }

    // Authorized readback: issue real cryptographic HMAC signature with 1-hour expiry
    const expiryTimestamp = Date.now() + 60 * 60 * 1000;
    const signature = signAttachmentToken(
      fleetPartnerId,
      caseItem.id,
      attachmentId,
      expiryTimestamp,
    );

    const downloadUrl = `/api/fleet-partner/cases/${caseItem.id}/attachments/${attachmentId}/download?expiresAt=${expiryTimestamp}&sig=${signature}`;

    return {
      attachmentId: att.attachmentId,
      name: att.name,
      downloadUrl,
      expiresAt: new Date(expiryTimestamp).toISOString(),
      authorized: true,
    };
  }

  async verifyAndGetAttachmentForDownload(
    fleetPartnerId: string,
    caseId: string,
    attachmentId: string,
    expiresAt: number,
    signature: string,
  ): Promise<{
    attachment: FleetCaseAttachmentRecord;
    fileContent: Buffer;
  }> {
    await this.complaintService?.refreshSettlementCases?.();
    const caseItem = await this.resolveCase(caseId);
    this.assertFleetScope(caseItem, fleetPartnerId);

    const valid = verifyAttachmentToken(
      fleetPartnerId,
      caseItem.id,
      attachmentId,
      expiresAt,
      signature,
    );

    if (!valid) {
      throw new ApiRequestError(
        HttpStatus.FORBIDDEN,
        "INVALID_DOWNLOAD_SIGNATURE",
        "附件下載簽章無效或已過期，請重新取得授權下載連結。",
        { attachmentId, caseId },
      );
    }

    await this.loadStoredAttachments(caseItem.id);
    const att = this.attachments.get(attachmentId);
    if (
      !att ||
      (att.caseId !== caseItem.id && att.caseId !== caseItem.caseNo) ||
      !this.isFleetScopeMatch(att.fleetPartnerId, fleetPartnerId)
    ) {
      throw new ApiRequestError(
        HttpStatus.NOT_FOUND,
        "ATTACHMENT_NOT_FOUND",
        "附件檔案不存在。",
        { attachmentId },
      );
    }

    const { bytes: fileContent } = await this.storage.read(att.objectKey, att);

    return {
      attachment: att,
      fileContent,
    };
  }
}
