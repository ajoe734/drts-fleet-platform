import { Injectable, Logger } from "@nestjs/common";

import type { ProviderCapabilityRequirement } from "@drts/contracts";

/**
 * SandboxGovernanceService — Phase 2 scaffold.
 *
 * Scaffold-only: registers the AV sandbox-program governance surface (provider
 * capability requirements, program activation/suspension) for the
 * phase2-tesla-fsd-sandbox-202606 phase. Concrete policy evaluation and
 * persistence against av_sandbox.provider_capability_requirements (V0037) land
 * in downstream waves.
 */
@Injectable()
export class SandboxGovernanceService {
  private readonly logger = new Logger(SandboxGovernanceService.name);

  // Required capability set per sandbox program, checked by the dispatch gate.
  private requirements: ProviderCapabilityRequirement[] = [];
}
