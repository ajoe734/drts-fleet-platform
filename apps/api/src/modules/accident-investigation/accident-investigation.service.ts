import { createHash, randomUUID } from "node:crypto";

import { Injectable, Logger, Optional } from "@nestjs/common";

import type {
  AccidentCaseRecord,
  AccidentCaseStatus,
  AccidentInvestigationBundleCustodyRecord,
  AccidentInvestigationBundleKnownGap,
  AccidentInvestigationBundleManifest,
  AccidentInvestigationBundleSection,
  AccidentInvestigationBundleView,
  AccidentExternalDocumentRecord,
  AccidentTimelineEntry,
  AccidentTimelineFactConfidence,
  AccidentTimelineFactRecord,
  AddAccidentTimelineFactCommand,
  CorrelatedTakeoverCase,
  CreateAccidentCaseCommand,
  EvidenceDiscrepancyCase,
  GenerateAccidentInvestigationBundleCommand,
  ImportAccidentExternalDocumentCommand,
  Phase2SourceMetadata,
  TransitionAccidentCaseCommand,
} from "@drts/contracts";

import { ApiRequestError } from "../../common/api-envelope";
import {
  DEFAULT_CONTROLLED_DOWNLOAD_HOST,
  DEFAULT_CONTROLLED_DOWNLOAD_KEY_ID,
  DEFAULT_CONTROLLED_DOWNLOAD_SECRET,
  DEFAULT_CONTROLLED_DOWNLOAD_SIGNATURE_VERSION,
  DEFAULT_CONTROLLED_DOWNLOAD_TTL_MINUTES,
  createControlledDownloadMetadata,
} from "../../common/controlled-download";
import { AuditNotificationService } from "../audit-notification/audit-notification.service";
import { OwnedMobilityService } from "../owned-mobility/owned-mobility.service";
import { RocOperationsService } from "../roc-operations/roc-operations.service";
import { SafetyOperatorService } from "../safety-operator/safety-operator.service";
import { SandboxGovernanceService } from "../sandbox-governance/sandbox-governance.service";
import { TeslaIntegrationService } from "../tesla-integration/tesla-integration.service";
import { VehicleEvidenceService } from "../vehicle-evidence/vehicle-evidence.service";

const CASE_STATUS_FLOW: readonly AccidentCaseStatus[] = [
  "detected",
  "roc_acknowledged",
  "operation_suspended",
  "emergency_response_active",
  "evidence_frozen",
  "initial_notification_sent",
  "under_investigation",
  "regulator_review",
  "closed",
];

const CASE_STATUS_LABELS: Record<AccidentCaseStatus, string> = {
  detected: "Accident detected",
  roc_acknowledged: "ROC acknowledged accident",
  operation_suspended: "Operation suspended",
  emergency_response_active: "Emergency response active",
  evidence_frozen: "Evidence frozen",
  initial_notification_sent: "Initial notification sent",
  under_investigation: "Accident under investigation",
  regulator_review: "Regulator review active",
  closed: "Accident case closed",
};

const CONFIDENCE_PRIORITY: Record<AccidentTimelineFactConfidence, number> = {
  provider_signed: 5,
  provider_reported: 4,
  platform_recorded: 3,
  operator_reported: 2,
  system_derived: 1,
  unknown: 0,
};

type BundleSnapshot = {
  timeline: AccidentTimelineEntry[];
  correlatedCase: CorrelatedTakeoverCase | null;
  discrepancies: EvidenceDiscrepancyCase[];
  order: ReturnType<OwnedMobilityService["getOrder"]> | null;
  dispatchTrace: ReturnType<OwnedMobilityService["listDispatchTrace"]> | null;
  telemetryStatus: ReturnType<TeslaIntegrationService["getTelemetryStatus"]> | null;
  publicTelemetrySample: ReturnType<
    TeslaIntegrationService["getPublicTelemetrySample"]
  > | null;
  telemetryProjection: ReturnType<
    TeslaIntegrationService["getTelemetryProjection"]
  > | null;
  teslaEvents: ReturnType<
    RocOperationsService["listTeslaAutonomyTransitionEvents"]
  > | null;
  rocResponses: ReturnType<
    RocOperationsService["listRocTakeoverResponseRecords"]
  > | null;
  manualCorrelations: ReturnType<
    RocOperationsService["listManualTakeoverCorrelations"]
  > | null;
  segments: ReturnType<VehicleEvidenceService["listSegmentIndex"]> | null;
  segmentsUnavailable: boolean;
  bookmarks: ReturnType<VehicleEvidenceService["listBookmarks"]> | null;
  bookmarksUnavailable: boolean;
  receipts: ReturnType<TeslaIntegrationService["listReceipts"]> | null;
  receiptsUnavailable: boolean;
};

type SnapshotResolution<T> = {
  value: T | null;
  unavailable: boolean;
};

@Injectable()
export class AccidentInvestigationService {
  private readonly logger = new Logger(AccidentInvestigationService.name);
  private readonly downloadHost = DEFAULT_CONTROLLED_DOWNLOAD_HOST;
  private readonly downloadSigningKeyId = DEFAULT_CONTROLLED_DOWNLOAD_KEY_ID;
  private readonly downloadSigningSecret = DEFAULT_CONTROLLED_DOWNLOAD_SECRET;
  private readonly downloadSignatureVersion =
    DEFAULT_CONTROLLED_DOWNLOAD_SIGNATURE_VERSION;
  private readonly downloadExpiryMinutes = DEFAULT_CONTROLLED_DOWNLOAD_TTL_MINUTES;

  private readonly accidentCases = new Map<string, AccidentCaseRecord>();
  private readonly timelineFacts = new Map<string, AccidentTimelineFactRecord[]>();
  private readonly externalDocuments = new Map<
    string,
    AccidentExternalDocumentRecord[]
  >();
  private readonly bundles = new Map<string, AccidentInvestigationBundleView>();

  constructor(
    private readonly rocOperationsService: RocOperationsService,
    @Optional()
    private readonly auditNotificationService?: AuditNotificationService,
    @Optional()
    private readonly ownedMobilityService?: OwnedMobilityService,
    @Optional()
    private readonly safetyOperatorService?: SafetyOperatorService,
    @Optional()
    private readonly sandboxGovernanceService?: SandboxGovernanceService,
    @Optional()
    private readonly teslaIntegrationService?: TeslaIntegrationService,
    @Optional()
    private readonly vehicleEvidenceService?: VehicleEvidenceService,
  ) {}

  listCorrelatedTakeoverCases(): CorrelatedTakeoverCase[] {
    return this.rocOperationsService.rebuildCorrelatedTakeoverCases().cases;
  }

  listEvidenceDiscrepancyCases(): EvidenceDiscrepancyCase[] {
    return this.rocOperationsService.rebuildCorrelatedTakeoverCases().discrepancies;
  }

  rebuildTakeoverCorrelationSnapshot() {
    return this.rocOperationsService.rebuildCorrelatedTakeoverCases();
  }

  listAccidentCases(): AccidentCaseRecord[] {
    return [...this.accidentCases.values()]
      .map((record) => this.cloneCase(this.synchronizeCaseLinks(record)))
      .sort((left, right) =>
        left.reportedAt < right.reportedAt ? 1 : -1,
      );
  }

  getAccidentCase(caseId: string): AccidentCaseRecord {
    return this.cloneCase(this.synchronizeCaseLinks(this.requireCase(caseId)));
  }

  createAccidentCase(command: CreateAccidentCaseCommand): AccidentCaseRecord {
    const now = new Date().toISOString();
    const caseId = this.normalizeIdentifier(
      command.caseId ?? `accident-case-${randomUUID()}`,
      "caseId",
    );
    if (this.accidentCases.has(caseId)) {
      throw new ApiRequestError(
        409,
        "ACCIDENT_CASE_EXISTS",
        `Accident case ${caseId} already exists.`,
        { caseId },
      );
    }

    const occurredAt = this.normalizeTimestamp(command.occurredAt, "occurredAt");
    const reportedAt = command.reportedAt
      ? this.normalizeTimestamp(command.reportedAt, "reportedAt")
      : now;
    const record: AccidentCaseRecord = {
      caseId,
      vehicleId: this.normalizeIdentifier(command.vehicleId, "vehicleId"),
      orderId: this.normalizeNullable(command.orderId),
      triggeringEventId: this.normalizeNullable(command.triggeringEventId),
      takeoverCorrelationId: this.normalizeNullable(
        command.takeoverCorrelationId,
      ),
      status: "detected",
      severity: command.severity,
      occurredAt,
      reportedAt,
      reportedBy: this.normalizeIdentifier(command.reportedBy, "reportedBy"),
      evidenceManifestId: this.normalizeNullable(command.evidenceManifestId),
      regulatoryReportId: this.normalizeNullable(command.regulatoryReportId),
      summary: this.normalizeNullable(command.summary),
      discrepancyCaseIds: [],
      externalDocumentIds: [],
      createdAt: now,
      updatedAt: reportedAt,
      closedAt: null,
    };

    this.accidentCases.set(caseId, record);
    const synchronized = this.synchronizeCaseLinks(record);
    this.storeTimelineFact(
      this.buildTimelineFact(caseId, {
        factId: `${caseId}:status:detected`,
        factKey: "case_status",
        label: CASE_STATUS_LABELS.detected,
        value: "detected",
        occurredAt,
        recordedAt: reportedAt,
        confidence: "platform_recorded",
        sourceSystem: "accident_case",
        sourceRef: caseId,
        schemaVersion: "accident-case-v1",
        note: synchronized.summary ?? "Accident case detected.",
        discrepancyCaseIds: synchronized.discrepancyCaseIds,
      }),
    );

    return this.cloneCase(synchronized);
  }

  transitionAccidentCase(
    caseId: string,
    command: TransitionAccidentCaseCommand,
  ): AccidentCaseRecord {
    const record = this.synchronizeCaseLinks(this.requireCase(caseId));
    if (record.status === command.toStatus) {
      return this.cloneCase(record);
    }

    const currentIndex = CASE_STATUS_FLOW.indexOf(record.status);
    const targetIndex = CASE_STATUS_FLOW.indexOf(command.toStatus);
    if (targetIndex !== currentIndex + 1) {
      throw new ApiRequestError(
        409,
        "ACCIDENT_CASE_INVALID_TRANSITION",
        `Cannot transition accident case from ${record.status} to ${command.toStatus}.`,
        {
          caseId,
          fromStatus: record.status,
          toStatus: command.toStatus,
          allowedNextStatus: CASE_STATUS_FLOW[currentIndex + 1] ?? null,
        },
      );
    }

    const transitionedAt = this.normalizeTimestamp(
      command.transitionedAt ?? new Date().toISOString(),
      "transitionedAt",
    );

    record.status = command.toStatus;
    record.updatedAt = transitionedAt;
    if (command.evidenceManifestId !== undefined) {
      record.evidenceManifestId = this.normalizeNullable(command.evidenceManifestId);
    }
    if (command.regulatoryReportId !== undefined) {
      record.regulatoryReportId = this.normalizeNullable(
        command.regulatoryReportId,
      );
    }
    if (command.toStatus === "closed") {
      record.closedAt = transitionedAt;
    }

    this.storeTimelineFact(
      this.buildTimelineFact(caseId, {
        factId: `${caseId}:status:${command.toStatus}:${transitionedAt}`,
        factKey: "case_status",
        label: CASE_STATUS_LABELS[command.toStatus],
        value: command.toStatus,
        occurredAt: transitionedAt,
        recordedAt: transitionedAt,
        confidence: "platform_recorded",
        sourceSystem: "accident_case",
        sourceRef: caseId,
        schemaVersion: "accident-case-v1",
        note:
          this.normalizeNullable(command.note) ??
          `Status changed to ${command.toStatus} by ${this.normalizeIdentifier(command.actorId, "actorId")}.`,
        discrepancyCaseIds: record.discrepancyCaseIds,
      }),
    );

    return this.cloneCase(record);
  }

  addTimelineFact(
    caseId: string,
    command: AddAccidentTimelineFactCommand,
  ): AccidentTimelineFactRecord {
    this.requireCase(caseId);
    const fact = this.buildTimelineFact(caseId, command);
    this.storeTimelineFact(fact);
    return this.cloneTimelineFact(fact);
  }

  importExternalDocument(
    caseId: string,
    command: ImportAccidentExternalDocumentCommand,
  ): AccidentExternalDocumentRecord {
    const record = this.synchronizeCaseLinks(this.requireCase(caseId));
    const documentId = this.normalizeIdentifier(
      command.documentId ?? `accident-doc-${randomUUID()}`,
      "documentId",
    );
    const existingDocuments = this.externalDocuments.get(caseId) ?? [];
    if (existingDocuments.some((document) => document.documentId === documentId)) {
      throw new ApiRequestError(
        409,
        "ACCIDENT_EXTERNAL_DOCUMENT_EXISTS",
        `External document ${documentId} already exists on case ${caseId}.`,
        { caseId, documentId },
      );
    }

    const normalizedSource = this.normalizeSourceMetadata(command.source);
    const document: AccidentExternalDocumentRecord = {
      documentId,
      caseId,
      documentType: command.documentType,
      title: this.normalizeIdentifier(command.title, "title"),
      providerName: this.normalizeNullable(command.providerName),
      receivedAt: this.normalizeTimestamp(command.receivedAt, "receivedAt"),
      checksumSha256: this.normalizeNullable(command.checksumSha256),
      source: normalizedSource,
      factIds: [],
    };

    const importedFactIds: string[] = [];
    for (const [index, factInput] of (command.extractedFacts ?? []).entries()) {
      const fact = this.buildTimelineFact(caseId, {
        factId: factInput.factId ?? `${documentId}:fact:${index + 1}`,
        factKey: factInput.factKey,
        label: factInput.label,
        value: factInput.value,
        occurredAt: factInput.occurredAt,
        recordedAt:
          factInput.recordedAt ?? normalizedSource.recordedAt ?? document.receivedAt,
        confidence:
          factInput.confidence ?? this.defaultConfidenceFromSource(normalizedSource),
        sourceSystem: normalizedSource.sourceSystem,
        sourceRef: normalizedSource.sourceRef ?? documentId,
        signatureRef: normalizedSource.signatureRef,
        schemaVersion: normalizedSource.schemaVersion ?? "phase2-source-v1",
        note: factInput.note ?? null,
        discrepancyCaseIds: record.discrepancyCaseIds,
        externalDocumentId: documentId,
      });
      this.storeTimelineFact(fact);
      importedFactIds.push(fact.factId);
    }

    document.factIds = importedFactIds;
    this.externalDocuments.set(caseId, [document, ...existingDocuments]);
    record.externalDocumentIds = this.uniqueStrings([
      ...record.externalDocumentIds,
      documentId,
    ]);
    record.updatedAt = document.receivedAt;

    return this.cloneExternalDocument(document);
  }

  listExternalDocuments(caseId: string): AccidentExternalDocumentRecord[] {
    this.requireCase(caseId);
    return (this.externalDocuments.get(caseId) ?? []).map((document) =>
      this.cloneExternalDocument(document),
    );
  }

  async generateInvestigationBundle(
    caseId: string,
    command: GenerateAccidentInvestigationBundleCommand,
    requestId?: string,
  ): Promise<AccidentInvestigationBundleView> {
    const record = this.cloneCase(this.requireCase(caseId));
    const generatedAt = new Date().toISOString();
    const requestedAt = command.requestedAt
      ? this.normalizeTimestamp(command.requestedAt, "requestedAt")
      : generatedAt;
    const actorId = this.normalizeIdentifier(command.actorId, "actorId");
    const bundleId = `accident-bundle-${randomUUID()}`;
    const knownGaps: AccidentInvestigationBundleKnownGap[] = [];
    const snapshot = this.buildBundleSnapshot(record);
    this.synchronizeCaseLinksFromSnapshot(record, snapshot);

    const sections: AccidentInvestigationBundleSection[] = [
      this.createBundleSection(
        "case",
        "Case, timeline, and investigation posture",
        {
          caseRecord: this.cloneCase(record),
          timeline: snapshot.timeline,
          noLiabilityConclusion: true,
        },
        1 + snapshot.timeline.length,
      ),
      this.buildBookingSection(record, snapshot, knownGaps),
      await this.buildExperimentSection(
        record,
        snapshot.correlatedCase,
        actorId,
        knownGaps,
      ),
      this.buildVehicleTeslaStateSection(record, snapshot, knownGaps),
      this.buildFsdSessionSection(record, snapshot, knownGaps),
      this.buildSafetyReportsSection(record, snapshot.correlatedCase, knownGaps),
      this.buildRocActionsSection(record, snapshot, knownGaps),
      this.buildTelemetrySection(record, snapshot, knownGaps),
      this.buildSyncedVideoSection(record, snapshot, knownGaps),
      await this.buildRouteGeofenceSection(
        record,
        snapshot.correlatedCase,
        snapshot,
        knownGaps,
      ),
      this.buildCommandsSection(record, snapshot, knownGaps),
      this.buildNotificationsAuditSection(record),
      this.buildExternalDocumentsSection(record),
    ];
    sections.push(this.buildKnownGapsSection(knownGaps));

    const manifestEntries = sections.map((section) => ({
      sectionId: section.sectionId,
      title: section.title,
      itemCount: section.itemCount,
      checksumSha256: section.checksumSha256,
    }));
    const manifestChecksum = this.computeHash({
      bundleId,
      caseId: record.caseId,
      entries: manifestEntries,
      knownGaps,
    });
    const manifest: AccidentInvestigationBundleManifest = {
      manifestId: `accident-manifest-${randomUUID()}`,
      caseId: record.caseId,
      generatedAt,
      entryCount: manifestEntries.length,
      entries: manifestEntries,
      checksumSha256: manifestChecksum,
      immutable: true,
    };
    const custodyPackage = {
      statement:
        "Custody records preserve evidence references and known gaps without emitting a liability conclusion.",
      records: this.buildCustodyRecords(
        record,
        manifest,
        actorId,
        requestedAt,
        generatedAt,
        command.note,
      ),
    };
    const downloadMetadata = {
      bundle: createControlledDownloadMetadata({
        kind: "accident-investigation-bundle",
        subjectId: bundleId,
        manifestHash: manifestChecksum,
        createdAt: generatedAt,
        host: this.downloadHost,
        keyId: this.downloadSigningKeyId,
        signingSecret: this.downloadSigningSecret,
        ttlMinutes: this.downloadExpiryMinutes,
        signatureVersion: this.downloadSignatureVersion,
      }),
    };

    const bundle: AccidentInvestigationBundleView = {
      bundleId,
      caseId: record.caseId,
      generatedAt,
      requestedAt,
      generatedBy: actorId,
      status: "completed",
      manifestHash: manifestChecksum,
      manifest,
      custodyPackage,
      sections,
      knownGaps,
      liabilityConclusion: null,
      liabilityConclusionEmitted: false,
      immutable: true,
      downloadMetadata,
    };

    this.bundles.set(bundleId, this.cloneBundle(bundle));
    this.recordBundleAudit(bundle, requestId);
    return this.cloneBundle(bundle);
  }

  getTimeline(caseId: string): AccidentTimelineEntry[] {
    const record = this.synchronizeCaseLinks(this.requireCase(caseId));
    const correlatedCase = this.findCorrelatedTakeoverCase(record);
    return this.buildTimeline(record, correlatedCase);
  }

  private buildTimeline(
    record: AccidentCaseRecord,
    correlatedCase: CorrelatedTakeoverCase | null,
  ): AccidentTimelineEntry[] {
    const facts = [
      ...(this.timelineFacts.get(record.caseId) ?? []).map((fact) =>
        this.cloneTimelineFact(fact),
      ),
      ...this.buildCorrelationTimelineFacts(record, correlatedCase),
    ];

    const grouped = new Map<string, AccidentTimelineFactRecord[]>();
    for (const fact of this.uniqueFacts(facts)) {
      const bucketKey = `${fact.factKey}::${fact.occurredAt}`;
      const bucket = grouped.get(bucketKey) ?? [];
      bucket.push(fact);
      grouped.set(bucketKey, bucket);
    }

    return [...grouped.values()]
      .map((bucket) => this.buildTimelineEntry(record.caseId, bucket))
      .sort((left, right) => this.compareTimestamps(left.occurredAt, right.occurredAt));
  }

  private buildTimelineEntry(
    caseId: string,
    bucket: AccidentTimelineFactRecord[],
  ): AccidentTimelineEntry {
    const facts = [...bucket].sort((left, right) => this.compareFacts(left, right));
    const primary = facts[0]!;
    return {
      entryId: `${caseId}:${primary.factKey}:${primary.occurredAt}`,
      caseId,
      factKey: primary.factKey,
      label: primary.label,
      occurredAt: primary.occurredAt,
      value: primary.value,
      confidence: primary.confidence,
      sourceSystem: primary.source.sourceSystem,
      sourceRef: primary.source.sourceRef,
      derivationRule: primary.derivationRule,
      discrepancyCaseIds: this.uniqueStrings(
        facts.flatMap((fact) => fact.discrepancyCaseIds),
      ),
      externalDocumentIds: this.uniqueStrings(
        facts
          .map((fact) => fact.externalDocumentId)
          .filter((value): value is string => value != null),
      ),
      facts: facts.map((fact) => this.cloneTimelineFact(fact)),
    };
  }

  private buildCorrelationTimelineFacts(
    record: AccidentCaseRecord,
    correlatedCase: CorrelatedTakeoverCase | null,
  ): AccidentTimelineFactRecord[] {
    if (!correlatedCase) {
      return [];
    }

    const discrepancyCaseIds = this.uniqueStrings(correlatedCase.discrepancyCaseIds);
    const facts: AccidentTimelineFactRecord[] = [];
    const report = correlatedCase.safetyOperatorTakeoverReport;
    facts.push(
      this.buildTimelineFact(record.caseId, {
        factId: `${correlatedCase.correlatedTakeoverCaseId}:safety-report`,
        factKey: "takeover.safety_operator.reported_at",
        label: "Safety operator takeover reported",
        value: report.occurredAt,
        occurredAt: report.occurredAt,
        recordedAt: report.serverReceivedAt,
        confidence: "operator_reported",
        sourceSystem: "manual_entry",
        sourceRef: report.reportId,
        schemaVersion: "roc-correlation-v1",
        note: report.notes,
        discrepancyCaseIds,
      }),
    );

    if (correlatedCase.teslaEvent) {
      const event = correlatedCase.teslaEvent;
      facts.push(
        this.buildTimelineFact(record.caseId, {
          factId: `${correlatedCase.correlatedTakeoverCaseId}:tesla-event`,
          factKey: "takeover.tesla.transition_at",
          label: "Tesla autonomy transition recorded",
          value: event.occurredAt,
          occurredAt: event.occurredAt,
          recordedAt: event.source.recordedAt ?? event.occurredAt,
          confidence: this.defaultConfidenceFromSource(event.source),
          sourceSystem: event.source.sourceSystem,
          sourceRef: event.source.sourceRef ?? event.eventId,
          signatureRef: event.source.signatureRef,
          schemaVersion: event.source.schemaVersion,
          note: event.transitionType,
          discrepancyCaseIds,
        }),
      );
    }

    if (correlatedCase.rocTakeoverResponse) {
      const response = correlatedCase.rocTakeoverResponse;
      facts.push(
        this.buildTimelineFact(record.caseId, {
          factId: `${correlatedCase.correlatedTakeoverCaseId}:roc-response`,
          factKey: "takeover.roc.requested_at",
          label: "ROC takeover response requested",
          value: response.requestedAt,
          occurredAt: response.requestedAt,
          recordedAt: response.requestedAt,
          confidence: "platform_recorded",
          sourceSystem: response.source.sourceSystem,
          sourceRef: response.source.sourceRef ?? response.responseId,
          signatureRef: response.source.signatureRef,
          schemaVersion: response.source.schemaVersion,
          note: response.outcomeNote,
          discrepancyCaseIds,
        }),
      );
    }

    if (discrepancyCaseIds.length > 0) {
      facts.push(
        this.buildTimelineFact(record.caseId, {
          factId: `${correlatedCase.correlatedTakeoverCaseId}:discrepancy-summary`,
          factKey: "takeover.discrepancy_summary",
          label: "Takeover discrepancy linked",
          value: discrepancyCaseIds.length,
          occurredAt: report.occurredAt,
          recordedAt: report.serverReceivedAt,
          confidence: "system_derived",
          sourceSystem: "system_derived",
          schemaVersion: "roc-correlation-v1",
          derivationRule: "roc_takeover_correlation_snapshot_v1",
          derivedFromFactIds: facts.map((fact) => fact.factId),
          note: discrepancyCaseIds.join(", "),
          discrepancyCaseIds,
        }),
      );
    }

    return facts;
  }

  private buildTimelineFact(
    caseId: string,
    command: AddAccidentTimelineFactCommand,
  ): AccidentTimelineFactRecord {
    const confidence = command.confidence;
    if (confidence === "system_derived") {
      if (command.sourceSystem !== "system_derived") {
        throw new ApiRequestError(
          400,
          "ACCIDENT_TIMELINE_DERIVED_SOURCE_INVALID",
          "System-derived facts must use the system_derived source system.",
          { caseId, factKey: command.factKey },
        );
      }
      if (!this.normalizeNullable(command.derivationRule)) {
        throw new ApiRequestError(
          400,
          "ACCIDENT_TIMELINE_DERIVATION_RULE_REQUIRED",
          "System-derived facts require a derivation rule.",
          { caseId, factKey: command.factKey },
        );
      }
    }

    if (
      confidence === "provider_signed" &&
      !this.normalizeNullable(command.signatureRef)
    ) {
      throw new ApiRequestError(
        400,
        "ACCIDENT_TIMELINE_SIGNATURE_REQUIRED",
        "provider_signed facts require a signatureRef.",
        { caseId, factKey: command.factKey },
      );
    }

    return {
      factId: this.normalizeIdentifier(
        command.factId ?? `accident-fact-${randomUUID()}`,
        "factId",
      ),
      caseId,
      factKey: this.normalizeIdentifier(command.factKey, "factKey"),
      label: this.normalizeIdentifier(command.label, "label"),
      value: command.value,
      occurredAt: this.normalizeTimestamp(command.occurredAt, "occurredAt"),
      recordedAt: command.recordedAt
        ? this.normalizeTimestamp(command.recordedAt, "recordedAt")
        : null,
      confidence,
      source: {
        sourceSystem: command.sourceSystem,
        sourceRef: this.normalizeNullable(command.sourceRef),
        signatureRef: this.normalizeNullable(command.signatureRef),
        recordedAt: command.recordedAt
          ? this.normalizeTimestamp(command.recordedAt, "recordedAt")
          : null,
        ingestedAt: new Date().toISOString(),
        schemaVersion: this.normalizeNullable(command.schemaVersion),
      },
      derivationRule: this.normalizeNullable(command.derivationRule),
      derivedFromFactIds: this.uniqueStrings(command.derivedFromFactIds ?? []),
      discrepancyCaseIds: this.uniqueStrings(command.discrepancyCaseIds ?? []),
      externalDocumentId: this.normalizeNullable(command.externalDocumentId),
      note: this.normalizeNullable(command.note),
    };
  }

  private buildBookingSection(
    record: AccidentCaseRecord,
    snapshot: BundleSnapshot,
    knownGaps: AccidentInvestigationBundleKnownGap[],
  ) {
    if (!record.orderId) {
      this.pushKnownGap(knownGaps, {
        sectionId: "booking",
        code: "ORDER_UNLINKED",
        message: "Accident case is not linked to a booking/order record.",
        upstream: "owned-mobility",
      });
      return this.createBundleSection(
        "booking",
        "Booking and dispatch context",
        { order: null },
        0,
      );
    }

    if (!snapshot.order) {
      this.pushKnownGap(knownGaps, {
        sectionId: "booking",
        code: "ORDER_LOOKUP_UNAVAILABLE",
        message: "Owned mobility order context is unavailable for this case.",
        upstream: "owned-mobility",
      });
    }
    if (!snapshot.dispatchTrace) {
      this.pushKnownGap(knownGaps, {
        sectionId: "booking",
        code: "DISPATCH_TRACE_UNAVAILABLE",
        message: "Dispatch trace could not be synchronized for this case order.",
        upstream: "owned-mobility",
      });
    }

    return this.createBundleSection(
      "booking",
      "Booking and dispatch context",
      {
        order: snapshot.order,
        dispatchTrace: snapshot.dispatchTrace ?? [],
      },
      (snapshot.order ? 1 : 0) + (snapshot.dispatchTrace?.length ?? 0),
    );
  }

  private async buildExperimentSection(
    record: AccidentCaseRecord,
    correlatedCase: CorrelatedTakeoverCase | null,
    actorId: string,
    knownGaps: AccidentInvestigationBundleKnownGap[],
  ) {
    const sandboxProgramId =
      correlatedCase?.safetyOperatorTakeoverReport.sandboxProgramId ?? null;
    if (!sandboxProgramId) {
      this.pushKnownGap(knownGaps, {
        sectionId: "experiment_jurisdiction_snapshot",
        code: "SANDBOX_PROGRAM_UNKNOWN",
        message: "No sandbox program could be derived from the synchronized takeover evidence.",
        upstream: "safety-operator",
      });
      return this.createBundleSection(
        "experiment_jurisdiction_snapshot",
        "Experiment and jurisdiction snapshot",
        { sandboxProgramId: null, experiment: null, complianceSnapshot: null },
        0,
      );
    }

    if (!this.sandboxGovernanceService) {
      this.pushKnownGap(knownGaps, {
        sectionId: "experiment_jurisdiction_snapshot",
        code: "SANDBOX_GOVERNANCE_UNAVAILABLE",
        message: "Sandbox governance service is unavailable in this worker context.",
        upstream: "sandbox-governance",
      });
      return this.createBundleSection(
        "experiment_jurisdiction_snapshot",
        "Experiment and jurisdiction snapshot",
        { sandboxProgramId, experiment: null, complianceSnapshot: null },
        0,
      );
    }

    const experiment =
      this.sandboxGovernanceService
        .listExperiments(record.occurredAt)
        .find((candidate) => candidate.programCode === sandboxProgramId) ?? null;
    if (!experiment) {
      this.pushKnownGap(knownGaps, {
        sectionId: "experiment_jurisdiction_snapshot",
        code: "EXPERIMENT_NOT_FOUND",
        message: `No sandbox experiment was found for program ${sandboxProgramId}.`,
        upstream: "sandbox-governance",
      });
    }

    const complianceSnapshot = experiment
      ? await this.tryResolveAsync(
          () =>
            this.sandboxGovernanceService!.generateComplianceSnapshot(
              experiment.experimentId,
              {
                asOf: record.occurredAt,
                actorId,
              },
            ),
          "experiment_jurisdiction_snapshot",
          "COMPLIANCE_SNAPSHOT_UNAVAILABLE",
          "Compliance snapshot generation failed for the governing experiment.",
          "sandbox-governance",
          knownGaps,
        )
      : null;

    return this.createBundleSection(
      "experiment_jurisdiction_snapshot",
      "Experiment and jurisdiction snapshot",
      {
        sandboxProgramId,
        experiment,
        complianceSnapshot: complianceSnapshot ?? null,
      },
      (experiment ? 1 : 0) + (complianceSnapshot ? 1 : 0),
    );
  }

  private buildVehicleTeslaStateSection(
    record: AccidentCaseRecord,
    snapshot: BundleSnapshot,
    knownGaps: AccidentInvestigationBundleKnownGap[],
  ) {
    if (!snapshot.telemetryStatus) {
      this.pushKnownGap(knownGaps, {
        sectionId: "vehicle_tesla_state",
        code: "TESLA_TELEMETRY_STATUS_UNAVAILABLE",
        message: "Tesla telemetry status is unavailable for the accident vehicle.",
        upstream: "tesla-integration",
      });
    }
    if (!snapshot.publicTelemetrySample) {
      this.pushKnownGap(knownGaps, {
        sectionId: "vehicle_tesla_state",
        code: "TESLA_PUBLIC_SAMPLE_UNAVAILABLE",
        message: "Tesla public telemetry sample is unavailable for the accident vehicle.",
        upstream: "tesla-integration",
      });
    }
    if (!snapshot.telemetryProjection) {
      this.pushKnownGap(knownGaps, {
        sectionId: "vehicle_tesla_state",
        code: "TESLA_STATE_PROJECTION_UNAVAILABLE",
        message: "Tesla state projection is unavailable for the accident vehicle.",
        upstream: "tesla-integration",
      });
    }

    return this.createBundleSection(
      "vehicle_tesla_state",
      "Vehicle and Tesla state",
      {
        vehicleId: record.vehicleId,
        telemetryStatus: snapshot.telemetryStatus,
        publicTelemetrySample: snapshot.publicTelemetrySample,
        stateProjection: snapshot.telemetryProjection,
      },
      [
        snapshot.telemetryStatus,
        snapshot.publicTelemetrySample,
        snapshot.telemetryProjection,
      ].filter(Boolean).length,
    );
  }

  private buildFsdSessionSection(
    record: AccidentCaseRecord,
    snapshot: BundleSnapshot,
    knownGaps: AccidentInvestigationBundleKnownGap[],
  ) {
    if (!snapshot.teslaEvents) {
      this.pushKnownGap(knownGaps, {
        sectionId: "fsd_session_events",
        code: "TESLA_EVENTS_UNAVAILABLE",
        message: "Tesla autonomy transition events are unavailable for synchronized replay.",
        upstream: "roc-operations",
      });
    }
    if (!snapshot.rocResponses) {
      this.pushKnownGap(knownGaps, {
        sectionId: "fsd_session_events",
        code: "ROC_RESPONSES_UNAVAILABLE",
        message: "ROC takeover responses are unavailable for synchronized replay.",
        upstream: "roc-operations",
      });
    }
    const filteredTeslaEvents = (snapshot.teslaEvents ?? []).filter((event) =>
      this.matchesEventCase(record, event, snapshot.correlatedCase),
    );
    const filteredRocResponses = (snapshot.rocResponses ?? []).filter((response) =>
      this.matchesResponseCase(record, response, snapshot.correlatedCase),
    );

    if (
      !snapshot.correlatedCase &&
      filteredTeslaEvents.length === 0 &&
      filteredRocResponses.length === 0
    ) {
      this.pushKnownGap(knownGaps, {
        sectionId: "fsd_session_events",
        code: "FSD_SESSION_NOT_SYNCHRONIZED",
        message: "No synchronized FSD session/takeover event sequence is linked to this case yet.",
        upstream: "roc-operations",
      });
    }

    return this.createBundleSection(
      "fsd_session_events",
      "FSD session and synchronized events",
      {
        correlatedTakeoverCase: snapshot.correlatedCase,
        teslaEvents: filteredTeslaEvents,
        rocResponses: filteredRocResponses,
      },
      (snapshot.correlatedCase ? 1 : 0) +
        filteredTeslaEvents.length +
        filteredRocResponses.length,
    );
  }

  private buildSafetyReportsSection(
    record: AccidentCaseRecord,
    correlatedCase: CorrelatedTakeoverCase | null,
    knownGaps: AccidentInvestigationBundleKnownGap[],
  ) {
    const reports = correlatedCase
      ? [correlatedCase.safetyOperatorTakeoverReport]
      : [];

    if (reports.length === 0) {
      this.pushKnownGap(knownGaps, {
        sectionId: "safety_reports",
        code: "SAFETY_REPORT_MISSING",
        message: "No safety-operator takeover report is linked to this case.",
        upstream: "safety-operator",
      });
    }

    return this.createBundleSection(
      "safety_reports",
      "Safety operator reports",
      {
        reports,
      },
      reports.length,
    );
  }

  private buildRocActionsSection(
    record: AccidentCaseRecord,
    snapshot: BundleSnapshot,
    knownGaps: AccidentInvestigationBundleKnownGap[],
  ) {
    const discrepancies = snapshot.discrepancies.filter((discrepancy) =>
      record.discrepancyCaseIds.includes(discrepancy.discrepancyCaseId),
    );
    if (!snapshot.manualCorrelations) {
      this.pushKnownGap(knownGaps, {
        sectionId: "roc_actions",
        code: "MANUAL_CORRELATIONS_UNAVAILABLE",
        message: "Manual ROC correlation links are unavailable.",
        upstream: "roc-operations",
      });
    }
    if (!snapshot.rocResponses) {
      this.pushKnownGap(knownGaps, {
        sectionId: "roc_actions",
        code: "ROC_RESPONSES_UNAVAILABLE",
        message: "ROC takeover response records are unavailable.",
        upstream: "roc-operations",
      });
    }
    const filteredManualCorrelations = (snapshot.manualCorrelations ?? [])
      .filter((link) =>
        snapshot.correlatedCase
          ? link.takeoverReportId ===
            snapshot.correlatedCase.safetyOperatorTakeoverReport.reportId
          : false,
      );
    const filteredResponses = (snapshot.rocResponses ?? []).filter((response) =>
      this.matchesResponseCase(record, response, snapshot.correlatedCase),
    );

    return this.createBundleSection(
      "roc_actions",
      "ROC actions and discrepancy handling",
      {
        discrepancyCaseIds: [...record.discrepancyCaseIds],
        discrepancies,
        manualCorrelations: filteredManualCorrelations,
        rocResponses: filteredResponses,
      },
      record.discrepancyCaseIds.length +
        discrepancies.length +
        filteredManualCorrelations.length +
        filteredResponses.length,
    );
  }

  private buildTelemetrySection(
    record: AccidentCaseRecord,
    snapshot: BundleSnapshot,
    knownGaps: AccidentInvestigationBundleKnownGap[],
  ) {
    if (!snapshot.publicTelemetrySample) {
      this.pushKnownGap(knownGaps, {
        sectionId: "telemetry_and_gaps",
        code: "PUBLIC_TELEMETRY_UNAVAILABLE",
        message: "Public telemetry sample is unavailable for the accident vehicle.",
        upstream: "tesla-integration",
      });
    }
    if (!snapshot.telemetryProjection) {
      this.pushKnownGap(knownGaps, {
        sectionId: "telemetry_and_gaps",
        code: "TELEMETRY_PROJECTION_UNAVAILABLE",
        message: "Projected telemetry snapshot is unavailable for the accident vehicle.",
        upstream: "tesla-integration",
      });
    }
    const timelineFacts = (this.timelineFacts.get(record.caseId) ?? [])
      .filter((fact) => fact.factKey.includes("telemetry"))
      .map((fact) => this.cloneTimelineFact(fact));

    return this.createBundleSection(
      "telemetry_and_gaps",
      "Telemetry and known gaps",
      {
        telemetryTimelineFacts: timelineFacts,
        publicTelemetrySample: snapshot.publicTelemetrySample,
        stateProjection: snapshot.telemetryProjection,
        knownGaps: knownGaps.filter(
          (gap) =>
            gap.sectionId === "vehicle_tesla_state" ||
            gap.sectionId === "telemetry_and_gaps",
        ),
      },
      timelineFacts.length +
        [snapshot.publicTelemetrySample, snapshot.telemetryProjection].filter(
          Boolean,
        ).length,
    );
  }

  private buildSyncedVideoSection(
    record: AccidentCaseRecord,
    snapshot: BundleSnapshot,
    knownGaps: AccidentInvestigationBundleKnownGap[],
  ) {
    const segments = snapshot.segments ?? [];
    const bookmarks = this.filterBookmarksForCase(record, snapshot, segments);

    if (snapshot.segmentsUnavailable) {
      this.pushKnownGap(knownGaps, {
        sectionId: "synced_video",
        code: "VEHICLE_EVIDENCE_SEGMENTS_UNAVAILABLE",
        message:
          "Vehicle evidence segment index is unavailable for synchronized recorder export.",
        upstream: "vehicle-evidence",
      });
    }
    if (snapshot.bookmarksUnavailable) {
      this.pushKnownGap(knownGaps, {
        sectionId: "synced_video",
        code: "VEHICLE_EVIDENCE_BOOKMARKS_UNAVAILABLE",
        message:
          "Vehicle evidence bookmarks are unavailable for synchronized recorder export.",
        upstream: "vehicle-evidence",
      });
    }

    if (!snapshot.segmentsUnavailable && segments.length === 0) {
      this.pushKnownGap(knownGaps, {
        sectionId: "synced_video",
        code: "SYNCED_VIDEO_MISSING",
        message: "No synchronized recorder segment is currently linked to this case.",
        upstream: "vehicle-evidence",
      });
    }

    return this.createBundleSection(
      "synced_video",
      "Synchronized video and recorder evidence",
      {
        segments,
        bookmarks,
      },
      segments.length + bookmarks.length,
    );
  }

  private async buildRouteGeofenceSection(
    record: AccidentCaseRecord,
    correlatedCase: CorrelatedTakeoverCase | null,
    snapshot: BundleSnapshot,
    knownGaps: AccidentInvestigationBundleKnownGap[],
  ) {
    const order = record.orderId ? snapshot.order : null;
    if (record.orderId && !order) {
      this.pushKnownGap(knownGaps, {
        sectionId: "route_geofence_compare",
        code: "ORDER_CONTEXT_UNAVAILABLE",
        message: "Order context is unavailable for route/geofence comparison.",
        upstream: "owned-mobility",
      });
    }
    const sandboxProgramId =
      correlatedCase?.safetyOperatorTakeoverReport.sandboxProgramId ?? null;
    const pickupPoint = this.extractGeoPoint(order, "pickup");
    const dropoffPoint = this.extractGeoPoint(order, "dropoff");

    if (!sandboxProgramId || !this.sandboxGovernanceService) {
      this.pushKnownGap(knownGaps, {
        sectionId: "route_geofence_compare",
        code: "ROUTE_GEOFENCE_UNAVAILABLE",
        message: "Sandbox route/geofence comparison cannot run without program context and governance service.",
        upstream: "sandbox-governance",
      });
      return this.createBundleSection(
        "route_geofence_compare",
        "Route and geofence comparison",
        {
          sandboxProgramId,
          orderRoute: order ? { pickup: pickupPoint, dropoff: dropoffPoint } : null,
          pickupAreaValidation: null,
          dropoffAreaValidation: null,
          routeValidation: null,
        },
        order ? 1 : 0,
      );
    }

    if (!pickupPoint || !dropoffPoint) {
      this.pushKnownGap(knownGaps, {
        sectionId: "route_geofence_compare",
        code: "ROUTE_COORDINATES_MISSING",
        message: "Pickup/dropoff coordinates are missing, so route/geofence comparison is partial.",
        upstream: "owned-mobility",
      });
    }

    const pickupAreaValidation = pickupPoint
      ? await this.tryResolveAsync(
          () =>
            this.sandboxGovernanceService!.validatePointInApprovedArea({
              sandboxProgramId,
              point: pickupPoint,
              asOf: record.occurredAt,
            }),
          "route_geofence_compare",
          "PICKUP_AREA_VALIDATION_FAILED",
          "Pickup point could not be validated against approved areas.",
          "sandbox-governance",
          knownGaps,
        )
      : null;
    const dropoffAreaValidation = dropoffPoint
      ? await this.tryResolveAsync(
          () =>
            this.sandboxGovernanceService!.validatePointInApprovedArea({
              sandboxProgramId,
              point: dropoffPoint,
              asOf: record.occurredAt,
            }),
          "route_geofence_compare",
          "DROPOFF_AREA_VALIDATION_FAILED",
          "Dropoff point could not be validated against approved areas.",
          "sandbox-governance",
          knownGaps,
        )
      : null;
    const routeValidation =
      pickupPoint && dropoffPoint
        ? await this.tryResolveAsync(
            () =>
              this.sandboxGovernanceService!.validateRouteContainment({
                sandboxProgramId,
                candidatePath: {
                  type: "MultiLineString",
                  coordinates: [
                    [
                      [pickupPoint.lng, pickupPoint.lat],
                      [dropoffPoint.lng, dropoffPoint.lat],
                    ],
                  ],
                },
                asOf: record.occurredAt,
                toleranceMeters: 50,
              }),
            "route_geofence_compare",
            "ROUTE_VALIDATION_FAILED",
            "Candidate route could not be validated against approved routes.",
            "sandbox-governance",
            knownGaps,
          )
        : null;

    return this.createBundleSection(
      "route_geofence_compare",
      "Route and geofence comparison",
      {
        sandboxProgramId,
        orderRoute: order ? { pickup: pickupPoint, dropoff: dropoffPoint } : null,
        pickupAreaValidation,
        dropoffAreaValidation,
        routeValidation,
      },
      [order, pickupAreaValidation, dropoffAreaValidation, routeValidation].filter(
        Boolean,
      ).length,
    );
  }

  private buildCommandsSection(
    record: AccidentCaseRecord,
    snapshot: BundleSnapshot,
    knownGaps: AccidentInvestigationBundleKnownGap[],
  ) {
    if (!this.teslaIntegrationService) {
      this.pushKnownGap(knownGaps, {
        sectionId: "commands_and_receipts",
        code: "TESLA_COMMAND_SERVICE_UNAVAILABLE",
        message: "Tesla command receipts are unavailable in this worker context.",
        upstream: "tesla-integration",
      });
    }
    if (snapshot.receiptsUnavailable) {
      this.pushKnownGap(knownGaps, {
        sectionId: "commands_and_receipts",
        code: "TESLA_COMMAND_RECEIPTS_UNAVAILABLE",
        message: "Tesla command receipt snapshot is unavailable for this case.",
        upstream: "tesla-integration",
      });
    }
    const receipts = this.filterReceiptsForCase(record, snapshot);
    return this.createBundleSection(
      "commands_and_receipts",
      "Commands and receipts",
      {
        receipts,
      },
      receipts.length,
    );
  }

  private buildKnownGapsSection(
    knownGaps: AccidentInvestigationBundleKnownGap[],
  ) {
    return this.createBundleSection(
      "known_gaps",
      "Known gaps and unavailable providers",
      {
        knownGaps,
        summary: {
          totalCount: knownGaps.length,
          upstreams: this.uniqueStrings(
            knownGaps.map((gap) => gap.upstream).filter(Boolean),
          ),
        },
      },
      knownGaps.length,
    );
  }

  private buildNotificationsAuditSection(record: AccidentCaseRecord) {
    const notifications =
      this.auditNotificationService?.listNotifications().filter((notification) =>
        this.matchesBundleReference(notification, record),
      ) ?? [];
    const audits =
      this.auditNotificationService?.getAuditLogsSnapshot().filter((audit) =>
        this.matchesBundleReference(audit, record),
      ) ?? [];

    return this.createBundleSection(
      "notifications_and_audit",
      "Notifications and audit references",
      {
        notifications,
        audits,
      },
      notifications.length + audits.length,
    );
  }

  private buildExternalDocumentsSection(record: AccidentCaseRecord) {
    const documents = this.listExternalDocuments(record.caseId);
    return this.createBundleSection(
      "external_documents",
      "External documents and imported facts",
      {
        documents,
      },
      documents.length,
    );
  }

  private createBundleSection(
    sectionId: string,
    title: string,
    payload: Record<string, unknown>,
    itemCount: number,
  ): AccidentInvestigationBundleSection {
    return {
      sectionId,
      title,
      itemCount,
      checksumSha256: this.computeHash(payload),
      payload,
    };
  }

  private buildCustodyRecords(
    record: AccidentCaseRecord,
    manifest: AccidentInvestigationBundleManifest,
    actorId: string,
    requestedAt: string,
    generatedAt: string,
    note?: string | null,
  ): AccidentInvestigationBundleCustodyRecord[] {
    return [
      {
        custodyId: `custody-${randomUUID()}`,
        occurredAt: requestedAt,
        actorId,
        action: "bundle_requested",
        note: this.normalizeNullable(note),
        evidenceRefs: this.uniqueStrings([
          record.caseId,
          record.vehicleId,
          record.orderId ?? "",
        ].filter(Boolean)),
      },
      {
        custodyId: `custody-${randomUUID()}`,
        occurredAt: generatedAt,
        actorId: "accident-investigation-service",
        action: "bundle_generated",
        note: "Manifest and known gaps synchronized.",
        evidenceRefs: this.uniqueStrings([
          manifest.manifestId,
          record.evidenceManifestId ?? "",
          record.regulatoryReportId ?? "",
        ].filter(Boolean)),
      },
      {
        custodyId: `custody-${randomUUID()}`,
        occurredAt: generatedAt,
        actorId: "accident-investigation-service",
        action: "controlled_download_issued",
        note: "Controlled download metadata issued and audited.",
        evidenceRefs: [manifest.checksumSha256],
      },
    ];
  }

  private recordBundleAudit(
    bundle: AccidentInvestigationBundleView,
    requestId?: string,
  ) {
    this.auditNotificationService?.recordAuditLog({
      actorId: bundle.generatedBy,
      actorType: "system",
      tenantId: null,
      moduleName: "accident-investigation",
      actionName: "issue_accident_investigation_bundle_download",
      resourceType: "accident_investigation_bundle",
      resourceId: bundle.bundleId,
      newValuesSummary: {
        caseId: bundle.caseId,
        manifestHash: bundle.manifestHash,
        knownGapCount: bundle.knownGaps.length,
        ttlMinutes: bundle.downloadMetadata.bundle.ttlMinutes,
        liabilityConclusionEmitted: bundle.liabilityConclusionEmitted,
      },
      ...(requestId ? { requestId } : {}),
    });
  }

  private pushKnownGap(
    knownGaps: AccidentInvestigationBundleKnownGap[],
    gap: AccidentInvestigationBundleKnownGap,
  ) {
    if (
      knownGaps.some(
        (candidate) =>
          candidate.sectionId === gap.sectionId && candidate.code === gap.code,
      )
    ) {
      return;
    }
    knownGaps.push(gap);
  }

  private tryResolve<T>(
    resolver: () => T | null | undefined,
    sectionId: string,
    code: string,
    message: string,
    upstream: string,
    knownGaps: AccidentInvestigationBundleKnownGap[],
  ): T | null {
    try {
      const value = resolver();
      return value ?? null;
    } catch (error) {
      this.logger.debug(
        `${sectionId} degraded for ${code}: ${
          error instanceof Error ? error.message : String(error)
        }`,
      );
      this.pushKnownGap(knownGaps, {
        sectionId,
        code,
        message,
        upstream,
      });
      return null;
    }
  }

  private async tryResolveAsync<T>(
    resolver: () => Promise<T> | T,
    sectionId: string,
    code: string,
    message: string,
    upstream: string,
    knownGaps: AccidentInvestigationBundleKnownGap[],
  ): Promise<T | null> {
    try {
      return await resolver();
    } catch (error) {
      this.logger.debug(
        `${sectionId} degraded for ${code}: ${
          error instanceof Error ? error.message : String(error)
        }`,
      );
      this.pushKnownGap(knownGaps, {
        sectionId,
        code,
        message,
        upstream,
      });
      return null;
    }
  }

  private extractGeoPoint(
    order: { pickup?: unknown; dropoff?: unknown } | null,
    field: "pickup" | "dropoff",
  ) {
    const candidate = order?.[field];
    if (!candidate || typeof candidate !== "object") {
      return null;
    }
    const lat = (candidate as { lat?: unknown }).lat;
    const lng = (candidate as { lng?: unknown }).lng;
    if (typeof lat !== "number" || typeof lng !== "number") {
      return null;
    }
    return { lat, lng };
  }

  private matchesEventCase(
    record: AccidentCaseRecord,
    event: {
      eventId?: string;
      vehicleId: string;
      orderId: string | null;
      takeoverCorrelationId: string | null;
    },
    correlatedCase: CorrelatedTakeoverCase | null,
  ) {
    if (event.vehicleId !== record.vehicleId) {
      return false;
    }
    if (
      record.takeoverCorrelationId &&
      event.takeoverCorrelationId === record.takeoverCorrelationId
    ) {
      return true;
    }
    if (record.orderId && event.orderId === record.orderId) {
      return true;
    }
    if (
      record.triggeringEventId &&
      event.eventId === record.triggeringEventId
    ) {
      return true;
    }
    return this.hasExplicitCaseLink(record, correlatedCase)
      ? correlatedCase?.takeoverCorrelationId === event.takeoverCorrelationId
      : false;
  }

  private matchesResponseCase(
    record: AccidentCaseRecord,
    response: {
      vehicleId: string;
      orderId: string | null;
      takeoverCorrelationId: string | null;
      triggeredByTeslaEventId: string | null;
    },
    correlatedCase: CorrelatedTakeoverCase | null,
  ) {
    if (response.vehicleId !== record.vehicleId) {
      return false;
    }
    if (
      record.takeoverCorrelationId &&
      response.takeoverCorrelationId === record.takeoverCorrelationId
    ) {
      return true;
    }
    if (record.orderId && response.orderId === record.orderId) {
      return true;
    }
    if (
      record.triggeringEventId &&
      response.triggeredByTeslaEventId === record.triggeringEventId
    ) {
      return true;
    }
    return this.hasExplicitCaseLink(record, correlatedCase)
      ? correlatedCase?.takeoverCorrelationId === response.takeoverCorrelationId
      : false;
  }

  private hasExplicitCaseLink(
    record: AccidentCaseRecord,
    correlatedCase: CorrelatedTakeoverCase | null,
  ) {
    return Boolean(
      record.takeoverCorrelationId ||
        record.orderId ||
        record.triggeringEventId ||
        correlatedCase,
    );
  }

  private matchesBundleReference(
    item: unknown,
    record: AccidentCaseRecord,
  ) {
    const serialized = this.stableSerialize(item);
    return [
      record.caseId,
      record.vehicleId,
      record.orderId,
      record.takeoverCorrelationId,
      record.evidenceManifestId,
      record.regulatoryReportId,
    ]
      .filter((value): value is string => Boolean(value))
      .some((value) => serialized.includes(value));
  }

  private synchronizeCaseLinks(record: AccidentCaseRecord): AccidentCaseRecord {
    const discrepancyCaseIds = this.findLinkedDiscrepancyIds(record);
    const externalDocumentIds = this.uniqueStrings(
      (this.externalDocuments.get(record.caseId) ?? []).map(
        (document) => document.documentId,
      ),
    );

    record.discrepancyCaseIds = discrepancyCaseIds;
    record.externalDocumentIds = externalDocumentIds;
    return record;
  }

  private synchronizeCaseLinksFromSnapshot(
    record: AccidentCaseRecord,
    snapshot: BundleSnapshot,
  ): AccidentCaseRecord {
    record.discrepancyCaseIds = snapshot.correlatedCase
      ? this.uniqueStrings(snapshot.correlatedCase.discrepancyCaseIds)
      : [];
    record.externalDocumentIds = this.uniqueStrings(
      (this.externalDocuments.get(record.caseId) ?? []).map(
        (document) => document.documentId,
      ),
    );
    return record;
  }

  private findLinkedDiscrepancyIds(record: AccidentCaseRecord): string[] {
    const correlatedCase = this.findCorrelatedTakeoverCase(record);
    if (!correlatedCase) {
      return [];
    }
    return this.uniqueStrings(correlatedCase.discrepancyCaseIds);
  }

  private findCorrelatedTakeoverCase(
    record: AccidentCaseRecord,
  ): CorrelatedTakeoverCase | null {
    const { cases } = this.rocOperationsService.rebuildCorrelatedTakeoverCases();
    return this.selectCorrelatedTakeoverCase(record, cases);
  }

  private selectCorrelatedTakeoverCase(
    record: AccidentCaseRecord,
    cases: readonly CorrelatedTakeoverCase[],
  ): CorrelatedTakeoverCase | null {
    const candidates = cases
      .filter((candidate) => this.isCorrelationCandidate(record, candidate))
      .sort((left, right) =>
        this.scoreCorrelatedCase(record, left) -
        this.scoreCorrelatedCase(record, right),
      );
    return candidates[0] ?? null;
  }

  private buildBundleSnapshot(record: AccidentCaseRecord): BundleSnapshot {
    const correlationSnapshot = this.captureResolve(
      () => this.rocOperationsService.rebuildCorrelatedTakeoverCases(),
      "rebuildCorrelatedTakeoverCases",
    );
    const correlatedCase = this.selectCorrelatedTakeoverCase(
      record,
      correlationSnapshot?.cases ?? [],
    );
    const segments = this.captureSnapshotValue(
      () =>
        this.vehicleEvidenceService?.listSegmentIndex({
          vehicleId: record.vehicleId,
          caseId: record.caseId,
        }),
      "listSegmentIndex",
    );
    const bookmarks = this.captureSnapshotValue(
      () => this.vehicleEvidenceService?.listBookmarks({ vehicleId: record.vehicleId }),
      "listBookmarks",
    );
    const receipts = this.captureSnapshotValue(
      () => this.teslaIntegrationService?.listReceipts(record.vehicleId),
      "listReceipts",
    );

    return {
      timeline: this.buildTimeline(record, correlatedCase),
      correlatedCase,
      discrepancies: correlationSnapshot?.discrepancies ?? [],
      order: record.orderId
        ? this.captureResolve(
            () => this.ownedMobilityService?.getOrder(record.orderId!),
            "getOrder",
          )
        : null,
      dispatchTrace: record.orderId
        ? this.captureResolve(
            () => this.ownedMobilityService?.listDispatchTrace(record.orderId!),
            "listDispatchTrace",
          )
        : null,
      telemetryStatus: this.captureResolve(
        () => this.teslaIntegrationService?.getTelemetryStatus(record.vehicleId),
        "getTelemetryStatus",
      ),
      publicTelemetrySample: this.captureResolve(
        () => this.teslaIntegrationService?.getPublicTelemetrySample(record.vehicleId),
        "getPublicTelemetrySample",
      ),
      telemetryProjection: this.captureResolve(
        () => this.teslaIntegrationService?.getTelemetryProjection(record.vehicleId),
        "getTelemetryProjection",
      ),
      teslaEvents: this.captureResolve(
        () => this.rocOperationsService.listTeslaAutonomyTransitionEvents(),
        "listTeslaAutonomyTransitionEvents",
      ),
      rocResponses: this.captureResolve(
        () => this.rocOperationsService.listRocTakeoverResponseRecords(),
        "listRocTakeoverResponseRecords",
      ),
      manualCorrelations: this.captureResolve(
        () => this.rocOperationsService.listManualTakeoverCorrelations(),
        "listManualTakeoverCorrelations",
      ),
      segments: segments.value,
      segmentsUnavailable: segments.unavailable,
      bookmarks: bookmarks.value,
      bookmarksUnavailable: bookmarks.unavailable,
      receipts: receipts.value,
      receiptsUnavailable: receipts.unavailable,
    };
  }

  private filterBookmarksForCase(
    record: AccidentCaseRecord,
    snapshot: BundleSnapshot,
    segments: NonNullable<BundleSnapshot["segments"]>,
  ) {
    const segmentIds = new Set(segments.map((segment) => segment.segmentId));
    const eventIds = new Set(
      (snapshot.teslaEvents ?? [])
        .filter((event) => this.matchesEventCase(record, event, snapshot.correlatedCase))
        .map((event) => event.eventId),
    );
    const reportBookmarkId =
      snapshot.correlatedCase?.safetyOperatorTakeoverReport.bookmarkId ?? null;

    return (snapshot.bookmarks ?? []).filter(
      (bookmark) =>
        segmentIds.has(bookmark.segmentId) ||
        bookmark.bookmarkId === reportBookmarkId ||
        eventIds.has(bookmark.eventId),
    );
  }

  private filterReceiptsForCase(record: AccidentCaseRecord, snapshot: BundleSnapshot) {
    const timestamps = this.collectCaseEvidenceTimestamps(record, snapshot);
    if (timestamps.length === 0) {
      return [];
    }
    const sorted = [...timestamps].sort((left, right) =>
      this.compareTimestamps(left, right),
    );
    const windowStart = Date.parse(sorted[0]!) - 5 * 60 * 1000;
    const windowEnd = Date.parse(sorted[sorted.length - 1]!) + 15 * 60 * 1000;

    return (snapshot.receipts ?? []).filter((receipt) => {
      const issuedAt = Date.parse(receipt.issuedAt);
      return issuedAt >= windowStart && issuedAt <= windowEnd;
    });
  }

  private collectCaseEvidenceTimestamps(
    record: AccidentCaseRecord,
    snapshot: BundleSnapshot,
  ): string[] {
    return this.uniqueStrings(
      [
        record.occurredAt,
        ...(snapshot.correlatedCase
          ? [
              snapshot.correlatedCase.sourceTimestamps.teslaOccurredAt,
              snapshot.correlatedCase.sourceTimestamps.safetyOccurredAt,
              snapshot.correlatedCase.sourceTimestamps.safetyServerReceivedAt,
              snapshot.correlatedCase.sourceTimestamps.rocRequestedAt,
              snapshot.correlatedCase.sourceTimestamps.rocRespondedAt,
              snapshot.correlatedCase.sourceTimestamps.rocResolvedAt,
            ]
          : []),
        ...(snapshot.teslaEvents ?? [])
          .filter((event) => this.matchesEventCase(record, event, snapshot.correlatedCase))
          .map((event) => event.occurredAt),
        ...(snapshot.rocResponses ?? [])
          .filter((response) =>
            this.matchesResponseCase(record, response, snapshot.correlatedCase),
          )
          .flatMap((response) => [response.requestedAt, response.respondedAt]),
        ...(snapshot.segments ?? []).flatMap((segment) => [
          segment.startedAt,
          segment.endedAt,
        ]),
      ].filter((value): value is string => Boolean(value)),
    );
  }

  private isCorrelationCandidate(
    record: AccidentCaseRecord,
    candidate: CorrelatedTakeoverCase,
  ) {
    if (candidate.vehicleId !== record.vehicleId) {
      return false;
    }
    if (record.takeoverCorrelationId) {
      return candidate.takeoverCorrelationId === record.takeoverCorrelationId;
    }
    if (
      record.triggeringEventId &&
      candidate.sourceRecordIds.teslaEventId === record.triggeringEventId
    ) {
      return true;
    }
    if (record.orderId) {
      return candidate.orderId === record.orderId;
    }
    return true;
  }

  private scoreCorrelatedCase(
    record: AccidentCaseRecord,
    candidate: CorrelatedTakeoverCase,
  ) {
    let score = candidate.correlationPriority * 10;
    if (
      record.takeoverCorrelationId &&
      candidate.takeoverCorrelationId === record.takeoverCorrelationId
    ) {
      score -= 100;
    }
    if (
      record.triggeringEventId &&
      candidate.sourceRecordIds.teslaEventId === record.triggeringEventId
    ) {
      score -= 50;
    }
    if (record.orderId && candidate.orderId === record.orderId) {
      score -= 25;
    }

    const referenceTimestamp =
      Date.parse(record.occurredAt) ||
      Date.parse(candidate.sourceTimestamps.safetyOccurredAt);
    const candidateTimestamp = Date.parse(
      candidate.sourceTimestamps.safetyOccurredAt,
    );
    score += Math.abs(candidateTimestamp - referenceTimestamp) / 1000;
    return score;
  }

  private defaultConfidenceFromSource(
    source: Pick<
      Phase2SourceMetadata,
      "signatureRef" | "sourceSystem"
    >,
  ): AccidentTimelineFactConfidence {
    if (source.signatureRef) {
      return "provider_signed";
    }
    switch (source.sourceSystem) {
      case "tesla_fleet_api":
      case "tesla_public_telemetry":
      case "regulatory_filing":
        return "provider_reported";
      case "roc_operator":
        return "platform_recorded";
      case "manual_entry":
        return "operator_reported";
      default:
        return "unknown";
    }
  }

  private normalizeSourceMetadata(
    source: Phase2SourceMetadata,
  ): Phase2SourceMetadata {
    return {
      sourceSystem: source.sourceSystem,
      sourceRef: this.normalizeNullable(source.sourceRef),
      ingestedAt: this.normalizeTimestamp(source.ingestedAt, "source.ingestedAt"),
      recordedAt: source.recordedAt
        ? this.normalizeTimestamp(source.recordedAt, "source.recordedAt")
        : null,
      signatureRef: this.normalizeNullable(source.signatureRef),
      schemaVersion: this.normalizeIdentifier(
        source.schemaVersion,
        "source.schemaVersion",
      ),
    };
  }

  private storeTimelineFact(fact: AccidentTimelineFactRecord) {
    const bucket = this.timelineFacts.get(fact.caseId) ?? [];
    const nextBucket = bucket.filter((candidate) => candidate.factId !== fact.factId);
    nextBucket.push(fact);
    this.timelineFacts.set(fact.caseId, nextBucket);
  }

  private uniqueFacts(
    facts: readonly AccidentTimelineFactRecord[],
  ): AccidentTimelineFactRecord[] {
    const seen = new Map<string, AccidentTimelineFactRecord>();
    for (const fact of facts) {
      seen.set(fact.factId, fact);
    }
    return [...seen.values()];
  }

  private compareFacts(
    left: AccidentTimelineFactRecord,
    right: AccidentTimelineFactRecord,
  ) {
    const confidenceDelta =
      CONFIDENCE_PRIORITY[right.confidence] -
      CONFIDENCE_PRIORITY[left.confidence];
    if (confidenceDelta !== 0) {
      return confidenceDelta;
    }
    if (left.source.sourceSystem === "system_derived") {
      return 1;
    }
    if (right.source.sourceSystem === "system_derived") {
      return -1;
    }
    const occurredAtDelta = this.compareTimestamps(left.occurredAt, right.occurredAt);
    if (occurredAtDelta !== 0) {
      return occurredAtDelta;
    }
    return left.factId.localeCompare(right.factId);
  }

  private compareTimestamps(left: string, right: string) {
    return Date.parse(left) - Date.parse(right);
  }

  private captureResolve<T>(
    resolver: () => T | null | undefined,
    source: string,
  ): T | null {
    try {
      const value = resolver();
      return value ?? null;
    } catch (error) {
      this.logger.debug(
        `bundle snapshot source ${source} degraded: ${
          error instanceof Error ? error.message : String(error)
        }`,
      );
      return null;
    }
  }

  private captureSnapshotValue<T>(
    resolver: () => T | null | undefined,
    source: string,
  ): SnapshotResolution<T> {
    try {
      const value = resolver();
      return {
        value: value ?? null,
        unavailable: false,
      };
    } catch (error) {
      this.logger.debug(
        `bundle snapshot source ${source} degraded: ${
          error instanceof Error ? error.message : String(error)
        }`,
      );
      return {
        value: null,
        unavailable: true,
      };
    }
  }

  private computeHash(value: unknown) {
    return createHash("sha256").update(this.stableSerialize(value)).digest("hex");
  }

  private stableSerialize(value: unknown): string {
    if (Array.isArray(value)) {
      return `[${value.map((item) => this.stableSerialize(item)).join(",")}]`;
    }
    if (value && typeof value === "object") {
      return `{${Object.keys(value as Record<string, unknown>)
        .sort()
        .map((key) => {
          const nestedValue = (value as Record<string, unknown>)[key];
          return `${JSON.stringify(key)}:${this.stableSerialize(nestedValue)}`;
        })
        .join(",")}}`;
    }
    return JSON.stringify(value);
  }

  private requireCase(caseId: string): AccidentCaseRecord {
    const normalizedCaseId = this.normalizeIdentifier(caseId, "caseId");
    const record = this.accidentCases.get(normalizedCaseId);
    if (!record) {
      throw new ApiRequestError(
        404,
        "ACCIDENT_CASE_NOT_FOUND",
        `Accident case ${normalizedCaseId} was not found.`,
        { caseId: normalizedCaseId },
      );
    }
    return record;
  }

  private cloneCase(record: AccidentCaseRecord): AccidentCaseRecord {
    return {
      ...record,
      discrepancyCaseIds: [...record.discrepancyCaseIds],
      externalDocumentIds: [...record.externalDocumentIds],
    };
  }

  private cloneTimelineFact(
    fact: AccidentTimelineFactRecord,
  ): AccidentTimelineFactRecord {
    return {
      ...fact,
      source: { ...fact.source },
      derivedFromFactIds: [...fact.derivedFromFactIds],
      discrepancyCaseIds: [...fact.discrepancyCaseIds],
    };
  }

  private cloneExternalDocument(
    document: AccidentExternalDocumentRecord,
  ): AccidentExternalDocumentRecord {
    return {
      ...document,
      source: { ...document.source },
      factIds: [...document.factIds],
    };
  }

  private cloneBundle(
    bundle: AccidentInvestigationBundleView,
  ): AccidentInvestigationBundleView {
    return JSON.parse(JSON.stringify(bundle)) as AccidentInvestigationBundleView;
  }

  private normalizeIdentifier(value: string, field: string): string {
    const normalized = value?.trim();
    if (!normalized) {
      throw new ApiRequestError(
        400,
        "ACCIDENT_INVALID_INPUT",
        `${field} is required.`,
        { field },
      );
    }
    return normalized;
  }

  private normalizeNullable(value: string | null | undefined): string | null {
    const normalized = value?.trim();
    return normalized ? normalized : null;
  }

  private normalizeTimestamp(value: string, field: string): string {
    const timestamp = new Date(value);
    if (Number.isNaN(timestamp.getTime())) {
      throw new ApiRequestError(
        400,
        "ACCIDENT_INVALID_TIMESTAMP",
        `${field} must be a valid ISO-8601 timestamp.`,
        { field, value },
      );
    }
    return timestamp.toISOString();
  }

  private uniqueStrings(values: readonly string[]): string[] {
    return [...new Set(values)];
  }
}
