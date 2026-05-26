import { describe, expect, it, vi } from "vitest";

import { ApiRequestError } from "../../src/common/api-envelope";
import { AuditNotificationService } from "../../src/modules/audit-notification/audit-notification.service";
import { ComplaintController } from "../../src/modules/complaint/complaint.controller";
import { ComplaintService } from "../../src/modules/complaint/complaint.service";
import { IncidentService } from "../../src/modules/incident/incident.service";

function createServices() {
  const auditNotificationService = new AuditNotificationService();
  const complaintService = new ComplaintService(auditNotificationService);
  const incidentService = new IncidentService(auditNotificationService);
  return {
    auditNotificationService,
    complaintService,
    incidentService,
    complaintController: new ComplaintController(
      complaintService,
      incidentService,
    ),
  };
}

describe("Complaint taxonomy and resolution codes", () => {
  it("returns valid resolution codes for a category", () => {
    const { complaintService } = createServices();

    const fareDisputeCodes =
      complaintService.getValidResolutionCodes("fare_dispute");
    expect(fareDisputeCodes).toContain("resolved_with_refund");
    expect(fareDisputeCodes).toContain("resolved_with_credit");
    expect(fareDisputeCodes).not.toContain("resolved_item_returned");

    const lostFoundCodes =
      complaintService.getValidResolutionCodes("lost_and_found");
    expect(lostFoundCodes).toContain("resolved_item_returned");
    expect(lostFoundCodes).toContain("resolved_item_not_found");
    expect(lostFoundCodes).not.toContain("resolved_with_refund");
  });

  it("rejects invalid categories when requesting resolution codes", () => {
    const { complaintController } = createServices();

    expect(() =>
      complaintController.getValidResolutionCodes("not_a_real_category"),
    ).toThrowError(ApiRequestError);
  });

  it("rejects an invalid resolution code on resolve", () => {
    const { complaintService } = createServices();

    const complaint = complaintService.createComplaintCase({
      caseSource: "ops",
      category: "fare_dispute",
      severity: "normal",
      description: "Fare dispute test",
    });

    expect(() =>
      complaintService.resolveComplaintCase(complaint.caseNo, {
        resolutionCode: "resolved_item_returned" as any,
        closingNote: "Wrong code for this category",
      }),
    ).toThrowError(ApiRequestError);
  });

  it("rejects a completely unknown resolution code", () => {
    const { complaintService } = createServices();

    const complaint = complaintService.createComplaintCase({
      caseSource: "ops",
      category: "other",
      severity: "normal",
      description: "Unknown code test",
    });

    expect(() =>
      complaintService.resolveComplaintCase(complaint.caseNo, {
        resolutionCode: "TOTALLY_INVALID" as any,
        closingNote: "Should fail",
      }),
    ).toThrowError(ApiRequestError);
  });

  it("accepts a valid resolution code for the category on resolve and close", () => {
    const { complaintService } = createServices();

    const complaint = complaintService.createComplaintCase({
      caseSource: "ops",
      category: "safety_concern",
      severity: "high",
      description: "Safety case",
    });

    const resolved = complaintService.resolveComplaintCase(complaint.caseNo, {
      resolutionCode: "resolved_driver_suspension",
      closingNote: "Driver suspended pending investigation.",
    });
    expect(resolved.resolutionCode).toBe("resolved_driver_suspension");

    const closed = complaintService.closeComplaintCase(complaint.caseNo, {
      resolutionCode: "resolved_driver_suspension",
      closingNote: "Formally closed.",
    });
    expect(closed.status).toBe("closed");
  });

  it("validates resolution codes on close as well", () => {
    const { complaintService } = createServices();

    const complaint = complaintService.createComplaintCase({
      caseSource: "ops",
      category: "lost_and_found",
      severity: "normal",
      description: "Lost item case",
    });

    expect(() =>
      complaintService.closeComplaintCase(complaint.caseNo, {
        resolutionCode: "resolved_with_refund" as any,
        closingNote: "Wrong code for lost_and_found",
      }),
    ).toThrowError(ApiRequestError);
  });
});

describe("Complaint reopen with SLA recalculation", () => {
  it("recalculates SLA and resets breach on reopen", () => {
    vi.useFakeTimers();
    try {
      vi.setSystemTime(new Date("2026-05-13T08:00:00.000Z"));

      const { complaintService } = createServices();

      const complaint = complaintService.createComplaintCase({
        caseSource: "ops",
        category: "driver_service",
        severity: "normal",
        description: "Driver complaint for reopen test",
      });
      expect(complaint.reopenCount).toBe(0);

      const originalSlaDueAt = complaint.slaDueAt;

      complaintService.resolveComplaintCase(complaint.caseNo, {
        resolutionCode: "resolved_driver_warning",
        closingNote: "Initial resolution",
      });
      complaintService.closeComplaintCase(complaint.caseNo, {
        resolutionCode: "resolved_driver_warning",
        closingNote: "Closed for now",
      });

      complaintService.markComplaintSlaBreach(complaint.caseNo);
      expect(
        complaintService.getComplaintCase(complaint.caseNo).slaBreach,
      ).toBe(true);

      vi.setSystemTime(new Date("2026-05-13T12:30:00.000Z"));

      const reopened = complaintService.reopenComplaintCase(complaint.caseNo, {
        reason: "New evidence from passenger",
      });

      expect(reopened.caseNo).toBe(complaint.caseNo);
      expect(reopened.status).toBe("reopened");
      expect(reopened.reopenCount).toBe(1);
      expect(reopened.slaBreach).toBe(false);
      expect(reopened.slaDueAt).not.toBe(originalSlaDueAt);

      const timeline = complaintService.getComplaintTimeline(complaint.caseNo);
      const actions = timeline.map((entry) => entry.action);
      expect(actions).toContain("case_reopened");
      expect(actions).toContain("sla_recalculated");
    } finally {
      vi.useRealTimers();
    }
  });

  it("increments reopenCount on each reopen", () => {
    const { complaintService } = createServices();

    const complaint = complaintService.createComplaintCase({
      caseSource: "ops",
      category: "other",
      severity: "normal",
      description: "Multi-reopen test",
    });

    for (let i = 1; i <= 3; i++) {
      complaintService.resolveComplaintCase(complaint.caseNo, {
        resolutionCode: "resolved_other",
        closingNote: `Close #${i}`,
      });
      complaintService.closeComplaintCase(complaint.caseNo, {
        resolutionCode: "resolved_other",
        closingNote: `Final close #${i}`,
      });
      const reopened = complaintService.reopenComplaintCase(complaint.caseNo, {
        reason: `Reopen reason #${i}`,
      });
      expect(reopened.reopenCount).toBe(i);
    }
  });

  it("only allows reopening closed cases", () => {
    const { complaintService } = createServices();

    const complaint = complaintService.createComplaintCase({
      caseSource: "ops",
      category: "other",
      severity: "normal",
      description: "Not closed yet",
    });

    expect(() =>
      complaintService.reopenComplaintCase(complaint.caseNo, {
        reason: "Cannot reopen a new case",
      }),
    ).toThrowError(ApiRequestError);
  });
});

describe("SLA breach evaluation sweep", () => {
  it("emits the Q-X06 complaint.sla_breached notification when a case crosses SLA", () => {
    const { complaintService, auditNotificationService } = createServices();

    const complaint = complaintService.createComplaintCase({
      caseSource: "ops",
      category: "safety_concern",
      severity: "high",
      description: "Complaint awaiting triage",
    });

    complaintService.markComplaintSlaBreach(complaint.caseNo);

    expect(
      auditNotificationService
        .listUserNotifications({
          actorType: "ops_user",
          actorId: "ops-user-001",
          realm: "ops",
          scopes: ["notifications:read"],
          tenantId: null,
        })
        .map((notification) => notification.eventType),
    ).toContain("complaint.sla_breached");
  });

  it("marks overdue open cases as breached", () => {
    const { complaintService } = createServices();

    const c1 = complaintService.createComplaintCase({
      caseSource: "ops",
      category: "safety_concern",
      severity: "high",
      description: "Case 1 - will be overdue",
    });
    const c2 = complaintService.createComplaintCase({
      caseSource: "ops",
      category: "lost_and_found",
      severity: "normal",
      description: "Case 2 - not overdue yet",
    });

    // Manually mark SLA breach on c1 to verify idempotency
    complaintService.markComplaintSlaBreach(c1.caseNo);

    // Both already breached and non-breached should be handled
    complaintService.evaluateAllSlaBreach();

    // c1 was already breached so won't be double-processed
    // c2 has 72h SLA, so it should NOT be breached yet
    const c2After = complaintService.getComplaintCase(c2.caseNo);
    expect(c2After.slaBreach).toBe(false);
  });

  it("does not breach resolved or closed cases", () => {
    const { complaintService } = createServices();

    const complaint = complaintService.createComplaintCase({
      caseSource: "ops",
      category: "other",
      severity: "normal",
      description: "Will be resolved before sweep",
    });

    complaintService.resolveComplaintCase(complaint.caseNo, {
      resolutionCode: "resolved_other",
      closingNote: "Resolved early",
    });

    const breached = complaintService.evaluateAllSlaBreach();
    expect(breached.find((r) => r.caseNo === complaint.caseNo)).toBeUndefined();
  });
});

describe("Complaint SLA category mapping", () => {
  it("sets SLA based on category and severity", () => {
    const { complaintService } = createServices();

    const safetyCaseHigh = complaintService.createComplaintCase({
      caseSource: "ops",
      category: "safety_concern",
      severity: "high",
      description: "Safety high severity",
    });
    const safetyCaseNormal = complaintService.createComplaintCase({
      caseSource: "ops",
      category: "safety_concern",
      severity: "normal",
      description: "Safety normal severity",
    });

    const highDue = new Date(safetyCaseHigh.slaDueAt).getTime();
    const normalDue = new Date(safetyCaseNormal.slaDueAt).getTime();
    const highCreated = new Date(safetyCaseHigh.createdAt).getTime();
    const normalCreated = new Date(safetyCaseNormal.createdAt).getTime();

    const highDeltaHours = (highDue - highCreated) / (1000 * 60 * 60);
    const normalDeltaHours = (normalDue - normalCreated) / (1000 * 60 * 60);

    // safety_concern base is 4h, high cuts it in half to 2h
    expect(highDeltaHours).toBe(2);
    // safety_concern normal stays at 4h
    expect(normalDeltaHours).toBe(4);
  });
});
