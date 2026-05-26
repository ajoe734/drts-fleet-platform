import { randomUUID } from "node:crypto";

import { HttpStatus, Injectable, OnModuleInit, Optional } from "@nestjs/common";

import type {
  AddComplaintCaseNoteCommand,
  AssignComplaintCaseCommand,
  AuditLogRecord,
  ComplaintCaseRecord,
  ComplaintCaseStatus,
  ComplaintCategory,
  ComplaintExportViewRecord,
  ComplaintResolutionCode,
  ComplaintSlaStatus,
  ComplaintTimelineEntry,
  CreateComplaintCaseCommand,
  LinkComplaintToIncidentCommand,
  ResourceActionDescriptor,
  ReopenComplaintCaseCommand,
  ResolveComplaintCaseCommand,
} from "@drts/contracts";

import {
  COMPLAINT_CATEGORY_VALID_RESOLUTIONS,
  COMPLAINT_RESOLUTION_CODES,
} from "@drts/contracts";

import { ApiRequestError } from "../../common/api-envelope";
import { AuditNotificationService } from "../audit-notification/audit-notification.service";
import {
  ComplaintRepository,
  type PersistedComplaintCaseRecord,
} from "./complaint.repository";

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

const COMPLAINT_REFRESH_STALE_AFTER_MS = 15_000;
const SLA_WARNING_WINDOW_RATIO = 0.25;
const MIN_SLA_WARNING_WINDOW_MS = 30 * 60 * 1000;
const MAX_SLA_WARNING_WINDOW_MS = 12 * 60 * 60 * 1000;

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

  private complaintCases: PersistedComplaintCaseRecord[] = [];

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
    const complaintCase: PersistedComplaintCaseRecord = {
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
      reopenCount: 0,
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
      slaDueAt: newSlaDueAt,
      slaBreachedAt: null,
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
          slaStatus: "within_sla",
        },
      },
      requestId,
    );

    return this.cloneComplaintCase(updated);
  }

  markComplaintSlaBreach(caseNo: string, requestId?: string) {
    const complaintCase = this.requireComplaintCase(caseNo);
    if (this.hasRecordedSlaBreach(complaintCase)) {
      return this.cloneComplaintCase(complaintCase);
    }

    const breachedAt = complaintCase.slaBreachedAt ?? new Date().toISOString();
    const updated = {
      ...complaintCase,
      slaBreachedAt: breachedAt,
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
          slaStatus: "breached",
          slaDueAt: complaintCase.slaDueAt,
          slaBreachedAt: breachedAt,
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
      if (
        complaintCase.status === "resolved" ||
        complaintCase.status === "closed"
      ) {
        continue;
      }
      if (this.hasRecordedSlaBreach(complaintCase)) {
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

  getReadModelRefreshMetadata() {
    return {
      generatedAt: new Date().toISOString(),
      staleAfterMs: COMPLAINT_REFRESH_STALE_AFTER_MS,
      dataFreshness: "fresh" as const,
      source: "live" as const,
    };
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
    const effectiveHours = this.getEffectiveSlaHours(category, severity);
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
    complaintCases: readonly PersistedComplaintCaseRecord[],
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
    complaintCase: PersistedComplaintCaseRecord,
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

  private replaceComplaintCase(updated: PersistedComplaintCaseRecord) {
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

  private cloneComplaintCase(
    complaintCase: PersistedComplaintCaseRecord,
  ): ComplaintCaseRecord {
    const record = { ...complaintCase };
    delete record.slaBreach;
    const slaStatus = this.computeSlaStatus(complaintCase);
    const slaBreachedAt = this.computeSlaBreachedAt(complaintCase, slaStatus);

    return {
      ...record,
      slaStatus,
      slaBreachedAt,
      availableActions: this.buildAvailableActions(complaintCase),
    };
  }

  private buildAvailableActions(
    complaintCase: PersistedComplaintCaseRecord,
  ): ResourceActionDescriptor[] {
    const actions: ResourceActionDescriptor[] = [];
    const isClosed =
      complaintCase.status === "resolved" || complaintCase.status === "closed";
    const hasIncidentLink = Boolean(complaintCase.relatedIncidentId);

    const pushAction = (
      action: string,
      enabled: boolean,
      riskLevel: ResourceActionDescriptor["riskLevel"],
      disabledReasonCode?: string,
    ) => {
      actions.push({
        action,
        enabled,
        riskLevel,
        ...(disabledReasonCode ? { disabledReasonCode } : {}),
      });
    };

    pushAction(
      "assign",
      !isClosed,
      "low",
      isClosed ? "case_closed" : undefined,
    );
    pushAction(
      "add_note",
      !isClosed,
      "low",
      isClosed ? "case_closed" : undefined,
    );
    pushAction(
      "resolve",
      !isClosed,
      "medium",
      isClosed ? "case_closed" : undefined,
    );
    pushAction(
      "close",
      complaintCase.status === "resolved",
      "medium",
      complaintCase.status === "resolved"
        ? undefined
        : complaintCase.status === "closed"
          ? "already_closed"
          : "resolution_required",
    );
    pushAction(
      "reopen",
      isClosed,
      "medium",
      isClosed ? undefined : "case_not_closed",
    );
    pushAction(
      "escalate_to_incident",
      !isClosed && !hasIncidentLink,
      "high",
      isClosed
        ? "case_closed"
        : hasIncidentLink
          ? "incident_already_linked"
          : undefined,
    );

    return actions;
  }

  private computeSlaStatus(
    complaintCase: PersistedComplaintCaseRecord,
    now = new Date(),
  ): ComplaintSlaStatus {
    if (this.hasRecordedSlaBreach(complaintCase)) {
      return "breached";
    }

    const dueAtMs = new Date(complaintCase.slaDueAt).getTime();
    const evaluationTime =
      complaintCase.status === "resolved" || complaintCase.status === "closed"
        ? new Date(complaintCase.updatedAt)
        : now;
    const nowMs = evaluationTime.getTime();

    if (Number.isNaN(dueAtMs) || dueAtMs <= nowMs) {
      return "breached";
    }

    const remainingMs = dueAtMs - nowMs;
    const warningWindowMs = this.getSlaWarningWindowMs(
      complaintCase.category,
      complaintCase.severity,
    );
    if (remainingMs <= warningWindowMs) {
      return "warning";
    }

    return "within_sla";
  }

  private hasRecordedSlaBreach(complaintCase: PersistedComplaintCaseRecord) {
    return (
      complaintCase.slaBreachedAt != null || complaintCase.slaBreach === true
    );
  }

  private computeSlaBreachedAt(
    complaintCase: PersistedComplaintCaseRecord,
    slaStatus: ComplaintSlaStatus,
  ) {
    if (complaintCase.slaBreachedAt) {
      return complaintCase.slaBreachedAt;
    }

    if (complaintCase.slaBreach === true) {
      return complaintCase.updatedAt;
    }

    return slaStatus === "breached" ? complaintCase.slaDueAt : null;
  }

  private getSlaWarningWindowMs(
    category: ComplaintCategory,
    severity: CreateComplaintCaseCommand["severity"],
  ) {
    const totalSlaMs =
      this.getEffectiveSlaHours(category, severity) * 60 * 60 * 1000;
    return Math.min(
      MAX_SLA_WARNING_WINDOW_MS,
      Math.max(
        MIN_SLA_WARNING_WINDOW_MS,
        totalSlaMs * SLA_WARNING_WINDOW_RATIO,
      ),
    );
  }

  private getEffectiveSlaHours(
    category: ComplaintCategory,
    severity: CreateComplaintCaseCommand["severity"],
  ) {
    const baseHours = DEFAULT_SLA_HOURS_BY_CATEGORY[category] ?? 48;
    return severity === "high"
      ? Math.max(1, Math.floor(baseHours / 2))
      : baseHours;
  }

  private persistChanges(
    changes: {
      complaintCases?: readonly PersistedComplaintCaseRecord[];
      complaintTimelines?: readonly ComplaintTimelineEntry[];
    },
    context: string,
  ) {
    if (!this.complaintRepository) {
      return;
    }

    const persistPayload: {
      complaintCases?: PersistedComplaintCaseRecord[];
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
