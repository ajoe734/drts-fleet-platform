import { describe, expect, it } from "vitest";

import { buildMockRecorderFixture } from "../../../../packages/shared-test-fixtures/src";

import { VehicleEvidenceService } from "../../src/modules/vehicle-evidence/vehicle-evidence.service";

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
});
