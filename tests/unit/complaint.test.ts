import { describe, expect, it, vi } from "vitest";
import type {
  ComplaintCaseRecord,
  ComplaintTimelineEntry,
} from "@drts/contracts";
import type { PoolClient } from "pg";
import type { DatabaseService } from "../../apps/api/src/common/db";

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
      isEnabled: vi.fn(() => true),
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

/** Only the external SQL port is modeled. Production producer, repository and
 * Ops service reads run unchanged; this is not PostgreSQL/runtime evidence. */
function referralCrmFixture() {
  const cases = new Map<string, ComplaintCaseRecord>();
  const timelines = new Map<string, ComplaintTimelineEntry>();
  const reads: string[] = [];
  let failReads = false;
  const query = async (sql: string, values: readonly unknown[] = []) => {
    const text = sql.replace(/\s+/g, " ").trim();
    if (text.startsWith("INSERT INTO crm.phase1_complaint_cases")) {
      cases.set(String(values[0]), JSON.parse(String(values[5])));
      return { rows: [] };
    }
    if (text.startsWith("INSERT INTO crm.phase1_complaint_timelines")) {
      timelines.set(String(values[0]), JSON.parse(String(values[4])));
      return { rows: [] };
    }
    reads.push(text);
    if (failReads) throw new Error("canonical SQL read failed");
    const caseRows = [...cases.values()];
    const timelineRows = [...timelines.values()];
    if (text.startsWith("SELECT kind, record FROM ("))
      return {
        rows: [
          ...caseRows
            .filter((c) => c.caseNo === values[0])
            .map((record) => ({ kind: "case", record })),
          ...timelineRows
            .filter((t) => t.caseNo === values[0])
            .map((record) => ({ kind: "timeline", record })),
        ],
      };
    if (text.startsWith("SELECT record FROM crm.phase1_complaint_cases"))
      return { rows: caseRows.map((record) => ({ record })) };
    if (text.startsWith("SELECT record FROM crm.phase1_complaint_timelines"))
      return { rows: timelineRows.map((record) => ({ record })) };
    // Referral hooks write neither Passenger membership table. Model the old
    // membership restriction as well as the corrected canonical queries.
    if (text.startsWith("SELECT c.record")) {
      const eligible = text.includes("EXISTS") ? [] : caseRows;
      const records = text.includes("c.case_no > $1")
        ? eligible
            .filter((c) => c.caseNo > String(values[0]))
            .sort((a, b) => a.caseNo.localeCompare(b.caseNo))
            .slice(0, Number(values[1]))
        : eligible.filter((c) => c.caseNo === values[0]);
      return { rows: records.map((record) => ({ record })) };
    }
    if (text.startsWith("SELECT t.record"))
      return {
        rows: (text.includes("EXISTS")
          ? []
          : timelineRows.filter((t) => t.caseNo === values[0])
        ).map((record) => ({ record })),
      };
    throw new Error(`Unmodeled SQL: ${text}`);
  };
  const repository = new ComplaintRepository({
    isEnabled: () => true,
    query,
  } as unknown as DatabaseService);
  const audit = new AuditNotificationService();
  const create = () => new ComplaintService(audit, repository);
  const client = { query } as unknown as PoolClient;
  const scope = {
    orderId: "00000000-0000-4000-8000-000000000001",
    passengerId: "referral-unit-passenger",
    tenantId: "referral-unit-tenant",
  };
  const produce = async (
    origin: ComplaintService,
    source: "rating" | "manual",
  ) => {
    if (source === "rating") {
      const hook = origin.prepareReferralRatingHook(scope, {
        score: 2,
        comment: null,
        contactRequested: false,
      });
      await hook.execute(client);
      await origin.publishReferralRatingCase({
        ...scope,
        caseNo: hook.caseNo!,
        createdTimelineId: hook.createdTimelineId!,
      });
      return hook.caseNo!;
    }
    const command = {
      orderId: scope.orderId,
      category: "service" as const,
      content: "轉介客服案件",
      contactRequested: false,
      idempotencyKey: "referral-manual-unit",
    };
    const hook = origin.prepareReferralComplaintHook(scope.orderId, command);
    await hook.execute(client);
    await origin.publishReferralComplaintCase(scope, {
      caseNo: hook.caseNo,
      createdTimelineId: hook.createdTimelineId,
      command,
      submittedAt: cases.get(hook.caseNo)!.createdAt,
    });
    return hook.caseNo;
  };
  return {
    cases,
    timelines,
    reads,
    create,
    produce,
    failReads: () => {
      failReads = true;
    },
  };
}

describe("Referral CRM-only cases on existing Ops reads", () => {
  const read = async (
    service: ComplaintService,
    route: "list" | "detail" | "timeline",
    caseNo: string,
  ) => {
    if (route === "list")
      return (await service.listComplaintCasesForOps()).filter(
        (c) => c.caseNo === caseNo,
      );
    if (route === "detail")
      return [await service.getComplaintCaseForOps(caseNo)];
    return service.getComplaintTimelineForOps(caseNo);
  };

  for (const source of ["rating", "manual"] as const) {
    it.each(["list", "detail", "timeline"] as const)(
      `${source}: %s sees a later commit on an already initialized peer`,
      async (route) => {
        const f = referralCrmFixture();
        const origin = f.create();
        const peer = f.create();
        await origin.onModuleInit();
        await peer.onModuleInit();
        const caseNo = await f.produce(origin, source);
        expect(caseNo).toMatch(/^PAX-[0-9a-f-]{36}$/i);
        expect(f.cases.get(caseNo)?.description).toContain("同意客服聯繫：否");
        expect(
          [...f.timelines.values()].filter((t) => t.caseNo === caseNo),
        ).toHaveLength(1);
        const restarted = f.create();
        await restarted.onModuleInit();
        const expected =
          route === "timeline"
            ? [...f.timelines.values()].filter((t) => t.caseNo === caseNo)
            : [f.cases.get(caseNo)];
        // Same-instance and start-after-commit controls run before the warm peer.
        expect(await read(origin, route, caseNo)).toEqual(expected);
        expect(await read(restarted, route, caseNo)).toEqual(expected);
        expect(await read(peer, route, caseNo)).toEqual(expected);
      },
    );
  }

  it.each(["list", "detail", "timeline"] as const)(
    "%s propagates canonical failure even with a populated local cache",
    async (route) => {
      const f = referralCrmFixture();
      const origin = f.create();
      const caseNo = await f.produce(origin, "rating");
      expect(await read(origin, route, caseNo)).toHaveLength(1);
      f.failReads();
      await expect(read(origin, route, caseNo)).rejects.toThrow(
        "canonical SQL read failed",
      );
    },
  );

  it("keeps unknown cases absent and noDB Ops behavior intact", async () => {
    const f = referralCrmFixture();
    const peer = f.create();
    const missing = "PAX-22222222-2222-4222-8222-222222222222";
    expect(await peer.listComplaintCasesForOps()).toEqual([]);
    await expect(peer.getComplaintCaseForOps(missing)).rejects.toMatchObject({
      code: "NOT_FOUND",
    });
    await expect(
      peer.getComplaintTimelineForOps(missing),
    ).rejects.toMatchObject({ code: "NOT_FOUND" });
    const { complaintService } = createService();
    const c = complaintService.createComplaintCase({
      caseSource: "ops",
      category: "other",
      severity: "normal",
      description: "noDB control",
    });
    expect(await complaintService.listComplaintCasesForOps()).toEqual([c]);
    expect(await complaintService.getComplaintCaseForOps(c.caseNo)).toEqual(c);
    expect(
      await complaintService.getComplaintTimelineForOps(c.caseNo),
    ).toHaveLength(1);
  });

  it("pages every canonical case once across the existing 500-row keyset boundary", async () => {
    const f = referralCrmFixture();
    const origin = f.create();
    const peer = f.create();
    await peer.onModuleInit();
    for (let n = 0; n < 501; n++) await f.produce(origin, "rating");
    const result = await peer.listComplaintCasesForOps();
    expect(new Set(result.map((c) => c.caseNo))).toEqual(
      new Set(f.cases.keys()),
    );
    expect(result).toHaveLength(501);
    expect(
      f.reads.filter((sql) => sql.includes("c.case_no > $1")),
    ).toHaveLength(2);
  });
});
