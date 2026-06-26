import { createHash, randomUUID } from "node:crypto";

import { Injectable, Logger } from "@nestjs/common";
import type {
  AuditLogRecord,
  EvidenceArtifactType,
  EvidenceManifestItem,
} from "@drts/contracts";

import { ApiRequestError } from "../../common/api-envelope";
import { createControlledDownloadMetadata } from "../../common/controlled-download";
import {
  EVIDENCE_GOVERNANCE_VERSION,
  assertEvidenceAccess,
  buildEvidenceAccessAuditSummary,
  getEvidenceRetentionPolicy,
  type EvidenceAccessIdentity,
} from "../../common/evidence-governance";
import { AuditNotificationService } from "../audit-notification/audit-notification.service";
import { MockEvidenceRecorderAdapter } from "./mock-recorder.adapter";
import type {
  BookmarkQuery,
  ControlledEvidenceExportCommand,
  ControlledEvidenceExportRecord,
  EvidenceAccessLogQuery,
  EvidenceCaptureRequest,
  EvidenceFreezeCommand,
  EvidenceFreezeQuery,
  EvidenceFreezeRecord,
  EvidenceFreezeState,
  EvidenceManifestVerificationArtifactRecord,
  EvidenceManifestVerificationRecord,
  EvidencePurgeCommand,
  EvidencePurgeResult,
  EvidenceRecorderAdapter,
  EventBookmarkCommand,
  EventBookmarkRecord,
  NoNewDispatchSignal,
  RecorderHealthReport,
  RecorderRegistrationInput,
  RecorderRegistrationRecord,
  RetryUploadResult,
  SegmentIndexEntry,
  SegmentIndexQuery,
  SegmentUploadStatus,
  VehicleEvidenceAccessLogEntry,
  VehicleEvidenceArtifactRecord,
} from "./vehicle-evidence.ports";

const VEHICLE_EVIDENCE_HASH_ALGORITHM = "sha256-merkle-v1" as const;
const MAX_ACCESS_LOGS = 1000;

type StoredRecorder = {
  registration: RecorderRegistrationRecord;
  adapter: EvidenceRecorderAdapter;
};

type StoredEvidenceFreeze = EvidenceFreezeRecord;

type EvidenceManifestAssessment = EvidenceManifestVerificationRecord & {
  finalState: Extract<EvidenceFreezeState, "sealed" | "partial" | "failed">;
};

type SeedSegmentOptions = {
  uploadStatus?: SegmentUploadStatus;
  eventId?: string | null;
  eventType?: string | null;
  startedAt: string;
  endedAt: string;
  caseId?: string | null;
};

@Injectable()
export class VehicleEvidenceService {
  private readonly logger = new Logger(VehicleEvidenceService.name);

  private readonly recorderRegistry = new Map<string, StoredRecorder>();
  private readonly healthSnapshots = new Map<string, RecorderHealthReport>();
  private readonly segmentIndex = new Map<string, SegmentIndexEntry>();
  private readonly bookmarks = new Map<string, EventBookmarkRecord>();
  private readonly evidenceFreezes = new Map<string, StoredEvidenceFreeze>();
  private readonly artifactCatalog = new Map<string, VehicleEvidenceArtifactRecord>();
  private readonly evidenceExports = new Map<
    string,
    ControlledEvidenceExportRecord
  >();

  private accessLogs: VehicleEvidenceAccessLogEntry[] = [];

  constructor(
    private readonly auditNotificationService: AuditNotificationService = new AuditNotificationService(),
  ) {}

  registerRecorder(
    input: RecorderRegistrationInput,
    adapter?: EvidenceRecorderAdapter,
  ) {
    const recorderId = input.recorderId.trim();
    const vehicleId = input.vehicleId.trim();
    if (!recorderId || !vehicleId) {
      throw new ApiRequestError(
        400,
        "RECORDER_REGISTRATION_INVALID",
        "recorderId and vehicleId are required.",
      );
    }

    const registration: RecorderRegistrationRecord = {
      recorderId,
      vehicleId,
      vendorCode: input.vendorCode.trim(),
      deviceId: input.deviceId.trim(),
      firmwareVersion: input.firmwareVersion.trim(),
      requiredForDispatch: input.requiredForDispatch ?? true,
      encryptionEnabled: input.encryptionEnabled ?? true,
      totalStorageBytes: input.totalStorageBytes ?? 128 * 1024 * 1024 * 1024,
      availableStorageBytes:
        input.availableStorageBytes ?? 96 * 1024 * 1024 * 1024,
      registeredAt: new Date().toISOString(),
    };

    const resolvedAdapter =
      adapter ??
      (registration.vendorCode === "mock_recorder"
        ? new MockEvidenceRecorderAdapter()
        : null);
    if (!resolvedAdapter) {
      throw new ApiRequestError(
        400,
        "RECORDER_ADAPTER_REQUIRED",
        "A concrete recorder adapter must be provided for non-mock vendors.",
      );
    }

    this.recorderRegistry.set(recorderId, {
      registration,
      adapter: resolvedAdapter,
    });

    if (!this.healthSnapshots.has(recorderId)) {
      this.healthSnapshots.set(
        recorderId,
        this.buildHealthReport(registration, {
          observedAt: registration.registeredAt,
          overall: "healthy",
          clockDriftMs: 42,
          storageState: "ok",
          cameraState: "ok",
          lastSegmentState: "ok",
          lastSegmentId: null,
          lastSegmentCapturedAt: null,
          uploadQueueState: "ok",
          uploadPendingCount: 0,
          firmwareState: "ok",
          encryptionState: registration.encryptionEnabled ? "ok" : "error",
        }),
      );
    }

    if (registration.vendorCode === "mock_recorder") {
      this.seedMockSegments(recorderId, vehicleId);
    }

    return this.cloneRegistration(registration);
  }

  listRecorders() {
    return [...this.recorderRegistry.values()]
      .map((entry) => this.cloneRegistration(entry.registration))
      .sort((left, right) =>
        left.registeredAt < right.registeredAt ? 1 : -1,
      );
  }

  updateRecorderHealth(
    recorderId: string,
    updates: {
      observedAt?: string;
      overall: "healthy" | "degraded" | "unhealthy";
      clockDriftMs?: number;
      storageState?: "ok" | "warning" | "error";
      availableStorageBytes?: number;
      cameraState?: "ok" | "warning" | "error";
      activeChannels?: number;
      expectedChannels?: number;
      lastSegmentState?: "ok" | "warning" | "error";
      lastSegmentId?: string | null;
      lastSegmentCapturedAt?: string | null;
      encryptionState?: "ok" | "warning" | "error";
      encryptionEnabled?: boolean;
      uploadQueueState?: "ok" | "warning" | "error";
      uploadPendingCount?: number;
      uploadOldestQueuedAt?: string | null;
      firmwareState?: "ok" | "warning" | "error";
      firmwareVersion?: string;
      reasons?: string[];
    },
  ) {
    const stored = this.requireRecorder(recorderId);
    const health = this.buildHealthReport(stored.registration, updates);
    this.healthSnapshots.set(recorderId, health);
    return this.cloneHealth(health);
  }

  getRecorderHealth(recorderId: string) {
    const health = this.healthSnapshots.get(recorderId);
    if (!health) {
      throw new ApiRequestError(
        404,
        "RECORDER_HEALTH_NOT_FOUND",
        `Recorder ${recorderId} has no health snapshot.`,
      );
    }
    return this.cloneHealth(health);
  }

  getNoNewDispatchSignal(vehicleId: string): NoNewDispatchSignal | null {
    const activeHealth = [...this.healthSnapshots.values()].find(
      (health) =>
        health.vehicleId === vehicleId &&
        health.requiredForDispatch &&
        health.noNewDispatch,
    );
    if (!activeHealth) {
      return null;
    }
    return {
      vehicleId,
      recorderId: activeHealth.recorderId,
      active: true,
      reasonCode: "RECORDER_UNHEALTHY",
      observedAt: activeHealth.observedAt,
      reasons: [...activeHealth.reasons],
    };
  }

  async captureEvidenceWindow(
    recorderId: string,
    request: EvidenceCaptureRequest,
  ): Promise<EvidenceManifestItem[]> {
    const stored = this.requireRecorder(recorderId);
    const items = await stored.adapter.captureWindow(request);
    for (const item of items) {
      this.upsertSegmentFromArtifact(stored.registration, item, {
        startedAt: request.windowStart,
        endedAt: request.windowEnd,
        caseId: request.caseId ?? null,
      });
    }

    const lastSegment = [...this.segmentIndex.values()]
      .filter((entry) => entry.recorderId === recorderId)
      .sort((left, right) => (left.endedAt < right.endedAt ? 1 : -1))[0];
    if (lastSegment) {
      this.updateRecorderHealth(recorderId, {
        observedAt: new Date().toISOString(),
        overall: "healthy",
        lastSegmentId: lastSegment.segmentId,
        lastSegmentCapturedAt: lastSegment.endedAt,
        lastSegmentState: "ok",
      });
    }

    return items.map((item) => ({ ...item, source: { ...item.source } }));
  }

  async requestEvidenceFreeze(
    recorderId: string,
    command: EvidenceFreezeCommand,
    identity?: EvidenceAccessIdentity | null,
    requestId?: string,
  ): Promise<EvidenceFreezeRecord> {
    const stored = this.requireRecorder(recorderId);
    const policy = assertEvidenceAccess({
      family: "vehicle_evidence",
      identity,
    });
    const normalizedCommand = this.normalizeFreezeCommand(
      stored.registration.vehicleId,
      command,
    );
    const requestedAt = new Date().toISOString();
    const freezeId = `freeze-${randomUUID()}`;

    const freeze: StoredEvidenceFreeze = {
      freezeId,
      recorderId: stored.registration.recorderId,
      vehicleId: stored.registration.vehicleId,
      caseId: normalizedCommand.caseId,
      caseReference: normalizedCommand.caseReference,
      requestedReason: normalizedCommand.reason,
      requestedBy: normalizedCommand.requestedBy,
      requestedAt,
      sealedAt: null,
      status: "requested",
      manifestId: null,
      manifestHash: null,
      hashAlgorithm: null,
      providerSignatureRefs: [],
      sourceSystems: [],
      objectLockEnabled: false,
      objectLockRetainedUntil: null,
      immutable: false,
      supersedesFreezeId: normalizedCommand.supersedesFreezeId,
      verification: null,
      transitionHistory: [
        {
          from: null,
          to: "requested",
          at: requestedAt,
          reason: "freeze_requested",
          errorCode: null,
        },
      ],
      artifacts: [],
      exportCount: 0,
      failureCode: null,
      failureReason: null,
    };
    this.evidenceFreezes.set(freezeId, freeze);

    this.recordAccessLog(
      {
        freezeId,
        artifactId: null,
        exportId: null,
        manifestHash: null,
        action: "freeze_request",
        actorId: identity?.actorId ?? null,
        actorType: identity?.actorType ?? null,
        requestId: requestId ?? null,
        caseReference: freeze.caseReference,
        reason: freeze.requestedReason,
        stepUpMethod: null,
        stepUpVerifiedAt: null,
        signedUrlExpiresAt: null,
        metadata: {
          recorderId,
          windowStart: normalizedCommand.windowStart,
          windowEnd: normalizedCommand.windowEnd,
          caseId: normalizedCommand.caseId,
        },
      },
      requestId,
    );
    this.recordEvidenceAudit(
      {
        actorId: identity?.actorId ?? null,
        actorType:
          (identity?.actorType as AuditLogRecord["actorType"] | undefined) ??
          "system",
        tenantId: identity?.tenantId ?? null,
        moduleName: "vehicle-evidence",
        actionName: "request_vehicle_evidence_freeze",
        resourceType: "vehicle_evidence_freeze",
        resourceId: freezeId,
        newValuesSummary: {
          ...this.buildPolicySummary(policy),
          recorderId,
          vehicleId: freeze.vehicleId,
          caseId: freeze.caseId,
          caseReference: freeze.caseReference,
          windowStart: normalizedCommand.windowStart,
          windowEnd: normalizedCommand.windowEnd,
          requestedReason: freeze.requestedReason,
        },
      },
      requestId,
    );

    try {
      this.transitionFreeze(freeze, "collecting", "capture_window_started");
      const items = await this.captureEvidenceWindow(recorderId, {
        vehicleId: stored.registration.vehicleId,
        windowStart: normalizedCommand.windowStart,
        windowEnd: normalizedCommand.windowEnd,
        caseId: normalizedCommand.caseId,
      });
      if (items.length === 0) {
        return this.failFreeze(
          freeze,
          "EVIDENCE_FREEZE_EMPTY",
          "No evidence artifacts were returned for the requested capture window.",
          identity,
          requestId,
        );
      }

      const assessment = await this.assessManifest(stored.adapter, items);
      const objectLockRetainedUntil = this.computeRetentionBoundary(
        normalizedCommand.windowEnd,
      );
      const artifacts = items.map((item) =>
        this.buildArtifactRecord(
          freeze.freezeId,
          item,
          assessment,
          objectLockRetainedUntil,
        ),
      );
      freeze.manifestId = items[0]?.manifestId ?? null;
      freeze.manifestHash = assessment.manifestHash;
      freeze.hashAlgorithm = VEHICLE_EVIDENCE_HASH_ALGORITHM;
      freeze.providerSignatureRefs = this.uniqueStrings(
        artifacts
          .map((artifact) => artifact.source.signatureRef)
          .filter((value): value is string => Boolean(value)),
      );
      freeze.sourceSystems = this.uniqueStrings(
        artifacts.map((artifact) => artifact.source.sourceSystem),
      );
      freeze.objectLockEnabled = true;
      freeze.objectLockRetainedUntil = objectLockRetainedUntil;
      freeze.immutable = assessment.finalState !== "failed";
      freeze.verification = this.cloneManifestVerification(assessment);
      freeze.artifacts = artifacts.map((artifact) =>
        this.cloneEvidenceArtifact(artifact),
      );
      freeze.failureCode =
        assessment.finalState === "sealed"
          ? null
          : assessment.finalState === "partial"
            ? "EVIDENCE_MANIFEST_PARTIAL"
            : "EVIDENCE_MANIFEST_VERIFICATION_FAILED";
      freeze.failureReason =
        assessment.finalState === "sealed"
          ? null
          : this.describeManifestAssessment(assessment);
      if (assessment.finalState === "sealed" || assessment.finalState === "partial") {
        freeze.sealedAt = new Date().toISOString();
      }

      for (const artifact of artifacts) {
        this.artifactCatalog.set(
          artifact.artifactId,
          this.cloneEvidenceArtifact(artifact),
        );
      }

      this.transitionFreeze(
        freeze,
        assessment.finalState,
        assessment.finalState === "sealed"
          ? "manifest_verified"
          : assessment.finalState === "partial"
            ? "manifest_partially_verified"
            : "manifest_verification_failed",
        freeze.failureCode,
      );
      this.recordAccessLog(
        {
          freezeId: freeze.freezeId,
          artifactId: null,
          exportId: null,
          manifestHash: freeze.manifestHash,
          action: "verify",
          actorId: identity?.actorId ?? null,
          actorType: identity?.actorType ?? null,
          requestId: requestId ?? null,
          caseReference: freeze.caseReference,
          reason: freeze.requestedReason,
          stepUpMethod: null,
          stepUpVerifiedAt: null,
          signedUrlExpiresAt: null,
          metadata: {
            status: freeze.status,
            valid: assessment.valid,
            verifiedArtifactIds: [...assessment.verifiedArtifactIds],
            failedArtifactIds: [...assessment.failedArtifactIds],
            missingSignatureArtifactIds: [
              ...assessment.missingSignatureArtifactIds,
            ],
          },
        },
        requestId,
      );
      this.recordEvidenceAudit(
        {
          actorId: identity?.actorId ?? null,
          actorType:
            (identity?.actorType as AuditLogRecord["actorType"] | undefined) ??
            "system",
          tenantId: identity?.tenantId ?? null,
          moduleName: "vehicle-evidence",
          actionName: "finalize_vehicle_evidence_freeze",
          resourceType: "vehicle_evidence_freeze",
          resourceId: freeze.freezeId,
          newValuesSummary: {
            ...this.buildPolicySummary(policy),
            status: freeze.status,
            manifestHash: freeze.manifestHash,
            manifestId: freeze.manifestId,
            artifactCount: freeze.artifacts.length,
            verifiedArtifactIds: [...assessment.verifiedArtifactIds],
            failedArtifactIds: [...assessment.failedArtifactIds],
            missingSignatureArtifactIds: [
              ...assessment.missingSignatureArtifactIds,
            ],
            objectLockEnabled: freeze.objectLockEnabled,
            objectLockRetainedUntil: freeze.objectLockRetainedUntil,
          },
        },
        requestId,
      );

      return this.cloneEvidenceFreeze(freeze);
    } catch (error) {
      this.logger.warn(
        `Evidence freeze ${freezeId} failed: ${this.describeUnknownError(error)}`,
      );
      return this.failFreeze(
        freeze,
        "EVIDENCE_FREEZE_CAPTURE_FAILED",
        this.describeUnknownError(error),
        identity,
        requestId,
      );
    }
  }

  listEvidenceFreezes(
    query: EvidenceFreezeQuery = {},
    requestId?: string,
    identity?: EvidenceAccessIdentity | null,
  ) {
    const policy = assertEvidenceAccess({
      family: "vehicle_evidence",
      identity,
    });
    const items = [...this.evidenceFreezes.values()]
      .filter((freeze) => {
        if (query.recorderId && freeze.recorderId !== query.recorderId) {
          return false;
        }
        if (query.vehicleId && freeze.vehicleId !== query.vehicleId) {
          return false;
        }
        if (query.caseId && freeze.caseId !== query.caseId) {
          return false;
        }
        if (query.status && freeze.status !== query.status) {
          return false;
        }
        return true;
      })
      .map((freeze) => this.cloneEvidenceFreeze(freeze))
      .sort((left, right) =>
        left.requestedAt < right.requestedAt ? 1 : -1,
      );

    this.recordEvidenceAudit(
      {
        actorId: identity?.actorId ?? null,
        actorType:
          (identity?.actorType as AuditLogRecord["actorType"] | undefined) ??
          "system",
        tenantId: identity?.tenantId ?? null,
        moduleName: "vehicle-evidence",
        actionName: "list_vehicle_evidence_freezes",
        resourceType: "vehicle_evidence_freeze",
        resourceId: null,
        newValuesSummary: buildEvidenceAccessAuditSummary(policy, "list", {
          itemCount: items.length,
          recorderId: query.recorderId ?? null,
          vehicleId: query.vehicleId ?? null,
          caseId: query.caseId ?? null,
          status: query.status ?? null,
        }),
      },
      requestId,
    );

    return items;
  }

  getEvidenceFreeze(
    freezeId: string,
    requestId?: string,
    identity?: EvidenceAccessIdentity | null,
  ) {
    const policy = assertEvidenceAccess({
      family: "vehicle_evidence",
      identity,
    });
    const freeze = this.requireFreeze(freezeId);
    this.recordAccessLog(
      {
        freezeId: freeze.freezeId,
        artifactId: null,
        exportId: null,
        manifestHash: freeze.manifestHash,
        action: "read",
        actorId: identity?.actorId ?? null,
        actorType: identity?.actorType ?? null,
        requestId: requestId ?? null,
        caseReference: freeze.caseReference,
        reason: null,
        stepUpMethod: null,
        stepUpVerifiedAt: null,
        signedUrlExpiresAt: null,
        metadata: {
          status: freeze.status,
          artifactCount: freeze.artifacts.length,
        },
      },
      requestId,
    );
    this.recordEvidenceAudit(
      {
        actorId: identity?.actorId ?? null,
        actorType:
          (identity?.actorType as AuditLogRecord["actorType"] | undefined) ??
          "system",
        tenantId: identity?.tenantId ?? null,
        moduleName: "vehicle-evidence",
        actionName: "view_vehicle_evidence_manifest",
        resourceType: "vehicle_evidence_freeze",
        resourceId: freeze.freezeId,
        newValuesSummary: buildEvidenceAccessAuditSummary(policy, "read", {
          status: freeze.status,
          manifestHash: freeze.manifestHash,
          artifactCount: freeze.artifacts.length,
        }),
      },
      requestId,
    );
    return this.cloneEvidenceFreeze(freeze);
  }

  async verifyEvidenceFreeze(
    freezeId: string,
    requestId?: string,
    identity?: EvidenceAccessIdentity | null,
  ) {
    const policy = assertEvidenceAccess({
      family: "vehicle_evidence",
      identity,
    });
    const freeze = this.requireFreeze(freezeId);
    if (!freeze.manifestHash || freeze.artifacts.length === 0) {
      throw new ApiRequestError(
        409,
        "EVIDENCE_MANIFEST_NOT_AVAILABLE",
        "This freeze does not have a manifest available for verification.",
        { freezeId },
      );
    }

    const storedRecorder = this.requireRecorder(freeze.recorderId);
    const manifestItems = freeze.artifacts.map((artifact) =>
      this.toManifestItem(artifact),
    );
    const assessment = await this.assessManifest(storedRecorder.adapter, manifestItems);
    if (assessment.manifestHash !== freeze.manifestHash) {
      throw new ApiRequestError(
        409,
        "EVIDENCE_MANIFEST_HASH_MISMATCH",
        "The recomputed manifest hash does not match the sealed freeze manifest.",
        {
          freezeId,
          expectedManifestHash: freeze.manifestHash,
          actualManifestHash: assessment.manifestHash,
        },
      );
    }

    freeze.verification = this.cloneManifestVerification(assessment);
    this.recordAccessLog(
      {
        freezeId: freeze.freezeId,
        artifactId: null,
        exportId: null,
        manifestHash: freeze.manifestHash,
        action: "verify",
        actorId: identity?.actorId ?? null,
        actorType: identity?.actorType ?? null,
        requestId: requestId ?? null,
        caseReference: freeze.caseReference,
        reason: null,
        stepUpMethod: null,
        stepUpVerifiedAt: null,
        signedUrlExpiresAt: null,
        metadata: {
          valid: assessment.valid,
          verifiedArtifactIds: [...assessment.verifiedArtifactIds],
          failedArtifactIds: [...assessment.failedArtifactIds],
        },
      },
      requestId,
    );
    this.recordEvidenceAudit(
      {
        actorId: identity?.actorId ?? null,
        actorType:
          (identity?.actorType as AuditLogRecord["actorType"] | undefined) ??
          "system",
        tenantId: identity?.tenantId ?? null,
        moduleName: "vehicle-evidence",
        actionName: "verify_vehicle_evidence_manifest",
        resourceType: "vehicle_evidence_freeze",
        resourceId: freeze.freezeId,
        newValuesSummary: buildEvidenceAccessAuditSummary(policy, "read", {
          manifestHash: freeze.manifestHash,
          valid: assessment.valid,
          verifiedArtifactIds: [...assessment.verifiedArtifactIds],
          failedArtifactIds: [...assessment.failedArtifactIds],
          missingSignatureArtifactIds: [
            ...assessment.missingSignatureArtifactIds,
          ],
        }),
      },
      requestId,
    );

    return this.cloneManifestVerification(assessment);
  }

  issueControlledExport(
    freezeId: string,
    command: ControlledEvidenceExportCommand,
    identity?: EvidenceAccessIdentity | null,
    requestId?: string,
  ) {
    const policy = assertEvidenceAccess({
      family: "vehicle_evidence",
      identity,
    });
    const actor = this.requireEvidenceActor(
      identity,
      "EVIDENCE_EXPORT_IDENTITY_REQUIRED",
    );
    const freeze = this.requireFreeze(freezeId);
    if (freeze.status !== "sealed" && freeze.status !== "partial") {
      throw new ApiRequestError(
        409,
        "EVIDENCE_EXPORT_NOT_READY",
        "Vehicle evidence export is only available after the freeze reaches sealed or partial.",
        {
          freezeId,
          status: freeze.status,
        },
      );
    }
    if (!freeze.manifestHash) {
      throw new ApiRequestError(
        409,
        "EVIDENCE_MANIFEST_NOT_AVAILABLE",
        "Vehicle evidence export requires a manifest hash.",
        { freezeId },
      );
    }

    const reason = this.requireNonBlank(
      command.reason,
      "reason",
      "EVIDENCE_EXPORT_REASON_REQUIRED",
    );
    const caseReference =
      command.caseReference?.trim() || freeze.caseReference.trim();
    if (!caseReference) {
      throw new ApiRequestError(
        400,
        "EVIDENCE_EXPORT_CASE_REFERENCE_REQUIRED",
        "Vehicle evidence export requires a case reference.",
        { freezeId },
      );
    }

    const stepUpSessionId = this.requireNonBlank(
      command.stepUpSessionId,
      "stepUpSessionId",
      "EVIDENCE_STEP_UP_REQUIRED",
    );
    const stepUpVerifiedAt = this.requireIsoTimestamp(
      command.stepUpVerifiedAt,
      "stepUpVerifiedAt",
      "EVIDENCE_STEP_UP_REQUIRED",
    );

    const requestedAt = new Date().toISOString();
    const exportId = `evexp-${randomUUID()}`;
    const watermarkText =
      command.watermarkText?.trim() ||
      `${caseReference} | ${actor.actorId} | ${freeze.manifestHash}`;
    const download = createControlledDownloadMetadata({
      kind: "vehicle-evidence-export",
      subjectId: exportId,
      manifestHash: freeze.manifestHash,
      createdAt: requestedAt,
    });
    const record: ControlledEvidenceExportRecord = {
      exportId,
      freezeId: freeze.freezeId,
      manifestHash: freeze.manifestHash,
      caseReference,
      reason,
      watermarkText,
      requestedAt,
      requestedByActorId: actor.actorId,
      requestedByActorType: actor.actorType,
      stepUpMethod: command.stepUpMethod,
      stepUpVerifiedAt,
      stepUpSessionId,
      download: { ...download },
    };
    this.evidenceExports.set(exportId, this.cloneEvidenceExport(record));
    freeze.exportCount += 1;

    this.recordAccessLog(
      {
        freezeId: freeze.freezeId,
        artifactId: null,
        exportId,
        manifestHash: freeze.manifestHash,
        action: "export",
        actorId: actor.actorId,
        actorType: actor.actorType,
        requestId: requestId ?? null,
        caseReference,
        reason,
        stepUpMethod: command.stepUpMethod,
        stepUpVerifiedAt,
        signedUrlExpiresAt: download.expiresAt,
        metadata: {
          watermarkText,
          manifestStatus: freeze.status,
        },
      },
      requestId,
    );
    this.recordAccessLog(
      {
        freezeId: freeze.freezeId,
        artifactId: null,
        exportId,
        manifestHash: freeze.manifestHash,
        action: "signed_url",
        actorId: actor.actorId,
        actorType: actor.actorType,
        requestId: requestId ?? null,
        caseReference,
        reason,
        stepUpMethod: command.stepUpMethod,
        stepUpVerifiedAt,
        signedUrlExpiresAt: download.expiresAt,
        metadata: {
          ttlMinutes: download.ttlMinutes,
          signatureVersion: download.signatureVersion,
        },
      },
      requestId,
    );
    this.recordEvidenceAudit(
      {
        actorId: actor.actorId,
        actorType: actor.actorType as AuditLogRecord["actorType"],
        tenantId: actor.tenantId ?? null,
        moduleName: "vehicle-evidence",
        actionName: "issue_vehicle_evidence_export",
        resourceType: "vehicle_evidence_export",
        resourceId: exportId,
        newValuesSummary: buildEvidenceAccessAuditSummary(policy, "export", {
          freezeId: freeze.freezeId,
          manifestHash: freeze.manifestHash,
          caseReference,
          reason,
          stepUpMethod: command.stepUpMethod,
          stepUpVerifiedAt,
          ttlMinutes: download.ttlMinutes,
          expiresAt: download.expiresAt,
          watermarkText,
        }),
      },
      requestId,
    );

    return this.cloneEvidenceExport(record);
  }

  purgeArtifact(
    artifactId: string,
    command: EvidencePurgeCommand,
    identity?: EvidenceAccessIdentity | null,
    requestId?: string,
  ) {
    const policy = assertEvidenceAccess({
      family: "vehicle_evidence",
      identity,
    });
    const actor = this.requireEvidenceActor(
      identity,
      "EVIDENCE_PURGE_IDENTITY_REQUIRED",
    );
    const artifact = this.artifactCatalog.get(artifactId);
    if (!artifact) {
      throw new ApiRequestError(
        404,
        "EVIDENCE_ARTIFACT_NOT_FOUND",
        `Artifact ${artifactId} is not indexed.`,
      );
    }

    const freeze = this.requireFreeze(artifact.freezeId);
    const reason = this.requireNonBlank(
      command.reason,
      "reason",
      "EVIDENCE_PURGE_REASON_REQUIRED",
    );
    const governance = this.auditNotificationService.getEvidenceSubjectGovernance(
      "vehicle_evidence",
      freeze.freezeId,
      {
        manifestHash: freeze.manifestHash,
      },
    );
    if (governance.activeLegalHolds.length > 0) {
      throw new ApiRequestError(
        409,
        "EVIDENCE_DELETION_BLOCKED_BY_HOLD",
        "Vehicle evidence cannot be deleted while an active legal hold exists.",
        {
          freezeId: freeze.freezeId,
          artifactId,
          holdIds: governance.activeLegalHolds.map((hold) => hold.holdId),
        },
      );
    }
    if (governance.activeDeletionExceptions.length > 0) {
      throw new ApiRequestError(
        409,
        "EVIDENCE_DELETION_BLOCKED",
        "Vehicle evidence cannot be deleted while a deletion exception remains active.",
        {
          freezeId: freeze.freezeId,
          artifactId,
          exceptionIds: governance.activeDeletionExceptions.map(
            (item) => item.exceptionId,
          ),
        },
      );
    }
    if (artifact.objectLockEnabled && !command.overrideObjectLock) {
      throw new ApiRequestError(
        409,
        "EVIDENCE_OBJECT_LOCKED",
        "Vehicle evidence purge requires an audited object-lock override.",
        {
          freezeId: freeze.freezeId,
          artifactId,
          retainedUntil: artifact.objectLockRetainedUntil,
        },
      );
    }

    const purgedAt = new Date().toISOString();
    const previousState = artifact.currentCustodyState;
    const updatedArtifact: VehicleEvidenceArtifactRecord = {
      ...artifact,
      currentCustodyState: "purged",
      purgedAt,
    };
    this.artifactCatalog.set(
      artifact.artifactId,
      this.cloneEvidenceArtifact(updatedArtifact),
    );
    freeze.artifacts = freeze.artifacts.map((item) =>
      item.artifactId === artifact.artifactId
        ? this.cloneEvidenceArtifact(updatedArtifact)
        : this.cloneEvidenceArtifact(item),
    );

    this.recordAccessLog(
      {
        freezeId: freeze.freezeId,
        artifactId,
        exportId: null,
        manifestHash: freeze.manifestHash,
        action: "purge",
        actorId: actor.actorId,
        actorType: actor.actorType,
        requestId: requestId ?? null,
        caseReference: freeze.caseReference,
        reason,
        stepUpMethod: null,
        stepUpVerifiedAt: null,
        signedUrlExpiresAt: null,
        metadata: {
          previousState,
          objectLockBypassed: command.overrideObjectLock,
        },
      },
      requestId,
    );
    this.recordEvidenceAudit(
      {
        actorId: actor.actorId,
        actorType: actor.actorType as AuditLogRecord["actorType"],
        tenantId: actor.tenantId ?? null,
        moduleName: "vehicle-evidence",
        actionName: "purge_vehicle_evidence_artifact",
        resourceType: "vehicle_evidence_artifact",
        resourceId: artifactId,
        oldValuesSummary: {
          currentCustodyState: previousState,
          purgedAt: artifact.purgedAt,
        },
        newValuesSummary: {
          ...this.buildPolicySummary(policy),
          freezeId: freeze.freezeId,
          manifestHash: freeze.manifestHash,
          currentCustodyState: updatedArtifact.currentCustodyState,
          purgedAt,
          reason,
          objectLockBypassed: command.overrideObjectLock,
        },
      },
      requestId,
    );

    const result: EvidencePurgeResult = {
      artifactId,
      freezeId: freeze.freezeId,
      purgedAt,
      purgedByActorId: actor.actorId,
      purgedByActorType: actor.actorType,
      reason,
      objectLockBypassed: command.overrideObjectLock,
    };
    return { ...result };
  }

  listEvidenceAccessLogs(
    query: EvidenceAccessLogQuery = {},
    requestId?: string,
    identity?: EvidenceAccessIdentity | null,
  ) {
    const policy = assertEvidenceAccess({
      family: "vehicle_evidence",
      identity,
    });
    const items = this.accessLogs
      .filter((log) => {
        if (query.freezeId && log.freezeId !== query.freezeId) {
          return false;
        }
        if (query.action && log.action !== query.action) {
          return false;
        }
        return true;
      })
      .map((log) => this.cloneAccessLog(log));

    this.recordEvidenceAudit(
      {
        actorId: identity?.actorId ?? null,
        actorType:
          (identity?.actorType as AuditLogRecord["actorType"] | undefined) ??
          "system",
        tenantId: identity?.tenantId ?? null,
        moduleName: "vehicle-evidence",
        actionName: "list_vehicle_evidence_access_log",
        resourceType: "vehicle_evidence_access_log",
        resourceId: query.freezeId ?? null,
        newValuesSummary: buildEvidenceAccessAuditSummary(policy, "list", {
          itemCount: items.length,
          freezeId: query.freezeId ?? null,
          action: query.action ?? null,
        }),
      },
      requestId,
    );

    return items;
  }

  listSegmentIndex(query: SegmentIndexQuery = {}) {
    const entries = [...this.segmentIndex.values()].filter((entry) => {
      if (query.recorderId && entry.recorderId !== query.recorderId) {
        return false;
      }
      if (query.vehicleId && entry.vehicleId !== query.vehicleId) {
        return false;
      }
      if (query.caseId && entry.caseId !== query.caseId) {
        return false;
      }
      if (query.eventType && entry.eventType !== query.eventType) {
        return false;
      }
      if (query.uploadStatus && entry.uploadStatus !== query.uploadStatus) {
        return false;
      }
      if (query.bookmarkedOnly && !entry.bookmarked) {
        return false;
      }
      return true;
    });

    return entries
      .map((entry) => this.cloneSegment(entry))
      .sort((left, right) => (left.startedAt < right.startedAt ? 1 : -1));
  }

  bookmarkEvent(command: EventBookmarkCommand) {
    const segment = this.segmentIndex.get(command.segmentId);
    if (!segment || segment.recorderId !== command.recorderId) {
      throw new ApiRequestError(
        404,
        "RECORDER_SEGMENT_NOT_FOUND",
        `Segment ${command.segmentId} is not indexed for recorder ${command.recorderId}.`,
      );
    }

    const record: EventBookmarkRecord = {
      bookmarkId: randomUUID(),
      recorderId: command.recorderId,
      vehicleId: segment.vehicleId,
      segmentId: command.segmentId,
      eventId: command.eventId.trim(),
      eventType: command.eventType.trim(),
      note: command.note?.trim() || null,
      bookmarkedAt: new Date().toISOString(),
    };

    this.bookmarks.set(record.bookmarkId, record);
    this.segmentIndex.set(segment.segmentId, { ...segment, bookmarked: true });
    return this.cloneBookmark(record);
  }

  listBookmarks(query: BookmarkQuery = {}) {
    return [...this.bookmarks.values()]
      .filter((bookmark) => {
        if (query.recorderId && bookmark.recorderId !== query.recorderId) {
          return false;
        }
        if (query.vehicleId && bookmark.vehicleId !== query.vehicleId) {
          return false;
        }
        if (query.eventType && bookmark.eventType !== query.eventType) {
          return false;
        }
        if (query.eventId && bookmark.eventId !== query.eventId) {
          return false;
        }
        return true;
      })
      .map((bookmark) => this.cloneBookmark(bookmark))
      .sort((left, right) =>
        left.bookmarkedAt < right.bookmarkedAt ? 1 : -1,
      );
  }

  retryUpload(artifactId: string): RetryUploadResult {
    const segment = [...this.segmentIndex.values()].find(
      (entry) => entry.artifactId === artifactId,
    );
    if (!segment) {
      throw new ApiRequestError(
        404,
        "EVIDENCE_ARTIFACT_NOT_FOUND",
        `Artifact ${artifactId} is not indexed.`,
      );
    }

    const retriedAt = new Date().toISOString();
    const updated: SegmentIndexEntry = {
      ...segment,
      uploadStatus: "uploaded",
      retryCount: segment.retryCount + 1,
      lastRetryAt: retriedAt,
    };
    this.segmentIndex.set(updated.segmentId, updated);

    const health = this.healthSnapshots.get(segment.recorderId);
    if (health) {
      const pendingCount = Math.max(0, health.uploadQueue.pendingCount - 1);
      const nextHealthUpdates: Parameters<
        VehicleEvidenceService["buildHealthReport"]
      >[1] = {
        observedAt: retriedAt,
        overall: pendingCount > 0 ? "degraded" : "healthy",
        uploadQueueState: pendingCount > 0 ? "warning" : "ok",
        uploadPendingCount: pendingCount,
        uploadOldestQueuedAt:
          pendingCount > 0 ? health.uploadQueue.oldestQueuedAt : null,
        lastSegmentId: health.lastSegment.segmentId,
        lastSegmentCapturedAt: health.lastSegment.capturedAt,
        lastSegmentState: health.lastSegment.state,
        clockDriftMs: health.clockSync.driftMs,
        storageState: health.storage.state,
        availableStorageBytes: health.storage.availableBytes,
        cameraState: health.camera.state,
        activeChannels: health.camera.activeChannels,
        expectedChannels: health.camera.expectedChannels,
        encryptionState: health.encryption.state,
        encryptionEnabled: health.encryption.enabled,
        firmwareState: health.firmware.state,
      };
      if (health.firmware.version) {
        nextHealthUpdates.firmwareVersion = health.firmware.version;
      }
      this.healthSnapshots.set(
        segment.recorderId,
        this.buildHealthReport(
          this.requireRecorder(segment.recorderId).registration,
          nextHealthUpdates,
        ),
      );
    }

    return {
      artifactId,
      segmentId: updated.segmentId,
      uploadStatus: updated.uploadStatus,
      retryCount: updated.retryCount,
      retriedAt,
    };
  }

  private seedMockSegments(recorderId: string, vehicleId: string) {
    const alreadySeeded = [...this.segmentIndex.values()].some(
      (entry) => entry.recorderId === recorderId,
    );
    if (alreadySeeded) {
      return;
    }

    this.seedSegment(
      recorderId,
      vehicleId,
      "mock-manifest-001",
      "mock-artifact-001",
      "video_clip",
      {
        startedAt: "2026-06-25T10:00:00.000Z",
        endedAt: "2026-06-25T10:05:00.000Z",
        eventId: "fsd-disengagement-001",
        eventType: "fsd_disengagement",
        uploadStatus: "failed",
      },
    );
    this.seedSegment(
      recorderId,
      vehicleId,
      "mock-manifest-002",
      "mock-artifact-002",
      "telemetry_export",
      {
        startedAt: "2026-06-25T10:05:00.000Z",
        endedAt: "2026-06-25T10:06:00.000Z",
        eventId: "remote-assist-002",
        eventType: "remote_assist_requested",
        uploadStatus: "uploaded",
      },
    );

    this.updateRecorderHealth(recorderId, {
      observedAt: "2026-06-25T10:06:30.000Z",
      overall: "degraded",
      uploadQueueState: "warning",
      uploadPendingCount: 1,
      uploadOldestQueuedAt: "2026-06-25T10:05:10.000Z",
      lastSegmentId: "segment-mock-artifact-002",
      lastSegmentCapturedAt: "2026-06-25T10:06:00.000Z",
      lastSegmentState: "ok",
      reasons: ["Upload queue backlog requires retry."],
    });
  }

  private seedSegment(
    recorderId: string,
    vehicleId: string,
    manifestId: string,
    artifactId: string,
    artifactType: EvidenceArtifactType,
    options: SeedSegmentOptions,
  ) {
    const segmentId = `segment-${artifactId}`;
    const entry: SegmentIndexEntry = {
      segmentId,
      recorderId,
      vehicleId,
      manifestId,
      artifactId,
      artifactType,
      caseId: options.caseId ?? null,
      startedAt: options.startedAt,
      endedAt: options.endedAt,
      eventId: options.eventId ?? null,
      eventType: options.eventType ?? null,
      uploadStatus: options.uploadStatus ?? "pending",
      retryCount: 0,
      bookmarked: false,
      lastRetryAt: null,
    };
    this.segmentIndex.set(segmentId, entry);
  }

  private upsertSegmentFromArtifact(
    registration: RecorderRegistrationRecord,
    item: EvidenceManifestItem,
    options: Pick<SeedSegmentOptions, "startedAt" | "endedAt" | "caseId">,
  ) {
    const segmentId = `segment-${item.artifactId}`;
    this.segmentIndex.set(segmentId, {
      segmentId,
      recorderId: registration.recorderId,
      vehicleId: registration.vehicleId,
      manifestId: item.manifestId,
      artifactId: item.artifactId,
      artifactType: item.artifactType,
      caseId: options.caseId ?? item.caseId ?? null,
      startedAt: options.startedAt,
      endedAt: options.endedAt,
      eventId: null,
      eventType: null,
      uploadStatus: "pending",
      retryCount: 0,
      bookmarked: false,
      lastRetryAt: null,
    });
  }

  private async assessManifest(
    adapter: EvidenceRecorderAdapter,
    items: EvidenceManifestItem[],
  ): Promise<EvidenceManifestAssessment> {
    const artifactResults: EvidenceManifestVerificationArtifactRecord[] = [];
    for (const item of items) {
      const checksumVerified = await adapter.verifyChecksum(item.artifactId);
      const signaturePresent = Boolean(item.source.signatureRef?.trim());
        artifactResults.push({
          artifactId: item.artifactId,
          checksumSha256: item.checksumSha256,
          leafHash: this.computeHash({
            artifactId: item.artifactId,
          manifestId: item.manifestId,
          artifactType: item.artifactType,
          objectKey: item.objectKey,
          contentType: item.contentType,
          byteSize: item.byteSize,
            checksumSha256: item.checksumSha256,
            capturedAt: item.capturedAt,
            vehicleId: item.vehicleId,
            caseId: item.caseId,
            source: item.source,
          }),
          checksumVerified,
          signaturePresent,
        });
    }

    const verifiedArtifactIds = artifactResults
      .filter((result) => result.checksumVerified && result.signaturePresent)
      .map((result) => result.artifactId);
    const failedArtifactIds = artifactResults
      .filter((result) => !result.checksumVerified)
      .map((result) => result.artifactId);
    const missingSignatureArtifactIds = artifactResults
      .filter((result) => !result.signaturePresent)
      .map((result) => result.artifactId);
    const finalState: EvidenceManifestAssessment["finalState"] =
      artifactResults.length === 0 || verifiedArtifactIds.length === 0
        ? "failed"
        : verifiedArtifactIds.length === artifactResults.length &&
            missingSignatureArtifactIds.length === 0 &&
            failedArtifactIds.length === 0
          ? "sealed"
          : "partial";

    return {
      verifiedAt: new Date().toISOString(),
      hashAlgorithm: VEHICLE_EVIDENCE_HASH_ALGORITHM,
      manifestHash: this.computeMerkleRoot(
        artifactResults.map((result) => result.leafHash),
      ),
      leafCount: artifactResults.length,
      valid: finalState === "sealed",
      verifiedArtifactIds,
      failedArtifactIds,
      missingSignatureArtifactIds,
      artifactResults,
      finalState,
    };
  }

  private buildArtifactRecord(
    freezeId: string,
    item: EvidenceManifestItem,
    assessment: EvidenceManifestAssessment,
    defaultRetentionUntil: string,
  ): VehicleEvidenceArtifactRecord {
    const artifactResult = assessment.artifactResults.find(
      (result) => result.artifactId === item.artifactId,
    );
    if (!artifactResult) {
      throw new ApiRequestError(
        500,
        "EVIDENCE_MANIFEST_RESULT_MISSING",
        "Evidence manifest verification lost the artifact assessment.",
        {
          freezeId,
          artifactId: item.artifactId,
        },
      );
    }

    const manifestCustodyState =
      artifactResult.checksumVerified && artifactResult.signaturePresent
        ? assessment.finalState === "sealed"
          ? "sealed"
          : "verified"
        : "captured";

    return {
      freezeId,
      artifactId: item.artifactId,
      manifestId: item.manifestId,
      artifactType: item.artifactType,
      objectKey: item.objectKey,
      contentType: item.contentType,
      byteSize: item.byteSize,
      checksumSha256: item.checksumSha256,
      capturedAt: item.capturedAt,
      vehicleId: item.vehicleId,
      caseId: item.caseId,
      retentionUntil: item.retentionUntil ?? defaultRetentionUntil,
      source: { ...item.source },
      manifestCustodyState,
      currentCustodyState: manifestCustodyState,
      checksumVerified: artifactResult.checksumVerified,
      signaturePresent: artifactResult.signaturePresent,
      leafHash: artifactResult.leafHash,
      objectLockEnabled: true,
      objectLockRetainedUntil: item.retentionUntil ?? defaultRetentionUntil,
      purgedAt: null,
    };
  }

  private normalizeFreezeCommand(
    expectedVehicleId: string,
    command: EvidenceFreezeCommand,
  ) {
    const vehicleId = command.vehicleId.trim();
    if (vehicleId !== expectedVehicleId) {
      throw new ApiRequestError(
        400,
        "EVIDENCE_FREEZE_VEHICLE_MISMATCH",
        "Freeze request vehicleId must match the registered recorder vehicle.",
        {
          expectedVehicleId,
          actualVehicleId: vehicleId,
        },
      );
    }

    const windowStart = this.requireIsoTimestamp(
      command.windowStart,
      "windowStart",
      "EVIDENCE_FREEZE_INVALID_WINDOW",
    );
    const windowEnd = this.requireIsoTimestamp(
      command.windowEnd,
      "windowEnd",
      "EVIDENCE_FREEZE_INVALID_WINDOW",
    );
    if (new Date(windowEnd).getTime() <= new Date(windowStart).getTime()) {
      throw new ApiRequestError(
        400,
        "EVIDENCE_FREEZE_INVALID_WINDOW",
        "windowEnd must be later than windowStart.",
        {
          windowStart,
          windowEnd,
        },
      );
    }

    const caseId = command.caseId?.trim() || null;
    const caseReference =
      command.caseReference?.trim() ||
      caseId ||
      `freeze:${expectedVehicleId}:${windowStart}`;

    return {
      windowStart,
      windowEnd,
      caseId,
      caseReference,
      reason: this.requireNonBlank(
        command.reason,
        "reason",
        "EVIDENCE_FREEZE_REASON_REQUIRED",
      ),
      requestedBy: command.requestedBy?.trim() || null,
      supersedesFreezeId: command.supersedesFreezeId?.trim() || null,
    };
  }

  private failFreeze(
    freeze: StoredEvidenceFreeze,
    code: string,
    reason: string,
    identity?: EvidenceAccessIdentity | null,
    requestId?: string,
  ) {
    freeze.failureCode = code;
    freeze.failureReason = reason;
    freeze.objectLockEnabled = false;
    freeze.objectLockRetainedUntil = null;
    freeze.immutable = false;
    if (freeze.status !== "failed") {
      this.transitionFreeze(freeze, "failed", "freeze_failed", code);
    }
    this.recordEvidenceAudit(
      {
        actorId: identity?.actorId ?? null,
        actorType:
          (identity?.actorType as AuditLogRecord["actorType"] | undefined) ??
          "system",
        tenantId: identity?.tenantId ?? null,
        moduleName: "vehicle-evidence",
        actionName: "finalize_vehicle_evidence_freeze",
        resourceType: "vehicle_evidence_freeze",
        resourceId: freeze.freezeId,
        newValuesSummary: {
          evidenceFamily: "vehicle_evidence",
          policyVersion: EVIDENCE_GOVERNANCE_VERSION,
          status: freeze.status,
          failureCode: code,
          failureReason: reason,
        },
      },
      requestId,
    );
    return this.cloneEvidenceFreeze(freeze);
  }

  private transitionFreeze(
    freeze: StoredEvidenceFreeze,
    nextStatus: EvidenceFreezeState,
    reason: string,
    errorCode?: string | null,
  ) {
    const allowedTransitions: Record<EvidenceFreezeState, EvidenceFreezeState[]> = {
      requested: ["collecting"],
      collecting: ["sealed", "partial", "failed"],
      sealed: [],
      partial: [],
      failed: [],
    };
    const allowedNextStatuses = allowedTransitions[freeze.status];
    if (!allowedNextStatuses.includes(nextStatus)) {
      throw new ApiRequestError(
        409,
        "EVIDENCE_FREEZE_TRANSITION_INVALID",
        `Cannot transition evidence freeze from ${freeze.status} to ${nextStatus}.`,
        {
          freezeId: freeze.freezeId,
          from: freeze.status,
          to: nextStatus,
        },
      );
    }

    const transitionedAt = new Date().toISOString();
    freeze.transitionHistory = [
      ...freeze.transitionHistory,
      {
        from: freeze.status,
        to: nextStatus,
        at: transitionedAt,
        reason,
        errorCode: errorCode ?? null,
      },
    ];
    freeze.status = nextStatus;
  }

  private requireFreeze(freezeId: string) {
    const freeze = this.evidenceFreezes.get(freezeId);
    if (!freeze) {
      throw new ApiRequestError(
        404,
        "EVIDENCE_FREEZE_NOT_FOUND",
        `Evidence freeze ${freezeId} could not be found.`,
        { freezeId },
      );
    }
    return freeze;
  }

  private requireEvidenceActor(
    identity: EvidenceAccessIdentity | null | undefined,
    errorCode: string,
  ): EvidenceAccessIdentity & { actorId: string } {
    const actorId = identity?.actorId?.trim();
    if (!actorId) {
      throw new ApiRequestError(
        403,
        errorCode,
        "An authenticated actor identity is required for this evidence action.",
      );
    }
    return {
      ...identity,
      actorId,
    } as EvidenceAccessIdentity & { actorId: string };
  }

  private requireIsoTimestamp(
    value: string | null | undefined,
    fieldName: string,
    errorCode: string,
  ) {
    const normalizedValue = this.requireNonBlank(value, fieldName, errorCode);
    if (Number.isNaN(new Date(normalizedValue).getTime())) {
      throw new ApiRequestError(
        400,
        errorCode,
        `${fieldName} must be a valid ISO-8601 timestamp.`,
        { fieldName },
      );
    }
    return normalizedValue;
  }

  private requireNonBlank(
    value: string | null | undefined,
    fieldName: string,
    errorCode: string,
  ) {
    const normalizedValue = value?.trim();
    if (!normalizedValue) {
      throw new ApiRequestError(
        400,
        errorCode,
        `${fieldName} is required.`,
        { fieldName },
      );
    }
    return normalizedValue;
  }

  private computeRetentionBoundary(anchorAt: string) {
    const policy = getEvidenceRetentionPolicy("vehicle_evidence");
    const days =
      policy.archiveRetentionDays ??
      policy.archiveAfterDays ??
      policy.hotRetentionDays;
    const anchorEpoch = new Date(anchorAt).getTime();
    return new Date(anchorEpoch + days * 24 * 60 * 60 * 1000).toISOString();
  }

  private computeMerkleRoot(leafHashes: string[]) {
    if (leafHashes.length === 0) {
      return this.computeHash("vehicle-evidence-empty-manifest");
    }

    let level = [...leafHashes];
    while (level.length > 1) {
      const nextLevel: string[] = [];
      for (let index = 0; index < level.length; index += 2) {
        const left = level[index]!;
        const right = level[index + 1] ?? left;
        nextLevel.push(this.computeHash({ left, right }));
      }
      level = nextLevel;
    }

    return level[0]!;
  }

  private computeHash(value: unknown) {
    return createHash("sha256")
      .update(this.stableSerialize(value))
      .digest("hex");
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

  private buildPolicySummary(policy: ReturnType<typeof getEvidenceRetentionPolicy>) {
    return {
      evidenceFamily: policy.family,
      policyVersion: EVIDENCE_GOVERNANCE_VERSION,
      hotRetentionDays: policy.hotRetentionDays,
      archiveAfterDays: policy.archiveAfterDays,
      archiveRetentionDays: policy.archiveRetentionDays,
      archiveTier: policy.archiveTier,
      legalHoldSupported: policy.legalHold.supported,
      deletionSuppressedOnHold: policy.legalHold.deletionSuppressed,
    };
  }

  private recordEvidenceAudit(
    input: Omit<AuditLogRecord, "auditId" | "createdAt" | "requestId">,
    requestId?: string,
  ) {
    this.auditNotificationService.recordAuditLog({
      ...input,
      ...(requestId !== undefined ? { requestId } : {}),
    });
  }

  private recordAccessLog(
    input: Omit<VehicleEvidenceAccessLogEntry, "accessId" | "createdAt">,
    requestId?: string,
  ) {
    const createdAt = new Date().toISOString();
    const accessLog: VehicleEvidenceAccessLogEntry = {
      accessId: `evlog-${randomUUID()}`,
      createdAt,
      ...input,
      requestId: input.requestId ?? requestId ?? null,
      metadata: { ...input.metadata },
    };
    this.accessLogs = [accessLog, ...this.accessLogs].slice(0, MAX_ACCESS_LOGS);
    return this.cloneAccessLog(accessLog);
  }

  private describeManifestAssessment(assessment: EvidenceManifestAssessment) {
    if (assessment.finalState === "partial") {
      return "One or more evidence artifacts failed checksum verification or were missing provider signatures.";
    }
    return "All evidence artifacts failed manifest verification.";
  }

  private describeUnknownError(error: unknown) {
    if (error instanceof Error) {
      return error.message;
    }
    return "Unknown evidence freeze failure.";
  }

  private toManifestItem(
    artifact: VehicleEvidenceArtifactRecord,
  ): EvidenceManifestItem {
    return {
      artifactId: artifact.artifactId,
      manifestId: artifact.manifestId,
      artifactType: artifact.artifactType,
      objectKey: artifact.objectKey,
      contentType: artifact.contentType,
      byteSize: artifact.byteSize,
      checksumSha256: artifact.checksumSha256,
      capturedAt: artifact.capturedAt,
      custodyState: artifact.manifestCustodyState,
      vehicleId: artifact.vehicleId,
      caseId: artifact.caseId,
      retentionUntil: artifact.retentionUntil,
      source: { ...artifact.source },
    };
  }

  private uniqueStrings(values: string[]) {
    return [...new Set(values)];
  }

  private buildHealthReport(
    registration: RecorderRegistrationRecord,
    updates: {
      observedAt?: string;
      overall?: "healthy" | "degraded" | "unhealthy";
      clockDriftMs?: number;
      storageState?: "ok" | "warning" | "error";
      availableStorageBytes?: number;
      cameraState?: "ok" | "warning" | "error";
      activeChannels?: number;
      expectedChannels?: number;
      lastSegmentState?: "ok" | "warning" | "error";
      lastSegmentId?: string | null;
      lastSegmentCapturedAt?: string | null;
      encryptionState?: "ok" | "warning" | "error";
      encryptionEnabled?: boolean;
      uploadQueueState?: "ok" | "warning" | "error";
      uploadPendingCount?: number;
      uploadOldestQueuedAt?: string | null;
      firmwareState?: "ok" | "warning" | "error";
      firmwareVersion?: string;
      reasons?: string[];
    },
  ): RecorderHealthReport {
    const previous = this.healthSnapshots.get(registration.recorderId);
    const overall = updates.overall ?? previous?.overall ?? "healthy";
    const reasons =
      updates.reasons ??
      this.computeReasons({
        overall,
        clockDriftMs: updates.clockDriftMs ?? previous?.clockSync.driftMs ?? 0,
        storageState: updates.storageState ?? previous?.storage.state ?? "ok",
        cameraState: updates.cameraState ?? previous?.camera.state ?? "ok",
        uploadQueueState:
          updates.uploadQueueState ?? previous?.uploadQueue.state ?? "ok",
        encryptionEnabled:
          updates.encryptionEnabled ?? previous?.encryption.enabled ?? true,
        firmwareState: updates.firmwareState ?? previous?.firmware.state ?? "ok",
      });

    return {
      recorderId: registration.recorderId,
      vehicleId: registration.vehicleId,
      observedAt: updates.observedAt ?? new Date().toISOString(),
      overall,
      requiredForDispatch: registration.requiredForDispatch,
      deviceId: {
        state: registration.deviceId ? "ok" : "error",
        value: registration.deviceId || null,
      },
      clockSync: {
        state:
          (updates.clockDriftMs ?? previous?.clockSync.driftMs ?? 0) > 10_000
            ? "error"
            : "ok",
        driftMs: updates.clockDriftMs ?? previous?.clockSync.driftMs ?? 0,
      },
      storage: {
        state: updates.storageState ?? previous?.storage.state ?? "ok",
        availableBytes:
          updates.availableStorageBytes ??
          previous?.storage.availableBytes ??
          registration.availableStorageBytes,
        totalBytes: previous?.storage.totalBytes ?? registration.totalStorageBytes,
      },
      camera: {
        state: updates.cameraState ?? previous?.camera.state ?? "ok",
        activeChannels: updates.activeChannels ?? previous?.camera.activeChannels ?? 4,
        expectedChannels:
          updates.expectedChannels ?? previous?.camera.expectedChannels ?? 4,
      },
      lastSegment: {
        state: updates.lastSegmentState ?? previous?.lastSegment.state ?? "warning",
        segmentId:
          updates.lastSegmentId !== undefined
            ? updates.lastSegmentId
            : previous?.lastSegment.segmentId ?? null,
        capturedAt:
          updates.lastSegmentCapturedAt !== undefined
            ? updates.lastSegmentCapturedAt
            : previous?.lastSegment.capturedAt ?? null,
      },
      encryption: {
        state:
          updates.encryptionState ??
          previous?.encryption.state ??
          (registration.encryptionEnabled ? "ok" : "error"),
        enabled:
          updates.encryptionEnabled ??
          previous?.encryption.enabled ??
          registration.encryptionEnabled,
        algorithm: "AES-256-GCM",
      },
      uploadQueue: {
        state: updates.uploadQueueState ?? previous?.uploadQueue.state ?? "ok",
        pendingCount:
          updates.uploadPendingCount ?? previous?.uploadQueue.pendingCount ?? 0,
        oldestQueuedAt:
          updates.uploadOldestQueuedAt !== undefined
            ? updates.uploadOldestQueuedAt
            : previous?.uploadQueue.oldestQueuedAt ?? null,
      },
      firmware: {
        state: updates.firmwareState ?? previous?.firmware.state ?? "ok",
        version:
          updates.firmwareVersion ??
          previous?.firmware.version ??
          registration.firmwareVersion,
      },
      reasons,
      noNewDispatch: registration.requiredForDispatch && overall === "unhealthy",
    };
  }

  private computeReasons(input: {
    overall: "healthy" | "degraded" | "unhealthy";
    clockDriftMs: number;
    storageState: "ok" | "warning" | "error";
    cameraState: "ok" | "warning" | "error";
    uploadQueueState: "ok" | "warning" | "error";
    encryptionEnabled: boolean;
    firmwareState: "ok" | "warning" | "error";
  }) {
    if (input.overall === "healthy") {
      return [];
    }

    const reasons: string[] = [];
    if (input.clockDriftMs > 10_000) {
      reasons.push("Recorder clock drift exceeds tolerance.");
    }
    if (input.storageState !== "ok") {
      reasons.push("Recorder storage is below safe operating capacity.");
    }
    if (input.cameraState !== "ok") {
      reasons.push("One or more recorder camera channels are unavailable.");
    }
    if (input.uploadQueueState !== "ok") {
      reasons.push("Upload queue is not draining normally.");
    }
    if (!input.encryptionEnabled) {
      reasons.push("Recorder encryption is disabled.");
    }
    if (input.firmwareState !== "ok") {
      reasons.push("Recorder firmware is outdated or unknown.");
    }
    return reasons;
  }

  private requireRecorder(recorderId: string) {
    const stored = this.recorderRegistry.get(recorderId);
    if (!stored) {
      throw new ApiRequestError(
        404,
        "RECORDER_NOT_FOUND",
        `Recorder ${recorderId} is not registered.`,
      );
    }
    return stored;
  }

  private cloneRegistration(
    registration: RecorderRegistrationRecord,
  ): RecorderRegistrationRecord {
    return { ...registration };
  }

  private cloneHealth(health: RecorderHealthReport): RecorderHealthReport {
    return {
      ...health,
      deviceId: { ...health.deviceId },
      clockSync: { ...health.clockSync },
      storage: { ...health.storage },
      camera: { ...health.camera },
      lastSegment: { ...health.lastSegment },
      encryption: { ...health.encryption },
      uploadQueue: { ...health.uploadQueue },
      firmware: { ...health.firmware },
      reasons: [...health.reasons],
    };
  }

  private cloneSegment(entry: SegmentIndexEntry): SegmentIndexEntry {
    return { ...entry };
  }

  private cloneBookmark(record: EventBookmarkRecord): EventBookmarkRecord {
    return { ...record };
  }

  private cloneManifestVerification(
    verification: EvidenceManifestVerificationRecord,
  ): EvidenceManifestVerificationRecord {
    return {
      ...verification,
      verifiedArtifactIds: [...verification.verifiedArtifactIds],
      failedArtifactIds: [...verification.failedArtifactIds],
      missingSignatureArtifactIds: [
        ...verification.missingSignatureArtifactIds,
      ],
      artifactResults: verification.artifactResults.map((result) => ({
        ...result,
      })),
    };
  }

  private cloneEvidenceArtifact(
    artifact: VehicleEvidenceArtifactRecord,
  ): VehicleEvidenceArtifactRecord {
    return {
      ...artifact,
      source: { ...artifact.source },
    };
  }

  private cloneEvidenceFreeze(
    freeze: StoredEvidenceFreeze,
  ): EvidenceFreezeRecord {
    return {
      ...freeze,
      providerSignatureRefs: [...freeze.providerSignatureRefs],
      sourceSystems: [...freeze.sourceSystems],
      verification: freeze.verification
        ? this.cloneManifestVerification(freeze.verification)
        : null,
      transitionHistory: freeze.transitionHistory.map((transition) => ({
        ...transition,
      })),
      artifacts: freeze.artifacts.map((artifact) =>
        this.cloneEvidenceArtifact(artifact),
      ),
    };
  }

  private cloneEvidenceExport(
    record: ControlledEvidenceExportRecord,
  ): ControlledEvidenceExportRecord {
    return {
      ...record,
      download: { ...record.download },
    };
  }

  private cloneAccessLog(
    log: VehicleEvidenceAccessLogEntry,
  ): VehicleEvidenceAccessLogEntry {
    return {
      ...log,
      metadata: { ...log.metadata },
    };
  }
}
