import { describe, expect, it } from "vitest";

import { ApiRequestError } from "../../src/common/api-envelope";
import { AuditNotificationService } from "../../src/modules/audit-notification/audit-notification.service";

const OPS_IDENTITY = {
  actorId: "ops-user-001",
  actorType: "ops_user" as const,
  realm: "ops" as const,
  scopes: ["audit:read"],
  tenantId: null,
};

const PLATFORM_IDENTITY = {
  actorId: "platform-admin-001",
  actorType: "platform_admin" as const,
  realm: "platform" as const,
  scopes: ["audit:read"],
  tenantId: null,
};

const PLATFORM_IDENTITY_2 = {
  actorId: "platform-admin-002",
  actorType: "platform_admin" as const,
  realm: "platform" as const,
  scopes: ["audit:read"],
  tenantId: null,
};

function getErrorCode(error: unknown) {
  if (!(error instanceof ApiRequestError)) {
    throw error;
  }
  const response = error.getResponse() as { error: { code: string } };
  return response.error.code;
}

describe("AuditNotificationService evidence governance workflows", () => {
  it("tracks legal holds and deletion exceptions on the evidence subject view", () => {
    const service = new AuditNotificationService();

    const hold = service.placeEvidenceLegalHold(
      {
        family: "report_artifact",
        subjectId: "artifact-report-001",
        caseNumber: "CASE-2026-001",
        reasonCode: "settlement_dispute",
        manifestHash: "manifest-001",
        tenantId: "tenant-demo-001",
      },
      OPS_IDENTITY,
      "req-hold-001",
    );

    const deletionException = service.registerEvidenceDeletionException(
      {
        family: "report_artifact",
        subjectId: "artifact-report-001",
        sourceResourceType: "reconciliation_issue",
        sourceResourceId: "recon-001",
        reviewerActorId: "platform-admin-001",
        reviewerActorType: "platform_admin",
        expiresAt: "2099-01-01T00:00:00.000Z",
        reasonCode: "settlement_dispute",
        manifestHash: "manifest-001",
        tenantId: "tenant-demo-001",
      },
      OPS_IDENTITY,
      "req-deletex-001",
    );

    const governance = service.getEvidenceSubjectGovernance(
      "report_artifact",
      "artifact-report-001",
      {
        manifestHash: "manifest-001",
        tenantId: "tenant-demo-001",
      },
    );

    expect(service.listEvidenceLegalHolds()).toEqual(
      expect.arrayContaining([
        expect.objectContaining({
          holdId: hold.holdId,
          family: "report_artifact",
          status: "active",
        }),
      ]),
    );
    expect(service.listEvidenceDeletionExceptions()).toEqual(
      expect.arrayContaining([
        expect.objectContaining({
          exceptionId: deletionException.exceptionId,
          family: "report_artifact",
          status: "active",
        }),
      ]),
    );
    expect(governance).toMatchObject({
      family: "report_artifact",
      subjectId: "artifact-report-001",
      effectivePrecedence: "active_hold",
      deletionSuppressed: true,
    });
    expect(governance.activeLegalHolds).toHaveLength(1);
    expect(governance.activeDeletionExceptions).toHaveLength(1);
  });

  it("only allows platform admins to request and approve legal hold releases", () => {
    const service = new AuditNotificationService();
    const hold = service.placeEvidenceLegalHold(
      {
        family: "filing_package",
        subjectId: "pkg-001",
        caseNumber: "CASE-2026-002",
        reasonCode: "regulatory_inquiry",
      },
      OPS_IDENTITY,
    );

    try {
      service.releaseEvidenceLegalHold(
        hold.holdId,
        { releaseReason: "ops attempted release" },
        OPS_IDENTITY,
      );
      throw new Error("Expected platform-admin restriction.");
    } catch (error) {
      expect(getErrorCode(error)).toBe("EVIDENCE_GOVERNANCE_FORBIDDEN");
    }

    const platformPlacedHold = service.placeEvidenceLegalHold(
      {
        family: "filing_package",
        subjectId: "pkg-002",
        caseNumber: "CASE-2026-003",
        reasonCode: "regulatory_inquiry",
      },
      PLATFORM_IDENTITY,
    );

    const releaseRequested = service.releaseEvidenceLegalHold(
      hold.holdId,
      {
        releaseReason: "regulator packet closed",
        releaseTrigger: "authority",
        releaseReference: "AUTH-REL-2026-001",
      },
      PLATFORM_IDENTITY,
      "req-hold-release-request-001",
    );
    expect(releaseRequested.status).toBe("release_requested");
    expect(releaseRequested.releaseRequestedByActorId).toBe(
      PLATFORM_IDENTITY.actorId,
    );
    expect(releaseRequested.releasedAt).toBeNull();

    try {
      service.releaseEvidenceLegalHold(
        hold.holdId,
        {
          releaseReason: "regulator packet closed",
          releaseTrigger: "authority",
          releaseReference: "AUTH-REL-2026-001",
        },
        PLATFORM_IDENTITY,
      );
      throw new Error("Expected second approver rejection.");
    } catch (error) {
      expect(getErrorCode(error)).toBe(
        "EVIDENCE_LEGAL_HOLD_SECOND_APPROVER_REQUIRED",
      );
    }

    const platformPlacedRequest = service.releaseEvidenceLegalHold(
      platformPlacedHold.holdId,
      {
        releaseReason: "Platform-placed hold can be requested by the placer.",
      },
      PLATFORM_IDENTITY,
      "req-hold-release-request-002",
    );
    expect(platformPlacedRequest.status).toBe("release_requested");

    try {
      service.releaseEvidenceLegalHold(
        platformPlacedHold.holdId,
        {
          releaseReason: "Platform-placed hold can be requested by the placer.",
        },
        PLATFORM_IDENTITY,
      );
      throw new Error("Expected placer approval rejection.");
    } catch (error) {
      expect(getErrorCode(error)).toBe(
        "EVIDENCE_LEGAL_HOLD_SECOND_APPROVER_REQUIRED",
      );
    }

    const released = service.releaseEvidenceLegalHold(
      hold.holdId,
      {
        releaseReason: "regulator packet closed",
        releaseTrigger: "authority",
        releaseReference: "AUTH-REL-2026-001",
      },
      PLATFORM_IDENTITY_2,
      "req-hold-release-001",
    );
    expect(released.status).toBe("released");
    expect(released.releaseRequestedByActorType).toBe("platform_admin");
    expect(released.releasedByActorType).toBe("platform_admin");
    expect(released.releaseTrigger).toBe("authority");
    expect(released.releaseReference).toBe("AUTH-REL-2026-001");
    expect(released.transitionHistory.map((transition) => transition.to)).toEqual([
      "draft",
      "active",
      "release_requested",
      "released",
    ]);
  });
});
