import type { EvidenceArtifactType, EvidenceManifestItem } from "@drts/contracts";

export type RecorderHealthState = "ok" | "warning" | "error";
export type RecorderOverallHealth = "healthy" | "degraded" | "unhealthy";
export type SegmentUploadStatus = "pending" | "retrying" | "uploaded" | "failed";

export interface EvidenceCaptureRequest {
  vehicleId: string;
  windowStart: string;
  windowEnd: string;
  caseId?: string | null;
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
