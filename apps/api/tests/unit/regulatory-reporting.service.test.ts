import { describe, expect, it } from "vitest";

import { ApiRequestError } from "../../src/common/api-envelope";
import { AuditNotificationService } from "../../src/modules/audit-notification/audit-notification.service";
import { RegulatoryReportingService } from "../../src/modules/regulatory-reporting/regulatory-reporting.service";

function createIdentity(overrides: Record<string, unknown> = {}) {
  return {
    authMode: "bootstrap_headers" as const,
    actorType: "ops_user" as const,
    actorId: "ops-user-001",
    realm: "ops" as const,
    tenantId: null,
    roleFamilies: ["ops"] as const,
    roles: ["compliance_manager"],
    scopes: ["regulatory:write", "regulatory:read"],
    requestId: "req-reg-unit-001",
    ...overrides,
  };
}

describe("RegulatoryReportingService", () => {
  it("drives deadlines and recipients from the policy matrix and emits overdue reminders", () => {
    let now = new Date("2026-06-26T00:00:00.000Z");
    const auditNotificationService = new AuditNotificationService();
    const service = new RegulatoryReportingService(auditNotificationService);
    service.setClockForTests(() => now);

    const created = service.createNotification(
      {
        eventId: "evt-reg-001",
        eventType: "collision",
        severity: "injury_or_fatality",
        reportVersionKind: "initial",
        jurisdiction: "CA-CPUC",
        vehicleId: "veh-reg-001",
        eventOccurredAt: "2026-06-25T23:30:00.000Z",
        summary: "Collision with injury.",
      },
      createIdentity(),
      "req-reg-create-001",
    );

    expect(created.deadlineAt).toBe("2026-06-26T01:30:00.000Z");
    expect(created.recipients.map((recipient) => recipient.recipientId)).toEqual(
      expect.arrayContaining([
        "reg-compliance-inbox",
        "safety-ops-hotline",
        "legal-duty",
      ]),
    );
    expect(created.approverRoleCodes).toEqual([
      "compliance_manager",
      "legal_reviewer",
      "platform_admin",
    ]);

    now = new Date("2026-06-26T01:31:00.000Z");
    const overdue = service.getNotification(created.notificationId);
    expect(overdue.overdue).toBe(true);
    expect(overdue.overdueRaisedAt).toBe("2026-06-26T01:31:00.000Z");
    expect(overdue.reminders.every((reminder) => reminder.sentAt !== null)).toBe(
      true,
    );
    expect(
      auditNotificationService
        .listNotifications()
        .some((notification) => notification.title === "REGULATORY_NOTIFICATION_OVERDUE"),
    ).toBe(true);
    expect(
      auditNotificationService
        .listAuditLogs()
        .some((entry) => entry.actionName === "REGULATORY_NOTIFICATION_OVERDUE"),
    ).toBe(true);
  });

  it("requires separate approver roles before submission and acknowledgement", () => {
    let now = new Date("2026-06-26T02:00:00.000Z");
    const auditNotificationService = new AuditNotificationService();
    const service = new RegulatoryReportingService(auditNotificationService);
    service.setClockForTests(() => now);

    const draft = service.createNotification(
      {
        eventId: "evt-reg-002",
        eventType: "odd_boundary_exit",
        severity: "incident",
        reportVersionKind: "follow_up",
        jurisdiction: "TW-MOTC",
        vehicleId: "veh-reg-002",
        incidentId: "inc-reg-002",
        reportId: "report-reg-002",
        eventOccurredAt: "2026-06-26T01:30:00.000Z",
        summary: "Boundary exit requires regulator follow-up.",
      },
      createIdentity(),
      "req-reg-create-002",
    );

    const inReview = service.submitReview(
      draft.notificationId,
      { note: "Ready for compliance review." },
      createIdentity(),
      "req-reg-review-002",
    );
    expect(inReview.lifecycleStatus).toBe("review_pending");

    expect(() =>
      service.approveReview(
        draft.notificationId,
        { note: "self approval should fail" },
        createIdentity(),
        "req-reg-approve-self-002",
      ),
    ).toThrowError(ApiRequestError);

    const approved = service.approveReview(
      draft.notificationId,
      { note: "Approved by separate reviewer." },
      createIdentity({
        actorId: "ops-user-002",
        roles: ["compliance_manager"],
      }),
      "req-reg-approve-002",
    );
    expect(approved.lifecycleStatus).toBe("review_approved");

    now = new Date("2026-06-26T02:10:00.000Z");
    const submitted = service.submitNotification(
      draft.notificationId,
      {
        submissionReference: "SUB-REG-002",
        submittedAt: "2026-06-26T02:10:00.000Z",
      },
      createIdentity({
        actorId: "ops-user-003",
        roles: ["compliance_manager"],
      }),
      "req-reg-submit-002",
    );
    expect(submitted.lifecycleStatus).toBe("submitted");
    expect(submitted.submissionReference).toBe("SUB-REG-002");

    const acknowledged = service.acknowledgeNotification(
      draft.notificationId,
      {
        acknowledgementReference: "ACK-REG-002",
        acknowledgedAt: "2026-06-26T02:20:00.000Z",
      },
      createIdentity({
        actorId: "ops-user-004",
        roles: ["compliance_manager"],
      }),
      "req-reg-ack-002",
    );
    expect(acknowledged.lifecycleStatus).toBe("acknowledged");
    expect(acknowledged.acknowledgementReference).toBe("ACK-REG-002");

    const auditActions = auditNotificationService
      .listAuditLogs()
      .filter((entry) => entry.moduleName === "regulatory-reporting")
      .map((entry) => entry.actionName);
    expect(auditActions).toEqual(
      expect.arrayContaining([
        "create_regulatory_notification_draft",
        "submit_regulatory_notification_review",
        "approve_regulatory_notification_review",
        "submit_regulatory_notification",
        "acknowledge_regulatory_notification",
      ]),
    );
  });
});
