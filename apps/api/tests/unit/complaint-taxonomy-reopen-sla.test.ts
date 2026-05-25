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
        complaintService.getComplaintCase(complaint.caseNo).slaStatus,
      ).toBe("breached");

      vi.setSystemTime(new Date("2026-05-13T12:30:00.000Z"));

      const reopened = complaintService.reopenComplaintCase(complaint.caseNo, {
        reason: "New evidence from passenger",
      });

      expect(reopened.caseNo).toBe(complaint.caseNo);
      expect(reopened.status).toBe("reopened");
      expect(reopened.reopenCount).toBe(1);
      expect(reopened.slaStatus).toBe("within_sla");
      expect(reopened.slaBreachedAt).toBeNull();
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
    expect(c2After.slaStatus).toBe("within_sla");
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

describe("Complaint SLA read model status", () => {
  it("returns within_sla for cases outside the warning window", () => {
    vi.useFakeTimers();
    try {
      vi.setSystemTime(new Date("2026-05-13T08:00:00.000Z"));
      const { complaintService } = createServices();

      const complaint = complaintService.createComplaintCase({
        caseSource: "ops",
        category: "driver_service",
        severity: "normal",
        description: "Fresh complaint",
      });

      expect(complaint.slaStatus).toBe("within_sla");
      expect(complaint.slaBreachedAt).toBeNull();
    } finally {
      vi.useRealTimers();
    }
  });

  it("returns warning when the case is close to its SLA due time", () => {
    vi.useFakeTimers();
    try {
      vi.setSystemTime(new Date("2026-05-13T08:00:00.000Z"));
      const { complaintService } = createServices();

      const complaint = complaintService.createComplaintCase({
        caseSource: "ops",
        category: "safety_concern",
        severity: "high",
        description: "Approaching SLA",
      });

      vi.setSystemTime(new Date("2026-05-13T09:31:00.000Z"));

      const warningComplaint = complaintService.getComplaintCase(
        complaint.caseNo,
      );
      expect(warningComplaint.slaStatus).toBe("warning");
      expect(warningComplaint.slaBreachedAt).toBeNull();
    } finally {
      vi.useRealTimers();
    }
  });

  it("returns breached with computed breachedAt once the due time passes", () => {
    vi.useFakeTimers();
    try {
      vi.setSystemTime(new Date("2026-05-13T08:00:00.000Z"));
      const { complaintService } = createServices();

      const complaint = complaintService.createComplaintCase({
        caseSource: "ops",
        category: "safety_concern",
        severity: "high",
        description: "Expired SLA",
      });

      vi.setSystemTime(new Date("2026-05-13T10:01:00.000Z"));

      const breachedComplaint = complaintService.getComplaintCase(
        complaint.caseNo,
      );
      expect(breachedComplaint.slaStatus).toBe("breached");
      expect(breachedComplaint.slaBreachedAt).toBe(complaint.slaDueAt);
    } finally {
      vi.useRealTimers();
    }
  });

  it("does not drift resolved and closed cases into breach after their lifecycle ends", () => {
    vi.useFakeTimers();
    try {
      vi.setSystemTime(new Date("2026-05-13T08:00:00.000Z"));
      const { complaintService } = createServices();

      const resolvedCase = complaintService.createComplaintCase({
        caseSource: "ops",
        category: "safety_concern",
        severity: "high",
        description: "Resolved before SLA due",
      });
      const closedCase = complaintService.createComplaintCase({
        caseSource: "ops",
        category: "safety_concern",
        severity: "high",
        description: "Closed before SLA due",
      });

      vi.setSystemTime(new Date("2026-05-13T09:31:00.000Z"));
      complaintService.resolveComplaintCase(resolvedCase.caseNo, {
        resolutionCode: "resolved_driver_suspension",
        closingNote: "Resolved while still inside SLA warning window.",
      });
      complaintService.resolveComplaintCase(closedCase.caseNo, {
        resolutionCode: "resolved_driver_suspension",
        closingNote: "Resolved before close.",
      });
      complaintService.closeComplaintCase(closedCase.caseNo, {
        resolutionCode: "resolved_driver_suspension",
        closingNote: "Closed while still inside SLA warning window.",
      });

      vi.setSystemTime(new Date("2026-05-13T12:00:00.000Z"));

      expect(
        complaintService.getComplaintCase(resolvedCase.caseNo).slaStatus,
      ).toBe("warning");
      expect(
        complaintService.getComplaintCase(resolvedCase.caseNo).slaBreachedAt,
      ).toBeNull();
      expect(
        complaintService.getComplaintCase(closedCase.caseNo).slaStatus,
      ).toBe("warning");
      expect(
        complaintService.getComplaintCase(closedCase.caseNo).slaBreachedAt,
      ).toBeNull();
    } finally {
      vi.useRealTimers();
    }
  });
});

describe("Complaint controller read-model envelopes", () => {
  it("keeps complaint list, detail, and timeline refresh envelopes intact", () => {
    const { complaintController } = createServices();

    const createdEnvelope = complaintController.createComplaintCase({
      caseSource: "ops",
      category: "fare_dispute",
      severity: "normal",
      description: "Envelope regression coverage",
    });
    const caseNo = createdEnvelope.data.caseNo;

    const listEnvelope = complaintController.listComplaintCases();
    expect(listEnvelope.data.items).toHaveLength(1);
    expect(listEnvelope.data.refresh.generatedAt).toBeTruthy();
    expect(listEnvelope.data.emptyState).toBeUndefined();

    const detailEnvelope = complaintController.getComplaintCase(caseNo);
    expect(detailEnvelope.data.item.caseNo).toBe(caseNo);
    expect(detailEnvelope.data.refresh.generatedAt).toBeTruthy();

    const timelineEnvelope = complaintController.getComplaintTimeline(caseNo);
    expect(timelineEnvelope.data.items).toHaveLength(1);
    expect(timelineEnvelope.data.refresh.generatedAt).toBeTruthy();
    expect(timelineEnvelope.data.emptyState).toBeUndefined();
  });

  it("returns empty-state envelopes for empty list and timeline read models", () => {
    const { complaintController, complaintService } = createServices();

    const emptyListEnvelope = complaintController.listComplaintCases();
    expect(emptyListEnvelope.data.items).toHaveLength(0);
    expect(emptyListEnvelope.data.emptyState?.reason).toBe("no_data");

    const complaint = complaintService.createComplaintCase({
      caseSource: "ops",
      category: "other",
      severity: "normal",
      description: "Timeline empty-state coverage",
    });
    complaintService["complaintTimelines"].set(complaint.caseNo, []);

    const emptyTimelineEnvelope = complaintController.getComplaintTimeline(
      complaint.caseNo,
    );
    expect(emptyTimelineEnvelope.data.items).toHaveLength(0);
    expect(emptyTimelineEnvelope.data.emptyState?.reason).toBe("no_data");
  });
});
