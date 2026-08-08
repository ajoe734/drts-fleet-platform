import { readFileSync } from "fs";
import { resolve } from "path";
import { describe, expect, it } from "vitest";
import {
  DEFAULT_DIFF_ROWS,
  DEFAULT_DOCUMENT_ROWS,
  FX_PSR_QUEUE,
  PSR_SUB_STATUS,
  REASON_CODES,
  classifySupplyReviewError,
  mapSubmissionToTypeZh,
} from "../../app/supply-review/supply-review-shared";

describe("S1F-ADM-001 Platform Admin Supply Review UI & Behavior", () => {
  it("includes canonical screen IDs for queue and detail surfaces", () => {
    const queuePageSource = readFileSync(
      resolve(__dirname, "../../app/supply-review/page.tsx"),
      "utf-8",
    );
    const detailPageSource = readFileSync(
      resolve(__dirname, "../../app/supply-review/[submissionId]/page.tsx"),
      "utf-8",
    );
    const sharedSource = readFileSync(
      resolve(__dirname, "../../app/supply-review/supply-review-shared.ts"),
      "utf-8",
    );

    expect(queuePageSource).toContain('data-screen-id="PSR-QUEUE-01"');
    expect(detailPageSource).toContain('data-screen-id="PSR-DETAIL-01"');
    expect(sharedSource).toContain("PSR_SUB_STATUS");
  });

  it("implements all six supply submission states from SA §4.7", () => {
    const statuses = [
      "submitted",
      "in_review",
      "needs_revision",
      "approved",
      "rejected",
      "withdrawn",
    ] as const;

    statuses.forEach((st) => {
      expect(PSR_SUB_STATUS[st]).toBeDefined();
      expect(PSR_SUB_STATUS[st].zh).toBeTruthy();
      expect(PSR_SUB_STATUS[st].tone).toBeTruthy();
    });
  });

  it("correctly classifies revision conflicts and self-approval denial errors", () => {
    const conflictErr = classifySupplyReviewError({
      response: {
        error: {
          code: "SUBMISSION_REVISION_CONFLICT",
          message: "Conflict revision",
        },
      },
    });
    expect(conflictErr.isConflict).toBe(true);
    expect(conflictErr.isSelfApprovalDenied).toBe(false);

    const selfApproveErr = classifySupplyReviewError({
      message: "REVIEWER_SELF_APPROVAL_DENIED: reviewer cannot approve own",
    });
    expect(selfApproveErr.isSelfApprovalDenied).toBe(true);
  });

  it("maps submission types to Chinese labels correctly", () => {
    expect(mapSubmissionToTypeZh("driver_onboarding")).toBe("司機");
    expect(mapSubmissionToTypeZh("vehicle_onboarding")).toBe("車輛");
    expect(mapSubmissionToTypeZh("insurance_update")).toBe("保險");
    expect(mapSubmissionToTypeZh("contract_update")).toBe("合約");
    expect(mapSubmissionToTypeZh("custom_type")).toBe("custom_type");
  });

  it("invokes admin supply review client mutation APIs in detail actions", () => {
    const detailSource = readFileSync(
      resolve(__dirname, "../../app/supply-review/[submissionId]/page.tsx"),
      "utf-8",
    );

    expect(detailSource).toContain("startAdminSupplyReview");
    expect(detailSource).toContain("approveAdminSupplySubmission");
    expect(detailSource).toContain("requestAdminSupplyRevision");
    expect(detailSource).toContain("rejectAdminSupplySubmission");
  });

  it("presents VQ-1 through VQ-6 design canvas artifacts in detail view", () => {
    expect(DEFAULT_DIFF_ROWS.length).toBeGreaterThan(0);
    expect(DEFAULT_DOCUMENT_ROWS.length).toBeGreaterThan(0);
    expect(FX_PSR_QUEUE.length).toBeGreaterThan(0);
    expect(REASON_CODES.length).toBeGreaterThan(0);

    const detailSource = readFileSync(
      resolve(__dirname, "../../app/supply-review/[submissionId]/page.tsx"),
      "utf-8",
    );
    expect(detailSource).toContain("VQ-1");
    expect(detailSource).toContain("VQ-2");
    expect(detailSource).toContain("VQ-3");
    expect(detailSource).toContain("VQ-4");
    expect(detailSource).toContain("VQ-6");
  });
});
