// SR-QA-DRIVER-001 -- C049 (新司機 onboarding: 文件建檔、送審與核准後開通).
//
// Existing coverage this file does NOT re-derive:
// - `tests/unit/supply-submission.test.ts`: draft create/update, duplicate
//   driver-identity rejection, submission completeness checks.
// - `apps/api/tests/unit/supply-review.service.test.ts` +
//   `apps/api/tests/integration/int-sup-001-approve-submission-provisions-registry.test.ts`:
//   review-start, self-approval block, the SUBMISSION_REVISION_CONFLICT
//   negative case for requestRevision, and -- the 身份與駕駛資格一致
//   (identity/qualification consistency) half of this capability's stated
//   gap -- approveSubmission provisioning a canonical driver/vehicle/
//   contract/policy into RegulatoryRegistryService, real write+read-back
//   through `registry.listDrivers()` etc.
//
// What was NOT covered anywhere as of this SHA: requestRevision's actual
// SUCCESS path (退件, "send back for revision") -- only its revision-conflict
// rejection was tested. This adds that, using seed submission `sub_u51`
// (status "in_review", revisionNo 1), which no other test file touches.
//
// 真機上傳 (real-device document upload) is out of scope for this VM (see
// SR-LIVE-DRIVER-001). The fleet-partner-side "resubmit after revision"
// half of 退件補件 requires chaining `SupplySubmissionService` (fleet
// partner) with `SupplyReviewService` (platform reviewer) through a shared
// row in Postgres: reading `supply-review.service.ts`'s `onModuleInit` (it
// only hydrates from `SupplySubmissionRepository` when
// `repository.isEnabled()`, i.e. only when a real `DATABASE_URL` is
// configured) and `applyReviewAction` (its in-memory branch operates on its
// own seeded `submissions` array, entirely separate from
// `SupplySubmissionService`'s own empty-by-default in-memory array) confirms
// the two services do not share state without a real database. That full
// fleet-partner-resubmit round trip is therefore a DB-backed integration
// concern, not something this unit-level file can honestly exercise; it is
// reported as a follow-up scope note rather than faked with a mocked shared
// store.

import { describe, expect, it } from "vitest";

import { SupplyReviewService } from "../../../../apps/api/src/modules/fleet-partner/supply-review.service";

describe("SR-QA-DRIVER-001 C049: supply onboarding review actions", () => {
  it("sends an in-review submission back for revision, and the needs_revision status + reason are readable back through getSubmission", async () => {
    const service = new SupplyReviewService();

    const updated = await service.requestRevision(
      "sub_u51",
      {
        expectedRevisionNo: 1,
        reasonCode: "document_illegible",
        comment: "行照掃描檔案模糊，請重新上傳。",
      },
      "platform-reviewer-004",
    );

    expect(updated).toMatchObject({
      submissionId: "sub_u51",
      status: "needs_revision",
      revisionNo: 2,
      reviewReasonCode: "document_illegible",
      reviewComment: "行照掃描檔案模糊，請重新上傳。",
    });

    // Read-back through an independent surface, not just the write's own
    // return value.
    const reloaded = await service.getSubmission("sub_u51");
    expect(reloaded).toMatchObject({
      status: "needs_revision",
      revisionNo: 2,
    });
  });

  it("rejects a second requestRevision against the now-stale revisionNo (SUBMISSION_REVISION_CONFLICT) -- the submission does not silently move again", async () => {
    const service = new SupplyReviewService();

    await service.requestRevision(
      "sub_u51",
      {
        expectedRevisionNo: 1,
        reasonCode: "document_illegible",
        comment: "First revision request.",
      },
      "platform-reviewer-004",
    );

    await expect(
      service.requestRevision(
        "sub_u51",
        {
          // Stale: the submission is now at revisionNo 2 after the first call.
          expectedRevisionNo: 1,
          reasonCode: "document_illegible",
          comment: "Replayed/duplicate request from a retried client.",
        },
        "platform-reviewer-004",
      ),
    ).rejects.toMatchObject({
      response: { error: { code: "SUBMISSION_REVISION_CONFLICT" } },
    });

    const reloaded = await service.getSubmission("sub_u51");
    expect(reloaded).toMatchObject({ status: "needs_revision", revisionNo: 2 });
  });
});
