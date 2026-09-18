import { describe, expect, it } from "vitest";

import { ApiRequestError } from "../../../../apps/api/src/common/api-envelope";
import { AuditNotificationService } from "../../../../apps/api/src/modules/audit-notification/audit-notification.service";
import { ComplaintService } from "../../../../apps/api/src/modules/complaint/complaint.service";

function setupService() {
  const auditService = new AuditNotificationService();
  const complaintService = new ComplaintService(auditService);
  return { auditService, complaintService };
}

describe("C045: Complaint Lifecycle, SLA Calculation, and Case Reopening (SR-QA-CALL-001)", () => {
  describe("Positive workflows: category intake, SLA target assignment, investigation, resolution, closure & reopening", () => {
    it("creates complaint cases with category-specific SLA hours and calculates slaDueAt", () => {
      const { complaintService } = setupService();

      // 1. Safety concern category has 4-hour SLA
      const safetyCase = complaintService.createComplaintCase({
        caseSource: "phone",
        category: "safety_concern",
        severity: "normal",
        description: "Driver speeding and running red lights",
      });
      expect(safetyCase.category).toBe("safety_concern");
      expect(safetyCase.slaBreach).toBe(false);

      const safetyDue = new Date(safetyCase.slaDueAt).getTime();
      const safetyCreated = new Date(safetyCase.createdAt).getTime();
      const safetyHours = (safetyDue - safetyCreated) / (1000 * 60 * 60);
      expect(Math.round(safetyHours)).toBe(4);

      // 2. Late arrival category has 24-hour SLA
      const lateCase = complaintService.createComplaintCase({
        caseSource: "ops",
        category: "late_arrival",
        severity: "normal",
        description: "Vehicle arrived 30 minutes late",
      });
      const lateDue = new Date(lateCase.slaDueAt).getTime();
      const lateCreated = new Date(lateCase.createdAt).getTime();
      const lateHours = (lateDue - lateCreated) / (1000 * 60 * 60);
      expect(Math.round(lateHours)).toBe(24);

      // 3. Lost and found category has 72-hour SLA
      const lostCase = complaintService.createComplaintCase({
        caseSource: "app",
        category: "lost_and_found",
        severity: "normal",
        description: "Passenger left an umbrella in the back seat",
      });
      const lostDue = new Date(lostCase.slaDueAt).getTime();
      const lostCreated = new Date(lostCase.createdAt).getTime();
      const lostHours = (lostDue - lostCreated) / (1000 * 60 * 60);
      expect(Math.round(lostHours)).toBe(72);
    });

    it("assigns specialist, adds investigation notes, and resolves and closes complaint case", () => {
      const { auditService, complaintService } = setupService();

      const complaintCase = complaintService.createComplaintCase({
        caseSource: "phone",
        category: "driver_service",
        severity: "normal",
        description: "Passenger reported impolite attitude from driver",
      });

      // Assign case to specialist
      const assigned = complaintService.assignComplaintCase(
        complaintCase.caseNo,
        {
          assigneeId: "specialist-lin-01",
          note: "Assigned to customer care specialist for investigation",
        },
        "req-assign-01",
      );
      expect(assigned.assigneeId).toBe("specialist-lin-01");
      expect(assigned.status).toBe("assigned");

      // Add investigation note
      complaintService.addComplaintCaseNote(
        complaintCase.caseNo,
        {
          note: "Reviewed in-vehicle audio recording and contacted driver for statement",
        },
        "req-note-01",
      );

      // Resolve case with valid resolution code
      const resolved = complaintService.resolveComplaintCase(
        complaintCase.caseNo,
        {
          resolutionCode: "resolved_driver_warning",
          closingNote: "Issued formal warning to driver; driver acknowledged service standards.",
        },
        "req-resolve-01",
      );
      expect(resolved.status).toBe("resolved");
      expect(resolved.resolutionCode).toBe("resolved_driver_warning");

      // Close case
      const closed = complaintService.closeComplaintCase(
        complaintCase.caseNo,
        {
          resolutionCode: "resolved_driver_warning",
          closingNote: "Customer accepted resolution note and case is officially closed.",
        },
        "req-close-01",
      );
      expect(closed.status).toBe("closed");
      expect(closed.closingNote).toContain("Customer accepted resolution note");

      // Check timeline entries
      const timeline = complaintService.getComplaintTimeline(complaintCase.caseNo);
      const actions = timeline.map((entry) => entry.action);
      expect(actions).toContain("case_created");
      expect(actions).toContain("case_assigned");
      expect(actions).toContain("case_note_added");
      expect(actions).toContain("case_resolved");
      expect(actions).toContain("case_closed");

      // Verify audit trail
      const audits = auditService.listAuditLogs();
      expect(audits.some((a) => a.actionName === "assign_complaint_case")).toBe(true);
      expect(audits.some((a) => a.actionName === "close_complaint_case")).toBe(true);
    });

    it("reopens a closed complaint case on the SAME case number and recalculates SLA", () => {
      const { complaintService } = setupService();

      const complaintCase = complaintService.createComplaintCase({
        caseSource: "ops",
        category: "fare_dispute",
        severity: "normal",
        description: "Dispute regarding meter toll surcharge",
      });

      // Resolve and close case
      complaintService.resolveComplaintCase(complaintCase.caseNo, {
        resolutionCode: "resolved_with_refund",
        closingNote: "Initial refund processed",
      });
      const closed = complaintService.closeComplaintCase(complaintCase.caseNo, {
        resolutionCode: "resolved_with_refund",
        closingNote: "Closed after initial refund",
      });
      expect(closed.status).toBe("closed");
      expect(closed.reopenCount).toBe(0);

      // Reopen the closed case with supplementary evidence
      const reopened = complaintService.reopenComplaintCase(
        complaintCase.caseNo,
        {
          reason: "Passenger submitted additional payment receipt proving double deduction",
        },
        "req-reopen-01",
      );

      // Verify same case number is strictly preserved
      expect(reopened.caseNo).toBe(complaintCase.caseNo);
      expect(reopened.status).toBe("reopened");
      expect(reopened.reopenCount).toBe(1);
      expect(reopened.slaBreach).toBe(false);

      // Verify SLA recalculation entry in timeline
      const timeline = complaintService.getComplaintTimeline(complaintCase.caseNo);
      const reopenEntry = timeline.find((e) => e.action === "case_reopened");
      const slaEntry = timeline.find((e) => e.action === "sla_recalculated");

      expect(reopenEntry).toBeDefined();
      expect(reopenEntry?.note).toContain("double deduction");
      expect(slaEntry).toBeDefined();
      expect(slaEntry?.note).toContain("Reopen #1");
    });
  });

  describe("Negative & boundary cases: invalid resolutions, non-closed reopen, SLA breach detection", () => {
    it("rejects resolution code incompatible with complaint category", () => {
      const { complaintService } = setupService();

      const complaintCase = complaintService.createComplaintCase({
        caseSource: "phone",
        category: "fare_dispute",
        severity: "normal",
        description: "Fare calculation inquiry",
      });

      // 'resolved_driver_warning' is in COMPLAINT_RESOLUTION_CODES but invalid for 'fare_dispute'
      expect(() => {
        complaintService.resolveComplaintCase(complaintCase.caseNo, {
          resolutionCode: "resolved_driver_warning",
          closingNote: "Incompatible resolution code test",
        });
      }).toThrowError(ApiRequestError);

      try {
        complaintService.resolveComplaintCase(complaintCase.caseNo, {
          resolutionCode: "resolved_driver_warning",
          closingNote: "Incompatible resolution code test",
        });
      } catch (err: any) {
        expect(err.getStatus()).toBe(400);
        expect(err.code).toBe("RESOLUTION_CODE_NOT_VALID_FOR_CATEGORY");
      }
    });

    it("rejects completely invalid resolution code not in known enum", () => {
      const { complaintService } = setupService();

      const complaintCase = complaintService.createComplaintCase({
        caseSource: "phone",
        category: "fare_dispute",
        severity: "normal",
        description: "Fare calculation inquiry",
      });

      expect(() => {
        complaintService.resolveComplaintCase(complaintCase.caseNo, {
          resolutionCode: "totally_bogus_code" as any,
          closingNote: "Bogus code test",
        });
      }).toThrowError(ApiRequestError);

      try {
        complaintService.resolveComplaintCase(complaintCase.caseNo, {
          resolutionCode: "totally_bogus_code" as any,
          closingNote: "Bogus code test",
        });
      } catch (err: any) {
        expect(err.getStatus()).toBe(400);
        expect(err.code).toBe("INVALID_RESOLUTION_CODE");
      }
    });

    it("rejects reopening a case that is not currently closed with 409", () => {
      const { complaintService } = setupService();

      const openCase = complaintService.createComplaintCase({
        caseSource: "phone",
        category: "route_issue",
        severity: "normal",
        description: "Driver took detour",
      });
      expect(openCase.status).toBe("new");

      expect(() => {
        complaintService.reopenComplaintCase(openCase.caseNo, {
          reason: "Attempting to reopen an open case",
        });
      }).toThrowError(ApiRequestError);

      try {
        complaintService.reopenComplaintCase(openCase.caseNo, {
          reason: "Attempting to reopen an open case",
        });
      } catch (err: any) {
        expect(err.getStatus()).toBe(409);
        expect(err.code).toBe("COMPLAINT_NOT_CLOSED");
      }
    });

    it("rejects reopening without providing a non-blank reason with 400", () => {
      const { complaintService } = setupService();

      const complaintCase = complaintService.createComplaintCase({
        caseSource: "phone",
        category: "vehicle_condition",
        severity: "normal",
        description: "AC not cooling",
      });
      complaintService.resolveComplaintCase(complaintCase.caseNo, {
        resolutionCode: "resolved_with_apology",
        closingNote: "Apology given",
      });
      complaintService.closeComplaintCase(complaintCase.caseNo, {
        resolutionCode: "resolved_with_apology",
        closingNote: "Closed",
      });

      expect(() => {
        complaintService.reopenComplaintCase(complaintCase.caseNo, {
          reason: "",
        });
      }).toThrowError(ApiRequestError);

      try {
        complaintService.reopenComplaintCase(complaintCase.caseNo, {
          reason: "   ",
        });
      } catch (err: any) {
        expect(err.getStatus()).toBe(400);
        expect(err.code).toBe("VALIDATION_ERROR");
        expect((err.getResponse() as any).error.message).toContain("reason is required");
      }
    });

    it("detects and flags SLA breach when case exceeds target due time", () => {
      const { complaintService } = setupService();

      const overdueCase = complaintService.createComplaintCase({
        caseSource: "ops",
        category: "safety_concern",
        severity: "high",
        description: "Critical safety alarm",
      });

      // Explicitly mark SLA breach
      const breached = complaintService.markComplaintSlaBreach(
        overdueCase.caseNo,
        "req-breach-check",
      );

      expect(breached.slaBreach).toBe(true);

      const timeline = complaintService.getComplaintTimeline(overdueCase.caseNo);
      expect(timeline.some((e) => e.action === "sla_breached")).toBe(true);

      // Re-reading case reflects breach status
      const reloaded = complaintService.getComplaintCase(overdueCase.caseNo);
      expect(reloaded.slaBreach).toBe(true);
    });
  });
});
