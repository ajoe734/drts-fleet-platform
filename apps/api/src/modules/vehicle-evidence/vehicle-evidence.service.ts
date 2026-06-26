import { randomUUID } from "node:crypto";

import { Injectable, Logger } from "@nestjs/common";
import type { EvidenceArtifactType, EvidenceManifestItem } from "@drts/contracts";

import { ApiRequestError } from "../../common/api-envelope";
import { MockEvidenceRecorderAdapter } from "./mock-recorder.adapter";
import type {
  BookmarkQuery,
  EventBookmarkCommand,
  EventBookmarkRecord,
  EvidenceCaptureRequest,
  EvidenceRecorderAdapter,
  NoNewDispatchSignal,
  RecorderHealthReport,
  RecorderRegistrationInput,
  RecorderRegistrationRecord,
  RetryUploadResult,
  SegmentIndexEntry,
  SegmentIndexQuery,
  SegmentUploadStatus,
} from "./vehicle-evidence.ports";

type StoredRecorder = {
  registration: RecorderRegistrationRecord;
  adapter: EvidenceRecorderAdapter;
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
  private readonly artifactCatalog = new Map<string, EvidenceManifestItem>();
  private readonly bookmarks = new Map<string, EventBookmarkRecord>();

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

  listManifestItems(manifestId: string) {
    return [...this.artifactCatalog.values()]
      .filter((item) => item.manifestId === manifestId)
      .map((item) => this.cloneArtifact(item))
      .sort((left, right) =>
        left.capturedAt < right.capturedAt ? -1 : 1,
      );
  }

  getArtifact(artifactId: string) {
    const artifact = this.artifactCatalog.get(artifactId);
    if (!artifact) {
      throw new ApiRequestError(
        404,
        "EVIDENCE_ARTIFACT_NOT_FOUND",
        `Artifact ${artifactId} is not indexed.`,
      );
    }
    return this.cloneArtifact(artifact);
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
    const nextStatus: SegmentUploadStatus =
      segment.uploadStatus === "uploaded" ? "uploaded" : "uploaded";
    const updated: SegmentIndexEntry = {
      ...segment,
      uploadStatus: nextStatus,
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

    this.seedSegment(recorderId, vehicleId, "mock-manifest-001", "mock-artifact-001", "video_clip", {
      startedAt: "2026-06-25T10:00:00.000Z",
      endedAt: "2026-06-25T10:05:00.000Z",
      eventId: "fsd-disengagement-001",
      eventType: "fsd_disengagement",
      uploadStatus: "failed",
    });
    this.seedSegment(recorderId, vehicleId, "mock-manifest-002", "mock-artifact-002", "telemetry_export", {
      startedAt: "2026-06-25T10:05:00.000Z",
      endedAt: "2026-06-25T10:06:00.000Z",
      eventId: "remote-assist-002",
      eventType: "remote_assist_requested",
      uploadStatus: "uploaded",
    });

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
    this.artifactCatalog.set(artifactId, {
      artifactId,
      manifestId,
      artifactType,
      objectKey: `${vehicleId}/segments/${artifactId}`,
      contentType:
        artifactType === "video_clip" ? "video/mp4" : "application/json",
      byteSize: artifactType === "video_clip" ? 8_388_608 : 262_144,
      checksumSha256: `seeded-${artifactId}`,
      capturedAt: options.endedAt,
      custodyState: "captured",
      vehicleId,
      caseId: options.caseId ?? null,
      retentionUntil: null,
      source: {
        sourceSystem: "onboard_recorder",
        sourceRef: artifactId,
        ingestedAt: options.endedAt,
        recordedAt: options.endedAt,
        signatureRef: null,
        schemaVersion: "seeded-mock-recorder-v1",
      },
    });
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
    this.artifactCatalog.set(item.artifactId, {
      ...item,
      source: { ...item.source },
      caseId: options.caseId ?? item.caseId ?? null,
    });
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

  private cloneArtifact(item: EvidenceManifestItem): EvidenceManifestItem {
    return {
      ...item,
      source: { ...item.source },
    };
  }
}
