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

  it("flushes due reminders before moving a review-approved notification to submitted", () => {
    let now = new Date("2026-06-26T00:00:00.000Z");
    const auditNotificationService = new AuditNotificationService();
    const service = new RegulatoryReportingService(auditNotificationService);
    service.setClockForTests(() => now);

    const draft = service.createNotification(
      {
        eventId: "evt-reg-004",
        eventType: "cybersecurity_alert",
        severity: "cybersecurity",
        reportVersionKind: "initial",
        jurisdiction: "CA-CPUC",
        vehicleId: "veh-reg-004",
        eventOccurredAt: "2026-06-26T00:00:00.000Z",
        summary: "Cybersecurity disclosure requires same-day reporting.",
      },
      createIdentity(),
      "req-reg-create-004",
    );

    service.submitReview(
      draft.notificationId,
      { note: "Ready for review." },
      createIdentity(),
      "req-reg-review-004",
    );
    service.approveReview(
      draft.notificationId,
      { note: "Approved." },
      createIdentity({
        actorId: "ops-user-approve-004",
        roles: ["compliance_manager"],
      }),
      "req-reg-approve-004",
    );

    now = new Date("2026-06-26T05:00:00.000Z");
    const submitted = service.submitNotification(
      draft.notificationId,
      {
        submissionReference: "SUB-REG-004",
        submittedAt: "2026-06-26T05:00:00.000Z",
      },
      createIdentity({
        actorId: "ops-user-submit-004",
        roles: ["compliance_manager"],
      }),
      "req-reg-submit-004",
    );

    expect(submitted.lifecycleStatus).toBe("submitted");
    expect(submitted.reminders).toEqual(
      expect.arrayContaining([
        expect.objectContaining({
          minutesBeforeDeadline: 240,
          dueAt: "2026-06-26T04:00:00.000Z",
          sentAt: "2026-06-26T05:00:00.000Z",
        }),
      ]),
    );
    expect(
      auditNotificationService
        .listNotifications()
        .filter((notification) => notification.title === "Regulatory notification reminder"),
    ).toHaveLength(1);
    expect(
      auditNotificationService
        .listAuditLogs()
        .some(
          (entry) =>
            entry.actionName === "regulatory_notification_reminder_sent" &&
            entry.resourceId === draft.notificationId,
        ),
    ).toBe(true);
  });

  it("does not retroactively flush reminders that were still in the future at backfilled submittedAt", () => {
    let now = new Date("2026-06-26T00:00:00.000Z");
    const auditNotificationService = new AuditNotificationService();
    const service = new RegulatoryReportingService(auditNotificationService);
    service.setClockForTests(() => now);

    const draft = service.createNotification(
      {
        eventId: "evt-reg-006",
        eventType: "information_update",
        severity: "informational",
        reportVersionKind: "initial",
        jurisdiction: "CA-CPUC",
        vehicleId: "veh-reg-006",
        eventOccurredAt: "2026-06-26T00:00:00.000Z",
        summary: "Backfilled submit should not send future reminders retroactively.",
      },
      createIdentity(),
      "req-reg-create-006",
    );

    service.submitReview(
      draft.notificationId,
      { note: "Ready for review." },
      createIdentity(),
      "req-reg-review-006",
    );
    service.approveReview(
      draft.notificationId,
      { note: "Approved." },
      createIdentity({
        actorId: "ops-user-approve-006",
        roles: ["compliance_manager"],
      }),
      "req-reg-approve-006",
    );

    now = new Date("2026-06-27T12:30:00.000Z");
    const submitted = service.submitNotification(
      draft.notificationId,
      {
        submissionReference: "SUB-REG-006",
        submittedAt: "2026-06-26T12:30:00.000Z",
      },
      createIdentity({
        actorId: "ops-user-submit-006",
        roles: ["compliance_manager"],
      }),
      "req-reg-submit-006",
    );

    const reminder24h = submitted.reminders.find(
      (reminder) => reminder.minutesBeforeDeadline === 24 * 60,
    );
    const reminder1h = submitted.reminders.find(
      (reminder) => reminder.minutesBeforeDeadline === 60,
    );

    expect(reminder24h?.sentAt).toBeNull();
    expect(reminder1h?.sentAt).toBeNull();
    expect(
      auditNotificationService
        .listNotifications()
        .filter((notification) => notification.title === "Regulatory notification reminder"),
    ).toHaveLength(0);
    expect(
      auditNotificationService
        .listAuditLogs()
        .some(
          (entry) =>
            entry.actionName === "regulatory_notification_reminder_sent" &&
            entry.resourceId === draft.notificationId,
        ),
    ).toBe(false);
  });

  it("rejects review approval when roleFamilies are spoofed without an approver role code", () => {
    const auditNotificationService = new AuditNotificationService();
    const service = new RegulatoryReportingService(auditNotificationService);

    const draft = service.createNotification(
      {
        eventId: "evt-reg-003",
        eventType: "collision",
        severity: "incident",
        reportVersionKind: "initial",
        jurisdiction: "CA-CPUC",
        vehicleId: "veh-reg-003",
        eventOccurredAt: "2026-06-26T01:00:00.000Z",
        summary: "Spoofed roleFamilies must not bypass approver roles.",
      },
      createIdentity(),
      "req-reg-create-003",
    );

    service.submitReview(
      draft.notificationId,
      { note: "Ready for approval." },
      createIdentity(),
      "req-reg-review-003",
    );

    expect(() =>
      service.approveReview(
        draft.notificationId,
        { note: "Spoofed platform family should fail." },
        createIdentity({
          actorId: "ops-user-approve-003",
          roles: ["dispatcher"],
          roleFamilies: ["ops", "platform"],
        }),
        "req-reg-approve-003",
      ),
    ).toThrowError(ApiRequestError);
  });

  it("rejects invalid create payloads with validation errors instead of runtime failures", () => {
    const auditNotificationService = new AuditNotificationService();
    const service = new RegulatoryReportingService(auditNotificationService);

    try {
      service.createNotification(
        {
          eventType: "collision",
          severity: "incident",
          reportVersionKind: "initial",
          jurisdiction: "CA-CPUC",
          vehicleId: "veh-reg-invalid-001",
          eventOccurredAt: "2026-06-26T01:00:00.000Z",
          summary: "Missing event id should fail cleanly.",
        } as never,
        createIdentity(),
        "req-reg-invalid-create-001",
      );
      throw new Error("Expected missing eventId to be rejected.");
    } catch (error) {
      expect(error).toBeInstanceOf(ApiRequestError);
      expect((error as ApiRequestError).getStatus()).toBe(400);
      expect((error as ApiRequestError).getResponse()).toMatchObject({
        error: {
          code: "VALIDATION_ERROR",
          message: "eventId must be a string.",
          details: {
            field: "eventId",
          },
        },
      });
    }

    try {
      service.createNotification(
        {
          eventId: "evt-reg-invalid-002",
          eventType: "collision",
          severity: "not_real",
          reportVersionKind: "initial",
          jurisdiction: "CA-CPUC",
          vehicleId: "veh-reg-invalid-002",
          eventOccurredAt: "2026-06-26T01:00:00.000Z",
          summary: "Invalid severity should be rejected.",
        } as never,
        createIdentity(),
        "req-reg-invalid-create-002",
      );
      throw new Error("Expected invalid severity to be rejected.");
    } catch (error) {
      expect(error).toBeInstanceOf(ApiRequestError);
      expect((error as ApiRequestError).getStatus()).toBe(400);
      expect((error as ApiRequestError).getResponse()).toMatchObject({
        error: {
          code: "VALIDATION_ERROR",
          message:
            "severity must be one of: informational, incident, injury_or_fatality, cybersecurity.",
          details: {
            field: "severity",
          },
        },
      });
    }

    try {
      service.createNotification(
        {
          eventId: "evt-reg-invalid-003",
          eventType: "collision",
          severity: "incident",
          reportVersionKind: "bogus",
          jurisdiction: "CA-CPUC",
          vehicleId: "veh-reg-invalid-003",
          eventOccurredAt: "2026-06-26T01:00:00.000Z",
          summary: "Invalid report version kind should be rejected.",
        } as never,
        createIdentity(),
        "req-reg-invalid-create-003",
      );
      throw new Error("Expected invalid reportVersionKind to be rejected.");
    } catch (error) {
      expect(error).toBeInstanceOf(ApiRequestError);
      expect((error as ApiRequestError).getStatus()).toBe(400);
      expect((error as ApiRequestError).getResponse()).toMatchObject({
        error: {
          code: "VALIDATION_ERROR",
          message: "reportVersionKind must be one of: initial, follow_up, final.",
          details: {
            field: "reportVersionKind",
          },
        },
      });
    }
  });

  it("does not raise overdue when a backfilled submittedAt beats the deadline", () => {
    let now = new Date("2026-06-26T07:30:00.000Z");
    const auditNotificationService = new AuditNotificationService();
    const service = new RegulatoryReportingService(auditNotificationService);
    service.setClockForTests(() => now);

    const draft = service.createNotification(
      {
        eventId: "evt-reg-004",
        eventType: "security_alert",
        severity: "cybersecurity",
        reportVersionKind: "initial",
        jurisdiction: "US-NHTSA",
        vehicleId: "veh-reg-004",
        eventOccurredAt: "2026-06-26T00:00:00.000Z",
        summary: "Submission was timely even though entered later.",
      },
      createIdentity(),
      "req-reg-create-004",
    );

    service.submitReview(
      draft.notificationId,
      { note: "Ready for review." },
      createIdentity(),
      "req-reg-review-004",
    );
    service.approveReview(
      draft.notificationId,
      { note: "Approved." },
      createIdentity({
        actorId: "ops-user-approve-004",
        roles: ["security_manager"],
      }),
      "req-reg-approve-004",
    );

    now = new Date("2026-06-26T10:05:00.000Z");

    const submitted = service.submitNotification(
      draft.notificationId,
      {
        submissionReference: "SUB-REG-004",
        submittedAt: "2026-06-26T07:59:00.000Z",
      },
      createIdentity({
        actorId: "ops-user-submit-004",
        roles: ["security_manager"],
      }),
      "req-reg-submit-004",
    );

    expect(submitted.lifecycleStatus).toBe("submitted");
    expect(submitted.overdue).toBe(false);
    expect(submitted.overdueRaisedAt).toBeNull();
    expect(
      auditNotificationService
        .listNotifications()
        .some((notification) => notification.title === "REGULATORY_NOTIFICATION_OVERDUE"),
    ).toBe(false);
    expect(
      auditNotificationService
        .listAuditLogs()
        .some((entry) => entry.actionName === "REGULATORY_NOTIFICATION_OVERDUE"),
    ).toBe(false);
  });

  it("rejects repeated acknowledgement attempts", () => {
    const auditNotificationService = new AuditNotificationService();
    const service = new RegulatoryReportingService(auditNotificationService);

    const draft = service.createNotification(
      {
        eventId: "evt-reg-005",
        eventType: "odd_boundary_exit",
        severity: "incident",
        reportVersionKind: "follow_up",
        jurisdiction: "TW-MOTC",
        vehicleId: "veh-reg-005",
        eventOccurredAt: "2026-06-26T01:30:00.000Z",
        summary: "Acknowledgement should be immutable after first receipt.",
      },
      createIdentity(),
      "req-reg-create-005",
    );

    service.submitReview(
      draft.notificationId,
      { note: "Ready for review." },
      createIdentity(),
      "req-reg-review-005",
    );
    service.approveReview(
      draft.notificationId,
      { note: "Approved." },
      createIdentity({
        actorId: "ops-user-approve-005",
        roles: ["compliance_manager"],
      }),
      "req-reg-approve-005",
    );
    service.submitNotification(
      draft.notificationId,
      {
        submissionReference: "SUB-REG-005",
        submittedAt: "2026-06-26T02:10:00.000Z",
      },
      createIdentity({
        actorId: "ops-user-submit-005",
        roles: ["compliance_manager"],
      }),
      "req-reg-submit-005",
    );

    const acknowledged = service.acknowledgeNotification(
      draft.notificationId,
      {
        acknowledgementReference: "ACK-REG-005",
        acknowledgedAt: "2026-06-26T02:20:00.000Z",
      },
      createIdentity({
        actorId: "ops-user-ack-005",
        roles: ["compliance_manager"],
      }),
      "req-reg-ack-005",
    );

    expect(acknowledged.lifecycleStatus).toBe("acknowledged");
    expect(() =>
      service.acknowledgeNotification(
        draft.notificationId,
        {
          acknowledgementReference: "ACK-REG-005-B",
          acknowledgedAt: "2026-06-26T02:30:00.000Z",
        },
        createIdentity({
          actorId: "ops-user-ack-005b",
          roles: ["compliance_manager"],
        }),
        "req-reg-ack-005b",
      ),
    ).toThrowError(ApiRequestError);

    const persisted = service.getNotification(draft.notificationId);
    expect(persisted.acknowledgementReference).toBe("ACK-REG-005");
    expect(persisted.acknowledgedBy).toBe("ops-user-ack-005");
    expect(persisted.acknowledgedAt).toBe("2026-06-26T02:20:00.000Z");
  });

  it("keeps overdue latched for late submissions and stops reminders after submit", () => {
    let now = new Date("2026-06-26T10:00:00.000Z");
    const auditNotificationService = new AuditNotificationService();
    const service = new RegulatoryReportingService(auditNotificationService);
    service.setClockForTests(() => now);

    const draft = service.createNotification(
      {
        eventId: "evt-reg-003",
        eventType: "security_alert",
        severity: "cybersecurity",
        reportVersionKind: "final",
        jurisdiction: "US-NHTSA",
        vehicleId: "veh-reg-003",
        eventOccurredAt: "2026-06-26T00:00:00.000Z",
        summary: "Cybersecurity filing remains open past deadline.",
      },
      createIdentity(),
      "req-reg-create-003",
    );

    service.submitReview(
      draft.notificationId,
      { note: "Ready for security review." },
      createIdentity(),
      "req-reg-review-003",
    );
    service.approveReview(
      draft.notificationId,
      { note: "Approved." },
      createIdentity({
        actorId: "ops-user-approve-003",
        roles: ["security_manager"],
      }),
      "req-reg-approve-003",
    );

    now = new Date("2026-06-26T10:05:00.000Z");
    const overdueBeforeSubmit = service.getNotification(draft.notificationId);
    expect(overdueBeforeSubmit.overdue).toBe(true);
    expect(overdueBeforeSubmit.overdueRaisedAt).toBe("2026-06-26T10:00:00.000Z");

    const reminderCountBeforeSubmit = auditNotificationService
      .listNotifications()
      .filter((notification) => notification.title === "Regulatory notification reminder")
      .length;

    const submitted = service.submitNotification(
      draft.notificationId,
      {
        submissionReference: "SUB-REG-003",
        submittedAt: "2026-06-26T10:06:00.000Z",
      },
      createIdentity({
        actorId: "ops-user-submit-003",
        roles: ["security_manager"],
      }),
      "req-reg-submit-003",
    );
    expect(submitted.overdue).toBe(true);

    now = new Date("2026-06-26T12:30:00.000Z");
    const afterSubmit = service.getNotification(draft.notificationId);
    expect(afterSubmit.lifecycleStatus).toBe("submitted");
    expect(afterSubmit.overdue).toBe(true);

    const reminderCountAfterSubmit = auditNotificationService
      .listNotifications()
      .filter((notification) => notification.title === "Regulatory notification reminder")
      .length;
    expect(reminderCountAfterSubmit).toBe(reminderCountBeforeSubmit);
  });
});
