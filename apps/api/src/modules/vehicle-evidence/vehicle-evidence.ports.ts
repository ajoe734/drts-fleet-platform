import type {
  EvidenceArtifactType,
  EvidenceCustodyState,
  EvidenceGovernancePrecedence,
  EvidenceManifestItem,
  IdentityContext,
} from "@drts/contracts";

import type { ControlledDownloadMetadata } from "../../common/controlled-download";

export type RecorderHealthState = "ok" | "warning" | "error";
export type RecorderOverallHealth = "healthy" | "degraded" | "unhealthy";
export type SegmentUploadStatus = "pending" | "retrying" | "uploaded" | "failed";

export type EvidenceFreezeState =
  | "requested"
  | "collecting"
  | "sealed"
  | "partial"
  | "failed";

export type VehicleEvidenceAccessAction =
  | "freeze_request"
  | "read"
  | "verify"
  | "export"
  | "signed_url"
  | "purge"
  | "preserve"
  | "purge_skip";

export type VehicleEvidenceStepUpMethod = "webauthn" | "totp" | "sms_otp";

export interface EvidenceCaptureRequest {
  vehicleId: string;
  windowStart: string;
  windowEnd: string;
  caseId?: string | null;
}

export interface EvidenceFreezeCommand extends EvidenceCaptureRequest {
  caseReference?: string | null;
  reason: string;
  requestedBy?: string | null;
  supersedesFreezeId?: string | null;
}

export interface EvidenceFreezeTransitionRecord {
  from: EvidenceFreezeState | null;
  to: EvidenceFreezeState;
  at: string;
  reason: string;
  errorCode: string | null;
}

export interface EvidenceManifestVerificationArtifactRecord {
  artifactId: string;
  checksumSha256: string;
  leafHash: string;
  checksumVerified: boolean;
  signaturePresent: boolean;
}

export interface EvidenceManifestVerificationRecord {
  verifiedAt: string;
  hashAlgorithm: "sha256-merkle-v1";
  manifestHash: string;
  leafCount: number;
  valid: boolean;
  verifiedArtifactIds: string[];
  failedArtifactIds: string[];
  missingSignatureArtifactIds: string[];
  artifactResults: EvidenceManifestVerificationArtifactRecord[];
}

export interface VehicleEvidenceArtifactRecord
  extends Omit<EvidenceManifestItem, "custodyState"> {
  freezeId: string;
  manifestCustodyState: EvidenceCustodyState;
  currentCustodyState: EvidenceCustodyState;
  checksumVerified: boolean;
  signaturePresent: boolean;
  leafHash: string;
  objectLockEnabled: boolean;
  objectLockRetainedUntil: string | null;
  localPreservedAt: string | null;
  localPreservationChecksumVerifiedAt: string | null;
  purgedAt: string | null;
}

export interface EvidenceFreezeRecord {
  freezeId: string;
  recorderId: string;
  vehicleId: string;
  caseId: string | null;
  caseReference: string;
  requestedReason: string;
  requestedBy: string | null;
  requestedAt: string;
  sealedAt: string | null;
  status: EvidenceFreezeState;
  manifestId: string | null;
  manifestHash: string | null;
  hashAlgorithm: "sha256-merkle-v1" | null;
  providerSignatureRefs: string[];
  sourceSystems: string[];
  objectLockEnabled: boolean;
  objectLockRetainedUntil: string | null;
  immutable: boolean;
  supersedesFreezeId: string | null;
  verification: EvidenceManifestVerificationRecord | null;
  transitionHistory: EvidenceFreezeTransitionRecord[];
  artifacts: VehicleEvidenceArtifactRecord[];
  exportCount: number;
  failureCode: string | null;
  failureReason: string | null;
}

export interface ControlledEvidenceExportCommand {
  reason: string;
  caseReference?: string | null;
  watermarkText?: string | null;
  stepUpMethod: VehicleEvidenceStepUpMethod;
  stepUpVerifiedAt: string;
  stepUpSessionId: string;
}

export interface ControlledEvidenceExportRecord {
  exportId: string;
  freezeId: string;
  manifestHash: string;
  caseReference: string;
  reason: string;
  watermarkText: string;
  requestedAt: string;
  requestedByActorId: string;
  requestedByActorType: IdentityContext["actorType"];
  stepUpMethod: VehicleEvidenceStepUpMethod;
  stepUpVerifiedAt: string;
  stepUpSessionId: string;
  download: ControlledDownloadMetadata;
}

export interface EvidencePurgeCommand {
  reason: string;
  overrideObjectLock: boolean;
}

export interface EvidencePurgeResult {
  artifactId: string;
  freezeId: string;
  purgedAt: string;
  purgedByActorId: string;
  purgedByActorType: IdentityContext["actorType"];
  reason: string;
  objectLockBypassed: boolean;
}

export interface EvidenceDeletionSchedulerCommand {
  artifactId: string;
  currentTime?: string;
  providerNearExpiryWindowMinutes?: number;
}

export type EvidenceDeletionSchedulerDecision =
  | "purged"
  | "preserved_for_provider_expiry"
  | "skipped_due_to_hold"
  | "skipped_due_to_exception"
  | "deferred_by_retention";

export interface EvidenceDeletionSchedulerResult {
  artifactId: string;
  freezeId: string;
  decision: EvidenceDeletionSchedulerDecision;
  emittedEvent: string;
  effectivePrecedence: EvidenceGovernancePrecedence;
  holdIds: string[];
  exceptionIds: string[];
  conflictExceptionId: string | null;
  checksumVerified: boolean | null;
  preservedLocallyAt: string | null;
  purgedAt: string | null;
}

export interface VehicleEvidenceAccessLogEntry {
  accessId: string;
  freezeId: string;
  artifactId: string | null;
  exportId: string | null;
  manifestHash: string | null;
  action: VehicleEvidenceAccessAction;
  actorId: string | null;
  actorType: IdentityContext["actorType"] | null;
  requestId: string | null;
  caseReference: string | null;
  reason: string | null;
  stepUpMethod: VehicleEvidenceStepUpMethod | null;
  stepUpVerifiedAt: string | null;
  signedUrlExpiresAt: string | null;
  createdAt: string;
  metadata: Record<string, unknown>;
}

export interface EvidenceFreezeQuery {
  recorderId?: string;
  vehicleId?: string;
  caseId?: string;
  status?: EvidenceFreezeState;
}

export interface EvidenceAccessLogQuery {
  freezeId?: string;
  action?: VehicleEvidenceAccessAction;
}

export interface RecorderRegistrationInput {
  recorderId: string;
  vehicleId: string;
  vendorCode: string;
  deviceId: string;
  firmwareVersion: string;
  requiredForDispatch?: boolean;
  encryptionEnabled?: boolean;
  totalStorageBytes?: number;
  availableStorageBytes?: number;
}

export interface RecorderRegistrationRecord {
  recorderId: string;
  vehicleId: string;
  vendorCode: string;
  deviceId: string;
  firmwareVersion: string;
  requiredForDispatch: boolean;
  encryptionEnabled: boolean;
  totalStorageBytes: number;
  availableStorageBytes: number;
  registeredAt: string;
}

export interface RecorderHealthReport {
  recorderId: string;
  vehicleId: string;
  observedAt: string;
  overall: RecorderOverallHealth;
  requiredForDispatch: boolean;
  deviceId: {
    state: RecorderHealthState;
    value: string | null;
  };
  clockSync: {
    state: RecorderHealthState;
    driftMs: number;
  };
  storage: {
    state: RecorderHealthState;
    availableBytes: number;
    totalBytes: number;
  };
  camera: {
    state: RecorderHealthState;
    activeChannels: number;
    expectedChannels: number;
  };
  lastSegment: {
    state: RecorderHealthState;
    segmentId: string | null;
    capturedAt: string | null;
  };
  encryption: {
    state: RecorderHealthState;
    enabled: boolean;
    algorithm: string | null;
  };
  uploadQueue: {
    state: RecorderHealthState;
    pendingCount: number;
    oldestQueuedAt: string | null;
  };
  firmware: {
    state: RecorderHealthState;
    version: string | null;
  };
  reasons: string[];
  noNewDispatch: boolean;
}

export interface SegmentIndexEntry {
  segmentId: string;
  recorderId: string;
  vehicleId: string;
  manifestId: string;
  artifactId: string;
  artifactType: EvidenceArtifactType;
  caseId: string | null;
  startedAt: string;
  endedAt: string;
  eventId: string | null;
  eventType: string | null;
  uploadStatus: SegmentUploadStatus;
  retryCount: number;
  bookmarked: boolean;
  lastRetryAt: string | null;
}

export interface EventBookmarkRecord {
  bookmarkId: string;
  recorderId: string;
  vehicleId: string;
  segmentId: string;
  eventId: string;
  eventType: string;
  note: string | null;
  bookmarkedAt: string;
}

export interface EventBookmarkCommand {
  recorderId: string;
  segmentId: string;
  eventId: string;
  eventType: string;
  note?: string | null;
}

export interface SegmentIndexQuery {
  recorderId?: string;
  vehicleId?: string;
  caseId?: string;
  eventType?: string;
  uploadStatus?: SegmentUploadStatus;
  bookmarkedOnly?: boolean;
}

export interface BookmarkQuery {
  recorderId?: string;
  vehicleId?: string;
  eventType?: string;
  eventId?: string;
}

export interface RetryUploadResult {
  artifactId: string;
  segmentId: string;
  uploadStatus: SegmentUploadStatus;
  retryCount: number;
  retriedAt: string;
}

export interface NoNewDispatchSignal {
  vehicleId: string;
  recorderId: string;
  active: boolean;
  reasonCode: "RECORDER_UNHEALTHY";
  observedAt: string;
  reasons: string[];
}

export interface EvidenceRecorderAdapter {
  captureWindow(request: EvidenceCaptureRequest): Promise<EvidenceManifestItem[]>;
  verifyChecksum(artifactId: string): Promise<boolean>;
}
