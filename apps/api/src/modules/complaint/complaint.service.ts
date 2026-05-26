import { randomUUID } from "node:crypto";

import { HttpStatus, Injectable, OnModuleInit, Optional } from "@nestjs/common";

import type {
  AddComplaintCaseNoteCommand,
  AssignComplaintCaseCommand,
  AuditLogRecord,
  ComplaintCaseRecord,
  ComplaintCaseListWorkspace,
  ComplaintCaseStatus,
  ComplaintCategory,
  ComplaintExportViewRecord,
  ComplaintResolutionCode,
  ComplaintSlaStatus,
  ComplaintTimelineEntry,
  CrossAppResourceLink,
  CreateComplaintCaseCommand,
  LinkComplaintToIncidentCommand,
  ReopenComplaintCaseCommand,
  ResourceActionDescriptor,
  ResolveComplaintCaseCommand,
} from "@drts/contracts";

import {
  COMPLAINT_CATEGORY_VALID_RESOLUTIONS,
  COMPLAINT_RESOLUTION_CODES,
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
  assigned: "case_assigned",
  noteAdded: "case_note_added",
  reopened: "case_reopened",
  slaBreached: "sla_breached",
  slaRecalculated: "sla_recalculated",
  resolved: "case_resolved",
  closed: "case_closed",
  escalatedToIncident: "escalated_to_incident",
  incidentLinked: "incident_linked",
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
      relatedIncidentId: null,
      category: command.category,
      severity: command.severity,
      description: command.description,
      assigneeId: null,
      status: "new",
      slaStatus: "within_sla",
      slaDueAt: this.calculateSlaDueAt(command.category, command.severity, now),
      slaBreachedAt: null,
      slaBreach: false,
      reopenCount: 0,
      resolutionCode: null,
      closingNote: null,
      createdAt,
      updatedAt: createdAt,
      availableActions: [],
      resourceLinks: [],
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

  listComplaintCases(): ComplaintCaseListWorkspace {
    const items = this.complaintCases.map((complaintCase) =>
      this.cloneComplaintCase(complaintCase),
    );

    return {
      items,
      refresh: {
        generatedAt: new Date().toISOString(),
        staleAfterMs: 15_000,
        dataFreshness: "fresh",
        source: "live",
      },
      ...(items.length === 0
        ? {
            emptyState: {
              reason: "no_data",
              messageCode: "complaints.empty.no_data",
            },
          }
        : {}),
      pageActions: this.buildPageActions(items),
    };
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

  assignComplaintCase(
    caseNo: string,
    command: AssignComplaintCaseCommand,
    requestId?: string,
  ) {
    this.assertNonBlank(command.assigneeId, "assigneeId");

    const complaintCase = this.requireComplaintCase(caseNo);
    this.assertCaseOpenForAction(complaintCase, "assign");

    const note = this.normalizeNullableText(command.note);
    const updated = {
      ...complaintCase,
      assigneeId: command.assigneeId.trim(),
      status: "assigned" as ComplaintCaseStatus,
      updatedAt: new Date().toISOString(),
    };
    this.replaceComplaintCase(updated);
    const timelineEntry = this.appendTimelineEntry(
      caseNo,
      TIMELINE_ACTIONS.assigned,
      note ?? `Assigned to ${updated.assigneeId}.`,
    );
    this.persistChanges(
      {
        complaintCases: [updated],
        complaintTimelines: [timelineEntry],
      },
      "assign_complaint_case",
    );
    this.recordAudit(
      {
        actorId: updated.assigneeId,
        actorType: "ops_user",
        tenantId: null,
        moduleName: "complaint",
        actionName: "assign_complaint_case",
        resourceType: "complaint_case",
        resourceId: caseNo,
        newValuesSummary: {
          assigneeId: updated.assigneeId,
          status: updated.status,
        },
      },
      requestId,
    );

    return this.cloneComplaintCase(updated);
  }

  addComplaintCaseNote(
    caseNo: string,
    command: AddComplaintCaseNoteCommand,
    requestId?: string,
  ) {
    this.assertNonBlank(command.note, "note");

    const complaintCase = this.requireComplaintCase(caseNo);
    this.assertCaseOpenForAction(complaintCase, "note");

    const nextStatus =
      complaintCase.status === "new" ||
      complaintCase.status === "assigned" ||
      complaintCase.status === "reopened"
        ? ("under_investigation" as ComplaintCaseStatus)
        : complaintCase.status;
    const updated = {
      ...complaintCase,
      status: nextStatus,
      updatedAt: new Date().toISOString(),
    };
    this.replaceComplaintCase(updated);
    const timelineEntry = this.appendTimelineEntry(
      caseNo,
      TIMELINE_ACTIONS.noteAdded,
      command.note.trim(),
    );
    this.persistChanges(
      {
        complaintCases: [updated],
        complaintTimelines: [timelineEntry],
      },
      "add_complaint_case_note",
    );
    this.recordAudit(
      {
        actorId: updated.assigneeId,
        actorType: "ops_user",
        tenantId: null,
        moduleName: "complaint",
        actionName: "add_complaint_case_note",
        resourceType: "complaint_case",
        resourceId: caseNo,
        newValuesSummary: {
          status: updated.status,
          note: command.note.trim(),
        },
      },
      requestId,
    );

    return this.cloneComplaintCase(updated);
  }

  getComplaintExportView(caseNo: string): ComplaintExportViewRecord {
    const complaintCase = this.getComplaintCase(caseNo);
    const timeline = this.getComplaintTimeline(caseNo);
    return {
      complaintCase,
      timeline,
      exportGeneratedAt: new Date().toISOString(),
      readyForAudit:
        complaintCase.status === "closed" &&
        Boolean(complaintCase.resolutionCode && complaintCase.closingNote),
    };
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

    this.assertValidResolutionCode(
      command.resolutionCode,
      complaintCase.category,
    );

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

    this.assertValidResolutionCode(
      command.resolutionCode,
      complaintCase.category,
    );

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

    const now = new Date();
    const newSlaDueAt = this.calculateSlaDueAt(
      complaintCase.category,
      complaintCase.severity,
      now,
    );

    const updated = {
      ...complaintCase,
      status: "reopened" as ComplaintCaseStatus,
      slaStatus: "within_sla" as ComplaintSlaStatus,
      slaDueAt: newSlaDueAt,
      slaBreachedAt: null,
      slaBreach: false,
      reopenCount: (complaintCase.reopenCount ?? 0) + 1,
      updatedAt: now.toISOString(),
    };
    this.replaceComplaintCase(updated);
    const reopenEntry = this.appendTimelineEntry(
      caseNo,
      TIMELINE_ACTIONS.reopened,
      command.reason,
      now.toISOString(),
    );
    const slaEntry = this.appendTimelineEntry(
      caseNo,
      TIMELINE_ACTIONS.slaRecalculated,
      `SLA recalculated on reopen. New due: ${newSlaDueAt}. Reopen #${updated.reopenCount}.`,
      now.toISOString(),
    );
    this.persistChanges(
      {
        complaintCases: [updated],
        complaintTimelines: [reopenEntry, slaEntry],
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
          reopenCount: updated.reopenCount,
          slaDueAt: newSlaDueAt,
          slaBreach: false,
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
      slaStatus: "breached" as ComplaintSlaStatus,
      slaBreachedAt: new Date().toISOString(),
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

  escalateToIncident(
    caseNo: string,
    incidentId: string,
    reason: string,
    requestId?: string,
  ) {
    this.assertNonBlank(reason, "reason");

    const complaintCase = this.requireComplaintCase(caseNo);
    if (complaintCase.relatedIncidentId) {
      throw new ApiRequestError(
        HttpStatus.CONFLICT,
        "COMPLAINT_ALREADY_ESCALATED",
        "This complaint case is already linked to an incident.",
        {
          caseNo,
          existingIncidentId: complaintCase.relatedIncidentId,
        },
      );
    }

    const updated = {
      ...complaintCase,
      relatedIncidentId: incidentId,
      updatedAt: new Date().toISOString(),
    };
    this.replaceComplaintCase(updated);
    const timelineEntry = this.appendTimelineEntry(
      caseNo,
      TIMELINE_ACTIONS.escalatedToIncident,
      `Escalated to incident ${incidentId}: ${reason}`,
    );
    this.persistChanges(
      {
        complaintCases: [updated],
        complaintTimelines: [timelineEntry],
      },
      "escalate_to_incident",
    );
    this.recordAudit(
      {
        actorId: null,
        actorType: "ops_user",
        tenantId: null,
        moduleName: "complaint",
        actionName: "escalate_to_incident",
        resourceType: "complaint_case",
        resourceId: caseNo,
        newValuesSummary: {
          relatedIncidentId: incidentId,
          reason,
        },
      },
      requestId,
    );

    return this.cloneComplaintCase(updated);
  }

  linkIncident(
    caseNo: string,
    command: LinkComplaintToIncidentCommand,
    requestId?: string,
  ) {
    this.assertNonBlank(command.incidentId, "incidentId");
    const incidentId = command.incidentId.trim();

    const complaintCase = this.requireComplaintCase(caseNo);
    if (
      complaintCase.relatedIncidentId &&
      complaintCase.relatedIncidentId !== incidentId
    ) {
      throw new ApiRequestError(
        HttpStatus.CONFLICT,
        "COMPLAINT_INCIDENT_LINK_CONFLICT",
        "This complaint case is already linked to a different incident.",
        {
          caseNo,
          existingIncidentId: complaintCase.relatedIncidentId,
          requestedIncidentId: incidentId,
        },
      );
    }
    if (complaintCase.relatedIncidentId === incidentId) {
      return this.cloneComplaintCase(complaintCase);
    }

    const updated = {
      ...complaintCase,
      relatedIncidentId: incidentId,
      updatedAt: new Date().toISOString(),
    };
    this.replaceComplaintCase(updated);
    const timelineEntry = this.appendTimelineEntry(
      caseNo,
      TIMELINE_ACTIONS.incidentLinked,
      `Linked to incident ${incidentId}.`,
    );
    this.persistChanges(
      {
        complaintCases: [updated],
        complaintTimelines: [timelineEntry],
      },
      "link_incident",
    );
    this.recordAudit(
      {
        actorId: null,
        actorType: "ops_user",
        tenantId: null,
        moduleName: "complaint",
        actionName: "link_incident",
        resourceType: "complaint_case",
        resourceId: caseNo,
        newValuesSummary: {
          relatedIncidentId: incidentId,
        },
      },
      requestId,
    );

    return this.cloneComplaintCase(updated);
  }

  evaluateAllSlaBreach(requestId?: string) {
    const now = new Date();
    const results: ComplaintCaseRecord[] = [];
    for (const complaintCase of this.complaintCases) {
      if (complaintCase.slaBreach) {
        continue;
      }
      if (
        complaintCase.status === "resolved" ||
        complaintCase.status === "closed"
      ) {
        continue;
      }
      if (new Date(complaintCase.slaDueAt) <= now) {
        results.push(
          this.markComplaintSlaBreach(complaintCase.caseNo, requestId),
        );
      }
    }
    return results;
  }

  getValidResolutionCodes(category: string) {
    this.assertValidCategory(category);
    return [...(COMPLAINT_CATEGORY_VALID_RESOLUTIONS[category] ?? [])];
  }

  private assertValidResolutionCode(
    code: string,
    category: ComplaintCategory,
  ): asserts code is ComplaintResolutionCode {
    if (!COMPLAINT_RESOLUTION_CODES.includes(code as ComplaintResolutionCode)) {
      throw new ApiRequestError(
        HttpStatus.BAD_REQUEST,
        "INVALID_RESOLUTION_CODE",
        "Invalid complaint resolution code.",
        { resolutionCode: code },
      );
    }
    const validForCategory = COMPLAINT_CATEGORY_VALID_RESOLUTIONS[category];
    if (!validForCategory?.includes(code as ComplaintResolutionCode)) {
      throw new ApiRequestError(
        HttpStatus.BAD_REQUEST,
        "RESOLUTION_CODE_NOT_VALID_FOR_CATEGORY",
        `Resolution code "${code}" is not valid for category "${category}".`,
        { resolutionCode: code, category },
      );
    }
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

  private assertCaseOpenForAction(
    complaintCase: ComplaintCaseRecord,
    action: "assign" | "note",
  ) {
    if (
      complaintCase.status === "resolved" ||
      complaintCase.status === "closed"
    ) {
      throw new ApiRequestError(
        HttpStatus.CONFLICT,
        "COMPLAINT_NOT_ACTIONABLE",
        `Cannot ${action} a complaint case once it is ${complaintCase.status}.`,
        {
          caseNo: complaintCase.caseNo,
          status: complaintCase.status,
        },
      );
    }
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
    const slaStatus = this.computeSlaStatus(complaintCase);
    return {
      ...complaintCase,
      slaStatus,
      slaBreachedAt: complaintCase.slaBreachedAt ?? null,
      slaBreach: slaStatus === "breached",
      availableActions: this.buildAvailableActions(complaintCase),
      resourceLinks: this.buildResourceLinks(complaintCase),
    };
  }

  private buildPageActions(
    complaintCases: readonly ComplaintCaseRecord[],
  ): ResourceActionDescriptor[] {
    return [
      {
        action: "create_complaint",
        enabled: true,
        riskLevel: "medium",
      },
      {
        action: "export_case_view",
        enabled: complaintCases.some((complaintCase) =>
          (complaintCase.availableActions ?? []).some(
            (descriptor) =>
              descriptor.action === "export_case_view" && descriptor.enabled,
          ),
        ),
        disabledReasonCode: complaintCases.length
          ? "no_export_ready_case"
          : "no_cases_available",
        riskLevel: "low",
      },
    ];
  }

  private buildAvailableActions(
    complaintCase: ComplaintCaseRecord,
  ): ResourceActionDescriptor[] {
    const isClosed = complaintCase.status === "closed";
    const isResolved = complaintCase.status === "resolved";
    const hasIncident = Boolean(complaintCase.relatedIncidentId);

    return [
      {
        action: "assign_complaint",
        enabled: !isClosed && !isResolved,
        disabledReasonCode:
          isClosed || isResolved ? "case_read_only" : undefined,
        riskLevel: "medium",
      },
      {
        action: "add_note",
        enabled: !isClosed && !isResolved,
        disabledReasonCode:
          isClosed || isResolved ? "case_read_only" : undefined,
        riskLevel: "low",
      },
      {
        action: "resolve_complaint",
        enabled: !isClosed && !isResolved,
        disabledReasonCode:
          isClosed || isResolved ? "already_resolved_or_closed" : undefined,
        riskLevel: "medium",
      },
      {
        action: "close_complaint",
        enabled: isResolved,
        disabledReasonCode: isClosed
          ? "already_closed"
          : !isResolved
            ? "resolve_required"
            : undefined,
        riskLevel: "medium",
      },
      {
        action: "reopen_complaint",
        enabled: isClosed,
        disabledReasonCode: isClosed ? undefined : "close_required",
        requiresReason: true,
        riskLevel: "high",
      },
      {
        action: "escalate_to_incident",
        enabled: !isClosed && !hasIncident,
        disabledReasonCode: isClosed
          ? "closed_case_cannot_escalate"
          : hasIncident
            ? "incident_already_linked"
            : undefined,
        requiresReason: true,
        riskLevel: "high",
      },
      {
        action: "export_case_view",
        enabled: true,
        riskLevel: "low",
      },
    ];
  }

  private buildResourceLinks(
    complaintCase: ComplaintCaseRecord,
  ): CrossAppResourceLink[] {
    const links: CrossAppResourceLink[] = [];

    if (complaintCase.relatedOrderId) {
      links.push({
        targetApp: "ops-console",
        route: `/dispatch/${complaintCase.relatedOrderId}`,
        resourceType: "dispatch_work_item",
        resourceId: complaintCase.relatedOrderId,
        openMode: "same_tab",
        label: `Dispatch ${complaintCase.relatedOrderId}`,
      });
    }

    if (complaintCase.relatedCallId) {
      links.push({
        targetApp: "ops-console",
        route: `/callcenter?callId=${encodeURIComponent(complaintCase.relatedCallId)}`,
        resourceType: "call_session",
        resourceId: complaintCase.relatedCallId,
        openMode: "same_tab",
        label: `Call ${complaintCase.relatedCallId}`,
      });
    }

    if (complaintCase.relatedIncidentId) {
      links.push({
        targetApp: "ops-console",
        route: `/incidents/${complaintCase.relatedIncidentId}`,
        resourceType: "incident",
        resourceId: complaintCase.relatedIncidentId,
        openMode: "same_tab",
        label: `Incident ${complaintCase.relatedIncidentId}`,
      });
    }

    links.push({
      targetApp: "platform-admin",
      route: `/audit?resourceType=complaint_case&resourceId=${encodeURIComponent(complaintCase.caseNo)}`,
      resourceType: "audit_log",
      resourceId: complaintCase.caseNo,
      openMode: "new_tab",
      label: `Audit ${complaintCase.caseNo}`,
    });

    return links;
  }

  private computeSlaStatus(
    complaintCase: ComplaintCaseRecord,
  ): ComplaintSlaStatus {
    if (complaintCase.slaBreach || complaintCase.slaBreachedAt) {
      return "breached";
    }

    const remainingMs =
      new Date(complaintCase.slaDueAt).getTime() - Date.now();
    if (remainingMs <= 0) {
      return "breached";
    }
    if (remainingMs <= 2 * 60 * 60 * 1000) {
      return "warning";
    }
    return "within_sla";
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

  private normalizeNullableText(value: string | null | undefined) {
    const trimmed = value?.trim();
    return trimmed ? trimmed : null;
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
