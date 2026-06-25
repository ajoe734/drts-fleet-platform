import { Injectable } from "@nestjs/common";

import type {
  CreateSupplySubmissionCommand,
  SupplySubmissionLifecycleCommand,
  UpsertDriverSupplyDraftCommand,
  UpsertVehicleSupplyDraftCommand,
} from "@drts/contracts";

import { SupplyReviewService } from "./supply-review.service";

/**
 * Owns the fleet-partner supply submission lifecycle (draft → submitted → review →
 * approved/rejected) and the driver/vehicle draft payloads.
 *
 * The submission state (in-memory and DB-backed) is held on SupplyReviewService
 * so the platform review path reads a single source of truth; this service is the
 * partner-facing write facade over that state.
 *
 * Source of truth:
 *   docs/02-architecture/phase1_delta_sd_supply_eligibility_mobile_reporting_20260619.md §1.1
 */
@Injectable()
export class SupplySubmissionService {
  constructor(private readonly supplyReviewService: SupplyReviewService) {}

  listSubmissions(fleetPartnerId: string) {
    return this.supplyReviewService.listFleetSubmissions(fleetPartnerId);
  }

  getSubmission(fleetPartnerId: string, submissionId: string) {
    return this.supplyReviewService.getFleetSubmission(
      fleetPartnerId,
      submissionId,
    );
  }

  createSubmission(
    fleetPartnerId: string,
    command: CreateSupplySubmissionCommand,
  ) {
    return this.supplyReviewService.createSubmission(fleetPartnerId, command);
  }

  upsertDriverDraft(
    fleetPartnerId: string,
    submissionId: string,
    command: UpsertDriverSupplyDraftCommand,
  ) {
    return this.supplyReviewService.upsertDriverDraft(
      fleetPartnerId,
      submissionId,
      command,
    );
  }

  upsertVehicleDraft(
    fleetPartnerId: string,
    submissionId: string,
    command: UpsertVehicleSupplyDraftCommand,
  ) {
    return this.supplyReviewService.upsertVehicleDraft(
      fleetPartnerId,
      submissionId,
      command,
    );
  }

  submitSubmission(
    fleetPartnerId: string,
    submissionId: string,
    actorId: string,
    command: SupplySubmissionLifecycleCommand,
  ) {
    return this.supplyReviewService.submitSubmission(
      fleetPartnerId,
      submissionId,
      actorId,
      command,
    );
  }

  withdrawSubmission(
    fleetPartnerId: string,
    submissionId: string,
    actorId: string,
    command: SupplySubmissionLifecycleCommand,
  ) {
    return this.supplyReviewService.withdrawSubmission(
      fleetPartnerId,
      submissionId,
      actorId,
      command,
    );
  }
}
