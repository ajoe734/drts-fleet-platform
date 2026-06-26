import { describe, expect, it } from "vitest";

import {
  ACCIDENT_CASE_STATUSES,
  COMMAND_RECEIPT_STATUSES,
  EVIDENCE_CUSTODY_STATES,
  PHASE2_AUDIT_EVENT_CATALOG,
  PHASE2_AUDIT_EVENT_NAMES,
  REGULATORY_REPORT_STATUSES,
  SAFETY_OPERATOR_ASSIGNMENT_STATUSES,
  SANDBOX_DISPATCH_OUTCOMES,
  type Phase2AuditContext,
} from "@drts/contracts";

function sortedKeys(record: Record<string, string>) {
  return Object.keys(record).sort();
}

describe("Phase 2 audit contracts", () => {
  it("publishes unique canonical event names in <domain>.<resource>.<past_tense_action> form", () => {
    expect(PHASE2_AUDIT_EVENT_NAMES).toHaveLength(
      new Set(PHASE2_AUDIT_EVENT_NAMES).size,
    );

    for (const eventName of PHASE2_AUDIT_EVENT_NAMES) {
      expect(eventName).toMatch(
        /^[a-z]+(?:_[a-z]+)*\.[a-z]+(?:_[a-z]+)*\.[a-z]+(?:_[a-z]+)*$/,
      );
    }
  });

  it("covers every status-driven Phase 2 lifecycle enum with an audit event", () => {
    expect(
      sortedKeys(PHASE2_AUDIT_EVENT_CATALOG.tesla.commandReceiptByStatus),
    ).toEqual([...COMMAND_RECEIPT_STATUSES].sort());
    expect(
      sortedKeys(PHASE2_AUDIT_EVENT_CATALOG.sandbox.dispatchDecisionByOutcome),
    ).toEqual([...SANDBOX_DISPATCH_OUTCOMES].sort());
    expect(
      sortedKeys(PHASE2_AUDIT_EVENT_CATALOG.safetyOperator.assignmentByStatus),
    ).toEqual([...SAFETY_OPERATOR_ASSIGNMENT_STATUSES].sort());
    expect(
      sortedKeys(
        PHASE2_AUDIT_EVENT_CATALOG.evidence.manifestItemByCustodyState,
      ),
    ).toEqual([...EVIDENCE_CUSTODY_STATES].sort());
    expect(
      sortedKeys(PHASE2_AUDIT_EVENT_CATALOG.accident.caseByStatus),
    ).toEqual([...ACCIDENT_CASE_STATUSES].sort());
    expect(
      sortedKeys(PHASE2_AUDIT_EVENT_CATALOG.regulatory.reportByStatus),
    ).toEqual([...REGULATORY_REPORT_STATUSES].sort());
  });

  it("allows Phase2AuditContext to reference the canonical catalog directly", () => {
    const context: Phase2AuditContext = {
      actorId: null,
      actorType: "system",
      tenantId: null,
      moduleName: "regulatory-reporting",
      eventName: PHASE2_AUDIT_EVENT_CATALOG.regulatory.reportAmended,
      resourceType: "regulatory_report",
      resourceId: "RPT-2026-0001",
      requestId: "req-phase2-001",
      summary: {
        reportId: "RPT-2026-0001",
        correctionReason: "jurisdiction code normalized",
      },
      resourceVersion: "v2",
      supersedesAuditId: "11111111-1111-4111-8111-111111111111",
      amendsResourceVersion: "v1",
      sourceSystem: "regulatory_filing",
      sourceRef: "CA-DMV-2026-0001",
      occurredAt: "2026-06-26T00:00:00.000Z",
    };

    expect(context.eventName).toBe("regulatory.report.amended");
    expect(context.resourceVersion).toBe("v2");
  });
});
