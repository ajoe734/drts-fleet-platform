import { randomUUID } from "node:crypto";

import { HttpStatus, Injectable, OnModuleInit, Optional } from "@nestjs/common";

import type {
  AuditLogRecord,
  CreateIncidentCommand,
  CreateIncidentFromDispatchExceptionCommand,
  EmptyReason,
  EmptyStateEnvelope,
  IncidentRecord,
  IncidentStatus,
  IncidentTimelineEntry,
  RecordServiceRecoveryActionCommand,
  ResourceActionDescriptor,
  ServiceRecoveryActionRecord,
  UiCollectionEnvelope,
  UiRefreshMetadata,
  UpdateIncidentCommand,
} from "@drts/contracts";

import { ApiRequestError } from "../../common/api-envelope";
import type { BootstrapRequestIdentity } from "../../common/auth";
import { AuditNotificationService } from "../audit-notification/audit-notification.service";
import { IncidentRepository } from "./incident.repository";

const DRIVER_MATCHING_SUPPRESSION_DEFAULT_TTL_MS = 24 * 60 * 60 * 1000;
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
  suppressionActivated: "matching_suppression_activated",
  suppressionExtended: "matching_suppression_extended",
  suppressionLifted: "matching_suppression_lifted",
} as const;

const INCIDENT_CENTER_EMPTY_REASON_OVERRIDES = [
  "no_data",
  "not_provisioned",
  "fetch_failed",
  "permission_denied",
  "external_unavailable",
] as const satisfies readonly EmptyReason[];
type IncidentCenterEmptyReason =
  (typeof INCIDENT_CENTER_EMPTY_REASON_OVERRIDES)[number];

@Injectable()
export class IncidentService implements OnModuleInit {
  private incidentSequence = 1;
  private incidents: IncidentRecord[] = [];
  private timelines = new Map<string, IncidentTimelineEntry[]>();
  private recoveryActions = new Map<string, ServiceRecoveryActionRecord[]>();
  private suppressions = new Map<string, DriverMatchingSuppression>();

  constructor(
    private readonly auditNotificationService: AuditNotificationService,
    @Optional() private readonly incidentRepository?: IncidentRepository,
  ) {}

  async onModuleInit() {
    if (!this.incidentRepository) return;

    try {
      const state = await this.incidentRepository.loadState();
      if (
        state.incidents.length === 0 &&
        state.timelines.length === 0 &&
        state.suppressions.length === 0
      ) {
        return;
      }

      this.incidents = state.incidents.map((incident) =>
        this.decorateIncident(incident),
      );
      this.timelines = this.buildTimelineMap(state.timelines);
      this.recoveryActions = this.buildRecoveryActionMap(state.incidents);
      this.incidentSequence = this.deriveNextSequence(state.incidents);
      this.hydrateSuppressions(state.suppressions);
    } catch (error) {
      this.incidentRepository.reportPersistenceFailure(error, "module init");
    }
  }

  createIncident(
    command: CreateIncidentCommand,
    requestId?: string,
    identity: BootstrapRequestIdentity | null = null,
  ) {
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
      matchingSuppression: null,
      availableActions: [],
      createdAt: now,
      updatedAt: now,
    };

    const timelineEntries = [
      this.createTimelineEntry(
        incidentId,
        TIMELINE_ACTIONS.created,
        `Incident reported by ${command.reportedBy}.`,
        this.resolveActorId(identity, command.reportedBy),
        now,
      ),
    ];

    const suppressionWrite = this.maybeActivateSuppression(incident, now);
    if (suppressionWrite) {
      timelineEntries.push(
        this.createTimelineEntry(
          incidentId,
          TIMELINE_ACTIONS.suppressionActivated,
          `Driver ${suppressionWrite.driverId} matching suppressed until ${suppressionWrite.suppression.expiresAt}.`,
          this.resolveActorId(identity, command.reportedBy),
          now,
        ),
      );
    }

    const decorated = this.decorateIncident(incident, identity);
    this.incidents = [decorated, ...this.incidents];
    this.timelines.set(incidentId, timelineEntries);
    this.persist(
      {
        incidents: [decorated],
        timelines: timelineEntries,
        ...(suppressionWrite ? { suppressions: [suppressionWrite] } : {}),
      },
      "create_incident",
    );
    this.recordAudit(
      {
        actorId: this.resolveActorId(identity, command.reportedBy),
        actorType: this.resolveAuditActorType(identity, "system"),
        tenantId: identity?.tenantId ?? null,
        moduleName: "incident",
        actionName: "create_incident",
        resourceType: "incident",
        resourceId: incidentId,
        newValuesSummary: {
          category: command.category,
          severity: command.severity,
          status: decorated.status,
          relatedOrderId: command.relatedOrderId,
          relatedVehicleId: command.relatedVehicleId,
          relatedDriverId: command.relatedDriverId,
          matchingSuppression: suppressionWrite?.suppression ?? null,
        },
      },
      requestId,
    );

    return this.toView(incident);
  }

  listIncidents() {
    return this.incidents.map((i) => this.toView(i));
  }

  getIncidentCenterFeed(input?: {
    emptyReason?: string;
    dispatchExceptionOrderId?: string;
    exceptionReasonCode?: string;
  }): UiCollectionEnvelope<IncidentRecord> {
    const emptyReason = this.resolveEmptyReasonOverride(input?.emptyReason);
    const refreshMetadata: UiRefreshMetadata = {
      generatedAt: new Date().toISOString(),
      staleAfterMs: 15_000,
      dataFreshness:
        emptyReason === "fetch_failed" || emptyReason === "external_unavailable"
          ? "degraded"
          : "fresh",
      source: "live" as const,
    };
    const availableActions = this.buildPageActions(input);

    if (emptyReason) {
      return {
        items: [],
        refreshMetadata,
        availableActions,
        emptyState: this.buildEmptyState(emptyReason),
      };
    }

    const items = this.incidents.map((incident) => this.toView(incident));

    return {
      items,
      refreshMetadata,
      availableActions,
      ...(items.length === 0
        ? { emptyState: this.buildEmptyState("no_data") }
        : {}),
    };
  }

  getIncident(incidentId: string) {
    return this.toView(this.require(incidentId));
  }

  updateIncident(
    incidentId: string,
    command: UpdateIncidentCommand,
    requestId?: string,
    identity: BootstrapRequestIdentity | null = null,
  ) {
    const incident = this.require(incidentId);
    const now = new Date().toISOString();
    const updated: IncidentRecord = { ...incident, updatedAt: now };
    const timelineEntries: IncidentTimelineEntry[] = [];
    let suppressionWrite: PersistSuppressionRecord | null = null;

    if (command.status !== undefined) {
      this.assertValidStatus(command.status);
      updated.status = command.status;
      timelineEntries.push(
        this.createTimelineEntry(
          incidentId,
          TIMELINE_ACTIONS.statusChanged,
          `Status changed to ${command.status}.`,
          this.resolveActorId(identity, "ops_user"),
          now,
        ),
      );
      if (command.status === "resolved") {
        timelineEntries.push(
          this.createTimelineEntry(
            incidentId,
            TIMELINE_ACTIONS.resolved,
            "Incident resolved.",
            this.resolveActorId(identity, "ops_user"),
            now,
          ),
        );
      }
      if (command.status === "closed") {
        timelineEntries.push(
          this.createTimelineEntry(
            incidentId,
            TIMELINE_ACTIONS.closed,
            "Incident closed.",
            this.resolveActorId(identity, "ops_user"),
            now,
          ),
        );
      }
    }

    if (command.assignedTo !== undefined) {
      updated.assignedTo = command.assignedTo;
      timelineEntries.push(
        this.createTimelineEntry(
          incidentId,
          TIMELINE_ACTIONS.assigned,
          `Assigned to ${command.assignedTo}.`,
          this.resolveActorId(identity, "ops_user"),
          now,
        ),
      );
    }

    if (command.severity !== undefined) {
      this.assertValidSeverity(command.severity);
      const oldSeverity = updated.severity;
      updated.severity = command.severity;
      if (oldSeverity !== command.severity) {
        timelineEntries.push(
          this.createTimelineEntry(
            incidentId,
            TIMELINE_ACTIONS.severityEscalated,
            `Severity changed from ${oldSeverity} to ${command.severity}.`,
            this.resolveActorId(identity, "ops_user"),
            now,
          ),
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
      timelineEntries.push(
        this.createTimelineEntry(
          incidentId,
          TIMELINE_ACTIONS.escalationTargetSet,
          command.escalationTarget
            ? `Escalation target set to ${command.escalationTarget}.`
            : "Escalation target cleared.",
          this.resolveActorId(identity, "ops_user"),
          now,
        ),
      );
    }

    if (command.resolutionNote !== undefined) {
      updated.resolutionNote = command.resolutionNote;
    }

    if (
      (updated.status === "resolved" || updated.status === "closed") &&
      updated.matchingSuppression?.active
    ) {
      suppressionWrite = this.liftSuppression(updated, now);
      timelineEntries.push(
        this.createTimelineEntry(
          incidentId,
          TIMELINE_ACTIONS.suppressionLifted,
          `Driver matching suppression lifted because incident ${updated.status}.`,
          this.resolveActorId(identity, "system.incident"),
          now,
        ),
      );
    }

    const decorated = this.decorateIncident(updated, identity);
    this.replace(decorated);
    if (timelineEntries.length > 0) {
      this.timelines.set(incidentId, [
        ...(this.timelines.get(incidentId) ?? []),
        ...timelineEntries,
      ]);
    }
    this.persist(
      {
        incidents: [decorated],
        timelines: timelineEntries,
        ...(suppressionWrite ? { suppressions: [suppressionWrite] } : {}),
      },
      "update_incident",
    );
    this.recordAudit(
      {
        actorId: identity?.actorId ?? null,
        actorType: this.resolveAuditActorType(identity, "ops_user"),
        tenantId: identity?.tenantId ?? null,
        moduleName: "incident",
        actionName: "update_incident",
        resourceType: "incident",
        resourceId: incidentId,
        newValuesSummary: {
          status: decorated.status,
          assignedTo: decorated.assignedTo,
          resolutionNote: decorated.resolutionNote,
          matchingSuppression: decorated.matchingSuppression,
        },
      },
      requestId,
    );

    return this.toView(updated);
  }

  linkComplaint(
    incidentId: string,
    complaintCaseNo: string,
    requestId?: string,
    identity: BootstrapRequestIdentity | null = null,
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
      return this.toView(incident);
    }

    const updated = this.decorateIncident(
      {
        ...incident,
        relatedComplaintCaseNo: normalizedComplaintCaseNo,
        updatedAt: new Date().toISOString(),
      },
      identity,
    );

    this.replace(updated);
    const timelineEntry = this.createTimelineEntry(
      incidentId,
      TIMELINE_ACTIONS.complaintLinked,
      `Linked to complaint case ${normalizedComplaintCaseNo}.`,
      this.resolveActorId(identity, "ops_user"),
      updated.updatedAt,
    );
    this.timelines.set(incidentId, [
      ...(this.timelines.get(incidentId) ?? []),
      timelineEntry,
    ]);
    this.persist(
      { incidents: [updated], timelines: [timelineEntry] },
      "link_complaint",
    );
    this.recordAudit(
      {
        actorId: identity?.actorId ?? null,
        actorType: this.resolveAuditActorType(identity, "ops_user"),
        tenantId: identity?.tenantId ?? null,
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
    return this.toView(updated);
  }

  getTimeline(incidentId: string) {
    this.require(incidentId);
    return (this.timelines.get(incidentId) ?? []).map((entry) => ({
      ...entry,
    }));
  }

  createFromDispatchException(
    command: CreateIncidentFromDispatchExceptionCommand,
    requestId?: string,
    identity: BootstrapRequestIdentity | null = null,
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
      matchingSuppression: null,
      availableActions: [],
      createdAt: now,
      updatedAt: now,
    };

    const timelineEntry = this.createTimelineEntry(
      incidentId,
      TIMELINE_ACTIONS.dispatchExceptionHandoff,
      `Incident created from dispatch exception on order ${command.orderId} (reason: ${command.exceptionReasonCode}).`,
      this.resolveActorId(identity, command.reportedBy),
      now,
    );

    const decorated = this.decorateIncident(incident, identity);
    this.incidents = [decorated, ...this.incidents];
    this.timelines.set(incidentId, [timelineEntry]);
    this.persist(
      { incidents: [decorated], timelines: [timelineEntry] },
      "create_from_dispatch_exception",
    );
    this.recordAudit(
      {
        actorId: this.resolveActorId(identity, command.reportedBy),
        actorType: this.resolveAuditActorType(identity, "ops_user"),
        tenantId: identity?.tenantId ?? null,
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

    return this.toView(incident);
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

    const updated = this.decorateIncident({
      ...incident,
      serviceRecoveryActions: this.recoveryActions
        .get(incidentId)!
        .map((entry) => ({ ...entry })),
      updatedAt: now,
    });
    this.replace(updated);

    const timelineEntry = this.createTimelineEntry(
      incidentId,
      TIMELINE_ACTIONS.serviceRecoveryAction,
      `Service recovery: ${command.actionType} - ${command.note}`,
      command.actor,
      now,
    );
    this.timelines.set(incidentId, [
      ...(this.timelines.get(incidentId) ?? []),
      timelineEntry,
    ]);

    this.persist(
      { incidents: [updated], timelines: [timelineEntry] },
      "record_service_recovery_action",
    );
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

    return { ...action };
  }

  extendMatchingSuppression(
    incidentId: string,
    command: ExtendDriverMatchingSuppressionCommand,
    identity: BootstrapRequestIdentity | null = null,
    requestId?: string,
  ) {
    this.requireOpsManager(identity);
    this.assertNonBlank(command.reason, "reason");

    const incident = this.require(incidentId);
    const activeSuppression = incident.matchingSuppression;
    if (!incident.relatedDriverId || !activeSuppression?.active) {
      throw new ApiRequestError(
        HttpStatus.CONFLICT,
        "MATCHING_SUPPRESSION_NOT_ACTIVE",
        "This incident does not have an active driver matching suppression.",
        { incidentId },
      );
    }

    const nextExpiry = this.resolveSuppressionExpiry(
      activeSuppression,
      command,
    );
    const now = new Date().toISOString();
    const updatedSuppression: DriverMatchingSuppression = {
      ...activeSuppression,
      expiresAt: nextExpiry,
    };

    this.suppressions.set(incidentId, { ...updatedSuppression });
    const updated = this.decorateIncident(
      {
        ...incident,
        matchingSuppression: updatedSuppression,
        updatedAt: now,
      },
      identity,
    );
    this.replace(updated);

    const timelineEntry = this.createTimelineEntry(
      incidentId,
      TIMELINE_ACTIONS.suppressionExtended,
      `Driver matching suppression extended until ${nextExpiry}: ${command.reason}`,
      this.resolveActorId(identity, "ops_manager"),
      now,
    );
    this.timelines.set(incidentId, [
      ...(this.timelines.get(incidentId) ?? []),
      timelineEntry,
    ]);

    this.persist(
      {
        incidents: [updated],
        timelines: [timelineEntry],
        suppressions: [
          {
            incidentId,
            driverId: incident.relatedDriverId,
            updatedAt: now,
            suppression: updatedSuppression,
          },
        ],
      },
      "extend_matching_suppression",
    );
    this.recordAudit(
      {
        actorId: identity?.actorId ?? null,
        actorType: this.resolveAuditActorType(identity, "ops_user"),
        tenantId: identity?.tenantId ?? null,
        moduleName: "incident",
        actionName: "extend_matching_suppression",
        resourceType: "incident",
        resourceId: incidentId,
        newValuesSummary: {
          expiresAt: nextExpiry,
          reason: command.reason,
        },
      },
      requestId,
    );

    return this.cloneIncident(updated);
  }

  getServiceRecoveryActions(incidentId: string) {
    this.require(incidentId);
    return (this.recoveryActions.get(incidentId) ?? []).map((action) => ({
      ...action,
    }));
  }

  private hydrateSuppressions(
    suppressions: readonly DriverMatchingSuppression[],
  ) {
    for (const suppression of suppressions) {
      if (!suppression.sourceIncidentId) {
        continue;
      }
      this.suppressions.set(suppression.sourceIncidentId, { ...suppression });
      const incident = this.incidents.find(
        (candidate) => candidate.incidentId === suppression.sourceIncidentId,
      );
      if (!incident?.relatedDriverId) continue;
    }
    this.incidents = this.incidents.map((incident) =>
      this.decorateIncident(incident),
    );
  }

  private require(incidentId: string) {
    const incident = this.incidents.find(
      (candidate) => candidate.incidentId === incidentId,
    );
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
    this.incidents = this.incidents.map((incident) =>
      incident.incidentId === updated.incidentId ? updated : incident,
    );
  }

  private nextIncidentId() {
    const seq = this.incidentSequence++;
    return `INC-${String(seq).padStart(6, "0")}`;
  }

  private deriveNextSequence(incidents: readonly IncidentRecord[]) {
    const maxSeq = incidents.reduce((max, incident) => {
      const num = Number.parseInt(incident.incidentId.replace("INC-", ""), 10);
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
      if (incident.serviceRecoveryActions.length > 0) {
        map.set(
          incident.incidentId,
          incident.serviceRecoveryActions.map((action) => ({ ...action })),
        );
      }
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

  private cloneIncident(incident: IncidentRecord): IncidentRecord {
    return {
      ...incident,
      serviceRecoveryActions: incident.serviceRecoveryActions.map((action) => ({
        ...action,
      })),
      matchingSuppression: incident.matchingSuppression
        ? { ...incident.matchingSuppression }
        : null,
      ...(incident.availableActions
        ? {
            availableActions: incident.availableActions.map((action) => ({
              ...action,
            })),
          }
        : {}),
    };
  }

  private toView(incident: IncidentRecord): IncidentRecord {
    return {
      ...this.clone(incident),
      availableActions: this.buildIncidentActions(incident),
    };
  }

  private clone(incident: IncidentRecord) {
    return { ...incident };
  }

  private buildIncidentActions(
    incident: IncidentRecord,
  ): ResourceActionDescriptor[] {
    const actions: ResourceActionDescriptor[] = [
      {
        action: "open_incident_detail",
        enabled: true,
        riskLevel: "low",
      },
    ];

    if (
      (incident.status === "open" || incident.status === "investigating") &&
      incident.serviceRecoveryActions.length === 0
    ) {
      actions.push({
        action: "add_service_recovery",
        enabled: true,
        riskLevel: "medium",
      });
    }

    return actions;
  }

  private buildPageActions(input?: {
    dispatchExceptionOrderId?: string;
    exceptionReasonCode?: string;
  }): ResourceActionDescriptor[] {
    const hasDispatchContext = Boolean(
      input?.dispatchExceptionOrderId?.trim() &&
      input?.exceptionReasonCode?.trim(),
    );

    return [
      {
        action: "create_incident",
        enabled: true,
        riskLevel: "medium",
      },
      {
        action: "create_incident_from_dispatch_exception",
        enabled: hasDispatchContext,
        ...(!hasDispatchContext
          ? { disabledReasonCode: "dispatch_context_required" }
          : {}),
        riskLevel: "medium",
      },
      {
        action: "refresh_incidents",
        enabled: true,
        riskLevel: "low",
      },
    ];
  }

  private buildEmptyState(
    reason: IncidentCenterEmptyReason,
  ): EmptyStateEnvelope {
    switch (reason) {
      case "not_provisioned":
        return {
          reason,
          messageCode: "incidents.empty.not_provisioned",
          nextAction: {
            action: "open_feature_flags",
            enabled: true,
            riskLevel: "low",
          },
        };
      case "permission_denied":
        return {
          reason,
          messageCode: "incidents.empty.permission_denied",
          nextAction: {
            action: "open_dashboard",
            enabled: true,
            riskLevel: "low",
          },
        };
      case "external_unavailable":
        return {
          reason,
          messageCode: "incidents.empty.external_unavailable",
          nextAction: {
            action: "refresh_incidents",
            enabled: true,
            riskLevel: "low",
          },
        };
      case "fetch_failed":
        return {
          reason,
          messageCode: "incidents.empty.fetch_failed",
          nextAction: {
            action: "refresh_incidents",
            enabled: true,
            riskLevel: "low",
          },
        };
      case "no_data":
      default:
        return {
          reason,
          messageCode: "incidents.empty.no_data",
          nextAction: {
            action: "create_incident",
            enabled: true,
            riskLevel: "medium",
          },
        };
    }
  }

  private resolveEmptyReasonOverride(
    value?: string,
  ): IncidentCenterEmptyReason | null {
    if (!value) {
      return null;
    }

    return INCIDENT_CENTER_EMPTY_REASON_OVERRIDES.includes(
      value as IncidentCenterEmptyReason,
    )
      ? (value as IncidentCenterEmptyReason)
      : null;
  }

  private persist(
    changes: {
      incidents?: readonly IncidentRecord[];
      timelines?: readonly IncidentTimelineEntry[];
      suppressions?: readonly PersistSuppressionRecord[];
    },
    context: string,
  ) {
    if (!this.incidentRepository) return;
    void this.incidentRepository
      .persistChanges({
        ...(changes.incidents
          ? {
              incidents: changes.incidents.map((incident) =>
                this.cloneIncident(incident),
              ),
            }
          : {}),
        ...(changes.timelines
          ? {
              timelines: changes.timelines.map((entry) => ({ ...entry })),
            }
          : {}),
        ...(changes.suppressions
          ? {
              suppressions: changes.suppressions.map((entry) => ({
                ...entry,
                suppression: { ...entry.suppression },
              })),
            }
          : {}),
      })
      .catch((error: unknown) => {
        this.incidentRepository!.reportPersistenceFailure(error, context);
      });
  }

  private recordAudit(
    input: Omit<AuditLogRecord, "auditId" | "createdAt" | "requestId">,
    requestId?: string,
  ) {
    const log = { ...input };
    if (requestId) {
      (log as { requestId?: string }).requestId = requestId;
    }
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
