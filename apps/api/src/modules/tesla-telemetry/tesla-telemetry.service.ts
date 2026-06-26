import { createHash, randomUUID } from "node:crypto";

import { Injectable, Logger, Optional } from "@nestjs/common";

import type {
  Phase2SourceMetadata,
  TeslaPublicTelemetrySample,
  TeslaVehicleStateSnapshot,
} from "@drts/contracts";

import { AuditNotificationService } from "../audit-notification/audit-notification.service";
import {
  TeslaTelemetryRepository,
  type TeslaProviderHealthState,
  type TeslaTelemetryBackfillQuery,
  type TeslaTelemetryEventRecord,
  type TeslaTelemetryEventStatus,
  type TeslaTelemetryFeedKind,
  type TeslaTelemetryHealthRecord,
} from "./tesla-telemetry.repository";

const DEFAULT_PROVIDER_CODE = "tesla";
const DEFAULT_DELAY_THRESHOLD_SECONDS = 30;
const DEFAULT_GAP_THRESHOLD_SECONDS = 60;
const DEFAULT_DISPATCH_HOLD_THRESHOLD_SECONDS = 180;
const DEFAULT_QUALITY_GATE_SCORE = 0.8;
const DEFAULT_INCIDENT_SCORE = 0.5;
const SUPPORTED_SCHEMA_VERSIONS: Record<TeslaTelemetryFeedKind, Set<string>> = {
  vehicle_state: new Set(["tesla.vehicle-state.v1"]),
  public_telemetry: new Set(["tesla.public-telemetry.v1"]),
};

type TelemetryTracker = {
  providerCode: string;
  feedKind: TeslaTelemetryFeedKind;
  externalVehicleRef: string;
  sessionId: string | null;
  vehicleId: string | null;
  sequences: Map<number, TeslaTelemetryEventRecord>;
  latestSequenceNo: number | null;
  latestContiguousSequenceNo: number | null;
  lastEventId: string | null;
  lastCapturedAt: string | null;
  lastReceivedAt: string | null;
  gapDetectedAt: string | null;
  backfillRequestedAt: string | null;
  completedAt: string | null;
  staleHeartbeatAt: string | null;
  lastUnknownSchemaAt: string | null;
  lastQualityIncidentAt: string | null;
  issueCodes: Set<string>;
  currentHealthState: TeslaProviderHealthState;
  lastBackfillId: string | null;
};

type IngestContext = {
  providerCode?: string;
  sessionId?: string | null;
  eventId: string;
  sequenceNo: number;
  schemaVersion: string;
  receivedAt?: string;
};

export type TeslaTelemetryIngestReceipt = {
  receiptId: string;
  providerCode: string;
  feedKind: TeslaTelemetryFeedKind;
  externalVehicleRef: string;
  sessionId: string | null;
  eventId: string;
  sequenceNo: number;
  status: TeslaTelemetryEventStatus;
  duplicate: boolean;
  quarantined: boolean;
  qualityScore: number;
  providerHealthState: TeslaProviderHealthState;
  dispatchHold: boolean;
  backfillRequired: boolean;
  receivedAt: string;
};

@Injectable()
export class TeslaTelemetryService {
  private readonly logger = new Logger(TeslaTelemetryService.name);

  private readonly trackers = new Map<string, TelemetryTracker>();

  constructor(
    private readonly repository = new TeslaTelemetryRepository(),
    @Optional()
    private readonly auditNotificationService = new AuditNotificationService(),
  ) {}

  async ingestVehicleStateSnapshot(
    snapshot: Omit<TeslaVehicleStateSnapshot, "snapshotId" | "source">,
    context: IngestContext,
  ): Promise<TeslaTelemetryIngestReceipt> {
    return this.ingestTelemetryEvent("vehicle_state", snapshot, context);
  }

  async ingestPublicTelemetrySample(
    sample: Omit<TeslaPublicTelemetrySample, "sampleId" | "source">,
    context: IngestContext,
  ): Promise<TeslaTelemetryIngestReceipt> {
    return this.ingestTelemetryEvent("public_telemetry", sample, context);
  }

  getProviderHealth(input: {
    feedKind: TeslaTelemetryFeedKind;
    externalVehicleRef: string;
    sessionId?: string | null;
    asOf?: string;
  }): TeslaTelemetryHealthRecord | null {
    const tracker = this.trackers.get(
      this.trackerKey(
        DEFAULT_PROVIDER_CODE,
        input.feedKind,
        input.externalVehicleRef,
        input.sessionId ?? null,
      ),
    );
    if (!tracker) {
      return null;
    }

    return this.evaluateTrackerHealth(
      tracker,
      input.asOf ?? tracker.lastReceivedAt ?? new Date().toISOString(),
    );
  }

  listBackfillQueries() {
    return this.repository.listBackfillQueries();
  }

  listTelemetryEvents(filter?: {
    feedKind?: TeslaTelemetryFeedKind;
    externalVehicleRef?: string;
    sessionId?: string | null;
  }) {
    return this.repository.listEvents(filter);
  }

  private async ingestTelemetryEvent(
    feedKind: TeslaTelemetryFeedKind,
    payload:
      | Omit<TeslaVehicleStateSnapshot, "snapshotId" | "source">
      | Omit<TeslaPublicTelemetrySample, "sampleId" | "source">,
    context: IngestContext,
  ) {
    const providerCode = (context.providerCode ?? DEFAULT_PROVIDER_CODE)
      .trim()
      .toLowerCase();
    const sessionId = context.sessionId ?? null;
    const receivedAt = this.requireIsoTimestamp(
      context.receivedAt ?? new Date().toISOString(),
      "receivedAt",
    );
    const externalVehicleRef = this.requireNonEmptyString(
      payload.externalVehicleRef,
      "externalVehicleRef",
    );
    const capturedAt = this.requireIsoTimestamp(
      payload.capturedAt,
      "capturedAt",
    );
    const tracker = this.getOrCreateTracker({
      providerCode,
      feedKind,
      externalVehicleRef,
      sessionId,
      vehicleId: "vehicleId" in payload ? payload.vehicleId : null,
    });

    const duplicateByEvent = await this.repository.findEventByProviderRef(
      providerCode,
      feedKind,
      context.eventId,
    );
    if (duplicateByEvent) {
      const health = this.evaluateTrackerHealth(
        tracker,
        receivedAt,
        duplicateByEvent.ingestStatus === "quarantined"
          ? "UNKNOWN_SCHEMA"
          : undefined,
      );
      return this.buildReceipt(duplicateByEvent, health, true);
    }

    const duplicateBySequence = await this.repository.findEventBySequence(
      providerCode,
      feedKind,
      externalVehicleRef,
      sessionId,
      context.sequenceNo,
    );
    if (duplicateBySequence) {
      const health = this.evaluateTrackerHealth(
        tracker,
        receivedAt,
        duplicateBySequence.ingestStatus === "quarantined"
          ? "UNKNOWN_SCHEMA"
          : undefined,
      );
      return this.buildReceipt(duplicateBySequence, health, true);
    }

    const supportedSchemas =
      SUPPORTED_SCHEMA_VERSIONS[feedKind] ?? new Set<string>();
    const schemaSupported = supportedSchemas.has(context.schemaVersion);
    const qualityIssue =
      this.detectQualityIssue(feedKind, payload) ??
      (!schemaSupported ? "UNKNOWN_SCHEMA" : null);

    const eventRecord = await this.repository.createEvent({
      providerCode,
      feedKind,
      vehicleId: "vehicleId" in payload ? payload.vehicleId : null,
      externalVehicleRef,
      sessionId,
      providerEventId: context.eventId,
      sequenceNo: this.requireSequenceNo(context.sequenceNo),
      capturedAt,
      sourceSchemaVersion: context.schemaVersion,
      payloadSha256: createHash("sha256")
        .update(JSON.stringify(payload))
        .digest("hex"),
      payloadBody: structuredClone(payload as Record<string, unknown>),
      receivedAt,
      ingestStatus:
        !schemaSupported || qualityIssue === "INVALID_SAMPLE"
          ? "quarantined"
          : "accepted",
      quarantineReason:
        !schemaSupported || qualityIssue === "INVALID_SAMPLE"
          ? (qualityIssue ?? "UNKNOWN_SCHEMA")
          : null,
    });

    this.applyEventToTracker(tracker, eventRecord);

    if (eventRecord.ingestStatus === "accepted") {
      if (feedKind === "vehicle_state") {
        await this.repository.saveVehicleStateSnapshot(
          this.buildVehicleStateSnapshot(
            payload as Omit<TeslaVehicleStateSnapshot, "snapshotId" | "source">,
            eventRecord,
          ),
        );
      } else {
        await this.repository.savePublicTelemetrySample(
          this.buildPublicTelemetrySample(
            payload as Omit<TeslaPublicTelemetrySample, "sampleId" | "source">,
            eventRecord,
          ),
        );
      }
    } else {
      tracker.lastUnknownSchemaAt = receivedAt;
      tracker.issueCodes.add(eventRecord.quarantineReason ?? "UNKNOWN_SCHEMA");
      this.recordAudit("telemetry.quarantined", eventRecord.providerEventId, {
        feedKind,
        externalVehicleRef,
        reason: eventRecord.quarantineReason,
        sessionId,
      });
    }

    const health = this.evaluateTrackerHealth(
      tracker,
      receivedAt,
      eventRecord.quarantineReason ?? undefined,
    );
    return this.buildReceipt(eventRecord, health, false);
  }

  private getOrCreateTracker(input: {
    providerCode: string;
    feedKind: TeslaTelemetryFeedKind;
    externalVehicleRef: string;
    sessionId: string | null;
    vehicleId: string | null;
  }) {
    const key = this.trackerKey(
      input.providerCode,
      input.feedKind,
      input.externalVehicleRef,
      input.sessionId,
    );
    const existing = this.trackers.get(key);
    if (existing) {
      if (!existing.vehicleId && input.vehicleId) {
        existing.vehicleId = input.vehicleId;
      }
      return existing;
    }

    const tracker: TelemetryTracker = {
      providerCode: input.providerCode,
      feedKind: input.feedKind,
      externalVehicleRef: input.externalVehicleRef,
      sessionId: input.sessionId,
      vehicleId: input.vehicleId,
      sequences: new Map<number, TeslaTelemetryEventRecord>(),
      latestSequenceNo: null,
      latestContiguousSequenceNo: null,
      lastEventId: null,
      lastCapturedAt: null,
      lastReceivedAt: null,
      gapDetectedAt: null,
      backfillRequestedAt: null,
      completedAt: null,
      staleHeartbeatAt: null,
      lastUnknownSchemaAt: null,
      lastQualityIncidentAt: null,
      issueCodes: new Set<string>(),
      currentHealthState: "healthy",
      lastBackfillId: null,
    };
    this.trackers.set(key, tracker);
    return tracker;
  }

  private applyEventToTracker(
    tracker: TelemetryTracker,
    eventRecord: TeslaTelemetryEventRecord,
  ) {
    const priorContiguous =
      tracker.latestContiguousSequenceNo ?? eventRecord.sequenceNo - 1;
    if (eventRecord.ingestStatus === "accepted") {
      tracker.sequences.set(eventRecord.sequenceNo, eventRecord);
    }
    tracker.latestSequenceNo = Math.max(
      tracker.latestSequenceNo ?? eventRecord.sequenceNo,
      eventRecord.sequenceNo,
    );
    tracker.lastEventId = eventRecord.providerEventId;
    tracker.lastCapturedAt = eventRecord.capturedAt;
    tracker.lastReceivedAt = eventRecord.receivedAt;
    if (eventRecord.quarantineReason) {
      tracker.lastQualityIncidentAt = eventRecord.receivedAt;
      tracker.issueCodes.add(eventRecord.quarantineReason);
    }

    let contiguous = priorContiguous;
    while (tracker.sequences.has(contiguous + 1)) {
      contiguous += 1;
    }

    tracker.latestContiguousSequenceNo = contiguous;
    if (
      eventRecord.sequenceNo > priorContiguous + 1 &&
      !tracker.gapDetectedAt
    ) {
      tracker.gapDetectedAt = eventRecord.receivedAt;
    }
    if (
      tracker.gapDetectedAt &&
      this.missingSequences(tracker).length === 0 &&
      tracker.latestSequenceNo !== null &&
      tracker.latestContiguousSequenceNo === tracker.latestSequenceNo
    ) {
      tracker.completedAt = eventRecord.receivedAt;
      tracker.currentHealthState = "complete";
      tracker.gapDetectedAt = null;
      tracker.issueCodes.delete("MISSING_SEQUENCE");
      tracker.issueCodes.delete("BACKFILL_REQUIRED");
    }
  }

  private evaluateTrackerHealth(
    tracker: TelemetryTracker,
    asOf: string,
    latestIssueCode?: string,
  ): TeslaTelemetryHealthRecord {
    const delayThresholdMs = this.secondsFromEnv(
      "TESLA_TELEMETRY_DELAY_THRESHOLD_SECONDS",
      DEFAULT_DELAY_THRESHOLD_SECONDS,
    );
    const gapThresholdMs = this.secondsFromEnv(
      "TESLA_TELEMETRY_GAP_THRESHOLD_SECONDS",
      DEFAULT_GAP_THRESHOLD_SECONDS,
    );
    const holdThresholdMs = this.secondsFromEnv(
      "TESLA_TELEMETRY_DISPATCH_HOLD_THRESHOLD_SECONDS",
      DEFAULT_DISPATCH_HOLD_THRESHOLD_SECONDS,
    );
    const qualityGate = this.numberFromEnv(
      "TESLA_TELEMETRY_QUALITY_GATE_SCORE",
      DEFAULT_QUALITY_GATE_SCORE,
    );
    const incidentGate = this.numberFromEnv(
      "TESLA_TELEMETRY_INCIDENT_SCORE",
      DEFAULT_INCIDENT_SCORE,
    );

    const issueCodes = new Set(tracker.issueCodes);
    if (latestIssueCode) {
      issueCodes.add(latestIssueCode);
    }

    const asOfDate = new Date(asOf);
    const lastReceivedDate = tracker.lastReceivedAt
      ? new Date(tracker.lastReceivedAt)
      : null;
    const heartbeatAgeMs = lastReceivedDate
      ? asOfDate.getTime() - lastReceivedDate.getTime()
      : Number.POSITIVE_INFINITY;
    const missingSequences = this.missingSequences(tracker);

    let state: TeslaProviderHealthState = "healthy";
    let staleHeartbeatAt: string | null = null;
    let backfillRequestedAt = tracker.backfillRequestedAt;
    let completedAt = tracker.completedAt;

    if (tracker.lastUnknownSchemaAt) {
      issueCodes.add("UNKNOWN_SCHEMA");
    }
    if (missingSequences.length > 0 && tracker.gapDetectedAt) {
      const gapAgeMs =
        asOfDate.getTime() - new Date(tracker.gapDetectedAt).getTime();
      if (gapAgeMs >= gapThresholdMs) {
        issueCodes.add("MISSING_SEQUENCE");
        if (!tracker.backfillRequestedAt) {
          state = "gap_detected";
          tracker.backfillRequestedAt = asOf;
          backfillRequestedAt = asOf;
          this.ensureBackfillQuery(tracker, missingSequences, asOf);
        } else {
          state = "backfill";
          issueCodes.add("BACKFILL_REQUIRED");
        }
      }
    } else if (
      tracker.currentHealthState === "complete" &&
      tracker.completedAt &&
      heartbeatAgeMs < delayThresholdMs
    ) {
      state = "complete";
    }

    if (state === "healthy" || state === "complete") {
      if (heartbeatAgeMs >= holdThresholdMs) {
        state = "incomplete_hold";
        staleHeartbeatAt = tracker.lastReceivedAt;
        issueCodes.add("STALE_HEARTBEAT");
      } else if (heartbeatAgeMs >= delayThresholdMs) {
        state = "delayed";
        staleHeartbeatAt = tracker.lastReceivedAt;
        issueCodes.add("STALE_HEARTBEAT");
      }
    }

    let qualityScore = 1;
    if (issueCodes.has("UNKNOWN_SCHEMA")) {
      qualityScore -= 0.55;
    }
    if (issueCodes.has("MISSING_SEQUENCE")) {
      qualityScore -= 0.1;
    }
    if (issueCodes.has("BACKFILL_REQUIRED")) {
      qualityScore -= 0.05;
    }
    if (issueCodes.has("STALE_HEARTBEAT")) {
      qualityScore -= state === "incomplete_hold" ? 0.35 : 0.15;
    }
    if (issueCodes.has("INVALID_SAMPLE")) {
      qualityScore -= 0.2;
    }
    qualityScore = Math.max(0, Number(qualityScore.toFixed(2)));

    if (issueCodes.has("UNKNOWN_SCHEMA")) {
      state = "regulator_data_incident";
    } else if (
      qualityScore <= incidentGate &&
      state !== "regulator_data_incident"
    ) {
      state = "regulator_data_incident";
    }
    const dispatchHold =
      state === "incomplete_hold" ||
      state === "regulator_data_incident" ||
      qualityScore < qualityGate;

    if (
      dispatchHold &&
      state !== "regulator_data_incident" &&
      state !== "incomplete_hold"
    ) {
      state = "incomplete_hold";
    }

    tracker.currentHealthState = state;
    tracker.staleHeartbeatAt = staleHeartbeatAt;
    tracker.backfillRequestedAt = backfillRequestedAt;
    tracker.completedAt = completedAt;
    tracker.issueCodes = issueCodes;

    const record: TeslaTelemetryHealthRecord = {
      providerCode: tracker.providerCode,
      feedKind: tracker.feedKind,
      externalVehicleRef: tracker.externalVehicleRef,
      sessionId: tracker.sessionId,
      healthState: state,
      qualityScore,
      dispatchHold,
      latestEventId: tracker.lastEventId,
      latestSequenceNo: tracker.latestSequenceNo,
      latestContiguousSequenceNo: tracker.latestContiguousSequenceNo,
      missingSequences,
      lastCapturedAt: tracker.lastCapturedAt,
      lastReceivedAt: tracker.lastReceivedAt,
      staleHeartbeatAt,
      gapDetectedAt: missingSequences.length > 0 ? tracker.gapDetectedAt : null,
      backfillRequestedAt,
      completedAt,
      issueCodes: [...issueCodes],
      evaluatedAt: asOf,
    };

    void this.repository.upsertHealthRecord(record);
    if (dispatchHold) {
      this.recordAudit("telemetry.dispatch_hold", tracker.lastEventId, {
        feedKind: tracker.feedKind,
        externalVehicleRef: tracker.externalVehicleRef,
        sessionId: tracker.sessionId,
        healthState: state,
        qualityScore,
      });
    }
    return record;
  }

  private ensureBackfillQuery(
    tracker: TelemetryTracker,
    missingSequences: number[],
    asOf: string,
  ) {
    if (tracker.lastBackfillId) {
      const existing = this.repository
        .listBackfillQueries()
        .find((item) => item.backfillId === tracker.lastBackfillId);
      if (existing) {
        void this.repository.upsertBackfillQuery({
          ...existing,
          to: asOf,
          eventId: tracker.lastEventId,
          status: "requested",
          updatedAt: asOf,
        });
        return;
      }
    }

    const query: TeslaTelemetryBackfillQuery = {
      backfillId: randomUUID(),
      providerCode: tracker.providerCode,
      feedKind: tracker.feedKind,
      vin: tracker.externalVehicleRef,
      from: this.resolveBackfillWindowStart(tracker),
      to: asOf,
      sessionId: tracker.sessionId,
      eventId: tracker.lastEventId,
      sequenceAfter:
        missingSequences.length > 0 ? Math.min(...missingSequences) - 1 : null,
      pageToken: null,
      status: "pending",
      detectedAt: tracker.gapDetectedAt ?? asOf,
      updatedAt: asOf,
    };
    tracker.lastBackfillId = query.backfillId;
    void this.repository.upsertBackfillQuery(query);
    this.recordAudit("telemetry.backfill_requested", tracker.lastEventId, {
      feedKind: tracker.feedKind,
      externalVehicleRef: tracker.externalVehicleRef,
      sessionId: tracker.sessionId,
      missingSequences,
      sequenceAfter: query.sequenceAfter,
    });
  }

  private resolveBackfillWindowStart(tracker: TelemetryTracker) {
    const contiguousEvent =
      tracker.latestContiguousSequenceNo === null
        ? null
        : tracker.sequences.get(tracker.latestContiguousSequenceNo) ?? null;
    return (
      contiguousEvent?.capturedAt ??
      tracker.lastCapturedAt ??
      tracker.lastReceivedAt ??
      new Date().toISOString()
    );
  }

  private buildVehicleStateSnapshot(
    payload: Omit<TeslaVehicleStateSnapshot, "snapshotId" | "source">,
    eventRecord: TeslaTelemetryEventRecord,
  ): TeslaVehicleStateSnapshot {
    return {
      snapshotId: randomUUID(),
      vehicleId: payload.vehicleId,
      externalVehicleRef: payload.externalVehicleRef,
      capturedAt: payload.capturedAt,
      location: payload.location ? { ...payload.location } : null,
      speedMps: payload.speedMps,
      headingDeg: payload.headingDeg,
      shiftState: payload.shiftState,
      autonomyState: payload.autonomyState,
      batteryLevelPct: payload.batteryLevelPct,
      batteryRangeKm: payload.batteryRangeKm,
      charging: payload.charging,
      online: payload.online,
      source: this.buildSourceMetadata(eventRecord),
    };
  }

  private buildPublicTelemetrySample(
    payload: Omit<TeslaPublicTelemetrySample, "sampleId" | "source">,
    eventRecord: TeslaTelemetryEventRecord,
  ): TeslaPublicTelemetrySample {
    return {
      sampleId: randomUUID(),
      externalVehicleRef: payload.externalVehicleRef,
      capturedAt: payload.capturedAt,
      location: payload.location ? { ...payload.location } : null,
      batteryLevelPct: payload.batteryLevelPct,
      online: payload.online,
      source: this.buildSourceMetadata(eventRecord),
    };
  }

  private buildSourceMetadata(
    eventRecord: TeslaTelemetryEventRecord,
  ): Phase2SourceMetadata {
    return {
      sourceSystem:
        eventRecord.feedKind === "vehicle_state"
          ? "tesla_fleet_api"
          : "tesla_public_telemetry",
      sourceRef: eventRecord.providerEventId,
      ingestedAt: eventRecord.receivedAt,
      recordedAt: eventRecord.capturedAt,
      signatureRef: null,
      schemaVersion: eventRecord.sourceSchemaVersion,
    };
  }

  private buildReceipt(
    eventRecord: TeslaTelemetryEventRecord,
    health: TeslaTelemetryHealthRecord,
    duplicate: boolean,
  ): TeslaTelemetryIngestReceipt {
    return {
      receiptId: randomUUID(),
      providerCode: eventRecord.providerCode,
      feedKind: eventRecord.feedKind,
      externalVehicleRef: eventRecord.externalVehicleRef,
      sessionId: eventRecord.sessionId,
      eventId: eventRecord.providerEventId,
      sequenceNo: eventRecord.sequenceNo,
      status: duplicate ? "duplicate" : eventRecord.ingestStatus,
      duplicate,
      quarantined: eventRecord.ingestStatus === "quarantined",
      qualityScore: health.qualityScore,
      providerHealthState: health.healthState,
      dispatchHold: health.dispatchHold,
      backfillRequired:
        health.issueCodes.includes("MISSING_SEQUENCE") ||
        health.issueCodes.includes("BACKFILL_REQUIRED"),
      receivedAt: eventRecord.receivedAt,
    };
  }

  private detectQualityIssue(
    feedKind: TeslaTelemetryFeedKind,
    payload:
      | Omit<TeslaVehicleStateSnapshot, "snapshotId" | "source">
      | Omit<TeslaPublicTelemetrySample, "sampleId" | "source">,
  ) {
    if (
      payload.location &&
      (!this.isFiniteNumber(payload.location.lat) ||
        payload.location.lat < -90 ||
        payload.location.lat > 90 ||
        !this.isFiniteNumber(payload.location.lng) ||
        payload.location.lng < -180 ||
        payload.location.lng > 180)
    ) {
      return "INVALID_SAMPLE";
    }
    if (
      "speedMps" in payload &&
      payload.speedMps !== null &&
      (!this.isFiniteNumber(payload.speedMps) ||
        payload.speedMps < 0 ||
        payload.speedMps >= 90)
    ) {
      return "INVALID_SAMPLE";
    }
    if (feedKind === "vehicle_state") {
      const vehicleState = payload as Omit<
        TeslaVehicleStateSnapshot,
        "snapshotId" | "source"
      >;
      if (
        typeof vehicleState.online !== "boolean" ||
        !["manual", "fsd_supervised", "fsd_engaged", "unknown"].includes(
          vehicleState.autonomyState,
        )
      ) {
        return "INVALID_SAMPLE";
      }
    }
    return null;
  }

  private missingSequences(tracker: TelemetryTracker) {
    if (
      tracker.latestSequenceNo === null ||
      tracker.latestContiguousSequenceNo === null ||
      tracker.latestSequenceNo <= tracker.latestContiguousSequenceNo
    ) {
      return [];
    }

    const missing: number[] = [];
    for (
      let sequence = tracker.latestContiguousSequenceNo + 1;
      sequence < tracker.latestSequenceNo;
      sequence += 1
    ) {
      if (!tracker.sequences.has(sequence)) {
        missing.push(sequence);
      }
    }
    return missing;
  }

  private trackerKey(
    providerCode: string,
    feedKind: TeslaTelemetryFeedKind,
    externalVehicleRef: string,
    sessionId: string | null,
  ) {
    return [providerCode, feedKind, externalVehicleRef, sessionId ?? ""].join(
      ":",
    );
  }

  private requireIsoTimestamp(value: string, fieldName: string) {
    const candidate = new Date(value);
    if (Number.isNaN(candidate.getTime())) {
      throw new Error(`${fieldName} must be a valid ISO timestamp.`);
    }
    return candidate.toISOString();
  }

  private requireNonEmptyString(value: string, fieldName: string) {
    if (!value || !value.trim()) {
      throw new Error(`${fieldName} is required.`);
    }
    return value.trim();
  }

  private requireSequenceNo(value: number) {
    if (!Number.isInteger(value) || value <= 0) {
      throw new Error("sequenceNo must be a positive integer.");
    }
    return value;
  }

  private secondsFromEnv(name: string, defaultValue: number) {
    return this.numberFromEnv(name, defaultValue) * 1000;
  }

  private numberFromEnv(name: string, defaultValue: number) {
    const raw = process.env[name];
    if (!raw) {
      return defaultValue;
    }
    const parsed = Number(raw);
    return Number.isFinite(parsed) && parsed > 0 ? parsed : defaultValue;
  }

  private isFiniteNumber(value: unknown): value is number {
    return typeof value === "number" && Number.isFinite(value);
  }

  private recordAudit(
    actionName: string,
    resourceId: string | null,
    newValuesSummary: Record<string, unknown>,
  ) {
    this.auditNotificationService?.recordAuditLog({
      actorId: null,
      actorType: "system",
      tenantId: null,
      moduleName: "tesla-telemetry",
      actionName,
      resourceType: "tesla_provider_telemetry",
      resourceId,
      newValuesSummary,
    });
    this.logger.debug(
      `${actionName} ${resourceId ?? "n/a"} ${JSON.stringify(newValuesSummary)}`,
    );
  }
}
