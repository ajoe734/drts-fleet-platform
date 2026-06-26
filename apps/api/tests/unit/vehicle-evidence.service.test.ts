import { createHash } from "node:crypto";

import { describe, expect, it } from "vitest";

import type { EvidenceManifestItem } from "@drts/contracts";

import { buildMockRecorderFixture } from "../../../../packages/shared-test-fixtures/src";

import { ApiRequestError } from "../../src/common/api-envelope";
import { AuditNotificationService } from "../../src/modules/audit-notification/audit-notification.service";
import type { EvidenceRecorderAdapter } from "../../src/modules/vehicle-evidence/vehicle-evidence.ports";
import { VehicleEvidenceService } from "../../src/modules/vehicle-evidence/vehicle-evidence.service";

const OPS_IDENTITY = {
  actorId: "ops-user-001",
  actorType: "ops_user" as const,
  realm: "ops" as const,
  scopes: ["audit:read"],
  tenantId: null,
};

const PLATFORM_IDENTITY = {
  actorId: "platform-admin-001",
  actorType: "platform_admin" as const,
  realm: "platform" as const,
  scopes: ["audit:read"],
  tenantId: null,
};

function buildChecksum(input: string) {
  return createHash("sha256").update(input).digest("hex");
}

class PartialEvidenceRecorderAdapter implements EvidenceRecorderAdapter {
  async captureWindow(): Promise<EvidenceManifestItem[]> {
    const sourceBase = {
      sourceSystem: "onboard_recorder" as const,
      ingestedAt: "2026-06-26T15:00:00.000Z",
      recordedAt: "2026-06-26T14:59:59.000Z",
      schemaVersion: "partial-recorder-v1",
    };

    return [
      {
        artifactId: "artifact-good-001",
        manifestId: "manifest-partial-001",
        artifactType: "video_clip",
        objectKey: "veh-partial-001/video.mp4",
        contentType: "video/mp4",
        byteSize: 1024,
        checksumSha256: buildChecksum("artifact-good-001"),
        capturedAt: "2026-06-26T15:00:00.000Z",
        custodyState: "captured",
        vehicleId: "veh-partial-001",
        caseId: "case-partial-001",
        retentionUntil: null,
        source: {
          ...sourceBase,
          sourceRef: "good-001",
          signatureRef: "sig-good-001",
        },
      },
      {
        artifactId: "artifact-bad-001",
        manifestId: "manifest-partial-001",
        artifactType: "telemetry_export",
        objectKey: "veh-partial-001/telemetry.json",
        contentType: "application/json",
        byteSize: 512,
        checksumSha256: buildChecksum("artifact-bad-001"),
        capturedAt: "2026-06-26T15:00:00.000Z",
        custodyState: "captured",
        vehicleId: "veh-partial-001",
        caseId: "case-partial-001",
        retentionUntil: null,
        source: {
          ...sourceBase,
          sourceRef: "bad-001",
          signatureRef: null,
        },
      },
    ];
  }

  async verifyChecksum(artifactId: string): Promise<boolean> {
    return artifactId !== "artifact-bad-001";
  }
}

function getErrorCode(error: unknown) {
  if (!(error instanceof ApiRequestError)) {
    throw error;
  }
  const response = error.getResponse() as { error: { code: string } };
  return response.error.code;
}

describe("VehicleEvidenceService", () => {
  it("registers a mock recorder and exposes seeded health + segment index", () => {
    const service = new VehicleEvidenceService();
    const recorder = buildMockRecorderFixture();

    const registration = service.registerRecorder(recorder);
    const health = service.getRecorderHealth(recorder.recorderId);
    const segments = service.listSegmentIndex({ vehicleId: recorder.vehicleId });

    expect(registration.vendorCode).toBe("mock_recorder");
    expect(health.uploadQueue.pendingCount).toBe(1);
    expect(health.overall).toBe("degraded");
    expect(segments).toHaveLength(2);
    expect(segments[0]?.vehicleId).toBe(recorder.vehicleId);
  });

  it("creates bookmarks, filters query results, and retries failed uploads", () => {
    const service = new VehicleEvidenceService();
    const recorder = buildMockRecorderFixture({ recorderId: "rec-mock-002" });
    service.registerRecorder(recorder);

    const failedSegment = service.listSegmentIndex({
      recorderId: recorder.recorderId,
      uploadStatus: "failed",
    })[0];
    expect(failedSegment).toBeDefined();

    const bookmark = service.bookmarkEvent({
      recorderId: recorder.recorderId,
      segmentId: failedSegment!.segmentId,
      eventId: failedSegment!.eventId ?? "evt-fallback-001",
      eventType: failedSegment!.eventType ?? "fsd_disengagement",
      note: "Escalate for investigation.",
    });
    const bookmarks = service.listBookmarks({ vehicleId: recorder.vehicleId });
    const retried = service.retryUpload(failedSegment!.artifactId);

    expect(bookmark.segmentId).toBe(failedSegment!.segmentId);
    expect(bookmarks).toHaveLength(1);
    expect(retried.uploadStatus).toBe("uploaded");
    expect(retried.retryCount).toBe(1);
  });

  it("emits a no-new-dispatch signal when a required recorder is unhealthy", () => {
    const service = new VehicleEvidenceService();
    const recorder = buildMockRecorderFixture({ recorderId: "rec-mock-003" });
    service.registerRecorder(recorder);

    service.updateRecorderHealth(recorder.recorderId, {
      overall: "unhealthy",
      clockDriftMs: 20_000,
      storageState: "error",
      uploadQueueState: "error",
      uploadPendingCount: 3,
      encryptionEnabled: false,
      encryptionState: "error",
      firmwareState: "error",
    });

    const signal = service.getNoNewDispatchSignal(recorder.vehicleId);
    expect(signal).toEqual(
      expect.objectContaining({
        active: true,
        vehicleId: recorder.vehicleId,
        reasonCode: "RECORDER_UNHEALTHY",
      }),
    );
  });

  it("seals freezes, verifies manifest hashes, and issues controlled exports", async () => {
    const auditNotificationService = new AuditNotificationService();
    const service = new VehicleEvidenceService(auditNotificationService);
    const recorder = buildMockRecorderFixture({ recorderId: "rec-freeze-001" });
    service.registerRecorder(recorder);

    const freeze = await service.requestEvidenceFreeze(
      recorder.recorderId,
      {
        vehicleId: recorder.vehicleId,
        windowStart: "2026-06-26T14:00:00.000Z",
        windowEnd: "2026-06-26T14:05:00.000Z",
        caseId: "case-evd-001",
        caseReference: "CASE-AV-009",
        reason: "Prepare regulator export.",
      },
      OPS_IDENTITY,
      "req-freeze-001",
    );

    expect(freeze.status).toBe("sealed");
    expect(freeze.transitionHistory.map((transition) => transition.to)).toEqual([
      "requested",
      "collecting",
      "sealed",
    ]);
    expect(freeze.manifestHash).toMatch(/^[0-9a-f]{64}$/);
    expect(freeze.objectLockEnabled).toBe(true);
    expect(freeze.verification?.valid).toBe(true);

    const verification = await service.verifyEvidenceFreeze(
      freeze.freezeId,
      "req-verify-001",
      OPS_IDENTITY,
    );
    expect(verification.manifestHash).toBe(freeze.manifestHash);

    const exportRecord = service.issueControlledExport(
      freeze.freezeId,
      {
        reason: "Hand off sealed evidence bundle.",
        caseReference: "CASE-AV-009",
        stepUpMethod: "webauthn",
        stepUpVerifiedAt: "2026-06-26T14:06:00.000Z",
        stepUpSessionId: "mfa-session-001",
      },
      OPS_IDENTITY,
      "req-export-001",
    );

    expect(exportRecord.download.ttlMinutes).toBeLessThanOrEqual(15);
    expect(exportRecord.download.downloadUrl).toContain(
      "/vehicle-evidence-export/",
    );

    const accessLogs = service.listEvidenceAccessLogs({
      freezeId: freeze.freezeId,
    });
    expect(accessLogs.map((log) => log.action)).toEqual(
      expect.arrayContaining([
        "freeze_request",
        "verify",
        "export",
        "signed_url",
      ]),
    );
    expect(auditNotificationService.getAuditLogsSnapshot()).toEqual(
      expect.arrayContaining([
        expect.objectContaining({
          actionName: "issue_vehicle_evidence_export",
          resourceId: exportRecord.exportId,
        }),
      ]),
    );
  });

  it("marks the freeze partial when checksum verification or provider signatures fail", async () => {
    const auditNotificationService = new AuditNotificationService();
    const service = new VehicleEvidenceService(auditNotificationService);
    const recorder = buildMockRecorderFixture({
      recorderId: "rec-partial-001",
      vehicleId: "veh-partial-001",
      vendorCode: "tesla_partial",
    });
    service.registerRecorder(recorder, new PartialEvidenceRecorderAdapter());

    const freeze = await service.requestEvidenceFreeze(
      recorder.recorderId,
      {
        vehicleId: recorder.vehicleId,
        windowStart: "2026-06-26T14:00:00.000Z",
        windowEnd: "2026-06-26T14:05:00.000Z",
        caseId: "case-partial-001",
        caseReference: "CASE-PARTIAL-001",
        reason: "Verify partial evidence path.",
      },
      OPS_IDENTITY,
      "req-partial-001",
    );

    expect(freeze.status).toBe("partial");
    expect(freeze.failureCode).toBe("EVIDENCE_MANIFEST_PARTIAL");
    expect(freeze.verification?.failedArtifactIds).toContain("artifact-bad-001");
    expect(freeze.verification?.missingSignatureArtifactIds).toContain(
      "artifact-bad-001",
    );
  });

  it("blocks purge while a legal hold is active and requires object-lock override", async () => {
    const auditNotificationService = new AuditNotificationService();
    const service = new VehicleEvidenceService(auditNotificationService);
    const recorder = buildMockRecorderFixture({ recorderId: "rec-purge-001" });
    service.registerRecorder(recorder);

    const freeze = await service.requestEvidenceFreeze(
      recorder.recorderId,
      {
        vehicleId: recorder.vehicleId,
        windowStart: "2026-06-26T14:10:00.000Z",
        windowEnd: "2026-06-26T14:15:00.000Z",
        caseId: "case-purge-001",
        caseReference: "CASE-PURGE-001",
        reason: "Validate purge controls.",
      },
      OPS_IDENTITY,
      "req-purge-freeze-001",
    );
    const artifactId = freeze.artifacts[0]!.artifactId;

    try {
      service.purgeArtifact(
        artifactId,
        {
          reason: "Attempt purge without override.",
          overrideObjectLock: false,
        },
        PLATFORM_IDENTITY,
        "req-purge-001",
      );
      throw new Error("Expected object lock rejection.");
    } catch (error) {
      expect(getErrorCode(error)).toBe("EVIDENCE_OBJECT_LOCKED");
    }

    const hold = auditNotificationService.placeEvidenceLegalHold(
      {
        family: "vehicle_evidence",
        subjectId: freeze.freezeId,
        caseNumber: "CASE-PURGE-001",
        reasonCode: "regulatory_inquiry",
        manifestHash: freeze.manifestHash,
      },
      OPS_IDENTITY,
      "req-hold-001",
    );

    try {
      service.purgeArtifact(
        artifactId,
        {
          reason: "Attempt purge while on hold.",
          overrideObjectLock: true,
        },
        PLATFORM_IDENTITY,
        "req-purge-002",
      );
      throw new Error("Expected legal hold rejection.");
    } catch (error) {
      expect(getErrorCode(error)).toBe("EVIDENCE_DELETION_BLOCKED_BY_HOLD");
    }

    auditNotificationService.releaseEvidenceLegalHold(
      hold.holdId,
      { releaseReason: "Investigation closed." },
      PLATFORM_IDENTITY,
      "req-release-001",
    );
    const purged = service.purgeArtifact(
      artifactId,
      {
        reason: "Approved retention override.",
        overrideObjectLock: true,
      },
      PLATFORM_IDENTITY,
      "req-purge-003",
    );
    const refreshedFreeze = service.getEvidenceFreeze(freeze.freezeId);

    expect(purged.objectLockBypassed).toBe(true);
    expect(
      refreshedFreeze.artifacts.find((artifact) => artifact.artifactId === artifactId)
        ?.currentCustodyState,
    ).toBe("purged");
  });
});
