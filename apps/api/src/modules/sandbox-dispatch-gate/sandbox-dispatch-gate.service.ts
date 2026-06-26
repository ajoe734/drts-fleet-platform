import { randomUUID } from "node:crypto";

import { Injectable, Logger, Optional } from "@nestjs/common";

import type { SandboxDispatchDecision } from "@drts/contracts";

import { VehicleEvidenceService } from "../vehicle-evidence/vehicle-evidence.service";

export interface SandboxDispatchGateInput {
  orderId: string;
  vehicleId: string;
  sandboxProgramId: string;
  policyVersion: string;
  dispatchJobId?: string | null;
}

@Injectable()
export class SandboxDispatchGateService {
  private readonly logger = new Logger(SandboxDispatchGateService.name);

  private lastDecision: SandboxDispatchDecision | null = null;

  constructor(
    @Optional()
    private readonly vehicleEvidenceService?: VehicleEvidenceService,
  ) {}

  evaluateDispatch(input: SandboxDispatchGateInput): SandboxDispatchDecision {
    const recorderSignal = this.vehicleEvidenceService?.getNoNewDispatchSignal(
      input.vehicleId,
    );

    const decision: SandboxDispatchDecision = recorderSignal?.active
      ? {
          decisionId: randomUUID(),
          orderId: input.orderId,
          dispatchJobId: input.dispatchJobId ?? null,
          vehicleId: input.vehicleId,
          sandboxProgramId: input.sandboxProgramId,
          decision: "block",
          oddInBounds: true,
          hardReasonCodes: ["RECORDER_UNHEALTHY"],
          softReasonCodes: [],
          requiredSafetyOperatorId: null,
          policyVersion: input.policyVersion,
          evaluatedAt: new Date().toISOString(),
        }
      : {
          decisionId: randomUUID(),
          orderId: input.orderId,
          dispatchJobId: input.dispatchJobId ?? null,
          vehicleId: input.vehicleId,
          sandboxProgramId: input.sandboxProgramId,
          decision: "allow",
          oddInBounds: true,
          hardReasonCodes: [],
          softReasonCodes: [],
          requiredSafetyOperatorId: null,
          policyVersion: input.policyVersion,
          evaluatedAt: new Date().toISOString(),
        };

    this.lastDecision = decision;
    this.logger.debug(
      `Dispatch gate evaluated ${input.orderId} for ${input.vehicleId}: ${decision.decision}`,
    );
    return {
      ...decision,
      hardReasonCodes: [...decision.hardReasonCodes],
      softReasonCodes: [...decision.softReasonCodes],
    };
  }

  getLastDecision() {
    return this.lastDecision
      ? {
          ...this.lastDecision,
          hardReasonCodes: [...this.lastDecision.hardReasonCodes],
          softReasonCodes: [...this.lastDecision.softReasonCodes],
        }
      : null;
  }
}
