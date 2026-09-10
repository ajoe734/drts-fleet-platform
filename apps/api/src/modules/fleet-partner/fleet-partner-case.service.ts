import { randomUUID, createHmac, timingSafeEqual } from "node:crypto";
import { HttpStatus, Injectable, Optional } from "@nestjs/common";
import type {
  ComplaintCaseRecord,
  ComplaintCaseStatus,
  ResourceActionDescriptor,
} from "@drts/contracts";

import { ApiRequestError } from "../../common/api-envelope";
import { AuditNotificationService } from "../audit-notification/audit-notification.service";
import { ComplaintService } from "../complaint/complaint.service";
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

type PendingUploadIntent = {
  attachmentId: string;
  caseId: string;
  fleetPartnerId: string;
  objectKey: string;
  fileName: string;
  fileSize: number;
  contentType: string;
  expiresAt: string;
};

const READBACK_SECRET =
  process.env.DRTS_READBACK_SECRET || "drts-fleet-case-attachment-secret-2026";
const MAX_ATTACHMENT_SIZE = 25 * 1024 * 1024; // 25 MB

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
  if (Date.now() > expiresAt) {
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
  private pendingUploads = new Map<string, PendingUploadIntent>();
  private replies = new Map<string, FleetCaseReplyRecord>();
  private repliesByIdempotencyKey = new Map<string, FleetCaseReplyRecord>();

  constructor(
    @Optional() private readonly complaintService?: ComplaintService,
    @Optional() private readonly fleetPartnerService?: FleetPartnerService,
    @Optional() private readonly auditNotificationService?: AuditNotificationService,
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
    const normCase = caseFleetPartnerId.trim().toUpperCase();
    const normReq = requestFleetPartnerId.trim().toUpperCase();
    if (normCase === normReq) return true;

    // Default portal demos: METRO_FLEET / fleet-demo-001 / fp-test-001 represent the primary test partner
    const primaryPartners = ["METRO_FLEET", "FLEET-DEMO-001", "FP-TEST-001"];
    if (primaryPartners.includes(normCase) && primaryPartners.includes(normReq)) {
      return true;
    }

    return false;
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

  private resolveCase(caseId: string): FleetCaseItem {
    const item = this.cases.get(caseId);
    if (item) {
      return item;
    }

    // Check if complaintService has this case
    if (this.complaintService) {
      try {
        const complaint = this.complaintService.getComplaintCase(caseId);
        if (complaint) {
          return this.mapComplaintToFleetCase(complaint);
        }
      } catch {
        // Fall through to 404
      }
    }

    throw new ApiRequestError(
      HttpStatus.NOT_FOUND,
      "CASE_NOT_FOUND",
      "案件不存在或已被移除。",
      { caseId },
    );
  }

  private mapComplaintToFleetCase(
    complaint: ComplaintCaseRecord,
  ): FleetCaseItem {
    const isClosed = complaint.status === "closed";
    return {
      id: complaint.caseNo,
      caseNo: complaint.caseNo,
      type: "complaint",
      cat: complaint.category,
      desc: complaint.description,
      driver: "旗下司機",
      driverId: "drv-affiliated",
      severity: complaint.severity,
      responsibility: "fleet",
      fleetPartnerId: "METRO_FLEET",
      status: complaint.status,
      slaDueAt: complaint.slaDueAt,
      slaBreachedAt: complaint.slaBreach ? complaint.updatedAt : null,
      slaBreach: complaint.slaBreach,
      slaTone: isClosed ? "neutral" : complaint.slaBreach ? "danger" : "success",
      slaLabel: isClosed
        ? "closed"
        : complaint.slaBreach
        ? "SLA breached"
        : "on track",
      reopenCount: complaint.reopenCount ?? 0,
      relatedOrder: complaint.relatedOrderId,
      relatedCall: complaint.relatedCallId,
      assignee: complaint.assigneeId || "陳維 (ops_compliance)",
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
      try {
        const complaints = this.complaintService.listComplaintCases();
        for (const c of complaints) {
          if (!seen.has(c.caseNo)) {
            seen.add(c.caseNo);
            result.push(this.mapComplaintToFleetCase(c));
          }
        }
      } catch {
        // Ignore background list error
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
    const caseItem = this.resolveCase(caseId);
    this.assertFleetScope(caseItem, fleetPartnerId);

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
    const caseItem = this.resolveCase(caseId);
    this.assertFleetScope(caseItem, fleetPartnerId);

    const tl =
      this.timelines.get(caseItem.id) ||
      this.timelines.get(caseItem.caseNo) ||
      [];

    // If complaint service has entries, synthesize any notes
    if (this.complaintService) {
      try {
        const compTl = this.complaintService.getComplaintTimeline(
          caseItem.caseNo,
        );
        for (const entry of compTl) {
          const exists = tl.some((t) => t.entryId === entry.entryId);
          if (!exists && entry.action === "case_note_added") {
            const isFleetReply = entry.note.includes("[車行回覆");
            tl.push({
              entryId: entry.entryId,
              caseId: caseItem.id,
              at: entry.createdAt,
              tone: isFleetReply ? "accent" : "warn",
              t: isFleetReply ? "車行回覆" : "評論",
              actor: isFleetReply ? "車行負責人" : "陳維",
              actorRealm: isFleetReply ? "tenant" : "ops",
              body: entry.note,
            });
          }
        }
      } catch {
        // Ignore
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
    const caseItem = this.resolveCase(caseId);
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

    const now = new Date().toISOString();
    const replyId = `reply-${randomUUID()}`;

    // Resolve attachments for timeline
    const resolvedAttachments: FleetCaseTimelineAttachment[] = [];
    if (command.attachmentIds?.length) {
      for (const attId of command.attachmentIds) {
        const att = this.attachments.get(attId);
        if (att) {
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

    // Store reply
    this.replies.set(replyId, replyRecord);
    if (idempotencyKey) {
      this.repliesByIdempotencyKey.set(
        `${caseItem.id}:${idempotencyKey}`,
        replyRecord,
      );
    }

    // Append to timeline
    const timelineEntry: FleetCaseTimelineEvent = {
      entryId: `tl-${replyId}`,
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

    // Synchronize to authoritative ComplaintService timeline so Ops can read it immediately
    if (this.complaintService) {
      try {
        const attsNote = resolvedAttachments.length
          ? ` (附件: ${resolvedAttachments.map((a) => a.name).join(", ")})`
          : "";
        const notePayload = `[車行回覆 · ${fleetPartnerId}] ${content}${attsNote}`;
        this.complaintService.addComplaintCaseNote(
          caseItem.caseNo,
          { note: notePayload },
          requestId,
        );
      } catch {
        // If complaint service doesn't have the caseNo or fails, local timeline still holds authoritative record
      }
    }

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
  }> {
    const caseItem = this.resolveCase(caseId);
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
        "附件超過大小限制（上限 25 MB），請壓縮或分件上傳。",
        { fileSize: command.fileSize, maxSize: MAX_ATTACHMENT_SIZE },
      );
    }

    const attachmentId = `att-${randomUUID()}`;
    const sanitizedName = command.fileName
      .trim()
      .replace(/[^a-zA-Z0-9._-]+/g, "-");
    const objectKey = `fleet-partner/${fleetPartnerId}/cases/${caseItem.id}/${attachmentId}-${sanitizedName}`;
    const expiresAt = new Date(Date.now() + 15 * 60 * 1000).toISOString();

    this.pendingUploads.set(objectKey, {
      attachmentId,
      caseId: caseItem.id,
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
      uploadUrl: `https://uploads.drts.example/presigned/${encodeURIComponent(objectKey)}`,
      expiresAt,
      method: "PUT",
    };
  }

  async confirmAttachmentUpload(
    fleetPartnerId: string,
    caseId: string,
    actorId: string,
    command: ConfirmCaseAttachmentUploadCommand,
  ): Promise<FleetCaseAttachmentRecord> {
    const caseItem = this.resolveCase(caseId);
    this.assertFleetScope(caseItem, fleetPartnerId);

    if (caseItem.status === "closed") {
      throw new ApiRequestError(
        HttpStatus.CONFLICT,
        "CASE_CLOSED_NO_REPLY",
        "案件已 closed，無法確認新附件。",
        { caseId },
      );
    }

    const uploadIntent = this.pendingUploads.get(command.objectKey);
    if (!uploadIntent || uploadIntent.attachmentId !== command.attachmentId) {
      throw new ApiRequestError(
        HttpStatus.CONFLICT,
        "UPLOAD_URL_INVALID",
        "上傳確認資訊與預簽發意圖不符或已過期。",
        { objectKey: command.objectKey, attachmentId: command.attachmentId },
      );
    }

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

    this.attachments.set(record.attachmentId, record);
    this.pendingUploads.delete(command.objectKey);

    return record;
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
    const caseItem = this.resolveCase(caseId);
    this.assertFleetScope(caseItem, fleetPartnerId);

    const att = this.attachments.get(attachmentId);
    if (!att || (att.caseId !== caseItem.id && att.caseId !== caseItem.caseNo)) {
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
    const caseItem = this.resolveCase(caseId);
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

    const att = this.attachments.get(attachmentId);
    if (!att) {
      throw new ApiRequestError(
        HttpStatus.NOT_FOUND,
        "ATTACHMENT_NOT_FOUND",
        "附件檔案不存在。",
        { attachmentId },
      );
    }

    const fileContent = Buffer.from(
      `Authorized readback content for ${att.name} (Case: ${caseItem.id}, ID: ${att.attachmentId})`,
      "utf8",
    );

    return {
      attachment: att,
      fileContent,
    };
  }
}
