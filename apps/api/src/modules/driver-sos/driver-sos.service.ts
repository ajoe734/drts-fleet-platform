import { randomUUID } from "node:crypto";

import { HttpStatus, Injectable, OnModuleInit, Optional } from "@nestjs/common";

import type {
  AuditLogRecord,
  DriverMatchingSuppression,
  DriverSosEventRecord,
  DriverSosEventType,
  DriverSosSeverity,
  DriverSosTimelineEntry,
  DriverSosUrgentAlertOutboxRecord,
  IncidentCategory,
  IncidentRecord,
  IncidentSeverity,
  IncidentTimelineEntry,
  SubmitDriverSosEventCommand,
  SubmitDriverSosEventResult,
} from "@drts/contracts";

import { ApiRequestError } from "../../common/api-envelope";
import type { BootstrapRequestIdentity } from "../../common/auth";
import { AuditNotificationService } from "../audit-notification/audit-notification.service";
import { IncidentService } from "../incident/incident.service";
import {
  type DriverSosRepositoryState,
  type PersistDriverSosSubmission,
  type PersistDriverSosSubmissionResult,
  DriverSosRepository,
} from "./driver-sos.repository";

const UUID_V4_PATTERN =
  /^[0-9a-f]{8}-[0-9a-f]{4}-4[0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;
const DRIVER_MATCHING_SUPPRESSION_DEFAULT_TTL_MS = 24 * 60 * 60 * 1000;
const DRIVER_SOS_EVENT_TYPES: DriverSosEventType[] = [
  "traffic_accident",
  "security_incident",
  "passenger_medical",
  "other",
];
const DRIVER_SOS_SEVERITIES: DriverSosSeverity[] = ["major", "normal"];

@Injectable()
export class DriverSosService implements OnModuleInit {
  private events: DriverSosEventRecord[] = [];
  private eventById = new Map<string, DriverSosEventRecord>();
  private eventIdByDriverClientKey = new Map<string, string>();
  private timelines = new Map<string, DriverSosTimelineEntry[]>();
  private urgentAlertOutbox = new Map<string, DriverSosUrgentAlertOutboxRecord>();

  constructor(
    private readonly auditNotificationService: AuditNotificationService,
    private readonly incidentService: IncidentService,
    @Optional() private readonly repository?: DriverSosRepository,
  ) {}

  async onModuleInit() {
    if (!this.repository) {
      return;
    }

    try {
      const state = await this.repository.loadState();
      this.hydrateState(state);
    } catch (error) {
      this.repository.reportPersistenceFailure(error, "module init");
    }
  }

  async submitSosEvent(
    command: SubmitDriverSosEventCommand,
    identity: BootstrapRequestIdentity | null,
    requestId?: string,
  ): Promise<SubmitDriverSosEventResult> {
    const driverId = this.requireDriverIdentity(identity);
    const clientEventId = this.normalizeRequired(
      command.clientEventId,
      "clientEventId",
    );
    this.assertUuid(clientEventId, "clientEventId");

    const key = this.buildDriverClientKey(driverId, clientEventId);
    const existingEventId = this.eventIdByDriverClientKey.get(key);
    if (existingEventId) {
      const existingEvent = this.requireEvent(existingEventId);
      this.recordAudit(
        {
          event: existingEvent,
          duplicate: true,
        },
        identity,
        requestId,
      );
      return this.buildResult(existingEvent, true);
    }

    const now = new Date().toISOString();
    const originalTriggeredAt = this.normalizeIsoTimestamp(
      command.originalTriggeredAt,
      "originalTriggeredAt",
    );
    const eventType = this.normalizeEventType(command.eventType);
    const severity = this.normalizeSeverity(command.severity);
    const description = this.normalizeNullable(command.description);
    const location = this.normalizeLocation(command.location);

    const incidentId = this.incidentService.allocateIncidentId();
    const event: DriverSosEventRecord = {
      sosEventId: randomUUID(),
      clientEventId,
      eventNo: this.nextEventNo(now),
      incidentId,
      driverId,
      vehicleId: this.normalizeNullable(command.vehicleId),
      plateNo: this.normalizeNullable(command.plateNo),
      orderId: this.normalizeNullable(command.orderId),
      taskId: this.normalizeNullable(command.taskId),
      status: "submitted",
      eventType,
      severity,
      description,
      location,
      originalTriggeredAt,
      serverReceivedAt: now,
      offlineAtTrigger: command.offlineAtTrigger,
      falseAlarm: {
        dismissed: false,
        dismissedAt: null,
        dismissedByDriverId: null,
        note: null,
      },
      dutyAcknowledgement: {
        acknowledgedAt: null,
        acknowledgedByActorId: null,
      },
      createdAt: now,
      updatedAt: now,
    };

    const incident = this.buildIncident(event, incidentId, now);
    const incidentTimeline = this.buildIncidentTimeline(event, incidentId, now);
    const urgentAlertOutbox = this.buildUrgentAlertOutbox(event, now);
    const sosTimeline = this.buildSosTimeline(event, urgentAlertOutbox, now);

    const submission: PersistDriverSosSubmission = {
      event,
      sosTimelines: [sosTimeline],
      urgentAlertOutbox,
      incident,
      incidentTimelines: [incidentTimeline],
    };
    const persisted =
      this.repository?.isEnabled() === true
        ? await this.repository.persistSubmission(submission)
        : {
            ...submission,
            duplicate: false,
          };

    this.hydrateSubmission(persisted, identity);
    this.recordAudit(persisted, identity, requestId);

    return this.buildResult(persisted.event, persisted.duplicate);
  }

  private hydrateState(state: DriverSosRepositoryState) {
    this.events = [];
    this.eventById.clear();
    this.eventIdByDriverClientKey.clear();
    this.timelines.clear();
    this.urgentAlertOutbox.clear();

    for (const event of state.events) {
      const cloned = this.cloneEvent(event);
      this.events.push(cloned);
      this.eventById.set(cloned.sosEventId, cloned);
      this.eventIdByDriverClientKey.set(
        this.buildDriverClientKey(cloned.driverId, cloned.clientEventId),
        cloned.sosEventId,
      );
    }

    for (const timeline of state.timelines) {
      const existing = this.timelines.get(timeline.sosEventId) ?? [];
      this.timelines.set(timeline.sosEventId, [
        ...existing,
        this.cloneTimeline(timeline),
      ]);
    }

    for (const outbox of state.urgentAlertOutbox) {
      this.urgentAlertOutbox.set(outbox.sosEventId, this.cloneOutbox(outbox));
    }
  }

  private hydrateSubmission(
    submission: PersistDriverSosSubmissionResult,
    identity: BootstrapRequestIdentity | null,
  ) {
    const event = this.cloneEvent(submission.event);
    const existingEvent = this.eventById.get(event.sosEventId);
    if (existingEvent) {
      this.eventById.set(event.sosEventId, event);
      this.events = this.events.map((candidate) =>
        candidate.sosEventId === event.sosEventId ? event : candidate,
      );
    } else {
      this.eventById.set(event.sosEventId, event);
      this.events = [event, ...this.events];
    }

    this.eventIdByDriverClientKey.set(
      this.buildDriverClientKey(event.driverId, event.clientEventId),
      event.sosEventId,
    );
    this.timelines.set(
      event.sosEventId,
      submission.sosTimelines.map((entry) => this.cloneTimeline(entry)),
    );
    this.urgentAlertOutbox.set(
      event.sosEventId,
      this.cloneOutbox(submission.urgentAlertOutbox),
    );

    this.incidentService.registerPersistedIncident(
      submission.incident,
      submission.incidentTimelines,
      identity,
    );
  }

  private requireDriverIdentity(identity: BootstrapRequestIdentity | null) {
    if (identity?.realm === "driver" && identity.actorId) {
      return identity.actorId;
    }

    throw new ApiRequestError(
      HttpStatus.FORBIDDEN,
      "DRIVER_REALM_REQUIRED",
      "Driver SOS submissions must use an authenticated driver bearer context.",
    );
  }

  private buildIncident(
    event: DriverSosEventRecord,
    incidentId: string,
    now: string,
  ): IncidentRecord {
    const suppression = this.buildSuppression(incidentId, event.driverId, now);
    return {
      incidentId,
      title: this.buildIncidentTitle(event),
      description:
        event.description ??
        `Driver SOS ${event.eventNo} submitted from the driver app.`,
      category: this.mapIncidentCategory(event.eventType),
      severity: this.mapIncidentSeverity(event.severity),
      status: "open",
      relatedOrderId: event.orderId,
      relatedVehicleId: event.vehicleId,
      relatedDriverId: event.driverId,
      relatedComplaintCaseNo: null,
      reportedBy: event.driverId,
      assignedTo: null,
      escalationTarget: null,
      sourceDispatchExceptionOrderId: null,
      occurredAt: event.originalTriggeredAt,
      location: this.formatIncidentLocation(event),
      resolutionNote: null,
      serviceRecoveryActions: [],
      matchingSuppression: suppression,
      availableActions: [],
      createdAt: now,
      updatedAt: now,
    };
  }

  private buildIncidentTimeline(
    event: DriverSosEventRecord,
    incidentId: string,
    now: string,
  ): IncidentTimelineEntry {
    return {
      entryId: `inc-timeline-${randomUUID()}`,
      incidentId,
      action: "incident_created",
      note: `Correlated from driver SOS event ${event.eventNo}.`,
      actor: event.driverId,
      createdAt: now,
    };
  }

  private buildSosTimeline(
    event: DriverSosEventRecord,
    urgentAlertOutbox: DriverSosUrgentAlertOutboxRecord,
    now: string,
  ): DriverSosTimelineEntry {
    return {
      timelineId: randomUUID(),
      sosEventId: event.sosEventId,
      eventType: "incident_created",
      actorType: "system",
      actorId: "system.driver-sos",
      occurredAt: now,
      recordedAt: now,
      payload: {
        incidentId: event.incidentId,
        eventNo: event.eventNo,
        urgentAlertOutboxId: urgentAlertOutbox.outboxId,
        urgentAlertStatus: urgentAlertOutbox.status,
      },
    };
  }

  private buildUrgentAlertOutbox(
    event: DriverSosEventRecord,
    now: string,
  ): DriverSosUrgentAlertOutboxRecord {
    if (!event.incidentId) {
      throw new Error("Driver SOS event is missing incident correlation.");
    }

    return {
      outboxId: randomUUID(),
      sosEventId: event.sosEventId,
      incidentId: event.incidentId,
      driverId: event.driverId,
      eventNo: event.eventNo,
      status: "pending",
      attemptCount: 0,
      nextAttemptAt: now,
      payload: {
        priority: "urgent",
        eventNo: event.eventNo,
        incidentId: event.incidentId,
        driverId: event.driverId,
        vehicleId: event.vehicleId,
        plateNo: event.plateNo,
        orderId: event.orderId,
        taskId: event.taskId,
        eventType: event.eventType,
        severity: event.severity,
        description: event.description,
        location: event.location,
        originalTriggeredAt: event.originalTriggeredAt,
        serverReceivedAt: event.serverReceivedAt,
      },
      createdAt: now,
      deliveredAt: null,
    };
  }

  private buildSuppression(
    incidentId: string,
    driverId: string,
    now: string,
  ): DriverMatchingSuppression {
    return {
      active: true,
      reasonCode: "incident",
      sourceIncidentId: incidentId,
      expiresAt: new Date(
        new Date(now).getTime() + DRIVER_MATCHING_SUPPRESSION_DEFAULT_TTL_MS,
      ).toISOString(),
      liftedAt: null,
    };
  }

  private buildIncidentTitle(event: DriverSosEventRecord) {
    const label =
      event.eventType === "traffic_accident"
        ? "Traffic accident"
        : event.eventType === "security_incident"
          ? "Security incident"
          : event.eventType === "passenger_medical"
            ? "Passenger medical"
            : "Driver SOS";
    return `${label} ${event.eventNo}`;
  }

  private mapIncidentCategory(eventType: DriverSosEventType | null): IncidentCategory {
    switch (eventType) {
      case "traffic_accident":
        return "traffic";
      case "passenger_medical":
        return "passenger_injury";
      case "security_incident":
        return "safety";
      default:
        return "other";
    }
  }

  private mapIncidentSeverity(severity: DriverSosSeverity | null): IncidentSeverity {
    return severity === "major" ? "critical" : "high";
  }

  private formatIncidentLocation(event: DriverSosEventRecord) {
    if (!event.location) {
      return null;
    }

    if (event.location.reverseGeocodedAddress) {
      return event.location.reverseGeocodedAddress;
    }

    return `${event.location.lat},${event.location.lng}`;
  }

  private normalizeRequired(value: string, fieldName: string) {
    if (!value.trim()) {
      throw new ApiRequestError(
        HttpStatus.BAD_REQUEST,
        "VALIDATION_ERROR",
        `${fieldName} is required.`,
        { field: fieldName },
      );
    }
    return value.trim();
  }

  private normalizeNullable(value: string | null | undefined) {
    if (value === undefined || value === null) {
      return null;
    }
    const normalized = value.trim();
    return normalized.length > 0 ? normalized : null;
  }

  private normalizeIsoTimestamp(value: string, fieldName: string) {
    const normalized = this.normalizeRequired(value, fieldName);
    const parsed = Date.parse(normalized);
    if (Number.isNaN(parsed)) {
      throw new ApiRequestError(
        HttpStatus.BAD_REQUEST,
        "VALIDATION_ERROR",
        `${fieldName} must be a valid ISO timestamp.`,
        { field: fieldName, value },
      );
    }
    return new Date(parsed).toISOString();
  }

  private normalizeEventType(value: DriverSosEventType | null | undefined) {
    if (value === undefined || value === null) {
      return null;
    }
    if (!DRIVER_SOS_EVENT_TYPES.includes(value)) {
      throw new ApiRequestError(
        HttpStatus.BAD_REQUEST,
        "VALIDATION_ERROR",
        "Invalid driver SOS eventType.",
        { eventType: value },
      );
    }
    return value;
  }

  private normalizeSeverity(value: DriverSosSeverity | null | undefined) {
    if (value === undefined || value === null) {
      return null;
    }
    if (!DRIVER_SOS_SEVERITIES.includes(value)) {
      throw new ApiRequestError(
        HttpStatus.BAD_REQUEST,
        "VALIDATION_ERROR",
        "Invalid driver SOS severity.",
        { severity: value },
      );
    }
    return value;
  }

  private normalizeLocation(
    value: DriverSosEventRecord["location"] | undefined,
  ): DriverSosEventRecord["location"] {
    if (value === undefined || value === null) {
      return null;
    }

    const lat = this.assertFiniteNumber(value.lat, "location.lat");
    const lng = this.assertFiniteNumber(value.lng, "location.lng");
    const accuracyM =
      value.accuracyM === null || value.accuracyM === undefined
        ? null
        : this.assertFiniteNumber(value.accuracyM, "location.accuracyM");

    return {
      lat,
      lng,
      accuracyM,
      recordedAt: this.normalizeIsoTimestamp(
        value.recordedAt,
        "location.recordedAt",
      ),
      reverseGeocodedAddress: this.normalizeNullable(
        value.reverseGeocodedAddress,
      ),
      geocodeProvider: this.normalizeNullable(value.geocodeProvider),
    };
  }

  private assertFiniteNumber(value: number, fieldName: string) {
    if (!Number.isFinite(value)) {
      throw new ApiRequestError(
        HttpStatus.BAD_REQUEST,
        "VALIDATION_ERROR",
        `${fieldName} must be a finite number.`,
        { field: fieldName, value },
      );
    }
    return value;
  }

  private assertUuid(value: string, fieldName: string) {
    if (!UUID_V4_PATTERN.test(value)) {
      throw new ApiRequestError(
        HttpStatus.BAD_REQUEST,
        "VALIDATION_ERROR",
        `${fieldName} must be a UUID v4 string.`,
        { field: fieldName, value },
      );
    }
  }

  private requireEvent(eventId: string) {
    const event = this.eventById.get(eventId);
    if (!event) {
      throw new Error(`Driver SOS event ${eventId} was not found in memory.`);
    }
    return event;
  }

  private buildResult(
    event: DriverSosEventRecord,
    duplicate: boolean,
  ): SubmitDriverSosEventResult {
    if (!event.incidentId || !event.serverReceivedAt) {
      throw new Error(
        `Driver SOS event ${event.sosEventId} is missing submission receipt fields.`,
      );
    }

    return {
      event: this.cloneEvent(event),
      receipt: {
        sosEventId: event.sosEventId,
        incidentId: event.incidentId,
        clientEventId: event.clientEventId,
        eventNo: event.eventNo,
        duplicate,
        serverReceivedAt: event.serverReceivedAt,
      },
    };
  }

  private buildDriverClientKey(driverId: string, clientEventId: string) {
    return `${driverId}:${clientEventId}`;
  }

  private nextEventNo(now: string) {
    const compact = now.replace(/\D/g, "").slice(0, 14);
    return `SOS-${compact}-${randomUUID().slice(0, 6).toUpperCase()}`;
  }

  private cloneEvent(event: DriverSosEventRecord): DriverSosEventRecord {
    return {
      ...event,
      location: event.location ? { ...event.location } : null,
      falseAlarm: { ...event.falseAlarm },
      dutyAcknowledgement: { ...event.dutyAcknowledgement },
    };
  }

  private cloneTimeline(entry: DriverSosTimelineEntry): DriverSosTimelineEntry {
    return {
      ...entry,
      payload: { ...entry.payload },
    };
  }

  private cloneOutbox(
    record: DriverSosUrgentAlertOutboxRecord,
  ): DriverSosUrgentAlertOutboxRecord {
    return {
      ...record,
      payload: { ...record.payload },
    };
  }

  private recordAudit(
    submission: Pick<PersistDriverSosSubmissionResult, "event" | "duplicate">,
    identity: BootstrapRequestIdentity | null,
    requestId?: string,
  ) {
    const log: Omit<AuditLogRecord, "auditId" | "createdAt" | "requestId"> = {
      actorId: identity?.actorId ?? submission.event.driverId,
      actorType: this.resolveAuditActorType(identity),
      tenantId: identity?.tenantId ?? null,
      moduleName: "driver-sos",
      actionName: submission.duplicate
        ? "submit_sos_event_duplicate"
        : "submit_sos_event",
      resourceType: "driver_sos_event",
      resourceId: submission.event.sosEventId,
      newValuesSummary: {
        eventNo: submission.event.eventNo,
        clientEventId: submission.event.clientEventId,
        incidentId: submission.event.incidentId,
        eventType: submission.event.eventType,
        severity: submission.event.severity,
        orderId: submission.event.orderId,
        duplicate: submission.duplicate,
      },
    };

    const payload = requestId
      ? ({ ...log, requestId } as Omit<AuditLogRecord, "auditId" | "createdAt">)
      : ({ ...log } as Omit<AuditLogRecord, "auditId" | "createdAt">);
    this.auditNotificationService.recordAuditLog(payload);
  }

  private resolveAuditActorType(
    identity: BootstrapRequestIdentity | null,
  ): AuditLogRecord["actorType"] {
    switch (identity?.actorType) {
      case "system":
      case "platform_admin":
      case "tenant_admin":
      case "ops_user":
      case "partner_api_key":
        return identity.actorType;
      default:
        return "system";
    }
  }
}
