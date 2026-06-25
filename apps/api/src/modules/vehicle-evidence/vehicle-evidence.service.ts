import { Injectable, Logger } from "@nestjs/common";

import type { EvidenceRecorderAdapter } from "./vehicle-evidence.ports";

/**
 * VehicleEvidenceService — Phase 2 scaffold.
 *
 * Scaffold-only: registers the on-board evidence custody surface (manifest
 * capture, checksum verification, sealing/retention) for the
 * phase2-tesla-fsd-sandbox-202606 phase. The concrete EvidenceRecorderAdapter
 * and persistence against av_evidence.evidence_manifests /
 * av_evidence.evidence_manifest_items (V0037) land in downstream waves.
 */
@Injectable()
export class VehicleEvidenceService {
  private readonly logger = new Logger(VehicleEvidenceService.name);

  private recorderAdapter: EvidenceRecorderAdapter | null = null;
}
