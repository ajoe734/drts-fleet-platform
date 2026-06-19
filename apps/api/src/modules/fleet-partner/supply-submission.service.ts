import { Injectable } from "@nestjs/common";

import type {
  DriverSupplyDraft,
  SupplySubmissionRecord,
  VehicleSupplyDraft,
} from "@drts/contracts";

@Injectable()
export class SupplySubmissionService {
  createDriverDraft(_fleetPartnerId: string, _draft: DriverSupplyDraft): never {
    throw new Error("Supply submission scaffolding is not implemented yet.");
  }

  createVehicleDraft(
    _fleetPartnerId: string,
    _draft: VehicleSupplyDraft,
  ): never {
    throw new Error("Supply submission scaffolding is not implemented yet.");
  }

  getSubmission(_submissionId: string): SupplySubmissionRecord | null {
    return null;
  }
}
