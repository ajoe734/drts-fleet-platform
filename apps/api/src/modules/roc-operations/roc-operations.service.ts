import { Injectable, Logger } from "@nestjs/common";

import type { RocIntervention } from "@drts/contracts";

/**
 * RocOperationsService — Phase 2 scaffold.
 *
 * Scaffold-only: registers the Remote Operations Center surface (remote assist,
 * minimal-risk stop, reroute, ODD recovery interventions and live-board feed)
 * for the phase2-tesla-fsd-sandbox-202606 phase. Concrete intervention logic
 * and persistence against av_sandbox.roc_interventions (V0037) land in
 * downstream waves.
 */
@Injectable()
export class RocOperationsService {
  private readonly logger = new Logger(RocOperationsService.name);

  private interventions: RocIntervention[] = [];
}
