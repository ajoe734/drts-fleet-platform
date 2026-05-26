import { randomUUID } from "node:crypto";

import { HttpStatus, Injectable, OnModuleInit, Optional } from "@nestjs/common";

import type {
  ActionReceipt,
  AuditLogRecord,
  CreateIncidentCommand,
  CreateIncidentFromDispatchExceptionCommand,
  IncidentRecord,
  IncidentRuntimeRecord,
  IncidentMutationResult,
  IncidentServiceRecoveryActionResult,
  IncidentStatus,
  IncidentTimelineEntry,
  RecordServiceRecoveryActionCommand,
  ResourceActionDescriptor,
  ServiceRecoveryActionRecord,
  UiRefreshMetadata,
  UpdateIncidentCommand,
} from "@drts/contracts";

import { ApiRequestError } from "../../common/api-envelope";
import { AuditNotificationService } from "../audit-notification/audit-notification.service";
import { IncidentRepository } from "./incident.repository";

const INCIDENT_STATUS_VALUES = [
  "open",
  "investigating",
  "resolved",
  "closed",
] as const;

const INCIDENT_SEVERITY_VALUES = ["low", "medium", "high", "critical"] as const;

const INCIDENT_CATEGORY_VALUES = [
  "safety",
  "vehicle_damage",
  "passenger_injury",
  "driver_injury",
  "property_damage",
  "weather",
  "traffic",
  "operational",
  "other",
] as const;

const INCIDENT_ESCALATION_TARGET_VALUES = [
  "ops_supervisor",
  "dispatch_manager",
  "safety_officer",
  "roc_duty",
] as const;

const SERVICE_RECOVERY_ACTION_TYPES = [
  "passenger_recontact",
  "fare_adjustment",
  "redispatch_ordered",
  "voucher_issued",
  "apology_sent",
  "driver_reassigned",
  "other",
] as const;

const TIMELINE_ACTIONS = {
  created: "incident_created",
  statusChanged: "status_changed",
  assigned: "incident_assigned",
  assignmentAcknowledged: "incident_assignment_acknowledged",
  categoryUpdated: "incident_category_updated",
  resolved: "incident_resolved",
  closed: "incident_closed",
  complaintLinked: "complaint_linked",
  escalationTargetSet: "escalation_target_set",
  severityEscalated: "severity_escalated",
  dispatchExceptionHandoff: "dispatch_exception_handoff",
  serviceRecoveryAction: "service_recovery_action",
} as const;

const INCIDENT_REFRESH_STALE_AFTER_MS = 15_000;

@Injectable()
export class IncidentService implements OnModuleInit {
  private incidentSequence = 1;
  private incidents: IncidentRecord[] = [];
  private timelines = new Map<string, IncidentTimelineEntry[]>();
  private recoveryActions = new Map<string, ServiceRecoveryActionRecord[]>();

  constructor(
    private readonly auditNotificationService: AuditNotificationService,
    @Optional() private readonly incidentRepository?: IncidentRepository,
  ) {}

  async onModuleInit() {
    if (!this.incidentRepository) return;
    try {
      const state = await this.incidentRepository.loadState();
      if (state.incidents.length === 0 && state.timelines.length === 0) return;
      this.incidents = state.incidents.map((i) => this.clone(i));
      this.timelines = this.buildTimelineMap(state.timelines);
      this.recoveryActions = this.buildRecoveryActionMap(state.incidents);
      this.incidentSequence = this.deriveNextSequence(state.incidents);
    } catch (error) {
      this.incidentRepository.reportPersistenceFailure(error, "module init");
    }
  }

  createIncident(command: CreateIncidentCommand, requestId?: string) {
    this.assertValidCategory(command.category);
    this.assertValidSeverity(command.severity);
    this.assertNonBlank(command.title, "title");
    this.assertNonBlank(command.description, "description");
    this.assertNonBlank(command.reportedBy, "reportedBy");

    const now = new Date().toISOString();
    const incidentId = this.nextIncidentId();
    const incident: IncidentRecord = {
      incidentId,
      title: command.title,
      description: command.description,
      category: command.category,
      severity: command.severity,
      status: "open",
      relatedOrderId: command.relatedOrderId ?? null,
      relatedVehicleId: command.relatedVehicleId ?? null,
      relatedDriverId: command.relatedDriverId ?? null,
      relatedComplaintCaseNo: null,
      reportedBy: command.reportedBy,
      assignedTo: null,
      assignmentAcknowledgedAt: null,
      escalationTarget: null,
      sourceDispatchExceptionOrderId: null,
      occurredAt: command.occurredAt ?? null,
      location: command.location ?? null,
      resolutionNote: null,
      serviceRecoveryActions: [],
      createdAt: now,
      updatedAt: now,
    };

    const timelineEntry = this.createTimelineEntry(
      incidentId,
      TIMELINE_ACTIONS.created,
      `Incident reported by ${command.reportedBy}.`,
      "system",
      now,
    );

    this.incidents = [incident, ...this.incidents];
    this.timelines.set(incidentId, [timelineEntry]);
    this.persist(
      { incidents: [incident], timelines: [timelineEntry] },
      "create_incident",
    );
    this.recordAudit(
      {
        actorId: command.reportedBy,
        actorType: "system",
        tenantId: null,
        moduleName: "incident",
        actionName: "create_incident",
        resourceType: "incident",
        resourceId: incidentId,
        newValuesSummary: {
          category: command.category,
          severity: command.severity,
          status: incident.status,
          relatedOrderId: command.relatedOrderId,
          relatedVehicleId: command.relatedVehicleId,
          relatedDriverId: command.relatedDriverId,
        },
      },
      requestId,
    );

    return this.decorateIncident(incident);
  }

  listIncidents() {
    return this.incidents.map((i) => this.decorateIncident(i));
  }

  getIncident(incidentId: string) {
    return this.decorateIncident(this.require(incidentId));
  }

  updateIncident(
    incidentId: string,
    command: UpdateIncidentCommand,
    requestId?: string,
  ) {
    return this.updateIncidentWithReceipt(incidentId, command, requestId)
      .incident;
  }

  updateIncidentWithReceipt(
    incidentId: string,
    command: UpdateIncidentCommand,
    requestId?: string,
  ): IncidentMutationResult {
    const incident = this.require(incidentId);

    const updated = { ...incident, updatedAt: new Date().toISOString() };
    let timelineChanged = false;

    if (command.category !== undefined) {
      this.assertValidCategory(command.category);
      if (updated.category !== command.category) {
        const previousCategory = updated.category;
        updated.category = command.category;
        this.appendTimelineEntry(
          incidentId,
          TIMELINE_ACTIONS.categoryUpdated,
          `Category changed from ${previousCategory} to ${command.category}.`,
          "ops_user",
        );
        timelineChanged = true;
      }
    }

    if (command.status !== undefined) {
      this.assertValidStatus(command.status);
      updated.status = command.status;
      this.appendTimelineEntry(
        incidentId,
        TIMELINE_ACTIONS.statusChanged,
        `Status changed to ${command.status}.`,
        "ops_user",
      );
      timelineChanged = true;
    }

    if (command.assignedTo !== undefined) {
      const previousAssignedTo = incident.assignedTo ?? null;
      updated.assignedTo = command.assignedTo;
      if ((command.assignedTo ?? null) !== previousAssignedTo) {
        updated.assignmentAcknowledgedAt = null;
      }
      this.appendTimelineEntry(
        incidentId,
        TIMELINE_ACTIONS.assigned,
        `Assigned to ${command.assignedTo}.`,
        "ops_user",
      );
      timelineChanged = true;
    }

    if (command.severity !== undefined) {
      this.assertValidSeverity(command.severity);
      const oldSeverity = updated.severity;
      updated.severity = command.severity;
      if (oldSeverity !== command.severity) {
        this.appendTimelineEntry(
          incidentId,
          TIMELINE_ACTIONS.severityEscalated,
          `Severity changed from ${oldSeverity} to ${command.severity}.`,
          "ops_user",
        );
        timelineChanged = true;
      }
    }

    if (command.escalationTarget !== undefined) {
      if (
        command.escalationTarget !== null &&
        !INCIDENT_ESCALATION_TARGET_VALUES.includes(
          command.escalationTarget as any,
        )
      ) {
        throw new ApiRequestError(
          HttpStatus.BAD_REQUEST,
          "VALIDATION_ERROR",
          "Invalid escalation target.",
          { escalationTarget: command.escalationTarget },
        );
      }
      updated.escalationTarget = command.escalationTarget;
      this.appendTimelineEntry(
        incidentId,
        TIMELINE_ACTIONS.escalationTargetSet,
        command.escalationTarget
          ? `Escalation target set to ${command.escalationTarget}.`
          : "Escalation target cleared.",
        "ops_user",
      );
      timelineChanged = true;
    }

    if (command.assignmentAcknowledgedAt !== undefined) {
      const acknowledgedAt =
        command.assignmentAcknowledgedAt ?? new Date().toISOString();
      const acknowledgedBy =
        command.assignmentAcknowledgedBy?.trim() ||
        updated.assignedTo ||
        "ops_user";
      updated.assignmentAcknowledgedAt = acknowledgedAt;
      this.appendTimelineEntry(
        incidentId,
        TIMELINE_ACTIONS.assignmentAcknowledged,
        `Assignment acknowledged by ${acknowledgedBy}.`,
        acknowledgedBy,
        acknowledgedAt,
      );
      timelineChanged = true;
    }

    if (command.resolutionNote !== undefined) {
      updated.resolutionNote = command.resolutionNote;
    }

    this.replace(updated);
    this.persist(
      {
        incidents: [updated],
        timelines: timelineChanged
          ? (this.timelines.get(incidentId)?.slice(-1) ?? [])
          : undefined,
      },
      "update_incident",
    );
    const auditLog = this.recordAudit(
      {
        actorId: null,
        actorType: "ops_user",
        tenantId: null,
        moduleName: "incident",
        actionName: "update_incident",
        resourceType: "incident",
        resourceId: incidentId,
        newValuesSummary: {
          category: updated.category,
          status: updated.status,
          assignedTo: updated.assignedTo,
          assignmentAcknowledgedAt: updated.assignmentAcknowledgedAt,
          resolutionNote: updated.resolutionNote,
        },
      },
      requestId,
    );

    return {
      incident: this.decorateIncident(updated),
      receipt: this.buildActionReceipt({
        auditId: auditLog.auditId,
        message: "Incident updated.",
        resourceId: incidentId,
      }),
    };
  }

  linkComplaint(
    incidentId: string,
    complaintCaseNo: string,
    requestId?: string,
  ) {
    this.assertNonBlank(complaintCaseNo, "complaintCaseNo");
    const normalizedComplaintCaseNo = complaintCaseNo.trim();
    const incident = this.require(incidentId);
    if (
      incident.relatedComplaintCaseNo &&
      incident.relatedComplaintCaseNo !== normalizedComplaintCaseNo
    ) {
      throw new ApiRequestError(
        HttpStatus.CONFLICT,
        "INCIDENT_COMPLAINT_LINK_CONFLICT",
        "This incident is already linked to a different complaint case.",
        {
          incidentId,
          existingComplaintCaseNo: incident.relatedComplaintCaseNo,
          requestedComplaintCaseNo: normalizedComplaintCaseNo,
        },
      );
    }
    if (incident.relatedComplaintCaseNo === normalizedComplaintCaseNo) {
      return this.decorateIncident(incident);
    }

    const updated = {
      ...incident,
      relatedComplaintCaseNo: normalizedComplaintCaseNo,
      updatedAt: new Date().toISOString(),
    };
    this.replace(updated);
    this.appendTimelineEntry(
      incidentId,
      TIMELINE_ACTIONS.complaintLinked,
      `Linked to complaint case ${normalizedComplaintCaseNo}.`,
      "ops_user",
    );
    this.persist({ incidents: [updated] }, "link_complaint");
    this.recordAudit(
      {
        actorId: null,
        actorType: "ops_user",
        tenantId: null,
        moduleName: "incident",
        actionName: "link_complaint",
        resourceType: "incident",
        resourceId: incidentId,
        newValuesSummary: {
          relatedComplaintCaseNo: normalizedComplaintCaseNo,
        },
      },
      requestId,
    );
    return this.decorateIncident(updated);
  }

  getTimeline(incidentId: string) {
    this.require(incidentId);
    return (this.timelines.get(incidentId) ?? []).map((e) => ({ ...e }));
  }

  createFromDispatchException(
    command: CreateIncidentFromDispatchExceptionCommand,
    requestId?: string,
  ) {
    this.assertValidSeverity(command.severity);
    this.assertNonBlank(command.orderId, "orderId");
    this.assertNonBlank(command.exceptionReasonCode, "exceptionReasonCode");
    this.assertNonBlank(command.reportedBy, "reportedBy");

    if (
      command.escalationTarget &&
      !INCIDENT_ESCALATION_TARGET_VALUES.includes(
        command.escalationTarget as any,
      )
    ) {
      throw new ApiRequestError(
        HttpStatus.BAD_REQUEST,
        "VALIDATION_ERROR",
        "Invalid escalation target.",
        { escalationTarget: command.escalationTarget },
      );
    }

    const now = new Date().toISOString();
    const incidentId = this.nextIncidentId();
    const incident: IncidentRecord = {
      incidentId,
      title: `Dispatch exception: ${command.exceptionReasonCode} (order ${command.orderId})`,
      description: command.exceptionNote
        ? `Dispatch exception ${command.exceptionReasonCode} on order ${command.orderId}: ${command.exceptionNote}`
        : `Dispatch exception ${command.exceptionReasonCode} escalated from order ${command.orderId}.`,
      category: "operational",
      severity: command.severity,
      status: "open",
      relatedOrderId: command.orderId,
      relatedVehicleId: null,
      relatedDriverId: null,
      relatedComplaintCaseNo: null,
      reportedBy: command.reportedBy,
      assignedTo: null,
      assignmentAcknowledgedAt: null,
      escalationTarget: command.escalationTarget ?? null,
      sourceDispatchExceptionOrderId: command.orderId,
      occurredAt: now,
      location: null,
      resolutionNote: null,
      serviceRecoveryActions: [],
      createdAt: now,
      updatedAt: now,
    };

    const timelineEntry = this.createTimelineEntry(
      incidentId,
      TIMELINE_ACTIONS.dispatchExceptionHandoff,
      `Incident created from dispatch exception on order ${command.orderId} (reason: ${command.exceptionReasonCode}).`,
      command.reportedBy,
      now,
    );

    this.incidents = [incident, ...this.incidents];
    this.timelines.set(incidentId, [timelineEntry]);
    this.persist(
      { incidents: [incident], timelines: [timelineEntry] },
      "create_from_dispatch_exception",
    );
    this.recordAudit(
      {
        actorId: command.reportedBy,
        actorType: "ops_user",
        tenantId: null,
        moduleName: "incident",
        actionName: "create_from_dispatch_exception",
        resourceType: "incident",
        resourceId: incidentId,
        newValuesSummary: {
          orderId: command.orderId,
          exceptionReasonCode: command.exceptionReasonCode,
          severity: command.severity,
          escalationTarget: command.escalationTarget ?? null,
        },
      },
      requestId,
    );

    return this.decorateIncident(incident);
  }

  recordServiceRecoveryAction(
    incidentId: string,
    command: RecordServiceRecoveryActionCommand,
    requestId?: string,
  ) {
    return this.recordServiceRecoveryActionWithReceipt(
      incidentId,
      command,
      requestId,
    ).action;
  }

  recordServiceRecoveryActionWithReceipt(
    incidentId: string,
    command: RecordServiceRecoveryActionCommand,
    requestId?: string,
  ): IncidentServiceRecoveryActionResult {
    this.assertNonBlank(command.actionType, "actionType");
    this.assertNonBlank(command.note, "note");
    this.assertNonBlank(command.actor, "actor");
    if (!SERVICE_RECOVERY_ACTION_TYPES.includes(command.actionType as any)) {
      throw new ApiRequestError(
        HttpStatus.BAD_REQUEST,
        "VALIDATION_ERROR",
        "Invalid service recovery action type.",
        { actionType: command.actionType },
      );
    }

    const incident = this.require(incidentId);
    const now = new Date().toISOString();
    const action: ServiceRecoveryActionRecord = {
      actionId: `sra-${randomUUID()}`,
      incidentId,
      actionType: command.actionType,
      note: command.note,
      actor: command.actor,
      createdAt: now,
    };

    const existing = this.recoveryActions.get(incidentId) ?? [];
    this.recoveryActions.set(incidentId, [...existing, action]);

    const updated = {
      ...incident,
      serviceRecoveryActions: this.recoveryActions
        .get(incidentId)!
        .map((a) => ({ ...a })),
      updatedAt: now,
    };
    this.replace(updated);

    this.appendTimelineEntry(
      incidentId,
      TIMELINE_ACTIONS.serviceRecoveryAction,
      `Service recovery: ${command.actionType} — ${command.note}`,
      command.actor,
      now,
    );

    this.persist(
      {
        incidents: [updated],
        timelines: [this.getLatestTimelineEntry(incidentId)],
      },
      "record_service_recovery_action",
    );
    const auditLog = this.recordAudit(
      {
        actorId: command.actor,
        actorType: "ops_user",
        tenantId: null,
        moduleName: "incident",
        actionName: "record_service_recovery_action",
        resourceType: "incident",
        resourceId: incidentId,
        newValuesSummary: {
          actionType: command.actionType,
          note: command.note,
        },
      },
      requestId,
    );

    return {
      action,
      receipt: this.buildActionReceipt({
        auditId: auditLog.auditId,
        message: "Service recovery action recorded.",
        resourceId: incidentId,
      }),
    };
  }

  getServiceRecoveryActions(incidentId: string) {
    this.require(incidentId);
    return (this.recoveryActions.get(incidentId) ?? []).map((a) => ({ ...a }));
  }

  // --- Private helpers ---

  private require(incidentId: string) {
    const incident = this.incidents.find((i) => i.incidentId === incidentId);
    if (!incident) {
      throw new ApiRequestError(
        HttpStatus.NOT_FOUND,
        "NOT_FOUND",
        "Incident not found.",
        { incidentId },
      );
    }
    return incident;
  }

  private replace(updated: IncidentRecord) {
    this.incidents = this.incidents.map((i) =>
      i.incidentId === updated.incidentId ? updated : i,
    );
  }

  private nextIncidentId() {
    const seq = this.incidentSequence++;
    return `INC-${String(seq).padStart(6, "0")}`;
  }

  private deriveNextSequence(incidents: readonly IncidentRecord[]) {
    const maxSeq = incidents.reduce((max, inc) => {
      const num = Number.parseInt(inc.incidentId.replace("INC-", ""), 10);
      return Number.isInteger(num) ? Math.max(max, num) : max;
    }, 0);
    return maxSeq + 1;
  }

  private buildTimelineMap(entries: readonly IncidentTimelineEntry[]) {
    const map = new Map<string, IncidentTimelineEntry[]>();
    for (const entry of entries) {
      const existing = map.get(entry.incidentId) ?? [];
      map.set(entry.incidentId, [...existing, { ...entry }]);
    }
    return map;
  }

  private createTimelineEntry(
    incidentId: string,
    action: string,
    note: string,
    actor: string,
    createdAt = new Date().toISOString(),
  ): IncidentTimelineEntry {
    return {
      entryId: `inc-timeline-${randomUUID()}`,
      incidentId,
      action,
      note,
      actor,
      createdAt,
    };
  }

  private appendTimelineEntry(
    incidentId: string,
    action: string,
    note: string,
    actor: string,
    createdAt = new Date().toISOString(),
  ) {
    const current = this.timelines.get(incidentId) ?? [];
    const entry = this.createTimelineEntry(
      incidentId,
      action,
      note,
      actor,
      createdAt,
    );
    this.timelines.set(incidentId, [...current, entry]);
  }

  private getLatestTimelineEntry(incidentId: string) {
    const entries = this.timelines.get(incidentId) ?? [];
    return entries[entries.length - 1]!;
  }

  private clone(incident: IncidentRecord): IncidentRecord {
    return {
      ...incident,
      serviceRecoveryActions: incident.serviceRecoveryActions.map((action) => ({
        ...action,
      })),
    };
  }

  private decorateIncident(incident: IncidentRecord): IncidentRuntimeRecord {
    const cloned = this.clone(incident);
    return {
      ...cloned,
      availableActions: this.buildAvailableActions(cloned),
      refreshMetadata: this.buildRefreshMetadata(cloned.updatedAt),
      driverMatchingSuppression: null,
    };
  }

  private buildAvailableActions(
    incident: IncidentRecord,
  ): ResourceActionDescriptor[] {
    const isReadOnly =
      incident.status === "resolved" || incident.status === "closed";
    const readOnlyReason = isReadOnly ? "read_only_state" : undefined;
    const hasAssignedOwner = Boolean(incident.assignedTo);

    const actions: ResourceActionDescriptor[] = [
      {
        action: "update_incident",
        enabled: !isReadOnly,
        disabledReasonCode: readOnlyReason,
        riskLevel: "medium",
      },
      {
        action: "resolve_incident",
        enabled: !isReadOnly,
        disabledReasonCode: readOnlyReason,
        riskLevel: "medium",
      },
      {
        action: "close_incident",
        enabled: !isReadOnly,
        disabledReasonCode: readOnlyReason,
        requiresReason: true,
        riskLevel: "high",
      },
      {
        action: "record_service_recovery_action",
        enabled: !isReadOnly,
        disabledReasonCode: readOnlyReason,
        riskLevel: "medium",
      },
      {
        action: "acknowledge_escalation",
        enabled: !isReadOnly && hasAssignedOwner,
        disabledReasonCode: isReadOnly
          ? readOnlyReason
          : hasAssignedOwner
            ? undefined
            : "assignment_missing",
        riskLevel: "medium",
      },
    ];

    if (incident.relatedDriverId) {
      actions.push({
        action: "lift_driver_matching_suppression",
        enabled: !isReadOnly,
        disabledReasonCode: readOnlyReason,
        requiresReason: true,
        riskLevel: "high",
      });
    }

    return actions;
  }

  private buildRefreshMetadata(updatedAt: string): UiRefreshMetadata {
    return {
      generatedAt: updatedAt,
      staleAfterMs: INCIDENT_REFRESH_STALE_AFTER_MS,
      dataFreshness: "fresh",
      source: "live",
    };
  }

  private buildRecoveryActionMap(
    incidents: readonly IncidentRecord[],
  ): Map<string, ServiceRecoveryActionRecord[]> {
    return new Map(
      incidents
        .filter((incident) => incident.serviceRecoveryActions.length > 0)
        .map((incident) => [
          incident.incidentId,
          incident.serviceRecoveryActions.map((action) => ({ ...action })),
        ]),
    );
  }

  private persist(
    changes: {
      incidents?: readonly IncidentRecord[];
      timelines?: readonly IncidentTimelineEntry[];
    },
    context: string,
  ) {
    if (!this.incidentRepository) return;
    const payload: {
      incidents?: IncidentRecord[];
      timelines?: IncidentTimelineEntry[];
    } = {};
    if (changes.incidents) {
      payload.incidents = changes.incidents.map((i) => this.clone(i));
    }
    if (changes.timelines) {
      payload.timelines = changes.timelines.map((e) => ({ ...e }));
    }
    void this.incidentRepository
      .persistChanges(payload)
      .catch((error: unknown) => {
        this.incidentRepository!.reportPersistenceFailure(error, context);
      });
  }

  private recordAudit(
    input: Omit<AuditLogRecord, "auditId" | "createdAt" | "requestId">,
    requestId?: string,
  ) {
    const log = { ...input };
    if (requestId) (log as any).requestId = requestId;
    return this.auditNotificationService.recordAuditLog(log);
  }

  private buildActionReceipt(input: {
    auditId: string;
    message: string;
    resourceId: string;
  }): ActionReceipt {
    return {
      actionId: `act-${randomUUID()}`,
      auditId: input.auditId,
      resourceType: "incident",
      resourceId: input.resourceId,
      status: "completed",
      message: input.message,
    };
  }

  private assertValidCategory(
    category: string,
  ): asserts category is IncidentRecord["category"] {
    if (!INCIDENT_CATEGORY_VALUES.includes(category as any)) {
      throw new ApiRequestError(
        HttpStatus.BAD_REQUEST,
        "VALIDATION_ERROR",
        "Invalid incident category.",
        { category },
      );
    }
  }

  private assertValidSeverity(
    severity: string,
  ): asserts severity is IncidentRecord["severity"] {
    if (!INCIDENT_SEVERITY_VALUES.includes(severity as any)) {
      throw new ApiRequestError(
        HttpStatus.BAD_REQUEST,
        "VALIDATION_ERROR",
        "Invalid incident severity.",
        { severity },
      );
    }
  }

  private assertValidStatus(status: string): asserts status is IncidentStatus {
    if (!INCIDENT_STATUS_VALUES.includes(status as any)) {
      throw new ApiRequestError(
        HttpStatus.BAD_REQUEST,
        "VALIDATION_ERROR",
        "Invalid incident status.",
        { status },
      );
    }
  }

  private assertNonBlank(value: string, fieldName: string) {
    if (!value.trim()) {
      throw new ApiRequestError(
        HttpStatus.BAD_REQUEST,
        "VALIDATION_ERROR",
        `${fieldName} is required.`,
        { field: fieldName },
      );
    }
  }
}
