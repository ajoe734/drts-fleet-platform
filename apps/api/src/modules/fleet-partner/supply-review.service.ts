import { Injectable } from "@nestjs/common";

import type { SupplySubmissionRecord } from "@drts/contracts";

@Injectable()
export class SupplyReviewService {
  beginReview(_submissionId: string, _reviewerId: string): never {
    throw new Error("Supply review scaffolding is not implemented yet.");
  }

  recordDecision(
    _submissionId: string,
    _reviewerId: string,
    _decision: "approved" | "needs_revision" | "rejected",
  ): never {
    throw new Error("Supply review scaffolding is not implemented yet.");
  }

  getSubmissionForReview(_submissionId: string): SupplySubmissionRecord | null {
    return null;
  }
}
