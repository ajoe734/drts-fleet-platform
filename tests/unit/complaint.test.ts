import { describe, expect, it, vi } from "vitest";

import { AuditNotificationService } from "../../apps/api/src/modules/audit-notification/audit-notification.service";
import { ComplaintRepository } from "../../apps/api/src/modules/complaint/complaint.repository";
import { ComplaintService } from "../../apps/api/src/modules/complaint/complaint.service";

function createService() {
  const auditService = new AuditNotificationService();
  const complaintService = new ComplaintService(auditService);

  return {
    auditService,
    complaintService,
  };
}

describe("complaint service", () => {
  it("creates, lists, gets, and timelines complaint cases for SC-027", () => {
    const { auditService, complaintService } = createService();

    const complaintCase = complaintService.createComplaintCase({
      caseSource: "phone",
      relatedOrderId: "order-demo-001",
      relatedCallId: "CALL-20260410-000120",
      category: "fare_dispute",
      severity: "normal",
      description: "乘客認為費用不正確",
    });

    expect(complaintCase.caseNo).toMatch(/^C-\d{8}-\d{6}$/);
    expect(complaintCase.status).toBe("new");
    expect(complaintCase.slaBreach).toBe(false);
    expect(complaintCase.slaDueAt).toBeDefined();
    expect(complaintService.listComplaintCases()).toHaveLength(1);
    expect(complaintService.getComplaintCase(complaintCase.caseNo).caseNo).toBe(
      complaintCase.caseNo,
    );

    const timeline = complaintService.getComplaintTimeline(
      complaintCase.caseNo,
    );
    expect(timeline).toHaveLength(1);
    expect(timeline[0]?.action).toBe("case_created");
    expect(timeline[0]?.caseNo).toBe(complaintCase.caseNo);
    expect(timeline[0]?.note).toContain("fare_dispute");
    expect(auditService.listAuditLogs()[0]?.actionName).toBe(
      "create_complaint_case",
    );
  });

  it("reopens a closed complaint while keeping the original case number for SC-028", () => {
    const { complaintService } = createService();

    const complaintCase = complaintService.createComplaintCase({
      caseSource: "ops",
      category: "driver_service",
      severity: "normal",
      description: "乘客抱怨司機服務態度",
    });

    complaintService.resolveComplaintCase(complaintCase.caseNo, {
      resolutionCode: "resolved_driver_warning",
      closingNote: "已先提供初步處理",
    });
    const closedCase = complaintService.closeComplaintCase(
      complaintCase.caseNo,
      {
        resolutionCode: "resolved_driver_warning",
        closingNote: "案件已正式結案",
      },
    );

    const reopenedCase = complaintService.reopenComplaintCase(
      complaintCase.caseNo,
      {
        reason: "乘客提供新憑證",
      },
    );

    expect(closedCase.status).toBe("closed");
    expect(reopenedCase.caseNo).toBe(complaintCase.caseNo);
    expect(reopenedCase.status).toBe("reopened");

    expect(reopenedCase.reopenCount).toBe(1);
    expect(reopenedCase.slaBreach).toBe(false);

    const timeline = complaintService.getComplaintTimeline(
      complaintCase.caseNo,
    );
    expect(timeline.map((entry) => entry.action)).toEqual([
      "case_created",
      "case_resolved",
      "case_closed",
      "case_reopened",
      "sla_recalculated",
    ]);
    expect(
      timeline.find((entry) => entry.action === "case_reopened")?.note,
    ).toBe("乘客提供新憑證");
  });

  it("assigns, notes, and exports complaint detail for operator closeout", () => {
    const { complaintService } = createService();

    const complaintCase = complaintService.createComplaintCase({
      caseSource: "phone",
      relatedOrderId: "order-demo-009",
      relatedCallId: "CALL-20260410-000777",
      category: "fare_dispute",
      severity: "normal",
      description: "乘客表示叫車收費有疑義",
    });

    const assigned = complaintService.assignComplaintCase(
      complaintCase.caseNo,
      {
        assigneeId: "AGENT-QA-001",
        note: "Assigned to billing specialist",
      },
    );
    const noted = complaintService.addComplaintCaseNote(complaintCase.caseNo, {
      note: "Requested trip and meter evidence from operator",
    });
    complaintService.resolveComplaintCase(complaintCase.caseNo, {
      resolutionCode: "resolved_with_refund",
      closingNote: "已確認金額並回覆乘客",
    });
    complaintService.closeComplaintCase(complaintCase.caseNo, {
      resolutionCode: "resolved_with_refund",
      closingNote: "正式結案並可供匯出",
    });
    const exportView = complaintService.getComplaintExportView(
      complaintCase.caseNo,
    );

    expect(assigned.assigneeId).toBe("AGENT-QA-001");
    expect(noted.status).toBe("under_investigation");
    expect(exportView.readyForAudit).toBe(true);
    expect(exportView.complaintCase.caseNo).toBe(complaintCase.caseNo);
    expect(exportView.timeline.map((entry) => entry.action)).toEqual([
      "case_created",
      "case_assigned",
      "case_note_added",
      "case_resolved",
      "case_closed",
    ]);
  });

  it("marks SLA breach without overwriting the main complaint status for SC-029", () => {
    const { auditService, complaintService } = createService();

    const complaintCase = complaintService.createComplaintCase({
      caseSource: "web",
      category: "safety_concern",
      severity: "high",
      description: "安全疑慮需立即處理",
    });

    complaintService.resolveComplaintCase(complaintCase.caseNo, {
      resolutionCode: "resolved_with_corrective_action",
      closingNote: "案件持續處理中",
    });

    const beforeTimeline = complaintService.getComplaintTimeline(
      complaintCase.caseNo,
    );
    const beforeNotifications = auditService.listNotifications().length;
    const beforeStatus = complaintService.getComplaintCase(
      complaintCase.caseNo,
    ).status;

    const updatedCase = complaintService.markComplaintSlaBreach(
      complaintCase.caseNo,
    );

    expect(updatedCase.status).toBe(beforeStatus);
    expect(updatedCase.slaBreach).toBe(true);
    expect(complaintService.getComplaintCase(complaintCase.caseNo).status).toBe(
      beforeStatus,
    );
    expect(
      complaintService.getComplaintTimeline(complaintCase.caseNo),
    ).toHaveLength(beforeTimeline.length + 1);
    expect(
      complaintService.getComplaintTimeline(complaintCase.caseNo).at(-1)
        ?.action,
    ).toBe("sla_breached");
    expect(auditService.listNotifications()).toHaveLength(
      beforeNotifications + 1,
    );
    expect(auditService.listAuditLogs()[0]?.actionName).toBe(
      "mark_complaint_sla_breach",
    );
  });

  it("rehydrates persisted complaint state and writes timeline updates through the repository", async () => {
    const auditService = new AuditNotificationService();
    const persistChanges = vi.fn(async () => undefined);
    const repository = {
      loadState: vi.fn(async () => ({
        complaintCases: [
          {
            caseNo: "C-20260410-000041",
            caseSource: "web",
            relatedOrderId: null,
            relatedCallId: null,
            relatedIncidentId: null,
            category: "other",
            severity: "normal",
            description: "先前已建立的案件",
            assigneeId: null,
            status: "new",
            slaDueAt: "2026-04-12T00:00:00Z",
            slaBreach: false,
            reopenCount: 0,
            resolutionCode: null,
            closingNote: null,
            createdAt: "2026-04-10T08:00:00Z",
            updatedAt: "2026-04-10T08:00:00Z",
          },
        ],
        complaintTimelines: [
          {
            entryId: "complaint-timeline-seed-1",
            caseNo: "C-20260410-000041",
            action: "case_created",
            note: "Created other complaint from web.",
            createdAt: "2026-04-10T08:00:00Z",
          },
        ],
      })),
      persistChanges,
      reportPersistenceFailure: vi.fn(),
    } as unknown as ComplaintRepository;

    const complaintService = new ComplaintService(auditService, repository);

    await complaintService.onModuleInit();

    expect(complaintService.listComplaintCases()).toHaveLength(1);
    complaintService.markComplaintSlaBreach("C-20260410-000041");

    await Promise.resolve();

    expect(persistChanges).toHaveBeenCalledWith(
      expect.objectContaining({
        complaintCases: [
          expect.objectContaining({
            caseNo: "C-20260410-000041",
            slaBreach: true,
          }),
        ],
        complaintTimelines: [
          expect.objectContaining({
            caseNo: "C-20260410-000041",
            action: "sla_breached",
          }),
        ],
      }),
    );
  });
});
