import { Injectable, Logger } from "@nestjs/common";

import type { SafetyOperatorAssignment } from "@drts/contracts";

/**
 * SafetyOperatorService — Phase 2 scaffold.
 *
 * Scaffold-only: registers the safety-operator assignment surface (assign /
 * engage / release a safety operator to an AV vehicle/order) for the
 * phase2-tesla-fsd-sandbox-202606 phase. Concrete lifecycle logic and
 * persistence against av_sandbox.safety_operator_assignments (V0037) land in
 * downstream waves.
 */
@Injectable()
export class SafetyOperatorService {
  private readonly logger = new Logger(SafetyOperatorService.name);

  private assignments: SafetyOperatorAssignment[] = [];
}
