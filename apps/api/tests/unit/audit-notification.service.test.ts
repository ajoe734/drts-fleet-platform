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

describe("AuditNotificationService evidence governance workflows", () => {
  it("archives notifications idempotently and excludes them from unread summary counts", () => {
    const service = new AuditNotificationService();
    const archived = service.recordNotification({
      tenantId: "tenant-demo-001",
      recipientUserId: "tenant-user-001",
      channel: "tenant_approval",
      severity: "critical",
      title: "Approval escalation",
      message: "Escalated approval requires review.",
      status: "unread",
    });

    const firstPass = service.archiveNotifications(
      { ids: [archived.notificationId] },
      "req-archive-001",
    );
    const secondPass = service.archiveNotifications(
      { ids: [archived.notificationId] },
      "req-archive-002",
    );

    expect(firstPass).toEqual({ updated: 1 });
    expect(secondPass).toEqual({ updated: 0 });
    expect(
      service
        .listNotifications()
        .find(
          (notification) => notification.notificationId === archived.notificationId,
        ),
    ).toMatchObject({
      notificationId: archived.notificationId,
      status: "archived",
      readAt: expect.any(String),
    });
    expect(service.getNotificationSummary().unreadBySeverity.critical).toBe(0);
  });

  it("aggregates unread notifications by severity and channel", () => {
    const service = new AuditNotificationService();
    const readNotification = service.recordNotification({
      tenantId: "tenant-demo-001",
      recipientUserId: "tenant-user-001",
      channel: "driver_task",
      severity: "info",
      title: "Task opened",
      message: "A driver task is available.",
      status: "unread",
    });
    service.markNotificationsRead(
      { notificationIds: [readNotification.notificationId] },
      "req-read-001",
    );
    service.recordNotification({
      tenantId: "tenant-demo-001",
      recipientUserId: "tenant-user-001",
      channel: "platform_admin",
      severity: "critical",
      title: "Rollout blocked",
      message: "A tenant rollout is blocked.",
      status: "unread",
    });
    service.recordNotification({
      tenantId: "tenant-demo-001",
      recipientUserId: "tenant-user-001",
      channel: "partner_booking",
      severity: "info",
      title: "Booking updated",
      message: "A partner booking changed.",
      status: "unread",
    });

    expect(service.getNotificationSummary()).toEqual({
      unreadTotal: 4,
      unreadBySeverity: {
        info: 1,
        warning: 2,
        critical: 1,
      },
      unreadByChannel: {
        tenant_sla: 1,
        ops_notice: 1,
        platform_admin: 1,
        partner_booking: 1,
      },
    });
  });

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
      deletionSuppressed: true,
    });
    expect(governance.activeLegalHolds).toHaveLength(1);
    expect(governance.activeDeletionExceptions).toHaveLength(1);
  });

  it("only allows platform admins to release legal holds", () => {
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

    expect(() =>
      service.releaseEvidenceLegalHold(
        hold.holdId,
        { releaseReason: "ops attempted release" },
        OPS_IDENTITY,
      ),
    ).toThrowError(ApiRequestError);

    const released = service.releaseEvidenceLegalHold(
      hold.holdId,
      { releaseReason: "regulator packet closed" },
      PLATFORM_IDENTITY,
      "req-hold-release-001",
    );
    expect(released.status).toBe("released");
    expect(released.releasedByActorType).toBe("platform_admin");
  });
});
