import { Injectable, Logger } from "@nestjs/common";

import type { SandboxDispatchDecision } from "@drts/contracts";

/**
 * SandboxDispatchGateService — Phase 2 scaffold.
 *
 * Scaffold-only: registers the AV sandbox dispatch-gate surface that decides
 * whether an AV vehicle may take a sandbox order (ODD bounds, provider
 * capability, safety-operator requirement) for the
 * phase2-tesla-fsd-sandbox-202606 phase. Concrete decisioning and persistence
 * against av_sandbox.sandbox_dispatch_decisions (V0037) land in downstream
 * waves.
 */
@Injectable()
export class SandboxDispatchGateService {
  private readonly logger = new Logger(SandboxDispatchGateService.name);

  // Most-recent decision cache keyed by orderId, populated downstream.
  private lastDecision: SandboxDispatchDecision | null = null;
}
