import { describe, expect, it, vi } from "vitest";
import {
  classifySupplyReviewFailure,
  listSupplyReviewSubmissions,
  mutateSupplyReview,
} from "../../app/supply-review/supply-review-client";

const submission = {
  submissionId: "sup-sub-001",
  fleetPartnerId: "fleet-001",
  submissionType: "vehicle_onboarding",
  status: "submitted",
  revisionNo: 3,
  subjectDriverId: null,
  subjectVehicleId: null,
  submittedBy: "fleet-user",
  submittedAt: "2026-08-08T10:00:00.000Z",
  reviewStartedBy: null,
  reviewStartedAt: null,
  reviewedBy: null,
  reviewedAt: null,
  reviewReasonCode: null,
  reviewComment: null,
  canonicalDriverId: null,
  canonicalVehicleId: null,
  canonicalContractId: null,
  canonicalPolicyId: null,
  createdAt: "2026-08-08T10:00:00.000Z",
  updatedAt: "2026-08-08T10:00:00.000Z",
};

describe("supply review client", () => {
  it("unwraps the list envelope and preserves optimistic revision data", async () => {
    const get = vi.fn().mockResolvedValue({ items: [submission] });
    const items = await listSupplyReviewSubmissions({ get } as never);
    expect(items).toEqual([
      expect.objectContaining({ submissionId: "sup-sub-001", revisionNo: 3 }),
    ]);
  });

  it("posts review commands to the canonical supply-review endpoint", async () => {
    const post = vi
      .fn()
      .mockResolvedValue({ ...submission, status: "in_review" });
    await mutateSupplyReview({ post } as never, "sup-sub-001", "start", {
      expectedRevisionNo: 3,
      reasonCode: "initial_screening",
    });
    expect(post).toHaveBeenCalledWith(
      "/api/admin/supply-review/submissions/sup-sub-001/start",
      {
        body: { expectedRevisionNo: 3, reasonCode: "initial_screening" },
      },
    );
  });

  it("classifies server conflicts and server-side authorization denial", () => {
    expect(classifySupplyReviewFailure({ statusCode: 409 })).toBe(
      "revision_conflict",
    );
    expect(classifySupplyReviewFailure({ statusCode: 403 })).toBe("forbidden");
  });
});
