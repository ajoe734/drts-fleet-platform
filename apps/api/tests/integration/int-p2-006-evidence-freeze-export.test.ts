import { describe, expect, it } from "vitest";

import { PHASE2_AUDIT_EVENT_CATALOG } from "@drts/contracts";
import { buildMockRecorderFixture } from "../../../../packages/shared-test-fixtures/src";

import { ApiRequestError } from "../../src/common/api-envelope";
import { AuditNotificationService } from "../../src/modules/audit-notification/audit-notification.service";
import { VehicleEvidenceService } from "../../src/modules/vehicle-evidence/vehicle-evidence.service";

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

function getErrorCode(error: unknown) {
  if (!(error instanceof ApiRequestError)) {
    throw error;
  }
  const response = error.getResponse() as { error: { code: string } };
  return response.error.code;
}

describe("INT-P2-006 / E2E-P2-006 / UAT-AV-009 vehicle evidence freeze + export", () => {
  it("seals a freeze, issues a controlled export, and blocks purge while a legal hold is active", async () => {
    const auditNotificationService = new AuditNotificationService();
    const vehicleEvidenceService = new VehicleEvidenceService(
      auditNotificationService,
    );
    const recorder = buildMockRecorderFixture({
      recorderId: "rec-int-p2-006",
      vehicleId: "veh-int-p2-006",
    });
    vehicleEvidenceService.registerRecorder(recorder);

    const freeze = await vehicleEvidenceService.requestEvidenceFreeze(
      recorder.recorderId,
      {
        vehicleId: recorder.vehicleId,
        windowStart: "2026-06-26T14:00:00.000Z",
        windowEnd: "2026-06-26T14:05:00.000Z",
        caseId: "case-int-p2-006",
        caseReference: "CASE-INT-P2-006",
        reason: "Freeze AV evidence for regulator handoff.",
      },
      OPS_IDENTITY,
      "req-int-p2-006-freeze",
    );
    const verification = await vehicleEvidenceService.verifyEvidenceFreeze(
      freeze.freezeId,
      "req-int-p2-006-verify",
      OPS_IDENTITY,
    );
    const exportRecord = vehicleEvidenceService.issueControlledExport(
      freeze.freezeId,
      {
        reason: "Controlled export for case review.",
        caseReference: "CASE-INT-P2-006",
        stepUpMethod: "webauthn",
        stepUpVerifiedAt: "2026-06-26T14:06:00.000Z",
        stepUpSessionId: "mfa-int-p2-006",
      },
      OPS_IDENTITY,
      "req-int-p2-006-export",
    );
    const hold = auditNotificationService.placeEvidenceLegalHold(
      {
        family: "vehicle_evidence",
        subjectId: freeze.freezeId,
        caseNumber: "CASE-INT-P2-006",
        reasonCode: "regulatory_inquiry",
        manifestHash: freeze.manifestHash,
      },
      OPS_IDENTITY,
      "req-int-p2-006-hold",
    );
    const schedulerResult = await vehicleEvidenceService.runDeletionScheduler(
      {
        artifactId: freeze.artifacts[0]!.artifactId,
        currentTime: "2026-06-26T14:07:00.000Z",
      },
      "req-int-p2-006-scheduler",
    );

    expect(freeze.status).toBe("sealed");
    expect(verification.valid).toBe(true);
    expect(exportRecord.download.ttlMinutes).toBeLessThanOrEqual(15);
    expect(schedulerResult).toMatchObject({
      decision: "skipped_due_to_hold",
      emittedEvent:
        PHASE2_AUDIT_EVENT_CATALOG.evidence.deletionByDecision.skippedDueToHold,
      holdIds: [hold.holdId],
      conflictExceptionId: expect.any(String),
    });
    expect(
      vehicleEvidenceService.listEvidenceAccessLogs({
        freezeId: freeze.freezeId,
      }),
    ).toEqual(
      expect.arrayContaining([
        expect.objectContaining({
          freezeId: freeze.freezeId,
          action: "export",
        }),
        expect.objectContaining({
          freezeId: freeze.freezeId,
          action: "signed_url",
        }),
        expect.objectContaining({
          freezeId: freeze.freezeId,
          action: "purge_skip",
        }),
      ]),
    );

    try {
      vehicleEvidenceService.purgeArtifact(
        freeze.artifacts[0]!.artifactId,
        {
          reason: "Attempt purge during active legal hold.",
          overrideObjectLock: true,
        },
        PLATFORM_IDENTITY,
        "req-int-p2-006-purge",
      );
      throw new Error("Expected legal hold rejection.");
    } catch (error) {
      expect(getErrorCode(error)).toBe("EVIDENCE_DELETION_BLOCKED_BY_HOLD");
    }

    expect(auditNotificationService.getAuditLogsSnapshot()).toEqual(
      expect.arrayContaining([
        expect.objectContaining({
          actionName: "issue_vehicle_evidence_export",
          resourceId: exportRecord.exportId,
        }),
        expect.objectContaining({
          actionName: "place_evidence_legal_hold",
          resourceId: hold.holdId,
        }),
        expect.objectContaining({
          actionName:
            PHASE2_AUDIT_EVENT_CATALOG.evidence.deletionByDecision
              .skippedDueToHold,
          resourceId: freeze.artifacts[0]!.artifactId,
        }),
      ]),
    );
  });
});
