import { describe, expect, it } from "vitest";

import { AuditNotificationService } from "../../src/modules/audit-notification/audit-notification.service";
import { DriverProfileService } from "../../src/modules/driver-profile/driver-profile.service";
import { RegulatoryRegistryService } from "../../src/modules/regulatory-registry/regulatory-registry.service";
import { SupplyReviewService } from "../../src/modules/fleet-partner/supply-review.service";

describe("SupplyReviewService", () => {
  it("starts review with optimistic revision advancement", async () => {
    const service = new SupplyReviewService();

    const updated = await service.startSubmissionReview(
      "sup-sub-demo-001",
      {
        expectedRevisionNo: 1,
        reasonCode: "manual_screening",
        comment: "Start queue handling.",
      },
      "platform-reviewer-001",
    );

    expect(updated).toMatchObject({
      submissionId: "sup-sub-demo-001",
      status: "in_review",
      revisionNo: 2,
      reviewStartedBy: "platform-reviewer-001",
      reviewReasonCode: "manual_screening",
      reviewComment: "Start queue handling.",
    });
  });

  it("returns the supply-specific revision conflict code", async () => {
    const service = new SupplyReviewService();

    await expect(
      service.requestRevision(
        "sup-sub-demo-002",
        {
          expectedRevisionNo: 1,
          reasonCode: "document_expired",
          comment: "Please re-upload the expired file.",
        },
        "platform-reviewer-002",
      ),
    ).rejects.toMatchObject({
      response: {
        error: {
          code: "SUBMISSION_REVISION_CONFLICT",
        },
      },
    });
  });

  it("blocks self approval by the original submitter", async () => {
    const service = new SupplyReviewService();

    await expect(
      service.approveSubmission(
        "sup-sub-demo-002",
        {
          expectedRevisionNo: 2,
          reasonCode: "all_documents_valid",
          comment: "Approve own submission.",
        },
        "fleet-user-2",
      ),
    ).rejects.toMatchObject({
      response: {
        error: {
          code: "REVIEWER_SELF_APPROVAL_DENIED",
        },
      },
    });
  });

  it("approves an in-review submission for a different reviewer", async () => {
    const auditNotificationService = new AuditNotificationService();
    const registryService = new RegulatoryRegistryService(
      {
        publishDriverLocationUpdated: () => undefined,
        publishSupplyLifecycleUpdated: () => undefined,
      } as never,
      auditNotificationService,
      new DriverProfileService(new AuditNotificationService()),
      undefined,
    );
    const service = new SupplyReviewService(registryService);

    const updated = await service.approveSubmission(
      "sup-sub-demo-002",
      {
        expectedRevisionNo: 2,
        reasonCode: "all_documents_valid",
        comment: "Approval completed.",
      },
      "platform-reviewer-003",
    );

    expect(updated).toMatchObject({
      submissionId: "sup-sub-demo-002",
      status: "approved",
      revisionNo: 3,
      reviewedBy: "platform-reviewer-003",
      reviewReasonCode: "all_documents_valid",
      reviewComment: "Approval completed.",
      canonicalDriverId: expect.stringMatching(/^drv_/),
      canonicalVehicleId: expect.stringMatching(/^veh_/),
      canonicalContractId: expect.stringMatching(/^contract_/),
      canonicalPolicyId: expect.stringMatching(/^policy_/),
    });

    await expect(service.listVehicleAffiliations()).resolves.toEqual([
      expect.objectContaining({
        vehicleId: updated.canonicalVehicleId,
        fleetPartnerId: "fleet-demo-001",
        affiliationType: "contracted_under",
        effectiveFrom: "2026-06-20T00:00:00.000Z",
        effectiveUntil: "2027-06-19T23:59:59.000Z",
        sourceSubmissionId: "sup-sub-demo-002",
        status: "active",
      }),
    ]);
    expect(
      auditNotificationService
        .getAuditLogsSnapshot()
        .some(
          (entry) => entry.actionName === "create_vehicle_fleet_affiliation",
        ),
    ).toBe(true);
  });
});
