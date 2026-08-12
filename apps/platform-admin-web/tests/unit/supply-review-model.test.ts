import { describe, expect, it, vi } from "vitest";
import {
  approveSubmissionAction,
  fetchSupplyReviewDetail,
  fetchSupplyReviewSubmissions,
  formatSubmissionTypeLabel,
  rejectSubmissionAction,
  requestRevisionAction,
  startReviewAction,
  transformRecordToItem,
} from "../../lib/supply-review-client";
import type { ApiClient } from "@drts/api-client";
import type { SupplySubmissionRecord } from "@drts/contracts";

describe("Supply Review Client & Data Model", () => {
  it("formats submission types correctly", () => {
    expect(formatSubmissionTypeLabel("driver_onboarding")).toBe("司機");
    expect(formatSubmissionTypeLabel("vehicle_onboarding")).toBe("車輛");
    expect(formatSubmissionTypeLabel("insurance_update")).toBe("保險");
    expect(formatSubmissionTypeLabel("contract_update")).toBe("合約");
    expect(formatSubmissionTypeLabel("custom_type")).toBe("custom_type");
  });

  it("transforms raw SupplySubmissionRecord into SupplyReviewItem", () => {
    const rawRecord: SupplySubmissionRecord = {
      submissionId: "sup-sub-test-001",
      fleetPartnerId: "fleet-demo-001",
      submissionType: "vehicle_onboarding",
      status: "in_review",
      revisionNo: 2,
      subjectDriverId: null,
      subjectVehicleId: "veh_test_001",
      submittedBy: "fleet-user-1",
      submittedAt: "2026-06-20T10:00:00.000Z",
      reviewStartedBy: "platform-reviewer-001",
      reviewStartedAt: "2026-06-20T10:05:00.000Z",
      reviewedBy: null,
      reviewedAt: null,
      reviewReasonCode: "initial_screening",
      reviewComment: "Checking registration",
      canonicalDriverId: null,
      canonicalVehicleId: null,
      canonicalContractId: null,
      canonicalPolicyId: null,
      createdAt: "2026-06-20T10:00:00.000Z",
      updatedAt: "2026-06-20T10:05:00.000Z",
    };

    const transformed = transformRecordToItem(rawRecord);

    expect(transformed).toMatchObject({
      id: "sup-sub-test-001",
      submissionId: "sup-sub-test-001",
      type: "車輛",
      submissionType: "vehicle_onboarding",
      fleet: "大都會車隊",
      fleetPartnerId: "fleet-demo-001",
      subject: "veh_test_001",
      rev: 2,
      revisionNo: 2,
      status: "in_review",
      lockedBy: "platform-reviewer-001",
    });
  });

  it("fetches supply review queue with API fallback", async () => {
    const mockClient = {
      listSupplyReviewSubmissions: vi.fn().mockResolvedValue([
        {
          submissionId: "sup-sub-live-001",
          fleetPartnerId: "fleet-demo-001",
          submissionType: "driver_onboarding",
          status: "submitted",
          revisionNo: 1,
          subjectDriverId: "drv_live_001",
          subjectVehicleId: null,
          submittedBy: "fleet-user-1",
          submittedAt: "2026-06-20T12:00:00.000Z",
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
          createdAt: "2026-06-20T12:00:00.000Z",
          updatedAt: "2026-06-20T12:00:00.000Z",
        },
      ]),
    } as unknown as ApiClient;

    const items = await fetchSupplyReviewSubmissions(mockClient);

    expect(mockClient.listSupplyReviewSubmissions).toHaveBeenCalledTimes(1);
    expect(items.some((i) => i.id === "sup-sub-live-001")).toBe(true);
    expect(items.some((i) => i.id === "sub_s39")).toBe(true);
  });

  it("fetches supply review detail with side-by-side diff and document preview data", async () => {
    const mockClient = {
      getSupplyReviewSubmission: vi.fn().mockResolvedValue({
        submissionId: "sub_s39",
        fleetPartnerId: "fleet-demo-001",
        submissionType: "vehicle_onboarding",
        status: "in_review",
        revisionNo: 1,
        subjectDriverId: null,
        subjectVehicleId: "veh_9120",
        submittedBy: "fleet-user-1",
        submittedAt: "2026-06-18T14:02:00.000Z",
        reviewStartedBy: "platform-reviewer-001",
        reviewStartedAt: "2026-06-18T14:05:00.000Z",
        reviewedBy: null,
        reviewedAt: null,
        reviewReasonCode: null,
        reviewComment: null,
        canonicalDriverId: null,
        canonicalVehicleId: null,
        canonicalContractId: null,
        canonicalPolicyId: null,
        createdAt: "2026-06-18T14:02:00.000Z",
        updatedAt: "2026-06-18T14:05:00.000Z",
      }),
    } as unknown as ApiClient;

    const detail = await fetchSupplyReviewDetail(mockClient, "sub_s39");

    expect(detail.submission.id).toBe("sub_s39");
    expect(detail.diff.length).toBeGreaterThan(0);
    expect(detail.documents.length).toBeGreaterThan(0);
    expect(detail.canonicalPreview.readiness).toBe("ready");
  });

  it("triggers start review action command correctly", async () => {
    const mockClient = {
      startSupplyReview: vi.fn().mockResolvedValue({
        submissionId: "sub_s38",
        status: "in_review",
        revisionNo: 2,
      }),
    } as unknown as ApiClient;

    const res = await startReviewAction(
      mockClient,
      "sub_s38",
      1,
      "Review started",
    );

    expect(mockClient.startSupplyReview).toHaveBeenCalledWith("sub_s38", {
      expectedRevisionNo: 1,
      reasonCode: "manual_screening",
      comment: "Review started",
    });
    expect(res.status).toBe("in_review");
  });

  it("triggers request revision action command correctly", async () => {
    const mockClient = {
      requestSupplyRevision: vi.fn().mockResolvedValue({
        submissionId: "sub_s39",
        status: "needs_revision",
        revisionNo: 2,
      }),
    } as unknown as ApiClient;

    const res = await requestRevisionAction(
      mockClient,
      "sub_s39",
      1,
      "document_expired",
      "Re-upload expired insurance",
    );

    expect(mockClient.requestSupplyRevision).toHaveBeenCalledWith("sub_s39", {
      expectedRevisionNo: 1,
      reasonCode: "document_expired",
      comment: "Re-upload expired insurance",
    });
    expect(res.status).toBe("needs_revision");
  });

  it("triggers approve submission action command and provisions canonical registry", async () => {
    const mockClient = {
      approveSupplySubmission: vi.fn().mockResolvedValue({
        submissionId: "sub_s39",
        status: "approved",
        revisionNo: 2,
        canonicalDriverId: "drv_demo_001",
        canonicalVehicleId: "veh_demo_001",
        canonicalContractId: "contract_demo_001",
        canonicalPolicyId: "policy_demo_001",
      }),
    } as unknown as ApiClient;

    const res = await approveSubmissionAction(
      mockClient,
      "sub_s39",
      1,
      "Approval completed and canonical provisioned.",
    );

    expect(mockClient.approveSupplySubmission).toHaveBeenCalledWith("sub_s39", {
      expectedRevisionNo: 1,
      reasonCode: "all_documents_valid",
      comment: "Approval completed and canonical provisioned.",
    });
    expect(res.status).toBe("approved");
    expect(res.canonicalVehicleId).toBe("veh_demo_001");
  });

  it("triggers reject submission action command correctly", async () => {
    const mockClient = {
      rejectSupplySubmission: vi.fn().mockResolvedValue({
        submissionId: "sub_s39",
        status: "rejected",
        revisionNo: 2,
      }),
    } as unknown as ApiClient;

    const res = await rejectSubmissionAction(
      mockClient,
      "sub_s39",
      1,
      "invalid_format",
      "Rejecting invalid submission format",
    );

    expect(mockClient.rejectSupplySubmission).toHaveBeenCalledWith("sub_s39", {
      expectedRevisionNo: 1,
      reasonCode: "invalid_format",
      comment: "Rejecting invalid submission format",
    });
    expect(res.status).toBe("rejected");
  });
});
