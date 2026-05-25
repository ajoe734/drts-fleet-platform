import { randomUUID } from "node:crypto";

import { HttpStatus, Injectable, OnModuleInit, Optional } from "@nestjs/common";

import type {
  AuditLogRecord,
  DriverMatchingSuppression,
  CreateIncidentCommand,
  CreateIncidentFromDispatchExceptionCommand,
  IncidentDetailReadModel,
  IncidentListReadModel,
  IncidentMatchingSuppressionCommand,
  IncidentRecord,
  IncidentStatus,
  IncidentTimelineEntry,
  ResourceActionDescriptor,
  RecordServiceRecoveryActionCommand,
  ServiceRecoveryActionRecord,
  UpdateIncidentCommand,
} from "@drts/contracts";

import { ApiRequestError } from "../../common/api-envelope";
import type { BootstrapRequestIdentity } from "../../common/auth";
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
  resolved: "incident_resolved",
  closed: "incident_closed",
  complaintLinked: "complaint_linked",
  escalationTargetSet: "escalation_target_set",
  severityEscalated: "severity_escalated",
  dispatchExceptionHandoff: "dispatch_exception_handoff",
  serviceRecoveryAction: "service_recovery_action",
  matchingSuppressionCreated: "matching_suppression_created",
  matchingSuppressionExtended: "matching_suppression_extended",
  matchingSuppressionLifted: "matching_suppression_lifted",
} as const;

const INCIDENT_REFRESH_STALE_AFTER_MS = 15_000;
const DEFAULT_SUPPRESSION_TTL_MS = 24 * 60 * 60 * 1000;

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
      escalationTarget: null,
      sourceDispatchExceptionOrderId: null,
      occurredAt: command.occurredAt ?? null,
      location: command.location ?? null,
      resolutionNote: null,
      serviceRecoveryActions: [],
      driverMatchingSuppression: this.createDefaultMatchingSuppression(
        incidentId,
        now,
      ),
      createdAt: now,
      updatedAt: now,
    };

    const timelineEntry = [
      this.createTimelineEntry(
        incidentId,
        TIMELINE_ACTIONS.created,
        `Incident reported by ${command.reportedBy}.`,
        "system",
        now,
      ),
      this.createTimelineEntry(
        incidentId,
        TIMELINE_ACTIONS.matchingSuppressionCreated,
        `Driver matching suppressed until ${incident.driverMatchingSuppression!.expiresAt}.`,
        "system",
        now,
      ),
    ];

    this.incidents = [incident, ...this.incidents];
    this.timelines.set(incidentId, timelineEntry);
    this.persist(
      { incidents: [incident], timelines: timelineEntry },
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

    return this.clone(incident);
  }

  listIncidents() {
    return this.incidents.map((i) => this.clone(i));
  }

  listIncidentReadModel(
    identity?: BootstrapRequestIdentity | null,
  ): IncidentListReadModel {
    const items = this.incidents.map((incident) =>
      this.toIncidentReadModel(incident, identity),
    );
    const generatedAt = new Date().toISOString();
    const readModel: IncidentListReadModel = {
      items,
      pageInfo: {
        page: 1,
        pageSize: items.length > 0 ? items.length : 20,
        totalItems: items.length,
        totalPages: items.length > 0 ? 1 : 0,
      },
      refresh: this.buildRefreshMetadata(generatedAt),
      health: this.buildHealthEnvelope(generatedAt),
    };

    if (items.length === 0) {
      readModel.emptyState = {
        reason: "no_data",
        messageCode: "incident.empty.no_data",
      };
    }

    return readModel;
  }

  getIncident(incidentId: string) {
    return this.clone(this.require(incidentId));
  }

  getIncidentDetail(
    incidentId: string,
    identity?: BootstrapRequestIdentity | null,
  ): IncidentDetailReadModel {
    const incident = this.require(incidentId);
    const generatedAt = new Date().toISOString();

    return {
      ...this.toIncidentReadModel(incident, identity),
      timeline: this.getTimeline(incidentId),
      serviceRecoveryActions: this.getServiceRecoveryActions(incidentId),
      auditLogs: this.auditNotificationService
        .getAuditLogsSnapshot()
        .filter(
          (log) =>
            log.resourceType === "incident" && log.resourceId === incidentId,
        ),
      refresh: this.buildRefreshMetadata(generatedAt),
      health: this.buildHealthEnvelope(generatedAt),
    };
  }

  updateIncident(
    incidentId: string,
    command: UpdateIncidentCommand,
    requestId?: string,
    identity?: BootstrapRequestIdentity | null,
  ) {
    const incident = this.require(incidentId);

    const updated = { ...incident, updatedAt: new Date().toISOString() };

    if (command.status !== undefined) {
      this.assertValidStatus(command.status);
      updated.status = command.status;
      this.appendTimelineEntry(
        incidentId,
        TIMELINE_ACTIONS.statusChanged,
        `Status changed to ${command.status}.`,
        "ops_user",
      );
      if (command.status === "resolved" || command.status === "closed") {
        this.applyMatchingSuppressionCommand(
          updated,
          { action: "lift" },
          identity,
          "system",
          true,
        );
      }
    }

    if (command.assignedTo !== undefined) {
      updated.assignedTo = command.assignedTo;
      this.appendTimelineEntry(
        incidentId,
        TIMELINE_ACTIONS.assigned,
        `Assigned to ${command.assignedTo}.`,
        "ops_user",
      );
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
    }

    if (command.resolutionNote !== undefined) {
      updated.resolutionNote = command.resolutionNote;
    }

    if (command.matchingSuppression) {
      this.applyMatchingSuppressionCommand(
        updated,
        command.matchingSuppression,
        identity,
      );
    }

    this.replace(updated);
    this.persist({ incidents: [updated] }, "update_incident");
    this.recordAudit(
      {
        actorId: null,
        actorType: "ops_user",
        tenantId: null,
        moduleName: "incident",
        actionName: "update_incident",
        resourceType: "incident",
        resourceId: incidentId,
        newValuesSummary: {
          status: updated.status,
          assignedTo: updated.assignedTo,
          resolutionNote: updated.resolutionNote,
          driverMatchingSuppression: updated.driverMatchingSuppression,
        },
      },
      requestId,
    );

    return this.clone(updated);
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
      return this.clone(incident);
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
    return this.clone(updated);
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
      escalationTarget: command.escalationTarget ?? null,
      sourceDispatchExceptionOrderId: command.orderId,
      occurredAt: now,
      location: null,
      resolutionNote: null,
      serviceRecoveryActions: [],
      driverMatchingSuppression: this.createDefaultMatchingSuppression(
        incidentId,
        now,
      ),
      createdAt: now,
      updatedAt: now,
    };

    const timelineEntry = [
      this.createTimelineEntry(
        incidentId,
        TIMELINE_ACTIONS.dispatchExceptionHandoff,
        `Incident created from dispatch exception on order ${command.orderId} (reason: ${command.exceptionReasonCode}).`,
        command.reportedBy,
        now,
      ),
      this.createTimelineEntry(
        incidentId,
        TIMELINE_ACTIONS.matchingSuppressionCreated,
        `Driver matching suppressed until ${incident.driverMatchingSuppression!.expiresAt}.`,
        "system",
        now,
      ),
    ];

    this.incidents = [incident, ...this.incidents];
    this.timelines.set(incidentId, timelineEntry);
    this.persist(
      { incidents: [incident], timelines: timelineEntry },
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

    return this.clone(incident);
  }

  recordServiceRecoveryAction(
    incidentId: string,
    command: RecordServiceRecoveryActionCommand,
    requestId?: string,
  ) {
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

    this.persist({ incidents: [updated] }, "record_service_recovery_action");
    this.recordAudit(
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

    return action;
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

  private buildRecoveryActionMap(incidents: readonly IncidentRecord[]) {
    const map = new Map<string, ServiceRecoveryActionRecord[]>();
    for (const incident of incidents) {
      map.set(
        incident.incidentId,
        incident.serviceRecoveryActions.map((action) => ({ ...action })),
      );
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

  private clone(incident: IncidentRecord) {
    return {
      ...incident,
      serviceRecoveryActions: incident.serviceRecoveryActions.map((a) => ({
        ...a,
      })),
      driverMatchingSuppression: incident.driverMatchingSuppression
        ? { ...incident.driverMatchingSuppression }
        : null,
    };
  }

  private createDefaultMatchingSuppression(
    incidentId: string,
    now: string,
  ): DriverMatchingSuppression {
    return {
      active: true,
      reasonCode: "incident",
      sourceIncidentId: incidentId,
      expiresAt: new Date(
        new Date(now).getTime() + DEFAULT_SUPPRESSION_TTL_MS,
      ).toISOString(),
      liftedAt: null,
    };
  }

  private applyMatchingSuppressionCommand(
    incident: IncidentRecord,
    command: IncidentMatchingSuppressionCommand,
    identity?: BootstrapRequestIdentity | null,
    actor = "ops_user",
    allowSystemLift = false,
  ) {
    const suppression =
      incident.driverMatchingSuppression ??
      this.createDefaultMatchingSuppression(
        incident.incidentId,
        incident.createdAt,
      );
    const now = incident.updatedAt;

    if (command.action === "extend") {
      if (!this.isOpsManager(identity)) {
        throw new ApiRequestError(
          HttpStatus.FORBIDDEN,
          "INCIDENT_MATCHING_SUPPRESSION_EXTENSION_FORBIDDEN",
          "Only ops_manager can extend incident matching suppression.",
        );
      }
      if (!command.expiresAt?.trim()) {
        throw new ApiRequestError(
          HttpStatus.BAD_REQUEST,
          "VALIDATION_ERROR",
          "expiresAt is required when extending matching suppression.",
          { field: "matchingSuppression.expiresAt" },
        );
      }
      const expiresAt = this.parseIsoTimestamp(
        command.expiresAt,
        "matchingSuppression.expiresAt",
      );
      const currentExpiresAt = this.parseIsoTimestamp(
        suppression.expiresAt,
        "driverMatchingSuppression.expiresAt",
      );
      if (expiresAt <= currentExpiresAt) {
        throw new ApiRequestError(
          HttpStatus.BAD_REQUEST,
          "VALIDATION_ERROR",
          "Extended matching suppression must expire after the current expiry.",
          {
            currentExpiresAt: suppression.expiresAt,
            requestedExpiresAt: command.expiresAt,
          },
        );
      }
      incident.driverMatchingSuppression = {
        ...suppression,
        active: true,
        expiresAt: expiresAt.toISOString(),
        liftedAt: null,
      };
      this.appendTimelineEntry(
        incident.incidentId,
        TIMELINE_ACTIONS.matchingSuppressionExtended,
        `Driver matching suppression extended until ${incident.driverMatchingSuppression.expiresAt}.`,
        identity?.actorId ?? actor,
        now,
      );
      return;
    }

    if (incident.driverMatchingSuppression?.liftedAt) {
      return;
    }

    incident.driverMatchingSuppression = {
      ...suppression,
      active: false,
      liftedAt: now,
    };
    this.appendTimelineEntry(
      incident.incidentId,
      TIMELINE_ACTIONS.matchingSuppressionLifted,
      allowSystemLift
        ? "Driver matching suppression lifted automatically by incident lifecycle."
        : "Driver matching suppression lifted manually.",
      identity?.actorId ?? actor,
      now,
    );
  }

  private parseIsoTimestamp(value: string, fieldName: string) {
    const parsed = new Date(value);
    if (Number.isNaN(parsed.getTime())) {
      throw new ApiRequestError(
        HttpStatus.BAD_REQUEST,
        "VALIDATION_ERROR",
        `${fieldName} must be a valid ISO-8601 timestamp.`,
        { field: fieldName, value },
      );
    }
    return parsed;
  }

  private isOpsManager(identity?: BootstrapRequestIdentity | null) {
    return Boolean(identity?.roles?.includes("ops_manager"));
  }

  private toIncidentReadModel(
    incident: IncidentRecord,
    identity?: BootstrapRequestIdentity | null,
  ) {
    return {
      ...this.clone(incident),
      driverMatchingSuppression: incident.driverMatchingSuppression
        ? { ...incident.driverMatchingSuppression }
        : null,
      availableActions: this.buildAvailableActions(incident, identity),
    };
  }

  private buildAvailableActions(
    incident: IncidentRecord,
    identity?: BootstrapRequestIdentity | null,
  ): ResourceActionDescriptor[] {
    const actions: ResourceActionDescriptor[] = [];
    const suppression = incident.driverMatchingSuppression;
    const isOpsManager = this.isOpsManager(identity);

    if (suppression?.active) {
      actions.push({
        action: "lift_matching_suppression",
        enabled: true,
        requiresReason: true,
        riskLevel: "high",
      });
      const extendAction: ResourceActionDescriptor = {
        action: "extend_matching_suppression",
        enabled: isOpsManager,
        requiresReason: true,
        riskLevel: "high",
      };
      if (!isOpsManager) {
        extendAction.disabledReasonCode = "ops_manager_required";
      }
      actions.push(extendAction);
    }

    if (incident.status !== "resolved" && incident.status !== "closed") {
      actions.push({
        action: "resolve_incident",
        enabled: true,
        requiresReason: true,
        riskLevel: "medium",
      });
    }

    return actions;
  }

  private buildRefreshMetadata(generatedAt: string) {
    return {
      generatedAt,
      staleAfterMs: INCIDENT_REFRESH_STALE_AFTER_MS,
      dataFreshness: "fresh" as const,
      source: "live" as const,
    };
  }

  private buildHealthEnvelope(lastCheckedAt: string) {
    return {
      status: "healthy" as const,
      degradedServices: [],
      lastCheckedAt,
    };
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
    this.auditNotificationService.recordAuditLog(log);
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
