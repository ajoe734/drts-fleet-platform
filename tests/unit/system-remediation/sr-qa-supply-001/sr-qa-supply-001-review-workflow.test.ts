import { describe, expect, it } from "vitest";

import { RegulatoryRegistryService } from "../../../../apps/api/src/modules/regulatory-registry/regulatory-registry.service";
import { SupplyReviewService } from "../../../../apps/api/src/modules/fleet-partner/supply-review.service";

// SR-QA-SUPPLY-001 — capability C066 (受理／核可／駁回／revision 衝突), verified
// against the current, real SupplyReviewService implementation (apps/api/src/
// modules/fleet-partner/supply-review.service.ts) already shipped on `dev`.
// SupplyReviewService and RegulatoryRegistryService are constructed with no
// repository/DB dependency (no DATABASE_URL in this sandbox), which routes
// every call through the service's authoritative in-memory branch — the same
// production business logic (revision/status/self-approval guards, canonical
// provisioning) as the DB-backed branch; only the Postgres transaction layer
// itself goes untested here (see the evidence doc's NOT COVERED note).

function setupReviewWithRegistry() {
  const mockOpsDispatchEventsService = {
    publishSupplyLifecycleUpdated: () => {},
    publishDriverLocationUpdated: () => {},
  };
  const mockDriverProfileService = { findProfileForDriver: () => null };
  const mockAuditNotificationService = { recordAuditLog: () => {} };
  const regService = new RegulatoryRegistryService(
    mockOpsDispatchEventsService as never,
    mockAuditNotificationService as never,
    mockDriverProfileService as never,
  );
  // No repository is passed (both ctor args are @Optional()) so
  // SupplyReviewService uses its REVIEW_SUBMISSION_SEED in-memory state,
  // which ships two pre-seeded, submitter-distinct submissions
  // (sub_s38/sub_s39/sub_t02/sub_r33/sub_u51 and the fully-documented
  // "sup-sub-demo-002") purpose-built for this exact review-workflow
  // scenario matrix.
  const reviewService = new SupplyReviewService(regService, undefined);
  return { regService, reviewService };
}

describe("SR-QA-SUPPLY-001 — C066 受理／核可／駁回／revision 衝突", () => {
  it("starting review on a submitted submission transitions it to in_review and bumps the revision", async () => {
    const { reviewService } = setupReviewWithRegistry();
    const before = await reviewService.getSubmission("sub_t02");
    expect(before?.status).toBe("submitted");
    expect(before?.revisionNo).toBe(1);

    const updated = await reviewService.startSubmissionReview(
      "sub_t02",
      { expectedRevisionNo: 1, reasonCode: "initial_screening" },
      "reviewer-a",
    );
    expect(updated.status).toBe("in_review");
    expect(updated.revisionNo).toBe(2);
    expect(updated.reviewStartedBy).toBe("reviewer-a");
  });

  it("two reviewers racing on the same submission: the second call with a stale expectedRevisionNo is rejected with SUBMISSION_REVISION_CONFLICT (不同審核人競態)", async () => {
    const { reviewService } = setupReviewWithRegistry();

    // Reviewer A wins the race and starts review (revisionNo 1 -> 2).
    await reviewService.startSubmissionReview(
      "sub_t02",
      { expectedRevisionNo: 1, reasonCode: "initial_screening" },
      "reviewer-a",
    );

    // Reviewer B's UI still shows the stale revisionNo 1 and tries the same
    // action concurrently — must be rejected, not silently overwrite A's
    // transition or double-apply the state change.
    await expect(
      reviewService.startSubmissionReview(
        "sub_t02",
        { expectedRevisionNo: 1, reasonCode: "initial_screening" },
        "reviewer-b",
      ),
    ).rejects.toMatchObject({
      code: "SUBMISSION_REVISION_CONFLICT",
    });

    const current = await reviewService.getSubmission("sub_t02");
    expect(current?.reviewStartedBy).toBe("reviewer-a");
  });

  it("rejecting a submission that is already approved (stale revision snapshot) is refused as an invalid state transition, not silently applied (舊 revision 拒絕)", async () => {
    const { reviewService } = setupReviewWithRegistry();

    // sup-sub-demo-002 starts in_review (revisionNo 2) with a different
    // submitter (fleet-user-2) from the reviewer we use below.
    await reviewService.approveSubmission(
      "sup-sub-demo-002",
      { expectedRevisionNo: 2, reasonCode: "approved_by_reviewer" },
      "platform-admin-demo-001",
    );
    const afterApproval = await reviewService.getSubmission("sup-sub-demo-002");
    expect(afterApproval?.status).toBe("approved");

    // A second reviewer, still holding the pre-approval revisionNo (2) in
    // their stale UI, attempts to reject the same submission.
    await expect(
      reviewService.rejectSubmission(
        "sup-sub-demo-002",
        { expectedRevisionNo: 2, reasonCode: "missing_documents" },
        "platform-admin-demo-002",
      ),
    ).rejects.toMatchObject({
      code: "SUBMISSION_REVISION_CONFLICT",
    });

    // Even resubmitting with the *current* (post-approval) revisionNo must
    // still be refused, because "approved" is not in rejectSubmission's
    // allowed current-status set — rejection cannot reopen an approved case.
    const currentRevision = (await reviewService.getSubmission(
      "sup-sub-demo-002",
    ))!.revisionNo;
    await expect(
      reviewService.rejectSubmission(
        "sup-sub-demo-002",
        {
          expectedRevisionNo: currentRevision,
          reasonCode: "missing_documents",
        },
        "platform-admin-demo-002",
      ),
    ).rejects.toMatchObject({
      code: "INVALID_STATE_TRANSITION",
    });
  });

  it("the submitting fleet user cannot approve their own submission, even with a correct revisionNo (reviewer self-approval denied)", async () => {
    const { reviewService } = setupReviewWithRegistry();
    // sup-sub-demo-002.submittedBy === "fleet-user-2"
    await expect(
      reviewService.approveSubmission(
        "sup-sub-demo-002",
        { expectedRevisionNo: 2, reasonCode: "approved_by_reviewer" },
        "fleet-user-2",
      ),
    ).rejects.toMatchObject({
      code: "REVIEWER_SELF_APPROVAL_DENIED",
    });

    const stillInReview = await reviewService.getSubmission("sup-sub-demo-002");
    expect(stillInReview?.status).toBe("in_review");
  });

  it("a missing reasonCode is rejected before any state mutation happens (負向: 缺少理由碼)", async () => {
    const { reviewService } = setupReviewWithRegistry();
    await expect(
      reviewService.approveSubmission(
        "sup-sub-demo-002",
        { expectedRevisionNo: 2, reasonCode: "" },
        "platform-admin-demo-001",
      ),
    ).rejects.toMatchObject({
      code: "REASON_CODE_REQUIRED",
    });
    const unchanged = await reviewService.getSubmission("sup-sub-demo-002");
    expect(unchanged?.status).toBe("in_review");
    expect(unchanged?.revisionNo).toBe(2);
  });

  it("approving sup-sub-demo-002 (vehicle onboarding with approved contract + insurance documents) writes real canonical records into the registry — vehicle, contract, policy, and passenger disclosure profile (核可寫 canonical registry)", async () => {
    const { regService, reviewService } = setupReviewWithRegistry();

    const beforeVehicleCount = regService.listVehicles().length;
    const beforeContractCount = regService.listContracts().length;
    const beforePolicyCount = regService.listPolicies().length;

    const approved = await reviewService.approveSubmission(
      "sup-sub-demo-002",
      { expectedRevisionNo: 2, reasonCode: "approved_by_reviewer" },
      "platform-admin-demo-001",
    );

    expect(approved.status).toBe("approved");
    expect(approved.canonicalVehicleId).toBeTruthy();
    expect(approved.canonicalContractId).toBeTruthy();
    expect(approved.canonicalPolicyId).toBeTruthy();

    // The registry actually grew by one real record per entity — this is not
    // a fixture echo of the submission, it is the authoritative registry
    // state after a real write.
    expect(regService.listVehicles().length).toBe(beforeVehicleCount + 1);
    expect(regService.listContracts().length).toBe(beforeContractCount + 1);
    expect(regService.listPolicies().length).toBe(beforePolicyCount + 1);

    const vehicle = regService
      .listVehicles()
      .find((v) => v.vehicleId === approved.canonicalVehicleId);
    // Data is derived from the real REVIEW_VEHICLE_DRAFTS_SEED draft for
    // sup-sub-demo-002 (plateNo "SUP-2002"), not a hardcoded placeholder.
    expect(vehicle?.plateNo).toBe("SUP-2002");

    const contract = regService
      .listContracts()
      .find((c) => c.contractId === approved.canonicalContractId);
    expect(contract?.vehicleId).toBe(approved.canonicalVehicleId);

    const policy = regService
      .listPolicies()
      .find((p) => p.policyId === approved.canonicalPolicyId);
    expect(policy?.vehicleId).toBe(approved.canonicalVehicleId);

    const disclosureProfile = regService.getVehiclePassengerDisclosureProfile(
      approved.canonicalVehicleId as string,
    );
    expect(disclosureProfile?.make).toBe("Toyota");
    expect(disclosureProfile?.model).toBe("Camry");

    // Re-approving the already-approved submission must be idempotent-safe
    // via the status guard, not silently create duplicate canonical records.
    await expect(
      reviewService.approveSubmission(
        "sup-sub-demo-002",
        {
          expectedRevisionNo: approved.revisionNo,
          reasonCode: "approved_by_reviewer",
        },
        "platform-admin-demo-003",
      ),
    ).rejects.toMatchObject({ code: "INVALID_STATE_TRANSITION" });
    expect(regService.listVehicles().length).toBe(beforeVehicleCount + 1);
  });

  it("requesting revision on a submission that has not started review yet is refused (only in_review submissions can be sent back for revision)", async () => {
    const { reviewService } = setupReviewWithRegistry();
    // sub_s38 is "submitted", not yet "in_review".
    await expect(
      reviewService.requestRevision(
        "sub_s38",
        { expectedRevisionNo: 1, reasonCode: "missing_documents" },
        "reviewer-a",
      ),
    ).rejects.toMatchObject({ code: "INVALID_STATE_TRANSITION" });
  });

  it("a request against an unknown submissionId surfaces NOT_FOUND rather than a silent no-op (負向: 不存在的送件)", async () => {
    const { reviewService } = setupReviewWithRegistry();
    await expect(
      reviewService.approveSubmission(
        "sub_does_not_exist",
        { expectedRevisionNo: 1, reasonCode: "approved_by_reviewer" },
        "reviewer-a",
      ),
    ).rejects.toMatchObject({ code: "NOT_FOUND" });
  });
});
