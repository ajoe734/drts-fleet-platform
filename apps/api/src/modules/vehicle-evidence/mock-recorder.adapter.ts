import { createHash } from "node:crypto";

import type { EvidenceManifestItem } from "@drts/contracts";

import type {
  EvidenceCaptureRequest,
  EvidenceRecorderAdapter,
} from "./vehicle-evidence.ports";

function buildChecksum(input: string) {
  return createHash("sha256").update(input).digest("hex");
}

export class MockEvidenceRecorderAdapter implements EvidenceRecorderAdapter {
  async captureWindow(
    request: EvidenceCaptureRequest,
  ): Promise<EvidenceManifestItem[]> {
    const manifestId = `manifest-${request.vehicleId}-${request.windowStart}`;
    const capturedAt = request.windowEnd;
    const source = {
      sourceSystem: "onboard_recorder" as const,
      sourceRef: `${request.vehicleId}:${request.windowStart}:${request.windowEnd}`,
      ingestedAt: new Date().toISOString(),
      recordedAt: capturedAt,
      signatureRef: `sig-${request.vehicleId}`,
      schemaVersion: "mock-recorder-v1",
    };

    return [
      {
        artifactId: `${manifestId}-video`,
        manifestId,
        artifactType: "video_clip",
        objectKey: `${request.vehicleId}/segments/${manifestId}-video.mp4`,
        contentType: "video/mp4",
        byteSize: 8_388_608,
        checksumSha256: buildChecksum(`${manifestId}-video`),
        capturedAt,
        custodyState: "captured",
        vehicleId: request.vehicleId,
        caseId: request.caseId ?? null,
        retentionUntil: null,
        source,
      },
      {
        artifactId: `${manifestId}-telemetry`,
        manifestId,
        artifactType: "telemetry_export",
        objectKey: `${request.vehicleId}/segments/${manifestId}-telemetry.json`,
        contentType: "application/json",
        byteSize: 262_144,
        checksumSha256: buildChecksum(`${manifestId}-telemetry`),
        capturedAt,
        custodyState: "captured",
        vehicleId: request.vehicleId,
        caseId: request.caseId ?? null,
        retentionUntil: null,
        source,
      },
    ];
  }

  async verifyChecksum(_artifactId: string): Promise<boolean> {
    return true;
  }
}
