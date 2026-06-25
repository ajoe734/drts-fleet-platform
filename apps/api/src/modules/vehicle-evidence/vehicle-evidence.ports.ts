import type { EvidenceManifestItem } from "@drts/contracts";

// Phase 2 scaffold: on-board evidence recorder adapter port.
//
// Interface-only. A concrete EvidenceRecorderAdapter (vehicle recorder client /
// signed-clip uploader) is wired by a downstream Phase 2 execution wave. Each
// captured artifact carries an integrity checksum for chain-of-custody.

export interface EvidenceCaptureRequest {
  vehicleId: string;
  windowStart: string;
  windowEnd: string;
  caseId?: string | null;
}

export interface EvidenceRecorderAdapter {
  captureWindow(request: EvidenceCaptureRequest): Promise<EvidenceManifestItem[]>;
  verifyChecksum(artifactId: string): Promise<boolean>;
}
