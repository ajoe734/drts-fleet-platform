import { describe, expect, it, vi } from "vitest";
import type { FleetPartnerStatementRecord } from "@drts/contracts";
import type { BootstrapRequestIdentity } from "../../../apps/api/src/common/auth/auth.types";
import { AuditNotificationService } from "../../../apps/api/src/modules/audit-notification/audit-notification.service";
import { ComplaintRepository } from "../../../apps/api/src/modules/complaint/complaint.repository";
import { ComplaintService } from "../../../apps/api/src/modules/complaint/complaint.service";
import { buildSettlementDisputeCase } from "../../../apps/api/src/modules/complaint/settlement-dispute";
import { FleetPartnerCaseService } from "../../../apps/api/src/modules/fleet-partner/fleet-partner-case.service";
import { FleetPartnerController } from "../../../apps/api/src/modules/fleet-partner/fleet-partner.controller";
import { FleetPartnerRepository } from "../../../apps/api/src/modules/fleet-partner/fleet-partner.repository";
import { FleetPartnerService } from "../../../apps/api/src/modules/fleet-partner/fleet-partner.service";
import {
  FleetStatementDecisionRepository,
  normalizeStatementDecisionNote,
} from "../../../apps/api/src/modules/fleet-partner/fleet-statement-decision.repository";

function statement(amount = 1500): FleetPartnerStatementRecord {
  const money = { currency: "TWD", amountMinor: amount };
  return {
    statementId: "fleet-statement-fleet-demo-001-2026-10",
    fleetPartnerId: "fleet-demo-001",
    periodMonth: "2026-10",
    payoutStatus: "pending",
    grossEarningBasis: money,
    driverNetAmountBasis: money,
    shareAmount: money,
    sponsorFundedTripCount: 0,
    sponsorFundedGrossEarningBasis: { currency: "TWD", amountMinor: 0 },
    sponsorFundedShareAmount: { currency: "TWD", amountMinor: 0 },
    reimbursementAmount: { currency: "TWD", amountMinor: 0 },
    lines: [],
    createdAt: "2026-10-01T00:00:00.000Z",
    updatedAt: "2026-10-01T00:00:00.000Z",
  };
}

function dispute(fleetPartnerId = "fleet-demo-001") {
  return buildSettlementDisputeCase({
    fleetPartnerId,
    statementId: "statement-1",
    reason: "Two trips missing",
    actorId: "partner-user-1",
    at: "2026-10-13T12:00:00.000Z",
  });
}

describe("fleet statement production decision boundaries", () => {
  it("accepts an omitted confirmation note, normalizes retries and requires a dispute reason", () => {
    expect(normalizeStatementDecisionNote("confirmed", undefined)).toBe("");
    expect(normalizeStatementDecisionNote("confirmed", "  Checked  ")).toBe(
      "Checked",
    );
    expect(
      normalizeStatementDecisionNote("disputed", "  Missing trips  "),
    ).toBe("Missing trips");
    expect(() => normalizeStatementDecisionNote("disputed", "  ")).toThrow();
    expect(() => normalizeStatementDecisionNote("confirmed", 123)).toThrow();
  });

  it("does not report a browser or in-memory success when persistence is absent", async () => {
    const repository = new FleetStatementDecisionRepository();
    await expect(
      repository.decide(
        "fleet-demo-001",
        "statement-1",
        "actor",
        "confirmed",
        undefined,
      ),
    ).rejects.toMatchObject({ code: "STATEMENT_DECISION_UNAVAILABLE" });
  });

  it("builds a fleet-linked financial case and initial timeline with the established SLA", () => {
    const result = dispute();
    const item = result.complaintCases[0]!;
    expect(item).toMatchObject({
      category: "settlement_dispute",
      fleetPartnerId: "fleet-demo-001",
      relatedStatementId: "statement-1",
      severity: "normal",
      status: "new",
      relatedOrderId: null,
      description: "Two trips missing",
      slaDueAt: "2026-10-15T12:00:00.000Z",
    });
    expect(result.complaintTimelines).toEqual([
      expect.objectContaining({
        caseNo: item.caseNo,
        action: "case_created",
        note: expect.stringContaining("partner-user-1"),
      }),
    ]);
    expect(dispute().complaintCases[0]!.caseNo).not.toBe(item.caseNo);
  });

  it("reads decisions and live payout from repositories while retaining reviewed amounts after regeneration", async () => {
    const live = { ...statement(9000), payoutStatus: "paid" as const };
    const reviewed = {
      ...statement(1500),
      decisionStatus: "confirmed" as const,
      confirmedBy: "actor-1",
    };
    const loadStatements = vi.fn().mockResolvedValue([live]);
    const listDecisions = vi.fn().mockResolvedValue([reviewed]);
    const repository = {
      isEnabled: () => true,
      loadStatements,
    } as unknown as FleetPartnerRepository;
    const decisionRepository = {
      listDecisions,
    } as unknown as FleetStatementDecisionRepository;
    const service = new FleetPartnerService(
      {} as never,
      {} as never,
      {} as never,
      repository,
      decisionRepository,
    );
    expect(await service.listFleetPartnerStatements("fleet-demo-001")).toEqual([
      { ...reviewed, payoutStatus: "paid" },
    ]);
    expect(loadStatements).toHaveBeenCalledWith("fleet-demo-001", undefined);
    loadStatements.mockResolvedValue([]);
    expect(await service.listFleetPartnerStatements("fleet-demo-001")).toEqual([
      reviewed,
    ]);
  });

  it("records the existing authenticated partner identity and unwraps a persisted API result", async () => {
    const record = { ...statement(), decisionStatus: "confirmed" as const };
    const recordStatementDecision = vi.fn().mockResolvedValue(record);
    const controller = new FleetPartnerController(
      { recordStatementDecision } as unknown as FleetPartnerService,
      {} as never,
      {} as never,
      {} as never,
      {} as never,
    );
    const identity = {
      realm: "partner",
      actorType: "partner_user",
      partnerId: "fleet-demo-001",
      actorId: "real-actor",
    } as BootstrapRequestIdentity;
    const result = await controller.confirmPortalStatement(
      "fleet-demo-001",
      "header-actor",
      record.statementId,
      {},
      "request-1",
      identity,
    );
    expect(recordStatementDecision).toHaveBeenCalledWith(
      "fleet-demo-001",
      record.statementId,
      "real-actor",
      "confirmed",
      undefined,
    );
    expect(result.data).toEqual(record);
    await expect(
      controller.disputePortalStatement(
        "other-fleet",
        undefined,
        record.statementId,
        { reason: "Mismatch" },
        undefined,
        identity,
      ),
    ).rejects.toMatchObject({ code: "FLEET_SCOPE_DENIED" });
    expect(recordStatementDecision).toHaveBeenCalledTimes(1);
  });

  it("refreshes the committed settlement subset without deleting ordinary in-memory cases", async () => {
    const state = dispute();
    const repository = {
      isEnabled: () => true,
      loadSettlementState: vi.fn().mockResolvedValue(state),
      persistChanges: vi.fn().mockResolvedValue(undefined),
    } as unknown as ComplaintRepository;
    const service = new ComplaintService(
      new AuditNotificationService(),
      repository,
    );
    const ordinary = service.createComplaintCase({
      caseSource: "web",
      category: "driver_service",
      severity: "normal",
      description: "Ordinary case",
    });
    await service.refreshSettlementCases();
    expect(service.getComplaintCase(ordinary.caseNo)).toEqual(ordinary);
    expect(service.getComplaintCase(state.complaintCases[0]!.caseNo)).toEqual(
      state.complaintCases[0],
    );
    expect(
      service.getComplaintTimeline(state.complaintCases[0]!.caseNo),
    ).toEqual(state.complaintTimelines);
  });

  it("leaves existing in-memory complaint state intact without a configured database", async () => {
    const service = new ComplaintService(
      new AuditNotificationService(),
      new ComplaintRepository(),
    );
    const record = service.createComplaintCase({
      caseSource: "web",
      category: "fare_dispute",
      severity: "normal",
      description: "Existing case",
    });
    await service.refreshSettlementCases();
    expect(service.listComplaintCases()).toEqual([record]);
  });

  it("routes the linked case and creation timeline to its actual fleet, including a fresh service", async () => {
    const first = dispute("fleet-a");
    const second = dispute("fleet-b");
    const cases = [...first.complaintCases, ...second.complaintCases];
    const complaints = {
      refreshSettlementCases: vi.fn().mockResolvedValue(undefined),
      listComplaintCases: () => cases,
      getComplaintCase: (id: string) =>
        cases.find((item) => item.caseNo === id),
      getComplaintTimeline: () => first.complaintTimelines,
    } as unknown as ComplaintService;
    const service = new FleetPartnerCaseService(complaints);
    const rows = await service.listCases("fleet-a");
    expect(rows).toEqual([
      expect.objectContaining({
        id: first.complaintCases[0]!.caseNo,
        fleetPartnerId: "fleet-a",
        cat: "settlement_dispute",
        responsibility: "shared",
      }),
    ]);
    expect(
      await service.getCaseTimeline("fleet-a", first.complaintCases[0]!.caseNo),
    ).toEqual([expect.objectContaining({ t: "對帳爭議已建立" })]);
    await expect(
      service.getCaseDetail("fleet-b", first.complaintCases[0]!.caseNo),
    ).rejects.toMatchObject({ code: "CASE_NOT_FLEET_SCOPED" });
  });
});
