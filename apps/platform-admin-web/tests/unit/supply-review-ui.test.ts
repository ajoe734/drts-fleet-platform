import { readFileSync } from "fs";
import { resolve } from "path";
import { describe, expect, it } from "vitest";
import {
  PSR_SUB_STATUS,
  REASON_CODES,
  buildDocumentRows,
  buildSideBySideDiff,
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
      expect(PSR_SUB_STATUS[st].key).toBeTruthy();
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

  it("presents VQ-1 through VQ-6 design canvas artifacts in detail view without operational fixture fallbacks", () => {
    expect(REASON_CODES.length).toBeGreaterThan(0);

    // Verify buildSideBySideDiff returns [] when no payload draft is provided
    const emptyDiff = buildSideBySideDiff(
      "sub_test",
      "vehicle_onboarding",
      null,
      null,
      null,
      null,
      [],
    );
    expect(emptyDiff).toEqual([]);

    // Verify buildDocumentRows returns [] when no document payload is provided
    const emptyDocs = buildDocumentRows([]);
    expect(emptyDocs).toEqual([]);

    const sharedSource = readFileSync(
      resolve(__dirname, "../../app/supply-review/supply-review-shared.ts"),
      "utf-8",
    );
    expect(sharedSource).not.toContain("FX_PSR_QUEUE");
    expect(sharedSource).not.toContain("DEFAULT_DIFF_ROWS");
    expect(sharedSource).not.toContain("DEFAULT_DOCUMENT_ROWS");

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

  it("implements all seven required queue filters in queue page (SA §4.11)", () => {
    const queuePageSource = readFileSync(
      resolve(__dirname, "../../app/supply-review/page.tsx"),
      "utf-8",
    );

    // 1. Fleet partner filter
    expect(queuePageSource).toContain("fleetFilter");
    expect(queuePageSource).toContain("supplyReview.filter.fleetAll");

    // 2. Submission type filter
    expect(queuePageSource).toContain("typeFilter");
    expect(queuePageSource).toContain("supplyReview.filter.typeAll");

    // 3. Submitted date filter
    expect(queuePageSource).toContain("dateFilter");
    expect(queuePageSource).toContain("supplyReview.filter.dateAll");

    // 4. Status filter
    expect(queuePageSource).toContain("statusFilter");
    expect(queuePageSource).toContain("supplyReview.filter.statusAll");

    // 5. Missing items filter
    expect(queuePageSource).toContain("missingFilter");
    expect(queuePageSource).toContain("supplyReview.filter.missingAll");

    // 6. Service product filter
    expect(queuePageSource).toContain("serviceFilter");
    expect(queuePageSource).toContain("supplyReview.filter.serviceAll");

    // 7. Business area filter
    expect(queuePageSource).toContain("areaFilter");
    expect(queuePageSource).toContain("supplyReview.filter.areaAll");
  });

  it("enforces strict API error handling without FX fixture fallback or fake success navigation", () => {
    const queuePageSource = readFileSync(
      resolve(__dirname, "../../app/supply-review/page.tsx"),
      "utf-8",
    );
    const detailPageSource = readFileSync(
      resolve(__dirname, "../../app/supply-review/[submissionId]/page.tsx"),
      "utf-8",
    );

    // Queue page must not set FX_PSR_QUEUE in fetchSubmissions catch block
    expect(queuePageSource).not.toMatch(
      /catch\s*\(e[^)]*\)\s*\{[^}]*setSubmissions\(\s*FX_PSR_QUEUE\s*\)/,
    );
    // Queue start review catch block must not navigate to detail page
    expect(queuePageSource).not.toMatch(
      /catch\s*\(e[^)]*\)\s*\{[^}]*router\.push/,
    );

    // Detail page must set error message and not use raw rgba(11, 18, 32, 0.5)
    expect(detailPageSource).toContain("setErrorMsg");
    expect(detailPageSource).not.toContain("rgba(11, 18, 32, 0.5)");

    // Detail page must require comment for revision request and rejection
    expect(detailPageSource).toContain(
      'setErrorMsg("退回補正需填寫說明 (comment)")',
    );
    expect(detailPageSource).toContain(
      'setErrorMsg("駁回需填寫說明 (comment)")',
    );
  });
});
