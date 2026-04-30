import { randomUUID } from "node:crypto";

import { HttpStatus, Injectable, OnModuleInit, Optional } from "@nestjs/common";

import type {
  AuditLogRecord,
  CreateIncidentCommand,
  IncidentRecord,
  IncidentStatus,
  IncidentTimelineEntry,
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

const TIMELINE_ACTIONS = {
  created: "incident_created",
  statusChanged: "status_changed",
  assigned: "incident_assigned",
  resolved: "incident_resolved",
  closed: "incident_closed",
  complaintLinked: "complaint_linked",
} as const;

@Injectable()
export class IncidentService implements OnModuleInit {
  private incidentSequence = 1;
  private incidents: IncidentRecord[] = [];
  private timelines = new Map<string, IncidentTimelineEntry[]>();

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
      occurredAt: command.occurredAt ?? null,
      location: command.location ?? null,
      resolutionNote: null,
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

    return this.clone(incident);
  }

  listIncidents() {
    return this.incidents.map((i) => this.clone(i));
  }

  getIncident(incidentId: string) {
    return this.clone(this.require(incidentId));
  }

  updateIncident(
    incidentId: string,
    command: UpdateIncidentCommand,
    requestId?: string,
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

    if (command.resolutionNote !== undefined) {
      updated.resolutionNote = command.resolutionNote;
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

  private clone(incident: IncidentRecord) {
    return { ...incident };
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
