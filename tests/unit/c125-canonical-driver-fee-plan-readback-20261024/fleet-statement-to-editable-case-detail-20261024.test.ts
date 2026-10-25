import { describe, expect, it } from "vitest";
import type {
  ComplaintCaseRecord,
  ComplaintTimelineEntry,
  FleetPartnerStatementRecord,
} from "@drts/contracts";

import { ApiRequestError } from "../../../apps/api/src/common/api-envelope";
import { AuditNotificationService } from "../../../apps/api/src/modules/audit-notification/audit-notification.service";
import { BillingSettlementService } from "../../../apps/api/src/modules/billing-settlement/billing-settlement.service";
import { ComplaintRepository } from "../../../apps/api/src/modules/complaint/complaint.repository";
import { ComplaintService } from "../../../apps/api/src/modules/complaint/complaint.service";
import { buildSettlementDisputeCase } from "../../../apps/api/src/modules/complaint/settlement-dispute";
import { FleetPartnerCaseService } from "../../../apps/api/src/modules/fleet-partner/fleet-partner-case.service";
import { FleetPartnerService } from "../../../apps/api/src/modules/fleet-partner/fleet-partner.service";
import {
  FleetStatementDecisionRepository,
  normalizeStatementDecisionNote,
} from "../../../apps/api/src/modules/fleet-partner/fleet-statement-decision.repository";
import { fleetStorageFixture } from "../helpers/fleet-document-fixture";

/**
 * Same observable contract as `FleetStatementDecisionRepository.decide()`
 * (note validation, not-found/paid/conflict guards, real
 * `buildSettlementDisputeCase` on dispute) backed by an in-memory statement
 * map instead of the `billing.phase1_fleet_statement_decisions` table and
 * advisory lock `decide()` wraps around it -- the external DB boundary is
 * what's faked, not the business rule.
 */
function createFakeStatementDecisionRepository(
  statements: Map<string, FleetPartnerStatementRecord>,
) {
  const decisions = new Map<
    string,
    {
      status: "confirmed" | "disputed";
      note: string;
      disputeCaseId: string | null;
    }
  >();
  const complaintCases: ComplaintCaseRecord[] = [];
  const complaintTimelines: ComplaintTimelineEntry[] = [];

  const repository = {
    isEnabled: () => true,
    async listDecisions() {
      return [];
    },
    async decide(
      fleetPartnerId: string,
      statementId: string,
      actorId: string,
      decision: "confirmed" | "disputed",
      value: unknown,
    ): Promise<FleetPartnerStatementRecord> {
      const note = normalizeStatementDecisionNote(decision, value);
      const key = `${statementId}:${fleetPartnerId}`;
      const existing = decisions.get(key);
      const current = statements.get(key);
      if (existing) {
        if (existing.status !== decision || existing.note !== note) {
          throw new ApiRequestError(
            409,
            "STATEMENT_DECISION_CONFLICT",
            "This statement already has a different decision.",
          );
        }
        return { ...current!, disputeCaseId: existing.disputeCaseId };
      }
      if (!current) {
        throw new ApiRequestError(
          404,
          "STATEMENT_NOT_FOUND",
          "Statement not found for this fleet partner.",
        );
      }
      if (current.payoutStatus === "paid") {
        throw new ApiRequestError(
          409,
          "STATEMENT_ALREADY_PAID",
          "Paid statements cannot receive a new decision.",
        );
      }
      const at = new Date().toISOString();
      const dispute =
        decision === "disputed"
          ? buildSettlementDisputeCase({
              fleetPartnerId,
              statementId,
              reason: note,
              actorId,
              at,
            })
          : null;
      if (dispute) {
        complaintCases.push(...dispute.complaintCases);
        complaintTimelines.push(...dispute.complaintTimelines);
      }
      const disputeCaseId = dispute?.complaintCases[0]?.caseNo ?? null;
      decisions.set(key, { status: decision, note, disputeCaseId });
      return { ...current, decisionStatus: decision, disputeCaseId };
    },
  } as unknown as FleetStatementDecisionRepository;

  return { repository, complaintCases, complaintTimelines };
}

describe("C125-F2: formal Fleet statement -> authorized dispute -> editable case detail", () => {
  it("resolves a real generated Fleet statement into an open, fleet-editable case with a matching caseId/fleetPartnerId, mirroring resolveOperationalEditableCase", async () => {
    const audit = new AuditNotificationService();
    // No repository: generateDriverStatements/listFleetPartnerStatements run
    // entirely against the unconditional in-memory seed data (same real
    // production code path the GET /fleet-partner/statements endpoint uses).
    const billingSettlementService = new BillingSettlementService(audit);
    await billingSettlementService.onModuleInit();
    await billingSettlementService.publishDriverFeePlan({
      planName: "Editable Case Dispute Fee Plan",
      version: "editable-case-dispute-v1",
      serviceFeeBps: 1300,
      reimbursementMode: "platform_funded",
    });

    const fleetPartnerId = "fleet-demo-001";
    const periodMonth = "2026-03";
    const pendingStatements = new Map<string, FleetPartnerStatementRecord>();
    const {
      repository: statementDecisions,
      complaintCases,
      complaintTimelines,
    } = createFakeStatementDecisionRepository(pendingStatements);

    const fleetPartnerService = new FleetPartnerService(
      billingSettlementService,
      {} as never,
      {} as never,
      undefined,
      statementDecisions,
    );

    // Formal Fleet statement: the real affiliation/revenue-share-rule
    // matching against the real generated driver statement, exactly what
    // GET /control-plane-proxy/fleet-partner/statements?periodMonth=... does.
    const statements = await fleetPartnerService.listFleetPartnerStatements(
      fleetPartnerId,
      periodMonth,
    );
    expect(statements.length).toBeGreaterThan(0);
    const statement = statements[0]!;
    expect(statement.fleetPartnerId).toBe(fleetPartnerId);
    pendingStatements.set(
      `${statement.statementId}:${fleetPartnerId}`,
      statement,
    );

    // Authorized dispute: the same recordStatementDecision the authenticated
    // fleet-partner-scoped POST .../statements/:statementId/dispute endpoint
    // calls (controller-level identity/scope checks are exercised separately
    // by the existing fleet-statement-decisions-20261013 suite).
    const decided = await fleetPartnerService.recordStatementDecision(
      fleetPartnerId,
      statement.statementId,
      "partner-user-c125-f2",
      "disputed",
      "Operational C125 case attachment verification",
    );
    const disputeCaseId = decided.disputeCaseId;
    expect(disputeCaseId).toBeTruthy();

    // Own editable case detail: the real FleetPartnerCaseService backed by a
    // real ComplaintService, with only the ComplaintRepository DB boundary
    // faked (same fake-repository pattern as the existing
    // fleet-statement-decisions-20261013/settlement-persistence.test.ts).
    const complaintRepository = {
      isEnabled: () => true,
      loadSettlementState: async () => ({
        complaintCases: structuredClone(complaintCases),
        complaintTimelines: structuredClone(complaintTimelines),
      }),
      persistChanges: async () => undefined,
      reportPersistenceFailure: () => undefined,
    } as unknown as ComplaintRepository;
    const complaintService = new ComplaintService(audit, complaintRepository);
    await complaintService.refreshSettlementCases();

    const { storage } = fleetStorageFixture();
    const caseService = new FleetPartnerCaseService(
      complaintService,
      fleetPartnerService,
      undefined,
      storage,
    );

    const cases = await caseService.listCases(fleetPartnerId);
    const openCase = cases.find((item) => item.id === disputeCaseId);
    expect(openCase).toBeTruthy();
    expect(openCase!.fleetPartnerId).toBe(fleetPartnerId);
    expect(openCase!.status).not.toBe("closed");
    expect(openCase!.responsibility).not.toBe("platform");

    const detail = await caseService.getCaseDetail(
      fleetPartnerId,
      disputeCaseId!,
    );
    expect(detail.caseDetail.fleetPartnerId).toBe(fleetPartnerId);
    expect(detail.caseDetail.status).not.toBe("closed");
    expect(detail.caseDetail.responsibility).not.toBe("platform");

    // Cleanup: every resource created above (published fee plan, generated
    // statement, dispute decision, complaint case/timeline) lives only in
    // this test's own local instances and in-memory stores; nothing was
    // written to a shared canonical source for a later test to clean up.
  });

  it("rejects a second conflicting decision on the same statement instead of silently creating a duplicate case", async () => {
    const audit = new AuditNotificationService();
    const billingSettlementService = new BillingSettlementService(audit);
    await billingSettlementService.onModuleInit();
    await billingSettlementService.publishDriverFeePlan({
      planName: "Editable Case Conflict Fee Plan",
      version: "editable-case-conflict-v1",
      serviceFeeBps: 1300,
      reimbursementMode: "platform_funded",
    });

    const fleetPartnerId = "fleet-demo-001";
    const pendingStatements = new Map<string, FleetPartnerStatementRecord>();
    const { repository: statementDecisions } =
      createFakeStatementDecisionRepository(pendingStatements);
    const fleetPartnerService = new FleetPartnerService(
      billingSettlementService,
      {} as never,
      {} as never,
      undefined,
      statementDecisions,
    );
    const statements = await fleetPartnerService.listFleetPartnerStatements(
      fleetPartnerId,
      "2026-06",
    );
    const statement = statements[0]!;
    pendingStatements.set(
      `${statement.statementId}:${fleetPartnerId}`,
      statement,
    );

    await fleetPartnerService.recordStatementDecision(
      fleetPartnerId,
      statement.statementId,
      "partner-user-c125-f2",
      "confirmed",
      "Looks correct",
    );

    await expect(
      fleetPartnerService.recordStatementDecision(
        fleetPartnerId,
        statement.statementId,
        "partner-user-c125-f2",
        "disputed",
        "Changed my mind",
      ),
    ).rejects.toMatchObject({ code: "STATEMENT_DECISION_CONFLICT" });
  });
});
