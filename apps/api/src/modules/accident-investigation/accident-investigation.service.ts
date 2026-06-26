import { randomUUID } from "node:crypto";

import { Injectable, Logger } from "@nestjs/common";

import type {
  AccidentCaseRecord,
  AccidentCaseStatus,
  AccidentExternalDocumentRecord,
  AccidentTimelineEntry,
  AccidentTimelineFactConfidence,
  AccidentTimelineFactRecord,
  AddAccidentTimelineFactCommand,
  CorrelatedTakeoverCase,
  CreateAccidentCaseCommand,
  EvidenceDiscrepancyCase,
  ImportAccidentExternalDocumentCommand,
  Phase2SourceMetadata,
  TransitionAccidentCaseCommand,
} from "@drts/contracts";

import { ApiRequestError } from "../../common/api-envelope";
import { RocOperationsService } from "../roc-operations/roc-operations.service";

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

@Injectable()
export class AccidentInvestigationService {
  private readonly logger = new Logger(AccidentInvestigationService.name);

  private readonly accidentCases = new Map<string, AccidentCaseRecord>();
  private readonly timelineFacts = new Map<string, AccidentTimelineFactRecord[]>();
  private readonly externalDocuments = new Map<
    string,
    AccidentExternalDocumentRecord[]
  >();

  constructor(
    private readonly rocOperationsService: RocOperationsService,
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

  getTimeline(caseId: string): AccidentTimelineEntry[] {
    const record = this.synchronizeCaseLinks(this.requireCase(caseId));
    const facts = [
      ...(this.timelineFacts.get(caseId) ?? []).map((fact) =>
        this.cloneTimelineFact(fact),
      ),
      ...this.buildCorrelationTimelineFacts(record),
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
  ): AccidentTimelineFactRecord[] {
    const correlatedCase = this.findCorrelatedTakeoverCase(record);
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
    const candidates = cases
      .filter((candidate) => this.isCorrelationCandidate(record, candidate))
      .sort((left, right) =>
        this.scoreCorrelatedCase(record, left) -
        this.scoreCorrelatedCase(record, right),
      );
    return candidates[0] ?? null;
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
