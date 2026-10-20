import { randomUUID } from "node:crypto";
import type {
  ComplaintCaseRecord,
  ComplaintTimelineEntry,
} from "@drts/contracts";

/** Builds CRM records without publishing or asynchronously writing them. The
 * statement transaction commits these records and its decision together. */
export function buildSettlementDisputeCase(input: {
  fleetPartnerId: string;
  statementId: string;
  reason: string;
  actorId: string;
  at: string;
}): {
  complaintCases: ComplaintCaseRecord[];
  complaintTimelines: ComplaintTimelineEntry[];
} {
  const caseNo = `C-${input.at.slice(0, 10).replaceAll("-", "")}-FS-${randomUUID()}`;
  const record: ComplaintCaseRecord = {
    caseNo,
    caseSource: "web",
    fleetPartnerId: input.fleetPartnerId,
    relatedStatementId: input.statementId,
    relatedOrderId: null,
    relatedCallId: null,
    relatedIncidentId: null,
    category: "settlement_dispute",
    severity: "normal",
    description: input.reason,
    assigneeId: null,
    status: "new",
    // Existing financial complaints use the normal 48-hour service window.
    slaDueAt: new Date(
      Date.parse(input.at) + 48 * 60 * 60 * 1000,
    ).toISOString(),
    slaBreach: false,
    reopenCount: 0,
    resolutionCode: null,
    closingNote: null,
    createdAt: input.at,
    updatedAt: input.at,
  };
  return {
    complaintCases: [record],
    complaintTimelines: [
      {
        entryId: randomUUID(),
        caseNo,
        action: "case_created",
        note: `Fleet ${input.fleetPartnerId} disputed statement ${input.statementId} (${input.actorId}): ${input.reason}`,
        createdAt: input.at,
      },
    ],
  };
}
