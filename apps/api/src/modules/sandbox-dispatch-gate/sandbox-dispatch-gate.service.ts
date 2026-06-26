import { randomUUID } from "node:crypto";

import {
  Inject,
  Injectable,
  Logger,
  Optional,
  forwardRef,
} from "@nestjs/common";

import type { SandboxDispatchDecision } from "@drts/contracts";

import { RocOperationsService } from "../roc-operations/roc-operations.service";
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
    @Optional()
    @Inject(forwardRef(() => RocOperationsService))
    private readonly rocOperationsService?: RocOperationsService,
  ) {}

  evaluateDispatch(input: SandboxDispatchGateInput): SandboxDispatchDecision {
    const recorderSignal = this.vehicleEvidenceService?.getNoNewDispatchSignal(
      input.vehicleId,
    );
    const rocRestrictions = this.rocOperationsService?.getDispatchRestrictions(
      input.vehicleId,
    );
    const hardReasonCodes = [
      ...(recorderSignal?.active ? (["RECORDER_UNHEALTHY"] as const) : []),
      ...(rocRestrictions?.reasonCodes ?? []),
    ];

    const decision: SandboxDispatchDecision = hardReasonCodes.length > 0
      ? {
          decisionId: randomUUID(),
          orderId: input.orderId,
          dispatchJobId: input.dispatchJobId ?? null,
          vehicleId: input.vehicleId,
          sandboxProgramId: input.sandboxProgramId,
          decision: "block",
          oddInBounds: true,
          hardReasonCodes,
          softReasonCodes: [],
          fallbackRequired: true,
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
          fallbackRequired: false,
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

  async findDecisionForOrder(orderId: string, decisionId?: string | null) {
    const normalizedOrderId = orderId.trim();
    const normalizedDecisionId = decisionId?.trim() ?? null;
    if (!normalizedOrderId) {
      return null;
    }

    if (
      this.lastDecision?.orderId === normalizedOrderId &&
      (!normalizedDecisionId ||
        this.lastDecision.decisionId === normalizedDecisionId)
    ) {
      return {
        ...this.lastDecision,
        hardReasonCodes: [...this.lastDecision.hardReasonCodes],
        softReasonCodes: [...this.lastDecision.softReasonCodes],
      };
    }

    return null;
  }
}
