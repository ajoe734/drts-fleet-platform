import { randomUUID } from "node:crypto";

import {
  HttpStatus,
  Inject,
  Injectable,
  OnModuleInit,
  Optional,
} from "@nestjs/common";

import type {
  AuditLogRecord,
  ConfirmDriverSosAttachmentUploadCommand,
  ConfirmDriverSosAttachmentUploadResult,
  CreateDriverSosAttachmentUploadIntentCommand,
  CreateDriverSosAttachmentUploadIntentResult,
  DriverSosAlertLatencySummary,
  DriverMatchingSuppression,
  DriverSosAlertRenderObservation,
  DriverSosAttachmentRecord,
  DriverSosEventRecord,
  DriverSosEventType,
  DriverSosSeverity,
  DriverSosStatus,
  DriverSosTimelineEntry,
  DriverSosUrgentAlertOutboxRecord,
  IncidentCategory,
  IncidentRecord,
  IncidentSeverity,
  IncidentStatus,
  IncidentTimelineEntry,
  RecordDriverSosOpsAlertRenderedCommand,
  RecordDriverSosOpsAlertRenderedResult,
  SosDutyAcknowledgement,
  SubmitDriverSosEventCommand,
  SubmitDriverSosEventResult,
} from "@drts/contracts";

import { ApiRequestError } from "../../common/api-envelope";
import {
  type BootstrapRequestIdentity,
  normalizeDriverId,
} from "../../common/auth";
import { AuditNotificationService } from "../audit-notification/audit-notification.service";
import { IncidentService } from "../incident/incident.service";
import {
  type DriverSosRepositoryState,
  type PersistDriverSosSubmission,
  type PersistDriverSosSubmissionResult,
  DriverSosRepository,
} from "./driver-sos.repository";
import {
  DRIVER_SOS_ATTACHMENT_SCANNER,
  DRIVER_SOS_ATTACHMENT_STORAGE,
  type DriverSosAttachmentScanner,
  type DriverSosAttachmentStorageProvider,
  type DriverSosAttachmentUploadIntent,
  type DriverSosUploadedObjectMetadata,
} from "./driver-sos-attachment.ports";
import {
  DriverSosAttachmentLimitError,
  DriverSosVerificationRepository,
  type DriverSosUploadIntentRecord,
} from "./driver-sos-verification.repository";

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
const DRIVER_SOS_ATTACHMENT_LIMIT = 4;
const DRIVER_SOS_ATTACHMENT_UPLOAD_TTL_MS = 15 * 60 * 1000;
const DRIVER_SOS_ATTACHMENT_CONTENT_TYPES = {
  photo: new Set(["image/jpeg", "image/png", "image/heic", "image/webp"]),
  audio: new Set(["audio/aac", "audio/m4a", "audio/mp4", "audio/mpeg"]),
} as const;
const DRIVER_SOS_ATTACHMENT_SIZE_LIMITS = {
  photo: 10 * 1024 * 1024,
  audio: 20 * 1024 * 1024,
} as const;
const SHA256_PATTERN = /^[0-9a-f]{64}$/i;
const OPS_RENDER_RECEIPT_FUTURE_TOLERANCE_MS = 5 * 60 * 1000;
const OPS_ALERT_TARGET_LATENCY_MS = 5_000;

export interface AcknowledgeDriverSosDutyCommand {
  note?: string | null;
}

export interface AcknowledgeDriverSosDutyResult {
  event: DriverSosEventRecord;
  timeline: DriverSosTimelineEntry[];
  dutyAcknowledgement: SosDutyAcknowledgement;
  /** True only when the calling actor is the actual current duty owner. */
  wonAcknowledgement: boolean;
}

export interface DriverSosEventReadback {
  event: DriverSosEventRecord;
  timeline: DriverSosTimelineEntry[];
}

@Injectable()
export class DriverSosService implements OnModuleInit {
  private events: DriverSosEventRecord[] = [];
  private eventById = new Map<string, DriverSosEventRecord>();
  private eventIdByDriverClientKey = new Map<string, string>();
  private timelines = new Map<string, DriverSosTimelineEntry[]>();
  private urgentAlertOutbox = new Map<
    string,
    DriverSosUrgentAlertOutboxRecord
  >();
  private uploadIntents = new Map<string, DriverSosUploadIntentRecord>();
  private attachments = new Map<string, DriverSosAttachmentRecord[]>();
  /** Serializes every mutation of a given sosEventId -- acknowledgeDuty,
   * authoritative-store hydration, and Incident-progression reconcile --
   * so overlapping Ops/driver calls for the same event can never both
   * observe the same pre-transition snapshot and race each other's write
   * (duplicate duty_acknowledged entries, or a reconcile silently
   * overwriting a concurrent acknowledgment). */
  private eventMutationQueues = new Map<string, Promise<unknown>>();

  constructor(
    private readonly auditNotificationService: AuditNotificationService,
    private readonly incidentService: IncidentService,
    @Optional() private readonly repository?: DriverSosRepository,
    @Optional()
    private readonly verificationRepository?: DriverSosVerificationRepository,
    @Optional()
    @Inject(DRIVER_SOS_ATTACHMENT_STORAGE)
    private readonly attachmentStorage?: DriverSosAttachmentStorageProvider,
    @Optional()
    @Inject(DRIVER_SOS_ATTACHMENT_SCANNER)
    private readonly attachmentScanner?: DriverSosAttachmentScanner,
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
      fleetReportConfirmedAt: now,
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

  async createAttachmentUploadIntent(
    sosEventId: string,
    command: CreateDriverSosAttachmentUploadIntentCommand,
    identity: BootstrapRequestIdentity | null,
    requestId?: string,
  ): Promise<CreateDriverSosAttachmentUploadIntentResult> {
    const driverId = this.requireDriverIdentity(identity);
    const event = this.requireDriverEvent(sosEventId, driverId);
    const attachmentType = this.normalizeAttachmentType(command.attachmentType);
    const originalFileName = this.normalizeAttachmentFileName(
      command.originalFileName,
    );
    const contentType = this.normalizeAttachmentContentType(
      attachmentType,
      command.contentType,
    );
    const fileSize = this.normalizeAttachmentFileSize(
      attachmentType,
      command.fileSize,
    );
    const existingAttachments = await this.loadAttachments(event.sosEventId);
    if (existingAttachments.length >= DRIVER_SOS_ATTACHMENT_LIMIT) {
      throw new ApiRequestError(
        HttpStatus.CONFLICT,
        "DRIVER_SOS_ATTACHMENT_LIMIT_REACHED",
        `A driver SOS event supports at most ${DRIVER_SOS_ATTACHMENT_LIMIT} attachments.`,
      );
    }

    const availability = this.getStorageAvailability();
    if (availability.state === "unavailable" || !this.attachmentStorage) {
      return {
        state: "unavailable",
        sosEventId: event.sosEventId,
        reasonCode: "storage_provider_unavailable",
        reason:
          availability.state === "unavailable"
            ? availability.reason
            : "No attachment storage provider is configured.",
        retryable: true,
      };
    }

    const now = new Date();
    const expiresAt = new Date(
      now.getTime() + DRIVER_SOS_ATTACHMENT_UPLOAD_TTL_MS,
    ).toISOString();
    const objectKey = [
      "driver-sos",
      event.sosEventId,
      `${randomUUID()}-${this.sanitizeObjectFileName(originalFileName)}`,
    ].join("/");
    const intentRecord: DriverSosUploadIntentRecord = {
      objectKey,
      sosEventId: event.sosEventId,
      driverId,
      attachmentType,
      originalFileName,
      contentType,
      fileSize,
      providerName: this.attachmentStorage.providerName,
      state: "active",
      createdAt: now.toISOString(),
      expiresAt,
      confirmedAt: null,
    };

    let upload: DriverSosAttachmentUploadIntent;
    try {
      upload = await this.attachmentStorage.createUploadIntent({
        sosEventId: event.sosEventId,
        driverId,
        attachmentType,
        objectKey,
        originalFileName,
        contentType,
        fileSize,
        expiresAt,
      });
    } catch {
      return {
        state: "unavailable",
        sosEventId: event.sosEventId,
        reasonCode: "storage_provider_error",
        reason: "Attachment storage could not issue an upload intent.",
        retryable: true,
      };
    }
    await this.verificationRepository?.persistUploadIntent(intentRecord);
    this.uploadIntents.set(objectKey, intentRecord);
    this.recordMutationAudit(
      "create_attachment_upload_intent",
      event,
      identity,
      requestId,
      { objectKey, attachmentType, provider: intentRecord.providerName },
    );
    return {
      state: "ready",
      sosEventId: event.sosEventId,
      objectKey,
      uploadUrl: upload.uploadUrl,
      expiresAt,
      method: upload.method,
      headers: { ...upload.headers },
      provider: intentRecord.providerName,
    };
  }

  async confirmAttachmentUpload(
    sosEventId: string,
    command: ConfirmDriverSosAttachmentUploadCommand,
    identity: BootstrapRequestIdentity | null,
    requestId?: string,
  ): Promise<ConfirmDriverSosAttachmentUploadResult> {
    const driverId = this.requireDriverIdentity(identity);
    const event = this.requireDriverEvent(sosEventId, driverId);
    const objectKey = this.normalizeRequired(command.objectKey, "objectKey");
    const existingAttachments = await this.loadAttachments(event.sosEventId);
    const existing = existingAttachments.find(
      (attachment) => attachment.objectKey === objectKey,
    );
    if (existing) {
      return { state: "confirmed", attachment: this.cloneAttachment(existing) };
    }
    if (existingAttachments.length >= DRIVER_SOS_ATTACHMENT_LIMIT) {
      throw new ApiRequestError(
        HttpStatus.CONFLICT,
        "DRIVER_SOS_ATTACHMENT_LIMIT_REACHED",
        `A driver SOS event supports at most ${DRIVER_SOS_ATTACHMENT_LIMIT} attachments.`,
      );
    }

    const intent = await this.findUploadIntent(objectKey);
    this.assertConfirmableIntent(intent, event, driverId);
    const availability = this.getStorageAvailability();
    if (availability.state === "unavailable" || !this.attachmentStorage) {
      return {
        state: "unavailable",
        sosEventId: event.sosEventId,
        objectKey,
        reasonCode: "storage_provider_unavailable",
        reason:
          availability.state === "unavailable"
            ? availability.reason
            : "No attachment storage provider is configured.",
        retryable: true,
      };
    }

    let uploadedObject: DriverSosUploadedObjectMetadata;
    try {
      uploadedObject =
        await this.attachmentStorage.inspectUploadedObject(objectKey);
    } catch {
      return {
        state: "unavailable",
        sosEventId: event.sosEventId,
        objectKey,
        reasonCode: "storage_provider_error",
        reason: "Attachment storage could not verify the uploaded object.",
        retryable: true,
      };
    }
    this.assertUploadedObjectMatchesIntent(intent, uploadedObject);

    const uploadedAt = new Date().toISOString();
    const attachment: DriverSosAttachmentRecord = {
      attachmentId: randomUUID(),
      sosEventId: event.sosEventId,
      attachmentType: intent.attachmentType,
      objectKey,
      originalFileName: intent.originalFileName,
      contentType: uploadedObject.contentType,
      fileSize: uploadedObject.fileSize,
      checksumSha256: uploadedObject.checksumSha256.toLowerCase(),
      scanStatus: "pending",
      scannerProvider: null,
      scanReason: null,
      scanAttemptCount: 0,
      lastScanAttemptAt: null,
      uploadedAt,
      scannedAt: null,
      updatedAt: uploadedAt,
    };
    const uploadedTimeline = this.buildVerificationTimeline(
      event.sosEventId,
      "attachment_uploaded",
      "driver",
      driverId,
      uploadedAt,
      {
        attachmentId: attachment.attachmentId,
        attachmentType: attachment.attachmentType,
        objectKey,
        contentType: attachment.contentType,
        fileSize: attachment.fileSize,
      },
    );

    try {
      await this.verificationRepository?.persistAttachmentConfirmation(
        { ...intent, state: "confirmed", confirmedAt: uploadedAt },
        attachment,
        uploadedTimeline,
      );
    } catch (error) {
      if (error instanceof DriverSosAttachmentLimitError) {
        throw new ApiRequestError(
          HttpStatus.CONFLICT,
          "DRIVER_SOS_ATTACHMENT_LIMIT_REACHED",
          `A driver SOS event supports at most ${DRIVER_SOS_ATTACHMENT_LIMIT} attachments.`,
        );
      }
      throw error;
    }
    intent.state = "confirmed";
    intent.confirmedAt = uploadedAt;
    this.appendAttachment(attachment);
    this.appendTimeline(uploadedTimeline);

    const scannedAttachment = await this.scanAttachment(event, attachment);
    this.recordMutationAudit(
      "confirm_attachment_upload",
      event,
      identity,
      requestId,
      {
        attachmentId: attachment.attachmentId,
        scanStatus: scannedAttachment.scanStatus,
      },
    );
    return {
      state: "confirmed",
      attachment: this.cloneAttachment(scannedAttachment),
    };
  }

  async listAttachments(
    sosEventId: string,
    identity: BootstrapRequestIdentity | null,
  ): Promise<DriverSosAttachmentRecord[]> {
    const driverId = this.requireDriverIdentity(identity);
    const event = this.requireDriverEvent(sosEventId, driverId);
    return (await this.loadAttachments(event.sosEventId)).map((attachment) =>
      this.cloneAttachment(attachment),
    );
  }

  async retryAttachmentScan(
    sosEventId: string,
    attachmentId: string,
    identity: BootstrapRequestIdentity | null,
    requestId?: string,
  ): Promise<DriverSosAttachmentRecord> {
    const driverId = this.requireDriverIdentity(identity);
    const event = this.requireDriverEvent(sosEventId, driverId);
    const attachment = (await this.loadAttachments(event.sosEventId)).find(
      (candidate) => candidate.attachmentId === attachmentId,
    );
    if (!attachment) {
      throw new ApiRequestError(
        HttpStatus.NOT_FOUND,
        "DRIVER_SOS_ATTACHMENT_NOT_FOUND",
        "The driver SOS attachment was not found.",
      );
    }
    if (
      attachment.scanStatus === "clean" ||
      attachment.scanStatus === "infected"
    ) {
      return this.cloneAttachment(attachment);
    }
    const updated = await this.scanAttachment(event, attachment);
    this.recordMutationAudit(
      "retry_attachment_scan",
      event,
      identity,
      requestId,
      {
        attachmentId,
        scanStatus: updated.scanStatus,
        scanAttemptCount: updated.scanAttemptCount,
      },
    );
    return this.cloneAttachment(updated);
  }

  async recordOpsAlertsRendered(
    command: RecordDriverSosOpsAlertRenderedCommand,
    identity: BootstrapRequestIdentity | null,
    requestId?: string,
  ): Promise<RecordDriverSosOpsAlertRenderedResult> {
    this.requireOpsIdentity(identity);
    const incidentIds = this.normalizeIncidentIds(command.incidentIds);
    const renderedAt = this.normalizeIsoTimestamp(
      command.renderedAt,
      "renderedAt",
    );
    const receiptRecordedAt = new Date().toISOString();
    if (
      Date.parse(renderedAt) >
      Date.parse(receiptRecordedAt) + OPS_RENDER_RECEIPT_FUTURE_TOLERANCE_MS
    ) {
      throw new ApiRequestError(
        HttpStatus.BAD_REQUEST,
        "VALIDATION_ERROR",
        "renderedAt cannot be more than five minutes in the future.",
      );
    }

    const outboxes = incidentIds.map((incidentId) => {
      const outbox = [...this.urgentAlertOutbox.values()].find(
        (candidate) => candidate.incidentId === incidentId,
      );
      if (!outbox) {
        throw new ApiRequestError(
          HttpStatus.NOT_FOUND,
          "DRIVER_SOS_ALERT_NOT_FOUND",
          `No driver SOS alert exists for incident ${incidentId}.`,
        );
      }
      return outbox;
    });

    const observations: DriverSosAlertRenderObservation[] = [];
    for (const outbox of outboxes) {
      const incidentId = outbox.incidentId;
      if (
        outbox.opsAlertRenderedAt &&
        outbox.opsAlertReceiptRecordedAt &&
        outbox.alertToOpsLatencyMs !== null
      ) {
        observations.push({
          sosEventId: outbox.sosEventId,
          incidentId: outbox.incidentId,
          eventNo: outbox.eventNo,
          fleetReportConfirmedAt: outbox.fleetReportConfirmedAt,
          opsAlertRenderedAt: outbox.opsAlertRenderedAt,
          opsAlertReceiptRecordedAt: outbox.opsAlertReceiptRecordedAt,
          alertToOpsLatencyMs: outbox.alertToOpsLatencyMs,
          duplicate: true,
        });
        continue;
      }

      const latencyMs =
        Date.parse(renderedAt) - Date.parse(outbox.fleetReportConfirmedAt);
      if (latencyMs < 0) {
        throw new ApiRequestError(
          HttpStatus.BAD_REQUEST,
          "VALIDATION_ERROR",
          "renderedAt cannot precede fleetReportConfirmedAt.",
          { incidentId },
        );
      }
      const observation: DriverSosAlertRenderObservation = {
        sosEventId: outbox.sosEventId,
        incidentId: outbox.incidentId,
        eventNo: outbox.eventNo,
        fleetReportConfirmedAt: outbox.fleetReportConfirmedAt,
        opsAlertRenderedAt: renderedAt,
        opsAlertReceiptRecordedAt: receiptRecordedAt,
        alertToOpsLatencyMs: latencyMs,
        duplicate: false,
      };
      const timeline = this.buildVerificationTimeline(
        outbox.sosEventId,
        "ops_alert_rendered",
        "ops",
        identity?.actorId ?? "ops-console",
        renderedAt,
        {
          incidentId,
          fleetReportConfirmedAt: outbox.fleetReportConfirmedAt,
          opsAlertRenderedAt: renderedAt,
          opsAlertReceiptRecordedAt: receiptRecordedAt,
          alertToOpsLatencyMs: latencyMs,
        },
      );
      const updatedOutbox: DriverSosUrgentAlertOutboxRecord = {
        ...outbox,
        opsAlertRenderedAt: renderedAt,
        opsAlertReceiptRecordedAt: receiptRecordedAt,
        alertToOpsLatencyMs: latencyMs,
        payload: {
          ...outbox.payload,
          fleetReportConfirmedAt: outbox.fleetReportConfirmedAt,
          opsAlertRenderedAt: renderedAt,
          opsAlertReceiptRecordedAt: receiptRecordedAt,
          alertToOpsLatencyMs: latencyMs,
        },
      };

      // An unacknowledged alert actually rendering on an Ops screen is the
      // honest "duty_alerted" moment -- distinct from merely being queued.
      const sosEvent = this.eventById.get(outbox.sosEventId);
      const dutyAlertPlan =
        sosEvent && sosEvent.status === "submitted"
          ? {
              event: {
                ...sosEvent,
                status: "duty_alerted" as const,
                updatedAt: renderedAt,
              },
              timeline: this.buildVerificationTimeline(
                sosEvent.sosEventId,
                "duty_alert_dispatched",
                "system",
                "system.driver-sos",
                renderedAt,
                { incidentId, opsAlertRenderedAt: renderedAt },
              ),
            }
          : null;

      const persistedObservation =
        (await this.verificationRepository?.persistAlertObservation(
          updatedOutbox,
          timeline,
          observation,
          dutyAlertPlan,
        )) ?? { ...observation, dutyAlertApplied: Boolean(dutyAlertPlan) };
      updatedOutbox.opsAlertRenderedAt =
        persistedObservation.opsAlertRenderedAt;
      updatedOutbox.opsAlertReceiptRecordedAt =
        persistedObservation.opsAlertReceiptRecordedAt;
      updatedOutbox.alertToOpsLatencyMs =
        persistedObservation.alertToOpsLatencyMs;
      updatedOutbox.payload = {
        ...updatedOutbox.payload,
        fleetReportConfirmedAt: persistedObservation.fleetReportConfirmedAt,
        opsAlertRenderedAt: persistedObservation.opsAlertRenderedAt,
        opsAlertReceiptRecordedAt:
          persistedObservation.opsAlertReceiptRecordedAt,
        alertToOpsLatencyMs: persistedObservation.alertToOpsLatencyMs,
      };
      if (!persistedObservation.duplicate) {
        updatedOutbox.status =
          updatedOutbox.status === "failed" ? updatedOutbox.status : "delivered";
        updatedOutbox.deliveredAt = updatedOutbox.deliveredAt ?? renderedAt;
      }
      this.urgentAlertOutbox.set(outbox.sosEventId, updatedOutbox);
      if (!persistedObservation.duplicate) {
        this.appendTimeline(timeline);
        if (persistedObservation.dutyAlertApplied && dutyAlertPlan) {
          this.replaceEvent(dutyAlertPlan.event);
          this.appendTimeline(dutyAlertPlan.timeline);
        }
      }
      observations.push(persistedObservation);
    }

    this.recordOpsRenderAudit(observations, identity, requestId);
    return { observations };
  }

  async getOpsAlertLatencySummary(
    input: { from?: string; to?: string },
    identity: BootstrapRequestIdentity | null,
  ): Promise<DriverSosAlertLatencySummary> {
    this.requireOpsIdentity(identity);
    const from = input.from
      ? this.normalizeIsoTimestamp(input.from, "from")
      : null;
    const to = input.to ? this.normalizeIsoTimestamp(input.to, "to") : null;
    if (from && to && Date.parse(from) > Date.parse(to)) {
      throw new ApiRequestError(
        HttpStatus.BAD_REQUEST,
        "VALIDATION_ERROR",
        "from cannot be later than to.",
      );
    }

    if (this.verificationRepository?.isEnabled()) {
      return this.verificationRepository.summarizeAlertLatency(
        from,
        to,
        OPS_ALERT_TARGET_LATENCY_MS,
      );
    }

    const latencies = [...this.urgentAlertOutbox.values()]
      .filter((record) => {
        if (record.alertToOpsLatencyMs === null) {
          return false;
        }
        const confirmedAt = Date.parse(record.fleetReportConfirmedAt);
        return (
          (!from || confirmedAt >= Date.parse(from)) &&
          (!to || confirmedAt <= Date.parse(to))
        );
      })
      .map((record) => record.alertToOpsLatencyMs!)
      .sort((left, right) => left - right);
    const withinTargetCount = latencies.filter(
      (latency) => latency <= OPS_ALERT_TARGET_LATENCY_MS,
    ).length;

    return {
      from,
      to,
      targetLatencyMs: OPS_ALERT_TARGET_LATENCY_MS,
      sampleCount: latencies.length,
      withinTargetCount,
      withinTargetRate:
        latencies.length === 0 ? null : withinTargetCount / latencies.length,
      p50LatencyMs: this.percentile(latencies, 0.5),
      p95LatencyMs: this.percentile(latencies, 0.95),
      maxLatencyMs: latencies.at(-1) ?? null,
    };
  }

  /**
   * Canonical first-writer-wins SOS duty acknowledgment (S-3 §24.2).
   *
   * Calls for the same sosEventId are serialized so a second, overlapping
   * call can never observe the pre-acknowledgment state that the first call
   * is still in the middle of persisting (the bug that let both calls
   * append their own duty_acknowledged timeline entry). The same lock also
   * serializes against this event's own authoritative readback/reconcile
   * path, so a concurrent GET can never overwrite an in-flight acknowledgment
   * with a stale pre-ack snapshot (F2).
   *
   * The Incident is the cross-system arbiter of "current owner". Claiming
   * it (via `assignIncidentOwnerDurable`) happens BEFORE the SOS-side CAS
   * write below, and that claim commits synchronously -- so a concurrent
   * direct PATCH /incidents/:id can never land underneath it and go
   * unnoticed (F1): either this call's claim wins first (and the direct
   * caller then sees a truthful conflict), or the direct caller's own
   * assignment already won and this call's claim truthfully reports that
   * owner instead of actorId. Only once the Incident claim is durably
   * confirmed do we write the SOS-side ack using that same owner, so the
   * two subsystems can never settle on different "current owners", and a
   * DB failure on either side never leaves the other falsely mutated.
   */
  async acknowledgeDuty(
    sosEventId: string,
    command: AcknowledgeDriverSosDutyCommand,
    identity: BootstrapRequestIdentity | null,
    requestId?: string,
  ): Promise<AcknowledgeDriverSosDutyResult> {
    const actorId = this.requireOpsIdentity(identity);
    this.requireEventForOps(sosEventId); // fail fast for an unknown event
    const note = this.normalizeNullable(command?.note ?? null);

    return this.withEventMutationLock(sosEventId, async () => {
      const event = this.requireEventForOps(sosEventId);
      const existingOwner = event.dutyAcknowledgement.acknowledgedByActorId;
      if (existingOwner) {
        // Idempotent replay still retries the Incident handover: a prior
        // call's durable Incident write can have failed asynchronously
        // after this SOS event already recorded its owner, and this is the
        // only path left to repair that without ever re-claiming the event.
        await this.repairIncidentHandover(
          event.incidentId,
          existingOwner,
          requestId,
          identity,
        );
        return this.buildIdempotentAcknowledgement(
          sosEventId,
          event,
          existingOwner,
          actorId,
        );
      }

      // The Incident claim is this call's real first write (not merely a
      // read): it commits synchronously (before its own first await), so no
      // concurrent direct PATCH /incidents/:id can land between "check" and
      // "write" the way a read-only pre-check would have allowed. A
      // rejected durable write (DB failure, currentOwner === null) must not
      // let this call fabricate a successful SOS ack.
      const incidentId = event.incidentId;
      let incidentOwner = actorId;
      let claimedFreshIncidentOwnership = false;
      if (incidentId) {
        const claim = await this.incidentService.assignIncidentOwnerDurable(
          incidentId,
          actorId,
          requestId,
          identity,
        );
        if (!claim.accepted && claim.currentOwner === null) {
          throw new ApiRequestError(
            HttpStatus.SERVICE_UNAVAILABLE,
            "INCIDENT_HANDOVER_UNAVAILABLE",
            "Duty acknowledgment could not be durably handed over to the Incident; retry.",
            { sosEventId, incidentId },
            true,
          );
        }
        incidentOwner = claim.currentOwner ?? actorId;
        claimedFreshIncidentOwnership = claim.accepted && claim.wasNewClaim;
      }

      const now = new Date().toISOString();
      const timeline = this.buildVerificationTimeline(
        sosEventId,
        "duty_acknowledged",
        "ops",
        incidentOwner,
        now,
        {
          incidentId: event.incidentId,
          acknowledgedByActorId: incidentOwner,
          note,
        },
      );
      const updatedEvent: DriverSosEventRecord = {
        ...event,
        status: "acknowledged",
        dutyAcknowledgement: {
          acknowledgedAt: now,
          acknowledgedByActorId: incidentOwner,
        },
        updatedAt: now,
      };

      let persisted;
      try {
        persisted = await this.verificationRepository?.persistDutyAcknowledgement(
          updatedEvent,
          timeline,
        );
      } catch (error) {
        // The SOS event's own write never happened -- a claim this call
        // freshly made on the Incident (previously unassigned) must not
        // outlive that rejected write, so the Incident is left exactly as
        // honest as the SOS event itself (both unassigned/unacknowledged).
        // A claim this call did NOT freshly make (already someone else's,
        // or already durably the same owner from a prior call) is not this
        // call's to undo.
        if (claimedFreshIncidentOwnership && incidentId) {
          await this.incidentService.releaseIncidentOwnerClaim(
            incidentId,
            incidentOwner,
            requestId,
            identity,
          );
        }
        throw error;
      }
      const accepted = persisted?.accepted ?? true;
      const finalOwner = accepted ? incidentOwner : persisted!.acknowledgedByActorId;
      const finalAcknowledgedAt = accepted ? now : persisted!.acknowledgedAt;

      // The Incident already durably has `incidentOwner` from the claim
      // above. Only a cross-process SOS-side CAS race (not covered by this
      // in-process lock) can make the SOS event's own persisted truth
      // (`finalOwner`) disagree with it, in which case converge the
      // Incident onto that real final truth too.
      if (finalOwner !== incidentOwner) {
        await this.repairIncidentHandover(
          event.incidentId,
          finalOwner,
          requestId,
          identity,
        );
      }

      if (!accepted) {
        // Authoritative reload instead of trusting this process's stale
        // local timeline/outbox for the winner it did not itself persist.
        const hydrated = await this.hydrateFromAuthoritativeStoreIfPending(
          sosEventId,
        );
        const lostEvent =
          hydrated.dutyAcknowledgement.acknowledgedByActorId === finalOwner
            ? hydrated
            : {
                ...event,
                status: "acknowledged" as const,
                dutyAcknowledgement: {
                  acknowledgedAt: finalAcknowledgedAt,
                  acknowledgedByActorId: finalOwner,
                },
                updatedAt: now,
              };
        if (lostEvent !== hydrated) {
          this.replaceEvent(lostEvent);
        }
        return this.buildIdempotentAcknowledgement(
          sosEventId,
          lostEvent,
          finalOwner,
          actorId,
        );
      }

      this.replaceEvent(updatedEvent);
      this.appendTimeline(timeline);
      this.markOutboxDelivered(sosEventId, now);
      this.recordMutationAudit(
        "acknowledge_duty",
        updatedEvent,
        identity,
        requestId,
        { acknowledgedByActorId: incidentOwner, incidentId: event.incidentId },
      );

      return {
        event: this.cloneEvent(updatedEvent),
        timeline: (this.timelines.get(sosEventId) ?? []).map((entry) =>
          this.cloneTimeline(entry),
        ),
        dutyAcknowledgement: {
          sosEventId,
          acknowledgedByActorId: incidentOwner,
          acknowledgedAt: now,
          note,
        },
        wonAcknowledgement: incidentOwner === actorId,
      };
    });
  }

  /** Best-effort Incident handover convergence used for an idempotent
   * replay, or for a cross-process SOS-side CAS race outcome: by this point
   * the SOS event has already durably decided `owner` as the truth, so a
   * failed or conflicting Incident write here is a residual repair
   * opportunity (the next acknowledgeDuty replay retries it again), not a
   * reason to fail the call that is reporting the SOS event's own
   * correctly-decided outcome. */
  private async repairIncidentHandover(
    incidentId: string | null,
    owner: string,
    requestId: string | undefined,
    identity: BootstrapRequestIdentity | null,
  ): Promise<void> {
    if (!incidentId) {
      return;
    }
    try {
      await this.incidentService.assignIncidentOwnerDurable(
        incidentId,
        owner,
        requestId,
        identity,
      );
    } catch {
      // best-effort; the next replay retries.
    }
  }

  /** Runs `fn` after any prior acknowledgeDuty call OR authoritative
   * readback/reconcile for the same `sosEventId` has fully settled (success
   * or failure), so every mutation of a given SOS event -- acknowledgment,
   * hydration from the authoritative store, and Incident-progression
   * reconcile -- executes strictly one at a time. Unifying what used to be
   * two separate per-event queues (one for acknowledgeDuty, one for
   * reconcile) closes the window where a concurrent readback's reconcile
   * could overwrite an in-flight acknowledgment with a stale pre-ack
   * snapshot (F2). */
  private withEventMutationLock<T>(
    sosEventId: string,
    fn: () => Promise<T>,
  ): Promise<T> {
    return DriverSosService.withQueueLock(
      this.eventMutationQueues,
      sosEventId,
      fn,
    );
  }

  /** Runs `fn` after any prior call for the same key on `queue` has fully
   * settled (success or failure), so concurrent callers for the same key
   * execute strictly one at a time. */
  private static withQueueLock<T>(
    queue: Map<string, Promise<unknown>>,
    key: string,
    fn: () => Promise<T>,
  ): Promise<T> {
    const previous = queue.get(key) ?? Promise.resolve();
    const run = previous.then(fn, fn);
    queue.set(
      key,
      run.then(
        () => undefined,
        () => undefined,
      ),
    );
    return run;
  }

  private buildIdempotentAcknowledgement(
    sosEventId: string,
    event: DriverSosEventRecord,
    owner: string,
    actorId: string,
  ): AcknowledgeDriverSosDutyResult {
    const timeline = this.timelines.get(sosEventId) ?? [];
    const existingAck = [...timeline]
      .reverse()
      .find(
        (entry) =>
          entry.eventType === "duty_acknowledged" && entry.actorId === owner,
      );
    return {
      event: this.cloneEvent(event),
      timeline: timeline.map((entry) => this.cloneTimeline(entry)),
      dutyAcknowledgement: {
        sosEventId,
        acknowledgedByActorId: owner,
        acknowledgedAt: event.dutyAcknowledgement.acknowledgedAt!,
        note: (existingAck?.payload.note as string | null | undefined) ?? null,
      },
      wonAcknowledgement: owner === actorId,
    };
  }

  async getEventForOps(
    sosEventId: string,
    identity: BootstrapRequestIdentity | null,
  ): Promise<DriverSosEventReadback> {
    this.requireOpsIdentity(identity);
    this.requireEventForOps(sosEventId);
    const event = await this.hydrateAndReconcile(sosEventId, identity);
    return {
      event: this.cloneEvent(event),
      timeline: (this.timelines.get(sosEventId) ?? []).map((entry) =>
        this.cloneTimeline(entry),
      ),
    };
  }

  async getEventByIncidentIdForOps(
    incidentId: string,
    identity: BootstrapRequestIdentity | null,
  ): Promise<DriverSosEventReadback> {
    this.requireOpsIdentity(identity);
    const found = this.events.find(
      (candidate) => candidate.incidentId === incidentId,
    );
    if (!found) {
      throw new ApiRequestError(
        HttpStatus.NOT_FOUND,
        "DRIVER_SOS_EVENT_NOT_FOUND",
        `No driver SOS event correlates to incident ${incidentId}.`,
      );
    }
    const event = await this.hydrateAndReconcile(found.sosEventId, identity);
    return {
      event: this.cloneEvent(event),
      timeline: (this.timelines.get(event.sosEventId) ?? []).map((entry) =>
        this.cloneTimeline(entry),
      ),
    };
  }

  async getOwnEventForDriver(
    sosEventId: string,
    identity: BootstrapRequestIdentity | null,
  ): Promise<DriverSosEventReadback> {
    const driverId = this.requireDriverIdentity(identity);
    this.requireDriverEvent(sosEventId, driverId);
    const event = await this.hydrateAndReconcile(sosEventId, identity);
    return {
      event: this.cloneEvent(event),
      timeline: (this.timelines.get(sosEventId) ?? []).map((entry) =>
        this.cloneTimeline(entry),
      ),
    };
  }

  /** Acquires this event's mutation lock exactly once and runs both
   * authoritative-store hydration and Incident-progression reconcile inside
   * it, so the two steps apply to a single consistent snapshot and can
   * never interleave with a concurrent acknowledgeDuty call for the same
   * event (F2). Must be the only entry point into the lock from a readback
   * caller -- the helpers it calls assume the lock is already held and must
   * never re-acquire it themselves. */
  private hydrateAndReconcile(
    sosEventId: string,
    identity: BootstrapRequestIdentity | null,
  ): Promise<DriverSosEventRecord> {
    return this.withEventMutationLock(sosEventId, async () => {
      const hydrated = await this.hydrateFromAuthoritativeStoreIfPending(
        sosEventId,
      );
      return this.reconcileWithIncidentLocked(hydrated.sosEventId, identity);
    });
  }

  private requireEventForOps(sosEventId: string) {
    const event = this.eventById.get(sosEventId);
    if (!event) {
      throw new ApiRequestError(
        HttpStatus.NOT_FOUND,
        "DRIVER_SOS_EVENT_NOT_FOUND",
        "The driver SOS event was not found.",
      );
    }
    return event;
  }

  private replaceEvent(event: DriverSosEventRecord) {
    const cloned = this.cloneEvent(event);
    this.eventById.set(cloned.sosEventId, cloned);
    this.events = this.events.map((candidate) =>
      candidate.sosEventId === cloned.sosEventId ? cloned : candidate,
    );
  }

  /**
   * Reload the event + timeline + outbox straight from the DB and merge it
   * with this process's own cache, keeping whichever side has made more
   * forward progress along the S-3 progression. A competing process can
   * have already acknowledged, advanced, or closed this event without any
   * push channel telling this process (no push channel between processes),
   * so a locally cached snapshot is never reliable evidence of the
   * authoritative current state -- including once this process already
   * knows a duty owner: freshness does not stop at the first known owner
   * (F4). A no-op (not an error) when persistence is disabled, there is no
   * row yet, or the event is a dismissed false alarm (a terminal branch
   * outside this forward ranking).
   */
  private async hydrateFromAuthoritativeStoreIfPending(
    sosEventId: string,
  ): Promise<DriverSosEventRecord> {
    const cached = this.requireEventForOps(sosEventId);
    if (!this.repository || cached.status === "false_alarm_dismissed") {
      return cached;
    }

    const reloaded = await this.repository.reloadEventState(sosEventId);
    if (!reloaded) {
      return cached;
    }

    const authoritative = DriverSosService.preferForwardProgress(
      cached,
      reloaded.event,
    );
    if (authoritative === cached) {
      return cached;
    }

    this.replaceEvent(authoritative);
    this.timelines.set(
      sosEventId,
      reloaded.timelines.map((entry) => this.cloneTimeline(entry)),
    );
    if (reloaded.outbox) {
      this.urgentAlertOutbox.set(sosEventId, this.cloneOutbox(reloaded.outbox));
    }
    return this.eventById.get(sosEventId)!;
  }

  /** The authoritative (DB) record wins whenever it is at least as far
   * along the S-3 forward progression as the cached one -- including ties,
   * so a different owner recorded by a concurrent writer at the same rank
   * is always picked up. Falls back to the cached record for an unranked
   * status (e.g. local_triggered, queued_offline) or when the authoritative
   * read is actually behind (stale replica/race), so a reload can never
   * regress a known later state. */
  private static preferForwardProgress(
    cached: DriverSosEventRecord,
    authoritative: DriverSosEventRecord,
  ): DriverSosEventRecord {
    const cachedRank = DriverSosService.SOS_PROGRESS_RANK[cached.status];
    const authoritativeRank =
      DriverSosService.SOS_PROGRESS_RANK[authoritative.status];
    if (
      cachedRank === undefined ||
      authoritativeRank === undefined ||
      authoritativeRank < cachedRank
    ) {
      return cached;
    }
    return authoritative;
  }

  private markOutboxDelivered(sosEventId: string, deliveredAt: string) {
    const outbox = this.urgentAlertOutbox.get(sosEventId);
    if (!outbox || outbox.status === "delivered" || outbox.status === "failed") {
      return;
    }
    this.urgentAlertOutbox.set(
      sosEventId,
      this.cloneOutbox({
        ...outbox,
        status: "delivered",
        deliveredAt: outbox.deliveredAt ?? deliveredAt,
      }),
    );
  }

  /** Ranks of the forward (non-false-alarm) S-3 progression; anything not
   * listed (local_triggered, queued_offline, false_alarm_dismissed) is not
   * part of this monotonic readback reconciliation. */
  private static readonly SOS_PROGRESS_RANK: Partial<
    Record<DriverSosStatus, number>
  > = {
    submitted: 0,
    duty_alerted: 1,
    acknowledged: 2,
    investigating: 3,
    resolved: 4,
    closed: 5,
  };

  private static readonly INCIDENT_TO_SOS_STATUS: Partial<
    Record<IncidentStatus, DriverSosStatus>
  > = {
    investigating: "investigating",
    resolved: "resolved",
    closed: "closed",
  };

  /**
   * Lazily reconciles the Incident module's own status progression onto the
   * correlated DriverSosEvent on read. The Incident module has no knowledge
   * of (and no push channel into) the SOS event, so each authoritative
   * readback is the point where drift between "Incident says resolved" and
   * "SOS event still says acknowledged" gets caught up -- exactly once per
   * transition, never re-applied once already reconciled.
   *
   * Must only run inside {@link eventMutationQueues}'s per-event lock (via
   * {@link hydrateAndReconcile} or {@link acknowledgeDuty}'s own lock) --
   * never acquires the lock itself. Re-reads the event's current (possibly
   * already-reconciled-by-a-prior-holder) state instead of trusting a
   * caller's snapshot, so a second concurrent readback never re-derives and
   * re-appends a transition the first holder already committed, and a
   * concurrent acknowledgeDuty's write is never observed mid-flight.
   */
  private async reconcileWithIncidentLocked(
    sosEventId: string,
    identity: BootstrapRequestIdentity | null,
  ): Promise<DriverSosEventRecord> {
    const event = this.eventById.get(sosEventId);
    if (!event || !event.incidentId || event.status === "false_alarm_dismissed") {
      return event ?? this.requireEventForOps(sosEventId);
    }

    let incident: IncidentRecord;
    try {
      incident = this.incidentService.getIncident(event.incidentId, identity);
    } catch {
      return event;
    }

    const targetStatus =
      DriverSosService.INCIDENT_TO_SOS_STATUS[incident.status];
    if (!targetStatus) {
      return event;
    }

    const currentRank = DriverSosService.SOS_PROGRESS_RANK[event.status];
    const targetRank = DriverSosService.SOS_PROGRESS_RANK[targetStatus];
    if (
      currentRank === undefined ||
      targetRank === undefined ||
      targetRank <= currentRank
    ) {
      return event;
    }

    const now = new Date().toISOString();
    const rankToStatus = Object.entries(DriverSosService.SOS_PROGRESS_RANK).reduce<
      Record<number, DriverSosStatus>
    >((acc, [status, rank]) => {
      acc[rank as number] = status as DriverSosStatus;
      return acc;
    }, {});
    const timelineEntries: DriverSosTimelineEntry[] = [];
    for (let rank = currentRank + 1; rank <= targetRank; rank += 1) {
      const stepStatus = rankToStatus[rank];
      if (stepStatus === "investigating" || stepStatus === "resolved" || stepStatus === "closed") {
        timelineEntries.push(
          this.buildVerificationTimeline(
            event.sosEventId,
            stepStatus === "investigating" ? "investigation_started" : stepStatus,
            "system",
            "system.incident-sync",
            now,
            { incidentId: event.incidentId, incidentStatus: incident.status },
          ),
        );
      }
    }

    const updatedEvent: DriverSosEventRecord = {
      ...event,
      status: targetStatus,
      updatedAt: now,
    };
    await this.verificationRepository?.persistStatusTransition(
      updatedEvent,
      timelineEntries,
    );
    this.replaceEvent(updatedEvent);
    for (const entry of timelineEntries) {
      this.appendTimeline(entry);
    }
    return updatedEvent;
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

  private async loadAttachments(sosEventId: string) {
    const cached = this.attachments.get(sosEventId);
    if (cached) {
      return cached;
    }
    const persisted =
      (await this.verificationRepository?.listAttachments(sosEventId)) ?? [];
    const cloned = persisted.map((attachment) =>
      this.cloneAttachment(attachment),
    );
    this.attachments.set(sosEventId, cloned);
    return cloned;
  }

  private async findUploadIntent(objectKey: string) {
    const cached = this.uploadIntents.get(objectKey);
    if (cached) {
      return cached;
    }
    const persisted =
      (await this.verificationRepository?.findUploadIntent(objectKey)) ?? null;
    if (persisted) {
      this.uploadIntents.set(objectKey, persisted);
    }
    return persisted;
  }

  private assertConfirmableIntent(
    intent: DriverSosUploadIntentRecord | null,
    event: DriverSosEventRecord,
    driverId: string,
  ): asserts intent is DriverSosUploadIntentRecord {
    if (
      !intent ||
      intent.sosEventId !== event.sosEventId ||
      intent.driverId !== driverId
    ) {
      throw new ApiRequestError(
        HttpStatus.NOT_FOUND,
        "DRIVER_SOS_UPLOAD_INTENT_NOT_FOUND",
        "The attachment upload intent was not found.",
      );
    }
    if (intent.state !== "active") {
      throw new ApiRequestError(
        HttpStatus.CONFLICT,
        "DRIVER_SOS_UPLOAD_INTENT_NOT_ACTIVE",
        "The attachment upload intent is no longer active.",
      );
    }
    if (Date.parse(intent.expiresAt) <= Date.now()) {
      intent.state = "expired";
      throw new ApiRequestError(
        HttpStatus.GONE,
        "DRIVER_SOS_UPLOAD_INTENT_EXPIRED",
        "The attachment upload intent has expired.",
      );
    }
  }

  private assertUploadedObjectMatchesIntent(
    intent: DriverSosUploadIntentRecord,
    uploadedObject: DriverSosUploadedObjectMetadata,
  ) {
    const checksum = uploadedObject.checksumSha256?.trim();
    const mismatch =
      uploadedObject.objectKey !== intent.objectKey ||
      uploadedObject.contentType.trim().toLowerCase() !== intent.contentType ||
      uploadedObject.fileSize !== intent.fileSize ||
      !SHA256_PATTERN.test(checksum);
    if (mismatch) {
      throw new ApiRequestError(
        HttpStatus.CONFLICT,
        "DRIVER_SOS_ATTACHMENT_METADATA_MISMATCH",
        "Uploaded object metadata does not match the issued upload intent.",
      );
    }
  }

  private async scanAttachment(
    event: DriverSosEventRecord,
    attachment: DriverSosAttachmentRecord,
  ) {
    const scanStartedAt = new Date().toISOString();
    let updated: DriverSosAttachmentRecord;
    let availability;
    try {
      availability = this.attachmentScanner?.availability() ?? {
        state: "unavailable" as const,
        reason: "No attachment scanner is configured.",
      };
    } catch {
      availability = {
        state: "unavailable" as const,
        reason: "Attachment scanner availability could not be determined.",
      };
    }

    if (availability.state === "unavailable" || !this.attachmentScanner) {
      updated = {
        ...attachment,
        scanStatus: "unavailable",
        scannerProvider: this.attachmentScanner?.providerName ?? null,
        scanReason:
          availability.state === "unavailable"
            ? availability.reason
            : "No attachment scanner is configured.",
        updatedAt: scanStartedAt,
      };
    } else {
      try {
        const result = await this.attachmentScanner.scan({
          attachment: this.cloneAttachment(attachment),
        });
        if (!["clean", "infected", "error"].includes(result.status)) {
          throw new Error("Scanner returned an unsupported status.");
        }
        updated = {
          ...attachment,
          scanStatus: result.status,
          scannerProvider: this.attachmentScanner.providerName,
          scanReason: result.reason,
          scanAttemptCount: attachment.scanAttemptCount + 1,
          lastScanAttemptAt: scanStartedAt,
          scannedAt: this.normalizeIsoTimestamp(
            result.scannedAt,
            "scanner.scannedAt",
          ),
          updatedAt: scanStartedAt,
        };
      } catch {
        updated = {
          ...attachment,
          scanStatus: "error",
          scannerProvider: this.attachmentScanner.providerName,
          scanReason: "Attachment scanner could not complete the scan.",
          scanAttemptCount: attachment.scanAttemptCount + 1,
          lastScanAttemptAt: scanStartedAt,
          scannedAt: null,
          updatedAt: scanStartedAt,
        };
      }
    }

    const timeline = this.buildVerificationTimeline(
      event.sosEventId,
      "attachment_scan_updated",
      "system",
      updated.scannerProvider ?? "system.driver-sos",
      scanStartedAt,
      {
        attachmentId: attachment.attachmentId,
        scanStatus: updated.scanStatus,
        scannerProvider: updated.scannerProvider,
        scanReason: updated.scanReason,
        scanAttemptCount: updated.scanAttemptCount,
        failClosed: updated.scanStatus !== "clean",
      },
    );
    await this.verificationRepository?.persistAttachmentScanUpdate(
      updated,
      timeline,
    );
    this.replaceAttachment(updated);
    this.appendTimeline(timeline);
    return updated;
  }

  private getStorageAvailability() {
    if (!this.attachmentStorage) {
      return {
        state: "unavailable" as const,
        reason: "No attachment storage provider is configured.",
      };
    }
    try {
      return this.attachmentStorage.availability();
    } catch {
      return {
        state: "unavailable" as const,
        reason: "Attachment storage availability could not be determined.",
      };
    }
  }

  private appendAttachment(attachment: DriverSosAttachmentRecord) {
    const existing = this.attachments.get(attachment.sosEventId) ?? [];
    this.attachments.set(attachment.sosEventId, [
      ...existing,
      this.cloneAttachment(attachment),
    ]);
  }

  private replaceAttachment(attachment: DriverSosAttachmentRecord) {
    const existing = this.attachments.get(attachment.sosEventId) ?? [];
    this.attachments.set(
      attachment.sosEventId,
      existing.map((candidate) =>
        candidate.attachmentId === attachment.attachmentId
          ? this.cloneAttachment(attachment)
          : candidate,
      ),
    );
  }

  private appendTimeline(timeline: DriverSosTimelineEntry) {
    const existing = this.timelines.get(timeline.sosEventId) ?? [];
    this.timelines.set(timeline.sosEventId, [
      ...existing,
      this.cloneTimeline(timeline),
    ]);
  }

  private buildVerificationTimeline(
    sosEventId: string,
    eventType: DriverSosTimelineEntry["eventType"],
    actorType: DriverSosTimelineEntry["actorType"],
    actorId: string | null,
    occurredAt: string,
    payload: Record<string, unknown>,
  ): DriverSosTimelineEntry {
    return {
      timelineId: randomUUID(),
      sosEventId,
      eventType,
      actorType,
      actorId,
      occurredAt,
      recordedAt: new Date().toISOString(),
      payload,
    };
  }

  private percentile(sortedValues: number[], quantile: number) {
    if (sortedValues.length === 0) {
      return null;
    }
    const position = (sortedValues.length - 1) * quantile;
    const lowerIndex = Math.floor(position);
    const upperIndex = Math.ceil(position);
    const lower = sortedValues[lowerIndex]!;
    const upper = sortedValues[upperIndex]!;
    return lower + (upper - lower) * (position - lowerIndex);
  }

  private requireDriverEvent(sosEventId: string, driverId: string) {
    const event = this.eventById.get(sosEventId);
    if (!event || event.driverId !== driverId) {
      throw new ApiRequestError(
        HttpStatus.NOT_FOUND,
        "DRIVER_SOS_EVENT_NOT_FOUND",
        "The driver SOS event was not found.",
      );
    }
    return event;
  }

  private requireDriverIdentity(identity: BootstrapRequestIdentity | null) {
    if (identity?.realm === "driver" && identity.actorId) {
      return normalizeDriverId(identity.actorId)!;
    }

    throw new ApiRequestError(
      HttpStatus.FORBIDDEN,
      "DRIVER_REALM_REQUIRED",
      "Driver SOS submissions must use an authenticated driver bearer context.",
    );
  }

  private requireOpsIdentity(identity: BootstrapRequestIdentity | null) {
    if (
      (identity?.realm === "ops" || identity?.realm === "system") &&
      identity.actorId
    ) {
      return identity.actorId;
    }
    throw new ApiRequestError(
      HttpStatus.FORBIDDEN,
      "OPS_REALM_REQUIRED",
      "SOS alert render receipts require an authenticated Ops context.",
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
        fleetReportConfirmedAt: event.fleetReportConfirmedAt,
      },
      createdAt: now,
      deliveredAt: null,
      fleetReportConfirmedAt: event.fleetReportConfirmedAt ?? now,
      opsAlertRenderedAt: null,
      opsAlertReceiptRecordedAt: null,
      alertToOpsLatencyMs: null,
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

  private mapIncidentCategory(
    eventType: DriverSosEventType | null,
  ): IncidentCategory {
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

  private mapIncidentSeverity(
    severity: DriverSosSeverity | null,
  ): IncidentSeverity {
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

  private normalizeAttachmentType(value: unknown) {
    if (value !== "photo" && value !== "audio") {
      throw new ApiRequestError(
        HttpStatus.BAD_REQUEST,
        "VALIDATION_ERROR",
        "attachmentType must be photo or audio.",
      );
    }
    return value;
  }

  private normalizeAttachmentFileName(value: string) {
    const normalized = this.normalizeRequired(value, "originalFileName");
    const hasControlCharacter = [...normalized].some(
      (character) => character.charCodeAt(0) < 32,
    );
    if (normalized.length > 180 || hasControlCharacter) {
      throw new ApiRequestError(
        HttpStatus.BAD_REQUEST,
        "VALIDATION_ERROR",
        "originalFileName is invalid or too long.",
      );
    }
    return normalized;
  }

  private normalizeAttachmentContentType(
    attachmentType: "photo" | "audio",
    value: string,
  ) {
    const normalized = this.normalizeRequired(
      value,
      "contentType",
    ).toLowerCase();
    if (!DRIVER_SOS_ATTACHMENT_CONTENT_TYPES[attachmentType].has(normalized)) {
      throw new ApiRequestError(
        HttpStatus.BAD_REQUEST,
        "DRIVER_SOS_ATTACHMENT_CONTENT_TYPE_UNSUPPORTED",
        "The attachment content type is not supported.",
        { attachmentType, contentType: normalized },
      );
    }
    return normalized;
  }

  private normalizeAttachmentFileSize(
    attachmentType: "photo" | "audio",
    value: number,
  ) {
    if (
      !Number.isSafeInteger(value) ||
      value <= 0 ||
      value > DRIVER_SOS_ATTACHMENT_SIZE_LIMITS[attachmentType]
    ) {
      throw new ApiRequestError(
        HttpStatus.BAD_REQUEST,
        "DRIVER_SOS_ATTACHMENT_SIZE_INVALID",
        "The attachment file size is invalid or exceeds the allowed limit.",
        {
          attachmentType,
          fileSize: value,
          maximumFileSize: DRIVER_SOS_ATTACHMENT_SIZE_LIMITS[attachmentType],
        },
      );
    }
    return value;
  }

  private normalizeIncidentIds(value: string[]) {
    if (!Array.isArray(value) || value.length === 0 || value.length > 100) {
      throw new ApiRequestError(
        HttpStatus.BAD_REQUEST,
        "VALIDATION_ERROR",
        "incidentIds must contain between 1 and 100 incident IDs.",
      );
    }
    const incidentIds = [
      ...new Set(
        value.map((incidentId) =>
          this.normalizeRequired(incidentId, "incidentIds"),
        ),
      ),
    ];
    if (incidentIds.length !== value.length) {
      throw new ApiRequestError(
        HttpStatus.BAD_REQUEST,
        "VALIDATION_ERROR",
        "incidentIds must not contain duplicates.",
      );
    }
    return incidentIds;
  }

  private sanitizeObjectFileName(fileName: string) {
    const sanitized = fileName
      .replace(/[^a-zA-Z0-9._-]+/g, "-")
      .replace(/^-+|-+$/g, "")
      .slice(0, 80);
    return sanitized || "attachment";
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
    if (
      !event.incidentId ||
      !event.serverReceivedAt ||
      !event.fleetReportConfirmedAt
    ) {
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
        fleetReportConfirmedAt: event.fleetReportConfirmedAt,
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

  private cloneAttachment(
    attachment: DriverSosAttachmentRecord,
  ): DriverSosAttachmentRecord {
    return { ...attachment };
  }

  private recordMutationAudit(
    actionName: string,
    event: DriverSosEventRecord,
    identity: BootstrapRequestIdentity | null,
    requestId: string | undefined,
    summary: Record<string, unknown>,
  ) {
    const log: Omit<AuditLogRecord, "auditId" | "createdAt" | "requestId"> = {
      actorId: identity?.actorId ?? event.driverId,
      actorType: this.resolveAuditActorType(identity),
      tenantId: identity?.tenantId ?? null,
      moduleName: "driver-sos",
      actionName,
      resourceType: "driver_sos_event",
      resourceId: event.sosEventId,
      newValuesSummary: {
        eventNo: event.eventNo,
        incidentId: event.incidentId,
        ...summary,
      },
    };
    this.auditNotificationService.recordAuditLog(
      requestId ? { ...log, requestId } : log,
    );
  }

  private recordOpsRenderAudit(
    observations: DriverSosAlertRenderObservation[],
    identity: BootstrapRequestIdentity | null,
    requestId?: string,
  ) {
    const log: Omit<AuditLogRecord, "auditId" | "createdAt" | "requestId"> = {
      actorId: identity?.actorId ?? "ops-console",
      actorType: this.resolveAuditActorType(identity),
      tenantId: identity?.tenantId ?? null,
      moduleName: "driver-sos",
      actionName: "record_ops_alert_rendered",
      resourceType: "driver_sos_alert_batch",
      resourceId: observations.map((item) => item.incidentId).join(","),
      newValuesSummary: {
        observationCount: observations.length,
        duplicateCount: observations.filter((item) => item.duplicate).length,
        incidentIds: observations.map((item) => item.incidentId),
      },
    };
    this.auditNotificationService.recordAuditLog(
      requestId ? { ...log, requestId } : log,
    );
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
      case "partner_user":
        return identity.actorType;
      default:
        return "system";
    }
  }
}
