import { Injectable } from "@nestjs/common";

import type { AddSupplyDocumentCommand } from "@drts/contracts";

import { SupplyReviewService } from "./supply-review.service";

/**
 * Manages supply document upload metadata, object-store keys, and per-document
 * review status for fleet-partner submissions.
 *
 * Document records live on SupplyReviewService alongside the submissions they
 * belong to; this service is the partner-facing upload-metadata facade.
 *
 * Source of truth:
 *   docs/02-architecture/phase1_delta_sd_supply_eligibility_mobile_reporting_20260619.md §1.1, §2.4
 */
@Injectable()
export class SupplyDocumentService {
  constructor(private readonly supplyReviewService: SupplyReviewService) {}

  addDocument(
    fleetPartnerId: string,
    submissionId: string,
    uploadedBy: string,
    command: AddSupplyDocumentCommand,
  ) {
    return this.supplyReviewService.addDocument(
      fleetPartnerId,
      submissionId,
      uploadedBy,
      command,
    );
  }
}
