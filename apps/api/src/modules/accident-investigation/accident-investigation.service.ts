import { Injectable, Logger } from "@nestjs/common";

import type { AccidentCaseRecord } from "@drts/contracts";

/**
 * AccidentInvestigationService — Phase 2 scaffold.
 *
 * Scaffold-only: registers the accident-investigation case surface (open case,
 * attach evidence manifest, drive case lifecycle to regulator review) for the
 * phase2-tesla-fsd-sandbox-202606 phase. Concrete case logic and persistence
 * against av_evidence.accident_cases (V0037) land in downstream waves.
 */
@Injectable()
export class AccidentInvestigationService {
  private readonly logger = new Logger(AccidentInvestigationService.name);

  private cases: AccidentCaseRecord[] = [];
}
