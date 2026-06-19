import { Injectable } from "@nestjs/common";

import type {
  RuntimeEligibilityDecisionRecord,
  SupplyReadinessRecord,
} from "@drts/contracts";

@Injectable()
export class RuntimeEligibilityEvaluator {
  evaluate(
    _driverReadiness: SupplyReadinessRecord | null,
    _vehicleReadiness: SupplyReadinessRecord | null,
  ): RuntimeEligibilityDecisionRecord | null {
    return null;
  }
}
