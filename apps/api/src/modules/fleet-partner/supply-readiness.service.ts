import { Injectable } from "@nestjs/common";

import type { SupplyReadinessRecord } from "@drts/contracts";

@Injectable()
export class SupplyReadinessService {
  recomputeForDriver(_driverId: string): never {
    throw new Error("Supply readiness scaffolding is not implemented yet.");
  }

  recomputeForVehicle(_vehicleId: string): never {
    throw new Error("Supply readiness scaffolding is not implemented yet.");
  }

  getReadiness(_subjectId: string): SupplyReadinessRecord | null {
    return null;
  }
}
