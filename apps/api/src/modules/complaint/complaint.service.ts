import { randomUUID } from "node:crypto";

import { HttpStatus, Injectable, OnModuleInit, Optional } from "@nestjs/common";

import type {
  AuditLogRecord,
  ComplaintCaseRecord,
  ComplaintCaseStatus,
  ComplaintCategory,
  ComplaintTimelineEntry,
  CreateComplaintCaseCommand,
  ReopenComplaintCaseCommand,
  ResolveComplaintCaseCommand,
} from "@drts/contracts";

import { ApiRequestError } from "../../common/api-envelope";
import { AuditNotificationService } from "../audit-notification/audit-notification.service";
import { ComplaintRepository } from "./complaint.repository";

const COMPLAINT_CATEGORY_VALUES = [
  "late_arrival",
  "no_arrival",
  "driver_service",
  "vehicle_condition",
  "route_issue",
  "fare_dispute",
  "safety_concern",
  "lost_and_found",
  "other",
] as const;

const DEFAULT_SLA_HOURS_BY_CATEGORY: Record<ComplaintCategory, number> = {
  late_arrival: 24,
  no_arrival: 24,
  driver_service: 48,
  vehicle_condition: 48,
  route_issue: 48,
  fare_dispute: 48,
  safety_concern: 4,
  lost_and_found: 72,
  other: 48,
};

const TIMELINE_ACTIONS = {
  created: "case_created",
  reopened: "case_reopened",
  slaBreached: "sla_breached",
  resolved: "case_resolved",
  closed: "case_closed",
} as const;

@Injectable()
export class ComplaintService implements OnModuleInit {
  private caseSequence = 1;

  private complaintCases: ComplaintCaseRecord[] = [];

  private complaintTimelines = new Map<string, ComplaintTimelineEntry[]>();

  constructor(
    private readonly auditNotificationService: AuditNotificationService,
    @Optional() private readonly complaintRepository?: ComplaintRepository,
  ) {}

  async onModuleInit() {
    if (!this.complaintRepository) {
      return;
    }

    try {
      const persistedState = await this.complaintRepository.loadState();
      if (
        persistedState.complaintCases.length === 0 &&
        persistedState.complaintTimelines.length === 0
      ) {
        return;
      }

      this.complaintCases = persistedState.complaintCases.map((complaintCase) =>
        this.cloneComplaintCase(complaintCase),
      );
      this.complaintTimelines = this.buildTimelineMap(
        persistedState.complaintTimelines,
      );
      this.caseSequence = this.deriveNextCaseSequence(
        persistedState.complaintCases,
      );
    } catch (error) {
      this.complaintRepository.reportPersistenceFailure(error, "module init");
    }
  }

  createComplaintCase(command: CreateComplaintCaseCommand, requestId?: string) {
    this.assertValidCategory(command.category);
    this.assertNonBlank(command.description, "description");

    const now = new Date();
    const createdAt = now.toISOString();
    const caseNo = this.nextCaseNo(now);
    const complaintCase: ComplaintCaseRecord = {
      caseNo,
      caseSource: command.caseSource,
      relatedOrderId: command.relatedOrderId ?? null,
      relatedCallId: command.relatedCallId ?? null,
      category: command.category,
      severity: command.severity,
      description: command.description,
      status: "new",
      slaDueAt: this.calculateSlaDueAt(command.category, command.severity, now),
      slaBreach: false,
      resolutionCode: null,
      closingNote: null,
      createdAt,
      updatedAt: createdAt,
    };

    const createdEntry = this.createTimelineEntry(
      caseNo,
      TIMELINE_ACTIONS.created,
      `Created ${command.category} complaint from ${command.caseSource}.`,
      createdAt,
    );

    this.complaintCases = [complaintCase, ...this.complaintCases];
    this.complaintTimelines.set(caseNo, [createdEntry]);
    this.persistChanges(
      {
        complaintCases: [complaintCase],
        complaintTimelines: [createdEntry],
      },
      "create_complaint_case",
    );
    this.recordAudit(
      {
        actorId: null,
        actorType: "system",
        tenantId: null,
        moduleName: "complaint",
        actionName: "create_complaint_case",
        resourceType: "complaint_case",
        resourceId: caseNo,
        newValuesSummary: {
          caseSource: command.caseSource,
          category: command.category,
          severity: command.severity,
          status: complaintCase.status,
          relatedOrderId: complaintCase.relatedOrderId,
          relatedCallId: complaintCase.relatedCallId,
        },
      },
      requestId,
    );

    return this.cloneComplaintCase(complaintCase);
  }

  listComplaintCases() {
    return this.complaintCases.map((complaintCase) =>
      this.cloneComplaintCase(complaintCase),
    );
  }

  getComplaintCase(caseNo: string) {
    return this.cloneComplaintCase(this.requireComplaintCase(caseNo));
  }

  getComplaintTimeline(caseNo: string) {
    this.requireComplaintCase(caseNo);
    return (this.complaintTimelines.get(caseNo) ?? []).map((entry) => ({
      ...entry,
    }));
  }

  resolveComplaintCase(
    caseNo: string,
    command: ResolveComplaintCaseCommand,
    requestId?: string,
  ) {
    this.assertNonBlank(command.resolutionCode, "resolutionCode");
    this.assertNonBlank(command.closingNote, "closingNote");

    const complaintCase = this.requireComplaintCase(caseNo);
    if (complaintCase.status === "resolved") {
      return this.cloneComplaintCase(complaintCase);
    }

    const updated = {
      ...complaintCase,
      status: "resolved" as ComplaintCaseStatus,
      resolutionCode: command.resolutionCode,
      closingNote: command.closingNote,
      updatedAt: new Date().toISOString(),
    };
    this.replaceComplaintCase(updated);
    const timelineEntry = this.appendTimelineEntry(
      caseNo,
      TIMELINE_ACTIONS.resolved,
      command.closingNote,
    );
    this.persistChanges(
      {
        complaintCases: [updated],
        complaintTimelines: [timelineEntry],
      },
      "resolve_complaint_case",
    );
    this.recordAudit(
      {
        actorId: null,
        actorType: "ops_user",
        tenantId: null,
        moduleName: "complaint",
        actionName: "resolve_complaint_case",
        resourceType: "complaint_case",
        resourceId: caseNo,
        newValuesSummary: {
          status: updated.status,
          resolutionCode: command.resolutionCode,
        },
      },
      requestId,
    );

    return this.cloneComplaintCase(updated);
  }

  closeComplaintCase(
    caseNo: string,
    command: ResolveComplaintCaseCommand,
    requestId?: string,
  ) {
    this.assertNonBlank(command.resolutionCode, "resolutionCode");
    this.assertNonBlank(command.closingNote, "closingNote");

    const complaintCase = this.requireComplaintCase(caseNo);
    if (complaintCase.status === "closed") {
      return this.cloneComplaintCase(complaintCase);
    }

    const updated = {
      ...complaintCase,
      status: "closed" as ComplaintCaseStatus,
      resolutionCode: command.resolutionCode,
      closingNote: command.closingNote,
      updatedAt: new Date().toISOString(),
    };
    this.replaceComplaintCase(updated);
    const timelineEntry = this.appendTimelineEntry(
      caseNo,
      TIMELINE_ACTIONS.closed,
      command.closingNote,
    );
    this.persistChanges(
      {
        complaintCases: [updated],
        complaintTimelines: [timelineEntry],
      },
      "close_complaint_case",
    );
    this.recordAudit(
      {
        actorId: null,
        actorType: "ops_user",
        tenantId: null,
        moduleName: "complaint",
        actionName: "close_complaint_case",
        resourceType: "complaint_case",
        resourceId: caseNo,
        newValuesSummary: {
          status: updated.status,
          resolutionCode: command.resolutionCode,
        },
      },
      requestId,
    );

    return this.cloneComplaintCase(updated);
  }

  reopenComplaintCase(
    caseNo: string,
    command: ReopenComplaintCaseCommand,
    requestId?: string,
  ) {
    this.assertNonBlank(command.reason, "reason");

    const complaintCase = this.requireComplaintCase(caseNo);
    if (complaintCase.status !== "closed") {
      throw new ApiRequestError(
        HttpStatus.CONFLICT,
        "COMPLAINT_NOT_CLOSED",
        "Only closed complaint cases can be reopened.",
        {
          caseNo,
          currentStatus: complaintCase.status,
        },
      );
    }

    const updated = {
      ...complaintCase,
      status: "reopened" as ComplaintCaseStatus,
      updatedAt: new Date().toISOString(),
    };
    this.replaceComplaintCase(updated);
    const timelineEntry = this.appendTimelineEntry(
      caseNo,
      TIMELINE_ACTIONS.reopened,
      command.reason,
    );
    this.persistChanges(
      {
        complaintCases: [updated],
        complaintTimelines: [timelineEntry],
      },
      "reopen_complaint_case",
    );
    this.recordAudit(
      {
        actorId: null,
        actorType: "ops_user",
        tenantId: null,
        moduleName: "complaint",
        actionName: "reopen_complaint_case",
        resourceType: "complaint_case",
        resourceId: caseNo,
        newValuesSummary: {
          status: updated.status,
          reason: command.reason,
        },
      },
      requestId,
    );

    return this.cloneComplaintCase(updated);
  }

  markComplaintSlaBreach(caseNo: string, requestId?: string) {
    const complaintCase = this.requireComplaintCase(caseNo);
    if (complaintCase.slaBreach) {
      return this.cloneComplaintCase(complaintCase);
    }

    const updated = {
      ...complaintCase,
      slaBreach: true,
      updatedAt: new Date().toISOString(),
    };
    this.replaceComplaintCase(updated);
    const timelineEntry = this.appendTimelineEntry(
      caseNo,
      TIMELINE_ACTIONS.slaBreached,
      `SLA breached while case remained ${complaintCase.status}.`,
    );
    this.persistChanges(
      {
        complaintCases: [updated],
        complaintTimelines: [timelineEntry],
      },
      "mark_complaint_sla_breach",
    );
    this.auditNotificationService.recordNotification({
      tenantId: null,
      channel: "ops_notice",
      title: "Complaint SLA breached",
      message: `Complaint ${caseNo} exceeded SLA due at ${complaintCase.slaDueAt}.`,
      status: "unread",
    });
    this.recordAudit(
      {
        actorId: null,
        actorType: "system",
        tenantId: null,
        moduleName: "complaint",
        actionName: "mark_complaint_sla_breach",
        resourceType: "complaint_case",
        resourceId: caseNo,
        newValuesSummary: {
          status: updated.status,
          slaBreach: true,
          slaDueAt: complaintCase.slaDueAt,
        },
      },
      requestId,
    );

    return this.cloneComplaintCase(updated);
  }

  private calculateSlaDueAt(
    category: ComplaintCategory,
    severity: CreateComplaintCaseCommand["severity"],
    createdAt: Date,
  ) {
    const baseHours = DEFAULT_SLA_HOURS_BY_CATEGORY[category] ?? 48;
    const effectiveHours =
      severity === "high" ? Math.max(1, Math.floor(baseHours / 2)) : baseHours;
    return new Date(
      createdAt.getTime() + effectiveHours * 60 * 60 * 1000,
    ).toISOString();
  }

  private nextCaseNo(createdAt: Date) {
    const datePrefix = createdAt.toISOString().slice(0, 10).replaceAll("-", "");
    const sequence = String(this.caseSequence++).padStart(6, "0");
    return `C-${datePrefix}-${sequence}`;
  }

  private deriveNextCaseSequence(
    complaintCases: readonly ComplaintCaseRecord[],
  ) {
    const maxSequence = complaintCases.reduce((currentMax, complaintCase) => {
      const rawSequence = complaintCase.caseNo.split("-").at(-1) ?? "0";
      const parsedSequence = Number.parseInt(rawSequence, 10);
      if (!Number.isInteger(parsedSequence)) {
        return currentMax;
      }
      return Math.max(currentMax, parsedSequence);
    }, 0);

    return maxSequence + 1;
  }

  private buildTimelineMap(timelineEntries: readonly ComplaintTimelineEntry[]) {
    const nextMap = new Map<string, ComplaintTimelineEntry[]>();

    for (const entry of timelineEntries) {
      const existing = nextMap.get(entry.caseNo) ?? [];
      nextMap.set(entry.caseNo, [...existing, { ...entry }]);
    }

    return nextMap;
  }

  private requireComplaintCase(caseNo: string) {
    const complaintCase = this.complaintCases.find(
      (candidate) => candidate.caseNo === caseNo,
    );
    if (!complaintCase) {
      throw new ApiRequestError(
        HttpStatus.NOT_FOUND,
        "NOT_FOUND",
        "Complaint case not found.",
        {
          caseNo,
        },
      );
    }
    return complaintCase;
  }

  private replaceComplaintCase(updated: ComplaintCaseRecord) {
    this.complaintCases = this.complaintCases.map((complaintCase) =>
      complaintCase.caseNo === updated.caseNo ? updated : complaintCase,
    );
  }

  private appendTimelineEntry(
    caseNo: string,
    action: ComplaintTimelineEntry["action"],
    note: string,
    createdAt = new Date().toISOString(),
  ) {
    const currentTimeline = this.complaintTimelines.get(caseNo) ?? [];
    const entry = this.createTimelineEntry(caseNo, action, note, createdAt);
    this.complaintTimelines.set(caseNo, [...currentTimeline, entry]);
    return entry;
  }

  private createTimelineEntry(
    caseNo: string,
    action: ComplaintTimelineEntry["action"],
    note: string,
    createdAt = new Date().toISOString(),
  ): ComplaintTimelineEntry {
    return {
      entryId: `complaint-timeline-${randomUUID()}`,
      caseNo,
      action,
      note,
      createdAt,
    };
  }

  private cloneComplaintCase(complaintCase: ComplaintCaseRecord) {
    return {
      ...complaintCase,
    };
  }

  private persistChanges(
    changes: {
      complaintCases?: readonly ComplaintCaseRecord[];
      complaintTimelines?: readonly ComplaintTimelineEntry[];
    },
    context: string,
  ) {
    if (!this.complaintRepository) {
      return;
    }

    const persistPayload: {
      complaintCases?: ComplaintCaseRecord[];
      complaintTimelines?: ComplaintTimelineEntry[];
    } = {};

    if (changes.complaintCases) {
      persistPayload.complaintCases = changes.complaintCases.map(
        (complaintCase) => this.cloneComplaintCase(complaintCase),
      );
    }

    if (changes.complaintTimelines) {
      persistPayload.complaintTimelines = changes.complaintTimelines.map(
        (entry) => ({ ...entry }),
      );
    }

    void this.complaintRepository
      .persistChanges(persistPayload)
      .catch((error: unknown) => {
        this.complaintRepository!.reportPersistenceFailure(error, context);
      });
  }

  private assertValidCategory(
    category: string,
  ): asserts category is ComplaintCategory {
    if (!COMPLAINT_CATEGORY_VALUES.includes(category as ComplaintCategory)) {
      throw new ApiRequestError(
        HttpStatus.BAD_REQUEST,
        "VALIDATION_ERROR",
        "Invalid complaint category.",
        {
          category,
        },
      );
    }
  }

  private assertNonBlank(value: string, fieldName: string) {
    if (!value.trim()) {
      throw new ApiRequestError(
        HttpStatus.BAD_REQUEST,
        "VALIDATION_ERROR",
        `${fieldName} is required.`,
        {
          field: fieldName,
        },
      );
    }
  }

  private recordAudit(
    input: Omit<AuditLogRecord, "auditId" | "createdAt" | "requestId">,
    requestId?: string,
  ) {
    const auditLogInput: Omit<
      AuditLogRecord,
      "auditId" | "createdAt" | "requestId"
    > & {
      requestId?: string;
    } = { ...input };
    if (requestId) {
      auditLogInput.requestId = requestId;
    }
    this.auditNotificationService.recordAuditLog(auditLogInput);
  }
}
